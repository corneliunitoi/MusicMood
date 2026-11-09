/**
 * scripts/syncArtistGenresFromTracks.js
 * 
 * Synchronizes public.artists.primary_genre_id with the actual dominant genre of their tracks.
 * Purges toxic misclassifications (e.g., Handel as hip_hop, classical masters as rock).
 * 
 * Usage:
 *   node scripts/syncArtistGenresFromTracks.js --apply
 *   node scripts/syncArtistGenresFromTracks.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

const isApply = process.argv.includes('--apply');

async function main() {
    console.log("=================================================");
    console.log(`🎵 Syncing Artist Genres from Track Consensus ${isApply ? '(LIVE APPLY)' : '(DRY RUN)'}`);
    console.log("=================================================\n");

    // 1. Specifically patch Handel immediately
    console.log("Fixing Handel artist record...");
    const handelPatch = {
        primary_genre_id: 'baroque',
        secondary_genre_ids: ['classical', 'opera', 'choral'],
        tags: ['classical', 'baroque', 'composer', 'british', 'german', 'oratorio', 'orchestral'],
        mbid: '27870d47-bb98-42d1-bf2b-c7e972e6befc',
        updated_at: new Date().toISOString()
    };

    if (isApply) {
        const { error: hErr } = await supabase
            .from('artists')
            .update(handelPatch)
            .ilike('name', 'Handel');

        if (!hErr) {
            console.log("✅ Successfully patched Handel -> primary_genre_id = 'baroque'");
        } else {
            console.error("❌ Failed to patch Handel:", hErr.message);
        }
    } else {
        console.log("   [Dry Run] Would patch Handel -> baroque");
    }

    // 2. Query top 500 catalog artists
    const { data: artists, error } = await supabase
        .from('artists')
        .select('id, name, primary_genre_id, track_count')
        .gt('track_count', 0)
        .order('track_count', { ascending: false })
        .limit(500);

    if (error || !artists) {
        console.error("❌ Failed to query artists:", error?.message);
        return;
    }

    console.log(`\n📋 Auditing ${artists.length} artists against their actual catalog tracks...`);

    let updatedCount = 0;
    const batchSize = 10;

    for (let i = 0; i < artists.length; i += batchSize) {
        const chunk = artists.slice(i, i + batchSize);
        await Promise.all(chunk.map(async (a) => {
            try {
                const { data: tracks } = await supabase
                    .from('tracks')
                    .select('primary_genre_id')
                    .ilike('artist', a.name)
                    .limit(100);

                if (!tracks || tracks.length === 0) return;

                const counts = {};
                for (const t of tracks) {
                    if (t.primary_genre_id) {
                        counts[t.primary_genre_id] = (counts[t.primary_genre_id] || 0) + 1;
                    }
                }

                const sorted = Object.entries(counts).sort((x, y) => y[1] - x[1]);
                const dominant = sorted[0]?.[0];
                const dominantCount = sorted[0]?.[1] || 0;
                const dominantPct = dominantCount / tracks.length;

                // If track consensus strongly indicates a different genre (>= 60% agreement or previous genre was bogus)
                if (dominant && dominant !== a.primary_genre_id && (dominantPct >= 0.6 || a.primary_genre_id === 'rock' || a.primary_genre_id === 'hip_hop')) {
                    console.log(`  🔄 "${a.name}": [${a.primary_genre_id}] -> [${dominant}] (${Math.round(dominantPct * 100)}% of ${tracks.length} tracks)`);

                    if (isApply) {
                        await supabase
                            .from('artists')
                            .update({
                                primary_genre_id: dominant,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', a.id);
                    }
                    updatedCount++;
                }
            } catch (err) {
                // ignore
            }
        }));
    }

    console.log("\n=================================================");
    console.log(`✨ Done: ${updatedCount} artist(s) ${isApply ? 'updated in database' : 'identified for update'}.`);
    console.log("=================================================\n");
}

main().catch(console.error);
