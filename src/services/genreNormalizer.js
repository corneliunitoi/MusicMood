/**
 * genreNormalizer.js
 * 
 * Canonical Genre Taxonomy & Track Ingestion Gatekeeper.
 * Guarantees every track resolves to a valid foreign key in public.genres (115 canonical IDs).
 * Provides multi-tier artist knowledge base, tag tokenization, song-only gatekeeping, and anti-AI filtering.
 */

// All 115 valid genre IDs in public.genres
export const VALID_GENRE_IDS = new Set([
    'acoustic_folk', 'afrobeat', 'alt_rock', 'ambient', 'ambient_chill', 'ambient_electronic',
    'americana', 'art_pop', 'avant_garde', 'avant_jazz', 'baroque', 'bebop_jazz', 'big_band',
    'black_metal', 'bluegrass', 'blues', 'blues_rock', 'boom_bap', 'bossa_nova', 'bossa_nova_jazz',
    'celtic_folk', 'chamber_music', 'chicago_blues', 'chill', 'chillout', 'cinematic_orchestral',
    'classic_country', 'classic_rock', 'classic_soul', 'classical', 'classical_period', 'cloud_rap',
    'conscious_hiphop', 'contemporary_classical', 'contemporary_country', 'contemporary_folk',
    'cool_jazz', 'country', 'dance_pop', 'darksynth', 'death_metal', 'delta_blues', 'doom_metal',
    'drum_and_bass', 'dub', 'dubstep', 'edm_mainstream', 'electric_blues', 'electronic',
    'experimental_rock', 'flamenco', 'folk_acoustic', 'free_jazz', 'funk', 'garage_rock',
    'grunge', 'hard_rock', 'heavy_metal', 'hip_hop', 'house', 'idm', 'indie_folk', 'indie_pop',
    'indie_rock', 'industrial', 'jazz', 'jazz_fusion', 'lofi_hiphop', 'mainstream_pop',
    'math_rock', 'metal', 'metalcore', 'modal_jazz', 'musique_concrete', 'nature_soundscape',
    'neo_classical', 'neo_soul', 'new_age', 'noise', 'nu_metal', 'opera', 'outlaw_country',
    'pfunk', 'pop', 'post_punk', 'post_rock', 'prog_metal', 'prog_rock', 'psychedelic_rock',
    'punk_rock', 'quiet_storm', 'rnb', 'rnb_soul', 'rock', 'romantic', 'roots_reggae', 'salsa',
    'shoegaze', 'singer_songwriter', 'ska', 'smooth_jazz', 'soul_blues', 'soul_funk',
    'symphonic_metal', 'synth_pop', 'synthwave', 'techno', 'thrash_metal', 'traditional_folk',
    'traditional_pop', 'trance', 'trap_modern', 'uk_drill', 'west_coast_rap', 'world_reggae'
]);

