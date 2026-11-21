/**
 * inflateStagedArtists.js
 * 
 * Takes approved artists from `public.artist_suggestions`, resolves their
 * top iconic studio tracks via iTunes + Last.fm + YouTube Music InnerTube,
 * and admits them directly into `public.artists` and `public.tracks`.
 * 
 * Usage:
 *   node scripts/inflateStagedArtists.js --status=approved --tracks=10 --limit=50
 *   node scripts/inflateStagedArtists.js --all --tracks=10
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { isSongCandidate } from '../src/services/genreNormalizer.js';
import { GENRE_NODES } from '../src/services/tasteGraph.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY) || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

const args = process.argv.slice(2);
function getArg(prefix, defaultVal) {
    const match = args.find(a => a.startsWith(prefix));
    return match ? match.split('=')[1] : defaultVal;
}

const BATCH_ID = getArg('--batch=', null);
const STATUS = getArg('--status=', 'approved');
const LIMIT = parseInt(getArg('--limit=', '50'), 10);
const TRACKS_PER_ARTIST = parseInt(getArg('--tracks=', '10'), 10);
const IS_DRY_RUN = args.includes('--dry-run');
const ALL_MODE = args.includes('--all');
const API_KEY = process.env.LASTFM_API_KEY;

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

async function fetchTopSongsFromItunes(artistName, limit = 25) {
    try {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=${limit}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        if (!data.results || !Array.isArray(data.results)) return [];

        const cleanArtistLower = artistName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const matched = data.results.filter(item => {
            if (!item.trackName || !item.artistName) return false;
            const itemArtist = item.artistName.toLowerCase().replace(/[^a-z0-9]/g, '');
            return itemArtist === cleanArtistLower ||
                   itemArtist.includes(cleanArtistLower) ||
                   cleanArtistLower.includes(itemArtist);
        });

        const seen = new Set();
        const songs = [];
        for (const item of matched) {
            const cleanTitle = item.trackName.replace(/[\(\[].*?[\)\]]/g, '').trim().toLowerCase();
            if (!seen.has(cleanTitle)) {
                seen.add(cleanTitle);
                songs.push({ title: item.trackName });
            }
        }
        return songs;
    } catch {
        return [];
    }
}

async function fetchTopTracksFromLastFm(artistName, limit = 25) {
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(artistName)}&api_key=${API_KEY}&format=json&limit=${limit}`;
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'MusicMood/1.0.0' } });
        if (!res.ok) return [];
        const data = await res.json();
        const tracks = data.toptracks?.track || [];
        const arr = Array.isArray(tracks) ? tracks : [tracks];
        return arr.map(t => ({
            title: t.name ? t.name.trim() : ''
        })).filter(t => t.title.length > 0);
    } catch {
        return [];
    }
}

async function getCandidateTracks(artistName, targetCount = 20) {
    const itunesSongs = await fetchTopSongsFromItunes(artistName, 25);
    const seen = new Set(itunesSongs.map(s => s.title.toLowerCase().replace(/[\(\[].*?[\)\]]/g, '').trim()));
    const candidates = [...itunesSongs];

    if (candidates.length < targetCount) {
        const lastfmTracks = await fetchTopTracksFromLastFm(artistName, 25);
        for (const lt of lastfmTracks) {
            const clean = lt.title.toLowerCase().replace(/[\(\[].*?[\)\]]/g, '').trim();
            if (!seen.has(clean)) {
                seen.add(clean);
                candidates.push({ title: lt.title });
            }
        }
    }
    return candidates;
}

// Cache valid genres from DB
let validDbGenres = null;
async function getValidGenre(genreId) {
    if (!validDbGenres) {
        const { data } = await supabase.from('genres').select('id');
        validDbGenres = new Set((data || []).map(g => g.id));
    }
    if (genreId && validDbGenres.has(genreId)) return genreId;
    return 'rock'; // Safe canonical fallback
}

async function run() {
    console.log('================================================================');
    console.log('🎵 INFLATING APPROVED STAGED ARTISTS INTO PRODUCTION');
    console.log(`   Status Filter: ${STATUS}`);
    console.log(`   Batch:         ${BATCH_ID || 'ALL'}`);
    console.log(`   Limit:         ${ALL_MODE ? 'ALL APPROVED' : LIMIT + ' artists'}`);
    console.log(`   Tracks/Artist: At least ${TRACKS_PER_ARTIST} iconic tracks`);
    console.log(`   Mode:          ${IS_DRY_RUN ? 'DRY RUN (Preview Only)' : 'LIVE COMMITS'}`);
    console.log('================================================================\n');

    let totalInflatedArtists = 0;
    let totalInflatedTracks = 0;
    let page = 0;

    while (true) {
        page++;
        let query = supabase
            .from('artist_suggestions')
            .select('*')
            .neq('status', 'inflated')
            .eq('status', STATUS)
            .order('is_requested', { ascending: false })
            .order('confidence_score', { ascending: false })
            .limit(ALL_MODE ? 50 : LIMIT);

        if (BATCH_ID) query = query.eq('batch_id', BATCH_ID);

        const { data: stagedArtists, error } = await query;
        if (error) {
            console.error('Error fetching staged artists:', error);
            break;
        }

        if (!stagedArtists || stagedArtists.length === 0) {
            console.log('ℹ️ No more eligible staged artists found to inflate.');
            break;
        }

        console.log(`[Batch #${page}] Processing ${stagedArtists.length} approved staged artists...\n`);

        for (const artist of stagedArtists) {
            const canonicalGenre = await getValidGenre(artist.primary_genre_id);
            console.log(`----------------------------------------------------------------`);
            console.log(`[#${totalInflatedArtists + 1}] Processing "${artist.name}" (${canonicalGenre})`);

            // 1. Ensure artist exists in public.artists
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

                    const { data: newArt, error: insArtErr } = await supabase
                        .from('artists')
                        .insert({
                            name: artist.name,
                            slug,
                            primary_genre_id: canonicalGenre,
                            secondary_genre_ids: [],
                            affinity_score: 50,
                            track_count: 0
                        })
                        .select()
                        .maybeSingle();

                    if (insArtErr) {
                        console.warn(`   ⚠️ Artist insert notice for "${artist.name}":`, insArtErr.message);
                    }
                    artistRecord = newArt;
                }
            }

            // 2. Check existing tracks in public.tracks
            let existingVideoIds = new Set();
            let currentTrackCount = 0;

            if (artistRecord?.id) {
                const { data: exTracks } = await supabase
                    .from('tracks')
                    .select('id, youtube_video_id')
                    .eq('artist_id', artistRecord.id);

                if (exTracks) {
                    currentTrackCount = exTracks.length;
                    exTracks.forEach(t => {
                        if (t.youtube_video_id) existingVideoIds.add(t.youtube_video_id);
                    });
                }
            }

            if (currentTrackCount >= TRACKS_PER_ARTIST) {
                console.log(`   ✓ "${artist.name}" already has ${currentTrackCount} tracks in catalog.`);
                if (!IS_DRY_RUN) {
                    await supabase
                        .from('artist_suggestions')
                        .update({
                            status: 'inflated',
                            promoted_artist_id: artistRecord?.id || null,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', artist.id);
                }
                totalInflatedArtists++;
                continue;
            }

            const neededTracks = TRACKS_PER_ARTIST - currentTrackCount;
            console.log(`   Catalog tracks: ${currentTrackCount}. Gathering +${neededTracks} tracks to reach minimum ${TRACKS_PER_ARTIST}...`);

            // 3. Fetch candidate tracks from iTunes + Last.fm
            const candidates = await getCandidateTracks(artist.name, neededTracks + 10);
            await sleep(150);

            let tracksAdded = 0;
            const genreNode = GENRE_NODES[canonicalGenre] || {};
            const defaultEnergy = genreNode.energy || 0.6;
            const defaultInstrumental = genreNode.vocal === 'instrumental';

            for (const trk of candidates) {
                if (tracksAdded >= neededTracks) break;

                const gate = isSongCandidate({ title: trk.title, artist: artist.name });
                if (!gate.pass) continue;

                const videoId = await resolveInnertube(artist.name, trk.title);
                if (!videoId || videoId.length !== 11 || existingVideoIds.has(videoId)) continue;

                existingVideoIds.add(videoId);
                console.log(`   ⭐ [${currentTrackCount + tracksAdded + 1}/${TRACKS_PER_ARTIST}] "${trk.title}" -> ${videoId}`);

                if (!IS_DRY_RUN) {
                    // Insert into public.tracks
                    const { error: insErr } = await supabase
                        .from('tracks')
                        .insert({
                            artist: artist.name,
                            artist_id: artistRecord?.id || null,
                            title: trk.title,
                            youtube_video_id: videoId,
                            primary_genre_id: canonicalGenre,
                            secondary_genre_ids: [],
                            energy: defaultEnergy,
                            is_instrumental: defaultInstrumental,
                            source: 'staged_artist_inflation'
                        });

                    if (!insErr) {
                        tracksAdded++;
                        // Also register in local_metadata archive
                        try {
                            await supabase
                                .from('local_metadata')
                                .insert({
                                    artist: artist.name,
                                    track_name: trk.title,
                                    genre: canonicalGenre,
                                    source: 'staged_artist_inflation',
                                    youtube_video_id: videoId
                                });
                        } catch {}
                    }
                } else {
                    tracksAdded++;
                }
                await sleep(180);
            }

            // 4. Update track counts and stage status
            if (!IS_DRY_RUN && artistRecord?.id) {
                const finalCount = currentTrackCount + tracksAdded;
                await supabase
                    .from('artists')
                    .update({
                        track_count: finalCount,
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

            totalInflatedArtists++;
            totalInflatedTracks += tracksAdded;
            console.log(`   🎉 Finished "${artist.name}": +${tracksAdded} new tracks added (total in catalog: ${currentTrackCount + tracksAdded}).\n`);

            await sleep(200);
        }

        if (!ALL_MODE) break;
    }

    console.log('\n================================================================');
    console.log(`🏁 INFLATION COMPLETED`);
    console.log(`   • Total Artists Inflated: ${totalInflatedArtists}`);
    console.log(`   • Total Tracks Ingested:  +${totalInflatedTracks}`);
    console.log('================================================================\n');
}

run().catch(err => {
    console.error('Inflation error:', err);
    process.exit(1);
});
