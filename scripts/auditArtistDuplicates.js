import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export function normalizeArtistKey(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove diacritics
        .replace(/[‐‑‒–—―-]/g, ' ') // normalize all hyphens to space
        .replace(/[^a-z0-9\s]/g, '') // remove punctuation
        .replace(/\s+/g, ' ')
        .trim();
}

export function scoreArtistNameQuality(name) {
    if (!name) return 0;
    let score = 10;
    // Penalize CJK / mojibake characters in western artist names
    if (/[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef]/.test(name) && !/^[^\x00-\x7F]+$/.test(name)) score -= 30;
    // Penalize odd unicode dashes/hyphens (e.g. U+2010 hyphen)
    if (/[\u2010\u2011\u2012\u2013\u2014]/.test(name)) score -= 15;
    // Penalize ALL-CAPS if longer than 3 chars (e.g. PINK FLOYD vs Pink Floyd, but allow U2, R.E.M.)
    if (name.length > 3 && name === name.toUpperCase()) score -= 20;
    // Penalize all-lowercase (e.g. "nine inch nails" vs "Nine Inch Nails")
    if (name === name.toLowerCase()) score -= 15;
    // Reward standard accented Latin letters (e.g. Björk, Frédéric, Paco de Lucía, Antonín Dvořák)
    if (/[áàâäãåçéèêëíìîïñóòôöõúùûüýÿřžščďťňľ]/i.test(name)) score += 10;
    // Reward standard hyphen (e.g. Jean-Michel Jarre)
    if (name.includes('-')) score += 5;
    return score;
}

export function pickCanonicalArtist(list) {
    return [...list].sort((a, b) => {
        const scoreDiff = scoreArtistNameQuality(b.name) - scoreArtistNameQuality(a.name);
        if (scoreDiff !== 0) return scoreDiff;
        const avatarDiff = (b.avatar_url ? 1 : 0) - (a.avatar_url ? 1 : 0);
        if (avatarDiff !== 0) return avatarDiff;
        return (b.track_count || 0) - (a.track_count || 0);
    })[0];
}

async function runAudit() {
    console.log('Fetching all artists from Supabase...');
    const PAGE_SIZE = 1000;
    let all = [];
    let page = 0;
    while (true) {
        const { data, error } = await supabase
            .from('artists')
            .select('id, name, track_count, avatar_url, slug, primary_genre_id, upvotes')
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error || !data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE_SIZE) break;
        page++;
    }

    console.log(`Fetched ${all.length} artists total.`);

    const groups = new Map();
    for (const a of all) {
        const norm = normalizeArtistKey(a.name);
        if (!norm) continue;
        if (!groups.has(norm)) groups.set(norm, []);
        groups.get(norm).push(a);
    }

    const dupes = [];
    for (const [norm, list] of groups.entries()) {
        if (list.length > 1) {
            dupes.push({ norm, list });
        }
    }

    console.log(`Found ${dupes.length} duplicate artist clusters in artists table.`);

    dupes.sort((a, b) => {
        const sumA = a.list.reduce((acc, x) => acc + (x.track_count || 0), 0);
        const sumB = b.list.reduce((acc, x) => acc + (x.track_count || 0), 0);
        return sumB - sumA;
    });

    console.log('\nTop 30 duplicate clusters by total tracks:');
    for (const d of dupes.slice(0, 30)) {
        const canonical = pickCanonicalArtist(d.list);
        console.log(`\nCluster: "${d.norm}" (Total Tracks: ${d.list.reduce((acc, x) => acc + (x.track_count || 0), 0)})`);
        console.log(`  🌟 CANONICAL PICK: "${canonical.name}" [${canonical.id}]`);
        for (const item of d.list) {
            const isCanon = item.id === canonical.id;
            console.log(`  ${isCanon ? '->' : '  '} [${item.id}] "${item.name}" | tracks: ${item.track_count} | genre: ${item.primary_genre_id} | avatar: ${!!item.avatar_url}`);
        }
    }
}

runAudit();
