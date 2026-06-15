import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileStore } from '../persistence/file-store.js';
import { createTravelApi } from '../index.js';
import { buildJourney, normalizeMove } from '../journey.js';

function freshDir() { return mkdtempSync(join(tmpdir(), 'travel-journey-engine-')); }
const appleVerifier = async (t) => { const [, sub, email] = t.split(':'); return { sub, email }; };

const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'metadata', 'eventType', 'travellerIdentityId'];
function assertNoLeak(obj) {
  const seen = JSON.stringify(obj);
  for (const k of FORBIDDEN_KEYS) assert.ok(!seen.includes(`"${k}"`), `must not expose "${k}"`);
}

// A multi-hop island journey: Bali → Gili Air → Gili Meno, with explicit moves.
async function islandJourney() {
  const app = createTravelApi({ store: new FileStore(freshDir()), appleVerifier });
  const { token } = await app.signIn({ identityToken: 'apple:simon:s@e.com', displayName: 'Simon' });
  await app.putTrip(token, { tripName: 'Indonesia', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-11', endDate: '2026-07-25' });
  const caps = [
    { note: 'Landed in Bali after the flight', place: 'Bali', timestamp: '2026-07-11T10:00:00.000Z' },
    { note: 'Echo Beach sunset', photoRef: 'p1', place: 'Bali', timestamp: '2026-07-11T18:20:00.000Z' },
    { note: 'Fast boat across to the islands', place: 'Gili Air', move: { type: 'fast boat', from: 'Bali', to: 'Gili Air' }, timestamp: '2026-07-13T09:00:00.000Z' },
    { note: 'Snorkelling the reef', photoRef: 'p2', place: 'Gili Air', timestamp: '2026-07-13T14:00:00.000Z' },
    { note: 'Private boat to the quiet island', place: 'Gili Meno', move: { type: 'private boat', from: 'Gili Air', to: 'Gili Meno' }, timestamp: '2026-07-15T11:00:00.000Z' },
    { note: 'Turtle sighting, beach day', photoRef: 'p3', place: 'Gili Meno', timestamp: '2026-07-15T16:00:00.000Z' },
  ];
  for (const c of caps) await app.capture(token, c);
  return { app, token };
}

test('normalizeMove cleans a transport leg or returns null', () => {
  assert.deepEqual(normalizeMove({ type: ' fast boat ', from: ' Bali ', to: 'Gili Air' }), { type: 'fast boat', from: 'Bali', to: 'Gili Air' });
  assert.deepEqual(normalizeMove({ type: 'ferry' }), { type: 'ferry', from: null, to: null });
  assert.equal(normalizeMove({}), null);
  assert.equal(normalizeMove('boat'), null);
});

test('GET /journey builds an ordered, replayable route with home bookends', async () => {
  const { app, token } = await islandJourney();
  const journey = await app.getJourney(token);

  // Home → ... → Home, alternating stop/segment, with replayOrder set in order.
  assert.equal(journey.route[0].place, 'Home');
  assert.equal(journey.route[journey.route.length - 1].place, 'Home');
  journey.route.forEach((n, i) => assert.equal(n.replayOrder, i));

  // Three real stops in chronological order.
  assert.deepEqual(journey.stops.map(s => s.place), ['Bali', 'Gili Air', 'Gili Meno']);
  assert.equal(journey.basedOn.stops, 3);

  // Route alternates stop/segment between real stops.
  const placeOrder = journey.route.filter(n => n.type === 'stop').map(n => n.place);
  assert.deepEqual(placeOrder, ['Home', 'Bali', 'Gili Air', 'Gili Meno', 'Home']);
});

test('segments expose transport, origin, destination, dates and supporting evidence', async () => {
  const { app, token } = await islandJourney();
  const journey = await app.getJourney(token);

  const fastBoat = journey.segments.find(s => s.transport === 'fast boat');
  assert.ok(fastBoat);
  assert.equal(fastBoat.origin, 'Bali');
  assert.equal(fastBoat.destination, 'Gili Air');
  assert.equal(fastBoat.confidence, 'strong'); // explicit move
  assert.ok(fastBoat.supportingMemories.length >= 1);
  assert.ok('coordinates' in fastBoat && fastBoat.coordinates === null);

  const privateBoat = journey.segments.find(s => s.transport === 'private boat');
  assert.ok(privateBoat);
  assert.equal(privateBoat.destination, 'Gili Meno');

  // home bookend segments are inferred
  const homeSeg = journey.segments.find(s => s.id === 'home-arrival');
  assert.ok(homeSeg && homeSeg.inferred === true && homeSeg.confidence === 'inferred');
});

test('stops expose dates, duration, memories, photos, activities and chapter', async () => {
  const { app, token } = await islandJourney();
  const journey = await app.getJourney(token);
  const bali = journey.stops.find(s => s.place === 'Bali');
  assert.ok(bali.startDate && bali.endDate);
  assert.equal(bali.durationDays, 3); // 11–13 July
  assert.ok(bali.supportingMemories.length >= 1);
  assert.ok(bali.supportingPhotos.includes('p1'));
  assert.ok(bali.chapter && bali.chapter.label === 'Chapter 1');
  assert.equal(bali.transition, 'start');
  assert.ok('coordinates' in bali && bali.coordinates === null);
});

test('chapters group stops for zoom-in', async () => {
  const { app, token } = await islandJourney();
  const journey = await app.getJourney(token);
  assert.ok(journey.chapters.length >= 1);
  assert.ok(journey.chapters.every(c => c.index && c.label && Array.isArray(c.places) && c.from && c.to));
});

test('journey is deterministic and leaks no backend terms', async () => {
  const { app, token } = await islandJourney();
  const a = await app.getJourney(token);
  const b = await app.getJourney(token);
  assert.deepEqual(a, b);
  assertNoLeak(a);
});

test('without place tags the trip is one stop (its destination)', async () => {
  const app = createTravelApi({ store: new FileStore(freshDir()), appleVerifier });
  const { token } = await app.signIn({ identityToken: 'apple:s2:s@e.com', displayName: 'Simon' });
  await app.putTrip(token, { tripName: 'Indo', country: 'Indonesia', destination: 'Bali', area: 'Ubud', startDate: '2026-07-11', endDate: '2026-07-20' });
  await app.capture(token, { note: 'Sunset', photoRef: 'p1', timestamp: '2026-07-11T18:00:00.000Z' });
  await app.capture(token, { note: 'Rice terraces', photoRef: 'p2', timestamp: '2026-07-12T10:00:00.000Z' });
  const journey = await app.getJourney(token);
  assert.equal(journey.stops.length, 1);
  assert.equal(journey.stops[0].place, 'Ubud'); // falls back to trip area
});

test('empty journey is calm and valid', () => {
  const journey = buildJourney([], []);
  assert.deepEqual(journey.route, []);
  assert.deepEqual(journey.stops, []);
  assert.equal(journey.basedOn.stops, 0);
});

// --- pure function: country change + keyword-detected transport --------------

test('country changes are flagged and transport inferred from text when no move tag', () => {
  const trips = [
    { tripId: 't1', country: 'Singapore', destination: 'Singapore', area: 'Marina Bay', startDate: '2026-07-10', endDate: '2026-07-11' },
    { tripId: 't2', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-11', endDate: '2026-07-20' },
  ];
  const ev = (id, tripId, note, ts) => ({ timelineEventId: id, tripId, eventType: 'journal_entry', metadata: { eventName: 'journal_entry', note }, timestamp: ts });
  const events = [
    ev('a1', 't1', 'Night at Marina Bay', '2026-07-10T20:00:00.000Z'),
    ev('b1', 't2', 'Flight over, landed in Bali', '2026-07-11T12:00:00.000Z'),
    ev('b2', 't2', 'Beach sunset', '2026-07-12T18:00:00.000Z'),
  ];
  const journey = buildJourney(events, trips);
  assert.deepEqual(journey.stops.map(s => s.place), ['Marina Bay', 'Canggu']);
  assert.equal(journey.stops[1].transition, 'country');
  const seg = journey.segments.find(s => s.origin === 'Marina Bay' && s.destination === 'Canggu');
  assert.ok(seg);
  assert.equal(seg.transport, 'flight'); // detected from "Flight over, landed"
  assert.equal(seg.confidence, 'emerging');
});
