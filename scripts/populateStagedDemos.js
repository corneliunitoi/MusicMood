import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function searchYouTubeMusic(artist, songHint = '') {
    try {
        const query = songHint ? `${artist} ${songHint}` : artist;
        const res = await fetch('https://music.youtube.com/youtubei/v1/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Origin': 'https://music.youtube.com',
                'Referer': 'https://music.youtube.com/'
            },
            body: JSON.stringify({
                context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', hl: 'en', gl: 'US' } },
                query
            })
        });
        if (!res.ok) return null;
        const data = await res.json();
        let found = null;

        function extract(obj) {
            if (!obj || typeof obj !== 'object' || found) return;
            // MusicCardShelf
            if (obj.musicCardShelfRenderer) {
                const shelf = obj.musicCardShelfRenderer;
                const title = shelf.title?.runs?.[0]?.text || '';
                const videoId = shelf.onTap?.watchEndpoint?.videoId;
                if (videoId && videoId.length === 11) {
                    found = { videoId, title };
                    return;
                }
            }
            // ListItem
            if (obj.musicResponsiveListItemRenderer) {
                const item = obj.musicResponsiveListItemRenderer;
                const flexCols = item.flexColumns || [];
                const title = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
                const videoId = item.playlistItemData?.videoId || item.doubleTapCommand?.watchEndpoint?.videoId;
                if (videoId && videoId.length === 11) {
                    found = { videoId, title };
                    return;
                }
            }
            for (const v of Object.values(obj)) extract(v);
        }

        extract(data);
        return found;
    } catch {
        return null;
    }
}

const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 50;

async function run() {
    console.log(`Fetching staged candidates needing demo tracks (Batch: ${LIMIT})...`);
    const { data: candidates, error } = await supabase
        .from('artist_suggestions')
        .select('id, name, primary_genre_id, demo_youtube_id, demo_track_title')
        .is('demo_youtube_id', null)
        .order('request_count', { ascending: false })
        .order('confidence_score', { ascending: false })
        .limit(LIMIT);

    if (error || !candidates) {
        console.error('Error fetching candidates:', error);
        return;
    }

    console.log(`Found ${candidates.length} candidates. Populating demos...`);
    for (const c of candidates) {
        const match = await searchYouTubeMusic(c.name, c.demo_track_title);
        if (match && match.videoId) {
            console.log(`  ✅ ${c.name} -> "${match.title}" (https://youtu.be/${match.videoId})`);
            await supabase
                .from('artist_suggestions')
                .update({
                    demo_youtube_id: match.videoId,
                    demo_track_title: match.title,
                    updated_at: new Date().toISOString()
                })
                .eq('id', c.id);
        } else {
            console.log(`  ⚪ ${c.name} -> No demo found`);
        }
        await new Promise(r => setTimeout(r, 400));
    }
    console.log('Done!');
}

run();
