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
const MAX_TRACKS_PER_ARTIST = 3; // Strict cap to guarantee artist diversity across the genre

// Command Line Flags
const args = process.argv.slice(2);
const batchArg = args.find(a => a.startsWith('--batch='));
const BATCH_PER_GENRE = batchArg ? parseInt(batchArg.split('=')[1], 10) : 30;

const genreArg = args.find(a => a.startsWith('--genre='));
const SPECIFIC_GENRE = genreArg ? genreArg.split('=')[1].trim().toLowerCase() : null;

const limitGenresArg = args.find(a => a.startsWith('--limit-genres='));
const LIMIT_GENRES = limitGenresArg ? parseInt(limitGenresArg.split('=')[1], 10) : null;

const EMPTY_ONLY = args.includes('--empty-only');

// High-fidelity taxonomy ID to MusicBrainz query tag dictionary
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

    // 6. R&B / Soul / Funk
    rnb_soul: 'soul',
    funk: 'funk',
    classic_soul: 'soul',
    motown: 'motown',
    neo_soul: 'neo-soul',
    contemporary_rnb: 'contemporary r&b',
    quiet_storm: 'quiet storm',

    // 7. Jazz
    jazz: 'jazz',
    bebop_jazz: 'bebop',
    hard_bop: 'hard bop',
    cool_jazz: 'cool jazz',
    modal_jazz: 'modal jazz',
    free_jazz: 'free jazz',
    bossa_nova_jazz: 'bossa nova',
    fusion_jazz: 'jazz fusion',
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
    drone: 'drone',
    new_age: 'new age',
    chillout: 'chillout',
    nature_soundscape: 'ambient',

    // 14. Avant-Garde
    avant_garde: 'avant-garde',
    experimental_rock: 'experimental rock',
    noise: 'noise',
    industrial: 'industrial'
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Async generator streaming unique MusicBrainz candidates for a genre.
 * Strictly enforces a max of 3 candidate recordings per artist to ensure wide variety.
 */
async function* getMusicBrainzCandidateStream(genreId, tag) {
    const seenKeys = new Set();
    const queryTag = `tag:"${tag}"`;
    const artistYieldCounts = {};

    // 1. First stream from top canonical artists (paging through multiple pages for diversity)
    let artistOffset = 0;
    while (artistOffset < 200) {
        let artists = [];
        try {
            await sleep(1100); // 1 req/sec rate limit
            const artistUrl = `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(queryTag)}&fmt=json&limit=25&offset=${artistOffset}`;
            const resA = await fetch(artistUrl, { headers });
            if (resA.ok) {
                const dataA = await resA.json();
                artists = dataA.artists || [];
            }
        } catch (e) {
            console.warn(`[MusicBrainz] Artist query error at offset ${artistOffset}:`, e.message);
        }

        if (artists.length === 0) break;

        for (const artist of artists) {
            if (!artist.name || /^(various artists|unknown|track [0-9]+)$/i.test(artist.name.trim())) continue;
            const normArtist = artist.name.trim().toLowerCase();
            if ((artistYieldCounts[normArtist] || 0) >= MAX_TRACKS_PER_ARTIST) continue;

            await sleep(1100);
            try {
                const recUrl = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent('arid:' + artist.id + ' AND status:official')}&fmt=json&limit=15`;
                const resR = await fetch(recUrl, { headers });
                if (!resR.ok) continue;

                const dataR = await resR.json();
                const recs = dataR.recordings || [];

                for (const rec of recs) {
                    if ((artistYieldCounts[normArtist] || 0) >= MAX_TRACKS_PER_ARTIST) break; // Max 3 per artist! Move to next artist!
                    const title = (rec.title || '').trim();
                    const dur = rec.length ? Math.round(rec.length / 1000) : 0;

                    if (dur < 75 || dur > 750) continue;
                    if (/live|interview|remix|version|demo|tribute|karaoke/i.test(title)) continue;

                    const songCheck = isSongCandidate({ title, artist: artist.name });
                    if (!songCheck.pass) continue;

                    const key = `${artist.name} - ${title}`.toLowerCase();
                    if (!seenKeys.has(key)) {
                        seenKeys.add(key);
                        artistYieldCounts[normArtist] = (artistYieldCounts[normArtist] || 0) + 1;
                        yield {
                            artist: artist.name,
                            title,
                            duration: dur,
                            mbid: rec.id
                        };
                    }
                }
            } catch (e) {}
        }
        artistOffset += 25;
    }

    // 2. Fallback stream: Direct recording search with offset pagination
    let recOffset = 0;
    while (recOffset < 300) {
        let recs = [];
        try {
            await sleep(1100);
            const recUrl = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(queryTag + ' AND status:official')}&fmt=json&limit=30&offset=${recOffset}`;
            const resR = await fetch(recUrl, { headers });
            if (resR.ok) {
                const dataR = await resR.json();
                recs = dataR.recordings || [];
            }
        } catch (e) {
            console.warn(`[MusicBrainz] Recording query error at offset ${recOffset}:`, e.message);
        }

        if (recs.length === 0) break;

        for (const rec of recs) {
            const artist = rec['artist-credit']?.[0]?.name;
            const title = (rec.title || '').trim();
            const dur = rec.length ? Math.round(rec.length / 1000) : 0;

            if (!artist || !title) continue;
            if (/^(various artists|unknown|track [0-9]+)$/i.test(artist.trim())) continue;
            const normArtist = artist.trim().toLowerCase();
            if ((artistYieldCounts[normArtist] || 0) >= MAX_TRACKS_PER_ARTIST) continue; // Max 3 per artist!

            if (dur < 75 || dur > 750) continue;
            if (/live|interview|remix|version|demo|tribute|karaoke/i.test(title)) continue;

            const songCheck = isSongCandidate({ title, artist });
            if (!songCheck.pass) continue;

            const key = `${artist} - ${title}`.toLowerCase();
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                artistYieldCounts[normArtist] = (artistYieldCounts[normArtist] || 0) + 1;
                yield {
                    artist,
                    title,
                    duration: dur,
                    mbid: rec.id
                };
            }
        }
        recOffset += 30;
    }
}

