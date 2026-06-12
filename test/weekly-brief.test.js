/**
 * AI Weekly Brief — first production Intelligence feature.
 *
 * Proves the Core/Intelligence boundary contract:
 *  1. Feature flag OFF → typed unavailable model, never throws
 *  2. Empty / degraded snapshot → valid brief, low confidence, degraded flag
 *  3. Rich snapshot → correct attendance / load / availability / squad maths
 *  4. Priorities, risks and checklist reflect real signals
 *  5. Subscription tiers gate depth, never correctness
 *  6. Determinism — same snapshot ⇒ same brief (timestamp aside)
 *  7. Every brief carries evidence references and a confidence score
 *  8. Coach Experience adapter reads only published Core endpoints, and
 *     degrades each slice independently on failure (never throws)
 *  9. Output is exactly the dashboard-consumable shape
 * 10. Optional narrator enriches strings but never the numbers
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { generateWeeklyBrief, WEEKLY_BRIEF_VERSION } = await import('../season-intelligence/weekly-brief.js');
const { normalizeExperience, emptyExperience, fetchCoachExperience, COACH_EXPERIENCE_VERSION } =
  await import('../season-intelligence/coach-experience.js');

const NOW = '2026-06-16T18:00:00.000Z';

// A realistic mid-week snapshot: match Saturday, partial availability, XV not
// fully picked, training in draft.
function richExperience() {
  return normalizeExperience({
    asOf: NOW,
    team: { id: 'marshall-rfc', name: 'Marshall RFC' },
    club: { clubName: 'Marshall RFC', teamName: 'Seniors',
      fixtures: [{ id: 'fx1', opposition: 'France U20', date: '2026-06-20', time: '15:00', venue: 'Stade Fallon', competition: 'Friendly' }] },
    sessions: [
      { id: 'tue', title: 'Tuesday Training', type: 'Training', date: 'Tuesday 19:00', published: true, publishedAt: NOW },
      { id: 'thu', title: 'Thursday Training', type: 'Training', date: 'Thursday 19:00', published: false },
      { id: 'game', title: 'Match', type: 'Match', date: '2026-06-20' },
    ],
    squad: { published: false, opposition: 'France U20', kickoffDate: '2026-06-20', venue: 'Stade Fallon',
      formationNames: { '1': 'A', '2': 'B', '3': 'C', '9': 'D', '10': 'E' }, benchPlayers: [] },
    roster: Array.from({ length: 22 }, (_, i) => ({ id: 'p' + i, name: 'Player ' + i, position: 'TBC' })),
    availability: {
      tue: [
        { key: 'p0', label: 'Player 0', response: 'available' },
        { key: 'p1', label: 'Player 1', response: 'available' },
        { key: 'p2', label: 'Player 2', response: 'no-reply' },
      ],
      game: [
        { key: 'p0', response: 'available' }, { key: 'p1', response: 'available' },
        { key: 'p2', response: 'available' }, { key: 'p3', response: 'unavailable', reason: 'injury' },
        { key: 'p4', response: 'unavailable', reason: 'injury' }, { key: 'p5', response: 'maybe' },
        { key: 'p6', response: 'no-reply' }, { key: 'p7', response: 'no-reply' },
        { key: 'p8', response: 'no-reply' }, { key: 'p9', response: 'no-reply' },
      ],
    },
    meta: { sources: { club: 'ok', published: 'ok', roster: 'ok' }, partial: false },
  });
}

// ─── 1. Feature flag off ─────────────────────────────────────────────────────

test('feature flag OFF returns a typed unavailable model and never throws', () => {
  const brief = generateWeeklyBrief(richExperience(), { enabled: false, tier: 'pro', now: NOW });
  assert.equal(brief.available, false);
  assert.equal(brief.reason, 'intelligence_disabled');
  assert.equal(brief.version, WEEKLY_BRIEF_VERSION);
  assert.equal(brief.generatedAt, NOW);
  // No analytical fields leak when disabled
  assert.equal(brief.priorities, undefined);
});

// ─── 2. Degraded input ───────────────────────────────────────────────────────

test('empty snapshot yields a valid, low-confidence, degraded brief', () => {
  const brief = generateWeeklyBrief(emptyExperience(NOW), { now: NOW });
  assert.equal(brief.available, true);
  assert.equal(brief.degraded, true);
  assert.ok(brief.confidence < 0.5, 'confidence should be low on empty input');
  assert.deepEqual(brief.priorities, []);
  assert.equal(brief.matchPrepChecklist.length, 5, 'checklist always present');
  assert.ok(brief.matchPrepChecklist.every(c => c.done === false));
});

test('malformed / undefined input never throws', () => {
  for (const bad of [undefined, null, {}, { sessions: 'nope', availability: 7 }, { version: '1.0.0' }]) {
    const brief = generateWeeklyBrief(bad, { now: NOW });
    assert.equal(brief.available, true);
    assert.equal(typeof brief.confidence, 'number');
  }
});

// ─── 3 + 4. Rich snapshot maths and signals ──────────────────────────────────

test('rich snapshot computes attendance, load, availability and squad correctly', () => {
  const brief = generateWeeklyBrief(richExperience(), { tier: 'pro', now: NOW });

  // Availability for the match: 3 available, 1 maybe, 2 unavailable(injury), 4 no-reply
  const a = brief.availabilitySummary;
  assert.equal(a.forSession, 'game');
  assert.equal(a.available, 3);
  assert.equal(a.maybe, 1);
  assert.equal(a.unavailable, 2);
  assert.equal(a.noReply, 4);
  assert.equal(a.injured, 2);
  assert.equal(a.shortfallToXV, 12);
  assert.equal(a.canFieldXV, false);

  // Training load: 2 training sessions (1 published, 1 draft) + match
  const l = brief.trainingLoadSummary;
  assert.equal(l.trainingSessions, 2);
  assert.equal(l.published, 1);
  assert.equal(l.unpublished, 1);
  assert.equal(l.matchScheduled, true);
  assert.equal(l.loadBand, 'high');

  // Attendance over training sessions only (tue has 3 responses, 1 no-reply)
  assert.equal(brief.attendanceSummary.sessionsTracked, 2);
  assert.equal(brief.attendanceSummary.responseRate, 67); // tue: 2 of 3 replied; thu: 0 of 0 → (2/3)

  // Next fixture pulled from fixtures list
  assert.equal(brief.nextFixture.opposition, 'France U20');
  assert.equal(brief.nextFixture.source, 'fixtures');
});

test('priorities, risks and checklist reflect the real situation', () => {
  const brief = generateWeeklyBrief(richExperience(), { tier: 'elite', now: NOW });

  // Squad only 5 picked → top priority is to finish selecting
  assert.match(brief.priorities[0].title, /select/i);
  assert.ok(brief.priorities.some(p => /chase/i.test(p.title)), 'should flag non-responders');

  // Risks: low availability for the match is the headline risk
  assert.equal(brief.risks[0].severity, 'high');
  assert.match(brief.risks[0].title, /available for the match/i);
  assert.ok(brief.risks.some(r => /injuries/i.test(r.title)), 'injuries surfaced');

  // Checklist: availability requested (true), squad selected/published (false)
  const byId = Object.fromEntries(brief.matchPrepChecklist.map(c => [c.id, c.done]));
  assert.equal(byId.availability, true);
  assert.equal(byId.selected, false);
  assert.equal(byId.published, false);
  assert.equal(byId.training, true); // tue is published

  // Headline is action-led
  assert.match(brief.headline, /France U20/);
});

// ─── 5. Subscription tiers ───────────────────────────────────────────────────

test('subscription tiers gate depth, never correctness', () => {
  const exp = richExperience();
  const free = generateWeeklyBrief(exp, { tier: 'free', now: NOW });
  const pro = generateWeeklyBrief(exp, { tier: 'pro', now: NOW });
  const elite = generateWeeklyBrief(exp, { tier: 'elite', now: NOW });

  assert.equal(free.priorities.length, 1);
  assert.equal(free.recommendedActions.length, 0);
  assert.equal(pro.priorities.length, 3);
  assert.ok(pro.recommendedActions.length > 0 && pro.recommendedActions.length <= 4);
  assert.ok(elite.risks.length >= pro.risks.length);

  // The NUMBERS are identical across tiers — only depth changes
  assert.deepEqual(free.availabilitySummary, pro.availabilitySummary);
  assert.deepEqual(free.attendanceSummary, pro.attendanceSummary);
  assert.equal(free.confidence, pro.confidence);
});

// ─── 6. Determinism ──────────────────────────────────────────────────────────

test('same snapshot yields an identical brief (timestamp aside)', () => {
  const exp = richExperience();
  const a = generateWeeklyBrief(exp, { tier: 'pro', now: NOW });
  const b = generateWeeklyBrief(exp, { tier: 'pro', now: NOW });
  assert.deepEqual(a, b);
});

// ─── 7. Evidence + confidence always present ─────────────────────────────────

test('every brief carries evidence references and a confidence score', () => {
  const brief = generateWeeklyBrief(richExperience(), { now: NOW });
  assert.ok(Array.isArray(brief.evidence) && brief.evidence.length > 0);
  assert.ok(brief.evidence.every(e => e.ref && 'value' in e));
  assert.equal(typeof brief.confidence, 'number');
  assert.ok(brief.confidence > 0.8, 'complete snapshot → high confidence');
  // Priorities and risks each cite evidence
  assert.ok(brief.priorities.every(p => p.evidence?.ref));
  assert.ok(brief.risks.every(r => r.evidence?.ref));
});

// ─── 8. Coach Experience adapter (published APIs only, degrades per slice) ────

test('fetchCoachExperience reads only published endpoints and degrades on failure', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    if (url.includes('resource=club')) return { ok: true, json: async () => ({ club: { clubName: 'Net Club', fixtures: [] } }) };
    if (url.includes('type=all')) return { ok: true, json: async () => ({ sessions: [{ id: 'tue', type: 'Training', published: true }], squad: null }) };
    if (url.includes('/api/roster')) return { ok: false, status: 403 };           // roster denied → degrades
    if (url.includes('/api/availability')) return { ok: true, json: async () => ({ responses: [{ key: 'p1', response: 'available' }] }) };
    return { ok: false, status: 404 };
  };
  const exp = await fetchCoachExperience({ baseUrl: 'https://x.test', sessionIds: ['tue', 'game'], fetchImpl: fakeFetch, asOf: NOW });

  // Only published, read-only Core endpoints were hit
  assert.ok(calls.every(u => /\/api\/(publish|roster|availability)/.test(u)), 'only published Core APIs');
  assert.equal(exp.club.clubName, 'Net Club');
  assert.equal(exp.sessions.length, 1);
  assert.deepEqual(exp.roster, [], 'denied roster degrades to empty, not a throw');
  assert.equal(exp.meta.partial, true);
  assert.equal(exp.meta.sources['roster'], 'http_403');

  // The brief still generates from a partial snapshot
  const brief = generateWeeklyBrief(exp, { now: NOW });
  assert.equal(brief.available, true);
  assert.equal(brief.degraded, true);
});

test('adapter never throws when fetch itself rejects', async () => {
  const exp = await fetchCoachExperience({ baseUrl: '', fetchImpl: async () => { throw new Error('network down'); }, asOf: NOW });
  assert.equal(exp.version, COACH_EXPERIENCE_VERSION);
  assert.equal(exp.meta.partial, true);
  const brief = generateWeeklyBrief(exp, { now: NOW });
  assert.equal(brief.available, true);
});

// ─── 9. Dashboard-consumable shape ───────────────────────────────────────────

test('output is exactly the dashboard-consumable shape', () => {
  const brief = generateWeeklyBrief(richExperience(), { now: NOW });
  for (const k of ['version', 'available', 'tier', 'degraded', 'generatedAt', 'team', 'headline',
    'nextFixture', 'priorities', 'risks', 'attendanceSummary', 'trainingLoadSummary',
    'availabilitySummary', 'matchPrepChecklist', 'recommendedActions', 'confidence', 'evidence']) {
    assert.ok(k in brief, `brief must expose ${k}`);
  }
  // Priorities shaped for the future screen: rank, title, why, action, evidence
  for (const p of brief.priorities) {
    for (const k of ['rank', 'title', 'why', 'action', 'evidence']) assert.ok(k in p, `priority needs ${k}`);
    assert.ok(p.action.section && p.action.label, 'action is a deep-link hint');
  }
});

// ─── 10. Narrator enrichment (optional, never numeric) ───────────────────────

test('narrator enriches strings but never overrides the numbers', () => {
  const exp = richExperience();
  const numericBefore = generateWeeklyBrief(exp, { now: NOW }).availabilitySummary;
  const brief = generateWeeklyBrief(exp, { now: NOW,
    narrator: () => ({ headline: 'Custom AI headline', summary: 'A calm, human paragraph.' }) });
  assert.equal(brief.headline, 'Custom AI headline');
  assert.equal(brief.summary, 'A calm, human paragraph.');
  assert.equal(brief.narrated, true);
  assert.deepEqual(brief.availabilitySummary, numericBefore, 'numbers untouched by narrator');
});

test('a throwing narrator degrades to deterministic strings', () => {
  const brief = generateWeeklyBrief(richExperience(), { now: NOW, narrator: () => { throw new Error('LLM down'); } });
  assert.equal(brief.available, true);
  assert.match(brief.headline, /France U20|select/i);
  assert.equal(brief.narrated, undefined);
});
