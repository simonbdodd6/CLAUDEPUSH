import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNavigation, NAV_VERSION } from '../navigation.js';
import { EXPERIENCES } from '../experience-presentation.js';

const FORBIDDEN_KEYS = ['sourceEntityId', 'sourcePlatform', 'idempotencyKey', 'eventName', 'sequence', 'metadata', 'eventType', 'travellerIdentityId'];
function assertNoLeak(obj) {
  const seen = JSON.stringify(obj);
  for (const k of FORBIDDEN_KEYS) assert.ok(!seen.includes(`"${k}"`), `must not expose "${k}"`);
}

function lifetime() {
  const trips = [{ tripId: 't1', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2024-07-01', endDate: '2024-07-12' }];
  const ev = (id, note, place, ts, photoRef) => ({ timelineEventId: id, tripId: 't1', eventType: photoRef ? 'photo_imported' : 'journal_entry', metadata: { eventName: photoRef ? 'photo_imported' : 'journal_entry', note, photoRef: photoRef ?? null, place }, timestamp: ts });
  const events = [
    ev('a1', 'Landed in Bali after the flight', 'Bali', '2024-07-01T10:00:00.000Z'),
    ev('a2', 'Sunset scuba dive', 'Bali', '2024-07-02T18:00:00.000Z', 'p1'),
  ];
  return { events, trips };
}

const ALL = EXPERIENCES.map(e => e.id);

test('builds a navigation graph with one node per experience', () => {
  const { events, trips } = lifetime();
  const nav = buildNavigation(events, trips);
  assert.deepEqual(nav.graph.nodes.map(n => n.id).sort(), [...ALL].sort());
  assert.equal(nav.meta.version, NAV_VERSION);
  assert.equal(nav.meta.experienceCount, ALL.length);
});

test('every node carries identity, deep link, related, quick actions and anchor', () => {
  const { events, trips } = lifetime();
  const nav = buildNavigation(events, trips);
  for (const n of nav.graph.nodes) {
    assert.ok(n.id && n.title && n.icon && n.mood && n.accent && n.accentSwatch);
    assert.equal(n.deepLink, `travelapp://experience/${n.id}`);
    assert.ok(Array.isArray(n.related) && n.related.length >= 1);
    assert.ok(Array.isArray(n.quickActions) && n.quickActions.every(a => a.id && a.label && a.icon));
    assert.ok(n.timelineAnchor && n.timelineAnchor.deepLink);
    assert.ok('available' in n && 'entryPoint' in n && 'recommendedNext' in n && 'previous' in n);
  }
});

test('edges reference only valid experience nodes', () => {
  const { events, trips } = lifetime();
  const nav = buildNavigation(events, trips);
  const ids = new Set(nav.graph.nodes.map(n => n.id));
  assert.ok(nav.graph.edges.length >= 1);
  assert.ok(nav.graph.edges.every(e => ids.has(e.from) && ids.has(e.to) && e.relation === 'related'));
});

test('recommended next/previous form a chain over the available sequence', () => {
  const { events, trips } = lifetime();
  const nav = buildNavigation(events, trips);
  const seq = nav.availableSequence;
  assert.deepEqual(seq, ['on-this-day', 'wrapped', 'story', 'collections', 'cinematic']);
  const byId = new Map(nav.graph.nodes.map(n => [n.id, n]));
  seq.forEach((id, i) => {
    assert.equal(byId.get(id).recommendedNext, seq[i + 1] ?? null);
    assert.equal(byId.get(id).previous, seq[i - 1] ?? null);
  });
});

test('entry points + default entry are deterministic', () => {
  const { events, trips } = lifetime();
  const nav = buildNavigation(events, trips);
  assert.deepEqual(nav.entryPoints, ['on-this-day', 'wrapped', 'story']);
  assert.equal(nav.defaultEntry, 'on-this-day');
});

test('cursor resolves next/previous for a current experience', () => {
  const { events, trips } = lifetime();
  const nav = buildNavigation(events, trips, { current: 'story' });
  assert.ok(nav.cursor);
  assert.equal(nav.cursor.current, 'story');
  assert.equal(nav.cursor.next, 'collections');
  assert.equal(nav.cursor.previous, 'wrapped');
});

test('cursor is null without a current; unknown current is ignored', () => {
  const { events, trips } = lifetime();
  assert.equal(buildNavigation(events, trips).cursor, null);
  assert.equal(buildNavigation(events, trips, { current: 'nope' }).cursor, null);
});

test('timeline anchors mirror the available sequence', () => {
  const { events, trips } = lifetime();
  const nav = buildNavigation(events, trips);
  assert.deepEqual(nav.timelineAnchors.map(a => a.experience), nav.availableSequence);
  nav.timelineAnchors.forEach((a, i) => { assert.equal(a.order, i); assert.equal(a.deepLink, `travelapp://experience/${a.experience}`); });
});

test('empty history yields unavailable nodes + an empty-state CTA', () => {
  const nav = buildNavigation([], []);
  assert.ok(nav.graph.nodes.every(n => n.available === false));
  assert.deepEqual(nav.availableSequence, []);
  assert.equal(nav.defaultEntry, null);
  assert.deepEqual(nav.entryPoints, []);
  assert.ok(nav.emptyState && nav.emptyState.cta && nav.emptyState.cta.id === 'capture');
  assert.equal(nav.meta.hasMemories, false);
  // nodes still have null next/previous when nothing is available
  assert.ok(nav.graph.nodes.every(n => n.recommendedNext === null && n.previous === null));
});

test('populated navigation has no empty state', () => {
  const { events, trips } = lifetime();
  assert.equal(buildNavigation(events, trips).emptyState, null);
});

test('deterministic and leaks no backend terms', () => {
  const { events, trips } = lifetime();
  const a = buildNavigation(events, trips, { current: 'wrapped' });
  const b = buildNavigation(events, trips, { current: 'wrapped' });
  assert.deepEqual(a, b);
  assertNoLeak(a);
});
