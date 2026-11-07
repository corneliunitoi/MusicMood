/**
 * favoritesService.js
 * Browser-local & cloud-synced profile favorites management for MusicMood.
 * Strictly scoped per user ID to guarantee zero bleed-over between users/guests.
 */

import { supabase } from './supabaseService';

const LEGACY_STORAGE_KEY = 'musicmood_favorites';
const EVENT_NAME = 'musicmood:favorites_updated';

function getActiveUser() {
    try {
        const raw = localStorage.getItem('musicmood_user_profile');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.id) {
                const isGuest = parsed.role === 'guest' || parsed.user_class === 'guest' || Boolean(parsed.isGuest);
                return { id: parsed.id, isGuest };
            }
        }
    } catch (e) {}
    return { id: null, isGuest: true };
}

function getActiveUserId() {
    const user = getActiveUser();
    return (!user.isGuest && user.id) ? user.id : null;
}

function getStorageKey(userId) {
    if (userId && userId !== 'guest') {
        return `musicmood_favorites_${userId}`;
    }
    return 'musicmood_favorites_guest';
}

function getStoredFavorites(targetUserId = null) {
    try {
        const userId = targetUserId !== null ? targetUserId : getActiveUserId();
        
        // If this is a guest session, ensure zero contaminated legacy favorites are ever returned
        if (!userId || userId === 'guest') {
            const raw = localStorage.getItem('musicmood_favorites_guest');
            const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
            // If the guest key still holds old copied data or legacy key is present, purge both immediately
            if (legacy || (raw && raw.length > 500)) {
                localStorage.removeItem('musicmood_favorites_guest');
                localStorage.removeItem(LEGACY_STORAGE_KEY);
                return [];
            }
            return raw ? JSON.parse(raw) : [];
        }

        const key = getStorageKey(userId);
        let raw = localStorage.getItem(key);

        // One-time migration: if this is a real user and user-specific key is empty,
        // but legacy unscoped key exists, migrate legacy favorites to this user
        if (!raw && userId && userId !== 'guest') {
            const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (legacy) {
                raw = legacy;
                localStorage.setItem(key, legacy);
                localStorage.removeItem(LEGACY_STORAGE_KEY);
            }
        }

        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.warn('[FavoritesService] Error reading favorites:', e);
        return [];
    }
}

function saveFavorites(list, targetUserId = null) {
    try {
        const userId = targetUserId !== null ? targetUserId : getActiveUserId();
        const key = getStorageKey(userId);
        localStorage.setItem(key, JSON.stringify(list));
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { favorites: list, userId } }));
    } catch (e) {
        console.warn('[FavoritesService] Error saving favorites:', e);
    }
}

/**
 * Switches the active favorites context when a user logs in, out, or changes persona.
 * Immediately notifies all UI components with the new user's isolated favorites.
 */
export function switchUserFavorites(newUserId = null) {
    if (!newUserId || newUserId === 'guest') {
        localStorage.removeItem('musicmood_favorites_guest');
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { favorites: [], userId: 'guest' } }));
        return [];
    }
    const list = getStoredFavorites(newUserId);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { favorites: list, userId: newUserId } }));
    return list;
}

// Self-healing migration on module load:
// Guarantees existing browsers immediately purge contaminated guest favorites
try {
    const active = getActiveUser();
    if (active.isGuest) {
        localStorage.removeItem('musicmood_favorites_guest');
        localStorage.removeItem(LEGACY_STORAGE_KEY);
    } else if (active.id) {
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
            const userKey = getStorageKey(active.id);
            if (!localStorage.getItem(userKey)) {
                localStorage.setItem(userKey, legacy);
            }
            localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
    }
} catch (e) {}

export function getFavorites() {
    return getStoredFavorites();
}

export function getFavoritesCount() {
    return getStoredFavorites().length;
}

export function isFavorite(trackOrId) {
    if (!trackOrId) return false;
    const targetId = typeof trackOrId === 'string' ? trackOrId : (trackOrId.id || trackOrId.youtube_video_id);
    if (!targetId) return false;

    const list = getStoredFavorites();
    return list.some(item => (item.id === targetId || item.youtube_video_id === targetId));
}

