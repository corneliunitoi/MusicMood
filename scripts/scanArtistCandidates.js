// scripts/scanArtistCandidates.js
// -----------------------------------------------------------------------------
// Dynamic Library-Balancing Artist Candidate Scanner & Staging Engine
//
// Rather than targeting a single narrow micro-tag, this scanner generates a
// balanced, broad cohort of artist candidates across the entire musical
// spectrum, actively counter-balancing catalog deficits in public.artists.
//
// Cohort Composition (Target: 500 candidates):
// 1. Eclectic Human Curation (KEXP Radio Live Stream) ~100 candidates
// 2. Dynamic Library Deficit Balancing ~400 candidates
//    Divided evenly across under-represented and broad genre pillars:
//    - Blues (Delta, Chicago, Electric, Soul Blues)
//    - Country & Americana (Americana, Bluegrass, Outlaw, Alt-Country)
//    - Folk & Acoustic (Traditional, Contemporary, Indie Folk, Celtic)
//    - Avant-Garde & Experimental (Experimental, Drone, Post-Rock, Free Improvisation)
//    - Reggae, Latin & World (Afrobeat, Roots Reggae, Bossa Nova, Flamenco)
//    - R&B, Soul & Funk (Classic Soul, Neo-Soul, Funk, P-Funk)
//    - Ambient & Chill (Ambient, Downtempo, Atmospheric, Modern Composition)
//    - Jazz (Modal, Bebop, Cool Jazz, Spiritual Jazz)
//
// Guaranteed Deduplication:
// - Pre-loads all ~13,000+ artists from public.artists
// - Pre-loads all existing candidate suggestions from public.artist_suggestions
// - Normalizes names (strips diacritics, punctuation, casing, spacing)
//
// GitHub Actions UI Integration:
// - Live step terminal logs
// - Rich markdown table written to $GITHUB_STEP_SUMMARY for instant on-screen review
// -----------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { normalizeGenre } from '../src/services/genreNormalizer.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

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

const MODE = getArg('mode', getArg('source', 'balance')); // 'balance', 'kexp', 'genre'
const TARGET_GENRE = getArg('genre', getArg('tag', null));
const TARGET_COUNT = parseInt(getArg('count', '500'), 10);
const DRY_RUN = args.includes('--dry-run');

console.log('====================================================');
console.log('   DYNAMIC LIBRARY-BALANCING ARTIST SCANNER        ');
console.log('====================================================');
console.log(`Execution Mode: ${MODE}`);
console.log(`Target Limit:   ${TARGET_COUNT}`);
console.log(`Dry Run:        ${DRY_RUN}`);
console.log('====================================================\n');

/**
 * 8 Core Pillars for Catalog Balancing
 * Each pillar includes diverse representative tags to sample broadly.
 */
const BALANCING_PILLARS = [
    {
        id: 'blues',
        name: 'Blues',
        primary_genre_id: 'blues',
        tags: ['blues', 'delta blues', 'chicago blues', 'electric blues', 'soul blues'],
    },
    {
        id: 'country',
        name: 'Country & Americana',
        primary_genre_id: 'country',
        tags: ['americana', 'alt-country', 'bluegrass', 'outlaw country', 'country'],
    },
    {
        id: 'folk_acoustic',
        name: 'Folk & Acoustic',
        primary_genre_id: 'folk_acoustic',
        tags: ['folk', 'indie folk', 'traditional folk', 'acoustic folk', 'celtic folk'],
    },
    {
        id: 'avant_garde',
        name: 'Avant-Garde & Experimental',
        primary_genre_id: 'avant_garde',
        tags: ['experimental', 'drone', 'post-rock', 'free improvisation', 'noise music'],
    },
    {
        id: 'world_reggae',
        name: 'Reggae, Latin & World',
        primary_genre_id: 'world_reggae',
        tags: ['roots reggae', 'afrobeat', 'bossa nova', 'flamenco', 'dub'],
    },
    {
        id: 'rnb_soul',
        name: 'R&B, Soul & Funk',
        primary_genre_id: 'rnb_soul',
        tags: ['soul', 'funk', 'neo-soul', 'classic soul', 'rhythm and blues'],
    },
    {
        id: 'ambient_chill',
        name: 'Ambient & Chill',
        primary_genre_id: 'ambient_chill',
        tags: ['ambient', 'downtempo', 'chillout', 'atmospheric', 'modern classical'],
    },
    {
        id: 'jazz',
        name: 'Jazz & Fusion',
        primary_genre_id: 'jazz',
        tags: ['jazz', 'modal jazz', 'bebop', 'cool jazz', 'jazz fusion'],
    },
];

/**
 * Normalize artist name for strict fuzzy deduplication
 */
function normalizeArtistKey(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]/g, '')
        .trim();
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
 * Load all existing artists to guarantee zero duplicates
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

    // 1. Paginated load from public.artists
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

    console.log(`Dedup index ready: ${exactSet.size} unique artists indexed.\n`);
    return { exactSet, normalizedSet };
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
    if (/[a-f0-9]{8,}/.test(lower)) return true;
    return false;
}

