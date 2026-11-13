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
const minTracksArg = args.find(a => a.startsWith('--min-tracks='));
const MIN_TRACKS = minTracksArg ? parseInt(minTracksArg.split('=')[1], 10) : 1;
const IS_DRY_RUN = args.includes('--dry-run');

function getArtistSearchVariants(artistName) {
    if (!artistName) return [];
    const clean = artistName.trim();
    const candidates = [clean];

    // Inverted names: 'Caruso, Enrico' -> 'Enrico Caruso'
    if (clean.includes(', ') && !clean.includes(';')) {
        const parts = clean.split(', ');
        if (parts.length === 2 && !/^(piano|violin|cello|orch|soprano)/i.test(parts[1])) {
            candidates.push(`${parts[1]} ${parts[0]}`);
        }
    }

    // Corrupted Russian / Latin diacritics
    const fixed = clean
        .replace(/Frйdйric/g, 'Frédéric')
        .replace(/Aleksi Perдlд/g, 'Aleksi Perälä')
        .replace(/Paco de Lucнa/g, 'Paco de Lucía')
        .replace(/Ramуn/g, 'Ramón');
    if (fixed !== clean) candidates.push(fixed);

    // Remove instrument suffixes: 'Santiago Rodriguez, piano' -> 'Santiago Rodriguez'
    const noInst = clean.replace(/,\s*(piano|violin|cello|conductor|soprano|tenor|baritone).*$/i, '').trim();
    if (noInst !== clean) candidates.push(noInst);

    // Parentheticals: 'Scarlatti (Pieter-Jan Belder)' -> 'Domenico Scarlatti', 'Pieter-Jan Belder'
    const parenthetical = clean.match(/^(.*?)\s*\((.*?)\)$/);
    if (parenthetical) {
        if (parenthetical[1].toLowerCase().includes('scarlatti')) candidates.push('Domenico Scarlatti');
        candidates.push(parenthetical[2]);
    }

    // Collaborations: 'Ella Fitzgerald & Louis Armstrong' -> 'Ella Fitzgerald', 'Louis Armstrong'
    if (clean.includes(' & ') || clean.includes(' and ') || clean.includes(' feat ') || clean.includes(' feat. ')) {
        const parts = clean.split(/\s+(?:&|and|feat\.?)\s+/i);
        parts.forEach(p => { if (p && p.trim().length > 2) candidates.push(p.trim()); });
    }

    // Comma lists: 'Keith Jarrett, Gary Peacock, Jack DeJohnette' -> 'Keith Jarrett'
    if (clean.includes(', ')) {
        const primary = clean.split(',')[0].trim();
        if (primary && primary.length > 2) candidates.push(primary);
    }

    // Common names that need (singer)
    if (clean.toLowerCase() === 'tom jones') {
        candidates.push('Tom Jones (singer)');
    }

    return [...new Set(candidates)];
}

async function tryFetchSingleName(name) {
    const clean = (name || '').trim();
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
            if (data.type !== 'disambiguation' && data.thumbnail?.source && !data.thumbnail.source.endsWith('.svg')) {
                return { url: data.thumbnail.source, source: 'wikimedia' };
            }
        }
    } catch { }

    // 1B. Try Wikipedia with '(band)' or '(musician)' suffix
    for (const suffix of ['_(band)', '_(musician)', '_(singer)']) {
        try {
            const wikiNameSuffix = clean.replace(/\s+/g, '_') + suffix;
            const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiNameSuffix)}`;
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
    }

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

async function fetchArtistAvatar(artistName) {
    const variants = getArtistSearchVariants(artistName);
    for (const variant of variants) {
        const result = await tryFetchSingleName(variant);
        if (result && result.url) {
            return result;
        }
    }
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
        .gte('track_count', MIN_TRACKS)
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
