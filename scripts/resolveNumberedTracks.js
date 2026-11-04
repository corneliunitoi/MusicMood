import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function resolveTrack(title) {
    const cleanTitle = (title || '')
        .replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '')
        .replace(/\((Alternate|Remix|Live|Stem|Dublex|Prod\.|Demo|Version|Remaster).*?\)/gi, '')
        .replace(/\[.*?\]/g, '')
        .trim();

    if (!cleanTitle || cleanTitle.length < 2) return null;

    const queries = [
        `"${cleanTitle}" Topic`,
        `${cleanTitle} official audio`
    ];

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
                let healedArtist = ownerMatch && ownerMatch[1] ? ownerMatch[1].replace(/\s*-\s*Topic$/i, '').trim() : null;
                return {
                    videoId: idMatch[1],
                    artist: healedArtist
                };
            }
        } catch (e) {}
    }
    return null;
}

async function run() {
    console.log("=========================================");
    console.log("🩹 Healing Numbered Artist Tracks (Opeth, etc.)");
    console.log("=========================================\n");

    const { data: tracks, error } = await supabase
        .from('tracks')
        .select('id, artist, title')
        .or('title.ilike.%Ghost of Perdition%,title.ilike.%Windowpane%,title.ilike.%Wreath%,title.ilike.%Advent%,title.ilike.%Les Chants Magnetiques%,title.ilike.%Lost In The Echo%');

    if (error || !tracks) {
        console.error("Query error:", error);
        return;
    }

    console.log(`Found ${tracks.length} target tracks to heal...`);

    for (const t of tracks) {
        const resolved = await resolveTrack(t.title);
        if (resolved) {
            console.log(`✅ [${t.title}] -> Healed Artist: "${resolved.artist}", Video ID: ${resolved.videoId}`);
            await supabase
                .from('tracks')
                .update({
                    artist: resolved.artist || t.artist,
                    youtube_video_id: resolved.videoId
                })
                .eq('id', t.id);
        } else {
            console.log(`❌ Could not resolve: "${t.title}"`);
        }
        await sleep(600);
    }

    console.log("\n🎉 Healing complete!");
}

run();
