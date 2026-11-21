import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

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

function fixMojibake(str) {
    if (!str) return str;
    const mojibakeCount = (str.match(/[À-ÿ]/g) || []).length;
    if (mojibakeCount < 2) return str;

    try {
        const buf = Buffer.from(str, 'latin1');
        let decoded = '';
        for (let i = 0; i < buf.length; i++) {
            const b = buf[i];
            if (b >= 0xC0 && b <= 0xFF) {
                decoded += String.fromCharCode(0x0410 + (b - 0xC0));
            } else if (b === 0xA8) {
                decoded += 'Ё';
            } else if (b === 0xB8) {
                decoded += 'ё';
            } else {
                decoded += String.fromCharCode(b);
            }
        }
        if (/[а-яА-ЯёЁ]/.test(decoded)) {
            return decoded;
        }
    } catch (e) { }
    return str;
}

function titlesMatch(targetTitle, ytVideoTitle) {
    if (!targetTitle || !ytVideoTitle) return false;
    const cleanTarget = targetTitle.toLowerCase().replace(/[^a-z0-9а-яё]/gi, ' ').trim();
    const cleanYt = ytVideoTitle.toLowerCase().replace(/[^a-z0-9а-яё]/gi, ' ').trim();

    if (cleanYt.includes(cleanTarget) || cleanTarget.includes(cleanYt)) return true;

    const targetWords = cleanTarget.split(/\s+/).filter(w => w.length > 2);
    if (targetWords.length === 0) return true;
    const matchedWords = targetWords.filter(w => cleanYt.includes(w));
    return (matchedWords.length / targetWords.length) >= 0.5;
}

function isChannelOrJunkArtist(artist) {
    if (!artist || typeof artist !== 'string') return true;
    const clean = artist.trim().toLowerCase();
    if (clean.length < 2) return true;
    if (/^(unknown(\s*artist)?|various(\s*artists)?|track\s*[0-9]+|disc\s*[0-9]+|cd\s*[0-9]+)$/i.test(clean)) return true;

    if (/records|recordings|official|show|archives|hall of fame|vevo|npr|workshp|club|planet|archéologie|guitar|tv|radio|war|master|monster|alancox|proko|atsusiueno|jeffrey|rinconcete|unstitched|youmoretv|vaimusic/i.test(clean)) {
        return true;
    }
    if (/^[a-z0-9_]{10,}$/i.test(clean) && !clean.includes(' ')) return true;
    if (/[0-9]{2,}$/.test(clean)) return true;

    return false;
}

