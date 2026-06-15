import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileStore } from '../persistence/file-store.js';
import { createTravelApi } from '../index.js';
import { buildTravelDna } from '../travel-dna.js';

function freshDir() { return mkdtempSync(join(tmpdir(), 'travel-dna-')); }
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
    ['Dawn surf at Echo Beach', 'p1', ['Manon'], '2026-07-11T06:30:00.000Z'],
    ['Sunset over the beach', 'p2', ['Manon'], '2026-07-11T18:20:00.000Z'],
    ['Morning scuba dive on the reef', 'p3', ['Manon'], '2026-07-12T07:00:00.000Z'],
    ['Beach day, more surf', 'p4', ['Manon'], '2026-07-12T11:00:00.000Z'],
    ['Another reef dive, manta rays', 'p5', ['Manon'], '2026-07-13T08:00:00.000Z'],
    ['Quiet journal by the sea', null, [], '2026-07-13T19:00:00.000Z'],
  ];
  for (const [note, photoRef, withList, timestamp] of m) await app.capture(token, { note, photoRef, with: withList, timestamp });
  return { app, token };
}

const trait = (dna, id) => dna.traits.find(t => t.id === id);

test('GET /travel-dna builds long-term characteristics from evidence', async () => {
  const { app, token } = await oceanTraveller();
  const dna = await app.getTravelDna(token);

  assert.ok(dna.headline && dna.headline.statement && dna.headline.trait);
  assert.ok(dna.traits.length >= 5);
  assert.equal(dna.basedOn.memories, 6);
  assert.ok(dna.basedOn.span && dna.basedOn.span.from && dna.basedOn.span.to);

  const ocean = trait(dna, 'ocean-affinity');
  assert.ok(ocean);
  assert.match(ocean.statement, /ocean/i);
  assert.ok(ocean.score >= 50);

  const water = trait(dna, 'water-vs-mountains');
  assert.ok(water);
  assert.ok(water.score >= 60); // all-water, no mountains
});

test('every trait carries the required long-term shape', async () => {
  const { app, token } = await oceanTraveller();
  const dna = await app.getTravelDna(token);
  for (const t of dna.traits) {
    assert.ok(t.id && t.label && t.statement);
    assert.ok(typeof t.score === 'number' && t.score >= 0 && t.score <= 100);
    assert.ok(t.evidence && typeof t.evidence.count === 'number' && t.evidence.detail);
    assert.ok(['emerging', 'strong', 'defining'].includes(t.confidence));
    assert.ok(['rising', 'falling', 'steady', 'new'].includes(t.trend));
    assert.ok('firstObserved' in t && 'latestObserved' in t);
    assert.ok(t.category && t.accent && t.icon);
  }
});

test('identity traits surface diving and surfing for this traveller', async () => {
  const { app, token } = await oceanTraveller();
  const dna = await app.getTravelDna(token);
  assert.ok(trait(dna, 'diving-identity'));
  assert.match(trait(dna, 'diving-identity').statement, /Diving/);
  assert.ok(trait(dna, 'surfing-identity'));
});

test('traits with no evidence are honestly absent (no spending/accommodation)', async () => {
  const { app, token } = await oceanTraveller();
  const dna = await app.getTravelDna(token);
  assert.equal(trait(dna, 'spending-tier'), undefined);
  assert.equal(trait(dna, 'favourite-accommodation'), undefined);
  // no mountains were recorded → no hiking identity
  assert.equal(trait(dna, 'hiking-identity'), undefined);
});

test('travel DNA is deterministic and leaks no backend terms', async () => {
  const { app, token } = await oceanTraveller();
  const a = await app.getTravelDna(token);
  const b = await app.getTravelDna(token);
  assert.deepEqual(a, b);
  assertNoLeak(a);
});

test('a brand-new traveller has no DNA yet', async () => {
  const app = createTravelApi({ store: new FileStore(freshDir()), appleVerifier });
  const { token } = await app.signIn({ identityToken: 'apple:new:n@e.com', displayName: 'New' });
  const dna = await app.getTravelDna(token);
  assert.equal(dna.headline, null);
  assert.deepEqual(dna.traits, []);
  assert.equal(dna.basedOn.memories, 0);
});

// --- pure function: favourites, return affinity, trend ----------------------

test('multi-trip DNA finds favourite country, return affinity and a trend', () => {
  const trips = [
    { tripId: 't1', country: 'Indonesia', destination: 'Bali', startDate: '2024-07-01', endDate: '2024-07-10' },
    { tripId: 't2', country: 'Indonesia', destination: 'Bali', startDate: '2026-07-01', endDate: '2026-07-10' },
    { tripId: 't3', country: 'Thailand', destination: 'Phuket', startDate: '2025-02-01', endDate: '2025-02-08' },
  ];
  const ev = (id, tripId, note, ts) => ({ timelineEventId: id, tripId, eventType: 'journal_entry', metadata: { eventName: 'journal_entry', note }, timestamp: ts });
  const events = [
    ev('a1', 't1', 'City temple and museum', '2024-07-02T10:00:00.000Z'),
    ev('a2', 't1', 'Another museum, culture day', '2024-07-03T10:00:00.000Z'),
    ev('b1', 't2', 'Reef dive', '2026-07-02T08:00:00.000Z'),
    ev('b2', 't2', 'Beach surf, big swell', '2026-07-03T08:00:00.000Z'),
    ev('c1', 't3', 'Beach sunset', '2025-02-02T18:00:00.000Z'),
    ev('c2', 't3', 'Reef dive at the wreck', '2025-02-03T08:00:00.000Z'),
  ];
  const dna = buildTravelDna(events, trips);

  const country = dna.traits.find(t => t.id === 'favourite-country');
  assert.ok(country);
  assert.equal(country.value, 'Indonesia');
  assert.match(country.statement, /longer in Indonesia/);

  const ret = dna.traits.find(t => t.id === 'return-affinity');
  assert.ok(ret);
  assert.equal(ret.value, 'Bali');
  assert.ok(ret.score > 0);

  // water rose over time (early trip was culture, later trips water) → rising trend
  const water = dna.traits.find(t => t.id === 'water-vs-mountains');
  assert.ok(water && ['rising', 'steady'].includes(water.trend));

  assert.equal(dna.basedOn.trips, 3);
});
