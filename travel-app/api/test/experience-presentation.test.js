import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExperience, listExperiences, EXPERIENCES, SECTION_LAYOUTS, CARD_KINDS, EMPHASIS } from '../experience-presentation.js';

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
    ev('a3', 't1', 'Fast boat across, scuba dive', 'Gili Air', '2024-07-05T09:00:00.000Z', 'p2', ['Manon'], { type: 'fast boat', from: 'Bali', to: 'Gili Air' }),
    ev('c1', 't3', 'Flew to Phuket, local food', 'Phuket', '2025-12-01T12:00:00.000Z', 'p3', ['Manon']),
    ev('b1', 't2', 'Back in Bali, sunset dive', 'Bali', '2026-07-03T18:00:00.000Z', 'p4', ['Manon']),
  ];
  return { events, trips };
}

const ALL = ['wrapped', 'on-this-day', 'collections', 'story', 'cinematic'];

// Shared contract validator — proves every experience returns the SAME shape.
function assertContract(p, experience) {
  assert.equal(p.experience, experience);
  assert.ok(p.id && p.title);
  assert.ok('hero' in p && 'timeline' in p);
  assert.ok(Array.isArray(p.sections));
  assert.ok(p.statistics && Array.isArray(p.statistics.items));
  assert.ok(Array.isArray(p.generatedFrom) && p.generatedFrom.length >= 1);
  // sections + cards conform to the shared model + fixed enums
  for (const s of p.sections) {
    assert.ok(s.id && SECTION_LAYOUTS.includes(s.layout), `bad layout ${s.layout}`);
    assert.ok(Array.isArray(s.cards));
    for (const c of s.cards) {
      assert.ok(c.id && CARD_KINDS.includes(c.kind), `bad card kind ${c.kind}`);
      assert.ok(EMPHASIS.includes(c.emphasis), `bad emphasis ${c.emphasis}`);
      assert.ok(Array.isArray(c.mediaRefs) && Array.isArray(c.mapRefs) && Array.isArray(c.achievementRefs) && Array.isArray(c.companionRefs));
      assert.ok(c.mediaRefs.every(m => typeof m.photoRef === 'string' || m.photoRef === null));
      assert.ok(c.mapRefs.every(m => typeof m.place === 'string' && 'isIsland' in m && 'latitude' in m && 'longitude' in m));
      assert.ok(c.achievementRefs.every(a => typeof a.id === 'string'));
    }
  }
  // hero conforms when present
  if (p.hero) {
    assert.ok(p.hero.id && p.hero.title && p.hero.accent && p.hero.icon);
    assert.ok('mediaRef' in p.hero && 'mapRef' in p.hero);
  }
  // statistics items conform
  for (const it of p.statistics.items) assert.ok(it.id && it.label !== undefined && 'value' in it);
  // timeline anchors conform when present
  if (p.timeline) for (const a of p.timeline.anchors) assert.ok(a.id && a.date && a.kind);
}

test('every premium experience returns the SAME shared contract', () => {
  const { events, trips } = lifetime();
  for (const name of ALL) {
    const p = buildExperience(events, trips, { name, referenceDate: '2027-07-05' });
    assertContract(p, name);
  }
});

test('wrapped exposes a stat-style statistics model and a deck section', () => {
  const { events, trips } = lifetime();
  const p = buildExperience(events, trips, { name: 'wrapped' });
  assert.ok(p.statistics.items.some(i => i.id === 'countries'));
  assert.ok(p.sections.some(s => s.layout === 'deck'));
});

test('on-this-day adapter honours the reference date and exposes a timeline', () => {
  const { events, trips } = lifetime();
  // 05 July has the 2024 dive/fast-boat memories → matches across years
  const p = buildExperience(events, trips, { name: 'on-this-day', referenceDate: '2027-07-05' });
  assert.equal(p.experience, 'on-this-day');
  assert.ok(p.timeline && p.timeline.anchors.length >= 1);
  assert.ok(p.sections.some(s => s.cards.length >= 1));
});

test('collections adapter maps each collection to a shared card', () => {
  const { events, trips } = lifetime();
  const p = buildExperience(events, trips, { name: 'collections' });
  const grid = p.sections.find(s => s.layout === 'grid');
  assert.ok(grid && grid.cards.every(c => c.kind === 'collection'));
});

test('story + cinematic expose timelines and a hero', () => {
  const { events, trips } = lifetime();
  const story = buildExperience(events, trips, { name: 'story' });
  assert.ok(story.timeline && story.timeline.anchors.length >= 1);
  const cin = buildExperience(events, trips, { name: 'cinematic' });
  assert.ok(cin.timeline && cin.timeline.anchors.length >= 1);
  assert.ok(cin.hero);
});

test('listExperiences returns the catalogue with availability', () => {
  const { events, trips } = lifetime();
  const list = listExperiences(events, trips);
  assert.equal(list.experiences.length, EXPERIENCES.length);
  assert.ok(list.experiences.every(e => e.id && e.title && typeof e.available === 'boolean'));
  assert.ok(list.experiences.find(e => e.id === 'wrapped').available === true);
});

test('unknown experience throws UNKNOWN_EXPERIENCE', () => {
  const { events, trips } = lifetime();
  assert.throws(() => buildExperience(events, trips, { name: 'nope' }), e => e.code === 'UNKNOWN_EXPERIENCE');
});

test('deterministic and leaks no backend terms across all experiences', () => {
  const { events, trips } = lifetime();
  for (const name of ALL) {
    const a = buildExperience(events, trips, { name, referenceDate: '2027-07-05' });
    const b = buildExperience(events, trips, { name, referenceDate: '2027-07-05' });
    assert.deepEqual(a, b);
    assertNoLeak(a);
  }
});

test('empty history still returns a valid contract for every experience', () => {
  for (const name of ALL) {
    const p = buildExperience([], [], { name, referenceDate: '2027-07-05' });
    assertContract(p, name);
  }
  const list = listExperiences([], []);
  assert.ok(list.experiences.every(e => e.available === false));
});
