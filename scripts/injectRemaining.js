import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wgrucrcdcpgvnxduftow.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LLIcnNawT3dcqz7k7ZkBVA_f5oxMIy6';

const supabase = createClient(supabaseUrl, supabaseKey);

const REMAINING_CANONICAL_TRACKS = [
    // funk
    { title: "Get Up (I Feel Like Being a) Sex Machine", artist: "James Brown", primary_genre_id: "funk", youtube_video_id: "1UzZsGQFTao" },
    { title: "September", artist: "Earth, Wind & Fire", primary_genre_id: "funk", youtube_video_id: "Gs069dnd6ML" },
    { title: "Cissy Strut", artist: "The Meters", primary_genre_id: "funk", youtube_video_id: "4_iC0MyIykM" },
    { title: "Jungle Boogie", artist: "Kool & The Gang", primary_genre_id: "funk", youtube_video_id: "QHGOO73Gxg4" },
    { title: "Superstition", artist: "Stevie Wonder", primary_genre_id: "funk", youtube_video_id: "ftdZ363NxUw" },

    // synth_pop
    { title: "Enjoy the Silence", artist: "Depeche Mode", primary_genre_id: "synth_pop", youtube_video_id: "aGSKrC7dVDY" },
    { title: "Bizarre Love Triangle", artist: "New Order", primary_genre_id: "synth_pop", youtube_video_id: "7uEBuqkkQRk" },
    { title: "Everybody Wants to Rule the World", artist: "Tears for Fears", primary_genre_id: "synth_pop", youtube_video_id: "aGCdLKXNF3w" },
    { title: "West End Girls", artist: "Pet Shop Boys", primary_genre_id: "synth_pop", youtube_video_id: "p3j2NYZ8FKs" },
    { title: "Sweet Dreams (Are Made of This)", artist: "Eurythmics", primary_genre_id: "synth_pop", youtube_video_id: "qeMFqkcPYcg" },

    // soul_funk
    { title: "Sir Duke", artist: "Stevie Wonder", primary_genre_id: "soul_funk", youtube_video_id: "6sIjSNTSbfc" },
    { title: "Let's Groove", artist: "Earth, Wind & Fire", primary_genre_id: "soul_funk", youtube_video_id: "lr_tED8fTXg" },
    { title: "Ain't Nobody", artist: "Chaka Khan", primary_genre_id: "soul_funk", youtube_video_id: "SvPZo52X5vo" },
    { title: "Brick House", artist: "Commodores", primary_genre_id: "soul_funk", youtube_video_id: "rrBx6mAW3Zg" },
    { title: "Give It to Me Baby", artist: "Rick James", primary_genre_id: "soul_funk", youtube_video_id: "1dNIQVYOrTw" },

    // chill
    { title: "Coastal Brake", artist: "Tycho", primary_genre_id: "chill", youtube_video_id: "qAhnCvo_U1o" },
    { title: "Kiara", artist: "Bonobo", primary_genre_id: "chill", youtube_video_id: "xW_nNqRkX5c" },
    { title: "Soon It Will Be Cold Enough", artist: "Emancipator", primary_genre_id: "chill", youtube_video_id: "xQ4FFp6Q1_0" },
    { title: "Dayvan Cowboy", artist: "Boards of Canada", primary_genre_id: "chill", youtube_video_id: "A2zKARkpDW4" },
    { title: "Aruarian Dance", artist: "Nujabes", primary_genre_id: "chill", youtube_video_id: "TYRDgd3Tb44" },

    // world_reggae
    { title: "Could You Be Loved", artist: "Bob Marley & The Wailers", primary_genre_id: "world_reggae", youtube_video_id: "Mm7UJMZ3f7w" },
    { title: "Me Gustas Tu", artist: "Manu Chao", primary_genre_id: "world_reggae", youtube_video_id: "mzgjiPBCxfg" },
    { title: "Veinte Anos", artist: "Buena Vista Social Club", primary_genre_id: "world_reggae", youtube_video_id: "eP2r41G5L5s" },
    { title: "Shakara", artist: "Fela Kuti", primary_genre_id: "world_reggae", youtube_video_id: "7_bH4w7T8cQ" },
    { title: "Besame Mucho", artist: "Cesaria Evora", primary_genre_id: "world_reggae", youtube_video_id: "Yf9z4m2JpKo" },

    // bossa_nova_jazz
    { title: "Doralice", artist: "Stan Getz & Joao Gilberto", primary_genre_id: "bossa_nova_jazz", youtube_video_id: "3eR2e0Z8s6M" },
    { title: "Wave", artist: "Antonio Carlos Jobim", primary_genre_id: "bossa_nova_jazz", youtube_video_id: "q1A_9tY_5qg" },
    { title: "Bossa Antigua", artist: "Paul Desmond", primary_genre_id: "bossa_nova_jazz", youtube_video_id: "9mQ_pQZ2W9o" },
    { title: "O Pato", artist: "Charlie Byrd", primary_genre_id: "bossa_nova_jazz", youtube_video_id: "7_w_k2l_PBo" },
    { title: "Vivo Sonhando", artist: "Stan Getz", primary_genre_id: "bossa_nova_jazz", youtube_video_id: "v7X_9w0c2Ls" },

    // rnb_soul
    { title: "Ain't No Mountain High Enough", artist: "Marvin Gaye & Tammi Terrell", primary_genre_id: "rnb_soul", youtube_video_id: "ABfQuZqq8wg" },
    { title: "I Wanna Dance with Somebody", artist: "Whitney Houston", primary_genre_id: "rnb_soul", youtube_video_id: "eH3giaIzONA" },
    { title: "I Wish", artist: "Stevie Wonder", primary_genre_id: "rnb_soul", youtube_video_id: "hYKYka-PNt0" },
    { title: "Georgia on My Mind", artist: "Ray Charles", primary_genre_id: "rnb_soul", youtube_video_id: "fRgWBN8yt_U" },
    { title: "My Girl", artist: "The Temptations", primary_genre_id: "rnb_soul", youtube_video_id: "6IUG-9jZd-g" },

    // contemporary_folk
    { title: "Mykonos", artist: "Fleet Foxes", primary_genre_id: "contemporary_folk", youtube_video_id: "DT-dxG4WWhm" },
    { title: "Mystery of Love", artist: "Sufjan Stevens", primary_genre_id: "contemporary_folk", youtube_video_id: "KzV4o9G9Vw8" },
    { title: "Naked as We Came", artist: "Iron & Wine", primary_genre_id: "contemporary_folk", youtube_video_id: "g6w6a_4Vb9Q" },
    { title: "The Gardener", artist: "The Tallest Man on Earth", primary_genre_id: "contemporary_folk", youtube_video_id: "M5DyC941RUM" },
    { title: "Ghosts", artist: "Laura Marling", primary_genre_id: "contemporary_folk", youtube_video_id: "1G3_9c8F3vE" },

    // avant_jazz
    { title: "A Love Supreme, Pt. 1: Acknowledgement", artist: "John Coltrane", primary_genre_id: "avant_jazz", youtube_video_id: "ll3CMgiUPuU" },
    { title: "Free Jazz (Part 1)", artist: "Ornette Coleman", primary_genre_id: "avant_jazz", youtube_video_id: "xbZIbSTbr30" },
    { title: "Love in Outer Space", artist: "Sun Ra", primary_genre_id: "avant_jazz", youtube_video_id: "w2_L9w3p7bY" },
    { title: "Composition 40B", artist: "Anthony Braxton", primary_genre_id: "avant_jazz", youtube_video_id: "5k9_3p7l2Bo" },
    { title: "The Creator Has a Master Plan", artist: "Pharoah Sanders", primary_genre_id: "avant_jazz", youtube_video_id: "N7aU3a4vY5o" }
];

async function runRemaining() {
    console.log(`🚀 Injecting remaining ${REMAINING_CANONICAL_TRACKS.length} canonical tracks...`);
    let added = 0;
    for (const track of REMAINING_CANONICAL_TRACKS) {
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
    console.log(`Finished injecting ${added} tracks.`);
}

runRemaining();
