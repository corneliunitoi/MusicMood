/**
 * sessionStateMachine.js
 * Intent-Driven Music State Machine with Invariant Anti-Drift and Anti-Stagnation Engines.
 * 
 * Features:
 * 1. Finite Node Dwell & Dynamic Graph Wandering: Never camps on the same node for more than 2 tracks.
 * 2. Node Fatigue / Satiation Decay: Accumulated fatigue temporarily cools down visited nodes.
 * 3. Non-Runaway Weight Dynamics: Bounded probability distribution with an entropy floor (prevents the Matthew Effect).
 * 4. Satiation Protection: 15-artist sliding cooldown and 50-track de-duplication window.
 * 5. Invariant Guards: Anti-Drift, Vocal, and Dealbreaker guards.
 */

import { supabase, recordListenEvent } from './supabaseService.js';
import { GENRE_FAMILIES, GENRE_NODES, getConnectedGenres, getMoodCompatibleGenres, violatesDealbreakers, normalizeWeights } from './tasteGraph.js';
import { isSongCandidate, isAiGenerated } from './genreNormalizer.js';
import { allMoods } from './moods.js';
import { jitEngine } from './jitEngine.js';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// Storage keys
const SESSION_STATE_KEY = 'musicMood_session_state';
const USER_CALIBRATION_KEY = 'musicMood_user_calibration';

const MAX_DWELL_PER_NODE = 2; // Maximum consecutive tracks allowed in the same subgenre

class SessionStateMachine {
    constructor() {
        this.listeners = new Set();
        this.isResolving = false;
        this.queue = [];

        // Load saved calibration or defaults
        this.calibration = this.loadCalibration();

        // Anti-stagnation fatigue map: { [genreId]: float between 0.0 and 1.0 }
        this.nodeFatigue = {};

        // Initial session state
        this.state = this.loadSessionState() || {
            currentMood: 'focus',
            activeGenre: this.calibration.anchors[0] || 'neo_classical',
            consecutiveInNode: 0,
            energyLevel: 0.5,
            vocalPreference: 'any', // 'any' | 'instrumental' | 'vocal'
            discoveryLevel: this.calibration.discoveryLevel || 0.5,
            recentTracks: [],  // Max 50 track IDs
            recentArtists: [], // Max 15 artist names
            likedTracks: [],
            skippedTracks: [],
            currentTrack: null,
            status: 'idle',
            traversalHistory: [], // Log of graph hops
        };
    }

