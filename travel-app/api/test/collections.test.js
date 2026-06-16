import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCollections } from '../collections.js';

const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'metadata', 'eventType', 'travellerIdentityId'];
function assertNoLeak(obj) {
  const seen = JSON.stringify(obj);
  for (const k of FORBIDDEN_KEYS) assert.ok(!seen.includes(`"${k}"`), `must not expose "${k}"`);
}

function lifetime() {
  const trips = [
    { tripId: 't1', tripName: 'Bali 2024', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2024-07-01', endDate: '2024-07-14' }, // long expedition (14d)
    { tripId: 't2', tripName: 'Bali 2026', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-01', endDate: '2026-07-12' },
    { tripId: 't3', tripName: 'Singapore weekend', country: 'Singapore', destination: 'Singapore', area: 'Marina Bay', startDate: '2025-03-01', endDate: '2025-03-02' }, // weekend (2d)
  ];
  const ev = (id, tripId, note, place, ts, photoRef, withL, move) => ({
    timelineEventId: id, tripId, eventType: photoRef ? 'photo_imported' : 'journal_entry',
    metadata: { eventName: photoRef ? 'photo_imported' : 'journal_entry', note, photoRef: photoRef ?? null, place, companions: withL ?? [], move: move ?? null }, timestamp: ts,
  });
  const events = [
    ev('a1', 't1', 'Landed in Bali after the flight', 'Bali', '2024-07-01T10:00:00.000Z', null, ['Manon']),
    ev('a2', 't1', 'Echo Beach sunset', 'Bali', '2024-07-02T18:00:00.000Z', 'p1', ['Manon']),
    ev('a3', 't1', 'Fast boat across, scuba dive on the reef', 'Gili Air', '2024-07-05T09:00:00.000Z', 'p2', ['Manon'], { type: 'fast boat', from: 'Bali', to: 'Gili Air' }),
    ev('a4', 't1', 'Another reef dive, manta rays', 'Gili Air', '2024-07-06T08:00:00.000Z', 'p3', ['Manon']),
    ev('a5', 't1', 'Surf session at the point break', 'Bali', '2024-07-08T07:00:00.000Z', 'p4', ['Manon']),
    ev('b1', 't2', 'Beach day, surf again', 'Bali', '2026-07-02T11:00:00.000Z', 'p5', ['Manon']),
    ev('b2', 't2', 'Reef dive, big swell', 'Bali', '2026-07-03T08:00:00.000Z', 'p6', ['Manon']),
    ev('c1', 't3', 'Flew to Singapore, city temple and museum', 'Singapore', '2025-03-01T12:00:00.000Z', 'p7', ['Theo']),
    ev('c2', 't3', 'Local food at the night market', 'Singapore', '2025-03-01T20:00:00.000Z', null, ['Theo']),
  ];
  return { events, trips };
}

const col = (out, id) => out.collections.find(c => c.id === id);

test('generates themed collections from existing intelligence', () => {
  const { events, trips } = lifetime();
  const out = buildCollections(events, trips);
  assert.ok(out.collections.length > 0);
  assert.ok(col(out, 'diving-adventures'));   // >= 2 dives
  assert.ok(col(out, 'surf-trips'));           // surf x2
  assert.ok(col(out, 'beach-days'));
  assert.ok(col(out, 'city-breaks'));          // Singapore temple/museum
  assert.ok(col(out, 'island-escapes'));       // Bali + Gili Air are islands
  assert.ok(col(out, 'flights'));              // flight mentions / segments
  assert.ok(col(out, 'ferry-adventures'));     // fast boat
});

test('each collection carries the full presentation DTO shape', () => {
  const { events, trips } = lifetime();
  const out = buildCollections(events, trips);
  for (const c of out.collections) {
    assert.ok(c.id && c.type && c.title && c.subtitle && c.icon);
    assert.ok(typeof c.sortOrder === 'number');
    assert.ok(c.timeSpan && c.timeSpan.from && c.timeSpan.to && c.timeSpan.from <= c.timeSpan.to);
    assert.ok(Array.isArray(c.locations) && Array.isArray(c.companions));
    assert.ok(typeof c.journeyCount === 'number');
    assert.ok(Array.isArray(c.mediaRefs) && Array.isArray(c.achievementRefs) && Array.isArray(c.highlightRefs));
    assert.ok(c.statistics && typeof c.statistics.memories === 'number' && typeof c.statistics.days === 'number');
    assert.ok('coverCandidate' in c);
  }
});

test('cover candidate prefers a photo and exposes references only', () => {
  const { events, trips } = lifetime();
  const out = buildCollections(events, trips);
  const diving = col(out, 'diving-adventures');
  assert.ok(diving.coverCandidate && diving.coverCandidate.memoryId);
  // media refs are plain references (photo ids), never loaded media
  assert.ok(diving.mediaRefs.every(r => typeof r === 'string'));
  assert.ok(diving.mediaRefs.includes('p2') || diving.mediaRefs.includes('p3'));
});

test('transport collections are tagged from the journey engine', () => {
  const { events, trips } = lifetime();
  const out = buildCollections(events, trips);
  const ferry = col(out, 'ferry-adventures');
  assert.ok(ferry && ferry.statistics.memories >= 1);
});

test('per-country and per-companion collections are generated', () => {
  const { events, trips } = lifetime();
  const out = buildCollections(events, trips);
  assert.ok(col(out, 'country-indonesia'));
  assert.ok(col(out, 'with-manon'));            // Manon on many memories
  const withManon = col(out, 'with-manon');
  assert.ok(withManon.companions.includes('Manon'));
  assert.ok(withManon.journeyCount >= 1);
});

test('trip-shape collections: weekend trips and long expeditions', () => {
  const { events, trips } = lifetime();
  const out = buildCollections(events, trips);
  const weekend = col(out, 'weekend-trips');
  assert.ok(weekend && weekend.locations.includes('Singapore'));
  const long = col(out, 'long-expeditions');
  assert.ok(long && long.statistics.memories >= 1);
});

test('achievement references are pulled from the achievement engine', () => {
  const { events, trips } = lifetime();
  const out = buildCollections(events, trips);
  const diving = col(out, 'diving-adventures');
  assert.ok(Array.isArray(diving.achievementRefs));
  assert.ok(diving.achievementRefs.some(id => id.startsWith('diving-'))); // earned diving badges
});

test('collections are ordered (richest first) with sequential sortOrder', () => {
  const { events, trips } = lifetime();
  const out = buildCollections(events, trips);
  out.collections.forEach((c, i) => assert.equal(c.sortOrder, i));
  for (let i = 1; i < out.collections.length; i += 1) {
    assert.ok(out.collections[i - 1].statistics.memories >= out.collections[i].statistics.memories);
  }
});

test('deterministic and leaks no backend terms', () => {
  const { events, trips } = lifetime();
  const a = buildCollections(events, trips);
  const b = buildCollections(events, trips);
  assert.deepEqual(a, b);
  assertNoLeak(a);
});

test('an empty history yields zero collections (valid empty result)', () => {
  const out = buildCollections([], []);
  assert.deepEqual(out.collections, []);
  assert.equal(out.summary.total, 0);
});

test('thin evidence does not fabricate collections (min thresholds)', () => {
  const trips = [{ tripId: 't1', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-01', endDate: '2026-07-10' }];
  const ev = (id, note, place, ts) => ({ timelineEventId: id, tripId: 't1', eventType: 'journal_entry', metadata: { eventName: 'journal_entry', note, place }, timestamp: ts });
  const out = buildCollections([ev('a1', 'A single quiet dive', 'Bali', '2026-07-02T09:00:00.000Z')], trips);
  // one dive only → no diving collection (min 2)
  assert.equal(out.collections.find(c => c.id === 'diving-adventures'), undefined);
});
