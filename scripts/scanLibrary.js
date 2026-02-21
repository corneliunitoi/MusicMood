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
const LIBRARY_PATH = '\\\\192.168.0.2\\e$\\music';
const OUTPUT_FILE = path.join(process.cwd(), 'public', 'local_library_stats.json');
const VALID_EXTENSIONS = ['.mp3', '.flac', '.m4a', '.wav', '.ogg'];

// Artist Cache to skip redundant API calls
const artistGenreCache = new Map();

function cleanString(str) {
    if (!str) return '';
    return str
        .replace(/\(.*\)|\[.*\]/g, '') // Remove (Official Video) etc
        .replace(/\b(ft|feat|featuring)\.?\b.*/gi, '') // Remove features
        .replace(/[^\w\s-]/gi, ' ') // Remove special chars
        .replace(/\s+/g, ' ') // Collapse spaces
        .trim();
}

/**
 * Heuristic to extract artist/title from directory path if tags are missing
 * Structure: ...\Genre\Artist - Album\Track.ext
 */
function extractFromPath(filePath) {
    const parts = filePath.split(path.sep);
    const fileName = path.basename(filePath, path.extname(filePath));
    const parentFolder = parts[parts.length - 2] || '';
    const grandparentFolder = parts[parts.length - 3] || '';

    let artist = null;
    let title = cleanString(fileName);
    let potentialGenre = grandparentFolder;

    // Try to get artist from parent folder "Artist - Album (Year)"
    if (parentFolder.includes(' - ')) {
        artist = parentFolder.split(' - ')[0].trim();
    } else {
        artist = parentFolder;
    }

    // Sometimes artist is in filename "Artist - Title"
    if (fileName.includes(' - ')) {
        const fileParts = fileName.split(' - ');
        artist = fileParts[0].trim();
        title = fileParts[1].trim();
    }

    return {
        artist: cleanString(artist),
        title: cleanString(title),
        genre: potentialGenre
    };
}

async function enrichTrackMetadata(filePath) {
    let artist = null;
    let trackName = null;
    let genre = null;
    let source = 'file';

    try {
        // 1. Try reading tags first (Most Accurate)
        const metadata = await musicMetadata.parseFile(filePath);
        artist = metadata.common.artist;
        trackName = metadata.common.title;
        genre = metadata.common.genre?.[0];

        if (artist && trackName) {
            source = 'tags';
        }
    } catch (e) {
        // Tags failed, use path
    }

    // 2. Fallback to path heuristics
    if (!artist || !trackName) {
        const pathData = extractFromPath(filePath);
        artist = artist || pathData.artist;
        trackName = trackName || pathData.title;
        genre = genre || pathData.genre;
        source = 'path';
    }

    if (!artist || !trackName) return { success: false };

    // 3. Check Cache
    const cacheKey = artist.toLowerCase();
    if (artistGenreCache.has(cacheKey) && !genre) {
        return {
            success: true,
            artist,
            trackName,
            genre: artistGenreCache.get(cacheKey),
            source: 'cache'
        };
    }

    // 4. Search External API (iTunes) for Genre enrichment
    try {
        const query = `${artist} ${trackName}`;
        const response = await fetch(`${ITUNES_SEARCH_API}?term=${encodeURIComponent(query)}&entity=song&limit=1`);

        if (response.ok) {
            const data = await response.json();
            if (data.results && data.results.length > 0) {
                const track = data.results[0];
                artist = track.artistName || artist;
                trackName = track.trackName || trackName;
                genre = track.primaryGenreName || genre;

                if (genre) artistGenreCache.set(artist.toLowerCase(), genre);

                return { success: true, artist, trackName, genre, source: 'itunes' };
            }
        }
    } catch (error) {
        // API error, fallback to what we have
    }

    // Final fallback: use what we found in tags or path
    if (artist && trackName) {
        return { success: true, artist, trackName, genre, source };
    }

    return { success: false };
}

function getAudioFiles(dirPath, arrayOfFiles) {
    let files;
    try {
        files = fs.readdirSync(dirPath);
    } catch (e) {
        console.error(`Could not read directory ${dirPath}:`, e.message);
        return arrayOfFiles;
    }

    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function (file) {
        try {
            const fullPath = path.join(dirPath, file);
            if (fs.statSync(fullPath).isDirectory()) {
                arrayOfFiles = getAudioFiles(fullPath, arrayOfFiles);
            } else {
                if (VALID_EXTENSIONS.includes(path.extname(fullPath).toLowerCase())) {
                    arrayOfFiles.push(fullPath);
                }
            }
        } catch (e) {
            // Ignore access errors
        }
    });

    return arrayOfFiles;
}

