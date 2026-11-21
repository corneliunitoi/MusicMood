import { supabase, syncCalibrationToSupabase, setActiveUserId } from './supabaseService.js';
import { loadCloudFavorites, switchUserFavorites } from './favoritesService.js';
import { sessionEngine } from './sessionStateMachine.js';

/**
 * User profile for the signed-in Supabase user (Google or anonymous guest).
 *
 * Identity and roles come only from the database (public.get_my_profile, keyed by
 * auth.uid()). The localStorage copy is a display cache: it never grants access,
 * because every privileged action is checked server-side.
 */

const USER_STORAGE_KEY = 'musicmood_user_profile';
const USER_EVENT_NAME = 'musicmood:user_updated';

// Keys from the pre-Supabase-Auth identity system, removed on first load
const LEGACY_KEYS = ['musicmood_real_user_profile', 'musicmood_persona_override', 'youtube_access_token', 'musicmood_guest_device_id'];

let cachedProfile = null;

try {
    LEGACY_KEYS.forEach(k => localStorage.removeItem(k));
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (raw) cachedProfile = JSON.parse(raw);
} catch (e) {
    console.warn('[UserService] Error reading cached user profile:', e);
}

function publish(profile) {
    cachedProfile = profile;
    try {
        if (profile) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(profile));
        else localStorage.removeItem(USER_STORAGE_KEY);
    } catch {
        /* storage unavailable */
    }
    window.dispatchEvent(new CustomEvent(USER_EVENT_NAME, { detail: { user: profile } }));
}

/**
 * Returns the currently active user profile (cached).
 */
export function getCurrentUser() {
    return cachedProfile;
}

/**
 * Returns the current role: 'admin' | 'user' | 'guest'
 */
export function getRole() {
    const user = getCurrentUser();
    if (!user) return 'guest';
    if (user.isGuest) return 'guest';
    return user.role || 'user';
}

/**
 * True if the active user is an admin. UI gating only; the database enforces access.
 */
export function isAdmin() {
    return getRole() === 'admin';
}

/**
 * Returns the current user class: 'poweruser' | 'regular' | 'beta' | 'guest'
 */
export function getUserClass() {
    const user = getCurrentUser();
    return user?.user_class || 'regular';
}

export function isPowerUser() {
    return getUserClass() === 'poweruser';
}

export function isBetaTester() {
    const cls = getUserClass();
    return cls === 'beta' || cls === 'poweruser';
}

/**
 * Feature gate for UI elements.
 */
export function canAccess(featureKey) {
    switch (featureKey) {
        case 'admin_panel':
        case 'schema_management':
            return isAdmin();
        case 'jit_monitor':
        case 'unlimited_ingest':
            return isAdmin() || isPowerUser();
        case 'experimental_ai':
        case 'advanced_audio_vectors':
            return isAdmin() || isPowerUser() || isBetaTester();
        default:
            return true;
    }
}

/**
 * Loads the profile for the current Supabase session.
 * @param {object} session Supabase session (from auth.getSession / onAuthStateChange)
 * @returns {Promise<object|null>} profile, or null when signed out
 */
export async function initUserProfile(session) {
    const user = session?.user;
    if (!user) {
        clearUserProfile();
        return null;
    }

    setActiveUserId(user.id);

    const meta = user.user_metadata || {};
    let data = null;
    try {
        const res = await supabase.rpc('get_my_profile');
        if (res.error) throw res.error;
        data = res.data;
    } catch (err) {
        console.warn('[UserService] Could not load profile from database:', err.message);
    }

    const isGuest = Boolean(user.is_anonymous || data?.is_guest);
    const calibration = data?.calibration && Object.keys(data.calibration).length > 0 ? data.calibration : null;

    const profile = {
        id: user.id,
        username: data?.username || meta.full_name || meta.name || (isGuest ? 'Guest Listener' : 'Listener'),
        email: data?.email || user.email || '',
        avatar_url: data?.avatar_url || meta.avatar_url || meta.picture || '',
        // A failed lookup never grants elevated access
        role: isGuest ? 'guest' : (data?.role || 'user'),
        user_class: isGuest ? 'guest' : (data?.user_class || 'regular'),
        discovery_level: data?.discovery_level ?? 0.5,
        calibration,
        isGuest,
        isAdmin: !isGuest && data?.role === 'admin',
        isPowerUser: !isGuest && data?.user_class === 'poweruser'
    };

    // Cross-device Sonic Radar calibration
    if (calibration?.radarValues) {
        localStorage.setItem('musicMood_user_calibration', JSON.stringify(calibration));
        sessionEngine.saveCalibration(calibration);
    } else {
        const localCalib = sessionEngine.getCalibration();
        if (localCalib?.radarValues) {
            syncCalibrationToSupabase(localCalib).catch(() => {});
        }
    }

    publish(profile);
    switchUserFavorites(profile.id);
    loadCloudFavorites(profile.id).catch(err => {
        console.warn('[UserService] Cloud favorites notice:', err);
    });

    console.log(`[UserService] Active profile: ${profile.username} | role=${profile.role} | class=${profile.user_class}`);
    return profile;
}

/**
 * Clears the cached profile (on sign-out).
 */
export function clearUserProfile() {
    setActiveUserId(null);
    publish(null);
    switchUserFavorites(null);
}

/**
 * Subscribes to user profile changes.
 */
export function subscribeUser(callback) {
    const handler = (e) => {
        callback(e.detail?.user || getCurrentUser());
    };
    window.addEventListener(USER_EVENT_NAME, handler);
    return () => window.removeEventListener(USER_EVENT_NAME, handler);
}
