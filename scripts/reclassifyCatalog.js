/**
 * scripts/reclassifyCatalog.js
 * 
 * High-Performance Autonomous Multi-Loop Catalog Disambiguation Engine for MusicMood.
 * 
 * Solves:
 * 1. Immediate resolution of all pending user flags in public.track_genre_flags.
 * 2. Purges toxic cross-genre secondary tags (e.g. 'rock' from jazz & classical, 'hip_hop' from Hans Zimmer).
 * 3. Reclassifies misclassified classical composers, Romanian folk/hip-hop, electronic icons, and classic rock.
 * 4. Disambiguates generic 'rock' and 'metal' into precise taxonomy (e.g. classic_rock, alt_rock, prog_metal, thrash_metal).
 * 5. Sweeps unverified artists against Apple iTunes Search API consensus with disk caching.
 * 6. Converges over multiple iterative loops until catalog stability is achieved.
 * 
 * Usage:
 *   node scripts/reclassifyCatalog.js --apply               # Run full pipeline with live updates
 *   node scripts/reclassifyCatalog.js                       # Dry-run audit mode
 *   node scripts/reclassifyCatalog.js --apply --loops=5     # Run up to 5 sweeps
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { normalizeGenre, ARTIST_CANONICAL_GENRES, VALID_GENRE_IDS } from '../src/services/genreNormalizer.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

// Parse CLI Flags
const rawArgs = process.argv.slice(2);
const isApply = rawArgs.includes('--apply');
const loopsArg = rawArgs.find(a => a.startsWith('--loops='));
const MAX_LOOPS = loopsArg ? parseInt(loopsArg.split('=')[1], 10) : 5;

// Disk Cache for iTunes Lookups
const CACHE_DIR = path.join(process.cwd(), 'scripts', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'artist_genre_cache.json');
const artistGenreCache = new Map();

try {
    if (fs.existsSync(CACHE_FILE)) {
        const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        for (const [k, v] of Object.entries(raw)) {
            artistGenreCache.set(k.toLowerCase().trim(), v);
        }
    }
} catch (e) {
    console.warn('⚠️ Could not load artist cache:', e.message);
}

function persistCacheToDisk() {
    try {
        if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
        const obj = {};
        for (const [k, v] of artistGenreCache.entries()) {
            obj[k] = v;
        }
        fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {
        console.warn('⚠️ Failed to persist cache:', e.message);
    }
}

// iTunes API Rate-Limited Query
async function queryITunesConsensus(artistName) {
    const cleanArtist = (artistName || '').trim().toLowerCase();
    if (!cleanArtist || cleanArtist === 'unknown artist' || /^[0-9]+$/.test(cleanArtist)) return null;

    if (artistGenreCache.has(cleanArtist)) {
        const cachedGenre = artistGenreCache.get(cleanArtist);
        return {
            source: 'cache',
            topGenre: normalizeGenre(cachedGenre, artistName),
            rawGenre: cachedGenre
        };
    }

    try {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=5`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'MusicMood-Disambiguator/1.0.0 (admin@musicmood.local)' }
        });
        if (!res.ok) return null;

        const data = await res.json();
        if (!data.results || data.results.length === 0) return null;

        const genreCounts = {};
        for (const item of data.results) {
            const raw = item.primaryGenreName;
            if (!raw) continue;
            const norm = normalizeGenre(raw, item.artistName, item.trackName);
            if (norm) {
                genreCounts[norm] = (genreCounts[norm] || 0) + 1;
            }
        }

        let topGenre = null;
        let maxVotes = 0;
        for (const [g, count] of Object.entries(genreCounts)) {
            if (count > maxVotes || (count === maxVotes && !['rock', 'pop'].includes(g))) {
                maxVotes = count;
                topGenre = g;
            }
        }

        if (topGenre) {
            const rawTop = data.results[0]?.primaryGenreName || topGenre;
            artistGenreCache.set(cleanArtist, rawTop);
            return {
                source: 'itunes',
                topGenre,
                rawGenre: rawTop,
                votes: maxVotes,
                total: data.results.length
            };
        }
    } catch (e) {
        // Network timeout / skip safely
    }

    return null;
}

// Additional specific artists to disambiguate
const EXTENDED_ARTIST_MAP = {
    'heart': 'classic_rock',
    'santana': 'classic_rock',
    'red hot chili peppers': 'alt_rock',
    'anouk': 'alt_rock',
    'ensemble matheus & spinosi, jean-christophe': 'classical',
    'andres ségovia': 'classical',
    'rhys chatham': 'post_rock',
    'crunch': 'idm',
    'dead letter circus': 'alt_rock',
    'verve': 'alt_rock',
    'the verve': 'alt_rock',
    'billy idol': 'classic_rock',
    'casualties of cool': 'americana',
    'les fragments de la nuit': 'neo_classical',
    'lhasa': 'singer_songwriter',
    'lhasa de sela': 'singer_songwriter',
    'tacoma narrows bridge disaster': 'post_rock',
    'paul taylor': 'smooth_jazz',
    'stolas': 'post_rock',
    'enochian theory': 'prog_rock',
    'giant squid': 'post_rock',
    'upp - jeff beck band': 'jazz_fusion',
    'there\'s a light': 'post_rock',
    'existem': 'prog_metal',
    'vaura': 'avant_garde',
    'the fantômas melvins big band': 'avant_garde',
    'battle beast': 'heavy_metal',
    'powerwolf': 'heavy_metal',
    'motörhead': 'heavy_metal',
    'sabaton': 'heavy_metal',
    'led zeppelin': 'classic_rock',
    'kiss': 'classic_rock',
    'rush': 'prog_rock',
    'metallica': 'thrash_metal',
    'iron maiden': 'heavy_metal',
    'dream theater': 'prog_metal'
};

// Toxic secondary tags map
const TOXIC_TAGS_MAP = {
    classical_family: new Set(['rock', 'hip_hop', 'boom_bap', 'heavy_metal', 'metal', 'hard_rock', 'punk_rock', 'pop']),
    jazz_pure: new Set(['rock', 'pop', 'punk_rock', 'heavy_metal']),
    cinematic: new Set(['hip_hop', 'boom_bap', 'rock', 'metal']),
    blues_pure: new Set(['rock', 'pop'])
};

const CLASSICAL_GENRES = new Set(['classical', 'baroque', 'romantic', 'classical_period', 'chamber_music', 'opera', 'neo_classical']);
const PURE_JAZZ_GENRES = new Set(['jazz', 'cool_jazz', 'bebop_jazz', 'modal_jazz', 'big_band']);
const PURE_BLUES_GENRES = new Set(['blues', 'chicago_blues', 'delta_blues', 'electric_blues', 'soul_blues']);

function sanitizeSecondaryTags(primaryGenre, secondaryTags = []) {
    if (!Array.isArray(secondaryTags) || secondaryTags.length === 0) return [];
    let toxicSet = null;
    if (CLASSICAL_GENRES.has(primaryGenre)) toxicSet = TOXIC_TAGS_MAP.classical_family;
    else if (primaryGenre === 'cinematic_orchestral') toxicSet = TOXIC_TAGS_MAP.cinematic;
    else if (PURE_JAZZ_GENRES.has(primaryGenre)) toxicSet = TOXIC_TAGS_MAP.jazz_pure;
    else if (PURE_BLUES_GENRES.has(primaryGenre)) toxicSet = TOXIC_TAGS_MAP.blues_pure;

    const cleaned = secondaryTags.filter(tag => {
        if (!tag || tag === primaryGenre) return false;
        if (toxicSet && toxicSet.has(tag)) return false;
        return VALID_GENRE_IDS.has(tag);
    });
    return Array.from(new Set(cleaned));
}

// ============================================================================
// PHASE 1: Resolve User Flags & Clean Up Staging Table
// ============================================================================
async function resolveFlags() {
    console.log("\n=======================================================");
    console.log("🚩 PHASE 1: Synchronizing & Purging Flagged Misclassifications");
    console.log("=======================================================");

    // 1. Purge any historical flags already marked 'resolved'
    if (isApply) {
        const { data: purgedOld } = await supabase
            .from('track_genre_flags')
            .delete()
            .eq('status', 'resolved')
            .select('id');
        if (purgedOld && purgedOld.length > 0) {
            console.log(`🧹 Cleaned up ${purgedOld.length} historical resolved flag(s) from database.`);
        }
    }

    const { data: pendingFlags, error } = await supabase
        .from('track_genre_flags')
        .select('*, tracks(*)')
        .eq('status', 'pending');

    if (error || !pendingFlags || pendingFlags.length === 0) {
        console.log("✨ All user flags are already resolved! No pending flags.");
        return 0;
    }

    console.log(`📋 Found ${pendingFlags.length} pending flag(s). Resolving & removing...`);
    let count = 0;
    for (const flag of pendingFlags) {
        const track = flag.tracks;
        if (!track) {
            // Delete orphan flag if track no longer exists
            if (isApply) await supabase.from('track_genre_flags').delete().eq('id', flag.id);
            continue;
        }

        let resolved = normalizeGenre(track.primary_genre_id, track.artist, track.title);
        if (flag.suggested_genre_id && VALID_GENRE_IDS.has(flag.suggested_genre_id)) {
            resolved = flag.suggested_genre_id;
        }

        console.log(`   🩹 Healing: "${track.title}" by ${track.artist} -> [${resolved}]`);

        if (isApply) {
            // Update track with verified canonical genre and sanitized secondary tags
            await supabase.from('tracks').update({
                primary_genre_id: resolved,
                secondary_genre_ids: sanitizeSecondaryTags(resolved, track.secondary_genre_ids),
                updated_at: new Date().toISOString()
            }).eq('id', track.id);

            // Remove the flag row from staging table after fixing
            await supabase.from('track_genre_flags').delete().eq('id', flag.id);
        }
        count++;
    }
    console.log(`✅ Phase 1 complete: ${count} flag(s) healed and removed from database.`);
    return count;
}

// ============================================================================
// PHASE 2: Fast Batch Secondary Tag Sanitization
// ============================================================================
async function pruneSecondaryTags() {
    console.log("=======================================================");
    console.log("🧹 PHASE 2: Pruning Toxic Secondary Tags");
    console.log("=======================================================");

    const queries = [
        { label: 'Classical cross-contamination', genres: Array.from(CLASSICAL_GENRES), toxic: ['rock', 'hip_hop', 'pop', 'boom_bap', 'heavy_metal'] },
        { label: 'Pure Jazz cross-contamination', genres: Array.from(PURE_JAZZ_GENRES), toxic: ['rock', 'pop'] },
        { label: 'Cinematic Orchestral leakage', genres: ['cinematic_orchestral'], toxic: ['hip_hop', 'boom_bap', 'rock'] },
        { label: 'Pure Blues leakage', genres: Array.from(PURE_BLUES_GENRES), toxic: ['rock', 'pop'] }
    ];

    let totalPruned = 0;
    for (const q of queries) {
        const { data: polluted } = await supabase
            .from('tracks')
            .select('id, primary_genre_id, secondary_genre_ids')
            .in('primary_genre_id', q.genres)
            .overlaps('secondary_genre_ids', q.toxic)
            .limit(500);

        if (polluted && polluted.length > 0) {
            console.log(`   Pruning ${polluted.length} tracks for: ${q.label}`);
            if (isApply) {
                for (const t of polluted) {
                    const cleaned = sanitizeSecondaryTags(t.primary_genre_id, t.secondary_genre_ids);
                    await supabase.from('tracks').update({ secondary_genre_ids: cleaned }).eq('id', t.id);
                }
            }
            totalPruned += polluted.length;
        }
    }

    console.log(`✅ Phase 2 complete: ${totalPruned} tracks cleaned.\n`);
    return totalPruned;
}

// ============================================================================
// PHASE 3: Deterministic Canonical & Heuristic Batch Updates
// ============================================================================
async function healCanonicalArtists() {
    console.log("=======================================================");
    console.log("⚡ PHASE 3: Fast Canonical Artist Disambiguation");
    console.log("=======================================================");

    // Fetch distinct artists in 'rock' or 'metal'
    const { data: rockTracks, error } = await supabase
        .from('tracks')
        .select('artist')
        .in('primary_genre_id', ['rock', 'metal']);

    if (error || !rockTracks) {
        console.error("❌ Failed to query rock/metal artists:", error?.message);
        return 0;
    }

    const uniqueArtists = Array.from(new Set(rockTracks.map(t => (t.artist || '').trim()).filter(Boolean)));
    console.log(`🔍 Checking ${uniqueArtists.length} distinct artists in 'rock'/'metal'...`);

    let totalTracksUpdated = 0;
    let artistsMatched = 0;

    for (const artist of uniqueArtists) {
        const aLower = artist.toLowerCase();
        let targetGenre = EXTENDED_ARTIST_MAP[aLower] || ARTIST_CANONICAL_GENRES[aLower];

        // Accent insensitive check
        if (!targetGenre) {
            const normalizedA = aLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            targetGenre = EXTENDED_ARTIST_MAP[normalizedA] || ARTIST_CANONICAL_GENRES[normalizedA];
        }

        if (targetGenre && targetGenre !== 'rock' && targetGenre !== 'metal') {
            console.log(`   🎯 Match: "${artist}" -> [${targetGenre}]`);

            if (isApply) {
                const { data: updated, error: uErr } = await supabase
                    .from('tracks')
                    .update({
                        primary_genre_id: targetGenre,
                        updated_at: new Date().toISOString()
                    })
                    .eq('artist', artist)
                    .in('primary_genre_id', ['rock', 'metal'])
                    .select('id');

                if (!uErr && updated) {
                    totalTracksUpdated += updated.length;
                }
            } else {
                totalTracksUpdated += 1;
            }
            artistsMatched++;
        }
    }

    console.log(`✅ Phase 3 complete: ${artistsMatched} artist(s) matched, ${totalTracksUpdated} track(s) updated.\n`);
    return totalTracksUpdated;
}

// ============================================================================
// PHASE 4: Apple iTunes API Batch Consensus Sweep
// ============================================================================
async function sweepITunes(limitArtists = 40) {
    console.log("=======================================================");
    console.log(`🍏 PHASE 4: Apple iTunes API Consensus Sweep (Top ${limitArtists} artists)`);
    console.log("=======================================================");

    // Fetch artists in rock/metal sorted by track count
    const { data: rockTracks, error } = await supabase
        .from('tracks')
        .select('artist')
        .in('primary_genre_id', ['rock', 'metal']);

    if (error || !rockTracks) return 0;

    const counts = {};
    for (const t of rockTracks) {
        const a = (t.artist || '').trim();
        if (a && a.length > 2 && !/^[0-9]+$/.test(a)) {
            counts[a] = (counts[a] || 0) + 1;
        }
    }

    const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limitArtists);

    let artistsUpdated = 0;
    let tracksUpdated = 0;

    for (const [artist, count] of sorted) {
        const result = await queryITunesConsensus(artist);
        if (!result || !result.topGenre) continue;

        const resolved = result.topGenre;
        if (resolved !== 'rock' && resolved !== 'metal') {
            console.log(`🍏 Disambiguated: "${artist}" (${count} tracks) -> [${resolved}] (from "${result.rawGenre}", src: ${result.source})`);

            if (isApply) {
                const { data: updated, error: uErr } = await supabase
                    .from('tracks')
                    .update({
                        primary_genre_id: resolved,
                        updated_at: new Date().toISOString()
                    })
                    .eq('artist', artist)
                    .in('primary_genre_id', ['rock', 'metal'])
                    .select('id');

                if (!uErr && updated) {
                    tracksUpdated += updated.length;
                    artistsUpdated++;
                }
            } else {
                tracksUpdated += count;
                artistsUpdated++;
            }
        }
        await new Promise(r => setTimeout(r, 150));
    }

    persistCacheToDisk();
    console.log(`✅ Phase 4 complete: Disambiguated ${artistsUpdated} artist(s), ${tracksUpdated} track(s).\n`);
    return tracksUpdated;
}

// ============================================================================
// PHASE 5: Sync public.artists Table with Track Consensus
// ============================================================================
async function syncArtistGenres() {
    console.log("\n=======================================================");
    console.log("PHASE 5: Synchronizing public.artists with Track Consensus");
    console.log("=======================================================");

    const { data: artists, error } = await supabase
        .from('artists')
        .select('id, name, primary_genre_id, track_count')
        .gt('track_count', 0)
        .order('track_count', { ascending: false })
        .limit(300);

    if (error || !artists) {
        console.warn("⚠️ Could not fetch artists for sync:", error?.message);
        return 0;
    }

    let updated = 0;
    const batchSize = 10;
    for (let i = 0; i < artists.length; i += batchSize) {
        const chunk = artists.slice(i, i + batchSize);
        await Promise.all(chunk.map(async (a) => {
            try {
                const { data: tracks } = await supabase
                    .from('tracks')
                    .select('primary_genre_id')
                    .ilike('artist', a.name)
                    .limit(100);

                if (!tracks || tracks.length === 0) return;

                const counts = {};
                for (const t of tracks) {
                    if (t.primary_genre_id) counts[t.primary_genre_id] = (counts[t.primary_genre_id] || 0) + 1;
                }
                const sorted = Object.entries(counts).sort((x, y) => y[1] - x[1]);
                const dominant = sorted[0]?.[0];
                const dominantCount = sorted[0]?.[1] || 0;
                const dominantPct = dominantCount / tracks.length;

                if (dominant && dominant !== a.primary_genre_id && (dominantPct >= 0.6 || a.primary_genre_id === 'rock' || a.primary_genre_id === 'hip_hop')) {
                    console.log(`🔄 Sync Artist: "${a.name}" [${a.primary_genre_id}] -> [${dominant}] (${Math.round(dominantPct * 100)}%)`);
                    if (isApply) {
                        await supabase
                            .from('artists')
                            .update({ primary_genre_id: dominant, updated_at: new Date().toISOString() })
                            .eq('id', a.id);
                    }
                    updated++;
                }
            } catch (e) { }
        }));
    }

    console.log(`✅ Phase 5 complete: Synced ${updated} artist(s).\n`);
    return updated;
}

// ============================================================================
// MAIN RUNNER
// ============================================================================
async function main() {
    console.log("=================================================================");
    console.log("🎶 MusicMood Autonomous Catalog Disambiguation Pipeline");
    console.log(`   Mode       : ${isApply ? '🚀 APPLY CHANGES (Live Update)' : '🔍 DRY RUN (Audit Only)'}`);
    console.log(`   Max Loops  : ${MAX_LOOPS}`);
    console.log("=================================================================\n");

    const start = Date.now();

    // Priority Phase 1 & 2
    await resolveFlags();
    await pruneSecondaryTags();

    // Multi-loop sweeps
    for (let loop = 1; loop <= MAX_LOOPS; loop++) {
        console.log(`\n--- Loop ${loop}/${MAX_LOOPS} ---`);
        const cHealed = await healCanonicalArtists();
        const iHealed = await sweepITunes(30);

        if (cHealed === 0 && iHealed === 0) {
            console.log("🎉 Reclassification converged! No further updates needed in this cycle.");
            break;
        }
    }

    // Phase 5: Keep public.artists aligned with track consensus
    await syncArtistGenres();

    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log("\n=================================================================");
    console.log(`✨ Catalog Disambiguation Completed in ${elapsed}s`);
    console.log("=================================================================\n");
}

main().catch(err => {
    console.error("💥 Pipeline Error:", err);
    process.exit(1);
});
