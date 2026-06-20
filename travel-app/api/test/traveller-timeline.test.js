import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTravellerTimeline, TIMELINE_ENTRY_TYPES } from '../traveller-timeline.js';

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
    ev('c1', 't3', 'Flew to Phuket, local food', 'Phuket', '2025-12-01T12:00:00.000Z', 'p4', ['Manon']),
    ev('b1', 't2', 'Back in Bali, sunset dive', 'Bali', '2026-07-12T18:00:00.000Z', 'p5', ['Manon']),
  ];
  return { events, trips };
}

test('assembles one chronological stream of timeline entries', () => {
  const { events, trips } = lifetime();
  const tl = buildTravellerTimeline(events, trips);
  assert.ok(tl.entries.length > 0);
  assert.ok(tl.span.from <= tl.span.to);
  assert.equal(tl.statistics.total, tl.entries.length);
});

test('entries are deterministically ordered with a sequential orderingIndex', () => {
  const { events, trips } = lifetime();
  const tl = buildTravellerTimeline(events, trips);
  for (let i = 1; i < tl.entries.length; i += 1) assert.ok(tl.entries[i].date >= tl.entries[i - 1].date);
  tl.entries.forEach((e, i) => { assert.equal(e.orderingIndex, i); assert.equal(e.id, `tl-${i}`); });
  // fully deterministic
  assert.deepEqual(buildTravellerTimeline(events, trips), tl);
});

test('every entry uses a known type and a reference-only shape', () => {
  const { events, trips } = lifetime();
  const tl = buildTravellerTimeline(events, trips);
  for (const e of tl.entries) {
    assert.ok(TIMELINE_ENTRY_TYPES.includes(e.type), `bad type ${e.type}`);
    assert.ok(e.id && e.title && e.date);
    assert.ok(Array.isArray(e.locationRefs) && Array.isArray(e.companionRefs) && Array.isArray(e.mediaRefs) && Array.isArray(e.achievementRefs));
    assert.ok(e.mediaRefs.every(r => typeof r === 'string'));
    assert.ok(e.ref && e.ref.type && e.ref.id !== undefined);
    assert.ok(e.navigationTarget && e.navigationTarget.experience && e.navigationTarget.deepLink);
  }
});

test('combines moments, transport legs, story anchors and yearly markers', () => {
  const { events, trips } = lifetime();
  const tl = buildTravellerTimeline(events, trips);
  const types = new Set(tl.entries.map(e => e.type));
  assert.ok(types.has('ferry')); // fast boat Bali → Gili Air
  assert.ok(types.has('year')); // yearly markers
  assert.ok(types.has('story-anchor')); // chapter anchors
  assert.ok(types.has('dive') || types.has('achievement')); // diving evidence
});

test('transport legs route to the cinematic experience; years route to wrapped', () => {
  const { events, trips } = lifetime();
  const tl = buildTravellerTimeline(events, trips);
  const ferry = tl.entries.find(e => e.type === 'ferry');
  assert.equal(ferry.navigationTarget.experience, 'cinematic');
  const year = tl.entries.find(e => e.type === 'year');
  assert.equal(year.navigationTarget.experience, 'wrapped');
});

test('byYear groups entries', () => {
  const { events, trips } = lifetime();
  const tl = buildTravellerTimeline(events, trips);
  assert.ok(tl.byYear.length >= 1);
  assert.ok(tl.byYear.every(y => y.year && y.count >= 1 && Array.isArray(y.entryIds)));
});

test('empty history yields an empty timeline with a capture CTA', () => {
  const tl = buildTravellerTimeline([], []);
  assert.deepEqual(tl.entries, []);
  assert.equal(tl.span, null);
  assert.ok(tl.emptyState && tl.emptyState.cta.id === 'capture');
  assert.equal(tl.statistics.total, 0);
});

test('deterministic and leaks no backend terms', () => {
  const { events, trips } = lifetime();
  const a = buildTravellerTimeline(events, trips);
  const b = buildTravellerTimeline(events, trips);
  assert.deepEqual(a, b);
  assertNoLeak(a);
});
