import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecommendations, REASON_CODES, CATEGORIES, PRIORITIES, EXPIRY_CONDITIONS } from '../recommendations.js';

const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'metadata', 'eventType', 'travellerIdentityId'];
function assertNoLeak(obj) {
  const seen = JSON.stringify(obj);
  for (const k of FORBIDDEN_KEYS) assert.ok(!seen.includes(`"${k}"`), `must not expose "${k}"`);
}

// memories share calendar day 12 July across years (drives On This Day)
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

test('recommends On This Day first when the reference date has matches', () => {
  const { events, trips } = lifetime();
  const recs = buildRecommendations(events, trips, { referenceDate: '2027-07-12' });
  assert.ok(recs.recommendations.length >= 1);
  assert.equal(recs.recommendations[0].reasonCode, 'ON_THIS_DAY_MATCH');
  assert.equal(recs.recommendations[0].targetExperience, 'on-this-day');
  assert.equal(recs.top, recs.recommendations[0].id);
});

test('every recommendation uses ONLY the fixed enums and a full shape', () => {
  const { events, trips } = lifetime();
  const recs = buildRecommendations(events, trips, { referenceDate: '2027-07-12' });
  for (const r of recs.recommendations) {
    assert.ok(REASON_CODES.includes(r.reasonCode), `bad reason ${r.reasonCode}`);
    assert.ok(CATEGORIES.includes(r.category), `bad category ${r.category}`);
    assert.ok(PRIORITIES.includes(r.priority), `bad priority ${r.priority}`);
    assert.ok(EXPIRY_CONDITIONS.includes(r.expiry.condition), `bad expiry ${r.expiry.condition}`);
    assert.ok(typeof r.score === 'number');
    assert.ok(r.targetExperience && r.deepLink && r.icon && r.accent);
    assert.ok(Array.isArray(r.supportingRefs) && r.supportingRefs.every(s => s.type && s.id));
    assert.ok(Array.isArray(r.timelineAnchors) && Array.isArray(r.quickActions));
  }
});

test('recommendations are sorted by score and de-duplicated by target', () => {
  const { events, trips } = lifetime();
  const recs = buildRecommendations(events, trips, { referenceDate: '2027-07-12' });
  for (let i = 1; i < recs.recommendations.length; i += 1) assert.ok(recs.recommendations[i - 1].score >= recs.recommendations[i].score);
  const targets = recs.recommendations.map(r => r.targetExperience);
  assert.equal(new Set(targets).size, targets.length); // no duplicate target experiences
  recs.recommendations.forEach((r, i) => assert.equal(r.rank, i));
});

test('On This Day recommendation expires daily and carries the date', () => {
  const { events, trips } = lifetime();
  const recs = buildRecommendations(events, trips, { referenceDate: '2027-07-12' });
  const otd = recs.recommendations.find(r => r.reasonCode === 'ON_THIS_DAY_MATCH');
  assert.equal(otd.expiry.condition, 'daily');
  assert.equal(otd.expiry.date, '2027-07-12');
});

test('a date with no matches drops On This Day but keeps other recommendations', () => {
  const { events, trips } = lifetime();
  const recs = buildRecommendations(events, trips, { referenceDate: '2027-03-03' });
  assert.ok(!recs.recommendations.some(r => r.reasonCode === 'ON_THIS_DAY_MATCH'));
  assert.ok(recs.recommendations.length >= 1); // story / collections / wrapped etc still apply
});

test('continuation pointer is provided when a current experience is supplied', () => {
  const { events, trips } = lifetime();
  const recs = buildRecommendations(events, trips, { referenceDate: '2027-03-03', current: 'wrapped' });
  // continuation is a top-level pointer (content-readiness rules own each target)
  assert.ok(recs.continuation);
  assert.equal(recs.continuation.current, 'wrapped');
  assert.equal(recs.continuation.next, 'story'); // next in the available sequence
  assert.equal(recs.continuation.previous, 'on-this-day');
  // recommendations carry the source experience
  assert.ok(recs.recommendations.every(r => r.sourceExperience === 'wrapped'));
  // without a current, there is no continuation pointer
  assert.equal(buildRecommendations(events, trips, { referenceDate: '2027-03-03' }).continuation, null);
});

test('reason codes map to sensible targets and categories', () => {
  const { events, trips } = lifetime();
  const recs = buildRecommendations(events, trips, { referenceDate: '2027-07-12' });
  const byReason = Object.fromEntries(recs.recommendations.map(r => [r.reasonCode, r]));
  if (byReason.STORY_READY) assert.equal(byReason.STORY_READY.targetExperience, 'story');
  if (byReason.RICH_COLLECTIONS) assert.equal(byReason.RICH_COLLECTIONS.category, 'discovery');
  if (byReason.WRAPPED_READY || byReason.NEW_ACHIEVEMENTS) {
    const wrappedRec = recs.recommendations.find(r => r.targetExperience === 'wrapped');
    assert.equal(wrappedRec.category, 'milestone');
  }
});

test('early traveller (<3 memories) gets a START_HERE onboarding recommendation', () => {
  const trips = [{ tripId: 't1', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-01', endDate: '2026-07-10' }];
  const ev = (id, note, place, ts) => ({ timelineEventId: id, tripId: 't1', eventType: 'journal_entry', metadata: { eventName: 'journal_entry', note, place }, timestamp: ts });
  const recs = buildRecommendations([ev('a1', 'A first quiet memory', 'Bali', '2026-07-02T09:00:00.000Z')], trips, { referenceDate: '2026-08-01' });
  assert.ok(recs.recommendations.some(r => r.reasonCode === 'START_HERE' && r.category === 'onboarding'));
});

test('empty history returns an empty-state with a capture CTA', () => {
  const recs = buildRecommendations([], [], { referenceDate: '2027-07-12' });
  assert.deepEqual(recs.recommendations, []);
  assert.equal(recs.top, null);
  assert.ok(recs.emptyState && recs.emptyState.cta && recs.emptyState.cta.id === 'capture');
  assert.equal(recs.meta.hasMemories, false);
});

test('deterministic and leaks no backend terms', () => {
  const { events, trips } = lifetime();
  const a = buildRecommendations(events, trips, { referenceDate: '2027-07-12', current: 'wrapped' });
  const b = buildRecommendations(events, trips, { referenceDate: '2027-07-12', current: 'wrapped' });
  assert.deepEqual(a, b);
  assertNoLeak(a);
});
