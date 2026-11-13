/**
 * harvestLastFmArtists.js
 * 
 * Harvests priority missing artists and their iconic top 10 tracks
 * directly into Supabase (public.artists and public.tracks).
 * Resolves verified studio audio via YouTube Music zero-quota resolver.
 * 
 * Usage:
 *   node scripts/harvestLastFmArtists.js --count=15 --tracks=10 --user=octakhan888
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { normalizeGenre, isSongCandidate, VALID_GENRE_IDS } from '../src/services/genreNormalizer.js';
import { GENRE_NODES } from '../src/services/tasteGraph.js';

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

const TARGET_USER = getArg('--user=', 'octakhan888');
const API_KEY = getArg('--key=', process.env.LASTFM_API_KEY || 'd11784f5f2ef96e01a656f80734244e8');
const ARTIST_OFFSET = parseInt(getArg('--offset=', '0'), 10);
const ARTIST_COUNT = parseInt(getArg('--count=', '15'), 10);
const TRACKS_PER_ARTIST = parseInt(getArg('--tracks=', '10'), 10);
const IS_DRY_RUN = args.includes('--dry-run');

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
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(8000)
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
 * Fetches top tags for an artist from Last.fm
 */
async function fetchArtistTags(artistName) {
    try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(artistName)}&api_key=${API_KEY}&format=json`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return [];
        const data = await res.json();
        const tags = data.toptags?.tag || [];
        return Array.isArray(tags) ? tags.map(t => t.name) : [];
    } catch (e) {
        return [];
    }
}

/**
 * Fetches top tracks for an artist from Last.fm
 */
async function fetchTopTracksFromLastFm(artistName, limit = 20) {
    try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(artistName)}&api_key=${API_KEY}&format=json&limit=${limit}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return [];
        const data = await res.json();
        const tracks = data.toptracks?.track || [];
        const list = Array.isArray(tracks) ? tracks : [tracks];
        return list.map(t => ({
            title: t.name,
            artist: t.artist?.name || artistName,
            playcount: parseInt(t.playcount || '0', 10),
            listeners: parseInt(t.listeners || '0', 10)
        }));
    } catch (e) {
        return [];
    }
}

/**
 * Fetches fallback top songs from iTunes Search API
 */
async function fetchTopSongsFromITunes(artistName) {
    try {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=25`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return [];
        const data = await res.json();
        if (!data.results || !Array.isArray(data.results)) return [];
        return data.results.map(r => ({
            title: r.trackName,
            artist: r.artistName,
            genreHint: r.primaryGenreName
        }));
    } catch (e) {
        return [];
    }
}

