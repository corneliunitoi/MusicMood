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

/**
 * Rich themes: bolder, opt-in looks (own fonts, big scenery such as a moon or a neon sun).
 * Designed in docs/rich-themes-reference.html. The three light designs (Poster Pop, Still Water,
 * Meadow) use a deep-toned version so every panel in the app stays readable.
 * Ids start with "rich_" so older app versions, which only know the basic skins, fall back to Classic.
 */
export const RICH_SKINS = {
    rich_poster:   { name: 'Poster Pop',  c1: '#2b1f3d', c2: '#150f1d', accent: '#ffc93c', accent2: '#ff6b4a', scenery: 'poster',   display: "'Archivo Black', 'Arial Black', sans-serif", upper: true },
    rich_calm:     { name: 'Still Water', c1: '#1f4a46', c2: '#0c1f1e', accent: '#a8c3a0', accent2: '#7fb5a8', scenery: 'ripples',  display: "'Quicksand', 'Nunito', sans-serif", lower: true },
    rich_rain:     { name: 'Rain Glass',  c1: '#3d5a80', c2: '#17222f', accent: '#c9a9a6', accent2: '#7e98ba', scenery: 'richrain', display: "'Special Elite', 'Courier New', monospace" },
    rich_night:    { name: 'Night Sky',   c1: '#1f2a4a', c2: '#080e20', accent: '#b8a1d9', accent2: '#f1e9da', scenery: 'moon',     display: "'Outfit', sans-serif", upper: true },
    rich_academia: { name: 'Old Library', c1: '#3e2a1f', c2: '#150b08', accent: '#b08d57', accent2: '#9c2f31', scenery: 'candle',   display: "'Cormorant Garamond', Georgia, serif", italic: true },
    rich_meadow:   { name: 'Meadow',      c1: '#34452a', c2: '#141b10', accent: '#9dbe7c', accent2: '#c97b5a', scenery: 'petals',   display: "'Caveat', cursive" },
    rich_neon:     { name: 'Neon Grid',   c1: '#2a0a45', c2: '#0d0221', accent: '#ff2a6d', accent2: '#05d9e8', scenery: 'neonsun',  display: "'Orbitron', sans-serif", upper: true },
    rich_noir:     { name: 'Noir',        c1: '#2d2d2d', c2: '#0c0c0c', accent: '#d62839', accent2: '#bdbdbd', scenery: 'spotlight', display: "'Bodoni Moda', 'Didot', serif", italic: true },
};
export const RICH_SKIN_IDS = Object.keys(RICH_SKINS);

/** Every skin the backdrop can draw. */
export const ALL_SKINS = { ...SKINS, ...RICH_SKINS };

/** Which rich theme each mood uses (from the original rich design). */
export const RICH_MOOD_MAP = {
    happy: 'rich_poster', energetic: 'rich_poster', party: 'rich_poster', driving: 'rich_poster', morning: 'rich_poster',
    chill: 'rich_calm', focus: 'rich_calm', sleep: 'rich_calm',
    sad: 'rich_rain', rainy: 'rich_rain', nostalgic: 'rich_rain',
    late_night: 'rich_night', romantic: 'rich_night', dreamy: 'rich_night',
    dark_academia: 'rich_academia',
    cottagecore: 'rich_meadow', cinematic_fantasy: 'rich_meadow',
    cyberpunk: 'rich_neon', cinematic_scifi: 'rich_neon',
    dark_intense: 'rich_noir', cinematic_epic: 'rich_noir', cinematic_mystery: 'rich_noir',
};

/** Returns the rich theme for a mood, or null if the mood has none. */
export function richSkinFor(moodId) {
    return RICH_MOOD_MAP[resolveMoodId(moodId)] || null;
}

/** Moods that own a skin (the six core moods plus three favourites). */
export const SKIN_MOODS = ['happy', 'sad', 'chill', 'energetic', 'focus', 'party', 'rainy', 'romantic', 'cyberpunk'];

export const DEFAULT_LOOK = { mode: 'auto', fixed: 'classic', off: [], rich: false };
const LOOK_KEY = 'musicMood_look';

/** Returns the mood id whose skin this mood uses, or null if the mood keeps the current look. */
export function skinMoodFor(moodId) {
    const id = resolveMoodId(moodId);
    return SKIN_MOODS.includes(id) ? id : null;
}

/**
 * Picks the skin to show.
 * @param {string|null} lastSkinMood the last picked mood that owns a basic skin
 * @param {{mode: string, fixed: string, off: string[], rich?: boolean}} look the listener's Look setting
 * @param {string|null} lastRichSkin the rich theme of the last picked mood that has one
 */
export function resolveSkinId(lastSkinMood, look = DEFAULT_LOOK, lastRichSkin = null) {
    if (look.mode === 'fixed') return ALL_SKINS[look.fixed] ? look.fixed : 'classic';
    if (look.rich) {
        if (!lastRichSkin || !RICH_SKINS[lastRichSkin] || look.off?.includes(lastRichSkin)) return 'classic';
        return lastRichSkin;
    }
    if (!lastSkinMood || !SKINS[lastSkinMood]) return 'classic';
    return look.off?.includes(lastSkinMood) ? 'classic' : lastSkinMood;
}

/**
 * Cleans a stored or edited Look setting so bad values fall back to the defaults.
 * The profile copy has the same four-field shape older app versions saved: rich themes ride along as
 * "rich_..." ids in "fixed" and "off", and a "rich" entry in "off" means "rich themes on". Old app
 * versions ignore those entries and show the basic looks, so nothing breaks.
 */
export function normalizeLook(raw) {
    const look = raw && typeof raw === 'object' ? raw : {};
    const off = Array.isArray(look.off) ? look.off : [];
    return {
        mode: look.mode === 'fixed' ? 'fixed' : 'auto',
        fixed: ALL_SKINS[look.fixed] ? look.fixed : 'classic',
        off: off.filter(id => SKIN_MOODS.includes(id) || RICH_SKINS[id]),
        rich: look.rich === true || off.includes('rich'),
    };
}

/** The shape saved to the profile (see normalizeLook): the same fields as before, rich flag inside "off". */
export function toStoredLook(look) {
    const clean = normalizeLook(look);
    return { mode: clean.mode, fixed: clean.fixed, off: clean.rich ? [...clean.off, 'rich'] : clean.off };
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
