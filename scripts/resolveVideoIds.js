import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { normalizeGenre, isSongCandidate } from '../src/services/genreNormalizer.js';
import { fetchMusicBrainzArtistGenres } from '../src/services/musicBrainzService.js';

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const BATCH_SIZE = 50;
const useInnertube = process.argv.includes('--innertube') || process.env.npm_config_innertube === 'true';
const BASE_DELAY_MS = useInnertube ? 450 : 2200; // 450ms for Innertube JSON, 2200ms for Desktop HTML

const isRandom = process.argv.includes('--random') || process.env.npm_config_random === 'true';
const cueOnly = process.argv.includes('--cue-only') || process.env.npm_config_cue_only === 'true';
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const MAX_TRACKS = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
const artistCache = new Map();
let consecutiveZeroes = 0;

/**
 * Detects and heals CP1251 (Cyrillic) mojibake decoded as ISO-8859-1/Latin1.
 * Example: "Îáðàòíûé ïðîöåññ" -> "Обратный процесс"
 */
function fixMojibake(str) {
    if (!str) return str;
    const mojibakeCount = (str.match(/[À-ÿ]/g) || []).length;
    if (mojibakeCount < 2) return str;

    try {
        const buf = Buffer.from(str, 'latin1');
        let decoded = '';
        for (let i = 0; i < buf.length; i++) {
            const b = buf[i];
            if (b >= 0xC0 && b <= 0xFF) {
                // Russian А-Я (0x410 - 0x42F), а-я (0x430 - 0x44F)
                decoded += String.fromCharCode(0x0410 + (b - 0xC0));
            } else if (b === 0xA8) {
                decoded += 'Ё';
            } else if (b === 0xB8) {
                decoded += 'ё';
            } else {
                decoded += String.fromCharCode(b);
            }
        }
        if (/[а-яА-ЯёЁ]/.test(decoded)) {
            return decoded;
        }
    } catch (e) { }
    return str;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Verifies that the YouTube search candidate actually matches the requested song title and artist.
 * Prevents mapping completely different songs to random channel trailers or gameplay walkthroughs.
 */
function titlesMatch(targetTitle, ytVideoTitle) {
    if (!targetTitle || !ytVideoTitle) return false;
    const cleanTarget = targetTitle.toLowerCase().replace(/[^a-z0-9а-яё]/gi, ' ').trim();
    const cleanYt = ytVideoTitle.toLowerCase().replace(/[^a-z0-9а-яё]/gi, ' ').trim();

    if (cleanYt.includes(cleanTarget) || cleanTarget.includes(cleanYt)) return true;

    const targetWords = cleanTarget.split(/\s+/).filter(w => w.length > 2);
    if (targetWords.length === 0) return true;
    const matchedWords = targetWords.filter(w => cleanYt.includes(w));
    return (matchedWords.length / targetWords.length) >= 0.5;
}

/**
 * Resolves a track using the lightweight YouTube Music Innertube JSON API (~300ms, pure JSON).
 */
async function resolveInnertubeTrack(artist, trackName) {
    const gateCheck = isSongCandidate({ title: trackName, artist });
    if (!gateCheck.pass) {
        return { status: 'JUNK', reason: gateCheck.reason };
    }

    const healedArtistTag = fixMojibake(artist);
    const healedTitleTag = fixMojibake(trackName);

    let cleanArtist = (healedArtistTag || '')
        .replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '')
        .replace(/\[[^\]]+\]/g, '')
        .replace(/["“”«»]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    let cleanTitle = (healedTitleTag || '')
        .replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '')
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

        if (res.status === 429) {
            return { status: 'RATE_LIMITED' };
        }
        if (!res.ok) {
            return { status: 'ERROR', code: res.status };
        }

        const data = await res.json();
        const candidates = [];

        function extractItems(obj) {
            if (!obj || typeof obj !== 'object') return;

            // 1. MusicCardShelf (Top Result)
            if (obj.musicCardShelfRenderer) {
                const shelf = obj.musicCardShelfRenderer;
                const title = shelf.title?.runs?.[0]?.text || '';
                const author = shelf.subtitle?.runs?.[0]?.text || '';
                const videoId = shelf.onTap?.watchEndpoint?.videoId;
                if (videoId && videoId.length === 11) {
                    candidates.push({ videoId, title, author });
                }
            }

            // 2. Song list items
            if (obj.musicResponsiveListItemRenderer) {
                const item = obj.musicResponsiveListItemRenderer;
                const flexCols = item.flexColumns || [];
                const title = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
                const author = flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
                const videoId = item.playlistItemData?.videoId || item.doubleTapCommand?.watchEndpoint?.videoId;
                if (videoId && videoId.length === 11) {
                    candidates.push({ videoId, title, author });
                }
            }

            for (const v of Object.values(obj)) {
                extractItems(v);
            }
        }

        extractItems(data);

        for (const cand of candidates) {
            if (titlesMatch(cleanTitle, cand.title)) {
                return {
                    status: 'FOUND',
                    videoId: cand.videoId,
                    matchedTitle: cand.title,
                    healedTitle: healedTitleTag !== trackName ? healedTitleTag : null,
                    healedArtist: cleanArtist !== artist ? cleanArtist : null,
                    engine: 'innertube'
                };
            }
        }

        if (candidates.length === 0) {
            return { status: 'ZERO_CANDIDATES' };
        }

        return {
            status: 'NO_MATCH',
            healedTitle: healedTitleTag !== trackName ? healedTitleTag : null,
            candidatesSeen: candidates.length
        };
    } catch (e) {
        return { status: 'ERROR', error: e.message };
    }
}

