import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearch, SEARCH_KINDS } from '../search.js';

const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'metadata', 'eventType', 'travellerIdentityId'];
function assertNoLeak(obj) {
  const seen = JSON.stringify(obj);
  for (const k of FORBIDDEN_KEYS) assert.ok(!seen.includes(`"${k}"`), `must not expose "${k}"`);
}

function lifetime() {
  const trips = [
    { tripId: 't1', tripName: 'Bali 2024', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2024-07-08', endDate: '2024-07-20' },
    { tripId: 't2', tripName: 'Bali 2026', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-08', endDate: '2026-07-20' },
    { tripId: 't3', tripName: 'Thailand 2025', country: 'Thailand', destination: 'Phuket', area: 'Phuket', startDate: '2025-12-01', endDate: '2025-12-10' },
  ];
  const ev = (id, tripId, note, place, ts, photoRef, withL, move) => ({
    timelineEventId: id, tripId, eventType: photoRef ? 'photo_imported' : 'journal_entry',
    metadata: { eventName: photoRef ? 'photo_imported' : 'journal_entry', note, photoRef: photoRef ?? null, place, companions: withL ?? [], move: move ?? null }, timestamp: ts,
  });
  const events = [
    ev('a1', 't1', 'Landed in Bali, fast boat, first scuba dive', 'Gili Air', '2024-07-12T09:00:00.000Z', 'p1', ['Manon'], { type: 'fast boat', from: 'Bali', to: 'Gili Air' }),
    ev('a2', 't1', 'Echo Beach sunset', 'Bali', '2024-07-12T18:00:00.000Z', 'p2', ['Manon']),
    ev('a3', 't1', 'Reef dive, turtles', 'Gili Air', '2024-07-13T08:00:00.000Z', 'p3', ['Manon']),
    ev('c1', 't3', 'Flew to Phuket, local food', 'Phuket', '2025-12-01T12:00:00.000Z', 'p4', ['Theo']),
    ev('b1', 't2', 'Back in Bali, sunset dive', 'Bali', '2026-07-12T18:00:00.000Z', 'p5', ['Manon']),
  ];
  return { events, trips };
}

const has = (res, kind) => res.results.some(r => r.kind === kind);

test('searches a place token across multiple sections', () => {
  const { events, trips } = lifetime();
  const res = buildSearch(events, trips, { query: 'bali' });
  assert.equal(res.hasQuery, true);
  assert.ok(res.results.length >= 1);
  assert.ok(has(res, 'island')); // Bali is an island
  assert.ok(res.results.some(r => r.place === 'Bali' || r.title === 'Bali'));
  // grouped + matchedSections reflect the result kinds
  assert.deepEqual(res.matchedSections, res.grouped.map(g => g.kind));
});

test('searches a companion and routes to the right collection', () => {
  const { events, trips } = lifetime();
  const res = buildSearch(events, trips, { query: 'manon' });
  const comp = res.results.find(r => r.kind === 'companion');
  assert.ok(comp);
  assert.equal(comp.title, 'Manon');
  assert.equal(comp.target.deepLink, 'travelapp://collection/with-manon');
});

test('searches an activity / achievement token (dive)', () => {
  const { events, trips } = lifetime();
  const res = buildSearch(events, trips, { query: 'dive' });
  assert.ok(has(res, 'activity') || has(res, 'achievement') || has(res, 'cinematic-scene'));
  assert.ok(res.results.some(r => /dive/i.test(r.title) || /dive/i.test(r.subtitle ?? '')));
});

test('searches an experience by name', () => {
  const { events, trips } = lifetime();
  const res = buildSearch(events, trips, { query: 'wrapped' });
  const exp = res.results.find(r => r.kind === 'experience');
  assert.ok(exp);
  assert.equal(exp.ref.id, 'wrapped');
  assert.ok(res.experienceTargets.some(t => t.experience === 'wrapped'));
});

test('searches a year (date token)', () => {
  const { events, trips } = lifetime();
  const res = buildSearch(events, trips, { query: '2024' });
  assert.ok(res.results.some(r => (r.kind === 'memory' || r.kind === 'timeline-event' || r.kind === 'story-chapter') && (r.date ? r.date.startsWith('2024') : true)));
  assert.ok(res.timelineAnchors.length >= 1);
});

test('every result uses a known kind and a full reference shape', () => {
  const { events, trips } = lifetime();
  const res = buildSearch(events, trips, { query: 'bali' });
  for (const r of res.results) {
    assert.ok(SEARCH_KINDS.includes(r.kind), `bad kind ${r.kind}`);
    assert.ok(r.id && r.title && typeof r.score === 'number');
    assert.ok(r.target && r.ref && r.ref.type && r.ref.id !== undefined);
    assert.ok(Array.isArray(r.mediaRefs) && r.mediaRefs.every(m => typeof m === 'string'));
  }
});

test('results are ranked by score (descending) and capped', () => {
  const { events, trips } = lifetime();
  const res = buildSearch(events, trips, { query: 'bali' });
  for (let i = 1; i < res.results.length; i += 1) assert.ok(res.results[i - 1].score >= res.results[i].score);
  assert.ok(res.results.length <= 50);
});

test('derived reference sets are populated', () => {
  const { events, trips } = lifetime();
  const res = buildSearch(events, trips, { query: 'bali' });
  assert.ok(res.navigationTargets.every(t => t.experience && t.deepLink));
  assert.ok(res.mapReferences.some(m => m.place === 'Bali' && m.isIsland === true));
  assert.equal(res.statistics.total, res.results.length);
});

test('empty query returns a browse empty-state with suggestions', () => {
  const { events, trips } = lifetime();
  const res = buildSearch(events, trips, { query: '   ' });
  assert.equal(res.hasQuery, false);
  assert.deepEqual(res.results, []);
  assert.ok(res.emptyState && res.emptyState.kind === 'browse');
  assert.ok(res.emptyState.suggestions.length >= 1);
});

test('no-match query returns a no-results empty-state', () => {
  const { events, trips } = lifetime();
  const res = buildSearch(events, trips, { query: 'zzzznotathing' });
  assert.deepEqual(res.results, []);
  assert.ok(res.emptyState && res.emptyState.kind === 'no-results');
  assert.match(res.emptyState.title, /No results/);
});

test('experiences are searchable even with no memories', () => {
  const res = buildSearch([], [], { query: 'cinematic' });
  assert.ok(res.results.some(r => r.kind === 'experience' && r.ref.id === 'cinematic'));
});

test('deterministic and leaks no backend terms', () => {
  const { events, trips } = lifetime();
  const a = buildSearch(events, trips, { query: 'bali sunset' });
  const b = buildSearch(events, trips, { query: 'bali sunset' });
  assert.deepEqual(a, b);
  assertNoLeak(a);
});