    loadCalibration() {
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem(USER_CALIBRATION_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    parsed.weights = normalizeWeights(parsed.weights || {}, parsed.anchors, parsed.dealbreakers);
                    return parsed;
                }
            }
        } catch (e) {
            console.error('Failed to parse calibration:', e);
        }

        const defaultAnchors = ['post_rock', 'synthwave', 'lofi_hiphop'];
        const defaultDealbreakers = ['no_top40_pop', 'no_autotune_trap'];
        return {
            anchors: defaultAnchors,
            dealbreakers: defaultDealbreakers,
            discoveryLevel: 0.5,
            weights: normalizeWeights({}, defaultAnchors, defaultDealbreakers)
        };
    }

    saveCalibration(calibration) {
        // Enforce normalized weights with ceiling & floor
        calibration.weights = normalizeWeights(calibration.weights, calibration.anchors, calibration.dealbreakers);
        this.calibration = calibration;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(USER_CALIBRATION_KEY, JSON.stringify(calibration));
        }
        this.notify();
    }

    loadSessionState() {
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem(SESSION_STATE_KEY);
                if (raw) return JSON.parse(raw);
            }
        } catch (e) {
            console.error('Failed to parse session state:', e);
        }
        return null;
    }

    saveSessionState() {
        try {
            if (typeof localStorage !== 'undefined') {
                const toSave = {
                    ...this.state,
                    recentTracks: this.state.recentTracks.slice(-50),
                    recentArtists: this.state.recentArtists.slice(-15),
                    traversalHistory: (this.state.traversalHistory || []).slice(-20),
                };
                localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(toSave));
            }
        } catch (e) {
            console.error('Failed to save session state:', e);
        }
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify() {
        this.saveSessionState();
        const stateSnapshot = this.getState();
        this.listeners.forEach(cb => cb(stateSnapshot));
    }

    getState() {
        return {
            ...this.state,
            queue: [...this.queue],
            maxDwell: MAX_DWELL_PER_NODE,
            currentFatigue: Math.round((this.nodeFatigue[this.state.activeGenre] || 0) * 100),
        };
    }

    getCalibration() {
        return this.calibration;
    }

    // ==========================================
    // DYNAMIC GRAPH TRAVERSAL (ANTI-STAGNATION)
    // ==========================================

    /**
     * Traverses to an adjacent node or compatible anchor based on:
     * Suitability = EffectiveAffinity * (1 - Fatigue) * HarmonicProximity * MoodAffinity
     * Dynamically expands exploration radius using discoveryLevel.
     */
    stepToNextGenre(reason = 'flow') {
        const current = this.state.activeGenre;
        const neighbors = getConnectedGenres(current);
        const moodCompatible = getMoodCompatibleGenres(this.state.currentMood);
        const discovery = this.state.discoveryLevel ?? 0.5;

        // Dynamic candidate pool based on discovery level:
        let candidatePool;
        if (discovery < 0.35) {
            // Familiar / Anchored: 1-hop harmonic neighbors + user anchors
            candidatePool = Array.from(new Set([...neighbors, ...this.calibration.anchors]));
        } else if (discovery <= 0.70) {
            // Balanced: 1-hop + 2-hop harmonic neighbors + mood-compatible genres + user anchors
            const twoHop = [];
            neighbors.forEach(n => {
                getConnectedGenres(n).forEach(n2 => twoHop.push(n2));
            });
            candidatePool = Array.from(new Set([...neighbors, ...twoHop, ...moodCompatible, ...this.calibration.anchors]));
        } else {
            // Deep Cuts / Wide Exploration: ALL non-dealbreaker genres
            candidatePool = Object.keys(GENRE_NODES);
        }

        // Filter out dealbreakers and the exact current node
        const validCandidates = candidatePool.filter(nodeId => {
            if (nodeId === current) return false;
            return !violatesDealbreakers(GENRE_NODES[nodeId]?.label, nodeId, this.calibration.dealbreakers);
        });

        if (validCandidates.length === 0) {
            console.warn('[StateMachine] No other valid candidate nodes available. Staying on:', current);
            this.state.consecutiveInNode = 0;
            return current;
        }

        // Score each candidate by affinity, inverse fatigue, and harmonic/mood affinity
        const scored = validCandidates.map(nodeId => {
            const rawWeight = this.calibration.weights[nodeId] || 0.1;
            // Higher discovery flattens anchor bias so user isn't confined to original picks
            const effectiveWeight = (rawWeight * (1.0 - discovery * 0.7)) + (0.15 * discovery);

            const fatigue = this.nodeFatigue[nodeId] || 0.0;
            const isNeighbor = neighbors.includes(nodeId);
            const isMoodMatch = moodCompatible.includes(nodeId);

            const neighborBonus = isNeighbor ? 1.35 : 1.0;
            const moodBonus = isMoodMatch ? 1.4 : 0.85;

            // Score with strong anti-stagnation fatigue penalty
            const score = effectiveWeight * Math.max(0.08, 1.0 - fatigue * 0.85) * neighborBonus * moodBonus;
            return { nodeId, score };
        });

        // Weighted selection (Softmax-like or proportional pick from top candidates)
        scored.sort((a, b) => b.score - a.score);
        const candidateCount = Math.min(discovery > 0.7 ? 8 : 4, scored.length);
        const topCandidates = scored.slice(0, candidateCount);
        const chosen = topCandidates[Math.floor(Math.random() * topCandidates.length)].nodeId;

        console.log(`[Anti-Stagnation Flow] Transitioned along graph (${reason}): ${current} -> ${chosen} (Discovery: ${discovery})`);

        this.state.activeGenre = chosen;
        this.state.consecutiveInNode = 0;
        this.state.traversalHistory = [...(this.state.traversalHistory || []), {
            from: current,
            to: chosen,
            reason,
            timestamp: new Date().toISOString()
        }];

        this.queue = [];
        this.notify();
        return chosen;
    }

    applyNodeFatigue(genreId) {
        // Increase fatigue on played node
        this.nodeFatigue[genreId] = Math.min(1.0, (this.nodeFatigue[genreId] || 0) + 0.45);

        // Cool down all other nodes
        Object.keys(this.nodeFatigue).forEach(node => {
            if (node !== genreId) {
                this.nodeFatigue[node] = Math.max(0.0, this.nodeFatigue[node] - 0.15);
            }
        });
    }

    // ==========================================
    // STATE TRANSITIONS & STEERING CONTROLS
    // ==========================================

    setMood(moodId) {
        const moodObj = allMoods.find(m => m.id === moodId);
        if (!moodObj) return;

        console.log(`[StateMachine] Transitioning Mood -> ${moodObj.label}`);
        this.state.currentMood = moodId;

        if (moodId === 'focus' || moodId === 'study' || moodId === 'sleep') {
            this.state.vocalPreference = 'instrumental';
        }

        const moodCompatible = getMoodCompatibleGenres(moodId);

        // If the current genre does not fit the new mood (or violates dealbreakers),
        // route immediately to the best matching genre for this mood:
        const currentFitsMood = moodCompatible.includes(this.state.activeGenre);
        const currentAllowed = !violatesDealbreakers(GENRE_NODES[this.state.activeGenre]?.label, this.state.activeGenre, this.calibration.dealbreakers);

        if (!currentFitsMood || !currentAllowed) {
            // Prefer an anchor if it matches this mood, else pick from mood's core genres
            const compatibleAnchor = this.calibration.anchors.find(a => moodCompatible.includes(a) && !violatesDealbreakers(a, a, this.calibration.dealbreakers));
            const validMoodGenres = moodCompatible.filter(g => !violatesDealbreakers(GENRE_NODES[g]?.label, g, this.calibration.dealbreakers));
            const newGenre = compatibleAnchor || validMoodGenres[0] || 'lofi_hiphop';
            console.log(`[StateMachine] Switched active genre to align with mood "${moodObj.label}": ${newGenre}`);
            this.state.activeGenre = newGenre;
        }

        this.state.consecutiveInNode = 0;
        this.queue = [];
        this.notify();
    }

    setGenre(genreId, force = true) {
        if (!GENRE_NODES[genreId]) return;
        if (!force && violatesDealbreakers(GENRE_NODES[genreId].label, genreId, this.calibration.dealbreakers)) {
            console.warn(`[StateMachine] Cannot switch to ${genreId}: violates active dealbreaker.`);
            return;
        }

        console.log(`[StateMachine] Direct genre jump -> ${GENRE_NODES[genreId].label}`);
        this.state.activeGenre = genreId;
        this.state.consecutiveInNode = 0;
        this.queue = [];
        this.notify();
        setTimeout(() => {
            jitEngine.replenishBuffer(genreId, this);
        }, 150);
    }

    setEnergy(energyFloat) {
        this.state.energyLevel = Math.max(0.0, Math.min(1.0, energyFloat));
        this.notify();
    }

    setVocalPreference(vocalPref) {
        this.state.vocalPreference = vocalPref;
        this.queue = [];
        this.notify();
    }

    setDiscoveryLevel(discoveryFloat) {
        this.state.discoveryLevel = Math.max(0.0, Math.min(1.0, discoveryFloat));
        this.notify();
    }

    // ==========================================
    // FEEDBACK & NON-RUNAWAY REINFORCEMENT
    // ==========================================

    onLike(track) {
        if (!track) return;
        console.log(`[StateMachine] Feedback: LIKED "${track.title}" by ${track.artist}`);
        this.state.likedTracks.push(track.id);

        recordListenEvent({
            trackId: track.dbId || null,
            moodId: this.state.currentMood,
            genreId: this.state.activeGenre,
            liked: true
        });

        // Subtle, bounded boost to taste profile
        const genreId = this.state.activeGenre;
        const currentWeights = { ...this.calibration.weights };
        currentWeights[genreId] = (currentWeights[genreId] || 0.1) + 0.05;

        // Immediately normalize so it cannot runaway
        this.saveCalibration({
            ...this.calibration,
            weights: currentWeights
        });
    }

    async onDislike(track) {
        if (!track) return;
        console.log(`[StateMachine] 👎 DISLIKED (Taste Downvote): "${track.title}" by ${track.artist}`);
        this.state.skippedTracks.push(track.id);

        // 1. Record dislike in listening_history for personalized recommendation tuning
        recordListenEvent({
            trackId: track.dbId || null,
            moodId: this.state.currentMood,
            genreId: this.state.activeGenre,
            skipped: true,
            liked: false
        });

        // 2. Blacklist artist from current session to prevent repetition
        if (track.artist && !this.state.recentArtists.includes(track.artist.toLowerCase())) {
            this.state.recentArtists.push(track.artist.toLowerCase());
        }

        // 3. Penalize active node fatigue and step away
        this.applyNodeFatigue(this.state.activeGenre);
        this.stepToNextGenre('dislike_purge');
    }

    getMaxDwell() {
        const disc = this.state.discoveryLevel ?? 0.5;
        // Low discovery (0.0 - 0.25): Lock in to the vibe (10 tracks)
        // Mid discovery (0.3 - 0.65): Gentle harmonic wandering (5 tracks)
        // High discovery (0.7+): Adventurous graph hops (3 tracks)
        if (disc <= 0.25) return 10;
        if (disc <= 0.65) return 5;
        return 3;
    }

    onSkip(track) {
        if (!track) return;
        console.log(`[StateMachine] Feedback: SKIPPED "${track.title}" by ${track.artist} (Staying in ${this.state.activeGenre})`);
        this.state.skippedTracks.push(track.id);

        recordListenEvent({
            trackId: track.dbId || null,
            moodId: this.state.currentMood,
            genreId: this.state.activeGenre,
            skipped: true
        });

        if (track.artist && !this.state.recentArtists.includes(track.artist.toLowerCase())) {
            this.state.recentArtists.push(track.artist.toLowerCase());
        }

        // DO NOT change genre on a normal track skip!
        // The user just wants a different song in the current vibe.
        // Genre transitions only occur upon explicit user intent,
        // negative purge (thumbs down), or natural dwell completion.
        this.notify();
    }

    onTrackCompleted(track) {
        if (!track) return;
        console.log(`[StateMachine] Feedback: COMPLETED "${track.title}"`);

        recordListenEvent({
            trackId: track.dbId || null,
            moodId: this.state.currentMood,
            genreId: this.state.activeGenre,
            completed: true
        });

        this.applyNodeFatigue(this.state.activeGenre);
        this.state.consecutiveInNode = (this.state.consecutiveInNode || 0) + 1;

        // ANTI-STAGNATION CHECK: Only trigger transition if dwell limit for current discovery level is reached
        const maxDwell = this.getMaxDwell();
        if (this.state.consecutiveInNode >= maxDwell) {
            console.log(`[StateMachine] Dwell limit of ${maxDwell} tracks reached in "${this.state.activeGenre}". Triggering gentle harmonic transition.`);
            this.stepToNextGenre('dwell_limit');
        } else {
            this.notify();
        }
    }

    // ==========================================
    // SOURCING PIPELINE WITH INVARIANT GUARDS
    // ==========================================

    async getNextTrack(token) {
        if (this.isResolving) return null;
        this.isResolving = true;

        try {
            // Check buffered queue first
            while (this.queue.length > 0) {
                const candidate = this.queue.shift();
                if (this.passesGuards(candidate)) {
                    this.commitTrack(candidate);
                    jitEngine.replenishBuffer(this.state.activeGenre, this);
                    return candidate;
                }
            }

            // 1. Primary Source: Supabase Catalog (Pre-mapped zero-quota tracks)
            const libCandidate = await this.sourceFromLocalLibrary();
            if (libCandidate) {
                // If track already has pre-mapped 11-char YouTube ID, play immediately (Zero Quota!)
                if (libCandidate.id && this.passesGuards(libCandidate)) {
                    this.commitTrack(libCandidate);
                    jitEngine.replenishBuffer(this.state.activeGenre, this);
                    return libCandidate;
                }
                
                // If track has metadata but no ID yet, resolve it
                if (this.passesMetadataGuards(libCandidate)) {
                    const resolved = await this.resolveTrackToYouTube(libCandidate, token);
                    if (resolved && this.passesGuards(resolved)) {
                        this.commitTrack(resolved);
                        jitEngine.replenishBuffer(this.state.activeGenre, this);
                        return resolved;
                    }
                }
            }

            // 2. JIT Organic Catalog Expansion: Pull a brand new track for this active genre
            console.log(`[StateMachine ⚡] Catalog exhausted for "${this.state.activeGenre}". Triggering JIT Organic Expansion...`);
            const jitCandidate = await jitEngine.pullTrackForGenre(this.state.activeGenre, this);
            if (jitCandidate && this.passesGuards(jitCandidate)) {
                this.commitTrack(jitCandidate);
                jitEngine.replenishBuffer(this.state.activeGenre, this);
                return jitCandidate;
            }

            // 3. Targeted Anti-Drift YouTube Sourcing
            if (token) {
                const ytCandidate = await this.sourceFromYouTube(token);
                if (ytCandidate) {
                    this.commitTrack(ytCandidate);
                    jitEngine.replenishBuffer(this.state.activeGenre, this);
                    return ytCandidate;
                }
            }

            // 4. Resilient Fallback: If YouTube search was blocked/rate-limited, pick a guaranteed safe track!
            const emergencyTrack = await this.sourceEmergencyTrack();
            if (emergencyTrack) {
                console.log(`[Emergency Fallback 🛡️] Played safe track: "${emergencyTrack.artist} - ${emergencyTrack.title}" (${emergencyTrack.genre})`);
                this.commitTrack(emergencyTrack);
                return emergencyTrack;
            }

            return null;
        } finally {
            this.isResolving = false;
        }
    }

    /**
     * Strict Guard Verification for Metadata (Title, Artist, Dealbreakers)
     */
    passesMetadataGuards(track) {
        if (!track) return false;

        const title = (track.title || '').toLowerCase();
        const artist = (track.artist || track.channelTitle || '').toLowerCase();

        // Guard 0A: Song Candidate & Stem Gatekeeper
        const songCheck = isSongCandidate({ title: track.title, artist: track.artist });
        if (!songCheck.pass) {
            return false;
        }

        // Guard 0B: Anti-AI Gatekeeper
        if (this.calibration.blockAiGenerated !== false && isAiGenerated({ title: track.title, artist: track.artist, channelTitle: track.channelTitle })) {
            console.log(`[Guard 🛡️] Anti-AI: Dropped synthetic AI candidate "${track.artist} - ${track.title}"`);
            return false;
        }

        // Guard 0C: Non-Music, Corrupted Metadata, & Multi-Hour Compilation Guard
        const JUNK_ARTIST_REGEX = /^(cd\s*[0-9]+|disc\s*[0-9]+|track\s*[0-9]+|unknown(\s*artist)?)$/i;
        const JUNK_TITLE_REGEX = /^[0-9]+$/;
        const NON_MUSIC_TERMS = ['recitation', 'audiobook', 'lesson', 'speaking', 'chinese', 'meditation guide', 'podcast', 'episode'];
        const COMPILATION_TERMS = ['full album', 'full ep', 'compilation', '1 hour', '2 hours', '3 hours', '10 hours', 'teaser', 'trailer', 'ultimate mix', 'best songs of'];

        if (!artist || artist.length < 2 || !title || title.length < 2) return false;
        if (JUNK_ARTIST_REGEX.test(artist) || JUNK_TITLE_REGEX.test(title)) {
            return false;
        }
        if (NON_MUSIC_TERMS.some(t => title.includes(t) || artist.includes(t))) {
            return false;
        }
        if (COMPILATION_TERMS.some(t => title.includes(t))) {
            return false;
        }

        // Guard: Dealbreaker & Negative Query Guard
        if (violatesDealbreakers(title + ' ' + artist, this.state.activeGenre, this.calibration.dealbreakers)) {
            return false;
        }

        return true;
    }

    /**
     * Strict Guard Verification Engine (Full Track with 11-char Video ID)
     */
    passesGuards(track) {
        if (!track || !track.id || track.id.length !== 11) return false;
        if (!this.passesMetadataGuards(track)) return false;

        const artist = (track.artist || track.channelTitle || '').toLowerCase();
        const title = (track.title || '').toLowerCase();

        // Guard 1: Anti-Loop Repetition Guard (50 tracks, 15 artists)
        if (this.state.recentTracks.includes(track.id)) {
            console.log(`[Guard ❌] Repetition: Track ${track.id} played in last 50 tracks.`);
            return false;
        }
        if (artist && this.state.recentArtists.slice(-15).includes(artist)) {
            console.log(`[Guard ❌] Satiation: Artist "${artist}" played in last 15 songs.`);
            return false;
        }

        // Guard 3: Vocal Preference Guard
        if (this.state.vocalPreference === 'instrumental') {
            const vocalKeywords = ['vocal', 'vocals', 'lyrics', 'feat.', 'ft.', 'singing', 'official music video'];
            const hasVocalTag = vocalKeywords.some(kw => title.includes(kw));
            if (hasVocalTag && !title.includes('instrumental')) {
                console.log(`[Guard ❌] Vocal Guard: "${title}" likely contains vocals in Instrumental mode.`);
                return false;
            }
        }

        return true;
    }

    commitTrack(track) {
        this.state.currentTrack = track;
        this.state.recentTracks.push(track.id);
        const artist = (track.artist || track.channelTitle || '').toLowerCase();
        if (artist) {
            this.state.recentArtists.push(artist);
        }

        // Record scrobble in Supabase listening_history
        recordListenEvent({
            trackId: track.dbId || null,
            moodId: this.state.currentMood,
            genreId: this.state.activeGenre,
        });

        this.notify();

        // Background JIT buffer replenishment for active genre (catalog grows organically!)
        setTimeout(() => {
            jitEngine.replenishBuffer(this.state.activeGenre, this);
        }, 400);
    }

    async sourceEmergencyTrack() {
        try {
            const activeGenreId = this.state.activeGenre;
            const node = GENRE_NODES[activeGenreId];

            // Build candidate genre list: specific subgenre, parent family, and harmonic neighbors
            const candidateGenreIds = [activeGenreId];
            if (node?.group) {
                const groupLower = node.group.toLowerCase();
                const parentId = Object.keys(GENRE_FAMILIES).find(k => GENRE_FAMILIES[k].label.toLowerCase() === groupLower);
                if (parentId) candidateGenreIds.push(parentId);
            }
            const neighbors = getConnectedGenres(activeGenreId);
            candidateGenreIds.push(...neighbors);
            const candList = candidateGenreIds.join(',');

            // 1. Try candidate genres first (primary + secondary)
            let { data } = await supabase
                .from('tracks')
                .select('*')
                .or(`primary_genre_id.in.(${candList}),secondary_genre_ids.ov.{${candList}}`)
                .not('youtube_video_id', 'is', null)
                .neq('youtube_video_id', 'CORRUPT_TAGS')
                .limit(60);

            // 2. If empty, fall back to any catalog track sampled with random offset
            if (!data || data.length === 0) {
                const randomOffset = Math.floor(Math.random() * 200);
                const res = await supabase
                    .from('tracks')
                    .select('*')
                    .not('youtube_video_id', 'is', null)
                    .neq('youtube_video_id', 'CORRUPT_TAGS')
                    .range(randomOffset, randomOffset + 50);
                data = res.data;
            }

            if (!data || data.length === 0) return null;

            // Pass A: Find candidate that passes ALL strict guards
            for (const t of data) {
                if (t.youtube_video_id && t.youtube_video_id.length === 11) {
                    const candidate = {
                        id: t.youtube_video_id,
                        dbId: t.id,
                        artist: t.artist,
                        title: t.title,
                        genre: t.primary_genre_id || this.state.activeGenre,
                        thumbnail: `https://i.ytimg.com/vi/${t.youtube_video_id}/hqdefault.jpg`,
                        source: 'emergency_zero_quota'
                    };
                    if (this.passesGuards(candidate)) {
                        return candidate;
                    }
                }
            }

            // Pass B: Relax artist fatigue (just avoid playing the exact same track ID currently playing)
            const currentVideoId = this.state.currentTrack?.id;
            for (const t of data) {
                if (t.youtube_video_id && t.youtube_video_id.length === 11 && t.youtube_video_id !== currentVideoId) {
                    if (this.passesMetadataGuards(t)) {
                        return {
                            id: t.youtube_video_id,
                            dbId: t.id,
                            artist: t.artist,
                            title: t.title,
                            genre: t.primary_genre_id || this.state.activeGenre,
                            thumbnail: `https://i.ytimg.com/vi/${t.youtube_video_id}/hqdefault.jpg`,
                            source: 'emergency_relaxed'
                        };
                    }
                }
            }

            // Pass C: Last resort safe return from data[0]
            const fallback = data[0];
            return {
                id: fallback.youtube_video_id,
                dbId: fallback.id,
                artist: fallback.artist,
                title: fallback.title,
                genre: fallback.primary_genre_id || this.state.activeGenre,
                thumbnail: `https://i.ytimg.com/vi/${fallback.youtube_video_id}/hqdefault.jpg`,
                source: 'emergency_safe_fallback'
            };
        } catch (e) {
            console.error('[StateMachine] Emergency track selection exception:', e);
            return null;
        }
    }

    async sourceFromLocalLibrary() {
        try {
            const activeGenreId = this.state.activeGenre;
            const node = GENRE_NODES[activeGenreId];

            const recentArtistsSet = new Set(this.state.recentArtists.slice(-15));
            const recentTracksSet = new Set(this.state.recentTracks.slice(-50));
            const currentVideoId = this.state.currentTrack?.id;

            // Multi-pass candidate filter:
            // Pass 1: Strict guard (neither recent track nor recent artist)
            // Pass 2: Relaxed artist guard (allow artist if it's not the currently playing track)
            const filterCandidates = (tracks, relaxArtist = false) => {
                if (!tracks || !Array.isArray(tracks)) return [];
                return tracks.filter(t => {
                    const vid = t.youtube_video_id || t.id;
                    if (vid && recentTracksSet.has(vid)) return false;
                    if (vid && vid === currentVideoId) return false;
                    const a = (t.artist || '').toLowerCase();
                    if (!relaxArtist && a && recentArtistsSet.has(a)) return false;
                    if (!this.passesMetadataGuards(t)) return false;
                    return true;
                });
            };

            // Tier 1: Strict Active Subgenre (Zero Quota pre-mapped, primary + secondary genres)
            let { data: exactMapped } = await supabase
                .from('tracks')
                .select('*')
                .or(`primary_genre_id.eq.${activeGenreId},secondary_genre_ids.cs.{${activeGenreId}}`)
                .not('youtube_video_id', 'is', null)
                .neq('youtube_video_id', 'CORRUPT_TAGS')
                .limit(60);

            let available = filterCandidates(exactMapped);
            if (available.length === 0 && exactMapped && exactMapped.length > 0) {
                // Relax artist satiation so the user can hear more songs from this genre!
                available = filterCandidates(exactMapped, true);
            }

            // Tier 2: Parent Family (if activeGenreId is a subgenre and parent is distinct)
            if (available.length === 0 && node?.group) {
                const groupLower = node.group.toLowerCase();
                const parentId = Object.keys(GENRE_FAMILIES).find(k => GENRE_FAMILIES[k].label.toLowerCase() === groupLower) || groupLower;
                if (parentId && parentId !== activeGenreId) {
                    const { data: familyMapped } = await supabase
                        .from('tracks')
                        .select('*')
                        .or(`primary_genre_id.eq.${parentId},secondary_genre_ids.cs.{${parentId}}`)
                        .not('youtube_video_id', 'is', null)
                        .neq('youtube_video_id', 'CORRUPT_TAGS')
                        .limit(40);
                    available = filterCandidates(familyMapped);
                    if (available.length === 0 && familyMapped && familyMapped.length > 0) {
                        available = filterCandidates(familyMapped, true);
                    }
                }
            }

            // Tier 3: Harmonic Neighbors from Taste Graph
            if (available.length === 0) {
                const neighbors = getConnectedGenres(activeGenreId).filter(g => g !== activeGenreId);
                if (neighbors.length > 0) {
                    const neighborList = neighbors.join(',');
                    const { data: neighborMapped } = await supabase
                        .from('tracks')
                        .select('*')
                        .or(`primary_genre_id.in.(${neighborList}),secondary_genre_ids.ov.{${neighborList}}`)
                        .not('youtube_video_id', 'is', null)
                        .neq('youtube_video_id', 'CORRUPT_TAGS')
                        .limit(40);
                    available = filterCandidates(neighborMapped);
                    if (available.length === 0 && neighborMapped && neighborMapped.length > 0) {
                        available = filterCandidates(neighborMapped, true);
                    }
                }
            }

            // Tier 4: Fallback to unmapped tracks in exact active genre (for JIT resolution)
            if (available.length === 0) {
                const { data: unmapped } = await supabase
                    .from('tracks')
                    .select('*')
                    .or(`primary_genre_id.eq.${activeGenreId},secondary_genre_ids.cs.{${activeGenreId}}`)
                    .limit(40);
                available = filterCandidates(unmapped);
                if (available.length === 0 && unmapped && unmapped.length > 0) {
                    available = filterCandidates(unmapped, true);
                }
            }

            if (available.length === 0) return null;

            const selected = available[Math.floor(Math.random() * available.length)];

            // If already pre-mapped with youtube_video_id, return immediately (Zero Quota!)
            if (selected.youtube_video_id && selected.youtube_video_id.length === 11) {
                console.log(`[Zero-Quota Hit] Pre-mapped track: "${selected.artist} - ${selected.title}" -> ${selected.youtube_video_id}`);
                return {
                    id: selected.youtube_video_id,
                    dbId: selected.id,
                    artist: selected.artist,
                    title: selected.title,
                    genre: activeGenreId,
                    thumbnail: `https://i.ytimg.com/vi/${selected.youtube_video_id}/hqdefault.jpg`,
                    source: selected.source || 'tracks_catalog'
                };
            }

            return {
                dbId: selected.id,
                artist: selected.artist,
                title: selected.title,
                genre: activeGenreId,
                source: selected.source || 'tracks_catalog'
            };
        } catch (e) {
            console.warn('[StateMachine] Tracks catalog lookup exception:', e);
            return null;
        }
    }

    playCustomTrack(track) {
        if (!track) return;
        const resolvedTrack = {
            id: track.videoId || track.id,
            dbId: track.dbId || null,
            title: track.title,
            artist: track.artist,
            genre: track.genre || track.primary_genre_id || this.state.activeGenre,
            thumbnail: track.thumbnail || (track.videoId ? `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg` : ''),
            source: track.source || 'custom_playlist'
        };

        if (resolvedTrack.genre && GENRE_NODES[resolvedTrack.genre]) {
            this.state.activeGenre = resolvedTrack.genre;
        }

        this.commitTrack(resolvedTrack);
        return resolvedTrack;
    }

    queuePlaylist(tracks) {
        if (!Array.isArray(tracks)) return;
        const valid = tracks.map(t => ({
            id: t.videoId || t.id,
            dbId: t.dbId || null,
            title: t.title,
            artist: t.artist,
            genre: t.genre || t.primary_genre_id || this.state.activeGenre,
            thumbnail: t.thumbnail || ((t.videoId || t.id) ? `https://i.ytimg.com/vi/${t.videoId || t.id}/hqdefault.jpg` : ''),
            source: t.source || 'queued_playlist'
        })).filter(t => t.id && t.id.length === 11);

        this.queue.push(...valid);
        console.log(`[StateMachine] Queued ${valid.length} tracks into session queue. Current queue length: ${this.queue.length}`);
        this.notify();
    }

    async resolveTrackToYouTube(track, token) {
        // If track already has resolved id from pre-mapping, skip YouTube API completely!
        if (track.id && track.id.length === 11) return track;

        // 1. Zero-Quota local resolver (no API keys, zero rate-limiting)
        try {
            const zqUrl = `/api/resolve-track?artist=${encodeURIComponent(track.artist || '')}&title=${encodeURIComponent(track.title || '')}`;
            const zqRes = await fetch(zqUrl);
            if (zqRes.ok) {
                const zqData = await zqRes.json();
                if (zqData.videoId && zqData.videoId.length === 11) {
                    const resolvedId = zqData.videoId;
                    const healedArtist = zqData.artist || track.artist;

                    // Asynchronously cache back to Supabase
                    if (track.dbId) {
                        supabase
                            .from('tracks')
                            .update({ youtube_video_id: resolvedId, artist: healedArtist })
                            .eq('id', track.dbId)
                            .then(() => console.log(`[Zero-Quota JIT Cache] Cached ${healedArtist} - ${track.title} -> ${resolvedId}`))
                            .catch(() => {});
                    }

                    return {
                        id: resolvedId,
                        dbId: track.dbId,
                        title: track.title,
                        artist: healedArtist,
                        channelTitle: healedArtist,
                        thumbnail: `https://i.ytimg.com/vi/${resolvedId}/hqdefault.jpg`,
                        genre: track.genre || this.state.activeGenre,
                        source: 'zero_quota_resolved'
                    };
                }
            }
        } catch (e) {
            console.warn('[StateMachine] Zero-quota resolver call failed:', e);
        }

        // 2. Google YouTube API fallback
        const authHeaders = token === 'guest' ? {} : { Authorization: `Bearer ${token}` };
        const authParams = token === 'guest' ? `&key=${import.meta.env.VITE_YOUTUBE_API_KEY}` : '';
        
        // Lock to YouTube Music official "Topic" release to guarantee studio audio
        const query = `"${track.artist}" "${track.title}" "Topic"`;

        try {
            const url = `${YOUTUBE_API_BASE}/search?part=snippet&type=video&videoCategoryId=10&videoSyndicated=true&q=${encodeURIComponent(query)}&maxResults=1${authParams}`;
            const res = await fetch(url, { headers: authHeaders });
            const data = await res.json();

            if (data.items && data.items.length > 0) {
                const item = data.items[0];
                const resolvedId = item.id.videoId;

                // Asynchronously cache youtube_video_id back to Supabase tracks table so it's permanently zero-quota next time
                if (track.dbId && resolvedId) {
                    supabase
                        .from('tracks')
                        .update({ youtube_video_id: resolvedId })
                        .eq('id', track.dbId)
                        .then(() => console.log(`[JIT Cache] Cached youtube_video_id for ${track.artist} - ${track.title}`))
                        .catch(() => {});
                }

                return {
                    id: resolvedId,
                    dbId: track.dbId,
                    title: track.title,
                    artist: track.artist,
                    channelTitle: item.snippet.channelTitle,
                    thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
                    genre: track.genre || this.state.activeGenre,
                    source: 'library_resolved'
                };
            }
        } catch (e) {
            console.warn(`[StateMachine] Could not resolve ${track.artist} - ${track.title} on YouTube`);
        }
        return null;
    }

    async sourceFromYouTube(token) {
        const authHeaders = token === 'guest' ? {} : { Authorization: `Bearer ${token}` };
        const authParams = token === 'guest' ? `&key=${import.meta.env.VITE_YOUTUBE_API_KEY}` : '';

        const activeNode = GENRE_NODES[this.state.activeGenre];
        const moodObj = allMoods.find(m => m.id === this.state.currentMood);

        let queryParts = [activeNode?.label || 'Music'];
        if (moodObj?.searchContext) {
            queryParts.push(moodObj.label);
        }

        if (this.state.vocalPreference === 'instrumental') {
            queryParts.push('instrumental');
        }

        // Add explicit exclusions to kill podcasts, recitations, audiobooks, lessons
        const exclusionString = '-podcast -audiobook -recitation -lesson -asmr -reaction -vlog -shorts -tiktok';
        const fullQuery = `"${activeNode?.label}" Topic official audio ${exclusionString}`;

        console.log(`[StateMachine] Anti-Drift YouTube Music Query: "${fullQuery}"`);

        try {
            const url = `${YOUTUBE_API_BASE}/search?part=snippet&type=video&videoCategoryId=10&videoSyndicated=true&q=${encodeURIComponent(fullQuery)}&maxResults=15${authParams}`;
            const res = await fetch(url, { headers: authHeaders });
            const data = await res.json();

            if (data.items && data.items.length > 0) {
                for (const item of data.items) {
                    const candidate = {
                        id: item.id.videoId,
                        title: item.snippet.title,
                        artist: item.snippet.channelTitle,
                        channelTitle: item.snippet.channelTitle,
                        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
                        genre: activeNode?.label,
                        mood: moodObj?.label,
                        source: 'youtube_targeted'
                    };

                    if (this.passesGuards(candidate)) {
                        // Expand catalog in Supabase synchronously so dbId is ready for scrobbling
                        try {
                            const { data: inserted } = await supabase
                                .from('tracks')
                                .insert({
                                    youtube_video_id: candidate.id,
                                    title: candidate.title,
                                    artist: candidate.artist,
                                    primary_genre_id: this.state.activeGenre,
                                    source: 'online_discovery'
                                })
                                .select('id')
                                .single();

                            if (inserted?.id) {
                                candidate.dbId = inserted.id;
                                console.log(`[Auto-Expand] Ingested newly discovered track: "${candidate.title}" with ID ${candidate.dbId}`);
                            }
                        } catch (err) {
                            console.warn('[Auto-Expand] Track catalog expand warning:', err);
                        }

                        return candidate;
                    }
                }
            }
        } catch (e) {
            console.error('[StateMachine] YouTube search failed:', e);
        }

        return null;
    }
}

export const sessionEngine = new SessionStateMachine();
