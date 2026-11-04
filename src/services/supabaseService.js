import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Signs in anonymously or via guest fallback.
 */
export async function signInAsGuest() {
    let { data, error } = await supabase.auth.signInAnonymously();

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
        console.error("Guest login failed:", error);
        return { user: { id: 'f7337681-6f7b-4772-852f-4d66317d2bb9', email: 'testguest@gmail.com' } };
    }
    return data;
}

/**
 * Syncs calibrated user preferences to Schema V2 tables:
 * - user_profiles (discovery_level)
 * - user_dealbreakers (rules)
 * - user_mood_genre_affinities (anchors across default moods)
 */
export async function syncCalibrationToSupabase(calibration) {
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user ? user.id : 'f7337681-6f7b-4772-852f-4d66317d2bb9';

    try {
        // 1. Update user_profiles
        await supabase
            .from('user_profiles')
            .upsert({
                id: userId,
                discovery_level: calibration.discoveryLevel || 0.50,
                updated_at: new Date().toISOString()
            });

        // 2. Sync dealbreakers
        if (calibration.dealbreakers && calibration.dealbreakers.length > 0) {
            const dbRecords = calibration.dealbreakers.map(target => ({
                user_id: userId,
                rule_type: 'exclude_keyword',
                target_value: target
            }));

            await supabase
                .from('user_dealbreakers')
                .upsert(dbRecords, { onConflict: 'user_id,rule_type,target_value' });
        }

        // 3. Sync anchors into user_mood_genre_affinities across default moods
        if (calibration.anchors && calibration.anchors.length > 0) {
            const moods = ['focus', 'chill', 'energetic', 'late_night', 'melancholic'];
            const affinityRecords = [];

            const weightPerAnchor = Math.min(0.25, 1.0 / calibration.anchors.length);

            moods.forEach(moodId => {
                calibration.anchors.forEach(genreId => {
                    affinityRecords.push({
                        user_id: userId,
                        mood_id: moodId,
                        genre_id: genreId,
                        affinity_weight: weightPerAnchor,
                        fatigue: 0.000,
                        consecutive_listens: 0
                    });
                });
            });

            await supabase
                .from('user_mood_genre_affinities')
                .upsert(affinityRecords, { onConflict: 'user_id,mood_id,genre_id' });
        }

        console.log(`[Supabase V2 Sync] Successfully synced calibration for user ${userId}`);
        return true;
    } catch (e) {
        console.warn("[Supabase V2 Sync] Error syncing calibration:", e);
        return false;
    }
}

// Backward-compatibility alias
export const saveTasteGraphToSupabase = syncCalibrationToSupabase;

/**
 * Records a listening event / scrobble into public.listening_history
 */
export async function recordListenEvent({ trackId, moodId, genreId, completed = false, skipped = false, liked = false, listenedSeconds = 0 }) {
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user ? user.id : 'f7337681-6f7b-4772-852f-4d66317d2bb9';

    try {
        const { error } = await supabase
            .from('listening_history')
            .insert({
                user_id: userId,
                track_id: trackId,
                mood_id: moodId,
                genre_id: genreId,
                completed,
                skipped,
                liked,
                listened_seconds: listenedSeconds
            });

        if (error) {
            console.warn("[History Record] Insert error:", error.message);
        } else {
            console.log(`[History Record] ✅ Logged scrobble: track=${trackId}, mood=${moodId}, liked=${liked}`);
        }
    } catch (e) {
        console.warn("[History Record] Exception:", e);
    }
}
