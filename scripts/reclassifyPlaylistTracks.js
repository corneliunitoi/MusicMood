import { supabase } from '../src/services/supabaseService.js';
import { normalizeGenre } from '../src/services/genreNormalizer.js';

function isChannelOrJunkArtist(artist) {
    if (!artist || typeof artist !== 'string') return true;
    const clean = artist.trim().toLowerCase();
    if (clean.length < 2) return true;
    if (/^(unknown(\s*artist)?|various(\s*artists)?|track\s*[0-9]+|disc\s*[0-9]+|cd\s*[0-9]+)$/i.test(clean)) return true;

    if (/records|recordings|official|show|archives|hall of fame|vevo|npr|workshp|club|planet|archéologie|guitar|tv|radio|war|master|monster|alancox|proko|atsusiueno|jeffrey|rinconcete|unstitched|youmoretv|vaimusic/i.test(clean)) {
        return true;
    }
    if (/^[a-z0-9_]{10,}$/i.test(clean) && !clean.includes(' ')) return true;
    if (/[0-9]{2,}$/.test(clean)) return true;

    return false;
}

function cleanTitle(rawTitle) {
    return (rawTitle || '')
        .replace(/\[(official\s*(music\s*)?video|audio|lyrics?|hd|4k|remastered?|live.*?|archive.*?)\]/gi, '')
        .replace(/\((official\s*(music\s*)?video|audio|lyrics?|hd|4k|remastered?|live.*?|upscaled|correct.*?)\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractArtistAndTitle(rawTitle, rawArtist) {
    let title = cleanTitle(rawTitle);
    let artist = (rawArtist || '').replace(/\s*-\s*Topic$/i, '').trim();

    if (isChannelOrJunkArtist(artist) || !artist) {
        let matched = false;

        // Pattern: "Title by Artist"
        const byMatch = title.match(/^(.*?)\s+by\s+(?:the\s+)?([A-Za-z0-9\s&,.']+?)(?:\s+featuring.*|\s*\([0-9]+\)|\s*$)/i);
        if (byMatch && byMatch[2].trim().length >= 2) {
            artist = byMatch[2].trim();
            title = byMatch[1].trim();
            matched = true;
        }

        // Separators: ' - ', ' – ', ' — ', ' ~ ', or hyphen with no space 'Artist-Title'
        if (!matched) {
            const sepMatch = title.match(/^(.*?)\s*([–—~]|\s-\s|-(?=[A-Za-z0-9]))\s*(.*)$/);
            if (sepMatch) {
                const left = sepMatch[1].trim();
                const right = sepMatch[3].trim();
                if (left.length >= 2 && right.length >= 2) {
                    artist = left;
                    title = right;
                    matched = true;
                }
            }
        }

        if (!matched && title.includes(' / ')) {
            const parts = title.split(' / ');
            if (parts[0].length >= 2 && parts[1].length >= 2) {
                artist = parts[0].trim();
                title = parts.slice(1).join(' / ').trim();
                matched = true;
            }
        }

        if (!matched && title.includes(': ')) {
            const parts = title.split(': ');
            if (parts[0].length >= 2 && parts[0].length < 35 && parts[1].length >= 2) {
                artist = parts[0].trim();
                title = parts.slice(1).join(': ').trim();
                matched = true;
            }
        }

        if (!matched) {
            const quoteMatch = title.match(/^(.*?)\s*["“](.*?)["”]/);
            if (quoteMatch && quoteMatch[1].trim().length >= 2) {
                artist = quoteMatch[1].trim();
                title = quoteMatch[2].trim();
                matched = true;
            }
        }
    }

    // Clean leading track numbers
    title = title.replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '').trim();
    artist = artist.replace(/^[0-9]+(\s*[-_.]\s*|\s+)/, '').trim();

    return { artist: artist || rawArtist || 'Unknown Artist', title: title || rawTitle };
}

async function reclassifyTracks() {
    console.log('Fetching all playlist-ingested tracks...');
    const { data: tracks, error } = await supabase
        .from('tracks')
        .select('*')
        .ilike('source', 'yt_pl:%');

    if (error) {
        console.error('Error fetching tracks:', error);
        return;
    }

    console.log(`Found ${tracks.length} tracks to inspect and reclassify.`);

    let updatedCount = 0;
    for (const t of tracks) {
        const parsed = extractArtistAndTitle(t.title, t.artist);
        const playlistRawGenre = t.source.replace('yt_pl:', '').trim();
        const resolvedGenre = normalizeGenre(playlistRawGenre, parsed.artist);

        const artistChanged = parsed.artist.trim().toLowerCase() !== t.artist.trim().toLowerCase();
        const titleChanged = parsed.title.trim() !== t.title.trim();
        const genreChanged = resolvedGenre !== t.primary_genre_id;

        if (artistChanged || titleChanged || genreChanged) {
            console.log(`[Updating] "${t.artist} - ${t.title}" (${t.primary_genre_id}) -> "${parsed.artist} - ${parsed.title}" (${resolvedGenre})`);

            const { error: updateError } = await supabase
                .from('tracks')
                .update({
                    artist: parsed.artist,
                    title: parsed.title,
                    primary_genre_id: resolvedGenre
                })
                .eq('id', t.id);

            if (updateError) {
                console.error(`Error updating track ${t.id}:`, updateError);
            } else {
                updatedCount++;
            }
        }
    }

    console.log(`\n🎉 Reclassification Complete! Updated ${updatedCount} of ${tracks.length} tracks.`);
}

reclassifyTracks().catch(console.error);
