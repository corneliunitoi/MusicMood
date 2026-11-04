import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Supabase credentials missing");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function purgeCorruptTracks() {
    console.log("=========================================");
    console.log("🧹 Purging Corrupt Tracks from Database");
    console.log("=========================================\n");

    // 1. Delete from public.tracks where marked as CORRUPT_TAGS
    const { data: deletedTracks, error: trackError } = await supabase
        .from('tracks')
        .delete()
        .eq('youtube_video_id', 'CORRUPT_TAGS')
        .select('id, artist, title');

    if (trackError) {
        console.error("❌ Error deleting from tracks table:", trackError.message);
    } else {
        console.log(`✅ Deleted ${deletedTracks.length} corrupt tracks from public.tracks table.`);
    }

    // 2. Also check if any remaining tracks have invalid short artist or purely numeric title
    const { data: remaining, error: findError } = await supabase
        .from('tracks')
        .select('id, artist, title')
        .or('artist.ilike.cd %,artist.ilike.disc %,artist.ilike.track %');

    if (remaining && remaining.length > 0) {
        const ids = remaining.map(t => t.id);
        const { error: delRemError } = await supabase
            .from('tracks')
            .delete()
            .in('id', ids);

        if (!delRemError) {
            console.log(`✅ Deleted additional ${ids.length} corrupted CD/Disc tracks.`);
        }
    }

    // 3. Purge from legacy local_metadata
    const { data: corruptLocal, error: localFindError } = await supabase
        .from('local_metadata')
        .select('id, track_name, artist');

    if (corruptLocal && corruptLocal.length > 0) {
        const JUNK_ARTIST_REGEX = /^(cd\s*[0-9]+|disc\s*[0-9]+|track\s*[0-9]+|unknown(\s*artist)?)$/i;
        const JUNK_TITLE_REGEX = /^[0-9]+$/;
        
        const toDelete = corruptLocal
            .filter(t => {
                const a = (t.artist || '').trim();
                const tr = (t.track_name || '').trim();
                return a.length < 2 || tr.length < 2 || JUNK_ARTIST_REGEX.test(a) || JUNK_TITLE_REGEX.test(tr);
            })
            .map(t => t.id);

        if (toDelete.length > 0) {
            // Delete in batches of 100
            for (let i = 0; i < toDelete.length; i += 100) {
                const chunk = toDelete.slice(i, i + 100);
                await supabase.from('local_metadata').delete().in('id', chunk);
            }
            console.log(`✅ Deleted ${toDelete.length} corrupt records from local_metadata.`);
        }
    }

    // 4. Verify total remaining in tracks
    const { count, error: countError } = await supabase
        .from('tracks')
        .select('*', { count: 'exact', head: true });

    if (!countError) {
        console.log(`\n🎉 Total clean tracks remaining in catalog: ${count}`);
    }
}

purgeCorruptTracks();
