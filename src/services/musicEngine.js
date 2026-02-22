const GENRE_HIERARCHY = {
    "Pop": { keywords: ["pop", "hits", "top 40", "chart"], sub: { "K-Pop": ["kpop", "korean"], "Indie Pop": ["indie pop"], "Adult Contemporary": ["adult contemporary"], "Mandopop": ["mandopop"] }, exclude: ["rock", "punk", "metal"] },
    "Rock": { keywords: ["rock", "grunge"], sub: { "Metal": ["metal", "heavy metal"], "Alternative": ["alt rock", "alternative", "alt"], "Punk": ["punk"], "Classic Rock": ["classic rock"], "Indie Rock": ["indie rock"], "Goth Rock": ["goth"], "Blues-Rock": ["blues-rock", "blues rock"], "Industrial": ["industrial"] }, exclude: [] },
    "Hip-Hop/Rap": { keywords: ["hip hop", "hip-hop", "rap", "r&b"], sub: { "Trap": ["trap"], "Drill": ["drill"], "R&B/Soul": ["r&b", "soul"] }, exclude: ["rock", "country"] },
    "Electronic/Dance": { keywords: ["edm", "dance", "electronic"], sub: { "House": ["house"], "Techno": ["techno"], "Trance": ["trance"], "Dubstep": ["dubstep"], "Avantgarde": ["avantgarde", "avant-garde"] }, exclude: ["acoustic", "classical"] },
    "Lofi/Chill": { keywords: ["lofi", "lo-fi", "chill", "relax", "vibes"], sub: { "Study": ["study"], "Ambient": ["ambient"], "Acoustic": ["acoustic"] }, exclude: ["rock", "punk", "metal", "trap", "house", "techno", "dubstep"] },
    "Classical/Instrumental": { keywords: ["classical", "instrumental", "orchestra", "baroque"], sub: { "Piano": ["piano"], "Violin": ["violin"], "Strings": ["strings"], "Cinematic": ["cinematic", "soundtrack"], "Opera": ["opera", "aria", "vocal", "tenor", "soprano"], "Baroque": ["baroque"] }, exclude: ["rock", "metal", "rap", "pop", "trap", "edm"] },
    "Jazz/Blues": { keywords: ["jazz", "blues"], sub: { "Soul": ["soul", "gospel"], "Funk": ["funk"], "Classic Blues": ["classic blues"], "Blues Gospel": ["blues gospel"] }, exclude: ["rock", "metal", "punk", "trap"] },
    "Country/Folk": { keywords: ["country", "folk", "americana"], sub: { "Traditional Country": ["traditional country"] }, exclude: ["rock", "metal", "rap", "electronics"] },
    "Latin": { keywords: ["latin", "reggaeton", "salsa", "bachata", "cumbia"], sub: {}, exclude: [] },
    "Gospel/Religious": { keywords: ["gospel", "christian", "spiritual", "worship"], sub: { "Christian Pop": ["christian pop"] }, exclude: ["metal", "death", "punk"] }
};

import { fetchPlaylistItems } from './youtube';
import { enrichTrackMetadata } from './metadataEnricher';
import { supabase } from './supabaseService';

