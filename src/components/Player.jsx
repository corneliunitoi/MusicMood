import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseService';
import { sessionEngine } from '../services/sessionStateMachine';
import { GENRE_NODES } from '../services/tasteGraph';
import { jitEngine } from '../services/jitEngine';
import { isFavorite, toggleFavorite, subscribeFavorites } from '../services/favoritesService';

/**
 * Loads the YouTube IFrame API script exactly once across the application lifecycle.
 */
let ytApiPromise = null;
function loadYouTubeIframeApi() {
    if (window.YT && window.YT.Player) {
        return Promise.resolve(window.YT);
    }
    if (ytApiPromise) return ytApiPromise;

    ytApiPromise = new Promise((resolve) => {
        const existingScript = document.getElementById('yt-iframe-api');
        if (!existingScript) {
            const tag = document.createElement('script');
            tag.id = 'yt-iframe-api';
            tag.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(tag);
        }

        const prevReady = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            if (prevReady) prevReady();
            resolve(window.YT);
        };

        // If YT was already injected by previous session
        if (window.YT && window.YT.Player) {
            resolve(window.YT);
        }
    });
    return ytApiPromise;
}

function formatTime(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) return '0:00';
    const s = Math.floor(totalSeconds);
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    const hours = Math.floor(mins / 60);
    if (hours > 0) {
        const remMins = mins % 60;
        return `${hours}:${remMins < 10 ? '0' : ''}${remMins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function Player({ initialTrack, token }) {
    const [currentTrack, setCurrentTrack] = useState(initialTrack);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const [isSteering, setIsSteering] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const [sessionState, setSessionState] = useState(() => sessionEngine.getState());
    const [copiedLink, setCopiedLink] = useState(false);
    const [showQueue, setShowQueue] = useState(false);
    const [isCurrentFav, setIsCurrentFav] = useState(() => isFavorite(initialTrack));

    // Progress Bar & Scrubber state
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isSeeking, setIsSeeking] = useState(false);
    const [seekTime, setSeekTime] = useState(0);

    const displayTime = isSeeking ? seekTime : currentTime;
    const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (displayTime / duration) * 100)) : 0;

    const playerRef = useRef(null);
    const isPlayerReadyRef = useRef(false);
    const isTransitioningRef = useRef(false);
    const currentTrackRef = useRef(initialTrack);
    const watchdogTimerRef = useRef(null);

    const clearWatchdog = () => {
        if (watchdogTimerRef.current) {
            clearTimeout(watchdogTimerRef.current);
            watchdogTimerRef.current = null;
        }
    };

    const videoId = currentTrack?.id || currentTrack?.youtube_video_id;
    const youtubeUrl = videoId && videoId.length === 11 ? `https://www.youtube.com/watch?v=${videoId}` : null;

    const handleCopyLink = () => {
        if (!youtubeUrl) return;
        navigator.clipboard.writeText(youtubeUrl).then(() => {
            setCopiedLink(true);
            setTimeout(() => setCopiedLink(false), 2000);
        }).catch(err => {
            console.error('Failed to copy link:', err);
        });
    };

    // Keep ref and favorite status in sync
    useEffect(() => {
        currentTrackRef.current = currentTrack;
        setIsCurrentFav(isFavorite(currentTrack));
    }, [currentTrack]);

    // Keep favorite status in sync with external changes
    useEffect(() => {
        const unsub = subscribeFavorites(() => {
            setIsCurrentFav(isFavorite(currentTrackRef.current));
        });
        return unsub;
    }, []);

    // Real-time time progress polling
    useEffect(() => {
        let interval = null;
        if (isPlaying && !isSeeking) {
            interval = setInterval(() => {
                if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
                    try {
                        const cur = playerRef.current.getCurrentTime() || 0;
                        const dur = playerRef.current.getDuration() || 0;
                        setCurrentTime(cur);
                        if (dur > 0) setDuration(dur);
                    } catch (e) {}
                }
            }, 500);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isPlaying, isSeeking]);

    // Subscribe to state machine updates
    useEffect(() => {
        const unsubscribe = sessionEngine.subscribe((newState) => {
            setSessionState({ ...newState });
            if (newState.currentTrack && newState.currentTrack.id && newState.currentTrack.id !== currentTrackRef.current?.id) {
                playTrackImmediately(newState.currentTrack);
            }
        });
        if ((sessionEngine.queue || []).length < 2) {
            jitEngine.replenishBuffer(sessionEngine.state.activeGenre, sessionEngine);
        }
        return unsubscribe;
    }, []);

    // Initialize the YouTube IFrame API and Persistent Player
    useEffect(() => {
        let isMounted = true;

        loadYouTubeIframeApi().then((YT) => {
            if (!isMounted || playerRef.current) return;

            console.log('[HardenedPlayer] Initializing persistent player on https://www.youtube.com...');
            playerRef.current = new YT.Player('musicmood-persistent-player', {
                height: '240',
                width: '240',
                host: 'https://www.youtube.com', // Standard YouTube domain guarantees session audio stream negotiation
                videoId: currentTrackRef.current?.id || '',
                playerVars: {
                    autoplay: 1,
                    controls: 0,
                    modestbranding: 1,
                    rel: 0,
                    enablejsapi: 1,
                    origin: window.location.origin
                },
                events: {
                    onReady: (event) => {
                        console.log('[HardenedPlayer] YouTube Player Ready & Locked.');
                        isPlayerReadyRef.current = true;
                        try {
                            event.target.unMute();
                            event.target.setVolume(100);
                        } catch (e) {}
                        if (currentTrackRef.current?.id) {
                            playTrackImmediately(currentTrackRef.current);
                        }
                    },
                    onStateChange: (event) => {
                        // 0: ENDED, 1: PLAYING, 2: PAUSED, 3: BUFFERING, 5: CUED, -1: UNSTARTED
                        if (event.data === 1) {
                            clearWatchdog();
                            setIsBuffering(false);
                            setIsPlaying(true);
                            setErrorMessage(null);
                            try {
                                if (event.target.isMuted()) event.target.unMute();
                                event.target.setVolume(100);
                                const dur = event.target.getDuration();
                                if (dur > 0) setDuration(dur);
                                const cur = event.target.getCurrentTime();
                                if (cur >= 0) setCurrentTime(cur);
                            } catch (e) {}
                        }
                        if (event.data === 2) {
                            setIsBuffering(false);
                            setIsPlaying(false);
                        }
                        if (event.data === 3) {
                            setIsBuffering(true);
                        }
                        if (event.data === 5 || event.data === -1) {
                            // Aggressively trigger playback if YouTube put track in CUED or UNSTARTED state
                            try {
                                event.target.unMute();
                                event.target.setVolume(100);
                                event.target.playVideo();
                            } catch (e) {}
                        }

                        // When track naturally ends, trigger state machine transition
                        if (event.data === 0 && !isTransitioningRef.current) {
                            clearWatchdog();
                            console.log('[HardenedPlayer] Track ended naturally. Auto-transitioning...');
                            sessionEngine.onTrackCompleted(currentTrackRef.current);
                            loadNextTrack(false);
                        }
                    },
                    onError: async (event) => {
                        clearWatchdog();
                        // Error codes:
                        // 2: Invalid parameter
                        // 5: HTML5 player error
                        // 100: Video not found or private
                        // 101 or 150: Video owner disabled embedding
                        const code = event.data;
                        console.warn(`[HardenedPlayer] YouTube playback error code: ${code}`);

                        const failedTrack = currentTrackRef.current;
                        const failedVideoId = failedTrack?.id || failedTrack?.youtube_video_id;

                        // 1. Blacklist in current session state so it is never re-queued
                        if (failedVideoId) {
                            sessionEngine.state.recentTracks.push(failedVideoId);
                            sessionEngine.queue = (sessionEngine.queue || []).filter(t => t.id !== failedVideoId && t.youtube_video_id !== failedVideoId);
                        }

                        // 2. Automated Self-Healing: Purge unplayable video from Supabase tracks catalog
                        if (failedTrack?.dbId || failedVideoId) {
                            try {
                                console.warn(`[SelfHealing] Purging unplayable video from catalog: ${failedVideoId} (code ${code})`);
                                if (failedTrack?.dbId) {
                                    await supabase.from('tracks').delete().eq('id', failedTrack.dbId);
                                } else if (failedVideoId) {
                                    await supabase.from('tracks').delete().eq('youtube_video_id', failedVideoId);
                                }
                            } catch (e) {
                                console.warn('[SelfHealing] Non-fatal purge warning:', e.message);
                            }
                        }

                        let msg = 'Track playback error.';
                        if (code === 101 || code === 150) {
                            msg = 'Embedding restricted by owner. Auto-healed & skipping to next track...';
                        } else if (code === 100) {
                            msg = 'Video unavailable. Auto-healed & skipping to next track...';
                        }
                        setErrorMessage(msg);

                        // Seamlessly skip to next track without crashing or destroying the player
                        setTimeout(() => {
                            loadNextTrack(false);
                        }, 800);
                    }
                }
            });
        });

        return () => {
            isMounted = false;
            clearWatchdog();
            // NOTE: We deliberately do NOT destroy the player on unmount
            // to maintain instance persistence and prevent 429s across re-renders!
        };
    }, []);

    // When initialTrack changes from parent (e.g. user selected a new Mood)
    useEffect(() => {
        if (initialTrack && initialTrack.id && initialTrack.id !== currentTrackRef.current?.id) {
            playTrackImmediately(initialTrack);
        }
    }, [initialTrack]);

    const playTrackImmediately = (track) => {
        if (!track || !track.id) return;
        clearWatchdog();
        setCurrentTrack(track);
        setErrorMessage(null);
        setIsBuffering(true);
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setIsSeeking(false);

        if (playerRef.current && isPlayerReadyRef.current && typeof playerRef.current.loadVideoById === 'function') {
            console.log(`[HardenedPlayer] Loading video ID via persistent player: ${track.id} (${track.title})`);
            try {
                if (typeof playerRef.current.unMute === 'function') playerRef.current.unMute();
                if (typeof playerRef.current.setVolume === 'function') playerRef.current.setVolume(100);
            } catch (e) {
                console.warn('[HardenedPlayer] Volume/unmute exception:', e);
            }

            playerRef.current.loadVideoById({
                videoId: track.id,
                startSeconds: 0
            });
            playerRef.current.playVideo();

            // 6-Second Silence / Stalled Stream Watchdog
            watchdogTimerRef.current = setTimeout(async () => {
                let isAudioMoving = false;
                try {
                    const pState = playerRef.current?.getPlayerState?.();
                    const pTime = playerRef.current?.getCurrentTime?.();
                    // State 1 is PLAYING and audio progress has moved
                    if (pState === 1 && pTime > 0) {
                        isAudioMoving = true;
                    }
                } catch (e) {}

                if (!isAudioMoving) {
                    console.warn(`[Watchdog ⏱️] Track ${track.id} (${track.title}) stalled or silent after 6s. Auto-recovering...`);
                    // Purge stalled/dead video from catalog so it never plays again
                    try {
                        if (track.dbId) {
                            await supabase.from('tracks').delete().eq('id', track.dbId);
                        } else if (track.id) {
                            await supabase.from('tracks').delete().eq('youtube_video_id', track.id);
                        }
                    } catch (e) {
                        console.warn('[Watchdog] Purge warning:', e);
                    }

                    // Blacklist in recent session tracks
                    if (track.id) {
                        sessionEngine.state.recentTracks.push(track.id);
                        sessionEngine.queue = (sessionEngine.queue || []).filter(t => t.id !== track.id && t.youtube_video_id !== track.id);
                    }

                    setErrorMessage(`Silent or stalled stream on "${track.title}". Auto-advancing...`);
                    loadNextTrack(false);
                }
            }, 6000);
        }
    };

    const handleSeekChange = (e) => {
        setIsSeeking(true);
        setSeekTime(Number(e.target.value));
    };

    const handleSeekCommit = (newSecs) => {
        const target = typeof newSecs === 'number' ? newSecs : seekTime;
        if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
            try {
                playerRef.current.seekTo(target, true);
            } catch (e) {}
        }
        setCurrentTime(target);
        setIsSeeking(false);
    };

    const handlePreviousTrack = async () => {
        clearWatchdog();
        if (isTransitioningRef.current) return;

        if (sessionState.canGoBack) {
            isTransitioningRef.current = true;
            setIsSteering(true);
            try {
                const prev = sessionEngine.getPreviousTrack();
                if (prev && prev.id) {
                    playTrackImmediately(prev);
                }
            } finally {
                isTransitioningRef.current = false;
                setIsSteering(false);
            }
        } else {
            // No previous tracks in history: seek to 0:00 of current track
            if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
                try {
                    playerRef.current.seekTo(0, true);
                    setCurrentTime(0);
                } catch (e) {}
            }
        }
    };

    const loadNextTrack = async (isSkip = false) => {
        clearWatchdog();
        if (isTransitioningRef.current) return;
        isTransitioningRef.current = true;
        setIsSteering(true);

        try {
            if (isSkip && currentTrackRef.current) {
                sessionEngine.onSkip(currentTrackRef.current);
            }

            const next = await sessionEngine.getNextTrack(token);
            if (next && next.id) {
                playTrackImmediately(next);
            } else {
                console.warn('[HardenedPlayer] No next track could be resolved.');
                setErrorMessage('No guard-checked track available. Try adjusting filters or mood.');
            }
        } finally {
            isTransitioningRef.current = false;
            setIsSteering(false);
        }
    };

    const togglePlay = () => {
        if (!playerRef.current || !isPlayerReadyRef.current) return;

        if (isPlaying) {
            playerRef.current.pauseVideo();
            setIsPlaying(false);
        } else {
            playerRef.current.playVideo();
            setIsPlaying(true);
        }
    };

    const handleShiftNode = async () => {
        sessionEngine.stepToNextGenre('manual_step');
        await loadNextTrack(false);
    };

    const handleLike = () => {
        sessionEngine.onLike(currentTrackRef.current);
        if (currentTrackRef.current) {
            const nextFav = toggleFavorite(currentTrackRef.current);
            setIsCurrentFav(nextFav);
        }
    };

    const handleGenreChange = async (newGenre) => {
        if (!newGenre) return;
        // Immediately reflect the change in local state so the dropdown updates with 0ms lag
        setSessionState(prev => ({ ...prev, activeGenre: newGenre }));
        // Force the state machine into the requested genre (bypassing background dealbreakers)
        sessionEngine.setGenre(newGenre, true);
        await loadNextTrack(false);
    };

    const handleDislike = async () => {
        setErrorMessage("Skipping track and tuning your recommendations...");
        if (currentTrackRef.current) {
            await sessionEngine.onDislike(currentTrackRef.current);
        }
        await loadNextTrack(true);
    };

    const activeNode = GENRE_NODES[sessionState.activeGenre];
    const dwellCount = (sessionState.consecutiveInNode || 0) + 1;

    return (
        <div className="player-container fade-in-up" style={{ width: '100%', maxWidth: '850px', margin: '2rem auto' }}>
            {/* ANTI-DRIFT & PERSISTENT STATUS BANNER */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '12px 12px 0 0',
                padding: '0.6rem 1.25rem',
                fontSize: '0.85rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#10b981', fontWeight: 'bold', flexWrap: 'wrap' }}>
                    <span>🛡️ Active Node:</span>
                    <select
                        value={sessionState.activeGenre}
                        onChange={(e) => handleGenreChange(e.target.value)}
                        style={{
                            background: '#0f172a',
                            color: '#38bdf8',
                            border: '1px solid #38bdf8',
                            borderRadius: '8px',
                            padding: '0.2rem 0.5rem',
                            fontSize: '0.82rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            outline: 'none',
                            maxWidth: '260px'
                        }}
                        title="Click to jump to any genre or explore outside initial picks"
                    >
                        {Object.entries(
                            Object.entries(GENRE_NODES).reduce((acc, [id, node]) => {
                                acc[node.group] = acc[node.group] || [];
                                acc[node.group].push({ id, ...node });
                                return acc;
                            }, {})
                        ).map(([group, nodes]) => (
                            <optgroup key={group} label={group}>
                                {nodes.map(n => (
                                    <option key={n.id} value={n.id}>
                                        {n.label}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                    <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                        ({sessionState.currentMood.toUpperCase()})
                    </span>
                    <span style={{
                        background: 'rgba(255,255,255,0.08)',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        color: dwellCount >= 2 ? '#f59e0b' : '#94a3b8'
                    }}>
                        Dwell: {dwellCount}/2 tracks {dwellCount >= 2 && '→ Auto-shifting next'}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                    <span>Fatigue: <strong>{sessionState.currentFatigue}%</strong></span>
                    <span>Energy: <strong>{Math.round(sessionState.energyLevel * 100)}%</strong></span>
                </div>
            </div>

            {/* ERROR RECOVERY BANNER */}
            {errorMessage && (
                <div style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    borderLeft: '4px solid #ef4444',
                    padding: '0.5rem 1rem',
                    fontSize: '0.8rem',
                    color: '#fca5a5',
                    textAlign: 'left'
                }}>
                    ⚠️ {errorMessage}
                </div>
            )}

            {/* MAIN PLAYER DOCK */}
            <div className="player-dock" style={{
                borderRadius: '0 0 16px 16px',
                borderTop: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    gap: '1rem',
                    flexWrap: 'wrap'
                }}>
                    <div className="player-info" style={{ minWidth: '220px' }}>
                        {currentTrack?.thumbnail ? (
                            <img src={currentTrack.thumbnail} alt={currentTrack.title} className="player-thumbnail" referrerPolicy="no-referrer" />
                        ) : (
                            <div className="player-thumbnail-placeholder" />
                        )}

                        <div className="player-text" style={{ minWidth: 0, flex: 1 }}>
                            <span className="player-status">
                                {isSteering ? 'Traversing Graph...' : isBuffering ? 'Buffering Audio...' : isPlaying ? 'Now Playing' : 'Paused'}
                                {isPlaying && !isSteering && !isBuffering && (
                                    <span className="visualizer">
                                        <span className="bar" />
                                        <span className="bar" />
                                        <span className="bar" />
                                    </span>
                                )}
                            </span>
                            <h3 className="player-title" title={currentTrack?.title || ''}>
                                {youtubeUrl ? (
                                    <a
                                        href={youtubeUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Open track on YouTube (New Tab)"
                                        style={{ color: 'inherit', textDecoration: 'none' }}
                                    >
                                        {currentTrack?.title || 'Loading session...'}
                                        <span style={{ fontSize: '0.72rem', marginLeft: '0.4rem', opacity: 0.5 }}>↗</span>
                                    </a>
                                ) : (
                                    currentTrack?.title || 'Loading session...'
                                )}
                            </h3>
                            <div className="player-channel" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                                <span style={{
                                    fontSize: '0.82rem',
                                    color: '#cbd5e1',
                                    fontWeight: '500',
                                    letterSpacing: '0.01em'
                                }}>
                                    {currentTrack?.artist || sessionState?.currentTrack?.artist || currentTrack?.channelTitle || 'MusicMood Engine'}
                                </span>
                                {currentTrack?.source === 'local_library' && (
                                    <span style={{ color: '#60a5fa', fontSize: '0.72rem', background: 'rgba(96, 165, 250, 0.12)', padding: '0.05rem 0.35rem', borderRadius: '4px' }}>
                                        📁 Server
                                    </span>
                                )}
                                {(currentTrack?.source?.startsWith('jit') || currentTrack?.source === 'jit_player_expansion' || currentTrack?.source === 'jit_local_archive' || currentTrack?.source === 'jit_musicbrainz') && (
                                    <span style={{ color: '#34d399', fontSize: '0.72rem', fontWeight: '500', background: 'rgba(52, 211, 153, 0.12)', padding: '0.05rem 0.35rem', borderRadius: '4px' }}>
                                        ⚡ JIT Discovery
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="player-controls" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {/* More Like This (Heart / Favorite) */}
                        <button
                            className="control-btn"
                            onClick={handleLike}
                            title={isCurrentFav ? "Favorited! (Click to remove from favorites)" : "Save to Favorites ❤️ (and subtle affinity nudge)"}
                            style={{
                                background: isCurrentFav ? 'rgba(236, 72, 153, 0.35)' : 'rgba(236, 72, 153, 0.12)',
                                borderColor: isCurrentFav ? '#ec4899' : 'rgba(236, 72, 153, 0.4)',
                                boxShadow: isCurrentFav ? '0 0 12px rgba(236, 72, 153, 0.4)' : 'none',
                                transform: isCurrentFav ? 'scale(1.05)' : 'scale(1)',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {isCurrentFav ? '❤️' : '🤍'}
                        </button>

                        {/* Dislike / Not Music (Downvote) */}
                        <button
                            className="control-btn"
                            onClick={handleDislike}
                            disabled={isSteering}
                            title="Dislike / Not Music (Immediately skips, blacklists, and removes bad mapping)"
                            style={{ background: 'rgba(239, 68, 68, 0.15)', borderColor: '#ef4444' }}
                        >
                            👎
                        </button>

                        {/* Previous Track / Back Button */}
                        <button
                            className="control-btn"
                            onClick={handlePreviousTrack}
                            disabled={isSteering}
                            title={sessionState.canGoBack ? `Previous Track: Return to last track (${sessionState.historyCount || 1} in history)` : "Restart track (No previous tracks yet)"}
                            style={{
                                opacity: sessionState.canGoBack ? 1 : 0.45,
                                cursor: 'pointer',
                                transition: 'opacity 0.2s ease, transform 0.2s ease'
                            }}
                        >
                            <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                            </svg>
                        </button>

                        {/* Play / Pause */}
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

                        {/* Skip / Next */}
                        <button className="control-btn" onClick={() => loadNextTrack(true)} disabled={isSteering} title="Skip Track & Nudge Graph">
                            <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                            </svg>
                        </button>

                        {/* Step along Graph Edge */}
                        <button
                            className="btn-text"
                            onClick={handleShiftNode}
                            disabled={isSteering}
                            title="Step to an adjacent harmonic subgenre in the graph"
                            style={{
                                background: 'rgba(168, 85, 247, 0.2)',
                                border: '1px solid #a855f7',
                                borderRadius: '8px',
                                padding: '0.4rem 0.8rem',
                                color: '#e9d5ff',
                                fontSize: '0.8rem',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                            }}
                        >
                            🔀 Step Node
                        </button>

                        {/* Copy YouTube Link */}
                        {youtubeUrl && (
                            <button
                                className="control-btn"
                                onClick={handleCopyLink}
                                title={copiedLink ? "Link copied to clipboard!" : "Copy YouTube link"}
                                style={{
                                    background: copiedLink ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                    border: copiedLink ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.15)',
                                    color: copiedLink ? '#34d399' : '#94a3b8',
                                    width: '36px',
                                    height: '36px',
                                    padding: '0.4rem',
                                    borderRadius: '10px',
                                    transition: 'all 0.2s ease',
                                    cursor: 'pointer'
                                }}
                            >
                                {copiedLink ? (
                                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>✓</span>
                                ) : (
                                    <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '1.15rem', height: '1.15rem' }}>
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                    </svg>
                                )}
                            </button>
                        )}

                        {/* Open in YouTube */}
                        {youtubeUrl && (
                            <a
                                href={youtubeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="control-btn"
                                title="Open track on YouTube (New Tab)"
                                style={{
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    border: '1px solid rgba(239, 68, 68, 0.35)',
                                    color: '#ef4444',
                                    width: '36px',
                                    height: '36px',
                                    padding: '0.4rem',
                                    borderRadius: '10px',
                                    textDecoration: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s ease',
                                    cursor: 'pointer'
                                }}
                            >
                                <svg className="icon" fill="currentColor" viewBox="0 0 24 24" style={{ width: '1.25rem', height: '1.25rem' }}>
                                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                                </svg>
                            </a>
                        )}

                        {/* Up Next / JIT Queue Drawer Toggle */}
                        <button
                            className="btn-text"
                            onClick={() => {
                                const willOpen = !showQueue;
                                setShowQueue(willOpen);
                                if (willOpen && (sessionState.queue || []).length < 2) {
                                    jitEngine.replenishBuffer(sessionState.activeGenre, sessionEngine);
                                }
                            }}
                            title="View Up Next & JIT Buffered Queue"
                            style={{
                                background: showQueue ? 'rgba(52, 211, 153, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                border: showQueue ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.15)',
                                color: showQueue ? '#34d399' : '#94a3b8',
                                borderRadius: '8px',
                                padding: '0.4rem 0.75rem',
                                fontSize: '0.8rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem'
                            }}
                        >
                            <span>📋 Up Next</span>
                            <span style={{
                                background: (sessionState.queue || []).length > 0 ? 'rgba(52, 211, 153, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                                borderRadius: '9999px',
                                padding: '0.1rem 0.45rem',
                                fontSize: '0.72rem',
                                color: (sessionState.queue || []).length > 0 ? '#34d399' : '#94a3b8'
                            }}>
                                {(sessionState.queue || []).length}
                            </span>
                        </button>
                    </div>
                </div>

                {/* INTERACTIVE PROGRESS BAR & SCRUBBER */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    width: '100%',
                    paddingTop: '0.25rem',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                    <span style={{
                        fontSize: '0.72rem',
                        color: '#94a3b8',
                        minWidth: '32px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        fontFamily: 'monospace'
                    }}>
                        {formatTime(displayTime)}
                    </span>
                    <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                        <input
                            type="range"
                            min="0"
                            max={duration > 0 ? duration : 100}
                            step="0.5"
                            value={displayTime}
                            onChange={handleSeekChange}
                            onMouseUp={() => handleSeekCommit()}
                            onTouchEnd={() => handleSeekCommit()}
                            onKeyUp={(e) => {
                                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                                    handleSeekCommit(Number(e.target.value));
                                }
                            }}
                            className="player-progress-bar"
                            style={{
                                background: `linear-gradient(to right, #a855f7 0%, #6366f1 ${progressPercent}%, rgba(255, 255, 255, 0.15) ${progressPercent}%, rgba(255, 255, 255, 0.15) 100%)`
                            }}
                            title="Click or drag to seek in track"
                        />
                    </div>
                    <span style={{
                        fontSize: '0.72rem',
                        color: '#64748b',
                        minWidth: '32px',
                        textAlign: 'left',
                        fontVariantNumeric: 'tabular-nums',
                        fontFamily: 'monospace'
                    }}>
                        {duration > 0 ? formatTime(duration) : '--:--'}
                    </span>
                </div>
            </div>

            {/* UP NEXT & JIT BUFFERED QUEUE TRAY */}
            {showQueue && (
                <div className="fade-in" style={{
                    background: 'rgba(15, 23, 42, 0.95)',
                    border: '1px solid rgba(52, 211, 153, 0.3)',
                    borderRadius: '12px',
                    padding: '0.85rem 1.25rem',
                    marginTop: '0.5rem',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                        <h4 style={{ margin: 0, fontSize: '0.88rem', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span>⚡ Up Next in "{GENRE_NODES[sessionState.activeGenre]?.label || sessionState.activeGenre}"</span>
                        </h4>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            Auto-buffered Just-In-Time
                        </span>
                    </div>

                    {(sessionState.queue || []).length === 0 ? (
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#94a3b8', fontStyle: 'italic', padding: '0.4rem 0' }}>
                            ⏳ JIT Engine is buffering next tracks from catalog & MusicBrainz...
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {(sessionState.queue || []).map((t, idx) => (
                                <div
                                    key={t.id || idx}
                                    onClick={() => {
                                        sessionEngine.queue = sessionState.queue.filter((_, i) => i !== idx);
                                        sessionEngine.playCustomTrack(t);
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.4rem 0.6rem',
                                        borderRadius: '8px',
                                        background: 'rgba(255, 255, 255, 0.04)',
                                        border: '1px solid rgba(255, 255, 255, 0.06)',
                                        cursor: 'pointer',
                                        transition: 'background 0.15s ease'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'}
                                    title="Click to play this track now"
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', overflow: 'hidden' }}>
                                        <span style={{ color: '#64748b', fontSize: '0.78rem', minWidth: '1.2rem' }}>#{idx + 1}</span>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            <span style={{ color: '#f1f5f9', fontSize: '0.84rem', fontWeight: '500' }}>{t.title}</span>
                                            <span style={{ color: '#94a3b8', fontSize: '0.78rem', marginLeft: '0.5rem' }}>— {t.artist}</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                                        {(t.source?.startsWith('jit') || t.source === 'jit_player_expansion' || t.source === 'jit_local_archive' || t.source === 'jit_musicbrainz') && (
                                            <span style={{
                                                fontSize: '0.68rem',
                                                background: 'rgba(52, 211, 153, 0.15)',
                                                color: '#34d399',
                                                border: '1px solid rgba(52, 211, 153, 0.3)',
                                                borderRadius: '4px',
                                                padding: '0.1rem 0.35rem'
                                            }}>
                                                ⚡ JIT
                                            </span>
                                        )}
                                        <span style={{
                                            fontSize: '0.7rem',
                                            color: '#cbd5e1',
                                            background: 'rgba(255, 255, 255, 0.08)',
                                            borderRadius: '4px',
                                            padding: '0.1rem 0.4rem'
                                        }}>
                                            ▶ Play
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* REAL-TIME SESSION STEERING CONTROLS */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '0.75rem 1.25rem',
                marginTop: '0.75rem',
                gap: '1rem',
                fontSize: '0.85rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '220px' }}>
                    <span style={{ color: '#94a3b8' }}>⚡ Energy:</span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={sessionState.energyLevel}
                        onChange={(e) => sessionEngine.setEnergy(parseFloat(e.target.value))}
                        style={{ accentColor: '#a855f7', cursor: 'pointer', flex: 1 }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#94a3b8' }}>🎤 Vocals:</span>
                    {['any', 'instrumental', 'vocal'].map(mode => (
                        <button
                            key={mode}
                            onClick={() => sessionEngine.setVocalPreference(mode)}
                            style={{
                                background: sessionState.vocalPreference === mode ? '#6366f1' : 'rgba(255,255,255,0.05)',
                                color: sessionState.vocalPreference === mode ? 'white' : '#94a3b8',
                                border: '1px solid rgba(255,255,255,0.1)',
                                padding: '0.2rem 0.6rem',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                cursor: 'pointer'
                            }}
                        >
                            {mode === 'any' ? 'Any' : mode === 'instrumental' ? 'Instrumental Only' : 'Vocals'}
                        </button>
                    ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#94a3b8' }}>🧭 Discovery:</span>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                        {[
                            { label: 'Familiar', val: 0.2 },
                            { label: 'Balanced', val: 0.5 },
                            { label: 'Deep Cuts', val: 0.85 }
                        ].map(tier => {
                            const active = Math.abs(sessionState.discoveryLevel - tier.val) < 0.2;
                            return (
                                <button
                                    key={tier.label}
                                    onClick={() => sessionEngine.setDiscoveryLevel(tier.val)}
                                    title={tier.val > 0.7 ? "Wide graph wandering across all genres" : tier.val >= 0.4 ? "Harmonic wandering across neighboring subgenres" : "Anchored to your initial favorites"}
                                    style={{
                                        background: active ? '#a855f7' : 'rgba(255,255,255,0.05)',
                                        color: active ? 'white' : '#94a3b8',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        padding: '0.2rem 0.5rem',
                                        borderRadius: '6px',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {tier.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* STRICTLY PERSISTENT OFF-SCREEN YOUTUBE IFRAME DOM TARGET */}
            <div style={{ position: 'fixed', bottom: '-9999px', left: '-9999px', width: '240px', height: '240px', opacity: 1, pointerEvents: 'none', zIndex: -100 }}>
                <div id="musicmood-persistent-player"></div>
            </div>
        </div>
    );
}

export default Player;
