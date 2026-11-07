import { supabase, fetchUserCalibration, syncCalibrationToSupabase } from './supabaseService.js';
import { syncCloudFavorites, loadCloudFavorites } from './favoritesService.js';
import { sessionEngine } from './sessionStateMachine.js';

const USER_STORAGE_KEY = 'musicmood_user_profile';
const REAL_USER_BACKUP_KEY = 'musicmood_real_user_profile';
const PERSONA_OVERRIDE_KEY = 'musicmood_persona_override';
const USER_EVENT_NAME = 'musicmood:user_updated';

// Pre-defined personas for validation testing across roles & classes
export const TEST_PERSONAS = [
    {
        key: 'admin_poweruser',
        name: 'Corneliu (Admin)',
        email: 'corneliunitoi@gmail.com',
        role: 'admin',
        user_class: 'poweruser',
        badge: '👑 ADMIN • POWERUSER',
        description: 'Super-Admin privileges + Poweruser unmetered access'
    },
    {
        key: 'beta_tester',
        name: 'Alex (Beta Tester)',
        email: 'alex.beta@musicmood.local',
        role: 'user',
        user_class: 'beta',
        badge: '🧪 BETA TESTER',
        description: 'Regular user permissions + unreleased experimental features'
    },
    {
        key: 'regular_user',
        name: 'Sarah (Regular Listener)',
        email: 'sarah.listener@musicmood.local',
        role: 'user',
        user_class: 'regular',
        badge: '👤 REGULAR',
        description: 'Standard clean consumer experience, no dev/admin UI'
    },
    {
        key: 'guest_user',
        name: 'Guest User',
        email: 'testguest@gmail.com',
        role: 'guest',
        user_class: 'guest',
        badge: '👻 GUEST',
        description: 'Anonymous guest listener session'
    }
];

// In-memory cached profile for synchronous queries
let cachedProfile = null;

try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (raw) cachedProfile = JSON.parse(raw);
} catch (e) {
    console.warn('[UserService] Error reading cached user profile:', e);
}

/**
 * Returns the currently active user profile.
 */
export function getCurrentUser() {
    if (!cachedProfile) {
        try {
            const raw = localStorage.getItem(USER_STORAGE_KEY);
            if (raw) cachedProfile = JSON.parse(raw);
        } catch (e) {}
    }
    return cachedProfile;
}

/**
 * Returns the current role: 'admin' | 'user' | 'guest'
 */
export function getRole() {
    const user = getCurrentUser();
    return user?.role || 'user';
}

/**
 * Returns true if the active user has administrative powers.
 */
export function isAdmin() {
    return getRole() === 'admin';
}

/**
 * Returns the current user class: 'poweruser' | 'regular' | 'beta' | 'guest'
 */
export function getUserClass() {
    const user = getCurrentUser();
    return user?.user_class || 'regular';
}

/**
 * Returns true if the user belongs to the 'poweruser' class.
 */
export function isPowerUser() {
    return getUserClass() === 'poweruser';
}

/**
 * Returns true if the user has beta privileges or higher.
 */
export function isBetaTester() {
    const cls = getUserClass();
    return cls === 'beta' || cls === 'poweruser';
}

/**
 * Flexible feature gate: checks if active user is entitled to view/use a given feature.
 */
export function canAccess(featureKey) {
    switch (featureKey) {
        case 'admin_panel':
        case 'schema_management':
            return isAdmin();
        case 'jit_monitor':
        case 'unlimited_ingest':
            return isAdmin() || isPowerUser();
        case 'experimental_ai':
        case 'advanced_audio_vectors':
            return isAdmin() || isPowerUser() || isBetaTester();
        default:
            return true;
    }
}

/**
 * Initializes or resolves a user profile from Google OAuth payload.
 * Upserts identity to public.user_profiles via Supabase RPC resolve_or_create_user.
 */
