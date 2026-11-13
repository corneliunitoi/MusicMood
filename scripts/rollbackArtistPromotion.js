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

const ARTIST_NAME = getArg('--artist=', null);
const SINCE_TIMESTAMP = getArg('--since=', null);
const DRY_RUN = args.includes('--dry-run');

async function rollback() {
    console.log('================================================================');
    console.log('↩️ MUSICMOOD ARTIST PROMOTION ROLLBACK MANAGER');
    console.log(`   Artist Filter: ${ARTIST_NAME || 'ALL'}`);
    console.log(`   Since:         ${SINCE_TIMESTAMP || 'ANY'}`);
    console.log(`   Mode:          ${DRY_RUN ? 'DRY RUN (Preview)' : 'LIVE ROLLBACK'}`);
    console.log('================================================================\n');

    if (!ARTIST_NAME && !SINCE_TIMESTAMP) {
        console.error('❌ Please specify --artist="Name" or --since="ISO_TIMESTAMP"');
        process.exit(1);
    }

    // 1. Locate inflated suggestions
    let suggQuery = supabase
        .from('artist_suggestions')
        .select('*')
        .eq('status', 'inflated');

    if (ARTIST_NAME) suggQuery = suggQuery.ilike('name', ARTIST_NAME);
    if (SINCE_TIMESTAMP) suggQuery = suggQuery.gte('updated_at', SINCE_TIMESTAMP);

    const { data: suggestions, error: sErr } = await suggQuery;
    if (sErr || !suggestions || suggestions.length === 0) {
        console.log('ℹ️ No inflated suggestions found matching criteria.');
        return;
    }

    console.log(`Found ${suggestions.length} promoted artist(s) to rollback:\n`);
    for (const s of suggestions) {
        console.log(` • "${s.name}" (ID: ${s.id}, Promoted Artist ID: ${s.promoted_artist_id || 'none'})`);
    }

    for (const s of suggestions) {
        const artistId = s.promoted_artist_id;
        console.log(`\nRolling back "${s.name}"...`);

        // A. Find tracks inserted via staged_artist_inflation
        let trkQuery = supabase
            .from('tracks')
            .select('id, title, youtube_video_id, source')
            .eq('source', 'staged_artist_inflation');

        if (artistId) {
            trkQuery = trkQuery.eq('artist_id', artistId);
        } else {
            trkQuery = trkQuery.ilike('artist', s.name);
        }

        const { data: tracks, error: tErr } = await trkQuery;
        if (!tErr && tracks && tracks.length > 0) {
            console.log(`   Found ${tracks.length} inflated tracks to remove:`);
            tracks.forEach(t => console.log(`     - "${t.title}" (${t.youtube_video_id})`));

            if (!DRY_RUN) {
                const trackIds = tracks.map(t => t.id);
                const { error: delErr } = await supabase
                    .from('tracks')
                    .delete()
                    .in('id', trackIds);
                if (delErr) {
                    console.warn(`   ⚠️ Error deleting tracks:`, delErr.message);
                } else {
                    console.log(`   ✓ Deleted ${tracks.length} tracks.`);
                }
            }
        } else {
            console.log(`   No inflated tracks found for "${s.name}".`);
        }

        // B. Check if artist in public.artists should be removed or decremented
        if (artistId) {
            const { data: artRec } = await supabase
                .from('artists')
                .select('id, name, track_count, created_at')
                .eq('id', artistId)
                .maybeSingle();

            if (artRec) {
                // If artist was created during this promotion and has 0 remaining tracks
                const tracksRemoved = tracks?.length || 0;
                const remainingTracks = Math.max(0, (artRec.track_count || 0) - tracksRemoved);

                if (!DRY_RUN) {
                    if (remainingTracks === 0) {
                        const { error: artDelErr } = await supabase
                            .from('artists')
                            .delete()
                            .eq('id', artistId);
                        if (!artDelErr) {
                            console.log(`   ✓ Removed artist "${artRec.name}" from public.artists (had 0 other tracks).`);
                        }
                    } else {
                        await supabase
                            .from('artists')
                            .update({ track_count: remainingTracks })
                            .eq('id', artistId);
                        console.log(`   ✓ Updated artist "${artRec.name}" track_count to ${remainingTracks}.`);
                    }
                } else {
                    console.log(`   [Dry Run] Would update/remove artist "${artRec.name}" (remaining tracks: ${remainingTracks}).`);
                }
            }
        }

        // C. Reset artist_suggestions status
        if (!DRY_RUN) {
            await supabase
                .from('artist_suggestions')
                .update({
                    status: 'approved',
                    promoted_artist_id: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', s.id);
            console.log(`   ✓ Reset suggestion status back to "approved".`);
        } else {
            console.log(`   [Dry Run] Would reset suggestion status back to "approved".`);
        }
    }

    console.log('\n================================================================');
    console.log('✅ Rollback execution completed.');
    console.log('================================================================\n');
}

rollback().catch(console.error);
