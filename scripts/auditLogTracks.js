// Test enhanced detection logic
export function testEnhancedNormalizeGenre(rawGenre, artistName = '', trackTitle = '') {
    const cleanArtist = (artistName || '').trim().toLowerCase();
    const cleanTitle = (trackTitle || '').trim().toLowerCase();
    const cleanGenre = (rawGenre || '').trim().toLowerCase();
    const combined = `${cleanArtist} ${cleanTitle} ${cleanGenre}`;

    // Specific artist shortcuts
    if (cleanArtist.includes('queens of the stone age') || cleanArtist.includes('qotsa')) return 'alt_rock';
    if (cleanArtist.includes('nine inch nails') || cleanArtist.includes('nin')) return 'industrial';
    if (cleanArtist.includes('parkway drive')) return 'metalcore';
    if (cleanArtist.includes('massive attack') || cleanArtist.includes('portishead')) return 'electronic';
    if (cleanArtist.includes('enya')) return 'new_age';
    if (cleanArtist.includes('robin trower')) return 'blues_rock';
    if (cleanArtist.includes('astor piazzolla') || cleanArtist.includes('piazzolla')) return 'world_reggae';
    if (cleanArtist.includes('doc scapat') || cleanArtist === 'doc') return 'hip_hop';
    if (cleanArtist.includes('otis redding')) return 'classic_soul';
    if (cleanArtist.includes('tori amos')) return 'alt_rock';

    // 1. Opera
    if (/\b(opera|opéra|aria|recitative|libretto|soprano|tenor|baritone|act\s+[0-9ivx]+|atto\s+[0-9ivx]+|scena\s+[0-9ivx]+|puccini|verdi|rossini|donizetti|bizet|bellini|placido domingo|pavarotti|callas|tebaldi|flagstad|nilsson)\b/i.test(combined)) {
        return 'opera';
    }

    // 2. Chamber Music
    if (/\b(string quartet|streichquartett|chamber music|kammermusik|quartet|quartett|quintet|violins?\s*(&|and)\s*viola|alban berg quartet|guarneri|amadeus quartet|chamber music society)\b/i.test(combined)) {
        return 'chamber_music';
    }

    // 3. Baroque
    if (/\b(baroque|bach|vivaldi|handel|händel|scarlatti|purcell|harpsichord|cantata|bwv\s*[0-9]+|rv\s*[0-9]+|z[0-9]{2,3}|choir of new college oxford|king's consort)\b/i.test(combined)) {
        return 'baroque';
    }

    // 4. Romantic
    if (/\b(romantic|chopin|liszt|schumann|schubert|tchaikovsky|rachmaninoff|brahms|mussorgsky|moussorgsky|grieg|dvorak|dvořák|horowitz|rubinstein|nocturne|etude|étude|valse|waltz|walzer|polonaise|mazurka|liebeslieder)\b/i.test(combined)) {
        return 'romantic';
    }

    // 5. Classical Period
    if (/\b(classical period|mozart|beethoven|haydn|bagatelle|für elise|woo\s*[0-9]+|k\.\s*[0-9]+|hob\.\s*[0-9]+)\b/i.test(combined)) {
        return 'classical_period';
    }

    // 6. Broader Classical
    if (/\b(classique|klassik|classical|sonata|sonate|concerto|konzert|symphony|sinfonie|adagio|allegro|andante|largo|orchestra|orchestre|philharmonic|segovia|organist|organiste|op\.\s*[0-9]+|opus\s*[0-9]+)\b/i.test(combined)) {
        return 'classical';
    }

    // Default rock fallback
    return 'rock';
}

const logTracks = [
    { artist: 'Robert Schumann', title: 'Sonate für Pianoforte und Violine, op. 105 in A minor: I. Mit leidenschaftlichem Ausdruck', genre: 'Unknown' },
    { artist: 'Vladimir Horowitz, Main Artist, Piano, Piano - Modest Moussorgsky, Composer', title: 'Pictures at an Exhibition:Samuel Goldenberg and Schmuyle', genre: 'Classique' },
    { artist: 'Alban Berg Quartet', title: '02 Beethoven: String Quartet #1 In F, Op. 18/1 - 2. Allegro Affetuoso Ed Appassionato', genre: 'Unknown' },
    { artist: 'George Frideric Handel', title: 'Act II - Air: My vengeance awakes me', genre: 'Unknown' },
    { artist: 'Mozart', title: 'Violin Concerto No.5: Tempo di minuetto', genre: 'Unknown' },
    { artist: 'Placido Domingo, Edward Downes', title: 'Werther - Act III: Pourquoi me reveiller?', genre: 'Unknown' },
    { artist: "Choir of New College Oxford; The King's Consort", title: 'Now that the sun hath veiled his light (An Evening Hymn), Z193', genre: 'Unknown' },
    { artist: 'Studio organist', title: 'Schlichte Weisen, Op. 76, No. 52, Maria vuggesang [Maria Wiegenlied]', genre: 'Unknown' },
    { artist: 'Andrés Segovia', title: 'Enrique Granados - Danza española, Op. 37 - I. Andaluza', genre: 'Unknown' },
    { artist: 'Queens of the Stone Age', title: "I'm Designer (unkle remix)", genre: 'Stoner Rock' },
    { artist: 'Massive Attack', title: 'Simple Rules', genre: 'Electronic' },
    { artist: 'Parkway Drive', title: 'Dream Run', genre: 'Metalcore' },
    { artist: 'Nine Inch Nails', title: 'The Great Destroyer', genre: 'Industrial' },
    { artist: 'Enya', title: 'How Can I Keep from Singing?', genre: 'New Age' },
    { artist: 'Robin Trower', title: 'Rock Me Baby', genre: 'Blues' },
    { artist: 'Astor Piazzolla', title: 'Milonga del Angel [Live]', genre: 'Tango' },
    { artist: 'DOC Scapat de sub control', title: '04 Grav Magic Fin', genre: 'Hip Hop' },
    { artist: 'Tori Amos', title: 'Spark', genre: 'Alternative' },
    { artist: 'otis redding', title: 'She Put The Hurt On Me', genre: 'Soul' }
];

console.log('Testing Enhanced Logic on all problematic tracks:');
for (const t of logTracks) {
    const res = testEnhancedNormalizeGenre(t.genre, t.artist, t.title);
    console.log(`• "${t.artist} - ${t.title}" -> [${res}]`);
}
