import { useState } from 'react';
import YouTube from 'react-youtube';

function Player({ playlist }) {
    const [isPlaying, setIsPlaying] = useState(true);
    const [playerConfig, setPlayerConfig] = useState(null);
    const [currentTrack, setCurrentTrack] = useState({ title: '', author: '' });

    // YouTube Player Options
    const opts = {
        height: '0', // Invisible iframe
        width: '0',
        playerVars: {
            autoplay: 1,
            controls: 0,
            modestbranding: 1,
        },
    };

    if (playlist.type === 'video_list') {
        opts.playerVars.playlist = playlist.id; // Comma separated video IDs
    } else {
        opts.playerVars.listType = 'playlist';
        opts.playerVars.list = playlist.id;
    }

    const handleReady = (event) => {
        setPlayerConfig(event.target);
        setCurrentTrack({
            title: event.target.getVideoData().title,
            author: event.target.getVideoData().author
        });
        // Force unmute and set max volume in case browser or YouTube auto-muted it
        event.target.unMute();
        event.target.setVolume(100);
        event.target.playVideo();
    };

    const handleStateChange = (event) => {
        // -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
        if (event.data === 1 || event.data === -1) {
            // Update track info
            const data = event.target.getVideoData();
            if (data && data.title) {
                setCurrentTrack({ title: data.title, author: data.author });
            }
        }
        if (event.data === 1) setIsPlaying(true);
        if (event.data === 2) setIsPlaying(false);
    };

    const togglePlay = () => {
        if (!playerConfig || !playerConfig.pauseVideo) return;
        if (isPlaying) {
            playerConfig.pauseVideo();
        } else {
            playerConfig.playVideo();
        }
    };

    const nextTrack = () => {
        if (playerConfig && playerConfig.nextVideo) {
            playerConfig.nextVideo();
        }
    };

    return (
        <div className="player-dock fade-in-up">
            <div className="player-info">
                {playlist.thumbnail ? (
                    <img src={playlist.thumbnail} alt={playlist.title} className="player-thumbnail" referrerPolicy="no-referrer" />
                ) : (
                    <div className="player-thumbnail-placeholder" />
                )}

                <div className="player-text">
                    <span className="player-status">
                        {isPlaying ? 'Now Playing Mix' : 'Paused Mix'}
                        {isPlaying && (
                            <span className="visualizer">
                                <span className="bar" />
                                <span className="bar" />
                                <span className="bar" />
                            </span>
                        )}
                    </span>
                    <h3 className="player-title">{currentTrack.title || playlist.title}</h3>
                    <p className="player-channel">{currentTrack.author || playlist.channelTitle || 'YouTube Mix'}</p>
                </div>
            </div>

            <div className="player-controls">
                <button className="control-btn" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
                    {isPlaying ? (
                        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    ) : (
                        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    )}
                </button>
                <button className="control-btn" onClick={nextTrack} aria-label="Next Track">
                    <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                </button>
            </div>

            {/* Hidden actual YouTube Player */}
            <div className="hidden-player">
                <YouTube
                    videoId={playlist.firstVideoId}
                    opts={opts}
                    onReady={handleReady}
                    onStateChange={handleStateChange}
                />
            </div>
        </div>
    );
}

export default Player;
