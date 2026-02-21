const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI;
const SCOPES = 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile';

export const getAuthUrl = () => {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.append('client_id', CLIENT_ID);
    url.searchParams.append('redirect_uri', REDIRECT_URI);
    url.searchParams.append('response_type', 'token'); // Implicit flow for simplicity in SPA
    url.searchParams.append('scope', SCOPES);
    url.searchParams.append('include_granted_scopes', 'true');
    url.searchParams.append('state', 'pass-through value');
    return url.toString();
};

export const handleAuthCallback = () => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');

    if (accessToken) {
        localStorage.setItem('youtube_access_token', accessToken);
        window.location.hash = ''; // Clear hash
        return accessToken;
    }
    return null;
};

export const getAccessToken = () => {
    return localStorage.getItem('youtube_access_token');
};

export const logout = () => {
    localStorage.removeItem('youtube_access_token');
};
