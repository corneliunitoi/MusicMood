import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import * as musicMetadata from 'music-metadata';

// Load environment variables from .env
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("ERROR: Supabase credentials missing in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const ITUNES_SEARCH_API = 'https://itunes.apple.com/search';

// Parse CLI flags and arguments
const rawArgs = process.argv.slice(2);
const isRandom = rawArgs.includes('--random') || process.env.npm_config_random === 'true';

let sampleLimit = null;
const limitArg = rawArgs.find(a => a.startsWith('--limit='));
if (limitArg) {
    sampleLimit = parseInt(limitArg.split('=')[1], 10);
} else {
    const limitIdx = rawArgs.indexOf('--limit');
    if (limitIdx !== -1 && rawArgs[limitIdx + 1]) {
        sampleLimit = parseInt(rawArgs[limitIdx + 1], 10);
    }
}

const batchSizeArg = rawArgs.find(a => a.startsWith('--batch='));
const BATCH_SIZE = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 20;

const genreFlag = rawArgs.find(a => a.startsWith('--genre='));
const TARGET_GENRE_FILTER = genreFlag ? genreFlag.split('=')[1].trim().toLowerCase() : null;

const pathArg = rawArgs.find((arg, idx) => {
    if (arg.startsWith('--')) return false;
    if (idx > 0 && rawArgs[idx - 1] === '--limit') return false;
    return true;
});

// Default to user's music share; allow pointing directly to a subfolder
let LIBRARY_PATH = pathArg || '\\\\192.168.0.2\\e$\\music';
if (TARGET_GENRE_FILTER && !pathArg) {
    // Convenience shortcut: --genre=rock points directly to Flac muzic\Rock
    const candidatePath = path.join(LIBRARY_PATH, 'Flac muzic', TARGET_GENRE_FILTER.charAt(0).toUpperCase() + TARGET_GENRE_FILTER.slice(1));
    if (fs.existsSync(candidatePath)) {
        LIBRARY_PATH = candidatePath;
    }
}

// Output statistics file
const customSuffix = pathArg ? `_custom_${path.basename(LIBRARY_PATH)}` : (TARGET_GENRE_FILTER ? `_${TARGET_GENRE_FILTER}` : '');
const OUTPUT_FILE = path.join(process.cwd(), 'public', `local_library_stats${customSuffix}.json`);
const CACHE_DIR = path.join(process.cwd(), 'scripts', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'artist_genre_cache.json');

const VALID_EXTENSIONS = ['.mp3', '.flac', '.m4a', '.wav', '.ogg'];

// Persistent Disk Cache for Artist -> Genre lookups
const artistGenreCache = new Map();
try {
    if (fs.existsSync(CACHE_FILE)) {
        const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        for (const [k, v] of Object.entries(raw)) {
            artistGenreCache.set(k.toLowerCase(), v);
        }
        console.log(`📦 Loaded ${artistGenreCache.size} cached artist genres from disk.`);
    }
} catch (e) {
    console.warn('⚠️ Could not read cache file:', e.message);
}

function persistCacheToDisk() {
    try {
        if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
        const obj = Object.fromEntries(artistGenreCache);
        fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2));
    } catch (e) {}
}

// Clean and sanitize strings for PostgreSQL (removes null bytes, lone surrogates, and control chars)
function sanitizeForPostgres(str) {
    if (!str) return '';
    return str
        .replace(/\0/g, '') // Strip null bytes (\u0000)
        .replace(/[\uD800-\uDFFF]/g, '') // Strip lone surrogate code points
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '') // Strip unprintable control chars
        .trim();
}

function cleanString(str) {
    if (!str) return '';
    return str
        .replace(/\(.*\)|\[.*\]/g, '') // Remove (Official Video), [Remastered]
        .replace(/\b(ft|feat|featuring)\.?\b.*/gi, '') // Remove features
        .replace(/[^\w\s-]/gi, ' ') // Remove special chars
        .replace(/\s+/g, ' ') // Collapse spaces
        .trim();
}

// Directory-to-genre heuristic mapping (matches folder names instantly without iTunes API calls)
const FOLDER_GENRE_MAP = {
    'rock': 'Rock',
    'blues': 'Blues',
    'classical music': 'Classical/Instrumental',
    'classical': 'Classical/Instrumental',
    'jazz': 'Jazz/Blues',
    'solo singers and composers': 'Pop',
    'opera stuff': 'Classical/Instrumental',
    'opera': 'Classical/Instrumental',
    'folk & country': 'Country/Folk',
    'folk': 'Country/Folk',
    'country': 'Country/Folk',
    'electonic music': 'Electronic/Dance',
    'electronic music': 'Electronic/Dance',
    'electronic': 'Electronic/Dance',
    'dance': 'Electronic/Dance',
    'spanish guitar': 'Classical/Instrumental',
    'muzica romaneasca': 'Country/Folk',
    'hip hop & rap': 'Hip-Hop/Rap',
    'hip hop': 'Hip-Hop/Rap',
    'rap': 'Hip-Hop/Rap',
    'metal': 'Rock',
    'hard rock': 'Rock',
    'alternative': 'Rock',
    'punk': 'Rock',
    'pop': 'Pop',
    'avant': 'Electronic/Dance',
    'prog': 'Rock',
    'progmassiv': 'Rock',
    'post': 'Rock',
    'symho': 'Classical/Instrumental'
};

