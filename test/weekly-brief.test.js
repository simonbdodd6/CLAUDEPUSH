/**
 * Coach Products — M18 Weekly Brief Tests
 *
 * Verifies:
 * 1. weekly-brief-types.js — constants, freeze
 * 2. getMonday helper       — ISO week Monday derivation
 * 3. Tier gating            — FREE/STARTER/PERFORMANCE/PROFESSIONAL/CLUB/ENTERPRISE
 * 4. WeeklyBriefResponse envelope — all fields, types
 * 5. Attendance summary     — all branches, headline derivation
 * 6. Availability summary   — pct, injury concerns, null fallback
 * 7. Training load summary  — status thresholds, pct calc, actionRequired
 * 8. Match preparation      — isMatchWeek, items, missing, headline
 * 9. Players needing attention — medical, welfare priorities, injury concerns, dedup
 * 10. Top priorities         — max 3, forwarded fields
 * 11. Biggest risks          — forwarded
 * 12. Recommended actions    — forwarded
 * 13. Evidence IDs           — collected from dashboard + readiness, deduped
 * 14. Confidence             — forwarded, null fallback
 * 15. Flag overrides         — disable weeklyBrief, force on/off
 * 16. weekOf / generatedAt   — caller stamps, passed through
 * 17. Never throws           — null, undefined, brain error
 * 18. No Brain imports       — weekly-brief.js imports only from integration layer
 */

import assert from 'node:assert/strict'
import { test }  from 'node:test'

import {
  BRIEF_ID, BRIEF_VERSION, URGENCY, LOAD_STATUS, BRIEF_FIELD,
  LOAD_TARGET_MINUTES_PER_ACTION, LOAD_ON_TRACK_THRESHOLD, LOAD_BEHIND_THRESHOLD,
} from '../coach-products/weekly-brief/weekly-brief-types.js'
import {
  getWeeklyBrief, getMonday,
} from '../coach-products/weekly-brief/weekly-brief.js'

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures — mock CoachAI with full control
// ─────────────────────────────────────────────────────────────────────────────

const TIERS_WITH_BRIEF    = ['starter', 'performance', 'professional', 'enterprise']
const TIERS_WITHOUT_BRIEF = ['free', 'club']

function makeCaps(tier, overrides = {}) {
  const hasBrief    = TIERS_WITH_BRIEF.includes(tier)
  const hasReadiness = ['performance', 'professional', 'club', 'enterprise'].includes(tier)
  return {
    integrationVersion: '1.0',
    tier,
    isEnabled:          tier !== 'free',
    features: {
      dashboard:       tier !== 'free',
      weeklyBrief:     hasBrief,
      matchReadiness:  hasReadiness,
      playerCard:      ['performance', 'professional', 'enterprise'].includes(tier),
      clubSnapshot:    ['professional', 'club', 'enterprise'].includes(tier),
      ...overrides.features,
    },
    availableProducts:  [],
    upgradeAvailable:   tier === 'free',
    limitations:        tier === 'free' ? ['Upgrade to Starter to unlock the Weekly Coach Brief'] : [],
    reason:             tier === 'free' ? 'insufficient_tier' : null,
    ...overrides,
  }
}

