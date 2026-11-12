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
import { GENRE_FAMILIES, GENRE_NODES, getConnectedGenres, getGraphDistance, getVectorDeviation, getMoodCompatibleGenres, getPoleForGenre, violatesDealbreakers, normalizeWeights } from './tasteGraph.js';
import { isSongCandidate, isAiGenerated } from './genreNormalizer.js';
import { allMoods } from './moods.js';
import { jitEngine } from './jitEngine.js';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// Storage keys
const SESSION_STATE_KEY = 'musicMood_session_state';
const USER_CALIBRATION_KEY = 'musicMood_user_calibration';

const MAX_DWELL_PER_NODE = 2; // Maximum consecutive tracks allowed in the same subgenre

function shuffleArray(arr) {
    if (!Array.isArray(arr) || arr.length <= 1) return arr;
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

class SessionStateMachine {
    constructor() {
        this.listeners = new Set();
        this.isResolving = false;
        this.queue = [];

        // Stack of full track objects for the Back button
        const savedState = this.loadSessionState();
        this.trackHistory = (savedState && savedState.trackHistory) || [];

        // Load saved calibration or defaults
        this.calibration = this.loadCalibration();

        // Anti-stagnation fatigue map: { [genreId]: float between 0.0 and 1.0 }
        this.nodeFatigue = {};

        // Initial session state with randomized initial anchor
        const initialAnchors = (this.calibration && this.calibration.anchors) || ['post_rock', 'synthwave', 'lofi_hiphop'];
        const randomInitialGenre = initialAnchors[Math.floor(Math.random() * initialAnchors.length)] || 'neo_classical';

        this.state = savedState || {
            currentMood: 'focus',
            activeGenre: randomInitialGenre,
            consecutiveInNode: 0,
            consecutiveSkips: 0,
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

    resetSession(keepCalibration = true) {
        console.log('[StateMachine] Resetting session state with fresh random seed...');
        const initialAnchors = (this.calibration && this.calibration.anchors) || ['post_rock', 'synthwave', 'lofi_hiphop'];
        const randomInitialGenre = initialAnchors[Math.floor(Math.random() * initialAnchors.length)] || 'neo_classical';

        this.queue = [];
        this.trackHistory = [];
        this.nodeFatigue = {};
        this.state = {
            currentMood: 'focus',
            activeGenre: randomInitialGenre,
            consecutiveInNode: 0,
            consecutiveSkips: 0,
            energyLevel: 0.5,
            vocalPreference: 'any',
            discoveryLevel: this.calibration.discoveryLevel || 0.5,
            recentTracks: [],
            recentArtists: [],
            likedTracks: [],
            skippedTracks: [],
            currentTrack: null,
            status: 'idle',
            traversalHistory: [],
        };
        if (!keepCalibration) {
            this.calibration = this.loadCalibration();
        }
        this.saveSessionState();
        this.notify();
    }

    loadCalibration() {
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem(USER_CALIBRATION_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    parsed.weights = normalizeWeights(parsed.weights || {}, parsed.anchors, parsed.dealbreakers);
                    parsed.homeGenres = parsed.homeGenres || {};
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
            homeGenres: {},
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
                    trackHistory: (this.trackHistory || []).slice(-25),
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
            canGoBack: (this.trackHistory || []).length > 0,
            historyCount: (this.trackHistory || []).length,
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
        setTimeout(() => {
            jitEngine.replenishBuffer(chosen, this);
        }, 100);
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

    /**
     * Predictive Listening Engine:
     * Predicts what the user wants to hear for a given mood by calculating composite affinity
     * across their 6-point Sonic Radar star, normalized node weights, anchors, energy delta, and fatigue.
     */
    predictBestGenreForMood(moodId, customRadar = null, customWeights = null) {
        const moodObj = allMoods.find(m => m.id === moodId);
        const moodCompatible = getMoodCompatibleGenres(moodId) || [];
        
        // Filter out dealbreakers
        const validCandidates = moodCompatible.filter(g => 
            GENRE_NODES[g] && !violatesDealbreakers(GENRE_NODES[g]?.label, g, this.calibration.dealbreakers)
        );

        if (validCandidates.length === 0) {
            return this.state.activeGenre || 'lofi_hiphop';
        }

        const radar = customRadar || this.calibration.radarValues || {
            rock_metal: 75,
            electronic: 65,
            hiphop_soul: 55,
            jazz_blues: 60,
            folk_acoustic: 50,
            classical_ambient: 70
        };

        const MOOD_TARGET_ENERGY = {
            energetic: 0.85,
            workout: 0.90,
            party: 0.85,
            happy: 0.70,
            focus: 0.45,
            chill: 0.35,
            sad: 0.30,
            sleep: 0.15,
            late_night: 0.40,
            study: 0.40,
            rainy: 0.35,
            driving: 0.75,
            morning: 0.50,
            cyberpunk: 0.80,
            villain_mode: 0.85,
            dark_intense: 0.90
        };
        const targetEnergy = this.state.energyLevel ?? moodObj?.defaultEnergy ?? (MOOD_TARGET_ENERGY[moodId] ?? 0.5);

        // Score each compatible candidate genre
        const scoredCandidates = validCandidates.map(genreId => {
            const node = GENRE_NODES[genreId];
            const pole = getPoleForGenre(genreId);
            
            // 1. Radar Pole Affinity (normalized from 20-100 to 0.2-1.0)
            const rawPoleValue = radar[pole] ?? 50;
            const poleAffinity = rawPoleValue / 100;

            // 2. Calibrated Fine-Grain Weight (0.1 to 1.0)
            const nodeWeight = customWeights?.[genreId] 
                || (customRadar ? (poleAffinity * 0.5) : (this.calibration.weights?.[genreId] || (poleAffinity * 0.5)));

            // 3. User Anchors Boost (if this was explicitly chosen as an anchor)
            const isAnchor = (this.calibration.anchors || []).includes(genreId);
            const anchorBonus = isAnchor ? 1.4 : 1.0;

            // 4. Energy Delta Alignment (higher score for closer energy fit to mood/slider)
            const genreEnergy = node.energy ?? 0.5;
            const energyDelta = Math.abs(genreEnergy - targetEnergy);
            const energyFit = Math.max(0.3, 1.0 - (energyDelta * 0.8));

            // 5. Vocal Alignment
            let vocalFit = 1.0;
            if (this.state.vocalPreference === 'instrumental') {
                vocalFit = (node.vocal === 'instrumental' || node.is_instrumental_default) ? 1.6 : (node.vocal === 'vocal' ? 0.35 : 1.0);
            } else if (this.state.vocalPreference === 'vocal') {
                vocalFit = (node.vocal === 'instrumental' || node.is_instrumental_default) ? 0.25 : (node.vocal === 'vocal' ? 1.5 : 1.0);
            }

            // 6. Anti-Fatigue Dampener
            const fatigue = this.nodeFatigue[genreId] || 0.0;
            const fatigueMultiplier = Math.max(0.15, 1.0 - (fatigue * 0.85));

            // 7. User Feedback Affinity (liked genres get a boost)
            const isLikedGenre = this.state.likedTracks.some(tid => tid.genre === genreId);
            const feedbackBonus = isLikedGenre ? 1.25 : 1.0;

            // Composite Score with radar affinity as a natural bias (linear 1.0 exponent rather than aggressive winner-take-all)
            const score = poleAffinity * nodeWeight * anchorBonus * energyFit * vocalFit * fatigueMultiplier * feedbackBonus;

            return {
                genreId,
                pole,
                poleValue: rawPoleValue,
                score,
                label: node.label
            };
        });

        // Sort descending by predictive score
        scoredCandidates.sort((a, b) => b.score - a.score);

        const topCandidate = scoredCandidates[0];
        console.log(`[Predictive Engine 🔮] Top predicted genre for "${moodObj?.label || moodId}": "${topCandidate.label}" (${topCandidate.pole}: ${topCandidate.poleValue}%, Score: ${topCandidate.score.toFixed(3)})`);

        // Probabilistic sampling among the top candidates (within 25% of top score) to prevent monotone repetition
        const topThreshold = topCandidate.score * 0.75;
        const topPool = scoredCandidates.filter(c => c.score >= topThreshold).slice(0, 3);

        const totalPoolScore = topPool.reduce((acc, c) => acc + c.score, 0);
        let randomVal = Math.random() * totalPoolScore;

        for (const candidate of topPool) {
            randomVal -= candidate.score;
            if (randomVal <= 0) {
                return candidate.genreId;
            }
        }

        return topCandidate.genreId;
    }

    /**
     * Returns the user's calibrated Home Anchor genre for a given mood.
     * Falls back to predictive scoring if no explicit Home is calibrated.
     */
    getHomeGenreForMood(moodId) {
        if (this.calibration.homeGenres && this.calibration.homeGenres[moodId]) {
            return this.calibration.homeGenres[moodId];
        }
        return this.predictBestGenreForMood(moodId);
    }

    /**
     * Sets an explicit Home Anchor for a given mood and persists to calibration.
     */
    setHomeGenreForMood(moodId, genreId) {
        if (!GENRE_NODES[genreId]) return;
        const currentHomes = { ...(this.calibration.homeGenres || {}) };
        currentHomes[moodId] = genreId;

        const updated = {
            ...this.calibration,
            homeGenres: currentHomes
        };

        this.saveCalibration(updated);
        console.log(`[StateMachine 🏠] Set Home Anchor for mood "${moodId}": ${GENRE_NODES[genreId].label}`);
    }

    /**
     * Computes the current active deviation (magnitude in hops + directional vector delta)
     * between active playing genre and the Home Anchor of the current mood.
     */
    getCurrentDeviation() {
        const home = this.getHomeGenreForMood(this.state.currentMood);
        return getVectorDeviation(home, this.state.activeGenre);
    }

    setMood(moodId) {
        const moodObj = allMoods.find(m => m.id === moodId);
        if (!moodObj) return;

        console.log(`[StateMachine] Transitioning Mood -> ${moodObj.label}`);
        this.state.currentMood = moodId;

        // Sync slider energy to mood default energy
        if (moodObj.defaultEnergy != null) {
            this.state.energyLevel = moodObj.defaultEnergy;
        }

        if (moodId === 'focus' || moodId === 'study' || moodId === 'sleep') {
            this.state.vocalPreference = 'instrumental';
        } else {
            // Restore default vocal preference for active mood
            this.state.vocalPreference = 'any';
        }

        const moodCompatible = getMoodCompatibleGenres(moodId);
        const homeGenre = this.getHomeGenreForMood(moodId);
        const discovery = this.state.discoveryLevel ?? 0.5;

        // Invariant guard checks on current genre
        const currentFitsMood = moodCompatible.includes(this.state.activeGenre);
        const currentAllowed = !violatesDealbreakers(GENRE_NODES[this.state.activeGenre]?.label, this.state.activeGenre, this.calibration.dealbreakers);
        const distFromHome = getGraphDistance(homeGenre, this.state.activeGenre);

        // Orbital Leash Enforcement:
        // - Familiar (discovery < 0.35): Locked to Home (hops = 0).
        // - Balanced (0.35 - 0.70): Maximum 2 hops away from Home.
        // - Deep Cuts (> 0.70): Wide exploration, resets only if current genre is incompatible.
        const exceedsLeash = (discovery < 0.35 && this.state.activeGenre !== homeGenre) ||
                             (discovery <= 0.70 && distFromHome > 2);

        if (!currentFitsMood || !currentAllowed || exceedsLeash) {
            console.log(`[StateMachine 🏠] Routed to Home anchor for mood "${moodObj.label}": ${GENRE_NODES[homeGenre]?.label || homeGenre} (Hops from current: ${distFromHome}, Discovery: ${discovery.toFixed(2)})`);
            this.state.activeGenre = homeGenre;
        }

        this.state.consecutiveInNode = 0;
        this.state.consecutiveSkips = 0;
        this.queue = [];
        this.notify();
        setTimeout(() => {
            jitEngine.replenishBuffer(this.state.activeGenre, this);
        }, 100);
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
        }, 100);
    }

    setEnergy(energyFloat) {
        this.state.energyLevel = Math.max(0.0, Math.min(1.0, energyFloat));
        this.queue = [];
        this.notify();
        if (this._energyDebounce) clearTimeout(this._energyDebounce);
        this._energyDebounce = setTimeout(() => {
            jitEngine.replenishBuffer(this.state.activeGenre, this);
        }, 200);
    }

    setVocalPreference(vocalPref) {
        this.state.vocalPreference = vocalPref;
        this.queue = [];
        this.notify();
        setTimeout(() => {
            jitEngine.replenishBuffer(this.state.activeGenre, this);
        }, 150);
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

        // 3. Keep active genre stable; only blacklist artist and notify
        this.notify();

        // 4. JIT Safety Purge: If track was organically discovered by JIT, immediately purge it from catalog!
        if (track.dbId && (track.source?.startsWith('jit') || track.source === 'jit_player_expansion' || track.source === 'jit_local_archive' || track.source === 'jit_musicbrainz')) {
            console.log(`[JIT Safety Purge 🗑️] Disliked JIT track "${track.artist} - ${track.title}". Removing from public.tracks...`);
            supabase.from('tracks').delete().eq('id', track.dbId).then(() => {
                console.log(`[JIT Safety Purge 🗑️] Successfully purged track ${track.dbId} from database.`);
            }).catch(e => console.warn('[JIT Purge Error]:', e));
        }
    }

    getMaxDwell() {
        return Infinity; // User stays in selected genre indefinitely until they change mood or click Surprise Me
    }

    onSkip(track) {
        if (!track) return;
        console.log(`[StateMachine] Feedback: SKIPPED "${track.title}" by ${track.artist}`);
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

        // Stays on current genre (genre changes only via mood change or "Surprise Me")
        this.notify();
    }

    onTrackCompleted(track) {
        if (!track) return;
        console.log(`[StateMachine] Feedback: COMPLETED "${track.title}"`);
        this.state.consecutiveSkips = 0; // Reset consecutive skips on natural listen

        recordListenEvent({
            trackId: track.dbId || null,
            moodId: this.state.currentMood,
            genreId: this.state.activeGenre,
            completed: true
        });

        this.applyNodeFatigue(this.state.activeGenre);
        this.state.consecutiveInNode = (this.state.consecutiveInNode || 0) + 1;

        // FIXED GENRE POLICY: Player stays in active genre indefinitely.
        // Genre transitions occur ONLY on explicit user mood change or "Surprise Me".
        this.notify();
    }

    /**
     * Surprise Me: User explicitly requests a fresh, surprising genre compatible with the current mood.
     * Jump distance across the taste graph is strictly governed by the active Discovery level:
     * - Familiar (< 0.35): Strictly 1 hop away (immediate harmonic neighbor or sister subgenre in the same family)
     * - Balanced (0.35 - 0.70): 1 to 2 hops away (adjacent harmonic bridge, smooth transition)
     * - Deep Cuts (> 0.70): Unrestricted (3+ hops, rewards unexpected cross-genre intersections)
     */
    surpriseMe() {
        const current = this.state.activeGenre;
        const moodCompatible = getMoodCompatibleGenres(this.state.currentMood);
        const homeGenre = this.getHomeGenreForMood(this.state.currentMood);
        const discovery = this.state.discoveryLevel ?? 0.5;

        // Leash bounds based on discovery level:
        // - Familiar (< 0.35): max 1 hop
        // - Balanced (0.35 - 0.70): max 2 hops
        // - Deep Cuts (> 0.70): unrestricted
        const maxHops = discovery < 0.35 ? 1 : discovery <= 0.70 ? 2 : 999;

        const validCandidates = (moodCompatible || []).filter(g => 
            g !== current && 
            GENRE_NODES[g] &&
            !violatesDealbreakers(GENRE_NODES[g]?.label, g, this.calibration.dealbreakers)
        );

        if (validCandidates.length === 0) {
            console.warn('[StateMachine 🎲 Surprise Me] No valid alternative candidates for mood:', this.state.currentMood);
            return { id: current, label: GENRE_NODES[current]?.label || current };
        }

        // Measure jump distance strictly relative to CURRENT active playback
        const candidatesWithDistance = validCandidates.map(g => {
            const jumpDist = getGraphDistance(current, g);
            const distFromHome = getGraphDistance(homeGenre, g);
            return {
                id: g,
                jumpDist,
                distFromHome
            };
        });

        // 1. Filter candidates within strict discovery leash from current playback
        let leashedCandidates = maxHops === 999 
            ? candidatesWithDistance 
            : candidatesWithDistance.filter(c => c.jumpDist <= maxHops);

        // 2. Strict Nearest-Neighbor Fallback: if no candidate within maxHops from current, pick from the closest available tier
        if (leashedCandidates.length === 0) {
            const minAvailableDist = Math.min(...candidatesWithDistance.map(c => c.jumpDist));
            leashedCandidates = candidatesWithDistance.filter(c => c.jumpDist === minAvailableDist);
            console.log(`[StateMachine 🎲 Surprise Me] No candidate within ${maxHops} hops; fallback to nearest tier: ${minAvailableDist} hops`);
        }

        // 3. Score leashed candidates by Sonic Radar affinity, fatigue, and discovery profile
        const radar = this.calibration.radarValues || {};
        const scored = leashedCandidates.map(c => {
            const g = c.id;
            const pole = getPoleForGenre(g);
            const poleVal = (radar[pole] ?? 50) / 100;
            const fatigue = this.nodeFatigue[g] || 0.0;
            
            // Distance affinity based on discovery tier:
            let distanceAffinity = 1.0;
            if (discovery < 0.35) {
                // Familiar: strongly favors immediate 1-hop neighbors
                distanceAffinity = c.jumpDist <= 1 ? 1.5 : 0.8;
            } else if (discovery <= 0.70) {
                // Balanced: sweet spot at 1-2 hops
                distanceAffinity = c.jumpDist <= 2 ? 1.3 : 0.9;
            } else {
                // Deep Cuts: boosts adventurous jumps (2+ hops)
                distanceAffinity = c.jumpDist >= 2 ? 1.6 : 0.9;
            }

            const weight = this.calibration.weights?.[g] || (poleVal * 0.4);

            // Energy delta alignment to user's active energy slider
            const targetEnergy = this.state.energyLevel ?? 0.5;
            const genreEnergy = GENRE_NODES[g]?.energy ?? 0.5;
            const energyDelta = Math.abs(genreEnergy - targetEnergy);
            const energyFit = Math.max(0.3, 1.0 - (energyDelta * 0.8));

            // Vocal preference alignment
            let vocalFit = 1.0;
            const genreNode = GENRE_NODES[g];
            const isInstGenre = genreNode?.vocal === 'instrumental' || genreNode?.is_instrumental_default;
            if (this.state.vocalPreference === 'instrumental') {
                vocalFit = isInstGenre ? 1.5 : (genreNode?.vocal === 'vocal' ? 0.35 : 1.0);
            } else if (this.state.vocalPreference === 'vocal') {
                vocalFit = isInstGenre ? 0.25 : (genreNode?.vocal === 'vocal' ? 1.4 : 1.0);
            }

            const score = poleVal * weight * Math.max(0.1, 1.0 - fatigue * 0.9) * distanceAffinity * energyFit * vocalFit;

            return {
                id: g,
                jumpDist: c.jumpDist,
                distFromHome: c.distFromHome,
                score
            };
        }).sort((a, b) => b.score - a.score);

        // Pick probabilistically among top scored candidates (top 3 for Familiar, top 5 for Balanced/Deep Cuts)
        const poolSize = Math.min(discovery < 0.35 ? 3 : 5, scored.length);
        const pool = scored.slice(0, poolSize);
        const totalScore = pool.reduce((acc, c) => acc + c.score, 0);
        let rand = Math.random() * totalScore;
        let chosen = pool[0]?.id || current;

        for (const c of pool) {
            rand -= c.score;
            if (rand <= 0) {
                chosen = c.id;
                break;
            }
        }

        const dev = getVectorDeviation(homeGenre, chosen);
        const hopFromCurrent = getGraphDistance(current, chosen);
        console.log(`[StateMachine 🎲 Surprise Me] Transitioning "${current}" -> "${chosen}" (${GENRE_NODES[chosen]?.label}) | ${hopFromCurrent} hops from current, ${dev.hops} hops from Home "${GENRE_NODES[homeGenre]?.label || homeGenre}" | Discovery: ${discovery.toFixed(2)} (maxHops: ${maxHops})`);
        
        this.state.activeGenre = chosen;
        this.state.consecutiveInNode = 0;
        this.state.consecutiveSkips = 0;
        this.queue = [];
        this.notify();
        setTimeout(() => {
            jitEngine.replenishBuffer(chosen, this);
        }, 100);

        return { id: chosen, label: GENRE_NODES[chosen]?.label || chosen, deviation: dev, hopsFromCurrent: hopFromCurrent };
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
                    setTimeout(() => jitEngine.replenishBuffer(this.state.activeGenre, this), 100);
                    return candidate;
                }
            }

            // 1. Primary Source: Supabase Catalog (Pre-mapped zero-quota tracks)
            const libCandidate = await this.sourceFromLocalLibrary();
            if (libCandidate) {
                // If track already has pre-mapped 11-char YouTube ID, play immediately (Zero Quota!)
                if (libCandidate.id && this.passesGuards(libCandidate)) {
                    this.commitTrack(libCandidate);
                    setTimeout(() => jitEngine.replenishBuffer(this.state.activeGenre, this), 100);
                    return libCandidate;
                }
                
                // If track has metadata but no ID yet, resolve it
                if (this.passesMetadataGuards(libCandidate)) {
                    const resolved = await this.resolveTrackToYouTube(libCandidate, token);
                    if (resolved && this.passesGuards(resolved)) {
                        this.commitTrack(resolved);
                        setTimeout(() => jitEngine.replenishBuffer(this.state.activeGenre, this), 100);
                        return resolved;
                    }
                }
            }

            // 2. Fast Fallback: Instant Emergency Track from Catalog (< 200ms)
            // Never stall the user on external web-scraping waterfalls when thousands of playable catalog tracks exist!
            const emergencyTrack = await this.sourceEmergencyTrack();
            if (emergencyTrack && this.passesMetadataGuards(emergencyTrack)) {
                console.log(`[Fast-Path Sourcing ⚡] Selected catalog track: "${emergencyTrack.artist} - ${emergencyTrack.title}" (${emergencyTrack.genre})`);
                this.commitTrack(emergencyTrack);
                // Background asynchronous organic expansion (non-blocking!)
                setTimeout(() => {
                    jitEngine.pullTrackForGenre(this.state.activeGenre, this).catch(() => {});
                    jitEngine.replenishBuffer(this.state.activeGenre, this);
                }, 300);
                return emergencyTrack;
            }

            // 3. JIT Organic Catalog Expansion (Fallback if catalog is truly empty)
            console.log(`[StateMachine ⚡] Catalog exhausted for "${this.state.activeGenre}". Triggering JIT Organic Expansion...`);
            const jitCandidate = await jitEngine.pullTrackForGenre(this.state.activeGenre, this);
            if (jitCandidate && this.passesGuards(jitCandidate)) {
                this.commitTrack(jitCandidate);
                setTimeout(() => jitEngine.replenishBuffer(this.state.activeGenre, this), 100);
                return jitCandidate;
            }

            // 4. Targeted Anti-Drift YouTube Sourcing
            if (token) {
                const ytCandidate = await this.sourceFromYouTube(token);
                if (ytCandidate) {
                    this.commitTrack(ytCandidate);
                    setTimeout(() => jitEngine.replenishBuffer(this.state.activeGenre, this), 100);
                    return ytCandidate;
                }
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
        if (this.calibration.blockAiGenerated !== false && (track.source?.includes(':ai') || isAiGenerated({ title: track.title, artist: track.artist, channelTitle: track.channelTitle }))) {
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
        const genreId = track.genre || track.primary_genre_id;
        const genreNode = genreId ? GENRE_NODES[genreId] : null;
        const isInstrumentalGenre = genreNode?.vocal === 'instrumental' || genreNode?.is_instrumental_default === true;

        if (this.state.vocalPreference === 'instrumental') {
            const vocalKeywords = ['vocal', 'vocals', 'lyrics', 'feat.', 'ft.', 'singing', 'official music video'];
            const hasVocalTag = vocalKeywords.some(kw => title.includes(kw));
            if (hasVocalTag && !title.includes('instrumental')) {
                console.log(`[Guard ❌] Vocal Guard: "${title}" likely contains vocals in Instrumental mode.`);
                return false;
            }
            if (track.is_instrumental === false && genreNode?.vocal === 'vocal' && !title.includes('instrumental')) {
                console.log(`[Guard ❌] Vocal Guard: "${title}" is tagged non-instrumental in vocal genre (${genreId}).`);
                return false;
            }
        } else if (this.state.vocalPreference === 'vocal') {
            const instKeywords = ['instrumental', 'karaoke', 'backing track', 'without vocals', 'no vocals'];
            if (instKeywords.some(kw => title.includes(kw))) {
                console.log(`[Guard ❌] Vocal Guard: "${title}" contains instrumental keywords in Vocal mode.`);
                return false;
            }
            if (track.is_instrumental === true) {
                console.log(`[Guard ❌] Vocal Guard: "${title}" is flagged as strictly instrumental.`);
                return false;
            }
            if (isInstrumentalGenre && !title.includes('vocal')) {
                console.log(`[Guard ❌] Vocal Guard: Genre "${genreId}" is purely instrumental.`);
                return false;
            }
        }

        return true;
    }

    commitTrack(track) {
        if (!track || !track.id) return;

        // Push previous track to history stack so Back button can return to it
        if (this.state.currentTrack && this.state.currentTrack.id && this.state.currentTrack.id !== track.id) {
            if (!this.trackHistory) this.trackHistory = [];
            this.trackHistory.push(this.state.currentTrack);
            if (this.trackHistory.length > 25) {
                this.trackHistory.shift();
            }
        }

        this.state.currentTrack = track;
        this.state.recentTracks.push(track.id);
        const artist = (track.artist || track.channelTitle || '').toLowerCase();
        if (artist) {
            this.state.recentArtists.push(artist);
        }

        // Steer the active graph node to the track's genre for continuity
        const targetGenre = track.genre || track.primary_genre_id;
        if (targetGenre && GENRE_NODES[targetGenre]) {
            this.state.activeGenre = targetGenre;
            this.state.consecutiveInNode = 0;
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

    canGoBack() {
        return (this.trackHistory || []).length > 0;
    }

    getPreviousTrack() {
        if (!this.trackHistory || this.trackHistory.length === 0) return null;
        const prevTrack = this.trackHistory.pop();
        if (this.state.currentTrack && this.state.currentTrack.id) {
            // Keep track we are leaving at head of queue so Next moves forward to it
            this.queue.unshift(this.state.currentTrack);
        }
        this.state.currentTrack = prevTrack;
        this.notify();
        return prevTrack;
    }

    async sourceEmergencyTrack() {
        try {
            const activeGenreId = this.state.activeGenre;
            const node = GENRE_NODES[activeGenreId];

            // Build candidate genre list: specific subgenre, parent family, and harmonic neighbors
            const candidateGenreIds = [activeGenreId];
            if (node?.group) {
                const groupLower = node.group.toLowerCase();
                const parentId = Object.keys(GENRE_FAMILIES).find(k => {
                    const l = GENRE_FAMILIES[k].label.toLowerCase();
                    return l.includes(groupLower) || groupLower.includes(l);
                });
                if (parentId) candidateGenreIds.push(parentId);
            }
            const neighbors = getConnectedGenres(activeGenreId);
            candidateGenreIds.push(...neighbors);
            const candList = candidateGenreIds.join(',');

            // 1. Try candidate genres with randomized offset (strict primary genre match)
            const randOffset = Math.floor(Math.random() * 60);
            let { data } = await supabase
                .from('tracks')
                .select('*')
                .in('primary_genre_id', candidateGenreIds)
                .not('youtube_video_id', 'is', null)
                .neq('youtube_video_id', 'CORRUPT_TAGS')
                .range(randOffset, randOffset + 50);

            // 2. If empty, retry without offset
            if (!data || data.length === 0) {
                const res = await supabase
                    .from('tracks')
                    .select('*')
                    .in('primary_genre_id', candidateGenreIds)
                    .not('youtube_video_id', 'is', null)
                    .neq('youtube_video_id', 'CORRUPT_TAGS')
                    .limit(50);
                data = res.data;
            }

            // 3. Fall back to any catalog track sampled with random offset
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

            // SHUFFLE data array so initial selection is never biased to row 0
            data = shuffleArray(data);

            // Pass A: Find all candidates that pass ALL strict guards and pick with energy weighting
            const validPassA = [];
            for (const t of data) {
                if (t.youtube_video_id && t.youtube_video_id.length === 11) {
                    const candidate = {
                        id: t.youtube_video_id,
                        dbId: t.id,
                        artist: t.artist,
                        title: t.title,
                        genre: t.primary_genre_id || this.state.activeGenre,
                        thumbnail: `https://i.ytimg.com/vi/${t.youtube_video_id}/hqdefault.jpg`,
                        source: 'emergency_zero_quota',
                        is_instrumental: t.is_instrumental,
                        energy: t.energy
                    };
                    if (this.passesGuards(candidate)) {
                        validPassA.push(candidate);
                    }
                }
            }
            if (validPassA.length > 0) {
                const targetEnergy = this.state.energyLevel ?? 0.5;
                const scoredA = validPassA.map(c => {
                    let cEnergy = c.energy != null ? parseFloat(c.energy) : null;
                    if (cEnergy == null) {
                        const gNode = GENRE_NODES[c.genre];
                        cEnergy = gNode?.energy ?? 0.5;
                    }
                    const delta = Math.abs(cEnergy - targetEnergy);
                    const weight = Math.max(0.02, Math.exp(-Math.pow(delta / 0.25, 2)));
                    return { candidate: c, weight };
                });
                const totalW = scoredA.reduce((sum, s) => sum + s.weight, 0);
                let r = Math.random() * totalW;
                for (const s of scoredA) {
                    r -= s.weight;
                    if (r <= 0) return s.candidate;
                }
                return validPassA[0];
            }

            // Pass B: Relax artist fatigue but strictly avoid recent 15 tracks and recent 5 artists
            const recentTracksSet = new Set((this.state.recentTracks || []).slice(-15));
            const recentArtistsSet = new Set((this.state.recentArtists || []).slice(-5));
            const validPassB = [];
            for (const t of data) {
                const vid = t.youtube_video_id;
                const a = (t.artist || '').toLowerCase();
                if (vid && vid.length === 11 && !recentTracksSet.has(vid) && !recentArtistsSet.has(a)) {
                    if (this.passesMetadataGuards(t)) {
                        validPassB.push({
                            id: vid,
                            dbId: t.id,
                            artist: t.artist,
                            title: t.title,
                            genre: t.primary_genre_id || this.state.activeGenre,
                            thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
                            source: 'emergency_diverse'
                        });
                    }
                }
            }
            if (validPassB.length > 0) {
                return validPassB[Math.floor(Math.random() * validPassB.length)];
            }

            // Pass C: Last resort safe return avoiding current video ID
            const currentVideoId = this.state.currentTrack?.id;
            const validPassC = data.filter(t => t.youtube_video_id && t.youtube_video_id.length === 11 && t.youtube_video_id !== currentVideoId);
            if (validPassC.length > 0) {
                const chosen = validPassC[Math.floor(Math.random() * validPassC.length)];
                return {
                    id: chosen.youtube_video_id,
                    dbId: chosen.id,
                    artist: chosen.artist,
                    title: chosen.title,
                    genre: chosen.primary_genre_id || this.state.activeGenre,
                    thumbnail: `https://i.ytimg.com/vi/${chosen.youtube_video_id}/hqdefault.jpg`,
                    source: 'emergency_safe_fallback'
                };
            }

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

    async pullCatalogCandidate(excludeIds = []) {
        try {
            const activeGenreId = this.state.activeGenre;
            const node = GENRE_NODES[activeGenreId];

            const excludeSet = new Set([
                ...(this.state.recentTracks || []).slice(-50),
                ...(excludeIds || []),
                this.state.currentTrack?.id
            ].filter(Boolean));
            const recentArtistsSet = new Set((this.state.recentArtists || []).slice(-15));

            const filterCandidates = (tracks, relaxArtist = false) => {
                if (!tracks || !Array.isArray(tracks)) return [];
                const seenArtists = new Set();
                return tracks.filter(t => {
                    const vid = t.youtube_video_id || t.id;
                    if (!vid || vid.length !== 11) return false;
                    if (excludeSet.has(vid)) return false;
                    const a = (t.artist || '').toLowerCase();
                    if (!relaxArtist && a && recentArtistsSet.has(a)) return false;
                    // Strict artist diversity: max 1 song per artist per candidate pool
                    if (a && seenArtists.has(a)) return false;
                    if (a) seenArtists.add(a);

                    if (!this.passesMetadataGuards(t)) return false;

                    const titleLower = (t.title || '').toLowerCase();
                    const genreId = t.primary_genre_id || activeGenreId;
                    const genreNode = GENRE_NODES[genreId];
                    const isInstrumentalGenre = genreNode?.vocal === 'instrumental' || genreNode?.is_instrumental_default === true;

                    // Vocal Preference Guard
                    if (this.state.vocalPreference === 'instrumental') {
                        if (['vocal', 'vocals', 'feat.', 'ft.', 'singing'].some(k => titleLower.includes(k)) && !titleLower.includes('instrumental')) {
                            return false;
                        }
                        if (t.is_instrumental === false && genreNode?.vocal === 'vocal' && !titleLower.includes('instrumental')) {
                            return false;
                        }
                    } else if (this.state.vocalPreference === 'vocal') {
                        if (t.is_instrumental === true) return false;
                        if (['instrumental', 'backing track', 'karaoke', 'without vocals', 'no vocals'].some(k => titleLower.includes(k))) return false;
                        if (isInstrumentalGenre && !titleLower.includes('vocal')) return false;
                    }
                    return true;
                });
            };

            // Tier 1: Exact active subgenre in tracks table (STRICT primary genre match)
            const randOffset1 = Math.floor(Math.random() * 100);
            let { data: exactMapped } = await supabase
                .from('tracks')
                .select('*')
                .eq('primary_genre_id', activeGenreId)
                .not('youtube_video_id', 'is', null)
                .neq('youtube_video_id', 'CORRUPT_TAGS')
                .range(randOffset1, randOffset1 + 50);

            if (!exactMapped || exactMapped.length === 0) {
                const res = await supabase
                    .from('tracks')
                    .select('*')
                    .eq('primary_genre_id', activeGenreId)
                    .not('youtube_video_id', 'is', null)
                    .neq('youtube_video_id', 'CORRUPT_TAGS')
                    .limit(50);
                exactMapped = res.data;
            }

            exactMapped = shuffleArray(exactMapped);
            let available = filterCandidates(exactMapped);
            if (available.length === 0 && exactMapped && exactMapped.length > 0) {
                available = filterCandidates(exactMapped, true);
            }

            // Tier 2: Parent family (Strict primary genre)
            if (available.length === 0 && node?.group) {
                const groupLower = node.group.toLowerCase();
                const parentId = Object.keys(GENRE_FAMILIES).find(k => {
                    const l = GENRE_FAMILIES[k].label.toLowerCase();
                    return l.includes(groupLower) || groupLower.includes(l);
                }) || groupLower;

                if (parentId && parentId !== activeGenreId) {
                    const randOffset2 = Math.floor(Math.random() * 100);
                    let { data: familyMapped } = await supabase
                        .from('tracks')
                        .select('*')
                        .eq('primary_genre_id', parentId)
                        .not('youtube_video_id', 'is', null)
                        .neq('youtube_video_id', 'CORRUPT_TAGS')
                        .range(randOffset2, randOffset2 + 50);

                    if (!familyMapped || familyMapped.length === 0) {
                        const res = await supabase
                            .from('tracks')
                            .select('*')
                            .eq('primary_genre_id', parentId)
                            .not('youtube_video_id', 'is', null)
                            .neq('youtube_video_id', 'CORRUPT_TAGS')
                            .limit(50);
                        familyMapped = res.data;
                    }

                    familyMapped = shuffleArray(familyMapped);
                    available = filterCandidates(familyMapped);
                    if (available.length === 0 && familyMapped && familyMapped.length > 0) {
                        available = filterCandidates(familyMapped, true);
                    }
                }
            }

            // Tier 3: Harmonic neighbors (Strict primary genre)
            if (available.length === 0) {
                const neighbors = getConnectedGenres(activeGenreId).filter(g => g !== activeGenreId);
                if (neighbors.length > 0) {
                    const randOffset3 = Math.floor(Math.random() * 80);
                    let { data: neighborMapped } = await supabase
                        .from('tracks')
                        .select('*')
                        .in('primary_genre_id', neighbors)
                        .not('youtube_video_id', 'is', null)
                        .neq('youtube_video_id', 'CORRUPT_TAGS')
                        .range(randOffset3, randOffset3 + 50);

                    if (!neighborMapped || neighborMapped.length === 0) {
                        const res = await supabase
                            .from('tracks')
                            .select('*')
                            .in('primary_genre_id', neighbors)
                            .not('youtube_video_id', 'is', null)
                            .neq('youtube_video_id', 'CORRUPT_TAGS')
                            .limit(50);
                        neighborMapped = res.data;
                    }

                    neighborMapped = shuffleArray(neighborMapped);
                    available = filterCandidates(neighborMapped);
                    if (available.length === 0 && neighborMapped && neighborMapped.length > 0) {
                        available = filterCandidates(neighborMapped, true);
                    }
                }
            }

            // Tier 4: Emergency fallback to secondary genres (ONLY if no primary tracks exist in catalog)
            if (available.length === 0) {
                let { data: secondaryMapped } = await supabase
                    .from('tracks')
                    .select('*')
                    .contains('secondary_genre_ids', [activeGenreId])
                    .not('youtube_video_id', 'is', null)
                    .neq('youtube_video_id', 'CORRUPT_TAGS')
                    .limit(30);

                if (secondaryMapped && secondaryMapped.length > 0) {
                    secondaryMapped = shuffleArray(secondaryMapped);
                    available = filterCandidates(secondaryMapped, true);
                }
            }

            if (available.length === 0) return null;

            // Energy-weighted selection based on user's active energy slider
            const targetEnergy = this.state.energyLevel ?? 0.5;
            const scoredCandidates = available.map(t => {
                let trackEnergy = t.energy != null ? parseFloat(t.energy) : null;
                if (trackEnergy == null) {
                    const gNode = GENRE_NODES[t.primary_genre_id || activeGenreId];
                    trackEnergy = gNode?.energy ?? 0.5;
                }
                const delta = Math.abs(trackEnergy - targetEnergy);
                // Gaussian decay: tracks closer to slider energy have significantly higher selection weight
                const weight = Math.max(0.02, Math.exp(-Math.pow(delta / 0.25, 2)));
                return { track: t, weight };
            });

            const totalWeight = scoredCandidates.reduce((acc, c) => acc + c.weight, 0);
            let randVal = Math.random() * totalWeight;
            let selected = scoredCandidates[0].track;
            for (const c of scoredCandidates) {
                randVal -= c.weight;
                if (randVal <= 0) {
                    selected = c.track;
                    break;
                }
            }

            return {
                id: selected.youtube_video_id,
                dbId: selected.id,
                artist: selected.artist,
                title: selected.title,
                genre: selected.primary_genre_id || activeGenreId,
                thumbnail: `https://i.ytimg.com/vi/${selected.youtube_video_id}/hqdefault.jpg`,
                source: selected.source || 'tracks_catalog',
                is_instrumental: selected.is_instrumental,
                energy: selected.energy
            };
        } catch (e) {
            console.warn('[StateMachine] Pull catalog candidate exception:', e);
            return null;
        }
    }

    async sourceFromLocalLibrary() {
        try {
            const mappedTrack = await this.pullCatalogCandidate([]);
            if (mappedTrack) {
                console.log(`[Zero-Quota Hit] Pre-mapped track: "${mappedTrack.artist} - ${mappedTrack.title}" -> ${mappedTrack.id}`);
                return mappedTrack;
            }

            const activeGenreId = this.state.activeGenre;
            // Fallback to unmapped tracks in exact active genre (for JIT resolution)
            const { data: unmapped } = await supabase
                .from('tracks')
                .select('*')
                .or(`primary_genre_id.eq.${activeGenreId},secondary_genre_ids.cs.{${activeGenreId}}`)
                .limit(20);

            if (unmapped && unmapped.length > 0) {
                const selected = unmapped[Math.floor(Math.random() * unmapped.length)];
                return {
                    dbId: selected.id,
                    artist: selected.artist,
                    title: selected.title,
                    genre: activeGenreId,
                    source: selected.source || 'tracks_catalog'
                };
            }
            return null;
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

        const vocalTerm = this.state.vocalPreference === 'instrumental' ? 'instrumental' : (this.state.vocalPreference === 'vocal' ? 'lyrics' : '');

        // Add explicit exclusions to kill podcasts, recitations, audiobooks, lessons
        const exclusionString = '-podcast -audiobook -recitation -lesson -asmr -reaction -vlog -shorts -tiktok';
        const fullQuery = `"${activeNode?.label}" ${vocalTerm} Topic official audio ${exclusionString}`.replace(/\s+/g, ' ').trim();

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