function detectGenreFromPath(filePath) {
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    for (const [folderKey, mappedGenre] of Object.entries(FOLDER_GENRE_MAP)) {
        if (normalized.includes(`/${folderKey}/`)) {
            return mappedGenre;
        }
    }
    return null;
}

/**
 * Heuristic to extract artist/title from directory path if tags are missing
 * Structure: ...\Genre\Artist - Album\Track.ext or ...\Artist\Album\Track.ext
 */
function extractFromPath(filePath) {
    const parts = filePath.split(path.sep);
    const fileName = path.basename(filePath, path.extname(filePath));
    const parentFolder = parts[parts.length - 2] || '';
    const grandparentFolder = parts[parts.length - 3] || '';

    let artist = null;
    let title = cleanString(fileName);
    let potentialGenre = detectGenreFromPath(filePath) || grandparentFolder;

    // Check if filename has "01 - Artist - Title" or "Artist - Title"
    const cleanFileName = fileName.replace(/^[0-9]+[\s._-]+/, '');
    if (cleanFileName.includes(' - ')) {
        const fileParts = cleanFileName.split(' - ');
        artist = cleanString(fileParts[0]);
        title = cleanString(fileParts.slice(1).join(' - '));
    } else if (parentFolder.includes(' - ')) {
        artist = cleanString(parentFolder.split(' - ')[0]);
    } else {
        artist = cleanString(parentFolder);
    }

    return {
        artist,
        title,
        genre: potentialGenre
    };
}

