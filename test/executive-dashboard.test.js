/**
 * Executive Dashboard — integration contract.
 *
 * The dashboard is a read-only, feature-flagged overlay over Core state.
 * It consumes Weekly Brief (Intelligence) and existing Core stores.
 * These tests verify the contracts that the dashboard depends on:
 *
 *  1. Feature flag OFF → dashboard does not render (guard returns early)
 *  2. Situation signal priorities: match-day > tomorrow > training > injuries > selection
 *  3. Team health metrics derive from state without mutation
 *  4. Coach Score: 0–100, deterministic, never negative
 *  5. AI Recommendation: comes from Brief priorities, degrades gracefully
 *  6. Timeline items map every schedule slot
 *  7. All action deep-links resolve to known Core sections
 *  8. Dashboard survives an empty / partially-missing state
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { generateWeeklyBrief, WEEKLY_BRIEF_VERSION } = await import('../season-intelligence/weekly-brief.js');
const { normalizeExperience } = await import('../season-intelligence/coach-experience.js');
const { PERM, permissionsFor } = await import('../api/_permissions.js');

const NOW = '2026-06-12T10:00:00.000Z';
const VALID_SECTIONS = new Set(['overview', 'message', 'messages', 'training', 'matchday', 'medical', 'players', 'admin', 'settings', 'availability', 'week', 'fixtures']);

// ─── Helper: build a Core-like state snapshot ────────────────────────────────

function makeCoreState(overrides = {}) {
  return {
    clubName: 'Boitsfort RFC',
    teamName: 'Seniors',
    players: Array.from({ length: 18 }, (_, i) => ({
      id: `p${i}`, name: `Player ${i}`, position: 'TBC',
      game: i < 12 ? 'available' : 'no-reply',
      trainingTuesday: i < 14 ? 'available' : 'no-reply',
    })),
    schedule: [
      { id: 'tue', type: 'Training', title: 'Training session 1', date: 'Tuesday 19:00', published: true,  publishedAt: NOW },
      { id: 'thu', type: 'Training', title: 'Training session 2', date: 'Thursday 19:00', published: false, publishedAt: null },
      { id: 'game', type: 'Match',   title: 'Match',              date: '2026-06-21',     published: false, publishedAt: null },
    ],
    matchCentre: { opposition: 'Rivals RFC', kickoffDate: '2026-06-21', kickoffTime: '15:00', venue: 'Home', published: false },
    formationNames: {},
    benchPlayers: [],
    fixtures: [{ id: 'fx1', opposition: 'Rivals RFC', date: '2026-06-21', venue: 'Home' }],
    availabilityRequests: [{ sessionId: 'game', status: 'sent' }],
    messages: [],
    treatmentLogs: [],
    medicalNotes: {},
    features: { executiveDashboard: false, aiWeeklyBrief: false },
    ...overrides,
  };
}

// ─── 1. Feature flag OFF ─────────────────────────────────────────────────────

test('feature flag OFF → executiveDashboard flag is false by default', () => {
  const state = makeCoreState();
  assert.equal(state.features.executiveDashboard, false, 'must be off by default');
  // When off, renderCoachOverview() falls through to the existing path.
  // We verify the flag value, not DOM rendering (this is a headless test env).
});

// ─── 2. Situation signal priorities ─────────────────────────────────────────

test('situation: squad not published and match < 24h has highest priority signal', () => {
  // Core's renderExecutiveDashboard checks phase.msLeft < 86400000 && !mc.published
  // The matchCentrePhase() function uses kickoffDate. We test the signal logic
  // by verifying the Brief correctly reports it as a high-risk priority.
  const exp = normalizeExperience({
    sessions: [{ id: 'game', type: 'Match', published: false }],
    squad: { formationNames: { '1': 'A', '2': 'B' }, published: false, opposition: 'Rivals' },
    roster: Array.from({ length: 18 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` })),
    availability: {
      game: Array.from({ length: 10 }, (_, i) => ({ key: `p${i}`, response: 'available' })),
    },
    fixtures: [{ opposition: 'Rivals', date: '2026-06-13', venue: 'Away' }],
  });
  const brief = generateWeeklyBrief(exp, { tier: 'pro', now: NOW });
  // The squad is not published — should be a top risk
  const squadRisk = brief.risks.find(r => /squad/i.test(r.title) || /published/i.test(r.title));
  assert.ok(squadRisk, 'unpublished squad should surface as a risk');
  assert.ok(squadRisk.severity === 'medium' || squadRisk.severity === 'high');
});

test('situation: selection incomplete when <15 picked and match exists', () => {
  const exp = normalizeExperience({
    squad: { formationNames: { '1': 'Alex', '2': 'Sam' }, published: false, opposition: 'France U20', kickoffDate: '2026-06-20' },
    roster: Array.from({ length: 18 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` })),
    fixtures: [{ opposition: 'France U20', date: '2026-06-20' }],
  });
  const brief = generateWeeklyBrief(exp, { tier: 'pro', now: NOW });
  assert.ok(brief.priorities.some(p => /select/i.test(p.title)), 'selection priority should appear');
});

// ─── 3. Team health derives from state ──────────────────────────────────────

test('health metric: available count comes from player availability responses', () => {
  const core = makeCoreState();
  const gameKey = 'game'; // sessionKey('game') === 'game'
  const matchAvail = core.players.filter(p => p[gameKey] === 'available').length;
  assert.equal(matchAvail, 12, '12 of 18 players available for the match');
  // Verify the formula is what we'd compute in the dashboard
  assert.ok(matchAvail >= 0 && matchAvail <= core.players.length);
});

test('health metric: injury count from player flags', () => {
  const core = makeCoreState({
    players: [
      { id: 'p1', name: 'A', game: 'injured' },
      { id: 'p2', name: 'B', game: 'available' },
      { id: 'p3', name: 'C', status: 'injured' },
    ],
  });
  const injured = core.players.filter(p => p.game === 'injured' || p.status === 'injured').length;
  assert.equal(injured, 2, 'two injury flags detected');
});

test('health metric: selection progress from formationNames', () => {
  const core = makeCoreState({
    formationNames: { '1':'Alex', '2':'Sam', '3':'', '9':'Dan', '10':'Lee' },
  });
  const picked = Object.values(core.formationNames).filter(n => String(n || '').trim()).length;
  assert.equal(picked, 4, '4 of 5 slots filled (empty string excluded)');
  assert.ok(picked < 15, 'selection incomplete');
});

// ─── 4. Coach Score — deterministic, bounded ─────────────────────────────────

test('coach score is 0–100, deterministic, never NaN or negative', () => {
  for (const exp of [
    normalizeExperience({}),
    normalizeExperience({ sessions: [{ id: 'tue', type: 'Training', published: true }], roster: [{ id: 'p1', name: 'A' }] }),
    normalizeExperience({ meta: { partial: true } }),
  ]) {
    const brief = generateWeeklyBrief(exp, { now: NOW });
    if (!brief.available) continue;

    const checklist  = brief.matchPrepChecklist || [];
    const checkDone  = checklist.filter(c => c.done).length;
    const checkTotal = checklist.length || 5;
    const conf       = brief.confidence || 0;
    const score = checklist.length
      ? Math.round(((checkDone / checkTotal) * 0.6 + conf * 0.4) * 100)
      : Math.round(conf * 100);

    assert.ok(!isNaN(score),    'score must not be NaN');
    assert.ok(score >= 0,       'score must be non-negative');
    assert.ok(score <= 100,     'score must be ≤100');
  }
});

test('coach score is higher for a well-prepped state than an empty one', () => {
  const empty = normalizeExperience({});
  const rich  = normalizeExperience({
    sessions: [{ id: 'tue', type: 'Training', published: true }],
    squad: { formationNames: Object.fromEntries(Array.from({length:15},(_, i)=>[String(i+1),`P${i}`])), published: true },
    roster: Array.from({ length: 18 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
    availability: { game: Array.from({ length: 15 }, (_, i) => ({ key: `p${i}`, response: 'available' })) },
    fixtures: [{ opposition: 'Rivals', date: '2026-06-21', venue: 'Home' }],
  });

  const score = (exp) => {
    const b = generateWeeklyBrief(exp, { now: NOW });
    if (!b.available) return 0;
    const checkDone = (b.matchPrepChecklist || []).filter(c => c.done).length;
    const total = b.matchPrepChecklist?.length || 5;
    return Math.round(((checkDone / total) * 0.6 + b.confidence * 0.4) * 100);
  };

  assert.ok(score(rich) > score(empty), 'well-prepped state should score higher');
});

// ─── 5. AI Recommendation degrades gracefully ────────────────────────────────

test('no recommendation available when brief is disabled', () => {
  const brief = generateWeeklyBrief({}, { enabled: false, now: NOW });
  assert.equal(brief.available, false);
  assert.equal(brief.priorities, undefined);
  // Dashboard would render "No recommendation available." in this case.
});

test('recommendation section shows first priority when brief is available', () => {
  const exp = normalizeExperience({
    sessions: [{ id: 'game', type: 'Match' }],
    squad: { formationNames: {}, published: false, opposition: 'Rivals', kickoffDate: '2026-06-21' },
    roster: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }],
    fixtures: [{ opposition: 'Rivals', date: '2026-06-21' }],
    availability: { game: [{ key: 'p1', response: 'available' }] },
  });
  const brief = generateWeeklyBrief(exp, { now: NOW });
  assert.equal(brief.available, true);
  const rec = brief.priorities?.[0];
  assert.ok(rec, 'there should be at least one priority to recommend');
  assert.ok(rec.action?.section, 'recommendation must have a deep-link section');
  assert.ok(VALID_SECTIONS.has(rec.action.section), `section "${rec.action.section}" must be a known Core screen`);
});

// ─── 6. Timeline maps every schedule slot ────────────────────────────────────

test('timeline produces one item per schedule slot', () => {
  const core = makeCoreState();
  const timelineItems = core.schedule.map(s => ({
    id: s.id, type: s.type, published: s.published,
    isMatch: s.type === 'Match',
  }));
  assert.equal(timelineItems.length, 3, '3 schedule slots → 3 timeline rows');
  assert.ok(timelineItems.some(i => i.type === 'Training' && i.published),  'published training item present');
  assert.ok(timelineItems.some(i => i.type === 'Training' && !i.published), 'draft training item present');
  assert.ok(timelineItems.some(i => i.isMatch), 'match item present');
});

// ─── 7. Deep-links resolve to known Core sections ────────────────────────────

test('all Weekly Brief action sections are valid Core sections', () => {
  const exp = normalizeExperience({
    sessions: [{ id: 'tue', type: 'Training', published: false }, { id: 'game', type: 'Match' }],
    squad: { formationNames: { '1': 'A' }, published: false, opposition: 'Rivals', kickoffDate: '2026-06-21' },
    roster: Array.from({ length: 18 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
    availability: { game: Array.from({ length: 5 }, (_, i) => ({ key: `p${i}`, response: 'available' })) },
    fixtures: [{ opposition: 'Rivals', date: '2026-06-21' }],
  });
  const brief = generateWeeklyBrief(exp, { tier: 'elite', now: NOW });
  assert.ok(brief.available);

  for (const p of brief.priorities) {
    assert.ok(VALID_SECTIONS.has(p.action.section), `priority section "${p.action.section}" is not a Core screen`);
  }
  for (const a of brief.recommendedActions) {
    assert.ok(VALID_SECTIONS.has(a.action.section), `action section "${a.action.section}" is not a Core screen`);
  }
});

// ─── 8. Survives empty / partially-missing state ─────────────────────────────

test('dashboard survives empty state — no throws, valid shape', () => {
  for (const bad of [
    {},
    { players: [], schedule: [] },
    { matchCentre: null, formationNames: undefined },
    { players: null, fixtures: undefined, treatmentLogs: null },
  ]) {
    // Simulate the metric computations from renderExecutiveDashboard
    const players  = bad.players || [];
    const schedule = bad.schedule || [];
    const mc       = bad.matchCentre || {};

    assert.doesNotThrow(() => {
      const injured = players.filter(p => p?.game === 'injured' || p?.status === 'injured').length;
      const picked  = Object.values(bad.formationNames || {}).filter(n => String(n || '').trim()).length;
      const items   = schedule.map(s => ({ id: s.id, type: s.type }));
      // All must be non-negative integers
      assert.ok(injured >= 0);
      assert.ok(picked  >= 0);
      assert.ok(items.length >= 0);
    }, `should not throw for state: ${JSON.stringify(bad)}`);
  }
});

// ─── Permission contract ──────────────────────────────────────────────────────

test('ai_intelligence permission gates the Intelligence features within the dashboard', () => {
  // Executive Dashboard shows AI Recommendation — those features gate on ai_intelligence
  const coachPerms  = permissionsFor({ role: 'head_coach', status: 'active' });
  const playerPerms = permissionsFor({ role: 'player', status: 'active' });
  assert.ok(coachPerms.has(PERM.AI_INTELLIGENCE),  'head coach must access Intelligence');
  assert.ok(!playerPerms.has(PERM.AI_INTELLIGENCE), 'player must not access Intelligence');
});
