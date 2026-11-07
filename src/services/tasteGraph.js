/**
 * tasteGraph.js
 * Comprehensive ontology of genres, subgenres, harmonic/aesthetic adjacency edges,
 * energy ratings, default vocal profiles, common dealbreaker categories,
 * and entropy/weight normalization utilities.
 * 
 * Based on canonical music taxonomy standards (AllMusic, RateYourMusic, MusicBrainz).
 * Features 14 major genre families and 100+ well-defined subgenres.
 */

export const GENRE_FAMILIES = {
    'rock': { id: 'rock', label: 'Rock', emoji: '🎸' },
    'metal': { id: 'metal', label: 'Metal', emoji: '🤘' },
    'electronic': { id: 'electronic', label: 'Electronic / Dance', emoji: '🎛️' },
    'pop': { id: 'pop', label: 'Pop', emoji: '✨' },
    'hip_hop': { id: 'hip_hop', label: 'Hip-Hop / Rap', emoji: '🎤' },
    'rnb_soul': { id: 'rnb_soul', label: 'R&B / Soul / Funk', emoji: '🎷' },
    'jazz': { id: 'jazz', label: 'Jazz', emoji: '🎺' },
    'blues': { id: 'blues', label: 'Blues', emoji: '🪕' },
    'classical': { id: 'classical', label: 'Classical & Orchestral', emoji: '🎻' },
    'folk_acoustic': { id: 'folk_acoustic', label: 'Folk & Acoustic', emoji: '🌾' },
    'country': { id: 'country', label: 'Country & Americana', emoji: '🤠' },
    'world_reggae': { id: 'world_reggae', label: 'Reggae, Latin & World', emoji: '🌴' },
    'ambient_chill': { id: 'ambient_chill', label: 'Ambient & Chill', emoji: '🌌' },
    'avant_garde': { id: 'avant_garde', label: 'Avant-Garde & Experimental', emoji: '🧪' },
};

