import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titlesMatch, parseTitleAndArtist, fixMojibake } from '../server/youtubeResolver.js';

test('titlesMatch accepts the same song with decoration', () => {
    assert.equal(titlesMatch('Paranoid Android', 'Radiohead - Paranoid Android (Official Video)'), true);
    assert.equal(titlesMatch('Hey Jude', 'Hey Jude (Remastered 2015)'), true);
});

test('titlesMatch rejects a different song', () => {
    assert.equal(titlesMatch('Paranoid Android', 'Karma Police'), false);
});

test('parseTitleAndArtist splits "Artist - Title" when the channel is not the artist', () => {
    const r = parseTitleAndArtist('Daft Punk - Around the World (Official Audio)', 'Some Records Official');
    assert.equal(r.artist, 'Daft Punk');
    assert.equal(r.title, 'Around the World');
});

test('parseTitleAndArtist keeps a real channel name and strips " - Topic"', () => {
    const r = parseTitleAndArtist('Teardrop', 'Massive Attack - Topic');
    assert.equal(r.artist, 'Massive Attack');
    assert.equal(r.title, 'Teardrop');
});

test('fixMojibake repairs CP1251 Cyrillic read as Latin-1 and leaves normal text alone', () => {
    assert.equal(fixMojibake('Êèíî'), 'Кино');
    assert.equal(fixMojibake('Björk'), 'Björk');
});

test('common YouTube title decorations are stripped', () => {
    for (const [raw, expected] of [
        ['Daft Punk - Around the World (Official Audio)', 'Around the World'],
        ['Portishead - Glory Box [Official Music Video]', 'Glory Box'],
        ['Bonobo - Kerala (Lyric Video)', 'Kerala'],
        ['Tycho - Awake (Visualizer)', 'Awake'],
        ['Muse - Uprising (Official Video)', 'Uprising']
    ]) {
        assert.equal(parseTitleAndArtist(raw, '').title, expected, raw);
    }
});

test('decorations that are part of a real title are kept', () => {
    assert.equal(parseTitleAndArtist('Video Games', 'Lana Del Rey - Topic').title, 'Video Games');
});
