import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase, fetchArtistSuggestions, fetchRandomStagedArtists, submitArtistRequest, rejectArtistSuggestion, fetchRequestedArtistIdentifiers, requestNewArtist } from '../services/supabaseService';
import { GENRE_NODES } from '../services/tasteGraph';
import { sessionEngine } from '../services/sessionStateMachine';
import { resolveArtistAvatarOnDemand } from '../services/avatarService';
import { isAdmin } from '../services/userService';

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
 * Normalizes artist name for fuzzy deduplication & clustering
 * Strips diacritics, punctuation, dashes/hyphens, and collapses spaces
 */
export function normalizeArtistKey(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove diacritics
        .replace(/[‐‑‒–—―-]/g, ' ') // normalize all hyphens to space
        .replace(/[^a-z0-9\s]/g, '') // remove punctuation
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Fast Levenshtein distance algorithm for typo-tolerant artist matching
 */
export function levenshteinDistance(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const row = [];
    for (let j = 0; j <= b.length; j++) row[j] = j;
    for (let i = 1; i <= a.length; i++) {
        let prev = i;
        for (let j = 1; j <= b.length; j++) {
            let val;
            if (a.charAt(i - 1) === b.charAt(j - 1)) {
                val = row[j - 1];
            } else {
                val = Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
            }
            row[j - 1] = prev;
            prev = val;
        }
        row[b.length] = prev;
    }
    return row[b.length];
}

/**
 * Multi-layer typo-tolerant artist search matcher:
 * 1. Substring & normalized key match (fastest)
 * 2. Genre taxonomy match
 * 3. Full-phrase Levenshtein edit distance (handles typos like "bling guardian" -> "blind guardian")
 * 4. Word-by-word token matching
 */
export function matchesArtistSearch(artistName, query, primaryGenreId = '') {
    if (!query || !query.trim()) return true;
    if (!artistName) return false;

    const lowerName = artistName.toLowerCase().trim();
    const cleanQuery = query.toLowerCase().trim();
    const normA = normalizeArtistKey(artistName);
    const normQ = normalizeArtistKey(query);

    // 1. Direct or normalized substring match
    if (lowerName.includes(cleanQuery) || normA.includes(normQ) || cleanQuery.includes(lowerName)) {
        return true;
    }

    // 2. Genre match
    if (primaryGenreId && primaryGenreId.toLowerCase().includes(cleanQuery)) {
        return true;
    }

    // 3. Typo-tolerant Levenshtein distance on normalized phrase
    if (normQ.length >= 4) {
        const fullDist = levenshteinDistance(normQ, normA);
        const maxDist = normQ.length <= 6 ? 1 : 2;
        if (fullDist <= maxDist) return true;
    }

    // 4. Token / word-level fuzzy match (e.g. "bling guardian" -> "bling" matches "blind", "guardian" matches "guardian")
    const qWords = normQ.split(/\s+/).filter(w => w.length >= 3);
    const aWords = normA.split(/\s+/).filter(w => w.length >= 3);

    if (qWords.length > 0 && aWords.length > 0) {
        const allWordsMatched = qWords.every(qw => {
            return aWords.some(aw => {
                if (aw.includes(qw) || qw.includes(aw)) return true;
                const dist = levenshteinDistance(qw, aw);
                const allowed = qw.length <= 5 ? 1 : 2;
                return dist <= allowed;
            });
        });
        if (allWordsMatched) return true;
    }

    return false;
}

/**
 * Scores artist name quality: favors proper mixed casing, proper accents, and standard hyphens
 * Penalizes ALL-CAPS (e.g. PINK FLOYD), all-lowercase, CJK mojibake, and odd unicode dashes
 */
export function scoreArtistNameQuality(name) {
    if (!name) return 0;
    let score = 10;
    // Penalize CJK / mojibake characters in western artist names
    if (/[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef]/.test(name) && !/^[^\x00-\x7F]+$/.test(name)) score -= 30;
    // Penalize odd unicode dashes/hyphens (e.g. U+2010 hyphen)
    if (/[\u2010\u2011\u2012\u2013\u2014]/.test(name)) score -= 15;
    // Penalize ALL-CAPS if longer than 3 chars (e.g. PINK FLOYD vs Pink Floyd, but allow U2, R.E.M.)
    if (name.length > 3 && name === name.toUpperCase()) score -= 20;
    // Penalize all-lowercase (e.g. "nine inch nails" vs "Nine Inch Nails")
    if (name === name.toLowerCase()) score -= 15;
    // Reward standard accented Latin letters (e.g. Björk, Frédéric, Paco de Lucía, Antonín Dvořák)
    if (/[áàâäãåçéèêëíìîïñóòôöõúùûüýÿřžščďťňľ]/i.test(name)) score += 10;
    // Reward standard hyphen (e.g. Jean-Michel Jarre)
    if (name.includes('-')) score += 5;
    return score;
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

        // Deduplicate and merge artist clusters by normalized canonical key
        const uniqueMap = new Map();
        for (const a of all) {
            const key = normalizeArtistKey(a.name) || a.id;
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, {
                    ...a,
                    allIds: [a.id],
                    allNames: [a.name]
                });
            } else {
                const existing = uniqueMap.get(key);
                existing.track_count = (existing.track_count || 0) + (a.track_count || 0);
                existing.upvotes = (existing.upvotes || 0) + (a.upvotes || 0);
                if (!existing.allIds.includes(a.id)) existing.allIds.push(a.id);
                if (!existing.allNames.includes(a.name)) existing.allNames.push(a.name);
                if (!existing.avatar_url && a.avatar_url) existing.avatar_url = a.avatar_url;

                // Pick cleanest canonical display name & primary id
                const curScore = scoreArtistNameQuality(existing.name);
                const newScore = scoreArtistNameQuality(a.name);
                if (newScore > curScore || (newScore === curScore && !existing.avatar_url && a.avatar_url)) {
                    existing.name = a.name;
                    existing.id = a.id;
                    if (a.avatar_url) existing.avatar_url = a.avatar_url;
                    if (a.primary_genre_id && a.primary_genre_id !== 'other') existing.primary_genre_id = a.primary_genre_id;
                }
            }
        }
        const deduplicated = Array.from(uniqueMap.values()).filter(a => (a.track_count || 0) > 0);
        cachedAllArtists = deduplicated;
        fetchAllPromise = null;
        return deduplicated;
    })();

    return fetchAllPromise;
}