function cleanVideoTitle(rawTitle) {
    return (rawTitle || '')
        .replace(/\[(official\s*(music\s*)?video|audio|lyrics?|hd|4k|remastered?|live.*?|archive.*?)\]/gi, '')
        .replace(/\((official\s*(music\s*)?video|audio|lyrics?|hd|4k|remastered?|live.*?|upscaled|correct.*?)\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseTitleAndArtist(rawTitle, rawAuthor) {
    let title = cleanVideoTitle(rawTitle);
    let artist = (rawAuthor || '').replace(/\s*-\s*Topic$/i, '').trim();

    if (isChannelOrJunkArtist(artist) || !artist) {
        let matched = false;

        const byMatch = title.match(/^(.*?)\s+by\s+(?:the\s+)?([A-Za-z0-9\s&,.']+?)(?:\s+featuring.*|\s*\([0-9]+\)|\s*$)/i);
        if (byMatch && byMatch[2].trim().length >= 2) {
            artist = byMatch[2].trim();
            title = byMatch[1].trim();
            matched = true;
        }

        if (!matched) {
            const sepMatch = title.match(/^(.*?)\s*([–—~]|\s-\s|-(?=[A-Za-z0-9]))\s*(.*)$/);
            if (sepMatch) {
                const left = sepMatch[1].trim();
                const right = sepMatch[3].trim();
                if (left.length >= 2 && right.length >= 2) {
                    artist = left;
                    title = right;
                    matched = true;
                }
            }
        }

        if (!matched && title.includes(' / ')) {
            const parts = title.split(' / ');
            if (parts[0].length >= 2 && parts[1].length >= 2) {
                artist = parts[0].trim();
                title = parts.slice(1).join(' / ').trim();
                matched = true;
            }
        }

        if (!matched && title.includes(': ')) {
            const parts = title.split(': ');
            if (parts[0].length >= 2 && parts[0].length < 35 && parts[1].length >= 2) {
                artist = parts[0].trim();
                title = parts.slice(1).join(': ').trim();
                matched = true;
            }
        }

        if (!matched) {
            const quoteMatch = title.match(/^(.*?)\s*["“](.*?)["”]/);
            if (quoteMatch && quoteMatch[1].trim().length >= 2) {
                artist = quoteMatch[1].trim();
                title = quoteMatch[2].trim();
                matched = true;
            }
        }
    }

    title = title.replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '').trim();
    artist = artist.replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '').trim();

    return { artist: artist || rawAuthor || 'Unknown Artist', title: title || rawTitle };
}

async function scrapePlaylistViaInnertube(playlistId) {
    const browseId = playlistId.startsWith('VL') ? playlistId : 'VL' + playlistId;
    const res = await fetch('https://music.youtube.com/youtubei/v1/browse', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Origin': 'https://music.youtube.com',
            'Referer': 'https://music.youtube.com/'
        },
        body: JSON.stringify({
            context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', hl: 'en', gl: 'US' } },
            browseId: browseId
        })
    });
    if (!res.ok) return null;
    const data = await res.json();

    let title = 'YouTube Playlist';
    function findTitle(obj) {
        if (!obj || typeof obj !== 'object' || title !== 'YouTube Playlist') return;
        if (obj.musicResponsiveHeaderRenderer) {
            title = obj.musicResponsiveHeaderRenderer.title?.runs?.[0]?.text || title;
            return;
        }
        if (obj.musicDetailHeaderRenderer) {
            title = obj.musicDetailHeaderRenderer.title?.runs?.[0]?.text || title;
            return;
        }
        for (const v of Object.values(obj)) findTitle(v);
    }
    findTitle(data);

    const tracks = [];
    const seenIds = new Set();

    function extract(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (obj.musicResponsiveListItemRenderer) {
            const item = obj.musicResponsiveListItemRenderer;
            const flexCols = item.flexColumns || [];
            const trackTitle = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
            const authorRuns = flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
            const author = authorRuns
                .map(r => (r.text || '').trim())
                .filter(t => t && !/^(song|video|album|artist|single|ep|•|·|\s*)$/i.test(t))[0] || 'Unknown Artist';
            const videoId = item.playlistItemData?.videoId || item.doubleTapCommand?.watchEndpoint?.videoId;
            if (videoId && videoId.length === 11 && !seenIds.has(videoId)) {
                seenIds.add(videoId);
                tracks.push({
                    videoId,
                    title: trackTitle,
                    artist: author,
                    rawTitle: trackTitle,
                    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
                });
            }
            return;
        }
        for (const v of Object.values(obj)) extract(v);
    }
    extract(data);

    if (tracks.length > 0) {
        return { title, tracks };
    }
    return null;
}

async function scrapePlaylistTracks(playlistIdOrUrl) {
    let playlistId = playlistIdOrUrl;
    if (playlistId.includes('list=')) {
        const match = playlistId.match(/list=([a-zA-Z0-9_-]+)/);
        if (match) playlistId = match[1];
    }

    // Tier 1: Try YouTube Music InnerTube Browse first (fast, structured JSON, zero quota)
    try {
        const innerResult = await scrapePlaylistViaInnertube(playlistId);
        if (innerResult && innerResult.tracks && innerResult.tracks.length > 0) {
            return innerResult;
        }
    } catch (innerErr) {
        // Continue to standard HTML scrape fallback
    }

    // Tier 2: YouTube Web HTML Scraper fallback
    const url = `https://www.youtube.com/playlist?list=${playlistId}`;
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        }
    });

    if (!response.ok) {
        throw new Error(`YouTube responded with status ${response.status}`);
    }

    const html = await response.text();
    const match = html.match(/var ytInitialData = ({.*?});<\/script>/);
    if (!match) {
        throw new Error('Could not parse playlist metadata.');
    }

    const data = JSON.parse(match[1]);

    if (data.alerts && Array.isArray(data.alerts)) {
        for (const a of data.alerts) {
            if (a.alertRenderer?.type === 'ERROR') {
                const msg = a.alertRenderer?.text?.runs?.[0]?.text || a.alertRenderer?.text?.simpleText || 'Playlist is private or does not exist.';
                throw new Error(`YouTube: ${msg}`);
            }
        }
    }

    let playlistTitle = 'YouTube Playlist';
    try {
        playlistTitle = data.metadata?.playlistMetadataRenderer?.title ||
            data.header?.playlistHeaderRenderer?.title?.runs?.[0]?.text ||
            data.header?.playlistHeaderRenderer?.title?.simpleText ||
            'YouTube Playlist';
    } catch (e) {}

    const tracks = [];
    const seenIds = new Set();

    function traverse(obj) {
        if (!obj || typeof obj !== 'object') return;

        if (obj.lockupViewModel) {
            const vm = obj.lockupViewModel;
            const videoId = vm.contentId;
            if (videoId && videoId.length === 11 && !seenIds.has(videoId)) {
                seenIds.add(videoId);
                const meta = vm.metadata?.lockupMetadataViewModel;
                const rawTitle = meta?.title?.content || vm.rendererContext?.accessibilityContext?.label || '';
                const rawAuthor = meta?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content || '';
                const { artist, title } = parseTitleAndArtist(rawTitle, rawAuthor);
                const thumb = vm.contentImage?.thumbnailViewModel?.image?.sources?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
                tracks.push({
                    videoId,
                    title,
                    artist,
                    rawTitle,
                    thumbnail: thumb,
                });
            }
        }

        if (obj.playlistVideoRenderer) {
            const vr = obj.playlistVideoRenderer;
            const videoId = vr.videoId;
            if (videoId && videoId.length === 11 && !seenIds.has(videoId)) {
                seenIds.add(videoId);
                const rawTitle = vr.title?.runs?.[0]?.text || vr.title?.simpleText || '';
                const rawAuthor = vr.shortBylineText?.runs?.[0]?.text || '';
                const { artist, title } = parseTitleAndArtist(rawTitle, rawAuthor);
                const thumb = vr.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
                tracks.push({
                    videoId,
                    title,
                    artist,
                    rawTitle,
                    thumbnail: thumb,
                });
            }
        }

        for (const val of Object.values(obj)) {
            traverse(val);
        }
    }

    traverse(data);

    return {
        playlistId,
        title: playlistTitle,
        tracks,
        total: tracks.length
    };
}

