import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fetchMusicBrainzArtistGenres } from '../src/services/musicBrainzService.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

const isAll = process.argv.includes('--all');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const BATCH_LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : (isAll ? 1000 : 100);

async function enrichArtists() {
    console.log("=================================================");
    console.log("🌍 MusicMood External MusicBrainz Multi-Genre Enricher");
    console.log("   • Authority: MusicBrainz (MetaBrainz Foundation) & Wikipedia");
    console.log("   • Target: public.artists & public.tracks (Multi-genre GIN indexed)");
    console.log(`   • Mode: ${isAll ? 'Full Catalog Sweep' : 'Active Catalog Priority (Top played)'}`);
    console.log(`   • Batch size: ${BATCH_LIMIT}`);
    console.log("=================================================\n");

    let artistsToEnrich = [];

    if (!isAll) {
        // Step 1: Find ALL distinct artists from public.tracks whose secondary_genre_ids are empty
        let trackArtists = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
            const { data, error: trackError } = await supabase
                .from('tracks')
                .select('artist')
                .or('secondary_genre_ids.is.null,secondary_genre_ids.eq.{}')
                .range(from, from + pageSize - 1);

            if (trackError) {
                console.error("❌ Failed to query tracks:", trackError.message);
                break;
            }
            if (!data || data.length === 0) break;
            trackArtists.push(...data);
            if (data.length < pageSize) break;
            from += pageSize;
        }

        // Count frequency of un-enriched artists in tracks
        const countMap = new Map();
        (trackArtists || []).forEach(t => {
            const a = t.artist?.trim();
            if (a) countMap.set(a, (countMap.get(a) || 0) + 1);
        });

        const sortedArtists = Array.from(countMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, BATCH_LIMIT)
            .map(([name, count]) => ({ name, track_count: count }));

        artistsToEnrich = sortedArtists;
    } else {
        // Query artists directly
        const { data, error } = await supabase
            .from('artists')
            .select('id, name, primary_genre_id, secondary_genre_ids')
            .or('secondary_genre_ids.is.null,secondary_genre_ids.eq.{}')
            .limit(BATCH_LIMIT);

        if (error) {
            console.error("❌ Failed to query artists:", error.message);
            return;
        }
        artistsToEnrich = data || [];
    }

    if (artistsToEnrich.length === 0) {
        console.log("✨ All selected artists already have multi-genre metadata! Nothing to do.");
        return;
    }

    console.log(`Found ${artistsToEnrich.length} distinct artists across un-enriched tracks to resolve...\n`);

    let enrichedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < artistsToEnrich.length; i++) {
        const item = artistsToEnrich[i];
        const artistName = item.name;
        const trackCount = item.track_count || 1;

        process.stdout.write(`[${i + 1}/${artistsToEnrich.length}] "${artistName}" (${trackCount} tracks)... `);

        const mbData = await fetchMusicBrainzArtistGenres(artistName);

        if (!mbData || (mbData.secondary_genre_ids.length === 0 && !mbData.primary_genre_id)) {
            console.log("⏭️ (No tags found)");
            skippedCount++;
            continue;
        }

        const primary = mbData.primary_genre_id;
        const secondary = mbData.secondary_genre_ids || [];
        const tags = mbData.tags || [];
        const mbid = mbData.mbid || null;

        // 1. Update public.artists (or insert if not exists)
        const { data: updatedArtist } = await supabase
            .from('artists')
            .update({
                primary_genre_id: primary,
                secondary_genre_ids: secondary,
                tags,
                mbid
            })
            .ilike('name', artistName)
            .select('id')
            .maybeSingle();

        let artistId = updatedArtist?.id;
        if (!artistId) {
            const { data: inserted } = await supabase
                .from('artists')
                .insert({
                    name: artistName,
                    primary_genre_id: primary,
                    secondary_genre_ids: secondary,
                    tags,
                    mbid
                })
                .select('id')
                .maybeSingle();
            artistId = inserted?.id;
        }

        // 2. Propagate multi-genre metadata to all of this artist's tracks in public.tracks
        const trackUpdatePayload = {
            secondary_genre_ids: secondary
        };
        if (primary) {
            trackUpdatePayload.primary_genre_id = primary;
        }
        if (artistId) {
            trackUpdatePayload.artist_id = artistId;
        }

        const { error: trackUpdateErr } = await supabase
            .from('tracks')
            .update(trackUpdatePayload)
            .ilike('artist', artistName);

        if (trackUpdateErr) {
            console.log(`⚠️ Artist updated, track error: ${trackUpdateErr.message}`);
        } else {
            console.log(`✅ [${primary}] + [${secondary.join(', ') || 'none'}]`);
        }

        enrichedCount++;
    }

    console.log("\n=================================================");
    console.log(`🎉 Enrichment complete!`);
    console.log(`   • Successfully enriched: ${enrichedCount} artists`);
    console.log(`   • Skipped (no tags):     ${skippedCount}`);
    console.log("=================================================");
}

enrichArtists().catch(console.error);
