import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPassport, PASSPORT_STAMP_TYPES } from '../passport.js';
import { buildProfile } from '../profile.js';
import { buildTravellerTimeline } from '../traveller-timeline.js';

const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'metadata', 'eventType', 'travellerIdentityId'];
function assertNoLeak(obj) {
  const seen = JSON.stringify(obj);
  for (const k of FORBIDDEN_KEYS) assert.ok(!seen.includes(`"${k}"`), `must not expose "${k}"`);
}

function lifetime() {
  const trips = [
    { tripId: 't1', tripName: 'Bali 2024', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2024-07-08', endDate: '2024-07-20' },
    { tripId: 't2', tripName: 'Bali 2026', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-08', endDate: '2026-07-20' },
    { tripId: 't3', tripName: 'Thailand 2025', country: 'Thailand', destination: 'Phuket', area: 'Phuket', startDate: '2025-12-01', endDate: '2025-12-10' },
  ];
  const ev = (id, tripId, note, place, ts, photoRef, withL, move) => ({
    timelineEventId: id, tripId, eventType: photoRef ? 'photo_imported' : 'journal_entry',
    metadata: { eventName: photoRef ? 'photo_imported' : 'journal_entry', note, photoRef: photoRef ?? null, place, companions: withL ?? [], move: move ?? null }, timestamp: ts,
  });
  const events = [
    ev('a1', 't1', 'Landed in Bali, fast boat, first scuba dive', 'Gili Air', '2024-07-12T09:00:00.000Z', 'p1', ['Manon'], { type: 'fast boat', from: 'Bali', to: 'Gili Air' }),
    ev('a2', 't1', 'Echo Beach sunset', 'Bali', '2024-07-12T18:00:00.000Z', 'p2', ['Manon']),
    ev('a3', 't1', 'Reef dive, turtles', 'Gili Air', '2024-07-13T08:00:00.000Z', 'p3', ['Manon']),
    ev('c1', 't3', 'Flew to Phuket, local food', 'Phuket', '2025-12-01T12:00:00.000Z', 'p4', ['Manon']),
    ev('b1', 't2', 'Back in Bali, sunset dive', 'Bali', '2026-07-12T18:00:00.000Z', 'p5', ['Manon']),
  ];
  return { events, trips };
}

test('assembles a complete traveller passport from profile and traveller timeline', () => {
  const { events, trips } = lifetime();
  const passport = buildPassport(events, trips, { referenceDate: '2027-07-12' });

  assert.equal(passport.hasPassport, true);
  assert.ok(passport.cover && passport.cover.title);
  assert.ok(passport.identity && passport.identity.mostVisitedCountry === 'Indonesia');
  assert.ok(passport.credentials.countries >= 2);
  assert.ok(passport.credentials.timelineEntries >= passport.stamps.length);
  assert.ok(passport.stamps.length >= 1);
  assert.ok(passport.pages.length >= 1);
  assert.equal(passport.emptyState, null);
});

test('passport credentials mirror composed source engines', () => {
  const { events, trips } = lifetime();
  const passport = buildPassport(events, trips, { referenceDate: '2027-07-12' });
  const profile = buildProfile(events, trips, { referenceDate: '2027-07-12' });
  const timeline = buildTravellerTimeline(events, trips);
  const profileStat = id => profile.statistics.items.find(item => item.id === id).value;

  assert.equal(passport.credentials.countries, profileStat('countries'));
  assert.equal(passport.credentials.memories, profileStat('memories'));
  assert.equal(passport.credentials.achievements, profile.achievementSummary.totalEarned);
  assert.equal(passport.credentials.timelineEntries, timeline.statistics.total);
  assert.equal(passport.credentials.years, timeline.byYear.length);
});

test('stamps use known types and are stable presentation references only', () => {
  const { events, trips } = lifetime();
  const passport = buildPassport(events, trips, { referenceDate: '2027-07-12' });

  passport.stamps.forEach((stamp, i) => {
    assert.equal(stamp.id, `passport-stamp-${i}`);
    assert.equal(stamp.orderingIndex, i);
    assert.ok(PASSPORT_STAMP_TYPES.includes(stamp.type), `bad stamp type ${stamp.type}`);
    assert.ok(stamp.label && stamp.date && stamp.icon && stamp.accent);
    assert.ok(Array.isArray(stamp.locationRefs) && Array.isArray(stamp.companionRefs));
    assert.ok(stamp.mediaRefs.every(ref => typeof ref === 'string'));
    assert.ok(stamp.ref && stamp.ref.type && stamp.ref.id !== undefined);
    assert.ok(stamp.deepLink.startsWith('travelapp://'));
  });
});

test('stamps and pages are deterministically ordered by timeline date', () => {
  const { events, trips } = lifetime();
  const passport = buildPassport(events, trips, { referenceDate: '2027-07-12' });

  for (let i = 1; i < passport.stamps.length; i += 1) assert.ok(passport.stamps[i].date >= passport.stamps[i - 1].date);
  for (let i = 1; i < passport.pages.length; i += 1) assert.ok(passport.pages[i].year > passport.pages[i - 1].year);
  for (const page of passport.pages) {
    assert.equal(page.count, page.stampIds.length);
    assert.ok(page.types.every(t => PASSPORT_STAMP_TYPES.includes(t.type) && t.label));
  }
});

test('highlights and actions point to existing presentation routes', () => {
  const { events, trips } = lifetime();
  const passport = buildPassport(events, trips, { referenceDate: '2027-07-12' });

  assert.ok(passport.highlights.first && passport.highlights.first.entryId);
  assert.ok(passport.highlights.latest && passport.highlights.latest.entryId);
  assert.ok(passport.highlights.recent.every(id => passport.stamps.some(stamp => stamp.id === id)));
  assert.ok(passport.highlights.transport.every(id => passport.stamps.some(stamp => stamp.id === id)));
  assert.deepEqual(passport.actions.map(a => a.id), ['open-timeline', 'open-profile']);
});

test('reference sets contain only refs, never media binaries or backend records', () => {
  const { events, trips } = lifetime();
  const passport = buildPassport(events, trips, { referenceDate: '2027-07-12' });

  assert.ok(passport.references.media.every(ref => typeof ref === 'string'));
  assert.ok(passport.references.map.every(ref => typeof ref.place === 'string' && typeof ref.isIsland === 'boolean'));
  assert.ok(passport.references.achievements.every(ref => typeof ref.id === 'string'));
  assert.ok(passport.references.media.includes('p5'));
});

test('empty history returns an empty passport with a capture CTA', () => {
  const passport = buildPassport([], [], { referenceDate: '2027-07-12' });

  assert.equal(passport.hasPassport, false);
  assert.equal(passport.cover, null);
  assert.deepEqual(passport.stamps, []);
  assert.deepEqual(passport.pages, []);
  assert.equal(passport.credentials.memories, 0);
  assert.ok(passport.emptyState && passport.emptyState.cta.id === 'capture');
  assert.deepEqual(passport.actions.map(a => a.id), ['capture']);
});

test('deterministic and leaks no backend terms', () => {
  const { events, trips } = lifetime();
  const a = buildPassport(events, trips, { referenceDate: '2027-07-12' });
  const b = buildPassport(events, trips, { referenceDate: '2027-07-12' });

  assert.deepEqual(a, b);
  assertNoLeak(a);
});
