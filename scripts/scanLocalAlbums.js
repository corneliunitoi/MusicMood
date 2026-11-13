import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readCueFile, parseCueContent } from './cueParser.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

const MANIFEST_PATH = path.resolve(process.cwd(), 'public', 'exploded_albums_manifest.json');

const args = process.argv.slice(2);
function getArg(prefix, defaultVal) {
    const match = args.find(a => a.startsWith(prefix));
    return match ? match.split('=')[1] : defaultVal;
}

const pathArg = args.find(a => !a.startsWith('--'));
const genreArg = getArg('--genre=', null);
const scanAll = args.includes('--all');

let TARGET_PATH = pathArg ? path.resolve(pathArg) : (scanAll ? '\\\\192.168.0.2\\e$\\music' : '\\\\192.168.0.2\\e$\\music\\Flac muzic');

if (genreArg && !pathArg) {
    const candidate = path.join('\\\\192.168.0.2\\e$\\music\\Flac muzic', genreArg.charAt(0).toUpperCase() + genreArg.slice(1));
    if (fs.existsSync(candidate)) {
        TARGET_PATH = candidate;
    }
}

const LIMIT = parseInt(getArg('--limit=', '0'), 10);
const DRY_RUN = args.includes('--dry-run');

function sanitizeForPostgres(str) {
    if (!str) return '';
    return str
        .replace(/\0/g, '')
        .replace(/[\uD800-\uDFFF]/g, '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
        .trim();
}

// Load existing manifest or initialize
function loadManifest() {
    try {
        if (fs.existsSync(MANIFEST_PATH)) {
            return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
        }
    } catch {}
    return { lastScannedAt: null, totalAlbums: 0, totalTracks: 0, albums: [] };
}

function saveManifest(manifest) {
    try {
        fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
    } catch (e) {
        console.warn('⚠️ Could not save manifest:', e.message);
    }
}

// Recursively find CUE sheets with early termination if limit is set
function findCueFiles(dir, cueList = [], maxLimit = 0) {
    if (maxLimit > 0 && cueList.length >= maxLimit) return cueList;

    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return cueList;
    }

    for (const e of entries) {
        if (maxLimit > 0 && cueList.length >= maxLimit) break;
        const full = path.join(dir, e.name);
        try {
            if (e.isDirectory()) {
                findCueFiles(full, cueList, maxLimit);
            } else if (e.isFile() && path.extname(e.name).toLowerCase() === '.cue') {
                cueList.push(full);
            }
        } catch {}
    }
    return cueList;
}