export const getSupabaseTracksForGenre = async (bucketGenre, limit = 200) => {
    let query = supabase.from('local_metadata').select('*').limit(limit);

    if (bucketGenre) {
        const conditions = [];

        // 1. Add the parts of the bucket name itself (e.g. "Lofi/Chill" -> "Lofi", "Chill")
        const parts = bucketGenre.split('/');
        parts.forEach(p => {
            if (p) conditions.push(`genre.ilike.%${p}%`);
        });

        // 2. Add subgenres if we have them in the hierarchy mapped at the top of the file
        const hierarchyData = GENRE_HIERARCHY[bucketGenre];
        if (hierarchyData && hierarchyData.sub) {
            Object.keys(hierarchyData.sub).forEach(subGenreName => {
                conditions.push(`genre.ilike.%${subGenreName}%`);
                // Also optionally add keywords if feeling aggressive, but subgenre names usually cover it
                hierarchyData.sub[subGenreName].forEach(kw => {
                    conditions.push(`genre.ilike.%${kw}%`);
                });
            });
        }

        if (conditions.length > 0) {
            query = query.or(conditions.join(','));
        } else {
            query = query.ilike('genre', `%${bucketGenre}%`);
        }
    }

    const { data, error } = await query;
    if (error) {
        console.error("Supabase query error:", error);
        return [];
    }

    let results = data || [];

    // Filter out excludes explicitly
    if (bucketGenre && GENRE_HIERARCHY[bucketGenre] && GENRE_HIERARCHY[bucketGenre].exclude) {
        const excludes = GENRE_HIERARCHY[bucketGenre].exclude;
        results = results.filter(track => {
            const trackGenreStr = (track.genre || "").toLowerCase();
            return !excludes.some(ex => trackGenreStr.includes(ex));
        });
    }

    // Force exclude heavy bands from chill/soft vibes just in case they bleed through via "Pop Rock" mapping
    if (bucketGenre === 'Lofi/Chill' || bucketGenre === 'Classical/Instrumental') {
        results = results.filter(track => {
            const artist = (track.artist || "").toLowerCase();
            const genre = (track.genre || "").toLowerCase();
            return !artist.includes('shining') && !genre.includes('industrial') && !genre.includes('metal') && !genre.includes('rock');
        });
    }

    return results;
};

