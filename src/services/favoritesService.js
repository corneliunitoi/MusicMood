/**
 * favoritesService.js
 * Browser-local profile favorites management for MusicMood.
 * Fast, 0-latency, offline-first with reactive subscriptions and Supabase cloud persistence.
 */

import { supabase } from './supabaseService';

const STORAGE_KEY = 'musicmood_favorites';
const EVENT_NAME = 'musicmood:favorites_updated';

function getStoredFavorites() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.warn('[FavoritesService] Error reading favorites:', e);
        return [];
    }
}

function saveFavorites(list) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { favorites: list } }));
    } catch (e) {
        console.warn('[FavoritesService] Error saving favorites:', e);
    }
}

function getActiveUserId() {
    try {
        const raw = localStorage.getItem('musicmood_user_profile');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.id && !parsed.isGuest) return parsed.id;
        }
    } catch (e) {}
    return null;
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
 * merging them with any existing local favorites without duplicates.
 */
export async function loadCloudFavorites(userId) {
    if (!userId) return getStoredFavorites();

    try {
        const { data, error } = await supabase.rpc('get_user_favorites', { p_user_id: userId });
        if (error) {
            console.warn('[FavoritesService] Failed to load cloud favorites:', error.message);
            return getStoredFavorites();
        }

        const cloudFavs = Array.isArray(data) ? data : [];
        const local = getStoredFavorites();

        if (cloudFavs.length === 0) {
            if (local.length > 0) {
                syncCloudFavorites(userId, local);
            }
            return local;
        }

        // Merge: combine cloud items with local items
        const map = new Map();

        // Add cloud first
        cloudFavs.forEach(c => {
            const vid = c.videoId || c.id;
            if (vid) map.set(vid, { ...c, id: vid, youtube_video_id: vid });
        });

        // Overlay local items
        local.forEach(l => {
            const vid = l.youtube_video_id || l.id;
            if (vid && !map.has(vid)) map.set(vid, l);
        });

        const merged = Array.from(map.values());
        saveFavorites(merged);

        // Push any local items not yet in cloud
        if (merged.length > cloudFavs.length) {
            syncCloudFavorites(userId, merged);
        }

        return merged;
    } catch (e) {
        console.warn('[FavoritesService] Error during cloud favorites hydration:', e);
        return getStoredFavorites();
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
