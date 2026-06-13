/**
 * Coach Products — M22 AI Selection Assistant Tests
 *
 * Coverage:
 *  1. Types & constants
 *  2. Subscription gating
 *  3. Response envelope (full field contract)
 *  4. Full-strength squad — complete specialist XV, secure coverage
 *  5. Determinism
 *  6. Exposed tighthead (front-row / uncontested-scrum risk)
 *  7. No hooker (lineout thrower + front row exposed)
 *  8. No fly-half cover (backline exposed)
 *  9. Injuries remove players from selection
 * 10. Doubtful starter → injury risk + warning
 * 11. High training load → injury risk + rotation change
 * 12. Under-strength squad (<15) → squad_size warning + missing positions
 * 13. Match Readiness injury concerns surface (with evidence)
 * 14. Missing squad → graceful empty (available, not ok)
 * 15. Feature flag disabled
 * 16. No-coach-profile fallback (XV identical)
 * 17. Personalisation — EMPHASIS ONLY (XV/coverage/scores never change; no mutation)
 * 18. Never throws
 * 19. Structural contract (no Brain internals / no Core)
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  SA_ID, SA_VERSION, POSITIONS, JERSEYS, COVERAGE, SEVERITY, PLAYER_STATUS,
} from '../coach-products/selection-assistant/selection-assistant-types.js'
import { getSelectionAssistant } from '../coach-products/selection-assistant/selection-assistant.js'
import { reorderChanges, emptyPersonalisation } from '../coach-products/selection-assistant/personaliser.js'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const TIERS_WITH    = ['performance', 'professional', 'club', 'enterprise']
const TIERS_WITHOUT = ['free', 'starter']

function makeCaps(tier, overrides = {}) {
  const hasMR = TIERS_WITH.includes(tier)
  return {
    integrationVersion: '1.0',
    tier,
    isEnabled: tier !== 'free',
    features: {
      dashboard: tier !== 'free',
      weeklyBrief: ['starter', 'performance', 'professional', 'enterprise'].includes(tier),
      matchReadiness: hasMR,
      playerCard: ['performance', 'professional', 'enterprise'].includes(tier),
      clubSnapshot: ['professional', 'club', 'enterprise'].includes(tier),
      ...overrides.features,
    },
    limitations: tier === 'free' ? ['Upgrade'] : [],
    reason: tier === 'free' ? 'insufficient_tier' : null,
    ...overrides,
  }
}

const mk = (id, positions, opts = {}) => ({
  playerId: id, name: id, positions, available: true, status: 'fit', form: 70, minutesLoad: 50, ...opts,
})

// 22-man squad with full specialist cover everywhere → every area SECURE.
function fullSquad() {
  return [
    mk('p1', [1]),     mk('h1', [2]),     mk('p3', [3]),
    mk('l4', [4, 5]),  mk('l5', [5, 4]),
    mk('f6', [6, 7]),  mk('f7', [7, 6]),  mk('n8', [8, 6]),
    mk('s9', [9]),     mk('f10', [10]),
    mk('w11', [11, 14]), mk('c12', [12, 13]), mk('c13', [13, 12]), mk('w14', [14, 11]), mk('fb15', [15, 14]),
    // bench cover
    mk('p1b', [1, 3]), mk('h2', [2]), mk('l3', [4, 5]), mk('br', [8, 7]),
    mk('s9b', [9]), mk('f10b', [10, 12]), mk('bk', [15, 11, 14]),
  ]
}

const MR_DATA = {
  teamId: 'team-1', injuryConcerns: [], trainingCompletion: { total: 0, estimatedMinutes: 0 },
  preparationChecklist: [], missingActions: [], explanationIds: ['exp-mr1'], confidence: 75, isMock: false,
}

const RICH_PROFILE = {
  coachId: 'coach-99', profileVersion: '1.0', observationCount: 15, overallConfidence: 0.71,
  preferences: {
    coachingStyle:      { value: 'directive' },
    trainingEmphasis:   { value: 'tactical' },
    squadRotation:      { value: 'high' },     // surfaces rotation suggestions
    communicationStyle: { value: 'nurturing' },
    riskTolerance:      { value: 'low' },
    workloadPreference: { value: 'moderate' },
  },
  recommendationHistory: { accepted: 8, rejected: 2, ignored: 2, edited: 1, byCategory: {} },
}

const clone = (o) => JSON.parse(JSON.stringify(o))

function mockCoachAI({
  tier = 'professional', caps = null,
  mrData = MR_DATA, mrOk = true,
  profileData = null, profileOk = true,
  throwOnCaps = false, throwOnMR = false, throwOnProfile = false,
} = {}) {
  return {
    getCapabilities: async () => { if (throwOnCaps) throw new Error('caps'); return caps ?? makeCaps(tier) },
    getMatchReadiness: async () => {
      if (throwOnMR) throw new Error('mr')
      return { integrationVersion: '1.0', ok: mrOk, available: true, tier, reason: null, data: mrData }
    },
    getDashboard: async () => ({ ok: true, available: true, tier, data: null }),
    getProfile: async () => {
      if (throwOnProfile) throw new Error('profile')
      if (!profileOk) return { ok: false, available: true, tier, reason: 'brain_unavailable', data: null }
      return { ok: profileData != null, available: true, tier, reason: null, data: profileData }
    },
    getPlayerCard: async () => ({ ok: false, available: false, tier, data: null }),
    getClubSnapshot: async () => ({ ok: false, available: false, tier, data: null }),
  }
}

const ctx = (over = {}) => ({
  user: { tier: 'professional', coachId: 'coach-99' },
  team: { teamId: 'team-1' },
  squad: fullSquad(),
  ...over,
})

const slot = (r, jersey) => r.bestAvailableXV.find(s => s.jersey === jersey)

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — Types
// ─────────────────────────────────────────────────────────────────────────────

test('SA_ID / SA_VERSION', () => {
  assert.equal(SA_ID, 'selection-assistant')
  assert.equal(SA_VERSION, '1.0')
})

test('POSITIONS — 15 jerseys 1..15', () => {
  assert.equal(POSITIONS.length, 15)
  assert.deepEqual(JERSEYS, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
  assert.ok(Object.isFrozen(COVERAGE) && Object.isFrozen(SEVERITY))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — Subscription gating
// ─────────────────────────────────────────────────────────────────────────────

for (const tier of TIERS_WITH) {
  test(`${tier} tier — available`, async () => {
    const r = await getSelectionAssistant(ctx({ user: { tier, coachId: 'c1' } }), mockCoachAI({ tier }))
    assert.equal(r.available, true)
    assert.equal(r.tier, tier)
  })
}

for (const tier of TIERS_WITHOUT) {
  test(`${tier} tier — blocked`, async () => {
    const r = await getSelectionAssistant(ctx({ user: { tier } }), mockCoachAI({ tier }))
    assert.equal(r.available, false)
    assert.equal(r.ok, false)
    assert.equal(r.reason, 'insufficient_tier')
    assert.ok(r.bestAvailableXV.every(s => s.playerId === null))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — Envelope
// ─────────────────────────────────────────────────────────────────────────────

test('Envelope — all spec fields present', async () => {
  const r = await getSelectionAssistant(ctx({ fixtureId: 'fx-9', generatedAt: '2026-06-13T10:00:00Z' }), mockCoachAI())
  const required = [
    'bestAvailableXV', 'benchBalance', 'missingPositions', 'frontRowCoverage', 'lineoutCoverage',
    'backlineBalance', 'injuryRisks', 'selectionWarnings', 'recommendedChanges', 'confidence',
    'evidenceIds', 'explanation', 'personalisation',
    // envelope
    'productId', 'productVersion', 'ok', 'available', 'tier', 'teamId', 'fixtureId', 'generatedAt',
  ]
  for (const k of required) assert.ok(k in r, `missing ${k}`)
  assert.equal(r.productId, 'selection-assistant')
  assert.equal(r.fixtureId, 'fx-9')
  assert.equal(r.teamId, 'team-1')
  assert.equal(r.bestAvailableXV.length, 15)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — Full-strength squad
// ─────────────────────────────────────────────────────────────────────────────

test('Full-strength — 15 specialist jerseys, all coverage secure', async () => {
  const r = await getSelectionAssistant(ctx(), mockCoachAI())
  assert.equal(r.ok, true)
  assert.equal(r.bestAvailableXV.filter(s => s.playerId).length, 15)
  assert.ok(r.bestAvailableXV.every(s => s.specialist), 'every jersey filled by a specialist')
  assert.ok(r.bestAvailableXV.every(s => !s.outOfPosition))
  assert.equal(r.frontRowCoverage.status, COVERAGE.SECURE)
  assert.equal(r.lineoutCoverage.status, COVERAGE.SECURE)
  assert.equal(r.backlineBalance.status, COVERAGE.SECURE)
  assert.equal(r.benchBalance.status, COVERAGE.SECURE)
  assert.deepEqual(r.missingPositions, [])
  assert.equal(r.selectionWarnings.filter(w => w.severity === SEVERITY.HIGH).length, 0)
})

test('Full-strength — confidence high, evidence from Match Readiness', async () => {
  const r = await getSelectionAssistant(ctx(), mockCoachAI())
  assert.equal(r.confidence, 0.93)
  assert.ok(r.evidenceIds.includes('exp-mr1'))
  assert.ok(r.explanation.includes('15/15'))
})

test('Full-strength — no XV player picked twice', async () => {
  const r = await getSelectionAssistant(ctx(), mockCoachAI())
  const ids = r.bestAvailableXV.map(s => s.playerId)
  assert.equal(ids.length, new Set(ids).size)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — Determinism
// ─────────────────────────────────────────────────────────────────────────────

test('Deterministic — identical output across calls', async () => {
  const a = await getSelectionAssistant(ctx(), mockCoachAI())
  const b = await getSelectionAssistant(ctx(), mockCoachAI())
  assert.deepEqual(a, b)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 6 — Exposed tighthead
// ─────────────────────────────────────────────────────────────────────────────

test('No specialist tighthead — front row exposed, jersey 3 out of position', async () => {
  const squad = fullSquad()
    .filter(p => p.playerId !== 'p3')          // remove specialist THP
    .map(p => (p.playerId === 'p1b' ? { ...p, positions: [1] } : p))  // remove p1b's tighthead cover
  const r = await getSelectionAssistant(ctx({ squad }), mockCoachAI())
  assert.equal(r.frontRowCoverage.tighthead, 0)
  assert.equal(r.frontRowCoverage.status, COVERAGE.EXPOSED)
  assert.equal(slot(r, 3).specialist, false)
  assert.equal(slot(r, 3).outOfPosition, true)
  assert.ok(r.missingPositions.some(m => m.jersey === 3))
  assert.ok(r.selectionWarnings.some(w => w.type === 'front_row' && w.severity === SEVERITY.HIGH))
  assert.ok(r.recommendedChanges.some(c => c.category === 'recruitment'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 7 — No hooker
// ─────────────────────────────────────────────────────────────────────────────

test('No specialist hooker — lineout thrower & front row exposed', async () => {
  const squad = fullSquad().filter(p => p.playerId !== 'h1' && p.playerId !== 'h2')
  const r = await getSelectionAssistant(ctx({ squad }), mockCoachAI())
  assert.equal(r.lineoutCoverage.throwers, 0)
  assert.equal(r.lineoutCoverage.status, COVERAGE.EXPOSED)
  assert.equal(r.frontRowCoverage.status, COVERAGE.EXPOSED)
  assert.ok(r.selectionWarnings.some(w => w.type === 'lineout' && w.message.toLowerCase().includes('throw')))
  assert.ok(r.recommendedChanges.some(c => c.action.toLowerCase().includes('thrower')))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 8 — No fly-half cover
// ─────────────────────────────────────────────────────────────────────────────

test('No specialist fly-half — backline exposed', async () => {
  const squad = fullSquad()
    .filter(p => p.playerId !== 'f10')
    .map(p => (p.playerId === 'f10b' ? { ...p, positions: [12] } : p))
  const r = await getSelectionAssistant(ctx({ squad }), mockCoachAI())
  assert.equal(r.backlineBalance.flyHalf, 0)
  assert.equal(r.backlineBalance.status, COVERAGE.EXPOSED)
  assert.equal(slot(r, 10).outOfPosition, true)
  assert.ok(r.selectionWarnings.some(w => w.type === 'backline'))
  assert.ok(r.recommendedChanges.some(c => c.action.toLowerCase().includes('fly-half')))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 9 — Injuries
// ─────────────────────────────────────────────────────────────────────────────

test('Injured player excluded from selection', async () => {
  const squad = fullSquad().map(p => (p.playerId === 'l4' ? { ...p, status: PLAYER_STATUS.INJURED } : p))
  const r = await getSelectionAssistant(ctx({ squad }), mockCoachAI())
  const ids = r.bestAvailableXV.map(s => s.playerId)
  assert.ok(!ids.includes('l4'), 'injured player not selected')
  assert.ok(r.bestAvailableXV.filter(s => s.playerId).length >= 14)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 10 — Doubtful starter
// ─────────────────────────────────────────────────────────────────────────────

test('Doubtful starter — injury risk + warning raised', async () => {
  const squad = fullSquad()
    .map(p => (p.playerId === 'f10b' ? { ...p, positions: [12] } : p))   // make f10 the only 10
    .map(p => (p.playerId === 'f10' ? { ...p, status: PLAYER_STATUS.DOUBTFUL } : p))
  const r = await getSelectionAssistant(ctx({ squad }), mockCoachAI())
  assert.equal(slot(r, 10).playerId, 'f10')
  assert.ok(r.injuryRisks.some(x => x.reason.includes('doubtful') && x.severity === SEVERITY.HIGH))
  assert.ok(r.selectionWarnings.some(w => w.type === 'doubtful_starter'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 11 — High training load
// ─────────────────────────────────────────────────────────────────────────────

test('High training load — load risk + rotation change', async () => {
  const squad = fullSquad()
    .map(p => (p.playerId === 'f10b' ? { ...p, positions: [12] } : p))   // f10 only specialist 10
    .map(p => (p.playerId === 'f10' ? { ...p, minutesLoad: 92 } : p))
  const r = await getSelectionAssistant(ctx({ squad }), mockCoachAI())
  assert.equal(slot(r, 10).playerId, 'f10')
  assert.ok(r.injuryRisks.some(x => x.source === 'load' && x.severity === SEVERITY.MEDIUM))
  assert.ok(r.recommendedChanges.some(c => c.category === 'rotation' && c.action.includes('resting')))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 12 — Under-strength squad
// ─────────────────────────────────────────────────────────────────────────────

test('Under-strength squad (<15) — size warning + missing positions', async () => {
  const squad = fullSquad().slice(0, 12)
  const r = await getSelectionAssistant(ctx({ squad }), mockCoachAI())
  assert.equal(r.ok, true)
  assert.ok(r.selectionWarnings.some(w => w.type === 'squad_size' && w.severity === SEVERITY.HIGH))
  assert.ok(r.missingPositions.length > 0)
  assert.ok(r.bestAvailableXV.some(s => s.playerId === null))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 13 — Match Readiness injury concerns
// ─────────────────────────────────────────────────────────────────────────────

test('Match Readiness injury concerns surface with evidence', async () => {
  const mrData = { ...clone(MR_DATA), injuryConcerns: [{ source: 'policy', type: 'Medical', summary: 'Captain calf strain', recommendationId: 'rec-cap' }] }
  const r = await getSelectionAssistant(ctx(), mockCoachAI({ mrData }))
  assert.ok(r.injuryRisks.some(x => x.reason === 'Captain calf strain' && x.severity === SEVERITY.HIGH))
  assert.ok(r.evidenceIds.includes('rec-cap'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 14 — Missing squad
// ─────────────────────────────────────────────────────────────────────────────

test('Missing squad — graceful empty, available but not ok', async () => {
  const r = await getSelectionAssistant({ user: { tier: 'professional', coachId: 'c1' }, team: { teamId: 'team-1' }, squad: null }, mockCoachAI())
  assert.equal(r.available, true)
  assert.equal(r.ok, false)
  assert.ok(r.bestAvailableXV.every(s => s.playerId === null))
  assert.equal(r.missingPositions.length, 15)
  assert.equal(r.confidence, 0)
  assert.equal(r.frontRowCoverage.status, COVERAGE.UNKNOWN)
})

test('Empty squad array — graceful, not ok', async () => {
  const r = await getSelectionAssistant(ctx({ squad: [] }), mockCoachAI())
  assert.equal(r.ok, false)
  assert.equal(r.confidence, 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 15 — Feature flag
// ─────────────────────────────────────────────────────────────────────────────

test('Feature flag disabled — unavailable (feature_disabled)', async () => {
  const r = await getSelectionAssistant(
    ctx({ user: { tier: 'professional', coachId: 'c1', flags: { 'ai.selectionAssistant': false } } }),
    mockCoachAI(),
  )
  assert.equal(r.available, false)
  assert.equal(r.reason, 'feature_disabled')
})

test('Feature flag absent — enabled by default', async () => {
  const r = await getSelectionAssistant(ctx({ user: { tier: 'professional', coachId: 'c1', flags: {} } }), mockCoachAI())
  assert.equal(r.available, true)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 16 — No coach profile fallback
// ─────────────────────────────────────────────────────────────────────────────

test('No coach profile — personalisation off, XV unaffected', async () => {
  const none = await getSelectionAssistant(ctx(), mockCoachAI({ profileData: null }))
  const thin = await getSelectionAssistant(ctx(), mockCoachAI({ profileData: { ...clone(RICH_PROFILE), observationCount: 1 } }))
  assert.equal(none.personalisation.applied, false)
  assert.equal(thin.personalisation.applied, false)
  assert.deepEqual(none.bestAvailableXV, thin.bestAvailableXV)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 17 — Personalisation: EMPHASIS ONLY
// ─────────────────────────────────────────────────────────────────────────────

// Squad yielding recommendedChanges = [development (fly-half), rotation (rest f10)]
function squadPers() {
  return fullSquad()
    .map(p => (p.playerId === 'f10b' ? { ...p, positions: [12] } : p))   // flyHalf=1 → development change
    .map(p => (p.playerId === 'f10' ? { ...p, minutesLoad: 92 } : p))    // selected high-load → rotation change
}

test('Personalisation — applied with rich profile', async () => {
  const r = await getSelectionAssistant(ctx({ squad: squadPers() }), mockCoachAI({ profileData: clone(RICH_PROFILE) }))
  assert.equal(r.personalisation.applied, true)
  assert.equal(r.personalisation.coachProfileId, 'coach-99')
  assert.ok(r.personalisation.signalsUsed.includes('squadRotation'))
})

test('Personalisation — re-orders recommendedChanges (rotation surfaced for high-rotation coach)', async () => {
  const plain = await getSelectionAssistant(ctx({ squad: squadPers() }), mockCoachAI({ profileData: null }))
  const pers  = await getSelectionAssistant(ctx({ squad: squadPers() }), mockCoachAI({ profileData: clone(RICH_PROFILE) }))
  assert.equal(plain.recommendedChanges[0].category, 'development')
  assert.equal(pers.recommendedChanges[0].category, 'rotation')
})

test('Personalisation — XV, coverage, confidence are IDENTICAL (emphasis only)', async () => {
  const plain = await getSelectionAssistant(ctx({ squad: squadPers() }), mockCoachAI({ profileData: null }))
  const pers  = await getSelectionAssistant(ctx({ squad: squadPers() }), mockCoachAI({ profileData: clone(RICH_PROFILE) }))
  assert.deepEqual(pers.bestAvailableXV, plain.bestAvailableXV)
  assert.deepEqual(pers.frontRowCoverage, plain.frontRowCoverage)
  assert.deepEqual(pers.lineoutCoverage, plain.lineoutCoverage)
  assert.deepEqual(pers.backlineBalance, plain.backlineBalance)
  assert.deepEqual(pers.benchBalance, plain.benchBalance)
  assert.deepEqual(pers.missingPositions, plain.missingPositions)
  assert.equal(pers.confidence, plain.confidence)
})

test('Personalisation — recommendedChanges set unchanged, only order differs', async () => {
  const plain = await getSelectionAssistant(ctx({ squad: squadPers() }), mockCoachAI({ profileData: null }))
  const pers  = await getSelectionAssistant(ctx({ squad: squadPers() }), mockCoachAI({ profileData: clone(RICH_PROFILE) }))
  const setOf = (a) => a.map(c => c.action).sort()
  assert.deepEqual(setOf(pers.recommendedChanges), setOf(plain.recommendedChanges))
})

test('Personalisation — CoachProfile never mutated', async () => {
  const profile = clone(RICH_PROFILE)
  const snap = clone(profile)
  await getSelectionAssistant(ctx({ squad: squadPers() }), mockCoachAI({ profileData: profile }))
  assert.deepEqual(profile, snap)
})

test('Personalisation — flag off disables even with rich profile', async () => {
  const r = await getSelectionAssistant(
    ctx({ squad: squadPers(), user: { tier: 'professional', coachId: 'coach-99', flags: { 'ai.personalisation': false } } }),
    mockCoachAI({ profileData: clone(RICH_PROFILE) }),
  )
  assert.equal(r.personalisation.applied, false)
})

test('reorderChanges — pure, does not mutate input', () => {
  const changes = [
    { rank: 1, action: 'A', priority: 'medium', category: 'development' },
    { rank: 2, action: 'B', priority: 'medium', category: 'rotation' },
  ]
  const copy = clone(changes)
  reorderChanges(changes, clone(RICH_PROFILE))
  assert.deepEqual(changes, copy)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 18 — Never throws
// ─────────────────────────────────────────────────────────────────────────────

test('Never throws — null/undefined/empty context', async () => {
  await assert.doesNotReject(() => getSelectionAssistant(null))
  await assert.doesNotReject(() => getSelectionAssistant(undefined))
  await assert.doesNotReject(() => getSelectionAssistant({}))
})

test('Never throws — getCapabilities throws', async () => {
  await assert.doesNotReject(() => getSelectionAssistant(ctx(), mockCoachAI({ throwOnCaps: true })))
})

test('Never throws — getMatchReadiness throws → brain_unavailable', async () => {
  const r = await getSelectionAssistant(ctx(), mockCoachAI({ throwOnMR: true }))
  assert.equal(r.reason, 'brain_unavailable')
  assert.equal(r.available, true)
})

test('Never throws — getProfile throws → report intact', async () => {
  const r = await getSelectionAssistant(ctx(), mockCoachAI({ throwOnProfile: true }))
  assert.equal(r.personalisation.applied, false)
  assert.equal(r.bestAvailableXV.filter(s => s.playerId).length, 15)
})

test('Never throws — no team (no Match Readiness context)', async () => {
  const r = await getSelectionAssistant({ user: { tier: 'professional', coachId: 'c1' }, team: null, squad: fullSquad() }, mockCoachAI())
  assert.equal(r.available, true)
  assert.equal(r.bestAvailableXV.filter(s => s.playerId).length, 15)
})

test('Never throws — real CoachAI (integration, Brain not seeded)', async () => {
  await assert.doesNotReject(() =>
    getSelectionAssistant({ user: { tier: 'performance', coachId: 'c1' }, team: { teamId: 't1' }, squad: fullSquad() }))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 19 — Structural contract
// ─────────────────────────────────────────────────────────────────────────────

test('Product imports only the integration layer (+pure learning constants); no Brain internals, no Core', async () => {
  const { readFileSync } = await import('node:fs')
  const files = ['selection-assistant.js', 'personaliser.js', 'selection-assistant-types.js', 'index.js']
  const forbidden = [
    'ai-brain/workflow', 'ai-brain/memory', 'ai-brain/api', 'ai-brain/products',
    'ai-brain/policy', 'ai-brain/planning', 'ai-brain/reasoning', 'ai-brain/observation',
    'ai-brain/explain', 'ai-brain/calibrat', 'ai-brain/timeline',
    'index.html', '/core/', 'auth', 'match-centre', 'messaging',
  ]
  for (const f of files) {
    const src = readFileSync(new URL(`../coach-products/selection-assistant/${f}`, import.meta.url), 'utf8')
    for (const path of forbidden) assert.ok(!src.includes(path), `${f} must not reference ${path}`)
  }
  const main = readFileSync(new URL('../coach-products/selection-assistant/selection-assistant.js', import.meta.url), 'utf8')
  assert.ok(main.includes('ai-brain/integration'), 'main must import the integration layer')
})

test('emptyPersonalisation — stable empty shape', () => {
  const p = emptyPersonalisation()
  assert.equal(p.applied, false)
  assert.deepEqual(p.signalsUsed, [])
  assert.notEqual(emptyPersonalisation(), p)
})
