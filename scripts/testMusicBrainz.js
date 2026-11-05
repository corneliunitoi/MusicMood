async function queryMusicBrainz(artistName) {
    const url = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json&limit=1`;
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'MusicMood/1.0.0 ( https://github.com/yourname/musicmood )'
            }
        });
        if (!res.ok) return { error: res.status };
        const data = await res.json();
        const artist = data.artists?.[0];
        if (!artist) return null;

        // Tags and genres
        const tags = (artist.tags || []).sort((a, b) => b.count - a.count).map(t => `${t.name} (${t.count})`);
        const genres = (artist.genres || []).map(g => g.name);

        return {
            name: artist.name,
            disambiguation: artist.disambiguation,
            genres,
            tags: tags.slice(0, 8)
        };
    } catch (e) {
        return { error: e.message };
    }
}

async function main() {
    const artists = [
        'Queens of the Stone Age',
        'Massive Attack',
        'Robert Schumann',
        'Parkway Drive',
        'Astor Piazzolla',
        'Ten Years After'
    ];

    console.log('Testing MusicBrainz API for canonical artist genre tags:');
    for (const a of artists) {
        const info = await queryMusicBrainz(a);
        console.log(`\n[Artist] ${a}`);
        console.log('  Genres:', info.genres);
        console.log('  Top Tags:', info.tags);
        // MusicBrainz rate limit policy recommends 1 req/sec
        await new Promise(r => setTimeout(r, 1100));
    }
}

main().catch(console.error);
