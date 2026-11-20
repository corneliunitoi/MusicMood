import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

const LASTFM_API_KEY = process.env.LASTFM_API_KEY || 'd11784f5f2ef96e01a656f80734244e8';

const args = process.argv.slice(2);
function getArg(prefix, defaultVal) {
    const match = args.find(a => a.startsWith(prefix));
    return match ? match.split('=')[1] : defaultVal;
}

const LIMIT_PER_GENRE = parseInt(getArg('--limit=', '50'), 10);
const TARGET_GENRE = getArg('--genre=', null);
const MIN_STAGED = parseInt(getArg('--min-staged=', '300'), 10);
const IS_DRY_RUN = args.includes('--dry-run');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Canonical internal genre ID to Last.fm / MusicBrainz tag mapping
const GENRE_TAG_MAP = {
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
    synthwave: 'synthwave',
    darksynth: 'darksynth',
    dubstep: 'dubstep',
    idm: 'idm',
    ambient_electronic: 'ambient techno',

    // 4. Pop
    pop: 'pop',
    synth_pop: 'synthpop',
    dance_pop: 'dance pop',
    indie_pop: 'indie pop',
    dream_pop: 'dream pop',
    art_pop: 'art pop',

    // 5. Hip-Hop
    hip_hop: 'hip hop',
    boom_bap: 'boom bap',
    lofi_hiphop: 'lo-fi',
    conscious_hiphop: 'conscious hip hop',
    trap_modern: 'trap',
    underground_rap: 'underground hip hop',

    // 6. R&B / Soul / Funk
    rnb_soul: 'soul',
    funk: 'funk',
    motown: 'motown',
    neo_soul: 'neo-soul',
    contemporary_rnb: 'contemporary r&b',

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

    // 9. Classical
    classical: 'classical',
    baroque: 'baroque',
    romantic: 'romantic classical',
    neo_classical: 'neoclassical',
    minimalism: 'minimalism',
    cinematic_orchestral: 'soundtrack',

    // 10. Folk
    folk_acoustic: 'folk',
    traditional_folk: 'traditional folk',
    contemporary_folk: 'contemporary folk',
    indie_folk: 'indie folk',
    bluegrass: 'bluegrass',
    singer_songwriter: 'singer-songwriter',

    // 11. Country
    country: 'country',
    classic_country: 'classic country',
    outlaw_country: 'outlaw country',
    alt_country: 'alt-country',
    americana: 'americana',

    // 12. World & Reggae
    reggae: 'reggae',
    dub: 'dub',
    afrobeat: 'afrobeat',
    flamenco: 'flamenco',
    salsa: 'salsa',
    celtic: 'celtic',

    // 13. Ambient & Chill
    ambient: 'ambient',
    chillout: 'chillout',
    downtempo: 'downtempo',
    dark_ambient: 'dark ambient',
    drone: 'drone',

    // 14. Avant-Garde
    krautrock: 'krautrock',
    noise: 'noise',
    experimental: 'experimental',
    industrial: 'industrial',
    darkwave: 'darkwave'
};

async function fetchTopArtistsFromLastFm(genreTag, limit = 50) {
    try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=tag.gettopartists&tag=${encodeURIComponent(genreTag)}&api_key=${LASTFM_API_KEY}&format=json&limit=${limit}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'MusicMood/1.0.0' } });
        if (!res.ok) return [];
        const data = await res.json();
        const artists = data.topartists?.artist || [];
        return Array.isArray(artists) ? artists : [artists];
    } catch (e) {
        console.warn(`[LastFM] Error fetching top artists for tag "${genreTag}":`, e.message);
        return [];
    }
}