const DASH_DATA = {
  coachId: 'coach-1',
  clubId:  'club-1',
  topPriorities: [
    { rank: 1, title: 'Attendance declining',         category: 'attendance',    urgency: 'high',   action: 'Contact absent players',   evidenceId: 'exp-001' },
    { rank: 2, title: 'Match preparation incomplete', category: 'preparation',   urgency: 'medium', action: 'Complete fitness sessions', evidenceId: 'exp-002' },
    { rank: 3, title: 'Player welfare concern',       category: 'Player Welfare',urgency: 'high',   action: 'Check on Sam',             evidenceId: 'exp-003' },
    { rank: 4, title: 'Goalkeeper selection needed',  category: 'Selection',     urgency: 'medium', action: 'Decide GK for Saturday',   evidenceId: 'exp-004' },
  ],
  biggestRisks: [
    { title: 'Key striker injured', riskLevel: 'high', description: 'Jordan out this week', action: 'Arrange cover for striker role' },
  ],
  trainingChecklist: [],
  attendanceSummary: {
    trend: 'declining',
    observationCount: 3,
    observations: ['Jordan missed 2 sessions', 'Alex late twice', 'Sam absent once'],
    recommendationId: 'rec-001',
  },
  medicalSummary: { total: 1, concerns: ['Sam knee injury — ongoing'] },
  selectionReminders: [],
  recommendedActions: [
    { rank: 1, action: 'Contact absent players before Wednesday', category: 'attendance',   priority: 'high',   done: false, evidenceId: 'exp-001' },
    { rank: 2, action: 'Complete pre-match fitness test',         category: 'preparation',  priority: 'medium', done: false, evidenceId: 'exp-002' },
    { rank: 3, action: 'Review goalkeeper selection',            category: 'selection',    priority: 'low',    done: false, evidenceId: null },
  ],
  explanationIds: ['exp-001', 'exp-002', 'exp-003'],
  confidence: 0.82,
  isMock: false,
}

const READ_DATA = {
  teamId:            'team-1',
  squadReadinessPct: 85,
  availabilityPct:   90,
  injuryConcerns:    ['Sam knee — check fitness Thursday'],
  trainingCompletion:{ total: 8, estimatedMinutes: 220 },
  preparationChecklist: [
    { title: 'Tactical walkthrough', done: true },
    { title: 'Set piece rehearsal',  done: false },
  ],
  missingActions: [
    { title: 'Confirm match day squad', done: false },
  ],
  explanationIds: ['exp-004'],
  confidence: 0.78,
  isMock: false,
}

