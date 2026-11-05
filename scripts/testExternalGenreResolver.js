import { normalizeGenre } from '../src/services/genreNormalizer.js';

/**
 * Free online genre resolver using MusicBrainz + Wikipedia fallback
 * Zero paid API keys required.
 */
export async function fetchOnlineArtistGenre(artistName) {
    if (!artistName || typeof artistName !== 'string') return null;
    const cleanArtist = artistName.replace(/\s*-\s*Topic$/i, '').trim();

    try {
        // 1. Query MusicBrainz Artist Search
        const url = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(cleanArtist)}&fmt=json&limit=1`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'MusicMood/1.0.0 ( contact@musicmood.local )'
            }
        });

        if (res.ok) {
            const data = await res.json();
            const artist = data.artists?.[0];
            if (artist) {
                // Check direct tags and genres
                const tags = [
                    ...(artist.genres || []).map(g => g.name),
                    ...(artist.tags || []).sort((a, b) => (b.count || 0) - (a.count || 0)).map(t => t.name)
                ];

                for (const tag of tags) {
                    const normalized = normalizeGenre(tag, cleanArtist);
                    if (normalized && normalized !== 'rock') {
                        return { source: 'MusicBrainz', tag, normalized };
                    }
                }
                if (tags.length > 0) {
                    const normalized = normalizeGenre(tags[0], cleanArtist);
                    return { source: 'MusicBrainz', tag: tags[0], normalized };
                }
            }
        }
    } catch (e) {
        // Fallback safely
    }

    // 2. Query Wikipedia Summary API (Free, fast)
    try {
        const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanArtist.replace(/\s+/g, '_'))}`;
        const res = await fetch(wikiUrl, {
            headers: { 'User-Agent': 'MusicMood/1.0' }
        });
        if (res.ok) {
            const data = await res.json();
            const extract = `${data.description || ''} ${data.extract || ''}`.toLowerCase();
            const normalized = normalizeGenre(extract, cleanArtist);
            if (normalized && normalized !== 'rock') {
                return { source: 'Wikipedia', tag: data.description, normalized };
            }
        }
    } catch (e) {}

    return null;
}

async function run() {
    const unknownArtists = [
        'Queens of the Stone Age',
        'Massive Attack',
        'Parkway Drive',
        'Robert Schumann',
        'Astor Piazzolla',
        'Caspian',
        'Tenhi',
        'Kyuss',
        'Mudhoney'
    ];

    console.log('Testing Online Genre Resolution for unclassified artists:');
    for (const a of unknownArtists) {
        const result = await fetchOnlineArtistGenre(a);
        console.log(`• "${a}" ->`, result ? `${result.normalized} (via ${result.source}: "${result.tag}")` : 'No online match');
        await new Promise(r => setTimeout(r, 1100)); // Respect MusicBrainz 1 req/sec rate limit
    }
}

run().catch(console.error);
