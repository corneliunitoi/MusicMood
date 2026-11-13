// scripts/scanArtistCandidates.js
// -----------------------------------------------------------------------------
// Lightweight Artist Candidate Scanner & Staging Engine
//
// Discovers artists from Last.fm micro-tags, top charts, or curated radio
// (e.g. KEXP live tracklist), validates anti-AI heuristics, and stages them
// into public.artist_suggestions WITHOUT resolving tracks or audio preview URLs.
//
// Guaranteed deduplication:
// - Pre-loads all existing artists from public.artists
// - Pre-loads distinct artist names from public.tracks
// - Pre-loads all existing candidate names from public.artist_suggestions
// - Normalizes names (strips diacritics, punctuation, casing) so duplicate
//   variations like "B.B. King" vs "BB King" or "Édith Piaf" vs "Edith Piaf"
//   are safely caught and skipped.
//
// GitHub Actions UI Integration:
// - Outputs candidate summary table to console stdout
// - Writes rich markdown table to $GITHUB_STEP_SUMMARY for immediate on-screen
//   monitoring in the GitHub Action Run page.
// -----------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const LASTFM_API_KEY = process.env.LASTFM_API_KEY || 'd11784f5f2ef96e01a656f80734244e8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
});

// CLI args parsing
const args = process.argv.slice(2);
function getArg(flag, fallback) {
    const found = args.find((a) => a.startsWith(`--${flag}=`));
    if (found) return found.split('=')[1];
    const idx = args.indexOf(`--${flag}`);
    if (idx !== -1 && args[idx + 1]) return args[idx + 1];
    return fallback;
}

const SOURCE = getArg('source', 'auto'); // 'lastfm_tag', 'kexp', 'auto'
const TAG = getArg('tag', 'delta blues');
const TARGET_COUNT = parseInt(getArg('count', '500'), 10);
const DRY_RUN = args.includes('--dry-run');

console.log('====================================================');
console.log('   ARTIST CANDIDATE DISCOVERY & STAGING ENGINE     ');
console.log('====================================================');
console.log(`Source:       ${SOURCE}`);
console.log(`Tag/Filter:   ${TAG}`);
console.log(`Target Limit: ${TARGET_COUNT}`);
console.log(`Dry Run:      ${DRY_RUN}`);
console.log('====================================================\n');

/**
 * Normalizes artist name for fuzzy deduplication:
 * - Lowercase
 * - Strip diacritics / accents (é -> e, ü -> u)
 * - Strip punctuation / symbols (&, ', -, ., etc.)
 * - Collapse whitespace
 */
function normalizeArtistKey(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove diacritics
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]/g, '')        // remove all non-alphanumeric
        .trim();
}

/**
 * Pre-loads all existing artist names from:
 * 1. public.artists (or via RPC get_catalog_artist_names)
 * 2. public.tracks (artist column)
 * 3. public.artist_suggestions (name column)
 *
 * Returns a Set of exact lowercase names and a Set of normalized keys.
 */
async function loadExistingLibraryKeys() {
    console.log('Loading existing artist library & suggestions for strict deduplication...');
    const exactSet = new Set();
    const normalizedSet = new Set();

    function addName(name) {
        if (!name || typeof name !== 'string') return;
        const trimmed = name.trim();
        if (!trimmed) return;
        exactSet.add(trimmed.toLowerCase());
        const norm = normalizeArtistKey(trimmed);
        if (norm) normalizedSet.add(norm);
    }

    // 1. Paginated load of ALL artists in public.artists
    try {
        let from = 0;
        const pageSize = 1000;
        let count = 0;
        while (true) {
            const { data, error } = await supabase
                .from('artists')
                .select('name')
                .range(from, from + pageSize - 1);
            if (error || !data || data.length === 0) break;
            for (const row of data) addName(row.name);
            count += data.length;
            if (data.length < pageSize) break;
            from += pageSize;
        }
        console.log(`Loaded ${count} catalog artists from public.artists.`);
    } catch (e) {
        console.warn('Note: Could not scan public.artists:', e.message);
    }

    // 2. Load existing candidate suggestions from public.artist_suggestions
    try {
        let from = 0;
        const pageSize = 1000;
        let stagedCount = 0;
        while (true) {
            const { data, error } = await supabase
                .from('artist_suggestions')
                .select('name')
                .range(from, from + pageSize - 1);
            if (error || !data || data.length === 0) break;
            for (const row of data) addName(row.name);
            stagedCount += data.length;
            if (data.length < pageSize) break;
            from += pageSize;
        }
        console.log(`Loaded ${stagedCount} existing candidates from public.artist_suggestions.`);
    } catch (e) {
        console.warn('Note: Could not check public.artist_suggestions:', e.message);
    }

    console.log(`Dedup index ready: ${exactSet.size} exact unique names (${normalizedSet.size} normalized tokens).\n`);
    return { exactSet, normalizedSet };
}

