import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileStore } from '../persistence/file-store.js';
import { createTravelApi } from '../index.js';
import { buildJourneyReplay } from '../journey-replay.js';

function freshDir() { return mkdtempSync(join(tmpdir(), 'travel-replay-')); }
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
    { note: 'Snorkelling the reef, scuba dive', photoRef: 'p2', place: 'Gili Air', timestamp: '2026-07-13T14:00:00.000Z' },
    { note: 'Private boat to the quiet island', place: 'Gili Meno', move: { type: 'private boat', from: 'Gili Air', to: 'Gili Meno' }, timestamp: '2026-07-15T11:00:00.000Z' },
    { note: 'Turtle sighting, beach day', photoRef: 'p3', place: 'Gili Meno', timestamp: '2026-07-15T16:00:00.000Z' },
  ];
  for (const c of caps) await app.capture(token, c);
  return { app, token };
}

test('GET /journey/replay exposes replay span and a contiguous timeline', async () => {
  const { app, token } = await islandJourney();
  const r = await app.getJourneyReplay(token);

  assert.equal(r.replay.replayStart, 0);
  assert.ok(r.replay.replayDuration > 0);
  assert.equal(r.replay.replayEnd, r.replay.replayDuration);
  assert.equal(r.replay.nodeCount, r.timeline.length);

  // animation order is sequential and the timeline is contiguous (play/pause/resume ready)
  r.timeline.forEach((n, i) => {
    assert.equal(n.replay.order, i);
    assert.ok(n.replay.startAt <= n.replay.endAt);
    if (i > 0) assert.equal(n.replay.startAt, r.timeline[i - 1].replay.endAt);
  });
  assert.equal(r.timeline[0].replay.startAt, 0);
  assert.equal(r.timeline[r.timeline.length - 1].replay.endAt, r.replay.replayDuration);
});

test('every transport segment exposes path, colour, icon and animation style', async () => {
  const { app, token } = await islandJourney();
  const r = await app.getJourneyReplay(token);
  const segments = r.timeline.filter(n => n.type === 'segment');
  assert.ok(segments.length >= 3);
  for (const s of segments) {
    assert.ok(s.transportIcon && s.transportColour && s.animationStyle);
    assert.ok(s.pathType && s.path && typeof s.path.style === 'string');
    assert.ok(typeof s.replay.movementSpeed === 'number' && typeof s.replay.zoomLevel === 'number');
  }
  const flight = segments.find(s => s.transport === 'flight');
  assert.equal(flight.pathType, 'flight');
  assert.equal(flight.path.style, 'arc');
  assert.equal(flight.transportColour, 'sky');

  const fastBoat = segments.find(s => s.transport === 'fast boat');
  assert.equal(fastBoat.pathType, 'sea');
  assert.equal(fastBoat.animationStyle, 'wave-glide');
});

test('every destination exposes arrival, stay, cover, highlights, activities, accommodation, chapter', async () => {
  const { app, token } = await islandJourney();
  const r = await app.getJourneyReplay(token);
  const bali = r.timeline.find(n => n.type === 'stop' && n.place === 'Bali');
  assert.ok(bali.replay.arrivalAnimation && bali.replay.zoomLevel);
  assert.ok(bali.replay.stayDuration > 0 && bali.replay.arrivalPause > 0 && bali.replay.departurePause > 0);
  assert.equal(bali.coverPhoto, 'p1');
  assert.ok(bali.highlightMemories.length >= 1);
  assert.ok(Array.isArray(bali.favouriteMemories));
  assert.ok(bali.activitySummary);
  assert.ok(Array.isArray(bali.accommodation));
  assert.equal(bali.chapterTitle, 'Chapter 1');
});

test('islands are detected from sea arrivals; flight arrivals are not islands', async () => {
  const { app, token } = await islandJourney();
  const r = await app.getJourneyReplay(token);
  const bali = r.timeline.find(n => n.type === 'stop' && n.place === 'Bali');
  const giliAir = r.timeline.find(n => n.type === 'stop' && n.place === 'Gili Air');
  const giliMeno = r.timeline.find(n => n.type === 'stop' && n.place === 'Gili Meno');
  assert.equal(bali.arrivedBy, 'flight');
  assert.equal(bali.isIsland, false);
  assert.equal(giliAir.isIsland, true);
  assert.equal(giliMeno.isIsland, true);
});

test('controls support jump-to-chapter, per-destination, per-transport, flights-only and islands-only', async () => {
  const { app, token } = await islandJourney();
  const r = await app.getJourneyReplay(token);

  assert.ok(r.capabilities.play && r.capabilities.pause && r.capabilities.resume);

  // jump to chapter
  assert.ok(r.controls.jumpToChapter.length >= 1);
  assert.ok(r.controls.jumpToChapter.every(c => c.label && typeof c.startAt === 'number' && typeof c.endAt === 'number'));

  // replay one destination
  assert.deepEqual(r.controls.replayDestination.map(d => d.place), ['Bali', 'Gili Air', 'Gili Meno']);

  // replay one transport type
  assert.ok(r.controls.replayTransport.some(t => t.transport === 'fast boat'));

  // flights only
  assert.ok(r.controls.replayFlightsOnly && r.controls.replayFlightsOnly.segments.length >= 1);

  // islands only
  assert.deepEqual(r.controls.replayIslandsOnly.map(s => s.place), ['Gili Air', 'Gili Meno']);
});

test('replay is deterministic and leaks no backend terms', async () => {
  const { app, token } = await islandJourney();
  const a = await app.getJourneyReplay(token);
  const b = await app.getJourneyReplay(token);
  assert.deepEqual(a, b);
  assertNoLeak(a);
});

test('an empty journey yields a calm, valid (zero-duration) replay', () => {
  const r = buildJourneyReplay([], []);
  assert.equal(r.replay.replayDuration, 0);
  assert.deepEqual(r.timeline, []);
  assert.equal(r.capabilities.replayFlightsOnly, false);
  assert.deepEqual(r.controls.replayIslandsOnly, []);
});
