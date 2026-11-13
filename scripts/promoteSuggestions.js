/**
 * promoteSuggestions.js
 * 
 * Production Promotion & Quarantine Manager for MusicMood.
 * Audits, approves, and safely promotes staged tracks from `public.track_suggestions`
 * into `public.tracks` and `public.artists`.
 * 
 * Usage:
 *   node scripts/promoteSuggestions.js --status
 *   node scripts/promoteSuggestions.js --batch=kexp-2026-11-13 --audit
 *   node scripts/promoteSuggestions.js --batch=kexp-2026-11-13 --promote
 *   node scripts/promoteSuggestions.js --auto-promote --min-score=90
 *   node scripts/promoteSuggestions.js --purge-batch=bad-batch-id
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

const args = process.argv.slice(2);
function getArg(prefix, defaultVal) {
    const match = args.find(a => a.startsWith(prefix));
    return match ? match.split('=')[1] : defaultVal;
}

const BATCH_ID = getArg('--batch=', null);
const MIN_SCORE = parseInt(getArg('--min-score=', '85'), 10);
const ACTION_STATUS = args.includes('--status');
const ACTION_AUDIT = args.includes('--audit');
const ACTION_PROMOTE = args.includes('--promote');
const ACTION_AUTO_PROMOTE = args.includes('--auto-promote');
const PURGE_BATCH = getArg('--purge-batch=', null);

async function checkStatus() {
    console.log('================================================================');
    console.log('📊 TRACK SUGGESTIONS STAGING AREA STATUS');
    console.log('================================================================\n');

    const { data: counts, error } = await supabase
        .from('track_suggestions')
        .select('batch_id, status, confidence_score');

    if (error) {
        console.error('Error querying staging:', error.message);
        return;
    }

    if (!counts || counts.length === 0) {
        console.log('✨ Staging area is empty. No pending track suggestions.');
        return;
    }

    const batches = {};
    const statuses = {};

    counts.forEach(c => {
        statuses[c.status] = (statuses[c.status] || 0) + 1;
        if (!batches[c.batch_id]) {
            batches[c.batch_id] = { total: 0, pending: 0, approved: 0, promoted: 0, rejected: 0 };
        }
        batches[c.batch_id].total++;
        if (batches[c.batch_id][c.status] !== undefined) {
            batches[c.batch_id][c.status]++;
        }
    });

    console.log(`Total Staged Tracks: ${counts.length}`);
    console.log('Status Breakdown:');
    Object.entries(statuses).forEach(([st, cnt]) => {
        console.log(`  • ${st.padEnd(12)}: ${cnt}`);
    });

    console.log('\nBatches in Staging:');
    Object.entries(batches).forEach(([bId, stat]) => {
        console.log(`  📁 [${bId}] Total: ${stat.total} | Pending: ${stat.pending} | Approved: ${stat.approved} | Promoted: ${stat.promoted}`);
    });
    console.log('================================================================\n');
}

async function purgeBatch(batchId) {
    console.log(`🗑️ Purging batch "${batchId}" from track_suggestions...`);
    const { count, error } = await supabase
        .from('track_suggestions')
        .delete({ count: 'exact' })
        .eq('batch_id', batchId);

    if (error) {
        console.error('Error purging batch:', error.message);
    } else {
        console.log(`✓ Purged ${count || 0} tracks from batch "${batchId}".`);
    }
}

async function auditBatch(batchId) {
    console.log(`🔍 Auditing batch "${batchId}"...`);
    const { data: tracks, error } = await supabase
        .from('track_suggestions')
        .select('*')
        .eq('batch_id', batchId)
        .order('confidence_score', { ascending: false });

    if (error) {
        console.error('Error fetching batch:', error.message);
        return;
    }

    console.log(`Found ${tracks.length} tracks in batch "${batchId}".\n`);
    tracks.slice(0, 20).forEach((t, i) => {
        const flagStr = (t.quality_flags || []).join(', ');
        console.log(`${(i + 1).toString().padStart(2)}. [Score: ${t.confidence_score}] "${t.title}" by ${t.artist} (${t.primary_genre_id || 'unknown'}) | Flags: [${flagStr}] | Status: ${t.status}`);
    });
}

async function promoteTracks({ batchId = null, minScore = 85, autoApprove = false }) {
    console.log('================================================================');
    console.log('🚀 PROMOTING STAGED TRACKS TO PRODUCTION (public.tracks & public.artists)');
    console.log(`   Batch:      ${batchId || 'ALL BATCHES'}`);
    console.log(`   Min Score:  ${minScore}`);
    console.log('================================================================\n');

    let query = supabase
        .from('track_suggestions')
        .select('*')
        .gte('confidence_score', minScore);

    if (batchId) {
        query = query.eq('batch_id', batchId);
    }

    if (autoApprove) {
        query = query.in('status', ['pending', 'approved']);
    } else {
        query = query.eq('status', 'approved');
    }

    const { data: candidates, error } = await query;
    if (error) {
        console.error('Error querying suggestions:', error.message);
        return;
    }

    if (!candidates || candidates.length === 0) {
        console.log('ℹ️ No eligible suggestions found to promote.');
        return;
    }

    console.log(`Found ${candidates.length} tracks ready for promotion.\n`);

    let promotedCount = 0;
    let skippedCount = 0;

    for (const item of candidates) {
        // 1. Verify YouTube video ID exists and is 11 chars
        if (!item.youtube_video_id || item.youtube_video_id.length !== 11) {
            console.log(`   ⏭️ Skipping "${item.title}": Invalid YouTube Video ID (${item.youtube_video_id})`);
            skippedCount++;
            continue;
        }

        // 2. Check if track already exists in public.tracks
        const { data: existingTrk } = await supabase
            .from('tracks')
            .select('id')
            .eq('youtube_video_id', item.youtube_video_id)
            .maybeSingle();

        if (existingTrk) {
            // Already in catalog, mark as promoted
            await supabase
                .from('track_suggestions')
                .update({ status: 'promoted', promoted_track_id: existingTrk.id })
                .eq('id', item.id);
            skippedCount++;
            continue;
        }

        // 3. Ensure Artist exists in public.artists
        let artistRecord = null;
        const { data: existingArt } = await supabase
            .from('artists')
            .select('id, name, track_count')
            .ilike('name', item.artist)
            .limit(1);

        if (existingArt?.[0]) {
            artistRecord = existingArt[0];
        } else {
            let slug = item.artist.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            if (!slug) slug = 'artist-' + Date.now();

            const { data: newArt, error: artErr } = await supabase
                .from('artists')
                .insert({
                    name: item.artist,
                    slug,
                    primary_genre_id: item.primary_genre_id || 'rock',
                    secondary_genre_ids: item.secondary_genre_ids || [],
                    affinity_score: 50,
                    track_count: 0
                })
                .select()
                .maybeSingle();

            if (!artErr && newArt) {
                artistRecord = newArt;
            } else {
                const { data: fallbackArt } = await supabase.from('artists').select('id, name, track_count').eq('slug', slug).limit(1);
                artistRecord = fallbackArt?.[0] || null;
            }
        }

        // 4. Insert into public.tracks
        const { data: newTrack, error: insErr } = await supabase
            .from('tracks')
            .insert({
                artist: item.artist,
                artist_id: artistRecord?.id || null,
                title: item.title,
                album: item.album || null,
                isrc: item.isrc || null,
                youtube_video_id: item.youtube_video_id,
                primary_genre_id: item.primary_genre_id || 'rock',
                secondary_genre_ids: item.secondary_genre_ids || [],
                energy: item.energy || 0.6,
                is_instrumental: item.is_instrumental || false,
                source: item.source || 'staged_promotion'
            })
            .select('id')
            .maybeSingle();

        if (insErr) {
            console.warn(`   ❌ Failed to insert track "${item.title}": ${insErr.message}`);
            continue;
        }

        // 5. Update artist track count
        if (artistRecord?.id) {
            await supabase
                .from('artists')
                .update({
                    track_count: (artistRecord.track_count || 0) + 1,
                    last_inflated_at: new Date().toISOString()
                })
                .eq('id', artistRecord.id);
        }

        // 6. Mark suggestion as promoted
        await supabase
            .from('track_suggestions')
            .update({
                status: 'promoted',
                promoted_track_id: newTrack.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', item.id);

        promotedCount++;
        console.log(`   ✅ Promoted: "${item.title}" by ${item.artist} -> [ID: ${newTrack.id}]`);
    }

    console.log('\n================================================================');
    console.log(`🏁 PROMOTION COMPLETED: +${promotedCount} promoted to production, ${skippedCount} duplicates skipped.`);
    console.log('================================================================\n');
}

async function main() {
    if (PURGE_BATCH) {
        await purgeBatch(PURGE_BATCH);
        return;
    }
    if (ACTION_STATUS) {
        await checkStatus();
        return;
    }
    if (ACTION_AUDIT) {
        if (!BATCH_ID) {
            console.error('Please specify --batch=<batchId> to audit.');
            return;
        }
        await auditBatch(BATCH_ID);
        return;
    }
    if (ACTION_PROMOTE || ACTION_AUTO_PROMOTE) {
        await promoteTracks({
            batchId: BATCH_ID,
            minScore: MIN_SCORE,
            autoApprove: ACTION_AUTO_PROMOTE
        });
        return;
    }

    // Default: show status
    await checkStatus();
}

main().catch(err => {
    console.error('Promotion error:', err);
    process.exit(1);
});