/**
 * Fetch artists from Last.fm tag with multi-page support
 */
async function fetchLastFmTagArtists(tag, targetCount, library) {
    const artists = [];
    const limitPerPage = 100;
    const maxPages = Math.min(10, Math.ceil((targetCount * 3) / limitPerPage)); // fetch extra to account for duplicates

    console.log(`Fetching candidate artists from Last.fm tag: "${tag}" (up to ${maxPages} pages)...`);

    for (let page = 1; page <= maxPages; page++) {
        const url = `https://ws.audioscrobbler.com/2.0/?method=tag.gettopartists&tag=${encodeURIComponent(tag)}&api_key=${LASTFM_API_KEY}&format=json&limit=${limitPerPage}&page=${page}`;
        try {
            const res = await fetch(url);
            if (!res.ok) {
                console.warn(`Last.fm API returned HTTP ${res.status} on page ${page}`);
                break;
            }
            const json = await res.json();
            const list = json?.topartists?.artist || [];
            if (!Array.isArray(list) || list.length === 0) break;

            for (const item of list) {
                const name = item.name?.trim();
                if (!name) continue;

                const lowerName = name.toLowerCase();
                const normName = normalizeArtistKey(name);

                // Strict deduplication check
                if (library.exactSet.has(lowerName) || library.normalizedSet.has(normName)) {
                    continue;
                }

                // AI sludge & fraud heuristics
                if (looksLikeAISludge(name)) {
                    continue;
                }

                // Add to temporary set to avoid intra-batch duplicates
                library.exactSet.add(lowerName);
                library.normalizedSet.add(normName);

                artists.push({
                    name,
                    source: 'lastfm_tag',
                    discovered_via: `lastfm_tag:${tag}`,
                    source_url: item.url || `https://www.last.fm/music/${encodeURIComponent(name)}`,
                    raw_tags: [tag],
                    estimated_listeners: parseInt(item.listeners || '0', 10),
                    confidence_score: 85,
                });

                if (artists.length >= targetCount) break;
            }

            console.log(`Page ${page}: found ${list.length} raw artists -> accumulated ${artists.length} new candidates.`);
            if (artists.length >= targetCount) break;
            await new Promise((r) => setTimeout(r, 200)); // friendly rate limit
        } catch (e) {
            console.error(`Error fetching Last.fm page ${page}:`, e.message);
            break;
        }
    }

    return artists;
}

/**
 * Fetch artists from KEXP live play stream
 */
async function fetchKEXPPlays(targetCount, library) {
    const artists = [];
    let nextUrl = 'https://api.kexp.org/v2/plays/?limit=100';
    let pages = 0;
    const maxPages = 40;

    console.log(`Fetching recent live curation from KEXP radio API...`);

    while (nextUrl && artists.length < targetCount && pages < maxPages) {
        pages++;
        try {
            const res = await fetch(nextUrl);
            if (!res.ok) break;
            const data = await res.json();
            const plays = data.results || [];
            if (!plays.length) break;

            for (const play of plays) {
                if (play.play_type !== 'trackplay' || !play.artist) continue;
                const name = play.artist.trim();
                if (!name) continue;

                const lowerName = name.toLowerCase();
                const normName = normalizeArtistKey(name);

                // Strict deduplication
                if (library.exactSet.has(lowerName) || library.normalizedSet.has(normName)) {
                    continue;
                }

                if (looksLikeAISludge(name)) {
                    continue;
                }

                library.exactSet.add(lowerName);
                library.normalizedSet.add(normName);

                artists.push({
                    name,
                    source: 'kexp_live',
                    discovered_via: `kexp:${play.show_title || 'live_broadcast'}`,
                    source_url: `https://kexp.org/search/?q=${encodeURIComponent(name)}`,
                    raw_tags: ['human_curated', 'kexp_radio', play.release_date ? `year_${play.release_date.slice(0, 4)}` : null].filter(Boolean),
                    estimated_listeners: 0,
                    confidence_score: 95, // Human curated KEXP DJs = ultra high trust
                });

                if (artists.length >= targetCount) break;
            }

            nextUrl = data.next;
            await new Promise((r) => setTimeout(r, 150));
        } catch (e) {
            console.error('Error fetching KEXP:', e.message);
            break;
        }
    }

    console.log(`KEXP stream: checked ${pages} pages -> gathered ${artists.length} new candidates.`);
    return artists;
}

