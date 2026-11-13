import { useState, useEffect, useMemo } from 'react';
import { supabase, fetchArtistSuggestions, submitArtistRequest } from '../services/supabaseService';
import { GENRE_NODES } from '../services/tasteGraph';
import { sessionEngine } from '../services/sessionStateMachine';
import { resolveArtistAvatarOnDemand } from '../services/avatarService';

// 14 High-Level Parent Genre Families (Zero subgenre clutter) + Latest Ingestion & Staging Categories
const PARENT_GENRES = [
    { id: 'all', label: 'All Artists', emoji: '👥', color: '#6366f1' },
    { id: 'latest', label: 'Latest Added', emoji: '✨', color: '#10b981' },
    { id: 'potential', label: 'Potential Matches', emoji: '⏳', color: '#8b5cf6' },
    { id: 'rock', label: 'Rock', emoji: '🎸', color: '#ef4444' },
    { id: 'metal', label: 'Metal', emoji: '🤘', color: '#8b5cf6' },
    { id: 'electronic', label: 'Electronic', emoji: '🎛️', color: '#06b6d4' },
    { id: 'pop', label: 'Pop', emoji: '✨', color: '#ec4899' },
    { id: 'hip_hop', label: 'Hip-Hop', emoji: '🎤', color: '#10b981' },
    { id: 'rnb_soul', label: 'R&B / Soul', emoji: '🎷', color: '#f43f5e' },
    { id: 'jazz', label: 'Jazz', emoji: '🎺', color: '#eab308' },
    { id: 'blues', label: 'Blues', emoji: '🪕', color: '#3b82f6' },
    { id: 'classical', label: 'Classical', emoji: '🎻', color: '#f59e0b' },
    { id: 'folk_acoustic', label: 'Folk', emoji: '🌾', color: '#84cc16' },
    { id: 'country', label: 'Country', emoji: '🤠', color: '#d97706' },
    { id: 'world_reggae', label: 'World / Reggae', emoji: '🌴', color: '#14b8a6' },
    { id: 'ambient_chill', label: 'Ambient', emoji: '🌌', color: '#64748b' },
    { id: 'avant_garde', label: 'Avant-Garde', emoji: '🧪', color: '#a855f7' }
];

const GROUP_TO_PARENT = {
    'Rock': 'rock',
    'Metal': 'metal',
    'Electronic': 'electronic',
    'Pop': 'pop',
    'Hip-Hop': 'hip_hop',
    'R&B / Soul': 'rnb_soul',
    'Jazz': 'jazz',
    'Blues': 'blues',
    'Classical': 'classical',
    'Folk': 'folk_acoustic',
    'Country': 'country',
    'World / Reggae': 'world_reggae',
    'Ambient': 'ambient_chill',
    'Avant-Garde': 'avant_garde'
};

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
    if (node?.group && GROUP_TO_PARENT[node.group]) {
        return GROUP_TO_PARENT[node.group];
    }

    // Heuristics
    if (clean.includes('rock') || clean.includes('grunge') || clean.includes('punk') || clean.includes('shoegaze')) return 'rock';
    if (clean.includes('metal')) return 'metal';
    if (clean.includes('electronic') || clean.includes('techno') || clean.includes('house') || clean.includes('trance') || clean.includes('synth') || clean.includes('idm')) return 'electronic';
    if (clean.includes('pop')) return 'pop';
    if (clean.includes('hip_hop') || clean.includes('rap') || clean.includes('drill') || clean.includes('boom_bap')) return 'hip_hop';
    if (clean.includes('soul') || clean.includes('rnb') || clean.includes('funk') || clean.includes('motown')) return 'rnb_soul';
    if (clean.includes('jazz')) return 'jazz';
    if (clean.includes('blues')) return 'blues';
    if (clean.includes('classic') || clean.includes('opera') || clean.includes('baroque') || clean.includes('romantic') || clean.includes('chamber')) return 'classical';
    if (clean.includes('folk') || clean.includes('acoustic') || clean.includes('americana') || clean.includes('bluegrass')) return 'folk_acoustic';
    if (clean.includes('country')) return 'country';
    if (clean.includes('reggae') || clean.includes('dub') || clean.includes('ska') || clean.includes('flamenco') || clean.includes('salsa') || clean.includes('latin')) return 'world_reggae';
    if (clean.includes('ambient') || clean.includes('chill') || clean.includes('drone')) return 'ambient_chill';
    if (clean.includes('avant') || clean.includes('experimental')) return 'avant_garde';
    return 'rock';
}