/**
 * Resolves a track to a verified YouTube video ID with zero API quota consumption.
 * Includes rate-limit retry, title verification, mojibake healing, and bot-throttle detection.
 */
async function resolveYouTubeTrack(artist, trackName, retryCount = 0) {
    // 1. Gatekeeper: Ensure it is a genuine song and not junk / stem / podcast
    const gateCheck = isSongCandidate({ title: trackName, artist });
    if (!gateCheck.pass) {
        return { status: 'JUNK', reason: gateCheck.reason };
    }

    // 2. Auto-heal mojibake
    const healedArtistTag = fixMojibake(artist);
    const healedTitleTag = fixMojibake(trackName);

    let cleanArtist = (healedArtistTag || '')
        .replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '')
        .replace(/\[[^\]]+\]/g, '')
        .replace(/["“”«»]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    let cleanTitle = (healedTitleTag || '')
        .replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '')
        .replace(/\((Alternate|Remix|Live|Stem|Dublex|Prod\.|Demo|Version|Remaster).*?\)/gi, '')
        .replace(/\[.*?\]/g, '')
        .replace(/["“”«»]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const isNumericArtist = !cleanArtist || /^[0-9]+$/.test(cleanArtist);
    const primaryArtist = cleanArtist.split(/[,;&]/)[0].trim();

    const queries = [];
    if (!isNumericArtist) {
        queries.push(`"${cleanArtist}" "${cleanTitle}" Topic`);
        queries.push(`"${cleanArtist}" "${cleanTitle}"`);
        queries.push(`${cleanArtist} ${cleanTitle}`);
        if (primaryArtist && primaryArtist !== cleanArtist) {
            queries.push(`"${primaryArtist}" "${cleanTitle}" Topic`);
            queries.push(`${primaryArtist} ${cleanTitle}`);
        }
    } else {
        queries.push(`"${cleanTitle}" Topic`);
        queries.push(`${cleanTitle}`);
    }

    let totalCandidatesSeen = 0;

    for (const q of queries) {
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cookie': 'SOCS=CAESEwgDEgk2OTg5MTcyMDcaAmVuIAEaBgiA_LyaBg;'
                }
            });

            // Handle 429 Too Many Requests
            if (res.status === 429) {
                if (retryCount < 3) {
                    const waitSec = 25 * (retryCount + 1);
                    console.warn(`\n⏳ YouTube 429 Rate Limit hit. Backing off for ${waitSec}s (Retry ${retryCount + 1}/3)...`);
                    await sleep(waitSec * 1000);
                    return resolveYouTubeTrack(artist, trackName, retryCount + 1);
                }
                return { status: 'RATE_LIMITED' };
            }

            if (!res.ok) continue;

            const html = await res.text();

            // Extract ytInitialData robustly without fragile single-line regex
            const startIdx = html.indexOf('var ytInitialData =');
            if (startIdx === -1) continue;

            const scriptCloseIdx = html.indexOf('</script>', startIdx);
            if (scriptCloseIdx === -1) continue;

            const slice = html.substring(startIdx + 'var ytInitialData ='.length, scriptCloseIdx).trim().replace(/;$/, '');
            let data;
            try {
                data = JSON.parse(slice);
            } catch (e) {
                continue;
            }

            const candidateVideos = [];

            function extractVideos(obj) {
                if (!obj || typeof obj !== 'object') return;
                if (obj.videoRenderer) {
                    const vr = obj.videoRenderer;
                    const videoId = vr.videoId;
                    const vTitle = vr.title?.runs?.[0]?.text || vr.title?.simpleText || '';
                    const vAuthor = vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || '';
                    if (videoId && videoId.length === 11) {
                        candidateVideos.push({ videoId, title: vTitle, author: vAuthor });
                    }
                    return;
                }
                for (const v of Object.values(obj)) {
                    extractVideos(v);
                }
            }

            extractVideos(data);
            totalCandidatesSeen += candidateVideos.length;

            // Find first video that genuinely matches both the track title and artist
            for (const candidate of candidateVideos) {
                if (titlesMatch(cleanTitle, candidate.title)) {
                    const candAuthor = (candidate.author || '').toLowerCase();
                    const candTitle = (candidate.title || '').toLowerCase();
                    const primLower = primaryArtist.toLowerCase();
                    const primCleanNoSpace = primLower.replace(/\s+/g, '');
                    const authorCleanNoSpace = candAuthor.replace(/\s+/g, '');

                    // Match artist name (handles "SteveVaiHimself" matching "Steve Vai", and Topic channels)
                    const artistMatches = isNumericArtist || 
                        !candAuthor || 
                        candAuthor.includes('topic') || 
                        candAuthor.includes(primLower) || 
                        candTitle.includes(primLower) || 
                        (primCleanNoSpace.length > 3 && authorCleanNoSpace.includes(primCleanNoSpace));

                    if (!artistMatches) {
                        continue; // Skip video from completely unrelated channel
                    }

                    let finalArtist = cleanArtist;
                    if (isNumericArtist && candidate.author) {
                        finalArtist = candidate.author.replace(/\s*-\s*Topic$/i, '').trim();
                    }
                    return {
                        status: 'FOUND',
                        videoId: candidate.videoId,
                        matchedTitle: candidate.title,
                        healedTitle: healedTitleTag !== trackName ? healedTitleTag : null,
                        healedArtist: finalArtist !== artist ? finalArtist : null
                    };
                }
            }

        } catch (e) {
            // Network glitch
        }
    }

    if (totalCandidatesSeen === 0) {
        return { status: 'ZERO_CANDIDATES', healedTitle: healedTitleTag !== trackName ? healedTitleTag : null };
    }

    return { status: 'NOT_FOUND', healedTitle: healedTitleTag !== trackName ? healedTitleTag : null };
}

