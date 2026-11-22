/**
 * lookService.js
 *
 * Keeps the Look setting (mood skins) in the listener's profile so it follows them across
 * devices and to the Android app. The browser copy (moodSkins.loadLook/saveLook) stays for an
 * instant first paint; the profile copy wins once it has loaded.
 */
import { supabase } from './supabaseService';
import { normalizeLook } from './moodSkins';

/** Returns the saved Look setting, or null if the listener never saved one (or on error). */
export async function fetchProfileLook() {
    try {
        const { data, error } = await supabase.rpc('get_my_look');
        if (error) throw error;
        return data ? normalizeLook(data) : null;
    } catch (err) {
        console.warn('[Look] Could not load the saved Look setting:', err.message);
        return null;
    }
}

/** Saves the Look setting to the profile. Failures are logged; the browser copy still applies. */
export async function saveProfileLook(look) {
    try {
        const { data, error } = await supabase.rpc('save_my_look', { p_look: normalizeLook(look) });
        if (error) throw error;
        if (data && data.success === false) throw new Error(data.error || 'save failed');
        return true;
    } catch (err) {
        console.warn('[Look] Could not save the Look setting:', err.message);
        return false;
    }
}
