/**
 * addPhonkTracks.js: adds phonk / Brazilian funk "montagem" tracks to the catalog.
 *
 * No new genre: phonk is filed under the existing `trap_modern` genre (808s, hip-hop family),
 * so it plays in the moods that already use it (energetic, party, dark intense).
 *
 * For every entry below the script looks up the real YouTube video with the shared resolver
 * (server/youtubeResolver.js), checks the video title matches, skips tracks already in the
 * catalog (same video id) and inserts the rest. Nothing is invented: an entry that cannot be
 * resolved or whose video title does not match is reported and skipped.
 *
 *   npm run add:phonk            dry run: shows what would be added, writes nothing
 *   npm run add:phonk -- --apply  writes to the catalog (needs SUPABASE_SERVICE_ROLE_KEY in .env)
 *
 * To add more, append to PHONK_TRACKS and run again (safe to repeat). If the resolver picks the
 * wrong video, put the right one in `youtube_video_id` on that entry.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { resolveTrack, titlesMatch, parseTitleAndArtist } from '../server/youtubeResolver.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const GENRE_ID = 'trap_modern';
const SOURCE = 'canonical_seed';

// An entry is { artist, title } (the video is looked up and title-checked) or { youtube_video_id }
// on its own (artist and title are read from the video; add artist/title to override them).
export const PHONK_TRACKS = [
    { youtube_video_id: 'ovj8Gb_cVgY' }, // the owner's example link
    { artist: 'Galactico', title: 'No Batidão (Montagem Tomada Funk)' },
    { artist: 'ATLXS', title: 'PASSO BEM SOLTO' },
    { artist: 'Kordhell', title: 'Murder In My Mind' },
    { artist: 'Kordhell', title: 'Live Another Day' },
    { artist: 'DVRST', title: 'Close Eyes' },
    { artist: 'Interworld', title: 'Metamorphosis' },
    { artist: 'Hensonn', title: 'Sahara' },
    { artist: 'Eternxlkz', title: 'SLAY!' },
    { artist: 'MoonDeity', title: 'NEON BLADE' },
    { artist: 'Kordhell', title: 'Scopin' },
    { artist: 'Kordhell', title: 'Power' },
    { artist: 'Kordhell', title: 'Killers From The Northern Haunt' },
    { artist: 'PlayaPhonk', title: 'Phonky Town' }
];

/** Reads title + channel of a video from YouTube's public oEmbed endpoint. */
async function describeVideo(videoId) {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube could not describe video ${videoId} (HTTP ${res.status})`);
    const info = await res.json();
    return parseTitleAndArtist(info.title, info.author_name);
}

const isApply = process.argv.includes('--apply');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
    if (isApply && !serviceKey) {
        console.error('❌ --apply needs SUPABASE_SERVICE_ROLE_KEY in your .env (never a VITE_ variable).');
        process.exit(1);
    }
    const supabase = createClient(supabaseUrl, isApply ? serviceKey : anonKey);

    console.log(`🎧 Phonk tracks → genre "${GENRE_ID}" (${isApply ? 'APPLY' : 'dry run, nothing is written'})\n`);
    const counts = { added: 0, present: 0, skipped: 0, errors: 0 };

    for (const listed of PHONK_TRACKS) {
        let entry = listed;
        let label = listed.artist ? `${listed.artist} - ${listed.title}` : `video ${listed.youtube_video_id}`;
        try {
            let videoId = entry.youtube_video_id || null;
            if (videoId && !(entry.artist && entry.title)) {
                const described = await describeVideo(videoId);
                entry = { ...entry, artist: entry.artist || described.artist, title: entry.title || described.title };
                label = `${entry.artist} - ${entry.title}`;
            }
            if (!videoId) {
                const found = await resolveTrack(entry.artist, entry.title);
                videoId = found?.videoId || null;
                if (!videoId) {
                    console.log(`⏭️  No YouTube result, skipped: ${label}`);
                    counts.skipped++;
                    continue;
                }
                if (found.title && !titlesMatch(entry.title, found.title)) {
                    console.log(`⏭️  Video title does not match, skipped: ${label}\n    found: "${found.title}" (${videoId}). Set youtube_video_id on the entry if it is right.`);
                    counts.skipped++;
                    continue;
                }
            }

            const { data: existing, error: lookupError } = await supabase
                .from('tracks').select('id').eq('youtube_video_id', videoId).limit(1);
            if (lookupError) throw lookupError;
            if (existing?.length) {
                console.log(`✔️  Already in catalog: ${label} (${videoId})`);
                counts.present++;
                continue;
            }

            if (!isApply) {
                console.log(`➕ Would add: ${label} → https://youtu.be/${videoId}`);
                counts.added++;
            } else {
                const { error } = await supabase.from('tracks').insert({
                    title: entry.title,
                    artist: entry.artist,
                    primary_genre_id: GENRE_ID,
                    youtube_video_id: videoId,
                    source: SOURCE
                });
                if (error) throw error;
                console.log(`✅ Added: ${label} (${videoId})`);
                counts.added++;
            }
        } catch (e) {
            console.error(`❌ ${label}: ${e.message}`);
            counts.errors++;
        }
        await sleep(800); // be polite to YouTube
    }

    console.log(`\n${isApply ? 'Added' : 'Would add'}: ${counts.added} · already present: ${counts.present} · skipped: ${counts.skipped} · errors: ${counts.errors}`);
    if (!isApply && counts.added) console.log('Looks right? Run again with:  npm run add:phonk -- --apply');
}

run();
