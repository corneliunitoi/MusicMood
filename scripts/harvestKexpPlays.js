/**
 * harvestKexpPlays.js
 * 
 * Curated Radio Harvester for MusicMood.
 * Harvests real human-vetted track selections from KEXP Seattle's public API (https://api.kexp.org/v2/plays/).
 * Routes all candidate tracks into the `public.track_suggestions` staging area with
 * automated Anti-AI, release year, and studio audio verification.
 * 
 * Usage:
 *   node scripts/harvestKexpPlays.js --pages=5
 *   node scripts/harvestKexpPlays.js --pages=10 --auto-promote
 *   node scripts/harvestKexpPlays.js --pages=2 --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { normalizeGenre, isSongCandidate, VALID_GENRE_IDS } from '../src/services/genreNormalizer.js';
import { GENRE_NODES } from '../src/services/tasteGraph.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

const args = process.argv.slice(2);
function getArg(prefix, defaultVal) {
    const match = args.find(a => a.startsWith(prefix));
    return match ? match.split('=')[1] : defaultVal;
}

const PAGES = parseInt(getArg('--pages=', '5'), 10);
const BATCH_ID = getArg('--batch=', `kexp-${new Date().toISOString().slice(0, 10)}`);
const IS_DRY_RUN = args.includes('--dry-run');
const AUTO_PROMOTE = args.includes('--auto-promote');

// Whitelist of renowned labels with guaranteed human curation and high production
const TRUSTED_LABELS = new Set([
    'ecm', 'blue note', 'warp', '4ad', 'sub pop', 'ninja tune', 'daptone',
    'kscope', 'gondwana', 'nonesuch', 'touch', 'hyperdub', 'matador', 'rough trade',
    'domino', 'drag city', 'stones throw', 'ghostly international', 'brainfeeder',
    'thrill jockey', 'sacred bones', 'jagjaguwar', 'milan', 'mote-evolver', 'erased tapes'
]);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function titlesMatch(targetTitle, ytVideoTitle) {
    if (!targetTitle || !ytVideoTitle) return false;
    const cleanTarget = targetTitle.toLowerCase().replace(/[^a-z0-9]/gi, ' ').trim();
    const cleanYt = ytVideoTitle.toLowerCase().replace(/[^a-z0-9]/gi, ' ').trim();

    if (cleanYt.includes(cleanTarget) || cleanTarget.includes(cleanYt)) return true;

    const targetWords = cleanTarget.split(/\s+/).filter(w => w.length > 2);
    if (targetWords.length === 0) return true;
    const matchedWords = targetWords.filter(w => cleanYt.includes(w));
    return (matchedWords.length / targetWords.length) >= 0.5;
}

/**
 * Resolves track to YouTube Music stream via InnerTube WEB_REMIX API.
 * Prioritizes official "Artist - Topic" or official releases over generic user uploads.
 */
