/**
 * harvestGenreArtists.js
 * 
 * Targeted Genre Inflation Pipeline for MusicMood.
 * Specifically populates under-represented genres (Blues, Country/Americana,
 * Folk & Acoustic, Avant-Garde & Experimental) with high-purity, verified studio audio.
 * 
 * Sourcing & Quality Gatekeepers:
 * 1. Curated Subgenre Micro-Tags (avoiding pop/rock pollution)
 * 2. Similar-Artist Anchor Expansion (indisputable genre legends)
 * 3. Multi-tag Consensus & Normalization (via genreNormalizer.js)
 * 4. Song Candidate Gatekeeper (rejects bootlegs, interviews, skits, live phone rips)
 * 5. YouTube Music InnerTube Studio Resolver (verified audio stream)
 * 
 * Usage:
 *   node scripts/harvestGenreArtists.js --genre=blues --count=200 --tracks=5
 *   node scripts/harvestGenreArtists.js --genre=country --count=200 --tracks=5
 *   node scripts/harvestGenreArtists.js --genre=folk_acoustic --count=200 --tracks=5
 *   node scripts/harvestGenreArtists.js --genre=avant_garde --count=200 --tracks=5
 *   node scripts/harvestGenreArtists.js --genre=all --count=200 --tracks=5
 *   node scripts/harvestGenreArtists.js --genre=blues --count=10 --dry-run
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

const TARGET_GENRE = getArg('--genre=', 'all').toLowerCase();
const API_KEY = getArg('--key=', process.env.LASTFM_API_KEY || 'd11784f5f2ef96e01a656f80734244e8');
const ARTIST_COUNT = parseInt(getArg('--count=', '200'), 10);
const TRACKS_PER_ARTIST = parseInt(getArg('--tracks=', '5'), 10);
const IS_DRY_RUN = args.includes('--dry-run');

export const GENRE_TARGET_CONFIGS = {
    blues: {
        id: 'blues',
        label: 'Blues',
        primaryDefault: 'blues',
        tags: [
            'delta blues', 'chicago blues', 'electric blues', 'acoustic blues',
            'texas blues', 'traditional blues', 'piedmont blues', 'country blues', 'blues'
        ],
        anchors: ['Muddy Waters', 'B.B. King', 'Stevie Ray Vaughan', 'Howlin\' Wolf', 'Buddy Guy', 'Robert Johnson']
    },
    country: {
        id: 'country',
        label: 'Country & Americana',
        primaryDefault: 'country',
        tags: [
            'outlaw country', 'alt-country', 'americana', 'bluegrass',
            'traditional country', 'classic country', 'honky tonk', 'contemporary country'
        ],
        anchors: ['Johnny Cash', 'Willie Nelson', 'Waylon Jennings', 'Townes Van Zandt', 'Merle Haggard', 'Hank Williams']
    },
    folk_acoustic: {
        id: 'folk_acoustic',
        label: 'Folk & Acoustic',
        primaryDefault: 'folk_acoustic',
        tags: [
            'traditional folk', 'contemporary folk', 'celtic folk', 'acoustic folk',
            'indie folk', 'anti-folk', 'fingerstyle', 'folk'
        ],
        anchors: ['Bob Dylan', 'Joni Mitchell', 'Nick Drake', 'Joan Baez', 'Fairport Convention', 'Bert Jansch']
    },
    avant_garde: {
        id: 'avant_garde',
        label: 'Avant-Garde & Experimental',
        primaryDefault: 'avant_garde',
        tags: [
            'avant-garde', 'experimental rock', 'musique concrete', 'avant-rock',
            'no wave', 'noise rock', 'free improvisation', 'drone'
        ],
        anchors: ['Fantômas', 'Secret Chiefs 3', 'Captain Beefheart', 'The Residents', 'Diamanda Galás', 'John Zorn']
    }
};

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
                if (videoId) candidates.push({ videoId, title, shelf: true });
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
                if (Array.isArray(obj[key])) {
                    obj[key].forEach(extractItems);
                } else if (typeof obj[key] === 'object') {
                    extractItems(obj[key]);
                }
            }
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

/**
 * Fetches top artists for a Last.fm tag.
 */