export function addFavorite(track) {
    if (!track) return false;
    const trackId = track.id || track.youtube_video_id;
    if (!trackId) return false;

    const list = getStoredFavorites();
    if (list.some(item => item.id === trackId || item.youtube_video_id === trackId)) {
        return true; // Already favorite
    }

    const newFavorite = {
        id: trackId,
        youtube_video_id: trackId,
        title: track.title || 'Unknown Title',
        artist: track.artist || 'Unknown Artist',
        thumbnail: track.thumbnail || `https://i.ytimg.com/vi/${trackId}/hqdefault.jpg`,
        genre: track.genre || track.primary_genre_id || 'Music',
        addedAt: new Date().toISOString()
    };

    const updated = [newFavorite, ...list];
    saveFavorites(updated);

    // Asynchronously sync to Supabase cloud
    const userId = getActiveUserId();
    if (userId) {
        syncCloudFavorites(userId, [newFavorite]);
    }

    return true;
}

export function removeFavorite(trackOrId) {
    if (!trackOrId) return false;
    const targetId = typeof trackOrId === 'string' ? trackOrId : (trackOrId.id || trackOrId.youtube_video_id);
    if (!targetId) return false;

    const list = getStoredFavorites();
    const updated = list.filter(item => item.id !== targetId && item.youtube_video_id !== targetId);
    if (updated.length !== list.length) {
        saveFavorites(updated);

        // Asynchronously remove from Supabase cloud
        const userId = getActiveUserId();
        if (userId) {
            supabase.rpc('remove_user_favorite', {
                p_user_id: userId,
                p_video_id: targetId
            }).catch(err => console.warn('[FavoritesService] Cloud removal error:', err));
        }

        return true;
    }
    return false;
}

export function toggleFavorite(track) {
    if (!track) return false;
    if (isFavorite(track)) {
        removeFavorite(track);
        return false;
    } else {
        addFavorite(track);
        return true;
    }
}

export function subscribeFavorites(callback) {
    const handler = (e) => {
        callback(e.detail?.favorites || getStoredFavorites());
    };
    window.addEventListener(EVENT_NAME, handler);
    // Initial call
    callback(getStoredFavorites());
    return () => window.removeEventListener(EVENT_NAME, handler);
}

/**
 * Loads favorites from Supabase public.user_favorites for a given user ID,
 * isolated strictly to that user's partition.
 */
export async function loadCloudFavorites(userId) {
    if (!userId || userId === 'guest') {
        const guestFavs = getStoredFavorites('guest');
        saveFavorites(guestFavs, 'guest');
        return guestFavs;
    }

    try {
        const { data, error } = await supabase.rpc('get_user_favorites', { p_user_id: userId });
        if (error) {
            console.warn('[FavoritesService] Failed to load cloud favorites:', error.message);
            return getStoredFavorites(userId);
        }

        const cloudFavs = Array.isArray(data) ? data : [];
        const local = getStoredFavorites(userId);

        if (cloudFavs.length === 0) {
            if (local.length > 0) {
                syncCloudFavorites(userId, local);
            }
            saveFavorites(local, userId);
            return local;
        }

        // Merge: combine cloud items with local items for this specific user
        const map = new Map();

        // Add cloud first
        cloudFavs.forEach(c => {
            const vid = c.videoId || c.id;
            if (vid) map.set(vid, { ...c, id: vid, youtube_video_id: vid });
        });

        // Overlay local items belonging to this specific user
        local.forEach(l => {
            const vid = l.youtube_video_id || l.id;
            if (vid && !map.has(vid)) map.set(vid, l);
        });

        const merged = Array.from(map.values());
        saveFavorites(merged, userId);

        // Push any local items not yet in cloud
        if (merged.length > cloudFavs.length) {
            syncCloudFavorites(userId, merged);
        }

        return merged;
    } catch (e) {
        console.warn('[FavoritesService] Error during cloud favorites hydration:', e);
        return getStoredFavorites(userId);
    }
}

/**
 * Pushes favorites to Supabase public.user_favorites.
 */
export async function syncCloudFavorites(userId, list) {
    if (!userId || !list || list.length === 0) return;

    try {
        const payload = list.map(item => ({
            id: item.youtube_video_id || item.id,
            video_id: item.youtube_video_id || item.id,
            title: item.title,
            artist: item.artist,
            genre: item.genre,
            thumbnail: item.thumbnail
        }));

        await supabase.rpc('sync_user_favorites', {
            p_user_id: userId,
            p_favorites: payload
        });
    } catch (e) {
        console.warn('[FavoritesService] Cloud sync error:', e);
    }
}