export const GENRE_NODES = {
    // ==========================================
    // 1. ROCK
    // ==========================================
    'rock': { id: 'rock', label: 'Rock (General)', group: 'Rock', energy: 0.70, vocal: 'vocal', tags: ['guitar', 'drums', 'classic'] },
    'classic_rock': { id: 'classic_rock', label: 'Classic Rock', group: 'Rock', energy: 0.65, vocal: 'vocal', tags: ['guitar', '70s', 'classic'] },
    'alt_rock': { id: 'alt_rock', label: 'Alternative Rock', group: 'Rock', energy: 0.65, vocal: 'vocal', tags: ['indie', '90s', 'guitar'] },
    'indie_rock': { id: 'indie_rock', label: 'Indie Rock', group: 'Rock', energy: 0.55, vocal: 'vocal', tags: ['indie', 'chill', 'melodic'] },
    'hard_rock': { id: 'hard_rock', label: 'Hard Rock', group: 'Rock', energy: 0.75, vocal: 'vocal', tags: ['riffs', 'loud', 'stadium'] },
    'punk_rock': { id: 'punk_rock', label: 'Punk Rock', group: 'Rock', energy: 0.85, vocal: 'vocal', tags: ['fast', 'raw', 'rebel'] },
    'post_punk': { id: 'post_punk', label: 'Post-Punk / New Wave', group: 'Rock', energy: 0.70, vocal: 'vocal', tags: ['dark', 'bassline', '80s'] },
    'prog_rock': { id: 'prog_rock', label: 'Progressive Rock', group: 'Rock', energy: 0.70, vocal: 'vocal', tags: ['complex', 'conceptual', 'epic'] },
    'psychedelic_rock': { id: 'psychedelic_rock', label: 'Psychedelic Rock', group: 'Rock', energy: 0.65, vocal: 'vocal', tags: ['trippy', 'fuzz', 'space'] },
    'grunge': { id: 'grunge', label: 'Grunge / 90s Alt', group: 'Rock', energy: 0.75, vocal: 'vocal', tags: ['raw', 'seattle', 'distorted'] },
    'post_rock': { id: 'post_rock', label: 'Post-Rock', group: 'Rock', energy: 0.50, vocal: 'instrumental', tags: ['ambient', 'crescendo', 'cinematic'] },
    'math_rock': { id: 'math_rock', label: 'Math Rock', group: 'Rock', energy: 0.70, vocal: 'instrumental', tags: ['complex', 'tapping', 'prog'] },
    'shoegaze': { id: 'shoegaze', label: 'Shoegaze / Dream Rock', group: 'Rock', energy: 0.60, vocal: 'vocal', tags: ['reverb', 'wall of sound', 'ethereal'] },
    'garage_rock': { id: 'garage_rock', label: 'Garage Rock', group: 'Rock', energy: 0.80, vocal: 'vocal', tags: ['fuzz', 'lo-fi', 'punchy'] },

    // ==========================================
    // 2. METAL
    // ==========================================
    'metal': { id: 'metal', label: 'Metal (General)', group: 'Metal', energy: 0.85, vocal: 'vocal', tags: ['heavy', 'metal', 'distortion'] },
    'heavy_metal': { id: 'heavy_metal', label: 'Heavy Metal', group: 'Metal', energy: 0.85, vocal: 'vocal', tags: ['distorted', 'classic', 'riffs'] },
    'thrash_metal': { id: 'thrash_metal', label: 'Thrash Metal', group: 'Metal', energy: 0.90, vocal: 'vocal', tags: ['fast', 'aggressive', 'double bass'] },
    'prog_metal': { id: 'prog_metal', label: 'Progressive Metal', group: 'Metal', energy: 0.85, vocal: 'vocal', tags: ['technical', 'epic', 'odd time'] },
    'death_metal': { id: 'death_metal', label: 'Death Metal', group: 'Metal', energy: 0.95, vocal: 'harsh', tags: ['extreme', 'blastbeats', 'growl'] },
    'black_metal': { id: 'black_metal', label: 'Black Metal', group: 'Metal', energy: 0.95, vocal: 'harsh', tags: ['atmospheric', 'cold', 'raw'] },
    'doom_metal': { id: 'doom_metal', label: 'Doom Metal', group: 'Metal', energy: 0.65, vocal: 'vocal', tags: ['slow', 'heavy', 'sludge'] },
    'nu_metal': { id: 'nu_metal', label: 'Nu-Metal / Alt Metal', group: 'Metal', energy: 0.80, vocal: 'vocal', tags: ['groove', '2000s', 'heavy'] },
    'metalcore': { id: 'metalcore', label: 'Metalcore', group: 'Metal', energy: 0.90, vocal: 'vocal', tags: ['breakdown', 'screams', 'melodic'] },
    'symphonic_metal': { id: 'symphonic_metal', label: 'Symphonic Metal', group: 'Metal', energy: 0.85, vocal: 'vocal', tags: ['orchestral', 'operatic', 'epic'] },

    // ==========================================
    // 3. ELECTRONIC & DANCE
    // ==========================================
    'electronic': { id: 'electronic', label: 'Electronic (General)', group: 'Electronic', energy: 0.70, vocal: 'any', tags: ['synths', 'beats', 'electronic'] },
    'house': { id: 'house', label: 'Deep & Melodic House', group: 'Electronic', energy: 0.65, vocal: 'any', tags: ['groove', '4x4', 'smooth'] },
    'techno': { id: 'techno', label: 'Techno / Minimal', group: 'Electronic', energy: 0.75, vocal: 'instrumental', tags: ['hypnotic', 'dark', 'repetitive'] },
    'trance': { id: 'trance', label: 'Trance / Progressive', group: 'Electronic', energy: 0.80, vocal: 'instrumental', tags: ['uplifting', 'melodic', 'synths'] },
    'drum_and_bass': { id: 'drum_and_bass', label: 'Drum & Bass / Liquid', group: 'Electronic', energy: 0.85, vocal: 'any', tags: ['fast', 'breakbeat', 'liquid'] },
    'synthwave': { id: 'synthwave', label: 'Synthwave / Retrowave', group: 'Electronic', energy: 0.65, vocal: 'instrumental', tags: ['80s', 'neon', 'arpeggio'] },
    'darksynth': { id: 'darksynth', label: 'Darksynth / Cyberpunk', group: 'Electronic', energy: 0.85, vocal: 'instrumental', tags: ['dark', 'cyberpunk', 'heavy bass'] },
    'ambient_electronic': { id: 'ambient_electronic', label: 'Ambient Electronic', group: 'Electronic', energy: 0.30, vocal: 'instrumental', tags: ['soundscape', 'relax', 'deep'] },
    'idm': { id: 'idm', label: 'IDM / Glitch', group: 'Electronic', energy: 0.55, vocal: 'instrumental', tags: ['experimental', 'brain', 'intricate'] },
    'dubstep': { id: 'dubstep', label: 'Dubstep / Bass', group: 'Electronic', energy: 0.85, vocal: 'any', tags: ['bass', 'drop', 'wobble'] },
    'industrial': { id: 'industrial', label: 'Industrial / EBM', group: 'Electronic', energy: 0.80, vocal: 'vocal', tags: ['harsh', 'mechanical', 'dark'] },
    'edm_mainstream': { id: 'edm_mainstream', label: 'Festival EDM / Big Room', group: 'Electronic', energy: 0.90, vocal: 'vocal', tags: ['festival', 'drop', 'loud'] },

    // ==========================================
    // 4. POP
    // ==========================================
    'pop': { id: 'pop', label: 'Pop (General)', group: 'Pop', energy: 0.65, vocal: 'vocal', tags: ['catchy', 'melodic', 'pop'] },
    'indie_pop': { id: 'indie_pop', label: 'Indie Pop / Dream Pop', group: 'Pop', energy: 0.55, vocal: 'vocal', tags: ['catchy', 'ethereal', 'bright'] },
    'synth_pop': { id: 'synth_pop', label: 'Synth-Pop', group: 'Pop', energy: 0.65, vocal: 'vocal', tags: ['synths', '80s', 'catchy'] },
    'dance_pop': { id: 'dance_pop', label: 'Dance-Pop', group: 'Pop', energy: 0.75, vocal: 'vocal', tags: ['club', 'upbeat', 'danceable'] },
    'art_pop': { id: 'art_pop', label: 'Art Pop / Chamber Pop', group: 'Pop', energy: 0.55, vocal: 'vocal', tags: ['creative', 'melodic', 'lush'] },
    'mainstream_pop': { id: 'mainstream_pop', label: 'Commercial Top 40', group: 'Pop', energy: 0.70, vocal: 'vocal', tags: ['radio', 'dance', 'hook'] },
    'traditional_pop': { id: 'traditional_pop', label: 'Traditional Pop / Standards', group: 'Pop', energy: 0.45, vocal: 'vocal', tags: ['crooner', 'orchestral', 'timeless'] },

    // ==========================================
    // 5. HIP-HOP & RAP
    // ==========================================
    'hip_hop': { id: 'hip_hop', label: 'Hip-Hop (General)', group: 'Hip-Hop', energy: 0.70, vocal: 'vocal', tags: ['beats', 'rhymes', 'rap'] },
    'boom_bap': { id: 'boom_bap', label: '90s Boom Bap', group: 'Hip-Hop', energy: 0.60, vocal: 'vocal', tags: ['classic', 'sample', 'bars'] },
    'trap_modern': { id: 'trap_modern', label: 'Modern Trap / 808', group: 'Hip-Hop', energy: 0.75, vocal: 'vocal', tags: ['808', 'hihats', 'banger'] },
    'conscious_hiphop': { id: 'conscious_hiphop', label: 'Conscious Hip-Hop', group: 'Hip-Hop', energy: 0.60, vocal: 'vocal', tags: ['lyrical', 'storytelling', 'deep'] },
    'lofi_hiphop': { id: 'lofi_hiphop', label: 'Lo-Fi Chill Beats', group: 'Hip-Hop', energy: 0.35, vocal: 'instrumental', tags: ['study', 'vinyl', 'cozy', 'dusty'] },
    'west_coast_rap': { id: 'west_coast_rap', label: 'West Coast / G-Funk', group: 'Hip-Hop', energy: 0.65, vocal: 'vocal', tags: ['laid back', 'whistle', 'funk'] },
    'cloud_rap': { id: 'cloud_rap', label: 'Cloud Rap', group: 'Hip-Hop', energy: 0.50, vocal: 'vocal', tags: ['dreamy', 'ambient', 'reverb'] },
    'uk_drill': { id: 'uk_drill', label: 'UK Drill / Grime', group: 'Hip-Hop', energy: 0.80, vocal: 'vocal', tags: ['sliding bass', 'fast bars', 'grime'] },

    // ==========================================
    // 6. R&B, SOUL & FUNK
    // ==========================================
    'rnb_soul': { id: 'rnb_soul', label: 'R&B / Soul (General)', group: 'R&B / Soul', energy: 0.55, vocal: 'vocal', tags: ['groove', 'smooth', 'soul'] },
    'soul_funk': { id: 'soul_funk', label: 'Soul & Funk', group: 'R&B / Soul', energy: 0.65, vocal: 'vocal', tags: ['funk', 'soul', 'groove'] },
    'classic_soul': { id: 'classic_soul', label: 'Motown & Classic Soul', group: 'R&B / Soul', energy: 0.60, vocal: 'vocal', tags: ['motown', 'warm', 'horns'] },
    'neo_soul': { id: 'neo_soul', label: 'Neo-Soul', group: 'R&B / Soul', energy: 0.50, vocal: 'vocal', tags: ['chilled', 'rhodes', 'groove'] },
    'rnb': { id: 'rnb', label: 'Contemporary R&B', group: 'R&B / Soul', energy: 0.55, vocal: 'vocal', tags: ['smooth', 'sensual', 'vocal'] },
    'funk': { id: 'funk', label: 'Classic Funk', group: 'R&B / Soul', energy: 0.75, vocal: 'vocal', tags: ['slap bass', 'groove', 'tight'] },
    'pfunk': { id: 'pfunk', label: 'P-Funk / Psychedelic Funk', group: 'R&B / Soul', energy: 0.70, vocal: 'vocal', tags: ['parliament', 'trippy', 'bass'] },
    'quiet_storm': { id: 'quiet_storm', label: 'Quiet Storm / Slow Jams', group: 'R&B / Soul', energy: 0.40, vocal: 'vocal', tags: ['late night', 'mellow', 'romantic'] },

    // ==========================================
    // 7. JAZZ
    // ==========================================
    'jazz': { id: 'jazz', label: 'Jazz (General)', group: 'Jazz', energy: 0.50, vocal: 'any', tags: ['swing', 'improvisation', 'brass'] },
    'cool_jazz': { id: 'cool_jazz', label: 'Cool Jazz', group: 'Jazz', energy: 0.45, vocal: 'instrumental', tags: ['miles davis', 'mellow', 'trumpet'] },
    'bebop_jazz': { id: 'bebop_jazz', label: 'Bebop / Hard Bop', group: 'Jazz', energy: 0.65, vocal: 'instrumental', tags: ['virtuosic', 'fast', 'improv'] },
    'modal_jazz': { id: 'modal_jazz', label: 'Modal Jazz', group: 'Jazz', energy: 0.50, vocal: 'instrumental', tags: ['coltrane', 'deep', 'spiritual'] },
    'jazz_fusion': { id: 'jazz_fusion', label: 'Jazz Fusion', group: 'Jazz', energy: 0.70, vocal: 'instrumental', tags: ['electric', 'synths', 'groove'] },
    'smooth_jazz': { id: 'smooth_jazz', label: 'Smooth Jazz', group: 'Jazz', energy: 0.40, vocal: 'instrumental', tags: ['sax', 'coffee', 'mellow'] },
    'bossa_nova_jazz': { id: 'bossa_nova_jazz', label: 'Bossa Nova Jazz', group: 'Jazz', energy: 0.45, vocal: 'instrumental', tags: ['guitar', 'gentle', 'warm'] },
    'big_band': { id: 'big_band', label: 'Big Band / Swing', group: 'Jazz', energy: 0.75, vocal: 'vocal', tags: ['brass', 'swing', 'danceable'] },
    'free_jazz': { id: 'free_jazz', label: 'Free / Spiritual Jazz', group: 'Jazz', energy: 0.60, vocal: 'instrumental', tags: ['avant-garde', 'raw', 'experimental'] },

    // ==========================================
    // 8. BLUES
    // ==========================================
    'blues': { id: 'blues', label: 'Blues (General)', group: 'Blues', energy: 0.55, vocal: 'vocal', tags: ['guitar', 'chicago', '12bar'] },
    'delta_blues': { id: 'delta_blues', label: 'Delta / Acoustic Blues', group: 'Blues', energy: 0.45, vocal: 'vocal', tags: ['slide guitar', 'raw', 'acoustic'] },
    'chicago_blues': { id: 'chicago_blues', label: 'Chicago Blues', group: 'Blues', energy: 0.60, vocal: 'vocal', tags: ['harmonica', 'electric', 'muddy waters'] },
    'electric_blues': { id: 'electric_blues', label: 'Electric Blues', group: 'Blues', energy: 0.65, vocal: 'vocal', tags: ['bb king', 'guitar solo', 'expressive'] },
    'blues_rock': { id: 'blues_rock', label: 'Blues Rock', group: 'Blues', energy: 0.70, vocal: 'vocal', tags: ['clapton', 'srv', 'riff'] },
    'soul_blues': { id: 'soul_blues', label: 'Soul Blues', group: 'Blues', energy: 0.55, vocal: 'vocal', tags: ['emotional', 'brass', 'slow burn'] },

    // ==========================================
    // 9. CLASSICAL & ORCHESTRAL
    // ==========================================
    'classical': { id: 'classical', label: 'Classical (General)', group: 'Classical', energy: 0.40, vocal: 'instrumental', tags: ['orchestra', 'acoustic', 'symphony'] },
    'baroque': { id: 'baroque', label: 'Baroque (Bach, Vivaldi)', group: 'Classical', energy: 0.45, vocal: 'instrumental', tags: ['harpsichord', 'counterpoint', 'intricate'] },
    'classical_period': { id: 'classical_period', label: 'Classical Period (Mozart, Beethoven)', group: 'Classical', energy: 0.50, vocal: 'instrumental', tags: ['symphony', 'sonata', 'balanced'] },
    'romantic': { id: 'romantic', label: 'Romantic Era (Chopin, Tchaikovsky)', group: 'Classical', energy: 0.45, vocal: 'instrumental', tags: ['piano', 'emotive', 'grand'] },
    'neo_classical': { id: 'neo_classical', label: 'Modern Neo-Classical', group: 'Classical', energy: 0.35, vocal: 'instrumental', tags: ['piano', 'strings', 'minimalist'] },
    'cinematic_orchestral': { id: 'cinematic_orchestral', label: 'Cinematic Orchestral', group: 'Classical', energy: 0.70, vocal: 'instrumental', tags: ['epic', 'soundtrack', 'horns'] },
    'opera': { id: 'opera', label: 'Opera / Vocal Classical', group: 'Classical', energy: 0.60, vocal: 'vocal', tags: ['tenor', 'soprano', 'aria', 'dramatic'] },
    'chamber_music': { id: 'chamber_music', label: 'Chamber Music / Quartets', group: 'Classical', energy: 0.40, vocal: 'instrumental', tags: ['intimate', 'string quartet', 'pure'] },
    'contemporary_classical': { id: 'contemporary_classical', label: 'Contemporary / Minimalist', group: 'Classical', energy: 0.40, vocal: 'instrumental', tags: ['philip glass', 'repetitive', 'modern'] },

    // ==========================================
    // 10. FOLK & ACOUSTIC
    // ==========================================
    'folk_acoustic': { id: 'folk_acoustic', label: 'Folk & Acoustic (General)', group: 'Folk', energy: 0.45, vocal: 'vocal', tags: ['acoustic', 'fingerpicking', 'story'] },
    'acoustic_folk': { id: 'acoustic_folk', label: 'Acoustic Folk', group: 'Folk', energy: 0.40, vocal: 'vocal', tags: ['acoustic', 'intimate', 'unplugged'] },
    'traditional_folk': { id: 'traditional_folk', label: 'Traditional Folk', group: 'Folk', energy: 0.40, vocal: 'vocal', tags: ['acoustic', 'story', 'heritage'] },
    'indie_folk': { id: 'indie_folk', label: 'Indie Folk / Chamber Folk', group: 'Folk', energy: 0.45, vocal: 'vocal', tags: ['warm', 'organic', 'banjo'] },
    'singer_songwriter': { id: 'singer_songwriter', label: 'Singer-Songwriter', group: 'Folk', energy: 0.40, vocal: 'vocal', tags: ['intimate', 'acoustic guitar', 'lyrics'] },
    'contemporary_folk': { id: 'contemporary_folk', label: 'Contemporary Folk', group: 'Folk', energy: 0.45, vocal: 'vocal', tags: ['modern folk', 'melodic', 'clean'] },
    'celtic_folk': { id: 'celtic_folk', label: 'Celtic / Irish Folk', group: 'Folk', energy: 0.55, vocal: 'any', tags: ['fiddle', 'whistle', 'jig'] },

    // ==========================================
    // 11. COUNTRY & AMERICANA
    // ==========================================
    'country': { id: 'country', label: 'Country (General)', group: 'Country', energy: 0.55, vocal: 'vocal', tags: ['twang', 'nashville', 'guitar'] },
    'classic_country': { id: 'classic_country', label: 'Classic Country / Honky-Tonk', group: 'Country', energy: 0.55, vocal: 'vocal', tags: ['twang', 'pedal steel', 'story'] },
    'outlaw_country': { id: 'outlaw_country', label: 'Outlaw Country', group: 'Country', energy: 0.65, vocal: 'vocal', tags: ['willie nelson', 'raw', 'rebel'] },
    'bluegrass': { id: 'bluegrass', label: 'Bluegrass', group: 'Country', energy: 0.75, vocal: 'any', tags: ['fast', 'banjo', 'mandolin'] },
    'americana': { id: 'americana', label: 'Americana / Roots Rock', group: 'Country', energy: 0.60, vocal: 'vocal', tags: ['roots', 'guitar', 'warm'] },
    'contemporary_country': { id: 'contemporary_country', label: 'Contemporary Country', group: 'Country', energy: 0.65, vocal: 'vocal', tags: ['modern', 'stadium', 'catchy'] },

    // ==========================================
    // 12. REGGAE, LATIN & WORLD
    // ==========================================
    'world_reggae': { id: 'world_reggae', label: 'Reggae & World (General)', group: 'World / Reggae', energy: 0.60, vocal: 'any', tags: ['reggae', 'dub', 'island'] },
    'roots_reggae': { id: 'roots_reggae', label: 'Roots Reggae', group: 'World / Reggae', energy: 0.60, vocal: 'vocal', tags: ['bob marley', 'bassline', 'conscious'] },
    'dub': { id: 'dub', label: 'Dub / Sound System', group: 'World / Reggae', energy: 0.55, vocal: 'instrumental', tags: ['echo', 'deep bass', 'reverb'] },
    'ska': { id: 'ska', label: 'Ska / Rocksteady', group: 'World / Reggae', energy: 0.75, vocal: 'vocal', tags: ['upbeat', 'brass', 'danceable'] },
    'bossa_nova': { id: 'bossa_nova', label: 'Bossa Nova', group: 'World / Reggae', energy: 0.45, vocal: 'any', tags: ['jobim', 'brazil', 'gentle'] },
    'salsa': { id: 'salsa', label: 'Salsa / Cumbia', group: 'World / Reggae', energy: 0.75, vocal: 'vocal', tags: ['latin', 'percussion', 'brass', 'dance'] },
    'afrobeat': { id: 'afrobeat', label: 'Afrobeat', group: 'World / Reggae', energy: 0.80, vocal: 'vocal', tags: ['fela kuti', 'polyrhythm', 'groove'] },
    'flamenco': { id: 'flamenco', label: 'Flamenco / Spanish Guitar', group: 'World / Reggae', energy: 0.65, vocal: 'any', tags: ['spanish guitar', 'passion', 'palmas'] },

    // ==========================================
    // 13. AMBIENT & CHILL
    // ==========================================
    'ambient_chill': { id: 'ambient_chill', label: 'Ambient & Chill (General)', group: 'Ambient', energy: 0.25, vocal: 'instrumental', tags: ['relax', 'drone', 'soundscape'] },
    'chill': { id: 'chill', label: 'Chillout', group: 'Ambient', energy: 0.30, vocal: 'any', tags: ['chill', 'lo-fi', 'relax'] },
    'ambient': { id: 'ambient', label: 'Pure Ambient / Drone', group: 'Ambient', energy: 0.15, vocal: 'instrumental', tags: ['meditation', 'sleep', 'pads'] },
    'nature_soundscape': { id: 'nature_soundscape', label: 'Nature & Soundscape', group: 'Ambient', energy: 0.10, vocal: 'instrumental', tags: ['rain', 'forest', 'field recording'] },
    'new_age': { id: 'new_age', label: 'New Age / Meditation', group: 'Ambient', energy: 0.25, vocal: 'instrumental', tags: ['calm', 'crystal', 'relax'] },
    'chillout': { id: 'chillout', label: 'Chillout / Lounge', group: 'Ambient', energy: 0.35, vocal: 'instrumental', tags: ['cafe del mar', 'sunset', 'mellow'] },

    // ==========================================
    // 14. AVANT-GARDE & EXPERIMENTAL
    // ==========================================
    'avant_garde': { id: 'avant_garde', label: 'Avant-Garde (General)', group: 'Avant-Garde', energy: 0.50, vocal: 'any', tags: ['experimental', 'abstract', 'art'] },
    'experimental_rock': { id: 'experimental_rock', label: 'Experimental / Krautrock', group: 'Avant-Garde', energy: 0.60, vocal: 'any', tags: ['can', 'motorik', 'weird'] },
    'noise': { id: 'noise', label: 'Noise & Drone', group: 'Avant-Garde', energy: 0.75, vocal: 'instrumental', tags: ['textures', 'harsh', 'sound art'] },
    'musique_concrete': { id: 'musique_concrete', label: 'Musique Concrète', group: 'Avant-Garde', energy: 0.40, vocal: 'instrumental', tags: ['tape loops', 'found sound', 'academic'] },
    'avant_jazz': { id: 'avant_jazz', label: 'Avant-Garde Jazz', group: 'Avant-Garde', energy: 0.65, vocal: 'instrumental', tags: ['sun ra', 'freeform', 'abstract'] },
};