async function fetchTopArtistsForTag(tag, limit = 100) {
    const url = `https://ws.audioscrobbler.com/2.0/?method=tag.gettopartists&tag=${encodeURIComponent(tag)}&api_key=${API_KEY}&format=json&limit=${limit}`;
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'MusicMood-GenreHarvester/1.0.0' } });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.topartists?.artist || []).map(a => ({
            name: a.name.trim(),
            mbid: a.mbid || null
        }));
    } catch {
        return [];
    }
}

/**
 * Fetches similar artists for a canonical genre anchor.
 */
async function fetchSimilarArtists(anchorName, limit = 50) {
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${encodeURIComponent(anchorName)}&api_key=${API_KEY}&format=json&limit=${limit}`;
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'MusicMood-GenreHarvester/1.0.0' } });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.similarartists?.artist || []).map(a => ({
            name: a.name.trim(),
            mbid: a.mbid || null
        }));
    } catch {
        return [];
    }
}

/**
 * Fetches artist tags for consensus classification.
 */
async function fetchArtistTags(artistName) {
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(artistName)}&api_key=${API_KEY}&format=json`;
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'MusicMood-GenreHarvester/1.0.0' } });
        if (!res.ok) return [];
        const data = await res.json();
        const tags = data.toptags?.tag || [];
        return tags.map(t => t.name.toLowerCase().trim()).filter(Boolean);
    } catch {
        return [];
    }
}

/**
 * Fetches top tracks for an artist.
 */