async function main() {
    console.log('================================================================');
    console.log('📦 STAGE 1: LOCAL ALBUM EXPLOSION & INVENTORY SCANNER');
    console.log(`   Target Path: ${TARGET_PATH}`);
    if (LIMIT > 0) console.log(`   Album Limit: ${LIMIT}`);
    console.log(`   Mode:        ${DRY_RUN ? 'DRY RUN (Preview Only)' : 'LIVE DATABASE COMMIT'}`);
    console.log('================================================================\n');

    if (!fs.existsSync(TARGET_PATH)) {
        console.error(`❌ Path not accessible: ${TARGET_PATH}`);
        process.exit(1);
    }

    process.stdout.write('🔍 Scanning directory for CUE album sheets... ');
    let cueFiles = findCueFiles(TARGET_PATH, [], LIMIT);
    console.log(`Found ${cueFiles.length} CUE albums.\n`);

    if (cueFiles.length === 0) {
        console.log('ℹ️ No CUE sheets found in specified directory.');
        return;
    }

    if (LIMIT > 0 && LIMIT < cueFiles.length) {
        console.log(`🎯 Limiting scan to first ${LIMIT} albums...`);
        cueFiles = cueFiles.slice(0, LIMIT);
    }

    const manifest = loadManifest();
    const manifestAlbumMap = new Map();
    (manifest.albums || []).forEach(a => manifestAlbumMap.set(a.path, a));

    let totalTracksExploded = 0;
    let albumsExploded = 0;
    const allUpsertTracks = [];

    for (let i = 0; i < cueFiles.length; i++) {
        const cuePath = cueFiles[i];
        const cueDir = path.dirname(cuePath);
        try {
            const raw = readCueFile(cuePath);
            const parsed = parseCueContent(raw, cueDir);

            const albumArtist = parsed.albumArtist || path.basename(path.dirname(cueDir));
            const albumTitle = parsed.albumTitle || path.basename(cueDir);
            const albumGenre = parsed.albumGenre || 'Rock';
            const validTracks = parsed.tracks.filter(t => t.title && !/^track\s*\d+$/i.test(t.title));

            if (validTracks.length === 0) {
                console.log(`[${i + 1}/${cueFiles.length}] ⏭️ Skipped "${albumTitle}": No valid track titles in CUE.`);
                continue;
            }

            console.log(`[${i + 1}/${cueFiles.length}] 💿 "${albumArtist}" — "${albumTitle}" (${validTracks.length} tracks)`);

            const albumEntry = {
                artist: albumArtist,
                album: albumTitle,
                genre: albumGenre,
                format: parsed.resolvedAudioPath ? path.extname(parsed.resolvedAudioPath).toUpperCase().replace('.', '') + '/CUE' : 'CUE',
                audioContainer: parsed.resolvedAudioPath ? path.basename(parsed.resolvedAudioPath) : null,
                trackCount: validTracks.length,
                path: cuePath,
                explodedAt: new Date().toISOString(),
                status: 'pending_online_ingestion'
            };

            manifestAlbumMap.set(cuePath, albumEntry);
            albumsExploded++;
            totalTracksExploded += validTracks.length;

            for (const t of validTracks) {
                allUpsertTracks.push({
                    artist: sanitizeForPostgres(t.artist || albumArtist),
                    track_name: sanitizeForPostgres(t.title),
                    genre: sanitizeForPostgres(albumGenre),
                    source: 'ko-local:cue'
                });
            }
        } catch (err) {
            console.warn(`[${i + 1}/${cueFiles.length}] ⚠️ Error parsing ${path.basename(cuePath)}: ${err.message}`);
        }
    }

    console.log(`\n================================================================`);
    console.log(`📊 STAGE 1 EXPLOSION SUMMARY:`);
    console.log(`   • Albums Processed: ${albumsExploded}`);
    console.log(`   • Tracks Exploded:  ${totalTracksExploded}`);
    console.log('================================================================\n');

    // Update manifest
    manifest.lastScannedAt = new Date().toISOString();
    manifest.albums = Array.from(manifestAlbumMap.values());
    manifest.totalAlbums = manifest.albums.length;
    manifest.totalTracks = manifest.albums.reduce((acc, a) => acc + (a.trackCount || 0), 0);
    saveManifest(manifest);
    console.log(`💾 Saved local status manifest to: ${MANIFEST_PATH}`);

    if (DRY_RUN) {
        console.log('\n🔍 Dry run requested. No records committed to Supabase local_metadata.');
        return;
    }

    // Deduplicate by artist|track_name to avoid PostgreSQL intra-batch conflict error
    const uniqueMap = new Map();
    for (const t of allUpsertTracks) {
        const key = `${t.artist?.toLowerCase()}|${t.track_name?.toLowerCase()}`;
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, t);
        }
    }
    const deduplicatedTracks = Array.from(uniqueMap.values());

    // Upsert into Supabase local_metadata in batches of 100
    console.log(`\n☁️ Committing ${deduplicatedTracks.length} unique tracks to public.local_metadata (youtube_video_id: null)...`);
    let committed = 0;
    const BATCH = 100;

    for (let i = 0; i < deduplicatedTracks.length; i += BATCH) {
        const chunk = deduplicatedTracks.slice(i, i + BATCH);
        const { error } = await supabase
            .from('local_metadata')
            .upsert(chunk, { onConflict: 'artist,track_name' });

        if (error) {
            // Poison-pill recovery: isolate items individually so no tracks are dropped
            for (const item of chunk) {
                const { error: singleErr } = await supabase
                    .from('local_metadata')
                    .upsert([item], { onConflict: 'artist,track_name' });
                if (!singleErr) committed++;
            }
        } else {
            committed += chunk.length;
            process.stdout.write(`☁️ [${committed}/${deduplicatedTracks.length}] `);
        }
    }

    console.log(`\n\n🎉 STAGE 1 COMPLETE! All ${committed} songs are cataloged locally in local_metadata.`);
    console.log('🚀 Ready for STAGE 2: Gradual online resolution via:');
    console.log('   node scripts/resolveVideoIds.js --innertube --batch=50');
}

main().catch(console.error);
