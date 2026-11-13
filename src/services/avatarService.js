/**
 * avatarService.js
 * 
 * Client-Side Dynamic On-Demand Artist Profile Picture Resolver for MusicMood.
 * When an artist profile is displayed or clicked and their picture is blank/missing,
 * this service queries Wikipedia / Wikimedia Commons (Open-License CC-BY / Public Domain)
 * on demand, updates the UI immediately, and saves the link to Supabase.
 */

import { supabase } from './supabaseService';

// In-memory session cache of resolved avatars
const resolvedCache = new Map();
const inFlightRequests = new Map();

export function cleanArtistNameVariants(name) {
    if (!name) return [];
    let clean = name.trim();
    const candidates = [clean];

    // Known artist aliases & diacritic fixes
    if (clean.toLowerCase().includes('andres ségovia') || clean.toLowerCase().includes('andres segovia')) {
        candidates.push('Andrés Segovia');
    }
    if (clean.includes('μ‐Ziq') || clean.includes('μ-Ziq')) {
        candidates.push('Mu-Ziq');
        candidates.push('Mike Paradinas');
    }
    if (clean.toLowerCase().includes('hiromi the trio project')) {
        candidates.push('Hiromi Uehara');
        candidates.push('Hiromi');
    }
    if (clean.toLowerCase().includes('carreras') && clean.toLowerCase().includes('domingo') && clean.toLowerCase().includes('pavarotti')) {
        candidates.push('Luciano Pavarotti');
        candidates.push('The Three Tenors');
    }
    if (clean.toLowerCase().includes('elîna garanca') || clean.toLowerCase().includes('elina garanca')) {
        candidates.push('Elīna Garanča');
    }
    if (clean.toLowerCase().includes('moscow phil')) {
        candidates.push('Moscow Philharmonic Orchestra');
    }
    if (clean.toLowerCase().includes('jeff beck')) {
        candidates.push('Jeff Beck');
    }
    if (clean.toLowerCase().includes('k.flagstad') || clean.toLowerCase().includes('kirsten flagstad')) {
        candidates.push('Kirsten Flagstad');
    }
    if (clean.toLowerCase().includes('riccardo chailly')) {
        candidates.push('Riccardo Chailly');
        candidates.push('Gewandhausorchester');
    }
    if (clean.toLowerCase().includes('john eliot gardiner')) {
        candidates.push('John Eliot Gardiner');
    }
    if (clean.toLowerCase().includes('richard bonynge')) {
        candidates.push('Richard Bonynge');
    }
    if (clean.toLowerCase().includes('paco de luc')) {
        candidates.push('Paco de Lucía');
    }
    if (clean.toLowerCase().includes('fischer-dieskau')) {
        candidates.push('Dietrich Fischer-Dieskau');
    }
    if (clean.toLowerCase().includes('pavarotti')) {
        candidates.push('Luciano Pavarotti');
    }

    // Split by slash or backslash: 'Dietrich Fischer-Dieskau\Jörg Demus'
    if (clean.includes('\\') || clean.includes('/')) {
        const parts = clean.split(/[\\/]/);
        parts.forEach(p => { if (p && p.trim().length > 2) candidates.push(p.trim()); });
    }

    // Split by hyphen with orchestra/band: 'Richard Bonynge - National Philharmonic Orchestra'
    if (clean.includes(' - ')) {
        const parts = clean.split(' - ');
        parts.forEach(p => { if (p && p.trim().length > 2) candidates.push(p.trim()); });
    }

    // Inverted names: 'Caruso, Enrico' -> 'Enrico Caruso'
    if (clean.includes(', ') && !clean.includes(';')) {
        const parts = clean.split(', ');
        if (parts.length === 2 && !/^(piano|violin|cello|orch|soprano|tenor)/i.test(parts[1])) {
            candidates.push(`${parts[1]} ${parts[0]}`);
        }
    }

    // Fix corrupted characters/diacritics
    const fixed = clean
        .replace(/Frйdйric/g, 'Frédéric')
        .replace(/Aleksi Perдlд/g, 'Aleksi Perälä')
        .replace(/Paco de Lucнa/g, 'Paco de Lucía')
        .replace(/Ramуn/g, 'Ramón');
    if (fixed !== clean) candidates.push(fixed);

    // Remove instrument suffixes: 'Santiago Rodriguez, piano' -> 'Santiago Rodriguez'
    const noInst = clean.replace(/,\s*(piano|violin|cello|conductor|soprano|tenor|baritone).*$/i, '').trim();
    if (noInst !== clean) candidates.push(noInst);

    // Parentheticals: 'Scarlatti (Pieter-Jan Belder)' -> 'Domenico Scarlatti', 'Pieter-Jan Belder'
    const parenthetical = clean.match(/^(.*?)\s*\((.*?)\)$/);
    if (parenthetical) {
        if (parenthetical[1].toLowerCase().includes('scarlatti')) candidates.push('Domenico Scarlatti');
        candidates.push(parenthetical[2]);
    }

    // Collaborations: 'Ella Fitzgerald & Louis Armstrong' -> 'Ella Fitzgerald', 'Louis Armstrong'
    if (clean.includes(' & ') || clean.includes(' and ') || clean.includes(' feat ') || clean.includes(' feat. ')) {
        const parts = clean.split(/\s+(?:&|and|feat\.?)\s+/i);
        parts.forEach(p => { if (p && p.trim().length > 2) candidates.push(p.trim()); });
    }

    // Comma lists: 'Keith Jarrett, Gary Peacock, Jack DeJohnette' -> 'Keith Jarrett'
    if (clean.includes(', ')) {
        const primary = clean.split(',')[0].trim();
        if (primary && primary.length > 2) candidates.push(primary);
    }

    if (clean.toLowerCase() === 'tom jones') {
        candidates.push('Tom Jones (singer)');
    }
    if (clean === 'Anti Martikainen') {
        candidates.push('Antti Martikainen');
    }
    if (clean === 'そこに鳴る') {
        candidates.push('Sokoninaru');
    }
    if (clean === 'For You.Earth') {
        candidates.push('For You. Earth');
    }
    if (clean.includes("Choir of New College Oxford")) {
        candidates.push('Choir of New College Oxford');
    }
    if (clean === 'Pechocova') {
        candidates.push('Slávka Pechocová');
        candidates.push('Jana Pechocova');
    }
    if (clean === 'Spaced Out') {
        candidates.push('SpacedOut');
    }
    if (clean.includes('Liviu Vasilic')) {
        candidates.push('Liviu Vasilica');
    }

    return [...new Set(candidates)];
}

