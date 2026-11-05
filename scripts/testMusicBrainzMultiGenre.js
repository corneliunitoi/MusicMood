import { normalizeGenre, VALID_GENRE_IDS } from '../src/services/genreNormalizer.js';

export async function fetchMusicBrainzMultiGenre(artistName) {
    if (!artistName || typeof artistName !== 'string') return null;
    const cleanArtist = artistName
        .replace(/\s*-\s*Topic$/i, '')
        .replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '')
        .trim();

    try {
        const url = `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(cleanArtist)}&fmt=json&limit=3`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'MusicMood/1.0.0 ( contact@musicmood.local )'
            }
        });

        if (!res.ok) return null;
        const data = await res.json();
        // Find best matching artist by exact or close name
        const artists = data.artists || [];
        const artist = artists.find(a => a.name.toLowerCase() === cleanArtist.toLowerCase()) || artists[0];
        if (!artist) return null;

        // Collect all tags and genres
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

        (artist.genres || []).forEach(g => addTag(g.name, (g.count || 0) + 10)); // Boost curated genres
        (artist.tags || []).forEach(t => addTag(t.name, t.count || 0));

        // Sort by vote count descending
        rawTags.sort((a, b) => b.count - a.count);

        // Normalize each tag independently to our canonical 115 taxonomy
        const canonicalSet = new Set();
        const canonicalList = [];

        for (const t of rawTags) {
            // Note: pass tag alone so ARTIST_CANONICAL_GENRES does not short-circuit individual sub-tags
            const canonical = normalizeGenre(t.name);
            if (canonical && VALID_GENRE_IDS.has(canonical) && !canonicalSet.has(canonical)) {
                canonicalSet.add(canonical);
                canonicalList.push(canonical);
            }
        }

        if (canonicalList.length === 0) return null;

        // Primary is the first (highest voted/curated), secondary are the rest
        const primary = canonicalList[0];
        const secondary = canonicalList.slice(1);

        return {
            mbid: artist.id,
            artist: artist.name,
            primary,
            secondary,
            rawTags: rawTags.slice(0, 8).map(t => t.name)
        };
    } catch (e) {
        return null;
    }
}

async function test() {
    const artists = [
        'David Bowie',
        'Radiohead',
        'Led Zeppelin',
        'Pink Floyd',
        'Massive Attack',
        'Nine Inch Nails',
        'Miles Davis'
    ];

    console.log('Testing Multi-Genre Extraction from MusicBrainz:');
    for (const a of artists) {
        const res = await fetchMusicBrainzMultiGenre(a);
        if (res) {
            console.log(`\n🎵 ${res.artist} (MBID: ${res.mbid})`);
            console.log(`   • Primary:   ${res.primary}`);
            console.log(`   • Secondary: [${res.secondary.join(', ')}]`);
            console.log(`   • Raw tags:  ${res.rawTags.join(', ')}`);
        } else {
            console.log(`\n❌ Could not resolve: ${a}`);
        }
        await new Promise(r => setTimeout(r, 1100)); // Respect 1 req/sec rate limit
    }
}

test().catch(console.error);