/**
 * Fetch artists from Last.fm tag
 */
async function fetchArtistsForTag(tag, targetCount, library, genreInfo) {
    const artists = [];
    const limitPerPage = 100;
    const maxPages = 4;

    for (let page = 1; page <= maxPages; page++) {
        const url = `https://ws.audioscrobbler.com/2.0/?method=tag.gettopartists&tag=${encodeURIComponent(tag)}&api_key=${LASTFM_API_KEY}&format=json&limit=${limitPerPage}&page=${page}`;
        try {
            const res = await fetch(url);
            if (!res.ok) break;
            const json = await res.json();
            const list = json?.topartists?.artist || [];
            if (!Array.isArray(list) || list.length === 0) break;

            for (const item of list) {
                const name = item.name?.trim();
                if (!name) continue;

                const lowerName = name.toLowerCase();
                const normName = normalizeArtistKey(name);

                if (library.exactSet.has(lowerName) || library.normalizedSet.has(normName)) continue;
                if (looksLikeAISludge(name)) continue;

                library.exactSet.add(lowerName);
                library.normalizedSet.add(normName);

                artists.push({
                    name,
                    source: 'lastfm_tag',
                    discovered_via: `tag:${tag}`,
                    source_url: item.url || `https://www.last.fm/music/${encodeURIComponent(name)}`,
                    primary_genre_id: genreInfo?.primary_genre_id || null,
                    genre_label: genreInfo?.name || tag,
                    raw_tags: [tag],
                    estimated_listeners: parseInt(item.listeners || '0', 10),
                    confidence_score: 85,
                });

                if (artists.length >= targetCount) break;
            }

            if (artists.length >= targetCount) break;
            await new Promise((r) => setTimeout(r, 120));
        } catch {
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
    const maxPages = 20;

    console.log(`Sampling eclectic live human curation from KEXP radio stream...`);

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

                if (library.exactSet.has(lowerName) || library.normalizedSet.has(normName)) continue;
                if (looksLikeAISludge(name)) continue;

                library.exactSet.add(lowerName);
                library.normalizedSet.add(normName);

                // Dynamically resolve artist genre via Last.fm top tags (default to alt_rock, never null / other)
                let assignedGenre = 'alt_rock';
                if (LASTFM_API_KEY) {
                    try {
                        const tagUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(name)}&api_key=${LASTFM_API_KEY}&format=json`;
                        const tagRes = await fetch(tagUrl);
                        if (tagRes.ok) {
                            const tagData = await tagRes.json();
                            const tags = tagData?.toptags?.tag || [];
                            for (const t of tags.slice(0, 5)) {
                                const norm = normalizeGenre(t.name, name);
                                if (norm && norm !== 'other' && norm !== 'unknown') {
                                    assignedGenre = norm;
                                    break;
                                }
                            }
                        }
                    } catch { }
                }

                artists.push({
                    name,
                    source: 'kexp_live',
                    discovered_via: `kexp:${play.show_title || 'live_radio'}`,
                    source_url: `https://kexp.org/search/?q=${encodeURIComponent(name)}`,
                    primary_genre_id: assignedGenre,
                    genre_label: assignedGenre.replace(/_/g, ' '),
                    raw_tags: ['kexp_curated', assignedGenre],
                    estimated_listeners: 0,
                    confidence_score: 95,
                    demo_track_title: play.song || null,
                });

                if (artists.length >= targetCount) break;
            }

            nextUrl = data.next;
            await new Promise((r) => setTimeout(r, 150));
        } catch {
            break;
        }
    }

    console.log(`KEXP stream: gathered ${artists.length} new candidates.`);
    return artists;
}

/**
 * Execute Balanced Multi-Genre Discovery
 */
async function runBalancedDiscovery(targetCount, library) {
    const candidates = [];

    // 1. Eclectic Curation Quota (~20% of target: ~100 artists for 500 target)
    const kexpQuota = Math.min(100, Math.floor(targetCount * 0.20));
    const kexpArtists = await fetchKEXPPlays(kexpQuota, library);
    candidates.push(...kexpArtists);

    // 2. Dynamic Balancing Quota across the 8 Pillars (~80% of target)
    const remainingCount = targetCount - candidates.length;
    const perPillarQuota = Math.ceil(remainingCount / BALANCING_PILLARS.length);

    console.log(`\nBalancing Catalog: targeting ~${perPillarQuota} artists across each of the 8 key pillars...`);

    for (const pillar of BALANCING_PILLARS) {
        if (candidates.length >= targetCount) break;

        let pillarGathered = [];
        // Sample across the tags within this pillar
        for (const tag of pillar.tags) {
            const needed = perPillarQuota - pillarGathered.length;
            if (needed <= 0) break;

            const found = await fetchArtistsForTag(tag, needed, library, pillar);
            pillarGathered.push(...found);
        }

        console.log(`- ${pillar.name.padEnd(28)}: gathered ${pillarGathered.length} new candidates`);
        candidates.push(...pillarGathered);
    }

    return candidates.slice(0, targetCount);
}