async function queryWikipediaSummary(artistName) {
    const clean = (artistName || '').trim();
    if (!clean || clean.length < 2) return null;

    const variants = [clean, `${clean} (band)`, `${clean} (musician)`, `${clean} (singer)`];

    for (const v of variants) {
        try {
            const wikiName = v.replace(/\s+/g, '_');
            const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiName)}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.type !== 'disambiguation' && data.thumbnail?.source && !data.thumbnail.source.endsWith('.svg')) {
                    return data.thumbnail.source;
                }
            }
        } catch { }
    }
    return null;
}

/**
 * Resolves an artist avatar dynamically on demand if missing in the UI.
 * Persists the resolved image link to Supabase asynchronously.
 */
export async function resolveArtistAvatarOnDemand(artist) {
    if (!artist || !artist.name) return null;
    const artistName = artist.name.trim();

    if (artist.avatar_url && artist.avatar_url !== 'FALLBACK') {
        return artist.avatar_url;
    }

    if (resolvedCache.has(artistName)) {
        return resolvedCache.get(artistName);
    }

    if (inFlightRequests.has(artistName)) {
        return inFlightRequests.get(artistName);
    }

    const fetchPromise = (async () => {
        const nameVariants = cleanArtistNameVariants(artistName);

        for (const nameCandidate of nameVariants) {
            const pic = await queryWikipediaSummary(nameCandidate);
            if (pic) {
                resolvedCache.set(artistName, pic);

                // Asynchronously persist to Supabase in the background
                if (artist.id) {
                    supabase
                        .from('artists')
                        .update({ avatar_url: pic, updated_at: new Date().toISOString() })
                        .eq('id', artist.id)
                        .catch(() => {});
                }

                inFlightRequests.delete(artistName);
                return pic;
            }
        }

        resolvedCache.set(artistName, null);
        inFlightRequests.delete(artistName);
        return null;
    })();

    inFlightRequests.set(artistName, fetchPromise);
    return fetchPromise;
}
