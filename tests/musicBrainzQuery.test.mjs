import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTagQuery, titleIsJustGenreWords } from '../src/services/musicBrainzService.js';

test('multi-word tags are quoted so the second word is not searched as a song title', () => {
    assert.equal(buildTagQuery('quiet storm'), 'tag:"quiet storm"');
    assert.equal(buildTagQuery('  acoustic   folk '), 'tag:"acoustic folk"');
    assert.equal(buildTagQuery('rock "n" roll'), 'tag:"rock n roll"');
});

test('titles made only of the genre words are rejected, real titles are kept', () => {
    assert.equal(titleIsJustGenreWords('Storm', 'quiet storm'), true);
    assert.equal(titleIsJustGenreWords('Classical', 'contemporary classical'), true);
    assert.equal(titleIsJustGenreWords('Noble Folk', 'acoustic folk'), false);
    assert.equal(titleIsJustGenreWords('Cavalry Folk', 'acoustic folk'), false);
    assert.equal(titleIsJustGenreWords('Rhythm of the Rain', 'quiet storm'), false);
    assert.equal(titleIsJustGenreWords('', 'quiet storm'), false);
});