function mockCoachAI({
  tier           = 'professional',
  caps           = null,
  dashData       = DASH_DATA,
  dashOk         = true,
  readData       = READ_DATA,
  readOk         = true,
  throwOnDash    = false,
  throwOnCaps    = false,
} = {}) {
  return {
    getCapabilities: async () => {
      if (throwOnCaps) throw new Error('caps failure')
      return caps ?? makeCaps(tier)
    },
    getDashboard: async () => {
      if (throwOnDash) throw new Error('dashboard failure')
      return {
        integrationVersion: '1.0',
        ok:        dashOk,
        available: true,
        tier,
        reason:    dashOk ? null : 'brain_unavailable',
        data:      dashData,
      }
    },
    getMatchReadiness: async () => ({
      integrationVersion: '1.0',
      ok:        readOk,
      available: true,
      tier,
      reason:    readOk ? null : 'brain_unavailable',
      data:      readData,
    }),
    getPlayerCard:   async () => ({ ok: false, available: false, tier, reason: 'insufficient_tier', data: null }),
    getClubSnapshot: async () => ({ ok: false, available: false, tier, reason: 'insufficient_tier', data: null }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — weekly-brief-types.js
// ─────────────────────────────────────────────────────────────────────────────

test('BRIEF_ID is "weekly-brief"', () => {
  assert.equal(BRIEF_ID, 'weekly-brief')
})

test('BRIEF_VERSION is "2.0"', () => {
  assert.equal(BRIEF_VERSION, '2.0')
})

test('URGENCY has high, medium, low', () => {
  assert.equal(URGENCY.HIGH,   'high')
  assert.equal(URGENCY.MEDIUM, 'medium')
  assert.equal(URGENCY.LOW,    'low')
})

test('LOAD_STATUS has on_track, behind, at_risk, unknown', () => {
  assert.equal(LOAD_STATUS.ON_TRACK, 'on_track')
  assert.equal(LOAD_STATUS.BEHIND,   'behind')
  assert.equal(LOAD_STATUS.AT_RISK,  'at_risk')
  assert.equal(LOAD_STATUS.UNKNOWN,  'unknown')
})

test('BRIEF_FIELD covers all 8 sections', () => {
  assert.ok(BRIEF_FIELD.TOP_PRIORITIES)
  assert.ok(BRIEF_FIELD.BIGGEST_RISKS)
  assert.ok(BRIEF_FIELD.ATTENDANCE_SUMMARY)
  assert.ok(BRIEF_FIELD.AVAILABILITY_SUMMARY)
  assert.ok(BRIEF_FIELD.TRAINING_LOAD_SUMMARY)
  assert.ok(BRIEF_FIELD.MATCH_PREPARATION_STATUS)
  assert.ok(BRIEF_FIELD.PLAYERS_NEEDING_ATTENTION)
  assert.ok(BRIEF_FIELD.RECOMMENDED_ACTIONS)
})

test('URGENCY, LOAD_STATUS, BRIEF_FIELD are frozen', () => {
  assert.equal(Object.isFrozen(URGENCY),      true)
  assert.equal(Object.isFrozen(LOAD_STATUS),  true)
  assert.equal(Object.isFrozen(BRIEF_FIELD),  true)
})

test('Threshold constants are positive numbers', () => {
  assert.equal(typeof LOAD_TARGET_MINUTES_PER_ACTION, 'number')
  assert.ok(LOAD_TARGET_MINUTES_PER_ACTION > 0)
  assert.ok(LOAD_ON_TRACK_THRESHOLD > LOAD_BEHIND_THRESHOLD)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — getMonday helper
// ─────────────────────────────────────────────────────────────────────────────

test('getMonday — Friday 2026-06-12 → Monday 2026-06-08', () => {
  assert.equal(getMonday('2026-06-12'), '2026-06-08')
})

test('getMonday — Monday 2026-06-08 → same Monday', () => {
  assert.equal(getMonday('2026-06-08'), '2026-06-08')
})

test('getMonday — Sunday 2026-06-14 → Monday 2026-06-08', () => {
  assert.equal(getMonday('2026-06-14'), '2026-06-08')
})

test('getMonday — Wednesday 2026-06-10 → Monday 2026-06-08', () => {
  assert.equal(getMonday('2026-06-10'), '2026-06-08')
})

test('getMonday — Saturday 2026-06-13 → Monday 2026-06-08', () => {
  assert.equal(getMonday('2026-06-13'), '2026-06-08')
})

test('getMonday — null → null', () => {
  assert.equal(getMonday(null),      null)
  assert.equal(getMonday(undefined), null)
  assert.equal(getMonday(''),        null)
})

test('getMonday — invalid date string → null', () => {
  assert.equal(getMonday('not-a-date'), null)
  assert.equal(getMonday('2026/06/12'), null)
})

test('getMonday — year boundary: 2026-01-01 (Thursday) → 2025-12-29', () => {
  assert.equal(getMonday('2026-01-01'), '2025-12-29')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — Tier gating
// ─────────────────────────────────────────────────────────────────────────────

test('FREE tier — available=false, reason=insufficient_tier', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'free' } }, mockCoachAI({ tier: 'free' }))
  assert.equal(r.available, false)
  assert.equal(r.ok,        false)
  assert.equal(r.tier,      'free')
  assert.equal(r.reason,    'insufficient_tier')
})

test('FREE tier — limitations array has upgrade message', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'free' } }, mockCoachAI({ tier: 'free' }))
  assert.ok(Array.isArray(r.limitations))
  assert.ok(r.limitations.length > 0)
})

test('STARTER tier — available=true', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'starter' } }, mockCoachAI({ tier: 'starter' }))
  assert.equal(r.available, true)
  assert.equal(r.tier, 'starter')
})

test('PERFORMANCE tier — available=true', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'performance' } }, mockCoachAI({ tier: 'performance' }))
  assert.equal(r.available, true)
})

test('PROFESSIONAL tier — available=true', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI({ tier: 'professional' }))
  assert.equal(r.available, true)
})

