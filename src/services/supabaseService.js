import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';

export const supabase = createClient(supabaseUrl, supabaseKey);

function getResolvedUserId() {
    try {
        const raw = localStorage.getItem('musicmood_user_profile');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.id) return parsed.id;
        }
    } catch (e) {}
    return 'f7337681-6f7b-4772-852f-4d66317d2bb9';
}

/**
 * Fetches staged artist suggestions (potential candidates awaiting catalog ingestion)
 */
export async function fetchArtistSuggestions(search = '', limit = 150) {
    try {
        let query = supabase
            .from('artist_suggestions')
            .select('id, name, slug, status, confidence_score, primary_genre_id, source, batch_id, created_at, is_requested, request_count, demo_youtube_id, demo_track_title')
            .neq('status', 'rejected')
            .neq('status', 'inflated')
            .eq('is_requested', false)
            .order('confidence_score', { ascending: false })
            .order('name', { ascending: true })
            .limit(limit);

        if (search && search.trim()) {
            query = query.ilike('name', `%${search.trim()}%`);
        }

        const { data, error } = await query;
        if (error) {
            console.error('[supabaseService] Error fetching artist_suggestions:', error);
            return [];
        }
        return data || [];
    } catch (e) {
        console.error('[supabaseService] Error:', e);
        return [];
    }
}

/**
 * Submits a live database request for a staged artist to be prioritized for catalog ingestion
 */
export async function submitArtistRequest(artistId) {
    try {
        // 1. Try RPC if defined
        await supabase.rpc('request_staged_artist', { p_artist_id: artistId }).catch(() => {});

        // 2. Mark artist as requested and approved in artist_suggestions
        const { error } = await supabase
            .from('artist_suggestions')
            .update({
                is_requested: true,
                status: 'approved',
                last_requested_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', artistId);

        if (error) {
            console.error('[supabaseService] Error submitting artist request:', error);
            return { success: false, error: error.message };
        }
        return { success: true };
    } catch (e) {
        console.error('[supabaseService] Error requesting artist:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Rejects and dismisses a staged artist suggestion so they never appear again
 */
export async function rejectArtistSuggestion(artistId) {
    try {
        const { error } = await supabase
            .from('artist_suggestions')
            .update({
                status: 'rejected',
                rejection_reason: 'user_dismissed',
                updated_at: new Date().toISOString()
            })
            .eq('id', artistId);

        if (error) {
            console.error('[supabaseService] Error rejecting artist suggestion:', error);
            return { success: false, error: error.message };
        }
        return { success: true };
    } catch (e) {
        console.error('[supabaseService] Error rejecting artist suggestion:', e);
        return { success: false, error: e.message };
    }
}
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
    const userId = getResolvedUserId();

    try {
        // Primary: use RPC function with SECURITY DEFINER
        const { error: rpcError } = await supabase.rpc('sync_user_calibration', {
            p_user_id: userId,
            p_calibration: calibration
        });

        if (!rpcError) {
            console.log(`[Supabase V2 Sync] Synced calibration for user ${userId} via RPC`);
            return true;
        }

        console.warn('[Supabase V2 Sync] RPC notice, trying direct upsert:', rpcError.message);

        // Fallback: direct table updates
        await supabase
            .from('user_profiles')
            .upsert({
                id: userId,
                calibration: calibration,
                discovery_level: calibration.discoveryLevel || 0.50,
                updated_at: new Date().toISOString()
            });

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
 * Fetches user calibration (including 6-point Sonic Radar values) from Supabase
 */
export async function fetchUserCalibration(userId) {
    const targetUserId = userId || getResolvedUserId();
    if (!targetUserId) return null;

    try {
        const { data, error } = await supabase.rpc('get_user_calibration', {
            p_user_id: targetUserId
        });

        if (!error && data && Object.keys(data).length > 0 && data.radarValues) {
            console.log(`[Supabase Calibration] Hydrated calibration for user ${targetUserId} via RPC`);
            return data;
        }

        // Direct select fallback
        const { data: profileData, error: profileErr } = await supabase
            .from('user_profiles')
            .select('calibration')
            .eq('id', targetUserId)
            .single();

        if (!profileErr && profileData?.calibration && Object.keys(profileData.calibration).length > 0) {
            console.log(`[Supabase Calibration] Hydrated calibration for user ${targetUserId} via direct query`);
            return profileData.calibration;
        }
    } catch (e) {
        console.warn('[Supabase Calibration] Error fetching user calibration:', e);
    }
    return null;
}

/**
 * Records a listening event / scrobble into public.listening_history
 */
export async function recordListenEvent({ trackId, moodId, genreId, completed = false, skipped = false, liked = false, listenedSeconds = 0 }) {
    const userId = getResolvedUserId();

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
            console.log(`[History Record] ✅ Logged scrobble: track=${trackId}, mood=${moodId}, user=${userId}`);
        }
    } catch (e) {
        console.warn("[History Record] Exception:", e);
    }
}

/**
 * Submits user feedback to public.feedback
 */
export async function submitUserFeedback({ name, comment, userId }) {
    const targetUserId = userId || getResolvedUserId();
    const { error } = await supabase
        .from('feedback')
        .insert({
            user_id: targetUserId,
            name: name?.trim() || null,
            comment: comment.trim()
        });

    if (error) {
        console.error('[Feedback] Submission error:', error);
        throw error;
    }
    return true;
}

/**
 * Flags a track for genre misclassification in public.track_genre_flags
 */
export async function flagTrackMisclassification({ track, userId, notes, suggestedGenreId }) {
    if (!track) throw new Error("A valid track is required to flag misclassification.");
    
    let trackId = track.dbId;
    if (!trackId && track.id) {
        // Query tracks table by youtube_video_id
        const { data } = await supabase
            .from('tracks')
            .select('id')
            .eq('youtube_video_id', track.id)
            .maybeSingle();
        if (data?.id) {
            trackId = data.id;
        }
    }
    if (!trackId) {
        throw new Error("Cannot find catalog track ID in database to flag.");
    }

    const targetUserId = userId || getResolvedUserId();
    const currentGenreId = track.genre || track.primary_genre_id || null;

    const { data, error } = await supabase
        .from('track_genre_flags')
        .upsert({
            track_id: trackId,
            user_id: targetUserId,
            current_genre_id: currentGenreId,
            suggested_genre_id: suggestedGenreId || null,
            notes: notes ? notes.trim() : null,
            status: 'pending'
        }, { onConflict: 'track_id,user_id' });

    if (error) {
        console.error('[TrackFlag] Error submitting misclassification flag:', error);
        throw error;
    }
    return data;
}

/**
 * Upvotes a track and artist, bumping their popularity and affinity in the database.
 */
export async function upvoteTrack({ videoId, artist, delta = 1 }) {
    if (!videoId && !artist) return null;

    try {
        const { data, error } = await supabase.rpc('upvote_track', {
            p_video_id: videoId || '',
            p_artist: artist || '',
            p_delta: delta
        });

        if (error) {
            console.warn('[UpvoteTrack] RPC error:', error.message);
            return null;
        }
        return data;
    } catch (e) {
        console.warn('[UpvoteTrack] Exception:', e);
        return null;
    }
}