async function resolveViaInnertube(cleanArtist, cleanTitle, isNumericArtist) {
    const primaryArtist = cleanArtist ? cleanArtist.split(/[,;&]/)[0].trim() : '';
    const queries = [];
    if (!isNumericArtist && cleanArtist) {
        queries.push(`"${cleanArtist}" "${cleanTitle}"`);
        if (primaryArtist && primaryArtist !== cleanArtist) {
            queries.push(`"${primaryArtist}" "${cleanTitle}"`);
        }
        queries.push(`${cleanArtist} ${cleanTitle}`);
    } else {
        queries.push(`${cleanTitle}`);
    }

    const INNERTUBE_URL = 'https://music.youtube.com/youtubei/v1/search';
    const INNERTUBE_BODY = {
        context: {
            client: {
                clientName: 'WEB_REMIX',
                clientVersion: '1.20240101.01.00',
                hl: 'en',
                gl: 'US'
            }
        }
    };

    for (const q of queries) {
        try {
            const res = await fetch(INNERTUBE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Origin': 'https://music.youtube.com',
                    'Referer': 'https://music.youtube.com/'
                },
                body: JSON.stringify({ ...INNERTUBE_BODY, query: q })
            });

            if (!res.ok) continue;
            const data = await res.json();
            const candidates = [];

            function extract(obj) {
                if (!obj || typeof obj !== 'object') return;
                if (obj.musicCardShelfRenderer) {
                    const shelf = obj.musicCardShelfRenderer;
                    const title = shelf.title?.runs?.[0]?.text || '';
                    const author = shelf.subtitle?.runs?.[0]?.text || '';
                    const videoId = shelf.onTap?.watchEndpoint?.videoId;
                    if (videoId && videoId.length === 11) candidates.push({ videoId, title, author });
                }
                if (obj.musicResponsiveListItemRenderer) {
                    const item = obj.musicResponsiveListItemRenderer;
                    const flexCols = item.flexColumns || [];
                    const title = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
                    const authorRuns = flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
                    const author = authorRuns
                        .map(r => (r.text || '').trim())
                        .filter(t => t && !/^(song|video|album|artist|single|ep|•|·|\s*)$/i.test(t))[0] || '';
                    const videoId = item.playlistItemData?.videoId || item.doubleTapCommand?.watchEndpoint?.videoId;
                    if (videoId && videoId.length === 11) candidates.push({ videoId, title, author });
                }
                for (const v of Object.values(obj)) extract(v);
            }

            extract(data);

            for (const c of candidates) {
                if (titlesMatch(cleanTitle, c.title)) {
                    let healed = cleanArtist;
                    if (isNumericArtist && c.author) {
                        healed = c.author.split('•')[0].trim();
                    }
                    return { videoId: c.videoId, artist: healed, title: cleanTitle, engine: 'innertube' };
                }
            }
        } catch (e) {}
    }
    return null;
}