/**
 * Harmonic Adjacency Edges
 * Connects stylistically and harmonic neighbors for smooth state machine transitions.
 */
export const TASTE_GRAPH_EDGES = [
    // Family Hub Bridges (Connecting family centroids to subgenres)
    ['rock', 'classic_rock'], ['rock', 'alt_rock'], ['rock', 'hard_rock'], ['rock', 'indie_rock'], ['rock', 'metal'],
    ['metal', 'heavy_metal'], ['metal', 'thrash_metal'], ['metal', 'prog_metal'], ['metal', 'hard_rock'],
    ['electronic', 'synthwave'], ['electronic', 'house'], ['electronic', 'techno'], ['electronic', 'ambient_electronic'],
    ['pop', 'indie_pop'], ['pop', 'synth_pop'], ['pop', 'dance_pop'], ['pop', 'mainstream_pop'],
    ['hip_hop', 'boom_bap'], ['hip_hop', 'lofi_hiphop'], ['hip_hop', 'trap_modern'],
    ['rnb_soul', 'classic_soul'], ['rnb_soul', 'neo_soul'], ['rnb_soul', 'funk'], ['rnb_soul', 'soul_funk'],
    ['soul_funk', 'funk'], ['soul_funk', 'classic_soul'],
    ['jazz', 'cool_jazz'], ['jazz', 'bebop_jazz'], ['jazz', 'modal_jazz'], ['jazz', 'jazz_fusion'], ['jazz', 'blues'],
    ['blues', 'delta_blues'], ['blues', 'chicago_blues'], ['blues', 'electric_blues'], ['blues', 'blues_rock'],
    ['classical', 'baroque'], ['classical', 'classical_period'], ['classical', 'romantic'], ['classical', 'neo_classical'], ['classical', 'contemporary_classical'],
    ['folk_acoustic', 'traditional_folk'], ['folk_acoustic', 'acoustic_folk'], ['folk_acoustic', 'indie_folk'], ['folk_acoustic', 'singer_songwriter'],
    ['acoustic_folk', 'traditional_folk'], ['acoustic_folk', 'singer_songwriter'],
    ['country', 'classic_country'], ['country', 'bluegrass'], ['country', 'americana'],
    ['world_reggae', 'roots_reggae'], ['world_reggae', 'dub'], ['world_reggae', 'bossa_nova'],
    ['ambient_chill', 'ambient'], ['ambient_chill', 'chillout'], ['ambient_chill', 'chill'], ['ambient_chill', 'new_age'],
    ['chill', 'chillout'], ['chill', 'ambient'], ['chill', 'lofi_hiphop'],
    ['avant_garde', 'experimental_rock'], ['avant_garde', 'noise'], ['avant_garde', 'musique_concrete'], ['avant_garde', 'avant_jazz'],

    // Rock internal
    ['classic_rock', 'hard_rock'],
    ['classic_rock', 'psychedelic_rock'],
    ['classic_rock', 'alt_rock'],
    ['classic_rock', 'blues_rock'],
    ['alt_rock', 'indie_rock'],
    ['alt_rock', 'grunge'],
    ['alt_rock', 'post_punk'],
    ['indie_rock', 'shoegaze'],
    ['indie_rock', 'indie_pop'],
    ['punk_rock', 'garage_rock'],
    ['punk_rock', 'post_punk'],
    ['prog_rock', 'math_rock'],
    ['prog_rock', 'prog_metal'],
    ['prog_rock', 'psychedelic_rock'],
    ['post_rock', 'math_rock'],
    ['post_rock', 'ambient_electronic'],
    ['post_rock', 'neo_classical'],

    // Metal internal & Rock crossovers
    ['hard_rock', 'heavy_metal'],
    ['heavy_metal', 'thrash_metal'],
    ['heavy_metal', 'doom_metal'],
    ['thrash_metal', 'death_metal'],
    ['death_metal', 'black_metal'],
    ['doom_metal', 'sludge'],
    ['prog_metal', 'symphonic_metal'],
    ['symphonic_metal', 'cinematic_orchestral'],
    ['symphonic_metal', 'opera'],
    ['nu_metal', 'alt_rock'],
    ['metalcore', 'thrash_metal'],
    ['prog_metal', 'darksynth'],

    // Electronic internal & crossovers
    ['house', 'techno'],
    ['house', 'edm_mainstream'],
    ['techno', 'industrial'],
    ['techno', 'idm'],
    ['drum_and_bass', 'idm'],
    ['drum_and_bass', 'techno'],
    ['trance', 'house'],
    ['synthwave', 'darksynth'],
    ['synthwave', 'synth_pop'],
    ['synthwave', 'ambient_electronic'],
    ['ambient_electronic', 'ambient'],
    ['ambient_electronic', 'idm'],
    ['dubstep', 'drum_and_bass'],
    ['dubstep', 'industrial'],

    // Pop internal & crossovers
    ['indie_pop', 'synth_pop'],
    ['indie_pop', 'dance_pop'],
    ['indie_pop', 'art_pop'],
    ['indie_pop', 'indie_rock'],
    ['dance_pop', 'mainstream_pop'],
    ['synth_pop', 'synthwave'],
    ['traditional_pop', 'big_band'],
    ['traditional_pop', 'chamber_music'],

    // Hip-Hop internal & crossovers
    ['boom_bap', 'conscious_hiphop'],
    ['boom_bap', 'lofi_hiphop'],
    ['boom_bap', 'west_coast_rap'],
    ['trap_modern', 'cloud_rap'],
    ['trap_modern', 'uk_drill'],
    ['lofi_hiphop', 'smooth_jazz'],
    ['lofi_hiphop', 'neo_soul'],
    ['lofi_hiphop', 'ambient_electronic'],

    // R&B / Soul / Funk internal & crossovers
    ['classic_soul', 'funk'],
    ['classic_soul', 'soul_blues'],
    ['classic_soul', 'neo_soul'],
    ['neo_soul', 'rnb'],
    ['funk', 'pfunk'],
    ['funk', 'jazz_fusion'],
    ['quiet_storm', 'smooth_jazz'],
    ['rnb', 'indie_pop'],

    // Jazz internal & crossovers
    ['cool_jazz', 'modal_jazz'],
    ['cool_jazz', 'bebop_jazz'],
    ['bebop_jazz', 'modal_jazz'],
    ['modal_jazz', 'free_jazz'],
    ['jazz_fusion', 'prog_rock'],
    ['jazz_fusion', 'funk'],
    ['smooth_jazz', 'bossa_nova_jazz'],
    ['bossa_nova_jazz', 'bossa_nova'],
    ['big_band', 'swing'],
    ['free_jazz', 'avant_jazz'],

    // Blues internal & crossovers
    ['delta_blues', 'chicago_blues'],
    ['chicago_blues', 'electric_blues'],
    ['electric_blues', 'blues_rock'],
    ['blues_rock', 'classic_rock'],
    ['soul_blues', 'classic_soul'],
    ['delta_blues', 'traditional_folk'],

    // Classical internal & crossovers
    ['baroque', 'classical_period'],
    ['classical_period', 'romantic'],
    ['classical_period', 'chamber_music'],
    ['romantic', 'neo_classical'],
    ['romantic', 'opera'],
    ['neo_classical', 'cinematic_orchestral'],
    ['neo_classical', 'ambient'],
    ['contemporary_classical', 'avant_garde'],
    ['opera', 'symphonic_metal'],

    // Folk internal & crossovers
    ['traditional_folk', 'singer_songwriter'],
    ['traditional_folk', 'celtic_folk'],
    ['indie_folk', 'indie_rock'],
    ['indie_folk', 'singer_songwriter'],
    ['singer_songwriter', 'americana'],
    ['contemporary_folk', 'indie_folk'],
    ['traditional_folk', 'bluegrass'],

    // Country internal & crossovers
    ['classic_country', 'outlaw_country'],
    ['classic_country', 'honky_tonk'],
    ['outlaw_country', 'americana'],
    ['bluegrass', 'traditional_folk'],
    ['bluegrass', 'celtic_folk'],
    ['americana', 'blues_rock'],
    ['contemporary_country', 'classic_country'],

    // Reggae / World crossovers
    ['roots_reggae', 'dub'],
    ['roots_reggae', 'ska'],
    ['dub', 'ambient_electronic'],
    ['bossa_nova', 'bossa_nova_jazz'],
    ['bossa_nova', 'salsa'],
    ['afrobeat', 'funk'],
    ['flamenco', 'bossa_nova'],

    // Ambient internal & crossovers
    ['ambient', 'nature_soundscape'],
    ['ambient', 'new_age'],
    ['new_age', 'chillout'],
    ['chillout', 'lofi_hiphop'],

    // Avant-Garde internal & crossovers
    ['experimental_rock', 'psychedelic_rock'],
    ['experimental_rock', 'noise'],
    ['noise', 'industrial'],
    ['musique_concrete', 'contemporary_classical'],
    ['avant_jazz', 'free_jazz'],
];