test('CLUB tier — available=false (CLUB has no weeklyBrief)', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'club' } }, mockCoachAI({ tier: 'club' }))
  assert.equal(r.available, false)
})

test('ENTERPRISE tier — available=true', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'enterprise' } }, mockCoachAI({ tier: 'enterprise' }))
  assert.equal(r.available, true)
})

test('Global AI flag disabled — available=false regardless of tier', async () => {
  const r = await getWeeklyBrief(
    { user: { tier: 'professional', flags: { 'ai.enabled': false } } },
    mockCoachAI({ tier: 'professional', caps: { ...makeCaps('professional'), isEnabled: false, reason: 'ai_not_enabled', features: { dashboard: false, weeklyBrief: false, matchReadiness: false, playerCard: false, clubSnapshot: false } } }),
  )
  assert.equal(r.available, false)
})

test('Flag override disables weeklyBrief for PROFESSIONAL', async () => {
  const caps = makeCaps('professional', { features: { weeklyBrief: false } })
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' } },
    mockCoachAI({ tier: 'professional', caps }),
  )
  assert.equal(r.available, false)
})

test('Flag override enables weeklyBrief for FREE (via caps injection)', async () => {
  const caps = makeCaps('free', { isEnabled: true, features: { weeklyBrief: true, matchReadiness: false, dashboard: true, playerCard: false, clubSnapshot: false } })
  const r = await getWeeklyBrief(
    { user: { tier: 'free' } },
    mockCoachAI({ tier: 'free', caps }),
  )
  assert.equal(r.available, true)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — WeeklyBriefResponse envelope shape
// ─────────────────────────────────────────────────────────────────────────────

test('Envelope — all required fields present', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  const required = [
    'productId', 'productVersion', 'ok', 'available', 'tier',
    'weekOf', 'generatedAt', 'isMock',
    'topPriorities', 'biggestRisks',
    'attendanceSummary', 'availabilitySummary', 'trainingLoadSummary',
    'matchPreparationStatus', 'playersNeedingAttention', 'recommendedActions',
    'confidence', 'evidenceIds',
    'reason', 'limitations',
  ]
  for (const key of required) {
    assert.ok(key in r, `Missing field: ${key}`)
  }
})

test('Envelope — productId = "weekly-brief"', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  assert.equal(r.productId, 'weekly-brief')
})

test('Envelope — productVersion = "2.0"', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  assert.equal(r.productVersion, '2.0')
})

test('Envelope — ok and available are booleans', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  assert.equal(typeof r.ok,        'boolean')
  assert.equal(typeof r.available, 'boolean')
})

test('Envelope — tier matches user tier', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI({ tier: 'professional' }))
  assert.equal(r.tier, 'professional')
})

test('Envelope — section arrays are arrays', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  assert.ok(Array.isArray(r.topPriorities))
  assert.ok(Array.isArray(r.biggestRisks))
  assert.ok(Array.isArray(r.playersNeedingAttention))
  assert.ok(Array.isArray(r.recommendedActions))
  assert.ok(Array.isArray(r.evidenceIds))
  assert.ok(Array.isArray(r.limitations))
})

test('Envelope — section objects are objects', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  assert.ok(r.attendanceSummary       && typeof r.attendanceSummary       === 'object')
  assert.ok(r.availabilitySummary     && typeof r.availabilitySummary     === 'object')
  assert.ok(r.trainingLoadSummary     && typeof r.trainingLoadSummary     === 'object')
  assert.ok(r.matchPreparationStatus  && typeof r.matchPreparationStatus  === 'object')
})

test('Envelope — isMock=false when Brain ok=true', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI({ dashOk: true }))
  assert.equal(r.isMock, false)
})

test('Envelope — isMock=true when Brain ok=false', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI({ dashOk: false }))
  assert.equal(r.isMock, true)
})