async function startSeeder() {
    console.log("=================================================");
    console.log("🌱 MusicMood External Genre Seeder (MusicBrainz -> Catalog)");
    console.log("   • Authority: MetaBrainz Foundation (Popularity & Essential Tracks)");
    console.log("   • Resolution: Fast Innertube JSON (~300ms) with HTML Scraper fallback");
    console.log(`   • Target: Fetch until ${BATCH_PER_GENRE} BRAND NEW tracks added per genre`);
    console.log(`   • Artist Variety Rule: MAX ${MAX_TRACKS_PER_ARTIST} tracks per artist (strictly enforced)`);
    console.log("   • Enrichment Rule: If already in library, skip and fetch next (no wasted slots!)");
    if (SPECIFIC_GENRE) console.log(`   • Filter: Specific genre only ("${SPECIFIC_GENRE}")`);
    if (EMPTY_ONLY) console.log(`   • Filter: Empty genres only (0 tracks)`);
    if (LIMIT_GENRES) console.log(`   • Batch limit: ${LIMIT_GENRES} genres`);
    console.log("=================================================\n");

    const allGenreIds = Object.keys(GENRE_NODES);
    let targetGenres = allGenreIds.map(id => ({
        id,
        label: GENRE_NODES[id].label,
        group: GENRE_NODES[id].group,
        tag: GENRE_MB_TAGS[id] || id.replace(/_/g, ' ')
    }));

    if (SPECIFIC_GENRE) {
        targetGenres = targetGenres.filter(g => g.id === SPECIFIC_GENRE);
    }

    if (LIMIT_GENRES) {
        targetGenres = targetGenres.slice(0, LIMIT_GENRES);
    }

    console.log(`🎯 Queue contains ${targetGenres.length} genres to enrich.\n`);

    let totalTracksInserted = 0;

    for (let gIdx = 0; gIdx < targetGenres.length; gIdx++) {
        const genre = targetGenres[gIdx];
        const targetToInsert = BATCH_PER_GENRE;

        console.log(`\n-------------------------------------------------`);
        console.log(`[Genre ${gIdx + 1}/${targetGenres.length}] 🎵 "${genre.label}" (${genre.id})`);
        console.log(`   • Family: ${genre.group} | Goal: +${targetToInsert} NEW tracks (Max ${MAX_TRACKS_PER_ARTIST}/artist)`);
        console.log(`   • MusicBrainz Tag Query: "${genre.tag}"`);
        console.log(`-------------------------------------------------`);

        let genreInserted = 0;
        let candidatesExamined = 0;
        const artistTrackCounts = {}; // Track how many tracks each artist has in this genre batch
        const candidateStream = getMusicBrainzCandidateStream(genre.id, genre.tag);

        for await (const cand of candidateStream) {
            if (genreInserted >= targetToInsert) break;
            candidatesExamined++;

            const normArtist = (cand.artist || '').trim().toLowerCase();

            // Strict Variety Invariant: Do not pull more than MAX_TRACKS_PER_ARTIST from any single artist
            if ((artistTrackCounts[normArtist] || 0) >= MAX_TRACKS_PER_ARTIST) {
                continue;
            }

            // 1. Check if track already exists in public.tracks by artist + title
            const { data: existing } = await supabase
                .from('tracks')
                .select('id')
                .ilike('artist', cand.artist)
                .ilike('title', cand.title)
                .limit(1);

            if (existing && existing.length > 0) {
                console.log(`   [⏭️ Library Hit] Already in catalog: "${cand.artist} - ${cand.title}" (Skipped, fetching next...)`);
                continue;
            }

            // 2. Resolve stream: Fast Tier 1 Innertube (~300ms) with Tier 2 Desktop Scraper fallback
            process.stdout.write(`   Resolving "${cand.artist} - ${cand.title}"... `);

            let ytResult = await resolveInnertubeTrack(cand.artist, cand.title);
            if (ytResult.status === 'ZERO_CANDIDATES' || ytResult.status === 'NO_MATCH') {
                const fallback = await resolveYouTubeTrack(cand.artist, cand.title);
                if (fallback.status === 'FOUND') {
                    ytResult = fallback;
                }
            }

            if (ytResult.status !== 'FOUND' || !ytResult.videoId) {
                console.log(`⏭️ (${ytResult.reason || 'No stream match'}, skipping)`);
                continue;
            }

            // Check if exact video ID is already mapped in tracks
            const { data: existingVid } = await supabase
                .from('tracks')
                .select('id')
                .eq('youtube_video_id', ytResult.videoId)
                .limit(1);

            if (existingVid && existingVid.length > 0) {
                console.log(`⏭️ (Video ID ${ytResult.videoId} already in library, skipping)`);
                continue;
            }

            const healedArtist = ytResult.healedArtist || cand.artist;
            const healedTitle = ytResult.healedTitle || cand.title;

            // 3. Upsert Artist in public.artists
            let artistId = null;
            const { data: artistRecord } = await supabase
                .from('artists')
                .select('id')
                .ilike('name', healedArtist)
                .maybeSingle();

            if (artistRecord?.id) {
                artistId = artistRecord.id;
            } else {
                const { data: newArtist } = await supabase
                    .from('artists')
                    .insert({
                        name: healedArtist,
                        primary_genre_id: genre.id,
                        secondary_genre_ids: [genre.id],
                        tags: [genre.tag]
                    })
                    .select('id')
                    .maybeSingle();
                artistId = newArtist?.id || null;
            }

            // 4. Insert Track into public.tracks
            const { error: insertErr } = await supabase
                .from('tracks')
                .insert({
                    youtube_video_id: ytResult.videoId,
                    title: healedTitle,
                    artist: healedArtist,
                    primary_genre_id: genre.id,
                    secondary_genre_ids: [genre.id],
                    artist_id: artistId,
                    source: 'musicbrainz_seed'
                });

            if (insertErr) {
                console.log(`❌ DB Error: ${insertErr.message}`);
            } else {
                genreInserted++;
                totalTracksInserted++;
                artistTrackCounts[normArtist] = (artistTrackCounts[normArtist] || 0) + 1;
                const engineTag = ytResult.engine === 'innertube' ? '⚡ Innertube' : '🛡️ Scraper';
                console.log(`✅ [${engineTag}] Mapped -> ${ytResult.videoId} (${genreInserted}/${targetToInsert} newly added | ${cand.artist}: ${artistTrackCounts[normArtist]}/${MAX_TRACKS_PER_ARTIST})`);
            }

            // Polite jittered delay
            await sleep(650 + Math.floor(Math.random() * 250));
        }

        console.log(`   ✨ Successfully added ${genreInserted}/${targetToInsert} BRAND NEW tracks across ${Object.keys(artistTrackCounts).length} distinct artists for "${genre.label}".`);
    }

    console.log("\n=================================================");
    console.log(`🎉 Ingestion Batch Complete!`);
    console.log(`   • Total brand new tracks enriched into catalog: ${totalTracksInserted}`);
    console.log("=================================================");
}

startSeeder().catch(console.error);
