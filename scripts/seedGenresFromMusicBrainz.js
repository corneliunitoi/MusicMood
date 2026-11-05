import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { GENRE_NODES } from '../src/services/tasteGraph.js';
import { resolveYouTubeTrack } from './resolveVideoIds.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

const headers = { 'User-Agent': 'MusicMood/1.0.0 ( contact@musicmood.local )' };

// Command Line Flags
const args = process.argv.slice(2);
const targetArg = args.find(a => a.startsWith('--target='));
const TARGET_TRACKS = targetArg ? parseInt(targetArg.split('=')[1], 10) : 20;

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

async function fetchTopRecordingsFromMusicBrainz(genreId, tag, count = 20) {
    const candidates = [];
    const seenKeys = new Set();
    const queryTag = `tag:"${tag}"`;

    // 1. Fetch top canonical artists for this genre tag
    try {
        const artistUrl = `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(queryTag)}&fmt=json&limit=15`;
        const resA = await fetch(artistUrl, { headers });
        if (resA.ok) {
            const dataA = await resA.json();
            const topArtists = dataA.artists || [];

            for (const artist of topArtists) {
                if (candidates.length >= count) break;
                await sleep(1100); // MusicBrainz rate limit compliance

                const recUrl = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent('arid:' + artist.id + ' AND status:official')}&fmt=json&limit=6`;
                const resR = await fetch(recUrl, { headers });
                if (!resR.ok) continue;

                const dataR = await resR.json();
                const recs = dataR.recordings || [];

                let addedForArtist = 0;
                for (const rec of recs) {
                    if (candidates.length >= count || addedForArtist >= 2) break;
                    const title = (rec.title || '').trim();
                    const dur = rec.length ? Math.round(rec.length / 1000) : 0;

                    // Filter out non-song outliers
                    if (dur < 90 || dur > 700) continue;
                    if (/live|interview|remix|version|demo|tribute|instrumental version/i.test(title)) continue;

                    const key = `${artist.name} - ${title}`.toLowerCase();
                    if (!seenKeys.has(key)) {
                        seenKeys.add(key);
                        candidates.push({
                            artist: artist.name,
                            title,
                            duration: dur,
                            mbid: rec.id
                        });
                        addedForArtist++;
                    }
                }
            }
        }
    } catch (e) {
        console.warn(`[MusicBrainz] Error fetching artists for ${tag}:`, e.message);
    }

    // 2. Direct recording search by tag if still under count
    if (candidates.length < count) {
        try {
            await sleep(1100);
            const needed = count - candidates.length;
            const recQuery = `tag:"${tag}" AND status:official`;
            const recUrl = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(recQuery)}&fmt=json&limit=${Math.min(needed * 2, 35)}`;
            const resR = await fetch(recUrl, { headers });
            if (resR.ok) {
                const dataR = await resR.json();
                for (const rec of (dataR.recordings || [])) {
                    if (candidates.length >= count) break;
                    const artist = rec['artist-credit']?.[0]?.name;
                    const title = (rec.title || '').trim();
                    const dur = rec.length ? Math.round(rec.length / 1000) : 0;

                    if (!artist || !title) continue;
                    if (dur < 90 || dur > 700) continue;
                    if (/live|interview|remix|version|demo|tribute/i.test(title)) continue;

                    const key = `${artist} - ${title}`.toLowerCase();
                    if (!seenKeys.has(key)) {
                        seenKeys.add(key);
                        candidates.push({
                            artist,
                            title,
                            duration: dur,
                            mbid: rec.id
                        });
                    }
                }
            }
        } catch (e) {
            console.warn(`[MusicBrainz] Error fetching direct recordings for ${tag}:`, e.message);
        }
    }

    return candidates;
}