export default function ArtistsExplorer({ onPlayTrack, onClose, initialArtistName, initialSearchQuery = '', initialGenre = 'all' }) {
    const [artists, setArtists] = useState(cachedAllArtists || []);
    const [isLoading, setIsLoading] = useState(!cachedAllArtists);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');
    const [searchFilterView, setSearchFilterView] = useState('all'); // 'all' | 'staged' | 'catalog'
    const [selectedGenre, setSelectedGenre] = useState(initialGenre || 'all');

    useEffect(() => {
        if (initialGenre) {
            setSelectedGenre(initialGenre);
        }
    }, [initialGenre]);
    const [selectedArtist, setSelectedArtist] = useState(null);
    const [artistTracks, setArtistTracks] = useState([]);
    const [isLoadingTracks, setIsLoadingTracks] = useState(false);
    const [avatarOverrides, setAvatarOverrides] = useState({});
    const [visibleCount, setVisibleCount] = useState(250);

    // Potential matches (Staged Candidates)
    const [stagedArtists, setStagedArtists] = useState([]);
    const [isLoadingStaged, setIsLoadingStaged] = useState(false);
    const [isLoadingMoreStaged, setIsLoadingMoreStaged] = useState(false);
    const [rolledArtists, setRolledArtists] = useState([]);
    const [isRolling, setIsRolling] = useState(false);
    const [demoPlayingId, setDemoPlayingId] = useState(null);
    const [dismissingIds, setDismissingIds] = useState(new Set());
    const [isSubmittingCustom, setIsSubmittingCustom] = useState(false);
    const [customRequested, setCustomRequested] = useState({});
    const [requestedArtists, setRequestedArtists] = useState(() => {
        try {
            const saved = localStorage.getItem('musicmood_requested_artists');
            return saved ? JSON.parse(saved) : {};
        } catch {
            return {};
        }
    });

    // Seed requestedArtists cache with all artists marked as requested in database
    useEffect(() => {
        fetchRequestedArtistIdentifiers().then(items => {
            if (items && items.length > 0) {
                setRequestedArtists(prev => {
                    const next = { ...prev };
                    items.forEach(item => {
                        if (item.id) next[item.id] = true;
                        if (item.name) {
                            next[item.name.toLowerCase().trim()] = true;
                            next[normalizeArtistKey(item.name)] = true;
                        }
                    });
                    try {
                        localStorage.setItem('musicmood_requested_artists', JSON.stringify(next));
                    } catch {}
                    return next;
                });
            }
        }).catch(() => {});
    }, []);

    // Auto-open artist modal when opened with initialArtistName
    useEffect(() => {
        if (initialArtistName && typeof initialArtistName === 'string') {
            const trimmed = initialArtistName.trim();
            const normTarget = normalizeArtistKey(trimmed);
            const found = artists.find(a => normalizeArtistKey(a.name) === normTarget || a.name.toLowerCase() === trimmed.toLowerCase());
            if (found) {
                handleSelectArtist(found);
            } else {
                handleSelectArtist({ name: trimmed });
            }
        }
    }, [initialArtistName, artists]);

    useEffect(() => {
        if (initialSearchQuery) {
            setSearchQuery(initialSearchQuery);
        }
    }, [initialSearchQuery]);

    const handlePlayDemo = async (artist, e) => {
        if (e) e.stopPropagation();
        if (!onPlayTrack) return;

        // 1. If demo track is already cached in local object
        if (artist.demo_youtube_id) {
            setDemoPlayingId(artist.id);
            const playable = {
                id: artist.demo_youtube_id,
                youtube_video_id: artist.demo_youtube_id,
                title: artist.demo_track_title || `${artist.name} (Demo)`,
                artist: artist.name,
                genre: artist.primary_genre_id || 'rock',
                thumbnail: `https://i.ytimg.com/vi/${artist.demo_youtube_id}/hqdefault.jpg`,
                source: 'artist_demo',
                isDemo: true
            };
            if (sessionEngine.playOnDemand) {
                sessionEngine.playOnDemand(playable, false);
            }
            onPlayTrack(playable);
            return;
        }

        // 2. Otherwise check Supabase live in case background task populated it
        try {
            setDemoPlayingId(artist.id);
            const { data } = await supabase
                .from('artist_suggestions')
                .select('demo_youtube_id, demo_track_title')
                .eq('id', artist.id)
                .single();

            if (data?.demo_youtube_id) {
                artist.demo_youtube_id = data.demo_youtube_id;
                artist.demo_track_title = data.demo_track_title;
                const playable = {
                    id: data.demo_youtube_id,
                    youtube_video_id: data.demo_youtube_id,
                    title: data.demo_track_title || `${artist.name} (Demo)`,
                    artist: artist.name,
                    genre: artist.primary_genre_id || 'rock',
                    thumbnail: `https://i.ytimg.com/vi/${data.demo_youtube_id}/hqdefault.jpg`,
                    source: 'artist_demo',
                    isDemo: true
                };
                if (sessionEngine.playOnDemand) {
                    sessionEngine.playOnDemand(playable, false);
                }
                onPlayTrack(playable);
                return;
            }
        } catch (err) {
            console.warn('[ArtistsExplorer] Failed to fetch demo song:', err);
        }

        setDemoPlayingId(null);
    };

    const handleToggleRequest = async (artist, e) => {
        if (e) e.stopPropagation();
        const key = artist.id || artist.name;
        const normKey = normalizeArtistKey(artist.name);
        const lowerName = artist.name ? artist.name.toLowerCase().trim() : '';

        // Visual confirmation before dismissal
        setDismissingIds(prev => new Set(prev).add(key));

        // Immediately persist to local state and localStorage
        setRequestedArtists(prev => {
            const next = { ...prev, [key]: true };
            if (artist.id) next[artist.id] = true;
            if (lowerName) next[lowerName] = true;
            if (normKey) next[normKey] = true;
            try {
                localStorage.setItem('musicmood_requested_artists', JSON.stringify(next));
            } catch {}
            return next;
        });

        // Persist live request directly to Supabase
        if (artist.id) {
            submitArtistRequest(artist.id).catch(err => {
                console.error('[ArtistsExplorer] Failed to submit artist request to Supabase:', err);
            });
        }

        // After a brief 350ms confirmation flash, remove from candidate list and autoload replacement
        setTimeout(() => {
            setStagedArtists(prev => {
                const updated = prev.filter(a => (a.id || a.name) !== key);
                // Autoload replacement from Supabase to refill the list
                fetchArtistSuggestions(searchQuery, 2, updated.length).then(more => {
                    if (more && more.length > 0) {
                        setStagedArtists(current => {
                            const seen = new Set(current.map(c => c.id || c.name));
                            const fresh = more.filter(m => !seen.has(m.id || m.name));
                            return [...current, ...fresh];
                        });
                    }
                }).catch(() => {});
                return updated;
            });
            setRolledArtists(prev => prev.filter(a => (a.id || a.name) !== key));
            setDismissingIds(prev => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        }, 350);
    };

    const handleRejectArtist = async (artist, e) => {
        if (e) e.stopPropagation();
        const key = artist.id || artist.name;

        // Instantly dismiss from local view and autoload replacement
        setStagedArtists(prev => {
            const updated = prev.filter(a => (a.id || a.name) !== key);
            fetchArtistSuggestions(searchQuery, 2, updated.length).then(more => {
                if (more && more.length > 0) {
                    setStagedArtists(current => {
                        const seen = new Set(current.map(c => c.id || c.name));
                        const fresh = more.filter(m => !seen.has(m.id || m.name));
                        return [...current, ...fresh];
                    });
                }
            }).catch(() => {});
            return updated;
        });
        setRolledArtists(prev => prev.filter(a => (a.id || a.name) !== key));

        // Admins reject for everyone; for other listeners the dismissal only affects their own view
        if (artist.id && isAdmin()) {
            rejectArtistSuggestion(artist.id).catch(err => {
                console.error('[ArtistsExplorer] Failed to reject artist in Supabase:', err);
            });
        }
    };

    const handleRequestCustomArtist = async (name) => {
        if (!name || !name.trim()) return;
        const clean = name.trim();
        const key = clean.toLowerCase();
        setIsSubmittingCustom(true);
        try {
            const safeGenre = (selectedGenre && selectedGenre !== 'all' && selectedGenre !== 'potential' && selectedGenre !== 'latest')
                ? selectedGenre
                : 'rock';
            const res = await requestNewArtist(clean, safeGenre);
            if (res.success) {
                setCustomRequested(prev => ({ ...prev, [key]: true }));
                setRequestedArtists(prev => {
                    const next = { ...prev, [key]: true, [normalizeArtistKey(clean)]: true };
                    try {
                        localStorage.setItem('musicmood_requested_artists', JSON.stringify(next));
                    } catch {}
                    return next;
                });
            }
        } catch (e) {
            console.error('[ArtistsExplorer] Custom request failed:', e);
        } finally {
            setIsSubmittingCustom(false);
        }
    };

    // Fetch staged suggestions on mount and when searchQuery changes
    useEffect(() => {
        let isMounted = true;
        setIsLoadingStaged(true);

        const timer = setTimeout(async () => {
            const results = await fetchArtistSuggestions(searchQuery, 250, 0);
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

    // Auto-refill staged candidates if user requests/dismisses many and list shrinks below 100
    useEffect(() => {
        if (selectedGenre === 'potential' && stagedArtists.length > 0 && stagedArtists.length < 100 && !isLoadingStaged) {
            fetchArtistSuggestions(searchQuery, 100, stagedArtists.length).then(results => {
                setStagedArtists(prev => {
                    const existingKeys = new Set(prev.map(a => a.id || a.name));
                    const newItems = results.filter(r => !existingKeys.has(r.id || r.name));
                    return [...prev, ...newItems];
                });
            }).catch(() => {});
        }
    }, [stagedArtists.length, selectedGenre, searchQuery, isLoadingStaged]);

    const handleRollFifty = async (genre = selectedGenre) => {
        setIsRolling(true);
        try {
            const targetGenre = (genre && genre !== 'potential' && genre !== 'all' && genre !== 'latest') ? genre : null;
            const freshFifty = await fetchRandomStagedArtists(50, targetGenre);
            if (freshFifty && freshFifty.length > 0) {
                setRolledArtists(freshFifty);
            }
        } catch (err) {
            console.warn('[ArtistsExplorer] Roll 50 failed:', err);
        } finally {
            setIsRolling(false);
        }
    };

    // Auto-roll 50 when switching to potential matches or when empty
    useEffect(() => {
        if (selectedGenre === 'potential' && rolledArtists.length === 0 && !isRolling) {
            handleRollFifty('potential');
        }
    }, [selectedGenre]);

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
            const namesToQuery = (artist.allNames && artist.allNames.length > 0)
                ? artist.allNames
                : [artist.name];

            let query = supabase
                .from('tracks')
                .select('*')
                .not('youtube_video_id', 'is', null)
                .neq('youtube_video_id', 'CORRUPT_TAGS');

            if (namesToQuery.length === 1) {
                query = query.ilike('artist', namesToQuery[0]);
            } else {
                query = query.in('artist', namesToQuery);
            }

            const { data, error } = await query.limit(50);

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
        const normQuery = normalizeArtistKey(searchQuery);
        const catalogNameSet = new Set(artists.map(a => normalizeArtistKey(a.name)));

        // Helper to map and sanitize staged artists
        const formatStaged = (list) => {
            return list
                .filter(a => {
                    if (a.is_requested || (a.request_count && a.request_count > 0)) return false;
                    const normA = normalizeArtistKey(a.name);
                    const lowerA = a.name ? a.name.toLowerCase().trim() : '';
                    if (requestedArtists[a.id] || (lowerA && requestedArtists[lowerA]) || (normA && requestedArtists[normA])) return false;
                    if (normA && catalogNameSet.has(normA)) return false; // Already present in verified catalog
                    return true;
                })
                .map(a => {
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
                        demo_youtube_id: a.demo_youtube_id || null,
                        demo_track_title: a.demo_track_title || null,
                        track_count: 0
                    };
                });
        };

        // 1. "Potential Matches" Tab: 50 rolled candidates with playable demos (or search results from staging)
        if (selectedGenre === 'potential') {
            if (query) {
                const mapped = formatStaged(stagedArtists);
                return mapped.filter(a => matchesArtistSearch(a.name, query, a.primary_genre_id));
            }
            const pool = (rolledArtists && rolledArtists.length > 0) ? rolledArtists : stagedArtists;
            return formatStaged(pool);
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

            if (!query) return latestSorted;

            const catalogFiltered = latestSorted.filter(artist => matchesArtistSearch(artist.name, query, artist.primary_genre_id));

            const matchingStaged = formatStaged(stagedArtists).filter(a => matchesArtistSearch(a.name, query, a.primary_genre_id));

            if (catalogFiltered.length > 0 && matchingStaged.length > 0) {
                return [
                    ...catalogFiltered,
                    { id: '__staged_header__', isSectionHeader: true, title: 'Available to Request from Staging', count: matchingStaged.length, isAvailable: true },
                    ...matchingStaged
                ];
            } else if (catalogFiltered.length === 0 && matchingStaged.length > 0) {
                return [
                    { id: '__staged_only_header__', isSectionHeader: true, title: 'Found in Staging', count: matchingStaged.length, isStagedOnly: true },
                    ...matchingStaged
                ];
            }
            return catalogFiltered;
        }

        // 3. Standard Genre Filtering (e.g. 'all', 'rock', 'metal', etc.)
        const catalogMatches = artists.filter(artist => {
            const parent = getParentGenre(artist.primary_genre_id);
            // In pure browse mode (no search query), respect the selected genre tab.
            // When user enters an active search query, search globally so matches in other genres aren't hidden!
            if (!query && selectedGenre !== 'all' && parent !== selectedGenre) {
                return false;
            }
            if (query) {
                return matchesArtistSearch(artist.name, query, artist.primary_genre_id);
            }
            return true;
        });

        // When not searching, return standard catalog matches
        if (!query) {
            return catalogMatches;
        }

        // When searching, find staged candidates matching the search query across all 11,000+ candidates
        const matchingStaged = formatStaged(stagedArtists).filter(a => matchesArtistSearch(a.name, query, a.primary_genre_id));

        if (searchFilterView === 'staged') {
            return matchingStaged.length > 0
                ? [
                    { id: '__staged_only_header__', isSectionHeader: true, title: 'Found in Staging', count: matchingStaged.length, isStagedOnly: true },
                    ...matchingStaged
                ]
                : [];
        }

        if (searchFilterView === 'catalog') {
            return catalogMatches;
        }

        // Default 'all' view: STAGED FIRST so user immediately sees & can request candidates without scrolling past 50+ catalog cards!
        if (catalogMatches.length > 0 && matchingStaged.length > 0) {
            return [
                { id: '__staged_header__', isSectionHeader: true, title: 'Available to Request from Staging', count: matchingStaged.length, isAvailable: true },
                ...matchingStaged,
                { id: '__catalog_header__', isSectionHeader: true, title: 'Verified Catalog Artists', count: catalogMatches.length, isCatalog: true },
                ...catalogMatches
            ];
        } else if (catalogMatches.length === 0 && matchingStaged.length > 0) {
            return [
                { id: '__staged_only_header__', isSectionHeader: true, title: 'Found in Staging', count: matchingStaged.length, isStagedOnly: true },
                ...matchingStaged
            ];
        }

        return catalogMatches;
    }, [artists, stagedArtists, rolledArtists, selectedGenre, searchQuery, requestedArtists, searchFilterView]);

    // Fast search count breakdown for filter pills
    const searchCounts = useMemo(() => {
        if (!searchQuery.trim()) return { staged: 0, catalog: 0, total: 0 };
        const query = searchQuery.trim().toLowerCase();
        const normQuery = normalizeArtistKey(searchQuery);
        const catalogNameSet = new Set(artists.map(a => normalizeArtistKey(a.name)));

        const catCount = artists.filter(artist => {
            const parent = getParentGenre(artist.primary_genre_id);
            if (!query && selectedGenre !== 'all' && parent !== selectedGenre) return false;
            return matchesArtistSearch(artist.name, query, artist.primary_genre_id);
        }).length;

        const stagedCount = stagedArtists.filter(a => {
            if (a.is_requested || (a.request_count && a.request_count > 0)) return false;
            const normA = normalizeArtistKey(a.name);
            const lowerA = a.name ? a.name.toLowerCase().trim() : '';
            if (requestedArtists[a.id] || (lowerA && requestedArtists[lowerA]) || (normA && requestedArtists[normA])) return false;
            if (normA && catalogNameSet.has(normA)) return false;
            return matchesArtistSearch(a.name, query, a.primary_genre_id);
        }).length;

        return { staged: stagedCount, catalog: catCount, total: catCount + stagedCount };
    }, [searchQuery, artists, stagedArtists, selectedGenre, requestedArtists]);

    // Paginated slice for smooth 60fps rendering
    const displayedArtists = useMemo(() => {
        return filteredArtists.slice(0, visibleCount);
    }, [filteredArtists, visibleCount]);

    const handleGridScroll = (e) => {
        const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
        if (scrollTop + clientHeight >= scrollHeight - 80) {
            setVisibleCount(prev => Math.min(prev + 100, filteredArtists.length));

            // Infinite autoload for Potential Matches when scrolling near bottom
            if (selectedGenre === 'potential' && !isLoadingMoreStaged && !isLoadingStaged) {
                setIsLoadingMoreStaged(true);
                fetchArtistSuggestions(searchQuery, 100, stagedArtists.length).then(more => {
                    if (more && more.length > 0) {
                        setStagedArtists(prev => {
                            const seen = new Set(prev.map(p => p.id || p.name));
                            const fresh = more.filter(m => !seen.has(m.id || m.name));
                            return [...prev, ...fresh];
                        });
                    }
                    setIsLoadingMoreStaged(false);
                }).catch(() => setIsLoadingMoreStaged(false));
            }
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
                    placeholder={selectedGenre === 'potential' ? "Search potential matches sitting in staging..." : "Search artists across catalog and staging (e.g., Pink Floyd, Buzzcocks, Clan of Xymox)..."}
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

            {/* Search Scope Filter Tabs (Shown when typing in Search Bar) */}
            {searchQuery.trim() && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    marginBottom: '0.65rem',
                    padding: '0.35rem 0.65rem',
                    background: 'rgba(30, 41, 59, 0.6)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    flexWrap: 'wrap'
                }}>
                    <span style={{ fontSize: '0.74rem', color: '#94a3b8', marginRight: '0.2rem' }}>Search results:</span>
                    <button
                        onClick={() => setSearchFilterView('all')}
                        style={{
                            background: searchFilterView === 'all' ? '#6366f1' : 'transparent',
                            color: searchFilterView === 'all' ? '#fff' : '#cbd5e1',
                            border: searchFilterView === 'all' ? '1px solid #818cf8' : '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '9999px',
                            padding: '0.2rem 0.65rem',
                            fontSize: '0.74rem',
                            fontWeight: searchFilterView === 'all' ? '700' : '500',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                        }}
                    >
                        <span>✨</span>
                        <span>All Matches ({searchCounts.total})</span>
                    </button>
                    <button
                        onClick={() => setSearchFilterView('staged')}
                        style={{
                            background: searchFilterView === 'staged' ? '#10b981' : 'transparent',
                            color: searchFilterView === 'staged' ? '#fff' : '#cbd5e1',
                            border: searchFilterView === 'staged' ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '9999px',
                            padding: '0.2rem 0.65rem',
                            fontSize: '0.74rem',
                            fontWeight: searchFilterView === 'staged' ? '700' : '500',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                        }}
                    >
                        <span>⏳</span>
                        <span>Staged Requests ({searchCounts.staged})</span>
                    </button>
                    <button
                        onClick={() => setSearchFilterView('catalog')}
                        style={{
                            background: searchFilterView === 'catalog' ? '#3b82f6' : 'transparent',
                            color: searchFilterView === 'catalog' ? '#fff' : '#cbd5e1',
                            border: searchFilterView === 'catalog' ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '9999px',
                            padding: '0.2rem 0.65rem',
                            fontSize: '0.74rem',
                            fontWeight: searchFilterView === 'catalog' ? '700' : '500',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                        }}
                    >
                        <span>👥</span>
                        <span>In Catalog ({searchCounts.catalog})</span>
                    </button>
                    {isLoadingStaged && (
                        <span style={{ fontSize: '0.72rem', color: '#a5b4fc', marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span className="spinner" style={{ width: '0.75rem', height: '0.75rem', borderWidth: '1.5px' }}></span>
                            Searching 11,896 staged...
                        </span>
                    )}
                </div>
            )}

            {/* POTENTIAL MATCHES SECTION HEADER & ROLL 50 FRESH */}
            {selectedGenre === 'potential' ? (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.55rem 0.85rem',
                    marginBottom: '0.65rem',
                    background: 'rgba(139, 92, 246, 0.12)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '10px',
                    flexWrap: 'wrap',
                    gap: '0.5rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                        <span style={{ fontSize: '1.2rem' }}>⏳</span>
                        <div>
                            <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#e9d5ff' }}>
                                {searchQuery ? `Staged Candidates Matching "${searchQuery}"` : 'Potential Matches — 50 Random Gems'}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                {searchQuery
                                    ? `Showing ${displayedArtists.length} matching staged artists`
                                    : 'Audition demo tracks from 17,500+ uncataloged artists. Click "+ Request" to admit & inflate!'}
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            if (searchQuery) setSearchQuery('');
                            handleRollFifty();
                        }}
                        disabled={isRolling}
                        style={{
                            background: isRolling ? 'rgba(139, 92, 246, 0.35)' : 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.35rem 0.85rem',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            cursor: isRolling ? 'wait' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            boxShadow: '0 2px 10px rgba(139, 92, 246, 0.35)',
                            transition: 'all 0.15s'
                        }}
                        title="Roll 50 fresh random staged candidates with playable demos"
                    >
                        <span style={{ display: 'inline-block', transform: isRolling ? 'rotate(180deg)' : 'none', transition: 'transform 0.4s' }}>🎲</span>
                        <span>{isRolling ? 'Rolling...' : 'Roll 50 Fresh'}</span>
                    </button>
                </div>
            ) : (
                /* Results Count */
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', fontSize: '0.76rem', color: '#94a3b8' }}>
                    <span>
                        Showing <strong>{displayedArtists.filter(a => !a.isSectionHeader).length}</strong> of <strong>{filteredArtists.filter(a => !a.isSectionHeader).length.toLocaleString()}</strong> artist(s)
                    </span>
                    {searchQuery && (
                        <span>Filtered by: &ldquo;{searchQuery}&rdquo;</span>
                    )}
                </div>
            )}

            {/* Artists Cards Grid */}
            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                    <span className="spinner" style={{ display: 'inline-block', width: '1.75rem', height: '1.75rem', marginBottom: '0.5rem' }}></span>
                    <div style={{ fontSize: '0.85rem' }}>Loading all {artists.length ? artists.length.toLocaleString() : 'catalog'} artists...</div>
                </div>
            ) : (isLoadingStaged || isRolling) && filteredArtists.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', background: 'rgba(30, 41, 59, 0.35)', borderRadius: '12px', border: '1px dashed rgba(255, 255, 255, 0.15)' }}>
                    <span className="spinner" style={{ display: 'inline-block', width: '1.5rem', height: '1.5rem', marginBottom: '0.5rem' }}></span>
                    <div style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>{selectedGenre === 'potential' ? 'Rolling 50 random staged candidates with playable demos...' : 'Searching staged artists in library...'}</div>
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
                    {searchQuery.trim().length >= 2 && (
                        <div style={{ marginTop: '0.85rem' }}>
                            <button
                                onClick={() => handleRequestCustomArtist(searchQuery)}
                                disabled={isSubmittingCustom || customRequested[searchQuery.toLowerCase().trim()]}
                                style={{
                                    background: customRequested[searchQuery.toLowerCase().trim()]
                                        ? 'rgba(16, 185, 129, 0.25)'
                                        : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    border: customRequested[searchQuery.toLowerCase().trim()]
                                        ? '1px solid #10b981'
                                        : '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: '8px',
                                    color: customRequested[searchQuery.toLowerCase().trim()] ? '#34d399' : '#ffffff',
                                    padding: '0.45rem 1.15rem',
                                    fontSize: '0.82rem',
                                    fontWeight: '600',
                                    cursor: customRequested[searchQuery.toLowerCase().trim()] ? 'default' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)'
                                }}
                            >
                                <span>{customRequested[searchQuery.toLowerCase().trim()] ? '✓' : '✨'}</span>
                                <span>
                                    {customRequested[searchQuery.toLowerCase().trim()]
                                        ? `Request queued for "${searchQuery}"!`
                                        : isSubmittingCustom
                                        ? 'Submitting request...'
                                        : `Request "${searchQuery}" to be added to catalog`}
                                </span>
                            </button>
                        </div>
                    )}
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
                        if (artist.isSectionHeader) {
                            return (
                                <div
                                    key={artist.id}
                                    style={{
                                        gridColumn: '1 / -1',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.45rem 0.75rem',
                                        margin: artist.isStagedOnly ? '0 0 0.35rem 0' : '0.65rem 0 0.25rem 0',
                                        background: artist.isStagedOnly ? 'rgba(16, 185, 129, 0.12)' : 'rgba(99, 102, 241, 0.12)',
                                        border: artist.isStagedOnly ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(99, 102, 241, 0.3)',
                                        borderRadius: '8px',
                                        boxSizing: 'border-box'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '0.9rem' }}>⏳</span>
                                        <span style={{ fontSize: '0.82rem', fontWeight: '600', color: artist.isStagedOnly ? '#6ee7b7' : '#c7d2fe' }}>
                                            {artist.isStagedOnly ? `Found ${artist.count} Staged Candidate${artist.count > 1 ? 's' : ''}` : `Available to Request from Staging (${artist.count})`}
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                            — {artist.isStagedOnly ? 'Not in catalog yet. Click "+ Request" to admit & inflate!' : 'Click "+ Request" to prioritize for catalog admission'}
                                        </span>
                                    </div>
                                </div>
                            );
                        }

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

                                {/* Track Count or Try Demo + Request Buttons */}
                                {isStaged ? (
                                    <>
                                        {artist.demo_track_title && (
                                            <div style={{
                                                fontSize: '0.66rem',
                                                color: '#cbd5e1',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                maxWidth: '100%',
                                                marginBottom: '0.15rem'
                                            }} title={artist.demo_track_title}>
                                                🎵 {artist.demo_track_title}
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', gap: '0.25rem', width: '100%', marginTop: '0.2rem' }}>
                                        <button
                                            onClick={(e) => handlePlayDemo(artist, e)}
                                            style={{
                                                flex: '0 0 auto',
                                                padding: '0.2rem 0.45rem',
                                                borderRadius: '5px',
                                                border: demoPlayingId === artist.id ? '1px solid #10b981' : '1px solid rgba(99, 102, 241, 0.4)',
                                                background: demoPlayingId === artist.id ? 'rgba(16, 185, 129, 0.25)' : 'rgba(99, 102, 241, 0.15)',
                                                color: demoPlayingId === artist.id ? '#34d399' : '#a5b4fc',
                                                fontSize: '0.68rem',
                                                fontWeight: '600',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.2rem',
                                                transition: 'all 0.15s'
                                            }}
                                            title={artist.demo_track_title ? `Try song: "${artist.demo_track_title}"` : `Demo ${artist.name}`}
                                        >
                                            <span>{demoPlayingId === artist.id ? '🔊' : '▶'}</span>
                                            <span>{demoPlayingId === artist.id ? 'Playing' : 'Try'}</span>
                                        </button>
                                        <button
                                            onClick={(e) => handleToggleRequest(artist, e)}
                                            style={{
                                                flex: 1,
                                                padding: '0.2rem 0.35rem',
                                                borderRadius: '5px',
                                                border: dismissingIds.has(artist.id || artist.name) ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.15)',
                                                background: dismissingIds.has(artist.id || artist.name) ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.06)',
                                                color: dismissingIds.has(artist.id || artist.name) ? '#34d399' : '#cbd5e1',
                                                fontSize: '0.68rem',
                                                fontWeight: '600',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}
                                            title="Request this artist to be prioritized for catalog ingestion"
                                        >
                                            {dismissingIds.has(artist.id || artist.name) ? '✓ Added!' : '+ Request'}
                                        </button>
                                        <button
                                            onClick={(e) => handleRejectArtist(artist, e)}
                                            style={{
                                                flex: '0 0 auto',
                                                padding: '0.2rem 0.4rem',
                                                borderRadius: '5px',
                                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                                background: 'rgba(239, 68, 68, 0.1)',
                                                color: '#f87171',
                                                fontSize: '0.68rem',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s'
                                            }}
                                            title={`Reject and dismiss ${artist.name}`}
                                            aria-label="Reject"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    </>
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
            {selectedArtist && typeof document !== 'undefined' && createPortal(
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    zIndex: 99999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1.25rem'
                }} onClick={() => setSelectedArtist(null)}>
                    <div style={{
                        background: '#0f172a',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '650px',
                        height: 'min(520px, 80vh)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85)'
                    }} onClick={(e) => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '1.1rem 1.4rem',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'rgba(30, 41, 59, 0.6)',
                            flexShrink: 0
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
                        <div style={{ padding: '0.85rem 1.25rem', overflowY: 'auto', flex: 1, minHeight: 0 }}>
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
                                padding: '0.85rem 1.4rem',
                                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                                display: 'flex',
                                justifyContent: 'flex-end',
                                background: 'rgba(30, 41, 59, 0.3)',
                                flexShrink: 0
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
                </div>,
                document.body
            )}
        </section>
    );
}
