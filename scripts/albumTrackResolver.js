import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.resolve(process.cwd(), 'scripts', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'album_tracks_cache.json');

// In-memory + persistent cache
const albumCache = new Map();
try {
    if (fs.existsSync(CACHE_FILE)) {
        const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        for (const [k, v] of Object.entries(raw)) {
            albumCache.set(k, v);
        }
    }
} catch (e) {
    // Cache read error ignored
}

function persistCache() {
    try {
        if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
        }
        const obj = Object.fromEntries(albumCache);
        fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {}
}

/**
 * Clean artist and album names for external search queries
 */
export function cleanSearchTerm(str) {
    if (!str) return '';
    return str
        .replace(/\[.*?\]/g, ' ') // Remove [APE], [FLAC], [2008 Remaster]
        .replace(/\((Remaster|Deluxe|Bonus|Edition|Expanded|Mono|Stereo).*?\)/gi, ' ')
        .replace(/\b(cd\s*\d+|disc\s*\d+)\b/gi, ' ')
        .replace(/[._-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Tier 1: Deezer Album & Tracklist API (fastest, unauthenticated, rich metadata)
 */
async function fetchDeezerAlbumTracks(artist, album) {
    const cleanArt = cleanSearchTerm(artist);
    const cleanAlb = cleanSearchTerm(album);
    const query = `${cleanArt} ${cleanAlb}`.trim();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
        const sRes = await fetch(`https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&limit=3`, {
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!sRes.ok) return null;
        const sData = await sRes.json();
        if (!sData.data || sData.data.length === 0) return null;

        // Find best match by comparing artist or album
        const match = sData.data[0];
        const albumId = match.id;

        // Fetch tracks
        const tController = new AbortController();
        const tTimeout = setTimeout(() => tController.abort(), 4000);
        const tRes = await fetch(`https://api.deezer.com/album/${albumId}/tracks?limit=100`, {
            signal: tController.signal
        });
        clearTimeout(tTimeout);

        if (!tRes.ok) return null;
        const tData = await tRes.json();
        const items = tData.data || [];
        if (items.length === 0) return null;

        const tracks = items.map((t, idx) => ({
            trackNumber: t.track_position || (idx + 1),
            title: t.title_short || t.title,
            artist: t.artist?.name || match.artist?.name || artist,
            durationSec: t.duration || 0
        }));

        return {
            source: 'deezer',
            albumArtist: match.artist?.name || artist,
            albumTitle: match.title || album,
            genre: match.genres?.data?.[0]?.name || null,
            tracks
        };
    } catch {
        return null;
    }
}

/**
 * Tier 2: MusicBrainz Open Community API (comprehensive, niche & classical friendly)
 */
async function fetchMusicBrainzAlbumTracks(artist, album) {
    const cleanArt = cleanSearchTerm(artist);
    const cleanAlb = cleanSearchTerm(album);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    try {
        const query = `artist:"${cleanArt}" AND release:"${cleanAlb}"`;
        const url = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json&limit=3`;
        const sRes = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'MusicMood/1.0.0 ( contact@musicmood.local )'
            }
        });
        clearTimeout(timeout);

        if (!sRes.ok) return null;
        const sData = await sRes.json();
        if (!sData.releases || sData.releases.length === 0) return null;

        const rel = sData.releases[0];
        const mbid = rel.id;

        // Fetch recordings
        const tController = new AbortController();
        const tTimeout = setTimeout(() => tController.abort(), 4500);
        const dUrl = `https://musicbrainz.org/ws/2/release/${mbid}?inc=recordings+artists&fmt=json`;
        const dRes = await fetch(dUrl, {
            signal: tController.signal,
            headers: {
                'User-Agent': 'MusicMood/1.0.0 ( contact@musicmood.local )'
            }
        });
        clearTimeout(tTimeout);

        if (!dRes.ok) return null;
        const dData = await dRes.json();
        const media = dData.media || [];
        const rawTracks = [];

        for (const medium of media) {
            for (const t of (medium.tracks || [])) {
                rawTracks.push({
                    trackNumber: t.position || rawTracks.length + 1,
                    title: t.recording?.title || t.title,
                    artist: t.artistCredit?.[0]?.name || rel['artist-credit']?.[0]?.name || artist,
                    durationSec: t.length ? Math.round(t.length / 1000) : 0
                });
            }
        }

        if (rawTracks.length === 0) return null;

        return {
            source: 'musicbrainz',
            albumArtist: rel['artist-credit']?.[0]?.name || artist,
            albumTitle: rel.title || album,
            genre: null,
            tracks: rawTracks
        };
    } catch {
        return null;
    }
}

/**
 * Tier 3: Apple iTunes Search & Lookup API
 */
async function fetchItunesAlbumTracks(artist, album) {
    const cleanArt = cleanSearchTerm(artist);
    const cleanAlb = cleanSearchTerm(album);
    const query = `${cleanArt} ${cleanAlb}`.trim();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
        const sRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=5`, {
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!sRes.ok) return null;
        const sData = await sRes.json();
        const results = sData.results || [];
        if (results.length === 0) return null;

        const match = results[0];
        const colId = match.collectionId;

        // Lookup songs in collection
        const tController = new AbortController();
        const tTimeout = setTimeout(() => tController.abort(), 4000);
        const tRes = await fetch(`https://itunes.apple.com/lookup?id=${colId}&entity=song`, {
            signal: tController.signal
        });
        clearTimeout(tTimeout);

        if (!tRes.ok) return null;
        const tData = await tRes.json();
        const songs = (tData.results || []).filter(r => r.wrapperType === 'track');
        if (songs.length === 0) return null;

        const tracks = songs.map(s => ({
            trackNumber: s.trackNumber || 1,
            title: s.trackName,
            artist: s.artistName || artist,
            durationSec: s.trackTimeMillis ? Math.round(s.trackTimeMillis / 1000) : 0
        }));

        return {
            source: 'itunes',
            albumArtist: match.artistName || artist,
            albumTitle: match.collectionName || album,
            genre: match.primaryGenreName || null,
            tracks
        };
    } catch {
        return null;
    }
}