/**
 * Common Dealbreaker options with human descriptions and strict negative query terms.
 */
export const DEALBREAKER_PRESETS = [
    {
        id: 'no_autotune_trap',
        label: 'Autotune / Modern Mumble Trap',
        emoji: '🚫',
        excludeTerms: ['trap', 'mumble', 'autotune', 'type beat', 'drill', '808 drip'],
        excludeGenres: ['trap_modern', 'uk_drill']
    },
    {
        id: 'no_harsh_vocals',
        label: 'Harsh Screaming / Growls',
        emoji: '🔇',
        excludeTerms: ['screamo', 'deathcore', 'growl', 'brutal death', 'grindcore', 'harsh vocals', 'death metal'],
        excludeGenres: ['death_metal', 'black_metal']
    },
    {
        id: 'no_commercial_edm',
        label: 'Commercial Festival EDM',
        emoji: '📉',
        excludeTerms: ['tomorrowland', 'festival drop', 'big room', 'slap house', 'spinnin records', 'marshmello'],
        excludeGenres: ['edm_mainstream']
    },
    {
        id: 'no_top40_pop',
        label: 'Commercial Top 40 / Radio Pop',
        emoji: '📻',
        excludeTerms: ['top 40', 'billboard hits', 'radio edit', 'tik tok viral', 'tiktok songs'],
        excludeGenres: ['mainstream_pop']
    },
    {
        id: 'no_country',
        label: 'Country / Bro-Country',
        emoji: '🤠',
        excludeTerms: ['country', 'nashville', 'honky tonk', 'americana radio', 'bro country'],
        excludeGenres: ['contemporary_country', 'classic_country']
    },
    {
        id: 'no_lofi_white_noise',
        label: 'Generic Lo-Fi White Noise Loops',
        emoji: '💤',
        excludeTerms: ['study beats to sleep to 24/7', 'rain sounds 10 hours', 'white noise'],
        excludeGenres: ['nature_soundscape']
    }
];

