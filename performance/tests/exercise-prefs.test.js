// CoachEasier Performance — library preferences store tests (SC3).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialLibraryState, LIBRARY_STATE_VERSION, normalizeLibraryState,
  RECENT_MAX, recordView, toggleFavourite,
} from '../services/exercise-prefs-store.js';

test('initial state is versioned and empty', () => {
  const s = createInitialLibraryState();
  assert.equal(s.stateVersion, LIBRARY_STATE_VERSION);
  assert.deepEqual(s.favourites, []);
  assert.deepEqual(s.recent, []);
});

test('favourites toggle on and off (pure)', () => {
  let s = createInitialLibraryState();
  s = toggleFavourite(s, 'ex-back-squat');
  assert.deepEqual(s.favourites, ['ex-back-squat']);
  s = toggleFavourite(s, 'ex-back-squat');
  assert.deepEqual(s.favourites, []);
});

test('recent views dedupe, keep order, and cap', () => {
  let s = createInitialLibraryState();
  for (let i = 0; i < RECENT_MAX + 5; i++) s = recordView(s, `ex-${i}`);
  assert.equal(s.recent.length, RECENT_MAX);
  s = recordView(s, 'ex-10');
  assert.equal(s.recent[s.recent.length - 1], 'ex-10', 're-view moves to the end');
  assert.equal(s.recent.filter((x) => x === 'ex-10').length, 1, 'no duplicates');
});

test('malformed stored preferences fail safely', () => {
  for (const bad of [null, 'junk', 5, [], { stateVersion: 'x' }, { stateVersion: 1, favourites: 'nope', recent: [1, 2] }]) {
    const s = normalizeLibraryState(bad);
    assert.equal(s.stateVersion, LIBRARY_STATE_VERSION, JSON.stringify(bad));
    assert.deepEqual(s.favourites, []);
    assert.deepEqual(s.recent, []);
  }
});

test('future versions are refused; oversized lists are capped', () => {
  assert.deepEqual(normalizeLibraryState({ stateVersion: 99, favourites: ['x'] }).favourites, []);
  const huge = { stateVersion: 1, favourites: Array.from({ length: 500 }, (_, i) => `ex-${i}`), recent: Array.from({ length: 50 }, (_, i) => `ex-${i}`) };
  const s = normalizeLibraryState(huge);
  assert.equal(s.favourites.length, 200);
  assert.equal(s.recent.length, RECENT_MAX);
});

test('round-trip through JSON preserves preferences', () => {
  let s = createInitialLibraryState();
  s = toggleFavourite(s, 'ex-a');
  s = recordView(s, 'ex-b');
  const restored = normalizeLibraryState(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(restored.favourites, ['ex-a']);
  assert.deepEqual(restored.recent, ['ex-b']);
});