async function enrichTrackMetadata(filePath) {
    let artist = null;
    let trackName = null;
    let genre = null;
    let source = 'file';

    // 1. Try reading ID3/FLAC metadata tags first (Most Accurate)
    try {
        const metadata = await musicMetadata.parseFile(filePath, { skipCovers: true, duration: false });
        artist = metadata.common.artist;
        trackName = metadata.common.title;
        genre = metadata.common.genre?.[0];

        if (artist && trackName) {
            source = 'tags';
        }
    } catch (e) {
        // Tag parsing failed, fallback to path
    }

    // 2. Fallback to path heuristics for missing artist / title
    if (!artist || !trackName) {
        const pathData = extractFromPath(filePath);
        artist = artist || pathData.artist;
        trackName = trackName || pathData.title;
        genre = genre || pathData.genre;
        source = 'path';
    }

    if (!artist || !trackName) return { success: false, reason: 'Unparseable artist/title' };

    // Clean names
    artist = sanitizeForPostgres(artist);
    trackName = sanitizeForPostgres(trackName);

    // 3. Fast Genre Resolution: check folder structure first (0ms, 100% offline)
    if (!genre) {
        genre = detectGenreFromPath(filePath);
        if (genre) source = 'folder';
    }

    // 4. Check Persistent Disk Cache
    const cacheKey = artist.toLowerCase();
    if (!genre && artistGenreCache.has(cacheKey)) {
        genre = artistGenreCache.get(cacheKey);
        source = 'cache';
    }

    // 5. Query External API (iTunes) with timeout as last resort
    if (!genre) {
        try {
            const query = `${artist} ${trackName}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2000); // 2s timeout max
            const response = await fetch(`${ITUNES_SEARCH_API}?term=${encodeURIComponent(query)}&entity=song&limit=1`, {
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (response.ok) {
                const data = await response.json();
                if (data.results && data.results.length > 0) {
                    const track = data.results[0];
                    genre = track.primaryGenreName || genre;
                    if (genre) {
                        artistGenreCache.set(cacheKey, genre);
                        source = 'itunes';
                    }
                }
            }
        } catch (error) {
            // API timeout or network error, fallback safely
        }
    }

    // 6. Graceful Fallback: Never drop a valid song just because genre tag is blank
    if (!genre) {
        genre = detectGenreFromPath(filePath) || 'Rock'; // Safe default
        source = 'fallback';
    }

    return {
        success: true,
        artist,
        trackName,
        genre,
        source
    };
}

function getAudioFiles(dirPath, arrayOfFiles = []) {
    let entries;
    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (e) {
        console.error(`Could not read directory ${dirPath}:`, e.message);
        return arrayOfFiles;
    }

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        try {
            if (entry.isDirectory()) {
                getAudioFiles(fullPath, arrayOfFiles);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (VALID_EXTENSIONS.includes(ext)) {
                    arrayOfFiles.push(fullPath);
                }
            }
        } catch (e) {
            // Skip unreadable files/folders
        }
    }

    return arrayOfFiles;
}

const itunesToInternalMap = {
    // Pop
    "Pop": "Pop", "K-Pop": "Pop", "Singer/Songwriter": "Pop",
    "Adult Contemporary": "Pop", "Mandopop": "Pop", "Indie Pop": "Pop",
    // Rock
    "Rock": "Rock", "Alternative": "Rock", "Metal": "Rock", "Punk": "Rock", "Hard Rock": "Rock",
    "Classic Rock": "Rock", "Indie Rock": "Rock", "Goth Rock": "Rock",
    "Blues-Rock": "Rock", "Blues Rock": "Rock", "Industrial": "Rock",
    // Hip-Hop/R&B
    "Hip-Hop/Rap": "Hip-Hop/Rap", "Hip-Hop": "Hip-Hop/Rap", "Rap": "Hip-Hop/Rap",
    "R&B/Soul": "Hip-Hop/Rap", "R&B": "Hip-Hop/Rap",
    // Electronic
    "Dance": "Electronic/Dance", "Electronic": "Electronic/Dance", "House": "Electronic/Dance",
    "Techno": "Electronic/Dance", "Trance": "Electronic/Dance", "Dubstep": "Electronic/Dance",
    "Avantgarde": "Electronic/Dance", "Avant-Garde": "Electronic/Dance",
    // Classical
    "Classical": "Classical/Instrumental", "Instrumental": "Classical/Instrumental",
    "Soundtrack": "Classical/Instrumental", "Baroque": "Classical/Instrumental",
    "Opera": "Classical/Instrumental", "Vocal": "Classical/Instrumental",
    // Jazz/Blues
    "Jazz": "Jazz/Blues", "Blues": "Jazz/Blues", "Soul": "Jazz/Blues",
    "Classic Blues": "Jazz/Blues", "Blues Gospel": "Jazz/Blues",
    // Country
    "Country": "Country/Folk", "Folk": "Country/Folk", "Traditional Country": "Country/Folk",
    // Latin
    "Latin": "Latin", "Reggaeton": "Latin", "Salsa": "Latin",
    "Música Mexicana": "Latin", "Regional Mexican": "Latin",
    // Gospel
    "Gospel": "Gospel/Religious", "Christian": "Gospel/Religious",
    "Christian Pop": "Gospel/Religious", "Children's Music": "Gospel/Religious"
};

const JUNK_GENRE_PATTERN = /complete recordings|album|vinyl|pack|\d{2,}\s*bit|vol\s*\d/i;

/**
 * Resilient Supabase batch upsert.
 * If the batch fails, it retries each track individually to isolate bad items,
 * preventing a single corrupt string from poisoning subsequent batches.
 */
async function syncBatchToSupabase(batch) {
    if (!batch || batch.length === 0) return 0;

    // Deduplicate by artist|track_name
    const uniqueMap = new Map();
    for (const item of batch) {
        const key = `${item.artist?.toLowerCase()}|${item.track_name?.toLowerCase()}`;
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, item);
        }
    }
    const uniqueItems = Array.from(uniqueMap.values());

    const { error: batchErr } = await supabase
        .from('local_metadata')
        .upsert(uniqueItems, { onConflict: 'artist,track_name' });

    if (!batchErr) {
        return uniqueItems.length;
    }

    // Poison-pill recovery: isolate and upsert valid records individually
    console.warn(`\n⚠️ Batch upsert issue (${batchErr.message}). Isolating records individually...`);
    fs.appendFileSync('scan_errors.log', `[${new Date().toISOString()}] Batch Error: ${batchErr.message}\n`);

    let recoveredCount = 0;
    for (const item of uniqueItems) {
        try {
            const { error: singleErr } = await supabase
                .from('local_metadata')
                .upsert([item], { onConflict: 'artist,track_name' });

            if (!singleErr) {
                recoveredCount++;
            } else {
                fs.appendFileSync('scan_errors.log', `[${new Date().toISOString()}] Isolated corrupt track "${item.artist} - ${item.track_name}": ${singleErr.message}\n`);
            }
        } catch (fatalSingle) {
            fs.appendFileSync('scan_errors.log', `[${new Date().toISOString()}] Fatal on track "${item.artist} - ${item.track_name}": ${fatalSingle.message}\n`);
        }
    }

    return recoveredCount;
}

async function runStaticScanner() {
    console.log("=================================================");
    console.log(`🚀 Starting Resilient Local Library Scanner`);
    console.log(`   • Target Path: ${LIBRARY_PATH}`);
    console.log(`   • Batch Size: ${BATCH_SIZE}`);
    if (sampleLimit) console.log(`   • Sample Limit: ${sampleLimit}`);
    if (TARGET_GENRE_FILTER) console.log(`   • Genre Filter: ${TARGET_GENRE_FILTER}`);
    console.log("=================================================\n");

    if (!fs.existsSync(LIBRARY_PATH)) {
        console.error(`ERROR: Path ${LIBRARY_PATH} is inaccessible.`);
        process.exit(1);
    }

    const tScanStart = Date.now();
    process.stdout.write("🔍 Traversing directory structure... ");
    let audioFiles = getAudioFiles(LIBRARY_PATH);
    const traverseSec = ((Date.now() - tScanStart) / 1000).toFixed(1);
    console.log(`Done! Found ${audioFiles.length} audio files in ${traverseSec}s.`);

    if (isRandom) {
        console.log(`🎲 Shuffling ${audioFiles.length} files for even artist distribution...`);
        for (let i = audioFiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [audioFiles[i], audioFiles[j]] = [audioFiles[j], audioFiles[i]];
        }
    }

    if (sampleLimit && sampleLimit > 0 && sampleLimit < audioFiles.length) {
        console.log(`🎯 Applying sample limit: processing first ${sampleLimit} tracks...`);
        audioFiles = audioFiles.slice(0, sampleLimit);
    }

    const genreStats = {};
    let totalHits = 0;
    let cloudSynced = 0;
    const syncBuffer = [];
    const rejectedTracks = [];
    const SYNC_THRESHOLD = 100;

    for (let i = 0; i < audioFiles.length; i += BATCH_SIZE) {
        try {
            const batch = audioFiles.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch.map(file => enrichTrackMetadata(file)));

            results.forEach(result => {
                if (result.success && result.artist && result.trackName) {
                    let genre = (result.genre || 'Rock').trim();
                    if (JUNK_GENRE_PATTERN.test(genre)) {
                        genre = 'Rock';
                    }

                    totalHits++;
                    const mainGenre = itunesToInternalMap[genre] || genre;

                    if (!genreStats[mainGenre]) genreStats[mainGenre] = { hits: 0, subStats: {} };
                    genreStats[mainGenre].hits++;
                    genreStats[mainGenre].subStats[genre] = (genreStats[mainGenre].subStats[genre] || 0) + 1;

                    syncBuffer.push({
                        artist: sanitizeForPostgres(result.artist),
                        track_name: sanitizeForPostgres(result.trackName),
                        genre: sanitizeForPostgres(mainGenre),
                        source: 'ko-local'
                    });
                } else {
                    rejectedTracks.push({ ...result, reason: result.reason || 'Missing artist/title' });
                }
            });

            if (syncBuffer.length >= SYNC_THRESHOLD) {
                const synced = await syncBatchToSupabase(syncBuffer);
                cloudSynced += synced;
                syncBuffer.length = 0; // ALWAYS CLEAR BUFFER - never leaves poison pill
                persistCacheToDisk();
                process.stdout.write(`☁️ [${cloudSynced}/${audioFiles.length}] `);
            }

            if ((i + BATCH_SIZE) % 100 === 0) {
                process.stdout.write(`.`);
            }
        } catch (fatalBatchError) {
            console.error(`\n❌ Fatal error in batch starting at index ${i}:`, fatalBatchError.message);
            fs.appendFileSync('scan_errors.log', `[${new Date().toISOString()}] Fatal Batch Error at Index ${i}: ${fatalBatchError.stack || fatalBatchError.message}\n`);
            syncBuffer.length = 0; // Prevent runaway buffer growth
        }
    }

    // Final flush
    if (syncBuffer.length > 0) {
        const synced = await syncBatchToSupabase(syncBuffer);
        cloudSynced += synced;
        syncBuffer.length = 0;
        persistCacheToDisk();
    }

    console.log(`\n🎧 Rejected tracks: ${rejectedTracks.length}`);
    if (rejectedTracks.length > 0) {
        fs.writeFileSync(path.join(process.cwd(), 'public', 'rejected_tracks.json'), JSON.stringify(rejectedTracks, null, 2));
    }

    const outputData = {
        totalHits,
        genreStats,
        cloudSynced,
        lastScanned: new Date().toISOString()
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
    const totalDurationSec = ((Date.now() - tScanStart) / 1000).toFixed(1);
    console.log(`\n=================================================`);
    console.log(`✅ Scan Complete!`);
    console.log(`   • Tracks Processed: ${totalHits}`);
    console.log(`   • Cloud Synced: ${cloudSynced}`);
    console.log(`   • Total Elapsed: ${totalDurationSec}s`);
    console.log(`   • Output Stats: ${OUTPUT_FILE}`);
    console.log(`=================================================`);
}

runStaticScanner().catch(console.error);