/**
 * Write Markdown table summary to GitHub Actions Step Summary
 */
function writeGitHubStepSummary(candidates, stats) {
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryFile) {
        console.log('(GITHUB_STEP_SUMMARY not set, skipping action UI render)');
        return;
    }

    try {
        let md = `## ⚖️ Library-Balancing Artist Discovery Report\n\n`;
        md += `| Metric | Count |\n`;
        md += `| :--- | :--- |\n`;
        md += `| **Scanner Mode** | \`Library-Balancing General Scanner\` |\n`;
        md += `| **Discovered New Candidates** | **${stats.discovered}** |\n`;
        md += `| **Staged to \`public.artist_suggestions\`** | **${stats.staged}** |\n`;
        md += `| **Auto-Approved (Confidence >= 90)** | **${stats.approved}** |\n`;
        md += `| **Pending Review (Confidence < 90)** | **${stats.pending}** |\n`;
        md += `| **Existing Catalog Filtered (Zero Dups)** | \`${stats.catalogSize}\` artists |\n\n`;

        // Genre Breakdown Table
        md += `### 🎼 Balanced Cohort Breakdown\n\n`;
        md += `| Genre Pillar / Source | Candidates |\n`;
        md += `| :--- | :---: |\n`;
        for (const [genre, count] of Object.entries(stats.byGenre)) {
            md += `| **${escapeMd(genre)}** | ${count} |\n`;
        }
        md += `\n`;

        // First 100 Preview
        md += `### 📋 Staged Candidate Artists (Preview Sample)\n\n`;
        md += `| # | Artist Name | Genre Pillar | Source | Confidence | Status |\n`;
        md += `| :---: | :--- | :--- | :--- | :---: | :--- |\n`;

        const previewList = candidates.slice(0, 100);
        previewList.forEach((c, idx) => {
            const statusBadge = c.confidence_score >= 90 ? '🟢 Auto-Approved' : '🟡 Pending Review';
            md += `| ${idx + 1} | **${escapeMd(c.name)}** | ${escapeMd(c.genre_label)} | \`${escapeMd(c.discovered_via)}\` | ${c.confidence_score}% | ${statusBadge} |\n`;
        });

        if (candidates.length > 100) {
            md += `\n*... and ${candidates.length - 100} more balanced candidates staged.* Check \`public.artist_suggestions\` in Supabase.\n`;
        }

        fs.appendFileSync(summaryFile, md, 'utf8');
        console.log(`Successfully wrote ${candidates.length} artist summary to $GITHUB_STEP_SUMMARY.`);
    } catch (e) {
        console.warn('Failed to write to $GITHUB_STEP_SUMMARY:', e.message);
    }
}

function escapeMd(text) {
    if (!text) return '';
    return text.replace(/\|/g, '\\|');
}

/**
 * Main execution flow
 */
async function main() {
    const library = await loadExistingLibraryKeys();
    const initialCatalogSize = library.exactSet.size;

    let candidates = [];

    if (MODE === 'kexp') {
        candidates = await fetchKEXPPlays(TARGET_COUNT, library);
    } else if (MODE === 'genre' && TARGET_GENRE) {
        const pillar = BALANCING_PILLARS.find((p) => p.id === TARGET_GENRE || p.tags.includes(TARGET_GENRE));
        candidates = await fetchArtistsForTag(TARGET_GENRE, TARGET_COUNT, library, pillar);
    } else {
        // Default: Full multi-genre balancing scan
        candidates = await runBalancedDiscovery(TARGET_COUNT, library);
    }

    console.log(`\nDiscovered ${candidates.length} unique, verified new candidates.`);

    if (candidates.length === 0) {
        console.log('No new candidates found to stage. Exiting.');
        return;
    }

    // Compute genre distribution
    const byGenre = {};
    for (const c of candidates) {
        const label = c.genre_label || 'Other';
        byGenre[label] = (byGenre[label] || 0) + 1;
    }

    console.log('\n--- COHORT DISTRIBUTION ---');
    for (const [g, count] of Object.entries(byGenre)) {
        console.log(`- ${g.padEnd(30)}: ${count} artists`);
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
                primary_genre_id: c.primary_genre_id && c.primary_genre_id !== 'other' ? c.primary_genre_id : 'alt_rock',
                quality_flags: Array.isArray(c.raw_tags) ? c.raw_tags : [],
                status: isApproved ? 'approved' : 'pending',
                demo_track_title: c.demo_track_title || null,
            };
        });

        const { error } = await supabase
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
        source: MODE,
        discovered: candidates.length,
        staged: stagedCount,
        approved: approvedCount,
        pending: pendingCount,
        catalogSize: initialCatalogSize,
        byGenre,
    });
}

main().catch((err) => {
    console.error('Fatal scanner error:', err);
    process.exit(1);
});
