export async function fetchPlaylistTracksZeroQuota(playlistIdOrUrl) {
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
    throw new Error('Could not parse playlist page.');
  }

  const data = JSON.parse(match[1]);

  // Extract playlist title
  let playlistTitle = 'YouTube Playlist';
  try {
    playlistTitle = data.metadata?.playlistMetadataRenderer?.title ||
      data.header?.playlistHeaderRenderer?.title?.runs?.[0]?.text ||
      data.header?.playlistHeaderRenderer?.title?.simpleText ||
      'YouTube Playlist';
  } catch (e) {}

  const tracks = [];
  const seenIds = new Set();

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

  function traverse(obj) {
    if (!obj || typeof obj !== 'object') return;

    // Format 1: lockupViewModel
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

    // Format 2: playlistVideoRenderer
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