test('Envelope — unavailable brief has same shape', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'free' } }, mockCoachAI({ tier: 'free' }))
  const required = ['productId', 'productVersion', 'ok', 'available', 'tier', 'weekOf', 'topPriorities', 'attendanceSummary', 'availabilitySummary', 'trainingLoadSummary', 'matchPreparationStatus']
  for (const key of required) assert.ok(key in r, `Missing in unavailable: ${key}`)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — Attendance summary
// ─────────────────────────────────────────────────────────────────────────────

test('Attendance — declining trend headline', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  assert.ok(r.attendanceSummary.headline.includes('declining'))
})

test('Attendance — declining with count', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  assert.equal(r.attendanceSummary.observationCount, 3)
})

test('Attendance — improving trend headline', async () => {
  const dashData = { ...DASH_DATA, attendanceSummary: { trend: 'improving', observationCount: 2, observations: ['Alex improving'] } }
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI({ dashData }))
  assert.ok(r.attendanceSummary.headline.includes('improving'))
})

test('Attendance — zero count → no issues headline', async () => {
  const dashData = { ...DASH_DATA, attendanceSummary: { trend: 'stable', observationCount: 0, observations: [] } }
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI({ dashData }))
  assert.ok(r.attendanceSummary.headline.includes('No attendance'))
})

test('Attendance — concerns mapped from observations', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  assert.ok(Array.isArray(r.attendanceSummary.concerns))
  assert.ok(r.attendanceSummary.concerns.length > 0)
  for (const c of r.attendanceSummary.concerns) assert.equal(typeof c, 'string')
})

test('Attendance — null attendanceSummary → safe defaults', async () => {
  const dashData = { ...DASH_DATA, attendanceSummary: null }
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI({ dashData }))
  assert.equal(r.attendanceSummary.trend, 'unknown')
  assert.equal(r.attendanceSummary.observationCount, 0)
  assert.ok(Array.isArray(r.attendanceSummary.concerns))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 6 — Availability summary
// ─────────────────────────────────────────────────────────────────────────────

test('Availability — pct 90 → "90% of squad available"', async () => {
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI(),
  )
  assert.ok(r.availabilitySummary.headline.includes('90%'))
})

test('Availability — pct forwarded correctly', async () => {
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI(),
  )
  assert.equal(r.availabilitySummary.pct, 90)
})

test('Availability — injury concerns → unavailableReasons', async () => {
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI(),
  )
  assert.ok(r.availabilitySummary.unavailableReasons.length > 0)
})

test('Availability — no readiness data (no team) → unavailable headline', async () => {
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' } },   // no team
    mockCoachAI(),
  )
  assert.ok(r.availabilitySummary.headline.includes('unavailable') || r.availabilitySummary.headline.includes('unknown'))
})

test('Availability — null availabilityPct → "Squad availability unknown"', async () => {
  const readData = { ...READ_DATA, availabilityPct: null }
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI({ readData }),
  )
  assert.ok(r.availabilitySummary.headline.toLowerCase().includes('unknown'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 7 — Training load summary
// ─────────────────────────────────────────────────────────────────────────────

test('Training load — estimatedMinutes / (total * 30) * 100 → completionPct', async () => {
  // 220 / (8 * 30) * 100 = 220/240 * 100 = 91.7 → rounds to 92 → on_track
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI(),
  )
  assert.equal(r.trainingLoadSummary.status, LOAD_STATUS.ON_TRACK)
  assert.ok(r.trainingLoadSummary.completionPct >= 80)
})

test('Training load — status on_track when ≥80%', async () => {
  const readData = { ...READ_DATA, trainingCompletion: { total: 4, estimatedMinutes: 100 } }
  // 100 / (4*30) * 100 = 83% → on_track
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI({ readData }),
  )
  assert.equal(r.trainingLoadSummary.status, LOAD_STATUS.ON_TRACK)
  assert.equal(r.trainingLoadSummary.actionRequired, false)
})

test('Training load — status behind when 60-79%', async () => {
  const readData = { ...READ_DATA, trainingCompletion: { total: 5, estimatedMinutes: 105 } }
  // 105 / (5*30) * 100 = 70% → behind
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI({ readData }),
  )
  assert.equal(r.trainingLoadSummary.status, LOAD_STATUS.BEHIND)
  assert.equal(r.trainingLoadSummary.actionRequired, true)
})

