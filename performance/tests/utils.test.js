// CoachEasier Performance — utils + hooks unit tests (SC1).
// Run: node --test performance/tests/

import test from 'node:test';
import assert from 'node:assert/strict';

import { formatMinutes, formatTrend, relativeDay, weekLabel } from '../utils/format.js';
import { createPerformanceUiStore, createStore } from '../hooks/create-store.js';

test('formatMinutes: minutes and hour splits', () => {
  assert.equal(formatMinutes(45), '45 min');
  assert.equal(formatMinutes(60), '1 h');
  assert.equal(formatMinutes(75), '1 h 15 min');
  assert.equal(formatMinutes(0), '0 min');
  assert.equal(formatMinutes(-10), '0 min');
});

test('formatTrend: signed with true minus, no trailing .0', () => {
  assert.equal(formatTrend(4.2), '+4.2%');
  assert.equal(formatTrend(-1.7), '−1.7%');
  assert.equal(formatTrend(3), '+3%');
  assert.equal(formatTrend(0), '0%');
});

test('relativeDay: today / yesterday / N d ago', () => {
  const now = new Date('2026-08-03T12:00:00');
  assert.equal(relativeDay('2026-08-03T09:12:00', now), 'Today');
  assert.equal(relativeDay('2026-08-02T23:59:00', now), 'Yesterday');
  assert.equal(relativeDay('2026-07-28T08:00:00', now), '6 d ago');
  assert.equal(relativeDay('not-a-date', now), '');
});

test('weekLabel formats programme position', () => {
  assert.equal(weekLabel({ currentWeek: 3, weeks: 8 }), 'Week 3 of 8');
  assert.equal(weekLabel(null), 'Week 0 of 0');
});

test('createStore: get/set/update/subscribe/unsubscribe', () => {
  const store = createStore({ a: 1, b: 'x' });
  assert.deepEqual(store.get(), { a: 1, b: 'x' });

  const seen = [];
  const unsub = store.subscribe((s) => seen.push(s.a));
  store.set({ a: 2 });
  store.update((s) => ({ a: s.a + 1 }));
  assert.deepEqual(seen, [2, 3]);
  assert.deepEqual(store.get(), { a: 3, b: 'x' });

  unsub();
  store.set({ a: 9 });
  assert.deepEqual(seen, [2, 3], 'no notification after unsubscribe');
});

test('createPerformanceUiStore ships the SC1 defaults', () => {
  const ui = createPerformanceUiStore();
  assert.deepEqual(ui.get(), {
    screen: 'dashboard',
    librarySearch: '',
    libraryCategory: 'all',
    libraryFavouritesOnly: false,
  });
});