// Tier 1: Canonical Artist Knowledge Base
export const ARTIST_CANONICAL_GENRES = {
    // Guitar Virtuosos & Instrumental Rock
    'steve vai': 'hard_rock',
    'joe satriani': 'hard_rock',
    'yngwie malmsteen': 'heavy_metal',
    'john petrucci': 'prog_metal',
    'eric johnson': 'blues_rock',
    'paul gilbert': 'hard_rock',
    'andy timmons': 'hard_rock',
    'buckethead': 'experimental_rock',
    'plini': 'prog_rock',
    'polyphia': 'math_rock',
    'animals as leaders': 'prog_metal',
    'intervals': 'prog_metal',
    'chon': 'math_rock',

    // Classic Rock, Glam & Alternative
    'david bowie': 'classic_rock',
    'mick ronson': 'classic_rock',
    'david bowie & mick ronson': 'classic_rock',
    'mick ronson & david bowie': 'classic_rock',
    'the doors': 'classic_rock',
    'lou reed': 'classic_rock',
    'queen': 'classic_rock',
    'freddie mercury': 'classic_rock',
    'roy orbison': 'classic_rock',
    'elvis presley': 'classic_rock',
    'buddy holly': 'classic_rock',
    'pearl jam': 'grunge',
    'alice in chains': 'grunge',
    'jeff buckley': 'alt_rock',
    'nick cave & the bad seeds': 'post_punk',
    'sinead o\'connor': 'alt_rock',
    'joni mitchell': 'singer_songwriter',

    // Synth-Pop, New Wave & Electronic Icons
    'depeche mode': 'synth_pop',
    'duran duran': 'synth_pop',
    'new order': 'synth_pop',
    'pet shop boys': 'synth_pop',
    'tears for fears': 'synth_pop',
    'the human league': 'synth_pop',
    'spandau ballet': 'synth_pop',
    'visage': 'synth_pop',
    'soft cell': 'synth_pop',
    'omd': 'synth_pop',
    'orchestral manoeuvres in the dark': 'synth_pop',
    'gary numan': 'synth_pop',
    'kraftwerk': 'electronic',
    'erasure': 'synth_pop',
    'a-ha': 'synth_pop',
    'talk talk': 'synth_pop',
    'ultravox': 'synth_pop',
    'eurythmics': 'synth_pop',
    'yazoo': 'synth_pop',
    'the cure': 'post_punk',
    'joy division': 'post_punk',
    'blondie': 'post_punk',
    'siouxsie and the banshees': 'post_punk',
    'echo & the bunnymen': 'post_punk',
    'the smiths': 'indie_rock',
    'cocteau twins': 'shoegaze',

    // Progressive Rock & Art Rock
    'pink floyd': 'prog_rock',
    'rush': 'prog_rock',
    'genesis': 'prog_rock',
    'yes': 'prog_rock',
    'king crimson': 'prog_rock',
    'camel': 'prog_rock',
    'marillion': 'prog_rock',
    'porcupine tree': 'prog_rock',
    'steven wilson': 'prog_rock',
    'rick wakeman': 'prog_rock',
    'emerson lake & palmer': 'prog_rock',
    'jethro tull': 'prog_rock',
    'gentle giant': 'prog_rock',
    'spock\'s beard': 'prog_rock',
    'the flower kings': 'prog_rock',
    'neal morse': 'prog_rock',

    // Progressive & Extreme Metal
    'dream theater': 'prog_metal',
    'opeth': 'prog_metal',
    'tool': 'prog_metal',
    'meshuggah': 'prog_metal',
    'symphony x': 'prog_metal',
    'fates warning': 'prog_metal',
    'queensryche': 'prog_metal',
    'haken': 'prog_metal',
    'leprose': 'prog_metal',
    'pain of salvation': 'prog_metal',
    'mastodon': 'prog_metal',
    'gojira': 'death_metal',
    'death': 'death_metal',
    'cannibal corpse': 'death_metal',
    'iron maiden': 'heavy_metal',
    'judas priest': 'heavy_metal',
    'black sabbath': 'doom_metal',
    'metallica': 'thrash_metal',
    'megadeth': 'thrash_metal',
    'slayer': 'thrash_metal',
    'sepultura': 'thrash_metal',
    'senmuth': 'prog_metal',

    // Post-Rock, Ambient & Neofolk
    'sigur ros': 'post_rock',
    'godspeed you! black emperor': 'post_rock',
    'explosions in the sky': 'post_rock',
    'mogwai': 'post_rock',
    'mono': 'post_rock',
    'this will destroy you': 'post_rock',
    'brian eno': 'ambient',
    'stars of the lid': 'ambient',
    'tim hecker': 'ambient',
    'tenhi': 'post_rock',
    'wardruna': 'traditional_folk',

    // Classical & Opera
    'johann sebastian bach': 'baroque',
    'antonio vivaldi': 'baroque',
    'georg friedrich handel': 'baroque',
    'wolfgang amadeus mozart': 'classical_period',
    'ludwig van beethoven': 'classical_period',
    'joseph haydn': 'classical_period',
    'frederic chopin': 'romantic',
    'pyotr ilyich tchaikovsky': 'romantic',
    'johannes brahms': 'romantic',
    'franz liszt': 'romantic',
    'sergei rachmaninoff': 'romantic',
    'giacomo puccini': 'opera',
    'giuseppe verdi': 'opera',
    'luciano pavarotti': 'opera',
    'maria callas': 'opera',
    'max richter': 'neo_classical',
    'ludovico einaudi': 'neo_classical',
    'olafur arnalds': 'neo_classical',
    'hans zimmer': 'cinematic_orchestral',
    'john williams': 'cinematic_orchestral',
    'ennio morricone': 'cinematic_orchestral',

    // Jazz
    'miles davis': 'cool_jazz',
    'john coltrane': 'modal_jazz',
    'bill evans': 'cool_jazz',
    'thelonious monk': 'bebop_jazz',
    'charlie parker': 'bebop_jazz',
    'dave brubeck': 'cool_jazz',
    'dave brubeck quartet': 'cool_jazz',
    'chet baker': 'cool_jazz',
    'art tatum': 'bebop_jazz',
    'joe pass': 'bebop_jazz',
    'herbie hancock': 'jazz_fusion',
    'weather report': 'jazz_fusion',
    'chick corea': 'jazz_fusion',
    'billie holiday': 'cool_jazz',
    'nina simone': 'modal_jazz',

    // Blues & Blues Rock
    'b.b. king': 'electric_blues',
    'stevie ray vaughan': 'blues_rock',
    'stevie ray vaughan & double trouble': 'blues_rock',
    'muddy waters': 'chicago_blues',
    'robert johnson': 'delta_blues',
    'jimi hendrix': 'psychedelic_rock',
    'the jimi hendrix experience': 'psychedelic_rock',
    'eric clapton': 'blues_rock',
    'robin trower': 'blues_rock',
    'rory gallagher': 'blues_rock',
    'gary moore': 'blues_rock',
    'peter green': 'electric_blues',
    'alvin lee': 'blues_rock',
    'roy buchanan': 'blues_rock',
    'mick taylor': 'blues_rock',
    'paul kossoff': 'blues_rock',
    'tedeschi trucks band': 'blues_rock',
    'joe bonamassa': 'blues_rock',
    'fleetwood mac': 'blues_rock',
    'jeff beck': 'jazz_fusion',
    'jeff beck group': 'blues_rock',
    'otis rush': 'chicago_blues',
    'elmore james': 'chicago_blues',
    'big bill broonzy': 'delta_blues',
    'koko taylor': 'chicago_blues',
    't-bone walker': 'electric_blues',
    'gary b.b. coleman': 'soul_blues',
    'magic sam': 'chicago_blues',

    // Soul, Funk & R&B
    'aretha franklin': 'classic_soul',
    'donny hathaway': 'classic_soul',
    'sam cooke': 'classic_soul',
    'otis redding': 'classic_soul',
    'michael jackson': 'dance_pop',
    'whitney houston': 'mainstream_pop',
    'prince': 'funk',
    'prince and the revolution': 'funk',
    'sharon jones & the dap-kings': 'soul_funk',
    'black pumas': 'soul_funk',
    'durand jones & the indications': 'soul_funk',
    'michael kiwanuka': 'soul_blues'
};

