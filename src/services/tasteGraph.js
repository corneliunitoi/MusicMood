/**
 * tasteGraph.js
 * Comprehensive ontology of genres, subgenres, harmonic/aesthetic adjacency edges,
 * energy ratings, default vocal profiles, common dealbreaker categories,
 * and entropy/weight normalization utilities.
 */

export const GENRE_NODES = {
    // === ROCK & ALTERNATIVE ===
    'rock': { id: 'rock', label: 'Classic Rock', group: 'Rock', energy: 0.6, vocal: 'vocal', tags: ['guitar', 'organic', 'drums'] },
    'alt_rock': { id: 'alt_rock', label: 'Alternative Rock', group: 'Rock', energy: 0.65, vocal: 'vocal', tags: ['indie', '90s', 'guitar'] },
    'indie_rock': { id: 'indie_rock', label: 'Indie Rock', group: 'Rock', energy: 0.55, vocal: 'vocal', tags: ['indie', 'chill', 'melodic'] },
    'post_rock': { id: 'post_rock', label: 'Post-Rock', group: 'Rock', energy: 0.5, vocal: 'instrumental', tags: ['ambient', 'crescendo', 'cinematic'] },
    'math_rock': { id: 'math_rock', label: 'Math Rock', group: 'Rock', energy: 0.7, vocal: 'instrumental', tags: ['complex', 'tapping', 'prog'] },
    'prog_rock': { id: 'prog_rock', label: 'Prog Rock', group: 'Rock', energy: 0.7, vocal: 'vocal', tags: ['complex', 'conceptual', 'classic'] },
    'prog_metal': { id: 'prog_metal', label: 'Prog Metal', group: 'Rock', energy: 0.85, vocal: 'vocal', tags: ['heavy', 'technical', 'riffs'] },
    'metal': { id: 'metal', label: 'Heavy Metal', group: 'Rock', energy: 0.85, vocal: 'vocal', tags: ['distorted', 'heavy', 'fast'] },
    'death_metal': { id: 'death_metal', label: 'Death Metal / Harsh', group: 'Rock', energy: 0.95, vocal: 'harsh', tags: ['extreme', 'blastbeats'] },
    'post_hardcore': { id: 'post_hardcore', label: 'Post-Hardcore', group: 'Rock', energy: 0.8, vocal: 'vocal', tags: ['emotional', 'raw', 'energy'] },

    // === ELECTRONIC & DANCE ===
    'ambient_electronic': { id: 'ambient_electronic', label: 'Ambient Electronic', group: 'Electronic', energy: 0.25, vocal: 'instrumental', tags: ['soundscape', 'relax', 'deep'] },
    'synthwave': { id: 'synthwave', label: 'Synthwave / Retro', group: 'Electronic', energy: 0.65, vocal: 'instrumental', tags: ['80s', 'neon', 'arpeggio'] },
    'darksynth': { id: 'darksynth', label: 'Darksynth / Cyberpunk', group: 'Electronic', energy: 0.85, vocal: 'instrumental', tags: ['dark', 'cyberpunk', 'heavy bass'] },
    'house': { id: 'house', label: 'Deep / Melodic House', group: 'Electronic', energy: 0.6, vocal: 'any', tags: ['groove', '4x4', 'smooth'] },
    'techno': { id: 'techno', label: 'Minimal / Techno', group: 'Electronic', energy: 0.75, vocal: 'instrumental', tags: ['hypnotic', 'dark', 'repetitive'] },
    'drum_and_bass': { id: 'drum_and_bass', label: 'Drum & Bass / Liquid', group: 'Electronic', energy: 0.85, vocal: 'any', tags: ['fast', 'breakbeat', 'liquid'] },
    'idm': { id: 'idm', label: 'IDM / Glitch', group: 'Electronic', energy: 0.55, vocal: 'instrumental', tags: ['experimental', 'brain', 'intricate'] },
    'edm_mainstream': { id: 'edm_mainstream', label: 'Commercial EDM / Big Room', group: 'Electronic', energy: 0.9, vocal: 'vocal', tags: ['festival', 'drop', 'loud'] },

    // === CHILL, LO-FI & AMBIENT ===
    'lofi_hiphop': { id: 'lofi_hiphop', label: 'Lo-Fi Chill Beats', group: 'Chill', energy: 0.35, vocal: 'instrumental', tags: ['study', 'vinyl', 'cozy', 'dusty'] },
    'ambient': { id: 'ambient', label: 'Pure Ambient / Drone', group: 'Chill', energy: 0.15, vocal: 'instrumental', tags: ['meditation', 'sleep', 'pads'] },
    'acoustic_folk': { id: 'acoustic_folk', label: 'Acoustic / Indie Folk', group: 'Chill', energy: 0.4, vocal: 'vocal', tags: ['warm', 'organic', 'fingerstyle'] },

    // === CLASSICAL & INSTRUMENTAL ===
    'neo_classical': { id: 'neo_classical', label: 'Modern Classical / Neo-Classical', group: 'Classical', energy: 0.35, vocal: 'instrumental', tags: ['piano', 'strings', 'emotive'] },
    'cinematic_orchestral': { id: 'cinematic_orchestral', label: 'Cinematic Orchestral', group: 'Classical', energy: 0.7, vocal: 'instrumental', tags: ['epic', 'soundtrack', 'horns'] },
    'classical_traditional': { id: 'classical_traditional', label: 'Traditional Classical', group: 'Classical', energy: 0.45, vocal: 'instrumental', tags: ['baroque', 'romantic', 'symphony'] },

    // === JAZZ, SOUL & FUNK ===
    'smooth_jazz': { id: 'smooth_jazz', label: 'Smooth Jazz', group: 'Jazz', energy: 0.4, vocal: 'instrumental', tags: ['coffee', 'brass', 'mellow'] },
    'bebop_jazz': { id: 'bebop_jazz', label: 'Modal / Fusion Jazz', group: 'Jazz', energy: 0.65, vocal: 'instrumental', tags: ['virtuosic', 'complex', 'improv'] },
    'soul_funk': { id: 'soul_funk', label: 'Soul & Funk', group: 'Jazz', energy: 0.7, vocal: 'vocal', tags: ['groove', 'warm', 'bassline'] },

    // === HIP-HOP & URBAN ===
    'boom_bap': { id: 'boom_bap', label: '90s Hip-Hop / Boom Bap', group: 'Hip-Hop', energy: 0.6, vocal: 'vocal', tags: ['classic', 'sample', 'bars'] },
    'trap_modern': { id: 'trap_modern', label: 'Modern Trap / 808', group: 'Hip-Hop', energy: 0.75, vocal: 'vocal', tags: ['808', 'autotune', 'hihats'] },
    'rnb': { id: 'rnb', label: 'Contemporary R&B', group: 'Hip-Hop', energy: 0.5, vocal: 'vocal', tags: ['melodic', 'smooth', 'sensual'] },

    // === POP ===
    'indie_pop': { id: 'indie_pop', label: 'Indie Pop / Dream Pop', group: 'Pop', energy: 0.55, vocal: 'vocal', tags: ['catchy', 'ethereal', 'bright'] },
    'mainstream_pop': { id: 'mainstream_pop', label: 'Commercial Top 40 Pop', group: 'Pop', energy: 0.75, vocal: 'vocal', tags: ['radio', 'dance', 'hook'] },
};

