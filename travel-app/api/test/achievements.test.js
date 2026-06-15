import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAchievements } from '../achievements.js';

const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'metadata', 'eventType', 'travellerIdentityId'];
function assertNoLeak(obj) {
  const seen = JSON.stringify(obj);
  for (const k of FORBIDDEN_KEYS) assert.ok(!seen.includes(`"${k}"`), `must not expose "${k}"`);
}

function lifetime() {
  const trips = [
    { tripId: 't1', tripName: 'Bali 2024', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2024-07-01', endDate: '2024-07-12' },
    { tripId: 't2', tripName: 'Bali 2026', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-01', endDate: '2026-07-12' },
    { tripId: 't3', tripName: 'Thailand 2025', country: 'Thailand', destination: 'Phuket', area: 'Phuket', startDate: '2025-12-01', endDate: '2025-12-10' },
  ];
  const ev = (id, tripId, note, place, ts, photoRef, withL, move) => ({
    timelineEventId: id, tripId, eventType: photoRef ? 'photo_imported' : 'journal_entry',
    metadata: { eventName: photoRef ? 'photo_imported' : 'journal_entry', note, photoRef: photoRef ?? null, place, companions: withL ?? [], move: move ?? null }, timestamp: ts,
  });
  const events = [
    ev('a1', 't1', 'Landed in Bali after the flight', 'Bali', '2024-07-01T10:00:00.000Z', null, ['Manon']),
    ev('a2', 't1', 'Echo Beach sunset', 'Bali', '2024-07-02T18:00:00.000Z', 'p1', ['Manon']),
    ev('a3', 't1', 'Fast boat to the island, first scuba dive', 'Gili Air', '2024-07-05T09:00:00.000Z', 'p2', ['Manon'], { type: 'fast boat', from: 'Bali', to: 'Gili Air' }),
    ev('a4', 't1', 'Reef dive, turtles', 'Gili Air', '2024-07-06T08:00:00.000Z', 'p3', ['Manon']),
    ev('c1', 't3', 'Flew to Phuket', 'Phuket', '2025-12-01T12:00:00.000Z', null, ['Manon']),
    ev('c2', 't3', 'Beach day, local food at a warung', 'Phuket', '2025-12-02T18:00:00.000Z', 'p4', ['Manon']),
    ev('b1', 't2', 'Back in Bali, beach day', 'Bali', '2026-07-01T11:00:00.000Z', 'p5', ['Manon']),
    ev('b2', 't2', 'Sunset and a dive', 'Bali', '2026-07-03T18:00:00.000Z', 'p6', ['Manon']),
  ];
  return { events, trips };
}

const ach = (out, id) => out.achievements.find(a => a.id === id);

test('achievements are earned only from evidence, with full shape', () => {
  const { events, trips } = lifetime();
  const out = buildAchievements(events, trips);

  assert.ok(out.achievements.length > 0);
  for (const a of out.achievements) {
    assert.ok(a.id && a.title && a.subtitle && a.category);
    assert.ok(TIERS_OK(a.tier));
    assert.ok(['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(a.rarity));
    assert.ok(typeof a.rarityScore === 'number' && a.rarityScore >= 0 && a.rarityScore <= 100);
    assert.ok(typeof a.earned === 'boolean');
    assert.ok('earnedDate' in a);
    assert.ok(['emerging', 'strong', 'defining'].includes(a.confidence));
    assert.ok(a.progress && typeof a.progress.percent === 'number' && typeof a.progress.remaining === 'number');
    assert.ok('remaining' in a && a.evidence && a.iconId);
    assert.ok(Array.isArray(a.supportingMemories) && Array.isArray(a.supportingTrips));
  }
});
function TIERS_OK(t) { return ['Bronze', 'Silver', 'Gold', 'Platinum', 'Legend'].includes(t); }

test('First Flight and First Dive are earned with correct earned dates', () => {
  const { events, trips } = lifetime();
  const out = buildAchievements(events, trips);

  const firstFlight = ach(out, 'flights-bronze');
  assert.ok(firstFlight.earned);
  assert.equal(firstFlight.title, 'First Flight');
  assert.equal(firstFlight.earnedDate, '2024-07-01T10:00:00.000Z'); // the landing/flight memory

  const firstDive = ach(out, 'diving-bronze');
  assert.ok(firstDive.earned);
  assert.equal(firstDive.title, 'First Dive');
  assert.equal(firstDive.earnedDate, '2024-07-05T09:00:00.000Z');
});

test('country/island series reflect evidence and progress', () => {
  const { events, trips } = lifetime();
  const out = buildAchievements(events, trips);

  // 2 countries → First Country earned, 5 Countries locked with progress
  assert.ok(ach(out, 'countries-bronze').earned);
  const fiveCountries = ach(out, 'countries-silver');
  assert.equal(fiveCountries.earned, false);
  assert.equal(fiveCountries.progress.current, 2);
  assert.equal(fiveCountries.progress.target, 5);
  assert.equal(fiveCountries.progress.remaining, 3);
  assert.equal(fiveCountries.progress.percent, 40);

  // islands: Bali, Gili Air, Phuket → 3 islands → First Island earned, 5 locked
  assert.ok(ach(out, 'islands-bronze').earned);
});

test('hidden milestones: returned to same island + most remote island', () => {
  const { events, trips } = lifetime();
  const out = buildAchievements(events, trips);
  const ret = ach(out, 'returned-same-island');
  assert.ok(ret.hidden === true && ret.earned === true);
  assert.equal(ret.statistics.island, 'Bali'); // revisited in 2024 & 2026
  const remote = ach(out, 'most-remote-island');
  assert.ok(remote.hidden === true && remote.earned === true);
});

test('companion series earns "Travelled With Same Companion N Trips"', () => {
  const { events, trips } = lifetime();
  const out = buildAchievements(events, trips);
  // Manon on all 3 trips → companions Bronze(1) + Silver(3) earned
  assert.ok(ach(out, 'companions-bronze').earned);
  const three = ach(out, 'companions-silver');
  assert.ok(three.earned);
  assert.match(three.title, /Travelled With Same Companion 3 Trips/);
});

test('series, categories, timeline, rewards and statistics are assembled', () => {
  const { events, trips } = lifetime();
  const out = buildAchievements(events, trips);

  assert.ok(out.series.some(s => s.id === 'flights' && s.currentTier));
  assert.ok(out.categories.some(c => c.id === 'Diving' && c.total >= 1));

  // timeline ordered by earned date
  for (let i = 1; i < out.timeline.length; i += 1) assert.ok(out.timeline[i].earnedDate >= out.timeline[i - 1].earnedDate);

  assert.ok(out.statistics.totalEarned > 0);
  assert.equal(out.statistics.totalAvailable, out.achievements.length);
  assert.ok(out.statistics.completion >= 0 && out.statistics.completion <= 100);
  assert.ok(out.rewards.every(r => r.tier && r.badge && r.titleUnlock));
  assert.equal(out.summary.totalEarned, out.earned.length);
});

test('seasonal and yearly achievements exist with correct scope', () => {
  const { events, trips } = lifetime();
  const out = buildAchievements(events, trips);
  assert.ok(out.achievements.some(a => a.scope === 'seasonal' && a.id.startsWith('season-')));
  assert.ok(out.achievements.some(a => a.scope === 'yearly' && a.id === 'year-2024'));
});

test('achievements are deterministic and leak no backend terms', () => {
  const { events, trips } = lifetime();
  const a = buildAchievements(events, trips);
  const b = buildAchievements(events, trips);
  assert.deepEqual(a, b);
  assertNoLeak(a);
});

test('a brand-new traveller has earned nothing but sees locked progress', () => {
  const out = buildAchievements([], []);
  assert.equal(out.summary.totalEarned, 0);
  assert.ok(out.achievements.length > 0); // catalogue still present, all locked
  assert.ok(out.achievements.every(a => a.earned === false));
  assert.deepEqual(out.timeline, []);
});
