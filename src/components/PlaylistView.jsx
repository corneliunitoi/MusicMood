function PlaylistView({ playlists }) {
    if (!playlists || playlists.length === 0) {
        return <p className="subtitle">No playlists found.</p>;
    }

    return (
        <div className="playlist-grid fade-in">
            {playlists.map((playlist) => (
                <div key={playlist.id} className="glass-card playlist-card">
                    <img src={playlist.thumbnail} alt={playlist.title} className="playlist-thumb" />
                    <div className="playlist-info">
                        <h3>{playlist.title}</h3>
                        <p>{playlist.videoCount} videos</p>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default PlaylistView;
