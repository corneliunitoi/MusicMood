import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { normalizeGenre, isSongCandidate } from '../src/services/genreNormalizer.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY) || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

const args = process.argv.slice(2);
function getArg(prefix, defaultVal) {
    const match = args.find(a => a.startsWith(prefix));
    return match ? match.split('=')[1] : defaultVal;
}

const MAX_TRACKS = parseInt(getArg('--max-tracks=', '25'), 10);
const LIMIT_ARTISTS = parseInt(getArg('--limit=', '25'), 10);
const IS_DRY_RUN = args.includes('--dry-run');
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function titlesMatch(targetTitle, ytVideoTitle) {
    if (!targetTitle || !ytVideoTitle) return false;
    const cleanTarget = targetTitle.toLowerCase().replace(/[^a-z0-9а-яё]/gi, ' ').trim();
    const cleanYt = ytVideoTitle.toLowerCase().replace(/[^a-z0-9а-яё]/gi, ' ').trim();

    if (cleanYt.includes(cleanTarget) || cleanTarget.includes(cleanYt)) return true;

    const targetWords = cleanTarget.split(/\s+/).filter(w => w.length > 2);
    if (targetWords.length === 0) return true;
    const matchedWords = targetWords.filter(w => cleanYt.includes(w));
    return (matchedWords.length / targetWords.length) >= 0.5;
}