/**
 * Anti-AI Sludge Heuristic
 */
function looksLikeAISludge(name) {
    const lower = name.toLowerCase();
    const bannedPatterns = [
        'suno', 'udio', 'ai generated', 'generated by',
        'lo-fi beats to relax', 'white noise therapy',
        'baby sleep music channel', 'binaural study beats',
        'sound effects library', 'relaxing spa sounds',
    ];
    for (const b of bannedPatterns) {
        if (lower.includes(b)) return true;
    }
    // Suspicious repetitive numbers/hex strings
    if (/[a-f0-9]{8,}/.test(lower)) return true;
    return false;
}

/**
 * Write Markdown table summary to GitHub Actions Step Summary
 */
function writeGitHubStepSummary(candidates, stats) {
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryFile) {
        console.log('(GITHUB_STEP_SUMMARY environment variable not set, skipping action UI render)');
        return;
    }

    try {
        let md = `## 🎨 Hourly Artist Discovery & Staging Report\n\n`;
        md += `| Metric | Count |\n`;
        md += `| :--- | :--- |\n`;
        md += `| **Source Mode** | \`${stats.source}\` |\n`;
        md += `| **Discovered New Candidates** | **${stats.discovered}** |\n`;
        md += `| **Staged to \`public.artist_suggestions\`** | **${stats.staged}** |\n`;
        md += `| **Auto-Approved (Confidence >= 90)** | **${stats.approved}** |\n`;
        md += `| **Pending Review (Confidence < 90)** | **${stats.pending}** |\n`;
        md += `| **Total Existing Catalog Filtered** | \`${stats.catalogSize}\` artists |\n\n`;

        md += `### 📋 Staged Candidate Artists (First 100 Preview)\n\n`;
        md += `| # | Artist Name | Source / Tag | Confidence | Status |\n`;
        md += `| :---: | :--- | :--- | :---: | :--- |\n`;

        const previewList = candidates.slice(0, 100);
        previewList.forEach((c, idx) => {
            const statusBadge = c.confidence_score >= 90 ? '🟢 Auto-Approved' : '🟡 Pending Review';
            md += `| ${idx + 1} | **${escapeMd(c.name)}** | \`${escapeMd(c.discovered_via)}\` | ${c.confidence_score}% | ${statusBadge} |\n`;
        });

        if (candidates.length > 100) {
            md += `\n*... and ${candidates.length - 100} more artists staged in this run.* Check \`public.artist_suggestions\` table in Supabase.\n`;
        }

        fs.appendFileSync(summaryFile, md, 'utf8');
        console.log(`Successfully wrote ${candidates.length} artist summary to $GITHUB_STEP_SUMMARY for Action UI screen monitoring.`);
    } catch (e) {
        console.warn('Failed to write to $GITHUB_STEP_SUMMARY:', e.message);
    }
}

function escapeMd(text) {
    if (!text) return '';
    return text.replace(/\|/g, '\\|');
}

function slugify(name) {
    if (!name) return 'artist';
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'artist';
}

/**
 * Main execution flow
 */
