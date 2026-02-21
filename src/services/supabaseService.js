import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Syncs an array of track metadata objects to the Supabase local_metadata table in batches.
 * @param {Array} tracks - Array of { artist, track_name, genre } objects.
 * @param {Function} onProgress - Callback for UI progress updates.
 */
export async function syncLocalTracksToSupabase(tracks, onProgress) {
    if (!tracks || tracks.length === 0) {
        throw new Error("No tracks provided to sync.");
    }

    const BATCH_SIZE = 500; // Safe batch size for Supabase inserts
    let totalProcessed = 0;

    for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
        const batch = tracks.slice(i, i + BATCH_SIZE);

        // Supabase upsert (we'll rely on generating a new UUID in the database or ignore duplicates based on constraints if user set them)
        // Since we don't have natural UUIDs from the files, we'll just insert. 
        // A better long term approach would hash Artist+Track as the primary key.
        const { error } = await supabase
            .from('local_metadata')
            .insert(batch);

        if (error) {
            console.error("Error bulk inserting tracks:", error);
            throw new Error(`Failed to sync batch starting at index ${i}: ${error.message}`);
        }

        totalProcessed += batch.length;
        if (onProgress) onProgress(totalProcessed, tracks.length);
    }

    return totalProcessed;
}
