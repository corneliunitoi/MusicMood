import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readCueFile, parseCueContent, resolveCueAudioFile } from './cueParser.js';
import { fetchAlbumTracks } from './albumTrackResolver.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

function sanitizeForPostgres(str) {
    if (!str) return '';
    return str
        .replace(/\0/g, '')
        .replace(/[\uD800-\uDFFF]/g, '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
        .trim();
}

// Clean and extract artist/album from folder or string
function parseArtistAlbum(str) {
    if (!str) return { artist: null, album: null };
    const clean = str
        .replace(/\[.*?\]/g, ' ')
        .replace(/\(.*?\)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (clean.includes(' - ')) {
        const parts = clean.split(' - ');
        return { artist: parts[0].trim(), album: parts.slice(1).join(' - ').trim() };
    }
    return { artist: null, album: clean };
}

async function main() {
    const rawArgs = process.argv.slice(2);
    const dryRun = rawArgs.includes('--dry-run');

    const artistArg = rawArgs.find(a => a.startsWith('--artist='));
    const albumArg = rawArgs.find(a => a.startsWith('--album='));
    const genreArg = rawArgs.find(a => a.startsWith('--genre='));

    const pathArg = rawArgs.find(a => !a.startsWith('--'));

    console.log("=================================================");
    console.log("💿 MusicMood Album Exploder (APE/CUE & External API)");
    console.log("=================================================");

    let targetArtist = artistArg ? artistArg.split('=')[1] : null;
    let targetAlbum = albumArg ? albumArg.split('=')[1] : null;
    let targetGenre = genreArg ? genreArg.split('=')[1] : null;
    let cueFilePath = null;

    if (pathArg) {
        const resolvedPath = path.resolve(pathArg);
        if (!fs.existsSync(resolvedPath)) {
            console.error(`❌ Path not found: ${resolvedPath}`);
            process.exit(1);
        }

        const stat = fs.statSync(resolvedPath);
        if (stat.isFile() && path.extname(resolvedPath).toLowerCase() === '.cue') {
            cueFilePath = resolvedPath;
        } else if (stat.isDirectory()) {
            // Find cue file inside directory
            const entries = fs.readdirSync(resolvedPath);
            const cue = entries.find(e => path.extname(e).toLowerCase() === '.cue');
            if (cue) {
                cueFilePath = path.join(resolvedPath, cue);
            } else {
                // No cue file, extract artist and album from directory name
                const folderName = path.basename(resolvedPath);
                const parsed = parseArtistAlbum(folderName);
                targetArtist = targetArtist || parsed.artist;
                targetAlbum = targetAlbum || parsed.album;
            }
        }
    }

    let finalTracks = [];
    let albumArtist = targetArtist;
    let albumTitle = targetAlbum;
    let albumGenre = targetGenre || 'Rock';

    // Mode 1: Parse CUE file
    if (cueFilePath) {
        console.log(`\n📄 Parsing CUE sheet: ${cueFilePath}`);
        const cueDir = path.dirname(cueFilePath);
        const rawContent = readCueFile(cueFilePath);
        const cueData = parseCueContent(rawContent, cueDir);

        albumArtist = cueData.albumArtist || albumArtist;
        albumTitle = cueData.albumTitle || albumTitle;
        albumGenre = cueData.albumGenre || albumGenre;

        console.log(`   • Album Artist: ${albumArtist || '(unknown)'}`);
        console.log(`   • Album Title:  ${albumTitle || '(unknown)'}`);
        console.log(`   • Album Genre:  ${albumGenre || '(unknown)'}`);
        if (cueData.resolvedAudioPath) {
            console.log(`   • Container Audio File: ${path.basename(cueData.resolvedAudioPath)}`);
        }

        // Check if CUE tracklist has meaningful titles
        const validCueTracks = cueData.tracks.filter(t => t.title && !/^track\s*\d+$/i.test(t.title));

        if (validCueTracks.length > 0) {
            console.log(`   • Exploded ${validCueTracks.length} tracks directly from CUE sheet.`);
            finalTracks = validCueTracks.map(t => ({
                artist: sanitizeForPostgres(t.artist || albumArtist),
                track_name: sanitizeForPostgres(t.title),
                genre: sanitizeForPostgres(albumGenre),
                source: 'ko-local:cue'
            }));
        } else {
            console.log(`   ⚠️ CUE sheet lacks track titles. Consulting external APIs for tracklist...`);
        }
    }

    // Mode 2: External API resolution (Deezer -> MusicBrainz -> iTunes)
    if (finalTracks.length === 0 && albumArtist && albumTitle) {
        console.log(`\n🌐 Consulting external APIs for "${albumArtist} - ${albumTitle}"...`);
        const extResult = await fetchAlbumTracks(albumArtist, albumTitle);

        if (extResult.success && extResult.tracks.length > 0) {
            console.log(`   ✅ Matched via ${extResult.source.toUpperCase()}! Found ${extResult.tracks.length} tracks.`);
            albumGenre = extResult.genre || albumGenre;
            albumArtist = extResult.albumArtist || albumArtist;
            albumTitle = extResult.albumTitle || albumTitle;

            finalTracks = extResult.tracks.map(t => ({
                artist: sanitizeForPostgres(t.artist || albumArtist),
                track_name: sanitizeForPostgres(t.title),
                genre: sanitizeForPostgres(albumGenre),
                source: `ko-local:ext-${extResult.source}`
            }));
        } else {
            console.error(`   ❌ External APIs could not locate tracklist: ${extResult.reason}`);
        }
    }

    if (finalTracks.length === 0) {
        console.error("\n❌ Could not explode album into individual songs. Please supply valid --artist and --album or a CUE file.");
        process.exit(1);
    }

    console.log(`\n🎵 Exploded ${finalTracks.length} tracks:`);
    finalTracks.forEach((t, idx) => {
        console.log(`   ${(idx + 1).toString().padStart(2, ' ')}. ${t.artist} - ${t.track_name} [${t.genre}]`);
    });

    if (dryRun) {
        console.log("\n🔍 Dry run requested. No changes committed to Supabase local_metadata.");
        return;
    }

    // Upsert into Supabase local_metadata
    console.log(`\n💾 Upserting ${finalTracks.length} tracks into public.local_metadata...`);
    const { data, error } = await supabase
        .from('local_metadata')
        .upsert(finalTracks, { onConflict: 'artist,track_name' });

    if (error) {
        console.error(`❌ Upsert error:`, error.message);
        process.exit(1);
    }

    console.log(`🎉 Successfully synced ${finalTracks.length} exploded songs to local_metadata!`);
}

main().catch(console.error);
