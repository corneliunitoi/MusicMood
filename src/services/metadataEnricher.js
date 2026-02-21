/**
 * Service to enrich raw track titles (from YouTube) into structured metadata
 * using the public iTunes Search API.
 */

const ITUNES_SEARCH_API = 'https://itunes.apple.com/search';

/**
 * Normalizes a raw YouTube video title before searching to improve match rate.
 * Removes common junk like "Official Video", "(Lyrics)", etc.
 */
function cleanYoutubeTitle(title) {
    let clean = title.toLowerCase();

    // Remove (Official Video), [Official Audio], etc.
    clean = clean.replace(/[\(\[].*?(official|lyric|video|audio|music).*?[\)\]]/gi, '');

    // Remove "ft.", "feat.", etc. to simplify query
    clean = clean.replace(/\b(ft|feat|featuring)\.?\b.*/gi, '');

    // Remove special characters, keep only alphanumerics, spaces, and hyphens
    clean = clean.replace(/[^\w\s-]/gi, ' ');

    // Trim excess whitespace
    clean = clean.replace(/\s+/g, ' ').trim();

    return clean;
}

/**
 * Searches iTunes API for a given track title and returns structured metadata.
 * @param {string} rawTitle - The uncleaned YouTube video title.
 * @returns {Promise<{artist: string, genre: string, success: boolean}>}
 */
export async function enrichTrackMetadata(rawTitle) {
    if (!rawTitle) return { success: false };

    const query = cleanYoutubeTitle(rawTitle);
    if (!query) return { success: false };

    try {
        const response = await fetch(`${ITUNES_SEARCH_API}?term=${encodeURIComponent(query)}&entity=song&limit=1`);

        if (!response.ok) {
            return { success: false };
        }

        const data = await response.json();

        if (data.results && data.results.length > 0) {
            const track = data.results[0];
            return {
                success: true,
                artist: track.artistName,
                genre: track.primaryGenreName,
                trackName: track.trackName
            };
        }

        return { success: false };

    } catch (error) {
        console.error("iTunes API error enriching title:", rawTitle, error);
        return { success: false };
    }
}
