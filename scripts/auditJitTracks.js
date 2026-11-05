import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

async function runAudit() {
    console.log("=================================================");
    console.log("⚡ MusicMood JIT Organic Ingestion Audit Tool");
    console.log("   • Auditing all tracks organically discovered by JIT");
    console.log("=================================================\n");

    const { data: jitTracks, error } = await supabase
        .from('tracks')
        .select('*')
        .ilike('source', '%jit%')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("❌ Failed to query JIT tracks:", error.message);
        process.exit(1);
    }

    if (!jitTracks || jitTracks.length === 0) {
        console.log("No JIT tracks found in catalog yet. Listen to tracks in the app to trigger organic growth!");
        return;
    }

    console.log(`📊 Total Organically Added by JIT: ${jitTracks.length} tracks\n`);

    // Group by genre
    const byGenre = {};
    jitTracks.forEach(t => {
        const g = t.primary_genre_id || 'unknown';
        byGenre[g] = byGenre[g] || [];
        byGenre[g].push(t);
    });

    console.log("📁 Breakdown by Genre:");
    Object.entries(byGenre).forEach(([genre, list]) => {
        console.log(`   • ${genre.padEnd(20)}: ${list.length} tracks`);
    });

    console.log("\n🕒 Latest 20 Discoveries (Most Recent First):");
    jitTracks.slice(0, 20).forEach((t, idx) => {
        const srcBadge = t.source === 'jit_local_archive' ? '[Local Archive]' : '[MusicBrainz]';
        console.log(`   [${idx + 1}] ${srcBadge} "${t.artist} - ${t.title}" -> ${t.youtube_video_id} (${t.primary_genre_id}) [Added: ${new Date(t.created_at).toLocaleTimeString()}]`);
    });

    console.log("\n=================================================");
    console.log("💡 Tip: Click 👎 on any JIT track in the player to immediately purge it from the catalog.");
    console.log("=================================================");
}

runAudit();
