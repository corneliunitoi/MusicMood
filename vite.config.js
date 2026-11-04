import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function parseTitleAndArtist(rawTitle, rawAuthor) {
  let clean = (rawTitle || '').replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
  let artist = (rawAuthor || '').replace(/\s*-\s*Topic$/i, '').trim();
  let title = clean;

  if (clean.includes(' - ')) {
    const parts = clean.split(' - ');
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').trim();
  } else if (clean.includes(' – ')) {
    const parts = clean.split(' – ');
    artist = parts[0].trim();
    title = parts.slice(1).join(' – ').trim();
  } else if (clean.includes(': ')) {
    const parts = clean.split(': ');
    if (parts[0].length > 2 && parts[0].length < 30) {
      artist = parts[0].trim();
      title = parts.slice(1).join(': ').trim();
    }
  }

  // Clean leading numbers
  title = title.replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '').trim();
  artist = artist.replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '').trim();

  return { artist: artist || 'Unknown Artist', title: title || rawTitle };
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

function zeroQuotaResolverPlugin() {
  return {
    name: 'zero-quota-resolver',
    configureServer(server) {
      // 1. Single track zero-quota resolver
      server.middlewares.use('/api/resolve-track', async (req, res) => {
        try {
          const parsedUrl = new URL(req.url, 'http://localhost:5173');
          const artist = parsedUrl.searchParams.get('artist') || '';
          const title = parsedUrl.searchParams.get('title') || '';

          if (!title) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Title required' }));
            return;
          }

          let cleanArtist = artist
            .replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '')
            .replace(/\[[^\]]+\]/g, '')
            .trim();

          let cleanTitle = title
            .replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '')
            .replace(/\((Alternate|Remix|Live|Stem|Dublex|Prod\.|Demo|Version|Remaster).*?\)/gi, '')
            .replace(/\[.*?\]/g, '')
            .trim();

          const isNumericArtist = !cleanArtist || /^[0-9]+$/.test(cleanArtist);

          const queries = [];
          if (!isNumericArtist) {
            queries.push(`"${cleanArtist}" "${cleanTitle}" Topic`);
            queries.push(`${cleanArtist} ${cleanTitle} official audio`);
          } else {
            queries.push(`"${cleanTitle}" Topic`);
            queries.push(`${cleanTitle} official audio`);
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
            const idMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
            const ownerMatch = html.match(/"ownerText":\{"runs":\[\{"text":"([^"]+)"/);

            if (idMatch && idMatch[1]) {
              resolvedId = idMatch[1];
              if (isNumericArtist && ownerMatch && ownerMatch[1]) {
                healedArtist = ownerMatch[1].replace(/\s*-\s*Topic$/i, '').trim();
              }
              break;
            }
          }

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ videoId: resolvedId, artist: healedArtist }));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      // 2. YouTube playlist zero-quota scraper & importer
      server.middlewares.use('/api/playlist-tracks', async (req, res) => {
        try {
          const parsedUrl = new URL(req.url, 'http://localhost:5173');
          const playlistId = parsedUrl.searchParams.get('playlistId') || parsedUrl.searchParams.get('url') || '';

          if (!playlistId) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'playlistId or url query parameter required' }));
            return;
          }

          const result = await scrapePlaylistTracks(playlistId);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), zeroQuotaResolverPlugin()],
  server: {
    port: 5173,
    strictPort: true,
  }
})