export const buildTasteProfile = async (playlists, token) => {
    if (!playlists || playlists.length === 0 || !token) return null;

    let totalHits = 0;
    const genreStats = {};
    const enrichedPlaylists = [];

    // Iterate through all fetched playlists instead of arbitrarily capping
    for (const playlist of playlists) {
        if (!playlist.id) continue;

        let allTitlesToScan = [];
        if (playlist.title) allTitlesToScan.push(playlist.title);

        try {
            const items = await fetchPlaylistItems(playlist.id, token, 50);
            items.forEach(item => {
                if (item.title) allTitlesToScan.push(item.title);
            });
        } catch (error) {
            console.error(`Failed to fetch items for playlist ${playlist.id}:`, error);
        }

        const playlistGenreStats = {};

        // Process enrichment for this playlist
        const enrichmentPromises = allTitlesToScan.map(title => enrichTrackMetadata(title));
        const enrichmentResults = await Promise.all(enrichmentPromises);

        enrichmentResults.forEach(result => {
            if (result.success && result.genre) {
                totalHits++;

                // Normalize genre string (trim, title-case) to handle "blues" vs "Blues" etc.
                const normalizedGenre = result.genre
                    ? result.genre.trim().replace(/\b\w/g, c => c.toUpperCase())
                    : null;

                // Filter out junk genres (album titles leaking in via iTunes metadata)
                const JUNK_PATTERN = /complete recordings|album|vinyl|pack|\d{2,}\s*bit|vol\s*\d/i;
                if (!normalizedGenre || JUNK_PATTERN.test(normalizedGenre)) return;

                // Map specific iTunes genres to our main buckets
                const itunesMap = {
                    // Pop
                    "Pop": "Pop", "K-Pop": "Pop", "Singer/Songwriter": "Pop",
                    "Adult Contemporary": "Pop", "Mandopop": "Pop", "Indie Pop": "Pop",
                    // Rock
                    "Rock": "Rock", "Alternative": "Rock", "Metal": "Rock", "Punk": "Rock", "Hard Rock": "Rock",
                    "Classic Rock": "Rock", "Indie Rock": "Rock", "Goth Rock": "Rock",
                    "Blues-Rock": "Rock", "Blues Rock": "Rock", "Industrial": "Rock",
                    // Hip-Hop/R&B
                    "Hip-Hop/Rap": "Hip-Hop/Rap", "Hip-Hop": "Hip-Hop/Rap", "Rap": "Hip-Hop/Rap",
                    "R&B/Soul": "Hip-Hop/Rap", "R&B": "Hip-Hop/Rap",
                    // Electronic
                    "Dance": "Electronic/Dance", "Electronic": "Electronic/Dance", "House": "Electronic/Dance",
                    "Techno": "Electronic/Dance", "Trance": "Electronic/Dance", "Dubstep": "Electronic/Dance",
                    "Avantgarde": "Electronic/Dance", "Avant-Garde": "Electronic/Dance",
                    // Classical
                    "Classical": "Classical/Instrumental", "Instrumental": "Classical/Instrumental",
                    "Soundtrack": "Classical/Instrumental", "Baroque": "Classical/Instrumental",
                    "Opera": "Classical/Instrumental", "Vocal": "Classical/Instrumental",
                    // Jazz/Blues
                    "Jazz": "Jazz/Blues", "Blues": "Jazz/Blues", "Soul": "Jazz/Blues",
                    "Classic Blues": "Jazz/Blues", "Blues Gospel": "Jazz/Blues",
                    // Country
                    "Country": "Country/Folk", "Folk": "Country/Folk", "Traditional Country": "Country/Folk",
                    // Latin
                    "Latin": "Latin", "Reggaeton": "Latin", "Salsa": "Latin",
                    "Música Mexicana": "Latin", "Regional Mexican": "Latin",
                    // Gospel
                    "Gospel": "Gospel/Religious", "Christian": "Gospel/Religious",
                    "Christian Pop": "Gospel/Religious", "Children'S Music": "Gospel/Religious"
                };

                const mainGenre = itunesMap[result.genre] || result.genre;

                if (!genreStats[mainGenre]) {
                    genreStats[mainGenre] = { hits: 0, subStats: {} };
                }
                genreStats[mainGenre].hits++;

                if (!playlistGenreStats[mainGenre]) {
                    playlistGenreStats[mainGenre] = 0;
                }
                playlistGenreStats[mainGenre]++;

                genreStats[mainGenre].subStats[result.genre] = (genreStats[mainGenre].subStats[result.genre] || 0) + 1;
            }
        });

        // Calculate dominant genre for this playlist
        let dominantGenre = null;
        let maxHits = 0;
        for (const [genre, hits] of Object.entries(playlistGenreStats)) {
            if (hits > maxHits) {
                maxHits = hits;
                dominantGenre = genre;
            }
        }

        enrichedPlaylists.push({
            ...playlist,
            dominantGenre: dominantGenre
        });
    }

    // Phase 12: Merge Local Offline Library Data
    try {
        const localStatsRes = await fetch('/local_library_stats.json');
        if (localStatsRes.ok) {
            const localData = await localStatsRes.json();
            if (localData && localData.genreStats) {
                totalHits += (localData.totalHits || 0);

                for (const [mainGenre, data] of Object.entries(localData.genreStats)) {
                    if (!genreStats[mainGenre]) {
                        genreStats[mainGenre] = { hits: 0, subStats: {} };
                    }
                    genreStats[mainGenre].hits += data.hits;

                    if (data.subStats) {
                        for (const [subName, subHits] of Object.entries(data.subStats)) {
                            genreStats[mainGenre].subStats[subName] = (genreStats[mainGenre].subStats[subName] || 0) + subHits;
                        }
                    }
                }
                console.log("Successfully merged Local Library stats into Tone Profile.");
            }
        }
    } catch (e) {
        console.log("No local library stats found or failed to fetch. Skipping offline merge.");
    }

    if (totalHits === 0) return null;

    // Build Graph Data
    const nodes = [];
    const edges = [];
    let yPos = 0;

    // Root Node
    nodes.push({ id: 'user', data: { label: 'Your Taste' }, position: { x: 0, y: 150 }, type: 'input' });

    // Sort top main genres and take up to 10
    const topGenresKeys = Object.keys(genreStats)
        .sort((a, b) => genreStats[b].hits - genreStats[a].hits)
        .slice(0, 10);

    const statsStrings = [];

    topGenresKeys.forEach((genre, index) => {
        const percentage = Math.round((genreStats[genre].hits / totalHits) * 100);
        statsStrings.push(`${percentage}% ${genre}`);

        const genreNodeId = `genre_${index}`;
        nodes.push({ id: genreNodeId, data: { label: genre }, position: { x: 250, y: yPos } });
        edges.push({ id: `e-user-${genreNodeId}`, source: 'user', target: genreNodeId, animated: true });

        // Add sub-genres
        const subGenres = Object.keys(genreStats[genre].subStats);
        let subYOffset = yPos - (subGenres.length * 20); // Center subs

        subGenres.forEach((sub, subIndex) => {
            const subNodeId = `sub_${index}_${subIndex}`;
            nodes.push({ id: subNodeId, data: { label: sub }, position: { x: 500, y: subYOffset } });
            edges.push({ id: `e-${genreNodeId}-${subNodeId}`, source: genreNodeId, target: subNodeId });
            subYOffset += 50;
        });

        yPos += Math.max(100, subGenres.length * 60);
    });

    return {
        topGenres: topGenresKeys,
        graphData: { nodes, edges },
        statsText: statsStrings.join(' • '),
        enrichedPlaylists: enrichedPlaylists
    };
};

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * Discovers a new playlist tailored to the mood and the user's taste profile.
 * @param {Object} mood - The selected mood object containing searchContext.
 * @param {Array} tasteProfile - Array of detected genres (e.g. ["Rock", "Lofi/Chill"]).
 * @param {string} token - Google OAuth access token.
 * @returns {string} - The YouTube Playlist ID to play.
 */