async function startSeeder() {
    console.log("=================================================");
    console.log("🌱 MusicMood External Genre Seeder (MusicBrainz -> Catalog)");
    console.log("   • Authority: MetaBrainz Foundation (Popularity & Essential Tracks)");
    console.log(`   • Target tracks per genre: ${TARGET_TRACKS}`);
    if (SPECIFIC_GENRE) console.log(`   • Filter: Specific genre only ("${SPECIFIC_GENRE}")`);
    if (EMPTY_ONLY) console.log(`   • Filter: Empty genres only (0 tracks)`);
    if (LIMIT_GENRES) console.log(`   • Batch limit: ${LIMIT_GENRES} genres`);
    console.log("=================================================\n");

    // 1. Audit current counts in public.tracks
    console.log("📊 Auditing current catalog track counts across 115 taxonomy genres...");
    const { data: trackData, error: trackError } = await supabase
        .from('tracks')
        .select('primary_genre_id');

    if (trackError) {
        console.error("❌ Failed to query tracks:", trackError.message);
        return;
    }

    const currentCounts = {};
    (trackData || []).forEach(t => {
        const g = t.primary_genre_id;
        if (g) currentCounts[g] = (currentCounts[g] || 0) + 1;
    });

    // 2. Select genres needing seeding
    const allGenreIds = Object.keys(GENRE_NODES);
    let targetGenres = allGenreIds.map(id => ({
        id,
        label: GENRE_NODES[id].label,
        group: GENRE_NODES[id].group,
        tag: GENRE_MB_TAGS[id] || id.replace(/_/g, ' '),
        count: currentCounts[id] || 0
    }));

    if (SPECIFIC_GENRE) {
        targetGenres = targetGenres.filter(g => g.id === SPECIFIC_GENRE);
    } else if (EMPTY_ONLY) {
        targetGenres = targetGenres.filter(g => g.count === 0);
    } else {
        targetGenres = targetGenres.filter(g => g.count < TARGET_TRACKS);
    }

    // Sort by lowest count first (0 tracks get seeded first!)
    targetGenres.sort((a, b) => a.count - b.count);

    if (LIMIT_GENRES) {
        targetGenres = targetGenres.slice(0, LIMIT_GENRES);
    }

    console.log(`\n🎯 Found ${targetGenres.length} genres needing tracks to reach target of ${TARGET_TRACKS}.\n`);

    let totalTracksInserted = 0;

    for (let gIdx = 0; gIdx < targetGenres.length; gIdx++) {
        const genre = targetGenres[gIdx];
        const needed = Math.max(0, TARGET_TRACKS - genre.count);

        console.log(`\n-------------------------------------------------`);
        console.log(`[Genre ${gIdx + 1}/${targetGenres.length}] 🎵 "${genre.label}" (${genre.id})`);
        console.log(`   • Family: ${genre.group} | Current tracks: ${genre.count} | Target to pull: ${needed}`);
        console.log(`   • MusicBrainz Tag Query: "${genre.tag}"`);
        console.log(`-------------------------------------------------`);

        if (needed <= 0) {
            console.log("   ✓ Already satisfied.");
            continue;
        }

        // Fetch top candidates from MusicBrainz
        const candidates = await fetchTopRecordingsFromMusicBrainz(genre.id, genre.tag, needed);
        console.log(`   Found ${candidates.length} candidate recordings from MusicBrainz. Resolving YouTube streams...`);

        let genreInserted = 0;

        for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
            if (genreInserted >= needed) break;

            const cand = candidates[cIdx];

            // 1. Check if track already exists in public.tracks
            const { data: existing } = await supabase
                .from('tracks')
                .select('id')
                .ilike('artist', cand.artist)
                .ilike('title', cand.title)
                .limit(1);

            if (existing && existing.length > 0) {
                console.log(`   [${cIdx + 1}/${candidates.length}] ⏭️ Already in catalog: "${cand.artist} - ${cand.title}"`);
                continue;
            }

            // 2. Resolve YouTube video ID with zero API quota
            process.stdout.write(`   [${cIdx + 1}/${candidates.length}] Resolving "${cand.artist} - ${cand.title}"... `);
            const ytResult = await resolveYouTubeTrack(cand.artist, cand.title);

            if (ytResult.status !== 'FOUND' || !ytResult.videoId) {
                console.log(`⏭️ (${ytResult.reason || 'No stream match'})`);
                continue;
            }

            // Check if this exact YouTube ID is already mapped in tracks
            const { data: existingVid } = await supabase
                .from('tracks')
                .select('id')
                .eq('youtube_video_id', ytResult.videoId)
                .limit(1);

            if (existingVid && existingVid.length > 0) {
                console.log(`⏭️ (Video ID ${ytResult.videoId} already mapped)`);
                continue;
            }

            // 3. Upsert Artist in public.artists
            let artistId = null;
            const { data: artistRecord } = await supabase
                .from('artists')
                .select('id')
                .ilike('name', cand.artist)
                .maybeSingle();

            if (artistRecord?.id) {
                artistId = artistRecord.id;
            } else {
                const { data: newArtist } = await supabase
                    .from('artists')
                    .insert({
                        name: cand.artist,
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
                    title: ytResult.healedTitle || cand.title,
                    artist: ytResult.healedArtist || cand.artist,
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
                console.log(`✅ Mapped -> ${ytResult.videoId}`);
            }

            // Polite jittered delay
            await sleep(1500 + Math.floor(Math.random() * 500));
        }

        console.log(`   ✨ Seeded ${genreInserted} verified tracks for "${genre.label}".`);
    }

    console.log("\n=================================================");
    console.log(`🎉 Seeding complete!`);
    console.log(`   • Total verified tracks inserted: ${totalTracksInserted}`);
    console.log("=================================================");
}

startSeeder().catch(console.error);
