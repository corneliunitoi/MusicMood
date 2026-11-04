import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ ERROR: Supabase credentials missing in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Config
const BATCH_SIZE = 50;
const DELAY_MS = 600; // Polite delay between requests to avoid rate limits

const JUNK_ARTIST_REGEX = /^(cd\s*[0-9]+|disc\s*[0-9]+|track\s*[0-9]+|unknown(\s*artist)?)$/i;
const JUNK_TITLE_REGEX = /^[0-9]+$/;
const NON_MUSIC_TERMS = ['recitation', 'audiobook', 'lesson', 'speaking', 'chinese', 'meditation guide', 'podcast', 'episode'];

function isCorruptedJunk(artist, title) {
    if (!title || title.trim().length < 2) return true;
    if (JUNK_TITLE_REGEX.test(title.trim())) return true;
    const lowerTitle = title.toLowerCase();
    const lowerArtist = (artist || '').toLowerCase();
    if (NON_MUSIC_TERMS.some(t => lowerTitle.includes(t) || lowerArtist.includes(t))) return true;
    return false;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Resolves a YouTube Video ID without using any Google Data API quota.
 * Cleans noisy titles, handles numeric/missing artist tags, and locks to Topic releases.
 */
async function resolveYouTubeTrack(artist, trackName) {
    if (isCorruptedJunk(artist, trackName)) {
        return null;
    }

    // Clean artist: remove leading track numbers ("01 U2" -> "U2"), brackets ("[Re-Jazz]" -> "Re-Jazz")
    let cleanArtist = (artist || '')
        .replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '')
        .replace(/\[[^\]]+\]/g, '')
        .trim();

    // Clean title: remove leading track numbers, noise tags like (Alternate Take), [Stem]
    let cleanTitle = (trackName || '')
        .replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '')
        .replace(/\((Alternate|Remix|Live|Stem|Dublex|Prod\.|Demo|Version|Remaster).*?\)/gi, '')
        .replace(/\[.*?\]/g, '')
        .trim();

    const isNumericArtist = !cleanArtist || /^[0-9]+$/.test(cleanArtist);

    const queries = [];
    if (!isNumericArtist) {
        // High-precision Topic query
        queries.push(`"${cleanArtist}" "${cleanTitle}" Topic`);
        // Fallback query
        queries.push(`${cleanArtist} ${cleanTitle} official audio`);
    } else {
        // Missing/numeric artist tag (e.g. "01 - Ghost Of Perdition" -> search title on Topic)
        queries.push(`"${cleanTitle}" Topic`);
        queries.push(`${cleanTitle} official audio`);
    }

    for (const q of queries) {
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                }
            });

            if (!res.ok) continue;

            const html = await res.text();
            const idMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
            const ownerMatch = html.match(/"ownerText":\{"runs":\[\{"text":"([^"]+)"/);

            if (idMatch && idMatch[1]) {
                let healedArtist = cleanArtist;
                if (isNumericArtist && ownerMatch && ownerMatch[1]) {
                    healedArtist = ownerMatch[1].replace(/\s*-\s*Topic$/i, '').trim();
                }
                return {
                    videoId: idMatch[1],
                    healedArtist: healedArtist || cleanArtist
                };
            }
        } catch (e) {}
    }

    return null;
}

async function startResolver() {
    console.log("=================================================");
    console.log("🚀 MusicMood Smart Zero-Quota Pre-Mapping Worker");
    console.log("=================================================");
    console.log("Finding unmapped tracks in Supabase...\n");

    let totalResolved = 0;
    let totalFailed = 0;

    let isRunning = true;
    process.on('SIGINT', () => {
        console.log("\n🛑 Stopping gracefully...");
        isRunning = false;
    });

    while (isRunning) {
        // Fetch a batch of tracks missing youtube_video_id
        const { data: tracks, error } = await supabase
            .from('tracks')
            .select('id, artist, title, primary_genre_id')
            .is('youtube_video_id', null)
            .limit(BATCH_SIZE);

        if (error) {
            console.error("❌ Supabase query error:", error.message);
            process.exit(1);
        }

        if (!tracks || tracks.length === 0) {
            console.log("\n🎉 All tracks in the database have been mapped! Zero unmapped tracks remaining.");
            break;
        }

        console.log(`📦 Processing batch of ${tracks.length} tracks...`);

        for (const track of tracks) {
            if (!isRunning) break;

            if (isCorruptedJunk(track.artist, track.title)) {
                console.log(`[Junk Filter 🗑️] Skipping & flagging non-music: "${track.artist} - ${track.title}"`);
                await supabase
                    .from('tracks')
                    .update({ youtube_video_id: 'CORRUPT_TAGS' })
                    .eq('id', track.id);
                continue;
            }

            const result = await resolveYouTubeTrack(track.artist, track.title);

            if (result && result.videoId) {
                const updates = { youtube_video_id: result.videoId };
                // If the artist tag was corrupted or numeric, heal it!
                if (result.healedArtist && /^[0-9]+$/.test((track.artist || '').trim())) {
                    updates.artist = result.healedArtist;
                    console.log(`[Healed Artist 🩹] "${track.artist}" -> "${result.healedArtist}" for "${track.title}"`);
                }

                const { error: updateError } = await supabase
                    .from('tracks')
                    .update(updates)
                    .eq('id', track.id);

                if (!updateError) {
                    totalResolved++;
                    console.log(`[${totalResolved}] ✅ Mapped: "${updates.artist || track.artist} - ${track.title}" -> ${result.videoId} (${track.primary_genre_id || 'unclassified'})`);
                } else {
                    console.warn(`⚠️ Update failed for ID ${track.id}:`, updateError.message);
                }
            } else {
                totalFailed++;
                console.log(`[Skip] ⏭️ Could not resolve: "${track.artist} - ${track.title}" (Flagged UNRESOLVED)`);
                // Flag as UNRESOLVED so the batch moves forward and never loops!
                await supabase
                    .from('tracks')
                    .update({ youtube_video_id: 'UNRESOLVED' })
                    .eq('id', track.id);
            }

            await sleep(DELAY_MS);
        }
    }

    console.log("\n=================================================");
    console.log(`Summary: ${totalResolved} mapped, ${totalFailed} unresolved.`);
    console.log("=================================================");
}

startResolver();
