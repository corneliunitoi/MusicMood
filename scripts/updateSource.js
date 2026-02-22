import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateAllSources() {
    console.log("Starting bulk update of sources to 'ko-local'...");

    // To bypass potential update-without-where limits, we can match all where source is not 'ko-local' or is null
    const { data, error } = await supabase
        .from('local_metadata')
        .update({ source: 'ko-local' })
        .or('source.neq.ko-local,source.is.null');

    if (error) {
        console.error("Failed to update sources:", error);
    } else {
        console.log("Successfully updated records.");
    }
}

updateAllSources();