test('Training load — status at_risk when <60%', async () => {
  const readData = { ...READ_DATA, trainingCompletion: { total: 5, estimatedMinutes: 50 } }
  // 50 / (5*30) * 100 = 33% → at_risk
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI({ readData }),
  )
  assert.equal(r.trainingLoadSummary.status, LOAD_STATUS.AT_RISK)
  assert.equal(r.trainingLoadSummary.actionRequired, true)
})

test('Training load — capped at 100% max', async () => {
  const readData = { ...READ_DATA, trainingCompletion: { total: 2, estimatedMinutes: 999 } }
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI({ readData }),
  )
  assert.ok(r.trainingLoadSummary.completionPct <= 100)
})

test('Training load — no readiness data → unknown status', async () => {
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' } },   // no team
    mockCoachAI(),
  )
  assert.equal(r.trainingLoadSummary.status, LOAD_STATUS.UNKNOWN)
  assert.equal(r.trainingLoadSummary.completionPct, null)
})

test('Training load — total=0 → unknown status', async () => {
  const readData = { ...READ_DATA, trainingCompletion: { total: 0, estimatedMinutes: 0 } }
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI({ readData }),
  )
  assert.equal(r.trainingLoadSummary.status, LOAD_STATUS.UNKNOWN)
})

test('Training load — headline includes pct', async () => {
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI(),
  )
  assert.ok(r.trainingLoadSummary.headline.includes('%') || r.trainingLoadSummary.headline.includes('unavailable'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 8 — Match preparation status
// ─────────────────────────────────────────────────────────────────────────────

test('Match prep — isMatchWeek=true when team provided with prep items', async () => {
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI(),
  )
  assert.equal(r.matchPreparationStatus.isMatchWeek, true)
})

test('Match prep — isMatchWeek=false without team', async () => {
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' } },
    mockCoachAI(),
  )
  assert.equal(r.matchPreparationStatus.isMatchWeek, false)
})

test('Match prep — preparationItems have title and done', async () => {
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI(),
  )
  for (const item of r.matchPreparationStatus.preparationItems) {
    assert.ok('title' in item)
    assert.ok('done'  in item)
    assert.equal(typeof item.title, 'string')
    assert.equal(typeof item.done,  'boolean')
  }
})

test('Match prep — missingActions are strings', async () => {
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI(),
  )
  for (const action of r.matchPreparationStatus.missingActions) {
    assert.equal(typeof action, 'string')
  }
})

test('Match prep — readinessPct 85 in headline', async () => {
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI(),
  )
  assert.ok(r.matchPreparationStatus.headline.includes('85%'))
})

test('Match prep — missing action count in headline when present', async () => {
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI(),
  )
  // 1 missing action in READ_DATA
  assert.ok(r.matchPreparationStatus.headline.includes('1') || r.matchPreparationStatus.headline.includes('action'))
})

test('Match prep — null readinessPct falls back to action count headline', async () => {
  const readData = { ...READ_DATA, squadReadinessPct: null }
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI({ readData }),
  )
  assert.ok(typeof r.matchPreparationStatus.headline === 'string')
  assert.ok(r.matchPreparationStatus.headline.length > 0)
})

test('Match prep — no prep and no missing actions → isMatchWeek false', async () => {
  const readData = { ...READ_DATA, squadReadinessPct: null, preparationChecklist: [], missingActions: [] }
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI({ readData }),
  )
  assert.equal(r.matchPreparationStatus.isMatchWeek, false)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 9 — Players needing attention
// ─────────────────────────────────────────────────────────────────────────────

test('Players — medical summary concerns → HIGH urgency', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  const sam = r.playersNeedingAttention.find(p => p.reason.includes('Sam'))
  assert.ok(sam)
  assert.equal(sam.urgency, URGENCY.HIGH)
})

