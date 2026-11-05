import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';

const supabase = createClient(supabaseUrl, supabaseKey);

const TOP_UP_TRACKS = [
    // acoustic_folk (needs 4)
    { title: "Helplessness Blues", artist: "Fleet Foxes", primary_genre_id: "acoustic_folk", youtube_video_id: "6mR8Z-gmK1k" },
    { title: "Stubborn Love", artist: "The Lumineers", primary_genre_id: "acoustic_folk", youtube_video_id: "u3S_k3L0o9A" },
    { title: "Amsterdam", artist: "Gregory Alan Isakov", primary_genre_id: "acoustic_folk", youtube_video_id: "tV2YjO2Fz00" },
    { title: "Should Have Known Better", artist: "Sufjan Stevens", primary_genre_id: "acoustic_folk", youtube_video_id: "lJJT00wqlOo" },

    // bebop_jazz (needs 4)
    { title: "Ornithology", artist: "Charlie Parker", primary_genre_id: "bebop_jazz", youtube_video_id: "fs4jL8nBflY" },
    { title: "Round Midnight", artist: "Thelonious Monk", primary_genre_id: "bebop_jazz", youtube_video_id: "-yg7aZWCyS8" },
    { title: "A Night in Tunisia", artist: "Dizzy Gillespie", primary_genre_id: "bebop_jazz", youtube_video_id: "gfkgA4wN_sU" },
    { title: "Ko-Ko", artist: "Charlie Parker & Dizzy Gillespie", primary_genre_id: "bebop_jazz", youtube_video_id: "4p0gnvdhC2Q" },

    // chamber_music (needs 4)
    { title: "Death and the Maiden (String Quartet No. 14)", artist: "Franz Schubert", primary_genre_id: "chamber_music", youtube_video_id: "z_qM8aZ3v9M" },
    { title: "String Quartet No. 14 in C-sharp Minor, Op. 131", artist: "Ludwig van Beethoven", primary_genre_id: "chamber_music", youtube_video_id: "5k9_3p7l2B0" },
    { title: "Piano Quintet in F Minor, Op. 34", artist: "Johannes Brahms", primary_genre_id: "chamber_music", youtube_video_id: "x9U_vA2F4j0" },
    { title: "String Quartet No. 12 'American'", artist: "Antonin Dvorak", primary_genre_id: "chamber_music", youtube_video_id: "dnlr_Xw68U0" },

    // chicago_blues (needs 4)
    { title: "Mannish Boy", artist: "Muddy Waters", primary_genre_id: "chicago_blues", youtube_video_id: "bSfqNEvykv0" },
    { title: "Smokestack Lightnin'", artist: "Howlin' Wolf", primary_genre_id: "chicago_blues", youtube_video_id: "KMqTa_W_194" },
    { title: "Damn Right, I've Got the Blues", artist: "Buddy Guy", primary_genre_id: "chicago_blues", youtube_video_id: "k_k8p7Q3m9A" },
    { title: "Juke", artist: "Little Walter", primary_genre_id: "chicago_blues", youtube_video_id: "0d8Z3L3l4s1" },

    // conscious_hiphop (needs 4)
    { title: "Mathematics", artist: "Mos Def", primary_genre_id: "conscious_hiphop", youtube_video_id: "m5vw4ccnW54" },
    { title: "I Used to Love H.E.R.", artist: "Common", primary_genre_id: "conscious_hiphop", youtube_video_id: "C99iG4HoO1c" },
    { title: "Get By", artist: "Talib Kweli", primary_genre_id: "conscious_hiphop", youtube_video_id: "UVtpXvBWJZ8" },
    { title: "Sing About Me, I'm Dying of Thirst", artist: "Kendrick Lamar", primary_genre_id: "conscious_hiphop", youtube_video_id: "Z51bJ_26n-U" },

    // cool_jazz (needs 4)
    { title: "So What", artist: "Miles Davis", primary_genre_id: "cool_jazz", youtube_video_id: "ylXk1LbvPbU" },
    { title: "Take Five", artist: "Dave Brubeck", primary_genre_id: "cool_jazz", youtube_video_id: "tT9Eh8wNMmc" },
    { title: "My Funny Valentine", artist: "Chet Baker", primary_genre_id: "cool_jazz", youtube_video_id: "jvXywhJ9upw" },
    { title: "Waltz for Debby", artist: "Bill Evans", primary_genre_id: "cool_jazz", youtube_video_id: "dH3GSrPpXtA" },

    // delta_blues (needs 4)
    { title: "Cross Road Blues", artist: "Robert Johnson", primary_genre_id: "delta_blues", youtube_video_id: "Yd60nI43AAw" },
    { title: "Sweet Home Chicago", artist: "Robert Johnson", primary_genre_id: "delta_blues", youtube_video_id: "O8hqGu-leFc" },
    { title: "Death Letter Blues", artist: "Son House", primary_genre_id: "delta_blues", youtube_video_id: "QA8-DYm0Kk8" },
    { title: "Pony Blues", artist: "Charley Patton", primary_genre_id: "delta_blues", youtube_video_id: "v-Su1YXQYe0" },

    // electric_blues (needs 4)
    { title: "The Thrill Is Gone", artist: "B.B. King", primary_genre_id: "electric_blues", youtube_video_id: "oica5jG7FpU" },
    { title: "Texas Flood", artist: "Stevie Ray Vaughan", primary_genre_id: "electric_blues", youtube_video_id: "wVjdMLAMbM0" },
    { title: "Born Under a Bad Sign", artist: "Albert King", primary_genre_id: "electric_blues", youtube_video_id: "2Py37G9vR4U" },
    { title: "Have You Ever Loved a Woman", artist: "Freddie King", primary_genre_id: "electric_blues", youtube_video_id: "G0H_z0K0PPo" },

    // industrial (needs 4)
    { title: "Head Like a Hole", artist: "Nine Inch Nails", primary_genre_id: "industrial", youtube_video_id: "ao-SayvcfhQ" },
    { title: "Jesus Built My Hotrod", artist: "Ministry", primary_genre_id: "industrial", youtube_video_id: "f4t_k8m_2wE" },
    { title: "Worlock", artist: "Skinny Puppy", primary_genre_id: "industrial", youtube_video_id: "LhJ3L_s982A" },
    { title: "Headhunter", artist: "Front 242", primary_genre_id: "industrial", youtube_video_id: "lPpUFBVSyGQ" },

    // singer_songwriter (needs 4)
    { title: "A Case of You", artist: "Joni Mitchell", primary_genre_id: "singer_songwriter", youtube_video_id: "0Yqf8vO6h44" },
    { title: "Pink Moon", artist: "Nick Drake", primary_genre_id: "singer_songwriter", youtube_video_id: "3sQv04CFed4" },
    { title: "Between the Bars", artist: "Elliott Smith", primary_genre_id: "singer_songwriter", youtube_video_id: "hPD-a1FjUtU" },
    { title: "Suzanne", artist: "Leonard Cohen", primary_genre_id: "singer_songwriter", youtube_video_id: "svitEEpI07E" },

    // baroque (needs 3)
    { title: "Toccata and Fugue in D Minor", artist: "Johann Sebastian Bach", primary_genre_id: "baroque", youtube_video_id: "ho9rZjlsyYY" },
    { title: "Four Seasons: Spring", artist: "Antonio Vivaldi", primary_genre_id: "baroque", youtube_video_id: "GRxofEmo3HA" },
    { title: "Air on the G String", artist: "Johann Sebastian Bach", primary_genre_id: "baroque", youtube_video_id: "E2j-frfK_2I" },

    // indie_rock (needs 3)
    { title: "Do I Wanna Know?", artist: "Arctic Monkeys", primary_genre_id: "indie_rock", youtube_video_id: "bpOSxM0rNPM" },
    { title: "Reptilia", artist: "The Strokes", primary_genre_id: "indie_rock", youtube_video_id: "b8-t4LD28eU" },
    { title: "Obstacle 1", artist: "Interpol", primary_genre_id: "indie_rock", youtube_video_id: "jkBAUqr61XY" },

    // jazz_fusion (needs 3)
    { title: "Chameleon", artist: "Herbie Hancock", primary_genre_id: "jazz_fusion", youtube_video_id: "UbkqE4fpvdI" },
    { title: "Birdland", artist: "Weather Report", primary_genre_id: "jazz_fusion", youtube_video_id: "Ae0nwSv6cTU" },
    { title: "Birds of Fire", artist: "Mahavishnu Orchestra", primary_genre_id: "jazz_fusion", youtube_video_id: "8n20b4aV8c4" },

    // romantic (needs 3)
    { title: "Nocturne in E-flat Major, Op. 9 No. 2", artist: "Frederic Chopin", primary_genre_id: "romantic", youtube_video_id: "9E6b3swbnWg" },
    { title: "Swan Lake: Scene", artist: "Pyotr Ilyich Tchaikovsky", primary_genre_id: "romantic", youtube_video_id: "9rJoB7y6Ncs" },
    { title: "Hungarian Dance No. 5", artist: "Johannes Brahms", primary_genre_id: "romantic", youtube_video_id: "Nzo3atXtm54" },

    // lofi_hiphop (needs 2)
    { title: "Affection", artist: "Jinsang", primary_genre_id: "lofi_hiphop", youtube_video_id: "W6YKP354aY4" },
    { title: "i'm closing my eyes", artist: "potsu", primary_genre_id: "lofi_hiphop", youtube_video_id: "pSUnvSCSvH0" },

    // noise (needs 1)
    { title: "The Metal East", artist: "Lightning Bolt", primary_genre_id: "noise", youtube_video_id: "-Hn_k_0q2Ao" }
];

async function runTopUp() {
    console.log(`🚀 Topping up remaining 16 categories to ensure ≥ 5 tracks per category...`);
    let added = 0;
    for (const track of TOP_UP_TRACKS) {
        // Check if video ID already exists
        const { data: existing } = await supabase
            .from('tracks')
            .select('id')
            .eq('youtube_video_id', track.youtube_video_id)
            .limit(1);

        if (existing && existing.length > 0) continue;

        const { error } = await supabase.from('tracks').insert({
            title: track.title,
            artist: track.artist,
            primary_genre_id: track.primary_genre_id,
            youtube_video_id: track.youtube_video_id,
            source: 'canonical_seed'
        });

        if (!error) {
            added++;
            console.log(`[${added}] ✅ Injected [${track.primary_genre_id}]: "${track.artist} - ${track.title}"`);
        } else {
            console.error(`❌ Error on ${track.title}:`, error.message);
        }
    }
    console.log(`Done! Added ${added} tracks.`);
}

runTopUp();