const itunesToInternalMap = {
    "Pop": "Pop", "K-Pop": "Pop", "Singer/Songwriter": "Pop",
    "Rock": "Rock", "Alternative": "Rock", "Metal": "Rock", "Punk": "Rock", "Hard Rock": "Rock",
    "Hip-Hop/Rap": "Hip-Hop/Rap", "Hip-Hop": "Hip-Hop/Rap", "Rap": "Hip-Hop/Rap", "R&B/Soul": "Hip-Hop/Rap",
    "Dance": "Electronic/Dance", "Electronic": "Electronic/Dance", "House": "Electronic/Dance", "Techno": "Electronic/Dance",
    "Classical": "Classical/Instrumental", "Instrumental": "Classical/Instrumental", "Soundtrack": "Classical/Instrumental",
    "Jazz": "Jazz/Blues", "Blues": "Jazz/Blues", "Soul": "Jazz/Blues",
    "Country": "Country/Folk", "Folk": "Country/Folk",
    "Latin": "Latin", "Reggaeton": "Latin", "Salsa": "Latin", "Música Mexicana": "Latin", "Regional Mexican": "Latin"
};

async function runStaticScanner() {
    console.log(`🚀 Starting Advanced Scan of ${LIBRARY_PATH}...`);

    if (!fs.existsSync(LIBRARY_PATH)) {
        console.error(`ERROR: Path ${LIBRARY_PATH} inaccessible.`);
        process.exit(1);
    }

    const audioFiles = getAudioFiles(LIBRARY_PATH);
    console.log(`Found ${audioFiles.length} audio files.`);

    const genreStats = {};
    let totalHits = 0;
    let cloudSynced = 0;
    const syncBuffer = [];
    const SYNC_THRESHOLD = 100;

    const BATCH_SIZE = 10; // Smaller batch for file metadata overhead
    for (let i = 0; i < audioFiles.length; i += BATCH_SIZE) {
        const batch = audioFiles.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(file => enrichTrackMetadata(file)));

        results.forEach(result => {
            if (result.success && result.artist && result.trackName) {
                totalHits++;
                const mainGenre = itunesToInternalMap[result.genre] || result.genre || 'Unknown';

                if (!genreStats[mainGenre]) genreStats[mainGenre] = { hits: 0, subStats: {} };
                genreStats[mainGenre].hits++;
                if (result.genre) {
                    genreStats[mainGenre].subStats[result.genre] = (genreStats[mainGenre].subStats[result.genre] || 0) + 1;
                }

                syncBuffer.push({
                    artist: result.artist,
                    track_name: result.trackName,
                    genre: result.genre || 'Unknown'
                });
            }
        });

        if (syncBuffer.length >= SYNC_THRESHOLD) {
            const uniqueBuffer = Array.from(new Map(
                syncBuffer.map(item => [`${item.artist?.toLowerCase()}|${item.track_name?.toLowerCase()}`, item])
            ).values());

            const { error: syncError } = await supabase
                .from('local_metadata')
                .upsert(uniqueBuffer, { onConflict: 'artist,track_name' });

            if (!syncError) {
                cloudSynced += syncBuffer.length;
                console.log(`☁️ Synced: ${cloudSynced}/${audioFiles.length} (Last batch sourced: ${results[0]?.source || 'unknown'})`);
                syncBuffer.length = 0;
            } else {
                console.error("❌ Sync Error:", syncError.message);
            }
        }

        if ((i + BATCH_SIZE) % 100 === 0) {
            process.stdout.write(`.`);
        }
    }

    // Final flush
    if (syncBuffer.length > 0) {
        const uniqueBuffer = Array.from(new Map(
            syncBuffer.map(item => [`${item.artist?.toLowerCase()}|${item.track_name?.toLowerCase()}`, item])
        ).values());
        await supabase.from('local_metadata').upsert(uniqueBuffer, { onConflict: 'artist,track_name' });
        cloudSynced += syncBuffer.length;
    }

    const outputData = {
        totalHits,
        genreStats,
        cloudSynced,
        lastScanned: new Date().toISOString()
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
    console.log(`\n✅ Scan Complete! ${totalHits} tracks identified.`);
}

runStaticScanner();
