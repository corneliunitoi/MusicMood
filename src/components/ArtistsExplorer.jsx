import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseService';
import { GENRE_NODES } from '../services/tasteGraph';

// High-Level Parent Genre Families (Zero subgenre clutter)
const PARENT_GENRES = [
    { id: 'all', label: 'All Artists', emoji: '👥', color: '#6366f1' },
    { id: 'rock', label: 'Rock', emoji: '🎸', color: '#ef4444' },
    { id: 'metal', label: 'Metal', emoji: '🤘', color: '#8b5cf6' },
    { id: 'classical', label: 'Classical', emoji: '🎻', color: '#f59e0b' },
    { id: 'jazz', label: 'Jazz', emoji: '🎺', color: '#eab308' },
    { id: 'electronic', label: 'Electronic', emoji: '🎛️', color: '#06b6d4' },
    { id: 'hip_hop', label: 'Hip-Hop', emoji: '🎤', color: '#10b981' },
    { id: 'pop', label: 'Pop', emoji: '✨', color: '#ec4899' },
    { id: 'blues', label: 'Blues', emoji: '🪕', color: '#3b82f6' },
    { id: 'folk_acoustic', label: 'Folk', emoji: '🌾', color: '#84cc16' },
    { id: 'country', label: 'Country', emoji: '🤠', color: '#d97706' },
    { id: 'world_reggae', label: 'World', emoji: '🌴', color: '#14b8a6' },
    { id: 'ambient_chill', label: 'Ambient', emoji: '🌌', color: '#64748b' },
    { id: 'avant_garde', label: 'Avant-Garde', emoji: '🧪', color: '#a855f7' }
];

/**
 * Maps any detailed subgenre to its high-level parent genre family
 */
function getParentGenre(genreId) {
    if (!genreId) return 'rock';
    const clean = genreId.toLowerCase().trim();

    // Check directly
    const direct = PARENT_GENRES.find(p => p.id === clean);
    if (direct) return direct.id;

    // Check tasteGraph node group
    const node = GENRE_NODES[clean];
    if (node?.group) {
        const g = node.group.toLowerCase();
        if (g.includes('rock')) return 'rock';
        if (g.includes('metal')) return 'metal';
        if (g.includes('jazz')) return 'jazz';
        if (g.includes('blues')) return 'blues';
        if (g.includes('classical') || g.includes('orchestr')) return 'classical';
        if (g.includes('electronic') || g.includes('dance')) return 'electronic';
        if (g.includes('hip-hop') || g.includes('rap')) return 'hip_hop';
        if (g.includes('pop')) return 'pop';
        if (g.includes('folk')) return 'folk_acoustic';
        if (g.includes('country')) return 'country';
        if (g.includes('reggae') || g.includes('world') || g.includes('latin')) return 'world_reggae';
        if (g.includes('ambient') || g.includes('chill')) return 'ambient_chill';
        if (g.includes('avant') || g.includes('experimental')) return 'avant_garde';
    }

    // Heuristics
    if (clean.includes('rock') || clean.includes('grunge') || clean.includes('punk') || clean.includes('shoegaze')) return 'rock';
    if (clean.includes('metal')) return 'metal';
    if (clean.includes('jazz')) return 'jazz';
    if (clean.includes('blues')) return 'blues';
    if (clean.includes('classic') || clean.includes('opera') || clean.includes('baroque') || clean.includes('romantic') || clean.includes('chamber')) return 'classical';
    if (clean.includes('techno') || clean.includes('house') || clean.includes('trance') || clean.includes('synth') || clean.includes('idm') || clean.includes('electro')) return 'electronic';
    if (clean.includes('hip_hop') || clean.includes('rap') || clean.includes('drill') || clean.includes('boom_bap')) return 'hip_hop';
    if (clean.includes('pop')) return 'pop';
    if (clean.includes('folk') || clean.includes('acoustic') || clean.includes('americana') || clean.includes('bluegrass')) return 'folk_acoustic';
    if (clean.includes('country')) return 'country';
    if (clean.includes('reggae') || clean.includes('dub') || clean.includes('ska') || clean.includes('flamenco') || clean.includes('salsa')) return 'world_reggae';
    if (clean.includes('ambient') || clean.includes('chill')) return 'ambient_chill';
    return 'rock';
}

