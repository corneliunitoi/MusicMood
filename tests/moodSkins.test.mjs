import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleMoods } from '../src/services/moods.js';
import { SKINS, SKIN_MOODS, DEFAULT_LOOK, skinMoodFor, resolveSkinId, normalizeLook, loadLook, saveLook } from '../src/services/moodSkins.js';

test('every skin mood is a visible mood and has a skin', () => {
    const ids = visibleMoods.map(m => m.id);
    for (const id of SKIN_MOODS) {
        assert.ok(ids.includes(id), `${id} is not a visible mood`);
        assert.ok(SKINS[id], `${id} has no skin`);
    }
    assert.ok(SKINS.classic);
});

test('moods without a skin keep the current look; retired moods follow their replacement', () => {
    assert.equal(skinMoodFor('chill'), 'chill');
    assert.equal(skinMoodFor('cyberpunk'), 'cyberpunk');
    assert.equal(skinMoodFor('late_night'), null);
    assert.equal(skinMoodFor('cinematic_epic'), null);
    assert.equal(skinMoodFor('workout'), 'energetic');
    assert.equal(skinMoodFor('villain_mode'), null);
});

test('auto mode follows the last skin mood and falls back to Classic when switched off', () => {
    assert.equal(resolveSkinId('rainy', DEFAULT_LOOK), 'rainy');
    assert.equal(resolveSkinId(null, DEFAULT_LOOK), 'classic');
    assert.equal(resolveSkinId('rainy', { ...DEFAULT_LOOK, off: ['rainy'] }), 'classic');
    assert.equal(resolveSkinId('party', { ...DEFAULT_LOOK, off: ['rainy'] }), 'party');
});

test('fixed mode always uses the locked look', () => {
    assert.equal(resolveSkinId('party', { mode: 'fixed', fixed: 'focus', off: [] }), 'focus');
    assert.equal(resolveSkinId('party', { mode: 'fixed', fixed: 'classic', off: [] }), 'classic');
    assert.equal(resolveSkinId('party', { mode: 'fixed', fixed: 'nope', off: [] }), 'classic');
});

test('stored settings are cleaned and round-trip', () => {
    assert.deepEqual(normalizeLook({ mode: 'weird', fixed: 'nope', off: ['sad', 'nope'] }), { mode: 'auto', fixed: 'classic', off: ['sad'] });
    assert.deepEqual(normalizeLook(null), DEFAULT_LOOK);
    saveLook({ mode: 'fixed', fixed: 'romantic', off: ['happy'] });
    assert.deepEqual(loadLook(), { mode: 'fixed', fixed: 'romantic', off: ['happy'] });
    localStorage.setItem('musicMood_look', '{broken');
    assert.deepEqual(loadLook(), DEFAULT_LOOK);
});