async function main() {
    const library = await loadExistingLibraryKeys();
    const initialCatalogSize = library.exactSet.size;

    let candidates = [];

    // Tag rotation pool if auto mode is selected
    const rotationTags = [
        'delta blues', 'chicago blues', 'country blues', 'bluegrass',
        'appalachian folk', 'americana', 'freak folk', 'anti-folk',
        'free improvisation', 'musique concrete', 'drone music', 'post-rock',
        'neo-psychedelia', 'desert rock', 'alt-country', 'celtic folk'
    ];

    if (SOURCE === 'auto') {
        const hour = new Date().getUTCHours();
        if (hour % 2 === 0) {
            console.log(`Auto mode (Hour ${hour} UTC - Even): Querying KEXP live radio plays...`);
            candidates = await fetchKEXPPlays(TARGET_COUNT, library);
            // If KEXP returns fewer than target, top up with rotating tag
            if (candidates.length < TARGET_COUNT) {
                const tag = rotationTags[hour % rotationTags.length];
                console.log(`Topping up with Last.fm tag: "${tag}"...`);
                const topup = await fetchLastFmTagArtists(tag, TARGET_COUNT - candidates.length, library);
                candidates = candidates.concat(topup);
            }
        } else {
            const tag = rotationTags[hour % rotationTags.length];
            console.log(`Auto mode (Hour ${hour} UTC - Odd): Querying Last.fm micro-tag: "${tag}"...`);
            candidates = await fetchLastFmTagArtists(tag, TARGET_COUNT, library);
        }
    } else if (SOURCE === 'kexp') {
        candidates = await fetchKEXPPlays(TARGET_COUNT, library);
    } else {
        candidates = await fetchLastFmTagArtists(TAG, TARGET_COUNT, library);
    }

    console.log(`\nDiscovered ${candidates.length} unique, verified new candidates.`);

    if (candidates.length === 0) {
        console.log('No new candidates found to stage. Exiting.');
        writeGitHubStepSummary([], {
            source: SOURCE,
            discovered: 0,
            staged: 0,
            approved: 0,
            pending: 0,
            catalogSize: initialCatalogSize,
        });
        return;
    }

    // Print summary to terminal console for live log monitoring
    console.log('\n--- CANDIDATE ARTISTS DISCOVERED ---');
    candidates.slice(0, 50).forEach((c, i) => {
        console.log(`[${i + 1}] ${c.name.padEnd(35)} | ${c.discovered_via.padEnd(25)} | Score: ${c.confidence_score}`);
    });
    if (candidates.length > 50) {
        console.log(`... and ${candidates.length - 50} more candidates.`);
    }

    if (DRY_RUN) {
        console.log('\n[DRY RUN] Skipping database insertions.');
        return;
    }

    // Stage into public.artist_suggestions in chunks of 100
    console.log('\nInserting candidates into public.artist_suggestions...');
    let stagedCount = 0;
    let approvedCount = 0;
    let pendingCount = 0;

    const chunkSize = 100;
    for (let i = 0; i < candidates.length; i += chunkSize) {
        const chunk = candidates.slice(i, i + chunkSize);
        const rows = chunk.map((c) => {
            const isApproved = c.confidence_score >= 90;
            if (isApproved) approvedCount++;
            else pendingCount++;

            return {
                name: c.name,
                slug: slugify(c.name),
                source: c.source || 'scanner',
                batch_id: c.discovered_via || `scan-${new Date().toISOString().slice(0, 10)}`,
                confidence_score: c.confidence_score,
                quality_flags: Array.isArray(c.raw_tags) ? c.raw_tags : [],
                status: isApproved ? 'approved' : 'pending',
            };
        });

        const { data, error } = await supabase
            .from('artist_suggestions')
            .insert(rows);

        if (error) {
            console.error(`Error inserting chunk ${i / chunkSize + 1}:`, error.message);
        } else {
            stagedCount += rows.length;
            console.log(`Staged chunk ${i / chunkSize + 1}: +${rows.length} candidates.`);
        }
    }

    console.log(`\nFinished! Successfully staged ${stagedCount} candidates.`);
    console.log(`Auto-approved: ${approvedCount} (high trust), Pending: ${pendingCount}`);

    // Render into GitHub Actions Step Summary for on-screen monitoring
    writeGitHubStepSummary(candidates, {
        source: SOURCE,
        discovered: candidates.length,
        staged: stagedCount,
        approved: approvedCount,
        pending: pendingCount,
        catalogSize: initialCatalogSize,
    });
}

main().catch((err) => {
    console.error('Fatal scanner error:', err);
    process.exit(1);
});
