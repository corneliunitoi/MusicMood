import { useState, useEffect, useRef } from 'react';
import { supabase, upvoteTrack, flagTrackMisclassification } from '../services/supabaseService';
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

function Player({ initialTrack, token, onOpenArtist }) {
    const [currentTrack, setCurrentTrack] = useState(initialTrack);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const [isLongBuffering, setIsLongBuffering] = useState(false);
    const [isSteering, setIsSteering] = useState(false);
    const [isFlagging, setIsFlagging] = useState(false);
    const [flaggedTrackIds, setFlaggedTrackIds] = useState(new Set());
    const [errorMessage, setErrorMessage] = useState(null);
    const [sessionState, setSessionState] = useState(() => sessionEngine.getState());
    const [copiedLink, setCopiedLink] = useState(false);
    const [showQueue, setShowQueue] = useState(false);
    const [isCurrentFav, setIsCurrentFav] = useState(() => isFavorite(initialTrack));
    const [upvotedTrackIds, setUpvotedTrackIds] = useState(() => {
        try {
            const stored = localStorage.getItem('musicmood_upvoted_tracks');
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch {
            return new Set();
        }
    });

    // Progress Bar & Scrubber state
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isSeeking, setIsSeeking] = useState(false);
    const [seekTime, setSeekTime] = useState(0);

    const displayTime = isSeeking ? seekTime : currentTime;
    const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (displayTime / duration) * 100)) : 0;

    // Master Volume & Audio Control state
    const [volume, setVolumeState] = useState(() => {
        try {
            const saved = localStorage.getItem('musicmood_volume');
            if (saved !== null) {
                const parsed = parseInt(saved, 10);
                if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) return parsed;
            }
        } catch {
            /* ignore storage read error */
        }
        return 100;
    });
    const [isMuted, setIsMuted] = useState(() => {
        try {
            return localStorage.getItem('musicmood_muted') === 'true';
        } catch {
            return false;
        }
    });

    const volumeRef = useRef(volume);
    const isMutedRef = useRef(isMuted);

    useEffect(() => {
        volumeRef.current = volume;
    }, [volume]);

    useEffect(() => {
        isMutedRef.current = isMuted;
    }, [isMuted]);

    const syncPlayerAudio = (targetPlayer = playerRef.current) => {
        if (!targetPlayer) return;
        try {
            if (isMutedRef.current) {
                if (typeof targetPlayer.mute === 'function') targetPlayer.mute();
            } else {
                if (typeof targetPlayer.unMute === 'function') targetPlayer.unMute();
                if (typeof targetPlayer.setVolume === 'function') targetPlayer.setVolume(volumeRef.current);
            }
        } catch (e) {
            console.warn('[HardenedPlayer] Volume/mute sync exception:', e);
        }
    };

    const handleVolumeChange = (e) => {
        const newVol = parseInt(e.target.value, 10);
        setVolumeState(newVol);
        volumeRef.current = newVol;
        try {
            localStorage.setItem('musicmood_volume', String(newVol));
        } catch {
            /* ignore storage write error */
        }

        if (newVol > 0 && isMutedRef.current) {
            setIsMuted(false);
            isMutedRef.current = false;
            try {
                localStorage.setItem('musicmood_muted', 'false');
            } catch {
                /* ignore storage write error */
            }
        }
        syncPlayerAudio();
    };

    const handleToggleMute = () => {
        const nextMuted = !isMuted;
        setIsMuted(nextMuted);
        isMutedRef.current = nextMuted;
        try {
            localStorage.setItem('musicmood_muted', String(nextMuted));
        } catch {
            /* ignore storage write error */
        }
        syncPlayerAudio();
    };

    const playerRef = useRef(null);
    const isPlayerReadyRef = useRef(false);
    const isTransitioningRef = useRef(false);
    const currentTrackRef = useRef(initialTrack);
    const activeVideoIdRef = useRef(initialTrack?.youtube_video_id || initialTrack?.id || null);
    const watchdogTimerRef = useRef(null);

    const clearWatchdog = () => {
        if (watchdogTimerRef.current) {
            clearTimeout(watchdogTimerRef.current);
            watchdogTimerRef.current = null;
        }
        setIsLongBuffering(false);
    };

    const videoId = (currentTrack?.youtube_video_id && currentTrack.youtube_video_id.length === 11)
        ? currentTrack.youtube_video_id
        : (currentTrack?.id && currentTrack.id.length === 11 ? currentTrack.id : null);
    const youtubeUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
    const activeArtist = currentTrack?.artist || sessionState?.currentTrack?.artist || currentTrack?.channelTitle || '';
    const fullSongTitle = currentTrack?.title
        ? `${currentTrack.title}${activeArtist ? ` — ${activeArtist}` : ''}`
        : 'Loading session...';

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
            if (!isTransitioningRef.current && newState.currentTrack && newState.currentTrack.id && newState.currentTrack.id !== currentTrackRef.current?.id) {
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
            const initVid = (currentTrackRef.current?.youtube_video_id && currentTrackRef.current.youtube_video_id.length === 11)
                ? currentTrackRef.current.youtube_video_id
                : (currentTrackRef.current?.id && currentTrackRef.current.id.length === 11 ? currentTrackRef.current.id : '');

            playerRef.current = new YT.Player('musicmood-persistent-player', {
                height: '1',
                width: '1',
                host: 'https://www.youtube.com', // Standard YouTube domain guarantees session audio stream negotiation
                videoId: initVid,
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
                        syncPlayerAudio(event.target);
                        if (currentTrackRef.current) {
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
                                syncPlayerAudio(event.target);
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
                                syncPlayerAudio(event.target);
                                event.target.playVideo();
                            } catch (e) {}
                        }

                        // When track naturally ends, trigger state machine transition
                        if (event.data === 0 && !isTransitioningRef.current) {
                            clearWatchdog();
                            const curTime = event.target?.getCurrentTime?.() || 0;
                            const totalDur = event.target?.getDuration?.() || 0;

                            // Only mark completed if the user actually listened for at least 15s or 40% of duration
                            if (curTime >= 15 || (totalDur > 0 && curTime >= totalDur * 0.4)) {
                                console.log('[HardenedPlayer] Track ended naturally. Auto-transitioning...');
                                sessionEngine.onTrackCompleted(currentTrackRef.current);
                            } else {
                                console.warn('[HardenedPlayer] Track ended prematurely (< 15s). Treating as skip...');
                                sessionEngine.onSkip(currentTrackRef.current);
                            }
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
        if (!track) return;
        const targetVideoId = (track.youtube_video_id && track.youtube_video_id.length === 11)
            ? track.youtube_video_id
            : (track.id && track.id.length === 11 ? track.id : null);

        if (!targetVideoId) {
            console.warn('[HardenedPlayer] Cannot play track - missing 11-char YouTube video ID:', track);
            return;
        }

        // Idempotency Guard: prevent duplicate rapid loads of the exact same video
        if (activeVideoIdRef.current === targetVideoId && isPlaying) {
            console.log(`[HardenedPlayer] Video ${targetVideoId} already active. Skipping duplicate load.`);
            return;
        }
        activeVideoIdRef.current = targetVideoId;
        currentTrackRef.current = track;

        clearWatchdog();
        setCurrentTrack(track);
        setErrorMessage(null);
        setIsBuffering(true);
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setIsSeeking(false);

        // Maintain UI synchronization with sessionEngine's active genre
        if (sessionEngine.state?.activeGenre) {
            setSessionState(prev => ({ ...prev, activeGenre: sessionEngine.state.activeGenre }));
        }

        if (playerRef.current && isPlayerReadyRef.current && typeof playerRef.current.loadVideoById === 'function') {
            console.log(`[HardenedPlayer] Loading video ID via persistent player: ${targetVideoId} (${track.title})`);
            syncPlayerAudio(playerRef.current);

            playerRef.current.loadVideoById({
                videoId: targetVideoId,
                startSeconds: 0
            });
            playerRef.current.playVideo();

            // Adaptive Buffering & Stalled Stream Watchdog
            if (watchdogTimerRef.current) {
                clearTimeout(watchdogTimerRef.current);
            }
            setIsLongBuffering(false);

            // Stage 1: 10-Second Check & Gentle Auto-Nudge
            watchdogTimerRef.current = setTimeout(() => {
                let isAudioMoving = false;
                let isActivelyBuffering = false;
                try {
                    const pState = playerRef.current?.getPlayerState?.();
                    const pTime = playerRef.current?.getCurrentTime?.();
                    if (pState === 1 && pTime > 0) {
                        isAudioMoving = true;
                    } else if (pState === 3) { // 3: BUFFERING (actively receiving stream chunks)
                        isActivelyBuffering = true;
                    }
                } catch (e) {}

                if (isAudioMoving) return;

                // Gentle Auto-Nudge (Re-kick at 10s):
                // Kick YouTube's internal buffer pipeline without restarting the track
                try {
                    syncPlayerAudio();
                    playerRef.current?.playVideo?.();
                } catch (e) {}

                // Display polite pulse indicator with [Skip Now]
                setIsLongBuffering(true);

                // Stage 2: Extended grace window (up to 28-30s total) for slow connections
                watchdogTimerRef.current = setTimeout(() => {
                    let secondStageMoving = false;
                    try {
                        const pState2 = playerRef.current?.getPlayerState?.();
                        const pTime2 = playerRef.current?.getCurrentTime?.();
                        if (pState2 === 1 && pTime2 > 0) secondStageMoving = true;
                    } catch (e) {}

                    if (!secondStageMoving) {
                        console.warn(`[Watchdog ⏱️] Track ${targetVideoId} (${track.title}) timed out after 28s total. Auto-advancing without deleting from DB...`);
                        setIsLongBuffering(false);
                        setErrorMessage(`Stream timed out on "${track.title}". Playing next track...`);
                        loadNextTrack(false);
                    }
                }, 18000);
            }, 10000);
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

    const handleSurpriseMe = async () => {
        const result = sessionEngine.surpriseMe();
        if (result && result.id) {
            setSessionState(prev => ({ ...prev, activeGenre: result.id }));
            await loadNextTrack(false);
        }
    };

    // Keep function refs updated for Media Session API callbacks
    const loadNextTrackRef = useRef(loadNextTrack);
    loadNextTrackRef.current = loadNextTrack;

    const handlePreviousTrackRef = useRef(handlePreviousTrack);
    handlePreviousTrackRef.current = handlePreviousTrack;

    const togglePlayRef = useRef(togglePlay);
    togglePlayRef.current = togglePlay;

    // Web Media Session API: Track Metadata and Artwork
    useEffect(() => {
        if (typeof window === 'undefined' || !('mediaSession' in navigator) || !window.MediaMetadata) return;

        if (currentTrack) {
            const trackTitle = currentTrack.title || 'MusicMood Flow';
            const trackArtist = currentTrack.artist || currentTrack.channelTitle || 'MusicMood Engine';
            const moodLabel = sessionState?.currentMood
                ? sessionState.currentMood.charAt(0).toUpperCase() + sessionState.currentMood.slice(1)
                : (GENRE_NODES[sessionState?.activeGenre]?.label || 'Flow');
            const targetVid = (currentTrack?.youtube_video_id && currentTrack.youtube_video_id.length === 11)
                ? currentTrack.youtube_video_id
                : (currentTrack?.id && currentTrack.id.length === 11 ? currentTrack.id : null);
            const thumb = currentTrack.thumbnail || (targetVid ? `https://img.youtube.com/vi/${targetVid}/hqdefault.jpg` : '/genres.svg');

            try {
                navigator.mediaSession.metadata = new window.MediaMetadata({
                    title: trackTitle,
                    artist: trackArtist,
                    album: `MusicMood • ${moodLabel}`,
                    artwork: [
                        { src: thumb, sizes: '96x96', type: 'image/jpeg' },
                        { src: thumb, sizes: '128x128', type: 'image/jpeg' },
                        { src: thumb, sizes: '192x192', type: 'image/jpeg' },
                        { src: thumb, sizes: '256x256', type: 'image/jpeg' },
                        { src: thumb, sizes: '512x512', type: 'image/jpeg' }
                    ]
                });
            } catch (e) {
                console.warn('[Player] MediaSession metadata error:', e);
            }
        }
    }, [currentTrack, sessionState?.currentMood, sessionState?.activeGenre]);

    // Web Media Session API: Playback State
    useEffect(() => {
        if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;
        try {
            navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
        } catch {
            /* ignore unsupported */
        }
    }, [isPlaying]);

    // Web Media Session API: Position State
    useEffect(() => {
        if (typeof window === 'undefined' || !('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
        if (duration > 0 && currentTime >= 0 && currentTime <= duration) {
            try {
                navigator.mediaSession.setPositionState({
                    duration: Math.max(0, duration),
                    playbackRate: 1,
                    position: Math.min(Math.max(0, currentTime), duration)
                });
            } catch {
                /* ignore unsupported */
            }
        }
    }, [currentTime, duration]);

    // Web Media Session API: Transport Action Handlers (Play, Pause, Next, Previous, Seek)
    useEffect(() => {
        if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;

        const actionHandlers = [
            ['play', () => {
                if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
                    playerRef.current.playVideo();
                } else {
                    togglePlayRef.current?.();
                }
            }],
            ['pause', () => {
                if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
                    playerRef.current.pauseVideo();
                } else {
                    togglePlayRef.current?.();
                }
            }],
            ['previoustrack', () => {
                handlePreviousTrackRef.current?.();
            }],
            ['nexttrack', () => {
                loadNextTrackRef.current?.(true);
            }],
            ['seekto', (details) => {
                if (details.seekTime != null && playerRef.current && typeof playerRef.current.seekTo === 'function') {
                    playerRef.current.seekTo(details.seekTime, true);
                    setCurrentTime(details.seekTime);
                }
            }]
        ];

        for (const [action, handler] of actionHandlers) {
            try {
                navigator.mediaSession.setActionHandler(action, handler);
            } catch {
                /* ignore unsupported action */
            }
        }

        return () => {
            for (const [action] of actionHandlers) {
                try {
                    navigator.mediaSession.setActionHandler(action, null);
                } catch {
                    /* ignore cleanup */
                }
            }
        };
    }, []);

    const currentTrackKey = currentTrack?.id || currentTrack?.youtube_video_id;
    const isCurrentUpvoted = Boolean(currentTrackKey && upvotedTrackIds.has(currentTrackKey));
    const isCurrentFlagged = Boolean(
        currentTrack && (
            (currentTrackKey && flaggedTrackIds.has(currentTrackKey)) ||
            (currentTrack.dbId && flaggedTrackIds.has(currentTrack.dbId))
        )
    );

    const handleUpvote = async () => {
        if (!currentTrack || !currentTrackKey) return;

        const willBeUpvoted = !isCurrentUpvoted;
        setUpvotedTrackIds(prev => {
            const next = new Set(prev);
            if (willBeUpvoted) {
                next.add(currentTrackKey);
            } else {
                next.delete(currentTrackKey);
            }
            try {
                localStorage.setItem('musicmood_upvoted_tracks', JSON.stringify(Array.from(next)));
            } catch { }
            return next;
        });

        // Notify backend & bump artist/track popularity in database
        await upvoteTrack({
            videoId: currentTrackKey,
            artist: currentTrack.artist,
            delta: willBeUpvoted ? 1 : -1
        });

        if (willBeUpvoted) {
            setErrorMessage(`👍 Upvoted! Boosted ${currentTrack.artist || 'artist'} in Taste Graph`);
            setTimeout(() => setErrorMessage(null), 3000);
        }
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

    const handleFlagMisclassification = async () => {
        if (!currentTrackRef.current || isFlagging) return;
        const flagged = currentTrackRef.current;
        const key = flagged.id || flagged.youtube_video_id || flagged.dbId;

        if (key && flaggedTrackIds.has(key)) {
            setErrorMessage(`🏷️ "${flagged.title}" is already flagged for genre review.`);
            setTimeout(() => setErrorMessage(null), 2500);
            return;
        }

        setIsFlagging(true);
        try {
            await flagTrackMisclassification({ track: flagged });

            if (key) {
                setFlaggedTrackIds(prev => new Set(prev).add(key));
            }

            // Purge upcoming queued songs by this misclassified artist so they don't play next
            if (flagged.artist && sessionEngine?.queue) {
                const artistLower = flagged.artist.toLowerCase();
                sessionEngine.queue = sessionEngine.queue.filter(t => (t.artist || '').toLowerCase() !== artistLower);
                sessionEngine.notify();
            }

            setErrorMessage(`🏷️ Flagged "${flagged.title}" for genre review. Playback continues (skip whenever you like).`);
            setTimeout(() => setErrorMessage(null), 4000);
            // Playback continues uninterrupted so user can enjoy the song if they wish and skip when ready
        } catch (err) {
            console.warn('[Player] Flag misclassification error:', err);
            setErrorMessage("⚠️ Could not flag track for review. Please try again.");
            setTimeout(() => setErrorMessage(null), 3000);
        } finally {
            setIsFlagging(false);
        }
    };

    const activeNode = GENRE_NODES[sessionState.activeGenre];

    return (
        <div className="player-card fade-in-up" data-tour="player">
            {/* 1. SESSION & ACTIVE NODE CONTEXT HEADER */}
            <div className="player-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#10b981', fontWeight: 'bold', flexWrap: 'wrap' }}>
                    <span>🛡️ Active Node:</span>
                    <select
                        value={sessionState.activeGenre}
                        onChange={(e) => handleGenreChange(e.target.value)}
                        style={{
                            background: '#0f172a',
                            color: '#38bdf8',
                            border: '1px solid rgba(56, 189, 248, 0.4)',
                            borderRadius: '8px',
                            padding: '0.2rem 0.5rem',
                            fontSize: '0.82rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            outline: 'none',
                            maxWidth: '240px'
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
                    {(() => {
                        const homeGenreId = sessionEngine.getHomeGenreForMood ? sessionEngine.getHomeGenreForMood(sessionState.currentMood) : null;
                        const isHome = sessionState.activeGenre === homeGenreId;
                        const deviation = (!isHome && sessionEngine.getCurrentDeviation) ? sessionEngine.getCurrentDeviation() : null;
                        if (isHome) {
                            return (
                                <span
                                    style={{
                                        color: '#34d399',
                                        fontSize: '0.72rem',
                                        background: 'rgba(16, 185, 129, 0.12)',
                                        border: '1px solid rgba(16, 185, 129, 0.25)',
                                        borderRadius: '6px',
                                        padding: '0.1rem 0.45rem',
                                        fontWeight: '600'
                                    }}
                                    title="Currently playing at your calibrated Home Anchor"
                                >
                                    🏠 Home
                                </span>
                            );
                        }
                        if (deviation && deviation.hops > 0 && deviation.hops < 999) {
                            return (
                                <span
                                    style={{
                                        color: '#38bdf8',
                                        fontSize: '0.72rem',
                                        background: 'rgba(56, 189, 248, 0.12)',
                                        border: '1px solid rgba(56, 189, 248, 0.3)',
                                        borderRadius: '6px',
                                        padding: '0.1rem 0.45rem',
                                        fontWeight: '600'
                                    }}
                                    title={`Home Anchor for ${sessionState.currentMood.toUpperCase()}: ${GENRE_NODES[homeGenreId]?.label || homeGenreId}`}
                                >
                                    Orbit: +{deviation.hops} {deviation.hops === 1 ? 'hop' : 'hops'}
                                </span>
                            );
                        }
                        return null;
                    })()}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                    <span>Energy: <strong>{Math.round(sessionState.energyLevel * 100)}%</strong></span>
                </div>
            </div>

            {/* ERROR RECOVERY BANNER */}
            {errorMessage && (
                <div style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    borderLeft: '4px solid #ef4444',
                    padding: '0.5rem 1.25rem',
                    fontSize: '0.8rem',
                    color: '#fca5a5',
                    textAlign: 'left'
                }}>
                    ⚠️ {errorMessage}
                </div>
            )}

            {/* POLITE BUFFERING BANNER WITH USER CONTROL */}
            {isLongBuffering && (
                <div style={{
                    background: 'rgba(99, 102, 241, 0.14)',
                    borderLeft: '4px solid #818cf8',
                    padding: '0.5rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', color: '#c7d2fe' }}>
                        <span>⏳</span>
                        <span>Slow connection: buffering audio stream...</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            clearWatchdog();
                            loadNextTrack(false);
                        }}
                        style={{
                            background: 'rgba(99, 102, 241, 0.25)',
                            border: '1px solid #818cf8',
                            color: '#e0e7ff',
                            borderRadius: '6px',
                            padding: '0.2rem 0.65rem',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.45)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.25)'}
                    >
                        <span>Skip Now</span>
                        <span>⏭️</span>
                    </button>
                </div>
            )}

            {/* 2. CORE AUDIO BODY */}
            <div className="player-body">
                {/* ROW A: TRACK DETAILS + TRANSPORT CONTROLS + UTILITIES */}
                <div className="player-main-row">
                    {/* LEFT: Track Info (Thumbnail + Titles + Badges) */}
                    <div className="player-track-info">
                        {currentTrack?.thumbnail ? (
                            <img src={currentTrack.thumbnail} alt={currentTrack.title} className="player-thumbnail" referrerPolicy="no-referrer" />
                        ) : (
                            <div className="player-thumbnail-placeholder" />
                        )}

                        <div className="player-text">
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
                            <h3 className="player-title" title={fullSongTitle}>
                                {currentTrack?.title || 'Loading session...'}
                            </h3>
                            <div className="player-channel" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0, overflow: 'hidden' }}>
                                <span
                                    onClick={() => onOpenArtist && activeArtist && onOpenArtist(activeArtist)}
                                    style={{
                                        fontSize: '0.82rem',
                                        color: '#cbd5e1',
                                        fontWeight: '500',
                                        letterSpacing: '0.01em',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        cursor: onOpenArtist && activeArtist ? 'pointer' : 'default',
                                        minWidth: 0
                                    }}
                                    title={fullSongTitle}
                                    onMouseEnter={(e) => { if (onOpenArtist && activeArtist) e.currentTarget.style.color = '#e2e8f0'; }}
                                    onMouseLeave={(e) => { if (onOpenArtist && activeArtist) e.currentTarget.style.color = '#cbd5e1'; }}
                                >
                                    {activeArtist || 'MusicMood Engine'}
                                </span>
                                {currentTrack?.source === 'local_library' && (
                                    <span style={{ color: '#60a5fa', fontSize: '0.72rem', background: 'rgba(96, 165, 250, 0.12)', padding: '0.05rem 0.35rem', borderRadius: '4px', flexShrink: 0 }}>
                                        📁 Server
                                    </span>
                                )}
                                {(currentTrack?.source?.startsWith('jit') || currentTrack?.source === 'jit_player_expansion' || currentTrack?.source === 'jit_local_archive' || currentTrack?.source === 'jit_musicbrainz') && (
                                    <span style={{ color: '#34d399', fontSize: '0.72rem', fontWeight: '500', background: 'rgba(52, 211, 153, 0.12)', padding: '0.05rem 0.35rem', borderRadius: '4px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                        ⚡ JIT
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Quick Feedback (Upvote, Heart & Dislike) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.35rem', flexShrink: 0 }}>
                            <button
                                className="control-btn"
                                onClick={handleUpvote}
                                disabled={!currentTrack}
                                title={isCurrentUpvoted ? "Upvoted! (Click to undo)" : "Upvote track & artist 👍"}
                                style={{
                                    background: isCurrentUpvoted ? 'rgba(52, 211, 153, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                                    border: isCurrentUpvoted ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                                    width: '32px',
                                    height: '32px',
                                    padding: '0.2rem',
                                    borderRadius: '8px',
                                    cursor: currentTrack ? 'pointer' : 'default',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {isCurrentUpvoted ? '👍' : '👍🏻'}
                            </button>

                            <button
                                className="control-btn"
                                onClick={handleLike}
                                title={isCurrentFav ? "Favorited! (Click to remove from favorites)" : "Save to Favorites ❤️"}
                                style={{
                                    background: isCurrentFav ? 'rgba(236, 72, 153, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                                    border: isCurrentFav ? '1px solid #ec4899' : '1px solid rgba(255, 255, 255, 0.1)',
                                    width: '32px',
                                    height: '32px',
                                    padding: '0.2rem',
                                    borderRadius: '8px'
                                }}
                            >
                                {isCurrentFav ? '❤️' : '🤍'}
                            </button>

                            <button
                                className="control-btn"
                                onClick={handleDislike}
                                disabled={isSteering}
                                title="Dislike / Not Music (Immediately skips and purges)"
                                style={{
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    width: '32px',
                                    height: '32px',
                                    padding: '0.2rem',
                                    borderRadius: '8px'
                                }}
                            >
                                👎
                            </button>

                            <button
                                className="control-btn"
                                onClick={handleFlagMisclassification}
                                disabled={!currentTrack || isFlagging || isSteering}
                                title={isCurrentFlagged
                                    ? "Track flagged for genre review (playback continues uninterrupted)"
                                    : "Report Misclassified Genre (Flags track for review; playback continues)"}
                                style={{
                                    background: isCurrentFlagged ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                    border: isCurrentFlagged ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                                    color: isCurrentFlagged ? '#10b981' : 'inherit',
                                    width: '32px',
                                    height: '32px',
                                    padding: '0.2rem',
                                    borderRadius: '8px',
                                    cursor: currentTrack ? 'pointer' : 'default',
                                    opacity: isFlagging ? 0.5 : 1,
                                    fontSize: '0.9rem',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {isCurrentFlagged ? '✓' : '🏷️'}
                            </button>
                        </div>
                    </div>

                    {/* CENTER: Transport Controls */}
                    <div className="player-transport-controls">
                        {/* Previous Track / Back Button */}
                        <button
                            className="control-btn"
                            onClick={handlePreviousTrack}
                            disabled={isSteering}
                            title={sessionState.canGoBack ? `Previous Track (${sessionState.historyCount || 1} in history)` : "Restart track"}
                            style={{
                                opacity: sessionState.canGoBack ? 1 : 0.45,
                                cursor: 'pointer',
                                width: '38px',
                                height: '38px'
                            }}
                        >
                            <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '1.4rem', height: '1.4rem' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                            </svg>
                        </button>

                        {/* Prominent Circular Play / Pause Button */}
                        <button className="play-btn-prominent" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
                            {isPlaying ? (
                                <svg className="icon" fill="currentColor" viewBox="0 0 24 24">
                                    <path fillRule="evenodd" clipRule="evenodd" d="M8 5a2 2 0 00-2 2v10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2H8zm8 0a2 2 0 00-2 2v10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2z" />
                                </svg>
                            ) : (
                                <svg className="icon" fill="currentColor" viewBox="0 0 24 24" style={{ marginLeft: '2px' }}>
                                    <path fillRule="evenodd" clipRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" />
                                </svg>
                            )}
                        </button>

                        {/* Skip / Next */}
                        <button
                            className="control-btn"
                            onClick={() => loadNextTrack(true)}
                            disabled={isSteering}
                            title="Skip Track & Nudge Graph"
                            style={{ width: '38px', height: '38px' }}
                        >
                            <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '1.4rem', height: '1.4rem' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>

                    {/* RIGHT: Exploration & Utilities */}
                    <div className="player-utility-controls">
                        {/* Surprise Me: User explicitly requests a fresh compatible genre */}
                        <button
                            type="button"
                            className="btn-text"
                            data-tour="surprise-me"
                            onClick={handleSurpriseMe}
                            disabled={isSteering}
                            title={`Surprise Me (${sessionState.discoveryLevel < 0.35 ? 'Familiar: 1-hop jump' : sessionState.discoveryLevel <= 0.70 ? 'Balanced: ≤ 2-hop jump' : 'Deep Cuts: wide exploration'})`}
                            style={{
                                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(99, 102, 241, 0.2))',
                                border: '1px solid rgba(168, 85, 247, 0.45)',
                                borderRadius: '8px',
                                padding: '0.38rem 0.75rem',
                                color: '#f3e8ff',
                                fontSize: '0.78rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            <span>🎲</span>
                            <span>Surprise Me</span>
                        </button>

                        {/* Copy YouTube Link */}
                        {youtubeUrl && (
                            <button
                                className="control-btn"
                                onClick={handleCopyLink}
                                title={copiedLink ? "Link copied to clipboard!" : "Copy YouTube link"}
                                style={{
                                    background: copiedLink ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                    border: copiedLink ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.12)',
                                    color: copiedLink ? '#34d399' : '#94a3b8',
                                    width: '34px',
                                    height: '34px',
                                    padding: '0.35rem',
                                    borderRadius: '8px',
                                    cursor: 'pointer'
                                }}
                            >
                                {copiedLink ? (
                                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>✓</span>
                                ) : (
                                    <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '1.1rem', height: '1.1rem' }}>
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
                                    background: 'rgba(239, 68, 68, 0.12)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    color: '#ef4444',
                                    width: '34px',
                                    height: '34px',
                                    padding: '0.35rem',
                                    borderRadius: '8px',
                                    textDecoration: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer'
                                }}
                            >
                                <svg className="icon" fill="currentColor" viewBox="0 0 24 24" style={{ width: '1.15rem', height: '1.15rem' }}>
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
                                border: showQueue ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.12)',
                                color: showQueue ? '#34d399' : '#94a3b8',
                                borderRadius: '8px',
                                padding: '0.4rem 0.65rem',
                                fontSize: '0.78rem',
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
                                padding: '0.05rem 0.4rem',
                                fontSize: '0.7rem',
                                color: (sessionState.queue || []).length > 0 ? '#34d399' : '#94a3b8'
                            }}>
                                {(sessionState.queue || []).length}
                            </span>
                        </button>
                    </div>
                </div>

                {/* ROW B: INTERACTIVE PROGRESS BAR & SCRUBBER */}
                <div className="player-scrubber-row">
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

            {/* 3. UP NEXT & JIT BUFFERED QUEUE TRAY */}
            {showQueue && (
                <div className="fade-in" style={{
                    background: 'rgba(0, 0, 0, 0.25)',
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    padding: '0.85rem 1.5rem',
                    boxShadow: 'inset 0 4px 12px rgba(0, 0, 0, 0.3)'
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
                                        sessionEngine.playCustomTrack(t, false);
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

            {/* 4. REAL-TIME SESSION STEERING CONTROLS */}
            <div className="player-steering-panel">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                    {/* Shorter Energy Slider (Purple / Violet) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>⚡ Energy:</span>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={sessionState.energyLevel}
                            onChange={(e) => sessionEngine.setEnergy(parseFloat(e.target.value))}
                            style={{
                                accentColor: '#a855f7',
                                cursor: 'pointer',
                                width: '110px'
                            }}
                            title={`Target Energy: ${Math.round(sessionState.energyLevel * 100)}%`}
                        />
                    </div>

                    {/* Master Volume Slider (Cyan / Blue Hue) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <button
                            type="button"
                            onClick={handleToggleMute}
                            aria-label={isMuted ? "Unmute" : "Mute"}
                            title={isMuted ? "Unmute" : `Mute (Volume: ${volume}%)`}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 0,
                                display: 'flex',
                                alignItems: 'center',
                                color: isMuted ? '#f87171' : '#38bdf8',
                                fontSize: '0.95rem'
                            }}
                        >
                            {isMuted || volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊'}
                        </button>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={isMuted ? 0 : volume}
                            onChange={handleVolumeChange}
                            aria-label="Master volume"
                            title={`Master Volume: ${isMuted ? 0 : volume}%`}
                            style={{
                                accentColor: '#06b6d4',
                                cursor: 'pointer',
                                width: '100px'
                            }}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>🎤 Vocals:</span>
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

                <div data-tour="discovery" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>🧭 Discovery:</span>
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

            {/* STRICTLY INVISIBLE AUDIO-ONLY YOUTUBE ENGINE */}
            <div
                aria-hidden="true"
                style={{
                    position: 'fixed',
                    top: '-9999px',
                    left: '-9999px',
                    width: '1px',
                    height: '1px',
                    opacity: 0,
                    pointerEvents: 'none',
                    overflow: 'hidden',
                    zIndex: -9999
                }}
            >
                <div id="musicmood-persistent-player"></div>
            </div>
        </div>
    );
}

export default Player;