export async function initUserProfile(googlePayload) {
    // If a test persona override is active, respect it
    const activeOverride = localStorage.getItem(PERSONA_OVERRIDE_KEY);
    if (activeOverride && cachedProfile?.isTestUser) {
        return cachedProfile;
    }

    if (!googlePayload || !googlePayload.sub) {
        const guestProfile = {
            id: 'f7337681-6f7b-4772-852f-4d66317d2bb9',
            username: googlePayload?.name || 'Guest User',
            email: 'testguest@gmail.com',
            avatar_url: googlePayload?.picture || 'https://ui-avatars.com/api/?name=Guest+User&background=646cff&color=fff',
            role: 'guest',
            user_class: 'guest',
            isGuest: true,
            isAdmin: false,
            isPowerUser: false
        };
        cachedProfile = guestProfile;
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(guestProfile));
        window.dispatchEvent(new CustomEvent(USER_EVENT_NAME, { detail: { user: guestProfile } }));
        return guestProfile;
    }

    try {
        const isTargetAdmin = (googlePayload.email && googlePayload.email.toLowerCase() === 'corneliunitoi@gmail.com');
        const defaultClass = isTargetAdmin ? 'poweruser' : 'regular';

        const { data, error } = await supabase.rpc('resolve_or_create_user', {
            p_google_id: googlePayload.sub,
            p_email: googlePayload.email || '',
            p_name: googlePayload.name || '',
            p_picture: googlePayload.picture || '',
            p_user_class: defaultClass
        });

        if (error) {
            console.error('[UserService] Failed to resolve user profile via RPC:', error);
            throw error;
        }

        let calibration = data.calibration;
        if (!calibration || Object.keys(calibration).length === 0 || !calibration.radarValues) {
            // Check fallback from fetchUserCalibration
            const fetched = await fetchUserCalibration(data.id);
            if (fetched) calibration = fetched;
        }

        const profile = {
            id: data.id,
            googleId: googlePayload.sub,
            username: data.username || googlePayload.name,
            email: data.email || googlePayload.email,
            avatar_url: data.avatar_url || googlePayload.picture,
            role: data.role || (isTargetAdmin ? 'admin' : 'user'),
            user_class: data.user_class || defaultClass,
            discovery_level: data.discovery_level ?? 0.50,
            calibration: calibration || null,
            isAdmin: (data.role === 'admin' || isTargetAdmin),
            isPowerUser: (data.user_class === 'poweruser' || isTargetAdmin)
        };

        // Cross-device synchronization of Sonic Radar calibration
        if (calibration && Object.keys(calibration).length > 0 && calibration.radarValues) {
            localStorage.setItem('musicMood_user_calibration', JSON.stringify(calibration));
            sessionEngine.saveCalibration(calibration);
            console.log(`[UserService 🎯] Hydrated Sonic Radar & calibration from Supabase for ${profile.username}`);
        } else {
            // If cloud profile has no calibration, push existing local calibration up to cloud
            const localCalib = sessionEngine.getCalibration();
            if (localCalib && localCalib.radarValues) {
                syncCalibrationToSupabase(localCalib).then(() => {
                    console.log(`[UserService ☁️] Migrated local Sonic Radar calibration to Supabase`);
                }).catch(() => {});
            }
        }

        cachedProfile = profile;
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(profile));
        localStorage.setItem(REAL_USER_BACKUP_KEY, JSON.stringify(profile));
        window.dispatchEvent(new CustomEvent(USER_EVENT_NAME, { detail: { user: profile } }));

        console.log(`[UserService] Active Profile: ${profile.username} | Role: ${profile.role} | Class: ${profile.user_class}`);

        // Hydrate cloud favorites in background
        loadCloudFavorites(profile.id).catch(err => {
            console.warn('[UserService] Cloud favorites notice:', err);
        });

        return profile;
    } catch (err) {
        console.warn('[UserService] Fallback to in-memory profile:', err.message);
        const isTargetAdmin = (googlePayload.email && googlePayload.email.toLowerCase() === 'corneliunitoi@gmail.com');
        const fallback = {
            id: 'f7337681-6f7b-4772-852f-4d66317d2bb9',
            username: googlePayload.name || 'Listener',
            email: googlePayload.email || '',
            avatar_url: googlePayload.picture || '',
            role: isTargetAdmin ? 'admin' : 'user',
            user_class: isTargetAdmin ? 'poweruser' : 'regular',
            isAdmin: isTargetAdmin,
            isPowerUser: isTargetAdmin
        };
        cachedProfile = fallback;
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(fallback));
        return fallback;
    }
}

