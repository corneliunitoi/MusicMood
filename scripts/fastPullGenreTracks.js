import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { GENRE_NODES } from '../src/services/tasteGraph.js';
import { isSongCandidate, normalizeGenre } from '../src/services/genreNormalizer.js';
import { resolveYouTubeTrack, resolveInnertubeTrack } from './resolveVideoIds.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

const headers = { 'User-Agent': 'MusicMood/1.0.0 ( contact@musicmood.local )' };

// Configuration
const MAX_TRACKS_PER_ARTIST = 3; // Strict diversity invariant
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Accurate MusicBrainz tag mapping for all 115 ontology genres
const GENRE_MB_TAGS = {
    // 1. Rock
    rock: 'rock',
    classic_rock: 'classic rock',
    alt_rock: 'alternative rock',
    indie_rock: 'indie rock',
    hard_rock: 'hard rock',
    punk_rock: 'punk rock',
    post_punk: 'post-punk',
    prog_rock: 'progressive rock',
    psychedelic_rock: 'psychedelic rock',
    grunge: 'grunge',
    post_rock: 'post-rock',
    math_rock: 'math rock',
    shoegaze: 'shoegaze',
    garage_rock: 'garage rock',

    // 2. Metal
    metal: 'metal',
    heavy_metal: 'heavy metal',
    thrash_metal: 'thrash metal',
    death_metal: 'death metal',
    black_metal: 'black metal',
    doom_metal: 'doom metal',
    prog_metal: 'progressive metal',
    power_metal: 'power metal',
    symphonic_metal: 'symphonic metal',
    nu_metal: 'nu metal',
    metalcore: 'metalcore',

    // 3. Electronic
    electronic: 'electronic',
    techno: 'techno',
    house: 'house',
    trance: 'trance',
    drum_and_bass: 'drum and bass',
    darksynth: 'darksynth',
    synthwave: 'synthwave',
    dubstep: 'dubstep',
    idm: 'idm',
    ambient_electronic: 'ambient techno',
    edm_mainstream: 'edm',

    // 4. Pop
    pop: 'pop',
    synth_pop: 'synthpop',
    dance_pop: 'dance-pop',
    indie_pop: 'indie pop',
    dream_pop: 'dream pop',
    art_pop: 'art pop',
    mainstream_pop: 'pop',
    traditional_pop: 'traditional pop',

    // 5. Hip-Hop
    hip_hop: 'hip hop',
    boom_bap: 'boom bap',
    lofi_hiphop: 'lo-fi hip hop',
    conscious_hiphop: 'conscious hip hop',
    trap_modern: 'trap',
    uk_drill: 'drill',
    underground_rap: 'underground hip hop',
    west_coast_rap: 'west coast hip hop',
    cloud_rap: 'cloud rap',

    // 6. R&B / Soul / Funk
    rnb_soul: 'soul',
    rnb: 'r&b',
    funk: 'funk',
    soul_funk: 'soul',
    classic_soul: 'soul',
    motown: 'motown',
    neo_soul: 'neo-soul',
    contemporary_rnb: 'contemporary r&b',
    quiet_storm: 'quiet storm',
    pfunk: 'p-funk',

    // 7. Jazz
    jazz: 'jazz',
    bebop_jazz: 'bebop',
    hard_bop: 'hard bop',
    cool_jazz: 'cool jazz',
    modal_jazz: 'modal jazz',
    free_jazz: 'free jazz',
    avant_jazz: 'avant-garde jazz',
    bossa_nova_jazz: 'bossa nova',
    fusion_jazz: 'jazz fusion',
    jazz_fusion: 'jazz fusion',
    smooth_jazz: 'smooth jazz',
    big_band: 'big band',

    // 8. Blues
    blues: 'blues',
    delta_blues: 'delta blues',
    chicago_blues: 'chicago blues',
    electric_blues: 'electric blues',
    blues_rock: 'blues rock',
    soul_blues: 'soul blues',

    // 9. Classical
    classical: 'classical',
    baroque: 'baroque',
    classical_period: 'classical period',
    romantic: 'romantic classical',
    neo_classical: 'neoclassical',
    opera: 'opera',
    chamber_music: 'chamber music',
    contemporary_classical: 'contemporary classical',
    cinematic_orchestral: 'soundtrack',

    // 10. Folk
    folk_acoustic: 'folk',
    acoustic_folk: 'folk',
    traditional_folk: 'traditional folk',
    contemporary_folk: 'contemporary folk',
    indie_folk: 'indie folk',
    celtic_folk: 'celtic',
    bluegrass: 'bluegrass',
    singer_songwriter: 'singer-songwriter',

    // 11. Country
    country: 'country',
    classic_country: 'classic country',
    outlaw_country: 'outlaw country',
    alt_country: 'alt-country',
    americana: 'americana',
    contemporary_country: 'country',

    // 12. Reggae & World
    world_reggae: 'reggae',
    roots_reggae: 'roots reggae',
    dub: 'dub',
    ska: 'ska',
    afrobeat: 'afrobeat',
    salsa: 'salsa',
    bossa_nova: 'bossa nova',
    flamenco: 'flamenco',

    // 13. Ambient & Chill
    ambient_chill: 'ambient',
    ambient: 'ambient',
    chill: 'chillout',
    chillout: 'chillout',
    drone: 'drone',
    new_age: 'new age',
    nature_soundscape: 'nature soundscape',

    // 14. Avant-Garde
    avant_garde: 'avant-garde',
    experimental_rock: 'experimental rock',
    noise: 'noise',
    industrial: 'industrial',
    musique_concrete: 'musique concrète'
};

