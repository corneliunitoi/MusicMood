import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleMoods } from '../src/services/moods.js';
import { SKINS, SKIN_MOODS, RICH_SKINS, RICH_MOOD_MAP, DEFAULT_LOOK, skinMoodFor, richSkinFor, resolveSkinId, normalizeLook, toStoredLook, loadLook, saveLook } from '../src/services/moodSkins.js';

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
    assert.deepEqual(normalizeLook({ mode: 'weird', fixed: 'nope', off: ['sad', 'nope'] }), { mode: 'auto', fixed: 'classic', off: ['sad'], rich: false });
    assert.deepEqual(normalizeLook(null), DEFAULT_LOOK);
    saveLook({ mode: 'fixed', fixed: 'romantic', off: ['happy'] });
    assert.deepEqual(loadLook(), { mode: 'fixed', fixed: 'romantic', off: ['happy'], rich: false });
    localStorage.setItem('musicMood_look', '{broken');
    assert.deepEqual(loadLook(), DEFAULT_LOOK);
});

test('every mood in the rich map points at a real rich theme, and each theme has scenery and a font', () => {
    for (const [mood, skin] of Object.entries(RICH_MOOD_MAP)) assert.ok(RICH_SKINS[skin], `${mood} -> ${skin}`);
    for (const [id, skin] of Object.entries(RICH_SKINS)) {
        assert.ok(id.startsWith('rich_'));
        assert.ok(skin.display && skin.scenery && skin.c1 && skin.accent, id);
    }
    assert.equal(richSkinFor('late_night'), 'rich_night');
    assert.equal(richSkinFor('cottagecore'), 'rich_meadow');
    assert.equal(richSkinFor('workout'), 'rich_poster');
    assert.equal(richSkinFor('villain_mode'), 'rich_noir');
    assert.equal(richSkinFor('not_a_mood'), null);
});

test('rich themes: auto mode follows the mood, off switches fall back to Classic, fixed locks one', () => {
    const rich = { ...DEFAULT_LOOK, rich: true };
    assert.equal(resolveSkinId('happy', rich, 'rich_night'), 'rich_night');
    assert.equal(resolveSkinId('happy', rich, null), 'classic');
    assert.equal(resolveSkinId('happy', { ...rich, off: ['rich_night'] }, 'rich_night'), 'classic');
    assert.equal(resolveSkinId('happy', { mode: 'fixed', fixed: 'rich_neon', off: [], rich: false }, null), 'rich_neon');
    assert.equal(resolveSkinId('happy', DEFAULT_LOOK, 'rich_night'), 'happy');
});

test('rich settings are saved in the old four-field shape so older app versions still work', () => {
    const stored = toStoredLook({ mode: 'auto', fixed: 'classic', off: ['rich_noir'], rich: true });
    assert.deepEqual(stored, { mode: 'auto', fixed: 'classic', off: ['rich_noir', 'rich'] });
    assert.deepEqual(normalizeLook(stored), { mode: 'auto', fixed: 'classic', off: ['rich_noir'], rich: true });
    assert.deepEqual(toStoredLook({ mode: 'fixed', fixed: 'rich_night', off: [], rich: false }), { mode: 'fixed', fixed: 'rich_night', off: [] });
    // An older app (basic skins only) reads the same data and falls back to Classic / ignores the rich entries.
    const oldNormalize = (l) => ({ mode: l.mode === 'fixed' ? 'fixed' : 'auto', fixed: SKINS[l.fixed] ? l.fixed : 'classic', off: l.off.filter(id => SKIN_MOODS.includes(id)) });
    assert.deepEqual(oldNormalize({ mode: 'fixed', fixed: 'rich_night', off: [] }), { mode: 'fixed', fixed: 'classic', off: [] });
    assert.deepEqual(oldNormalize(stored), { mode: 'auto', fixed: 'classic', off: [] });
});