/**
 * Master multi-tier resolver: consults Deezer -> MusicBrainz -> iTunes
 * with in-memory + disk cache.
 *
 * @param {string} artist
 * @param {string} album
 * @returns {Promise<{
 *   success: boolean,
 *   source: string,
 *   albumArtist: string,
 *   albumTitle: string,
 *   genre: string|null,
 *   tracks: Array<{ trackNumber: number, title: string, artist: string, durationSec: number }>
 * }>}
 */
export async function fetchAlbumTracks(artist, album) {
    if (!artist || !album) {
        return { success: false, reason: 'Artist and album name required', tracks: [] };
    }

    const cacheKey = `${artist.trim().toLowerCase()}|${album.trim().toLowerCase()}`;
    if (albumCache.has(cacheKey)) {
        const cached = albumCache.get(cacheKey);
        return { ...cached, source: 'cache', success: true };
    }

    // 1. Try Deezer (fastest)
    let result = await fetchDeezerAlbumTracks(artist, album);

    // 2. Fallback to MusicBrainz (most extensive catalogue)
    if (!result || !result.tracks || result.tracks.length === 0) {
        result = await fetchMusicBrainzAlbumTracks(artist, album);
    }

    // 3. Fallback to iTunes
    if (!result || !result.tracks || result.tracks.length === 0) {
        result = await fetchItunesAlbumTracks(artist, album);
    }

    if (result && result.tracks && result.tracks.length > 0) {
        const finalData = {
            success: true,
            source: result.source,
            albumArtist: result.albumArtist || artist,
            albumTitle: result.albumTitle || album,
            genre: result.genre || null,
            tracks: result.tracks
        };
        albumCache.set(cacheKey, finalData);
        persistCache();
        return finalData;
    }

    return {
        success: false,
        reason: 'No tracks found across external APIs',
        tracks: []
    };
}
