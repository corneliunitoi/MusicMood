/**
 * jitEngine.js
 * 
 * Just-In-Time (JIT) Genre Sourcing & Organic Catalog Expansion Engine.
 * 
 * Automatically monitors the player queue buffer for the active genre.
 * Proactively pulls, verifies, and resolves new tracks inside the same genre:
 *   1. Curated Local Archive (public.local_metadata)
 *   2. MusicBrainz Authority Recordings (public MetaBrainz API)
 * 
 * Newly resolved tracks are permanently committed to public.tracks (source: 'jit_player_expansion'),
 * expanding the database organically as users listen.
 */

import { supabase } from './supabaseService.js';
import { isSongCandidate } from './genreNormalizer.js';
import { GENRE_NODES } from './tasteGraph.js';
import { fetchMusicBrainzGenreRecordings } from './musicBrainzService.js';

// Map 115 taxonomy IDs to MusicBrainz query tags
const GENRE_MB_TAGS = {
    rock: 'rock', classic_rock: 'classic rock', alt_rock: 'alternative rock',
    indie_rock: 'indie rock', hard_rock: 'hard rock', punk_rock: 'punk rock',
    post_punk: 'post-punk', prog_rock: 'progressive rock', psychedelic_rock: 'psychedelic rock',
    grunge: 'grunge', post_rock: 'post-rock', math_rock: 'math rock', shoegaze: 'shoegaze',
    garage_rock: 'garage rock', metal: 'metal', heavy_metal: 'heavy metal',
    thrash_metal: 'thrash metal', death_metal: 'death metal', black_metal: 'black metal',
    doom_metal: 'doom metal', prog_metal: 'progressive metal', power_metal: 'power metal',
    symphonic_metal: 'symphonic metal', nu_metal: 'nu metal', metalcore: 'metalcore',
    electronic: 'electronic', techno: 'techno', house: 'house', trance: 'trance',
    drum_and_bass: 'drum and bass', darksynth: 'darksynth', synthwave: 'synthwave',
    dubstep: 'dubstep', idm: 'idm', ambient_electronic: 'ambient techno',
    edm_mainstream: 'edm', pop: 'pop', synth_pop: 'synthpop', dance_pop: 'dance-pop',
    indie_pop: 'indie pop', art_pop: 'art pop', mainstream_pop: 'pop', traditional_pop: 'traditional pop',
    hip_hop: 'hip hop', boom_bap: 'boom bap', lofi_hiphop: 'lo-fi hip hop',
    conscious_hiphop: 'conscious hip hop', trap_modern: 'trap', uk_drill: 'drill',
    rnb_soul: 'soul', funk: 'funk', classic_soul: 'soul', motown: 'motown', neo_soul: 'neo-soul',
    quiet_storm: 'quiet storm', jazz: 'jazz', bebop_jazz: 'bebop', hard_bop: 'hard bop',
    cool_jazz: 'cool jazz', modal_jazz: 'modal jazz', free_jazz: 'free jazz',
    bossa_nova_jazz: 'bossa nova', fusion_jazz: 'jazz fusion', smooth_jazz: 'smooth jazz',
    big_band: 'big band', blues: 'blues', delta_blues: 'delta blues', chicago_blues: 'chicago blues',
    electric_blues: 'electric blues', blues_rock: 'blues rock', soul_blues: 'soul blues',
    classical: 'classical', baroque: 'baroque', classical_period: 'classical period',
    romantic: 'romantic classical', neo_classical: 'neoclassical', opera: 'opera',
    chamber_music: 'chamber music', contemporary_classical: 'contemporary classical',
    cinematic_orchestral: 'soundtrack', folk_acoustic: 'folk', traditional_folk: 'traditional folk',
    contemporary_folk: 'contemporary folk', indie_folk: 'indie folk', celtic_folk: 'celtic',
    bluegrass: 'bluegrass', singer_songwriter: 'singer-songwriter', country: 'country',
    classic_country: 'classic country', outlaw_country: 'outlaw country', alt_country: 'alt-country',
    americana: 'americana', contemporary_country: 'country', world_reggae: 'reggae',
    roots_reggae: 'roots reggae', dub: 'dub', ska: 'ska', afrobeat: 'afrobeat',
    salsa: 'salsa', bossa_nova: 'bossa nova', flamenco: 'flamenco', ambient_chill: 'ambient',
    ambient: 'ambient', chillout: 'chillout', new_age: 'new age', industrial: 'industrial',
    noise: 'noise', avant_garde: 'avant-garde', experimental_rock: 'experimental rock'
};

