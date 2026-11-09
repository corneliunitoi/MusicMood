/**
 * scripts/populateArtistAvatars.js
 * 
 * Fetches high-resolution artist profile pictures from Deezer / Wikipedia API
 * and updates public.artists.avatar_url in Supabase.
 * 
 * Usage:
 *   node scripts/populateArtistAvatars.js --limit=150
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 100;

async function fetchArtistAvatar(artistName) {
    const clean = (artistName || '').trim();
    if (!clean || clean.length < 2 || /^[0-9]+$/.test(clean)) return null;

    // 1. Try Deezer API (Standard high-res square artist portraits)
    try {
        const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(clean)}`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            const first = data.data?.[0];
            if (first && first.picture_medium && !first.picture_medium.includes('/artist//')) {
                // Ensure name similarity
                const dName = (first.name || '').toLowerCase();
                const aName = clean.toLowerCase();
                if (dName.includes(aName) || aName.includes(dName)) {
                    return first.picture_medium;
                }
            }
        }
    } catch (e) { }

    // 2. Try Wikipedia Summary API (Wikimedia Commons portrait)
    try {
        const wikiName = clean.replace(/\s+/g, '_');
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiName)}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'MusicMood/1.0' } });
        if (res.ok) {
            const data = await res.json();
            if (data.thumbnail?.source) {
                return data.thumbnail.source;
            }
        }
    } catch (e) { }

    return null;
}

async function main() {
    console.log("=================================================");
    console.log(`🖼️  Populating Artist Profile Pictures (Top ${LIMIT})`);
    console.log("=================================================\n");

    const { data: artists, error } = await supabase
        .from('artists')
        .select('id, name, track_count, avatar_url')
        .gt('track_count', 0)
        .order('track_count', { ascending: false })
        .limit(LIMIT);

    if (error || !artists) {
        console.error("❌ Failed to query artists:", error?.message);
        return;
    }

    console.log(`📋 Found ${artists.length} top artists. Fetching pictures...\n`);

    let populated = 0;
    let skipped = 0;

    for (const a of artists) {
        if (a.avatar_url) {
            skipped++;
            continue;
        }

        const pic = await fetchArtistAvatar(a.name);
        if (pic) {
            const { error: uErr } = await supabase
                .from('artists')
                .update({ avatar_url: pic, updated_at: new Date().toISOString() })
                .eq('id', a.id);

            if (!uErr) {
                console.log(`  ✅ [${a.track_count} tracks] "${a.name}" -> ${pic.slice(0, 65)}...`);
                populated++;
            }
        } else {
            console.log(`  ⚠️ [${a.track_count} tracks] "${a.name}" -> No picture found`);
        }

        // Slight rate limit delay
        await new Promise(r => setTimeout(r, 120));
    }

    console.log("\n=================================================");
    console.log(`✨ Finished: ${populated} new avatars saved, ${skipped} already had avatars.`);
    console.log("=================================================\n");
}

main().catch(console.error);
