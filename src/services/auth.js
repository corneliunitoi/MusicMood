import { clearUserProfile } from './userService';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '1065565283381-rkar9ei7i90mnbtlc0ikofcdfoosbr5r.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';

let tokenClient = null;

/**
 * Ensures Google Identity Services (GIS) client library is loaded.
 */
function waitForGoogleScript(timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
        if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
            resolve(window.google.accounts.oauth2);
            return;
        }

        const start = Date.now();
        const interval = setInterval(() => {
            if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
                clearInterval(interval);
                resolve(window.google.accounts.oauth2);
            } else if (Date.now() - start > timeoutMs) {
                clearInterval(interval);
                reject(new Error('Google Identity Services script failed to load. Please verify your connection or ad blocker.'));
            }
        }, 100);
    });
}

/**
 * Initiates Google OAuth popup login via Google Identity Services (GIS).
 * Complies 100% with Google's modern "Secure Response Handling" policy.
 * Does NOT require full-page redirects or redirect URIs.
 * @param {Object} options Options like { prompt: 'consent' } to force scope consent
 */
export async function requestGoogleLogin(options = { prompt: 'consent' }) {
    const oauth2 = await waitForGoogleScript();

    return new Promise((resolve, reject) => {
        try {
            tokenClient = oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: (tokenResponse) => {
                    if (tokenResponse.error) {
                        console.error('[Google OAuth Error]', tokenResponse);
                        reject(new Error(tokenResponse.error_description || tokenResponse.error));
                        return;
                    }

                    if (tokenResponse.access_token) {
                        localStorage.setItem('youtube_access_token', tokenResponse.access_token);
                        resolve(tokenResponse.access_token);
                    } else {
                        reject(new Error('No access token received from Google.'));
                    }
                },
                error_callback: (err) => {
                    console.error('[Google Client Init Error]', err);
                    reject(new Error(err.message || 'Google Sign-In was cancelled or failed.'));
                }
            });

            // Trigger the Google OAuth popup with explicit consent if requested
            tokenClient.requestAccessToken({ prompt: options.prompt || 'consent' });
        } catch (e) {
            reject(e);
        }
    });
}

export const getAccessToken = () => {
    return localStorage.getItem('youtube_access_token');
};

export const logout = () => {
    const token = getAccessToken();
    if (token && typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
        try {
            window.google.accounts.oauth2.revoke(token, () => {
                console.log('[Google OAuth] Token revoked cleanly');
            });
        } catch (e) {}
    }
    localStorage.removeItem('youtube_access_token');
    clearUserProfile();
};

// Backward-compatibility stubs
export const getAuthUrl = () => '';
export const handleAuthCallback = () => getAccessToken();
