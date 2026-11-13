/**
 * scripts/populateArtistAvatars.js
 * 
 * Fetches high-resolution artist profile pictures from Wikipedia / Wikimedia Commons
 * (Open-License CC-BY / Public Domain) with Deezer as secondary fallback,
 * and updates public.artists.avatar_url in Supabase.
 * 
 * Usage:
 *   node scripts/populateArtistAvatars.js --limit=100
 *   node scripts/populateArtistAvatars.js --limit=100 --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 100;
const IS_DRY_RUN = args.includes('--dry-run');

async function fetchArtistAvatar(artistName) {
    const clean = (artistName || '').trim();
    if (!clean || clean.length < 2 || /^[0-9]+$/.test(clean)) return null;

    // 1. Primary: Try Wikipedia Summary API (Wikimedia Commons open-license portrait)
    try {
        const wikiName = clean.replace(/\s+/g, '_');
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiName)}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'MusicMood/1.0.0 (https://github.com/corneliunitoi/MusicMood; musicmood@local)' }
        });
        if (res.ok) {
            const data = await res.json();
            // Discard disambiguation pages or SVG icon thumbnails
            if (data.type !== 'disambiguation' && data.thumbnail?.source && !data.thumbnail.source.endsWith('.svg')) {
                return { url: data.thumbnail.source, source: 'wikimedia' };
            }
        }
    } catch { }

    // 1B. Try Wikipedia with '(band)' suffix
    try {
        const wikiNameBand = clean.replace(/\s+/g, '_') + '_(band)';
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiNameBand)}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'MusicMood/1.0.0 (https://github.com/corneliunitoi/MusicMood; musicmood@local)' }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.type !== 'disambiguation' && data.thumbnail?.source && !data.thumbnail.source.endsWith('.svg')) {
                return { url: data.thumbnail.source, source: 'wikimedia' };
            }
        }
    } catch { }

    // 2. Secondary Fallback: Deezer API
    try {
        const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(clean)}`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            const first = data.data?.[0];
            if (first && first.picture_medium && !first.picture_medium.includes('/artist//')) {
                const dName = (first.name || '').toLowerCase();
                const aName = clean.toLowerCase();
                if (dName.includes(aName) || aName.includes(dName)) {
                    return { url: first.picture_medium, source: 'deezer' };
                }
            }
        }
    } catch { }

    return null;
}

async function main() {
    console.log('=================================================');
    console.log(`🖼️  Populating Artist Profile Pictures (Batch: ${LIMIT})`);
    console.log(`   Mode: ${IS_DRY_RUN ? 'DRY-RUN (Audit only)' : 'LIVE COMMITS'}`);
    console.log('=================================================\n');

    // Query artists missing avatar_url, prioritized by track count (most listened first)
    const { data: artists, error } = await supabase
        .from('artists')
        .select('id, name, track_count, avatar_url')
        .is('avatar_url', null)
        .gt('track_count', 0)
        .order('track_count', { ascending: false })
        .limit(LIMIT);

    if (error || !artists) {
        console.error('❌ Failed to query artists:', error?.message);
        return;
    }

    if (artists.length === 0) {
        console.log('✨ All catalog artists with tracks already have avatar profile pictures!');
        return;
    }

    console.log(`📋 Found ${artists.length} artists needing profile pictures. Processing...\n`);

    let populated = 0;
    let notFound = 0;

    for (let i = 0; i < artists.length; i++) {
        const a = artists[i];
        const result = await fetchArtistAvatar(a.name);

        if (result && result.url) {
            if (!IS_DRY_RUN) {
                const { error: uErr } = await supabase
                    .from('artists')
                    .update({
                        avatar_url: result.url,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', a.id);

                if (!uErr) {
                    console.log(`  ✅ [${i + 1}/${artists.length}] "${a.name}" (${a.track_count} tracks) -> [${result.source}] ${result.url.slice(0, 60)}...`);
                    populated++;
                } else {
                    console.warn(`  ⚠️ Update error for "${a.name}":`, uErr.message);
                }
            } else {
                console.log(`  🔍 [DRY-RUN ${i + 1}/${artists.length}] "${a.name}" -> [${result.source}] ${result.url.slice(0, 60)}...`);
                populated++;
            }
        } else {
            console.log(`  ⚪ [${i + 1}/${artists.length}] "${a.name}" (${a.track_count} tracks) -> No open picture found (fallback to gradient initials)`);
            notFound++;
        }

        // Polite rate limit delay
        await new Promise(r => setTimeout(r, 120));
    }

    console.log('\n=================================================');
    console.log(`✨ Run Complete: ${populated} avatars assigned, ${notFound} without images.`);
    console.log('=================================================\n');
}

main().catch(console.error);
