import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ ERROR: Supabase credentials missing in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const BATCH_SIZE = 50;
const BASE_DELAY_MS = 1800; // Polite delay between tracks to avoid triggering rate limits

const JUNK_ARTIST_REGEX = /^(cd\s*[0-9]+|disc\s*[0-9]+|track\s*[0-9]+|unknown(\s*artist)?)$/i;
const JUNK_TITLE_REGEX = /^[0-9]+$/;
const NON_MUSIC_TERMS = ['recitation', 'audiobook', 'lesson', 'speaking', 'chinese', 'meditation guide', 'podcast', 'episode'];

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

function isCorruptedJunk(artist, title) {
    if (!title || title.trim().length < 2) return true;
    if (JUNK_TITLE_REGEX.test(title.trim())) return true;
    const lowerTitle = title.toLowerCase();
    const lowerArtist = (artist || '').toLowerCase();
    if (NON_MUSIC_TERMS.some(t => lowerTitle.includes(t) || lowerArtist.includes(t))) return true;
    return false;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Verifies that the YouTube search candidate actually matches the requested song title.
 * Prevents mapping completely different songs to random channel trailers.
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
 * Resolves a track to a verified YouTube video ID with zero API quota consumption.
 * Includes rate-limit retry, title verification, and mojibake healing.
 */
async function resolveYouTubeTrack(artist, trackName, retryCount = 0) {
    if (isCorruptedJunk(artist, trackName)) {
        return { status: 'JUNK' };
    }

    // 1. Auto-heal mojibake
    const healedArtistTag = fixMojibake(artist);
    const healedTitleTag = fixMojibake(trackName);

    let cleanArtist = (healedArtistTag || '')
        .replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '')
        .replace(/\[[^\]]+\]/g, '')
        .trim();

    let cleanTitle = (healedTitleTag || '')
        .replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '')
        .replace(/\((Alternate|Remix|Live|Stem|Dublex|Prod\.|Demo|Version|Remaster).*?\)/gi, '')
        .replace(/\[.*?\]/g, '')
        .trim();

    const isNumericArtist = !cleanArtist || /^[0-9]+$/.test(cleanArtist);

    const queries = [];
    if (!isNumericArtist) {
        queries.push(`"${cleanArtist}" "${cleanTitle}" Topic`);
        queries.push(`"${cleanArtist}" "${cleanTitle}"`);
        queries.push(`${cleanArtist} ${cleanTitle}`);
    } else {
        queries.push(`"${cleanTitle}" Topic`);
        queries.push(`${cleanTitle}`);
    }

    for (const q of queries) {
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                }
            });

            // Handle 429 Too Many Requests
            if (res.status === 429) {
                if (retryCount < 3) {
                    const waitSec = 20 * (retryCount + 1);
                    console.warn(`\n⏳ YouTube 429 Rate Limit hit. Backing off for ${waitSec}s (Retry ${retryCount + 1}/3)...`);
                    await sleep(waitSec * 1000);
                    return resolveYouTubeTrack(artist, trackName, retryCount + 1);
                }
                return { status: 'RATE_LIMITED' };
            }

            if (!res.ok) continue;

            const html = await res.text();

            // Extract ytInitialData
            const match = html.match(/var ytInitialData = ({.*?});<\/script>/);
            if (!match) continue;

            const data = JSON.parse(match[1]);
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

            // Find first video that genuinely matches the track title
            for (const candidate of candidateVideos) {
                if (titlesMatch(cleanTitle, candidate.title)) {
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

    return { status: 'NOT_FOUND', healedTitle: healedTitleTag !== trackName ? healedTitleTag : null };
}

async function startResolver() {
    console.log("=================================================");
    console.log("🚀 MusicMood Hardened Zero-Quota Pre-Mapping Worker");
    console.log("   • Automatic CP1251 Cyrillic Mojibake Healing");
    console.log("   • Strict Title-Matching Verification");
    console.log("   • Resilient 429 Exponential Backoff");
    console.log("=================================================\n");

    let totalResolved = 0;
    let totalSkipped = 0;
    let isRunning = true;

    process.on('SIGINT', () => {
        console.log("\n🛑 Stopping gracefully...");
        isRunning = false;
    });

    while (isRunning) {
        // Fetch a batch of tracks missing youtube_video_id
        const { data: tracks, error } = await supabase
            .from('tracks')
            .select('id, artist, title, primary_genre_id')
            .is('youtube_video_id', null)
            .limit(BATCH_SIZE);

        if (error) {
            console.error("❌ Supabase query error:", error.message);
            process.exit(1);
        }

        if (!tracks || tracks.length === 0) {
            console.log("\n🎉 All tracks in the database have been mapped! Zero unmapped tracks remaining.");
            break;
        }

        console.log(`📦 Processing batch of ${tracks.length} tracks...`);

        for (const track of tracks) {
            if (!isRunning) break;

            const res = await resolveYouTubeTrack(track.artist, track.title);

            if (res.status === 'RATE_LIMITED') {
                console.warn(`🛑 Rate limit persistent. Cooling down for 45s before continuing...`);
                await sleep(45000);
                continue; // Do NOT flag as unresolved!
            }

            if (res.status === 'JUNK') {
                console.log(`[Junk Filter 🗑️] Non-music: "${track.artist} - ${track.title}"`);
                await supabase.from('tracks').update({ youtube_video_id: 'CORRUPT_TAGS' }).eq('id', track.id);
                continue;
            }

            if (res.status === 'FOUND' && res.videoId) {
                const updates = { youtube_video_id: res.videoId };
                if (res.healedTitle) updates.title = res.healedTitle;
                if (res.healedArtist) updates.artist = res.healedArtist;

                const { error: updateError } = await supabase
                    .from('tracks')
                    .update(updates)
                    .eq('id', track.id);

                if (!updateError) {
                    totalResolved++;
                    const healedNote = (res.healedTitle || res.healedArtist) ? ' 🩹 [Healed]' : '';
                    console.log(`[${totalResolved}] ✅ Mapped: "${updates.artist || track.artist} - ${updates.title || track.title}" -> ${res.videoId}${healedNote}`);
                }
            } else {
                totalSkipped++;
                const updates = { youtube_video_id: 'UNRESOLVED' };
                if (res.healedTitle) updates.title = res.healedTitle;

                console.log(`[Skip] ⏭️ No verified match: "${track.artist} - ${res.healedTitle || track.title}" (Flagged UNRESOLVED)`);
                await supabase.from('tracks').update(updates).eq('id', track.id);
            }

            // Polite jittered delay: 1800ms - 2600ms
            const jitter = Math.floor(Math.random() * 800);
            await sleep(BASE_DELAY_MS + jitter);
        }
    }

    console.log("\n=================================================");
    console.log(`Summary: ${totalResolved} mapped, ${totalSkipped} unresolved.`);
    console.log("=================================================");
}

startResolver();
