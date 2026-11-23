import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex, createNonce, isWebClientId } from '../src/services/nativeGoogleSignIn.js';

test('sha256Hex matches the known SHA-256 test vector', async () => {
    assert.equal(
        await sha256Hex('abc'),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
});

test('createNonce returns a random raw value and its SHA-256 hex hash', async () => {
    const a = await createNonce();
    const b = await createNonce();
    assert.match(a.raw, /^[0-9a-f]{64}$/);
    assert.equal(a.hashed, await sha256Hex(a.raw));
    assert.notEqual(a.raw, b.raw);
});

test('isWebClientId accepts a Google client ID and rejects a client secret or junk', () => {
    assert.equal(isWebClientId('123456789012-abc123def456.apps.googleusercontent.com'), true);
    assert.equal(isWebClientId('GOCSPX-fake-example-not-a-real-secret'), false);
    assert.equal(isWebClientId(''), false);
    assert.equal(isWebClientId(undefined), false);
});
