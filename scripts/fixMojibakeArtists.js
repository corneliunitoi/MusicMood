import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanMojibake() {
    const PAGE_SIZE = 1000;
    let artists = [];
    let page = 0;
    while (true) {
        const { data, error } = await supabase
            .from('artists')
            .select('id, name, track_count')
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error || !data || data.length === 0) break;
        artists.push(...data);
        if (data.length < PAGE_SIZE) break;
        page++;
    }
    console.log(`Fetched ${artists.length} artists total.`);
    const corrupted = artists.filter(a =>
        /[\u4e00-\u9fff\u3400-\u4dbf]/.test(a.name) &&
        /[a-zA-Z]/.test(a.name) &&
        !/^[^\x00-\x7F]+$/.test(a.name)
    );

    console.log(`Found ${corrupted.length} artists with CJK mojibake in Latin names:`);
    for (const a of corrupted) {
        const cleaned = a.name.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef]+/g, '').trim();
        console.log(`  "${a.name}" -> "${cleaned}"`);

        if (cleaned && cleaned !== a.name) {
            // Update artist
            await supabase.from('artists').update({ name: cleaned }).eq('id', a.id);
            // Update tracks
            await supabase.from('tracks').update({ artist: cleaned }).eq('artist_id', a.id);
            await supabase.from('tracks').update({ artist: cleaned }).eq('artist', a.name);
        }
    }
    console.log('Done cleaning mojibake.');
}

cleanMojibake();
