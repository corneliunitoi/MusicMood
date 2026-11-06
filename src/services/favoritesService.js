/**
 * favoritesService.js
 * Browser-local profile favorites management for MusicMood.
 * Fast, 0-latency, offline-first with reactive subscriptions.
 */

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
