import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileStore } from '../persistence/file-store.js';
import { createTravelApi } from '../index.js';
import { buildStats, buildFeed, categoriesFor } from '../feed.js';

function freshDir() { return mkdtempSync(join(tmpdir(), 'travel-feed-')); }
const appleVerifier = async (t) => { const [, sub, email] = t.split(':'); return { sub, email }; };

const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'metadata', 'eventType', 'travellerIdentityId'];
function assertNoLeak(obj) {
  const seen = JSON.stringify(obj);
  for (const k of FORBIDDEN_KEYS) assert.ok(!seen.includes(`"${k}"`), `must not expose "${k}"`);
}

async function baliAppWithMoments() {
  const app = createTravelApi({ store: new FileStore(freshDir()), appleVerifier });
  const { token } = await app.signIn({ identityToken: 'apple:simon:s@e.com', displayName: 'Simon' });
  await app.putTrip(token, { tripName: 'Indonesia', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-11', endDate: '2026-07-25' });
  // A small journey: arrival flight, two beach sunsets, a dive, a warung dinner, a rice-terrace hike.
  await app.capture(token, { note: 'Landed at Denpasar after a long flight', timestamp: '2026-07-11T09:00:00.000Z' });
  await app.capture(token, { photoRef: 'p1', note: 'Sunset over Echo Beach', timestamp: '2026-07-11T18:20:00.000Z' });
  await app.capture(token, { photoRef: 'p2', note: 'Morning scuba dive on the reef', timestamp: '2026-07-12T08:00:00.000Z' });
  await app.capture(token, { photoRef: 'p3', note: 'Another beach sunset, golden hour', timestamp: '2026-07-12T18:30:00.000Z' });
  await app.capture(token, { note: 'Nasi goreng dinner at a local warung', timestamp: '2026-07-12T20:00:00.000Z' });
  await app.capture(token, { photoRef: 'p4', note: 'Hike up the rice terraces, met a monkey', timestamp: '2026-07-13T10:00:00.000Z' });
  return { app, token };
}

// --- categorization ---------------------------------------------------------

test('categoriesFor tags memories from their own words', () => {
  assert.deepEqual(categoriesFor({ title: 'Sunset over Echo Beach', detail: '' }).sort(), ['beach', 'sunset']);
  assert.deepEqual(categoriesFor({ title: 'Morning scuba dive on the reef', detail: '' }), ['dive']);
  assert.deepEqual(categoriesFor({ title: 'Nasi goreng dinner at a warung', detail: '' }), ['food']);
  assert.deepEqual(categoriesFor({ title: 'Hike up the rice terraces, met a monkey', detail: '' }).sort(), ['mountain', 'wildlife']);
  assert.deepEqual(categoriesFor({ title: 'A quiet thought', detail: 'nothing notable' }), []);
});

// --- stats ------------------------------------------------------------------

test('GET /stats returns beautiful, display-ready statistics', async () => {
  const { app, token } = await baliAppWithMoments();
  const { stats } = await app.getStats(token);

  assert.equal(stats.headline.countries, 1);
  assert.equal(stats.journey.countriesList[0], 'Indonesia');
  assert.equal(stats.journey.tripDuration, 15); // 11–25 July inclusive
  assert.equal(stats.headline.daysTravelling, 3); // moments on 11, 12, 13 July
  assert.ok(stats.journey.placesList.includes('Bali'));
  assert.ok(stats.journey.placesList.includes('Canggu'));

  // memory categories derived from the notes
  const counts = Object.fromEntries(stats.categories.map(c => [c.key, c.count]));
  assert.equal(counts.sunset, 2);
  assert.equal(counts.beach, 2);
  assert.equal(counts.dive, 1);
  assert.equal(counts.food, 1);
  assert.equal(counts.wildlife, 1);
  assert.equal(counts.flight, 1);
  assert.equal(stats.activity.diveCount, 1);
  assert.equal(stats.activity.flightsTaken, 1);

  // categories are display-ready and richest-first
  assert.ok(stats.categories[0].count >= stats.categories[1].count);
  assert.ok(stats.categories.every(c => c.label && c.accent && c.icon));
});

test('streaks count consecutive days of memories', async () => {
  const { app, token } = await baliAppWithMoments();
  const { stats } = await app.getStats(token);
  assert.equal(stats.streaks.longest, 3); // 11, 12, 13 July consecutive
  assert.equal(stats.streaks.current, 3);
  assert.equal(stats.streaks.unit, 'days');
});

// --- feed -------------------------------------------------------------------

test('GET /feed returns a hero memory, featured photos, highlights, today + stats', async () => {
  const { app, token } = await baliAppWithMoments();
  const feed = await app.getFeed(token);

  // Hero is a real photo memory, framed by place.
  assert.ok(feed.hero);
  assert.equal(feed.hero.kind, 'photo');
  assert.equal(feed.hero.place, 'Bali');
  assert.equal(feed.hero.featured, true);

  // Featured photos (newest-first, capped).
  assert.ok(feed.featuredPhotos.length >= 3 && feed.featuredPhotos.length <= 6);
  assert.ok(feed.featuredPhotos.every(p => p.kind === 'photo'));

  // Highlights include the arrival beat.
  assert.ok(feed.highlights.some(h => h.id === 'arrival' && /Arrival in Bali/.test(h.title)));
  assert.ok(feed.highlights.length <= 4);

  // Today's premium day card is present (newest day).
  assert.ok(feed.today);
  assert.equal(feed.today.label, 'Day 3'); // 13 July is day 3 of the trip
  assert.ok(feed.today.entries.length >= 1);

  // Stats embedded for an at-a-glance header.
  assert.equal(feed.stats.headline.daysTravelling, 3);
});

test('feed/stats are deterministic and never leak backend terms', async () => {
  const { app, token } = await baliAppWithMoments();
  const a = await app.getFeed(token);
  const b = await app.getFeed(token);
  assert.deepEqual(a, b); // deterministic
  assertNoLeak(a);
  assertNoLeak(await app.getStats(token));
});

test('empty journey yields a calm, valid feed (no crashes, sensible zeros)', async () => {
  const app = createTravelApi({ store: new FileStore(freshDir()), appleVerifier });
  const { token } = await app.signIn({ identityToken: 'apple:new:n@e.com', displayName: 'New' });
  const feed = await app.getFeed(token);
  assert.equal(feed.hero, null);
  assert.deepEqual(feed.featuredPhotos, []);
  assert.equal(feed.stats.headline.daysTravelling, 0);
  assert.equal(feed.stats.streaks.longest, 0);
  assert.equal(feed.today, null);
});

// --- pure-function guards ---------------------------------------------------

test('buildStats / buildFeed are pure functions of (events, trip)', () => {
  const events = [
    { timelineEventId: 'e1', eventType: 'journal_entry', metadata: { eventName: 'journal_entry', note: 'Sunset on the beach' }, timestamp: '2026-07-11T18:00:00.000Z' },
  ];
  const trip = { destination: 'Bali', country: 'Indonesia', area: 'Canggu', startDate: '2026-07-11', endDate: '2026-07-20' };
  const stats = buildStats(events, trip);
  assert.equal(stats.headline.daysTravelling, 1);
  const counts = Object.fromEntries(stats.categories.map(c => [c.key, c.count]));
  assert.equal(counts.sunset, 1);
  assert.equal(counts.beach, 1);
  const feed = buildFeed(events, trip);
  assert.equal(feed.stats.headline.daysTravelling, 1);
});
