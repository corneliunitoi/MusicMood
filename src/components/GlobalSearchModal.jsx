import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseService';
import { sessionEngine } from '../services/sessionStateMachine';

const GENRE_LABELS = {
    rock: '🎸 Rock',
    hard_rock: '⚡ Hard Rock',
    prog_rock: '🌌 Prog Rock',
    prog_metal: '🪐 Prog Metal',
    heavy_metal: '🤘 Heavy Metal',
    thrash_metal: '⚡ Thrash',
    death_metal: '💀 Death Metal',
    black_metal: '🔥 Black Metal',
    doom_metal: '⏳ Doom',
    power_metal: '⚔️ Power Metal',
    symphonic_metal: '🎻 Symphonic',
    gothic_metal: '🥀 Gothic',
    alternative: '🌀 Alternative',
    grunge: '🌧️ Grunge',
    indie_rock: '🌿 Indie Rock',
    post_rock: '🌄 Post-Rock',
    punk_rock: '💥 Punk',
    post_punk: '🖤 Post-Punk',
    shoegaze: '🌫️ Shoegaze',
    jazz: '🎷 Jazz',
    blues: '🎺 Blues',
    classical: '🎼 Classical',
    electronic: '🎛️ Electronic',
    synthwave: '🌆 Synthwave',
    ambient: '🌌 Ambient',
    chillout: '☕ Chillout',
    folk: '🪕 Folk',
    hip_hop: '🎤 Hip-Hop',
    rnb: '✨ R&B',
    pop: '🎈 Pop'
};

