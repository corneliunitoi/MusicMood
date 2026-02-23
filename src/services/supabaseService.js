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

/**
 * Signs in anonymously to Supabase for the guest mode.
 * Returns the user data, or throws an error.
 */
export async function signInAsGuest() {
    let { data, error } = await supabase.auth.signInAnonymously();

    // Fallback: If anonymous sign in is disabled in the Supabase Dashboard, use the global test account
    if (error && error.message.includes('disabled')) {
        console.warn("Anonymous sign-ins disabled on Supabase. Falling back to the shared 'testguest@gmail.com' account...");
        const fallbackLogin = await supabase.auth.signInWithPassword({
            email: 'testguest@gmail.com',
            password: 'guestpassword123'
        });
        error = fallbackLogin.error;
        data = fallbackLogin.data;
    }

    if (error) {
        console.error("Error signing in as guest, both Anonymous and Fallback failed:", error);
        // Instead of throwing an error which hard blocks the UI from showing the guest dashboard,
        // we can return a dummy data object so the user can still play with the UI in local mode.
        console.warn("Bypassing login block to allow local UI testing.");
        return { user: { id: 'local-test-guest', email: 'testguest@localhost' } };
    }
    return data;
}

/**
 * Saves the given JSON object to the user's taste_graph column in user_profiles.
 */
export async function saveTasteGraphToSupabase(tasteGraph) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.warn("No authenticated user found. Cannot save taste graph.");
        return null;
    }

    const { error } = await supabase
        .from('user_profiles')
        .upsert({ id: user.id, taste_graph: tasteGraph });

    if (error) {
        console.error("Error saving taste graph to Supabase:", error);
        throw error;
    }

    return true;
}
