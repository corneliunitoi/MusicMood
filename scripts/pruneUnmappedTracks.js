import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';

const supabase = createClient(supabaseUrl, supabaseKey);

async function pruneUnmapped() {
    console.log("=========================================");
    console.log("🧹 Fast Batch Pruning of Unmapped Tracks");
    console.log("=========================================\n");

    const { count: beforeTotal } = await supabase.from('tracks').select('*', { count: 'exact', head: true });
    const { count: beforeMapped } = await supabase.from('tracks').select('*', { count: 'exact', head: true })
        .not('youtube_video_id', 'is', null)
        .neq('youtube_video_id', 'UNRESOLVED')
        .neq('youtube_video_id', 'CORRUPT_TAGS');

    console.log(`Current Total Tracks in public.tracks: ${beforeTotal}`);
    console.log(`Verified Playable Tracks to KEEP:      ${beforeMapped}\n`);

    const BATCH_SIZE = 150; // 150 UUIDs safely under 8KB URL limit
    let totalDeleted = 0;

    while (true) {
        // Fetch up to 600 IDs (4 batches of 150)
        const { data: nullBatch, error: nullErr } = await supabase
            .from('tracks')
            .select('id')
            .is('youtube_video_id', null)
            .limit(600);

        if (nullErr) {
            console.error("Query error:", nullErr.message);
            break;
        }

        let idsToDelete = (nullBatch || []).map(t => t.id);

        if (idsToDelete.length === 0) {
            const { data: unresolvedBatch } = await supabase
                .from('tracks')
                .select('id')
                .in('youtube_video_id', ['UNRESOLVED', 'CORRUPT_TAGS'])
                .limit(600);

            idsToDelete = (unresolvedBatch || []).map(t => t.id);
        }

        if (idsToDelete.length === 0) {
            console.log("\n\n✅ All unmapped tracks successfully pruned!");
            break;
        }

        // Split into chunks of 150 and delete concurrently
        const chunks = [];
        for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
            chunks.push(idsToDelete.slice(i, i + BATCH_SIZE));
        }

        const results = await Promise.all(chunks.map(chunk =>
            supabase.from('tracks').delete().in('id', chunk)
        ));

        const failed = results.some(r => r.error);
        if (failed) {
            console.error("Batch delete encountered an error:", results.find(r => r.error)?.error?.message);
            break;
        }

        totalDeleted += idsToDelete.length;
        process.stdout.write(`\r🗑️ Deleted ${totalDeleted.toLocaleString()} unmapped tracks...`);
    }

    const { count: afterTotal } = await supabase.from('tracks').select('*', { count: 'exact', head: true });
    console.log(`\nRemaining playable tracks in catalog: ${afterTotal}`);
}

pruneUnmapped().catch(console.error);
