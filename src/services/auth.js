import { supabase } from './supabaseService';
import { clearUserProfile } from './userService';

/**
 * Supabase Auth is the only source of identity.
 *   - Google sign-in:  supabase.auth.signInWithOAuth (full-page redirect)
 *   - Guests:          supabase.auth.signInAnonymously (one account per device)
 *   - Guest → Google:  supabase.auth.linkIdentity (keeps the guest's data)
 *
 * The Google access token (for YouTube playlist import) is the session's
 * provider_token. Supabase only returns it right after the OAuth redirect, so it
 * is kept in sessionStorage (tab-scoped, cleared when the tab closes) with its expiry.
 */

const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const PROVIDER_TOKEN_KEY = 'musicmood_google_provider_token';
const PROVIDER_TOKEN_TTL_MS = 55 * 60 * 1000; // Google access tokens last ~60 minutes

function redirectTarget() {
    return typeof window !== 'undefined' ? window.location.origin : undefined;
}

function storeProviderToken(token) {
    if (!token) return;
    try {
        sessionStorage.setItem(PROVIDER_TOKEN_KEY, JSON.stringify({ token, expiresAt: Date.now() + PROVIDER_TOKEN_TTL_MS }));
    } catch {
        /* storage unavailable: token stays usable for this page load only */
    }
}

function clearProviderToken() {
    try {
        sessionStorage.removeItem(PROVIDER_TOKEN_KEY);
    } catch {
        /* ignore */
    }
}

/**
 * Returns the Google access token for YouTube API calls, or null when the user
 * is a guest or the token has expired (the UI then offers "Reconnect YouTube").
 */
export function getYouTubeToken() {
    try {
        const raw = sessionStorage.getItem(PROVIDER_TOKEN_KEY);
        if (!raw) return null;
        const { token, expiresAt } = JSON.parse(raw);
        if (!token || Date.now() > expiresAt) {
            clearProviderToken();
            return null;
        }
        return token;
    } catch {
        return null;
    }
}

/**
 * Captures the provider token after the OAuth redirect lands back in the app.
 * Call once at startup, before rendering.
 */
export function watchAuthState(onChange) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.provider_token) {
            storeProviderToken(session.provider_token);
        }
        if (event === 'SIGNED_OUT') {
            clearProviderToken();
        }
        onChange?.(event, session);
    });
    return () => data?.subscription?.unsubscribe();
}

export async function getSession() {
    const { data } = await supabase.auth.getSession();
    const session = data?.session || null;
    if (session?.provider_token) storeProviderToken(session.provider_token);
    return session;
}

/**
 * Starts Google sign-in. If the current session is an anonymous guest, the Google
 * identity is linked to the guest account so favorites and history are kept.
 * The browser is redirected to Google and back; this promise resolves only on error.
 */
export async function signInWithGoogle({ forceConsent = false } = {}) {
    const session = await getSession();
    const options = {
        redirectTo: redirectTarget(),
        scopes: YOUTUBE_SCOPE,
        queryParams: { prompt: forceConsent ? 'consent' : 'select_account' }
    };

    if (session?.user?.is_anonymous) {
        const { error } = await supabase.auth.linkIdentity({ provider: 'google', options });
        if (!error) return;
        // The Google account may already belong to an existing MusicMood user:
        // fall back to a normal sign-in (the guest session is replaced).
        console.warn('[Auth] Linking Google to guest failed, signing in directly:', error.message);
    }

    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options });
    if (error) throw error;
}

/**
 * Starts (or resumes) an anonymous guest session. Each device gets its own account.
 */
export async function signInAsGuest() {
    const existing = await getSession();
    if (existing?.user) return existing;

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
        throw new Error(
            error.message?.toLowerCase().includes('disabled')
                ? 'Guest access is temporarily unavailable. Please sign in with Google.'
                : error.message
        );
    }
    return data.session;
}

export async function logout() {
    clearProviderToken();
    clearUserProfile();
    try {
        await supabase.auth.signOut();
    } catch (e) {
        console.warn('[Auth] Sign-out notice:', e.message);
    }
}
