/**
 * scrapeLastFmArtists.js
 * 
 * Scrapes and aggregates artists, playcounts, and MBIDs from a user's Last.fm library
 * using the official AudioScrobbler REST API. Cross-references against MusicMood's catalog
 * in Supabase to spotlight existing anchors and discover missing underground bands.
 * 
 * Usage:
 *   node scripts/scrapeLastFmArtists.js --user=octakhan888
 *   node scripts/scrapeLastFmArtists.js --user=octakhan888 --pages=3
 *   node scripts/scrapeLastFmArtists.js --user=octakhan888 --all
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

// Parse CLI flags
const args = process.argv.slice(2);
function getArg(prefix, defaultVal) {
    const match = args.find(a => a.startsWith(prefix));
    return match ? match.split('=')[1] : defaultVal;
}

const TARGET_USER = getArg('--user=', 'octakhan888');
const API_KEY = getArg('--key=', process.env.LASTFM_API_KEY || 'd11784f5f2ef96e01a656f80734244e8');
const PAGES_LIMIT = args.includes('--all') ? Infinity : parseInt(getArg('--pages=', '1'), 10);
const MIN_PLAYS = parseInt(getArg('--min-plays=', '0'), 10);
const OUTPUT_FILE = getArg('--output=', path.resolve(process.cwd(), `scripts/cache/lastfm_${TARGET_USER}.json`));

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches a single page of library artists from Last.fm
 */