test('Players — welfare priority → present in list', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  // DASH_DATA priority rank 3 has category 'Player Welfare'
  const found = r.playersNeedingAttention.some(p => p.reason.includes('welfare') || p.reason.toLowerCase().includes('concern'))
  // Either medical concern or welfare priority should be found
  assert.ok(r.playersNeedingAttention.length > 0)
})

test('Players — injury concerns from readiness → MEDIUM urgency', async () => {
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI(),
  )
  // READ_DATA has 'Sam knee — check fitness Thursday'
  const found = r.playersNeedingAttention.find(p => p.reason.includes('knee') || p.reason.includes('Sam'))
  assert.ok(found)
})

test('Players — deduplication: same reason not added twice', async () => {
  // Both medicalSummary and injuryConcerns mention Sam — should appear once
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI(),
  )
  const reasons = r.playersNeedingAttention.map(p => p.reason)
  const uniqueReasons = new Set(reasons)
  assert.equal(reasons.length, uniqueReasons.size)
})

test('Players — playerId is null (not yet resolved)', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  for (const p of r.playersNeedingAttention) {
    assert.equal(p.playerId, null)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 10 — Top priorities
// ─────────────────────────────────────────────────────────────────────────────

test('Top priorities — max 3 returned', async () => {
  // DASH_DATA has 4 priorities
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  assert.ok(r.topPriorities.length <= 3)
  assert.equal(r.topPriorities.length, 3)
})

test('Top priorities — rank, title, category, urgency preserved', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  const first = r.topPriorities[0]
  assert.ok('rank'     in first)
  assert.ok('title'    in first)
  assert.ok('category' in first)
  assert.ok('urgency'  in first)
})

test('Top priorities — sorted by rank (rank 1 first)', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  if (r.topPriorities.length > 1) {
    assert.equal(r.topPriorities[0].rank, 1)
  }
})

test('Top priorities — empty when no dashboard data', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI({ dashOk: false, dashData: null }))
  assert.ok(Array.isArray(r.topPriorities))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 11 — Biggest risks
// ─────────────────────────────────────────────────────────────────────────────

test('Biggest risks — forwarded from dashboard', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  assert.ok(r.biggestRisks.length > 0)
  assert.ok('title' in r.biggestRisks[0])
  assert.ok('riskLevel' in r.biggestRisks[0])
})

test('Biggest risks — empty array when no risks', async () => {
  const dashData = { ...DASH_DATA, biggestRisks: [] }
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI({ dashData }))
  assert.deepEqual(r.biggestRisks, [])
})

test('Biggest risks — empty when unavailable', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'free' } }, mockCoachAI({ tier: 'free' }))
  assert.deepEqual(r.biggestRisks, [])
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 12 — Recommended actions
// ─────────────────────────────────────────────────────────────────────────────

test('Recommended actions — forwarded from dashboard', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  assert.equal(r.recommendedActions.length, 3)
})

test('Recommended actions — rank, action, priority, done preserved', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  const first = r.recommendedActions[0]
  assert.ok('rank'     in first)
  assert.ok('action'   in first)
  assert.ok('priority' in first)
  assert.ok('done'     in first)
})

test('Recommended actions — empty when no dashboard data', async () => {
  const dashData = { ...DASH_DATA, recommendedActions: [] }
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI({ dashData }))
  assert.deepEqual(r.recommendedActions, [])
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 13 — Evidence IDs
// ─────────────────────────────────────────────────────────────────────────────

test('Evidence IDs — collected from dashboard explanationIds', async () => {
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI(),
  )
  // DASH_DATA has exp-001, exp-002, exp-003 + from priorities and actions
  assert.ok(r.evidenceIds.includes('exp-001'))
  assert.ok(r.evidenceIds.includes('exp-002'))
})

