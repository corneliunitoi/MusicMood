import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { normalizeGenre, ARTIST_CANONICAL_GENRES } from '../src/services/genreNormalizer.js';
import { fetchMusicBrainzArtistGenres } from '../src/services/musicBrainzService.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

// Parse CLI flags
const isApply = process.argv.includes('--apply');
const isDryRun = !isApply;

/**
 * Queries iTunes Search API for song genre consensus and metadata sanity
 */
async function queryITunesConsensus(artist, title) {
    try {
        const query = `${artist} ${title}`.trim();
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'MusicMood/1.0.0 (contact@musicmood.local)' }
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.results || data.results.length === 0) return null;

        const results = data.results;
        
        // Count genre frequencies
        const genreCounts = {};
        for (const item of results) {
            const raw = item.primaryGenreName;
            if (!raw) continue;
            const norm = normalizeGenre(raw, item.artistName, item.trackName);
            if (norm) {
                genreCounts[norm] = (genreCounts[norm] || 0) + 1;
            }
        }

        // Find top genre by consensus
        let topGenre = null;
        let maxVotes = 0;
        for (const [g, count] of Object.entries(genreCounts)) {
            // Prioritize specific subgenres over generic 'rock' or 'pop' when tied
            if (count > maxVotes || (count === maxVotes && !['rock', 'pop', 'traditional_folk'].includes(g))) {
                maxVotes = count;
                topGenre = g;
            }
        }

        const topMatch = results[0];
        return {
            source: 'iTunes',
            topGenre,
            genreCounts,
            matchedArtist: topMatch.artistName,
            matchedTitle: topMatch.trackName,
            totalMatches: results.length
        };
    } catch (e) {
        // Network or parse error
    }
    return null;
}

/**
 * Queries Wikipedia page summary for artist description
 */
async function queryWikipedia(artist) {
    try {
        const clean = artist.replace(/\s+/g, '_');
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(clean)}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'MusicMood/1.0.0 (contact@musicmood.local)' }
        });
        if (!res.ok) return null;
        const data = await res.json();
        return {
            source: 'Wikipedia',
            extract: `${data.description || ''} ${data.extract || ''}`.trim()
        };
    } catch (e) {
        // Fallback safely
    }
    return null;
}

