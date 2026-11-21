import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENRE_NODES, TASTE_GRAPH_EDGES, getConnectedGenres, getGraphDistance } from '../src/services/tasteGraph.js';

const nodes = Object.keys(GENRE_NODES);

test('every edge references existing genres', () => {
    for (const [a, b] of TASTE_GRAPH_EDGES) {
        assert.ok(GENRE_NODES[a], `unknown genre ${a}`);
        assert.ok(GENRE_NODES[b], `unknown genre ${b}`);
    }
});

test('the genre graph is one connected component', () => {
    const seen = new Set([nodes[0]]);
    const queue = [nodes[0]];
    while (queue.length) {
        for (const n of getConnectedGenres(queue.shift())) {
            if (!seen.has(n)) { seen.add(n); queue.push(n); }
        }
    }
    assert.equal(seen.size, nodes.length, `unreachable: ${nodes.filter(n => !seen.has(n)).join(', ')}`);
});

test('no genre is isolated', () => {
    for (const n of nodes) assert.ok(getConnectedGenres(n).length > 0, `${n} has no neighbours`);
});

test('graph distance is symmetric and 0 for identical genres', () => {
    assert.equal(getGraphDistance('rock', 'rock'), 0);
    for (const [a, b] of [['rock', 'jazz'], ['techno', 'ambient'], ['blues', 'metal']]) {
        assert.equal(getGraphDistance(a, b), getGraphDistance(b, a));
        assert.ok(getGraphDistance(a, b) < 999);
    }
});
