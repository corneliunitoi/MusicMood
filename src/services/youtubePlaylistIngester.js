import { supabase, apiFetch } from './supabaseService.js';
import { GENRE_FAMILIES, GENRE_NODES } from './tasteGraph.js';
import { normalizeGenre } from './genreNormalizer.js';

/**
 * Auto-detects the most probable genre from a playlist title
 */
export function inferGenreFromTitle(title) {
    if (!title) return 'rock';
    const lower = title.toLowerCase();

    for (const [nodeId, node] of Object.entries(GENRE_NODES)) {
        if (lower.includes(node.label.toLowerCase()) || lower.includes(nodeId.replace(/_/g, ' '))) {
            return nodeId;
        }
    }

    if (lower.includes('rock') || lower.includes('guitar')) return 'rock';
    if (lower.includes('metal') || lower.includes('heavy')) return 'metal';
    if (lower.includes('pop') || lower.includes('top hits') || lower.includes('billboard')) return 'pop';
    if (lower.includes('electronic') || lower.includes('edm') || lower.includes('dance') || lower.includes('house')) return 'electronic';
    if (lower.includes('hip hop') || lower.includes('rap') || lower.includes('trap')) return 'hip_hop';
    if (lower.includes('blues')) return 'blues';
    if (lower.includes('jazz') || lower.includes('swing')) return 'jazz';
    if (lower.includes('classical') || lower.includes('piano') || lower.includes('orchestral') || lower.includes('symphony')) return 'classical';
    if (lower.includes('ambient') || lower.includes('chill') || lower.includes('lo-fi') || lower.includes('lofi') || lower.includes('relax') || lower.includes('focus')) return 'ambient_chill';
    if (lower.includes('soul') || lower.includes('funk') || lower.includes('r&b') || lower.includes('rnb')) return 'rnb_soul';
    if (lower.includes('country') || lower.includes('americana') || lower.includes('folk')) return 'country';
    if (lower.includes('reggae') || lower.includes('latin') || lower.includes('salsa')) return 'world_reggae';

    return 'rock';
}

/**
 * Fetches tracks from a YouTube playlist URL or ID with zero API quota consumption.
 */
