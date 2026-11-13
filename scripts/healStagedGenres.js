/**
 * scripts/healStagedGenres.js
 * 
 * Audits and updates all records in `public.artist_suggestions` that currently
 * have `primary_genre_id IS NULL` or `primary_genre_id = 'other'`, ensuring every
 * staged artist belongs to a recognized, valid core genre.
 * 
 * Usage:
 *   node scripts/healStagedGenres.js
 *   node scripts/healStagedGenres.js --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { normalizeGenre } from '../src/services/genreNormalizer.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const LASTFM_API_KEY = process.env.LASTFM_API_KEY || 'd11784f5f2ef96e01a656f80734244e8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
});

const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');

async function resolveArtistGenre(artistName, source = '') {
    if (LASTFM_API_KEY) {
        try {
            const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(artistName)}&api_key=${LASTFM_API_KEY}&format=json`;
            const res = await fetch(url, { headers: { 'User-Agent': 'MusicMood/1.0.0' } });
            if (res.ok) {
                const data = await res.json();
                const tags = data?.toptags?.tag || [];
                for (const t of tags.slice(0, 6)) {
                    const norm = normalizeGenre(t.name, artistName);
                    if (norm && norm !== 'other' && norm !== 'unknown') {
                        return norm;
                    }
                }
            }
        } catch { }
    }

    // Contextual fallback based on ingestion source
    if (source.includes('kexp')) return 'alt_rock';
    if (source.includes('blues')) return 'blues';
    if (source.includes('jazz')) return 'jazz';
    if (source.includes('folk')) return 'folk_acoustic';
    if (source.includes('country')) return 'country';
    if (source.includes('soul') || source.includes('rnb')) return 'rnb_soul';
    if (source.includes('ambient')) return 'ambient_chill';
    if (source.includes('world') || source.includes('reggae')) return 'world_reggae';

    return 'rock';
}

async function main() {
    console.log('================================================================');
    console.log('🩺 HEALING UNASSIGNED / "OTHER" GENRES IN STAGING');
    console.log(`   Mode: ${IS_DRY_RUN ? 'DRY-RUN (Audit only)' : 'LIVE DATABASE UPDATES'}`);
    console.log('================================================================\n');

    // 1. Fetch suggestions where genre is missing or "other"
    const { data: suggestions, error } = await supabase
        .from('artist_suggestions')
        .select('id, name, source, batch_id, primary_genre_id')
        .or('primary_genre_id.is.null,primary_genre_id.eq.other');

    if (error) {
        console.error('Error querying artist_suggestions:', error.message);
        return;
    }

    if (!suggestions || suggestions.length === 0) {
        console.log('✨ All staged artists already have valid primary genres! Nothing to heal.');
        return;
    }

    console.log(`Found ${suggestions.length} staged artists missing valid genres. Resolving...\n`);

    let healedCount = 0;
    const genreDistribution = {};

    for (let i = 0; i < suggestions.length; i++) {
        const item = suggestions[i];
        const assignedGenre = await resolveArtistGenre(item.name, item.batch_id || item.source || '');
        genreDistribution[assignedGenre] = (genreDistribution[assignedGenre] || 0) + 1;

        if (!IS_DRY_RUN) {
            const { error: updErr } = await supabase
                .from('artist_suggestions')
                .update({
                    primary_genre_id: assignedGenre,
                    updated_at: new Date().toISOString()
                })
                .eq('id', item.id);

            if (updErr) {
                console.warn(`  ❌ Update failed for "${item.name}":`, updErr.message);
            } else {
                console.log(`  ✓ [${i + 1}/${suggestions.length}] "${item.name}" -> ${assignedGenre}`);
                healedCount++;
            }
        } else {
            console.log(`  🔍 [DRY-RUN ${i + 1}/${suggestions.length}] "${item.name}" -> ${assignedGenre}`);
            healedCount++;
        }

        // Polite throttle for Last.fm API
        await new Promise(r => setTimeout(r, 120));
    }

    console.log('\n================================================================');
    console.log(`🎉 Healing Complete: ${healedCount} staged artists assigned valid genres.`);
    console.log('Genre Distribution:');
    Object.entries(genreDistribution).forEach(([g, c]) => {
        console.log(`  • ${g.padEnd(20)}: ${c}`);
    });
    console.log('================================================================\n');
}

main().catch(console.error);
