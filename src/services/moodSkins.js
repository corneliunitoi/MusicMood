/**
 * moodSkins.js
 *
 * Mood skins: a subtle per-mood look (background tint, accent colour, faint moving scenery).
 * Layout, fonts and shapes never change. Only the moods in SKIN_MOODS own a skin; every other
 * mood keeps whatever look is showing. The listener can switch skins off or lock one look
 * (Settings › Look); that choice is stored in localStorage.
 */
import { resolveMoodId } from './tasteGraph.js';

export const SKINS = {
    classic:   { name: 'Classic',     c1: '#1e1b4b', c2: '#020617', accent: '#a855f7', accent2: '#6366f1', scenery: 'none' },
    happy:     { name: 'Golden Hour', c1: '#3a2814', c2: '#110c08', accent: '#ffb547', accent2: '#ff8a3d', scenery: 'motes' },
    sad:       { name: 'Blue Hour',   c1: '#1f2d42', c2: '#0a1019', accent: '#a3b9d6', accent2: '#6f8db5', scenery: 'mist' },
    chill:     { name: 'Tide',        c1: '#13312d', c2: '#08120f', accent: '#82d3bc', accent2: '#4fa89a', scenery: 'glow' },
    energetic: { name: 'Ember',       c1: '#3a1813', c2: '#130807', accent: '#ff7a55', accent2: '#ffa348', scenery: 'pulse' },
    focus:     { name: 'Ink',         c1: '#1b2030', c2: '#0a0c12', accent: '#afbeff', accent2: '#7c8fe0', scenery: 'none' },
    party:     { name: 'Afterglow',   c1: '#33123a', c2: '#110619', accent: '#ff66ae', accent2: '#b86bff', scenery: 'confetti' },
    rainy:     { name: 'Rain Glass',  c1: '#22344c', c2: '#0b121c', accent: '#c9a9a6', accent2: '#7e98ba', scenery: 'rain' },
    romantic:  { name: 'Velvet',      c1: '#3a1424', c2: '#14070d', accent: '#f2a0b5', accent2: '#c7546f', scenery: 'bokeh' },
    cyberpunk: { name: 'Neon Grid',   c1: '#1d0838', c2: '#0a0214', accent: '#ff2a6d', accent2: '#05d9e8', scenery: 'grid' },
};

/** Moods that own a skin (the six core moods plus three favourites). */
export const SKIN_MOODS = ['happy', 'sad', 'chill', 'energetic', 'focus', 'party', 'rainy', 'romantic', 'cyberpunk'];

export const DEFAULT_LOOK = { mode: 'auto', fixed: 'classic', off: [] };
const LOOK_KEY = 'musicMood_look';

/** Returns the mood id whose skin this mood uses, or null if the mood keeps the current look. */
export function skinMoodFor(moodId) {
    const id = resolveMoodId(moodId);
    return SKIN_MOODS.includes(id) ? id : null;
}

/**
 * Picks the skin to show.
 * @param {string|null} lastSkinMood the last picked mood that owns a skin
 * @param {{mode: string, fixed: string, off: string[]}} look the listener's Look setting
 */
export function resolveSkinId(lastSkinMood, look = DEFAULT_LOOK) {
    if (look.mode === 'fixed') return SKINS[look.fixed] ? look.fixed : 'classic';
    if (!lastSkinMood || !SKINS[lastSkinMood]) return 'classic';
    return look.off?.includes(lastSkinMood) ? 'classic' : lastSkinMood;
}

/** Cleans a stored or edited Look setting so bad values fall back to the defaults. */
export function normalizeLook(raw) {
    const look = raw && typeof raw === 'object' ? raw : {};
    return {
        mode: look.mode === 'fixed' ? 'fixed' : 'auto',
        fixed: SKINS[look.fixed] ? look.fixed : 'classic',
        off: Array.isArray(look.off) ? look.off.filter(id => SKIN_MOODS.includes(id)) : [],
    };
}

export function loadLook() {
    try {
        return normalizeLook(JSON.parse(localStorage.getItem(LOOK_KEY) || 'null'));
    } catch {
        return { ...DEFAULT_LOOK };
    }
}

export function saveLook(look) {
    try {
        localStorage.setItem(LOOK_KEY, JSON.stringify(normalizeLook(look)));
    } catch {
        /* storage unavailable: the setting lasts for this visit only */
    }
}