export function getConnectedGenres(nodeId) {
    const neighbors = new Set();
    TASTE_GRAPH_EDGES.forEach(([a, b]) => {
        if (a === nodeId) neighbors.add(b);
        if (b === nodeId) neighbors.add(a);
    });
    return Array.from(neighbors);
}

/**
 * Calculates shortest-path distance (number of harmonic hops) between two genres in the graph.
 * Returns 0 if identical, or positive integer hops (e.g. 1, 2, 3).
 */
export function getGraphDistance(genreA, genreB) {
    if (!genreA || !genreB) return 999;
    if (genreA === genreB) return 0;

    const visited = new Set([genreA]);
    const queue = [[genreA, 0]];

    while (queue.length > 0) {
        const [current, dist] = queue.shift();
        const neighbors = getConnectedGenres(current);

        for (const neighbor of neighbors) {
            if (neighbor === genreB) {
                return dist + 1;
            }
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push([neighbor, dist + 1]);
            }
        }
    }

    return 999; // Disconnected or not in graph
}

/**
 * Calculates acoustic and topological deviation vector between an active genre and a Home anchor.
 */
export function getVectorDeviation(genreA, genreB) {
    if (!genreA || !genreB) {
        return { hops: 0, deltaEnergy: 0, isSamePole: true, poleA: 'rock_metal', poleB: 'rock_metal' };
    }

    const hops = getGraphDistance(genreA, genreB);
    const nodeA = GENRE_NODES[genreA];
    const nodeB = GENRE_NODES[genreB];

    const poleA = getPoleForGenre(genreA);
    const poleB = getPoleForGenre(genreB);

    const energyA = nodeA?.energy ?? 0.5;
    const energyB = nodeB?.energy ?? 0.5;
    const deltaEnergy = Number((energyB - energyA).toFixed(2));

    return {
        hops,
        isSamePole: poleA === poleB,
        poleA,
        poleB,
        deltaEnergy
    };
}

