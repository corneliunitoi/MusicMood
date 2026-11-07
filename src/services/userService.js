import { supabase } from './supabaseService';
import { syncCloudFavorites, loadCloudFavorites } from './favoritesService';

const USER_STORAGE_KEY = 'musicmood_user_profile';
const USER_EVENT_NAME = 'musicmood:user_updated';

// In-memory cached profile for synchronous queries
let cachedProfile = null;

try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (raw) cachedProfile = JSON.parse(raw);
} catch (e) {
    console.warn('[UserService] Error reading cached user profile:', e);
}

/**
 * Returns the currently active user profile, or null.
 */
export function getCurrentUser() {
    if (!cachedProfile) {
        try {
            const raw = localStorage.getItem(USER_STORAGE_KEY);
            if (raw) cachedProfile = JSON.parse(raw);
        } catch (e) {}
    }
    return cachedProfile;
}

/**
 * Returns true if the currently logged-in user has 'admin' privileges.
 */
export function isAdmin() {
    const user = getCurrentUser();
    return Boolean(user && user.role === 'admin');
}

/**
 * Initializes or resolves a user profile from Google OAuth payload.
 * Upserts identity to public.user_profiles via Supabase RPC resolve_or_create_user.
 */
export async function initUserProfile(googlePayload) {
    if (!googlePayload || !googlePayload.sub) {
        // Fallback for guest
        const guestProfile = {
            id: 'f7337681-6f7b-4772-852f-4d66317d2bb9',
            username: googlePayload?.name || 'Guest User',
            email: 'testguest@gmail.com',
            avatar_url: googlePayload?.picture || 'https://ui-avatars.com/api/?name=Guest+User&background=646cff&color=fff',
            role: 'user',
            isGuest: true
        };
        cachedProfile = guestProfile;
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(guestProfile));
        window.dispatchEvent(new CustomEvent(USER_EVENT_NAME, { detail: { user: guestProfile } }));
        return guestProfile;
    }

    try {
        const { data, error } = await supabase.rpc('resolve_or_create_user', {
            p_google_id: googlePayload.sub,
            p_email: googlePayload.email || '',
            p_name: googlePayload.name || '',
            p_picture: googlePayload.picture || ''
        });

        if (error) {
            console.error('[UserService] Failed to resolve user profile:', error);
            throw error;
        }

        const profile = {
            id: data.id,
            googleId: googlePayload.sub,
            username: data.username || googlePayload.name,
            email: data.email || googlePayload.email,
            avatar_url: data.avatar_url || googlePayload.picture,
            role: data.role || 'user',
            discovery_level: data.discovery_level ?? 0.50,
            isAdmin: data.role === 'admin'
        };

        cachedProfile = profile;
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(profile));
        window.dispatchEvent(new CustomEvent(USER_EVENT_NAME, { detail: { user: profile } }));

        console.log(`[UserService] Active profile: ${profile.username} (${profile.email}) | Role: ${profile.role}`);

        // Automatically trigger cloud-to-local favorites reconciliation in background
        loadCloudFavorites(profile.id).catch(err => {
            console.warn('[UserService] Cloud favorites hydration notice:', err);
        });

        return profile;
    } catch (err) {
        console.warn('[UserService] RPC fallback to local memory:', err.message);
        const fallback = {
            id: 'f7337681-6f7b-4772-852f-4d66317d2bb9',
            username: googlePayload.name || 'Listener',
            email: googlePayload.email || '',
            avatar_url: googlePayload.picture || '',
            role: (googlePayload.email && googlePayload.email.toLowerCase() === 'corneliunitoi@gmail.com') ? 'admin' : 'user',
            isAdmin: (googlePayload.email && googlePayload.email.toLowerCase() === 'corneliunitoi@gmail.com')
        };
        cachedProfile = fallback;
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(fallback));
        return fallback;
    }
}

/**
 * Clears the active user session.
 */
export function clearUserProfile() {
    cachedProfile = null;
    localStorage.removeItem(USER_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(USER_EVENT_NAME, { detail: { user: null } }));
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
