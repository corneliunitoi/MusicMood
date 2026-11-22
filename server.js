import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { resolveTrack, scrapePlaylistTracks } from './server/youtubeResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5173;
const DIST_DIR = path.join(__dirname, 'dist');

// ---------------------------------------------------------------------
// Security: API authentication, rate limiting, security headers
// ---------------------------------------------------------------------

// Public (publishable) Supabase settings, used only to verify user access tokens
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
});

const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const TOKEN_CACHE_MAX = 5000;
const tokenCache = new Map(); // token -> { userId, expiresAt }

/**
 * Returns the Supabase user id for a valid access token (Google users and
 * anonymous guests alike), or null. Results are cached for 5 minutes.
 */
async function verifyAccessToken(token) {
    if (!token || token.length > 4096) return null;
    const cached = tokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) return cached.userId;

    try {
        const { data, error } = await authClient.auth.getUser(token);
        if (error || !data?.user?.id) return null;
        if (tokenCache.size >= TOKEN_CACHE_MAX) {
            tokenCache.delete(tokenCache.keys().next().value);
        }
        tokenCache.set(token, { userId: data.user.id, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
        return data.user.id;
    } catch (e) {
        console.warn('[auth] Token verification failed:', e.message);
        return null;
    }
}

// Fixed-window rate limiter (single Render instance, in memory)
const rateBuckets = new Map(); // key -> { count, windowStart }
function isRateLimited(key, limit, windowMs = 60_000) {
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.windowStart >= windowMs) {
        rateBuckets.set(key, { count: 1, windowStart: now });
        return false;
    }
    bucket.count += 1;
    return bucket.count > limit;
}
setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of rateBuckets) {
        if (now - bucket.windowStart >= 60_000) rateBuckets.delete(key);
    }
    for (const [token, entry] of tokenCache) {
        if (entry.expiresAt <= now) tokenCache.delete(token);
    }
}, 60_000).unref();

const API_LIMITS = {
    '/api/resolve-track': { perUser: 60, perIp: 120 },
    '/api/playlist-tracks': { perUser: 10, perIp: 20 }
};

function clientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

function sendJson(res, status, body, extraHeaders = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders });
    res.end(JSON.stringify(body));
}

/**
 * Requires a signed-in session and enforces per-user and per-IP limits.
 * Returns the user id, or null after sending the error response.
 */
async function guardApiRequest(req, res, pathname) {
    const limits = API_LIMITS[pathname];
    const ip = clientIp(req);
    if (isRateLimited(`ip:${pathname}:${ip}`, limits.perIp)) {
        sendJson(res, 429, { error: 'Too many requests. Please slow down.' }, { 'Retry-After': '60' });
        return null;
    }

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const userId = await verifyAccessToken(token);
    if (!userId) {
        sendJson(res, 401, { error: 'Sign in required.' });
        return null;
    }

    if (isRateLimited(`user:${pathname}:${userId}`, limits.perUser)) {
        sendJson(res, 429, { error: 'Too many requests. Please slow down.' }, { 'Retry-After': '60' });
        return null;
    }
    return userId;
}

// Content Security Policy is shipped in report-only mode first: violations are
// logged in the browser console without blocking anything. Enforce once clean.
const CSP_REPORT_ONLY = [
    "default-src 'self'",
    "script-src 'self' https://www.youtube.com https://s.ytimg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
    `connect-src 'self' ${SUPABASE_URL} ${SUPABASE_URL.replace('https://', 'wss://')} https://www.googleapis.com https://itunes.apple.com https://ws.audioscrobbler.com https://musicbrainz.org https://en.wikipedia.org`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'"
].join('; ');

function applySecurityHeaders(res) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY);
}

// Origins allowed to call /api cross-origin: the Android app (Capacitor serves it from
// https://localhost). Override with APP_ORIGINS="https://a,https://b" if needed.
const APP_ORIGINS = new Set((process.env.APP_ORIGINS || 'https://localhost').split(',').map(s => s.trim()).filter(Boolean));

const MAX_TEXT_PARAM = 300;
const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{2,64}$/;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.webp': 'image/webp'
};

const server = http.createServer(async (req, res) => {
    applySecurityHeaders(res);

    let reqUrl;
    try {
        reqUrl = new URL(req.url, 'http://localhost');
    } catch {
        sendJson(res, 400, { error: 'Bad request.' });
        return;
    }

    // The Android app runs from its own origin and calls the API cross-origin.
    if (reqUrl.pathname.startsWith('/api/')) {
        const origin = req.headers.origin;
        if (origin && APP_ORIGINS.has(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Max-Age', '600');
        }
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
    }

    if (reqUrl.pathname.startsWith('/api/') && req.method !== 'GET') {
        sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' });
        return;
    }

    // API 1: /api/resolve-track
    if (reqUrl.pathname === '/api/resolve-track') {
        if (!(await guardApiRequest(req, res, reqUrl.pathname))) return;
        try {
            const artist = reqUrl.searchParams.get('artist') || '';
            const title = reqUrl.searchParams.get('title') || '';

            if (!title) {
                sendJson(res, 400, { error: 'Title required' });
                return;
            }
            if (title.length > MAX_TEXT_PARAM || artist.length > MAX_TEXT_PARAM) {
                sendJson(res, 400, { error: 'Artist or title too long.' });
                return;
            }

            const result = await resolveTrack(artist, title);
            sendJson(res, 200, result);
        } catch (err) {
            console.error('[api/resolve-track] Failed:', err);
            sendJson(res, 500, { error: 'Track lookup failed. Please try again.' });
        }
        return;
    }

    // API 2: /api/playlist-tracks
    if (reqUrl.pathname === '/api/playlist-tracks') {
        if (!(await guardApiRequest(req, res, reqUrl.pathname))) return;
        try {
            const raw = (reqUrl.searchParams.get('playlistId') || reqUrl.searchParams.get('url') || '').trim();
            if (!raw || raw.length > 500) {
                sendJson(res, 400, { error: 'playlistId or url parameter required' });
                return;
            }
            const listMatch = raw.match(/[?&]list=([A-Za-z0-9_-]+)/);
            const playlistId = listMatch ? listMatch[1] : raw;
            if (!PLAYLIST_ID_RE.test(playlistId)) {
                sendJson(res, 400, { error: 'Invalid playlist id or URL.' });
                return;
            }

            const result = await scrapePlaylistTracks(playlistId);
            sendJson(res, 200, result);
        } catch (err) {
            console.error('[api/playlist-tracks] Failed:', err);
            // Messages from YouTube itself (private / missing playlist) are safe and useful to show
            const safe = /^YouTube[: ]/.test(err?.message || '') ? err.message : 'Could not load this playlist. Please try again.';
            sendJson(res, 502, { error: safe });
        }
        return;
    }

    if (reqUrl.pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'Not found.' });
        return;
    }

    // Static File Serving with SPA fallback
    let safePath = path.normalize(reqUrl.pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') safePath = '/index.html';

    let filePath = path.join(DIST_DIR, safePath);

    fs.stat(filePath, (err, stats) => {
        if (!err && stats.isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType });
            fs.createReadStream(filePath).pipe(res);
        } else {
            // SPA fallback: return index.html for client-side routing
            const indexPath = path.join(DIST_DIR, 'index.html');
            fs.stat(indexPath, (indexErr, indexStats) => {
                if (!indexErr && indexStats.isFile()) {
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    fs.createReadStream(indexPath).pipe(res);
                } else {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('404 Not Found. Please run `npm run build` before starting the server.');
                }
            });
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🎵 MusicMood production server running on port ${PORT}`);
});