/**
 * Loads existing tracks for a genre into an in-memory Set.
 * Returns { seenKeys: Set<"artist:::title">, seenVideoIds: Set<string>, existingCount: number }
 */
async function loadExistingGenreIndex(genreId) {
    const seenKeys = new Set();
    const seenVideoIds = new Set();
    let offset = 0;
    const PAGE_SIZE = 1000;
    let existingCount = 0;

    while (true) {
        const { data, error } = await supabase
            .from('tracks')
            .select('artist, title, youtube_video_id')
            .eq('primary_genre_id', genreId)
            .range(offset, offset + PAGE_SIZE - 1);

        if (error || !data || data.length === 0) break;

        for (const t of data) {
            existingCount++;
            if (t.artist && t.title) {
                seenKeys.add(`${t.artist.trim().toLowerCase()}:::${t.title.trim().toLowerCase()}`);
            }
            if (t.youtube_video_id) {
                seenVideoIds.add(t.youtube_video_id);
            }
        }

        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }

    return { seenKeys, seenVideoIds, existingCount };
}

/**
 * Fetches candidate recordings in batches of 100 from MusicBrainz.
 * Filters against in-memory seenKeys instantly without any DB calls or rate limits.
 */
async function fetchMusicBrainzBatchCandidates(genreTag, startingOffset, seenKeys, limit = 100) {
    const candidates = [];
    const query = `tag:"${genreTag}" AND status:official`;
    let currentOffset = startingOffset;
    let maxPages = 4; // Check up to 4 pages (400 recordings) per attempt

    while (candidates.length < 50 && maxPages > 0) {
        maxPages--;
        await sleep(1100); // Respect MusicBrainz 1 req/sec limit once per 100 candidates
        const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}&offset=${currentOffset}`;

        let recordings = [];
        try {
            const res = await fetch(url, { headers });
            if (res.status === 503 || res.status === 429) {
                console.warn(`   [MusicBrainz] Rate limited (${res.status}), retrying in 2.5s...`);
                await sleep(2500);
                maxPages++; // Don't burn a page attempt on rate limit
                continue;
            }
            if (res.ok) {
                const data = await res.json();
                recordings = data.recordings || [];
            } else {
                console.warn(`   [MusicBrainz] HTTP ${res.status}: ${res.statusText}`);
            }
        } catch (e) {
            console.warn(`   [MusicBrainz] Recording query error at offset ${currentOffset}:`, e.message);
            break;
        }

        if (recordings.length === 0) break;

        for (const rec of recordings) {
            const artist = rec['artist-credit']?.[0]?.name?.trim();
            const title = (rec.title || '').trim();
            const dur = rec.length ? Math.round(rec.length / 1000) : 0;

            if (!artist || !title) continue;
            if (/^(various artists|unknown|track [0-9]+)$/i.test(artist)) continue;
            if (dur < 75 || dur > 750) continue;
            if (/live|interview|remix|version|demo|tribute|karaoke/i.test(title)) continue;

            const check = isSongCandidate({ title, artist });
            if (!check.pass) continue;

            // Instant in-memory deduplication check (0ms)
            const key = `${artist.toLowerCase()}:::${title.toLowerCase()}`;
            if (seenKeys.has(key)) continue;

            // Mark key as seen in memory immediately
            seenKeys.add(key);

            candidates.push({
                artist,
                title,
                duration: dur,
                mbid: rec.id
            });
        }

        currentOffset += limit;
    }

    return { candidates, nextOffset: currentOffset };
}

/**
 * Pulls up to targetNewTracks for a single genre.
 */
export async function pullGenreTracks(genreId, targetNewTracks = 30) {
    const node = GENRE_NODES[genreId];
    if (!node) {
        console.error(`Unknown genreId: ${genreId}`);
        return { added: 0, error: 'Unknown genreId' };
    }

    const tag = GENRE_MB_TAGS[genreId] || node.label.toLowerCase();

    console.log(`\n=================================================`);
    console.log(`🎵 Processing "${node.label}" (${genreId})`);
    console.log(`   • MB Tag: "${tag}" | Target New: +${targetNewTracks} tracks`);

    // 1. Preload existing tracks into RAM for instant 0ms check
    const t0 = Date.now();
    const { seenKeys, seenVideoIds, existingCount } = await loadExistingGenreIndex(genreId);
    console.log(`   • RAM Index: ${existingCount} existing tracks cached in ${Date.now() - t0}ms (0 DB calls for existence checks)`);

    // 2. Fetch candidates in batch of 100 with smart offset
    // Offset only if catalog already has > 100 tracks in this genre
    const startOffset = existingCount > 100 ? Math.min(existingCount, 400) : 0;
    console.log(`   • Fetching MusicBrainz candidates starting at offset ${startOffset}...`);

    const { candidates } = await fetchMusicBrainzBatchCandidates(tag, startOffset, seenKeys, 100);
    console.log(`   • Received ${candidates.length} unique candidates not currently in catalog.`);

    if (candidates.length === 0) {
        console.log(`   ⚠️ No new candidates returned from MusicBrainz for "${tag}".`);
        return { added: 0, existing: existingCount };
    }

    // 3. Resolve candidates via fast Innertube JSON (~300ms) with max 3 tracks per artist
    let addedCount = 0;
    const artistTrackCounts = {};
    const tracksToInsert = [];

    for (const cand of candidates) {
        if (addedCount >= targetNewTracks) break;

        const normArtist = cand.artist.toLowerCase();
        if ((artistTrackCounts[normArtist] || 0) >= MAX_TRACKS_PER_ARTIST) continue;

        process.stdout.write(`   Resolving [${addedCount + 1}/${targetNewTracks}] "${cand.artist} - ${cand.title}"... `);

        let ytResult = await resolveInnertubeTrack(cand.artist, cand.title);
        if (ytResult.status === 'ZERO_CANDIDATES' || ytResult.status === 'NO_MATCH') {
            const fallback = await resolveYouTubeTrack(cand.artist, cand.title);
            if (fallback.status === 'FOUND') ytResult = fallback;
        }

        if (ytResult.status !== 'FOUND' || !ytResult.videoId) {
            console.log(`⏭️ (${ytResult.reason || 'No stream match'}, skipping)`);
            continue;
        }

        // Instant in-memory video ID duplicate check
        if (seenVideoIds.has(ytResult.videoId)) {
            console.log(`⏭️ (Video ID ${ytResult.videoId} already in catalog, skipping)`);
            continue;
        }

        seenVideoIds.add(ytResult.videoId);
        artistTrackCounts[normArtist] = (artistTrackCounts[normArtist] || 0) + 1;

        const finalArtist = ytResult.healedArtist || cand.artist;
        const finalTitle = ytResult.healedTitle || cand.title;

        tracksToInsert.push({
            title: finalTitle,
            artist: finalArtist,
            primary_genre_id: genreId,
            secondary_genre_ids: [genreId],
            youtube_video_id: ytResult.videoId,
            energy: node.energy || 0.6,
            is_instrumental: node.vocal === 'instrumental',
            source: 'musicbrainz-fast-pull',
            created_at: new Date().toISOString()
        });

        console.log(`✓ [${ytResult.videoId}]`);
        addedCount++;
    }

    // 4. Batch insert into Supabase
    if (tracksToInsert.length > 0) {
        const { error: insertErr } = await supabase.from('tracks').insert(tracksToInsert);
        if (insertErr) {
            console.error(`   ❌ Insert error: ${insertErr.message}`);
        } else {
            console.log(`   🎉 Successfully inserted ${tracksToInsert.length} brand new tracks for "${node.label}"!`);
        }
    }

    return { added: tracksToInsert.length, existing: existingCount + tracksToInsert.length };
}

// CLI Runner
async function main() {
    const args = process.argv.slice(2);
    const targetGenre = args.find(a => a.startsWith('--genre='))?.split('=')[1];
    const targetFamily = args.find(a => a.startsWith('--family='))?.split('=')[1]?.toLowerCase();
    const limitGenresArg = args.find(a => a.startsWith('--limit-genres='))?.split('=')[1];
    const targetCount = parseInt(args.find(a => a.startsWith('--count='))?.split('=')[1] || '30', 10);
    const lowestFirst = args.includes('--lowest-first');

    if (targetGenre) {
        await pullGenreTracks(targetGenre, targetCount);
        return;
    }

    // Process all genres or lowest first
    const allGenreIds = Object.keys(GENRE_NODES);
    let queue = allGenreIds;

    if (targetFamily) {
        queue = queue.filter(gid => GENRE_NODES[gid]?.group?.toLowerCase()?.includes(targetFamily));
        console.log(`Filtered to family "${targetFamily}": ${queue.length} genres in queue.`);
    }

    if (lowestFirst) {
        console.log('Fetching track counts to prioritize genres with the fewest tracks...');
        const counts = [];
        for (const gid of queue) {
            const { count } = await supabase.from('tracks').select('id', { count: 'exact', head: true }).eq('primary_genre_id', gid);
            counts.push({ gid, count: count || 0 });
        }
        counts.sort((a, b) => a.count - b.count);
        queue = counts.map(c => c.gid);
    }

    if (limitGenresArg) {
        const lim = parseInt(limitGenresArg, 10);
        queue = queue.slice(0, lim);
        console.log(`Limited run to first ${queue.length} genres.`);
    }

    console.log(`\nStarting pull of ${targetCount} tracks across ${queue.length} genres...`);
    let totalAdded = 0;

    for (let i = 0; i < queue.length; i++) {
        const gid = queue[i];
        console.log(`\n[Genre ${i + 1}/${queue.length}] Progress: ${totalAdded} total tracks added so far.`);
        const res = await pullGenreTracks(gid, targetCount);
        totalAdded += (res.added || 0);
    }

    console.log(`\n=================================================`);
    console.log(`🏁 Complete! Added ${totalAdded} new tracks to the catalog.`);
    console.log(`=================================================`);
}

if (process.argv[1] === import.meta.filename || process.argv[1]?.endsWith('fastPullGenreTracks.js')) {
    main().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}
