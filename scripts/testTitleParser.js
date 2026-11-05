import { supabase } from '../src/services/supabaseService.js';
import { normalizeGenre } from '../src/services/genreNormalizer.js';

function isChannelOrJunkArtist(artist) {
  if (!artist || typeof artist !== 'string') return true;
  const clean = artist.trim().toLowerCase();
  if (clean.length < 2) return true;
  if (/^(unknown(\s*artist)?|various(\s*artists)?|track\s*[0-9]+|disc\s*[0-9]+|cd\s*[0-9]+)$/i.test(clean)) return true;

  // Channel markers
  if (/records|recordings|official|show|archives|hall of fame|vevo|npr|workshp|club|planet|archéologie|guitar|tv|radio|war|master|monster|alancox|proko|atsusiueno|jeffrey|rinconcete|unstitched|youmoretv/i.test(clean)) {
    return true;
  }
  // CamelCase or single word handles like "BestMasterGuitar", "stillrocknroller57", "twilightzonewar"
  if (/^[a-z0-9_]{10,}$/i.test(clean) && !clean.includes(' ')) return true;
  if (/[0-9]{2,}$/.test(clean)) return true; // e.g. prokoman1, stillrocknroller57

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

  // If artist is missing or an obvious channel name, try to extract from title
  if (isChannelOrJunkArtist(artist) || !artist) {
    let matched = false;

    // Try separators: ' - ', ' – ', ' — ', ' ~ ', or hyphen with no space 'Artist-Title'
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

async function run() {
  const { data: tracks } = await supabase.from('tracks').select('*').ilike('source', 'yt_pl:%');
  console.log(`Testing refined extractor on ${tracks.length} tracks...`);

  let count = 0;
  for (const t of tracks) {
    const parsed = extractArtistAndTitle(t.title, t.artist);
    const resolvedGenre = normalizeGenre(t.source.replace('yt_pl:', ''), parsed.artist);

    if (parsed.artist.toLowerCase() !== t.artist.toLowerCase() || resolvedGenre !== t.primary_genre_id) {
      count++;
      console.log(`[#${count}] ORIG: "${t.artist}" - "${t.title}" (${t.primary_genre_id})`);
      console.log(`     NEW:  "${parsed.artist}" - "${parsed.title}" -> ${resolvedGenre}`);
    }
  }
  console.log(`\nTotal refined & reclassified tracks: ${count} of ${tracks.length}`);
}

run().catch(console.error);