async function resolveInnertube(artist, trackName) {
    const cleanArtist = artist.replace(/["“”«»]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanTitle = trackName
        .replace(/\((Alternate|Remix|Live|Stem|Dublex|Prod\.|Demo|Version|Remaster).*?\)/gi, '')
        .replace(/\[.*?\]/g, '')
        .replace(/["“”«»]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const query = `${cleanArtist} ${cleanTitle}`.trim();
    const body = {
        context: {
            client: {
                clientName: 'WEB_REMIX',
                clientVersion: '1.20240101.01.00',
                hl: 'en',
                gl: 'US'
            }
        },
        query
    };

    try {
        const res = await fetch('https://music.youtube.com/youtubei/v1/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Origin': 'https://music.youtube.com',
                'Referer': 'https://music.youtube.com/'
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) return null;
        const data = await res.json();
        const candidates = [];

        function extractItems(obj) {
            if (!obj || typeof obj !== 'object') return;
            if (obj.musicCardShelfRenderer) {
                const shelf = obj.musicCardShelfRenderer;
                const title = shelf.title?.runs?.[0]?.text || '';
                const videoId = shelf.onTap?.watchEndpoint?.videoId;
                if (videoId && videoId.length === 11) candidates.push({ videoId, title });
            }
            if (obj.musicResponsiveListItemRenderer) {
                const item = obj.musicResponsiveListItemRenderer;
                const flexCols = item.flexColumns || [];
                const title = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
                const videoId = item.playlistItemData?.videoId || item.doubleTapCommand?.watchEndpoint?.videoId;
                if (videoId && videoId.length === 11) candidates.push({ videoId, title });
            }
            for (const v of Object.values(obj)) extractItems(v);
        }

        extractItems(data);

        for (const cand of candidates) {
            if (titlesMatch(cleanTitle, cand.title)) {
                return cand.videoId;
            }
        }
        return candidates[0]?.videoId || null;
    } catch {
        return null;
    }
}

async function fetchTopSongsFromITunes(artistName) {
    try {
        const normalizedArtistName = artistName
            .replace(/[‐‑‒–—―]/g, '-')
            .replace(/["“”«»]/g, '')
            .trim();

        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(normalizedArtistName)}&entity=song&limit=35`;
        const res = await fetch(url);
        if (!res.ok) return [];

        const data = await res.json();
        if (!data.results || !Array.isArray(data.results)) return [];

        const cleanArtistLower = normalizedArtistName.toLowerCase().replace(/[^a-z0-9]/g, '');

        const matchedSongs = data.results.filter(item => {
            if (!item.trackName || !item.artistName) return false;
            const itemArtist = item.artistName.toLowerCase().replace(/[^a-z0-9]/g, '');
            return itemArtist === cleanArtistLower ||
                   itemArtist.includes(cleanArtistLower) ||
                   cleanArtistLower.includes(itemArtist);
        });

        const seenTitles = new Set();
        const uniqueSongs = [];

        for (const item of matchedSongs) {
            const cleanTitle = item.trackName.replace(/[\(\[].*?[\)\]]/g, '').trim().toLowerCase();
            if (!seenTitles.has(cleanTitle)) {
                seenTitles.add(cleanTitle);
                uniqueSongs.push({
                    title: item.trackName,
                    artist: item.artistName,
                    genreHint: item.primaryGenreName
                });
            }
        }

        return uniqueSongs;
    } catch (e) {
        console.warn(`[iTunes] Error fetching top songs for "${artistName}":`, e.message);
        return [];
    }
}

async function fetchTopTracksFromLastFm(artistName, limit = 25) {
    try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(artistName)}&api_key=${LASTFM_API_KEY}&format=json&limit=${limit}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'MusicMood/1.0.0' } });
        if (!res.ok) return [];
        const data = await res.json();
        const tracks = data.toptracks?.track || [];
        const arr = Array.isArray(tracks) ? tracks : [tracks];
        return arr.map(t => ({
            title: t.name.trim(),
            artist: t.artist?.name || artistName,
            genreHint: null
        }));
    } catch {
        return [];
    }
}

async function run() {
    console.log('================================================================');
    console.log('❤️  Under-Represented User Favorites Inflation Pipeline');
    console.log(`   • Target Max Tracks: ${MAX_TRACKS} tracks per artist`);
    console.log(`   • Target Batch Size: Up to ${LIMIT_ARTISTS} favorited artists`);
    console.log(`   • Mode: ${IS_DRY_RUN ? 'DRY RUN' : 'LIVE DATABASE INSERTS'}`);
    console.log('================================================================\n');

    // Fetch priority inflation candidates via dynamic RPC (with elastic tier caps)
    const { data: candidates, error: rpcErr } = await supabase.rpc('get_dynamic_priority_inflation_candidates', {
        p_limit: 80,
        p_max_tracks: MAX_TRACKS,
        p_target_genre: null,
        p_target_artist: null
    });

    if (rpcErr || !candidates || candidates.length === 0) {
        console.error('Failed to query priority candidates:', rpcErr?.message);
        return;
    }

    // Filter strictly to favorited artists with deficit
    const targetArtists = candidates.filter(c => (c.unique_favorited_users || 0) > 0);
    console.log(`Found ${targetArtists.length} favorited candidate artists queued.`);

    let totalInflatedArtists = 0;
    let totalNewTracksAdded = 0;

    for (let i = 0; i < targetArtists.length; i++) {
        if (totalInflatedArtists >= LIMIT_ARTISTS) {
            console.log(`\n🎯 Target limit of ${LIMIT_ARTISTS} inflated artists reached!`);
            break;
        }

        const art = targetArtists[i];
        const targetCap = art.target_track_cap || MAX_TRACKS;

        // Check exact current catalog count in tracks
        const { data: existingTracks, error: trkErr } = await supabase
            .from('tracks')
            .select('id, title, youtube_video_id')
            .ilike('artist', art.name);

        if (trkErr) {
            console.warn(`   ⚠️ Error checking tracks for ${art.name}:`, trkErr.message);
            continue;
        }

        const currentCount = existingTracks ? existingTracks.length : 0;
        const deficit = targetCap - currentCount;

        if (deficit <= 0) {
            // Self-heal artist table track_count if it was 0 or out of sync
            if (!IS_DRY_RUN && (art.track_count || 0) !== currentCount) {
                await supabase.from('artists').update({ track_count: currentCount }).eq('id', art.id);
            }
            continue;
        }

        console.log('----------------------------------------------------------------');
        console.log(`[Artist ${totalInflatedArtists + 1}/${LIMIT_ARTISTS}] "${art.name}"`);
        console.log(`   Favorited by ${art.unique_favorited_users} users | Upvotes: ${art.upvotes || 0} 👍 | Catalog: ${currentCount} / ${targetCap} (Tier Cap: ${targetCap}, Needs +${deficit})`);

        const existingTitles = new Set((existingTracks || []).map(t => 
            t.title.toLowerCase().replace(/[\(\[].*?[\)\]]/g, '').trim()
        ));
        const existingVids = new Set((existingTracks || []).map(t => t.youtube_video_id));

        console.log(`   🔍 Querying iTunes for top songs...`);
        let itunesHits = await fetchTopSongsFromITunes(art.name);

        if (itunesHits.length === 0) {
            console.log(`   ⏭️ iTunes returned 0 hits for "${art.name}". Trying Last.fm fallback...`);
            itunesHits = await fetchTopTracksFromLastFm(art.name, 25);
        }

        if (itunesHits.length === 0) {
            console.log(`   ⏭️ No matches found on iTunes or Last.fm for "${art.name}". Skipping.`);
            await sleep(300);
            continue;
        }

        console.log(`   Found ${itunesHits.length} iTunes hits. Resolving YouTube audio...`);

        let added = 0;
        for (const hit of itunesHits) {
            if (currentCount + added >= MAX_TRACKS) break;

            const cleanHitTitle = hit.title.toLowerCase().replace(/[\(\[].*?[\)\]]/g, '').trim();
            if (existingTitles.has(cleanHitTitle)) continue;

            const gate = isSongCandidate({ title: hit.title, artist: art.name });
            if (!gate.pass) continue;

            const videoId = await resolveInnertube(art.name, hit.title);
            if (!videoId || existingVids.has(videoId)) continue;

            const resolvedGenre = art.primary_genre_id || normalizeGenre(hit.genreHint, art.name, hit.title) || 'rock';

            console.log(`   ⭐ [${added + 1}/${deficit}] Inflating: "${hit.title}" -> ${videoId} (${resolvedGenre})`);

            if (!IS_DRY_RUN) {
                const { error: insErr } = await supabase
                    .from('tracks')
                    .insert({
                        title: hit.title,
                        artist: art.name,
                        youtube_video_id: videoId,
                        primary_genre_id: resolvedGenre,
                        source: 'favorite_inflation'
                    });

                if (!insErr) {
                    added++;
                    existingTitles.add(cleanHitTitle);
                    existingVids.add(videoId);
                    totalNewTracksAdded++;
                }
            } else {
                added++;
                existingTitles.add(cleanHitTitle);
                existingVids.add(videoId);
                totalNewTracksAdded++;
            }

            await sleep(350);
        }

        // Update artist table
        if (!IS_DRY_RUN && (added > 0 || art.track_count !== currentCount + added)) {
            await supabase
                .from('artists')
                .update({
                    track_count: currentCount + added,
                    last_inflated_at: new Date().toISOString()
                })
                .eq('id', art.id);
        }

        if (added > 0) {
            totalInflatedArtists++;
            console.log(`   🎉 Finished "${art.name}": Added +${added} tracks. Total: ${currentCount + added}/${targetCap}\n`);
        } else {
            console.log(`   ℹ️ No new missing tracks could be added for "${art.name}".\n`);
        }

        await sleep(400);
    }

    console.log('================================================================');
    console.log('🏁 FAVORITES INFLATION COMPLETED');
    console.log(`   • Favorited Artists Inflated: ${totalInflatedArtists}`);
    console.log(`   • Total New Tracks Added:     +${totalNewTracksAdded}`);
    console.log(`   • Target Max Tracks:          ${MAX_TRACKS}`);
    console.log('================================================================');
}

run();
