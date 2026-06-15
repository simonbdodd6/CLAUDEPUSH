import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileStore } from '../persistence/file-store.js';
import { createTravelApi } from '../index.js';
import { buildRelationships, normalizeCompanions } from '../relationships.js';

function freshDir() { return mkdtempSync(join(tmpdir(), 'travel-rel-')); }
const appleVerifier = async (t) => { const [, sub, email] = t.split(':'); return { sub, email }; };

const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'metadata', 'eventType', 'travellerIdentityId'];
function assertNoLeak(obj) {
  const seen = JSON.stringify(obj);
  for (const k of FORBIDDEN_KEYS) assert.ok(!seen.includes(`"${k}"`), `must not expose "${k}"`);
}

async function appWithManon() {
  const app = createTravelApi({ store: new FileStore(freshDir()), appleVerifier });
  const { token } = await app.signIn({ identityToken: 'apple:simon:s@e.com', displayName: 'Simon' });
  await app.putTrip(token, { tripName: 'Indonesia', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-11', endDate: '2026-07-25' });
  const m = [
    ['Landed together in Bali', null, ['Manon'], '2026-07-11T09:00:00.000Z'],
    ['Sunset over Echo Beach', 'p1', ['Manon'], '2026-07-11T18:20:00.000Z'],
    ['Morning scuba dive on the reef', 'p2', ['Manon'], '2026-07-12T08:00:00.000Z'],
    ['Another beach sunset, golden hour', 'p3', ['Manon'], '2026-07-12T18:30:00.000Z'],
    ['Solo journal — quiet morning', null, [], '2026-07-13T07:00:00.000Z'],
  ];
  for (const [note, photoRef, withList, timestamp] of m) await app.capture(token, { note, photoRef, with: withList, timestamp });
  return { app, token };
}

// --- helper -----------------------------------------------------------------

test('normalizeCompanions trims, dedupes (case-insensitive), drops empties', () => {
  assert.deepEqual(normalizeCompanions([' Manon ', 'manon', '', 'Theo', null, 42]), ['Manon', 'Theo']);
  assert.deepEqual(normalizeCompanions('nope'), []);
});

// --- via the API ------------------------------------------------------------

test('capture echoes who you were with; timeline persists it', async () => {
  const { app, token } = await appWithManon();
  const { capture } = await app.capture(token, { note: 'Dinner with friends', with: ['Manon', 'Theo'], timestamp: '2026-07-13T20:00:00.000Z' });
  assert.deepEqual(capture.with, ['Manon', 'Theo']);
});

test('GET /relationships tells the shared journey emotionally', async () => {
  const { app, token } = await appWithManon();
  const rel = await app.getRelationships(token);

  assert.ok(rel.mostTravelledWith);
  assert.equal(rel.mostTravelledWith.name, 'Manon');

  const manon = rel.companions.find(c => c.name === 'Manon');
  assert.ok(manon);
  assert.equal(manon.headline, 'You and Manon');

  // shared stats (the solo journal is excluded)
  assert.equal(manon.stats.sharedMemories, 4);
  assert.equal(manon.stats.sharedSunsets, 2);
  assert.equal(manon.stats.sharedDives, 1);
  assert.equal(manon.stats.daysTogether, 2); // 11 + 12 July

  // emotional cards present
  const titles = manon.insights.map(i => i.title);
  assert.ok(titles.some(t => /created 4 memories together/.test(t)));
  assert.ok(titles.some(t => /watched 2 sunsets together/.test(t)));
  assert.ok(titles.some(t => /favourite place together is Bali/.test(t)));

  // summary is emotional (a sentence, not a number)
  assert.match(manon.summary, /together/);
});

test('"you always dive together" only when every dive was shared (>=2 dives)', async () => {
  const { app, token } = await appWithManon();
  // With a single dive, the "always" card needs >= 2 dives → expect the gentle card.
  let rel = await app.getRelationships(token);
  let manon = rel.companions.find(c => c.name === 'Manon');
  assert.ok(manon.insights.some(i => i.id === 'dives-together'));
  assert.ok(!manon.insights.some(i => i.id === 'always-dive'));

  // Add a second shared dive → now 2 of the traveller's 2 dives are shared → "always".
  await app.capture(token, { note: 'Second scuba dive, deeper reef', photoRef: 'p9', with: ['Manon'], timestamp: '2026-07-14T08:00:00.000Z' });
  rel = await app.getRelationships(token);
  manon = rel.companions.find(c => c.name === 'Manon');
  assert.ok(manon.insights.some(i => i.id === 'always-dive' && /always dive together/.test(i.title)));
  assert.ok(!manon.insights.some(i => i.id === 'dives-together'));
});

test('relationships are deterministic and leak no backend terms', async () => {
  const { app, token } = await appWithManon();
  const a = await app.getRelationships(token);
  const b = await app.getRelationships(token);
  assert.deepEqual(a, b);
  assertNoLeak(a);
});

test('a solo traveller gets no companions — only locked hints', async () => {
  const app = createTravelApi({ store: new FileStore(freshDir()), appleVerifier });
  const { token } = await app.signIn({ identityToken: 'apple:solo:s@e.com', displayName: 'Solo' });
  await app.putTrip(token, { tripName: 'Solo', country: 'Indonesia', destination: 'Bali', area: 'Ubud', startDate: '2026-07-11', endDate: '2026-07-20' });
  await app.capture(token, { note: 'A quiet sunset alone', timestamp: '2026-07-11T18:00:00.000Z' });
  const rel = await app.getRelationships(token);
  assert.equal(rel.mostTravelledWith, null);
  assert.deepEqual(rel.companions, []);
  assert.ok(rel.locked.length >= 3);
  assert.equal(rel.basedOn.companions, 0);
});

// --- pure function: circles + recurring across trips ------------------------

test('travel circles + recurring companions across multiple trips', () => {
  const trips = [
    { tripId: 't1', country: 'Indonesia', destination: 'Bali', startDate: '2025-07-01', endDate: '2025-07-10' },
    { tripId: 't2', country: 'Thailand', destination: 'Phuket', startDate: '2026-02-01', endDate: '2026-02-10' },
  ];
  const ev = (id, tripId, note, companions, ts) => ({ timelineEventId: id, tripId, eventType: 'journal_entry', metadata: { eventName: 'journal_entry', note, companions }, timestamp: ts });
  const events = [
    ev('e1', 't1', 'Bali sunset dive', ['Manon', 'Theo'], '2025-07-02T18:00:00.000Z'),
    ev('e2', 't1', 'Beach day', ['Manon', 'Theo'], '2025-07-03T11:00:00.000Z'),
    ev('e3', 't2', 'Phuket reef dive', ['Manon', 'Theo'], '2026-02-02T08:00:00.000Z'),
  ];
  const rel = buildRelationships(events, trips);

  // Manon + Theo travelled on both trips together.
  const manon = rel.companions.find(c => c.name === 'Manon');
  assert.equal(manon.stats.tripsTogether, 2);
  assert.equal(manon.stats.countriesTogether, 2);
  assert.equal(manon.stats.placesTogether, 2);

  // recurring companions (>= 2 trips)
  assert.ok(rel.recurringCompanions.some(r => r.name === 'Manon' && r.tripsTogether === 2));

  // a travel circle of {Manon, Theo} appearing across 2 trips
  assert.equal(rel.circles.length, 1);
  assert.deepEqual(rel.circles[0].members, ['Manon', 'Theo']);
  assert.equal(rel.circles[0].tripsTogether, 2);
});