async function getOrCreateArtistMetadata(artistName, defaultGenre) {
    if (!artistName) return null;
    if (artistCache.has(artistName)) return artistCache.get(artistName);

    try {
        const { data: existing } = await supabase
            .from('artists')
            .select('id, primary_genre_id, secondary_genre_ids')
            .eq('name', artistName)
            .maybeSingle();

        if (existing) {
            let secondary = existing.secondary_genre_ids || [];
            let primary = existing.primary_genre_id || defaultGenre;

            // If existing artist has no secondary genres, enrich lazily via MusicBrainz
            if (secondary.length === 0) {
                const mbData = await fetchMusicBrainzArtistGenres(artistName);
                if (mbData) {
                    secondary = mbData.secondary_genre_ids || [];
                    if (mbData.primary_genre_id) primary = mbData.primary_genre_id;
                    await supabase.from('artists').update({
                        primary_genre_id: primary,
                        secondary_genre_ids: secondary,
                        tags: mbData.tags || [],
                        mbid: mbData.mbid || null
                    }).eq('id', existing.id);
                }
            }

            const info = { id: existing.id, primaryGenre: primary, secondaryGenres: secondary };
            artistCache.set(artistName, info);
            return info;
        }

        // Brand new artist: query MusicBrainz first
        const mbData = await fetchMusicBrainzArtistGenres(artistName);
        const primary = mbData?.primary_genre_id || defaultGenre;
        const secondary = mbData?.secondary_genre_ids || [];
        const slug = artistName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        const { data: inserted } = await supabase
            .from('artists')
            .insert({
                name: artistName,
                slug,
                primary_genre_id: primary,
                secondary_genre_ids: secondary,
                tags: mbData?.tags || [],
                mbid: mbData?.mbid || null,
                track_count: 1
            })
            .select('id')
            .maybeSingle();

        const info = { id: inserted?.id || null, primaryGenre: primary, secondaryGenres: secondary };
        artistCache.set(artistName, info);
        return info;
    } catch (e) {
        // Non-fatal artist link exception
    }
    return { id: null, primaryGenre: defaultGenre, secondaryGenres: [] };
}

