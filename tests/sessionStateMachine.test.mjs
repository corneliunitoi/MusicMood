import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { sessionEngine, TRACK_MEMORY, ARTIST_COOLDOWN } = await import('../src/services/sessionStateMachine.js');
const { jitEngine } = await import('../src/services/jitEngine.js');

// No network: background catalog expansion is out of scope for these tests
jitEngine.replenishBuffer = async () => {};
jitEngine.pullTrackForGenre = async () => null;

// Keep the engine offline: no listening-history or JIT side effects during tests
sessionEngine._startPlay = () => {};
sessionEngine._finishPlay = () => {};
sessionEngine.notify = () => {};

const vid = (n) => `vid${String(n).padStart(8, '0')}`; // 11-char fake YouTube ids
const track = (n, artist = `Artist ${n}`) => ({ id: vid(n), artist, title: `Song ${n}`, genre: sessionEngine.state.activeGenre });

function fresh() {
    sessionEngine.state.recentTracks = [];
    sessionEngine.state.recentArtists = [];
    sessionEngine.state.dislikedArtists = [];
    sessionEngine.state.vocalPreference = 'any';
    sessionEngine.calibration.dealbreakers = [];
}

test('track memory is bounded to TRACK_MEMORY', () => {
    fresh();
    for (let i = 0; i < TRACK_MEMORY + 25; i++) sessionEngine.rememberTrackId(vid(i));
    assert.equal(sessionEngine.state.recentTracks.length, TRACK_MEMORY);
    assert.equal(sessionEngine.isRecentTrack(vid(0)), false, 'oldest track has aged out');
    assert.equal(sessionEngine.isRecentTrack(vid(TRACK_MEMORY + 24)), true);
});

test('a played track is rejected until it leaves the track memory', () => {
    fresh();
    sessionEngine.rememberTrackId(vid(1));
    assert.equal(sessionEngine.passesGuards(track(1, 'Someone Else')), false);
    for (let i = 100; i < 100 + TRACK_MEMORY; i++) sessionEngine.rememberTrackId(vid(i));
    assert.equal(sessionEngine.passesGuards(track(1, 'Someone Else')), true);
});

test('an artist cools down for exactly ARTIST_COOLDOWN plays', () => {
    fresh();
    sessionEngine.rememberArtist('Radiohead');
    assert.equal(sessionEngine.passesGuards(track(2, 'Radiohead')), false);
    for (let i = 0; i < ARTIST_COOLDOWN - 1; i++) sessionEngine.rememberArtist(`Filler ${i}`);
    assert.equal(sessionEngine.passesGuards(track(2, 'Radiohead')), false, 'still cooling down');
    sessionEngine.rememberArtist('One More');
    assert.equal(sessionEngine.passesGuards(track(2, 'Radiohead')), true, 'cooldown over');
});

test('artist names are compared case-insensitively', () => {
    fresh();
    sessionEngine.rememberArtist('The Cure');
    assert.equal(sessionEngine.passesGuards(track(3, 'the cure')), false);
});

test('a disliked artist stays hidden for the rest of the session', async () => {
    fresh();
    await sessionEngine.onDislike(track(4, 'Nickelback'));
    for (let i = 0; i < ARTIST_COOLDOWN * 3; i++) sessionEngine.rememberArtist(`Filler ${i}`);
    assert.equal(sessionEngine.passesGuards(track(5, 'Nickelback')), false);
    assert.equal(sessionEngine.isArtistBlocked('nickelback', 0), true, 'blocked even in the last-resort pass');
});

test('committing a track records it in both memories', () => {
    fresh();
    sessionEngine.commitTrack(track(6, 'Massive Attack'));
    assert.equal(sessionEngine.isRecentTrack(vid(6)), true);
    assert.equal(sessionEngine.isArtistBlocked('Massive Attack'), true);
});

test('concurrent getNextTrack calls share one lookup instead of returning null', async () => {
    fresh();
    let calls = 0;
    const original = sessionEngine._resolveNextTrack;
    sessionEngine._resolveNextTrack = async () => {
        calls++;
        await new Promise(r => setTimeout(r, 20));
        return track(7);
    };
    try {
        const [a, b] = await Promise.all([sessionEngine.getNextTrack('guest'), sessionEngine.getNextTrack('guest')]);
        assert.equal(calls, 1, 'only one lookup ran');
        assert.ok(a && b, 'neither caller got null while the lookup was busy');
        assert.equal(a.id, b.id);
        const c = await sessionEngine.getNextTrack('guest');
        assert.equal(calls, 2, 'a later call starts a new lookup');
        assert.ok(c);
    } finally {
        sessionEngine._resolveNextTrack = original;
    }
});
