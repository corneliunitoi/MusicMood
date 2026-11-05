/**
 * musicBrainzService.js
 * 
 * Free, open music metadata and multi-genre resolver powered by MusicBrainz & MetaBrainz Foundation.
 * Respects MusicBrainz 1 req/sec rate limit with an internal queue.
 * Extracts rich, community-voted genre tags and maps them to our canonical 115 taxonomy.
 */

import { normalizeGenre, VALID_GENRE_IDS, ARTIST_CANONICAL_GENRES } from './genreNormalizer.js';

// In-memory LRU cache to avoid re-querying known artists
const memoryCache = new Map();

// Request queue to guarantee strict compliance with MusicBrainz rate limits (1 req / 1100ms)
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 1100;

async function throttle() {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
        await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
    }
    lastRequestTime = Date.now();
}

/**
 * Normalizes artist name for clean search
 */
function cleanArtistName(raw) {
    if (!raw || typeof raw !== 'string') return '';
    return raw
        .replace(/\s*-\s*Topic$/i, '')
        .replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '')
        .replace(/\[[^\]]+\]/g, '')
        .replace(/\((Remaster|Live|Mono|Stereo).*?\)/gi, '')
        .trim();
}

/**
 * Fetches multi-genre metadata from MusicBrainz for a given artist.
 * 
 * @param {string} artistName
 * @returns {Promise<{
 *   artist: string,
 *   mbid: string,
 *   primary_genre_id: string,
 *   secondary_genre_ids: string[],
 *   tags: string[]
 * } | null>}
 */
export async function fetchMusicBrainzArtistGenres(artistName) {
    const clean = cleanArtistName(artistName);
    if (!clean || clean.length < 2) return null;

    const cacheKey = clean.toLowerCase();
    if (memoryCache.has(cacheKey)) {
        return memoryCache.get(cacheKey);
    }

    await throttle();

    try {
        const url = `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(clean)}&fmt=json&limit=3`;
        let res = await fetch(url, {
            headers: {
                'User-Agent': 'MusicMood/1.0.0 ( https://github.com/MusicMood/musicmood ; contact@musicmood.local )'
            }
        });

        if (res.status === 503 || res.status === 429) {
            // Rate limit backoff: sleep 2.2s and retry once
            await new Promise(r => setTimeout(r, 2200));
            res = await fetch(url, {
                headers: {
                    'User-Agent': 'MusicMood/1.0.0 ( https://github.com/MusicMood/musicmood ; contact@musicmood.local )'
                }
            });
        }

        if (!res.ok) {
            return await fallbackWikipedia(clean);
        }

        const data = await res.json();
        const artists = data.artists || [];
        if (artists.length === 0) {
            return await fallbackWikipedia(clean);
        }

        // Match exact or closest candidate
        const match = artists.find(a => a.name.toLowerCase() === clean.toLowerCase()) || artists[0];
        if (!match) {
            return await fallbackWikipedia(clean);
        }

        // Aggregate tags and genres
        const rawTags = [];
        const seenTags = new Set();

        const addTag = (name, count = 0) => {
            if (!name) return;
            const lower = name.toLowerCase().trim();
            if (!seenTags.has(lower)) {
                seenTags.add(lower);
                rawTags.push({ name: lower, count });
            }
        };

        // Curated genres carry higher weight (+10)
        (match.genres || []).forEach(g => addTag(g.name, (g.count || 0) + 10));
        (match.tags || []).forEach(t => addTag(t.name, t.count || 0));

        // Sort by vote weight descending
        rawTags.sort((a, b) => b.count - a.count);

        // Normalize each tag independently against our 115 canonical genre IDs
        const canonicalSet = new Set();
        const canonicalList = [];

        for (const t of rawTags) {
            const canonical = normalizeGenre(t.name);
            if (canonical && VALID_GENRE_IDS.has(canonical) && !canonicalSet.has(canonical)) {
                canonicalSet.add(canonical);
                canonicalList.push(canonical);
            }
        }

        // Check if artist has a hand-curated canonical anchor
        const curatedAnchor = ARTIST_CANONICAL_GENRES[clean.toLowerCase()];

        let primary;
        let secondary;

        if (curatedAnchor && VALID_GENRE_IDS.has(curatedAnchor)) {
            primary = curatedAnchor;
            secondary = canonicalList.filter(g => g !== curatedAnchor);
        } else if (canonicalList.length > 0) {
            primary = canonicalList[0];
            secondary = canonicalList.slice(1);
        } else {
            // No tags resolved from MusicBrainz, try Wikipedia
            return await fallbackWikipedia(clean, match.id);
        }

        const result = {
            artist: match.name,
            mbid: match.id,
            primary_genre_id: primary,
            secondary_genre_ids: secondary,
            tags: rawTags.slice(0, 10).map(t => t.name)
        };

        memoryCache.set(cacheKey, result);
        return result;
    } catch (e) {
        console.warn(`[MusicBrainz] Lookup error for "${clean}":`, e.message);
        return await fallbackWikipedia(clean);
    }
}

/**
 * Free Wikipedia fallback for artists with sparse MusicBrainz community tags
 */
async function fallbackWikipedia(cleanArtist, mbid = null) {
    try {
        const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanArtist.replace(/\s+/g, '_'))}`;
        const res = await fetch(wikiUrl, {
            headers: { 'User-Agent': 'MusicMood/1.0 (contact@musicmood.local)' }
        });

        if (!res.ok) return null;
        const data = await res.json();
        const extract = `${data.description || ''} ${data.extract || ''}`.toLowerCase();

        const words = extract.split(/[\s,.;:()]+/);
        const canonicalSet = new Set();
        const canonicalList = [];

        // Check 2-word and 1-word genre tokens
        for (let i = 0; i < words.length; i++) {
            const bi = `${words[i]} ${words[i + 1] || ''}`.trim();
            const candBi = normalizeGenre(bi);
            if (candBi && candBi !== 'rock' && VALID_GENRE_IDS.has(candBi) && !canonicalSet.has(candBi)) {
                canonicalSet.add(candBi);
                canonicalList.push(candBi);
            }
            const single = words[i];
            const candSingle = normalizeGenre(single);
            if (candSingle && candSingle !== 'rock' && VALID_GENRE_IDS.has(candSingle) && !canonicalSet.has(candSingle)) {
                canonicalSet.add(candSingle);
                canonicalList.push(candSingle);
            }
        }

        const curatedAnchor = ARTIST_CANONICAL_GENRES[cleanArtist.toLowerCase()];
        const primary = curatedAnchor || canonicalList[0] || 'rock';
        const secondary = canonicalList.filter(g => g !== primary);

        const result = {
            artist: cleanArtist,
            mbid: mbid || null,
            primary_genre_id: primary,
            secondary_genre_ids: secondary,
            tags: data.description ? [data.description.toLowerCase()] : []
        };

        memoryCache.set(cleanArtist.toLowerCase(), result);
        return result;
    } catch (e) {
        return null;
    }
}