/**
 * Adjacency Graph: Bidirectional harmonic / stylistic links.
 * Used by the state machine to transition smoothly between styles without abrupt dissonance.
 */
export const TASTE_GRAPH_EDGES = [
    // Rock / Metal cluster
    ['rock', 'alt_rock'],
    ['alt_rock', 'indie_rock'],
    ['alt_rock', 'post_hardcore'],
    ['alt_rock', 'prog_rock'],
    ['post_rock', 'math_rock'],
    ['post_rock', 'ambient_electronic'],
    ['math_rock', 'prog_rock'],
    ['prog_rock', 'prog_metal'],
    ['prog_metal', 'metal'],
    ['metal', 'death_metal'],
    ['prog_metal', 'math_rock'],

    // Classical bridges
    ['neo_classical', 'cinematic_orchestral'],
    ['neo_classical', 'post_rock'],
    ['neo_classical', 'ambient'],
    ['classical_traditional', 'neo_classical'],
    ['prog_metal', 'cinematic_orchestral'],

    // Electronic bridges
    ['ambient_electronic', 'ambient'],
    ['ambient_electronic', 'idm'],
    ['idm', 'synthwave'],
    ['synthwave', 'darksynth'],
    ['darksynth', 'prog_metal'], // Synthwave/Metal crossover
    ['house', 'techno'],
    ['techno', 'drum_and_bass'],
    ['drum_and_bass', 'idm'],
    ['house', 'edm_mainstream'],

    // Chill / Lofi bridges
    ['lofi_hiphop', 'boom_bap'],
    ['lofi_hiphop', 'ambient_electronic'],
    ['lofi_hiphop', 'smooth_jazz'],
    ['acoustic_folk', 'indie_rock'],
    ['acoustic_folk', 'neo_classical'],

    // Jazz & Soul bridges
    ['smooth_jazz', 'bebop_jazz'],
    ['bebop_jazz', 'math_rock'], // Jazz fusion to math rock
    ['smooth_jazz', 'soul_funk'],
    ['soul_funk', 'rnb'],
    ['rnb', 'indie_pop'],

    // Hip-hop bridges
    ['boom_bap', 'rnb'],
    ['boom_bap', 'trap_modern'],

    // Pop bridges
    ['indie_pop', 'synthwave'],
    ['indie_pop', 'indie_rock'],
    ['indie_pop', 'mainstream_pop'],
    ['mainstream_pop', 'edm_mainstream'],
];

