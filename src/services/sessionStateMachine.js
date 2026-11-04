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

import { supabase } from './supabaseService';
import { GENRE_NODES, getConnectedGenres, violatesDealbreakers, normalizeWeights } from './tasteGraph';
import { allMoods } from '../components/MoodBar';

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
            const raw = localStorage.getItem(USER_CALIBRATION_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                parsed.weights = normalizeWeights(parsed.weights || {}, parsed.anchors, parsed.dealbreakers);
                return parsed;
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
        localStorage.setItem(USER_CALIBRATION_KEY, JSON.stringify(calibration));
        this.notify();
    }

    loadSessionState() {
        try {
            const raw = localStorage.getItem(SESSION_STATE_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {
            console.error('Failed to parse session state:', e);
        }
        return null;
    }

    saveSessionState() {
        try {
            const toSave = {
                ...this.state,
                recentTracks: this.state.recentTracks.slice(-50),
                recentArtists: this.state.recentArtists.slice(-15),
                traversalHistory: (this.state.traversalHistory || []).slice(-20),
            };
            localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(toSave));
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
        this.listeners.forEach(cb => cb(this.state));
    }

    getState() {
        return {
            ...this.state,
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
     * Suitability = NormalizedAffinity * (1 - Fatigue) * HarmonicProximity
     */
    stepToNextGenre(reason = 'flow') {
        const current = this.state.activeGenre;
        const neighbors = getConnectedGenres(current);

        // Consider neighbors first, then other user anchors
        const candidatePool = Array.from(new Set([...neighbors, ...this.calibration.anchors]));

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

        // Score each candidate by affinity & inverse fatigue
        const scored = validCandidates.map(nodeId => {
            const weight = this.calibration.weights[nodeId] || 0.1;
            const fatigue = this.nodeFatigue[nodeId] || 0.0;
            // Immediate harmonic neighbor bonus
            const isNeighbor = neighbors.includes(nodeId);
            const neighborBonus = isNeighbor ? 1.3 : 1.0;

            const score = weight * (1.0 - fatigue * 0.8) * neighborBonus;
            return { nodeId, score };
        });

        // Weighted selection (Softmax-like or proportional pick)
        scored.sort((a, b) => b.score - a.score);
        const topCandidates = scored.slice(0, 3);
        const chosen = topCandidates[Math.floor(Math.random() * topCandidates.length)].nodeId;

        console.log(`[Anti-Stagnation Flow] Transitioned along graph (${reason}): ${current} -> ${chosen}`);

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

        const currentNode = GENRE_NODES[this.state.activeGenre];
        const isCurrentAllowed = !violatesDealbreakers(currentNode?.label, this.state.activeGenre, this.calibration.dealbreakers);

        if (!isCurrentAllowed) {
            const fallback = this.calibration.anchors.find(a => !violatesDealbreakers(a, a, this.calibration.dealbreakers)) || 'lofi_hiphop';
            this.state.activeGenre = fallback;
        }

        this.state.consecutiveInNode = 0;
        this.queue = [];
        this.notify();
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

    onSkip(track) {
        if (!track) return;
        console.log(`[StateMachine] Feedback: SKIPPED "${track.title}" by ${track.artist}`);
        this.state.skippedTracks.push(track.id);

        if (track.artist && !this.state.recentArtists.includes(track.artist.toLowerCase())) {
            this.state.recentArtists.push(track.artist.toLowerCase());
        }

        // Stepping away from this node upon skip prevents getting stuck
        this.applyNodeFatigue(this.state.activeGenre);
        this.stepToNextGenre('skip_nudge');
    }

    onTrackCompleted(track) {
        if (!track) return;
        console.log(`[StateMachine] Feedback: COMPLETED "${track.title}"`);

        this.applyNodeFatigue(this.state.activeGenre);
        this.state.consecutiveInNode = (this.state.consecutiveInNode || 0) + 1;

        // ANTI-STAGNATION CHECK: If we reached the dwell limit, trigger automatic harmonic transition!
        if (this.state.consecutiveInNode >= MAX_DWELL_PER_NODE) {
            console.log(`[StateMachine] Dwell limit of ${MAX_DWELL_PER_NODE} tracks reached in "${this.state.activeGenre}". Triggering harmonic transition!`);
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
                    return candidate;
                }
            }

            // 1. Try Sourcing from Supabase Local Enriched Library
            const shouldTryLibrary = this.state.discoveryLevel < 0.8;
            if (shouldTryLibrary) {
                const libCandidate = await this.sourceFromLocalLibrary();
                if (libCandidate && this.passesGuards(libCandidate)) {
                    const resolved = await this.resolveTrackToYouTube(libCandidate, token);
                    if (resolved && this.passesGuards(resolved)) {
                        this.commitTrack(resolved);
                        return resolved;
                    }
                }
            }

            // 2. Targeted Anti-Drift YouTube Sourcing
            const ytCandidate = await this.sourceFromYouTube(token);
            if (ytCandidate) {
                this.commitTrack(ytCandidate);
                return ytCandidate;
            }

            return null;
        } finally {
            this.isResolving = false;
        }
    }

    /**
     * Strict Guard Verification Engine
     */
    passesGuards(track) {
        if (!track || !track.id) return false;

        const title = (track.title || '').toLowerCase();
        const artist = (track.artist || track.channelTitle || '').toLowerCase();

        // Guard 1: Anti-Loop Repetition Guard (50 tracks, 15 artists)
        if (this.state.recentTracks.includes(track.id)) {
            console.log(`[Guard ❌] Repetition: Track ${track.id} played in last 50 tracks.`);
            return false;
        }
        if (artist && this.state.recentArtists.slice(-15).includes(artist)) {
            console.log(`[Guard ❌] Satiation: Artist "${artist}" played in last 15 songs.`);
            return false;
        }

        // Guard 2: Dealbreaker & Negative Query Guard
        if (violatesDealbreakers(title + ' ' + artist, this.state.activeGenre, this.calibration.dealbreakers)) {
            console.log(`[Guard ❌] Anti-Drift: "${title}" violates active dealbreaker.`);
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
        this.notify();
    }

    async sourceFromLocalLibrary() {
        try {
            const activeNode = GENRE_NODES[this.state.activeGenre];
            const genreQuery = activeNode ? activeNode.label.split('/')[0].trim() : 'Rock';

            const { data, error } = await supabase
                .from('local_metadata')
                .select('*')
                .ilike('genre', `%${genreQuery}%`)
                .limit(40);

            if (error || !data || data.length === 0) return null;

            // Pick a track whose artist is NOT in recent 15 artists
            const recentArtistsSet = new Set(this.state.recentArtists.slice(-15));
            const available = data.filter(t => !recentArtistsSet.has((t.artist || '').toLowerCase()));
            if (available.length === 0) return null;

            const selected = available[Math.floor(Math.random() * available.length)];
            return {
                artist: selected.artist,
                title: selected.track_name,
                genre: selected.genre,
                source: 'local_library'
            };
        } catch (e) {
            console.warn('[StateMachine] Local library lookup exception:', e);
            return null;
        }
    }

    async resolveTrackToYouTube(track, token) {
        const authHeaders = token === 'guest' ? {} : { Authorization: `Bearer ${token}` };
        const authParams = token === 'guest' ? `&key=${import.meta.env.VITE_YOUTUBE_API_KEY}` : '';
        const query = `${track.artist} ${track.title} official audio`;

        try {
            const url = `${YOUTUBE_API_BASE}/search?part=snippet&type=video&videoCategoryId=10&videoSyndicated=true&q=${encodeURIComponent(query)}&maxResults=1${authParams}`;
            const res = await fetch(url, { headers: authHeaders });
            const data = await res.json();

            if (data.items && data.items.length > 0) {
                const item = data.items[0];
                return {
                    id: item.id.videoId,
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

        const exclusionString = '-remix -cover -tiktok -parody';
        const fullQuery = `${queryParts.join(' ')} official audio ${exclusionString}`;

        console.log(`[StateMachine] Anti-Drift YouTube Audio Query: "${fullQuery}"`);

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