async function runHarvest() {
    console.log('================================================================');
    console.log(`🚀 MusicMood Automated Harvest Pipeline`);
    console.log(`   Source:       @${TARGET_USER}'s Last.fm Library`);
    console.log(`   Target:       Top ${ARTIST_COUNT} missing artists`);
    console.log(`   Cap:          ${TRACKS_PER_ARTIST} iconic tracks per artist`);
    console.log(`   Dry Run:      ${IS_DRY_RUN}`);
    console.log('================================================================\n');

    // 1. Load cached missing artists or read from file
    const cachePath = path.resolve(process.cwd(), `scripts/cache/lastfm_${TARGET_USER}.json`);
    let missingArtists = [];

    if (fs.existsSync(cachePath)) {
        const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        missingArtists = raw.missing_artists || [];
        console.log(`✓ Loaded ${missingArtists.length} missing artists from local cache.\n`);
    } else {
        console.log('⚠️ Local cache not found. Please run scrapeLastFmArtists.js first.');
        process.exit(1);
    }

    const targetList = missingArtists.slice(ARTIST_OFFSET, ARTIST_OFFSET + ARTIST_COUNT);
    console.log(`🎯 Queued top ${targetList.length} artists (offset ${ARTIST_OFFSET}) for catalog ingestion:\n`);
    targetList.forEach((a, i) => {
        console.log(`   ${(ARTIST_OFFSET + i + 1).toString().padStart(2, ' ')}. ${a.name.padEnd(25, ' ')} (${a.playcount} user plays)`);
    });
    console.log('\n----------------------------------------------------------------\n');

    let totalHarvestedArtists = 0;
    let totalHarvestedTracks = 0;

    for (let i = 0; i < targetList.length; i++) {
        const item = targetList[i];
        console.log(`================================================================`);
        console.log(`[Artist ${ARTIST_OFFSET + i + 1}/${ARTIST_OFFSET + targetList.length}] Ingesting "${item.name}"`);
        console.log(`================================================================`);

        // A. Classify Canonical & Secondary Genres from Last.fm tags
        console.log(`   🔍 Querying Last.fm tags for genre consensus...`);
        const rawTags = await fetchArtistTags(item.name);
        console.log(`   Raw tags: [${rawTags.slice(0, 6).join(', ')}]`);

        let primaryGenre = null;
        const secondaryGenres = [];

        for (const tag of rawTags) {
            const canonical = normalizeGenre(tag, item.name);
            if (canonical && VALID_GENRE_IDS.has(canonical)) {
                if (!primaryGenre) {
                    primaryGenre = canonical;
                } else if (canonical !== primaryGenre && !secondaryGenres.includes(canonical)) {
                    secondaryGenres.push(canonical);
                }
            }
        }

        // Fallback genre if tags are ambiguous
        if (!primaryGenre) {
            primaryGenre = normalizeGenre('', item.name);
        }
        if (!primaryGenre || !VALID_GENRE_IDS.has(primaryGenre)) {
            primaryGenre = 'rock'; // ultimate rock fallback
        }

        console.log(`   🎵 Canonical Genre: ${primaryGenre} (Secondary: [${secondaryGenres.slice(0, 3).join(', ')}])`);

        // B. Ensure artist exists in public.artists
        let artistRecord = null;
        if (!IS_DRY_RUN) {
            // Check if already in DB
            const { data: existingArts } = await supabase
                .from('artists')
                .select('id, name, track_count')
                .ilike('name', item.name)
                .limit(1);

            const existingArt = existingArts?.[0] || null;

            if (existingArt) {
                artistRecord = existingArt;
                console.log(`   ℹ️ Artist record found in DB (ID: ${existingArt.id}, tracks: ${existingArt.track_count || 0})`);
                if ((existingArt.track_count || 0) >= TRACKS_PER_ARTIST) {
                    console.log(`   ✅ Already has ${existingArt.track_count} tracks in catalog. Skipping.`);
                    continue;
                }
            } else {
                let slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                if (!slug) slug = 'artist-' + Date.now();
                const { data: newArt, error: artErr } = await supabase
                    .from('artists')
                    .insert({
                        name: item.name,
                        slug,
                        primary_genre_id: primaryGenre,
                        secondary_genre_ids: secondaryGenres,
                        mbid: item.mbid || null,
                        affinity_score: Math.min(100, Math.round(item.playcount / 10)),
                        upvotes: 0,
                        track_count: 0
                    })
                    .select()
                    .maybeSingle();

                if (artErr) {
                    // If slug collision, try finding by slug
                    const { data: slugArt } = await supabase.from('artists').select('id, name, track_count').eq('slug', slug).limit(1);
                    if (slugArt?.[0]) {
                        artistRecord = slugArt[0];
                    } else {
                        console.error(`   ❌ Failed to create artist record: ${artErr.message}`);
                        continue;
                    }
                } else {
                    artistRecord = newArt;
                    console.log(`   ✅ Created new artist in public.artists (ID: ${newArt.id})`);
                }
            }
        } else {
            artistRecord = { id: 'dry-run-uuid', name: item.name, track_count: 0 };
        }

        // C. Fetch Top Iconic Tracks
        console.log(`   🔍 Fetching top tracks from Last.fm...`);
        let trackCandidates = await fetchTopTracksFromLastFm(item.name, 25);
        if (trackCandidates.length < TRACKS_PER_ARTIST) {
            console.log(`   Supplementing with iTunes top tracks...`);
            const itunesFallback = await fetchTopSongsFromITunes(item.name);
            const seenTitles = new Set(trackCandidates.map(t => t.title.toLowerCase()));
            for (const s of itunesFallback) {
                if (!seenTitles.has(s.title.toLowerCase())) {
                    seenTitles.add(s.title.toLowerCase());
                    trackCandidates.push(s);
                }
            }
        }

        console.log(`   Candidate tracks found: ${trackCandidates.length}`);

        // D. Resolve and Ingest Tracks
        // Fetch existing tracks for this artist to prevent duplicates
        const existingTrackVids = new Set();
        const existingTrackTitles = new Set();
        if (!IS_DRY_RUN && artistRecord?.id) {
            const { data: existingTrks } = await supabase
                .from('tracks')
                .select('youtube_video_id, title')
                .ilike('artist', item.name);
            (existingTrks || []).forEach(t => {
                if (t.youtube_video_id) existingTrackVids.add(t.youtube_video_id);
                if (t.title) existingTrackTitles.add(t.title.toLowerCase());
            });
        }

        const genreNode = GENRE_NODES[primaryGenre] || {};
        const defaultEnergy = genreNode.energy || 0.7;
        const defaultInstrumental = genreNode.vocal === 'instrumental';

        let tracksAddedForArtist = 0;

        for (const candidate of trackCandidates) {
            if (tracksAddedForArtist >= TRACKS_PER_ARTIST) break;

            const cleanTitle = candidate.title.trim();
            const lowerTitle = cleanTitle.toLowerCase();

            if (existingTrackTitles.has(lowerTitle)) {
                continue; // Already in DB
            }

            const gate = isSongCandidate({ title: cleanTitle, artist: item.name });
            if (!gate.pass) {
                continue; // Skip interviews, demos, skits
            }

            // Resolve YouTube video stream
            const videoId = await resolveInnertube(item.name, cleanTitle);
            if (!videoId || videoId.length !== 11 || existingTrackVids.has(videoId)) {
                continue;
            }

            console.log(`   ⭐ [${tracksAddedForArtist + 1}/${TRACKS_PER_ARTIST}] Ingesting: "${cleanTitle}" -> ${videoId} (${primaryGenre})`);

            if (!IS_DRY_RUN) {
                const { error: insErr } = await supabase
                    .from('tracks')
                    .insert({
                        artist: item.name,
                        artist_id: artistRecord?.id || null,
                        title: cleanTitle,
                        youtube_video_id: videoId,
                        primary_genre_id: primaryGenre,
                        secondary_genre_ids: secondaryGenres,
                        energy: defaultEnergy,
                        is_instrumental: defaultInstrumental,
                        source: 'lastfm_harvest'
                    });

                if (insErr) {
                    console.warn(`      ❌ Insert error: ${insErr.message}`);
                } else {
                    tracksAddedForArtist++;
                    totalHarvestedTracks++;
                    existingTrackVids.add(videoId);
                    existingTrackTitles.add(lowerTitle);
                }
            } else {
                tracksAddedForArtist++;
                totalHarvestedTracks++;
                existingTrackVids.add(videoId);
                existingTrackTitles.add(lowerTitle);
            }

            await sleep(150); // Respectful throttle
        }

        // E. Update artist track count in public.artists
        if (!IS_DRY_RUN && artistRecord?.id && tracksAddedForArtist > 0) {
            const newTotalCount = (artistRecord.track_count || 0) + tracksAddedForArtist;
            await supabase
                .from('artists')
                .update({
                    track_count: newTotalCount,
                    last_inflated_at: new Date().toISOString()
                })
                .eq('id', artistRecord.id);
        }

        console.log(`   🎉 Finished "${item.name}": +${tracksAddedForArtist} tracks added to catalog.\n`);
        totalHarvestedArtists++;
        await sleep(200);
    }

    console.log('================================================================');
    console.log('🏁 HARVEST RUN COMPLETED');
    console.log(`   • Total Artists Harvested: ${totalHarvestedArtists} / ${ARTIST_COUNT}`);
    console.log(`   • Total Tracks Ingested:   +${totalHarvestedTracks} playable tracks`);
    console.log(`   • Database:                Supabase public.artists & public.tracks`);
    console.log('================================================================\n');

    // GitHub Step Summary integration
    if (process.env.GITHUB_STEP_SUMMARY) {
        try {
            const summaryMd = `
## 📻 Last.fm Library Harvest Report (@${TARGET_USER})

| Metric | Result |
| :--- | :--- |
| **Artists Harvested** | **${totalHarvestedArtists} / ${ARTIST_COUNT}** |
| **Playable Tracks Ingested** | **+${totalHarvestedTracks} tracks** |
| **Iconic Target Per Artist** | **${TRACKS_PER_ARTIST} tracks** |
| **Execution Mode** | **${IS_DRY_RUN ? 'DRY RUN (No DB Writes)' : 'LIVE DB WRITES'}** |

### 🎵 Ingested Artists in this Batch:
${targetList.map((a, i) => `${i + 1}. **${a.name}** (${a.playcount} user plays)`).join('\n')}
`;
            fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMd, 'utf8');
        } catch (e) {
            console.warn('Failed to write GITHUB_STEP_SUMMARY:', e.message);
        }
    }
}

runHarvest().catch(err => {
    console.error('Fatal harvest error:', err);
    process.exit(1);
});