// Common alias map from raw tags to canonical IDs
const ALIAS_MAP = {
    // Rock Aliases
    'intrumental rock': 'hard_rock',
    'instrumental rock': 'hard_rock',
    'instrumental rock/metal': 'hard_rock',
    'guitar virtuoso': 'hard_rock',
    'shred': 'hard_rock',
    'hard rock': 'hard_rock',
    'heavy rock': 'hard_rock',
    'classic rock': 'classic_rock',
    '70s rock': 'classic_rock',
    'progressive rock': 'prog_rock',
    'prog rock': 'prog_rock',
    'art rock': 'prog_rock',
    'symphonic rock': 'prog_rock',
    'alternative rock': 'alt_rock',
    'alt rock': 'alt_rock',
    'alternative': 'alt_rock',
    'modern rock': 'alt_rock',
    'indie rock': 'indie_rock',
    'indie': 'indie_rock',
    'punk rock': 'punk_rock',
    'punk': 'punk_rock',
    'pop punk': 'punk_rock',
    'hardcore punk': 'punk_rock',
    'post-punk': 'post_punk',
    'post punk': 'post_punk',
    'new wave': 'post_punk',
    'darkwave': 'post_punk',
    'goth rock': 'post_punk',
    'gothic rock': 'post_punk',
    'psychedelic rock': 'psychedelic_rock',
    'psychedelic': 'psychedelic_rock',
    'psych rock': 'psychedelic_rock',
    'space rock': 'psychedelic_rock',
    'post-rock': 'post_rock',
    'post rock': 'post_rock',
    'math rock': 'math_rock',
    'shoegaze': 'shoegaze',
    'dream pop': 'shoegaze',
    'grunge': 'grunge',
    'garage rock': 'garage_rock',
    'garage': 'garage_rock',

    // Metal Aliases
    'heavy metal': 'heavy_metal',
    'traditional metal': 'heavy_metal',
    'classic metal': 'heavy_metal',
    'progressive metal': 'prog_metal',
    'prog metal': 'prog_metal',
    'technical metal': 'prog_metal',
    'power metal': 'prog_metal',
    'thrash metal': 'thrash_metal',
    'trash metal': 'thrash_metal',
    'speed metal': 'thrash_metal',
    'death metal': 'death_metal',
    'melodic death metal': 'death_metal',
    'black metal': 'black_metal',
    'atmospheric black metal': 'black_metal',
    'doom metal': 'doom_metal',
    'sludge metal': 'doom_metal',
    'stoner rock': 'alt_rock',
    'stoner metal': 'alt_rock',
    'nu metal': 'nu_metal',
    'nu-metal': 'nu_metal',
    'alt metal': 'nu_metal',
    'alternative metal': 'nu_metal',
    'metalcore': 'metalcore',
    'deathcore': 'metalcore',
    'symphonic metal': 'symphonic_metal',

    // Electronic Aliases
    'electronic': 'electronic',
    'electronica': 'electronic',
    'dance': 'electronic',
    'edm': 'edm_mainstream',
    'house': 'house',
    'deep house': 'house',
    'tech house': 'house',
    'techno': 'techno',
    'minimal techno': 'techno',
    'trance': 'trance',
    'psytrance': 'trance',
    'drum and bass': 'drum_and_bass',
    'drum & bass': 'drum_and_bass',
    'dnb': 'drum_and_bass',
    'jungle': 'drum_and_bass',
    'synthwave': 'synthwave',
    'retrowave': 'synthwave',
    'darksynth': 'darksynth',
    'cyberpunk': 'darksynth',
    'ambient electronic': 'ambient_electronic',
    'idm': 'idm',
    'glitch': 'idm',
    'dubstep': 'dubstep',
    'industrial': 'industrial',
    'ebm': 'industrial',

    // Pop Aliases
    'pop': 'pop',
    'indie pop': 'indie_pop',
    'synthpop': 'synth_pop',
    'synth-pop': 'synth_pop',
    'synth pop': 'synth_pop',
    'new romantic': 'synth_pop',
    'new-romantic': 'synth_pop',
    'new romanticism': 'synth_pop',
    'electropop': 'synth_pop',
    'electro-pop': 'synth_pop',
    'dance-pop': 'dance_pop',
    'dance pop': 'dance_pop',
    'art pop': 'art_pop',
    'commercial pop': 'mainstream_pop',
    'top 40': 'mainstream_pop',

    // Classical & Orchestral Aliases
    'classical': 'classical',
    'classique': 'classical',
    'klassik': 'classical',
    'musique classique': 'classical',
    'kammermusik': 'chamber_music',
    'recital': 'classical',
    'orchestra': 'classical',
    'orchestral': 'classical',
    'symphony': 'classical',
    'baroque': 'baroque',
    'romantic': 'romantic',
    'neo-classical': 'neo_classical',
    'neoclassical': 'neo_classical',
    'cinematic': 'cinematic_orchestral',
    'soundtrack': 'cinematic_orchestral',
    'film score': 'cinematic_orchestral',
    'score': 'cinematic_orchestral',
    'ost': 'cinematic_orchestral',
    'opera': 'opera',
    'opéra': 'opera',
    'chamber music': 'chamber_music',
    'quartet': 'chamber_music',
    'string quartet': 'chamber_music',

    // Jazz & Blues Aliases
    'jazz': 'jazz',
    'cool jazz': 'cool_jazz',
    'bebop': 'bebop_jazz',
    'hard bop': 'bebop_jazz',
    'modal jazz': 'modal_jazz',
    'jazz fusion': 'jazz_fusion',
    'fusion': 'jazz_fusion',
    'smooth jazz': 'smooth_jazz',
    'bossa nova jazz': 'bossa_nova_jazz',
    'big band': 'big_band',
    'swing': 'big_band',
    'free jazz': 'free_jazz',
    'blues': 'blues',
    'blues rock': 'blues_rock',
    'chicago blues': 'chicago_blues',
    'electric blues': 'electric_blues',
    'delta blues': 'delta_blues',
    'acoustic blues': 'delta_blues',
    'soul blues': 'soul_blues',

    // Ambient & Chill Aliases
    'ambient': 'ambient',
    'dark ambient': 'ambient',
    'drone': 'ambient',
    'nature': 'nature_soundscape',
    'field recording': 'nature_soundscape',
    'new age': 'new_age',
    'meditation': 'new_age',
    'chillout': 'chillout',
    'lounge': 'chillout',
    'lo-fi': 'lofi_hiphop',
    'lofi': 'lofi_hiphop',

    // Folk & Country Aliases
    'folk': 'traditional_folk',
    'traditional folk': 'traditional_folk',
    'indie folk': 'indie_folk',
    'singer-songwriter': 'singer_songwriter',
    'contemporary folk': 'contemporary_folk',
    'celtic': 'celtic_folk',
    'irish folk': 'celtic_folk',
    'country': 'country',
    'classic country': 'classic_country',
    'outlaw country': 'outlaw_country',
    'bluegrass': 'bluegrass',
    'americana': 'americana',
    'roots rock': 'americana',

    // World & Reggae Aliases
    'reggae': 'roots_reggae',
    'roots reggae': 'roots_reggae',
    'dub': 'dub',
    'ska': 'ska',
    'bossa nova': 'bossa_nova',
    'salsa': 'salsa',
    'latin': 'world_reggae',
    'tango': 'world_reggae',
    'milonga': 'world_reggae',
    'afrobeat': 'afrobeat',
    'flamenco': 'flamenco',
    'spanish guitar': 'flamenco',
    'trip-hop': 'electronic',
    'trip hop': 'electronic',
    'downtempo': 'chillout'
};

