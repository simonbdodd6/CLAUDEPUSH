import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileStore } from '../persistence/file-store.js';
import { createTravelApi } from '../index.js';
import { buildPredictions } from '../predictions.js';

function freshDir() { return mkdtempSync(join(tmpdir(), 'travel-pred-')); }
const appleVerifier = async (t) => { const [, sub, email] = t.split(':'); return { sub, email }; };

const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'metadata', 'eventType', 'travellerIdentityId'];
function assertNoLeak(obj) {
  const seen = JSON.stringify(obj);
  for (const k of FORBIDDEN_KEYS) assert.ok(!seen.includes(`"${k}"`), `must not expose "${k}"`);
}

async function oceanTraveller() {
  const app = createTravelApi({ store: new FileStore(freshDir()), appleVerifier });
  const { token } = await app.signIn({ identityToken: 'apple:simon:s@e.com', displayName: 'Simon' });
  await app.putTrip(token, { tripName: 'Indonesia', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-11', endDate: '2026-07-25' });
  const m = [
    ['Early surf at Echo Beach', 'p1', ['Manon'], '2026-07-11T06:00:00.000Z'],
    ['Sunset over the beach', 'p2', ['Manon'], '2026-07-11T18:20:00.000Z'],
    ['Morning surf at the beach', 'p3', ['Manon'], '2026-07-12T05:40:00.000Z'],
    ['Beach sunset, golden hour', 'p4', ['Manon'], '2026-07-12T18:30:00.000Z'],
    ['Early swim at the beach', 'p5', ['Manon'], '2026-07-13T05:50:00.000Z'],
    ['Another beach sunset', 'p6', ['Manon'], '2026-07-13T18:40:00.000Z'],
  ];
  for (const [note, photoRef, withList, timestamp] of m) await app.capture(token, { note, photoRef, with: withList, timestamp });
  return { app, token };
}

const pred = (out, id) => out.predictions.find(p => p.id === id);

test('GET /predictions anticipates from evidence with full prediction shape', async () => {
  const { app, token } = await oceanTraveller();
  const out = await app.getPredictions(token);

  assert.ok(out.predictions.length >= 3);
  assert.equal(out.basedOn.memories, 6);

  for (const p of out.predictions) {
    assert.ok(p.id && p.category && p.statement && p.explanation);
    assert.ok(typeof p.score === 'number' && p.score >= 0 && p.score <= 100);
    assert.ok(['emerging', 'strong', 'defining'].includes(p.confidence));
    assert.ok(p.evidence && typeof p.evidence.count === 'number' && p.evidence.detail);
    assert.ok(Array.isArray(p.supportingMemories));
    assert.ok('firstObserved' in p && 'lastObserved' in p);
    assert.ok(['rising', 'falling', 'steady', 'new'].includes(p.trend));
    assert.ok(p.accent && p.icon);
  }
});

test('predicts wake rhythm near the ocean and photographing sunsets', async () => {
  const { app, token } = await oceanTraveller();
  const out = await app.getPredictions(token);

  const wake = pred(out, 'wake-rhythm');
  assert.ok(wake);
  assert.match(wake.statement, /wake before sunrise near the ocean/);
  assert.ok(wake.supportingMemories.length >= 2);

  const photo = pred(out, 'photo-sunset');
  assert.ok(photo);
  assert.match(photo.statement, /photograph sunsets/);
  assert.equal(photo.explanation, '3 of your 3 sunset memories are photos.');

  const companion = pred(out, 'companion');
  assert.ok(companion);
  assert.match(companion.statement, /often travel with Manon/);
});

test('packing suggestions are derived from identity evidence', async () => {
  const { app, token } = await oceanTraveller();
  const out = await app.getPredictions(token);
  const packing = pred(out, 'packing');
  assert.ok(packing);
  assert.ok(Array.isArray(packing.items) && packing.items.length >= 1);
  assert.ok(packing.items.every(s => s.item && s.reason));
  assert.ok(packing.items.some(s => /board/i.test(s.item))); // surfs
});

test('no prediction appears without sufficient evidence', async () => {
  const app = createTravelApi({ store: new FileStore(freshDir()), appleVerifier });
  const { token } = await app.signIn({ identityToken: 'apple:thin:t@e.com', displayName: 'Thin' });
  await app.putTrip(token, { tripName: 'Indo', country: 'Indonesia', destination: 'Bali', area: 'Ubud', startDate: '2026-07-11', endDate: '2026-07-20' });
  await app.capture(token, { note: 'A single quiet thought', timestamp: '2026-07-11T12:00:00.000Z' });
  const out = await app.getPredictions(token);
  // only one memory → no companion/wake/photo/activity predictions
  assert.equal(pred(out, 'companion'), undefined);
  assert.equal(pred(out, 'wake-rhythm'), undefined);
  assert.equal(pred(out, 'photo-sunset'), undefined);
  assert.equal(pred(out, 'activity-day-dive'), undefined);
});

test('predictions are deterministic and leak no backend terms', async () => {
  const { app, token } = await oceanTraveller();
  const a = await app.getPredictions(token);
  const b = await app.getPredictions(token);
  assert.deepEqual(a, b);
  assertNoLeak(a);
});

// --- pure function: activity-day + return across multiple trips --------------

test('predicts "you normally dive on your second day" across trips', () => {
  const trips = [
    { tripId: 't1', country: 'Indonesia', destination: 'Bali', startDate: '2024-07-01', endDate: '2024-07-10' },
    { tripId: 't2', country: 'Indonesia', destination: 'Bali', startDate: '2026-07-01', endDate: '2026-07-10' },
  ];
  const ev = (id, tripId, note, ts) => ({ timelineEventId: id, tripId, eventType: 'journal_entry', metadata: { eventName: 'journal_entry', note }, timestamp: ts });
  const events = [
    ev('a1', 't1', 'Settling in, beach walk', '2024-07-01T11:00:00.000Z'),
    ev('a2', 't1', 'First scuba dive on the reef', '2024-07-02T08:00:00.000Z'), // day 2
    ev('b1', 't2', 'Arrival, beach sunset', '2026-07-01T18:00:00.000Z'),
    ev('b2', 't2', 'Reef dive, manta rays', '2026-07-02T08:00:00.000Z'),       // day 2
  ];
  const out = buildPredictions(events, trips);

  const diveDay = out.predictions.find(p => p.id === 'activity-day-dive');
  assert.ok(diveDay);
  assert.match(diveDay.statement, /normally dive on your 2nd day/);
  assert.equal(diveDay.evidence.count, 2);

  const ret = out.predictions.find(p => p.id === 'return-destination');
  assert.ok(ret);
  assert.match(ret.statement, /often return to Bali/);
  assert.equal(ret.evidence.count, 2);
});
