/**
 * inflateRelatedArtists.js
 * 
 * Autonomous Related-Artist Discovery & Ingestion Pipeline.
 * 
 * 1. Queries the highest-upvoted and most-favorited anchor artists in MusicMood.
 * 2. Queries the official Last.fm AudioScrobbler API (artist.getsimilar) to find
 *    top-weighted companion artists.
 * 3. Identifies missing or under-represented companion bands.
 * 4. Resolves verified studio audio on YouTube Music (zero quota) and ingests their
 *    top iconic tracks into public.artists and public.tracks.
 * 
 * Usage:
 *   node scripts/inflateRelatedArtists.js
 *   node scripts/inflateRelatedArtists.js --anchors=3 --similar=3 --tracks=5
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { normalizeGenre, isSongCandidate, VALID_GENRE_IDS } from '../src/services/genreNormalizer.js';
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

const API_KEY = getArg('--key=', process.env.LASTFM_API_KEY || 'd11784f5f2ef96e01a656f80734244e8');
const LIMIT_ANCHORS = parseInt(getArg('--anchors=', '5'), 10);
const SIMILAR_PER_ANCHOR = parseInt(getArg('--similar=', '3'), 10);
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

async function fetchSimilarArtistsFromLastFm(artistName, limit = 5) {
    try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${encodeURIComponent(artistName)}&api_key=${API_KEY}&format=json&limit=${limit}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        const list = data.similarartists?.artist || [];
        const arr = Array.isArray(list) ? list : [list];
        return arr.map(a => ({
            name: a.name.trim(),
            match: parseFloat(a.match || '0'),
            mbid: a.mbid || null
        }));
    } catch (e) {
        return [];
    }
}

async function fetchArtistTags(artistName) {
    try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(artistName)}&api_key=${API_KEY}&format=json`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        const tags = data.toptags?.tag || [];
        return Array.isArray(tags) ? tags.map(t => t.name) : [];
    } catch (e) {
        return [];
    }
}

async function fetchTopTracksFromLastFm(artistName, limit = 15) {
    try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(artistName)}&api_key=${API_KEY}&format=json&limit=${limit}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        const tracks = data.toptracks?.track || [];
        const arr = Array.isArray(tracks) ? tracks : [tracks];
        return arr.map(t => ({
            title: t.name.trim(),
            artist: t.artist?.name || artistName
        }));
    } catch (e) {
        return [];
    }
}

async function runRelatedInflation() {
    console.log('================================================================');
    console.log('🌐 Related-Artist Discovery & Inflation Pipeline');
    console.log(`   Anchors:            Top ${LIMIT_ANCHORS} upvoted/favorited artists`);
    console.log(`   Similar per Anchor: Up to ${SIMILAR_PER_ANCHOR} companion bands`);
    console.log(`   Tracks per Artist:  ${TRACKS_PER_ARTIST} iconic songs`);
    console.log(`   Mode:               ${IS_DRY_RUN ? 'DRY RUN' : 'LIVE DB WRITES'}`);
    console.log('================================================================\n');

    // 1. Fetch top upvoted & affinity anchor artists
    const { data: anchors, error: ancErr } = await supabase
        .from('artists')
        .select('id, name, primary_genre_id, upvotes, affinity_score, track_count')
        .or('upvotes.gt.0,affinity_score.gt.0')
        .order('upvotes', { ascending: false })
        .order('affinity_score', { ascending: false })
        .limit(LIMIT_ANCHORS);

    if (ancErr || !anchors || anchors.length === 0) {
        console.log('No upvoted anchor artists found in catalog. Run with defaults or upvote some songs!');
        return;
    }

    console.log(`🎯 Identified ${anchors.length} top listener affinity anchors:\n`);
    anchors.forEach((a, i) => {
        console.log(`   ${i + 1}. ${a.name.padEnd(25, ' ')} | 👍 Upvotes: ${(a.upvotes || 0).toString().padStart(2, ' ')} | Affinity: ${(a.affinity_score || 0).toString().padStart(3, ' ')} pts | Genre: ${a.primary_genre_id}`);
    });
    console.log('\n----------------------------------------------------------------\n');

    let totalNewArtistsAdded = 0;
    let totalTracksAdded = 0;

    for (const anchor of anchors) {
        console.log(`================================================================`);
        console.log(`⚓ Discovering Companions for Anchor: "${anchor.name}" (${anchor.primary_genre_id})`);
        console.log(`================================================================`);

        const similarBands = await fetchSimilarArtistsFromLastFm(anchor.name, SIMILAR_PER_ANCHOR * 2);
        if (similarBands.length === 0) {
            console.log(`   ⏭️ No similar artists found for ${anchor.name}.`);
            await sleep(300);
            continue;
        }

        console.log(`   Last.fm Similar: [${similarBands.map(s => `${s.name} (${Math.round(s.match * 100)}%)`).join(', ')}]`);

        let ingestedForAnchor = 0;

        for (const band of similarBands) {
            if (ingestedForAnchor >= SIMILAR_PER_ANCHOR) break;

            // Check if band already exists in DB
            const { data: existingArt } = await supabase
                .from('artists')
                .select('id, name, track_count')
                .ilike('name', band.name)
                .maybeSingle();

            if (existingArt && (existingArt.track_count || 0) >= TRACKS_PER_ARTIST) {
                console.log(`   ⏭️ "${band.name}" already in catalog with ${existingArt.track_count} tracks. Skipping.`);
                continue;
            }

            console.log(`\n   ⭐ Ingesting Companion Band: "${band.name}" (Match: ${Math.round(band.match * 100)}%)`);

            // Classify genre
            const rawTags = await fetchArtistTags(band.name);
            let primaryGenre = null;
            const secondaryGenres = [];

            for (const tag of rawTags) {
                const canonical = normalizeGenre(tag, band.name);
                if (canonical && VALID_GENRE_IDS.has(canonical)) {
                    if (!primaryGenre) primaryGenre = canonical;
                    else if (canonical !== primaryGenre && !secondaryGenres.includes(canonical)) {
                        secondaryGenres.push(canonical);
                    }
                }
            }

            if (!primaryGenre) {
                primaryGenre = anchor.primary_genre_id || normalizeGenre('', band.name) || 'rock';
            }

            // Ensure artist record
            let artistId = existingArt?.id || null;
            if (!IS_DRY_RUN) {
                if (!existingArt) {
                    const slug = band.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                    const { data: newArt, error: newErr } = await supabase
                        .from('artists')
                        .insert({
                            name: band.name,
                            slug,
                            primary_genre_id: primaryGenre,
                            secondary_genre_ids: secondaryGenres,
                            mbid: band.mbid || null,
                            affinity_score: Math.round(band.match * 25),
                            upvotes: 0,
                            track_count: 0
                        })
                        .select()
                        .single();

                    if (newErr) {
                        console.warn(`      ❌ Error creating artist ${band.name}:`, newErr.message);
                        continue;
                    }
                    artistId = newArt.id;
                    totalNewArtistsAdded++;
                }
            }

            // Fetch top tracks
            const trackCandidates = await fetchTopTracksFromLastFm(band.name, 15);
            let addedForBand = 0;

            const existingTrackTitles = new Set();
            if (!IS_DRY_RUN && artistId) {
                const { data: exTrks } = await supabase
                    .from('tracks')
                    .select('title')
                    .ilike('artist', band.name);
                (exTrks || []).forEach(t => existingTrackTitles.add(t.title.toLowerCase()));
            }

            const genreNode = GENRE_NODES[primaryGenre] || {};
            const defaultEnergy = genreNode.energy || 0.7;
            const defaultInstrumental = genreNode.vocal === 'instrumental';

            for (const t of trackCandidates) {
                if (addedForBand >= TRACKS_PER_ARTIST) break;
                if (existingTrackTitles.has(t.title.toLowerCase())) continue;

                const gate = isSongCandidate({ title: t.title, artist: band.name });
                if (!gate.pass) continue;

                const videoId = await resolveInnertube(band.name, t.title);
                if (!videoId || videoId.length !== 11) continue;

                console.log(`      🎵 Track [${addedForBand + 1}/${TRACKS_PER_ARTIST}]: "${t.title}" -> ${videoId} (${primaryGenre})`);

                if (!IS_DRY_RUN) {
                    const { error: insErr } = await supabase
                        .from('tracks')
                        .insert({
                            artist: band.name,
                            artist_id: artistId,
                            title: t.title,
                            youtube_video_id: videoId,
                            primary_genre_id: primaryGenre,
                            secondary_genre_ids: secondaryGenres,
                            energy: defaultEnergy,
                            is_instrumental: defaultInstrumental,
                            source: 'related_artist_inflation'
                        });

                    if (!insErr) {
                        addedForBand++;
                        totalTracksAdded++;
                        existingTrackTitles.add(t.title.toLowerCase());
                    }
                } else {
                    addedForBand++;
                    totalTracksAdded++;
                }

                await sleep(350);
            }

            // Update artist track_count
            if (!IS_DRY_RUN && artistId && addedForBand > 0) {
                const oldCount = existingArt?.track_count || 0;
                await supabase
                    .from('artists')
                    .update({
                        track_count: oldCount + addedForBand,
                        last_inflated_at: new Date().toISOString()
                    })
                    .eq('id', artistId);
            }

            console.log(`   ✓ Ingested +${addedForBand} tracks for companion "${band.name}".`);
            ingestedForAnchor++;
            await sleep(400);
        }

        console.log(`\n✓ Finished anchor "${anchor.name}".`);
        await sleep(500);
    }

    console.log('\n================================================================');
    console.log('🏁 RELATED-ARTIST DISCOVERY PIPELINE COMPLETED');
    console.log(`   • Anchors Processed:       ${anchors.length}`);
    console.log(`   • New Companion Artists:   +${totalNewArtistsAdded}`);
    console.log(`   • Total New Tracks Added:  +${totalTracksAdded}`);
    console.log('================================================================\n');
}

runRelatedInflation().catch(err => {
    console.error('Fatal error in related artist inflation:', err);
    process.exit(1);
});
