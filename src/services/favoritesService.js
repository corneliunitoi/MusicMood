/**
 * favoritesService.js
 * Browser-local & cloud-synced favorites for MusicMood, scoped per Supabase user
 * (Google users and anonymous guests alike) so nothing bleeds between accounts.
 */

import { supabase, upvoteTrack, getActiveUserId as getSessionUserId } from './supabaseService';

const LEGACY_STORAGE_KEY = 'musicmood_favorites';
const EVENT_NAME = 'musicmood:favorites_updated';

// Favorites context: the signed-in Supabase user id, or null when signed out.
let currentUserId = null;

function getActiveUserId() {
    return currentUserId || getSessionUserId() || null;
}

function getStorageKey(userId) {
    return userId ? `musicmood_favorites_${userId}` : 'musicmood_favorites_signed_out';
}

function getStoredFavorites(targetUserId = null) {
    try {
        const userId = targetUserId !== null ? targetUserId : getActiveUserId();
        const raw = localStorage.getItem(getStorageKey(userId));
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.warn('[FavoritesService] Error reading favorites:', e);
        return [];
    }
}

function saveFavorites(list, targetUserId = null) {
    try {
        const userId = targetUserId !== null ? targetUserId : getActiveUserId();
        localStorage.setItem(getStorageKey(userId), JSON.stringify(list));
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { favorites: list, userId } }));
    } catch (e) {
        console.warn('[FavoritesService] Error saving favorites:', e);
    }
}

/**
 * Switches the favorites context when a user signs in or out.
 * @param {string|null} newUserId Supabase user id, or null when signed out
 */
export function switchUserFavorites(newUserId = null) {
    currentUserId = newUserId || null;
    const list = currentUserId ? getStoredFavorites(currentUserId) : [];
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { favorites: list, userId: currentUserId } }));
    return list;
}

// Remove storage keys from the pre-Supabase-Auth favorites scheme
try {
    [LEGACY_STORAGE_KEY, 'musicmood_favorites_guest'].forEach(k => localStorage.removeItem(k));
} catch {
    /* storage unavailable */
}

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

    // Asynchronously sync to Supabase cloud (works for both logged-in users and anonymous guests)
    const userId = getActiveUserId();
    if (userId) {
        syncCloudFavorites(userId, [newFavorite]);
    }

    // A favorite automatically casts an upvote for the track and artist in database
    if (newFavorite.youtube_video_id && newFavorite.artist) {
        upvoteTrack({
            videoId: newFavorite.youtube_video_id,
            artist: newFavorite.artist,
            delta: 1
        }).catch(() => {});
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
    const effectiveUserId = userId || getActiveUserId();
    if (!effectiveUserId) return [];

    try {
        const { data, error } = await supabase.rpc('get_user_favorites', { p_user_id: effectiveUserId });
        if (error) {
            console.warn('[FavoritesService] Failed to load cloud favorites:', error.message);
            return getStoredFavorites(effectiveUserId);
        }

        const cloudFavs = Array.isArray(data) ? data : [];
        const local = getStoredFavorites(effectiveUserId);

        if (cloudFavs.length === 0) {
            if (local.length > 0) {
                syncCloudFavorites(effectiveUserId, local);
            }
            saveFavorites(local, effectiveUserId);
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
        saveFavorites(merged, effectiveUserId);

        // Push any local items not yet in cloud
        if (merged.length > cloudFavs.length) {
            syncCloudFavorites(effectiveUserId, merged);
        }

        return merged;
    } catch (e) {
        console.warn('[FavoritesService] Error during cloud favorites hydration:', e);
        return getStoredFavorites(effectiveUserId);
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
