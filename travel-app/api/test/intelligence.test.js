import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileStore } from '../persistence/file-store.js';
import { createTravelApi } from '../index.js';
import { buildIntelligence } from '../intelligence.js';

function freshDir() { return mkdtempSync(join(tmpdir(), 'travel-intel-')); }
const appleVerifier = async (t) => { const [, sub, email] = t.split(':'); return { sub, email }; };

const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'metadata', 'eventType', 'travellerIdentityId'];
function assertNoLeak(obj) {
  const seen = JSON.stringify(obj);
  for (const k of FORBIDDEN_KEYS) assert.ok(!seen.includes(`"${k}"`), `must not expose "${k}"`);
}

async function baliApp() {
  const app = createTravelApi({ store: new FileStore(freshDir()), appleVerifier });
  const { token } = await app.signIn({ identityToken: 'apple:simon:s@e.com', displayName: 'Simon' });
  await app.putTrip(token, { tripName: 'Indonesia', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-11', endDate: '2026-07-25' });
  const moments = [
    ['Landed at Denpasar after a long flight', null, '2026-07-11T09:00:00.000Z'],
    ['Sunset over Echo Beach', 'p1', '2026-07-11T18:20:00.000Z'],
    ['Morning scuba dive on the reef', 'p2', '2026-07-12T08:00:00.000Z'],
    ['Another beach sunset, golden hour', 'p3', '2026-07-12T18:30:00.000Z'],
    ['Nasi goreng dinner at a local warung', null, '2026-07-12T20:00:00.000Z'],
    ['Hike up the rice terraces, met a monkey', 'p4', '2026-07-13T06:30:00.000Z'],
  ];
  for (const [note, photoRef, timestamp] of moments) await app.capture(token, { note, photoRef, timestamp });
  return { app, token };
}

const byId = (intel, id) => intel.insights.find(i => i.id === id);

// --- via the API ------------------------------------------------------------

test('GET /intelligence returns a signature style + evidence-backed insights', async () => {
  const { app, token } = await baliApp();
  const intel = await app.getIntelligence(token);

  assert.ok(intel.travelStyle, 'a signature style line is present');
  assert.ok(intel.travelStyle.headline && intel.travelStyle.accent && intel.travelStyle.icon);

  // Sunsets share: 2 of 6 memories = 33%.
  const sunset = byId(intel, 'sunset-share');
  assert.ok(sunset);
  assert.match(sunset.title, /33% of your memories/);
  assert.equal(sunset.stat.value, 33);

  // Beaches (2) vs cities (0).
  const bvc = byId(intel, 'beach-vs-city');
  assert.ok(bvc);
  assert.match(bvc.title, /beaches than in cities/);

  // Favourite activity is one of the activity categories.
  const act = byId(intel, 'favourite-activity');
  assert.ok(act);
  assert.match(act.title, /Your favourite thing to do/);

  assert.equal(intel.basedOn.memories, 6);
  assert.equal(intel.basedOn.trips, 1);
});

test('daily rhythm reflects the traveller actually being an early riser', async () => {
  const app = createTravelApi({ store: new FileStore(freshDir()), appleVerifier });
  const { token } = await app.signIn({ identityToken: 'apple:early:e@e.com', displayName: 'Early' });
  await app.putTrip(token, { tripName: 'Indo', country: 'Indonesia', destination: 'Bali', area: 'Uluwatu', startDate: '2026-07-11', endDate: '2026-07-20' });
  await app.capture(token, { note: 'Dawn swim', timestamp: '2026-07-11T05:30:00.000Z' });
  await app.capture(token, { note: 'Early surf', timestamp: '2026-07-12T06:15:00.000Z' });
  await app.capture(token, { note: 'Sunrise hike', timestamp: '2026-07-13T06:00:00.000Z' });

  const intel = await app.getIntelligence(token);
  const rhythm = byId(intel, 'daily-rhythm');
  assert.ok(rhythm);
  assert.match(rhythm.title, /up before 7am/);
});

test('travel streak insight counts consecutive memory days', async () => {
  const { app, token } = await baliApp();
  const intel = await app.getIntelligence(token);
  const streak = byId(intel, 'travel-streak');
  assert.ok(streak);
  assert.match(streak.title, /3 in a row/); // 11, 12, 13 July
  assert.equal(streak.stat.value, 3);
});

test('intelligence is deterministic and leaks no backend terms', async () => {
  const { app, token } = await baliApp();
  const a = await app.getIntelligence(token);
  const b = await app.getIntelligence(token);
  assert.deepEqual(a, b);
  assertNoLeak(a);
});

test('a brand-new traveller gets no false claims — only locked hints', async () => {
  const app = createTravelApi({ store: new FileStore(freshDir()), appleVerifier });
  const { token } = await app.signIn({ identityToken: 'apple:new:n@e.com', displayName: 'New' });
  const intel = await app.getIntelligence(token);
  assert.equal(intel.travelStyle, null);
  assert.deepEqual(intel.insights, []);
  assert.ok(intel.locked.length >= 3);
  assert.ok(intel.locked.every(l => l.id && l.title && l.hint));
  assert.equal(intel.basedOn.memories, 0);
});

// --- pure-function: multi-trip observations (favourite country, revisits) ----

test('multi-trip intelligence finds favourite country, revisits, season, average length', () => {
  const trips = [
    { country: 'Indonesia', destination: 'Bali', startDate: '2025-07-01', endDate: '2025-07-15' },
    { country: 'Indonesia', destination: 'Bali', startDate: '2026-07-10', endDate: '2026-07-20' },
    { country: 'Thailand', destination: 'Phuket', startDate: '2024-12-01', endDate: '2024-12-10' },
  ];
  const events = [
    { timelineEventId: 'e1', eventType: 'journal_entry', metadata: { eventName: 'journal_entry', note: 'Sunset dive on the reef' }, timestamp: '2026-07-11T18:00:00.000Z' },
  ];
  const intel = buildIntelligence(events, trips);

  const country = intel.insights.find(i => i.id === 'favourite-country');
  assert.ok(country);
  assert.match(country.title, /favourite country is Indonesia/);
  assert.equal(country.stat.value, 'Indonesia');

  const revisit = intel.insights.find(i => i.id === 'revisits');
  assert.ok(revisit);
  assert.match(revisit.title, /keep returning to Bali/);
  assert.equal(revisit.stat.value, 2);

  const avg = intel.insights.find(i => i.id === 'average-trip-length');
  assert.ok(avg);
  assert.match(avg.title, /average \d+ days/);

  const season = intel.insights.find(i => i.id === 'favourite-season');
  assert.ok(season);
  assert.match(season.title, /summer/); // two July trips → summer dominates

  assert.equal(intel.basedOn.trips, 3);
});

test('insights are ordered strongest-first (deterministic)', () => {
  const trips = [
    { country: 'Indonesia', destination: 'Bali', startDate: '2025-07-01', endDate: '2025-07-15' },
    { country: 'Indonesia', destination: 'Bali', startDate: '2026-07-10', endDate: '2026-07-20' },
  ];
  const events = [
    { timelineEventId: 'e1', eventType: 'journal_entry', metadata: { eventName: 'journal_entry', note: 'Sunset on the beach' }, timestamp: '2026-07-11T18:00:00.000Z' },
  ];
  const intel = buildIntelligence(events, trips);
  // favourite-country (90) and revisits (85) should lead the deck.
  assert.equal(intel.insights[0].id, 'favourite-country');
  assert.equal(intel.insights[1].id, 'revisits');
});