function getInitials(name = '') {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '🎵';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ArtistsExplorer({ onPlayTrack, onClose }) {
    const [artists, setArtists] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedGenre, setSelectedGenre] = useState('all');
    const [selectedArtist, setSelectedArtist] = useState(null);
    const [artistTracks, setArtistTracks] = useState([]);
    const [isLoadingTracks, setIsLoadingTracks] = useState(false);
    const [avatarOverrides, setAvatarOverrides] = useState({});

    // 1. Fetch catalog artists
    useEffect(() => {
        let isMounted = true;
        async function fetchArtists() {
            setIsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('artists')
                    .select('id, name, primary_genre_id, track_count, avatar_url')
                    .gt('track_count', 0)
                    .order('track_count', { ascending: false })
                    .limit(500);

                if (!error && data && isMounted) {
                    setArtists(data);
                }
            } catch (e) {
                console.error('[ArtistsExplorer] Failed to fetch artists:', e);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        }
        fetchArtists();
        return () => { isMounted = false; };
    }, []);

    // 2. Fetch tracks for selected artist
    const handleSelectArtist = async (artist) => {
        setSelectedArtist(artist);
        setIsLoadingTracks(true);
        setArtistTracks([]);
        try {
            const { data, error } = await supabase
                .from('tracks')
                .select('*')
                .ilike('artist', artist.name)
                .not('youtube_video_id', 'is', null)
                .neq('youtube_video_id', 'CORRUPT_TAGS')
                .limit(50);

            if (!error && data) {
                setArtistTracks(data);
            }
        } catch (e) {
            console.error('[ArtistsExplorer] Failed to fetch artist tracks:', e);
        } finally {
            setIsLoadingTracks(false);
        }
    };

    // Filtered Artists
    const filteredArtists = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return artists.filter(artist => {
            const parent = getParentGenre(artist.primary_genre_id);
            if (selectedGenre !== 'all' && parent !== selectedGenre) {
                return false;
            }
            if (query && !artist.name.toLowerCase().includes(query)) {
                return false;
            }
            return true;
        });
    }, [artists, selectedGenre, searchQuery]);

    // Dynamic on-demand avatar resolution for artists missing images
    const handleAvatarError = (artistName) => {
        if (avatarOverrides[artistName]) return;
        // Mark as fallback so it renders the initials avatar
        setAvatarOverrides(prev => ({ ...prev, [artistName]: 'FALLBACK' }));
    };

    return (
        <section className="artists-explorer fade-in" style={{
            background: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '1.5rem',
            margin: '1.5rem auto',
            maxWidth: '1100px',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.5)'
        }}>
            {/* Header with Search and Close */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.45rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f8fafc' }}>
                        <span>👤</span> Catalog Artists
                    </h2>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                        Browse {artists.length.toLocaleString()} verified artists across your library split by parent genre.
                    </p>
                </div>

                {onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '8px',
                            color: '#cbd5e1',
                            padding: '0.4rem 0.8rem',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        ✕ Close
                    </button>
                )}
            </div>

            {/* Instant Search Bar */}
            <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.6, fontSize: '1.05rem' }}>🔍</span>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search artist name (e.g., Pink Floyd, Miles Davis, Chopin, Tipper)..."
                    style={{
                        width: '100%',
                        padding: '0.75rem 1rem 0.75rem 2.8rem',
                        background: 'rgba(30, 41, 59, 0.7)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '12px',
                        color: '#f8fafc',
                        fontSize: '0.95rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                    }}
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery('')}
                        style={{
                            position: 'absolute',
                            right: '0.75rem',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            color: '#94a3b8',
                            fontSize: '1rem',
                            cursor: 'pointer'
                        }}
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Parent Genre Filter Pills (Zero Subgenre Clutter) */}
            <div style={{
                display: 'flex',
                gap: '0.5rem',
                overflowX: 'auto',
                paddingBottom: '0.5rem',
                marginBottom: '1.5rem',
                scrollbarWidth: 'thin'
            }}>
                {PARENT_GENRES.map(genre => {
                    const isActive = selectedGenre === genre.id;
                    return (
                        <button
                            key={genre.id}
                            onClick={() => setSelectedGenre(genre.id)}
                            style={{
                                background: isActive ? genre.color : 'rgba(30, 41, 59, 0.6)',
                                color: isActive ? '#ffffff' : '#cbd5e1',
                                border: isActive ? `1px solid ${genre.color}` : '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '9999px',
                                padding: '0.35rem 0.85rem',
                                fontSize: '0.82rem',
                                fontWeight: isActive ? '700' : '500',
                                whiteSpace: 'nowrap',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                transition: 'all 0.15s'
                            }}
                        >
                            <span>{genre.emoji}</span>
                            <span>{genre.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Results Count */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', fontSize: '0.82rem', color: '#94a3b8' }}>
                <span>Showing <strong>{filteredArtists.length}</strong> artist(s)</span>
                {searchQuery && (
                    <span>Filtered by: &ldquo;{searchQuery}&rdquo;</span>
                )}
            </div>

            {/* Artists Cards Grid */}
            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                    <span className="spinner" style={{ display: 'inline-block', width: '2rem', height: '2rem', marginBottom: '0.75rem' }}></span>
                    <div>Loading catalog artists...</div>
                </div>
            ) : filteredArtists.length === 0 ? (
                <div style={{
                    textAlign: 'center',
                    padding: '3rem 1.5rem',
                    background: 'rgba(30, 41, 59, 0.35)',
                    borderRadius: '12px',
                    border: '1px dashed rgba(255, 255, 255, 0.15)'
                }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
                    <h3 style={{ margin: '0 0 0.5rem 0', color: '#f8fafc' }}>No matching artists found</h3>
                    <p style={{ margin: '0 auto 1.25rem auto', maxWidth: '420px', color: '#94a3b8', fontSize: '0.85rem' }}>
                        We couldn&apos;t find &ldquo;{searchQuery}&rdquo; in your currently indexed local/cloud library.
                    </p>
                    <div style={{
                        display: 'inline-block',
                        background: 'rgba(99, 102, 241, 0.15)',
                        border: '1px solid rgba(99, 102, 241, 0.35)',
                        borderRadius: '8px',
                        padding: '0.5rem 1rem',
                        fontSize: '0.8rem',
                        color: '#c7d2fe'
                    }}>
                        💡 Requesting new artists & auto-fetching missing songs is coming in a future update!
                    </div>
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                    gap: '1rem',
                    maxHeight: '620px',
                    overflowY: 'auto',
                    paddingRight: '0.25rem'
                }}>
                    {filteredArtists.map(artist => {
                        const parent = getParentGenre(artist.primary_genre_id);
                        const genreObj = PARENT_GENRES.find(p => p.id === parent) || PARENT_GENRES[1];
                        const hasAvatar = artist.avatar_url && avatarOverrides[artist.name] !== 'FALLBACK';

                        return (
                            <div
                                key={artist.id || artist.name}
                                onClick={() => handleSelectArtist(artist)}
                                style={{
                                    background: 'rgba(30, 41, 59, 0.6)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: '12px',
                                    padding: '1rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    transition: 'transform 0.15s, background 0.15s, border-color 0.15s',
                                    position: 'relative'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.background = 'rgba(51, 65, 85, 0.7)';
                                    e.currentTarget.style.borderColor = genreObj.color;
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'none';
                                    e.currentTarget.style.background = 'rgba(30, 41, 59, 0.6)';
                                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                                }}
                            >
                                {/* Profile Picture / Avatar */}
                                <div style={{
                                    width: '74px',
                                    height: '74px',
                                    borderRadius: '50%',
                                    overflow: 'hidden',
                                    marginBottom: '0.75rem',
                                    border: `2px solid ${genreObj.color}`,
                                    boxShadow: `0 0 12px ${genreObj.color}33`,
                                    background: `linear-gradient(135deg, ${genreObj.color}44, #0f172a)`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    {hasAvatar ? (
                                        <img
                                            src={artist.avatar_url}
                                            alt={artist.name}
                                            onError={() => handleAvatarError(artist.name)}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                    ) : (
                                        <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f8fafc', letterSpacing: '0.5px' }}>
                                            {getInitials(artist.name)}
                                        </span>
                                    )}
                                </div>

                                {/* Artist Name */}
                                <h4 style={{
                                    margin: '0 0 0.35rem 0',
                                    fontSize: '0.92rem',
                                    color: '#f8fafc',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    width: '100%'
                                }} title={artist.name}>
                                    {artist.name}
                                </h4>

                                {/* Parent Genre Badge */}
                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    background: `${genreObj.color}22`,
                                    color: genreObj.color,
                                    border: `1px solid ${genreObj.color}44`,
                                    borderRadius: '9999px',
                                    padding: '0.15rem 0.55rem',
                                    fontSize: '0.72rem',
                                    fontWeight: '600',
                                    marginBottom: '0.5rem'
                                }}>
                                    <span>{genreObj.emoji}</span>
                                    <span>{genreObj.label}</span>
                                </div>

                                {/* Track Count */}
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                    {artist.track_count} tracks in catalog
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ARTIST TRACK DETAILS MODAL */}
            {selectedArtist && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem'
                }} onClick={() => setSelectedArtist(null)}>
                    <div style={{
                        background: '#0f172a',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '650px',
                        maxHeight: '85vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
                    }} onClick={(e) => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'rgba(30, 41, 59, 0.5)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                                <div style={{
                                    width: '46px',
                                    height: '46px',
                                    borderRadius: '50%',
                                    overflow: 'hidden',
                                    background: '#1e293b',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    {selectedArtist.avatar_url && avatarOverrides[selectedArtist.name] !== 'FALLBACK' ? (
                                        <img src={selectedArtist.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <span style={{ fontWeight: 'bold', color: '#cbd5e1' }}>{getInitials(selectedArtist.name)}</span>
                                    )}
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc' }}>{selectedArtist.name}</h3>
                                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                                        {artistTracks.length} catalog track(s) available
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={() => setSelectedArtist(null)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#94a3b8',
                                    fontSize: '1.25rem',
                                    cursor: 'pointer'
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Tracks List */}
                        <div style={{ padding: '1rem 1.5rem', overflowY: 'auto', flex: 1 }}>
                            {isLoadingTracks ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                                    <span className="spinner" style={{ display: 'inline-block', width: '1.5rem', height: '1.5rem', marginBottom: '0.5rem' }}></span>
                                    <div>Loading tracks...</div>
                                </div>
                            ) : artistTracks.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                                    No playable YouTube tracks mapped for this artist yet.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {artistTracks.map((t, idx) => (
                                        <div
                                            key={t.id || idx}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '0.65rem 0.85rem',
                                                background: 'rgba(30, 41, 59, 0.45)',
                                                borderRadius: '8px',
                                                border: '1px solid rgba(255, 255, 255, 0.05)',
                                                transition: 'background 0.15s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(51, 65, 85, 0.6)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(30, 41, 59, 0.45)'}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                                                <span style={{ fontSize: '0.75rem', color: '#64748b', width: '18px' }}>{idx + 1}</span>
                                                <div style={{ overflow: 'hidden' }}>
                                                    <div style={{ fontSize: '0.88rem', fontWeight: '500', color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {t.title}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                                        {t.primary_genre_id}
                                                    </div>
                                                </div>
                                            </div>

                                            {onPlayTrack && (
                                                <button
                                                    onClick={() => {
                                                        onPlayTrack(t);
                                                        setSelectedArtist(null);
                                                    }}
                                                    style={{
                                                        background: 'rgba(99, 102, 241, 0.2)',
                                                        border: '1px solid #6366f1',
                                                        color: '#c7d2fe',
                                                        borderRadius: '6px',
                                                        padding: '0.3rem 0.65rem',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '600',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.3rem',
                                                        flexShrink: 0
                                                    }}
                                                >
                                                    ▶ Play
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer with Play All */}
                        {artistTracks.length > 0 && onPlayTrack && (
                            <div style={{
                                padding: '1rem 1.5rem',
                                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                                display: 'flex',
                                justifyContent: 'flex-end',
                                background: 'rgba(30, 41, 59, 0.3)'
                            }}>
                                <button
                                    onClick={() => {
                                        onPlayTrack(artistTracks[0]);
                                        setSelectedArtist(null);
                                    }}
                                    style={{
                                        background: '#6366f1',
                                        color: '#ffffff',
                                        border: 'none',
                                        borderRadius: '8px',
                                        padding: '0.55rem 1.25rem',
                                        fontSize: '0.85rem',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)'
                                    }}
                                >
                                    ▶ Play Artist Radio
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