async function run() {
    console.log('================================================================');
    console.log('🏛️  MusicMood Staged Artist Pre-Population Pipeline');
    console.log(`   • Limit Per Genre: ${LIMIT_PER_GENRE} top artists`);
    console.log(`   • Min Staged Threshold: ${MIN_STAGED} artists per genre`);
    if (TARGET_GENRE) console.log(`   • Target Genre Filter: "${TARGET_GENRE}"`);
    console.log(`   • Mode: ${IS_DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE DATABASE INSERTS'}`);
    console.log('================================================================\n');

    // 1. Fetch current counts in staging per genre
    console.log('📊 Assessing current staging density across genres...');
    const { data: stagedCounts } = await supabase
        .from('artist_suggestions')
        .select('primary_genre_id');

    const countsByGenre = {};
    for (const row of stagedCounts || []) {
        if (row.primary_genre_id) {
            countsByGenre[row.primary_genre_id] = (countsByGenre[row.primary_genre_id] || 0) + 1;
        }
    }

    // 2. Fetch existing artist names across catalog and staging for deduplication
    console.log('🔍 Building deduplication index from catalog and staging...');
    const existingNames = new Set();

    // From artists
    let from = 0;
    while (true) {
        const { data: catalogArtists, error } = await supabase
            .from('artists')
            .select('name')
            .range(from, from + 999);
        if (error || !catalogArtists || catalogArtists.length === 0) break;
        catalogArtists.forEach(a => { if (a.name) existingNames.add(a.name.toLowerCase().trim()); });
        if (catalogArtists.length < 1000) break;
        from += 1000;
    }

    // From artist_suggestions
    from = 0;
    while (true) {
        const { data: stagedArtists, error } = await supabase
            .from('artist_suggestions')
            .select('name')
            .range(from, from + 999);
        if (error || !stagedArtists || stagedArtists.length === 0) break;
        stagedArtists.forEach(a => { if (a.name) existingNames.add(a.name.toLowerCase().trim()); });
        if (stagedArtists.length < 1000) break;
        from += 1000;
    }

    console.log(`✓ Deduplication index ready (${existingNames.size.toLocaleString()} unique artists indexed).\n`);

    const dateStr = new Date().toISOString().split('T')[0];
    let totalSeeded = 0;
    let genresProcessed = 0;

    const genreEntries = Object.entries(GENRE_TAG_MAP);

    for (const [genreId, tag] of genreEntries) {
        if (TARGET_GENRE && genreId !== TARGET_GENRE && tag !== TARGET_GENRE) {
            continue;
        }

        const currentCount = countsByGenre[genreId] || 0;
        if (!TARGET_GENRE && currentCount >= MIN_STAGED) {
            continue; // Genre already well-represented in staging
        }

        console.log(`[Genre ${genresProcessed + 1}] "${genreId}" (tag: "${tag}") — Current Staging: ${currentCount}`);

        const topArtists = await fetchTopArtistsFromLastFm(tag, LIMIT_PER_GENRE);
        if (topArtists.length === 0) {
            console.log(`   ⏭️ No artists returned for "${tag}". Skipping.`);
            await sleep(250);
            continue;
        }

        const newCandidates = [];
        for (const a of topArtists) {
            const rawName = a.name?.trim();
            if (!rawName) continue;
            const norm = rawName.toLowerCase();

            if (existingNames.has(norm)) {
                continue; // Already in catalog or staging
            }

            existingNames.add(norm); // Prevent duplicates within batch
            newCandidates.push({
                name: rawName,
                slug: rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                mbid: a.mbid && a.mbid.length === 36 ? a.mbid : null,
                primary_genre_id: genreId,
                secondary_genre_ids: [],
                status: 'pending',
                is_requested: false,
                request_count: 0,
                confidence_score: 85,
                batch_id: `seed_top_${genreId}_${dateStr}`,
                source: 'lastfm_top_artists'
            });
        }

        console.log(`   Found ${topArtists.length} top artists from Last.fm -> ${newCandidates.length} new uncataloged candidates.`);

        if (newCandidates.length > 0 && !IS_DRY_RUN) {
            // Batch insert in chunks of 50
            for (let i = 0; i < newCandidates.length; i += 50) {
                const chunk = newCandidates.slice(i, i + 50);
                const { error: insErr } = await supabase
                    .from('artist_suggestions')
                    .insert(chunk);

                if (insErr) {
                    console.warn(`   ⚠️ Insert chunk error:`, insErr.message);
                } else {
                    totalSeeded += chunk.length;
                }
            }
            console.log(`   ✅ Seeded +${newCandidates.length} artists for "${genreId}".\n`);
        } else if (IS_DRY_RUN) {
            totalSeeded += newCandidates.length;
            console.log(`   [DRY RUN] Would seed +${newCandidates.length} artists for "${genreId}".\n`);
        }

        genresProcessed++;
        await sleep(350); // Respectful rate limit for Last.fm API
    }

    console.log('================================================================');
    console.log('🏁 PRE-POPULATION PIPELINE COMPLETED');
    console.log(`   • Genres Processed:      ${genresProcessed}`);
    console.log(`   • Total Artists Seeded:  +${totalSeeded}`);
    console.log(`   • Mode:                  ${IS_DRY_RUN ? 'DRY RUN' : 'LIVE INSERTS'}`);
    console.log('================================================================');
}

run();
