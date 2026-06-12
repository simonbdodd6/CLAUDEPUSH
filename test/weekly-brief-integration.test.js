/**
 * Weekly Intelligence Brief — Overview slot integration contract.
 *
 * Verifies the four invariants the Core integration depends on:
 *  1. Feature flag OFF → slot invisible (brief.available = false, no data leaks)
 *  2. ai_intelligence permission gate — exact role matrix
 *  3. Unavailable / degraded brief → graceful fallback, never throws
 *  4. Core state shape maps through normalizeExperience to a valid brief
 *  5. Every priority deep-links to a known Core section
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { generateWeeklyBrief } = await import('../season-intelligence/weekly-brief.js');
const { normalizeExperience } = await import('../season-intelligence/coach-experience.js');
const { PERM, can, permissionsFor } = await import('../api/_permissions.js');

const NOW = '2026-06-12T10:00:00.000Z';

// ─── 1. Feature flag OFF ─────────────────────────────────────────────────────

test('flag off: brief returns available=false, slot must render empty', () => {
  const brief = generateWeeklyBrief({}, { enabled: false, now: NOW });
  assert.equal(brief.available, false, 'disabled → slot must be empty');
  assert.equal(brief.reason, 'intelligence_disabled');
  assert.equal(brief.priorities, undefined, 'no data leaks when disabled');
  assert.equal(brief.risks, undefined);
  assert.equal(brief.headline, undefined);
});

test('flag off with rich experience → still unavailable model, no analytics', () => {
  const exp = normalizeExperience({
    sessions: [{ id: 'tue', type: 'Training', published: true }],
    roster: [{ id: 'p1', name: 'Alex' }],
  });
  const brief = generateWeeklyBrief(exp, { enabled: false, now: NOW });
  assert.equal(brief.available, false);
  assert.equal(brief.reason, 'intelligence_disabled');
});

// ─── 2. Permission gate ──────────────────────────────────────────────────────

test('only roles with ai_intelligence see the brief', () => {
  const seesIt = ['owner', 'dor', 'admin', 'head_coach', 'assistant', 'analyst'];
  const doesNot = ['manager', 'medical', 'snc', 'player', 'parent', 'guest'];

  for (const role of seesIt) {
    const perms = permissionsFor({ role, status: 'active' });
    assert.ok(perms.has(PERM.AI_INTELLIGENCE), `${role} must see the Intelligence Brief`);
  }
  for (const role of doesNot) {
    const perms = permissionsFor({ role, status: 'active' });
    assert.ok(!perms.has(PERM.AI_INTELLIGENCE), `${role} must NOT see the Intelligence Brief`);
  }
});

test('can() gate: head coach granted, player denied, no identity denied', () => {
  const coachCtx  = { user: { id: 'c1' }, teamMember: { role: 'coach', staffLevel: 'head', status: 'active' } };
  const playerCtx = { user: { id: 'p1' }, teamMember: { role: 'player', status: 'active' } };
  const noCtx     = {};

  assert.equal(can(coachCtx,  PERM.AI_INTELLIGENCE), true,  'head coach → granted');
  assert.equal(can(playerCtx, PERM.AI_INTELLIGENCE), false, 'player → denied');
  assert.equal(can(noCtx,     PERM.AI_INTELLIGENCE), false, 'no identity → denied');
});

test('inactive membership holds no ai_intelligence permission', () => {
  const inactive = permissionsFor({ role: 'head_coach', status: 'removed' });
  assert.equal(inactive.size, 0, 'removed member has zero permissions');
  assert.ok(!inactive.has(PERM.AI_INTELLIGENCE));
});

// ─── 3. Unavailable / degraded brief — graceful fallback ────────────────────

test('null/empty/malformed experience → valid degraded brief, never throws', () => {
  for (const bad of [null, undefined, {}, { sessions: null, roster: 7 }, { version: '0.1' }]) {
    let brief;
    assert.doesNotThrow(() => { brief = generateWeeklyBrief(bad, { now: NOW }); });
    assert.equal(brief.available, true,   `bad input should still return available:true (not crash)`);
    assert.equal(brief.degraded,  true,   `bad input → degraded flag`);
    assert.ok(brief.confidence < 0.5,    `bad input → low confidence`);
    assert.ok(Array.isArray(brief.priorities));
    assert.ok(Array.isArray(brief.risks));
    assert.ok(Array.isArray(brief.matchPrepChecklist));
  }
});

test('partial experience (roster 403) → degraded brief with valid shape', () => {
  const partial = normalizeExperience({
    sessions: [{ id: 'game', type: 'Match' }],
    roster: [],
    meta: { sources: { roster: 'http_403' }, partial: true },
  });
  const brief = generateWeeklyBrief(partial, { now: NOW });
  assert.equal(brief.available, true);
  assert.equal(brief.degraded, true);
  assert.ok(brief.confidence < 0.5);
  assert.equal(typeof brief.headline, 'string');
});

// ─── 4. Core state shape → valid brief ──────────────────────────────────────

test('Core-shaped state maps through normalizeExperience to a valid brief', () => {
  // Mirrors the data _buildExperienceFromState() would produce from a real Core state
  const coreStateLike = {
    asOf: NOW,
    team: { id: 'boitsfort-rfc', name: 'Boitsfort RFC', teamName: 'Seniors', sport: 'Rugby' },
    club: { clubName: 'Boitsfort RFC', teamName: 'Seniors', fixtures: [] },
    sessions: [
      { id: 'tue',  title: 'Training session 1', type: 'Training', date: 'Tuesday 19:00', published: true,  publishedAt: NOW },
      { id: 'thu',  title: 'Training session 2', type: 'Training', date: 'Thursday 19:00', published: false, publishedAt: null },
      { id: 'game', title: 'Match',              type: 'Match',    date: '2026-06-21',      published: false, publishedAt: null },
    ],
    squad: null,
    roster: [{ id: 'p1', name: 'Alex', position: 'Flanker' }, { id: 'p2', name: 'Sam', position: 'Prop' }],
    availability: {
      tue:  [{ key: 'p1', label: 'Alex', response: 'available' }, { key: 'p2', label: 'Sam', response: 'no-reply' }],
      game: [{ key: 'p1', response: 'available' }, { key: 'p2', response: 'unavailable', reason: 'injury' }],
    },
    meta: { sources: { state: 'ok' }, partial: false },
  };

  const exp = normalizeExperience(coreStateLike);
  const brief = generateWeeklyBrief(exp, { now: NOW });

  assert.equal(brief.available, true);
  assert.equal(typeof brief.confidence, 'number');
  assert.ok(brief.confidence > 0, 'non-empty state → positive confidence');
  assert.ok(Array.isArray(brief.priorities));
  assert.ok(Array.isArray(brief.risks));
  assert.ok(brief.matchPrepChecklist.length === 5);
  assert.ok(Array.isArray(brief.evidence) && brief.evidence.length > 0);
  assert.equal(typeof brief.headline, 'string');
});

// ─── 5. Priority deep-links to known Core sections ──────────────────────────

test('brief priorities deep-link to valid Core sections', () => {
  const VALID_SECTIONS = new Set(['overview', 'message', 'messages', 'training', 'matchday', 'medical', 'players', 'admin', 'settings', 'availability', 'week', 'fixtures']);

  const exp = normalizeExperience({
    asOf: NOW,
    sessions: [
      { id: 'tue',  type: 'Training', published: true },
      { id: 'thu',  type: 'Training', published: false },
      { id: 'game', type: 'Match' },
    ],
    squad: { formationNames: { '1': 'Alex' }, published: false, opposition: 'Rivals RFC', kickoffDate: '2026-06-21' },
    roster: Array.from({ length: 22 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` })),
    availability: {
      game: Array.from({ length: 10 }, (_, i) => ({ key: `p${i}`, response: i < 5 ? 'available' : 'no-reply' })),
    },
  });

  const brief = generateWeeklyBrief(exp, { tier: 'elite', now: NOW });

  assert.ok(brief.priorities.length > 0, 'should have priorities given this data');
  for (const p of brief.priorities) {
    assert.ok(p.action?.section, `priority "${p.title}" must have action.section`);
    assert.ok(
      VALID_SECTIONS.has(p.action.section),
      `section "${p.action.section}" is not a known Core screen`
    );
  }
});