async function resolveInnertube(artist, trackName) {
    const cleanArtist = artist.replace(/["“”«»]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanTitle = trackName
        .replace(/\((Alternate|Remix|Live|Stem|Dublex|Prod\.|Demo|Version|Remaster).*?\)/gi, '')
        .replace(/\[.*?\]/g, '')
        .replace(/["“”«»]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const query = `${cleanArtist} ${cleanTitle}`.trim();
    const body = {
        context: {
            client: {
                clientName: 'WEB_REMIX',
                clientVersion: '1.20240101.01.00',
                hl: 'en',
                gl: 'US'
            }
        },
        query
    };

    try {
        const res = await fetch('https://music.youtube.com/youtubei/v1/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Origin': 'https://music.youtube.com',
                'Referer': 'https://music.youtube.com/'
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) return null;
        const data = await res.json();
        const candidates = [];

        function extractItems(obj) {
            if (!obj || typeof obj !== 'object') return;
            if (obj.musicCardShelfRenderer) {
                const shelf = obj.musicCardShelfRenderer;
                const videoId = shelf.title?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
                const title = shelf.title?.runs?.[0]?.text;
                const subtitle = shelf.subtitle?.runs?.map(r => r.text).join('') || '';
                if (videoId) candidates.push({ videoId, title, subtitle, shelf: true });
            }
            if (obj.musicResponsiveListItemRenderer) {
                const item = obj.musicResponsiveListItemRenderer;
                const videoId = item.playlistItemData?.videoId ||
                    item.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
                const runs = item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
                const title = runs ? runs.map(r => r.text).join('') : '';
                const subtitle = item.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map(r => r.text).join('') || '';
                if (videoId) candidates.push({ videoId, title, subtitle });
            }
            for (const key of Object.keys(obj)) {
                if (Array.isArray(obj[key])) {
                    obj[key].forEach(extractItems);
                } else if (typeof obj[key] === 'object') {
                    extractItems(obj[key]);
                }
            }
        }

        extractItems(data);

        // Prioritize candidates with title match and official album/track subtitle
        for (const cand of candidates) {
            if (titlesMatch(cleanTitle, cand.title)) {
                const isTopic = cand.subtitle?.toLowerCase().includes('topic') || cand.shelf;
                return { videoId: cand.videoId, title: cand.title, isTopic };
            }
        }

        if (candidates.length > 0) {
            return { videoId: candidates[0].videoId, title: candidates[0].title, isTopic: false };
        }

        return null;
    } catch {
        return null;
    }
}

async function fetchKexpPlays(page = 1) {
    const limit = 50;
    const offset = (page - 1) * limit;
    const url = `https://api.kexp.org/v2/plays/?limit=${limit}&offset=${offset}`;

    const res = await fetch(url, {
        headers: { 'User-Agent': 'MusicMood-Harvester/1.0.0 (contact@musicmood.app)' }
    });
    if (!res.ok) {
        throw new Error(`KEXP API HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.results || [];
}

async function run() {
    console.log('================================================================');
    console.log('📻 KEXP SEATTLE HUMAN-CURATED RADIO HARVESTER');
    console.log(`   Batch ID:      ${BATCH_ID}`);
    console.log(`   Pages to Scan: ${PAGES} (~${PAGES * 50} plays)`);
    console.log(`   Destination:   public.track_suggestions staging table`);
    console.log(`   Execution:     ${IS_DRY_RUN ? 'DRY RUN (Audit Only)' : 'LIVE STAGING WRITES'}`);
    console.log('================================================================\n');

    let totalStaged = 0;
    let totalSkipped = 0;

    for (let p = 1; p <= PAGES; p++) {
        console.log(`\n📥 Fetching KEXP Broadcast page ${p}/${PAGES}...`);
        let plays = [];
        try {
            plays = await fetchKexpPlays(p);
        } catch (e) {
            console.error(`Failed to fetch page ${p}:`, e.message);
            break;
        }

        for (const play of plays) {
            // Drop station IDs, air breaks, or voiceovers
            if (play.play_type !== 'trackplay' || !play.artist || !play.song) {
                continue;
            }

            const cleanArtist = play.artist.trim();
            const cleanTitle = play.song.trim();

            // 1. Song Candidate Filter
            const gate = isSongCandidate({ title: cleanTitle, artist: cleanArtist });
            if (!gate.pass) {
                totalSkipped++;
                continue;
            }

            // 2. Anti-AI & Quality Firewall Evaluation
            let confidenceScore = 80; // Base: vetted by KEXP human DJ
            const qualityFlags = ['kexp_human_selector'];

            let releaseYear = null;
            if (play.release_date) {
                const yearMatch = play.release_date.match(/\b(19\d\d|20\d\d)\b/);
                if (yearMatch) {
                    releaseYear = parseInt(yearMatch[1], 10);
                }
            }

            // Pre-2023 release check (Zero generative AI probability)
            if (releaseYear && releaseYear < 2023) {
                confidenceScore += 15;
                qualityFlags.push('pre_2023');
            } else if (releaseYear && releaseYear >= 2024) {
                // Post-2024: check label against trusted whitelist
                const labelLower = (play.label || '').toLowerCase();
                const isTrustedLabel = Array.from(TRUSTED_LABELS).some(tl => labelLower.includes(tl));
                if (isTrustedLabel) {
                    confidenceScore += 10;
                    qualityFlags.push('whitelisted_label');
                } else {
                    qualityFlags.push('post_2024_unverified_label');
                }
            }

            // 3. Resolve Canonical Genre
            const canonicalGenre = normalizeGenre(play.comment || '', cleanArtist, cleanTitle, 'rock');

            // 4. Resolve Studio YouTube Audio
            const yt = await resolveInnertube(cleanArtist, cleanTitle);
            if (!yt || !yt.videoId || yt.videoId.length !== 11) {
                totalSkipped++;
                continue;
            }

            if (yt.isTopic) {
                confidenceScore += 5;
                qualityFlags.push('topic_channel');
            }

            console.log(`   ⭐ [Score: ${confidenceScore}] "${cleanTitle}" by ${cleanArtist} (${canonicalGenre}) -> ${yt.videoId} [${qualityFlags.join(', ')}]`);

            if (!IS_DRY_RUN) {
                // Insert into public.track_suggestions staging table
                const { error: insErr } = await supabase
                    .from('track_suggestions')
                    .insert({
                        batch_id: BATCH_ID,
                        artist: cleanArtist,
                        title: cleanTitle,
                        album: play.album || null,
                        release_year: releaseYear,
                        label: play.label || null,
                        primary_genre_id: canonicalGenre,
                        youtube_video_id: yt.videoId,
                        source: 'kexp_radio',
                        confidence_score: confidenceScore,
                        quality_flags: qualityFlags,
                        status: confidenceScore >= 95 ? 'approved' : 'pending'
                    });

                if (insErr) {
                    console.warn(`      ❌ Staging insert error: ${insErr.message}`);
                } else {
                    totalStaged++;
                }
            } else {
                totalStaged++;
            }

            await sleep(150);
        }

        await sleep(300);
    }

    console.log('\n================================================================');
    console.log(`🏁 KEXP HARVEST COMPLETED: +${totalStaged} tracks staged, ${totalSkipped} non-music/unresolved skipped.`);
    console.log('================================================================\n');

    if (AUTO_PROMOTE && !IS_DRY_RUN && totalStaged > 0) {
        console.log('🚀 Auto-promoting approved suggestions into production...');
        const { execSync } = await import('child_process');
        execSync(`node scripts/promoteSuggestions.js --batch=${BATCH_ID} --auto-promote --min-score=90`, { stdio: 'inherit' });
    }
}

run().catch(err => {
    console.error('Fatal KEXP harvest error:', err);
    process.exit(1);
});
