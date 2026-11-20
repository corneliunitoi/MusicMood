import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchTopSongHint(artist) {
    // 1. Try iTunes (fast, reliable)
    try {
        const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=song&limit=3`;
        const res = await fetch(itunesUrl);
        if (res.ok) {
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                const track = data.results[0].trackName;
                if (track) return track;
            }
        }
    } catch {}

    // 2. Fallback to Last.fm
    try {
        const lastfmUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(artist)}&api_key=${LASTFM_API_KEY}&format=json&limit=2`;
        const res = await fetch(lastfmUrl);
        if (res.ok) {
            const data = await res.json();
            const track = data.toptracks?.track?.[0]?.name;
            if (track) return track;
        }
    } catch {}

    return null;
}

async function searchYouTubeMusic(artist, songHint = '') {
    try {
        const cleanSong = (songHint || '')
            .replace(/\((Remaster|Remastered|Live|Mono|Stereo|Deluxe).*?\)/gi, '')
            .replace(/\[.*?\]/g, '')
            .trim();
        const query = cleanSong ? `${artist} ${cleanSong}` : artist;

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
                const videoId = shelf.onTap?.watchEndpoint?.videoId ||
                    shelf.buttons?.[0]?.buttonRenderer?.command?.watchEndpoint?.videoId;
                if (videoId && videoId.length === 11) {
                    found = { videoId, title: title || cleanSong || artist };
                    return;
                }
            }
            // ListItem
            if (obj.musicResponsiveListItemRenderer) {
                const item = obj.musicResponsiveListItemRenderer;
                const flexCols = item.flexColumns || [];
                const title = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
                const videoId = item.playlistItemData?.videoId ||
                    item.doubleTapCommand?.watchEndpoint?.videoId ||
                    item.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
                if (videoId && videoId.length === 11) {
                    found = { videoId, title: title || cleanSong || artist };
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
const BATCH_SIZE = limitArg ? parseInt(limitArg.split('=')[1], 10) : 100;
const ALL_PAGES = args.includes('--all');

async function resolveDemoForCandidate(c) {
    let songHint = c.demo_track_title;
    if (!songHint) {
        songHint = await fetchTopSongHint(c.name);
    }
    const match = await searchYouTubeMusic(c.name, songHint);
    if (match && match.videoId) {
        const title = match.title || songHint || c.name;
        await supabase
            .from('artist_suggestions')
            .update({
                demo_youtube_id: match.videoId,
                demo_track_title: title,
                updated_at: new Date().toISOString()
            })
            .eq('id', c.id);
        return { success: true, title, videoId: match.videoId };
    } else {
        // Mark as unresolvable so future runs smoothly proceed to other pending candidates
        await supabase
            .from('artist_suggestions')
            .update({
                demo_track_title: 'UNRESOLVED',
                updated_at: new Date().toISOString()
            })
            .eq('id', c.id);
        return { success: false };
    }
}

async function run() {
    console.log('================================================================');
    console.log('🎧 MUSICMOOD — STAGED CANDIDATE DEMO RESOLUTION PIPELINE');
    console.log(`   Batch Size: ${BATCH_SIZE} per page`);
    console.log(`   Mode:       ${ALL_PAGES ? 'ALL PENDING STAGED' : 'SINGLE BATCH'}`);
    console.log('================================================================\n');

    let totalResolved = 0;
    let totalFailed = 0;
    let iteration = 0;

    while (true) {
        iteration++;
        console.log(`[Batch #${iteration}] Fetching staged candidates without demos...`);
        const { data: candidates, error } = await supabase
            .from('artist_suggestions')
            .select('id, name, primary_genre_id, demo_youtube_id, demo_track_title')
            .is('demo_youtube_id', null)
            .or('demo_track_title.is.null,demo_track_title.neq.UNRESOLVED')
            .order('request_count', { ascending: false })
            .order('confidence_score', { ascending: false })
            .limit(BATCH_SIZE);

        if (error) {
            console.error('Error fetching candidates:', error);
            break;
        }

        if (!candidates || candidates.length === 0) {
            console.log('🎉 All staged artists already have demo tracks populated!');
            break;
        }

        console.log(`Found ${candidates.length} candidates to process.\n`);

        for (let i = 0; i < candidates.length; i++) {
            const c = candidates[i];
            const res = await resolveDemoForCandidate(c);
            if (res.success) {
                totalResolved++;
                console.log(`  [${i + 1}/${candidates.length}] ✅ "${c.name}" -> "${res.title}" (https://youtu.be/${res.videoId})`);
            } else {
                totalFailed++;
                console.log(`  [${i + 1}/${candidates.length}] ⚪ "${c.name}" -> No YouTube demo found`);
            }
            await sleep(250); // Respectful rate limiting
        }

        console.log(`\nBatch #${iteration} completed: +${totalResolved} resolved, ${totalFailed} unresolvable.\n`);

        if (!ALL_PAGES) break;
    }

    console.log('================================================================');
    console.log('🏁 DEMO RESOLUTION COMPLETED');
    console.log(`   • Total Demos Populated: ${totalResolved}`);
    console.log(`   • Unresolved:            ${totalFailed}`);
    console.log('================================================================');
}

run();