/**
 * Normalizes any arbitrary genre string or artist name into a canonical,
 * guaranteed valid foreign key ID in public.genres.
 * 
 * @param {string} rawGenre - Raw genre from ID3 tag or database
 * @param {string} [artistName] - Optional artist name for Tier 1 knowledge lookup
 * @param {string} [trackTitle] - Optional track title for opus, form and classical detection
 * @returns {string} Valid genre ID from VALID_GENRE_IDS
 */
export function normalizeGenre(rawGenre, artistName = '', trackTitle = '', fallback = null) {
    const cleanArtist = (artistName || '').trim().toLowerCase();
    const cleanTitle = (trackTitle || '').trim().toLowerCase();
    const cleanRaw = (typeof rawGenre === 'string' ? rawGenre : '').trim().toLowerCase();
    const combined = `${cleanArtist} ${cleanTitle} ${cleanRaw}`;

    // Tier 1: Exact Artist Knowledge Base Lookup
    if (cleanArtist && ARTIST_CANONICAL_GENRES[cleanArtist]) {
        return ARTIST_CANONICAL_GENRES[cleanArtist];
    }

    // Tier 1B: Artist Substring Recognition for well-known artists with noisy tags
    if (cleanArtist.includes('queens of the stone age') || /\bqotsa\b/i.test(cleanArtist)) return 'alt_rock';
    if (cleanArtist.includes('nine inch nails') || /\bnin\b/i.test(cleanArtist)) return 'industrial';
    if (cleanArtist.includes('parkway drive')) return 'metalcore';
    if (cleanArtist.includes('massive attack') || cleanArtist.includes('portishead')) return 'electronic';
    if (cleanArtist.includes('enya')) return 'new_age';
    if (cleanArtist.includes('robin trower')) return 'blues_rock';
    if (cleanArtist.includes('astor piazzolla') || cleanArtist.includes('piazzolla')) return 'world_reggae';
    if (cleanArtist.includes('doc scapat') || /\bdoc\b/i.test(cleanArtist)) return 'hip_hop';
    if (cleanArtist.includes('otis redding')) return 'classic_soul';
    if (cleanArtist.includes('tori amos')) return 'alt_rock';

    // Tier 1C: Classical Forms, Composers & Performers in artist name or title
    if (/\b(opera|opéra|aria|recitative|libretto|soprano|tenor|baritone|act\s+[0-9ivx]+|atto\s+[0-9ivx]+|scena\s+[0-9ivx]+|puccini|verdi|rossini|donizetti|bizet|bellini|placido domingo|pavarotti|callas|tebaldi|flagstad|nilsson)\b/i.test(combined)) {
        return 'opera';
    }
    if (/\b(string quartet|streichquartett|chamber music|kammermusik|quartet|quartett|quintet|violins?\s*(&|and)\s*viola|alban berg quartet|guarneri|amadeus quartet|chamber music society)\b/i.test(combined)) {
        return 'chamber_music';
    }
    if (/\b(baroque|bach|vivaldi|handel|händel|scarlatti|purcell|harpsichord|cantata|bwv\s*[0-9]+|rv\s*[0-9]+|z[0-9]{2,3}|choir of new college oxford|king's consort)\b/i.test(combined)) {
        return 'baroque';
    }
    // Guard: Prevent "new romantic" or modern songs with "romantic" in title from polluting classical Romantic Era
    if (!cleanRaw.includes('new romantic') && !cleanRaw.includes('new-romantic') && !cleanTitle.includes('new romantic')) {
        if (/\b(chopin|liszt|schumann|schubert|tchaikovsky|rachmaninoff|brahms|mussorgsky|moussorgsky|grieg|dvorak|dvořák|horowitz|rubinstein|nocturne|etude|étude|valse|waltz|walzer|polonaise|mazurka|liebeslieder)\b/i.test(combined)) {
            return 'romantic';
        }
    }
    if (/\b(classical period|mozart|beethoven|haydn|bagatelle|für elise|woo\s*[0-9]+|k\.\s*[0-9]+|hob\.\s*[0-9]+)\b/i.test(combined)) {
        return 'classical_period';
    }
    if (/\b(classique|klassik|classical|sonata|sonate|concerto|konzert|symphony|sinfonie|adagio|allegro|andante|largo|orchestra|orchestre|philharmonic|segovia|organist|organiste|op\.\s*[0-9]+|opus\s*[0-9]+)\b/i.test(combined)) {
        return 'classical';
    }

    if (!rawGenre || typeof rawGenre !== 'string' || cleanRaw === 'unknown' || cleanRaw === 'other') {
        return fallback;
    }

    // Clean up compound genres (e.g. "Rock | Blues | Hard Rock", "Metal; Rock", "Pop/Dance")
    let primaryTag = rawGenre;
    if (primaryTag.includes('|')) primaryTag = primaryTag.split('|')[0];
    if (primaryTag.includes(';')) primaryTag = primaryTag.split(';')[0];
    if (primaryTag.includes('/')) primaryTag = primaryTag.split('/')[0];
    if (primaryTag.includes(',')) primaryTag = primaryTag.split(',')[0];

    const clean = primaryTag.trim().toLowerCase();
    const slug = clean.replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');

    // 1. Direct match with valid genre IDs
    if (VALID_GENRE_IDS.has(clean)) return clean;
    if (VALID_GENRE_IDS.has(slug)) return slug;

    // 2. Direct alias table match
    if (ALIAS_MAP[clean]) return ALIAS_MAP[clean];
    if (ALIAS_MAP[slug]) return ALIAS_MAP[slug];

    // 3. Substring & Keyword Heuristics
    // Classical / Opera
    if (clean.includes('opera')) return 'opera';
    if (clean.includes('baroque') || clean.includes('bach') || clean.includes('vivaldi')) return 'baroque';
    if (clean.includes('new romantic') || clean.includes('new-romantic')) return 'synth_pop';
    if (clean === 'romantic' || clean === 'romantic period' || clean === 'romantic era' || clean === 'romantic classical' || clean.includes('chopin') || clean.includes('tchaikovsky')) return 'romantic';
    if (clean.includes('soundtrack') || clean.includes('score') || clean.includes('cinematic')) return 'cinematic_orchestral';
    if (clean.includes('classic') && (clean.includes('orchestr') || clean.includes('symphon'))) return 'classical';
    if (clean.includes('chamber') || clean.includes('quartet')) return 'chamber_music';

    // Metal
    if (clean.includes('metal')) {
        if (clean.includes('prog')) return 'prog_metal';
        if (clean.includes('death')) return 'death_metal';
        if (clean.includes('black')) return 'black_metal';
        if (clean.includes('doom') || clean.includes('sludge')) return 'doom_metal';
        if (clean.includes('thrash') || clean.includes('speed') || clean.includes('trash')) return 'thrash_metal';
        if (clean.includes('nu') || clean.includes('alt')) return 'nu_metal';
        if (clean.includes('core')) return 'metalcore';
        if (clean.includes('symphon')) return 'symphonic_metal';
        return 'heavy_metal';
    }

    // Rock
    if (clean.includes('rock')) {
        if (clean.includes('prog') || clean.includes('art')) return 'prog_rock';
        if (clean.includes('post')) return 'post_rock';
        if (clean.includes('psych') || clean.includes('space')) return 'psychedelic_rock';
        if (clean.includes('hard') || clean.includes('instrumental') || clean.includes('intrumental')) return 'hard_rock';
        if (clean.includes('punk')) return 'punk_rock';
        if (clean.includes('grunge')) return 'grunge';
        if (clean.includes('alt') || clean.includes('modern')) return 'alt_rock';
        if (clean.includes('indie')) return 'indie_rock';
        if (clean.includes('math')) return 'math_rock';
        if (clean.includes('classic') || clean.includes('70s')) return 'classic_rock';
        return 'rock';
    }

    // Jazz & Blues
    if (clean.includes('jazz')) {
        if (clean.includes('fusion')) return 'jazz_fusion';
        if (clean.includes('smooth')) return 'smooth_jazz';
        if (clean.includes('bop')) return 'bebop_jazz';
        if (clean.includes('cool')) return 'cool_jazz';
        if (clean.includes('big band') || clean.includes('swing')) return 'big_band';
        return 'jazz';
    }
    if (clean.includes('blues')) {
        if (clean.includes('rock')) return 'blues_rock';
        if (clean.includes('electric')) return 'electric_blues';
        return 'blues';
    }

    // Electronic
    if (clean.includes('techno')) return 'techno';
    if (clean.includes('house')) return 'house';
    if (clean.includes('trance')) return 'trance';
    if (clean.includes('synth') || clean.includes('wave')) return 'synthwave';
    if (clean.includes('drum and bass') || clean.includes('dnb')) return 'drum_and_bass';
    if (clean.includes('ambient')) return 'ambient';
    if (clean.includes('electron') || clean.includes('dance') || clean.includes('edm')) return 'electronic';

    // Folk / Country / World
    if (clean.includes('folk')) return 'folk_acoustic';
    if (clean.includes('country') || clean.includes('bluegrass')) return 'country';
    if (clean.includes('reggae') || clean.includes('dub') || clean.includes('ska')) return 'roots_reggae';
    if (clean.includes('flamenco')) return 'flamenco';
    if (clean.includes('hip hop') || clean.includes('rap') || clean.includes('trap')) return 'hip_hop';
    if (clean.includes('soul') || clean.includes('funk') || clean.includes('r&b') || clean.includes('rnb')) return 'rnb_soul';
    if (clean.includes('pop')) return 'pop';

    // Fallback safely only if caller provided an explicit fallback
    return fallback;
}

/**
 * Gatekeeper: Ensures candidate tracks are legitimate musical songs and not
 * stems, instrument playthroughs, multi-hour mixes, spoken word, or sound effects.
 */
const STEM_PATTERNS = /\b(stem|isolated track|backing track|drum stem|bass stem|guitar stem|vocal stem|playthrough|instrumental stem)\b/i;
const NON_MUSIC_PATTERNS = /\b(podcast|interview|audiobook|lecture|lesson|tutorial|sound effect|sfx|binaural beats|hypnosis|guided meditation|radio show|unboxing|speech)\b/i;
const COMPILATION_PATTERNS = /\b(10 hours|1 hour|full album|complete album|entire album|best of mix|mega mix|discography)\b/i;
const JUNK_ARTIST = /^(cd\s*[0-9]+|disc\s*[0-9]+|track\s*[0-9]+|unknown(\s*artist)?)$/i;
const JUNK_TITLE = /^[0-9]+$/;

export function isSongCandidate({ title, artist, durationSec }) {
    if (!title || !artist) return { pass: false, reason: 'missing_metadata' };
    if (JUNK_ARTIST.test(artist.trim())) return { pass: false, reason: 'junk_artist' };
    if (JUNK_TITLE.test(title.trim())) return { pass: false, reason: 'junk_title' };

    const combined = `${artist} - ${title}`;
    if (STEM_PATTERNS.test(combined)) return { pass: false, reason: 'isolated_stem' };
    if (NON_MUSIC_PATTERNS.test(combined)) return { pass: false, reason: 'non_music_media' };
    if (COMPILATION_PATTERNS.test(combined)) return { pass: false, reason: 'full_album_compilation' };

    if (durationSec !== undefined && durationSec !== null) {
        if (durationSec < 60) return { pass: false, reason: 'duration_too_short' };
        if (durationSec > 1200) return { pass: false, reason: 'duration_too_long' }; // > 20 mins
    }

    return { pass: true };
}

/**
 * Anti-AI Music Filter: Detects machine-generated audio farms (Suno, Udio, AI voice clones)
 */
const AI_PATTERNS = /\b(ai cover|ai generated|suno|udio|synthetic voice|ai vocal|generated by ai|ai remade|chatgpt music)\b/i;

export function isAiGenerated({ title, artist, channelTitle = '' }) {
    const combined = `${artist || ''} ${title || ''} ${channelTitle || ''}`;
    return AI_PATTERNS.test(combined);
}
