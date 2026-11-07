import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5173;
const DIST_DIR = path.join(__dirname, 'dist');

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

async function scrapePlaylistTracks(playlistIdOrUrl) {
    let playlistId = playlistIdOrUrl;
    if (playlistId.includes('list=')) {
        const match = playlistId.match(/list=([a-zA-Z0-9_-]+)/);
        if (match) playlistId = match[1];
    }

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
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // API 1: /api/resolve-track
    if (reqUrl.pathname === '/api/resolve-track') {
        try {
            const artist = reqUrl.searchParams.get('artist') || '';
            const title = reqUrl.searchParams.get('title') || '';

            if (!title) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Title required' }));
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

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ videoId: resolvedId, artist: healedArtist, title: cleanTitle }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // API 2: /api/playlist-tracks
    if (reqUrl.pathname === '/api/playlist-tracks') {
        try {
            const playlistId = reqUrl.searchParams.get('playlistId') || reqUrl.searchParams.get('url') || '';
            if (!playlistId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'playlistId or url parameter required' }));
                return;
            }

            const result = await scrapePlaylistTracks(playlistId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
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
