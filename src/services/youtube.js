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
                errorMessage = 'YouTube API Quota Exceeded. You have used up your 10,000 daily units. Please try again tomorrow, or create a new Google Cloud Project to get a fresh Client ID.';
            }
        } catch (e) { }

        throw new Error(errorMessage);
    }
    const data = await response.json();
    return data.items.map(item => ({
        id: item.id,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
        videoCount: item.contentDetails.itemCount,
    }));
};
export const fetchPlaylistItems = async (playlistId, token, maxResults = 50) => {
    if (token === 'guest') {
        return [];
    }
    let allItems = [];
    let nextPageToken = '';

    do {
        const url = `${YOUTUBE_API_BASE}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=${maxResults}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
            console.error(`Failed to fetch playlist items for ${playlistId}`, await response.text());
            break; // Stop fetching on error, return what we have so far
        }

        const data = await response.json();
        const items = data.items.map(item => ({
            id: item.id,
            title: item.snippet.title,
        }));

        allItems = [...allItems, ...items];
        nextPageToken = data.nextPageToken;

        // Safety limit: if a playlist has thousands of videos, stop at 500 to save API quota and time
        if (allItems.length >= 500) break;
    } while (nextPageToken);

    return allItems;
};
