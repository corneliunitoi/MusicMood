import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { normalizeGenre, ARTIST_CANONICAL_GENRES } from '../src/services/genreNormalizer.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';
const supabase = createClient(supabaseUrl, supabaseKey);

const CLASSICAL_PATTERN = /chopin|liszt|schumann|schubert|tchaikovsky|rachmanin|brahms|mussorgsky|grieg|dvorak|dvořák|rubinstein|horowitz|berliner philharmoniker|claudio abado|orchestra|philharmonic|rossini|beethoven|mozart|bach|vivaldi|handel|puccini|verdi|bizet|donizetti|bellini|segovia|mendelssohn|sibelius/i;

async function healDatabase() {
    console.log("=================================================");
    console.log("🩺 MusicMood Database Classification Healer");
    console.log("   • Purging 'romantic' from modern artists (Depeche Mode, Duran Duran, etc.)");
    console.log("   • Purging 'rock' from classical masters (Liszt, Chopin, Bach, etc.)");
    console.log("   • Aligning Depeche Mode & synth icons to canonical 'synth_pop'");
    console.log("=================================================\n");

    // 1. Fetch tracks with 'romantic' in primary or secondary
    const { data: romanticTracks, error: romErr } = await supabase
        .from('tracks')
        .select('*')
        .or('primary_genre_id.eq.romantic,secondary_genre_ids.cs.{romantic}');

    if (romErr) {
        console.error("❌ Failed to query romantic tracks:", romErr.message);
        return;
    }

    console.log(`Found ${romanticTracks?.length || 0} tracks tagged with 'romantic'. Auditing...`);

    let cleanedRomantic = 0;
    for (const track of (romanticTracks || [])) {
        const fullStr = `${track.artist} ${track.title}`;
        const isClassical = CLASSICAL_PATTERN.test(fullStr);

        if (!isClassical) {
            // Modern artist falsely labeled romantic era!
            const newSecondary = (track.secondary_genre_ids || []).filter(g => g !== 'romantic');
            let newPrimary = track.primary_genre_id;

            if (newPrimary === 'romantic') {
                newPrimary = normalizeGenre(null, track.artist, track.title, 'pop') || 'pop';
            }

            // If Depeche Mode, ensure synth_pop
            if (/depeche mode/i.test(track.artist)) {
                newPrimary = 'synth_pop';
                if (!newSecondary.includes('electronic')) newSecondary.unshift('electronic');
            }

            const { error: updErr } = await supabase
                .from('tracks')
                .update({
                    primary_genre_id: newPrimary,
                    secondary_genre_ids: newSecondary
                })
                .eq('id', track.id);

            if (!updErr) {
                cleanedRomantic++;
                console.log(`   [Healed 🩹] "${track.artist} - ${track.title}": purged 'romantic' -> Primary: ${newPrimary}`);
            }
        }
    }

    // 2. Fetch classical tracks falsely assigned 'rock'
    const { data: rockTracks, error: rockErr } = await supabase
        .from('tracks')
        .select('*')
        .or('primary_genre_id.eq.rock,secondary_genre_ids.cs.{rock}');

    if (rockErr) {
        console.error("❌ Failed to query rock tracks:", rockErr.message);
        return;
    }

    let cleanedClassicalRock = 0;
    for (const track of (rockTracks || [])) {
        const fullStr = `${track.artist} ${track.title}`;
        const isClassical = CLASSICAL_PATTERN.test(fullStr);

        // Exclude actual rock covers / crossovers like Yngwie Malmsteen or Trans-Siberian Orchestra
        const isRockGuitarist = /yngwie|satrian|vai|apocalyptica|trans-siberian|metallica|prog/i.test(fullStr);

        if (isClassical && !isRockGuitarist) {
            const newSecondary = (track.secondary_genre_ids || []).filter(g => g !== 'rock');
            let newPrimary = track.primary_genre_id;

            if (newPrimary === 'rock') {
                newPrimary = normalizeGenre('classical', track.artist, track.title, 'classical') || 'classical';
            }

            const { error: updErr } = await supabase
                .from('tracks')
                .update({
                    primary_genre_id: newPrimary,
                    secondary_genre_ids: newSecondary
                })
                .eq('id', track.id);

            if (!updErr) {
                cleanedClassicalRock++;
                console.log(`   [Healed 🎻] "${track.artist} - ${track.title}": purged 'rock' -> Primary: ${newPrimary}`);
            }
        }
    }

    // 3. Update public.artists for Depeche Mode & Duran Duran
    const targetArtists = ['Depeche Mode', 'Duran Duran', 'New Order', 'Pet Shop Boys', 'A-Ha'];
    for (const name of targetArtists) {
        const { data: art } = await supabase.from('artists').select('*').ilike('name', `%${name}%`);
        for (const a of (art || [])) {
            const cleanSecondary = (a.secondary_genre_ids || []).filter(g => g !== 'romantic');
            await supabase.from('artists').update({
                primary_genre_id: 'synth_pop',
                secondary_genre_ids: cleanSecondary
            }).eq('id', a.id);
            console.log(`   [Artist Healed ✨] ${a.name} -> primary: synth_pop`);
        }
    }

    console.log("\n=================================================");
    console.log(`🎉 Healing complete:`);
    console.log(`   • ${cleanedRomantic} non-classical tracks purged of 'romantic'`);
    console.log(`   • ${cleanedClassicalRock} classical tracks purged of 'rock'`);
    console.log("=================================================");
}

healDatabase();