export async function fetchPlaylistTracks(playlistIdOrUrl) {
    const isBrowser = typeof window !== 'undefined';
    const baseUrl = isBrowser ? '' : 'http://localhost:5173';
    const url = `${baseUrl}/api/playlist-tracks?url=${encodeURIComponent(playlistIdOrUrl)}`;
    const response = await apiFetch(url);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch playlist (Status: ${response.status})`);
    }
    const data = await response.json();
    return data;
}

/**
 * Filters out noise, generic placeholders, numeric junk, and compilation labels
 * to ensure only legitimate musical artists are auto-inflated.
 */
export function isInflateCandidate(name) {
    if (!name || typeof name !== 'string') return false;
    const clean = name.trim();
    if (clean.length < 2 || clean.length > 60) return false;

    // Purely numeric or punctuation check (e.g. "01", "12345", "--")
    if (/^[0-9\s._\-#+&/\\()]+$/.test(clean)) return false;

    // Generic placeholders & compilation junk
    const lower = clean.toLowerCase();
    const junkPatterns = [
        /^unknown(\s*artist)?$/i,
        /^various(\s*artists)?$/i,
        /^va$/i,
        /^soundtrack/i,
        /^ost$/i,
        /^compilation/i,
        /^top\s*(\d+|\w+)/i,
        /^billboard/i,
        /^greatest\s*hits/i,
        /^topic$/i,
        /^(audio|clip|video|music)$/i
    ];
    if (junkPatterns.some(pat => pat.test(lower))) return false;

    // Noise tokens (podcasts, livestreams, reactions, etc.)
    const noisePatterns = [
        /\b(interview|podcast|livestream|live\s*stream|reaction|review|tutorial|unboxing|teaser|trailer|audiobook|talk\s*show|episode|season)\b/i
    ];
    if (noisePatterns.some(pat => pat.test(lower))) return false;

    return true;
}

/**
 * Fetches top canonical track titles for an artist from iTunes (with Last.fm fallback).
 */
export async function fetchArtistCanonicalTracks(artistName, maxTracks = 8) {
    const candidates = [];
    const seenTitles = new Set();

    // 1. iTunes Search API (fast, metadata rich, zero quota)
    try {
        const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=${Math.max(maxTracks * 2, 15)}`;
        const res = await fetch(itunesUrl);
        if (res.ok) {
            const data = await res.json();
            const results = data.results || [];
            for (const item of results) {
                const trackName = (item.trackName || '').trim();
                const itemArtist = (item.artistName || '').trim();
                if (!trackName) continue;

                const aLow = artistName.toLowerCase();
                const iLow = itemArtist.toLowerCase();
                if (!iLow.includes(aLow) && !aLow.includes(iLow)) continue;

                const cleanTitle = trackName
                    .replace(/\((Remaster|Remastered|Live|Mono|Stereo|Deluxe|Bonus|Radio Edit|Acoustic).*?\)/gi, '')
                    .replace(/\[.*?\]/g, '')
                    .trim();

                const normTitle = cleanTitle.toLowerCase();
                if (!seenTitles.has(normTitle) && cleanTitle.length >= 2) {
                    seenTitles.add(normTitle);
                    candidates.push(cleanTitle);
                    if (candidates.length >= maxTracks) break;
                }
            }
        }
    } catch (e) {
        console.warn(`[Ingester] iTunes track lookup failed for ${artistName}:`, e.message);
    }

    // 2. Last.fm fallback if iTunes returned fewer than 3 tracks
    const lastfmKey = import.meta.env?.VITE_LASTFM_API_KEY;
    if (candidates.length < 3 && lastfmKey) {
        try {
            const lastfmUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(artistName)}&api_key=${encodeURIComponent(lastfmKey)}&format=json&limit=15`;
            const res = await fetch(lastfmUrl);
            if (res.ok) {
                const data = await res.json();
                const tracks = data.toptracks?.track || [];
                for (const t of tracks) {
                    const trackName = (t.name || '').trim();
                    if (!trackName) continue;
                    const cleanTitle = trackName
                        .replace(/\((Remaster|Remastered|Live|Mono|Stereo|Deluxe|Bonus|Radio Edit|Acoustic).*?\)/gi, '')
                        .replace(/\[.*?\]/g, '')
                        .trim();
                    const normTitle = cleanTitle.toLowerCase();
                    if (!seenTitles.has(normTitle) && cleanTitle.length >= 2) {
                        seenTitles.add(normTitle);
                        candidates.push(cleanTitle);
                        if (candidates.length >= maxTracks) break;
                    }
                }
            }
        } catch (e) {
            console.warn(`[Ingester] Last.fm track lookup fallback failed for ${artistName}:`, e.message);
        }
    }

    return candidates.slice(0, maxTracks);
}

/**
 * On-the-spot inflates a newly discovered artist by pulling their canonical top tracks,
 * resolving YouTube video IDs via zero-quota endpoint, and saving them to public.tracks.
 */
export async function inflateNewArtistOnTheSpot({ artistName, artistId, primaryGenreId, maxTracks = 8, onStatus }) {
    if (!isInflateCandidate(artistName)) return { added: 0 };

    if (onStatus) onStatus(`Auto-inflating artist: ${artistName}...`);

    const canonicalTitles = await fetchArtistCanonicalTracks(artistName, maxTracks);
    if (!canonicalTitles || canonicalTitles.length === 0) return { added: 0 };

    const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:5173';
    let addedCount = 0;

    for (const title of canonicalTitles) {
        try {
            // Check if track already exists in catalog
            const { data: exist } = await supabase
                .from('tracks')
                .select('id')
                .ilike('artist', artistName)
                .ilike('title', title)
                .limit(1);

            if (exist && exist.length > 0) continue;

            // Resolve zero-quota YouTube video ID
            const zqUrl = `${baseUrl}/api/resolve-track?artist=${encodeURIComponent(artistName)}&title=${encodeURIComponent(title)}`;
            const zqRes = await apiFetch(zqUrl);
            if (!zqRes.ok) continue;

            const zqData = await zqRes.json();
            if (!zqData.videoId || zqData.videoId.length !== 11) continue;

            // Prevent duplicate video ID in tracks table
            const { data: existVid } = await supabase
                .from('tracks')
                .select('id')
                .eq('youtube_video_id', zqData.videoId)
                .limit(1);

            if (existVid && existVid.length > 0) continue;

            const resolvedGenre = normalizeGenre(primaryGenreId, artistName, title);

            const { error: insertErr } = await supabase
                .from('tracks')
                .insert({
                    title: title,
                    artist: artistName,
                    artist_id: artistId || null,
                    primary_genre_id: resolvedGenre,
                    youtube_video_id: zqData.videoId,
                    source: 'artist_inflation:playlist'
                });

            if (!insertErr) {
                addedCount++;
                try {
                    await supabase.from('local_metadata').insert({
                        artist: artistName,
                        track_name: title,
                        genre: resolvedGenre,
                        source: 'artist_inflation:playlist'
                    });
                } catch (e) {}
            }
        } catch (err) {
            console.warn(`[Ingester] Failed resolving inflated track "${title}" for ${artistName}:`, err.message);
        }
    }

    // artists.track_count is maintained by the trg_update_artist_track_count trigger on tracks.

    return { added: addedCount };
}

/**
 * Ingests playlist tracks into Supabase (both public.tracks and public.artists),
 * fully pre-mapped with 11-char youtube_video_id for immediate zero-quota playback.
 * On-the-spot inflates any new musical artists with canonical catalog tracks.
 */
export async function ingestPlaylistTracks({ tracks, primaryGenreId, sourceName = 'youtube_playlist', onProgress, inflateNewArtists = true }) {
    if (!tracks || tracks.length === 0) {
        return { total: 0, newlyAdded: 0, duplicates: 0, errorCount: 0, inflatedArtistsCount: 0, inflatedTracksCount: 0 };
    }

    const total = tracks.length;
    let newlyAdded = 0;
    let duplicates = 0;
    let errorCount = 0;
    let inflatedArtistsCount = 0;
    let inflatedTracksCount = 0;

    const BATCH_SIZE = 25;

    for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = tracks.slice(i, i + BATCH_SIZE);
        const batchVideoIds = batch.map(t => t.videoId).filter(id => id && id.length === 11);

        try {
            // 1. Check existing tracks to prevent duplicates
            const { data: existingTracks } = await supabase
                .from('tracks')
                .select('youtube_video_id')
                .in('youtube_video_id', batchVideoIds);

            const existingSet = new Set((existingTracks || []).map(t => t.youtube_video_id));

            // Filter new tracks
            const newTracks = batch.filter(t => !existingSet.has(t.videoId));
            duplicates += (batch.length - newTracks.length);

            if (newTracks.length > 0) {
                // 2. Ensure artists exist in public.artists table
                const artistNames = [...new Set(newTracks.map(t => t.artist).filter(a => a && a !== 'Unknown Artist'))];
                const artistIdMap = {};

                if (artistNames.length > 0) {
                    const { data: existingArtists } = await supabase
                        .from('artists')
                        .select('id, name')
                        .in('name', artistNames);

                    (existingArtists || []).forEach(a => {
                        artistIdMap[a.name] = a.id;
                    });

                    const missingArtists = artistNames.filter(name => !artistIdMap[name]);
                    if (missingArtists.length > 0) {
                        const artistInserts = missingArtists.map(name => ({
                            name,
                            slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
                            primary_genre_id: primaryGenreId,
                            track_count: 1
                        }));

                        const { data: insertedArtists } = await supabase
                            .from('artists')
                            .insert(artistInserts)
                            .select('id, name');

                        (insertedArtists || []).forEach(a => {
                            artistIdMap[a.name] = a.id;
                        });

                        // 3. On-the-spot inflation for newly introduced artists!
                        if (inflateNewArtists) {
                            for (const a of (insertedArtists || [])) {
                                if (isInflateCandidate(a.name)) {
                                    try {
                                        const inflRes = await inflateNewArtistOnTheSpot({
                                            artistName: a.name,
                                            artistId: a.id,
                                            primaryGenreId,
                                            maxTracks: 8,
                                            onStatus: (msg) => {
                                                if (onProgress) {
                                                    onProgress({
                                                        current: Math.min(i + BATCH_SIZE, total),
                                                        total,
                                                        newlyAdded,
                                                        duplicates,
                                                        errorCount,
                                                        statusMessage: msg,
                                                        inflatedArtistsCount,
                                                        inflatedTracksCount
                                                    });
                                                }
                                            }
                                        });
                                        if (inflRes.added > 0) {
                                            inflatedArtistsCount++;
                                            inflatedTracksCount += inflRes.added;
                                        }
                                    } catch (inflErr) {
                                        console.warn(`[Ingester] Inflation non-fatal error for ${a.name}:`, inflErr.message);
                                    }
                                }
                            }
                        }
                    }
                }

                // 4. Insert into public.tracks table with per-track genre normalization & AI tagging
                const trackInserts = newTracks.map(t => {
                    const resolvedGenre = normalizeGenre(primaryGenreId, t.artist, t.title);
                    const resolvedSource = t.isAi ? `${sourceName}:ai` : sourceName;
                    return {
                        title: t.title,
                        artist: t.artist,
                        artist_id: artistIdMap[t.artist] || null,
                        primary_genre_id: resolvedGenre,
                        youtube_video_id: t.videoId,
                        source: resolvedSource
                    };
                });

                const { error: trackInsertError } = await supabase
                    .from('tracks')
                    .insert(trackInserts);

                if (trackInsertError) {
                    console.error('[Ingester] Track insert error:', trackInsertError);
                    errorCount += newTracks.length;
                } else {
                    newlyAdded += newTracks.length;

                    // 5. Also insert into public.local_metadata so Dashboard cloudCount immediately reflects it!
                    const metaInserts = newTracks.map(t => {
                        const resolvedGenre = normalizeGenre(primaryGenreId, t.artist, t.title);
                        const resolvedSource = t.isAi ? `${sourceName}:ai` : sourceName;
                        return {
                            artist: t.artist,
                            track_name: t.title,
                            genre: resolvedGenre,
                            source: resolvedSource
                        };
                    });

                    try {
                        await supabase.from('local_metadata').insert(metaInserts);
                    } catch (e) {
                        console.warn('[Ingester] local_metadata sync non-fatal warning:', e);
                    }
                }
            }
        } catch (err) {
            console.error('[Ingester] Batch processing exception:', err);
            errorCount += batch.length;
        }

        if (onProgress) {
            onProgress({
                current: Math.min(i + BATCH_SIZE, total),
                total,
                newlyAdded,
                duplicates,
                errorCount,
                inflatedArtistsCount,
                inflatedTracksCount
            });
        }
    }

    return { total, newlyAdded, duplicates, errorCount, inflatedArtistsCount, inflatedTracksCount };
}
