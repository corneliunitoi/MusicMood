import { supabase } from './supabaseService.js';
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
    const response = await fetch(url);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch playlist (Status: ${response.status})`);
    }
    const data = await response.json();
    return data;
}

/**
 * Ingests playlist tracks into Supabase (both public.tracks and public.artists),
 * fully pre-mapped with 11-char youtube_video_id for immediate zero-quota playback.
 */
export async function ingestPlaylistTracks({ tracks, primaryGenreId, sourceName = 'youtube_playlist', onProgress }) {
    if (!tracks || tracks.length === 0) {
        return { total: 0, newlyAdded: 0, duplicates: 0, errorCount: 0 };
    }

    const total = tracks.length;
    let newlyAdded = 0;
    let duplicates = 0;
    let errorCount = 0;

    const BATCH_SIZE = 25;

    for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = tracks.slice(i, i + BATCH_SIZE);
        const batchVideoIds = batch.map(t => t.videoId).filter(id => id && id.length === 11);

        try {
            // 1. Check existing tracks to prevent duplicates
            const { data: existingTracks, error: existError } = await supabase
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
                    }
                }

                // 3. Insert into public.tracks table with per-track genre normalization
                const trackInserts = newTracks.map(t => {
                    const resolvedGenre = normalizeGenre(primaryGenreId, t.artist, t.title);
                    return {
                        title: t.title,
                        artist: t.artist,
                        artist_id: artistIdMap[t.artist] || null,
                        primary_genre_id: resolvedGenre,
                        youtube_video_id: t.videoId,
                        source: sourceName
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

                    // 4. Also insert into public.local_metadata so Dashboard cloudCount immediately reflects it!
                    const metaInserts = newTracks.map(t => {
                        const resolvedGenre = normalizeGenre(primaryGenreId, t.artist, t.title);
                        return {
                            artist: t.artist,
                            track_name: t.title,
                            genre: resolvedGenre,
                            source: sourceName
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
                errorCount
            });
        }
    }

    return { total, newlyAdded, duplicates, errorCount };
}
