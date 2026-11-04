const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export const fetchUserProfile = async (token) => {
    if (token === 'guest') {
        return { name: 'Guest User', picture: 'https://ui-avatars.com/api/?name=Guest+User&background=646cff&color=fff' };
    }
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) throw new Error('Unauthorized');
    if (!response.ok) throw new Error('Failed to fetch user profile');
    return await response.json();
};

export const fetchUserPlaylists = async (token) => {
    if (token === 'guest') {
        return [];
    }
    try {
        const response = await fetch(
            `${YOUTUBE_API_BASE}/playlists?part=snippet,contentDetails&mine=true&maxResults=50`,
            {
                headers: { Authorization: `Bearer ${token}` },
            }
        );
        if (response.status === 401) throw new Error('Unauthorized');
        if (!response.ok) {
            const errorText = await response.text();
            console.error('YouTube API Error:', errorText);

            let errorMessage = 'Failed to fetch playlists';
            try {
                const errObj = JSON.parse(errorText);
                if (errObj.error?.errors?.[0]?.reason === 'quotaExceeded') {
                    errorMessage = 'YouTube API Quota Exceeded. You have used up your 10,000 daily units. You can still paste any YouTube playlist link below for zero-quota ingestion!';
                }
            } catch (e) { }

            throw new Error(errorMessage);
        }
        const data = await response.json();
        return (data.items || []).map(item => ({
            id: item.id,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
            videoCount: item.contentDetails.itemCount,
        }));
    } catch (e) {
        console.warn('[YouTubeService] Could not fetch user playlists:', e.message);
        throw e;
    }
};

export const fetchPlaylistItems = async (playlistId, token, maxResults = 50) => {
    // 1. Try zero-quota endpoint first if guest or if quota issues exist
    if (token === 'guest') {
        try {
            const zqRes = await fetch(`/api/playlist-tracks?playlistId=${encodeURIComponent(playlistId)}`);
            if (zqRes.ok) {
                const zqData = await zqRes.json();
                return (zqData.tracks || []).map(t => ({
                    id: t.videoId,
                    videoId: t.videoId,
                    title: t.title,
                    artist: t.artist,
                    thumbnail: t.thumbnail
                }));
            }
        } catch (e) {
            console.warn('[YouTubeService] Zero-quota fallback failed:', e);
        }
        return [];
    }

    let allItems = [];
    let nextPageToken = '';

    try {
        do {
            const url = `${YOUTUBE_API_BASE}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=${maxResults}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!response.ok) {
                console.warn(`[YouTubeService] Official API failed for playlist ${playlistId}. Falling back to zero-quota resolver...`);
                const zqRes = await fetch(`/api/playlist-tracks?playlistId=${encodeURIComponent(playlistId)}`);
                if (zqRes.ok) {
                    const zqData = await zqRes.json();
                    return (zqData.tracks || []).map(t => ({
                        id: t.videoId,
                        videoId: t.videoId,
                        title: t.title,
                        artist: t.artist,
                        thumbnail: t.thumbnail
                    }));
                }
                break;
            }

            const data = await response.json();
            const items = (data.items || []).map(item => {
                const videoId = item.snippet?.resourceId?.videoId || item.id;
                const rawTitle = item.snippet?.title || '';
                let artist = item.snippet?.videoOwnerChannelTitle || '';
                let title = rawTitle;

                if (rawTitle.includes(' - ')) {
                    const p = rawTitle.split(' - ');
                    artist = p[0].trim();
                    title = p.slice(1).join(' - ').trim();
                }

                return {
                    id: videoId,
                    videoId: videoId,
                    title: title,
                    artist: artist.replace(/\s*-\s*Topic$/i, '').trim(),
                    thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url
                };
            });

            allItems = [...allItems, ...items];
            nextPageToken = data.nextPageToken;

            if (allItems.length >= 500) break;
        } while (nextPageToken);
    } catch (err) {
        console.warn('[YouTubeService] Error in fetchPlaylistItems:', err);
    }

    return allItems;
};