async function fetchLastFmLibraryPage(user, apiKey, page = 1, perPage = 100) {
    const url = `https://ws.audioscrobbler.com/2.0/?method=library.getartists&user=${encodeURIComponent(user)}&api_key=${apiKey}&format=json&limit=${perPage}&page=${page}`;
    
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'MusicMood-Catalog-Importer/1.0.0 (https://musicmood-ghx2.onrender.com)'
        }
    });

    if (!res.ok) {
        throw new Error(`Last.fm API HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (data.error) {
        throw new Error(`Last.fm API Error ${data.error}: ${data.message}`);
    }

    const artists = data.artists?.artist || [];
    const meta = data.artists?.['@attr'] || {};

    return {
        artists: Array.isArray(artists) ? artists : [artists],
        page: parseInt(meta.page || page, 10),
        totalPages: parseInt(meta.totalPages || 1, 10),
        totalArtists: parseInt(meta.total || 0, 10),
        perPage: parseInt(meta.perPage || perPage, 10)
    };
}

/**
 * Fetches existing artist names from MusicMood Supabase database
 */
async function fetchMusicMoodCatalogArtists() {
    console.log('🔄 Fetching catalog artists from Supabase public.artists...');
    const catalogMap = new Map(); // lowercase name -> artist record
    let offset = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('artists')
            .select('id, name, primary_genre_id, track_count, upvotes')
            .range(offset, offset + batchSize - 1);

        if (error) {
            console.warn('[Supabase] Warning fetching artists:', error.message);
            break;
        }

        if (!data || data.length === 0) {
            hasMore = false;
        } else {
            for (const row of data) {
                if (row.name) {
                    catalogMap.set(row.name.trim().toLowerCase(), row);
                }
            }
            offset += data.length;
            if (data.length < batchSize) hasMore = false;
        }
    }

    console.log(`✓ Loaded ${catalogMap.size} existing artists from MusicMood catalog.\n`);
    return catalogMap;
}

async function run() {
    console.log('====================================================');
    console.log(`📻 Last.fm Library Scraper & Catalog Analyzer`);
    console.log(`   User:       ${TARGET_USER}`);
    console.log(`   Target:     https://www.last.fm/user/${TARGET_USER}/library/artists`);
    console.log(`   Pages:      ${PAGES_LIMIT === Infinity ? 'ALL' : PAGES_LIMIT}`);
    console.log('====================================================\n');

    // 1. Fetch first page to inspect totals
    const firstPage = await fetchLastFmLibraryPage(TARGET_USER, API_KEY, 1, 100);
    const totalLibraryCount = firstPage.totalArtists;
    const totalPagesAvailable = firstPage.totalPages;

    console.log(`📊 Library Stats for @${TARGET_USER}:`);
    console.log(`   Total Artists: ${totalLibraryCount.toLocaleString()}`);
    console.log(`   Total Pages:   ${totalPagesAvailable} (100 artists/page)\n`);

    const maxPagesToFetch = Math.min(totalPagesAvailable, PAGES_LIMIT);
    const allScrapedArtists = [...firstPage.artists];

    // 2. Fetch remaining requested pages
    for (let p = 2; p <= maxPagesToFetch; p++) {
        process.stdout.write(`Fetching page ${p}/${maxPagesToFetch}... `);
        try {
            const pageData = await fetchLastFmLibraryPage(TARGET_USER, API_KEY, p, 100);
            allScrapedArtists.push(...pageData.artists);
            console.log(`✓ (${allScrapedArtists.length} collected)`);
        } catch (err) {
            console.log(`❌ Error: ${err.message}`);
            break;
        }
        await sleep(250); // Friendly rate limit
    }

    // 3. Filter by minimum plays if specified
    const filteredArtists = allScrapedArtists
        .map(a => ({
            name: a.name.trim(),
            playcount: parseInt(a.playcount || '0', 10),
            mbid: a.mbid || null,
            url: a.url || null
        }))
        .filter(a => a.playcount >= MIN_PLAYS);

    console.log(`\n✓ Collected ${filteredArtists.length} artists from Last.fm.\n`);

    // 4. Cross-check against MusicMood Supabase catalog
    const catalogMap = await fetchMusicMoodCatalogArtists();

    const matched = [];
    const missing = [];

    for (const a of filteredArtists) {
        const key = a.name.toLowerCase();
        if (catalogMap.has(key)) {
            matched.push({
                ...a,
                catalog: catalogMap.get(key)
            });
        } else {
            missing.push(a);
        }
    }

    // Sort both by user playcount
    matched.sort((a, b) => b.playcount - a.playcount);
    missing.sort((a, b) => b.playcount - a.playcount);

    // 5. Display Spotlight Report
    console.log('====================================================');
    console.log(`🎵 MUSICMOOD MATCH REPORT for @${TARGET_USER}`);
    console.log('====================================================');
    console.log(`✅ Already in MusicMood: ${matched.length} (${((matched.length / filteredArtists.length) * 100).toFixed(1)}%)`);
    console.log(`🔍 Missing from Catalog: ${missing.length} (${((missing.length / filteredArtists.length) * 100).toFixed(1)}% new discoveries)`);
    console.log('----------------------------------------------------');

    console.log(`\n🎧 Top 15 Matched Artists in User's Rotation:`);
    matched.slice(0, 15).forEach((m, idx) => {
        const cat = m.catalog;
        console.log(`  ${(idx + 1).toString().padStart(2, ' ')}. ${m.name.padEnd(28, ' ')} | Plays: ${m.playcount.toString().padStart(4, ' ')} | Genre: ${(cat.primary_genre_id || 'unknown').padEnd(16, ' ')} | In-DB Tracks: ${cat.track_count || 0}`);
    });

    console.log(`\n🔥 Top 15 Missing Discoveries (Ready to Harvest!):`);
    missing.slice(0, 15).forEach((m, idx) => {
        console.log(`  ${(idx + 1).toString().padStart(2, ' ')}. ${m.name.padEnd(28, ' ')} | Plays: ${m.playcount.toString().padStart(4, ' ')} | MBID: ${m.mbid || 'None'} | URL: ${m.url}`);
    });

    // 6. Save JSON cache for pipeline consumption
    const cacheDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    const payload = {
        scraped_at: new Date().toISOString(),
        user: TARGET_USER,
        total_scraped: filteredArtists.length,
        total_library: totalLibraryCount,
        matched_count: matched.length,
        missing_count: missing.length,
        matched_artists: matched,
        missing_artists: missing
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`\n💾 Full report saved to ${OUTPUT_FILE}`);
    console.log('====================================================\n');
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
