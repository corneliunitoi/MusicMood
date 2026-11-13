import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { normalizeGenre, isSongCandidate } from '../src/services/genreNormalizer.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

// Parse CLI flags
const args = process.argv.slice(2);
function getArg(prefix, defaultVal) {
    const match = args.find(a => a.startsWith(prefix));
    return match ? match.split('=')[1] : defaultVal;
}

const LIMIT_ARTISTS = parseInt(getArg('--limit=', getArg('--artists=', '10')), 10);
const MAX_TRACKS_PER_ARTIST = parseInt(getArg('--max-tracks=', '10'), 10);
const TARGET_ARTIST = getArg('--artist=', null);
const TARGET_GENRE = getArg('--genre=', null);
const IS_DRY_RUN = args.includes('--dry-run');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fuzzy check that candidate title and requested title match reasonably.
 */
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

/**
 * Resolves track to YouTube Music stream via InnerTube WEB_REMIX API (zero quota).
 */
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
    } catch (e) {
        return null;
    }
}

/**
 * Fetches top-ranked canonical songs for an artist from iTunes Search API.
 */
async function fetchTopSongsFromITunes(artistName) {
    try {
        const normalizedArtistName = artistName
            .replace(/[‐‑‒–—―]/g, '-')
            .replace(/["“”«»]/g, '')
            .trim();

        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(normalizedArtistName)}&entity=song&limit=25`;
        const res = await fetch(url);
        if (!res.ok) return [];

        const data = await res.json();
        if (!data.results || !Array.isArray(data.results)) return [];

        const cleanArtistLower = normalizedArtistName.toLowerCase().replace(/[^a-z0-9]/g, '');

        // Filter to matching artist
        const matchedSongs = data.results.filter(item => {
            if (!item.trackName || !item.artistName) return false;
            const itemArtist = item.artistName.toLowerCase().replace(/[^a-z0-9]/g, '');
            return itemArtist === cleanArtistLower ||
                   itemArtist.includes(cleanArtistLower) ||
                   cleanArtistLower.includes(itemArtist);
        });

        // Deduplicate titles
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

async function runInflationPipeline() {
    console.log('=================================================');
    console.log('🚀 MusicMood Artist Discography Inflation Pipeline');
    console.log(`   • Cap: Max ${MAX_TRACKS_PER_ARTIST} tracks per artist`);
    console.log(`   • Batch Size: Up to ${LIMIT_ARTISTS} priority artists`);
    if (TARGET_ARTIST) console.log(`   • Target Artist: "${TARGET_ARTIST}"`);
    if (TARGET_GENRE) console.log(`   • Target Genre: ${TARGET_GENRE}`);
    if (IS_DRY_RUN) console.log('   • Mode: DRY RUN (No database inserts)');
    console.log('=================================================\n');

    // 1. Fetch candidate artists (prioritizing 1:1 parity between Upvotes and Unique User Favorites)
    let artists = null;
    try {
        const { data: rpcArtists, error: rpcErr } = await supabase.rpc('get_priority_inflation_candidates', {
            p_limit: Math.max(LIMIT_ARTISTS * 4, 40),
            p_max_tracks: MAX_TRACKS_PER_ARTIST,
            p_target_genre: TARGET_GENRE,
            p_target_artist: TARGET_ARTIST
        });
        if (!rpcErr && Array.isArray(rpcArtists) && rpcArtists.length > 0) {
            artists = rpcArtists;
        } else if (rpcErr) {
            console.warn('[Inflation] RPC candidate fetch notice:', rpcErr.message);
        }
    } catch (e) {
        console.warn('[Inflation] Falling back to standard query:', e.message);
    }

    if (!artists) {
        let query = supabase
            .from('artists')
            .select('id, name, primary_genre_id, secondary_genre_ids, affinity_score, upvotes, track_count')
            .not('name', 'is', null)
            .lt('track_count', MAX_TRACKS_PER_ARTIST)
            .order('upvotes', { ascending: false })
            .order('affinity_score', { ascending: false })
            .order('track_count', { ascending: true })
            .limit(Math.max(LIMIT_ARTISTS * 4, 40));

        if (TARGET_ARTIST) {
            query = query.ilike('name', TARGET_ARTIST);
        }
        if (TARGET_GENRE) {
            query = query.eq('primary_genre_id', TARGET_GENRE);
        }

        const { data: fallbackArtists, error: artErr } = await query;
        if (artErr) {
            console.error('Failed to query artists:', artErr.message);
            return;
        }
        artists = fallbackArtists;
    }

    if (!artists || artists.length === 0) {
        console.log('No eligible artists found needing inflation.');
        return;
    }

    console.log(`Candidate pool: ${artists.length} artists queued. Goal: inflate ${LIMIT_ARTISTS} artists...\n`);

    let totalInflatedTracks = 0;
    let completedArtists = 0;

    for (let i = 0; i < artists.length; i++) {
        if (completedArtists >= LIMIT_ARTISTS) {
            console.log(`\n🎯 Target goal of ${LIMIT_ARTISTS} inflated artists reached!`);
            break;
        }

        const art = artists[i];
        console.log(`-------------------------------------------------`);
        console.log(`[Artist ${completedArtists + 1}/${LIMIT_ARTISTS}] "${art.name}"`);
        console.log(`   Upvotes: ${art.upvotes || 0} 👍 | Unique Favorites: ${art.unique_favorited_users || 0} ❤️ | Priority Score: ${art.total_priority_score || art.upvotes || 0} pts | Genre: ${art.primary_genre_id || 'unknown'}`);

        // Get exact current tracks in catalog for this artist
        const { data: existingTracks, error: trkErr } = await supabase
            .from('tracks')
            .select('id, title, youtube_video_id')
            .ilike('artist', art.name);

        if (trkErr) {
            console.warn(`   ⚠️ Error checking tracks for ${art.name}:`, trkErr.message);
            continue;
        }

        const currentCount = existingTracks ? existingTracks.length : 0;
        const deficit = MAX_TRACKS_PER_ARTIST - currentCount;

        console.log(`   Current Catalog Tracks: ${currentCount} / ${MAX_TRACKS_PER_ARTIST} (Needs +${deficit})`);

        if (deficit <= 0) {
            console.log(`   ✅ Already reached cap of ${MAX_TRACKS_PER_ARTIST} tracks. Skipping.`);
            continue;
        }

        // Cache existing titles for deduplication
        const existingTitles = new Set((existingTracks || []).map(t => 
            t.title.toLowerCase().replace(/[\(\[].*?[\)\]]/g, '').trim()
        ));
        const existingVids = new Set((existingTracks || []).map(t => t.youtube_video_id));

        // Fetch top canonical tracks from iTunes
        console.log(`   🔍 Querying iTunes for top hits...`);
        const itunesHits = await fetchTopSongsFromITunes(art.name);

        if (itunesHits.length === 0) {
            console.log(`   ⏭️ No iTunes catalog matches found for ${art.name}. Skipping.`);
            await sleep(300);
            continue;
        }

        console.log(`   Found ${itunesHits.length} top songs. Resolving missing entries...`);

        let addedForArtist = 0;

        for (const hit of itunesHits) {
            if (addedForArtist >= deficit) break;

            const cleanHitTitle = hit.title.toLowerCase().replace(/[\(\[].*?[\)\]]/g, '').trim();
            if (existingTitles.has(cleanHitTitle)) {
                continue; // Already in catalog
            }

            const gateCheck = isSongCandidate({ title: hit.title, artist: art.name });
            if (!gateCheck.pass) {
                continue; // Skip skits/remixes
            }

            // Resolve YouTube video stream
            const videoId = await resolveInnertube(art.name, hit.title);
            if (!videoId || existingVids.has(videoId)) {
                continue;
            }

            const canonicalGenre = art.primary_genre_id || normalizeGenre(hit.genreHint, art.name, hit.title);
            const secondaryGenres = Array.isArray(art.secondary_genre_ids) ? art.secondary_genre_ids : [];

            console.log(`   ⭐ [${addedForArtist + 1}/${deficit}] Inflating: "${hit.title}" -> ${videoId} (${canonicalGenre})`);

            if (!IS_DRY_RUN) {
                const { error: insErr } = await supabase
                    .from('tracks')
                    .insert({
                        title: hit.title,
                        artist: art.name,
                        youtube_video_id: videoId,
                        primary_genre_id: canonicalGenre,
                        secondary_genre_ids: secondaryGenres,
                        source: 'artist_inflation'
                    });

                if (insErr) {
                    console.warn(`      ❌ Insert error: ${insErr.message}`);
                } else {
                    addedForArtist++;
                    existingTitles.add(cleanHitTitle);
                    existingVids.add(videoId);
                    totalInflatedTracks++;
                }
            } else {
                addedForArtist++;
                existingTitles.add(cleanHitTitle);
                existingVids.add(videoId);
                totalInflatedTracks++;
            }

            await sleep(350); // Respectful throttle
        }

        // Update artist track_count in database
        if (!IS_DRY_RUN && addedForArtist > 0) {
            await supabase
                .from('artists')
                .update({
                    track_count: currentCount + addedForArtist,
                    last_inflated_at: new Date().toISOString()
                })
                .eq('id', art.id);
        }

        console.log(`   🎉 Finished: Added ${addedForArtist} tracks. New total: ${currentCount + addedForArtist}/${MAX_TRACKS_PER_ARTIST}\n`);
        completedArtists++;
        await sleep(500);
    }

    console.log('=================================================');
    console.log('🏁 INFLATION PIPELINE RUN SUMMARY');
    console.log(`   • Artists Inflated: ${completedArtists}`);
    console.log(`   • Total New Tracks Added: +${totalInflatedTracks}`);
    console.log(`   • Target Max Tracks Per Artist: ${MAX_TRACKS_PER_ARTIST}`);
    console.log('=================================================');
}

runInflationPipeline();
