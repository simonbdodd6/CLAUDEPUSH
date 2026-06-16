import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStoryComposer } from '../story-composer.js';

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
    ev('a3', 't1', 'Fast boat across, first scuba dive', 'Gili Air', '2024-07-05T09:00:00.000Z', 'p2', ['Manon'], { type: 'fast boat', from: 'Bali', to: 'Gili Air' }),
    ev('a4', 't1', 'Reef dive, turtles', 'Gili Air', '2024-07-05T11:00:00.000Z', 'p3', ['Manon']),
    ev('c1', 't3', 'Flew to Phuket', 'Phuket', '2025-12-01T12:00:00.000Z', null, ['Manon']),
    ev('c2', 't3', 'Beach day, local food', 'Phuket', '2025-12-02T18:00:00.000Z', 'p4', ['Manon']),
    ev('b1', 't2', 'Back in Bali, beach day', 'Bali', '2026-07-01T11:00:00.000Z', 'p5', ['Manon']),
    ev('b2', 't2', 'Sunset and a dive', 'Bali', '2026-07-03T18:00:00.000Z', 'p6', ['Manon']),
  ];
  return { events, trips };
}

test('composes a chronological story of chapters → days → moments', () => {
  const { events, trips } = lifetime();
  const s = buildStoryComposer(events, trips);
  assert.ok(s.chapters.length >= 1);
  assert.ok(s.story.momentCount > 0);
  assert.ok(s.story.span.from <= s.story.span.to);

  // chapters ordered; days within a chapter chronological
  s.chapters.forEach((c, i) => assert.equal(c.sortOrder, i));
  for (const c of s.chapters) {
    for (let i = 1; i < c.days.length; i += 1) assert.ok(c.days[i].date >= c.days[i - 1].date);
  }
});

test('every story moment carries the presentation shape (references only)', () => {
  const { events, trips } = lifetime();
  const s = buildStoryComposer(events, trips);
  const moments = s.chapters.flatMap(c => c.days.flatMap(d => d.moments));
  assert.ok(moments.length > 0);
  for (const m of moments) {
    assert.ok(m.id && m.sourceId && m.type && m.kind && m.title);
    assert.ok(m.date && m.time && m.emotionalTone && m.iconId);
    assert.ok(Array.isArray(m.mediaRefs) && Array.isArray(m.achievementRefs) && Array.isArray(m.companionRefs));
    assert.ok('isHero' in m && 'isMilestone' in m);
    // media is references only (photo ids/strings)
    assert.ok(m.mediaRefs.every(r => typeof r === 'string'));
  }
});

test('transport transitions are composed from the journey engine', () => {
  const { events, trips } = lifetime();
  const s = buildStoryComposer(events, trips);
  const transitions = s.chapters.flatMap(c => c.days.flatMap(d => d.transitions));
  assert.ok(transitions.some(t => /boat/i.test(t.transport))); // fast boat Bali→Gili Air
  assert.ok(transitions.every(t => t.kind === 'transport' && t.from && t.to && t.icon && t.date));
});

test('location changes / border crossings are flagged on transitions', () => {
  const { events, trips } = lifetime();
  const s = buildStoryComposer(events, trips);
  const days = s.chapters.flatMap(c => c.days);
  const locChanges = days.flatMap(d => d.locationChanges);
  assert.ok(locChanges.length >= 1);
  assert.ok(locChanges.every(l => l.from && l.to && typeof l.crossedCountry === 'boolean'));
});

test('each day has a render sequence interleaving transitions and moments by time', () => {
  const { events, trips } = lifetime();
  const s = buildStoryComposer(events, trips);
  const day = s.chapters.flatMap(c => c.days).find(d => d.transitions.length && d.moments.length);
  assert.ok(day);
  for (let i = 1; i < day.flow.length; i += 1) assert.ok(day.flow[i].date >= day.flow[i - 1].date);
  assert.ok(day.flow.every(x => ['moment', 'transition'].includes(x.kind) && x.refId));
});

test('heroes and milestones are flagged at day, chapter and story level', () => {
  const { events, trips } = lifetime();
  const s = buildStoryComposer(events, trips);
  assert.ok(s.hero && s.hero.id);
  assert.ok(s.chapters.some(c => c.hero));
  const days = s.chapters.flatMap(c => c.days);
  assert.ok(days.some(d => d.hero));
  assert.ok(days.some(d => d.milestones.length >= 1));
  // the flagged hero moment exists and isHero is true
  const heroMoment = s.chapters.flatMap(c => c.days.flatMap(d => d.moments)).find(m => m.id === s.hero.id);
  assert.ok(heroMoment && heroMoment.isHero === true);
});

test('timeline anchors cover chapters and days for scroll/scrub', () => {
  const { events, trips } = lifetime();
  const s = buildStoryComposer(events, trips);
  assert.ok(s.anchors.some(a => a.type === 'chapter'));
  assert.ok(s.anchors.some(a => a.type === 'day'));
  assert.ok(s.anchors.every(a => a.id && a.date && a.chapterId));
});

test('deterministic and leaks no backend terms', () => {
  const { events, trips } = lifetime();
  const a = buildStoryComposer(events, trips);
  const b = buildStoryComposer(events, trips);
  assert.deepEqual(a, b);
  assertNoLeak(a);
});

test('empty history yields a valid empty story', () => {
  const s = buildStoryComposer([], []);
  assert.deepEqual(s.chapters, []);
  assert.equal(s.hero, null);
  assert.equal(s.story.momentCount, 0);
  assert.equal(s.story.span, null);
});