/**
 * Common Dealbreaker options with human descriptions and strict negative query terms.
 */
export const DEALBREAKER_PRESETS = [
    {
        id: 'no_autotune_trap',
        label: 'Autotune / Mumble Trap',
        emoji: '🚫',
        excludeTerms: ['trap', 'mumble', 'autotune', 'type beat', 'drill', '808 drip'],
        excludeGenres: ['trap_modern']
    },
    {
        id: 'no_harsh_vocals',
        label: 'Harsh Screaming / Growls',
        emoji: '🔇',
        excludeTerms: ['screamo', 'deathcore', 'growl', 'brutal death', 'grindcore', 'harsh vocals'],
        excludeGenres: ['death_metal']
    },
    {
        id: 'no_commercial_edm',
        label: 'Commercial Festival EDM',
        emoji: '📉',
        excludeTerms: ['tomorrowland', 'festival drop', 'big room', 'slap house', 'spinnin records', 'marshmello'],
        excludeGenres: ['edm_mainstream']
    },
    {
        id: 'no_top40_pop',
        label: 'Commercial Top 40 / Radio Pop',
        emoji: '📻',
        excludeTerms: ['top 40', 'billboard hits', 'radio edit', 'tik tok viral', 'tiktok songs'],
        excludeGenres: ['mainstream_pop']
    },
    {
        id: 'no_country',
        label: 'Country / Bro-Country',
        emoji: '🤠',
        excludeTerms: ['country', 'nashville', 'honky tonk', 'americana radio'],
        excludeGenres: []
    },
    {
        id: 'no_lofi_white_noise',
        label: 'Generic Lo-Fi White Noise Loops',
        emoji: '💤',
        excludeTerms: ['study beats to sleep to 24/7', 'rain sounds 10 hours', 'white noise'],
        excludeGenres: []
    }
];

/**
 * Returns neighbor node IDs directly connected to the specified node ID.
 */
export function getConnectedGenres(nodeId) {
    const neighbors = new Set();
    TASTE_GRAPH_EDGES.forEach(([a, b]) => {
        if (a === nodeId) neighbors.add(b);
        if (b === nodeId) neighbors.add(a);
    });
    return Array.from(neighbors);
}

/**
 * Returns true if a candidate text or genre violates any active dealbreaker.
 */
export function violatesDealbreakers(text, candidateGenreId, activeDealbreakers = []) {
    const lowerText = (text || '').toLowerCase();

    for (const dbId of activeDealbreakers) {
        const preset = DEALBREAKER_PRESETS.find(p => p.id === dbId);
        if (!preset) continue;

        // Check if candidate genre matches the excluded genre list
        if (preset.excludeGenres.includes(candidateGenreId)) {
            return true;
        }

        // Check if string contains any forbidden query terms
        for (const term of preset.excludeTerms) {
            if (lowerText.includes(term.toLowerCase())) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Normalizes taste graph weights with an Entropy Floor and Hard Ceiling.
 * Prevents runaway reinforcement loops (the Matthew Effect) so no single genre
 * or artist can monopolize the session.
 */
export function normalizeWeights(weights, anchors = [], dealbreakers = []) {
    const clean = {};
    const MAX_SHARE = 0.25;  // No single genre can exceed 25% of the total probability mass
    const MIN_FLOOR = 0.05;  // Every allowed anchor retains at least 5% exploration mass

    // Ensure all anchors exist with at least minimum floor
    anchors.forEach(a => {
        if (!violatesDealbreakers(a, a, dealbreakers)) {
            clean[a] = Math.max(MIN_FLOOR, weights[a] || MIN_FLOOR);
        }
    });

    // Copy other existing weights if allowed
    Object.keys(weights).forEach(k => {
        if (!violatesDealbreakers(k, k, dealbreakers) && !clean[k]) {
            clean[k] = Math.max(MIN_FLOOR, weights[k]);
        }
    });

    // Sum
    let total = Object.values(clean).reduce((sum, v) => sum + v, 0);
    if (total === 0) return clean;

    // Apply Hard Ceiling & Normalization
    Object.keys(clean).forEach(k => {
        clean[k] = Math.min(MAX_SHARE, clean[k] / total);
    });

    // Re-normalize to exactly 1.0
    total = Object.values(clean).reduce((sum, v) => sum + v, 0);
    Object.keys(clean).forEach(k => {
        clean[k] = clean[k] / total;
    });

    return clean;
}
