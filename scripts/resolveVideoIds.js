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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Resolves a YouTube Video ID without using any Google Data API quota.
 */
async function resolveYouTubeId(artist, trackName) {
    const query = `${artist} ${trackName} official audio -remix -cover`;
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });

        if (!res.ok) return null;

        const html = await res.text();
        const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        return match ? match[1] : null;
    } catch (e) {
        return null;
    }
}

async function startResolver() {
    console.log("=================================================");
    console.log("🚀 MusicMood Zero-Quota Pre-Mapping Worker");
    console.log("=================================================");
    console.log("Finding tracks in Supabase where youtube_id is missing...\n");

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

            const videoId = await resolveYouTubeId(track.artist, track.title);

            if (videoId) {
                // Update track in Supabase
                const { error: updateError } = await supabase
                    .from('tracks')
                    .update({ youtube_video_id: videoId })
                    .eq('id', track.id);

                if (!updateError) {
                    totalResolved++;
                    console.log(`[${totalResolved}] ✅ Mapped: "${track.artist} - ${track.title}" -> ${videoId} (${track.primary_genre_id || 'unclassified'})`);
                } else {
                    console.warn(`⚠️ Update failed for ID ${track.id}:`, updateError.message);
                }
            } else {
                totalFailed++;
                console.log(`[Fail] ❌ Could not resolve: "${track.artist} - ${track.title}"`);
            }

            await sleep(DELAY_MS);
        }
    }

    console.log("\n=================================================");
    console.log(`Summary: ${totalResolved} mapped, ${totalFailed} failed.`);
    console.log("=================================================");
}

startResolver();
