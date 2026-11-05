/**
 * libraryProfiler.js
 * 
 * Analyzes the user's 44,885 personal track archive in public.local_metadata
 * and automatically calibrates their musical DNA (Anchors, Weights, and Dealbreakers)
 * using the canonical 115-genre taxonomy.
 */

import { supabase } from './supabaseService.js';
import { normalizeGenre, VALID_GENRE_IDS } from './genreNormalizer.js';
import { sessionEngine } from './sessionStateMachine.js';
import { syncCalibrationToSupabase } from './supabaseService.js';

export async function profileLibraryTaste() {
    // 1. Fetch library aggregation from Supabase RPC
    const { data, error } = await supabase.rpc('get_library_taste_summary');
    if (error) {
        console.error('[LibraryProfiler] Error fetching taste summary:', error);
        throw error;
    }

    const { total_tracks, top_genres, top_artists } = data || {};
    if (!top_genres || top_genres.length === 0) {
        throw new Error('No local metadata records found to calibrate taste.');
    }

    // 2. Normalize and aggregate raw genres into the canonical 115 taxonomy
    const canonicalCounts = {};
    for (const id of VALID_GENRE_IDS) {
        canonicalCounts[id] = 0;
    }

    top_genres.forEach(({ genre, count }) => {
        const canonicalId = normalizeGenre(genre);
        if (canonicalCounts[canonicalId] !== undefined) {
            canonicalCounts[canonicalId] += Number(count || 0);
        } else {
            canonicalCounts['rock'] += Number(count || 0);
        }
    });

    // Also enrich from top artists (Tier 1 canonical knowledge)
    (top_artists || []).forEach(({ artist, count }) => {
        const canonicalFromArtist = normalizeGenre('', artist);
        if (canonicalFromArtist && canonicalCounts[canonicalFromArtist] !== undefined) {
            // Give weighted boost to artist-anchored genres
            canonicalCounts[canonicalFromArtist] += Math.floor(Number(count || 0) * 0.5);
        }
    });

    // 3. Sort canonical genres by frequency
    const sortedGenres = Object.entries(canonicalCounts)
        .sort(([, a], [, b]) => b - a)
        .filter(([, count]) => count > 0);

    // 4. Derive Top 4 Anchors (excluding generic parent if subgenre is dominant)
    const topAnchors = [];
    for (const [genreId] of sortedGenres) {
        if (topAnchors.length >= 4) break;
        // Avoid adding both 'rock' and 'prog_rock' if prog_rock is already an anchor
        if (genreId === 'rock' && topAnchors.some(a => a.includes('rock'))) continue;
        topAnchors.push(genreId);
    }

    // Default safety if library is somehow sparse
    if (topAnchors.length === 0) {
        topAnchors.push('prog_rock', 'hard_rock', 'classical', 'avant_garde');
    }

    // 5. Derive Candidate Dealbreakers (subgenres with exactly 0 tracks)
    const zeroCountGenres = Object.entries(canonicalCounts)
        .filter(([, count]) => count === 0)
        .map(([id]) => id);

    // Pick common modern nuisance genres if user has 0 of them
    const suggestedDealbreakers = [];
    const nuisanceCandidates = ['trap_modern', 'uk_drill', 'edm_mainstream', 'mainstream_pop', 'contemporary_country'];
    nuisanceCandidates.forEach(cand => {
        if (zeroCountGenres.includes(cand)) {
            suggestedDealbreakers.push(cand);
        }
    });

    // 6. Compute Normalized Weights (0.05 to 1.0)
    const maxCount = sortedGenres[0]?.[1] || 1;
    const weights = {};
    for (const id of VALID_GENRE_IDS) {
        const c = canonicalCounts[id] || 0;
        if (topAnchors.includes(id)) {
            weights[id] = 1.0;
        } else if (c > 0) {
            weights[id] = Math.min(1.0, Math.max(0.1, Number((c / maxCount).toFixed(2))));
        } else {
            weights[id] = 0.05;
        }
    }

    const calibration = {
        anchors: topAnchors,
        dealbreakers: suggestedDealbreakers,
        discoveryLevel: 0.40, // Lean towards user's personal tastes
        weights,
        blockAiGenerated: true,
        stats: {
            totalTracks: total_tracks,
            topAnchors,
            topArtists: (top_artists || []).slice(0, 10).map(a => a.artist),
            distribution: sortedGenres.slice(0, 10).map(([id, cnt]) => ({ id, count: cnt }))
        }
    };

    return calibration;
}

/**
 * Executes full calibration and applies it to the active session and database
 */
export async function applyLibraryTasteCalibration() {
    const calibration = await profileLibraryTaste();
    
    // Save to local state machine
    sessionEngine.saveCalibration(calibration);

    // Sync to Supabase
    try {
        await syncCalibrationToSupabase(calibration);
    } catch (e) {
        console.warn('[LibraryProfiler] Non-fatal Supabase sync warning:', e);
    }

    return calibration;
}
