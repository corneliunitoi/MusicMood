import { useState, useEffect } from 'react';
import { fetchUserProfile, fetchUserPlaylists } from '../services/youtube';
import { supabase } from '../services/supabaseService';
import { sessionEngine } from '../services/sessionStateMachine';
import { GENRE_NODES } from '../services/tasteGraph';
import MoodBar, { allMoods } from './MoodBar';
import PlaylistView from './PlaylistView';
import TasteGraphSetup from './TasteGraphSetup';
import Player from './Player';
import MoodHistory from './MoodHistory';
import OnboardingWizard from './OnboardingWizard';

function Dashboard({ token, onLogout }) {
    const [profile, setProfile] = useState(null);
    const [playlists, setPlaylists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [selectedMood, setSelectedMood] = useState('focus');
    const [showPlaylists, setShowPlaylists] = useState(false);
    const [showWizard, setShowWizard] = useState(() => !localStorage.getItem('musicMood_user_calibration'));
    const [showVisualGraph, setShowVisualGraph] = useState(false);

    const [activeTrack, setActiveTrack] = useState(null);
    const [isDiscovering, setIsDiscovering] = useState(false);

    const [playableCount, setPlayableCount] = useState(0);
    const [archiveCount, setArchiveCount] = useState(0);

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
                const [playableRes, archiveRes] = await Promise.all([
                    supabase.from('tracks').select('*', { count: 'exact', head: true }),
                    supabase.from('local_metadata').select('*', { count: 'exact', head: true })
                ]);

                if (!playableRes.error) {
                    setPlayableCount(playableRes.count || 0);
                }
                if (!archiveRes.error) {
                    setArchiveCount(archiveRes.count || 0);
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

    // Subscribe to state machine to keep calibration in sync
    useEffect(() => {
        const unsubscribe = sessionEngine.subscribe(() => {
            setCalibration({ ...sessionEngine.getCalibration() });
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
                        <span className="text-secondary" style={{ opacity: 0.8 }}>
                            📁 <strong>{archiveCount.toLocaleString()}</strong> Archive
                        </span>
                    </div>
                    <button
                        className="btn-text"
                        onClick={() => setShowWizard(!showWizard)}
                        style={{ color: showWizard ? '#a855f7' : '#94a3b8', fontWeight: showWizard ? 'bold' : 'normal' }}
                    >
                        ⚙️ Calibrate Taste
                    </button>
                    <button
                        className="btn-text"
                        onClick={() => setShowVisualGraph(!showVisualGraph)}
                        style={{ color: showVisualGraph ? '#a855f7' : '#94a3b8' }}
                    >
                        🕸️ Visual Graph
                    </button>
                    <button
                        className="btn-text"
                        onClick={() => setShowPlaylists(!showPlaylists)}
                        style={{ color: showPlaylists ? '#a855f7' : '#94a3b8', fontWeight: showPlaylists ? 'bold' : 'normal' }}
                    >
                        📥 Ingest YouTube Playlists
                    </button>
                    <button className="btn-text" onClick={onLogout}>Sign Out</button>
                </div>
            </header>

            <main className="dashboard-main">
                {/* ONBOARDING WIZARD */}
                {showWizard && (
                    <OnboardingWizard
                        onComplete={(saved) => {
                            setCalibration(saved);
                            setShowWizard(false);
                        }}
                    />
                )}

                {/* VISUAL TASTE GRAPH MODAL/PANEL */}
                {showVisualGraph && !showWizard && (
                    <TasteGraphSetup
                        onSave={(profileData) => {
                            setShowVisualGraph(false);
                        }}
                    />
                )}

                {/* ACTIVE ANCHORS & GUARDS SUMMARY BAR */}
                {!showWizard && !showVisualGraph && (
                    <div className="taste-profile-container fade-in" style={{ padding: '0.75rem 1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', margin: '1rem auto', maxWidth: '850px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                <span style={{ color: '#a855f7', fontWeight: 'bold' }}>⚓ Active Anchors:</span>
                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                    {calibration.anchors.map(id => (
                                        <span key={id} style={{ background: 'rgba(168, 85, 247, 0.2)', border: '1px solid rgba(168, 85, 247, 0.4)', borderRadius: '6px', padding: '0.15rem 0.5rem', fontSize: '0.75rem', color: '#e9d5ff' }}>
                                            {GENRE_NODES[id]?.label || id}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                                <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                                    🚫 {calibration.dealbreakers?.length || 0} dealbreakers
                                </span>
                                <span style={{
                                    fontSize: '0.75rem',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '6px',
                                    background: calibration.blockAiGenerated !== false ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)',
                                    color: calibration.blockAiGenerated !== false ? '#34d399' : '#94a3b8',
                                    border: calibration.blockAiGenerated !== false ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255,255,255,0.1)'
                                }}>
                                    🛡️ Anti-AI: {calibration.blockAiGenerated !== false ? 'ON' : 'OFF'}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                <h1 className="mood-prompt fade-in-up" style={{ marginTop: '2rem' }}>
                    What headspace do you want right now?
                </h1>
                <p className="subtitle" style={{ marginBottom: '1.5rem', fontSize: '0.95rem' }}>
                    Select a state below. The <strong>Anti-Drift Engine</strong> ensures your music never wanders into generic algorithms.
                </p>

                <MoodBar selectedMood={selectedMood} onSelectMood={handleMoodSelect} />

                {/* PLAYBACK & STEERING SECTION */}
                {selectedMood && !showWizard && (
                    <div className="mood-feedback fade-in-up">
                        {isDiscovering ? (
                            <p className="subtitle" style={{ margin: '2rem auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                <span className="spinner" style={{ width: '1.25rem', height: '1.25rem', borderWidth: '2px' }}></span>
                                Resolving guard-checked track for <strong>{currentMoodObj?.label}</strong>...
                            </p>
                        ) : activeTrack ? (
                            <Player initialTrack={activeTrack} token={token} />
                        ) : (
                            <div style={{ marginTop: '2rem' }}>
                                <button
                                    className="btn-primary"
                                    onClick={() => handleMoodSelect(selectedMood)}
                                    style={{ padding: '0.8rem 2rem', fontSize: '1rem' }}
                                >
                                    Start Session in {currentMoodObj?.emoji} {currentMoodObj?.label} Mode
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
            </main>
        </div>
    );
}

export default Dashboard;
