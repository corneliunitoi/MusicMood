/**
 * inflateStagedArtists.js
 * 
 * Takes approved artists from `public.artist_suggestions`, resolves their
 * top iconic studio tracks via YouTube Music InnerTube, and admits them
 * directly into `public.artists` and `public.tracks`.
 * 
 * Usage:
 *   node scripts/inflateStagedArtists.js --status=approved --tracks=5
 *   node scripts/inflateStagedArtists.js --batch=kexp-artists-2026-11-13 --limit=10 --tracks=5
 *   node scripts/inflateStagedArtists.js --batch=kexp-artists-2026-11-13 --limit=5 --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { isSongCandidate } from '../src/services/genreNormalizer.js';
import { GENRE_NODES } from '../src/services/tasteGraph.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

const args = process.argv.slice(2);
function getArg(prefix, defaultVal) {
    const match = args.find(a => a.startsWith(prefix));
    return match ? match.split('=')[1] : defaultVal;
}

const BATCH_ID = getArg('--batch=', null);
const STATUS = getArg('--status=', 'approved');
const LIMIT = parseInt(getArg('--limit=', '50'), 10);
const TRACKS_PER_ARTIST = parseInt(getArg('--tracks=', '5'), 10);
const IS_DRY_RUN = args.includes('--dry-run');
const API_KEY = process.env.LASTFM_API_KEY || 'd11784f5f2ef96e01a656f80734244e8';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function titlesMatch(targetTitle, ytVideoTitle) {
    if (!targetTitle || !ytVideoTitle) return false;
    const cleanTarget = targetTitle.toLowerCase().replace(/[^a-z0-9]/gi, ' ').trim();
    const cleanYt = ytVideoTitle.toLowerCase().replace(/[^a-z0-9]/gi, ' ').trim();
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
        context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', hl: 'en', gl: 'US' } },
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
                const videoId = shelf.title?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
                const title = shelf.title?.runs?.[0]?.text;
                if (videoId) candidates.push({ videoId, title });
            }
            if (obj.musicResponsiveListItemRenderer) {
                const item = obj.musicResponsiveListItemRenderer;
                const videoId = item.playlistItemData?.videoId ||
                    item.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
                const runs = item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
                const title = runs ? runs.map(r => r.text).join('') : '';
                if (videoId) candidates.push({ videoId, title });
            }
            for (const key of Object.keys(obj)) {
                if (Array.isArray(obj[key])) obj[key].forEach(extractItems);
                else if (typeof obj[key] === 'object') extractItems(obj[key]);
            }
        }

        extractItems(data);

        for (const cand of candidates) {
            if (titlesMatch(cleanTitle, cand.title)) return cand.videoId;
        }
        return candidates[0]?.videoId || null;
    } catch {
        return null;
    }
}

async function fetchTopTracksFromLastFm(artistName, limit = 15) {
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(artistName)}&api_key=${API_KEY}&format=json&limit=${limit}`;
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'MusicMood/1.0.0' } });
        if (!res.ok) return [];
        const data = await res.json();
        const tracks = data.toptracks?.track || [];
        return tracks.map(t => ({
            title: t.name.trim(),
            listeners: parseInt(t.listeners || '0', 10)
        }));
    } catch {
        return [];
    }
}

async function run() {
    console.log('================================================================');
    console.log('🎵 INFLATING APPROVED STAGED ARTISTS INTO PRODUCTION');
    console.log(`   Status Filter: ${STATUS}`);
    console.log(`   Batch:         ${BATCH_ID || 'ALL'}`);
    console.log(`   Limit:         ${LIMIT} artists`);
    console.log(`   Tracks/Artist: ${TRACKS_PER_ARTIST} iconic tracks`);
    console.log(`   Mode:          ${IS_DRY_RUN ? 'DRY RUN (Preview Only)' : 'LIVE COMMITS'}`);
    console.log('================================================================\n');

    let query = supabase
        .from('artist_suggestions')
        .select('*')
        .neq('status', 'inflated');

    if (args.includes('--requested-only')) {
        query = query.eq('is_requested', true);
    } else {
        query = query.or('is_requested.eq.true,status.eq.approved');
    }

    query = query
        .order('is_requested', { ascending: false })
        .order('last_requested_at', { ascending: false, nullsFirst: false })
        .order('confidence_score', { ascending: false })
        .limit(LIMIT);

    if (BATCH_ID) query = query.eq('batch_id', BATCH_ID);

    const { data: stagedArtists, error } = await query;
    if (error || !stagedArtists || stagedArtists.length === 0) {
        console.log('ℹ️ No eligible staged artists found to inflate.');
        return;
    }

    console.log(`Found ${stagedArtists.length} artists ready for track inflation.\n`);

    let totalInflatedArtists = 0;
    let totalInflatedTracks = 0;

    for (const artist of stagedArtists) {
        console.log(`----------------------------------------------------------------`);
        console.log(`[${totalInflatedArtists + 1}/${stagedArtists.length}] Inflating "${artist.name}" (${artist.primary_genre_id || 'rock'})`);

        // 1. Ensure artist in public.artists
        let artistRecord = null;
        if (!IS_DRY_RUN) {
            const { data: existingArt } = await supabase
                .from('artists')
                .select('id, name, track_count')
                .ilike('name', artist.name)
                .limit(1);

            if (existingArt?.[0]) {
                artistRecord = existingArt[0];
            } else {
                let slug = artist.slug || artist.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                if (!slug) slug = 'artist-' + Date.now();

                const { data: newArt } = await supabase
                    .from('artists')
                    .insert({
                        name: artist.name,
                        slug,
                        primary_genre_id: artist.primary_genre_id || 'rock',
                        secondary_genre_ids: artist.secondary_genre_ids || [],
                        mbid: artist.mbid || null,
                        affinity_score: 50,
                        track_count: 0
                    })
                    .select()
                    .maybeSingle();

                artistRecord = newArt;
            }
        }

        // 2. Fetch top iconic tracks
        const candidates = await fetchTopTracksFromLastFm(artist.name, 15);
        await sleep(150);

        let tracksAdded = 0;
        const genreNode = GENRE_NODES[artist.primary_genre_id] || {};
        const defaultEnergy = genreNode.energy || 0.6;
        const defaultInstrumental = genreNode.vocal === 'instrumental';

        for (const trk of candidates) {
            if (tracksAdded >= TRACKS_PER_ARTIST) break;

            const gate = isSongCandidate({ title: trk.title, artist: artist.name });
            if (!gate.pass) continue;

            const videoId = await resolveInnertube(artist.name, trk.title);
            if (!videoId || videoId.length !== 11) continue;

            console.log(`   ⭐ [${tracksAdded + 1}/${TRACKS_PER_ARTIST}] "${trk.title}" -> ${videoId}`);

            if (!IS_DRY_RUN) {
                const { error: insErr } = await supabase
                    .from('tracks')
                    .insert({
                        artist: artist.name,
                        artist_id: artistRecord?.id || null,
                        title: trk.title,
                        youtube_video_id: videoId,
                        primary_genre_id: artist.primary_genre_id || 'rock',
                        secondary_genre_ids: artist.secondary_genre_ids || [],
                        energy: defaultEnergy,
                        is_instrumental: defaultInstrumental,
                        source: 'staged_artist_inflation'
                    });

                if (!insErr) tracksAdded++;
            } else {
                tracksAdded++;
            }
            await sleep(150);
        }

        if (!IS_DRY_RUN && artistRecord?.id && tracksAdded > 0) {
            await supabase
                .from('artists')
                .update({
                    track_count: (artistRecord.track_count || 0) + tracksAdded,
                    last_inflated_at: new Date().toISOString()
                })
                .eq('id', artistRecord.id);

            await supabase
                .from('artist_suggestions')
                .update({
                    status: 'inflated',
                    promoted_artist_id: artistRecord.id,
                    updated_at: new Date().toISOString()
                })
                .eq('id', artist.id);
        }

        if (tracksAdded > 0) {
            totalInflatedArtists++;
            totalInflatedTracks += tracksAdded;
            console.log(`   🎉 Finished "${artist.name}": +${tracksAdded} tracks.`);
        }

        await sleep(200);
    }

    console.log('\n================================================================');
    console.log(`🏁 INFLATION COMPLETED: +${totalInflatedArtists} artists inflated with +${totalInflatedTracks} tracks.`);
    console.log('================================================================\n');
}

run().catch(err => {
    console.error('Inflation error:', err);
    process.exit(1);
});
