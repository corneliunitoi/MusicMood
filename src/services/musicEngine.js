const GENRE_HIERARCHY = {
    "Pop": { keywords: ["pop", "hits", "top 40", "chart"], sub: { "K-Pop": ["kpop", "korean"], "Indie Pop": ["indie pop"] } },
    "Rock": { keywords: ["rock", "grunge"], sub: { "Metal": ["metal", "heavy metal"], "Alternative": ["alt rock", "alternative", "alt"], "Punk": ["punk"], "Classic Rock": ["classic rock"] } },
    "Hip-Hop/Rap": { keywords: ["hip hop", "hip-hop", "rap", "r&b"], sub: { "Trap": ["trap"], "Drill": ["drill"] } },
    "Electronic/Dance": { keywords: ["edm", "dance", "electronic"], sub: { "House": ["house"], "Techno": ["techno"], "Trance": ["trance"], "Dubstep": ["dubstep"] } },
    "Lofi/Chill": { keywords: ["lofi", "lo-fi", "chill", "relax", "vibes"], sub: { "Study": ["study"], "Ambient": ["ambient"], "Acoustic": ["acoustic"] } },
    "Classical/Instrumental": { keywords: ["classical", "instrumental", "orchestra"], sub: { "Piano": ["piano"], "Violin": ["violin"], "Strings": ["strings"], "Cinematic": ["cinematic"], "Opera": ["opera", "aria", "vocal", "tenor", "soprano"] } },
    "Jazz/Blues": { keywords: ["jazz", "blues"], sub: { "Soul": ["soul"], "Funk": ["funk"] } },
    "Country/Folk": { keywords: ["country", "folk", "americana"], sub: {} },
    "Latin": { keywords: ["latin", "reggaeton", "salsa", "bachata", "cumbia"], sub: {} }
};

import { fetchPlaylistItems } from './youtube';
import { enrichTrackMetadata } from './metadataEnricher';

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

                // Try to map specific iTunes genres to our main buckets, or use directly
                const itunesMap = {
                    "Pop": "Pop", "K-Pop": "Pop", "Singer/Songwriter": "Pop",
                    "Rock": "Rock", "Alternative": "Rock", "Metal": "Rock", "Punk": "Rock", "Hard Rock": "Rock",
                    "Hip-Hop/Rap": "Hip-Hop/Rap", "Hip-Hop": "Hip-Hop/Rap", "Rap": "Hip-Hop/Rap", "R&B/Soul": "Hip-Hop/Rap",
                    "Dance": "Electronic/Dance", "Electronic": "Electronic/Dance", "House": "Electronic/Dance", "Techno": "Electronic/Dance",
                    "Classical": "Classical/Instrumental", "Instrumental": "Classical/Instrumental", "Soundtrack": "Classical/Instrumental",
                    "Jazz": "Jazz/Blues", "Blues": "Jazz/Blues", "Soul": "Jazz/Blues",
                    "Country": "Country/Folk", "Folk": "Country/Folk",
                    "Latin": "Latin", "Reggaeton": "Latin", "Salsa": "Latin", "Música Mexicana": "Latin", "Regional Mexican": "Latin"
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

    // Sort top main genres and take up to 5 instead of 3
    const topGenresKeys = Object.keys(genreStats)
        .sort((a, b) => genreStats[b].hits - genreStats[a].hits)
        .slice(0, 5);

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

    // 2. Fallback to generic YouTube Search
    console.log("Discovery Engine searching YouTube for:", query);

    const response = await fetch(
        `${YOUTUBE_API_BASE}/search?part=snippet&type=playlist&q=${encodeURIComponent(query)}&maxResults=5`,
        {
            headers: { Authorization: `Bearer ${token}` },
        }
    );

    if (!response.ok) {
        throw new Error('Failed to discover playlist from YouTube Search API');
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
        throw new Error("No playlists found for this mood.");
    }

    // Pick a random playlist from the top 5 results to ensure freshness even if they click the same mood
    const randomResult = data.items[Math.floor(Math.random() * data.items.length)];

    return {
        id: randomResult.id.playlistId,
        title: randomResult.snippet.title,
        thumbnail: randomResult.snippet.thumbnails.high?.url || randomResult.snippet.thumbnails.default?.url,
        channelTitle: randomResult.snippet.channelTitle,
        matchedGenre: matchedGenre
    };
};
