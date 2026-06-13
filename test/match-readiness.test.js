/**
 * Coach Products — M21 Match Readiness Intelligence Tests
 *
 * Coverage:
 *  1. Types & constants
 *  2. Subscription gating (free/starter blocked; performance/professional/club/enterprise allowed)
 *  3. Response envelope shape (full field contract)
 *  4. Deterministic scoring — normal match week (exact values)
 *  5. Poor availability
 *  6. Injury concern
 *  7. High training load
 *  8. Weak cohesion
 *  9. Missing-data fallback (null brain data, no teamId)
 * 10. No-coach-profile fallback (behaviour identical to un-personalised)
 * 11. Personalisation changes EMPHASIS ONLY (scores never change; profile never mutates)
 * 12. Feature flag disabled
 * 13. Never throws
 * 14. Structural contract — no Brain internals, no Core imports
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  MR_ID, MR_VERSION, SELECTION_RISK, LOAD_STATUS, SEVERITY, VERDICT, MR_FIELD,
} from '../coach-products/match-readiness/match-readiness-types.js'
import { getMatchReadiness } from '../coach-products/match-readiness/match-readiness.js'
import {
  reorderTrainingFocus, emptyPersonalisation,
} from '../coach-products/match-readiness/personaliser.js'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const TIERS_WITH_MR    = ['performance', 'professional', 'club', 'enterprise']
const TIERS_WITHOUT_MR  = ['free', 'starter']

function makeCaps(tier, overrides = {}) {
  const hasMR    = TIERS_WITH_MR.includes(tier)
  const hasBrief = ['starter', 'performance', 'professional', 'enterprise'].includes(tier)
  return {
    integrationVersion: '1.0',
    tier,
    isEnabled: tier !== 'free',
    features: {
      dashboard:      tier !== 'free',
      weeklyBrief:    hasBrief,
      matchReadiness: hasMR,
      playerCard:     ['performance', 'professional', 'enterprise'].includes(tier),
      clubSnapshot:   ['professional', 'club', 'enterprise'].includes(tier),
      ...overrides.features,
    },
    availableProducts: [],
    upgradeAvailable:  tier === 'free',
    limitations:       tier === 'free' ? ['Upgrade to unlock AI'] : [],
    reason:            tier === 'free' ? 'insufficient_tier' : null,
    ...overrides,
  }
}

const READ_NORMAL = {
  teamId:            'team-1',
  squadReadinessPct: 85,
  availabilityPct:   90,
  injuryConcerns:    [],
  trainingCompletion:{ total: 8, estimatedMinutes: 220 },   // 92% → on_track
  preparationChecklist: [
    { planId: 'p1', title: 'Tactical walkthrough', status: 'done' },
    { planId: 'p2', title: 'Set-piece rehearsal',  status: 'done' },
    { planId: 'p3', title: 'Fitness test',         status: 'pending' },
  ],
  missingActions:    [],
  explanationIds:    ['exp-r1'],
  confidence:        78,
  isMock:            false,
}

const DASH_NORMAL = {
  topPriorities:  [{ rank: 1, title: 'Confirm squad', category: 'selection', urgency: 'medium', action: 'Pick XI', evidenceId: 'exp-d1' }],
  biggestRisks:   [],
  medicalSummary: { total: 0, concerns: [] },
  recommendedActions: [
    { rank: 1, action: 'Confirm match day squad', category: 'selection', priority: 'medium', done: false, evidenceId: 'exp-d1' },
  ],
  explanationIds: ['exp-d1'],
  confidence:     0.8,
  isMock:         false,
}

const RICH_PROFILE = {
  coachId:           'coach-99',
  profileVersion:    '1.0',
  observationCount:  15,
  overallConfidence: 0.71,
  preferences: {
    coachingStyle:      { value: 'directive',  confidence: 0.8 },
    trainingEmphasis:   { value: 'tactical',   confidence: 0.7 },
    squadRotation:      { value: 'low',        confidence: 0.6 },
    communicationStyle: { value: 'nurturing',  confidence: 0.9 },
    riskTolerance:      { value: 'low',        confidence: 0.5 },
    workloadPreference: { value: 'moderate',   confidence: 0.6 },
  },
  recommendationHistory: {
    accepted: 8, rejected: 2, ignored: 2, edited: 1,
    byCategory: {
      injury:      { accepted: 4, rejected: 0, ignored: 0 },
      availability:{ accepted: 3, rejected: 1, ignored: 0 },
      selection:   { accepted: 1, rejected: 1, ignored: 1 },
    },
  },
}

function clone(o) { return JSON.parse(JSON.stringify(o)) }

function mockCoachAI({
  tier = 'professional', caps = null,
  readData = READ_NORMAL, readOk = true,
  dashData = DASH_NORMAL, dashOk = true,
  profileData = null, profileOk = true,
  throwOnCaps = false, throwOnRead = false, throwOnProfile = false,
} = {}) {
  return {
    getCapabilities: async () => { if (throwOnCaps) throw new Error('caps'); return caps ?? makeCaps(tier) },
    getMatchReadiness: async () => {
      if (throwOnRead) throw new Error('read')
      return { integrationVersion: '1.0', ok: readOk, available: true, tier, reason: readOk ? null : 'brain_unavailable', data: readData }
    },
    getDashboard: async () => ({ integrationVersion: '1.0', ok: dashOk, available: true, tier, reason: null, data: dashData }),
    getProfile: async () => {
      if (throwOnProfile) throw new Error('profile')
      if (!profileOk) return { integrationVersion: '1.0', ok: false, available: true, tier, reason: 'brain_unavailable', data: null }
      return { integrationVersion: '1.0', ok: profileData != null, available: true, tier, reason: null, data: profileData }
    },
    getPlayerCard:   async () => ({ ok: false, available: false, tier, reason: 'insufficient_tier', data: null }),
    getClubSnapshot: async () => ({ ok: false, available: false, tier, reason: 'insufficient_tier', data: null }),
  }
}

const ctx = (over = {}) => ({ user: { tier: 'professional', coachId: 'coach-99' }, team: { teamId: 'team-1' }, ...over })

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — Types
// ─────────────────────────────────────────────────────────────────────────────

test('MR_ID / MR_VERSION', () => {
  assert.equal(MR_ID, 'match-readiness')
  assert.equal(MR_VERSION, '2.0')
})

test('SELECTION_RISK, LOAD_STATUS, VERDICT frozen with expected members', () => {
  assert.equal(SELECTION_RISK.HIGH, 'high')
  assert.equal(SELECTION_RISK.UNKNOWN, 'unknown')
  assert.equal(LOAD_STATUS.AT_RISK, 'at_risk')
  assert.equal(VERDICT.READY, 'ready')
  assert.equal(VERDICT.INSUFFICIENT_DATA, 'insufficient_data')
  assert.ok(Object.isFrozen(SELECTION_RISK) && Object.isFrozen(VERDICT) && Object.isFrozen(MR_FIELD))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — Subscription gating
// ─────────────────────────────────────────────────────────────────────────────

for (const tier of TIERS_WITH_MR) {
  test(`${tier} tier — available=true`, async () => {
    const r = await getMatchReadiness(ctx({ user: { tier, coachId: 'c1' } }), mockCoachAI({ tier }))
    assert.equal(r.available, true)
    assert.equal(r.tier, tier)
  })
}

for (const tier of TIERS_WITHOUT_MR) {
  test(`${tier} tier — blocked (available=false, reason=insufficient_tier)`, async () => {
    const r = await getMatchReadiness(ctx({ user: { tier } }), mockCoachAI({ tier }))
    assert.equal(r.available, false)
    assert.equal(r.ok, false)
    assert.equal(r.reason, 'insufficient_tier')
    assert.equal(r.overallScore, null)
  })
}

test('subscription blocked — full envelope still valid (safe to render)', async () => {
  const r = await getMatchReadiness(ctx({ user: { tier: 'starter' } }), mockCoachAI({ tier: 'starter' }))
  assert.equal(r.selectionRisk, SELECTION_RISK.UNKNOWN)
  assert.equal(r.verdict, VERDICT.INSUFFICIENT_DATA)
  assert.deepEqual(r.keyConcerns, [])
  assert.ok(Array.isArray(r.recommendedActions))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — Envelope shape
// ─────────────────────────────────────────────────────────────────────────────

test('Envelope — all spec fields present', async () => {
  const r = await getMatchReadiness(ctx({ fixtureId: 'fx-1', generatedAt: '2026-06-13T09:00:00Z' }), mockCoachAI())
  const required = [
    'productId', 'productVersion', 'ok', 'available', 'tier', 'teamId', 'fixtureId', 'generatedAt',
    'overallScore', 'confidence', 'availabilityScore', 'fitnessScore', 'cohesionScore',
    'selectionRisk', 'trainingLoadStatus', 'keyConcerns', 'criticalPlayers',
    'recommendedActions', 'trainingFocus', 'evidenceIds', 'explanation', 'personalisation', 'limitations',
  ]
  for (const k of required) assert.ok(k in r, `missing ${k}`)
  assert.equal(r.productId, 'match-readiness')
  assert.equal(r.teamId, 'team-1')
  assert.equal(r.fixtureId, 'fx-1')
  assert.equal(r.generatedAt, '2026-06-13T09:00:00Z')
})

test('Envelope — personalisation block well-formed when no profile', async () => {
  const r = await getMatchReadiness(ctx(), mockCoachAI({ profileData: null }))
  assert.equal(r.personalisation.applied, false)
  assert.deepEqual(r.personalisation.signalsUsed, [])
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — Normal match week (exact deterministic scoring)
// ─────────────────────────────────────────────────────────────────────────────

test('Normal match week — exact component scores', async () => {
  const r = await getMatchReadiness(ctx(), mockCoachAI())
  assert.equal(r.availabilityScore, 90)
  assert.equal(r.fitnessScore, 92)
  assert.equal(r.cohesionScore, 76)
  assert.equal(r.overallScore, 87)
  assert.equal(r.confidence, 0.87)
  assert.equal(r.selectionRisk, SELECTION_RISK.LOW)
  assert.equal(r.trainingLoadStatus, LOAD_STATUS.ON_TRACK)
  assert.equal(r.verdict, VERDICT.READY)
})

test('Normal match week — deterministic across repeated calls', async () => {
  const a = await getMatchReadiness(ctx(), mockCoachAI())
  const b = await getMatchReadiness(ctx(), mockCoachAI())
  assert.deepEqual(a, b)
})

test('Normal match week — clean: no key concerns, evidence collected', async () => {
  const r = await getMatchReadiness(ctx(), mockCoachAI())
  assert.deepEqual(r.keyConcerns, [])
  assert.ok(r.evidenceIds.includes('exp-r1'))
  assert.ok(r.evidenceIds.includes('exp-d1'))
  assert.equal(r.evidenceIds.length, new Set(r.evidenceIds).size)   // deduped
  assert.ok(r.explanation.includes('ready'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — Poor availability
// ─────────────────────────────────────────────────────────────────────────────

test('Poor availability — score drops, risk rises, concern raised', async () => {
  const readData = { ...clone(READ_NORMAL), availabilityPct: 45 }
  const r = await getMatchReadiness(ctx(), mockCoachAI({ readData }))
  assert.equal(r.availabilityScore, 45)
  assert.equal(r.selectionRisk, SELECTION_RISK.MEDIUM)
  assert.equal(r.verdict, VERDICT.READY_WITH_RISKS)
  const concern = r.keyConcerns.find(c => c.type === 'availability')
  assert.ok(concern)
  assert.equal(concern.severity, SEVERITY.HIGH)   // 45 < 55
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 6 — Injury concern
// ─────────────────────────────────────────────────────────────────────────────

test('Injury concern — fitness penalty, critical players, high-severity concerns', async () => {
  const readData = {
    ...clone(READ_NORMAL),
    injuryConcerns: [
      { source: 'policy', type: 'Medical', summary: 'Striker hamstring strain', recommendationId: 'rec-inj1' },
      { source: 'observation', type: 'injury', summary: 'Keeper knee soreness' },
    ],
  }
  const r = await getMatchReadiness(ctx(), mockCoachAI({ readData }))
  assert.equal(r.fitnessScore, 92 - 24)   // 2 × 12 penalty
  assert.equal(r.criticalPlayers.length, 2)
  const injuryConcerns = r.keyConcerns.filter(c => c.type === 'injury')
  assert.equal(injuryConcerns.length, 2)
  assert.ok(injuryConcerns.every(c => c.severity === SEVERITY.HIGH))
  assert.ok(r.evidenceIds.includes('rec-inj1'))
  assert.notEqual(r.selectionRisk, SELECTION_RISK.LOW)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 7 — High training load
// ─────────────────────────────────────────────────────────────────────────────

test('High training load — at_risk status, high-severity concern, physical focus', async () => {
  const readData = { ...clone(READ_NORMAL), trainingCompletion: { total: 8, estimatedMinutes: 60 } } // 25%
  const r = await getMatchReadiness(ctx(), mockCoachAI({ readData }))
  assert.equal(r.trainingLoadStatus, LOAD_STATUS.AT_RISK)
  const concern = r.keyConcerns.find(c => c.type === 'training_load')
  assert.ok(concern && concern.severity === SEVERITY.HIGH)
  const focus = r.trainingFocus.find(f => f.emphasis === 'physical')
  assert.ok(focus)
  assert.ok(r.recommendedActions.some(a => a.category === 'training'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 8 — Weak cohesion
// ─────────────────────────────────────────────────────────────────────────────

test('Weak cohesion — low cohesion score and concern', async () => {
  const readData = {
    ...clone(READ_NORMAL),
    squadReadinessPct: 40,
    preparationChecklist: [
      { planId: 'p1', title: 'A', status: 'pending' },
      { planId: 'p2', title: 'B', status: 'pending' },
      { planId: 'p3', title: 'C', status: 'pending' },
    ],
    missingActions: [
      { planId: 'p2', title: 'B', suggestedDate: '2026-06-10', planStatus: 'todo', overdue: false },
      { planId: 'p3', title: 'C', suggestedDate: '2026-06-11', planStatus: 'todo', overdue: false },
    ],
  }
  const r = await getMatchReadiness(ctx(), mockCoachAI({ readData }))
  assert.ok(r.cohesionScore < 50)
  const concern = r.keyConcerns.find(c => c.type === 'cohesion')
  assert.ok(concern && concern.severity === SEVERITY.HIGH)
  assert.ok(r.trainingFocus.some(f => f.emphasis === 'tactical'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 9 — Missing data fallback
// ─────────────────────────────────────────────────────────────────────────────

test('Missing brain data — null scores, insufficient_data, still available & safe', async () => {
  const r = await getMatchReadiness(ctx(), mockCoachAI({ readData: null, readOk: false, dashData: null, dashOk: false }))
  assert.equal(r.available, true)
  assert.equal(r.ok, false)
  assert.equal(r.overallScore, null)
  assert.equal(r.availabilityScore, null)
  assert.equal(r.fitnessScore, null)
  assert.equal(r.cohesionScore, null)
  assert.equal(r.selectionRisk, SELECTION_RISK.UNKNOWN)
  assert.equal(r.verdict, VERDICT.INSUFFICIENT_DATA)
  assert.equal(r.confidence, 0)
  assert.deepEqual(r.keyConcerns, [])
  assert.equal(r.isMock, true)
})

test('Missing teamId — invalid_input, available, empty', async () => {
  const r = await getMatchReadiness({ user: { tier: 'professional', coachId: 'c1' }, team: null }, mockCoachAI())
  assert.equal(r.available, true)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'invalid_input')
  assert.equal(r.teamId, null)
  assert.equal(r.overallScore, null)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 10 — No coach profile fallback
// ─────────────────────────────────────────────────────────────────────────────

test('No coach profile — identical output to un-personalised path', async () => {
  const withNullProfile  = await getMatchReadiness(ctx(), mockCoachAI({ profileData: null }))
  const profileBelowMin  = await getMatchReadiness(ctx(), mockCoachAI({ profileData: { ...clone(RICH_PROFILE), observationCount: 1 } }))
  assert.equal(withNullProfile.personalisation.applied, false)
  assert.equal(profileBelowMin.personalisation.applied, false)
  // scores identical
  for (const k of ['overallScore', 'availabilityScore', 'fitnessScore', 'cohesionScore', 'selectionRisk', 'trainingLoadStatus']) {
    assert.equal(withNullProfile[k], profileBelowMin[k])
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 11 — Personalisation changes EMPHASIS ONLY
// ─────────────────────────────────────────────────────────────────────────────

// A fixture that yields trainingFocus = [physical(behind), tactical(cohesion), technical]
const READ_PERS = {
  ...clone(READ_NORMAL),
  squadReadinessPct: 60,
  trainingCompletion: { total: 8, estimatedMinutes: 150 },   // 63% → behind → physical focus first
  preparationChecklist: [
    { planId: 'p1', title: 'A', status: 'done' },
    { planId: 'p2', title: 'B', status: 'pending' },
    { planId: 'p3', title: 'C', status: 'pending' },
  ],
}

test('Personalisation — applied=true with rich profile, metadata correct', async () => {
  const r = await getMatchReadiness(ctx(), mockCoachAI({ readData: READ_PERS, profileData: clone(RICH_PROFILE) }))
  assert.equal(r.personalisation.applied, true)
  assert.equal(r.personalisation.coachProfileId, 'coach-99')
  assert.ok(r.personalisation.signalsUsed.includes('trainingEmphasis'))
  assert.ok(r.personalisation.explanation.length > 0)
})

test('Personalisation — re-orders training focus (emphasis surfaced first)', async () => {
  const plain = await getMatchReadiness(ctx(), mockCoachAI({ readData: READ_PERS, profileData: null }))
  const pers  = await getMatchReadiness(ctx(), mockCoachAI({ readData: READ_PERS, profileData: clone(RICH_PROFILE) }))
  assert.equal(plain.trainingFocus[0].emphasis, 'physical')   // load-driven default order
  assert.equal(pers.trainingFocus[0].emphasis, 'tactical')    // coach prefers tactical → surfaced
})

test('Personalisation — scores are IDENTICAL (emphasis only, never changes numbers)', async () => {
  const plain = await getMatchReadiness(ctx(), mockCoachAI({ readData: READ_PERS, profileData: null }))
  const pers  = await getMatchReadiness(ctx(), mockCoachAI({ readData: READ_PERS, profileData: clone(RICH_PROFILE) }))
  for (const k of ['overallScore', 'confidence', 'availabilityScore', 'fitnessScore',
                   'cohesionScore', 'selectionRisk', 'trainingLoadStatus', 'verdict']) {
    assert.equal(pers[k], plain[k], `score field ${k} must not change`)
  }
})

test('Personalisation — training focus set unchanged, only order differs', async () => {
  const plain = await getMatchReadiness(ctx(), mockCoachAI({ readData: READ_PERS, profileData: null }))
  const pers  = await getMatchReadiness(ctx(), mockCoachAI({ readData: READ_PERS, profileData: clone(RICH_PROFILE) }))
  const setOf = (arr) => arr.map(f => f.focus).sort()
  assert.deepEqual(setOf(pers.trainingFocus), setOf(plain.trainingFocus))
  assert.equal(pers.trainingFocus.length, plain.trainingFocus.length)
})

test('Personalisation — CoachProfile is never mutated', async () => {
  const profile = clone(RICH_PROFILE)
  const snapshot = clone(profile)
  await getMatchReadiness(ctx(), mockCoachAI({ readData: READ_PERS, profileData: profile }))
  assert.deepEqual(profile, snapshot)
})

test('Personalisation — flag off disables it even with rich profile', async () => {
  const r = await getMatchReadiness(
    { user: { tier: 'professional', coachId: 'coach-99', flags: { 'ai.personalisation': false } }, team: { teamId: 'team-1' } },
    mockCoachAI({ readData: READ_PERS, profileData: clone(RICH_PROFILE) }),
  )
  assert.equal(r.personalisation.applied, false)
})

test('Personalisation — getProfile throwing leaves report intact', async () => {
  const r = await getMatchReadiness(ctx(), mockCoachAI({ throwOnProfile: true }))
  assert.equal(r.personalisation.applied, false)
  assert.equal(r.overallScore, 87)   // unchanged normal score
})

test('reorderTrainingFocus — pure: does not mutate input array', () => {
  const focus = [
    { focus: 'Physical conditioning', emphasis: 'physical' },
    { focus: 'Team shape', emphasis: 'tactical' },
  ]
  const copy = clone(focus)
  reorderTrainingFocus(focus, clone(RICH_PROFILE))
  assert.deepEqual(focus, copy)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 12 — Feature flag disabled
// ─────────────────────────────────────────────────────────────────────────────

test('Feature flag disabled — product returns unavailable (feature_disabled)', async () => {
  const r = await getMatchReadiness(
    { user: { tier: 'professional', coachId: 'c1', flags: { 'ai.matchReadiness': false } }, team: { teamId: 'team-1' } },
    mockCoachAI(),
  )
  assert.equal(r.available, false)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'feature_disabled')
  assert.equal(r.overallScore, null)
})

test('Feature flag absent — enabled by default', async () => {
  const r = await getMatchReadiness(ctx({ user: { tier: 'professional', coachId: 'c1', flags: {} } }), mockCoachAI())
  assert.equal(r.available, true)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 13 — Never throws
// ─────────────────────────────────────────────────────────────────────────────

test('Never throws — null/undefined/empty context', async () => {
  await assert.doesNotReject(() => getMatchReadiness(null))
  await assert.doesNotReject(() => getMatchReadiness(undefined))
  await assert.doesNotReject(() => getMatchReadiness({}))
})

test('Never throws — getCapabilities throws', async () => {
  await assert.doesNotReject(() => getMatchReadiness(ctx(), mockCoachAI({ throwOnCaps: true })))
})

test('Never throws — getMatchReadiness throws → brain_unavailable fallback', async () => {
  const r = await getMatchReadiness(ctx(), mockCoachAI({ throwOnRead: true }))
  assert.equal(r.reason, 'brain_unavailable')
  assert.equal(r.available, true)
  assert.equal(r.overallScore, null)
})

test('Never throws — real CoachAI (integration, Brain not seeded)', async () => {
  await assert.doesNotReject(() =>
    getMatchReadiness({ user: { tier: 'performance', coachId: 'c1' }, team: { teamId: 't1' } }))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 14 — Structural contract: no Brain internals, no Core imports
// ─────────────────────────────────────────────────────────────────────────────

test('Product imports only the integration layer (+pure learning constants) — no Brain internals, no Core', async () => {
  const { readFileSync } = await import('node:fs')
  const files = ['match-readiness.js', 'personaliser.js', 'match-readiness-types.js', 'index.js']
  const forbidden = [
    'ai-brain/workflow', 'ai-brain/memory', 'ai-brain/api', 'ai-brain/products',
    'ai-brain/policy', 'ai-brain/planning', 'ai-brain/reasoning', 'ai-brain/observation',
    'ai-brain/explain', 'ai-brain/calibrat', 'ai-brain/timeline',
    // Core surfaces — must never be referenced by an AI product
    'index.html', '/core/', 'auth', 'match-centre', 'messaging',
  ]
  for (const f of files) {
    const src = readFileSync(new URL(`../coach-products/match-readiness/${f}`, import.meta.url), 'utf8')
    for (const path of forbidden) {
      assert.ok(!src.includes(path), `${f} must not reference ${path}`)
    }
  }
  const main = readFileSync(new URL('../coach-products/match-readiness/match-readiness.js', import.meta.url), 'utf8')
  assert.ok(main.includes('ai-brain/integration'), 'main must import the integration layer')
})

test('emptyPersonalisation — stable empty shape', () => {
  const p = emptyPersonalisation()
  assert.equal(p.applied, false)
  assert.equal(p.coachProfileId, null)
  assert.deepEqual(p.signalsUsed, [])
  assert.notEqual(emptyPersonalisation(), p)   // fresh object each call
})
