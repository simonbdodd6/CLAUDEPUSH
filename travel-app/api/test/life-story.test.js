import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileStore } from '../persistence/file-store.js';
import { createTravelApi } from '../index.js';
import { buildLifeStory } from '../life-story.js';

function freshDir() { return mkdtempSync(join(tmpdir(), 'travel-life-')); }
const appleVerifier = async (t) => { const [, sub, email] = t.split(':'); return { sub, email }; };

const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'metadata', 'eventType', 'travellerIdentityId', '_sig'];
function assertNoLeak(obj) {
  const seen = JSON.stringify(obj);
  for (const k of FORBIDDEN_KEYS) assert.ok(!seen.includes(`"${k}"`), `must not expose "${k}"`);
}

async function baliApp() {
  const app = createTravelApi({ store: new FileStore(freshDir()), appleVerifier });
  const { token } = await app.signIn({ identityToken: 'apple:simon:s@e.com', displayName: 'Simon' });
  await app.putTrip(token, { tripName: 'Indonesia', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-11', endDate: '2026-07-25' });
  const m = [
    ['Landed at Denpasar after a long flight', null, ['Manon'], '2026-07-11T09:00:00.000Z'],
    ['Sunset over Echo Beach', 'p1', ['Manon'], '2026-07-11T18:20:00.000Z'],
    ['Morning scuba dive on the reef', 'p2', ['Manon'], '2026-07-12T08:00:00.000Z'],
    ['Another beach sunset, golden hour', 'p3', ['Manon'], '2026-07-12T18:30:00.000Z'],
    ['Nasi goreng dinner at a local warung', null, [], '2026-07-12T20:00:00.000Z'],
    ['Hike up the rice terraces, met a monkey', 'p4', ['Manon'], '2026-07-13T10:00:00.000Z'],
  ];
  for (const [note, photoRef, withList, timestamp] of m) await app.capture(token, { note, photoRef, with: withList, timestamp });
  return { app, token };
}

const story = (life, id) => life.stories.find(s => s.id === id);

test('GET /life-story curates titled life stories from one trip', async () => {
  const { app, token } = await baliApp();
  const life = await app.getLifeStory(token);

  assert.ok(life.stories.length >= 3);
  assert.equal(life.basedOn.memories, 6);
  assert.ok(life.basedOn.span && life.basedOn.span.label === 'Jul 2026');

  // The Bali Chapter
  const bali = story(life, 'chapter-bali');
  assert.ok(bali);
  assert.equal(bali.title, 'The Bali Chapter');
  assert.equal(bali.category, 'place');
  assert.equal(bali.subtitle, 'Jul 2026');

  // The Summer You Learned To Dive
  const dive = story(life, 'learned-to-dive');
  assert.ok(dive);
  assert.equal(dive.title, 'The Summer You Learned To Dive');
  assert.equal(dive.subtitle, 'July 2026');

  // Travelling With Manon (5 shared memories)
  const manon = story(life, 'with-manon');
  assert.ok(manon);
  assert.equal(manon.title, 'Travelling With Manon');
  assert.equal(manon.category, 'person');
});

test('every life story carries the required shape', async () => {
  const { app, token } = await baliApp();
  const life = await app.getLifeStory(token);
  for (const s of life.stories) {
    assert.ok(s.title && s.subtitle && s.framing, `${s.id} has framing`);
    assert.ok('cover' in s && 'hero' in s);
    assert.ok(Array.isArray(s.memories) && s.memories.length >= 1);
    assert.ok(s.statistics && typeof s.statistics.memories === 'number');
    assert.ok(s.span && s.span.from && s.span.to && typeof s.span.days === 'number' && s.span.label);
    assert.ok(s.category && s.accent && s.icon);
    assert.ok(s.evidence && typeof s.evidence.count === 'number' && ['emerging', 'strong', 'defining'].includes(s.evidence.confidence));
    // hero is the cover's photo reference (or null)
    assert.equal(s.hero, s.cover?.photoRef ?? null);
  }
});

test('themed stories appear only with enough evidence', async () => {
  const { app, token } = await baliApp();
  const life = await app.getLifeStory(token);
  assert.ok(story(life, 'sunset-collection')); // 2 sunsets
  assert.ok(story(life, 'ocean-memories'));     // 2 beach + 1 dive = 3
  assert.ok(!story(life, 'diving-journey'));     // only 1 dive (< 2)
  assert.ok(!story(life, 'food-trail'));         // only 1 food (< 2)
});

test('life stories are deterministic and leak no backend terms or internals', async () => {
  const { app, token } = await baliApp();
  const a = await app.getLifeStory(token);
  const b = await app.getLifeStory(token);
  assert.deepEqual(a, b);
  assertNoLeak(a);
});

test('a brand-new traveller has no life stories yet', async () => {
  const app = createTravelApi({ store: new FileStore(freshDir()), appleVerifier });
  const { token } = await app.signIn({ identityToken: 'apple:new:n@e.com', displayName: 'New' });
  const life = await app.getLifeStory(token);
  assert.deepEqual(life.stories, []);
  assert.equal(life.basedOn.memories, 0);
  assert.equal(life.basedOn.span, null);
});

// --- pure function: multi-year / multi-trip life narrative -------------------

test('multi-trip history unlocks return, era and "places that changed you"', () => {
  const trips = [
    { tripId: 't1', country: 'Indonesia', destination: 'Bali', startDate: '2024-07-01', endDate: '2024-07-15' },
    { tripId: 't2', country: 'Indonesia', destination: 'Bali', startDate: '2026-07-01', endDate: '2026-07-15' },
    { tripId: 't3', country: 'Indonesia', destination: 'Lombok', startDate: '2025-08-01', endDate: '2025-08-12' },
  ];
  const ev = (id, tripId, note, photoRef, ts) => ({ timelineEventId: id, tripId, eventType: photoRef ? 'photo_imported' : 'journal_entry', metadata: { eventName: photoRef ? 'photo_imported' : 'journal_entry', note, photoRef }, timestamp: ts });
  const events = [
    ev('a1', 't1', 'Bali reef dive', 'p1', '2024-07-02T08:00:00.000Z'),
    ev('a2', 't1', 'Bali sunset on the beach', 'p2', '2024-07-03T18:00:00.000Z'),
    ev('a3', 't1', 'Bali monkey forest hike', 'p3', '2024-07-04T10:00:00.000Z'),
    ev('b1', 't2', 'Bali dive, manta rays', 'p4', '2026-07-02T08:00:00.000Z'),
    ev('b2', 't2', 'Bali beach sunset', 'p5', '2026-07-03T18:00:00.000Z'),
    ev('c1', 't3', 'Lombok dive at the reef', 'p6', '2025-08-02T08:00:00.000Z'),
    ev('c2', 't3', 'Lombok beach day', 'p7', '2025-08-03T11:00:00.000Z'),
    ev('c3', 't3', 'Lombok wildlife trek, saw a turtle', 'p8', '2025-08-04T09:00:00.000Z'),
  ];
  const life = buildLifeStory(events, trips);

  const ret = life.stories.find(s => s.id === 'where-you-return');
  assert.ok(ret);
  assert.equal(ret.subtitle, 'Bali'); // 2 Bali trips
  assert.equal(ret.statistics.trips, 2);

  const era = life.stories.find(s => s.id === 'island-years');
  assert.ok(era);
  assert.equal(era.subtitle, '2024–2026');

  const changed = life.stories.find(s => s.id === 'places-that-changed-you');
  assert.ok(changed); // Bali (5) + Lombok (3) both >= 3
  assert.match(changed.subtitle, /Bali/);
  assert.match(changed.subtitle, /Lombok/);

  // strongest stories surface first (return/era/changed have the biggest bonuses)
  assert.ok(['where-you-return', 'places-that-changed-you', 'island-years'].includes(life.stories[0].id));
});

test('"The Year Of Adventure" needs >= 3 adventure memories in a year', () => {
  const trips = [{ tripId: 't1', country: 'Indonesia', destination: 'Bali', startDate: '2026-07-01', endDate: '2026-07-20' }];
  const ev = (id, note, ts) => ({ timelineEventId: id, tripId: 't1', eventType: 'journal_entry', metadata: { eventName: 'journal_entry', note }, timestamp: ts });
  const events = [
    ev('a1', 'Reef dive', '2026-07-02T08:00:00.000Z'),
    ev('a2', 'Mountain hike', '2026-07-05T09:00:00.000Z'),
    ev('a3', 'Wildlife trek, saw a turtle', '2026-07-08T09:00:00.000Z'),
  ];
  const life = buildLifeStory(events, trips);
  const adventure = life.stories.find(s => s.id === 'year-of-adventure');
  assert.ok(adventure);
  assert.equal(adventure.subtitle, '2026');
  assert.equal(adventure.category, 'era');
});
