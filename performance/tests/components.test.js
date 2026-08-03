// CoachEasier Performance — component builders unit tests (SC1).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import { sparklinePoints } from '../components/sparkline.js';

test('sparklinePoints: maps a series into the padded box', () => {
  const pts = sparklinePoints([0, 10], 120, 32, 3);
  const pairs = pts.split(' ').map((p) => p.split(',').map(Number));
  assert.equal(pairs.length, 2);
  assert.deepEqual(pairs[0], [3, 29], 'min value sits at bottom-left inside padding');
  assert.deepEqual(pairs[1], [117, 3], 'max value sits at top-right inside padding');
});

test('sparklinePoints: flat series stays inside the box (no divide-by-zero)', () => {
  const pts = sparklinePoints([5, 5, 5]);
  assert.ok(pts.length > 0);
  for (const [x, y] of pts.split(' ').map((p) => p.split(',').map(Number))) {
    assert.ok(x >= 0 && x <= 120 && y >= 0 && y <= 32);
  }
});

test('sparklinePoints: fewer than two points renders nothing', () => {
  assert.equal(sparklinePoints([]), '');
  assert.equal(sparklinePoints([7]), '');
  assert.equal(sparklinePoints(null), '');
});