class JitEngine {
    constructor() {
        this.isBuffering = false;
        this.inFlightPull = false;
        this.recentJitIds = new Set();
    }

    /**
     * Replenishes the sessionEngine queue with tracks from the active genre in the background.
     */
    async replenishBuffer(genreId, sessionEngine, targetQueueSize = 3) {
        if (!genreId || !sessionEngine) return;
        if (this.isBuffering) return;

        // Count how many tracks in sessionEngine.queue match this genre
        const currentCount = (sessionEngine.queue || []).filter(t => t.genre === genreId).length;
        if (currentCount >= targetQueueSize) return;

        this.isBuffering = true;
        try {
            const needed = targetQueueSize - currentCount;
            for (let i = 0; i < Math.min(needed, 2); i++) {
                const track = await this.pullTrackForGenre(genreId, sessionEngine);
                if (track && sessionEngine.passesGuards(track)) {
                    sessionEngine.queue.push(track);
                    sessionEngine.notify();
                    console.log(`[JIT Buffer ⚡] Queued track for "${genreId}": "${track.artist} - ${track.title}" (Queue size: ${sessionEngine.queue.length})`);
                }
            }
        } catch (e) {
            console.warn('[JIT Engine] Replenish buffer error:', e);
        } finally {
            this.isBuffering = false;
        }
    }

    /**
     * Resolves and pulls a single verified track for genreId, inserting it into public.tracks.
     */
    async pullTrackForGenre(genreId, sessionEngine) {
        if (this.inFlightPull) return null;
        this.inFlightPull = true;

        try {
            // Stage 1: Curated Local Archive (public.local_metadata)
            const localCandidate = await this.pullFromLocalArchive(genreId, sessionEngine);
            if (localCandidate) return localCandidate;

            // Stage 2: MusicBrainz Authority Sourcing
            const mbCandidate = await this.pullFromMusicBrainz(genreId, sessionEngine);
            if (mbCandidate) return mbCandidate;

            return null;
        } finally {
            this.inFlightPull = false;
        }
    }

    /**
     * Pulls an unmapped song from the user's 44k curated local archive (public.local_metadata)
     */
    async pullFromLocalArchive(genreId, sessionEngine) {
        try {
            const node = GENRE_NODES[genreId];
            const searchKeyword = genreId.replace(/_/g, ' ');

            // Search local_metadata for unmapped tracks matching this genre
            let { data: candidates } = await supabase
                .from('local_metadata')
                .select('*')
                .is('youtube_video_id', null)
                .or(`genre.ilike.%${searchKeyword}%,genre.ilike.%${node?.label || ''}%`)
                .limit(20);

            // If empty, search by family group (e.g. 'Metal', 'Electronic', 'Pop')
            if (!candidates || candidates.length === 0) {
                if (node?.group) {
                    const res = await supabase
                        .from('local_metadata')
                        .select('*')
                        .is('youtube_video_id', null)
                        .ilike('genre', `%${node.group}%`)
                        .limit(20);
                    candidates = res.data;
                }
            }

            if (!candidates || candidates.length === 0) return null;

            for (const c of candidates) {
                const songCheck = isSongCandidate({ title: c.track_name, artist: c.artist });
                if (!songCheck.pass) continue;

                const aLower = (c.artist || '').toLowerCase();
                if (sessionEngine?.state?.recentArtists?.slice(-15).includes(aLower)) continue;

                // Check if already in public.tracks
                const { data: exist } = await supabase
                    .from('tracks')
                    .select('id')
                    .ilike('artist', c.artist)
                    .ilike('title', c.track_name)
                    .limit(1);

                if (exist && exist.length > 0) continue;

                // Resolve via Fast Innertube resolver (/api/resolve-track)
                const zqUrl = `/api/resolve-track?artist=${encodeURIComponent(c.artist)}&title=${encodeURIComponent(c.track_name)}`;
                const zqRes = await fetch(zqUrl);
                if (!zqRes.ok) continue;

                const zqData = await zqRes.json();
                if (!zqData.videoId || zqData.videoId.length !== 11) continue;
                if (this.recentJitIds.has(zqData.videoId)) continue;

                const healedArtist = zqData.artist || c.artist;
                const healedTitle = zqData.title || c.track_name;

                // Insert into public.tracks (Catalog grows organically!)
                const { data: inserted, error: insErr } = await supabase
                    .from('tracks')
                    .insert({
                        youtube_video_id: zqData.videoId,
                        title: healedTitle,
                        artist: healedArtist,
                        primary_genre_id: genreId,
                        secondary_genre_ids: [genreId],
                        source: 'jit_local_archive'
                    })
                    .select()
                    .single();

                if (insErr) {
                    console.warn('[JIT Engine] Insert error:', insErr.message);
                    continue;
                }

                this.recentJitIds.add(zqData.videoId);

                // Update local_metadata to prevent re-processing
                await supabase
                    .from('local_metadata')
                    .update({ youtube_video_id: zqData.videoId })
                    .eq('id', c.id);

                console.log(`[JIT Organic Discovery ⚡] Added "${healedArtist} - ${healedTitle}" to catalog (${genreId}) | Source: Local Archive`);

                return {
                    id: zqData.videoId,
                    dbId: inserted.id,
                    title: healedTitle,
                    artist: healedArtist,
                    channelTitle: healedArtist,
                    genre: genreId,
                    thumbnail: `https://i.ytimg.com/vi/${zqData.videoId}/hqdefault.jpg`,
                    source: 'jit_local_archive'
                };
            }
        } catch (e) {
            console.warn('[JIT Engine] Local archive pull exception:', e);
        }
        return null;
    }