async function resolveFlags() {
    console.log("=================================================");
    console.log("🏷️  MusicMood Flagged Track Classification Resolver");
    console.log(`   Mode: ${isApply ? '🚀 APPLY CHANGES (Live Update)' : '🔍 DRY RUN (Audit Only)'}`);
    console.log("=================================================\n");

    // 1. Fetch pending flags
    const { data: flags, error: flagErr } = await supabase
        .from('track_genre_flags')
        .select('*, tracks(*)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (flagErr) {
        console.error("❌ Error fetching pending flags:", flagErr.message);
        return;
    }

    if (!flags || flags.length === 0) {
        console.log("✨ No pending track flags found! All catalogs are clean.\n");
        return;
    }

    console.log(`📋 Found ${flags.length} pending track misclassification flag(s):\n`);

    let resolvedCount = 0;
    let inconclusiveCount = 0;

    for (const flag of flags) {
        const track = flag.tracks;
        if (!track) {
            console.warn(`⚠️ Flag ${flag.id}: Track record not found in database.`);
            continue;
        }

        console.log(`-------------------------------------------------------------------`);
        console.log(`🎵 Track in Catalog: "${track.title}" by ${track.artist}`);
        console.log(`   ID: ${track.id}`);
        console.log(`   Current Primary Genre: [${track.primary_genre_id || flag.current_genre_id || 'unknown'}]`);
        if (flag.notes) console.log(`   User Note: "${flag.notes}"`);
        if (flag.suggested_genre_id) console.log(`   User Suggestion: [${flag.suggested_genre_id}]`);

        // Check for inversion (e.g. "Carlos Montoya" stored in title, "Malague a" stored in artist)
        let artistToSearch = track.artist;
        let titleToSearch = track.title;
        let isInverted = false;

        let iTunesData = await queryITunesConsensus(artistToSearch, titleToSearch);

        // Detect if artist was stored in title
        if (iTunesData && iTunesData.matchedArtist) {
            const matchedA = iTunesData.matchedArtist.toLowerCase().trim();
            const trackT = (track.title || '').toLowerCase().trim();
            const trackA = (track.artist || '').toLowerCase().trim();

            if (matchedA.includes(trackT) || trackT.includes(matchedA)) {
                if (!matchedA.includes(trackA)) {
                    isInverted = true;
                    artistToSearch = iTunesData.matchedArtist;
                    titleToSearch = iTunesData.matchedTitle || track.artist;
                    console.log(`   🔄 Detected Inverted Metadata! Healing Artist="${artistToSearch}", Title="${titleToSearch}"`);
                }
            }
        }

        // If no match with current order, try querying swapped
        if (!iTunesData) {
            const swappedData = await queryITunesConsensus(titleToSearch, artistToSearch);
            if (swappedData) {
                iTunesData = swappedData;
                isInverted = true;
                artistToSearch = swappedData.matchedArtist || track.title;
                titleToSearch = swappedData.matchedTitle || track.artist;
                console.log(`   🔄 Detected Inverted Metadata! Healing Artist="${artistToSearch}", Title="${titleToSearch}"`);
            }
        }

        // 2. Check MusicBrainz for artist
        let mbResult = null;
        try {
            mbResult = await fetchMusicBrainzArtistGenres(artistToSearch);
        } catch (e) {}

        // 3. Resolve suggested genre
        let candidateGenre = null;
        let confidenceSource = null;

        // Check canonical artist catalog first
        const canonical = ARTIST_CANONICAL_GENRES[artistToSearch?.toLowerCase()?.trim()];
        if (canonical) {
            candidateGenre = canonical;
            confidenceSource = 'Canonical Artist Map';
        }

        // Check iTunes consensus result
        if (!candidateGenre && iTunesData?.topGenre) {
            candidateGenre = iTunesData.topGenre;
            const voteStr = Object.entries(iTunesData.genreCounts).map(([g, c]) => `${g}:${c}`).join(', ');
            confidenceSource = `iTunes Consensus (${voteStr})`;
        }

        // Check MusicBrainz result
        if (!candidateGenre && mbResult?.primary_genre_id && mbResult.primary_genre_id !== track.primary_genre_id) {
            candidateGenre = mbResult.primary_genre_id;
            confidenceSource = `MusicBrainz (${mbResult.tags?.slice(0, 3)?.join(', ') || 'Tags'})`;
        }

        // Check Wikipedia extract
        if (!candidateGenre) {
            const wiki = await queryWikipedia(artistToSearch);
            if (wiki?.extract) {
                const normalized = normalizeGenre(wiki.extract, artistToSearch, titleToSearch);
                if (normalized && normalized !== track.primary_genre_id) {
                    candidateGenre = normalized;
                    confidenceSource = 'Wikipedia Bio Analysis';
                }
            }
        }

        // Check user suggestion if verified by any secondary tag
        if (!candidateGenre && flag.suggested_genre_id && flag.suggested_genre_id !== track.primary_genre_id) {
            candidateGenre = flag.suggested_genre_id;
            confidenceSource = 'User Suggestion';
        }

        if (candidateGenre) {
            console.log(`   🎯 Verified Consensus: [${candidateGenre}] (via ${confidenceSource})`);

            if (isApply) {
                // Update track in public.tracks
                const trackUpdates = {
                    primary_genre_id: candidateGenre,
                    updated_at: new Date().toISOString()
                };
                if (isInverted) {
                    trackUpdates.artist = artistToSearch;
                    trackUpdates.title = titleToSearch;
                }

                const { error: updateTrackErr } = await supabase
                    .from('tracks')
                    .update(trackUpdates)
                    .eq('id', track.id);

                if (updateTrackErr) {
                    console.error(`   ❌ Failed to update track: ${updateTrackErr.message}`);
                    continue;
                }

                // Remove flag record from database after healing
                const { error: deleteFlagErr } = await supabase
                    .from('track_genre_flags')
                    .delete()
                    .eq('id', flag.id);

                if (deleteFlagErr) {
                    console.warn(`   ⚠️ Track updated but failed to remove flag: ${deleteFlagErr.message}`);
                } else {
                    console.log(`   🩹 [HEALED & REMOVED] Updated track to [${candidateGenre}] and removed flag!`);
                    if (isInverted) {
                        console.log(`   ✨ [REPAIRED METADATA] Fixed artist to "${artistToSearch}" and title to "${titleToSearch}"`);
                    }
                    resolvedCount++;
                }
            } else {
                console.log(`   ℹ️ [DRY RUN] Would update track to [${candidateGenre}] and resolve flag.`);
                if (isInverted) {
                    console.log(`   ℹ️ [DRY RUN] Would also repair artist to "${artistToSearch}" and title to "${titleToSearch}"`);
                }
                resolvedCount++;
            }
        } else {
            console.log(`   ⚠️ Inconclusive: Secondary sources did not provide high-confidence alternative.`);
            inconclusiveCount++;
        }
    }

    console.log(`\n=================================================`);
    console.log(`Summary:`);
    console.log(`   • Resolvable: ${resolvedCount}`);
    console.log(`   • Inconclusive: ${inconclusiveCount}`);
    console.log(`   • Total Processed: ${flags.length}`);
    if (isDryRun && resolvedCount > 0) {
        console.log(`\n💡 To apply these changes to the live database, run:`);
        console.log(`   node scripts/resolveFlaggedTracks.js --apply`);
    }
    console.log(`=================================================\n`);
}

resolveFlags().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
