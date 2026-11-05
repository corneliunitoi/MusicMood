import { supabase } from '../src/services/supabaseService.js';

async function syncArtists() {
    console.log('Fetching all tracks with artists...');
    let page = 0;
    const pageSize = 1000;
    let allTracks = [];

    while (true) {
        const { data, error } = await supabase
            .from('tracks')
            .select('id, artist, artist_id')
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
            console.error('Error fetching tracks:', error);
            break;
        }
        allTracks.push(...data);
        if (data.length < pageSize) break;
        page++;
    }

    console.log(`Loaded ${allTracks.length} tracks.`);

    // Unique trimmed artist names
    const artistNames = [...new Set(allTracks.map(t => (t.artist || '').trim()).filter(Boolean))];
    console.log(`Found ${artistNames.length} distinct artists.`);

    // Fetch existing artists
    const artistMap = {};
    for (let i = 0; i < artistNames.length; i += 500) {
        const batch = artistNames.slice(i, i + 500);
        const { data: artists } = await supabase
            .from('artists')
            .select('id, name')
            .in('name', batch);

        (artists || []).forEach(a => {
            artistMap[a.name.toLowerCase()] = a.id;
        });
    }

    // Insert missing artists
    const missing = artistNames.filter(name => !artistMap[name.toLowerCase()]);
    console.log(`Missing artists to insert: ${missing.length}`);

    for (let i = 0; i < missing.length; i += 200) {
        const batch = missing.slice(i, i + 200);
        const inserts = batch.map(name => ({
            name,
            slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
            track_count: 0
        }));

        const { data: inserted, error } = await supabase
            .from('artists')
            .insert(inserts)
            .select('id, name');

        if (error) {
            console.error('Artist batch insert error:', error);
        } else {
            (inserted || []).forEach(a => {
                artistMap[a.name.toLowerCase()] = a.id;
            });
        }
    }

    // Now update tracks whose artist_id does not match
    let updated = 0;
    for (const t of allTracks) {
        const cleanName = (t.artist || '').trim().toLowerCase();
        const expectedId = artistMap[cleanName];
        if (expectedId && t.artist_id !== expectedId) {
            await supabase.from('tracks').update({ artist_id: expectedId }).eq('id', t.id);
            updated++;
        }
    }

    console.log(`✅ Track-artist link sync complete! Updated ${updated} tracks.`);
}

syncArtists().catch(console.error);
