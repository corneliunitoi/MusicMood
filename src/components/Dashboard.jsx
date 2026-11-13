import { useState, useEffect } from 'react';
import { fetchUserProfile, fetchUserPlaylists } from '../services/youtube';
import { requestGoogleLogin } from '../services/auth';
import { supabase } from '../services/supabaseService';
import { sessionEngine } from '../services/sessionStateMachine';
import MoodBar, { allMoods } from './MoodBar';
import PlaylistView from './PlaylistView';
import Player from './Player';
import MoodHistory from './MoodHistory';
import OnboardingWizard from './OnboardingWizard';
import JitFeedModal from './JitFeedModal';
import FavoritesPane from './FavoritesPane';
import ArtistsExplorer from './ArtistsExplorer';
import WelcomeSplash from './WelcomeSplash';
import GuidedTour from './GuidedTour';
import FeedbackModal from './FeedbackModal';
import AboutModal from './AboutModal';
import { getFavoritesCount, subscribeFavorites } from '../services/favoritesService';
import {
    initUserProfile,
    getCurrentUser,
    isAdmin,
    isPowerUser,
    isBetaTester,
    canAccess,
    TEST_PERSONAS,
    switchTestPersona,
    isTestUserActive,
    subscribeUser
} from '../services/userService';

function Dashboard({ token, onLogout }) {
    const [profile, setProfile] = useState(null);
    const [playlists, setPlaylists] = useState([]);
    const [playlistError, setPlaylistError] = useState(null);
    const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const refreshPlaylists = async (forceConsent = false) => {
        setIsLoadingPlaylists(true);
        setPlaylistError(null);
        try {
            let activeToken = token;
            if (forceConsent) {
                activeToken = await requestGoogleLogin({ prompt: 'consent' });
            }
            const data = await fetchUserPlaylists(activeToken);
            setPlaylists(data || []);
            setPlaylistError(null);
        } catch (err) {
            console.warn('[Dashboard] Could not fetch private YouTube playlists:', err.message);
            setPlaylistError(err.message);
        } finally {
            setIsLoadingPlaylists(false);
        }
    };

    const [selectedMood, setSelectedMood] = useState('focus');
    const [activeTopPanel, setActiveTopPanel] = useState(null);
    const [favoritesCount, setFavoritesCount] = useState(() => getFavoritesCount());
    const [showJitFeed, setShowJitFeed] = useState(false);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [showAboutModal, setShowAboutModal] = useState(false);

    // Welcome Splash & Guided Spotlight Tour state
    const [showWelcomeSplash, setShowWelcomeSplash] = useState(() => !localStorage.getItem('musicMood_welcome_seen'));
    const [isTourActive, setIsTourActive] = useState(false);

    const startTour = (dontShowAgain = true) => {
        if (dontShowAgain) {
            localStorage.setItem('musicMood_welcome_seen', 'true');
        } else {
            localStorage.removeItem('musicMood_welcome_seen');
        }
        setShowWelcomeSplash(false);
        setIsTourActive(true);
    };

    const closeWelcomeSplash = (dontShowAgain = true) => {
        if (dontShowAgain) {
            localStorage.setItem('musicMood_welcome_seen', 'true');
        } else {
            localStorage.removeItem('musicMood_welcome_seen');
        }
        setShowWelcomeSplash(false);
    };

    const finishTour = () => {
        localStorage.setItem('musicMood_tour_seen', 'true');
        setIsTourActive(false);
    };

    // Mutual exclusivity: selecting one panel unselects all others
    const toggleTopPanel = (panelName) => {
        setActiveTopPanel(prev => prev === panelName ? null : panelName);
    };

    const showWizard = activeTopPanel === 'calibrate';
    const showPlaylists = activeTopPanel === 'playlists';
    const showFavorites = activeTopPanel === 'favorites';
    const showArtists = activeTopPanel === 'artists';

    const [activeTrack, setActiveTrack] = useState(null);
    const [isDiscovering, setIsDiscovering] = useState(false);

    const [playableCount, setPlayableCount] = useState(0);
    const [archiveCount, setArchiveCount] = useState(0);
    const [jitCount, setJitCount] = useState(0);

    const [calibration, setCalibration] = useState(() => sessionEngine.getCalibration());

    const [moodHistory, setMoodHistory] = useState(() => {
        const saved = localStorage.getItem('musicMood_history');
        try { return saved ? JSON.parse(saved) : []; } catch (e) { return []; }
    });

    useEffect(() => {
        const loadData = async () => {
            try {
                // 1. Fetch user identity profile (required for session)
                const profileData = await fetchUserProfile(token);
                const resolvedUser = await initUserProfile(profileData);
                setProfile({ ...profileData, ...resolvedUser });

                if (resolvedUser.calibration && resolvedUser.calibration.radarValues) {
                    setCalibration(resolvedUser.calibration);
                    sessionEngine.saveCalibration(resolvedUser.calibration);
                } else if (!localStorage.getItem('musicMood_user_calibration')) {
                    // First time listener with zero local or cloud calibration
                    if (localStorage.getItem('musicMood_welcome_seen')) {
                        setActiveTopPanel('calibrate');
                    }
                }

                // 2. Fetch user playlists gracefully (optional / non-fatal)
                try {
                    const playlistsData = await fetchUserPlaylists(token);
                    setPlaylists(playlistsData || []);
                    setPlaylistError(null);
                } catch (playlistErr) {
                    console.warn('[Dashboard] Could not fetch private YouTube playlists (non-fatal):', playlistErr.message);
                    setPlaylistError(playlistErr.message);
                    setPlaylists([]);
                }
            } catch (err) {
                console.error(err);
                if (err.message === 'Unauthorized') {
                    onLogout();
                } else {
                    setError(err.message || 'Failed to load user profile. Please try again.');
                }
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [token]);

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const [playableRes, archiveRes, jitRes] = await Promise.all([
                    supabase.from('tracks').select('*', { count: 'exact', head: true }),
                    supabase.from('local_metadata').select('*', { count: 'exact', head: true }),
                    supabase.from('tracks').select('*', { count: 'exact', head: true }).ilike('source', '%jit%')
                ]);

                if (!playableRes.error) {
                    setPlayableCount(playableRes.count || 0);
                }
                if (!archiveRes.error) {
                    setArchiveCount(archiveRes.count || 0);
                }
                if (!jitRes.error) {
                    setJitCount(jitRes.count || 0);
                }
            } catch (e) {
                console.error("Failed to fetch library counts:", e);
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 15000); // Check every 15s
        window.addEventListener('focus', fetchStatus);
        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', fetchStatus);
        };
    }, []);

    // Subscribe to favorites count
    useEffect(() => {
        const unsub = subscribeFavorites((favs) => {
            setFavoritesCount(favs.length);
        });
        return unsub;
    }, []);

    // Subscribe to user profile & persona changes
    useEffect(() => {
        const unsub = subscribeUser((user) => {
            if (user) setProfile(prev => ({ ...prev, ...user }));
        });
        return unsub;
    }, []);

    // Subscribe to state machine to keep calibration, counts, and history in sync
    useEffect(() => {
        const unsubscribe = sessionEngine.subscribe((state) => {
            setCalibration({ ...sessionEngine.getCalibration() });

            if (state?.currentTrack && state.currentTrack.id) {
                const cur = state.currentTrack;
                const moodObj = allMoods.find(m => m.id === state.currentMood);
                setMoodHistory(prev => {
                    if (prev.length > 0 && prev[0].trackTitle === cur.title && prev[0].artist === cur.artist) {
                        return prev;
                    }
                    const newHistoryItem = {
                        id: Date.now(),
                        timestamp: new Date().toISOString(),
                        moodName: moodObj?.label || 'Session',
                        moodEmoji: moodObj?.emoji || '🎵',
                        matchedGenre: cur.genre || state.activeGenre || 'Intent Mix',
                        trackTitle: cur.title,
                        artist: cur.artist
                    };
                    const updated = [newHistoryItem, ...prev].slice(0, 50);
                    localStorage.setItem('musicMood_history', JSON.stringify(updated));
                    return updated;
                });
            }
        });
        return unsubscribe;
    }, []);

    const handleMoodSelect = async (moodId) => {
        setSelectedMood(moodId);
        setIsDiscovering(true);
        setError(null);

        try {
            const moodObj = allMoods.find(m => m.id === moodId);
            sessionEngine.setMood(moodId);

            // Fetch the first track guaranteed by the State Machine & Invariant Guards
            const track = await sessionEngine.getNextTrack(token);
            if (!track) {
                throw new Error("No guard-checked track could be resolved. Check network or API quota.");
            }

            setActiveTrack(track);

            const newHistoryItem = {
                id: Date.now(),
                timestamp: new Date().toISOString(),
                moodName: moodObj.label,
                moodEmoji: moodObj.emoji,
                matchedGenre: track.genre || "Intent Mix",
                trackTitle: track.title,
                artist: track.artist
            };

            setMoodHistory(prev => {
                const newHistory = [newHistoryItem, ...prev].slice(0, 50);
                localStorage.setItem('musicMood_history', JSON.stringify(newHistory));
                return newHistory;
            });
        } catch (err) {
            console.error("Anti-drift discovery failed:", err);
            setError(err.message || 'Could not find a track adhering to active guards. Try adjusting dealbreakers!');
        } finally {
            setIsDiscovering(false);
        }
    };

    if (loading) {
        return (
            <div className="hero">
                <h1 className="animate-pulse">Starting Music Engine...</h1>
            </div>
        );
    }

    if (error && !activeTrack) {
        return (
            <div className="hero">
                <h1>Session Alert</h1>
                <p className="subtitle">{error}</p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button className="btn-secondary" onClick={() => setError(null)}>Dismiss</button>
                    <button className="btn-primary" onClick={onLogout}>Sign Out</button>
                </div>
            </div>
        );
    }

    const currentMoodObj = allMoods.find(m => m.id === selectedMood);

    return (
        <div className="dashboard">
            <header className="dashboard-header-simple">
                <div className="header-top-bar">
                    {profile ? (
                        <div className="profile-mini" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <img src={profile.picture || profile.avatar_url} alt={profile.name || profile.username} className="profile-avatar-mini" referrerPolicy="no-referrer" />
                            <span style={{ fontWeight: '500' }}>{profile.name || profile.username}</span>

                            {/* Role & Class Badges */}
                            {profile.role === 'admin' ? (
                                <span
                                    style={{
                                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                        color: '#0f172a',
                                        fontWeight: '800',
                                        fontSize: '0.65rem',
                                        padding: '0.12rem 0.45rem',
                                        borderRadius: '9999px',
                                        letterSpacing: '0.04em',
                                        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4)',
                                        userSelect: 'none'
                                    }}
                                    title="Role: Admin | Class: Poweruser"
                                >
                                    👑 ADMIN • POWERUSER
                                </span>
                            ) : profile.user_class === 'beta' ? (
                                <span
                                    style={{
                                        background: 'rgba(56, 189, 248, 0.2)',
                                        color: '#38bdf8',
                                        border: '1px solid rgba(56, 189, 248, 0.4)',
                                        fontWeight: '700',
                                        fontSize: '0.65rem',
                                        padding: '0.12rem 0.45rem',
                                        borderRadius: '9999px',
                                        letterSpacing: '0.04em',
                                        userSelect: 'none'
                                    }}
                                    title="Role: User | Class: Beta Tester"
                                >
                                    🧪 BETA
                                </span>
                            ) : profile.user_class === 'regular' ? (
                                <span
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.08)',
                                        color: '#94a3b8',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        fontWeight: '600',
                                        fontSize: '0.65rem',
                                        padding: '0.12rem 0.45rem',
                                        borderRadius: '9999px',
                                        userSelect: 'none'
                                    }}
                                    title="Role: User | Class: Regular"
                                >
                                    REGULAR
                                </span>
                            ) : null}

                            {/* Test Persona Switcher for Feature Validation */}
                            {(isAdmin() || isTestUserActive()) && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '0.2rem' }}>
                                    <select
                                        value={isTestUserActive() ? (profile.personaKey || 'test') : 'real'}
                                        onChange={(e) => switchTestPersona(e.target.value)}
                                        title="Switch User Persona to validate feature gating and permissions"
                                        style={{
                                            background: isTestUserActive() ? 'rgba(245, 158, 11, 0.18)' : 'rgba(30, 41, 59, 0.85)',
                                            color: isTestUserActive() ? '#fbbf24' : '#cbd5e1',
                                            border: isTestUserActive() ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.15)',
                                            borderRadius: '6px',
                                            padding: '0.15rem 0.45rem',
                                            fontSize: '0.72rem',
                                            outline: 'none',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <option value="real">👤 Real Account</option>
                                        <optgroup label="── Local Test Personas ──">
                                            {TEST_PERSONAS.map(p => (
                                                <option key={p.key} value={p.key}>
                                                    {p.badge} ({p.name})
                                                </option>
                                            ))}
                                        </optgroup>
                                    </select>
                                </div>
                            )}
                        </div>
                    ) : <div />}

                    <div className="header-top-right">
                        <button
                            type="button"
                            className="btn-feedback"
                            onClick={() => setShowAboutModal(true)}
                            title="About MusicMood & Author"
                            style={{ borderColor: 'rgba(99, 102, 241, 0.35)', color: '#c7d2fe' }}
                        >
                            <span className="feedback-icon">ℹ️</span>
                            <span className="feedback-label">About</span>
                        </button>

                        <button
                            type="button"
                            className="btn-feedback"
                            onClick={() => setShowFeedbackModal(true)}
                            title="Share feedback or suggest features"
                        >
                            <span className="feedback-icon">💬</span>
                            <span className="feedback-label">Feedback</span>
                        </button>

                        <button
                            type="button"
                            className="btn-signout"
                            onClick={onLogout}
                            title="Sign out of MusicMood"
                        >
                            <span className="signout-icon">🚪</span>
                            <span className="signout-label">Sign Out</span>
                        </button>
                    </div>
                </div>

                <div className="header-actions">
                    {/* Track stats (Playable, JIT, Archive) strictly visible ONLY to Admin */}
                    {isAdmin() && (
                        <div className="cloud-status" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                            <span style={{ color: '#34d399', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '9999px', padding: '0.2rem 0.6rem' }}>
                                ⚡ <strong>{playableCount}</strong> Playable
                            </span>
                            {/* JIT Monitor is internal: visible only to Poweruser / Admin */}
                            {canAccess('jit_monitor') && (
                                <button
                                    onClick={() => setShowJitFeed(true)}
                                    style={{
                                        background: showJitFeed ? 'rgba(52, 211, 153, 0.25)' : 'rgba(52, 211, 153, 0.12)',
                                        border: '1px solid rgba(52, 211, 153, 0.35)',
                                        borderRadius: '9999px',
                                        padding: '0.2rem 0.65rem',
                                        color: '#34d399',
                                        fontSize: '0.8rem',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem'
                                    }}
                                    title="Open JIT Organic Ingestion Monitor (Inspect & Purge)"
                                >
                                    🌱 <strong>{jitCount}</strong> JIT Finds
                                </button>
                            )}
                            <span className="text-secondary" style={{ opacity: 0.8 }}>
                                📁 <strong>{archiveCount.toLocaleString()}</strong> Archive
                            </span>
                        </div>
                    )}

                    {/* 4 SINGLE-SELECT EXCLUSIVE PANELS + TOUR PILL */}
                    <nav className="header-nav-pills" role="tablist" aria-label="Dashboard views" style={{ marginLeft: isAdmin() ? undefined : 'auto' }}>
                        <button
                            type="button"
                            className="header-pill-btn"
                            onClick={() => setShowWelcomeSplash(true)}
                            title="How MusicMood works & interactive tour"
                            style={{ border: '1px dashed rgba(168, 85, 247, 0.45)', color: '#d8b4fe' }}
                        >
                            <span className="pill-icon">✨</span>
                            <span className="pill-label">How It Works</span>
                            <span className="pill-label-short">Tour</span>
                        </button>

                        <button
                            type="button"
                            data-tour="calibrate"
                            className={`header-pill-btn ${showWizard ? 'active' : ''}`}
                            onClick={() => toggleTopPanel('calibrate')}
                            aria-selected={showWizard}
                            title="Calibrate your musical Taste DNA"
                        >
                            <span className="pill-icon">⚙️</span>
                            <span className="pill-label">Calibrate Taste</span>
                            <span className="pill-label-short">Calibrate</span>
                        </button>

                        <button
                            type="button"
                            data-tour="playlists"
                            className={`header-pill-btn ${showPlaylists ? 'active' : ''}`}
                            onClick={() => toggleTopPanel('playlists')}
                            aria-selected={showPlaylists}
                            title="Ingest public or private YouTube playlists"
                        >
                            <span className="pill-icon">📥</span>
                            <span className="pill-label">Ingest YouTube Playlists</span>
                            <span className="pill-label-short">Playlists</span>
                        </button>

                        <button
                            type="button"
                            className={`header-pill-btn ${showArtists ? 'active' : ''}`}
                            onClick={() => toggleTopPanel('artists')}
                            aria-selected={showArtists}
                            title="Browse catalog artists by genre"
                        >
                            <span className="pill-icon">👤</span>
                            <span className="pill-label">Artists</span>
                            <span className="pill-label-short">Artists</span>
                        </button>

                        <button
                            type="button"
                            className={`header-pill-btn ${showFavorites ? 'active favorites' : ''}`}
                            onClick={() => toggleTopPanel('favorites')}
                            aria-selected={showFavorites}
                            title="View your favorite tracks"
                        >
                            <span className="pill-icon">❤️</span>
                            <span className="pill-label">Favorites</span>
                            <span className="pill-label-short">Favs</span>
                            {favoritesCount > 0 && (
                                <span className="pill-count-badge">
                                    {favoritesCount}
                                </span>
                            )}
                        </button>
                    </nav>
                </div>
            </header>

            <main className="dashboard-main">
                {/* ONBOARDING WIZARD */}
                {showWizard && (
                    <OnboardingWizard
                        onComplete={(saved) => {
                            setCalibration(saved);
                            setActiveTopPanel(null);
                            if (!activeTrack) {
                                handleMoodSelect(selectedMood);
                            }
                        }}
                        onClose={() => setActiveTopPanel(null)}
                    />
                )}

                {/* FAVORITES PANE */}
                {showFavorites && (
                    <FavoritesPane
                        onPlayTrack={(track) => {
                            setActiveTrack(track);
                            sessionEngine.playOnDemand(track);
                        }}
                        onClose={() => setActiveTopPanel(null)}
                    />
                )}

                {/* ARTISTS EXPLORER */}
                {showArtists && (
                    <ArtistsExplorer
                        onPlayTrack={(track) => {
                            setActiveTrack(track);
                            sessionEngine.playOnDemand(track);
                            setActiveTopPanel(null);
                        }}
                        onClose={() => setActiveTopPanel(null)}
                    />
                )}

                {/* HEADSPACE SELECTION */}
                <div className="headspace-header fade-in">
                    <h2 className="headspace-title">What headspace do you want right now?</h2>
                    <p className="headspace-subtitle">Choose an emotion, situation, or vibe to dynamically steer playback</p>
                </div>

                <div data-tour="mood-bar">
                    <MoodBar selectedMood={selectedMood} onSelectMood={handleMoodSelect} />
                </div>

                {/* PLAYBACK & STEERING SECTION */}
                {selectedMood && !showWizard && (
                    <div className="playback-section fade-in">
                        {isDiscovering ? (
                            <div className="discovering-card">
                                <span className="spinner" style={{ width: '1.25rem', height: '1.25rem', borderWidth: '2px' }}></span>
                                <span>Resolving guard-checked track for <strong>{currentMoodObj?.emoji} {currentMoodObj?.label}</strong>...</span>
                            </div>
                        ) : activeTrack ? (
                            <Player initialTrack={activeTrack} token={token} />
                        ) : (
                            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                                <button
                                    className="btn-primary"
                                    onClick={() => handleMoodSelect(selectedMood)}
                                    style={{ padding: '0.85rem 2.2rem', fontSize: '1.05rem', borderRadius: '9999px', boxShadow: '0 8px 25px -4px rgba(99, 102, 241, 0.4)' }}
                                >
                                    ▶ Start Session in {currentMoodObj?.emoji} {currentMoodObj?.label} Mode
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* YOUTUBE PLAYLIST INGESTION & IMPORTER */}
                {showPlaylists && (
                    <div className="playlists-section fade-in" style={{ margin: '2.5rem auto', maxWidth: '900px' }}>
                        <h2 style={{ marginBottom: '0.5rem', textAlign: 'center' }}>📥 YouTube Playlist Importer</h2>
                        <p className="subtitle" style={{ marginBottom: '1.5rem', textAlign: 'center', fontSize: '0.95rem' }}>
                            Ingest, map, and play tracks directly from YouTube playlists with <strong>zero Google API quota</strong>.
                        </p>
                        <PlaylistView
                            playlists={playlists}
                            playlistError={playlistError}
                            isLoadingPlaylists={isLoadingPlaylists}
                            onRefreshPlaylists={refreshPlaylists}
                            token={token}
                            onPlayTrack={(track) => {
                                setActiveTrack(track);
                                sessionEngine.playOnDemand(track);
                            }}
                            onIngestComplete={async () => {
                                try {
                                    const [pRes, aRes] = await Promise.all([
                                        supabase.from('tracks').select('*', { count: 'exact', head: true }),
                                        supabase.from('local_metadata').select('*', { count: 'exact', head: true })
                                    ]);
                                    if (pRes.count) setPlayableCount(pRes.count);
                                    if (aRes.count) setArchiveCount(aRes.count);
                                } catch (e) {
                                    console.warn('Failed to refresh counts:', e);
                                }
                            }}
                        />
                    </div>
                )}

                {/* JIT ORGANIC GROWTH AUDIT MODAL */}
                <JitFeedModal isOpen={showJitFeed} onClose={() => setShowJitFeed(false)} />

                {/* WELCOME SPLASH MANIFESTO */}
                {showWelcomeSplash && (
                    <WelcomeSplash
                        onStartTour={startTour}
                        onClose={closeWelcomeSplash}
                    />
                )}

                {/* USER FEEDBACK MODAL */}
                <FeedbackModal
                    isOpen={showFeedbackModal}
                    onClose={() => setShowFeedbackModal(false)}
                    currentUser={profile}
                />

                {/* ABOUT MODAL */}
                <AboutModal
                    isOpen={showAboutModal}
                    onClose={() => setShowAboutModal(false)}
                />

                {/* GUIDED SPOTLIGHT TOUR ACROSS LIVE INTERFACE */}
                {isTourActive && (
                    <GuidedTour
                        onFinish={finishTour}
                        onOpenCalibrate={() => {
                            finishTour();
                            setActiveTopPanel('calibrate');
                        }}
                    />
                )}
            </main>
        </div>
    );
}

export default Dashboard;