export function violatesDealbreakers(text, candidateGenreId, activeDealbreakers = []) {
    const lowerText = (text || '').toLowerCase();

    for (const dbId of activeDealbreakers) {
        const preset = DEALBREAKER_PRESETS.find(p => p.id === dbId);
        if (!preset) continue;

        if (preset.excludeGenres.includes(candidateGenreId)) {
            return true;
        }

        for (const term of preset.excludeTerms) {
            if (lowerText.includes(term.toLowerCase())) {
                return true;
            }
        }
    }
    return false;
}

export function normalizeWeights(weights = {}, anchors = [], dealbreakers = []) {
    const clean = {};
    const safeWeights = weights || {};
    const safeAnchors = Array.isArray(anchors) ? anchors : [];
    const MAX_SHARE = 0.25;
    const MIN_FLOOR = 0.05;

    safeAnchors.forEach(a => {
        if (!violatesDealbreakers(a, a, dealbreakers)) {
            clean[a] = Math.max(MIN_FLOOR, safeWeights[a] || MIN_FLOOR);
        }
    });

    Object.keys(safeWeights).forEach(k => {
        if (!violatesDealbreakers(k, k, dealbreakers) && !clean[k]) {
            clean[k] = Math.max(MIN_FLOOR, safeWeights[k]);
        }
    });

    let total = Object.values(clean).reduce((sum, v) => sum + v, 0);
    if (total === 0) return clean;

    Object.keys(clean).forEach(k => {
        clean[k] = Math.min(MAX_SHARE, clean[k] / total);
    });

    total = Object.values(clean).reduce((sum, v) => sum + v, 0);
    Object.keys(clean).forEach(k => {
        clean[k] = clean[k] / total;
    });

    return clean;
}

