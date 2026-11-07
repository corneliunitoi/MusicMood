import { useState, useEffect } from 'react';
import { fetchUserProfile, fetchUserPlaylists } from '../services/youtube';
import { supabase } from '../services/supabaseService';
import { sessionEngine } from '../services/sessionStateMachine';
import MoodBar, { allMoods } from './MoodBar';
import PlaylistView from './PlaylistView';
import TasteGraphSetup from './TasteGraphSetup';
import Player from './Player';
import MoodHistory from './MoodHistory';
import OnboardingWizard from './OnboardingWizard';
import JitFeedModal from './JitFeedModal';
import FavoritesPane from './FavoritesPane';
import { getFavoritesCount, subscribeFavorites } from '../services/favoritesService';

function Dashboard({ token, onLogout }) {
    const [profile, setProfile] = useState(null);
    const [playlists, setPlaylists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [selectedMood, setSelectedMood] = useState('focus');
    const [activeTopPanel, setActiveTopPanel] = useState(() => 
        !localStorage.getItem('musicMood_user_calibration') ? 'calibrate' : null
    );
    const [favoritesCount, setFavoritesCount] = useState(() => getFavoritesCount());
    const [showJitFeed, setShowJitFeed] = useState(false);

    // Mutual exclusivity: selecting one panel unselects all others
    const toggleTopPanel = (panelName) => {
        setActiveTopPanel(prev => prev === panelName ? null : panelName);
    };

    const showWizard = activeTopPanel === 'calibrate';
    const showVisualGraph = activeTopPanel === 'graph';
    const showPlaylists = activeTopPanel === 'playlists';
    const showFavorites = activeTopPanel === 'favorites';

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
                const [profileData, playlistsData] = await Promise.all([
                    fetchUserProfile(token),
                    fetchUserPlaylists(token),
                ]);
                setProfile(profileData);
                setPlaylists(playlistsData);
            } catch (err) {
                console.error(err);
                if (err.message === 'Unauthorized') {
                    onLogout();
                } else {
                    setError(err.message || 'Failed to load YouTube profile. Please try again.');
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
                {profile && (
                    <div className="profile-mini">
                        <img src={profile.picture} alt={profile.name} className="profile-avatar-mini" referrerPolicy="no-referrer" />
                        <span>{profile.name}</span>
                    </div>
                )}
                <div className="header-actions">
                    <div className="cloud-status" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', marginRight: '1rem', fontSize: '0.85rem' }}>
                        <span style={{ color: '#34d399', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '9999px', padding: '0.2rem 0.6rem' }}>
                            ⚡ <strong>{playableCount}</strong> Playable
                        </span>
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
                        <span className="text-secondary" style={{ opacity: 0.8 }}>
                            📁 <strong>{archiveCount.toLocaleString()}</strong> Archive
                        </span>
                    </div>

                    {/* 4 SINGLE-SELECT EXCLUSIVE PANELS */}
                    <nav className="header-nav-pills" role="tablist" aria-label="Dashboard views">
                        <button
                            type="button"
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
                            className={`header-pill-btn ${showVisualGraph ? 'active' : ''}`}
                            onClick={() => toggleTopPanel('graph')}
                            aria-selected={showVisualGraph}
                            title="Explore the harmonic soundscape graph"
                        >
                            <span className="pill-icon">❄️</span>
                            <span className="pill-label">Visual Graph</span>
                            <span className="pill-label-short">Graph</span>
                        </button>

                        <button
                            type="button"
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

                    <button className="btn-text" onClick={onLogout}>Sign Out</button>
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

                {/* VISUAL TASTE GRAPH MODAL/PANEL */}
                {showVisualGraph && (
                    <TasteGraphSetup
                        onSave={(profileData) => {
                            setActiveTopPanel(null);
                        }}
                    />
                )}

                {/* FAVORITES PANE */}
                {showFavorites && (
                    <FavoritesPane
                        onPlayTrack={(track) => {
                            setActiveTrack(track);
                            sessionEngine.commitTrack(track);
                        }}
                        onClose={() => setActiveTopPanel(null)}
                    />
                )}

                {/* HEADSPACE SELECTION */}
                <div className="headspace-header fade-in">
                    <h2 className="headspace-title">What headspace do you want right now?</h2>
                    <p className="headspace-subtitle">Choose an emotion, situation, or vibe to dynamically steer playback</p>
                </div>

                <MoodBar selectedMood={selectedMood} onSelectMood={handleMoodSelect} />

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
                            token={token}
                            onPlayTrack={(track) => {
                                setActiveTrack(track);
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

                {!showWizard && <MoodHistory history={moodHistory} />}

                {/* JIT ORGANIC GROWTH AUDIT MODAL */}
                <JitFeedModal isOpen={showJitFeed} onClose={() => setShowJitFeed(false)} />
            </main>
        </div>
    );
}

export default Dashboard;
