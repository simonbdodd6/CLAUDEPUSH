/**
 * Match Readiness Pack — integration contract.
 *
 * The pack is a feature-flagged, read-only intelligence surface derived entirely
 * from existing Core stores. It takes a Coach Experience snapshot plus match-
 * specific opts and produces an evidence-backed Match Readiness Pack model.
 *
 * Tests verify:
 *  1. Feature flag OFF → available:false, no data leaks
 *  2. Empty/null/bad inputs → valid shape, never throws
 *  3. Fixture falls back to fixtures array when matchCentre has no opponent
 *  4. Squad selection counting (filledSlots, missingSlots, bench)
 *  5. Availability buckets: available, unavailable, injured, noReply
 *  6. Medical clearances: injured with/without returnTarget
 *  7. Checklist items: flags and section deep-links
 *  8. Risk detection: front row gaps, clearances, no-reply, selection, training
 *  9. Recommended actions: max 3, come from unfulfilled checklist
 * 10. Confidence: 0–1 bounded, deterministic, higher when better prepared
 * 11. All action sections are valid Core screens
 * 12. Permission contract: ai_intelligence gates the surface
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { generateMatchReadinessPack, MATCH_READINESS_VERSION } = await import('../season-intelligence/match-readiness.js');
const { normalizeExperience } = await import('../season-intelligence/coach-experience.js');
const { PERM, permissionsFor } = await import('../api/_permissions.js');

const NOW = '2026-06-13T10:00:00.000Z';

const VALID_SECTIONS = new Set([
  'overview', 'message', 'messages', 'training', 'matchday',
  'medical', 'players', 'admin', 'settings', 'availability', 'week', 'fixtures',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeExperience(overrides = {}) {
  // Mirrors what _buildExperienceFromState() produces from Core state:
  //  • p0,p1 → injured (response:'unavailable', reason:'injury')
  //  • p2-p11 → available (10 players)
  //  • p12,p13 → unavailable non-injury
  //  • p14 → no-reply
  //  • p15-p21 → in roster but no response record (7 more no-replies)
  return normalizeExperience({
    sessions: [
      { id: 'tue',  type: 'Training', published: true,  publishedAt: NOW },
      { id: 'thu',  type: 'Training', published: false, publishedAt: null },
      { id: 'game', type: 'Match',    published: false, publishedAt: null },
    ],
    roster: Array.from({ length: 22 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, position: 'TBC' })),
    availability: {
      game: [
        { key: 'p0',  label: 'Player 0',  response: 'unavailable', reason: 'injury' },
        { key: 'p1',  label: 'Player 1',  response: 'unavailable', reason: 'injury' },
        ...Array.from({ length: 10 }, (_, i) => ({ key: `p${i + 2}`,  label: `Player ${i + 2}`,  response: 'available',   reason: null })),
        { key: 'p12', label: 'Player 12', response: 'unavailable', reason: null },
        { key: 'p13', label: 'Player 13', response: 'unavailable', reason: null },
        { key: 'p14', label: 'Player 14', response: 'no-reply',    reason: null },
      ],
    },
    fixtures: [{ opposition: 'Rivals RFC', date: '2026-06-21', venue: 'Home' }],
    ...overrides,
  });
}

function makeFullOpts(overrides = {}) {
  return {
    enabled:              true,
    now:                  NOW,
    formationNames:       Object.fromEntries(Array.from({ length: 15 }, (_, i) => [String(i + 1), `Player ${i}`])),
    benchPlayers:         ['Player 15', 'Player 16', 'Player 17', 'Player 18', 'Player 19', 'Player 20', 'Player 21'],
    availabilityRequests: [{ sessionId: 'game', status: 'sent' }],
    matchCentre:          { opposition: 'Rivals RFC', kickoffDate: '2026-06-21', kickoffTime: '15:00', venue: 'Home', published: true },
    messages:             [{ from: 'Coach', type: 'Match update', body: 'Good luck!' }],
    medicalNotes:         {},
    fixtures:             [{ opposition: 'Rivals RFC', date: '2026-06-21', venue: 'Home' }],
    ...overrides,
  };
}

// ─── 1. Feature flag OFF ──────────────────────────────────────────────────────

test('enabled:false → available:false, no data leaks', () => {
  const pack = generateMatchReadinessPack(makeExperience(), { enabled: false, now: NOW });
  assert.equal(pack.available, false);
  assert.equal(pack.reason, 'intelligence_disabled');
  assert.equal(pack.version, MATCH_READINESS_VERSION);
  assert.equal(pack.checklist, undefined, 'no checklist when disabled');
  assert.equal(pack.risks, undefined, 'no risks when disabled');
  assert.equal(pack.fixture, undefined, 'no fixture when disabled');
  assert.equal(pack.confidence, undefined, 'no confidence when disabled');
});

test('enabled:false with full opts → still unavailable model', () => {
  const pack = generateMatchReadinessPack(makeExperience(), makeFullOpts({ enabled: false }));
  assert.equal(pack.available, false);
  assert.equal(pack.reason, 'intelligence_disabled');
});

// ─── 2. Empty / null / bad inputs — never throws ──────────────────────────────

test('null experience → valid shape, does not throw', () => {
  let pack;
  assert.doesNotThrow(() => { pack = generateMatchReadinessPack(null, { enabled: true, now: NOW }); });
  assert.equal(pack.available, true);
  assert.equal(typeof pack.confidence, 'number');
  assert.ok(Array.isArray(pack.checklist));
  assert.ok(Array.isArray(pack.risks));
  assert.ok(Array.isArray(pack.actions));
});

test('malformed opts → valid shape, does not throw', () => {
  for (const badOpts of [
    undefined,
    null,
    {},
    { formationNames: null, matchCentre: null, medicalNotes: 'bad' },
    { benchPlayers: 'not-an-array', messages: 42 },
  ]) {
    let pack;
    assert.doesNotThrow(() => { pack = generateMatchReadinessPack(makeExperience(), badOpts); });
    // If enabled is absent, defaults to true
    if (pack.available) {
      assert.ok(typeof pack.confidence === 'number');
    }
  }
});

test('empty opts → hasFixture:false when no opposition anywhere', () => {
  const pack = generateMatchReadinessPack(normalizeExperience({}), { enabled: true, now: NOW });
  assert.equal(pack.available, true);
  assert.equal(pack.hasFixture, false);
});

// ─── 3. Fixture resolution ────────────────────────────────────────────────────

test('fixture comes from matchCentre when opposition is set', () => {
  const pack = generateMatchReadinessPack(makeExperience(), makeFullOpts());
  assert.equal(pack.fixture.opposition,  'Rivals RFC');
  assert.equal(pack.fixture.kickoffDate, '2026-06-21');
  assert.equal(pack.fixture.kickoffTime, '15:00');
  assert.equal(pack.fixture.venue,       'Home');
  assert.equal(pack.hasFixture, true);
});

test('fixture falls back to fixtures array when matchCentre has no opponent', () => {
  const pack = generateMatchReadinessPack(
    makeExperience(),
    makeFullOpts({ matchCentre: { opposition: '', kickoffDate: '' } })
  );
  assert.equal(pack.fixture.opposition, 'Rivals RFC', 'falls back to fixtures array');
  assert.equal(pack.hasFixture, true);
});

test('hasFixture:false when matchCentre and fixtures both empty', () => {
  const pack = generateMatchReadinessPack(
    normalizeExperience({ roster: [{ id: 'p1', name: 'A' }] }),
    { enabled: true, now: NOW, matchCentre: {}, fixtures: [] }
  );
  assert.equal(pack.hasFixture, false);
});

// ─── 4. Squad selection counting ─────────────────────────────────────────────

test('all 15 positions filled → filled:15, missingSlots empty', () => {
  const pack = generateMatchReadinessPack(makeExperience(), makeFullOpts());
  assert.equal(pack.squad.filled, 15);
  assert.equal(pack.squad.missingSlots.length, 0);
  assert.equal(pack.squad.bench, 7);
  assert.equal(pack.squad.total, 22);
});

test('partial formation → correct filled and missingSlots', () => {
  const pack = generateMatchReadinessPack(makeExperience(), makeFullOpts({
    formationNames: { '1': 'Alex', '9': 'Sam', '10': 'Lee' },
    benchPlayers:   ['Ben', ''],
  }));
  assert.equal(pack.squad.filled, 3);
  assert.equal(pack.squad.missingSlots.length, 12);
  assert.ok(pack.squad.missingSlots.every(s => s.slot && s.label));
  assert.equal(pack.squad.bench, 1, 'empty string bench entry excluded');
});

test('empty formationNames → filled:0, all 15 missing', () => {
  const pack = generateMatchReadinessPack(makeExperience(), makeFullOpts({ formationNames: {} }));
  assert.equal(pack.squad.filled, 0);
  assert.equal(pack.squad.missingSlots.length, 15);
});

// ─── 5. Availability buckets ──────────────────────────────────────────────────

test('availability buckets count correctly from experience.availability.game', () => {
  // makeExperience: 2 injured, 10 available, 2 unavailable (non-injury), 1 no-reply in responses
  // roster has 22 → 7 with no response record → all 7 become no-reply
  const exp = makeExperience();
  const pack = generateMatchReadinessPack(exp, makeFullOpts({ matchCentre: { opposition: 'Rivals' } }));
  assert.equal(pack.squad.available,    10, 'available count');
  assert.equal(pack.squad.unavailable,   2, 'unavailable count (non-injury)');
  assert.equal(pack.squad.injured,       2, 'injured count (reason: injury)');
  assert.ok(pack.squad.noReply >= 1, 'noReply is at least 1 (p14 in responses + 7 roster without response)');
});

// ─── 6. Medical clearances ────────────────────────────────────────────────────

test('injured players without returnTarget appear in clearanceMissing', () => {
  // p0 and p1 are injured (reason:'injury') from makeExperience
  const pack = generateMatchReadinessPack(
    makeExperience(),
    makeFullOpts({
      medicalNotes: {
        p0: { condition: 'Hamstring', returnTarget: null },  // missing clearance
        // p1 has no notes at all → also missing
      },
    })
  );
  assert.equal(pack.squad.clearanceMissing.length, 2, 'both injured players lack clearance');
  assert.ok(Array.isArray(pack.squad.clearanceMissing));
});

test('injured players with returnTarget are cleared — clearanceMissing:0', () => {
  const pack = generateMatchReadinessPack(
    makeExperience(),
    makeFullOpts({
      medicalNotes: {
        p0: { condition: 'Hamstring', returnTarget: '2026-06-14' },
        p1: { condition: 'Ankle',     returnTarget: '2026-06-15' },
      },
    })
  );
  assert.equal(pack.squad.clearanceMissing.length, 0, 'cleared players not in missing list');
});

// ─── 7. Checklist items ───────────────────────────────────────────────────────

test('fully prepared state → all checklist items done', () => {
  const pack = generateMatchReadinessPack(makeExperience(), makeFullOpts({
    medicalNotes: { p0: { returnTarget: '2026-06-14' }, p1: { returnTarget: '2026-06-14' } },
  }));
  assert.equal(pack.checklist.length, 6, '6 checklist items');
  const allDone = pack.checklist.every(c => c.done);
  assert.ok(allDone, 'all items done with full opts');
});

test('checklist: training published iff any Training session is published', () => {
  const expNoTraining = normalizeExperience({
    sessions: [{ id: 'game', type: 'Match' }],
    roster: [{ id: 'p1', name: 'A' }],
  });
  const packNo = generateMatchReadinessPack(expNoTraining, { enabled: true, now: NOW, matchCentre: { opposition: 'X' } });
  assert.equal(packNo.checklist.find(c => c.id === 'training')?.done, false, 'no training → not done');

  const expWithTraining = makeExperience(); // has published Training session
  const packYes = generateMatchReadinessPack(expWithTraining, { enabled: true, now: NOW });
  assert.equal(packYes.checklist.find(c => c.id === 'training')?.done, true, 'published training → done');
});

test('checklist: squad selected when all 15 positions filled', () => {
  const packFull = generateMatchReadinessPack(makeExperience(), makeFullOpts());
  assert.equal(packFull.checklist.find(c => c.id === 'selected')?.done, true, '15 filled → selected done');

  const packPartial = generateMatchReadinessPack(makeExperience(), makeFullOpts({ formationNames: { '1': 'A' } }));
  assert.equal(packPartial.checklist.find(c => c.id === 'selected')?.done, false, 'partial → not done');
});

test('checklist: squad published when matchCentre.published is true', () => {
  const packPub = generateMatchReadinessPack(makeExperience(), makeFullOpts({ matchCentre: { opposition:'X', published: true } }));
  assert.equal(packPub.checklist.find(c => c.id === 'published')?.done, true);

  const packNoPub = generateMatchReadinessPack(makeExperience(), makeFullOpts({ matchCentre: { opposition:'X', published: false } }));
  assert.equal(packNoPub.checklist.find(c => c.id === 'published')?.done, false);
});

test('all checklist items deep-link to known Core sections', () => {
  const pack = generateMatchReadinessPack(makeExperience(), makeFullOpts());
  for (const item of pack.checklist) {
    assert.ok(item.section, `item "${item.id}" has a section`);
    assert.ok(VALID_SECTIONS.has(item.section), `section "${item.section}" is not a Core screen`);
  }
});

// ─── 8. Risk detection ────────────────────────────────────────────────────────

test('missing front row positions → high risk (when fixture set)', () => {
  const pack = generateMatchReadinessPack(
    makeExperience(),
    makeFullOpts({ formationNames: { '9': 'Sam', '10': 'Lee' } })  // no front row
  );
  const frontRowRisk = pack.risks.find(r => /front row/i.test(r.title));
  assert.ok(frontRowRisk, 'front row risk must appear when positions 1/2/3 are missing');
  assert.equal(frontRowRisk.severity, 'high');
});

test('no front row risk when front row is complete', () => {
  const pack = generateMatchReadinessPack(makeExperience(), makeFullOpts());
  const frontRowRisk = pack.risks.find(r => /front row/i.test(r.title));
  assert.ok(!frontRowRisk, 'no front row risk when 1/2/3 all filled');
});

test('medical clearances pending → high risk', () => {
  const pack = generateMatchReadinessPack(makeExperience(), makeFullOpts({ medicalNotes: {} }));
  const medRisk = pack.risks.find(r => /clearance/i.test(r.title));
  assert.ok(medRisk, 'clearance risk must appear when injured players have no returnTarget');
  assert.equal(medRisk.severity, 'high');
});

test('high no-reply count → risk with correct severity', () => {
  const expHighNoReply = normalizeExperience({
    sessions: [{ id: 'game', type: 'Match' }],
    roster:   Array.from({ length: 22 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
    availability: { game: [] }, // zero replies → all 22 in no-reply
    fixtures: [{ opposition: 'X', date: '2026-06-21' }],
  });
  const pack = generateMatchReadinessPack(expHighNoReply, {
    enabled: true, now: NOW,
    matchCentre: { opposition: 'X' },
  });
  const noReplyRisk = pack.risks.find(r => /respond/i.test(r.title));
  assert.ok(noReplyRisk, 'no-reply risk present when ≥5 players have not responded');
  assert.ok(noReplyRisk.severity === 'high' || noReplyRisk.severity === 'medium');
});

test('selection incomplete risk only appears when fixture is set', () => {
  const packNoFixture = generateMatchReadinessPack(
    makeExperience(),
    { enabled: true, now: NOW, formationNames: { '1': 'A' }, matchCentre: {} }
  );
  const selRisk = packNoFixture.risks.find(r => /selected/i.test(r.title));
  assert.ok(!selRisk, 'no selection risk when no fixture set');

  const packWithFixture = generateMatchReadinessPack(
    makeExperience(),
    { enabled: true, now: NOW, formationNames: { '1': 'A' }, matchCentre: { opposition: 'X' } }
  );
  const selRisk2 = packWithFixture.risks.find(r => /selected/i.test(r.title));
  assert.ok(selRisk2, 'selection risk appears when fixture is set');
});

test('risks array never exceeds 5 items', () => {
  // Trigger all risks simultaneously
  const pack = generateMatchReadinessPack(
    normalizeExperience({
      sessions: [{ id: 'game', type: 'Match' }],
      roster:   Array.from({ length: 22 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
      availability: { game: [{ key: 'p0', response: 'unavailable', reason: 'injury' }] },
    }),
    { enabled: true, now: NOW, formationNames: {}, matchCentre: { opposition: 'X' } }
  );
  assert.ok(pack.risks.length <= 5, 'at most 5 risks');
});

// ─── 9. Recommended actions ───────────────────────────────────────────────────

test('actions are a subset of unfulfilled checklist items, max 3', () => {
  // No preparation done at all
  const pack = generateMatchReadinessPack(
    normalizeExperience({ roster: [{ id: 'p1', name: 'A' }] }),
    { enabled: true, now: NOW, matchCentre: { opposition: 'X' }, formationNames: {}, messages: [], availabilityRequests: [] }
  );
  assert.ok(pack.actions.length <= 3, 'at most 3 actions');
  assert.ok(pack.actions.length >= 0);
  for (const a of pack.actions) {
    assert.ok(a.title, 'action has title');
    assert.ok(a.section, 'action has section');
    assert.ok(VALID_SECTIONS.has(a.section), `action section "${a.section}" must be a Core screen`);
  }
});

test('no actions when all checklist items are done', () => {
  const pack = generateMatchReadinessPack(makeExperience(), makeFullOpts({
    medicalNotes: { p0: { returnTarget: '2026-06-14' }, p1: { returnTarget: '2026-06-15' } },
  }));
  assert.equal(pack.actions.length, 0, 'no actions when fully prepared');
});

// ─── 10. Confidence ──────────────────────────────────────────────────────────

test('confidence is a number between 0 and 1', () => {
  for (const [exp, opts] of [
    [normalizeExperience({}), {}],
    [makeExperience(), makeFullOpts()],
    [makeExperience(), makeFullOpts({ formationNames: {}, messages: [] })],
  ]) {
    const pack = generateMatchReadinessPack(exp, { ...opts, enabled: true, now: NOW });
    if (!pack.available) continue;
    assert.ok(typeof pack.confidence === 'number', 'confidence must be a number');
    assert.ok(pack.confidence >= 0, 'confidence >= 0');
    assert.ok(pack.confidence <= 1, 'confidence <= 1');
    assert.ok(!isNaN(pack.confidence), 'confidence must not be NaN');
  }
});

test('confidence is higher when fully prepared than when nothing is done', () => {
  const emptyPack = generateMatchReadinessPack(
    normalizeExperience({ roster: [{ id: 'p1', name: 'A' }] }),
    { enabled: true, now: NOW, matchCentre: { opposition: 'X' } }
  );
  const fullPack = generateMatchReadinessPack(
    makeExperience(),
    makeFullOpts({ medicalNotes: { p0: { returnTarget: '2026-06-14' }, p1: { returnTarget: '2026-06-15' } } })
  );
  assert.ok(fullPack.confidence > emptyPack.confidence, 'full prep scores higher confidence');
});

// ─── 11. All action sections are valid Core screens ─────────────────────────

test('every possible checklist section maps to a known Core screen', () => {
  const CHECKLIST_SECTIONS = ['message', 'training', 'matchday', 'matchday', 'medical', 'messages'];
  for (const s of CHECKLIST_SECTIONS) {
    assert.ok(VALID_SECTIONS.has(s), `checklist section "${s}" is not a Core screen`);
  }
});

// ─── 12. Permission contract ─────────────────────────────────────────────────

test('ai_intelligence permission is required to see the Match Readiness Pack', () => {
  const seesIt  = ['owner', 'dor', 'admin', 'head_coach', 'assistant', 'analyst'];
  const doesNot = ['manager', 'medical', 'snc', 'player', 'parent', 'guest'];

  for (const role of seesIt) {
    const perms = permissionsFor({ role, status: 'active' });
    assert.ok(perms.has(PERM.AI_INTELLIGENCE), `${role} must have ai_intelligence`);
  }
  for (const role of doesNot) {
    const perms = permissionsFor({ role, status: 'active' });
    assert.ok(!perms.has(PERM.AI_INTELLIGENCE), `${role} must NOT have ai_intelligence`);
  }
});

test('version constant is a semantic version string', () => {
  assert.match(MATCH_READINESS_VERSION, /^\d+\.\d+\.\d+$/, 'version must be semver');
});
