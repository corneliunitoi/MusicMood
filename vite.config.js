import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolveTrack, scrapePlaylistTracks } from './server/youtubeResolver.js'

const MAX_TEXT_PARAM = 300;
const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{2,64}$/;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * Local development mirror of the production /api endpoints (server.js).
 * Same YouTube logic (server/youtubeResolver.js) and input validation; no sign-in
 * check or rate limiting, since the dev server only listens on your machine.
 */
function zeroQuotaResolverPlugin() {
  return {
    name: 'zero-quota-resolver',
    configureServer(server) {
      server.middlewares.use('/api/resolve-track', async (req, res) => {
        try {
          const url = new URL(req.url, 'http://localhost');
          const artist = url.searchParams.get('artist') || '';
          const title = url.searchParams.get('title') || '';
          if (!title) return sendJson(res, 400, { error: 'Title required' });
          if (title.length > MAX_TEXT_PARAM || artist.length > MAX_TEXT_PARAM) {
            return sendJson(res, 400, { error: 'Artist or title too long.' });
          }
          sendJson(res, 200, await resolveTrack(artist, title));
        } catch (err) {
          console.error('[dev api/resolve-track]', err);
          sendJson(res, 500, { error: 'Track lookup failed. Please try again.' });
        }
      });

      server.middlewares.use('/api/playlist-tracks', async (req, res) => {
        try {
          const url = new URL(req.url, 'http://localhost');
          const raw = (url.searchParams.get('playlistId') || url.searchParams.get('url') || '').trim();
          if (!raw || raw.length > 500) return sendJson(res, 400, { error: 'playlistId or url parameter required' });
          const listMatch = raw.match(/[?&]list=([A-Za-z0-9_-]+)/);
          const playlistId = listMatch ? listMatch[1] : raw;
          if (!PLAYLIST_ID_RE.test(playlistId)) return sendJson(res, 400, { error: 'Invalid playlist id or URL.' });
          sendJson(res, 200, await scrapePlaylistTracks(playlistId));
        } catch (err) {
          console.error('[dev api/playlist-tracks]', err);
          const safe = /^YouTube[: ]/.test(err?.message || '') ? err.message : 'Could not load this playlist. Please try again.';
          sendJson(res, 502, { error: safe });
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