export const discoverPlaylistForMood = async (mood, tasteProfile, token, userPlaylists = []) => {
    if (!mood || !mood.searchContext) throw new Error("Invalid mood provided for discovery.");

    let query = mood.searchContext; // Base query context (e.g., "workout intense")
    let matchedGenre = null;

    // Phase 11: Context-Aware Genre Matching
    if (mood.compatibleGenres && mood.defaultGenre) {
        // Find if the user's taste profile intersects with the mood's compatible genres
        const userMatches = tasteProfile ? tasteProfile.filter(g => mood.compatibleGenres.includes(g)) : [];

        let selectedRawGenre;
        if (userMatches.length > 0) {
            // They like a genre compatible with this mood. Pick a random matching genre to keep it fresh
            selectedRawGenre = userMatches[Math.floor(Math.random() * userMatches.length)];
        } else {
            // Their taste profile doesn't fit this mood at all. Override to protect the vibe.
            selectedRawGenre = mood.defaultGenre;
        }

        matchedGenre = selectedRawGenre.split('/')[0];
        query = `${query} ${matchedGenre} mix`;
        console.log(`[Discovery] Mood: ${mood.id} | Context-Aware Overrides: ${userMatches.length === 0} | Locked Genre: ${selectedRawGenre}`);
    } else {
        // Legacy fallback
        if (tasteProfile && tasteProfile.length > 0) {
            const randomGenre = tasteProfile[Math.floor(Math.random() * tasteProfile.length)];
            matchedGenre = randomGenre.split('/')[0];
            query = `${query} ${matchedGenre} mix`;
        } else {
            query = `${query} playlist`;
        }
    }

    // 1. Try to find a match in the user's OWN playlists first
    if (userPlaylists && userPlaylists.length > 0) {
        const moodKeywords = mood.searchContext.toLowerCase().split(' ');
        const genreKeywords = matchedGenre ? matchedGenre.toLowerCase().split(' ') : [];
        const allKeywords = [...moodKeywords, ...genreKeywords];

        // Rank playlists by how many keywords they match
        const scoredPlaylists = userPlaylists.map(pl => {
            const titleLower = pl.title.toLowerCase();
            let score = 0;
            allKeywords.forEach(kw => {
                if (kw && titleLower.includes(kw)) score++;
            });

            // Massive boost for actual content match
            if (pl.dominantGenre && matchedGenre) {
                const baseDominant = pl.dominantGenre.split('/')[0];
                if (baseDominant === matchedGenre) {
                    score += 50; // Huge boost to ensure content always wins
                }
            }

            return { playlist: pl, score };
        }).filter(item => item.score > 0);

        if (scoredPlaylists.length > 0) {
            // Sort by highest score
            scoredPlaylists.sort((a, b) => b.score - a.score);

            // Pick a random playlist from the top scorers (handling ties)
            const maxScore = scoredPlaylists[0].score;
            const topScorers = scoredPlaylists.filter(item => item.score === maxScore);
            const selected = topScorers[Math.floor(Math.random() * topScorers.length)].playlist;

            console.log("Discovery Engine found PERSONAL playlist match:", selected.title);

            return {
                id: selected.id,
                title: selected.title,
                thumbnail: selected.thumbnail,
                channelTitle: "Your Library",
                matchedGenre: matchedGenre || "Personal Mix"
            };
        }
    }

    const authHeaders = token === 'guest' ? {} : { Authorization: `Bearer ${token}` };
    const authParams = token === 'guest' ? `&key=${import.meta.env.VITE_YOUTUBE_API_KEY}` : '';

    // 2. Try to build a mix from the offline Supabase database
    const localLibTracks = await getSupabaseTracksForGenre(matchedGenre);
    if (localLibTracks && localLibTracks.length > 0) {
        console.log(`Building mix from local library: ${localLibTracks.length} tracks found for ${matchedGenre}`);

        // Pick top tracks, shuffle them and limit to 3 to aggressively save YouTube quota 
        // (1 search = 100 quota units! 10 tracks = 1,000 quota per click)
        const shuffled = localLibTracks.sort(() => 0.5 - Math.random()).slice(0, 3);
        const resolvedVideoIds = [];
        let firstThumbnail = null;

        // Sequence lookups so we don't hammer the API in parallel and hit limits
        for (const track of shuffled) {
            try {
                const trackQuery = `${track.artist} ${track.track_name} official audio`;
                const ytRes = await fetch(
                    `${YOUTUBE_API_BASE}/search?part=snippet&type=video&videoCategoryId=10&videoSyndicated=true&q=${encodeURIComponent(trackQuery)}&maxResults=1${authParams}`,
                    { headers: authHeaders }
                );
                const ytData = await ytRes.json();

                if (ytData.items && ytData.items.length > 0) {
                    resolvedVideoIds.push(ytData.items[0].id.videoId);
                    if (!firstThumbnail) {
                        firstThumbnail = ytData.items[0].snippet.thumbnails.high?.url || ytData.items[0].snippet.thumbnails.default?.url;
                    }
                }
            } catch (e) {
                console.warn(`Could not resolve local track to YouTube: ${track.artist} - ${track.track_name}`);
            }
        }

        if (resolvedVideoIds.length > 0) {
            return {
                id: resolvedVideoIds.join(','),
                title: `${matchedGenre || mood.label} Local Mix`,
                thumbnail: firstThumbnail,
                channelTitle: 'Your Server',
                matchedGenre: matchedGenre,
                type: 'video_list',
                firstVideoId: resolvedVideoIds[0]
            };
        }
    }

    // 3. Fallback to High-Quality Video Search
    // We search for videos in the Music category (10) to avoid junk playlists
    const hqQuery = `${query} official audio`;
    console.log("Discovery Engine searching YouTube for Videos:", hqQuery);

    let data;
    try {
        const response = await fetch(
            `${YOUTUBE_API_BASE}/search?part=snippet&type=video&videoCategoryId=10&videoSyndicated=true&q=${encodeURIComponent(hqQuery)}&maxResults=15${authParams}`,
            {
                headers: authHeaders,
            }
        );
        data = await response.json();
    } catch (e) {
        console.error("YouTube Search Fetch Exception:", e);
    }

    if (!data || !data.items || data.items.length === 0) {
        if (data && data.error) {
            console.error("YouTube API Rejected Request:", data.error);
        }

        let titleFallback = `${matchedGenre || mood.label} Safe Mix`;

        // Final ultimate mock fallback when discovery fails
        console.log("Resorting to final mock fallback for UI demonstration.");
        return {
            id: '',
            title: `Error: YouTube API Key Blocked`,
            thumbnail: '',
            channelTitle: 'Your Google Cloud Project has limited requests. Please try again tomorrow.',
            matchedGenre: matchedGenre,
            type: 'video_list',
            firstVideoId: ''
        };
    }

    // Extract video IDs
    const videoIds = data.items.map(item => item.id.videoId);
    const mainVideo = data.items[0];

    return {
        id: videoIds.join(','),
        title: `${matchedGenre || mood.label} Mix`,
        thumbnail: mainVideo.snippet.thumbnails.high?.url || mainVideo.snippet.thumbnails.default?.url,
        channelTitle: 'High Quality Auto-Mix',
        matchedGenre: matchedGenre,
        type: 'video_list',
        firstVideoId: videoIds[0]
    };
};
