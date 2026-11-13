/**
 * scanArtistCandidates.js
 * 
 * Lightweight Artist Discovery Engine for MusicMood.
 * Scans, filters, and stages candidate artists into `public.artist_suggestions`
 * WITHOUT resolving or downloading any audio tracks.
 * 
 * Supported Sources:
 * 1. KEXP Seattle Curated Radio (`--source=kexp`)
 * 2. Curated Genre Tags (`--source=tag --tag="delta blues"`)
 * 
 * Usage:
 *   node scripts/scanArtistCandidates.js --source=kexp --count=100
 *   node scripts/scanArtistCandidates.js --source=kexp --count=100 --dry-run
 *   node scripts/scanArtistCandidates.js --source=tag --tag="bluegrass" --count=50
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { normalizeGenre, isSongCandidate, VALID_GENRE_IDS } from '../src/services/genreNormalizer.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

const args = process.argv.slice(2);
function getArg(prefix, defaultVal) {
    const match = args.find(a => a.startsWith(prefix));
    return match ? match.split('=')[1] : defaultVal;
}

const SOURCE = getArg('--source=', 'kexp').toLowerCase();
const TARGET_TAG = getArg('--tag=', 'blues');
const TARGET_COUNT = parseInt(getArg('--count=', '100'), 10);
const BATCH_ID = getArg('--batch=', `${SOURCE}-artists-${new Date().toISOString().slice(0, 10)}`);
const IS_DRY_RUN = args.includes('--dry-run');
const API_KEY = process.env.LASTFM_API_KEY || 'd11784f5f2ef96e01a656f80734244e8';

const TRUSTED_LABELS = new Set([
    'ecm', 'blue note', 'warp', '4ad', 'sub pop', 'ninja tune', 'daptone',
    'kscope', 'gondwana', 'nonesuch', 'touch', 'hyperdub', 'matador', 'rough trade',
    'domino', 'drag city', 'stones throw', 'ghostly international', 'brainfeeder',
    'thrill jockey', 'sacred bones', 'jagjaguwar', 'milan', 'mote-evolver', 'erased tapes',
    'atlantic', 'columbia', 'verve', 'impulse!', 'decca', 'motown'
]);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchArtistTags(artistName) {
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(artistName)}&api_key=${API_KEY}&format=json`;
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'MusicMood-ArtistScanner/1.0.0' } });
        if (!res.ok) return [];
        const data = await res.json();
        const tags = data.toptags?.tag || [];
        return tags.map(t => t.name.toLowerCase().trim()).filter(Boolean);
    } catch {
        return [];
    }
}

async function fetchKexpCandidateArtists(targetCount) {
    console.log(`📡 Sourcing candidate artists from KEXP Seattle Live Radio Archive...`);
    const candidates = new Map();
    let offset = 0;
    const limit = 100;
    let page = 1;

    while (candidates.size < targetCount && page <= 15) {
        process.stdout.write(`   Fetching KEXP page ${page}... `);
        const url = `https://api.kexp.org/v2/plays/?limit=${limit}&offset=${offset}`;
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'MusicMood/1.0.0' } });
            if (!res.ok) break;
            const data = await res.json();
            const plays = data.results || [];
            let addedFromPage = 0;

            for (const p of plays) {
                if (p.play_type !== 'trackplay' || !p.artist) continue;
                const name = p.artist.trim();
                const key = name.toLowerCase();

                if (!candidates.has(key)) {
                    let releaseYear = null;
                    if (p.release_date) {
                        const m = p.release_date.match(/\b(19\d\d|20\d\d)\b/);
                        if (m) releaseYear = parseInt(m[1], 10);
                    }

                    candidates.set(key, {
                        name,
                        label: p.label || null,
                        releaseYear,
                        source: 'kexp_radio',
                        initialFlags: ['kexp_human_selector']
                    });
                    addedFromPage++;
                }
                if (candidates.size >= targetCount * 1.5) break; // Buffer for existing filter
            }
            console.log(`+${addedFromPage} candidates (${candidates.size} pooled)`);
        } catch (e) {
            console.log(`Error: ${e.message}`);
            break;
        }
        offset += limit;
        page++;
        await sleep(150);
    }

    return Array.from(candidates.values());
}

async function fetchTagCandidateArtists(tag, targetCount) {
    console.log(`🏷️ Sourcing candidate artists from Last.fm tag: "${tag}"...`);
    const url = `https://ws.audioscrobbler.com/2.0/?method=tag.gettopartists&tag=${encodeURIComponent(tag)}&api_key=${API_KEY}&format=json&limit=${Math.min(targetCount * 2, 200)}`;
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'MusicMood/1.0.0' } });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.topartists?.artist || []).map(a => ({
            name: a.name.trim(),
            label: null,
            releaseYear: null,
            source: `lastfm_tag:${tag}`,
            initialFlags: [`tag:${tag}`]
        }));
    } catch {
        return [];
    }
}

async function run() {
    console.log('================================================================');
    console.log('🔍 LIGHTWEIGHT ARTIST DISCOVERY & STAGING ENGINE');
    console.log(`   Source:        ${SOURCE.toUpperCase()}`);
    console.log(`   Target Count:  ${TARGET_COUNT} new artists`);
    console.log(`   Batch ID:      ${BATCH_ID}`);
    console.log(`   Execution:     ${IS_DRY_RUN ? 'DRY RUN (Preview Only)' : 'LIVE STAGING WRITES'}`);
    console.log('================================================================\n');

    // 1. Fetch raw candidates
    let candidates = [];
    if (SOURCE === 'kexp') {
        candidates = await fetchKexpCandidateArtists(TARGET_COUNT);
    } else {
        candidates = await fetchTagCandidateArtists(TARGET_TAG, TARGET_COUNT);
    }

    console.log(`\n✓ Assembled ${candidates.length} candidate artists. Verifying against catalog...\n`);

    let stagedCount = 0;
    let existingCount = 0;
    const stagedList = [];

    for (const cand of candidates) {
        if (stagedCount >= TARGET_COUNT) break;

        // A. Check if artist already exists in public.artists
        const { data: existingArts } = await supabase
            .from('artists')
            .select('id, name')
            .ilike('name', cand.name)
            .limit(1);

        if (existingArts?.[0]) {
            existingCount++;
            continue; // Already in production
        }

        // B. Check if already in staging
        const { data: stagedArts } = await supabase
            .from('artist_suggestions')
            .select('id')
            .ilike('name', cand.name)
            .limit(1);

        if (stagedArts?.[0]) {
            continue; // Already staged
        }

        // C. Tag Consensus & Quality Scoring
        const rawTags = await fetchArtistTags(cand.name);
        await sleep(100);

        let primaryGenre = null;
        const secondaryGenres = [];

        for (const tag of rawTags) {
            const canonical = normalizeGenre(tag, cand.name);
            if (canonical && VALID_GENRE_IDS.has(canonical)) {
                if (!primaryGenre) {
                    primaryGenre = canonical;
                } else if (canonical !== primaryGenre && !secondaryGenres.includes(canonical)) {
                    secondaryGenres.push(canonical);
                }
            }
        }

        if (!primaryGenre) {
            primaryGenre = normalizeGenre('', cand.name, '', 'rock');
        }

        // Quality scoring
        let confidenceScore = 80;
        const flags = [...cand.initialFlags];

        if (cand.releaseYear && cand.releaseYear < 2023) {
            confidenceScore += 15;
            flags.push('pre_2023');
        } else if (cand.releaseYear && cand.releaseYear >= 2024) {
            const isTrusted = cand.label && Array.from(TRUSTED_LABELS).some(l => cand.label.toLowerCase().includes(l));
            if (isTrusted) {
                confidenceScore += 10;
                flags.push('whitelisted_label');
            } else {
                flags.push('post_2024_unverified_label');
            }
        }

        if (rawTags.length >= 5) {
            flags.push('rich_tag_consensus');
        }

        const slug = cand.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const artistRecord = {
            batch_id: BATCH_ID,
            name: cand.name,
            slug,
            primary_genre_id: primaryGenre,
            secondary_genre_ids: secondaryGenres,
            label: cand.label,
            first_release_year: cand.releaseYear,
            source: cand.source,
            confidence_score: confidenceScore,
            quality_flags: flags,
            status: confidenceScore >= 95 ? 'approved' : 'pending'
        };

        stagedList.push(artistRecord);
        stagedCount++;

        console.log(`${stagedCount.toString().padStart(3)}. [Score: ${confidenceScore}] "${cand.name.padEnd(28)}" | Genre: ${(primaryGenre || 'unknown').padEnd(16)} | Year: ${(cand.releaseYear || 'N/A').toString().padEnd(4)} | Flags: [${flags.slice(0, 3).join(', ')}]`);

        if (!IS_DRY_RUN) {
            await supabase.from('artist_suggestions').insert(artistRecord);
        }
    }

    console.log('\n================================================================');
    console.log(`🏁 ARTIST SCAN COMPLETED`);
    console.log(`   • Newly Staged Artists:  ${stagedCount}`);
    console.log(`   • Already in Catalog:    ${existingCount} skipped`);
    console.log(`   • Staging Table:         public.artist_suggestions`);
    console.log(`   • Batch ID:              ${BATCH_ID}`);
    console.log('================================================================\n');
}

run().catch(err => {
    console.error('Fatal scan error:', err);
    process.exit(1);
});
