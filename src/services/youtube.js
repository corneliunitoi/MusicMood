const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export const fetchUserProfile = async (token) => {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('Failed to fetch user profile');
    return await response.json();
};

export const fetchUserPlaylists = async (token) => {
    const response = await fetch(
        `${YOUTUBE_API_BASE}/playlists?part=snippet,contentDetails&mine=true&maxResults=50`,
        {

            headers: { Authorization: `Bearer ${token}` },
        }
    );
    if (!response.ok) throw new Error('Failed to fetch playlists');
    const data = await response.json();
    return data.items.map(item => ({
        id: item.id,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
        videoCount: item.contentDetails.itemCount,
    }));
};
export const fetchPlaylistItems = async (playlistId, token, maxResults = 50) => {
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
