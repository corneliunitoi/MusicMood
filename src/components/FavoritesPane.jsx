import { useState, useEffect, useMemo } from 'react';
import { getFavorites, removeFavorite, subscribeFavorites } from '../services/favoritesService';

export default function FavoritesPane({ onPlayTrack, onClose }) {
    const [favorites, setFavorites] = useState(() => getFavorites());
    const [searchTerm, setSearchTerm] = useState('');
    const [filterGenre, setFilterGenre] = useState('all');

    useEffect(() => {
        const unsubscribe = subscribeFavorites((updated) => {
            setFavorites(updated);
        });
        return unsubscribe;
    }, []);

    // Filtered list based on search and genre
    const filteredFavorites = useMemo(() => {
        let list = favorites;
        if (filterGenre !== 'all') {
            list = list.filter(t => (t.genre || '').toLowerCase() === filterGenre.toLowerCase());
        }
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            list = list.filter(t =>
                (t.title || '').toLowerCase().includes(term) ||
                (t.artist || '').toLowerCase().includes(term) ||
                (t.genre || '').toLowerCase().includes(term)
            );
        }
        return list;
    }, [favorites, searchTerm, filterGenre]);

    // Unique genres present in favorites
    const uniqueGenres = useMemo(() => {
        const set = new Set();
        favorites.forEach(t => {
            if (t.genre) set.add(t.genre);
        });
        return Array.from(set).sort();
    }, [favorites]);

    const handlePlayAll = () => {
        if (filteredFavorites.length === 0) return;
        // Play the first track and user can shuffle or continue
        onPlayTrack(filteredFavorites[0]);
    };

    const handleExport = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(favorites, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `musicmood_favorites_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    };

    return (
        <div className="favorites-pane fade-in" style={{
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(236, 72, 153, 0.25)',
            borderRadius: '16px',
            padding: '1.5rem',
            margin: '2rem auto',
            maxWidth: '900px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            color: '#f8fafc'
        }}>
            {/* HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.6rem' }}>❤️</span>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: '700' }}>
                            Your Favorites
                        </h2>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                            {favorites.length} {favorites.length === 1 ? 'track' : 'tracks'} saved to your local profile
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {favorites.length > 0 && (
                        <>
                            <button
                                className="btn-primary"
                                onClick={handlePlayAll}
                                style={{
                                    padding: '0.45rem 0.9rem',
                                    fontSize: '0.85rem',
                                    background: 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    color: 'white',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem'
                                }}
                            >
                                ▶️ Play All
                            </button>
                            <button
                                onClick={handleExport}
                                title="Backup favorites as JSON"
                                style={{
                                    padding: '0.45rem 0.8rem',
                                    fontSize: '0.85rem',
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    color: '#cbd5e1'
                                }}
                            >
                                📥 Export
                            </button>
                        </>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#94a3b8',
                                fontSize: '1.2rem',
                                cursor: 'pointer',
                                padding: '0.25rem 0.5rem'
                            }}
                            title="Close"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* SEARCH & FILTER CONTROLS */}
            {favorites.length > 0 && (
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 240px', position: 'relative' }}>
                        <input
                            type="text"
                            placeholder="Search by artist, title, or genre..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.55rem 0.85rem',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                borderRadius: '8px',
                                color: 'white',
                                fontSize: '0.85rem',
                                outline: 'none'
                            }}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                style={{
                                    position: 'absolute',
                                    right: '8px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#94a3b8',
                                    cursor: 'pointer'
                                }}
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {uniqueGenres.length > 1 && (
                        <select
                            value={filterGenre}
                            onChange={(e) => setFilterGenre(e.target.value)}
                            style={{
                                padding: '0.55rem 0.85rem',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                borderRadius: '8px',
                                color: '#cbd5e1',
                                fontSize: '0.85rem',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="all">All Genres ({favorites.length})</option>
                            {uniqueGenres.map(g => (
                                <option key={g} value={g} style={{ background: '#0f172a', color: 'white' }}>
                                    {g}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
            )}

            {/* TRACKS LIST */}
            {filteredFavorites.length === 0 ? (
                <div style={{
                    textAlign: 'center',
                    padding: '3rem 1rem',
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '12px',
                    border: '1px dashed rgba(255, 255, 255, 0.08)'
                }}>
                    <span style={{ fontSize: '2.5rem', opacity: 0.5 }}>💔</span>
                    <h3 style={{ margin: '0.75rem 0 0.25rem', fontSize: '1.1rem', color: '#e2e8f0' }}>
                        {searchTerm || filterGenre !== 'all' ? 'No matching favorites found' : 'No favorites saved yet'}
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
                        {searchTerm || filterGenre !== 'all'
                            ? 'Try clearing your filter or searching for another artist or title.'
                            : 'Click the ❤️ Heart button in the player while listening to any track to add it here.'}
                    </p>
                </div>
            ) : (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    maxHeight: '480px',
                    overflowY: 'auto',
                    paddingRight: '0.25rem'
                }}>
                    {filteredFavorites.map((track) => {
                        const trackId = track.id || track.youtube_video_id;
                        return (
                            <div
                                key={trackId}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.65rem 0.85rem',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    border: '1px solid rgba(255, 255, 255, 0.06)',
                                    borderRadius: '10px',
                                    transition: 'all 0.15s ease',
                                    gap: '0.85rem'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)';
                                    e.currentTarget.style.borderColor = 'rgba(236, 72, 153, 0.3)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                                }}
                            >
                                {/* Thumbnail + Play Action */}
                                <div
                                    onClick={() => onPlayTrack(track)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.85rem',
                                        flex: '1 1 auto',
                                        cursor: 'pointer',
                                        minWidth: 0
                                    }}
                                >
                                    <div style={{
                                        position: 'relative',
                                        width: '48px',
                                        height: '48px',
                                        borderRadius: '8px',
                                        overflow: 'hidden',
                                        flexShrink: 0,
                                        background: '#1e293b'
                                    }}>
                                        <img
                                            src={track.thumbnail || `https://i.ytimg.com/vi/${trackId}/hqdefault.jpg`}
                                            alt={track.title}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                            }}
                                        />
                                        <div style={{
                                            position: 'absolute',
                                            inset: 0,
                                            background: 'rgba(0,0,0,0.3)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '0.9rem',
                                            opacity: 0.8
                                        }}>
                                            ▶
                                        </div>
                                    </div>

                                    {/* Track Info */}
                                    <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                                        <div style={{
                                            fontWeight: '600',
                                            fontSize: '0.92rem',
                                            color: '#f8fafc',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {track.title}
                                        </div>
                                        <div style={{
                                            fontSize: '0.8rem',
                                            color: '#94a3b8',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            marginTop: '0.15rem'
                                        }}>
                                            <span>{track.artist}</span>
                                            {track.genre && (
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    padding: '0.1rem 0.4rem',
                                                    background: 'rgba(168, 85, 247, 0.15)',
                                                    border: '1px solid rgba(168, 85, 247, 0.3)',
                                                    borderRadius: '4px',
                                                    color: '#d8b4fe'
                                                }}>
                                                    {track.genre}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Actions: Play + Remove */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                                    <button
                                        onClick={() => onPlayTrack(track)}
                                        title="Play this track"
                                        style={{
                                            background: 'rgba(16, 185, 129, 0.15)',
                                            border: '1px solid rgba(16, 185, 129, 0.35)',
                                            color: '#34d399',
                                            borderRadius: '8px',
                                            padding: '0.35rem 0.65rem',
                                            fontSize: '0.8rem',
                                            cursor: 'pointer',
                                            fontWeight: '600'
                                        }}
                                    >
                                        Play
                                    </button>
                                    <button
                                        onClick={() => removeFavorite(trackId)}
                                        title="Remove from favorites"
                                        style={{
                                            background: 'rgba(239, 68, 68, 0.1)',
                                            border: '1px solid rgba(239, 68, 68, 0.25)',
                                            color: '#f87171',
                                            borderRadius: '8px',
                                            padding: '0.35rem 0.55rem',
                                            fontSize: '0.8rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