const server = http.createServer(async (req, res) => {
    applySecurityHeaders(res);

    let reqUrl;
    try {
        reqUrl = new URL(req.url, 'http://localhost');
    } catch {
        sendJson(res, 400, { error: 'Bad request.' });
        return;
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

            let cleanArtist = fixMojibake(artist)
                .replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '')
                .replace(/\[[^\]]+\]/g, '')
                .trim();

            let cleanTitle = fixMojibake(title)
                .replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '')
                .replace(/\((Alternate|Remix|Live|Stem|Dublex|Prod\.|Demo|Version|Remaster).*?\)/gi, '')
                .replace(/\[.*?\]/g, '')
                .trim();

            const isNumericArtist = !cleanArtist || /^[0-9]+$/.test(cleanArtist);

            // Fast Tier 1: YouTube Music Innertube API
            const innertubeMatch = await resolveViaInnertube(cleanArtist, cleanTitle, isNumericArtist);
            if (innertubeMatch && innertubeMatch.videoId) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(innertubeMatch));
                return;
            }

            // Tier 2 Web search fallback
            const queries = [];
            if (!isNumericArtist) {
                queries.push(`"${cleanArtist}" "${cleanTitle}" Topic`);
                queries.push(`"${cleanArtist}" "${cleanTitle}"`);
                queries.push(`${cleanArtist} ${cleanTitle}`);
            } else {
                queries.push(`"${cleanTitle}" Topic`);
                queries.push(`${cleanTitle}`);
            }

            let resolvedId = null;
            let healedArtist = cleanArtist;

            for (const q of queries) {
                const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
                const response = await fetch(ytUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept-Language': 'en-US,en;q=0.9',
                    }
                });
                if (!response.ok) continue;

                const html = await response.text();
                const match = html.match(/var ytInitialData = ({.*?});<\/script>/);
                if (!match) continue;

                const data = JSON.parse(match[1]);
                const candidateVideos = [];

                function extractVideos(obj) {
                    if (!obj || typeof obj !== 'object') return;
                    if (obj.videoRenderer) {
                        const vr = obj.videoRenderer;
                        const videoId = vr.videoId;
                        const vTitle = vr.title?.runs?.[0]?.text || vr.title?.simpleText || '';
                        const vAuthor = vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || '';
                        if (videoId && videoId.length === 11) {
                            candidateVideos.push({ videoId, title: vTitle, author: vAuthor });
                        }
                        return;
                    }
                    for (const v of Object.values(obj)) extractVideos(v);
                }

                extractVideos(data);

                for (const candidate of candidateVideos) {
                    if (titlesMatch(cleanTitle, candidate.title)) {
                        resolvedId = candidate.videoId;
                        if (isNumericArtist && candidate.author) {
                            healedArtist = candidate.author.replace(/\s*-\s*Topic$/i, '').trim();
                        }
                        break;
                    }
                }
                if (resolvedId) break;
            }

            sendJson(res, 200, { videoId: resolvedId, artist: healedArtist, title: cleanTitle });
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
