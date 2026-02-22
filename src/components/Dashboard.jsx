import { useState, useEffect } from 'react'
import { fetchUserProfile, fetchUserPlaylists } from '../services/youtube'
import { discoverPlaylistForMood } from '../services/musicEngine'
import { syncLocalTracksToSupabase, supabase } from '../services/supabaseService'
import MoodBar, { allMoods } from './MoodBar'
import PlaylistView from './PlaylistView'
import TasteGraphSetup from './TasteGraphSetup'
import TasteAnalyzer from './TasteAnalyzer'
import Player from './Player'
import MoodHistory from './MoodHistory'

function Dashboard({ token, onLogout }) {
    const [profile, setProfile] = useState(null)
    const [playlists, setPlaylists] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const [selectedMood, setSelectedMood] = useState(null)
    const [showPlaylists, setShowPlaylists] = useState(false)
    const [tasteProfile, setTasteProfile] = useState(null)

    const [activePlaylist, setActivePlaylist] = useState(null)
    const [isDiscovering, setIsDiscovering] = useState(false)

    const [cloudCount, setCloudCount] = useState(0)
    const [lastSync, setLastSync] = useState(null)

    const [moodHistory, setMoodHistory] = useState(() => {
        const saved = localStorage.getItem('musicMood_history')
        try { return saved ? JSON.parse(saved) : [] } catch (e) { return [] }
    })

    const [historicalGenres, setHistoricalGenres] = useState(() => {
        const saved = localStorage.getItem('musicMood_genres')
        try { return saved ? JSON.parse(saved) : [] } catch (e) { return [] }
    })

    const [historicalMoods, setHistoricalMoods] = useState(() => {
        const saved = localStorage.getItem('musicMood_moods')
        try { return saved ? JSON.parse(saved) : [] } catch (e) { return [] }
    })

    useEffect(() => {
        const loadData = async () => {
            try {
                const [profileData, playlistsData] = await Promise.all([
                    fetchUserProfile(token),
                    fetchUserPlaylists(token),
                ])
                setProfile(profileData)
                setPlaylists(playlistsData)
            } catch (err) {
                console.error(err)
                if (err.message === 'Unauthorized') {
                    onLogout();
                } else {
                    setError(err.message || 'Failed to load YouTube data. Please try again.')
                }
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [token])

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const { count, error } = await supabase
                    .from('local_metadata')
                    .select('*', { count: 'exact', head: true });

                if (!error) {
                    setCloudCount(count || 0);
                }
            } catch (e) {
                console.error("Failed to fetch cloud status:", e);
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="hero">
                <h1 className="animate-pulse">Loading Vibes...</h1>
            </div>
        )
    }

    if (error) {
        return (
            <div className="hero">
                <h1>Error</h1>
                <p className="subtitle">{error}</p>
                <button className="btn-primary" onClick={onLogout}>Disconnect</button>
            </div>
        )
    }

    const currentMoodObj = allMoods.find(m => m.id === selectedMood)

    const handleMoodSelect = async (moodId) => {
        setSelectedMood(moodId);
        setIsDiscovering(true);
        setError(null);

        try {
            const moodObj = allMoods.find(m => m.id === moodId);
            const discovered = await discoverPlaylistForMood(moodObj, tasteProfile?.topGenres, token, playlists);
            setActivePlaylist(discovered);

            const newHistoryItem = {
                id: Date.now(),
                timestamp: new Date().toISOString(),
                moodName: moodObj.label,
                moodEmoji: moodObj.emoji,
                matchedGenre: discovered.matchedGenre || "Mixed Vibes"
            };

            setMoodHistory(prev => {
                if (prev.length > 0 && prev[0].moodName === moodObj.label && prev[0].matchedGenre === newHistoryItem.matchedGenre) {
                    return prev;
                }
                const newHistory = [newHistoryItem, ...prev].slice(0, 50);
                localStorage.setItem('musicMood_history', JSON.stringify(newHistory));
                return newHistory;
            });

            const genreToLog = discovered.matchedGenre || "Mixed Vibes";
            setHistoricalGenres(prev => {
                // Prevent immediate sequential duplicates
                if (prev.length > 0 && prev[prev.length - 1] === genreToLog) return prev;
                const updated = [...prev, genreToLog];
                localStorage.setItem('musicMood_genres', JSON.stringify(updated));
                return updated;
            });

            setHistoricalMoods(prev => {
                // Prevent immediate sequential duplicates
                if (prev.length > 0 && prev[prev.length - 1] === moodObj.label) return prev;
                const updated = [...prev, moodObj.label];
                localStorage.setItem('musicMood_moods', JSON.stringify(updated));
                return updated;
            });
        } catch (err) {
            console.error("Discovery failed:", err);
            setError(err.message || 'We could not uncover a mix for this mood right now. Check your YouTube API Key in .env!');
        } finally {
            setIsDiscovering(false);
        }
    };


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
                    <div className="cloud-status" style={{ display: 'inline-flex', alignItems: 'center', marginRight: '1rem' }}>
                        <span className="text-secondary" style={{ fontSize: '0.85rem' }}>
                            ☁️ Cloud Library: <strong>{cloudCount.toLocaleString()}</strong> tracks
                        </span>
                    </div>
                    <button
                        className="btn-text"
                        onClick={() => setShowPlaylists(!showPlaylists)}
                    >
                        {showPlaylists ? 'Hide Playlists' : 'My Playlists'}
                    </button>
                    <button className="btn-text" onClick={onLogout}>Sign Out</button>
                </div>
            </header>

            <main className="dashboard-main">
                {token !== 'guest' ? (
                    <TasteAnalyzer
                        playlists={playlists}
                        setPlaylists={setPlaylists}
                        tasteProfile={tasteProfile}
                        setTasteProfile={setTasteProfile}
                        token={token}
                    />
                ) : !tasteProfile ? (
                    <TasteGraphSetup onSave={setTasteProfile} />
                ) : (
                    <div className="taste-profile-container fade-in" style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', margin: '1rem auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="taste-label">Graph Linked Genres:</span>
                            <button className="btn-text" style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }} onClick={() => setTasteProfile(null)}>Edit Graph</button>
                        </div>
                        <div className="taste-tags">
                            {tasteProfile.topGenres.map((genre, index) => (
                                <span key={index} className="taste-tag fade-in-up" style={{ animationDelay: `${index * 0.1}s` }}>
                                    {genre}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <h1 className="mood-prompt fade-in-up" style={{ marginTop: '2rem' }}>How are you feeling right now?</h1>

                <MoodBar selectedMood={selectedMood} onSelectMood={handleMoodSelect} />

                {selectedMood && !showPlaylists && (
                    <div className="mood-feedback fade-in-up">
                        <h2>{currentMoodObj?.emoji} {currentMoodObj?.label} Mode</h2>
                        {isDiscovering ? (
                            <p className="subtitle" style={{ margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                <span className="spinner" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }}></span>
                                Uncovering the perfect mix from YouTube...
                            </p>
                        ) : activePlaylist ? (
                            <>
                                <p className="subtitle" style={{ margin: '0 auto 2rem auto', color: '#a855f7' }}>
                                    Found the perfect mix! Playing now.
                                </p>
                                <Player playlist={activePlaylist} />
                            </>
                        ) : (
                            <p className="subtitle" style={{ margin: '0 auto' }}>
                                Ready to discover music based on your mood.
                            </p>
                        )}
                    </div>
                )}

                {!showPlaylists && <MoodHistory history={moodHistory} />}

                {showPlaylists && (
                    <div className="playlists-section fade-in">
                        <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Your YouTube Library</h2>
                        <PlaylistView playlists={playlists} />
                    </div>
                )}
            </main>
        </div>
    )
}

export default Dashboard