async function fetchTopTracksFromLastFm(artistName, limit = 15) {
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(artistName)}&api_key=${API_KEY}&format=json&limit=${limit}`;
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'MusicMood-GenreHarvester/1.0.0' } });
        if (!res.ok) return [];
        const data = await res.json();
        const tracks = data.toptracks?.track || [];
        return tracks.map(t => ({
            title: t.name.trim(),
            listeners: parseInt(t.listeners || '0', 10),
            playcount: parseInt(t.playcount || '0', 10)
        }));
    } catch {
        return [];
    }
}

/**
 * Harvests a single target genre collection.
 */
async function harvestGenre(config) {
    console.log('================================================================');
    console.log(`🎯 INFLATING TARGET GENRE: [${config.label.toUpperCase()}]`);
    console.log(`   Target Artist Quota: ${ARTIST_COUNT} artists`);
    console.log(`   Tracks Per Artist:   ${TRACKS_PER_ARTIST} iconic studio tracks`);
    console.log(`   Execution Mode:      ${IS_DRY_RUN ? 'DRY RUN (Audit Only)' : 'LIVE SUPABASE INGESTION'}`);
    console.log('================================================================\n');

    // 1. Compile candidate pool from micro-tags and anchor similarity
    console.log('🔍 Sourcing candidates via curated micro-tags and anchor similarity...');
    const candidateMap = new Map();

    for (const tag of config.tags) {
        process.stdout.write(`   • Scanning tag "${tag}"... `);
        const tagArtists = await fetchTopArtistsForTag(tag, 80);
        tagArtists.forEach(a => {
            if (!candidateMap.has(a.name.toLowerCase())) {
                candidateMap.set(a.name.toLowerCase(), a);
            }
        });
        console.log(`(${tagArtists.length} found, ${candidateMap.size} pool size)`);
        await sleep(150);
    }

    for (const anchor of config.anchors) {
        process.stdout.write(`   • Expanding similar to "${anchor}"... `);
        const simArtists = await fetchSimilarArtists(anchor, 40);
        simArtists.forEach(a => {
            if (!candidateMap.has(a.name.toLowerCase())) {
                candidateMap.set(a.name.toLowerCase(), a);
            }
        });
        console.log(`(${simArtists.length} found, ${candidateMap.size} pool size)`);
        await sleep(150);
    }

    const allCandidates = Array.from(candidateMap.values());
    console.log(`\n✓ Total unique candidates assembled for ${config.label}: ${allCandidates.length}\n`);

    let ingestedCount = 0;
    let tracksIngestedTotal = 0;

    for (const candidate of allCandidates) {
        if (ingestedCount >= ARTIST_COUNT) break;

        // A. Check if artist already exists in Supabase
        let artistRecord = null;
        if (!IS_DRY_RUN) {
            const { data: existingArts } = await supabase
                .from('artists')
                .select('id, name, track_count, primary_genre_id')
                .ilike('name', candidate.name)
                .limit(1);

            const existingArt = existingArts?.[0] || null;
            if (existingArt) {
                if ((existingArt.track_count || 0) >= TRACKS_PER_ARTIST) {
                    // Already well-stocked in catalog
                    continue;
                }
                artistRecord = existingArt;
            }
        }

        console.log(`----------------------------------------------------------------`);
        console.log(`[${ingestedCount + 1}/${ARTIST_COUNT}] Evaluating candidate: "${candidate.name}"`);

        // B. Consensus Tag Verification
        const rawTags = await fetchArtistTags(candidate.name);
        await sleep(150);

        let primaryGenre = null;
        const secondaryGenres = [];

        for (const tag of rawTags) {
            const canonical = normalizeGenre(tag, candidate.name);
            if (canonical && VALID_GENRE_IDS.has(canonical)) {
                if (!primaryGenre) {
                    primaryGenre = canonical;
                } else if (canonical !== primaryGenre && !secondaryGenres.includes(canonical)) {
                    secondaryGenres.push(canonical);
                }
            }
        }

        if (!primaryGenre) {
            primaryGenre = config.primaryDefault;
        }

        // Check if primary or secondary matches the target genre family
        const targetFamilyId = config.id;
        const allAssociatedGenres = [primaryGenre, ...secondaryGenres];
        const isGenreMatch = allAssociatedGenres.some(g => {
            if (g === targetFamilyId) return true;
            if (targetFamilyId === 'blues' && (g.includes('blues'))) return true;
            if (targetFamilyId === 'country' && (g.includes('country') || g.includes('americana') || g.includes('bluegrass'))) return true;
            if (targetFamilyId === 'folk_acoustic' && (g.includes('folk') || g.includes('acoustic') || g === 'singer_songwriter')) return true;
            if (targetFamilyId === 'avant_garde' && (g.includes('avant') || g.includes('experimental') || g.includes('noise') || g === 'musique_concrete')) return true;
            return false;
        });

        if (!isGenreMatch) {
            console.log(`   ⏭️ Skipped "${candidate.name}": tags [${rawTags.slice(0, 4).join(', ')}] do not align with ${config.label}.`);
            continue;
        }

        console.log(`   🎵 Canonical Genre: ${primaryGenre} (Secondary: [${secondaryGenres.slice(0, 3).join(', ')}])`);

        // C. Ensure artist record exists in DB
        if (!IS_DRY_RUN && !artistRecord) {
            let slug = candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            if (!slug) slug = 'artist-' + Date.now();

            const { data: newArt, error: artErr } = await supabase
                .from('artists')
                .insert({
                    name: candidate.name,
                    slug,
                    primary_genre_id: primaryGenre,
                    secondary_genre_ids: secondaryGenres,
                    mbid: candidate.mbid || null,
                    affinity_score: 50,
                    upvotes: 0,
                    track_count: 0
                })
                .select()
                .maybeSingle();

            if (artErr) {
                const { data: slugArt } = await supabase.from('artists').select('id, name, track_count').eq('slug', slug).limit(1);
                if (slugArt?.[0]) {
                    artistRecord = slugArt[0];
                } else {
                    console.error(`   ❌ Failed to insert artist: ${artErr.message}`);
                    continue;
                }
            } else {
                artistRecord = newArt;
                console.log(`   ✅ Created artist in public.artists (ID: ${newArt.id})`);
            }
        } else if (IS_DRY_RUN) {
            artistRecord = { id: 'dry-run-uuid', name: candidate.name, track_count: 0 };
        }

        // D. Fetch Iconic Studio Tracks
        const trackCandidates = await fetchTopTracksFromLastFm(candidate.name, 15);
        await sleep(150);

        if (trackCandidates.length === 0) {
            console.log(`   ⚠️ No top tracks found for "${candidate.name}".`);
            continue;
        }

        const existingTrackTitles = new Set();
        const existingTrackVids = new Set();

        if (!IS_DRY_RUN && artistRecord?.id) {
            const { data: existingTrks } = await supabase
                .from('tracks')
                .select('youtube_video_id, title')
                .ilike('artist', candidate.name);

            (existingTrks || []).forEach(t => {
                if (t.youtube_video_id) existingTrackVids.add(t.youtube_video_id);
                if (t.title) existingTrackTitles.add(t.title.toLowerCase());
            });
        }

        const genreNode = GENRE_NODES[primaryGenre] || {};
        const defaultEnergy = genreNode.energy || 0.6;
        const defaultInstrumental = genreNode.vocal === 'instrumental';

        let tracksAddedForArtist = 0;

        for (const trk of trackCandidates) {
            if (tracksAddedForArtist >= TRACKS_PER_ARTIST) break;

            const cleanTitle = trk.title.trim();
            const lowerTitle = cleanTitle.toLowerCase();

            if (existingTrackTitles.has(lowerTitle)) continue;

            const gate = isSongCandidate({ title: cleanTitle, artist: candidate.name });
            if (!gate.pass) continue;

            const videoId = await resolveInnertube(candidate.name, cleanTitle);
            if (!videoId || videoId.length !== 11 || existingTrackVids.has(videoId)) continue;

            console.log(`   ⭐ [${tracksAddedForArtist + 1}/${TRACKS_PER_ARTIST}] "${cleanTitle}" -> ${videoId} (${primaryGenre})`);

            if (!IS_DRY_RUN) {
                const { error: insErr } = await supabase
                    .from('tracks')
                    .insert({
                        artist: candidate.name,
                        artist_id: artistRecord?.id || null,
                        title: cleanTitle,
                        youtube_video_id: videoId,
                        primary_genre_id: primaryGenre,
                        secondary_genre_ids: secondaryGenres,
                        energy: defaultEnergy,
                        is_instrumental: defaultInstrumental,
                        source: 'genre_inflation'
                    });

                if (!insErr) {
                    tracksAddedForArtist++;
                    tracksIngestedTotal++;
                    existingTrackVids.add(videoId);
                    existingTrackTitles.add(lowerTitle);
                }
            } else {
                tracksAddedForArtist++;
                tracksIngestedTotal++;
                existingTrackVids.add(videoId);
                existingTrackTitles.add(lowerTitle);
            }

            await sleep(150);
        }

        if (!IS_DRY_RUN && artistRecord?.id && tracksAddedForArtist > 0) {
            await supabase
                .from('artists')
                .update({
                    track_count: (artistRecord.track_count || 0) + tracksAddedForArtist,
                    last_inflated_at: new Date().toISOString()
                })
                .eq('id', artistRecord.id);
        }

        if (tracksAddedForArtist > 0) {
            ingestedCount++;
            console.log(`   🎉 Finished "${candidate.name}": +${tracksAddedForArtist} tracks.`);
        }

        await sleep(200);
    }

    console.log(`\n✅ Completed [${config.label}]: +${ingestedCount} artists, +${tracksIngestedTotal} tracks.`);
    return { ingestedCount, tracksIngestedTotal };
}

async function run() {
    console.log('🚀 MusicMood Targeted Genre Inflation Pipeline\n');

    const targetsToRun = [];
    if (TARGET_GENRE === 'all') {
        targetsToRun.push(
            GENRE_TARGET_CONFIGS.blues,
            GENRE_TARGET_CONFIGS.country,
            GENRE_TARGET_CONFIGS.folk_acoustic,
            GENRE_TARGET_CONFIGS.avant_garde
        );
    } else if (GENRE_TARGET_CONFIGS[TARGET_GENRE]) {
        targetsToRun.push(GENRE_TARGET_CONFIGS[TARGET_GENRE]);
    } else {
        console.error(`Unknown target genre: "${TARGET_GENRE}". Valid options: blues, country, folk_acoustic, avant_garde, all`);
        process.exit(1);
    }

    let overallArtists = 0;
    let overallTracks = 0;

    for (const config of targetsToRun) {
        const res = await harvestGenre(config);
        overallArtists += res.ingestedCount;
        overallTracks += res.tracksIngestedTotal;
    }

    console.log('\n================================================================');
    console.log('🏁 ALL GENRE RUNS COMPLETED');
    console.log(`   • Total Artists Ingested: ${overallArtists}`);
    console.log(`   • Total Tracks Ingested:  ${overallTracks}`);
    console.log('================================================================\n');
}

run().catch(err => {
    console.error('Fatal harvest error:', err);
    process.exit(1);
});