/**
 * Natural mood-to-genre affinity mapping.
 * Connects emotional state to aesthetic clusters in the taste graph.
 */
export const MOOD_GENRE_MAP = {
    focus: ['baroque', 'neo_classical', 'ambient_electronic', 'lofi_hiphop', 'post_rock', 'ambient', 'chamber_music', 'idm', 'cool_jazz'],
    study: ['lofi_hiphop', 'neo_classical', 'ambient_electronic', 'ambient', 'chamber_music', 'contemporary_classical'],
    chill: ['lofi_hiphop', 'bossa_nova_jazz', 'neo_soul', 'ambient', 'indie_folk', 'house', 'chillout', 'smooth_jazz', 'roots_reggae'],
    late_night: ['cool_jazz', 'darksynth', 'ambient_electronic', 'quiet_storm', 'shoegaze', 'techno', 'ambient', 'soul_blues'],
    energetic: ['hard_rock', 'punk_rock', 'thrash_metal', 'synthwave', 'techno', 'drum_and_bass', 'boom_bap', 'prog_metal', 'afrobeat'],
    workout: ['thrash_metal', 'drum_and_bass', 'darksynth', 'prog_metal', 'industrial', 'hard_rock', 'trap_modern', 'edm_mainstream'],
    happy: ['classic_soul', 'funk', 'indie_pop', 'ska', 'dance_pop', 'bossa_nova', 'afrobeat', 'bluegrass'],
    party: ['funk', 'house', 'dance_pop', 'salsa', 'boom_bap', 'edm_mainstream', 'ska', 'afrobeat'],
    melancholic: ['romantic', 'post_rock', 'delta_blues', 'singer_songwriter', 'ambient', 'indie_folk', 'shoegaze'],
    sad: ['delta_blues', 'singer_songwriter', 'romantic', 'ambient', 'chicago_blues'],
    sleep: ['ambient', 'nature_soundscape', 'new_age', 'neo_classical'],
    rainy: ['indie_folk', 'lofi_hiphop', 'chicago_blues', 'delta_blues', 'post_rock', 'celtic_folk'],
    driving: ['classic_rock', 'blues_rock', 'americana', 'outlaw_country', 'synthwave', 'alt_rock', 'hard_rock'],
    morning: ['bossa_nova', 'indie_folk', 'classic_soul', 'neo_classical', 'chamber_music'],
    cyberpunk: ['darksynth', 'synthwave', 'techno', 'industrial', 'idm'],
    cinematic_epic: ['cinematic_orchestral', 'prog_metal', 'symphonic_metal', 'post_rock', 'opera'],
    cinematic_mystery: ['cool_jazz', 'soul_blues', 'ambient_electronic', 'chamber_music'],
    cinematic_fantasy: ['celtic_folk', 'chamber_music', 'neo_classical', 'acoustic_guitar'],
    cinematic_scifi: ['darksynth', 'synthwave', 'ambient_electronic', 'idm', 'space_rock'],
    cinematic_ambient: ['ambient', 'nature_soundscape', 'new_age', 'ambient_electronic'],
    dark_intense: ['black_metal', 'death_metal', 'darksynth', 'industrial', 'noise'],
    nostalgic: ['classic_rock', 'classic_soul', 'motown', '90s_alt', 'classic_country', 'traditional_pop'],
    romantic: ['classic_soul', 'neo_soul', 'bossa_nova', 'smooth_jazz', 'rnb_contemporary'],
    hopeful: ['indie_pop', 'indie_folk', 'chamber_music', 'classic_soul'],
    dreamy: ['shoegaze', 'dream_pop', 'ambient_electronic', 'lofi_hiphop', 'post_rock'],
    main_character: ['synthwave', 'indie_rock', 'dance_pop', 'alt_rock'],
    villain_mode: ['industrial', 'darksynth', 'trap_modern', 'thrash_metal'],
    soft_vibes: ['lofi_hiphop', 'indie_folk', 'bossa_nova', 'ambient'],
    dark_academia: ['baroque', 'chamber_music', 'neo_classical', 'cool_jazz'],
    cottagecore: ['indie_folk', 'celtic_folk', 'bluegrass', 'fingerstyle']
};