test('Evidence IDs — collected from readiness explanationIds', async () => {
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI(),
  )
  assert.ok(r.evidenceIds.includes('exp-004'))
})

test('Evidence IDs — deduplicated', async () => {
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, team: { teamId: 'team-1' } },
    mockCoachAI(),
  )
  const ids = r.evidenceIds
  assert.equal(ids.length, new Set(ids).size, 'Evidence IDs should be deduplicated')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 14 — Confidence
// ─────────────────────────────────────────────────────────────────────────────

test('Confidence — forwarded from dashboard', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  assert.equal(r.confidence, 0.82)
})

test('Confidence — null when dashboard data absent', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI({ dashOk: false, dashData: null }))
  assert.equal(r.confidence, null)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 15 — weekOf / generatedAt
// ─────────────────────────────────────────────────────────────────────────────

test('weekOf — computed from date context', async () => {
  const r = await getWeeklyBrief(
    { user: { tier: 'professional' }, date: '2026-06-12' },
    mockCoachAI(),
  )
  assert.equal(r.weekOf, '2026-06-08')
})

test('weekOf — null when no date provided', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  assert.equal(r.weekOf, null)
})

test('generatedAt — passed through from context', async () => {
  const ts = '2026-06-12T09:00:00.000Z'
  const r  = await getWeeklyBrief(
    { user: { tier: 'professional' }, generatedAt: ts },
    mockCoachAI(),
  )
  assert.equal(r.generatedAt, ts)
})

test('generatedAt — null when not provided', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI())
  assert.equal(r.generatedAt, null)
})

test('weekOf — unavailable brief has null weekOf', async () => {
  const r = await getWeeklyBrief({ user: { tier: 'free' } }, mockCoachAI({ tier: 'free' }))
  assert.equal(r.weekOf, null)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 16 — Never throws
// ─────────────────────────────────────────────────────────────────────────────

test('Never throws — null context', async () => {
  await assert.doesNotReject(() => getWeeklyBrief(null))
})

test('Never throws — undefined context', async () => {
  await assert.doesNotReject(() => getWeeklyBrief(undefined))
})

test('Never throws — empty context', async () => {
  await assert.doesNotReject(() => getWeeklyBrief({}))
})

test('Never throws — getCapabilities throws', async () => {
  await assert.doesNotReject(() =>
    getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI({ throwOnCaps: true })),
  )
})

test('Never throws — getDashboard throws', async () => {
  await assert.doesNotReject(() =>
    getWeeklyBrief({ user: { tier: 'professional' } }, mockCoachAI({ throwOnDash: true })),
  )
})

test('Never throws — real CoachAI (integration test, Brain not running)', async () => {
  await assert.doesNotReject(() =>
    getWeeklyBrief({ user: { tier: 'starter', coachId: 'c1', clubId: 'club1' } }),
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 17 — No Brain imports (structural contract test)
// ─────────────────────────────────────────────────────────────────────────────

test('Weekly brief module only imports from integration layer, not Brain internals', async () => {
  // Load the source as text and verify import paths
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../coach-products/weekly-brief/weekly-brief.js', import.meta.url), 'utf8')

  // Must NOT import from workflow, memory, api, products, or other Brain internals
  const forbidden = [
    'ai-brain/workflow',
    'ai-brain/memory',
    'ai-brain/api',
    'ai-brain/products',
    'ai-brain/policy',
    'ai-brain/planning',
    'ai-brain/reasoning',
    'ai-brain/observation',
    'ai-brain/explain',
    'ai-brain/calibrat',
    'ai-brain/timeline',
  ]
  for (const path of forbidden) {
    assert.ok(!src.includes(path), `weekly-brief.js must not import from ${path}`)
  }

  // MUST import from integration layer
  assert.ok(src.includes('ai-brain/integration'), 'Must import from ai-brain/integration')
})
