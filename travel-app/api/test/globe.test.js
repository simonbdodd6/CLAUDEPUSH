import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileStore } from '../persistence/file-store.js';
import { createTravelApi } from '../index.js';
import { buildGlobe } from '../globe.js';

function freshDir() { return mkdtempSync(join(tmpdir(), 'travel-globe-')); }
const appleVerifier = async (t) => { const [, sub, email] = t.split(':'); return { sub, email }; };

const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'metadata', 'eventType', 'travellerIdentityId'];
function assertNoLeak(obj) {
  const seen = JSON.stringify(obj);
  for (const k of FORBIDDEN_KEYS) assert.ok(!seen.includes(`"${k}"`), `must not expose "${k}"`);
}

async function islandJourney() {
  const app = createTravelApi({ store: new FileStore(freshDir()), appleVerifier });
  const { token } = await app.signIn({ identityToken: 'apple:simon:s@e.com', displayName: 'Simon' });
  await app.putTrip(token, { tripName: 'Indonesia', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-11', endDate: '2026-07-25' });
  const caps = [
    { note: 'Landed in Bali after the flight', place: 'Bali', timestamp: '2026-07-11T10:00:00.000Z' },
    { note: 'Echo Beach sunset', photoRef: 'p1', place: 'Bali', timestamp: '2026-07-11T18:20:00.000Z' },
    { note: 'Fast boat across', place: 'Gili Air', move: { type: 'fast boat', from: 'Bali', to: 'Gili Air' }, timestamp: '2026-07-13T09:00:00.000Z' },
    { note: 'Snorkelling, scuba dive', photoRef: 'p2', place: 'Gili Air', timestamp: '2026-07-13T14:00:00.000Z' },
    { note: 'Private boat to the quiet island', place: 'Gili Meno', move: { type: 'private boat', from: 'Gili Air', to: 'Gili Meno' }, timestamp: '2026-07-15T11:00:00.000Z' },
    { note: 'Turtle beach day', photoRef: 'p3', place: 'Gili Meno', timestamp: '2026-07-15T16:00:00.000Z' },
  ];
  for (const c of caps) await app.capture(token, c);
  return { app, token };
}

test('GET /globe exposes resolved markers with full coordinate metadata', async () => {
  const { app, token } = await islandJourney();
  const g = await app.getGlobe(token);

  assert.deepEqual(g.markers.map(m => m.place), ['Bali', 'Gili Air', 'Gili Meno']);
  assert.equal(g.globe.markerCount, 3);
  for (const m of g.markers) {
    assert.ok(typeof m.latitude === 'number' && typeof m.longitude === 'number');
    assert.ok(typeof m.zoomLevel === 'number' && typeof m.cameraAngle === 'number');
    assert.ok(typeof m.markerSize === 'number' && m.markerColour);
    assert.ok('arrivalDirection' in m && 'departureDirection' in m);
    assert.equal(typeof m.visitOrder, 'number');
  }
  const bali = g.markers[0];
  assert.equal(bali.country, 'Indonesia');
  assert.equal(bali.island, 'Bali');
  assert.equal(bali.coordinateSource, 'gazetteer');
  assert.equal(bali.resolved, true);
  assert.ok(bali.latitude < 0 && bali.longitude > 100); // southern hemisphere, SE Asia
  assert.equal(bali.arrivalDirection, null); // first marker
  assert.ok(typeof bali.departureDirection === 'number');
});

test('transport arcs expose great-circle path and 3D metadata', async () => {
  const { app, token } = await islandJourney();
  const g = await app.getGlobe(token);

  assert.equal(g.arcs.length, 2); // Bali→Gili Air, Gili Air→Gili Meno
  const arc = g.arcs[0];
  assert.equal(arc.fromMarkerId, g.markers[0].id);
  assert.equal(arc.toMarkerId, g.markers[1].id);
  assert.ok(arc.origin.lat && arc.destination.lat);
  assert.equal(arc.greatCircleArc.length, 24);
  assert.ok(arc.greatCircleArc.every(p => typeof p.lat === 'number' && typeof p.lng === 'number'));
  assert.ok(arc.distanceKm > 0);
  assert.equal(arc.travelColour, 'ocean'); // boat
  assert.ok(arc.boatHeight > 0 && arc.flightHeight === 0);
  assert.ok(typeof arc.pathCurvature === 'number' && typeof arc.glowIntensity === 'number');
  assert.ok(typeof arc.animationDuration === 'number');
});

test('replay frames + camera moves are ordered and time-aligned', async () => {
  const { app, token } = await islandJourney();
  const g = await app.getGlobe(token);
  assert.ok(g.replayFrames.length >= 5); // 3 markers + 2 arcs
  g.replayFrames.forEach((f, i) => {
    assert.equal(f.order, i);
    assert.ok(['marker', 'arc'].includes(f.kind));
    assert.ok(f.camera && typeof f.camera.zoomLevel === 'number' && typeof f.camera.startAt === 'number');
  });
  // frames are sorted by startAt
  for (let i = 1; i < g.replayFrames.length; i += 1) assert.ok(g.replayFrames[i].startAt >= g.replayFrames[i - 1].startAt);
  assert.equal(g.cameraMoves.length, g.replayFrames.length);
});

test('filters support replay by country/transport/activity/year/favourites/longest', async () => {
  const { app, token } = await islandJourney();
  const g = await app.getGlobe(token);

  const indo = g.filters.byCountry.find(c => c.country === 'Indonesia');
  assert.ok(indo && indo.markerIds.length === 3);

  assert.ok(g.filters.byTransport.some(t => t.transport === 'fast boat'));
  assert.ok(g.filters.byActivity.some(a => a.activity === 'Dives'));

  const y2026 = g.filters.byYear.find(y => y.year === 2026);
  assert.ok(y2026 && y2026.markerIds.length === 3);

  // longest journeys sorted descending by distance
  assert.ok(g.filters.longestJourneys.length === 2);
  assert.ok(g.filters.longestJourneys[0].distanceKm >= g.filters.longestJourneys[1].distanceKm);

  // favourites only (Bali = most memories)
  assert.ok(g.filters.favouritesOnly.length >= 1);
});

test('highlights include the longest journey and most-memoried place', async () => {
  const { app, token } = await islandJourney();
  const g = await app.getGlobe(token);
  assert.ok(g.highlights.some(h => h.kind === 'longest-journey' && h.refType === 'arc'));
  assert.ok(g.highlights.some(h => h.kind === 'most-memories' && h.refType === 'marker'));
});

test('unknown places fall back to derived coordinates, clearly flagged', () => {
  const trips = [{ tripId: 't1', country: 'Atlantis', destination: 'Atlantis', area: 'Lost City', startDate: '2026-07-01', endDate: '2026-07-10' }];
  const ev = (id, note, ts) => ({ timelineEventId: id, tripId: 't1', eventType: 'journal_entry', metadata: { eventName: 'journal_entry', note, place: 'Atlantis' }, timestamp: ts });
  const g = buildGlobe([ev('a1', 'Beneath the waves', '2026-07-02T10:00:00.000Z'), ev('a2', 'A second memory', '2026-07-03T10:00:00.000Z')], trips);
  const m = g.markers[0];
  assert.equal(m.coordinateSource, 'derived');
  assert.equal(m.resolved, false);
  assert.ok(typeof m.latitude === 'number' && typeof m.longitude === 'number');
});

test('globe is deterministic and leaks no backend terms', async () => {
  const { app, token } = await islandJourney();
  const a = await app.getGlobe(token);
  const b = await app.getGlobe(token);
  assert.deepEqual(a, b);
  assertNoLeak(a);
});

test('empty journey yields a calm, valid globe', () => {
  const g = buildGlobe([], []);
  assert.deepEqual(g.markers, []);
  assert.deepEqual(g.arcs, []);
  assert.equal(g.globe.markerCount, 0);
  assert.equal(g.replay.replayDuration, 0);
});
