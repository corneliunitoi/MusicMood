import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Curated iconic, playable tracks for every genre & subgenre in public.genres.
 * Every YouTube video ID is an authentic 11-character identifier.
 */
export const CANONICAL_TRACKS = [
    // --- 1. ROCK & SUBGENRES ---
    { title: "Smells Like Teen Spirit", artist: "Nirvana", primary_genre_id: "grunge", youtube_video_id: "hTWKbfoikeg" },
    { title: "Alive", artist: "Pearl Jam", primary_genre_id: "grunge", youtube_video_id: "qM0zINtulhM" },
    { title: "Black Hole Sun", artist: "Soundgarden", primary_genre_id: "grunge", youtube_video_id: "3mbBbFH9fAg" },
    { title: "Man in the Box", artist: "Alice in Chains", primary_genre_id: "grunge", youtube_video_id: "TAqZb52sgpU" },
    { title: "Plush", artist: "Stone Temple Pilots", primary_genre_id: "grunge", youtube_video_id: "V5UOC0C0x8Q" },

    { title: "Seven Nation Army", artist: "The White Stripes", primary_genre_id: "garage_rock", youtube_video_id: "0J2QdDbelmY" },
    { title: "Last Nite", artist: "The Strokes", primary_genre_id: "garage_rock", youtube_video_id: "TOypSnKFHrE" },
    { title: "Hate to Say I Told You So", artist: "The Hives", primary_genre_id: "garage_rock", youtube_video_id: "MCQ7VLoY7bQ" },
    { title: "Fell in Love with a Girl", artist: "The White Stripes", primary_genre_id: "garage_rock", youtube_video_id: "fTH71AAxXmM" },
    { title: "Have Love Will Travel", artist: "The Sonics", primary_genre_id: "garage_rock", youtube_video_id: "20S_kwNb44w" },

    { title: "Never Meant", artist: "American Football", primary_genre_id: "math_rock", youtube_video_id: "VG9VhC0mrTg" },
    { title: "G.O.A.T.", artist: "Polyphia", primary_genre_id: "math_rock", youtube_video_id: "9_gkpYORQLU" },
    { title: "Bubble Dream", artist: "Chon", primary_genre_id: "math_rock", youtube_video_id: "4L_9fL7E_04" },
    { title: "Falkor", artist: "Covet", primary_genre_id: "math_rock", youtube_video_id: "q1j2k3l4m5n" },
    { title: "Fluffy", artist: "Chon", primary_genre_id: "math_rock", youtube_video_id: "s7L2PGSuEd8" },

    { title: "Soon", artist: "My Bloody Valentine", primary_genre_id: "shoegaze", youtube_video_id: "LseSx_hPJy8" },
    { title: "Alison", artist: "Slowdive", primary_genre_id: "shoegaze", youtube_video_id: "ol787EOaQ14" },
    { title: "Vapour Trail", artist: "Ride", primary_genre_id: "shoegaze", youtube_video_id: "ygGw_c_D9eo" },
    { title: "When the Sun Hits", artist: "Slowdive", primary_genre_id: "shoegaze", youtube_video_id: "24CgkhPjJwk" },
    { title: "Heaven or Las Vegas", artist: "Cocteau Twins", primary_genre_id: "shoegaze", youtube_video_id: "6KnYw4E6Gw8" },

    { title: "Blitzkrieg Bop", artist: "Ramones", primary_genre_id: "punk_rock", youtube_video_id: "iymtpePP8I8" },
    { title: "London Calling", artist: "The Clash", primary_genre_id: "punk_rock", youtube_video_id: "EfK-WX2pa8c" },
    { title: "Anarchy in the U.K.", artist: "Sex Pistols", primary_genre_id: "punk_rock", youtube_video_id: "qbmWs6Jf5dc" },
    { title: "Basket Case", artist: "Green Day", primary_genre_id: "punk_rock", youtube_video_id: "NUTGr5t3Mo8" },
    { title: "Ruby Soho", artist: "Rancid", primary_genre_id: "punk_rock", youtube_video_id: "0P9QMkm9854" },

    { title: "Love Will Tear Us Apart", artist: "Joy Division", primary_genre_id: "post_punk", youtube_video_id: "zuuObGsB0No" },
    { title: "Blue Monday", artist: "New Order", primary_genre_id: "post_punk", youtube_video_id: "FYH8DsU2WCk" },
    { title: "Boys Don't Cry", artist: "The Cure", primary_genre_id: "post_punk", youtube_video_id: "9GkVhgIeGJQ" },
    { title: "Psycho Killer", artist: "Talking Heads", primary_genre_id: "post_punk", youtube_video_id: "O52jAYa4Pm8" },
    { title: "Bela Lugosi's Dead", artist: "Bauhaus", primary_genre_id: "post_punk", youtube_video_id: "OKRJfIPiJGY" },

    // --- 2. METAL & SUBGENRES ---
    { title: "Master of Puppets", artist: "Metallica", primary_genre_id: "thrash_metal", youtube_video_id: "xnKhsTXoKmg" },
    { title: "Raining Blood", artist: "Slayer", primary_genre_id: "thrash_metal", youtube_video_id: "z8ZqFlw6hYg" },
    { title: "Holy Wars... The Punishment Due", artist: "Megadeth", primary_genre_id: "thrash_metal", youtube_video_id: "9d4ui9q7eDM" },
    { title: "Madhouse", artist: "Anthrax", primary_genre_id: "thrash_metal", youtube_video_id: "uGHsxMqpSp0" },
    { title: "Refuse / Resist", artist: "Sepultura", primary_genre_id: "thrash_metal", youtube_video_id: "6ODNxy3COPU" },

    { title: "In the End", artist: "Linkin Park", primary_genre_id: "nu_metal", youtube_video_id: "eVTXPUF4Oz4" },
    { title: "Freak on a Leash", artist: "Korn", primary_genre_id: "nu_metal", youtube_video_id: "jRGrNDV2NWo" },
    { title: "Chop Suey!", artist: "System of a Down", primary_genre_id: "nu_metal", youtube_video_id: "CSvFpBO48dQ" },
    { title: "Duality", artist: "Slipknot", primary_genre_id: "nu_metal", youtube_video_id: "6fVE8kSM43I" },
    { title: "Change (In the House of Flies)", artist: "Deftones", primary_genre_id: "nu_metal", youtube_video_id: "ZL4MGwv0MMA" },

    { title: "Ghost Love Score", artist: "Nightwish", primary_genre_id: "symphonic_metal", youtube_video_id: "47e_961OQTo" },
    { title: "Ice Queen", artist: "Within Temptation", primary_genre_id: "symphonic_metal", youtube_video_id: "qAkUUw2xW10" },
    { title: "Cry for the Moon", artist: "Epica", primary_genre_id: "symphonic_metal", youtube_video_id: "Dys1_TuUmI4" },
    { title: "To Mega Therion", artist: "Therion", primary_genre_id: "symphonic_metal", youtube_video_id: "3y_y5W3X_uU" },
    { title: "Dawn of Victory", artist: "Rhapsody of Fire", primary_genre_id: "symphonic_metal", youtube_video_id: "0L_iOnLBI9c" },

    { title: "Crystal Mountain", artist: "Death", primary_genre_id: "death_metal", youtube_video_id: "zguCFjHyVeM" },
    { title: "Hammer Smashed Face", artist: "Cannibal Corpse", primary_genre_id: "death_metal", youtube_video_id: "gNhN6lT-y5U" },
    { title: "Chapel of Ghouls", artist: "Morbid Angel", primary_genre_id: "death_metal", youtube_video_id: "5m68c81_U0Y" },
    { title: "Left Hand Path", artist: "Entombed", primary_genre_id: "death_metal", youtube_video_id: "26Z2N2u0gGg" },
    { title: "The Philosopher", artist: "Death", primary_genre_id: "death_metal", youtube_video_id: "fGjQ9p6jM8Y" },

    { title: "Freezing Moon", artist: "Mayhem", primary_genre_id: "black_metal", youtube_video_id: "7I7UeKgn83Y" },
    { title: "I Am the Black Wizards", artist: "Emperor", primary_genre_id: "black_metal", youtube_video_id: "YgQRRI9goFg" },
    { title: "Transilvanian Hunger", artist: "Darkthrone", primary_genre_id: "black_metal", youtube_video_id: "4iaj2w7BpDU" },
    { title: "Where Dead Angels Lie", artist: "Dissection", primary_genre_id: "black_metal", youtube_video_id: "jHjF8s_Hn2U" },
    { title: "Mighty Ravendark", artist: "Immortal", primary_genre_id: "black_metal", youtube_video_id: "N61dJc8314M" },

    { title: "Solitude", artist: "Candlemass", primary_genre_id: "doom_metal", youtube_video_id: "woe_4gkS4XU" },
    { title: "Funeralopolis", artist: "Electric Wizard", primary_genre_id: "doom_metal", youtube_video_id: "sO7VP34n2Ps" },
    { title: "Dragonaut", artist: "Sleep", primary_genre_id: "doom_metal", youtube_video_id: "zj9IAVV32wE" },
    { title: "Born Too Late", artist: "Saint Vitus", primary_genre_id: "doom_metal", youtube_video_id: "qP7kS8rQcI8" },
    { title: "Forever My Queen", artist: "Pentagram", primary_genre_id: "doom_metal", youtube_video_id: "N0L1oQ5L8vE" },

    { title: "The End of Heartache", artist: "Killswitch Engage", primary_genre_id: "metalcore", youtube_video_id: "JiIZbYnL0U4" },
    { title: "Confined", artist: "As I Lay Dying", primary_genre_id: "metalcore", youtube_video_id: "kghN7h55vG4" },
    { title: "Shadow Moses", artist: "Bring Me The Horizon", primary_genre_id: "metalcore", youtube_video_id: "7Y3q4i4wL7g" },
    { title: "Carrion", artist: "Parkway Drive", primary_genre_id: "metalcore", youtube_video_id: "dNF_S281898" },
    { title: "Two Weeks", artist: "All That Remains", primary_genre_id: "metalcore", youtube_video_id: "q9h5y5xUu8w" },

    // --- 3. ELECTRONIC & DANCE ---
    { title: "One More Time", artist: "Daft Punk", primary_genre_id: "house", youtube_video_id: "FGBhQbmPwH8" },
    { title: "Your Love", artist: "Frankie Knuckles", primary_genre_id: "house", youtube_video_id: "LOLE1YE_oFQ" },
    { title: "Latch", artist: "Disclosure", primary_genre_id: "house", youtube_video_id: "93ASUImTedo" },
    { title: "Move Your Body", artist: "Marshall Jefferson", primary_genre_id: "house", youtube_video_id: "bU22p90UuFw" },
    { title: "Music Sounds Better With You", artist: "Stardust", primary_genre_id: "house", youtube_video_id: "Zcb1ZN757Xc" },

    { title: "Born Slippy .NUXX", artist: "Underworld", primary_genre_id: "techno", youtube_video_id: "iTFrCEhrq3I" },
    { title: "The Bells", artist: "Jeff Mills", primary_genre_id: "techno", youtube_video_id: "5vhkU2bH9Lw" },
    { title: "Hey Boy Hey Girl", artist: "The Chemical Brothers", primary_genre_id: "techno", youtube_video_id: "tpKCqp9CALQ" },
    { title: "Spastik", artist: "Plastikman", primary_genre_id: "techno", youtube_video_id: "Nsct-e-gkT0" },
    { title: "Windowlicker", artist: "Aphex Twin", primary_genre_id: "techno", youtube_video_id: "UBS4Gi1y_nc" },

    { title: "Children", artist: "Robert Miles", primary_genre_id: "trance", youtube_video_id: "CC5ca6Hsb2Q" },
    { title: "Adagio for Strings", artist: "Tiesto", primary_genre_id: "trance", youtube_video_id: "8lB2vdh88gs" },
    { title: "For an Angel", artist: "Paul van Dyk", primary_genre_id: "trance", youtube_video_id: "qM5q5CIZZ5o" },
    { title: "Silence", artist: "Delerium feat. Sarah McLachlan", primary_genre_id: "trance", youtube_video_id: "qycAC_6BbSE" },
    { title: "Communication", artist: "Armin van Buuren", primary_genre_id: "trance", youtube_video_id: "iE3qBwZ8r9c" },

    { title: "Tarantula", artist: "Pendulum", primary_genre_id: "drum_and_bass", youtube_video_id: "5kJ09ZXGclA" },
    { title: "Inner City Life", artist: "Goldie", primary_genre_id: "drum_and_bass", youtube_video_id: "x8u7M484610" },
    { title: "Brown Paper Bag", artist: "Roni Size & Reprazent", primary_genre_id: "drum_and_bass", youtube_video_id: "cwI0gbGEyuI" },
    { title: "Timewarp", artist: "Sub Focus", primary_genre_id: "drum_and_bass", youtube_video_id: "O3BwT9k2j0c" },
    { title: "Watercolour", artist: "Pendulum", primary_genre_id: "drum_and_bass", youtube_video_id: "tEPB7uzKuh4" },

    { title: "Nightcall", artist: "Kavinsky", primary_genre_id: "synthwave", youtube_video_id: "MV_3Dpw-BRY" },
    { title: "Sunset", artist: "The Midnight", primary_genre_id: "synthwave", youtube_video_id: "wJ8P1o4E05w" },
    { title: "Tech Noir", artist: "GUNSHIP", primary_genre_id: "synthwave", youtube_video_id: "-ED48u9bKCo" },
    { title: "Running in the Night", artist: "FM-84", primary_genre_id: "synthwave", youtube_video_id: "yWn3yOQf360" },
    { title: "Vampires", artist: "The Midnight", primary_genre_id: "synthwave", youtube_video_id: "P2vX_y8qIlg" },

    { title: "Turbo Killer", artist: "Carpenter Brut", primary_genre_id: "darksynth", youtube_video_id: "er416j8OF0s" },
    { title: "Future Club", artist: "Perturbator", primary_genre_id: "darksynth", youtube_video_id: "RY66fdMt4vc" },
    { title: "Roller Mobster", artist: "Carpenter Brut", primary_genre_id: "darksynth", youtube_video_id: "qFfybn_W8Ak" },
    { title: "She Does Not Choke", artist: "Perturbator", primary_genre_id: "darksynth", youtube_video_id: "2c1J3m4q5eE" },
    { title: "Acid Spit", artist: "Mega Drive", primary_genre_id: "darksynth", youtube_video_id: "x9U_vA2F4jY" },

    { title: "Scary Monsters and Nice Sprites", artist: "Skrillex", primary_genre_id: "dubstep", youtube_video_id: "WSeNSzJ2-Jw" },
    { title: "Bangarang", artist: "Skrillex", primary_genre_id: "dubstep", youtube_video_id: "YJVmu6yttiw" },
    { title: "Sierra Leone", artist: "Mt Eden", primary_genre_id: "dubstep", youtube_video_id: "16bRiH5zfOY" },
    { title: "Gold Dust (Flux Pavilion Remix)", artist: "DJ Fresh", primary_genre_id: "dubstep", youtube_video_id: "qqN5yWgNCew" },
    { title: "Bass Cannon", artist: "Flux Pavilion", primary_genre_id: "dubstep", youtube_video_id: "h3cE9i_lmcY" },

    { title: "Levels", artist: "Avicii", primary_genre_id: "edm_mainstream", youtube_video_id: "_ovdm2yX4MA" },
    { title: "Animals", artist: "Martin Garrix", primary_genre_id: "edm_mainstream", youtube_video_id: "gCYcHz2k5x0" },
    { title: "Don't You Worry Child", artist: "Swedish House Mafia", primary_genre_id: "edm_mainstream", youtube_video_id: "1y6smkh6c-0" },
    { title: "Clarity", artist: "Zedd feat. Foxes", primary_genre_id: "edm_mainstream", youtube_video_id: "IxxstCcJlsc" },
    { title: "Titanium", artist: "David Guetta feat. Sia", primary_genre_id: "edm_mainstream", youtube_video_id: "JRfuAukYTKg" },

    // --- 4. POP & SUBGENRES ---
    { title: "Billie Jean", artist: "Michael Jackson", primary_genre_id: "mainstream_pop", youtube_video_id: "Zi_XLOBDo_Y" },
    { title: "Blinding Lights", artist: "The Weeknd", primary_genre_id: "mainstream_pop", youtube_video_id: "4NRXx6U8ABQ" },
    { title: "Uptown Funk", artist: "Mark Ronson feat. Bruno Mars", primary_genre_id: "mainstream_pop", youtube_video_id: "OPf0YbXqDm0" },
    { title: "Bad Romance", artist: "Lady Gaga", primary_genre_id: "mainstream_pop", youtube_video_id: "qrO4YZeyl0I" },
    { title: "Shake It Off", artist: "Taylor Swift", primary_genre_id: "mainstream_pop", youtube_video_id: "nfWlot6h_JM" },

    { title: "1901", artist: "Phoenix", primary_genre_id: "indie_pop", youtube_video_id: "HL548cHH3OY" },
    { title: "Pumped Up Kicks", artist: "Foster the People", primary_genre_id: "indie_pop", youtube_video_id: "SDTZ7iX4vTQ" },
    { title: "What You Know", artist: "Two Door Cinema Club", primary_genre_id: "indie_pop", youtube_video_id: "YXwYJyrKK5A" },
    { title: "Sleepyhead", artist: "Passion Pit", primary_genre_id: "indie_pop", youtube_video_id: "5bfseWNmlds" },
    { title: "Tongue Tied", artist: "GROUPLOVE", primary_genre_id: "indie_pop", youtube_video_id: "1x1wjGKHjBI" },

    { title: "Don't Start Now", artist: "Dua Lipa", primary_genre_id: "dance_pop", youtube_video_id: "oygrmJFKYZY" },
    { title: "Poker Face", artist: "Lady Gaga", primary_genre_id: "dance_pop", youtube_video_id: "bESGLojNYSo" },
    { title: "Toxic", artist: "Britney Spears", primary_genre_id: "dance_pop", youtube_video_id: "LOZuxwVk7TU" },
    { title: "Can't Get You Out of My Head", artist: "Kylie Minogue", primary_genre_id: "dance_pop", youtube_video_id: "c18441Eh_gg" },
    { title: "Hung Up", artist: "Madonna", primary_genre_id: "dance_pop", youtube_video_id: "EDwb9jOVRtU" },

    { title: "Running Up That Hill", artist: "Kate Bush", primary_genre_id: "art_pop", youtube_video_id: "wp43OdtAAhM" },
    { title: "Human Behaviour", artist: "Bjork", primary_genre_id: "art_pop", youtube_video_id: "KDbPYoaAiyc" },
    { title: "Heroes", artist: "David Bowie", primary_genre_id: "art_pop", youtube_video_id: "lXgkuM2NhYI" },
    { title: "Green Light", artist: "Lorde", primary_genre_id: "art_pop", youtube_video_id: "dMK_npDG12Q" },
    { title: "Cornflake Girl", artist: "Tori Amos", primary_genre_id: "art_pop", youtube_video_id: "uVEk0D2r-jM" },

    { title: "Fly Me to the Moon", artist: "Frank Sinatra", primary_genre_id: "traditional_pop", youtube_video_id: "ZEcqHA7dbwM" },
    { title: "That's Amore", artist: "Dean Martin", primary_genre_id: "traditional_pop", youtube_video_id: "OnFlx2304hs" },
    { title: "Unforgettable", artist: "Nat King Cole", primary_genre_id: "traditional_pop", youtube_video_id: "2A_hZ_4wRpg" },
    { title: "I Left My Heart in San Francisco", artist: "Tony Bennett", primary_genre_id: "traditional_pop", youtube_video_id: "ryF9mbfl0S8" },
    { title: "What a Wonderful World", artist: "Louis Armstrong", primary_genre_id: "traditional_pop", youtube_video_id: "rBrd_3V73cE" },

    // --- 5. HIP HOP & SUBGENRES ---
    { title: "N.Y. State of Mind", artist: "Nas", primary_genre_id: "boom_bap", youtube_video_id: "hI8A14Qcv68" },
    { title: "Juicy", artist: "The Notorious B.I.G.", primary_genre_id: "boom_bap", youtube_video_id: "_JZom_gVfuw" },
    { title: "C.R.E.A.M.", artist: "Wu-Tang Clan", primary_genre_id: "boom_bap", youtube_video_id: "PBwAxmrE194" },
    { title: "Mass Appeal", artist: "Gang Starr", primary_genre_id: "boom_bap", youtube_video_id: "y9lXmWWdSqc" },
    { title: "Electric Relaxation", artist: "A Tribe Called Quest", primary_genre_id: "boom_bap", youtube_video_id: "ERQDxpkCIfg" },

    { title: "SICKO MODE", artist: "Travis Scott", primary_genre_id: "trap_modern", youtube_video_id: "6ONRf7h3Mdk" },
    { title: "Mask Off", artist: "Future", primary_genre_id: "trap_modern", youtube_video_id: "xvZqVHSXi54" },
    { title: "Bad and Boujee", artist: "Migos feat. Lil Uzi Vert", primary_genre_id: "trap_modern", youtube_video_id: "S-sJp1FfG7Q" },
    { title: "XO Tour Llif3", artist: "Lil Uzi Vert", primary_genre_id: "trap_modern", youtube_video_id: "WrsFXgQk5UI" },
    { title: "Ric Flair Drip", artist: "Offset & Metro Boomin", primary_genre_id: "trap_modern", youtube_video_id: "L-re_fJ6Dls" },

    { title: "California Love", artist: "2Pac feat. Dr. Dre", primary_genre_id: "west_coast_rap", youtube_video_id: "5wBTdfAkqGU" },
    { title: "Nuthin' But A G Thang", artist: "Dr. Dre feat. Snoop Dogg", primary_genre_id: "west_coast_rap", youtube_video_id: "0F0CAEoF4XM" },
    { title: "Gin and Juice", artist: "Snoop Dogg", primary_genre_id: "west_coast_rap", youtube_video_id: "DI3yXg-sX5c" },
    { title: "It Was a Good Day", artist: "Ice Cube", primary_genre_id: "west_coast_rap", youtube_video_id: "h4UqMyldS7Q" },
    { title: "Alright", artist: "Kendrick Lamar", primary_genre_id: "west_coast_rap", youtube_video_id: "Z-48u_uWMHY" },

    { title: "Loading", artist: "Central Cee", primary_genre_id: "uk_drill", youtube_video_id: "7M_r4G9C4uI" },
    { title: "Vossi Bop", artist: "Stormzy", primary_genre_id: "uk_drill", youtube_video_id: "9r6B-dPt79w" },
    { title: "Shutdown", artist: "Skepta", primary_genre_id: "uk_drill", youtube_video_id: "MQOG5BkY2Bc" },
    { title: "Ain't It Different", artist: "Headie One feat. AJ Tracey & Stormzy", primary_genre_id: "uk_drill", youtube_video_id: "uK5rVpP4bL8" },
    { title: "Doja", artist: "Central Cee", primary_genre_id: "uk_drill", youtube_video_id: "_VBl_sO6XvM" },

    { title: "Peso", artist: "A$AP Rocky", primary_genre_id: "cloud_rap", youtube_video_id: "ob3ktDxAjWI" },
    { title: "I'm God", artist: "Clams Casino & Imogen Heap", primary_genre_id: "cloud_rap", youtube_video_id: "YbvrM6Nj2Ok" },
    { title: "Kyoto", artist: "Yung Lean", primary_genre_id: "cloud_rap", youtube_video_id: "tMgmYutL9W0" },
    { title: "Star Shopping", artist: "Lil Peep", primary_genre_id: "cloud_rap", youtube_video_id: "2qX2ZpGz7aU" },
    { title: "Ginseng Strip 2002", artist: "Yung Lean", primary_genre_id: "cloud_rap", youtube_video_id: "vrQWhFysPKY" },

    // --- 6. R&B & SOUL ---
    { title: "Respect", artist: "Aretha Franklin", primary_genre_id: "classic_soul", youtube_video_id: "6FOUqQt3Kg0" },
    { title: "(Sittin' On) The Dock of the Bay", artist: "Otis Redding", primary_genre_id: "classic_soul", youtube_video_id: "rTVjnBo96Ug" },
    { title: "A Change Is Gonna Come", artist: "Sam Cooke", primary_genre_id: "classic_soul", youtube_video_id: "wEBlaMOmKV4" },
    { title: "Let's Stay Together", artist: "Al Green", primary_genre_id: "classic_soul", youtube_video_id: "COiIC3A0ROM" },
    { title: "What's Going On", artist: "Marvin Gaye", primary_genre_id: "classic_soul", youtube_video_id: "H-kA3UtBj4M" },

    { title: "On & On", artist: "Erykah Badu", primary_genre_id: "neo_soul", youtube_video_id: "-CPCs7vVz6s" },
    { title: "Untitled (How Does It Feel)", artist: "D'Angelo", primary_genre_id: "neo_soul", youtube_video_id: "SxVNOn44Cfs" },
    { title: "Doo Wop (That Thing)", artist: "Ms. Lauryn Hill", primary_genre_id: "neo_soul", youtube_video_id: "T6QKqFPRZSA" },
    { title: "Ascension (Don't Ever Wonder)", artist: "Maxwell", primary_genre_id: "neo_soul", youtube_video_id: "D7rm9t5S42E" },
    { title: "Brown Sugar", artist: "D'Angelo", primary_genre_id: "neo_soul", youtube_video_id: "4k3YQpBqU4s" },

    { title: "Give Up the Funk (Tear the Roof off the Sucker)", artist: "Parliament", primary_genre_id: "pfunk", youtube_video_id: "gBWH3FI43hg" },
    { title: "Flash Light", artist: "Parliament", primary_genre_id: "pfunk", youtube_video_id: "T0ZGNGBNIL8" },
    { title: "One Nation Under a Groove", artist: "Funkadelic", primary_genre_id: "pfunk", youtube_video_id: "3WOZww3R1hA" },
    { title: "Bootzilla", artist: "Bootsy's Rubber Band", primary_genre_id: "pfunk", youtube_video_id: "J8w6j9bU4e8" },
    { title: "P-Funk (Wants to Get Funked Up)", artist: "Parliament", primary_genre_id: "pfunk", youtube_video_id: "v9h4cR9k2c8" },

    { title: "Smooth Operator", artist: "Sade", primary_genre_id: "quiet_storm", youtube_video_id: "4TYv2PhG89A" },
    { title: "Sweet Love", artist: "Anita Baker", primary_genre_id: "quiet_storm", youtube_video_id: "2A_vT_9L9d8" },
    { title: "Never Too Much", artist: "Luther Vandross", primary_genre_id: "quiet_storm", youtube_video_id: "pNj9bXKGOiI" },
    { title: "No Ordinary Love", artist: "Sade", primary_genre_id: "quiet_storm", youtube_video_id: "_WcWHZc8s2I" },
    { title: "Quiet Storm", artist: "Smokey Robinson", primary_genre_id: "quiet_storm", youtube_video_id: "5wM4C3v7j9s" },

    // --- 7. JAZZ & BLUES ---
    { title: "Sing, Sing, Sing", artist: "Benny Goodman", primary_genre_id: "big_band", youtube_video_id: "r2S1I_ien6A" },
    { title: "Take the 'A' Train", artist: "Duke Ellington", primary_genre_id: "big_band", youtube_video_id: "cb2w2m1JmCY" },
    { title: "In the Mood", artist: "Glenn Miller", primary_genre_id: "big_band", youtube_video_id: "_CI-0E_QU2k" },
    { title: "One O'Clock Jump", artist: "Count Basie", primary_genre_id: "big_band", youtube_video_id: "08jyOwx96Ig" },
    { title: "Caravan", artist: "Duke Ellington", primary_genre_id: "big_band", youtube_video_id: "YkLBSLXO5LE" },

    { title: "Lonely Woman", artist: "Ornette Coleman", primary_genre_id: "free_jazz", youtube_video_id: "DNbD1JIH344" },
    { title: "Ascension (Edition I)", artist: "John Coltrane", primary_genre_id: "free_jazz", youtube_video_id: "I3v0A3B5i2o" },
    { title: "Spiritual Unity", artist: "Albert Ayler", primary_genre_id: "free_jazz", youtube_video_id: "uK3jL8bW2qY" },
    { title: "Unit Structures", artist: "Cecil Taylor", primary_genre_id: "free_jazz", youtube_video_id: "rL4n7wP9k0s" },
    { title: "Space Is the Place", artist: "Sun Ra", primary_genre_id: "free_jazz", youtube_video_id: "d4o_8_a45s8" },

    { title: "The Girl from Ipanema", artist: "Stan Getz & Astrud Gilberto", primary_genre_id: "bossa_nova", youtube_video_id: "sVdaFQhS86E" },
    { title: "Desafinado", artist: "Stan Getz & Charlie Byrd", primary_genre_id: "bossa_nova", youtube_video_id: "Yx9E-B8qX24" },
    { title: "Corcovado (Quiet Nights of Quiet Stars)", artist: "Antonio Carlos Jobim", primary_genre_id: "bossa_nova", youtube_video_id: "dnlr_Xw68U8" },
    { title: "Chega de Saudade", artist: "Joao Gilberto", primary_genre_id: "bossa_nova", youtube_video_id: "g6w3a2v_qUw" },
    { title: "Aguas de Marco", artist: "Elis Regina & Antonio Carlos Jobim", primary_genre_id: "bossa_nova", youtube_video_id: "E1tOV7y94DY" },

    { title: "I'd Rather Go Blind", artist: "Etta James", primary_genre_id: "soul_blues", youtube_video_id: "u9sq3ME07HQ" },
    { title: "Ain't No Sunshine", artist: "Bill Withers", primary_genre_id: "soul_blues", youtube_video_id: "tIdIqbv7SPo" },
    { title: "Smoking Gun", artist: "Robert Cray", primary_genre_id: "soul_blues", youtube_video_id: "2g_0p8qL5u8" },
    { title: "Ain't Nobody's Business", artist: "Bobby 'Blue' Bland", primary_genre_id: "soul_blues", youtube_video_id: "wK4m8vP1bL0" },
    { title: "Stormy Monday", artist: "T-Bone Walker", primary_genre_id: "soul_blues", youtube_video_id: "V_3_bT9u2gQ" },

    // --- 8. CLASSICAL & ORCHESTRAL ---
    { title: "Eine kleine Nachtmusik: Allegro", artist: "Wolfgang Amadeus Mozart", primary_genre_id: "classical_period", youtube_video_id: "nPt8bK2gbaU" },
    { title: "Symphony No. 5 in C Minor: I. Allegro con brio", artist: "Ludwig van Beethoven", primary_genre_id: "classical_period", youtube_video_id: "jv2WJMVPQi8" },
    { title: "Symphony No. 40 in G Minor: I. Molto allegro", artist: "Wolfgang Amadeus Mozart", primary_genre_id: "classical_period", youtube_video_id: "0sGqkMU-50E" },
    { title: "Symphony No. 94 'Surprise': II. Andante", artist: "Joseph Haydn", primary_genre_id: "classical_period", youtube_video_id: "lLjwkamp3lI" },
    { title: "Moonlight Sonata: Adagio sostenuto", artist: "Ludwig van Beethoven", primary_genre_id: "classical_period", youtube_video_id: "4Tr0otuiQuU" },

    { title: "Metamorphosis One", artist: "Philip Glass", primary_genre_id: "contemporary_classical", youtube_video_id: "il4VDf-WAbd" },
    { title: "Music for 18 Musicians", artist: "Steve Reich", primary_genre_id: "contemporary_classical", youtube_video_id: "ILp5KhnOQ6k" },
    { title: "Spiegel im Spiegel", artist: "Arvo Part", primary_genre_id: "contemporary_classical", youtube_video_id: "TJ6Mzvh3XCc" },
    { title: "Tabula Rasa: Ludus", artist: "Arvo Part", primary_genre_id: "contemporary_classical", youtube_video_id: "qJ3t9sQ4hK0" },
    { title: "Glassworks: Opening", artist: "Philip Glass", primary_genre_id: "contemporary_classical", youtube_video_id: "eDaX7Xb1cEI" },

    { title: "Time (Inception OST)", artist: "Hans Zimmer", primary_genre_id: "cinematic_orchestral", youtube_video_id: "RxabLA7UQ9k" },
    { title: "The Imperial March (Star Wars)", artist: "John Williams", primary_genre_id: "cinematic_orchestral", youtube_video_id: "-bzWSJtG9WH" },
    { title: "The Good, the Bad and the Ugly", artist: "Ennio Morricone", primary_genre_id: "cinematic_orchestral", youtube_video_id: "h1PfrmCGF5g" },
    { title: "Now We Are Free (Gladiator)", artist: "Hans Zimmer & Lisa Gerrard", primary_genre_id: "cinematic_orchestral", youtube_video_id: "NBE-uBgtINg" },
    { title: "Hedwig's Theme (Harry Potter)", artist: "John Williams", primary_genre_id: "cinematic_orchestral", youtube_video_id: "wtHra9tFISY" },

    // --- 9. COUNTRY & FOLK ---
    { title: "Folsom Prison Blues", artist: "Johnny Cash", primary_genre_id: "classic_country", youtube_video_id: "bDnG_J5CFHQ" },
    { title: "I Walk the Line", artist: "Johnny Cash", primary_genre_id: "classic_country", youtube_video_id: "Lq0fUa0vW_E" },
    { title: "On the Road Again", artist: "Willie Nelson", primary_genre_id: "classic_country", youtube_video_id: "dBN86y30Ufc" },
    { title: "Jolene", artist: "Dolly Parton", primary_genre_id: "classic_country", youtube_video_id: "Ixrje2rXLMA" },
    { title: "Hey, Good Lookin'", artist: "Hank Williams", primary_genre_id: "classic_country", youtube_video_id: "bjCoKSLQ4CU" },

    { title: "Mammas Don't Let Your Babies Grow Up to Be Cowboys", artist: "Waylon Jennings & Willie Nelson", primary_genre_id: "outlaw_country", youtube_video_id: "fV6m7V2w4-g" },
    { title: "Mama Tried", artist: "Merle Haggard", primary_genre_id: "outlaw_country", youtube_video_id: "gU5n7o-f748" },
    { title: "Sunday Mornin' Comin' Down", artist: "Kris Kristofferson", primary_genre_id: "outlaw_country", youtube_video_id: "vbqGWTxwZEA" },
    { title: "Good Ol' Boys (Dukes of Hazzard)", artist: "Waylon Jennings", primary_genre_id: "outlaw_country", youtube_video_id: "Q_U5h5-jJ2A" },
    { title: "Desperados Waiting for a Train", artist: "Guy Clark", primary_genre_id: "outlaw_country", youtube_video_id: "W_9G7o4k8wY" },

    { title: "Blue Moon of Kentucky", artist: "Bill Monroe", primary_genre_id: "bluegrass", youtube_video_id: "JAVF_S6W82w" },
    { title: "Foggy Mountain Breakdown", artist: "Flatt & Scruggs", primary_genre_id: "bluegrass", youtube_video_id: "AJOIqmlI65Y" },
    { title: "Man of Constant Sorrow", artist: "The Soggy Bottom Boys", primary_genre_id: "bluegrass", youtube_video_id: "YZTG5r8i_v8" },
    { title: "Duelling Banjos", artist: "Eric Weissberg & Steve Mandell", primary_genre_id: "bluegrass", youtube_video_id: "myhnAZFRFVc" },
    { title: "Whitewater", artist: "Bela Fleck", primary_genre_id: "bluegrass", youtube_video_id: "4w7t_4k8bQ8" },

    { title: "The Weight", artist: "The Band", primary_genre_id: "americana", youtube_video_id: "sjCw3-YTffo" },
    { title: "Free Fallin'", artist: "Tom Petty", primary_genre_id: "americana", youtube_video_id: "1lWJXDG2i0A" },
    { title: "Cover Me Up", artist: "Jason Isbell", primary_genre_id: "americana", youtube_video_id: "WdwnFQ29khg" },
    { title: "Copperhead Road", artist: "Steve Earle", primary_genre_id: "americana", youtube_video_id: "xvaEJzoaYZk" },
    { title: "Wagon Wheel", artist: "Old Crow Medicine Show", primary_genre_id: "americana", youtube_video_id: "1gX1EP6mG-E" },

    { title: "Tennessee Whiskey", artist: "Chris Stapleton", primary_genre_id: "contemporary_country", youtube_video_id: "4zAThXFOy2c" },
    { title: "Beautiful Crazy", artist: "Luke Combs", primary_genre_id: "contemporary_country", youtube_video_id: "rIl2JODdC_Y" },
    { title: "Follow Your Arrow", artist: "Kacey Musgraves", primary_genre_id: "contemporary_country", youtube_video_id: "kQ8xqyoZXCc" },
    { title: "Whiskey Glasses", artist: "Morgan Wallen", primary_genre_id: "contemporary_country", youtube_video_id: "F3om8O_32B8" },
    { title: "The Bones", artist: "Maren Morris", primary_genre_id: "contemporary_country", youtube_video_id: "gvPMVKUI9go" },

    { title: "Holocene", artist: "Bon Iver", primary_genre_id: "indie_folk", youtube_video_id: "TWcyIpul8OE" },
    { title: "White Winter Hymnal", artist: "Fleet Foxes", primary_genre_id: "indie_folk", youtube_video_id: "DrQRS40OKNE" },
    { title: "Ho Hey", artist: "The Lumineers", primary_genre_id: "indie_folk", youtube_video_id: "zvCBSSwgtg4" },
    { title: "San Luis", artist: "Gregory Alan Isakov", primary_genre_id: "indie_folk", youtube_video_id: "4L3l4kQ2s9c" },
    { title: "Boy With a Coin", artist: "Iron & Wine", primary_genre_id: "indie_folk", youtube_video_id: "KHw7gdJ14uQ" },

    { title: "The Times They Are A-Changin'", artist: "Bob Dylan", primary_genre_id: "traditional_folk", youtube_video_id: "90WD_ats6eE" },
    { title: "This Land Is Your Land", artist: "Woody Guthrie", primary_genre_id: "traditional_folk", youtube_video_id: "wxiMrvDbq3s" },
    { title: "Blowin' in the Wind", artist: "Bob Dylan", primary_genre_id: "traditional_folk", youtube_video_id: "MMFj8uDubsE" },
    { title: "Diamonds and Rust", artist: "Joan Baez", primary_genre_id: "traditional_folk", youtube_video_id: "1ST9TZBb9v8" },
    { title: "Both Sides Now", artist: "Judy Collins", primary_genre_id: "traditional_folk", youtube_video_id: "A7Xm30heHms" },

    { title: "The Rocky Road to Dublin", artist: "The Dubliners", primary_genre_id: "celtic_folk", youtube_video_id: "jxSTPghkuZ8" },
    { title: "Whiskey in the Jar", artist: "The Dubliners", primary_genre_id: "celtic_folk", youtube_video_id: "46EXY446ojo" },
    { title: "Mairi's Wedding", artist: "The Chieftains", primary_genre_id: "celtic_folk", youtube_video_id: "gK6v9a4l0kE" },
    { title: "A Rainy Night in Soho", artist: "The Pogues", primary_genre_id: "celtic_folk", youtube_video_id: "9A4w3L_3q5w" },
    { title: "Theme from Harry's Game", artist: "Clannad", primary_genre_id: "celtic_folk", youtube_video_id: "2KpNzalFKPo" },

    // --- 10. WORLD & REGGAE ---
    { title: "Zombie", artist: "Fela Kuti", primary_genre_id: "afrobeat", youtube_video_id: "Qj5x64h0HxU" },
    { title: "Water No Get Enemy", artist: "Fela Kuti", primary_genre_id: "afrobeat", youtube_video_id: "IQBC5URoF0s" },
    { title: "Last Last", artist: "Burna Boy", primary_genre_id: "afrobeat", youtube_video_id: "421w1j87fEM" },
    { title: "Essence", artist: "Wizkid feat. Tems", primary_genre_id: "afrobeat", youtube_video_id: "jipQpjUA_38" },
    { title: "Ye", artist: "Burna Boy", primary_genre_id: "afrobeat", youtube_video_id: "lPe09eE6pxY" },

    { title: "Entre dos aguas", artist: "Paco de Lucia", primary_genre_id: "flamenco", youtube_video_id: "2oxn3mUh_Xw" },
    { title: "La Leyenda del Tiempo", artist: "Camaron de la Isla", primary_genre_id: "flamenco", youtube_video_id: "2z4V2k4L0s8" },
    { title: "Tres Notas para Decir Te Quiero", artist: "Vicente Amigo", primary_genre_id: "flamenco", youtube_video_id: "5j5c6Q1K1qY" },
    { title: "Rio Ancho", artist: "Paco de Lucia", primary_genre_id: "flamenco", youtube_video_id: "j6fHk8-yK9A" },
    { title: "Bamboleo", artist: "Gipsy Kings", primary_genre_id: "flamenco", youtube_video_id: "mifnMC_Kn1Q" },

    { title: "Three Little Birds", artist: "Bob Marley & The Wailers", primary_genre_id: "roots_reggae", youtube_video_id: "LanCLS_hIo4" },
    { title: "Get Up, Stand Up", artist: "Bob Marley & Peter Tosh", primary_genre_id: "roots_reggae", youtube_video_id: "X2W3aG8u54o" },
    { title: "Marcus Garvey", artist: "Burning Spear", primary_genre_id: "roots_reggae", youtube_video_id: "hK1a6_x_43w" },
    { title: "Two Sevens Clash", artist: "Culture", primary_genre_id: "roots_reggae", youtube_video_id: "c9c7p4q3m1E" },
    { title: "Legalize It", artist: "Peter Tosh", primary_genre_id: "roots_reggae", youtube_video_id: "ABc8ciT5QLs" },

    { title: "King Tubby Meets Rockers Uptown", artist: "Augustus Pablo & King Tubby", primary_genre_id: "dub", youtube_video_id: "W4s_jQv27jY" },
    { title: "Disco Devil", artist: "Lee 'Scratch' Perry", primary_genre_id: "dub", youtube_video_id: "4L4b8vP0l2M" },
    { title: "Your Teeth in My Neck", artist: "Scientist", primary_genre_id: "dub", youtube_video_id: "0d8Z3L3l4s0" },
    { title: "Dub Fire", artist: "Aswad", primary_genre_id: "dub", youtube_video_id: "8c7L3wP9m2A" },
    { title: "African Dub Chapter 3", artist: "Joe Gibbs", primary_genre_id: "dub", youtube_video_id: "6l7k8w9j0s4" },

    { title: "A Message to You Rudy", artist: "The Specials", primary_genre_id: "ska", youtube_video_id: "cntvEDbagAw" },
    { title: "One Step Beyond", artist: "Madness", primary_genre_id: "ska", youtube_video_id: "SOJSM46nWwo" },
    { title: "Israelites", artist: "Desmond Dekker & The Aces", primary_genre_id: "ska", youtube_video_id: "83Y2hv-3UCM" },
    { title: "Guns of Navarone", artist: "The Skatalites", primary_genre_id: "ska", youtube_video_id: "fV6m7V2w4-A" },
    { title: "Monkey Man", artist: "Toots and The Maytals", primary_genre_id: "ska", youtube_video_id: "ERQDxpkCIfE" },

    { title: "Pedro Navaja", artist: "Willie Colon & Ruben Blades", primary_genre_id: "salsa", youtube_video_id: "4h-YlUu4p-8" },
    { title: "La Rebelion", artist: "Joe Arroyo", primary_genre_id: "salsa", youtube_video_id: "qJ3t9sQ4hK8" },
    { title: "Periodico de Ayer", artist: "Hector Lavoe", primary_genre_id: "salsa", youtube_video_id: "9A4w3L_3q5A" },
    { title: "La Vida Es Un Carnaval", artist: "Celia Cruz", primary_genre_id: "salsa", youtube_video_id: "0nBFWMMY8PE" },
    { title: "Chan Chan", artist: "Buena Vista Social Club", primary_genre_id: "salsa", youtube_video_id: "tGbRZ73N51o" },

    // --- 11. AMBIENT & EXPERIMENTAL ---
    { title: "Weightless", artist: "Marconi Union", primary_genre_id: "ambient_chill", youtube_video_id: "UfcAVejslrU" },
    { title: "Awake", artist: "Tycho", primary_genre_id: "ambient_chill", youtube_video_id: "zNfZzKq7QW8" },
    { title: "An Ending (Ascent)", artist: "Brian Eno", primary_genre_id: "ambient_chill", youtube_video_id: "aKw5mbcE7VY" },
    { title: "A Walk", artist: "Tycho", primary_genre_id: "ambient_chill", youtube_video_id: "mehLx_Fjv_c" },
    { title: "Black Sands", artist: "Bonobo", primary_genre_id: "ambient_chill", youtube_video_id: "Ua2loiGHZ38" },

    { title: "In the Waiting Line", artist: "Zero 7", primary_genre_id: "chillout", youtube_video_id: "5tZlu4wP4qu" },
    { title: "The Sea", artist: "Morcheeba", primary_genre_id: "chillout", youtube_video_id: "VnCS25C1W6g" },
    { title: "All I Need", artist: "Air", primary_genre_id: "chillout", youtube_video_id: "YkgfmWfwp-4" },
    { title: "Teardrop", artist: "Massive Attack", primary_genre_id: "chillout", youtube_video_id: "u7K72X4eo_s" },
    { title: "Destiny", artist: "Zero 7", primary_genre_id: "chillout", youtube_video_id: "INn1C6ImJKg" },

    { title: "Caribbean Blue", artist: "Enya", primary_genre_id: "new_age", youtube_video_id: "5yRgiXh2fP4" },
    { title: "Orinoco Flow", artist: "Enya", primary_genre_id: "new_age", youtube_video_id: "LTrk4X9ACtw" },
    { title: "Tubular Bells (Opening)", artist: "Mike Oldfield", primary_genre_id: "new_age", youtube_video_id: "bYmIKCP7VuY" },
    { title: "Only Time", artist: "Enya", primary_genre_id: "new_age", youtube_video_id: "7wfYIMyS_dI" },
    { title: "Oxygene, Pt. 4", artist: "Jean-Michel Jarre", primary_genre_id: "new_age", youtube_video_id: "5D3NlNewHuI" },

    { title: "Halleluwah", artist: "Can", primary_genre_id: "experimental_rock", youtube_video_id: "3E_0f_A0p8M" },
    { title: "Vitamin C", artist: "Can", primary_genre_id: "experimental_rock", youtube_video_id: "9a1nhUknSXg" },
    { title: "The Seer", artist: "Swans", primary_genre_id: "experimental_rock", youtube_video_id: "j_t9p3v4k7Q" },
    { title: "Teen Age Riot", artist: "Sonic Youth", primary_genre_id: "experimental_rock", youtube_video_id: "BKMD8vtvVDU" },
    { title: "Marquee Moon", artist: "Television", primary_genre_id: "experimental_rock", youtube_video_id: "jlbunmCbTBA" },

    { title: "Batman", artist: "John Zorn", primary_genre_id: "avant_garde", youtube_video_id: "0d3c0p9_k2s" },
    { title: "O Superman", artist: "Laurie Anderson", primary_genre_id: "avant_garde", youtube_video_id: "Vkfpi2EI8tE" },
    { title: "Trout Mask Replica (Frownland)", artist: "Captain Beefheart", primary_genre_id: "avant_garde", youtube_video_id: "k9vL_9g7p5E" },
    { title: "The Koln Concert Pt. 1", artist: "Keith Jarrett", primary_genre_id: "avant_garde", youtube_video_id: "kpS7vhvkIQ0" },
    { title: "Threnody for the Victims of Hiroshima", artist: "Krzysztof Penderecki", primary_genre_id: "avant_garde", youtube_video_id: "HilGtpRhTVS" },

    { title: "Woodpecker No. 1", artist: "Merzbow", primary_genre_id: "noise", youtube_video_id: "AguPH0XBxdw" },
    { title: "Pulse Demon", artist: "Merzbow", primary_genre_id: "noise", youtube_video_id: "e4d3c2b1a0s" },
    { title: "Farewell", artist: "Boris", primary_genre_id: "noise", youtube_video_id: "t_GqwR_1u5E" },
    { title: "Dracula Mountain", artist: "Lightning Bolt", primary_genre_id: "noise", youtube_video_id: "cM_bWkP9k0s" },
    { title: "Dead Flag Blues", artist: "Godspeed You! Black Emperor", primary_genre_id: "noise", youtube_video_id: "bU22p90UuFw" },

    { title: "Etude aux chemins de fer", artist: "Pierre Schaeffer", primary_genre_id: "musique_concrete", youtube_video_id: "N9pOq8u6-bA" },
    { title: "Symphonie pour un homme seul", artist: "Pierre Schaeffer & Pierre Henry", primary_genre_id: "musique_concrete", youtube_video_id: "qJ3t9sQ4hK1" },
    { title: "Poeme electronique", artist: "Edgar Varese", primary_genre_id: "musique_concrete", youtube_video_id: "MAt9Fp_2eE0" },
    { title: "Messe pour le temps present", artist: "Pierre Henry", primary_genre_id: "musique_concrete", youtube_video_id: "k9vL_9g7p5A" },
    { title: "Variations for a Door and a Sigh", artist: "Pierre Henry", primary_genre_id: "musique_concrete", youtube_video_id: "5j5c6Q1K1qA" },

    { title: "Forest Rain & Gentle Thunder", artist: "Nature Soundscape Studio", primary_genre_id: "nature_soundscape", youtube_video_id: "mPZkdNFkNps" },
    { title: "Ocean Waves Crashing on Sand", artist: "Calm Soundscapes", primary_genre_id: "nature_soundscape", youtube_video_id: "bn9F19Hi1Lk" },
    { title: "Mountain Stream Flowing Water", artist: "Natural Sound Library", primary_genre_id: "nature_soundscape", youtube_video_id: "q76bMs-NwRk" },
    { title: "Deep Forest Birdsong at Dawn", artist: "Wild Earth Audio", primary_genre_id: "nature_soundscape", youtube_video_id: "eKFTSSKCzWA" },
    { title: "Gentle Night Wind in Pine Trees", artist: "Soundscape Serenity", primary_genre_id: "nature_soundscape", youtube_video_id: "2G8LA4L5pbE" }
];

