import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function getGenres() {
    const { data, error } = await supabase
        .from('local_metadata')
        .select('genre')
        .not('genre', 'is', null);

    if (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }

    // Count occurrences of each genre
    const counts = {};
    for (const row of data) {
        const g = row.genre?.trim();
        if (g) counts[g] = (counts[g] || 0) + 1;
    }

    // Sort by count descending
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    console.log(`\nTotal unique genres: ${sorted.length}`);
    console.log('\nGenre Distribution:');
    for (const [genre, count] of sorted) {
        console.log(`  ${count.toString().padStart(5)}  ${genre}`);
    }
}

getGenres();
