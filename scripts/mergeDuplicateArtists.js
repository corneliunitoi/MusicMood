/**
 * scripts/mergeDuplicateArtists.js
 * 
 * Reconciles and merges duplicate artist clusters in Supabase:
 * 1. Groups artists by normalized name (stripping diacritics, hyphens, punctuation, case).
 * 2. Selects the canonical record using linguistic name quality scoring (proper casing, accents, hyphens).
 * 3. Re-assigns tracks (both artist_id and artist string) and suggestions to the canonical artist.
 * 4. Sums track counts and upvotes, preserves avatars and metadata.
 * 5. Deletes redundant duplicate rows from public.artists.
 * 
 * Usage:
 *   node scripts/mergeDuplicateArtists.js --dry-run
 *   node scripts/mergeDuplicateArtists.js --live
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { normalizeArtistKey, scoreArtistNameQuality, pickCanonicalArtist } from './auditArtistDuplicates.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const IS_LIVE = process.argv.includes('--live');

async function runMerge() {
    console.log('=================================================');
    console.log('🧼 Artist Deduplication & Reconciliation');
    console.log(`   Mode: ${IS_LIVE ? '🔴 LIVE DATABASE EXECUTION' : '🟡 DRY-RUN (Audit only)'}`);
    console.log('=================================================\n');

    // 1. Fetch all artists
    console.log('Fetching catalog artists...');
    const PAGE_SIZE = 1000;
    let all = [];
    let page = 0;
    while (true) {
        const { data, error } = await supabase
            .from('artists')
            .select('*')
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error || !data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE_SIZE) break;
        page++;
    }

    console.log(`Total catalog artists: ${all.length}`);

    // 2. Cluster by normalized key
    const groups = new Map();
    for (const a of all) {
        const norm = normalizeArtistKey(a.name);
        if (!norm) continue;
        if (!groups.has(norm)) groups.set(norm, []);
        groups.get(norm).push(a);
    }

    const clusters = Array.from(groups.values()).filter(list => list.length > 1);
    console.log(`Found ${clusters.length} duplicate clusters needing reconciliation.\n`);

    let totalTracksReassigned = 0;
    let totalDuplicatesRemoved = 0;

    for (const list of clusters) {
        const canonical = pickCanonicalArtist(list);
        const duplicates = list.filter(a => a.id !== canonical.id);
        const dupIds = duplicates.map(d => d.id);
        const dupNames = duplicates.map(d => d.name);

        const totalTracks = list.reduce((sum, a) => sum + (a.track_count || 0), 0);
        const totalUpvotes = list.reduce((sum, a) => sum + (a.upvotes || 0), 0);
        const bestAvatar = canonical.avatar_url || duplicates.find(d => d.avatar_url)?.avatar_url || null;

        console.log(`🔷 Cluster: "${normalizeArtistKey(canonical.name)}"`);
        console.log(`   Keep Canonical: "${canonical.name}" [${canonical.id}]`);
        console.log(`   Merge & Remove (${duplicates.length}): ${dupNames.map(n => `"${n}"`).join(', ')}`);
        console.log(`   Combined: tracks=${totalTracks}, upvotes=${totalUpvotes}, avatar=${!!bestAvatar}`);

        if (IS_LIVE) {
            // A. Update tracks pointing to duplicates by artist_id or artist string
            for (const dup of duplicates) {
                const { error: trackErr1 } = await supabase
                    .from('tracks')
                    .update({
                        artist_id: canonical.id,
                        artist: canonical.name
                    })
                    .eq('artist_id', dup.id);

                if (trackErr1) {
                    console.error(`   ❌ Failed to reassign tracks by artist_id for "${dup.name}":`, trackErr1.message);
                }

                const { error: trackErr2 } = await supabase
                    .from('tracks')
                    .update({
                        artist_id: canonical.id,
                        artist: canonical.name
                    })
                    .eq('artist', dup.name);

                if (trackErr2) {
                    console.error(`   ❌ Failed to reassign tracks by artist name for "${dup.name}":`, trackErr2.message);
                }
            }

            // Also make sure tracks under canonical.name have the right artist_id
            await supabase
                .from('tracks')
                .update({ artist_id: canonical.id })
                .eq('artist', canonical.name)
                .is('artist_id', null);

            // B. Reassign any artist_suggestions
            for (const dupId of dupIds) {
                await supabase
                    .from('artist_suggestions')
                    .update({ promoted_artist_id: canonical.id })
                    .eq('promoted_artist_id', dupId);
            }

            // C. Update canonical artist record
            const { error: updateErr } = await supabase
                .from('artists')
                .update({
                    track_count: totalTracks,
                    upvotes: totalUpvotes,
                    avatar_url: bestAvatar,
                    updated_at: new Date().toISOString()
                })
                .eq('id', canonical.id);

            if (updateErr) {
                console.error(`   ❌ Failed to update canonical artist:`, updateErr.message);
            }

            // D. Delete duplicate artist rows
            const { error: deleteErr } = await supabase
                .from('artists')
                .delete()
                .in('id', dupIds);

            if (deleteErr) {
                console.error(`   ❌ Failed to delete duplicate rows:`, deleteErr.message);
            } else {
                totalDuplicatesRemoved += duplicates.length;
            }
        } else {
            totalDuplicatesRemoved += duplicates.length;
        }

        totalTracksReassigned += totalTracks;
    }

    console.log('\n=================================================');
    console.log(`🎉 Summary (${IS_LIVE ? 'LIVE' : 'DRY RUN'}):`);
    console.log(`   Clusters Reconciled: ${clusters.length}`);
    console.log(`   Duplicate Rows Removed: ${totalDuplicatesRemoved}`);
    console.log(`   Total Tracks Unified: ${totalTracksReassigned}`);
    console.log('=================================================\n');
}

runMerge();