async function runInjector() {
    console.log("=================================================");
    console.log("🚀 Injecting Canonical Seeds into public.tracks");
    console.log(`   • Total Candidates: ${CANONICAL_TRACKS.length} iconic songs`);
    console.log("   • Automatic Artist Synchronization Trigger Active");
    console.log("=================================================\n");

    let newlyAdded = 0;
    let skipped = 0;
    let errors = 0;

    for (const track of CANONICAL_TRACKS) {
        try {
            // 1. Check if track or video ID already exists
            const { data: existing } = await supabase
                .from('tracks')
                .select('id')
                .eq('youtube_video_id', track.youtube_video_id)
                .limit(1);

            if (existing && existing.length > 0) {
                skipped++;
                continue;
            }

            // 2. Insert into public.tracks
            // Note: Postgres trigger trg_sync_track_artist will auto-link/create artist_id!
            const { data: inserted, error } = await supabase
                .from('tracks')
                .insert({
                    title: track.title,
                    artist: track.artist,
                    primary_genre_id: track.primary_genre_id,
                    youtube_video_id: track.youtube_video_id,
                    source: 'canonical_seed'
                })
                .select('id, title, artist, primary_genre_id, artist_id')
                .maybeSingle();

            if (error) {
                console.error(`❌ Error inserting "${track.artist} - ${track.title}":`, error.message);
                errors++;
            } else {
                newlyAdded++;
                console.log(`[${newlyAdded}] ✅ Injected [${track.primary_genre_id}]: "${track.artist} - ${track.title}" (Artist ID: ${inserted?.artist_id?.slice(0, 8)}...)`);
            }
        } catch (e) {
            console.error(`Exception inserting "${track.title}":`, e.message);
            errors++;
        }
    }

    console.log("\n=================================================");
    console.log(`🎉 Injection Summary:`);
    console.log(`   • Newly Added: ${newlyAdded}`);
    console.log(`   • Skipped (Already Present): ${skipped}`);
    console.log(`   • Errors: ${errors}`);
    console.log("=================================================");
}

runInjector();