/**
 * Maps any genre node ID to one of the 6 canonical Sonic Radar poles:
 * 'rock_metal' | 'electronic' | 'hiphop_soul' | 'jazz_blues' | 'folk_acoustic' | 'classical_ambient'
 */
export function getPoleForGenre(genreId) {
    if (!genreId) return 'rock_metal';
    const node = GENRE_NODES[genreId];
    const groupLower = (node?.group || '').toLowerCase();
    const idLower = genreId.toLowerCase();

    if (groupLower.includes('rock') || groupLower.includes('metal') || idLower.includes('rock') || idLower.includes('metal') || idLower.includes('punk') || idLower.includes('grunge')) {
        return 'rock_metal';
    }
    if (groupLower.includes('electronic') || groupLower.includes('dance') || idLower.includes('synth') || idLower.includes('techno') || idLower.includes('house') || idLower.includes('edm') || idLower.includes('idm') || idLower.includes('darksynth')) {
        return 'electronic';
    }
    if (groupLower.includes('hip_hop') || groupLower.includes('rnb_soul') || idLower.includes('hiphop') || idLower.includes('soul') || idLower.includes('rap') || idLower.includes('funk') || idLower.includes('boom_bap') || idLower.includes('trap')) {
        return 'hiphop_soul';
    }
    if (groupLower.includes('jazz') || groupLower.includes('blues') || idLower.includes('jazz') || idLower.includes('blues') || idLower.includes('bossa')) {
        return 'jazz_blues';
    }
    if (groupLower.includes('folk') || groupLower.includes('acoustic') || groupLower.includes('country') || idLower.includes('folk') || idLower.includes('acoustic') || idLower.includes('bluegrass') || idLower.includes('americana')) {
        return 'folk_acoustic';
    }
    if (groupLower.includes('classical') || groupLower.includes('ambient') || groupLower.includes('orchestral') || groupLower.includes('avant') || idLower.includes('classical') || idLower.includes('ambient') || idLower.includes('baroque') || idLower.includes('chamber') || idLower.includes('drone') || idLower.includes('soundscape')) {
        return 'classical_ambient';
    }

    return 'rock_metal';
}

export function getMoodCompatibleGenres(moodId) {
    if (moodId && MOOD_GENRE_MAP[moodId]) {
        return MOOD_GENRE_MAP[moodId];
    }
    return Object.keys(GENRE_NODES);
}