    /**
     * Pulls canonical tracks from MusicBrainz authority for the active genre
     */
    async pullFromMusicBrainz(genreId, sessionEngine) {
        try {
            const mbTag = GENRE_MB_TAGS[genreId] || genreId.replace(/_/g, ' ');
            const recordings = await fetchMusicBrainzGenreRecordings(mbTag, 15);
            if (!recordings || recordings.length === 0) return null;

            for (const rec of recordings) {
                const aLower = (rec.artist || '').toLowerCase();
                if (sessionEngine?.state?.recentArtists?.slice(-15).includes(aLower)) continue;

                // Check if already in public.tracks
                const { data: exist } = await supabase
                    .from('tracks')
                    .select('id')
                    .ilike('artist', rec.artist)
                    .ilike('title', rec.title)
                    .limit(1);

                if (exist && exist.length > 0) continue;

                // Resolve via Fast Innertube resolver
                const zqUrl = `/api/resolve-track?artist=${encodeURIComponent(rec.artist)}&title=${encodeURIComponent(rec.title)}`;
                const zqRes = await fetch(zqUrl);
                if (!zqRes.ok) continue;

                const zqData = await zqRes.json();
                if (!zqData.videoId || zqData.videoId.length !== 11) continue;
                if (this.recentJitIds.has(zqData.videoId)) continue;

                const healedArtist = zqData.artist || rec.artist;
                const healedTitle = zqData.title || rec.title;

                // Check if videoId already exists in tracks
                const { data: existVid } = await supabase
                    .from('tracks')
                    .select('id')
                    .eq('youtube_video_id', zqData.videoId)
                    .limit(1);

                if (existVid && existVid.length > 0) continue;

                // Insert into public.tracks (Catalog grows organically!)
                const { data: inserted, error: insErr } = await supabase
                    .from('tracks')
                    .insert({
                        youtube_video_id: zqData.videoId,
                        title: healedTitle,
                        artist: healedArtist,
                        primary_genre_id: genreId,
                        secondary_genre_ids: [genreId],
                        source: 'jit_musicbrainz'
                    })
                    .select()
                    .single();

                if (insErr) continue;

                this.recentJitIds.add(zqData.videoId);

                console.log(`[JIT Organic Discovery ⚡] Added "${healedArtist} - ${healedTitle}" to catalog (${genreId}) | Source: MusicBrainz`);

                return {
                    id: zqData.videoId,
                    dbId: inserted.id,
                    title: healedTitle,
                    artist: healedArtist,
                    channelTitle: healedArtist,
                    genre: genreId,
                    thumbnail: `https://i.ytimg.com/vi/${zqData.videoId}/hqdefault.jpg`,
                    source: 'jit_musicbrainz'
                };
            }
        } catch (e) {
            console.warn('[JIT Engine] MusicBrainz pull exception:', e);
        }
        return null;
    }
}

export const jitEngine = new JitEngine();
