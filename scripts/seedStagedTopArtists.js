import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

const args = process.argv.slice(2);
function getArg(prefix, defaultVal) {
    const match = args.find(a => a.startsWith(prefix));
    return match ? match.split('=')[1] : defaultVal;
}

const LIMIT_PER_GENRE = parseInt(getArg('--limit=', '75'), 10);
const TARGET_GENRE = getArg('--genre=', null);
const MIN_STAGED = parseInt(getArg('--min-staged=', '1000'), 10);
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
    art_pop: 'art pop',

    // 5. Hip-Hop
    hip_hop: 'hip hop',
    boom_bap: 'boom bap',
    lofi_hiphop: 'lo-fi',
    conscious_hiphop: 'conscious hip hop',
    trap_modern: 'trap',

    // 6. R&B / Soul / Funk
    rnb_soul: 'soul',
    funk: 'funk',
    neo_soul: 'neo-soul',

    // 7. Jazz
    jazz: 'jazz',
    bebop_jazz: 'bebop',
    cool_jazz: 'cool jazz',
    modal_jazz: 'modal jazz',
    free_jazz: 'free jazz',
    bossa_nova_jazz: 'bossa nova',
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

function isCleanArtist(name) {
    if (!name || typeof name !== 'string') return false;
    const clean = name.trim();
    if (clean.length < 2 || clean.length > 60) return false;
    if (/^[0-9\s._\-#+&/\\()]+$/.test(clean)) return false;

    const lower = clean.toLowerCase();
    const junkPatterns = [
        /^unknown(\s*artist)?$/i, /^various(\s*artists)?$/i, /^va$/i, /^soundtrack/i,
        /^ost$/i, /^compilation/i, /^top\s*(\d+|\w+)/i, /^billboard/i,
        /^greatest\s*hits/i, /^topic$/i, /^(audio|clip|video|music)$/i,
        /karaoke/i, /tribute/i, /instrumental version/i
    ];
    if (junkPatterns.some(pat => pat.test(lower))) return false;

    const noisePatterns = [
        /\b(interview|podcast|livestream|live\s*stream|reaction|review|tutorial|unboxing|teaser|trailer|audiobook|talk\s*show|episode|season)\b/i
    ];
    if (noisePatterns.some(pat => pat.test(lower))) return false;

    return true;
}

// 1. Last.fm Tag Artists
async function fetchTopArtistsFromLastFm(genreTag, limit = 50) {
    try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=tag.gettopartists&tag=${encodeURIComponent(genreTag)}&api_key=${LASTFM_API_KEY}&format=json&limit=${limit}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'MusicMood/1.0.0' } });
        if (!res.ok) return [];
        const data = await res.json();
        const artists = data.topartists?.artist || [];
        return (Array.isArray(artists) ? artists : [artists]).map(a => ({ name: a.name, source: 'lastfm' }));
    } catch {
        return [];
    }
}

// 2. Apple Music / iTunes Search API (Artists & Songs)
async function fetchArtistsFromAppleMusic(genreTag, limit = 40) {
    const list = [];
    try {
        const artistUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(genreTag)}&entity=musicArtist&limit=${limit}`;
        const aRes = await fetch(artistUrl);
        if (aRes.ok) {
            const aData = await aRes.json();
            for (const item of (aData.results || [])) {
                if (item.artistName) list.push({ name: item.artistName, source: 'apple_music' });
            }
        }
        const songUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(genreTag)}&entity=song&limit=${limit}`;
        const sRes = await fetch(songUrl);
        if (sRes.ok) {
            const sData = await sRes.json();
            for (const item of (sData.results || [])) {
                if (item.artistName) list.push({ name: item.artistName, source: 'apple_music' });
            }
        }
    } catch {}
    return list;
}

// 3. Discogs Database Search API
async function fetchArtistsFromDiscogs(genreTag, limit = 30) {
    try {
        const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(genreTag)}&type=artist&per_page=${limit}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'MusicMoodDiscovery/1.0' } });
        if (!res.ok) return [];
        const data = await res.json();
        const results = data.results || [];
        return results.map(r => {
            const cleanTitle = (r.title || '').replace(/\s*\(\d+\)$/, '').trim();
            return { name: cleanTitle, source: 'discogs' };
        });
    } catch {
        return [];
    }
}

// 4. Deezer Public Search API
async function fetchArtistsFromDeezer(genreTag, limit = 30) {
    try {
        const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(genreTag)}&limit=${limit}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        const results = data.data || [];
        return results.map(a => ({ name: a.name, source: 'deezer' }));
    } catch {
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

        const [lastfmList, appleList, discogsList, deezerList] = await Promise.all([
            fetchTopArtistsFromLastFm(tag, LIMIT_PER_GENRE),
            fetchArtistsFromAppleMusic(tag, Math.min(LIMIT_PER_GENRE, 40)),
            fetchArtistsFromDiscogs(tag, 25),
            fetchArtistsFromDeezer(tag, 25)
        ]);

        const rawArtists = [
            ...lastfmList,
            ...appleList,
            ...discogsList,
            ...deezerList
        ];

        if (rawArtists.length === 0) {
            console.log(`   ⏭️ No artists returned across public sources for "${tag}". Skipping.`);
            await sleep(250);
            continue;
        }

        const newCandidates = [];
        for (const a of rawArtists) {
            const rawName = a.name?.trim();
            if (!rawName || !isCleanArtist(rawName)) continue;
            const norm = rawName.toLowerCase();

            if (existingNames.has(norm)) {
                continue; // Already in catalog or staging
            }

            existingNames.add(norm); // Prevent duplicates within batch
            newCandidates.push({
                name: rawName,
                slug: rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                primary_genre_id: genreId,
                secondary_genre_ids: [],
                status: 'pending',
                is_requested: false,
                request_count: 0,
                confidence_score: 90,
                batch_id: `seed_top_${genreId}_${dateStr}`,
                source: a.source || 'multi_source'
            });
        }

        console.log(`   Queried Last.fm (${lastfmList.length}), Apple Music (${appleList.length}), Discogs (${discogsList.length}), Deezer (${deezerList.length}) -> +${newCandidates.length} clean new candidates.`);

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
        await sleep(350); // Respectful rate limit across public APIs
    }

    console.log('================================================================');
    console.log('🏁 PRE-POPULATION PIPELINE COMPLETED');
    console.log(`   • Genres Processed:      ${genresProcessed}`);
    console.log(`   • Total Artists Seeded:  +${totalSeeded}`);
    console.log(`   • Mode:                  ${IS_DRY_RUN ? 'DRY RUN' : 'LIVE INSERTS'}`);
    console.log('================================================================');
}

run();
