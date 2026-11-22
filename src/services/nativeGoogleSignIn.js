/**
 * Native Google sign-in for the Android app (Capacitor).
 *
 * Android's Credential Manager shows Google's own account chooser and returns a Google ID token.
 * auth.js hands that token to Supabase (signInWithIdToken / linkIdentity), so no browser redirect
 * is involved. Only used when Capacitor.isNativePlatform(); the plugin is loaded on demand so the
 * website bundle never carries it.
 *
 * Setup (see ANDROID_BUILD.md):
 *   - VITE_GOOGLE_WEB_CLIENT_ID = the *Web* OAuth client ID (the same one Supabase uses).
 *     Credential Manager needs the Web ID here, never the Android one.
 *   - An *Android* OAuth client in the same Google Cloud project, registered with package
 *     uk.co.musicmood and the SHA-1 of the key that signed the installed APK.
 */

const GOOGLE_WEB_CLIENT_ID = import.meta.env?.VITE_GOOGLE_WEB_CLIENT_ID || '';

function toHex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return toHex(new Uint8Array(digest));
}

/**
 * A fresh nonce pair. Google receives the hash and puts it in the ID token; Supabase receives the
 * raw value and re-hashes it to check the token was minted for this very sign-in (replay protection).
 */
export async function createNonce() {
    const raw = toHex(globalThis.crypto.getRandomValues(new Uint8Array(32)));
    return { raw, hashed: await sha256Hex(raw) };
}

let pluginPromise = null;

function loadPlugin() {
    if (!pluginPromise) {
        pluginPromise = import('@capgo/capacitor-social-login')
            .then(async ({ SocialLogin }) => {
                await SocialLogin.initialize({
                    google: {
                        webClientId: GOOGLE_WEB_CLIENT_ID,
                        // We only need the ID token; skip the extra "authorize" step that asks for an access token.
                        skipAuthOnlyAuthorizationAfterSignIn: true
                    }
                });
                return SocialLogin;
            })
            .catch((err) => {
                pluginPromise = null; // allow a retry
                throw err;
            });
    }
    return pluginPromise;
}

function isCancellation(err) {
    return /cancel|dismiss/i.test(`${err?.code ?? ''} ${err?.message ?? ''}`);
}

/**
 * Opens Google's account chooser. Resolves { idToken, nonce } (raw nonce for Supabase),
 * or null when the listener closes the chooser.
 */
export async function requestGoogleIdToken() {
    if (!GOOGLE_WEB_CLIENT_ID) {
        throw new Error('Google sign-in is not configured in this build (VITE_GOOGLE_WEB_CLIENT_ID is missing).');
    }
    const plugin = await loadPlugin();
    const nonce = await createNonce();
    let response;
    try {
        response = await plugin.login({ provider: 'google', options: { nonce: nonce.hashed } });
    } catch (err) {
        if (isCancellation(err)) return null;
        throw err;
    }
    const idToken = response?.result?.idToken;
    if (!idToken) throw new Error('Google did not return a sign-in token. Please try again.');
    return { idToken, nonce: nonce.raw };
}

/** Forgets Google's remembered account so the next sign-in shows the chooser. Never throws. */
export async function signOutNativeGoogle() {
    if (!pluginPromise) return;
    try {
        const plugin = await pluginPromise;
        await plugin.logout({ provider: 'google' });
    } catch {
        /* nothing to clear */
    }
}