async function startResolver() {
    console.log("=================================================");
    console.log("🚀 MusicMood Hardened Local Disk -> Catalog Converter");
    console.log("   • Source: public.local_metadata (44.8k archive)");
    console.log("   • Target: public.tracks (Playable catalog)");
    console.log("   • Automatic CP1251 Cyrillic Mojibake Healing");
    console.log("   • Canonical Taxonomy Genre Normalization (115 IDs)");
    console.log("   • Song-Only Gatekeeper (Stems & Compilations filtered)");
    console.log(isRandom ? "   • Sampling: RANDOM 🎲 (Diverse artists across library)" : "   • Sampling: SEQUENTIAL (pass --random for diverse artists)");
    console.log(useInnertube ? "   • Engine: INNERTUBE ⚡ (YouTube Music Private JSON API ~300ms)" : "   • Engine: DESKTOP_SCRAPER 🛡️ (Standard HTML Scraper 2.2s)");
    if (cueOnly) console.log("   • Target Filter: CUE ONLY 💿 (source = 'ko-local:cue')");
    if (MAX_TRACKS !== Infinity) console.log(`   • Run Limit: ${MAX_TRACKS} tracks`);
    console.log("=================================================\n");

    let totalResolved = 0;
    let totalSkipped = 0;
    let isRunning = true;

    process.on('SIGINT', () => {
        console.log("\n🛑 Stopping gracefully...");
        isRunning = false;
    });

    while (isRunning) {
        if (totalResolved >= MAX_TRACKS) {
            console.log(`\n🎯 Run limit of ${MAX_TRACKS} tracks reached.`);
            break;
        }

        // 1. Fetch unmapped tracks from public.local_metadata archive
        let records;
        let error;

        if (isRandom && !cueOnly) {
            const res = await supabase.rpc('get_random_unmapped_local_tracks', { batch_size: BATCH_SIZE });
            records = res.data;
            error = res.error;
        } else {
            let query = supabase
                .from('local_metadata')
                .select('id, artist, track_name, genre')
                .is('youtube_video_id', null);

            if (cueOnly) {
                query = query.eq('source', 'ko-local:cue');
            }

            const fetchLimit = Math.min(BATCH_SIZE, MAX_TRACKS - totalResolved);
            if (fetchLimit <= 0) break;

            const res = await query.limit(fetchLimit);
            records = res.data;
            error = res.error;
        }

        if (error) {
            console.error("❌ Supabase query error:", error.message);
            process.exit(1);
        }

        if (!records || records.length === 0) {
            console.log("\n🎉 All tracks in local_metadata have been mapped! Zero unmapped tracks remaining.");
            break;
        }

        console.log(`📦 Processing batch of ${records.length} tracks from local_metadata...`);

        for (const record of records) {
            if (!isRunning) break;

            let res;
            if (useInnertube) {
                res = await resolveInnertubeTrack(record.artist, record.track_name);
                // Hybrid fallback: If Innertube had 0 candidates (e.g. obscure track), check desktop scraper
                if (res.status === 'ZERO_CANDIDATES' || res.status === 'NO_MATCH') {
                    const fallbackRes = await resolveYouTubeTrack(record.artist, record.track_name);
                    if (fallbackRes.status === 'FOUND') {
                        res = fallbackRes;
                    }
                }
            } else {
                res = await resolveYouTubeTrack(record.artist, record.track_name);
            }

            if (res.status === 'RATE_LIMITED') {
                console.warn(`🛑 Rate limit persistent. Cooling down for 45s before continuing...`);
                await sleep(45000);
                continue; // Do NOT flag as unresolved!
            }

            if (res.status === 'ZERO_CANDIDATES') {
                consecutiveZeroes++;
                if (consecutiveZeroes >= 2) {
                    console.warn(`\n⏳ YouTube anti-bot cooldown detected (${consecutiveZeroes} empty pages in a row). Pausing polite resolver for 35s...`);
                    await sleep(35000);
                    consecutiveZeroes = 0;
                }
                console.log(`[Cooldown ⏸️] Anti-bot / empty results: "${record.artist} - ${res.healedTitle || record.track_name}" (Leaving unmapped for next run)`);
                continue; // Do NOT flag as unresolved!
            }

            consecutiveZeroes = 0;

            if (res.status === 'JUNK') {
                console.log(`[Junk Filter 🗑️] ${res.reason || 'Non-music'}: "${record.artist} - ${record.track_name}"`);
                await supabase.from('local_metadata').update({ youtube_video_id: 'CORRUPT_TAGS' }).eq('id', record.id);
                continue;
            }

            if (res.status === 'FOUND' && res.videoId) {
                const finalArtist = res.healedArtist || record.artist;
                const finalTitle = res.healedTitle || record.track_name;
                const finalGenre = normalizeGenre(record.genre, finalArtist, finalTitle, 'rock') || 'rock';

                // 1. Ensure artist exists in public.artists with multi-genre metadata
                const artistInfo = await getOrCreateArtistMetadata(finalArtist, finalGenre);
                const artistId = artistInfo?.id || null;
                const effectivePrimary = artistInfo?.primaryGenre || finalGenre;
                const effectiveSecondary = artistInfo?.secondaryGenres || [];

                // 2. Update local_metadata
                await supabase
                    .from('local_metadata')
                    .update({ youtube_video_id: res.videoId })
                    .eq('id', record.id);

                // 3. Insert verified playable track into public.tracks
                const { data: existing } = await supabase
                    .from('tracks')
                    .select('id')
                    .eq('youtube_video_id', res.videoId)
                    .limit(1);

                if (!existing || existing.length === 0) {
                    const { error: insertError } = await supabase.from('tracks').insert({
                        title: finalTitle,
                        artist: finalArtist,
                        artist_id: artistId,
                        primary_genre_id: effectivePrimary,
                        secondary_genre_ids: effectiveSecondary,
                        youtube_video_id: res.videoId,
                        source: 'local_disk_resolved'
                    });

                    if (insertError) {
                        console.error(`❌ DB Insert Error for "${finalArtist} - ${finalTitle}" (${effectivePrimary}):`, insertError.message);
                        continue;
                    }
                }

                totalResolved++;
                const healedNote = (res.healedTitle || res.healedArtist) ? ' 🩹 [Healed]' : '';
                const multiNote = effectiveSecondary.length > 0 ? ` + [${effectiveSecondary.slice(0, 3).join(', ')}]` : '';
                console.log(`[${totalResolved}] ✅ Mapped to Catalog: "${finalArtist} - ${finalTitle}" -> ${res.videoId} (${effectivePrimary}${multiNote})${healedNote}`);
            } else {
                totalSkipped++;
                console.log(`[Skip] ⏭️ No verified match: "${record.artist} - ${res.healedTitle || record.track_name}" (Flagged UNRESOLVED in archive)`);
                await supabase.from('local_metadata').update({ youtube_video_id: 'UNRESOLVED' }).eq('id', record.id);
            }

            // Polite delay: ~450ms-650ms for Innertube, ~2200ms-3000ms for Desktop Scraper
            const jitter = useInnertube ? Math.floor(Math.random() * 200) : Math.floor(Math.random() * 800);
            await sleep(BASE_DELAY_MS + jitter);
        }
    }

    console.log("\n=================================================");
    console.log(`Summary: ${totalResolved} mapped to catalog, ${totalSkipped} unresolved.`);
    console.log("=================================================");
}

export { resolveYouTubeTrack, resolveInnertubeTrack };

// Only auto-run when invoked directly from CLI
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/resolveVideoIds.js')) {
    startResolver();
}
