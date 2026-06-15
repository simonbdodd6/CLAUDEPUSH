import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileStore } from '../persistence/file-store.js';
import { createTravelApi } from '../index.js';
import { buildMemories } from '../memories.js';

function freshDir() { return mkdtempSync(join(tmpdir(), 'travel-mem-')); }
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
  const m = [
    ['Landed at Denpasar after a long flight', null, '2026-07-11T09:00:00.000Z'],
    ['Sunset over Echo Beach', 'p1', '2026-07-11T18:20:00.000Z'],
    ['Morning scuba dive on the reef', 'p2', '2026-07-12T08:00:00.000Z'],
    ['Another beach sunset, golden hour', 'p3', '2026-07-12T18:30:00.000Z'],
    ['Nasi goreng dinner at a local warung', null, '2026-07-12T20:00:00.000Z'],
    ['Hike up the rice terraces, met a monkey', 'p4', '2026-07-13T10:00:00.000Z'],
  ];
  for (const [note, photoRef, timestamp] of m) await app.capture(token, { note, photoRef, timestamp });
  return { app, token };
}

const card = (mem, id) => mem.storyCards.find(c => c.id === id);

test('GET /memories returns story cards, chapters, collections, reels and a recap', async () => {
  const { app, token } = await baliApp();
  const mem = await app.getMemories(token);

  assert.ok(mem.recap);
  assert.ok(Array.isArray(mem.storyCards) && mem.storyCards.length > 0);
  assert.ok(Array.isArray(mem.chapters) && mem.chapters.length >= 1);
  assert.ok(Array.isArray(mem.collections));
  assert.ok(Array.isArray(mem.reels));
  assert.equal(mem.basedOn.memories, 6);
  assert.equal(mem.basedOn.days, 3);
});

test('superlative story cards pick the right days/moments', async () => {
  const { app, token } = await baliApp();
  const mem = await app.getMemories(token);

  assert.equal(card(mem, 'best-day').date, '2026-07-12'); // 3 memories
  assert.equal(card(mem, 'quietest-day').date, '2026-07-13'); // 1 memory
  assert.equal(card(mem, 'most-photographed-day').date, '2026-07-12'); // 2 photos
  assert.equal(card(mem, 'best-dive-day').date, '2026-07-12');
  assert.equal(card(mem, 'most-adventurous-day').date, '2026-07-13'); // hike = mountain + wildlife

  // first / last sunset
  assert.match(card(mem, 'first-sunset').title, /first sunset/i);
  assert.equal(card(mem, 'first-sunset').date, '2026-07-11');
  assert.equal(card(mem, 'last-sunset').date, '2026-07-12');

  // first / final memory
  assert.equal(card(mem, 'first-memory').date, '2026-07-11');
  assert.equal(card(mem, 'final-memory').date, '2026-07-13');

  // trip beginning + ending from the trip dates
  assert.match(card(mem, 'trip-beginning').title, /Arrival in Bali/);
  assert.match(card(mem, 'trip-ending').title, /Farewell to Bali/);
});

test('themed collections form only with enough memories', async () => {
  const { app, token } = await baliApp();
  const mem = await app.getMemories(token);
  const ids = mem.collections.map(c => c.id);
  assert.ok(ids.includes('sunset-collection')); // 2 sunsets
  assert.ok(ids.includes('beach-collection'));  // 2 beaches
  assert.ok(!ids.includes('dive-trip'));        // only 1 dive
  assert.ok(!ids.includes('food-journey'));     // only 1 food
  const sunset = mem.collections.find(c => c.id === 'sunset-collection');
  assert.equal(sunset.count, 2);
  assert.ok(sunset.cover && sunset.entries.length === 2);
});

test('reels: most photographed day and most moving day', async () => {
  const { app, token } = await baliApp();
  const mem = await app.getMemories(token);
  const photoReel = mem.reels.find(r => r.id === 'most-photographed');
  assert.ok(photoReel);
  assert.ok(photoReel.entries.every(e => e.kind === 'photo'));
  assert.equal(photoReel.count, 2);
  const moving = mem.reels.find(r => r.id === 'most-emotional');
  assert.ok(moving);
});

test('recap packages the trip into a beautiful summary', async () => {
  const { app, token } = await baliApp();
  const mem = await app.getMemories(token);
  assert.match(mem.recap.title, /Your Bali story/);
  assert.equal(mem.recap.headline.memories, 6);
  assert.equal(mem.recap.headline.days, 3);
  assert.equal(mem.recap.year, 2026);
  assert.ok(mem.recap.topCategories.length >= 1);
  assert.match(mem.recap.storyLine, /6 memories across 3 days/);
});

test('memories are deterministic and leak no backend terms', async () => {
  const { app, token } = await baliApp();
  const a = await app.getMemories(token);
  const b = await app.getMemories(token);
  assert.deepEqual(a, b);
  assertNoLeak(a);
});

test('an empty journey yields a calm, valid memory engine', async () => {
  const app = createTravelApi({ store: new FileStore(freshDir()), appleVerifier });
  const { token } = await app.signIn({ identityToken: 'apple:new:n@e.com', displayName: 'New' });
  const mem = await app.getMemories(token);
  assert.equal(mem.recap, null);
  assert.deepEqual(mem.collections, []);
  assert.deepEqual(mem.reels, []);
  assert.deepEqual(mem.chapters, []);
  assert.equal(mem.basedOn.memories, 0);
});

test('chapters split a longer trip into weeks (pure function)', () => {
  const ev = (id, note, ts) => ({ timelineEventId: id, eventType: 'journal_entry', metadata: { eventName: 'journal_entry', note }, timestamp: ts });
  const trips = [{ tripId: 't1', country: 'Indonesia', destination: 'Bali', startDate: '2026-07-01', endDate: '2026-07-21' }];
  const events = [
    ev('e1', 'Arrival sunset on the beach', '2026-07-01T18:00:00.000Z'), // week 1
    ev('e2', 'Reef dive', '2026-07-03T09:00:00.000Z'),                    // week 1
    ev('e3', 'Mountain hike', '2026-07-10T09:00:00.000Z'),               // week 2
    ev('e4', 'Last sunset, golden hour', '2026-07-18T18:00:00.000Z'),    // week 3
  ];
  const mem = buildMemories(events, trips);
  assert.equal(mem.chapters.length, 3);
  assert.match(mem.chapters[0].title, /Chapter 1 · Arrival/);
  assert.match(mem.chapters[2].title, /Chapter 3 · Farewell/);
  assert.ok(mem.chapters.every(c => c.story && c.subtitle && c.accent));
});
