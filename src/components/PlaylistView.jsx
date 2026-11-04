import { useState } from 'react';
import { GENRE_FAMILIES, GENRE_NODES } from '../services/tasteGraph';
import { fetchPlaylistTracks, ingestPlaylistTracks, inferGenreFromTitle } from '../services/youtubePlaylistIngester';
import { sessionEngine } from '../services/sessionStateMachine';

const CURATED_PRESETS = [
    {
        id: 'PL6bPxvf5nM4uxkE8l0u_c0b_Z_u663k3t',
        title: 'Classic Rock Anthems & Epics',
        genre: 'classic_rock',
        description: 'Legendary riffs, soaring solos, and stadium energy',
        thumbnail: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=400&q=80',
        count: 65
    },
    {
        id: 'PLx0sYbCqOb8TBPRdmBHs5IftVV9TPbo3C',
        title: 'Progressive Rock & Metal Odyssey',
        genre: 'prog_metal',
        description: 'Complex time signatures, heavy dynamics, and epic songwriting',
        thumbnail: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80',
        count: 55
    },
    {
        id: 'PL4QNnZJr8sRNKzL_eIq1iB2Z2W8xT49n6',
        title: 'Atmospheric Post-Rock & Soundscapes',
        genre: 'post_rock',
        description: 'Cinematic builds, ethereal reverb, and deep emotional resonance',
        thumbnail: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=400&q=80',
        count: 45
    },
    {
        id: 'PLOzDu-MXXLliO9fBNZOQTBDddoA3FzZUo',
        title: 'Deep Ambient & Modern Classical',
        genre: 'ambient',
        description: 'Minimalist piano, lush textural drones, and zero-distraction headspace',
        thumbnail: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=400&q=80',
        count: 75
    },
    {
        id: 'PLzCxunOM5WFI5rQsmB_U0v5hJ_j66hXq3',
        title: 'Synthwave & Retrowave Cyberpunk',
        genre: 'synthwave',
        description: 'Neon arpeggios, analog basslines, and retro-futuristic drive',
        thumbnail: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&q=80',
        count: 50
    }
];

