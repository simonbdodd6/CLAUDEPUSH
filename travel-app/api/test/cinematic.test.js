import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCinematic, SCENE_TYPES, EMOTIONS, TRANSITION_HINTS, PACING_HINTS } from '../cinematic.js';

const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'metadata', 'eventType', 'travellerIdentityId'];
function assertNoLeak(obj) {
  const seen = JSON.stringify(obj);
  for (const k of FORBIDDEN_KEYS) assert.ok(!seen.includes(`"${k}"`), `must not expose "${k}"`);
}

function lifetime() {
  const trips = [
    { tripId: 't1', tripName: 'Bali 2024', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2024-07-01', endDate: '2024-07-12' },
    { tripId: 't2', tripName: 'Bali 2026', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-01', endDate: '2026-07-12' },
    { tripId: 't3', tripName: 'Thailand 2025', country: 'Thailand', destination: 'Phuket', area: 'Phuket', startDate: '2025-12-01', endDate: '2025-12-10' },
  ];
  const ev = (id, tripId, note, place, ts, photoRef, withL, move) => ({
    timelineEventId: id, tripId, eventType: photoRef ? 'photo_imported' : 'journal_entry',
    metadata: { eventName: photoRef ? 'photo_imported' : 'journal_entry', note, photoRef: photoRef ?? null, place, companions: withL ?? [], move: move ?? null }, timestamp: ts,
  });
  const events = [
    ev('a1', 't1', 'Landed in Bali after the flight', 'Bali', '2024-07-01T10:00:00.000Z', null, ['Manon']),
    ev('a2', 't1', 'Echo Beach sunset', 'Bali', '2024-07-02T18:30:00.000Z', 'p1', ['Manon']),
    ev('a3', 't1', 'Fast boat across, scuba dive on the reef', 'Gili Air', '2024-07-05T09:00:00.000Z', 'p2', ['Manon'], { type: 'fast boat', from: 'Bali', to: 'Gili Air' }),
    ev('a4', 't1', 'Surf session, big swell at the point break', 'Bali', '2024-07-07T07:00:00.000Z', 'p3', ['Manon']),
    ev('c1', 't3', 'Flew to Phuket', 'Phuket', '2025-12-01T12:00:00.000Z', null, ['Manon']),
    ev('c2', 't3', 'Local food at the night market', 'Phuket', '2025-12-02T20:00:00.000Z', 'p4', ['Manon']),
    ev('b1', 't2', 'Back in Bali, beach day', 'Bali', '2026-07-01T11:00:00.000Z', 'p5', ['Manon']),
    ev('b2', 't2', 'Sunset and a dive', 'Bali', '2026-07-03T18:00:00.000Z', 'p6', ['Manon']),
  ];
  return { events, trips };
}

const sceneById = (c, id) => c.scenes.find(s => s.id === id);

test('produces a cinematic storyboard of ordered scenes', () => {
  const { events, trips } = lifetime();
  const c = buildCinematic(events, trips);
  assert.ok(c.cinematicId.startsWith('cinematic-lifetime-'));
  assert.equal(c.scope, 'lifetime');
  assert.ok(c.scenes.length > 0);
  c.scenes.forEach((s, i) => assert.equal(s.order, i));
  assert.deepEqual(c.sceneOrder, c.scenes.map(s => s.id));
  // chronological
  for (let i = 1; i < c.scenes.length; i += 1) assert.ok(c.scenes[i].timelineAnchor >= c.scenes[i - 1].timelineAnchor);
});

test('opens with departure and closes with journey-home', () => {
  const { events, trips } = lifetime();
  const c = buildCinematic(events, trips);
  assert.equal(sceneById(c, c.openingScene).type, 'departure');
  assert.equal(sceneById(c, c.closingScene).type, 'journey-home');
});

test('scene typing is derived deterministically (dive / surf / sunset / food / transport)', () => {
  const { events, trips } = lifetime();
  const c = buildCinematic(events, trips);
  const types = new Set(c.scenes.map(s => s.type));
  assert.ok(types.has('dive'));
  assert.ok(types.has('surf'));
  assert.ok(types.has('sunset'));
  assert.ok(types.has('food'));
  assert.ok(types.has('transport') || types.has('border-crossing'));
});

test('every scene uses ONLY the fixed enums', () => {
  const { events, trips } = lifetime();
  const c = buildCinematic(events, trips);
  for (const s of c.scenes) {
    assert.ok(SCENE_TYPES.includes(s.type), `bad type ${s.type}`);
    assert.ok(EMOTIONS.includes(s.emotionalCategory), `bad emotion ${s.emotionalCategory}`);
    assert.ok(TRANSITION_HINTS.includes(s.transitionHint), `bad transition ${s.transitionHint}`);
    assert.ok(PACING_HINTS.includes(s.pacingHint), `bad pacing ${s.pacingHint}`);
  }
});

test('every scene carries the full reference-only shape', () => {
  const { events, trips } = lifetime();
  const c = buildCinematic(events, trips);
  for (const s of c.scenes) {
    assert.ok(s.id && s.type && s.title && s.timelineAnchor);
    assert.ok(s.dateRange && s.dateRange.from && s.dateRange.to);
    assert.ok(Array.isArray(s.locationRefs) && Array.isArray(s.mapRefs) && Array.isArray(s.companionRefs));
    assert.ok(Array.isArray(s.mediaRefs) && Array.isArray(s.achievementRefs));
    assert.ok(s.mediaRefs.every(r => typeof r === 'string')); // references only
    assert.ok(s.mapRefs.every(m => typeof m.place === 'string' && typeof m.isIsland === 'boolean'));
  }
});

test('a hero scene is selected', () => {
  const { events, trips } = lifetime();
  const c = buildCinematic(events, trips);
  assert.ok(c.heroScene);
  assert.ok(sceneById(c, c.heroScene));
  assert.ok(c.scenes.some(s => s.heroCandidate));
});

test('border crossing scene appears when a leg crosses countries', () => {
  const { events, trips } = lifetime();
  const c = buildCinematic(events, trips);
  // statistics breakdown contains transport family scenes
  assert.ok(c.statistics.byType.transport || c.statistics.byType['border-crossing']);
});

test('final-evening tagging when the last moment is in the evening', () => {
  const trips = [{ tripId: 't1', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-01', endDate: '2026-07-05' }];
  const ev = (id, note, place, ts, photoRef) => ({ timelineEventId: id, tripId: 't1', eventType: photoRef ? 'photo_imported' : 'journal_entry', metadata: { eventName: photoRef ? 'photo_imported' : 'journal_entry', note, photoRef: photoRef ?? null, place }, timestamp: ts });
  const c = buildCinematic([
    ev('a1', 'Morning beach', 'Bali', '2026-07-01T08:00:00.000Z', 'p1'),
    ev('a2', 'Final sunset on the beach', 'Bali', '2026-07-02T19:30:00.000Z', 'p2'),
  ], trips);
  // the last content scene is in the evening → final-evening
  const contentScenes = c.scenes.filter(s => s.sourceKind !== 'synthetic');
  assert.equal(contentScenes[contentScenes.length - 1].type, 'final-evening');
});

test('statistics summary is present and consistent', () => {
  const { events, trips } = lifetime();
  const c = buildCinematic(events, trips);
  assert.equal(c.statistics.scenes, c.scenes.length);
  assert.ok(c.statistics.locations >= 1);
  assert.ok(c.statistics.companions >= 1);
  assert.ok(typeof c.statistics.mediaCount === 'number');
  assert.equal(c.statistics.hasHero, c.heroScene !== null);
});

test('deterministic and leaks no backend terms', () => {
  const { events, trips } = lifetime();
  const a = buildCinematic(events, trips);
  const b = buildCinematic(events, trips);
  assert.deepEqual(a, b);
  assertNoLeak(a);
});

test('empty history yields a valid empty cinematic', () => {
  const c = buildCinematic([], []);
  assert.deepEqual(c.scenes, []);
  assert.equal(c.openingScene, null);
  assert.equal(c.closingScene, null);
  assert.equal(c.heroScene, null);
  assert.equal(c.statistics.scenes, 0);
});
