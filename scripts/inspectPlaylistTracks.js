import { supabase } from '../src/services/supabaseService.js';

async function main() {
    const { data: tracks, error } = await supabase
        .from('tracks')
        .select('id, title, artist, source, primary_genre_id')
        .ilike('source', 'yt_pl:%');

    if (error) {
        console.error('Error fetching tracks:', error);
        return;
    }

    console.log(`Total yt_pl tracks found: ${tracks.length}`);
    tracks.forEach((t, i) => {
        console.log(`[${i + 1}] (${t.source} | ${t.primary_genre_id}) Artist: "${t.artist}" | Title: "${t.title}"`);
    });
}

main().catch(console.error);