function PlaylistView({ playlists = [], token, onPlayTrack, onIngestComplete }) {
    const [activeTab, setActiveTab] = useState(playlists && playlists.length > 0 ? 'my_playlists' : 'paste_url');
    const [playlistInput, setPlaylistInput] = useState('');
    const [selectedPlaylist, setSelectedPlaylist] = useState(null);
    const [tracks, setTracks] = useState([]);
    const [isLoadingTracks, setIsLoadingTracks] = useState(false);
    const [targetGenre, setTargetGenre] = useState('rock');
    const [error, setError] = useState(null);

    // Ingestion state
    const [isIngesting, setIsIngesting] = useState(false);
    const [ingestProgress, setIngestProgress] = useState(null);
    const [ingestResult, setIngestResult] = useState(null);

    // Load tracks for a playlist
    const handleSelectPlaylist = async (plIdOrUrl, titleFallback, genreHint) => {
        setIsLoadingTracks(true);
        setError(null);
        setTracks([]);
        setIngestResult(null);
        setIngestProgress(null);

        try {
            const data = await fetchPlaylistTracks(plIdOrUrl);
            const resolvedTitle = data.title || titleFallback || 'YouTube Playlist';
            setSelectedPlaylist({
                id: plIdOrUrl,
                title: resolvedTitle,
                total: data.total || data.tracks?.length || 0
            });
            setTracks(data.tracks || []);

            const detected = genreHint || inferGenreFromTitle(resolvedTitle);
            setTargetGenre(detected);
        } catch (err) {
            console.error('Failed to load playlist tracks:', err);
            setError(err.message || 'Could not load playlist. Please check the URL or ID.');
        } finally {
            setIsLoadingTracks(false);
        }
    };

    const handlePasteSubmit = (e) => {
        e.preventDefault();
        if (!playlistInput.trim()) return;
        handleSelectPlaylist(playlistInput.trim(), 'Custom YouTube Playlist');
    };

    const handleStartIngest = async () => {
        if (!tracks || tracks.length === 0) return;
        setIsIngesting(true);
        setIngestResult(null);

        try {
            const result = await ingestPlaylistTracks({
                tracks,
                primaryGenreId: targetGenre,
                sourceName: `yt_pl:${selectedPlaylist?.title || 'custom'}`,
                onProgress: (p) => setIngestProgress(p)
            });

            setIngestResult(result);
            if (onIngestComplete) {
                onIngestComplete();
            }
        } catch (err) {
            console.error('Ingestion failed:', err);
            setError('Ingestion failed: ' + err.message);
        } finally {
            setIsIngesting(false);
        }
    };

    const handlePlayAllNow = () => {
        if (!tracks || tracks.length === 0) return;
        const first = tracks[0];
        const rest = tracks.slice(1);

        const trackToPlay = {
            id: first.videoId,
            videoId: first.videoId,
            title: first.title,
            artist: first.artist,
            genre: targetGenre,
            thumbnail: first.thumbnail,
            source: 'youtube_playlist'
        };

        sessionEngine.playCustomTrack(trackToPlay);
        if (rest.length > 0) {
            sessionEngine.queuePlaylist(rest.map(t => ({
                id: t.videoId,
                videoId: t.videoId,
                title: t.title,
                artist: t.artist,
                genre: targetGenre,
                thumbnail: t.thumbnail
            })));
        }

        if (onPlayTrack) {
            onPlayTrack(trackToPlay);
        }
    };

    const handleQueueAll = () => {
        if (!tracks || tracks.length === 0) return;
        sessionEngine.queuePlaylist(tracks.map(t => ({
            id: t.videoId,
            videoId: t.videoId,
            title: t.title,
            artist: t.artist,
            genre: targetGenre,
            thumbnail: t.thumbnail
        })));
    };

    const handlePlaySingleTrack = (track) => {
        const item = {
            id: track.videoId,
            videoId: track.videoId,
            title: track.title,
            artist: track.artist,
            genre: targetGenre,
            thumbnail: track.thumbnail,
            source: 'youtube_playlist'
        };
        sessionEngine.playCustomTrack(item);
        if (onPlayTrack) {
            onPlayTrack(item);
        }
    };

    return (
        <div className="youtube-playlist-importer fade-in" style={{ maxWidth: '900px', margin: '1rem auto', textAlign: 'left' }}>
            {/* TABS & MODE SELECTOR */}
            {!selectedPlaylist && (
                <div>
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                        {playlists && playlists.length > 0 && (
                            <button
                                className="btn-text"
                                onClick={() => setActiveTab('my_playlists')}
                                style={{
                                    background: activeTab === 'my_playlists' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255,255,255,0.05)',
                                    color: activeTab === 'my_playlists' ? '#c084fc' : '#94a3b8',
                                    padding: '0.5rem 1.25rem',
                                    borderRadius: '9999px',
                                    border: activeTab === 'my_playlists' ? '1px solid #a855f7' : '1px solid rgba(255,255,255,0.1)'
                                }}
                            >
                                👤 My Playlists ({playlists.length})
                            </button>
                        )}
                        <button
                            className="btn-text"
                            onClick={() => setActiveTab('paste_url')}
                            style={{
                                background: activeTab === 'paste_url' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255,255,255,0.05)',
                                color: activeTab === 'paste_url' ? '#c084fc' : '#94a3b8',
                                padding: '0.5rem 1.25rem',
                                borderRadius: '9999px',
                                border: activeTab === 'paste_url' ? '1px solid #a855f7' : '1px solid rgba(255,255,255,0.1)'
                            }}
                        >
                            🔗 Import by Link / ID
                        </button>
                        <button
                            className="btn-text"
                            onClick={() => setActiveTab('curated_presets')}
                            style={{
                                background: activeTab === 'curated_presets' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255,255,255,0.05)',
                                color: activeTab === 'curated_presets' ? '#c084fc' : '#94a3b8',
                                padding: '0.5rem 1.25rem',
                                borderRadius: '9999px',
                                border: activeTab === 'curated_presets' ? '1px solid #a855f7' : '1px solid rgba(255,255,255,0.1)'
                            }}
                        >
                            ⚡ Curated Starters
                        </button>
                    </div>

                    {error && (
                        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '12px', padding: '0.75rem 1rem', marginBottom: '1.5rem', color: '#fca5a5' }}>
                            ⚠️ {error}
                        </div>
                    )}

                    {/* TAB 1: MY PLAYLISTS */}
                    {activeTab === 'my_playlists' && (
                        <div className="playlist-grid fade-in">
                            {playlists.map((playlist) => (
                                <div
                                    key={playlist.id}
                                    className="glass-card playlist-card"
                                    onClick={() => handleSelectPlaylist(playlist.id, playlist.title)}
                                    style={{ cursor: 'pointer', transition: 'all 0.2s', padding: '1rem', border: '1px solid rgba(255,255,255,0.08)' }}
                                >
                                    <img
                                        src={playlist.thumbnail}
                                        alt={playlist.title}
                                        className="playlist-thumb"
                                        style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: '12px', marginBottom: '0.75rem' }}
                                    />
                                    <div className="playlist-info">
                                        <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.3rem 0', color: '#f8fafc' }}>{playlist.title}</h3>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                                            {playlist.videoCount} videos • <span style={{ color: '#a855f7' }}>Click to Ingest</span>
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* TAB 2: PASTE LINK */}
                    {activeTab === 'paste_url' && (
                        <div className="glass-card fade-in" style={{ maxWidth: '650px', padding: '2rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📥</div>
                            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: '#f8fafc' }}>Ingest Any YouTube Playlist</h2>
                            <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '1.5rem' }}>
                                Paste any YouTube or YouTube Music playlist URL. Tracks will be scraped and pre-mapped for <strong>zero-quota playback</strong> directly in your library!
                            </p>

                            <form onSubmit={handlePasteSubmit} style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
                                <input
                                    type="text"
                                    placeholder="https://www.youtube.com/playlist?list=PL..."
                                    value={playlistInput}
                                    onChange={(e) => setPlaylistInput(e.target.value)}
                                    style={{
                                        background: '#0f172a',
                                        color: '#f8fafc',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        borderRadius: '12px',
                                        padding: '0.85rem 1rem',
                                        fontSize: '1rem',
                                        outline: 'none',
                                        width: '100%',
                                        boxSizing: 'border-box'
                                    }}
                                />
                                <button
                                    type="submit"
                                    className="btn-primary"
                                    disabled={isLoadingTracks || !playlistInput.trim()}
                                    style={{ padding: '0.8rem', fontSize: '1rem' }}
                                >
                                    {isLoadingTracks ? 'Inspecting Playlist...' : 'Inspect & Ingest Tracks'}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* TAB 3: CURATED PRESETS */}
                    {activeTab === 'curated_presets' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                            {CURATED_PRESETS.map((preset) => (
                                <div
                                    key={preset.id}
                                    className="glass-card"
                                    onClick={() => handleSelectPlaylist(preset.id, preset.title, preset.genre)}
                                    style={{
                                        cursor: 'pointer',
                                        padding: '1rem',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        textAlign: 'left',
                                        transition: 'transform 0.2s',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between'
                                    }}
                                >
                                    <div>
                                        <img
                                            src={preset.thumbnail}
                                            alt={preset.title}
                                            style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '12px', marginBottom: '0.75rem' }}
                                        />
                                        <div style={{ fontSize: '0.75rem', color: '#a855f7', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                                            {GENRE_NODES[preset.genre]?.label || preset.genre}
                                        </div>
                                        <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.4rem 0', color: '#f8fafc' }}>{preset.title}</h3>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4 }}>{preset.description}</p>
                                    </div>
                                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#38bdf8' }}>
                                        <span>~{preset.count} Tracks</span>
                                        <span style={{ fontWeight: 'bold' }}>Ingest ➔</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* LOADING STATE */}
            {isLoadingTracks && (
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="spinner" style={{ width: '2rem', height: '2rem', margin: '0 auto 1rem auto' }}></div>
                    <p style={{ color: '#c084fc', fontSize: '1.1rem' }}>
                        Fetching playlist metadata with Zero-Quota scraper...
                    </p>
                </div>
            )}

            {/* DETAILED PLAYLIST INSPECTOR & INGESTION VIEW */}
            {selectedPlaylist && !isLoadingTracks && (
                <div className="fade-in" style={{ background: 'rgba(15, 23, 42, 0.75)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem' }}>
                    {/* Back Button */}
                    <button
                        className="btn-text"
                        onClick={() => setSelectedPlaylist(null)}
                        style={{ color: '#94a3b8', marginBottom: '1rem', padding: '0.3rem 0', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        ← Back to Playlists
                    </button>

                    {/* Playlist Header Summary */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', paddingBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <div>
                            <div style={{ display: 'inline-block', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid #10b981', borderRadius: '6px', padding: '0.15rem 0.5rem', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.4rem' }}>
                                ⚡ ZERO-QUOTA COMPLIANT
                            </div>
                            <h2 style={{ fontSize: '1.5rem', margin: '0 0 0.3rem 0', color: '#f8fafc' }}>{selectedPlaylist.title}</h2>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                                Found <strong>{tracks.length}</strong> verified playable tracks
                            </p>
                        </div>

                        {/* Genre Classification Selector */}
                        <div style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#a855f7', fontWeight: 'bold', marginBottom: '0.3rem' }}>
                                🏷️ Assign Genre Family:
                            </label>
                            <select
                                value={targetGenre}
                                onChange={(e) => setTargetGenre(e.target.value)}
                                style={{
                                    background: '#0f172a',
                                    color: '#f8fafc',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '8px',
                                    padding: '0.4rem 0.75rem',
                                    fontSize: '0.85rem',
                                    outline: 'none'
                                }}
                            >
                                {Object.entries(GENRE_FAMILIES).map(([famKey, fam]) => (
                                    <optgroup key={famKey} label={`${fam.emoji} ${fam.label}`}>
                                        <option value={famKey}>{fam.label} (Parent Family)</option>
                                        {Object.entries(GENRE_NODES)
                                            .filter(([_, n]) => (n.group || '').toLowerCase().includes(famKey.replace(/_/g, ' ')))
                                            .map(([nodeKey, node]) => (
                                                <option key={nodeKey} value={nodeKey}>
                                                    &nbsp;&nbsp;↳ {node.label}
                                                </option>
                                            ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Action Bar */}
                    <div style={{ display: 'flex', gap: '0.75rem', margin: '1.25rem 0', flexWrap: 'wrap' }}>
                        <button
                            className="btn-primary"
                            onClick={handleStartIngest}
                            disabled={isIngesting || tracks.length === 0}
                            style={{ flex: '1', minWidth: '220px', padding: '0.75rem 1.25rem', fontSize: '0.95rem' }}
                        >
                            {isIngesting ? '📥 Ingesting into Library...' : `📥 Ingest ${tracks.length} Tracks into Library`}
                        </button>
                        <button
                            className="btn-text"
                            onClick={handlePlayAllNow}
                            style={{
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                color: 'white',
                                padding: '0.75rem 1.25rem',
                                borderRadius: '9999px',
                                fontWeight: 'bold',
                                fontSize: '0.95rem'
                            }}
                        >
                            ▶ Play All Now
                        </button>
                        <button
                            className="btn-text"
                            onClick={handleQueueAll}
                            style={{
                                background: 'rgba(56, 189, 248, 0.15)',
                                color: '#38bdf8',
                                border: '1px solid #38bdf8',
                                padding: '0.75rem 1.25rem',
                                borderRadius: '9999px',
                                fontSize: '0.95rem'
                            }}
                        >
                            ➕ Queue for Session
                        </button>
                    </div>

                    {/* Progress Indicator */}
                    {isIngesting && ingestProgress && (
                        <div style={{ background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '12px', padding: '1rem', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.4rem', color: '#e9d5ff' }}>
                                <span>Ingesting tracks into Supabase...</span>
                                <span>{ingestProgress.current} / {ingestProgress.total}</span>
                            </div>
                            <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div
                                    style={{
                                        width: `${(ingestProgress.current / ingestProgress.total) * 100}%`,
                                        height: '100%',
                                        background: 'linear-gradient(90deg, #a855f7, #38bdf8)',
                                        transition: 'width 0.3s'
                                    }}
                                />
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                                🟢 {ingestProgress.newlyAdded} newly added • ⚪ {ingestProgress.duplicates} existing
                            </div>
                        </div>
                    )}

                    {/* Ingestion Finished Success Banner */}
                    {ingestResult && (
                        <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', borderRadius: '12px', padding: '1rem', marginBottom: '1.25rem', color: '#6ee7b7' }}>
                            🎉 <strong>Ingestion Complete!</strong> Successfully mapped <strong>{ingestResult.newlyAdded}</strong> new tracks into your database with permanent zero-quota YouTube video IDs.
                            {ingestResult.duplicates > 0 && <span> ({ingestResult.duplicates} already present in catalog).</span>}
                        </div>
                    )}

                    {/* Track List Preview */}
                    <div style={{ maxHeight: '420px', overflowY: 'auto', paddingRight: '0.5rem', marginTop: '1rem' }}>
                        {tracks.map((track, idx) => (
                            <div
                                key={track.videoId + '-' + idx}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.6rem 0.8rem',
                                    background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                    borderRadius: '8px',
                                    borderBottom: '1px solid rgba(255,255,255,0.04)'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', width: '24px', textAlign: 'right' }}>{idx + 1}</span>
                                    <img
                                        src={track.thumbnail}
                                        alt=""
                                        style={{ width: '48px', height: '36px', objectFit: 'cover', borderRadius: '4px', background: '#1e293b' }}
                                    />
                                    <div style={{ overflow: 'hidden' }}>
                                        <div style={{ fontSize: '0.9rem', color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {track.title}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {track.artist}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                                    <span style={{ fontSize: '0.7rem', color: '#34d399', background: 'rgba(16, 185, 129, 0.1)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                                        ID: {track.videoId}
                                    </span>
                                    <button
                                        className="btn-text"
                                        onClick={() => handlePlaySingleTrack(track)}
                                        style={{ color: '#38bdf8', padding: '0.2rem 0.5rem', fontSize: '0.85rem' }}
                                    >
                                        ▶ Play
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default PlaylistView;