function getInitials(name = '') {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '🎵';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Normalizes raw database track row to canonical player model
 * Ensures id is always the 11-char YouTube video ID
 */
function formatPlayableTrack(t) {
    if (!t) return null;
    const ytId = (t.youtube_video_id && t.youtube_video_id.length === 11)
        ? t.youtube_video_id
        : (t.id && t.id.length === 11 ? t.id : null);

    return {
        id: ytId,
        youtube_video_id: ytId,
        dbId: t.id && t.id.length !== 11 ? t.id : (t.dbId || null),
        title: t.title,
        artist: t.artist,
        genre: t.primary_genre_id || t.genre || 'rock',
        thumbnail: ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null,
        source: 'artist_catalog',
        is_instrumental: t.is_instrumental,
        energy: t.energy
    };
}

// In-memory cache across modal open/close cycles
let cachedAllArtists = null;
let fetchAllPromise = null;

async function loadAllArtists(force = false) {
    if (!force && cachedAllArtists) return cachedAllArtists;
    if (!force && fetchAllPromise) return fetchAllPromise;

    fetchAllPromise = (async () => {
        const PAGE_SIZE = 1000;

        // 1. Get exact current count to determine required chunks dynamically
        const { count: totalArtists } = await supabase
            .from('artists')
            .select('*', { count: 'exact', head: true });

        const totalToFetch = Math.max(totalArtists || 12000, 1000);
        const totalPages = Math.ceil(totalToFetch / PAGE_SIZE);

        const promises = [];
        for (let page = 0; page < totalPages; page++) {
            promises.push(
                supabase
                    .from('artists')
                    .select('id, name, primary_genre_id, track_count, avatar_url, created_at, last_inflated_at')
                    .order('track_count', { ascending: false })
                    .order('id', { ascending: true })
                    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
                    .then(res => res.data || [])
            );
        }
        const chunks = await Promise.all(promises);
        const all = chunks.flat().filter(Boolean);

        // Deduplicate by artist ID and canonical name
        const uniqueMap = new Map();
        for (const a of all) {
            const key = a.name ? a.name.trim().toLowerCase() : a.id;
            if (key && !uniqueMap.has(key)) {
                uniqueMap.set(key, a);
            }
        }
        const deduplicated = Array.from(uniqueMap.values());
        cachedAllArtists = deduplicated;
        fetchAllPromise = null;
        return deduplicated;
    })();

    return fetchAllPromise;
}

export default function ArtistsExplorer({ onPlayTrack, onClose }) {
    const [artists, setArtists] = useState(cachedAllArtists || []);
    const [isLoading, setIsLoading] = useState(!cachedAllArtists);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedGenre, setSelectedGenre] = useState('all');
    const [selectedArtist, setSelectedArtist] = useState(null);
    const [artistTracks, setArtistTracks] = useState([]);
    const [isLoadingTracks, setIsLoadingTracks] = useState(false);
    const [avatarOverrides, setAvatarOverrides] = useState({});
    const [visibleCount, setVisibleCount] = useState(60);

    // Potential matches (Staged Candidates)
    const [stagedArtists, setStagedArtists] = useState([]);
    const [isLoadingStaged, setIsLoadingStaged] = useState(false);
    const [requestedArtists, setRequestedArtists] = useState(() => {
        try {
            const saved = localStorage.getItem('musicmood_requested_artists');
            return saved ? JSON.parse(saved) : {};
        } catch {
            return {};
        }
    });

    const handleToggleRequest = async (artist, e) => {
        if (e) e.stopPropagation();
        const key = artist.id || artist.name;
        const currentlyRequested = !!requestedArtists[key] || !!artist.is_requested;

        // Optimistic UI state update
        setRequestedArtists(prev => {
            const updated = {
                ...prev,
                [key]: !currentlyRequested
            };
            try {
                localStorage.setItem('musicmood_requested_artists', JSON.stringify(updated));
            } catch (err) {
                console.warn('[ArtistsExplorer] Failed to save requested artists:', err);
            }
            return updated;
        });

        // Update in-memory staged artist counts immediately
        setStagedArtists(prev => prev.map(a => {
            if ((a.id && a.id === artist.id) || a.name === artist.name) {
                return {
                    ...a,
                    is_requested: !currentlyRequested,
                    request_count: Math.max(0, (a.request_count || 0) + (currentlyRequested ? -1 : 1)),
                    status: !currentlyRequested ? 'approved' : a.status
                };
            }
            return a;
        }));

        // Persist live request directly to Supabase
        if (!currentlyRequested && artist.id) {
            try {
                await submitArtistRequest(artist.id);
            } catch (err) {
                console.error('[ArtistsExplorer] Failed to submit artist request to Supabase:', err);
            }
        }
    };

    // Fetch staged suggestions on mount and when searchQuery changes
    useEffect(() => {
        let isMounted = true;
        setIsLoadingStaged(true);

        const timer = setTimeout(async () => {
            const results = await fetchArtistSuggestions(searchQuery, 300);
            if (isMounted) {
                setStagedArtists(results);
                setIsLoadingStaged(false);
            }
        }, 150);

        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, [searchQuery]);

    const handleForceRefresh = async () => {
        setIsRefreshing(true);
        try {
            const fresh = await loadAllArtists(true);
            setArtists(fresh);
        } catch (e) {
            console.error('[ArtistsExplorer] Refresh error:', e);
        } finally {
            setIsRefreshing(false);
        }
    };

    // 1. Fetch catalog artists (all in database)
    useEffect(() => {
        let isMounted = true;
        if (cachedAllArtists) {
            setArtists(cachedAllArtists);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        loadAllArtists().then(all => {
            if (isMounted) {
                setArtists(all);
                setIsLoading(false);
            }
        }).catch(e => {
            console.error('[ArtistsExplorer] Failed to fetch all artists:', e);
            if (isMounted) setIsLoading(false);
        });

        return () => { isMounted = false; };
    }, []);

    // Reset pagination when search or genre changes
    useEffect(() => {
        setVisibleCount(60);
    }, [searchQuery, selectedGenre]);

    // 2. Fetch tracks for selected artist
    const handleSelectArtist = async (artist) => {
        setSelectedArtist(artist);
        setIsLoadingTracks(true);
        setArtistTracks([]);

        // On-demand profile picture resolution if missing
        if (!artist.avatar_url && !avatarOverrides[artist.name]) {
            resolveArtistAvatarOnDemand(artist).then(pic => {
                if (pic) {
                    setAvatarOverrides(prev => ({ ...prev, [artist.name]: pic }));
                }
            }).catch(() => {});
        }

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

    const handlePlaySong = (rawTrack) => {
        const playable = formatPlayableTrack(rawTrack);
        if (!playable || !playable.id) return;
        if (onPlayTrack) {
            onPlayTrack(playable);
        }
        setSelectedArtist(null);
    };

    const handlePlayArtistRadio = () => {
        if (artistTracks.length === 0 || !onPlayTrack) return;
        const playables = artistTracks.map(formatPlayableTrack).filter(t => t && t.id);
        if (playables.length === 0) return;

        const first = playables[0];
        const rest = playables.slice(1);

        if (rest.length > 0) {
            sessionEngine.queue = rest;
        }

        if (sessionEngine.playOnDemand) {
            sessionEngine.playOnDemand(first, rest.length > 0);
        }
        onPlayTrack(first);
        setSelectedArtist(null);
    };

    // Filtered Artists
    const filteredArtists = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        // 1. "Potential Matches" Tab: artists currently sitting in staging awaiting ingestion
        if (selectedGenre === 'potential') {
            const mapped = stagedArtists.map(a => {
                const parent = getParentGenre(a.primary_genre_id);
                const safeGenre = a.primary_genre_id && a.primary_genre_id !== 'other'
                    ? a.primary_genre_id
                    : (parent && parent !== 'other' ? parent : 'rock');

                return {
                    id: a.id,
                    name: a.name,
                    primary_genre_id: safeGenre,
                    is_staged: true,
                    status: a.status,
                    confidence_score: a.confidence_score,
                    source: a.source,
                    is_requested: a.is_requested || !!requestedArtists[a.id || a.name],
                    request_count: a.request_count || 0,
                    track_count: 0
                };
            });
            if (query) {
                return mapped.filter(a => a.name.toLowerCase().includes(query) || (a.primary_genre_id && a.primary_genre_id.toLowerCase().includes(query)));
            }
            return mapped;
        }

        // 2. "Latest Added" Category: strictly the 50 most recently created/ingested artists
        if (selectedGenre === 'latest') {
            const latestSorted = [...artists]
                .filter(a => a.created_at || a.last_inflated_at)
                .sort((a, b) => {
                    const timeA = new Date(a.created_at || a.last_inflated_at || 0).getTime();
                    const timeB = new Date(b.created_at || b.last_inflated_at || 0).getTime();
                    return timeB - timeA;
                })
                .slice(0, 50);

            if (query) {
                return latestSorted.filter(artist => 
                    artist.name.toLowerCase().includes(query) ||
                    (artist.primary_genre_id && artist.primary_genre_id.toLowerCase().includes(query))
                );
            }
            return latestSorted;
        }

        // 3. Standard Genre Filtering
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
    }, [artists, stagedArtists, selectedGenre, searchQuery]);

    // Paginated slice for smooth 60fps rendering
    const displayedArtists = useMemo(() => {
        return filteredArtists.slice(0, visibleCount);
    }, [filteredArtists, visibleCount]);

    const handleGridScroll = (e) => {
        const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
        if (scrollTop + clientHeight >= scrollHeight - 60) {
            setVisibleCount(prev => Math.min(prev + 40, filteredArtists.length));
        }
    };

    // Dynamic on-demand avatar resolution for displayed artists with blank pictures
    useEffect(() => {
        displayedArtists.forEach(a => {
            if (!a.is_staged && !a.avatar_url && !avatarOverrides[a.name]) {
                resolveArtistAvatarOnDemand(a).then(url => {
                    if (url) {
                        setAvatarOverrides(prev => ({ ...prev, [a.name]: url }));
                    }
                }).catch(() => {});
            }
        });
    }, [displayedArtists]);

    // Handle broken avatar images
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
            padding: '0.85rem 1.25rem',
            margin: '0.75rem auto 1.25rem auto',
            maxWidth: '1100px',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.5)'
        }}>
            <style>{`
                .artist-genre-pills-row::-webkit-scrollbar {
                    display: none;
                }
                .artist-cards-grid::-webkit-scrollbar {
                    width: 6px;
                }
                .artist-cards-grid::-webkit-scrollbar-track {
                    background: rgba(15, 23, 42, 0.4);
                    border-radius: 9999px;
                }
                .artist-cards-grid::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 9999px;
                }
                .artist-cards-grid::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.35);
                }
            `}</style>

            {/* Header with Title, Count, Sync & Close */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.55rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f8fafc' }}>
                        <span>{selectedGenre === 'potential' ? '⏳' : '👤'}</span>
                        <span>{selectedGenre === 'potential' ? 'Potential Matches' : 'Catalog Artists'}</span>
                    </h2>
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                        ({selectedGenre === 'potential' ? `${stagedArtists.length ? stagedArtists.length.toLocaleString() : '1,500+'} staged candidates` : `${artists.length.toLocaleString()} verified artists`})
                    </span>
                    <button
                        onClick={handleForceRefresh}
                        disabled={isRefreshing || isLoading}
                        title="Sync fresh artist catalog from database"
                        style={{
                            background: 'rgba(255, 255, 255, 0.06)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            borderRadius: '6px',
                            color: isRefreshing ? '#94a3b8' : '#e2e8f0',
                            padding: '0.15rem 0.5rem',
                            fontSize: '0.72rem',
                            cursor: isRefreshing ? 'wait' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        <span style={{ display: 'inline-block', transform: isRefreshing ? 'rotate(180deg)' : 'none', transition: 'transform 0.4s' }}>🔄</span>
                        {isRefreshing ? 'Syncing...' : 'Sync'}
                    </button>
                </div>

                {onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '6px',
                            color: '#cbd5e1',
                            padding: '0.25rem 0.65rem',
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        ✕ Close
                    </button>
                )}
            </div>

            {/* Instant Search Bar */}
            <div style={{ position: 'relative', marginBottom: '0.55rem' }}>
                <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.6, fontSize: '0.9rem' }}>🔍</span>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={selectedGenre === 'potential' ? "Search potential matches sitting in staging..." : "Search artist name (e.g., Pink Floyd, Miles Davis, Chopin, Tipper)..."}
                    style={{
                        width: '100%',
                        padding: '0.45rem 1rem 0.45rem 2.4rem',
                        background: 'rgba(30, 41, 59, 0.7)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '8px',
                        color: '#f8fafc',
                        fontSize: '0.88rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                    }}
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery('')}
                        style={{
                            position: 'absolute',
                            right: '0.65rem',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            color: '#94a3b8',
                            fontSize: '0.85rem',
                            cursor: 'pointer'
                        }}
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Parent Genre Filter Pills (All visible on screen without scrolling) */}
            <div
                className="artist-genre-pills-row"
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '0.35rem',
                    marginBottom: '0.65rem',
                    width: '100%',
                    boxSizing: 'border-box'
                }}
            >
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
                                padding: '0.2rem 0.55rem',
                                fontSize: '0.74rem',
                                fontWeight: isActive ? '700' : '500',
                                whiteSpace: 'nowrap',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                flexShrink: 0,
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', fontSize: '0.76rem', color: '#94a3b8' }}>
                <span>
                    Showing <strong>{displayedArtists.length}</strong> of <strong>{filteredArtists.length.toLocaleString()}</strong> artist(s)
                </span>
                {searchQuery && (
                    <span>Filtered by: &ldquo;{searchQuery}&rdquo;</span>
                )}
            </div>

            {/* Artists Cards Grid */}
            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                    <span className="spinner" style={{ display: 'inline-block', width: '1.75rem', height: '1.75rem', marginBottom: '0.5rem' }}></span>
                    <div style={{ fontSize: '0.85rem' }}>Loading all {artists.length ? artists.length.toLocaleString() : 'catalog'} artists...</div>
                </div>
            ) : filteredArtists.length === 0 ? (
                <div style={{
                    textAlign: 'center',
                    padding: '2rem 1rem',
                    background: 'rgba(30, 41, 59, 0.35)',
                    borderRadius: '12px',
                    border: '1px dashed rgba(255, 255, 255, 0.15)'
                }}>
                    <div style={{ fontSize: '1.75rem', marginBottom: '0.35rem' }}>🔍</div>
                    <h3 style={{ margin: '0 0 0.35rem 0', color: '#f8fafc', fontSize: '1rem' }}>
                        {selectedGenre === 'potential' ? 'No matching staged candidates found' : 'No matching artists found'}
                    </h3>
                    <p style={{ margin: '0 auto 0.75rem auto', maxWidth: '420px', color: '#94a3b8', fontSize: '0.8rem' }}>
                        We couldn&apos;t find &ldquo;{searchQuery}&rdquo; in this category.
                    </p>
                </div>
            ) : (
                <div
                    className="artist-cards-grid"
                    onScroll={handleGridScroll}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                        gap: '0.65rem',
                        maxHeight: '340px',
                        overflowY: 'auto',
                        paddingRight: '0.35rem'
                    }}
                >
                    {displayedArtists.map(artist => {
                        const parent = getParentGenre(artist.primary_genre_id);
                        const genreObj = PARENT_GENRES.find(p => p.id === parent) || PARENT_GENRES[0];
                        const effectiveAvatar = avatarOverrides[artist.name] !== 'FALLBACK'
                            ? (avatarOverrides[artist.name] || artist.avatar_url)
                            : null;
                        const hasAvatar = Boolean(effectiveAvatar);
                        const isRequested = !!requestedArtists[artist.id || artist.name];
                        const isStaged = !!artist.is_staged;
                        const isApproved = artist.status === 'approved' || (artist.confidence_score || 0) >= 90;

                        return (
                            <div
                                key={artist.id || artist.name}
                                onClick={() => {
                                    if (isStaged) {
                                        handleToggleRequest(artist);
                                    } else {
                                        handleSelectArtist(artist);
                                    }
                                }}
                                style={{
                                    background: isRequested ? 'rgba(99, 102, 241, 0.18)' : 'rgba(30, 41, 59, 0.6)',
                                    border: isRequested ? '1px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: '10px',
                                    padding: '0.65rem 0.5rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    transition: 'transform 0.15s, background 0.15s, border-color 0.15s',
                                    position: 'relative',
                                    boxSizing: 'border-box'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.background = 'rgba(51, 65, 85, 0.7)';
                                    e.currentTarget.style.borderColor = isStaged ? '#818cf8' : genreObj.color;
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'none';
                                    e.currentTarget.style.background = isRequested ? 'rgba(99, 102, 241, 0.18)' : 'rgba(30, 41, 59, 0.6)';
                                    e.currentTarget.style.borderColor = isRequested ? '#818cf8' : 'rgba(255, 255, 255, 0.08)';
                                }}
                            >
                                {/* Profile Picture / Avatar */}
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '50%',
                                    overflow: 'hidden',
                                    marginBottom: '0.45rem',
                                    border: `2px solid ${isStaged ? (isApproved ? '#10b981' : '#f59e0b') : genreObj.color}`,
                                    boxShadow: `0 0 10px ${genreObj.color}33`,
                                    background: `linear-gradient(135deg, ${genreObj.color}44, #0f172a)`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    {hasAvatar ? (
                                        <img
                                            src={effectiveAvatar}
                                            alt={artist.name}
                                            onError={() => handleAvatarError(artist.name)}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                    ) : (
                                        <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#f8fafc', letterSpacing: '0.5px' }}>
                                            {isStaged ? (isApproved ? '🟢' : '🟡') : getInitials(artist.name)}
                                        </span>
                                    )}
                                </div>

                                {/* Artist Name */}
                                <h4 style={{
                                    margin: '0 0 0.25rem 0',
                                    fontSize: '0.84rem',
                                    fontWeight: '600',
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
                                    gap: '0.25rem',
                                    background: `${genreObj.color}22`,
                                    color: genreObj.color,
                                    border: `1px solid ${genreObj.color}44`,
                                    borderRadius: '9999px',
                                    padding: '0.1rem 0.45rem',
                                    fontSize: '0.68rem',
                                    fontWeight: '600',
                                    marginBottom: '0.25rem'
                                }}>
                                    <span>{genreObj.emoji}</span>
                                    <span>{isStaged && artist.primary_genre_id && artist.primary_genre_id !== 'other' ? artist.primary_genre_id.replace(/_/g, ' ') : genreObj.label}</span>
                                </div>

                                {/* Track Count or Request Button */}
                                {isStaged ? (
                                    <button
                                        onClick={(e) => handleToggleRequest(artist, e)}
                                        style={{
                                            marginTop: '0.2rem',
                                            width: '100%',
                                            padding: '0.2rem 0.45rem',
                                            borderRadius: '5px',
                                            border: isRequested ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.15)',
                                            background: isRequested ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                                            color: isRequested ? '#34d399' : '#cbd5e1',
                                            fontSize: '0.68rem',
                                            fontWeight: '600',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s'
                                        }}
                                        title={isRequested ? 'Click to cancel request' : 'Request this artist to be prioritized for catalog ingestion'}
                                    >
                                        {isRequested ? '✓ Requested' : '+ Request'}{artist.request_count > 0 ? ` (${artist.request_count})` : ''}
                                    </button>
                                ) : (
                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                        {artist.track_count} tracks
                                    </span>
                                )}
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
                            {(() => {
                                const effectiveSelectedAvatar = selectedArtist && avatarOverrides[selectedArtist.name] !== 'FALLBACK'
                                    ? (avatarOverrides[selectedArtist.name] || selectedArtist.avatar_url)
                                    : null;
                                return (
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
                                            {effectiveSelectedAvatar ? (
                                                <img src={effectiveSelectedAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                                );
                            })()}

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
                                                    onClick={() => handlePlaySong(t)}
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
                                    onClick={handlePlayArtistRadio}
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