/**
 * Switches the active profile to a specific test persona for feature validation.
 */
export async function switchTestPersona(personaKey) {
    if (personaKey === 'real') {
        localStorage.removeItem(PERSONA_OVERRIDE_KEY);
        const realRaw = localStorage.getItem(REAL_USER_BACKUP_KEY);
        if (realRaw) {
            const realProfile = JSON.parse(realRaw);
            cachedProfile = realProfile;
            localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(realProfile));
            window.dispatchEvent(new CustomEvent(USER_EVENT_NAME, { detail: { user: realProfile } }));
            loadCloudFavorites(realProfile.id).catch(console.warn);
            return realProfile;
        }
        return getCurrentUser();
    }

    const persona = TEST_PERSONAS.find(p => p.key === personaKey);
    if (!persona) return getCurrentUser();

    // Preserve real user if not already backed up
    if (!localStorage.getItem(REAL_USER_BACKUP_KEY) && cachedProfile && !cachedProfile.isTestUser) {
        localStorage.setItem(REAL_USER_BACKUP_KEY, JSON.stringify(cachedProfile));
    }

    try {
        const { data, error } = await supabase.rpc('resolve_or_create_test_user', {
            p_test_key: persona.key,
            p_name: persona.name,
            p_role: persona.role,
            p_user_class: persona.user_class
        });

        const testProfile = {
            id: data?.id || `test-id-${persona.key}`,
            username: data?.username || persona.name,
            email: data?.email || persona.email,
            avatar_url: data?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(persona.name)}&background=random`,
            role: data?.role || persona.role,
            user_class: data?.user_class || persona.user_class,
            isAdmin: (data?.role || persona.role) === 'admin',
            isPowerUser: (data?.user_class || persona.user_class) === 'poweruser',
            isTestUser: true,
            personaKey: persona.key
        };

        cachedProfile = testProfile;
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(testProfile));
        localStorage.setItem(PERSONA_OVERRIDE_KEY, persona.key);
        window.dispatchEvent(new CustomEvent(USER_EVENT_NAME, { detail: { user: testProfile } }));

        // Hydrate favorites for this persona
        loadCloudFavorites(testProfile.id).catch(console.warn);

        return testProfile;
    } catch (e) {
        console.warn('[UserService] Local test user simulation fallback:', e.message);
        const testProfile = {
            id: `test-id-${persona.key}`,
            username: persona.name,
            email: persona.email,
            avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(persona.name)}&background=random`,
            role: persona.role,
            user_class: persona.user_class,
            isAdmin: persona.role === 'admin',
            isPowerUser: persona.user_class === 'poweruser',
            isTestUser: true,
            personaKey: persona.key
        };
        cachedProfile = testProfile;
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(testProfile));
        localStorage.setItem(PERSONA_OVERRIDE_KEY, persona.key);
        window.dispatchEvent(new CustomEvent(USER_EVENT_NAME, { detail: { user: testProfile } }));
        return testProfile;
    }
}

/**
 * Returns true if a simulated test user is currently active.
 */
export function isTestUserActive() {
    return Boolean(localStorage.getItem(PERSONA_OVERRIDE_KEY));
}

/**
 * Clears the active user session and test overrides.
 */
export function clearUserProfile() {
    cachedProfile = null;
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(REAL_USER_BACKUP_KEY);
    localStorage.removeItem(PERSONA_OVERRIDE_KEY);
    window.dispatchEvent(new CustomEvent(USER_EVENT_NAME, { detail: { user: null } }));
}

/**
 * Subscribes to user profile changes.
 */
export function subscribeUser(callback) {
    const handler = (e) => {
        callback(e.detail?.user || getCurrentUser());
    };
    window.addEventListener(USER_EVENT_NAME, handler);
    return () => window.removeEventListener(USER_EVENT_NAME, handler);
}