function formatGenre(genreId) {
    if (!genreId) return 'General';
    return GENRE_LABELS[genreId] || genreId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export default function GlobalSearchModal({ isOpen, onClose, onPlayTrack, onOpenArtist }) {
    const [query, setQuery] = useState('');
    const [filterScope, setFilterScope] = useState('all'); // 'all' | 'songs' | 'artists' | 'staged'
    const [isLoading, setIsLoading] = useState(false);
    const [tracks, setTracks] = useState([]);
    const [artists, setArtists] = useState([]);
    const [stagedArtists, setStagedArtists] = useState([]);
    const [playingDemoId, setPlayingDemoId] = useState(null);
    const inputRef = useRef(null);

    // Focus input on open & clear state
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setTracks([]);
            setArtists([]);
            setStagedArtists([]);
            setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
        }
    }, [isOpen]);

    // Handle Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Debounced search across Tracks, Catalog Artists, and Staged Candidates
    useEffect(() => {
        const trimmed = query.trim();
        if (trimmed.length < 2) {
            setTracks([]);
            setArtists([]);
            setStagedArtists([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const timer = setTimeout(async () => {
            try {
                const searchPattern = `%${trimmed}%`;

                // 1. Search playable tracks
                const tracksPromise = supabase
                    .from('tracks')
                    .select('id, title, artist, youtube_video_id, primary_genre_id, album')
                    .or(`title.ilike.${searchPattern},artist.ilike.${searchPattern}`)
                    .limit(12);

                // 2. Search catalog artists
                const artistsPromise = supabase
                    .from('artists')
                    .select('id, name, primary_genre_id, track_count, avatar_url')
                    .ilike('name', searchPattern)
                    .order('track_count', { ascending: false })
                    .limit(8);

                // 3. Search staged candidates (uncataloged)
                const stagedPromise = supabase
                    .from('artist_suggestions')
                    .select('id, name, primary_genre_id, demo_youtube_id, demo_track_title, request_count')
                    .ilike('name', searchPattern)
                    .order('request_count', { ascending: false })
                    .limit(8);

                const [tracksRes, artistsRes, stagedRes] = await Promise.all([
                    tracksPromise,
                    artistsPromise,
                    stagedPromise
                ]);

                if (!tracksRes.error) setTracks(tracksRes.data || []);
                if (!artistsRes.error) setArtists(artistsRes.data || []);
                if (!stagedRes.error) setStagedArtists(stagedRes.data || []);
            } catch (err) {
                console.warn('[GlobalSearch] Search error:', err);
            } finally {
                setIsLoading(false);
            }
        }, 220);

        return () => clearTimeout(timer);
    }, [query]);

    if (!isOpen) return null;

    const handleSelectTrack = (track) => {
        if (!onPlayTrack) return;
        const playable = {
            id: track.youtube_video_id || track.id,
            youtube_video_id: track.youtube_video_id,
            title: track.title,
            artist: track.artist,
            genre: track.primary_genre_id,
            thumbnail: `https://i.ytimg.com/vi/${track.youtube_video_id}/hqdefault.jpg`,
            source: 'search_direct'
        };
        if (sessionEngine.playOnDemand) {
            sessionEngine.playOnDemand(playable, false);
        }
        onPlayTrack(playable);
        onClose();
    };

    const handleSelectArtist = (artistName) => {
        if (onOpenArtist) {
            onOpenArtist(artistName);
        }
        onClose();
    };

    const handlePlayStagedDemo = (candidate, e) => {
        if (e) e.stopPropagation();
        if (!candidate.demo_youtube_id || !onPlayTrack) return;

        setPlayingDemoId(candidate.id);
        const playable = {
            id: candidate.demo_youtube_id,
            youtube_video_id: candidate.demo_youtube_id,
            title: candidate.demo_track_title || `${candidate.name} (Demo)`,
            artist: candidate.name,
            genre: candidate.primary_genre_id || 'rock',
            thumbnail: `https://i.ytimg.com/vi/${candidate.demo_youtube_id}/hqdefault.jpg`,
            source: 'artist_demo',
            isDemo: true
        };
        if (sessionEngine.playOnDemand) {
            sessionEngine.playOnDemand(playable, false);
        }
        onPlayTrack(playable);
    };

    const totalResults = tracks.length + artists.length + stagedArtists.length;
    const hasQuery = query.trim().length >= 2;

    return (
        <div
            className="modal-backdrop fade-in"
            onClick={onClose}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(5, 8, 22, 0.82)',
                backdropFilter: 'blur(10px)',
                zIndex: 1200,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: '3.5rem 1rem 1rem 1rem'
            }}
        >
            <div
                className="modal-card global-search-container"
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: '#0b1120',
                    border: '1px solid rgba(168, 85, 247, 0.35)',
                    borderRadius: '16px',
                    width: '100%',
                    maxWidth: '680px',
                    maxHeight: '85vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.85), 0 0 35px rgba(168, 85, 247, 0.15)',
                    overflow: 'hidden',
                    position: 'relative'
                }}
            >
                {/* Search Input Header */}
                <div style={{
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    background: 'rgba(15, 23, 42, 0.65)'
                }}>
                    <span style={{ fontSize: '1.2rem', color: '#c084fc', flexShrink: 0 }}>🔍</span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search songs, catalog artists, or staged candidates..."
                        style={{
                            width: '100%',
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: '#f8fafc',
                            fontSize: '1.05rem',
                            fontWeight: '500'
                        }}
                    />
                    {isLoading && (
                        <span style={{ fontSize: '0.85rem', color: '#a855f7', animation: 'pulse 1s infinite' }}>
                            ⏳
                        </span>
                    )}
                    {query && (
                        <button
                            type="button"
                            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                fontSize: '1.1rem',
                                padding: '0.2rem'
                            }}
                            title="Clear search"
                        >
                            ✕
                        </button>
                    )}
                    <span style={{
                        fontSize: '0.65rem',
                        padding: '0.15rem 0.45rem',
                        background: 'rgba(255, 255, 255, 0.08)',
                        borderRadius: '4px',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#94a3b8',
                        flexShrink: 0
                    }}>
                        ESC
                    </span>
                </div>

                {/* Filter Tabs */}
                {hasQuery && (
                    <div style={{
                        display: 'flex',
                        gap: '0.5rem',
                        padding: '0.5rem 1.25rem',
                        background: 'rgba(15, 23, 42, 0.4)',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        fontSize: '0.78rem'
                    }}>
                        <button
                            type="button"
                            onClick={() => setFilterScope('all')}
                            style={{
                                background: filterScope === 'all' ? 'rgba(168, 85, 247, 0.25)' : 'transparent',
                                border: filterScope === 'all' ? '1px solid #c084fc' : '1px solid transparent',
                                color: filterScope === 'all' ? '#e9d5ff' : '#94a3b8',
                                padding: '0.2rem 0.6rem',
                                borderRadius: '9999px',
                                cursor: 'pointer',
                                fontWeight: '600'
                            }}
                        >
                            All ({totalResults})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterScope('songs')}
                            style={{
                                background: filterScope === 'songs' ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                                border: filterScope === 'songs' ? '1px solid #38bdf8' : '1px solid transparent',
                                color: filterScope === 'songs' ? '#bae6fd' : '#94a3b8',
                                padding: '0.2rem 0.6rem',
                                borderRadius: '9999px',
                                cursor: 'pointer',
                                fontWeight: '600'
                            }}
                        >
                            🎵 Songs ({tracks.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterScope('artists')}
                            style={{
                                background: filterScope === 'artists' ? 'rgba(168, 85, 247, 0.25)' : 'transparent',
                                border: filterScope === 'artists' ? '1px solid #c084fc' : '1px solid transparent',
                                color: filterScope === 'artists' ? '#e9d5ff' : '#94a3b8',
                                padding: '0.2rem 0.6rem',
                                borderRadius: '9999px',
                                cursor: 'pointer',
                                fontWeight: '600'
                            }}
                        >
                            👤 Catalog Artists ({artists.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterScope('staged')}
                            style={{
                                background: filterScope === 'staged' ? 'rgba(234, 179, 8, 0.25)' : 'transparent',
                                border: filterScope === 'staged' ? '1px solid #eab308' : '1px solid transparent',
                                color: filterScope === 'staged' ? '#fef08a' : '#94a3b8',
                                padding: '0.2rem 0.6rem',
                                borderRadius: '9999px',
                                cursor: 'pointer',
                                fontWeight: '600'
                            }}
                        >
                            ⏳ Staged ({stagedArtists.length})
                        </button>
                    </div>
                )}

                {/* Results Scroll Area */}
                <div style={{
                    padding: '0.75rem 1.25rem',
                    overflowY: 'auto',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                }}>
                    {!hasQuery && (
                        <div style={{
                            padding: '2.5rem 1rem',
                            textAlign: 'center',
                            color: '#64748b'
                        }}>
                            <div style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>🎧</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#94a3b8', marginBottom: '0.25rem' }}>
                                Universal Catalog & Staging Search
                            </div>
                            <div style={{ fontSize: '0.8rem', maxWidth: '400px', margin: '0 auto', lineHeight: '1.4' }}>
                                Search across all verified songs in the library, curated catalog artists, and 17,500+ uncataloged staged candidates.
                            </div>
                        </div>
                    )}

                    {hasQuery && !isLoading && totalResults === 0 && (
                        <div style={{
                            padding: '2rem 1rem',
                            textAlign: 'center',
                            color: '#94a3b8'
                        }}>
                            <div style={{ fontSize: '1.8rem', marginBottom: '0.35rem' }}>🔍</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>No matches found for "{query}"</div>
                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.25rem' }}>
                                Try searching for an artist name, song title, or exploring via the Artists tab.
                            </div>
                        </div>
                    )}

                    {/* 🎵 SECTION: PLAYABLE SONGS */}
                    {(filterScope === 'all' || filterScope === 'songs') && tracks.length > 0 && (
                        <div>
                            <div style={{
                                fontSize: '0.72rem',
                                fontWeight: '700',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                color: '#38bdf8',
                                marginBottom: '0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem'
                            }}>
                                <span>🎵</span>
                                <span>Playable Tracks ({tracks.length})</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                {tracks.map((track) => (
                                    <div
                                        key={track.id}
                                        onClick={() => handleSelectTrack(track)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0.5rem 0.75rem',
                                            background: 'rgba(255, 255, 255, 0.03)',
                                            border: '1px solid rgba(255, 255, 255, 0.06)',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(56, 189, 248, 0.12)';
                                            e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.35)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                                            <div style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '6px',
                                                background: '#1e293b',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                                fontSize: '0.9rem',
                                                color: '#38bdf8'
                                            }}>
                                                ▶
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: '0.88rem',
                                                    fontWeight: '600',
                                                    color: '#f1f5f9',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {track.title}
                                                </div>
                                                <div style={{
                                                    fontSize: '0.76rem',
                                                    color: '#94a3b8',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {track.artist}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                            <span style={{
                                                fontSize: '0.68rem',
                                                padding: '0.15rem 0.45rem',
                                                background: 'rgba(56, 189, 248, 0.15)',
                                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                                borderRadius: '9999px',
                                                color: '#7dd3fc'
                                            }}>
                                                {formatGenre(track.primary_genre_id)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 👤 SECTION: CATALOG ARTISTS */}
                    {(filterScope === 'all' || filterScope === 'artists') && artists.length > 0 && (
                        <div>
                            <div style={{
                                fontSize: '0.72rem',
                                fontWeight: '700',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                color: '#c084fc',
                                marginBottom: '0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem'
                            }}>
                                <span>👤</span>
                                <span>Catalog Artists ({artists.length})</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.4rem' }}>
                                {artists.map((artist) => (
                                    <div
                                        key={artist.id}
                                        onClick={() => handleSelectArtist(artist.name)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0.5rem 0.75rem',
                                            background: 'rgba(255, 255, 255, 0.03)',
                                            border: '1px solid rgba(255, 255, 255, 0.06)',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(168, 85, 247, 0.12)';
                                            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.35)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                                            <div style={{
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: '50%',
                                                background: '#334155',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                                fontSize: '0.8rem',
                                                color: '#c084fc',
                                                fontWeight: '700'
                                            }}>
                                                {artist.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: '0.86rem',
                                                    fontWeight: '600',
                                                    color: '#f1f5f9',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {artist.name}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                                    {artist.track_count || 1} tracks cataloged
                                                </div>
                                            </div>
                                        </div>
                                        <span style={{
                                            fontSize: '0.66rem',
                                            padding: '0.12rem 0.45rem',
                                            background: 'rgba(168, 85, 247, 0.15)',
                                            border: '1px solid rgba(168, 85, 247, 0.3)',
                                            borderRadius: '9999px',
                                            color: '#d8b4fe',
                                            flexShrink: 0
                                        }}>
                                            {formatGenre(artist.primary_genre_id)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ⏳ SECTION: STAGED UNCATALOGED CANDIDATES */}
                    {(filterScope === 'all' || filterScope === 'staged') && stagedArtists.length > 0 && (
                        <div>
                            <div style={{
                                fontSize: '0.72rem',
                                fontWeight: '700',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                color: '#eab308',
                                marginBottom: '0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem'
                            }}>
                                <span>⏳</span>
                                <span>Staged Artists ({stagedArtists.length})</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                {stagedArtists.map((c) => (
                                    <div
                                        key={c.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0.5rem 0.75rem',
                                            background: 'rgba(234, 179, 8, 0.04)',
                                            border: '1px solid rgba(234, 179, 8, 0.18)',
                                            borderRadius: '8px',
                                            gap: '0.5rem'
                                        }}
                                    >
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                                <span style={{
                                                    fontSize: '0.86rem',
                                                    fontWeight: '600',
                                                    color: '#fef08a'
                                                }}>
                                                    {c.name}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.62rem',
                                                    padding: '0.1rem 0.4rem',
                                                    background: 'rgba(234, 179, 8, 0.15)',
                                                    border: '1px solid rgba(234, 179, 8, 0.3)',
                                                    borderRadius: '4px',
                                                    color: '#fef08a'
                                                }}>
                                                    Staged
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                                                Genre: {formatGenre(c.primary_genre_id)}
                                                {c.demo_track_title && c.demo_track_title !== 'UNRESOLVED' && (
                                                    <span style={{ color: '#d8b4fe', marginLeft: '0.5rem' }}>
                                                        • Demo: {c.demo_track_title}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                                            {c.demo_youtube_id ? (
                                                <button
                                                    type="button"
                                                    onClick={(e) => handlePlayStagedDemo(c, e)}
                                                    style={{
                                                        background: playingDemoId === c.id ? '#a855f7' : 'rgba(168, 85, 247, 0.2)',
                                                        border: '1px solid rgba(168, 85, 247, 0.4)',
                                                        color: '#f3e8ff',
                                                        padding: '0.22rem 0.55rem',
                                                        borderRadius: '6px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: '600',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem'
                                                    }}
                                                    title={`Audition demo track: ${c.demo_track_title || c.name}`}
                                                >
                                                    <span>{playingDemoId === c.id ? '🔊 Playing' : '▶ Demo'}</span>
                                                </button>
                                            ) : null}

                                            <button
                                                type="button"
                                                onClick={() => handleSelectArtist(c.name)}
                                                style={{
                                                    background: 'rgba(255, 255, 255, 0.08)',
                                                    border: '1px solid rgba(255, 255, 255, 0.15)',
                                                    color: '#e2e8f0',
                                                    padding: '0.22rem 0.55rem',
                                                    borderRadius: '6px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: '600',
                                                    cursor: 'pointer'
                                                }}
                                                title="View or request in Artists Explorer"
                                            >
                                                Inspect
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer with helper tips */}
                <div style={{
                    padding: '0.65rem 1.25rem',
                    background: 'rgba(15, 23, 42, 0.65)',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.72rem',
                    color: '#64748b'
                }}>
                    <span>Tip: Click any track to play instantly, or any artist to view their full catalog.</span>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            fontSize: '0.72rem'
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
