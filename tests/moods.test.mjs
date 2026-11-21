import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleMoods, retiredMoods, allMoods } from '../src/services/moods.js';
import { GENRE_NODES, MOOD_GENRE_MAP, MOOD_DEFAULT_HOME, MOOD_ALIASES, resolveMoodId, getMoodCompatibleGenres } from '../src/services/tasteGraph.js';

const visibleIds = visibleMoods.map(m => m.id);

test('every visible mood has a genre mapping and a default home', () => {
    for (const id of visibleIds) {
        assert.ok(MOOD_GENRE_MAP[id]?.length >= 3, `${id}: needs at least 3 compatible genres`);
        assert.ok(MOOD_DEFAULT_HOME[id], `${id}: missing default home`);
    }
});

test('mood mappings only reference existing genres', () => {
    for (const [mood, genres] of Object.entries(MOOD_GENRE_MAP)) {
        for (const g of genres) assert.ok(GENRE_NODES[g], `${mood} -> unknown genre "${g}"`);
    }
});

test('each default home is an existing genre within its mood', () => {
    for (const [mood, home] of Object.entries(MOOD_DEFAULT_HOME)) {
        assert.ok(GENRE_NODES[home], `${mood}: unknown home "${home}"`);
        assert.ok(MOOD_GENRE_MAP[mood]?.includes(home), `${mood}: home "${home}" is not one of its genres`);
    }
});

test('no mapping exists for a mood that is not visible', () => {
    for (const id of Object.keys(MOOD_GENRE_MAP)) assert.ok(visibleIds.includes(id), `orphan mapping "${id}"`);
});

test('every retired mood redirects to a visible mood', () => {
    for (const m of retiredMoods) {
        assert.ok(MOOD_ALIASES[m.id], `${m.id}: no redirect`);
        assert.ok(visibleIds.includes(MOOD_ALIASES[m.id]), `${m.id} -> ${MOOD_ALIASES[m.id]} is not visible`);
    }
});

test('all 30 known mood ids resolve to a mapped mood', () => {
    assert.equal(allMoods.length, 30);
    for (const m of allMoods) assert.ok(MOOD_GENRE_MAP[resolveMoodId(m.id)], `${m.id} does not resolve`);
});

test('retired moods use the genres of the mood they merged into', () => {
    assert.deepEqual(getMoodCompatibleGenres('workout'), MOOD_GENRE_MAP.energetic);
    assert.deepEqual(getMoodCompatibleGenres('study'), MOOD_GENRE_MAP.focus);
    assert.deepEqual(getMoodCompatibleGenres('cinematic_ambient'), MOOD_GENRE_MAP.sleep);
});

test('an uncalibrated listener gets the curated default home', async () => {
    const { sessionEngine } = await import('../src/services/sessionStateMachine.js');
    const saved = sessionEngine.calibration;
    sessionEngine.calibration = { ...saved, radarValues: undefined, homeGenres: {}, dealbreakers: [] };
    try {
        for (const id of ['late_night', 'driving', 'cinematic_epic']) {
            assert.equal(sessionEngine.getHomeGenreForMood(id), MOOD_DEFAULT_HOME[id]);
        }
        assert.equal(sessionEngine.getHomeGenreForMood('workout'), MOOD_DEFAULT_HOME.energetic, 'retired mood uses its replacement');
    } finally {
        sessionEngine.calibration = saved;
    }
});
