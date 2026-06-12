/**
 * AI Brain — M16 Coach Intelligence Products Tests
 *
 * Verifies:
 * 1. product-types.js    — constants, scoreToGrade
 * 2. product-response.js — builders, isFlagEnabled, apiOpts
 * 3. getWeeklyBrief      — shape, all fields, feature flag, never rejects
 * 4. getMatchReadiness   — shape, all fields, feature flag, never rejects
 * 5. getPlayerCard       — shape, all fields, feature flag, never rejects
 * 6. getClubSnapshot     — shape, all fields, feature flag, never rejects
 * 7. AI namespace        — all four products exposed
 * 8. M1–M15 regression   — all prior contracts unaffected
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  PRODUCT_VERSION, PRODUCT_ID, PRODUCT_FEATURE_FLAG, PRODUCT_ERROR,
  RISK_LEVEL, TREND, PRIORITY, scoreToGrade,
} from '../ai-brain/products/product-types.js'
import {
  toProduct, toProductError, toProductDisabled, isProductEnabled, apiOpts,
} from '../ai-brain/products/product-response.js'
import { getWeeklyBrief }    from '../ai-brain/products/weekly-brief.js'
import { getMatchReadiness } from '../ai-brain/products/match-readiness.js'
import { getPlayerCard }     from '../ai-brain/products/player-card.js'
import { getClubSnapshot }   from '../ai-brain/products/club-snapshot.js'
import { AI }                from '../ai-brain/index.js'

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — product-types.js
// ─────────────────────────────────────────────────────────────────────────────

test('PRODUCT_VERSION is a string', () => {
  assert.equal(typeof PRODUCT_VERSION, 'string')
})

test('PRODUCT_ID has all four products', () => {
  assert.equal(PRODUCT_ID.WEEKLY_BRIEF,    'weekly-brief')
  assert.equal(PRODUCT_ID.MATCH_READINESS, 'match-readiness')
  assert.equal(PRODUCT_ID.PLAYER_CARD,     'player-card')
  assert.equal(PRODUCT_ID.CLUB_SNAPSHOT,   'club-snapshot')
})

test('PRODUCT_FEATURE_FLAG has ai.product.* prefix for all four', () => {
  for (const flag of Object.values(PRODUCT_FEATURE_FLAG)) {
    assert.ok(flag.startsWith('ai.product.'), `Flag '${flag}' must start with 'ai.product.'`)
  }
})

test('PRODUCT_ERROR has DISABLED, INVALID_INPUT, INTERNAL', () => {
  assert.equal(typeof PRODUCT_ERROR.DISABLED,      'string')
  assert.equal(typeof PRODUCT_ERROR.INVALID_INPUT, 'string')
  assert.equal(typeof PRODUCT_ERROR.INTERNAL,      'string')
})

test('RISK_LEVEL has high, medium, low', () => {
  assert.equal(RISK_LEVEL.HIGH,   'high')
  assert.equal(RISK_LEVEL.MEDIUM, 'medium')
  assert.equal(RISK_LEVEL.LOW,    'low')
})

test('TREND has improving, stable, declining, unknown', () => {
  assert.equal(TREND.IMPROVING, 'improving')
  assert.equal(TREND.STABLE,    'stable')
  assert.equal(TREND.DECLINING, 'declining')
  assert.equal(TREND.UNKNOWN,   'unknown')
})

test('scoreToGrade: 85 → A', () => { assert.equal(scoreToGrade(85), 'A') })
test('scoreToGrade: 65 → B', () => { assert.equal(scoreToGrade(65), 'B') })
test('scoreToGrade: 45 → C', () => { assert.equal(scoreToGrade(45), 'C') })
test('scoreToGrade: 25 → D', () => { assert.equal(scoreToGrade(25), 'D') })
test('scoreToGrade: 10 → F', () => { assert.equal(scoreToGrade(10), 'F') })
test('scoreToGrade: null → N/A', () => { assert.equal(scoreToGrade(null),  'N/A') })
test('scoreToGrade: string → N/A', () => { assert.equal(scoreToGrade('x'), 'N/A') })

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — product-response.js builders
// ─────────────────────────────────────────────────────────────────────────────

test('toProduct: returns ok=true with productId and data', () => {
  const r = toProduct('weekly-brief', { x: 1 }, { t0: Date.now() - 5 })
  assert.equal(r.productId,      'weekly-brief')
  assert.equal(r.productVersion, PRODUCT_VERSION)
  assert.equal(r.ok,             true)
  assert.equal(r.error,          null)
  assert.deepEqual(r.data,       { x: 1 })
  assert.ok(typeof r.generatedAt === 'string')
  assert.ok(r.durationMs >= 0)
})

test('toProductError: returns ok=false with error', () => {
  const r = toProductError('player-card', new Error('boom'), { t0: Date.now(), code: 'INTERNAL_ERROR' })
  assert.equal(r.ok,            false)
  assert.equal(r.data,          null)
  assert.equal(r.error.message, 'boom')
  assert.equal(r.error.code,    'INTERNAL_ERROR')
})

test('toProductDisabled: returns PRODUCT_DISABLED code', () => {
  const r = toProductDisabled('club-snapshot', 'ai.product.clubSnapshot', {})
  assert.equal(r.ok,           false)
  assert.equal(r.data,         null)
  assert.equal(r.error.code,   PRODUCT_ERROR.DISABLED)
  assert.ok(r.error.message.includes('ai.product.clubSnapshot'))
})

test('isProductEnabled: true by default', () => {
  assert.equal(isProductEnabled(PRODUCT_FEATURE_FLAG.WEEKLY_BRIEF, {}), true)
})

test('isProductEnabled: false when explicitly disabled', () => {
  assert.equal(
    isProductEnabled(PRODUCT_FEATURE_FLAG.WEEKLY_BRIEF, {
      flags: { 'ai.product.weeklyBrief': false },
    }),
    false
  )
})

test('apiOpts: strips ai.product.* flags, keeps ai.* flags', () => {
  const opts = {
    flags: {
      'ai.product.weeklyBrief': false,
      'ai.dashboard':           false,
      'ai.playerInsight':       true,
    },
  }
  const result = apiOpts(opts)
  assert.ok(!('ai.product.weeklyBrief' in result.flags), 'product flag must be stripped')
  assert.ok('ai.dashboard'     in result.flags, 'api flag must be kept')
  assert.ok('ai.playerInsight' in result.flags, 'api flag must be kept')
})

test('apiOpts: no flags → returns opts unchanged', () => {
  const opts   = { x: 1 }
  const result = apiOpts(opts)
  assert.equal(result.x, 1)
})

test('every ProductResponse has all 7 required fields', () => {
  const responses = [
    toProduct('weekly-brief', {}, {}),
    toProductError('player-card', 'err', {}),
    toProductDisabled('club-snapshot', 'flag', {}),
  ]
  for (const r of responses) {
    assert.ok('productId'      in r, 'productId missing')
    assert.ok('productVersion' in r, 'productVersion missing')
    assert.ok('ok'             in r, 'ok missing')
    assert.ok('generatedAt'    in r, 'generatedAt missing')
    assert.ok('durationMs'     in r, 'durationMs missing')
    assert.ok('data'           in r, 'data missing')
    assert.ok('error'          in r, 'error missing')
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — getWeeklyBrief
// ─────────────────────────────────────────────────────────────────────────────

test('getWeeklyBrief: never rejects', async () => {
  await assert.doesNotReject(getWeeklyBrief(null, null))
  await assert.doesNotReject(getWeeklyBrief('coach-1', 'club-1'))
  await assert.doesNotReject(getWeeklyBrief(undefined, undefined))
})

test('getWeeklyBrief: returns ProductResponse envelope', async () => {
  const r = await getWeeklyBrief('coach-1', 'club-1')
  assert.equal(r.productId,      PRODUCT_ID.WEEKLY_BRIEF)
  assert.equal(r.productVersion, PRODUCT_VERSION)
  assert.ok(typeof r.ok === 'boolean')
})

test('getWeeklyBrief: ok=true on success', async () => {
  const r = await getWeeklyBrief('coach-1', 'club-1')
  assert.equal(r.ok, true)
})

test('getWeeklyBrief: data has all required fields', async () => {
  const r = await getWeeklyBrief('coach-1', 'club-1')
  assert.ok(r.ok)
  const d = r.data
  assert.ok('coachId'            in d, 'coachId missing')
  assert.ok('clubId'             in d, 'clubId missing')
  assert.ok('topPriorities'      in d, 'topPriorities missing')
  assert.ok('biggestRisks'       in d, 'biggestRisks missing')
  assert.ok('trainingChecklist'  in d, 'trainingChecklist missing')
  assert.ok('attendanceSummary'  in d, 'attendanceSummary missing')
  assert.ok('medicalSummary'     in d, 'medicalSummary missing')
  assert.ok('selectionReminders' in d, 'selectionReminders missing')
  assert.ok('recommendedActions' in d, 'recommendedActions missing')
  assert.ok('explanationIds'     in d, 'explanationIds missing')
  assert.ok('confidence'         in d, 'confidence missing')
  assert.ok('isMock'             in d, 'isMock missing')
})

test('getWeeklyBrief: topPriorities is an array, max 5', async () => {
  const r = await getWeeklyBrief('coach-1', 'club-1')
  assert.ok(Array.isArray(r.data.topPriorities))
  assert.ok(r.data.topPriorities.length <= 5)
})

test('getWeeklyBrief: each topPriority has rank, recommendationId, priority', async () => {
  const r = await getWeeklyBrief('coach-1', 'club-1')
  for (const p of r.data.topPriorities) {
    assert.ok('rank'             in p)
    assert.ok('recommendationId' in p)
    assert.ok('title'            in p)
    assert.ok('priority'         in p)
    assert.ok('confidence'       in p)
    assert.ok('policyStatus'     in p)
    assert.ok(typeof p.rank === 'number' && p.rank >= 1)
  }
})

test('getWeeklyBrief: biggestRisks is an array, max 5', async () => {
  const r = await getWeeklyBrief('coach-1', 'club-1')
  assert.ok(Array.isArray(r.data.biggestRisks))
  assert.ok(r.data.biggestRisks.length <= 5)
})

test('getWeeklyBrief: each risk has riskLevel and policyStatus', async () => {
  const r = await getWeeklyBrief('coach-1', 'club-1')
  for (const risk of r.data.biggestRisks) {
    assert.ok('riskLevel'   in risk)
    assert.ok('policyStatus' in risk)
    assert.ok('title'        in risk)
  }
})

test('getWeeklyBrief: trainingChecklist is an array', async () => {
  const r = await getWeeklyBrief('coach-1', 'club-1')
  assert.ok(Array.isArray(r.data.trainingChecklist))
})

test('getWeeklyBrief: each checklist item has done=false', async () => {
  const r = await getWeeklyBrief('coach-1', 'club-1')
  for (const item of r.data.trainingChecklist) {
    assert.equal(item.done, false)
    assert.ok('actionId'  in item)
    assert.ok('title'     in item)
    assert.ok('planScope' in item)
  }
})

test('getWeeklyBrief: attendanceSummary has trend field', async () => {
  const r = await getWeeklyBrief('coach-1', 'club-1')
  const a = r.data.attendanceSummary
  assert.ok('trend'            in a)
  assert.ok('observationCount' in a)
  assert.ok('observations'     in a)
  assert.ok(Array.isArray(a.observations))
})

test('getWeeklyBrief: medicalSummary has total and concerns', async () => {
  const r = await getWeeklyBrief('coach-1', 'club-1')
  const m = r.data.medicalSummary
  assert.ok('total'    in m)
  assert.ok('concerns' in m)
  assert.ok(Array.isArray(m.concerns))
  assert.ok(typeof m.total === 'number')
})

test('getWeeklyBrief: selectionReminders is an array', async () => {
  const r = await getWeeklyBrief('coach-1', 'club-1')
  assert.ok(Array.isArray(r.data.selectionReminders))
})

test('getWeeklyBrief: recommendedActions is an array', async () => {
  const r = await getWeeklyBrief('coach-1', 'club-1')
  assert.ok(Array.isArray(r.data.recommendedActions))
  assert.ok(r.data.recommendedActions.length <= 7)
})

test('getWeeklyBrief: each recommendedAction has source, id, title, priority', async () => {
  const r = await getWeeklyBrief('coach-1', 'club-1')
  for (const action of r.data.recommendedActions) {
    assert.ok('source'   in action)
    assert.ok('id'       in action)
    assert.ok('title'    in action)
    assert.ok('priority' in action)
    assert.ok('dueDate'  in action)
  }
})

test('getWeeklyBrief: explanationIds is an array of strings', async () => {
  const r = await getWeeklyBrief('coach-1', 'club-1')
  assert.ok(Array.isArray(r.data.explanationIds))
  for (const id of r.data.explanationIds) {
    assert.ok(typeof id === 'string')
  }
})

test('getWeeklyBrief: confidence is number or null', async () => {
  const r = await getWeeklyBrief('coach-1', 'club-1')
  const c = r.data.confidence
  assert.ok(c === null || typeof c === 'number')
})

test('getWeeklyBrief: disabled when product flag off', async () => {
  const r = await getWeeklyBrief('c', 'b', {
    flags: { 'ai.product.weeklyBrief': false },
  })
  assert.equal(r.ok,   false)
  assert.equal(r.error.code, PRODUCT_ERROR.DISABLED)
})

test('getWeeklyBrief: durationMs is non-negative', async () => {
  const r = await getWeeklyBrief('c', 'b')
  assert.ok(r.durationMs >= 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — getMatchReadiness
// ─────────────────────────────────────────────────────────────────────────────

test('getMatchReadiness: never rejects', async () => {
  await assert.doesNotReject(getMatchReadiness('team-1'))
  await assert.doesNotReject(getMatchReadiness(null))
  await assert.doesNotReject(getMatchReadiness(undefined))
})

test('getMatchReadiness: returns ProductResponse envelope', async () => {
  const r = await getMatchReadiness('team-1')
  assert.equal(r.productId,      PRODUCT_ID.MATCH_READINESS)
  assert.equal(r.productVersion, PRODUCT_VERSION)
  assert.ok(typeof r.ok === 'boolean')
})

test('getMatchReadiness: ok=true for valid teamId', async () => {
  const r = await getMatchReadiness('team-1')
  assert.equal(r.ok, true)
})

test('getMatchReadiness: ok=false for missing teamId', async () => {
  const r = await getMatchReadiness(null)
  assert.equal(r.ok, false)
})

test('getMatchReadiness: data has all required fields', async () => {
  const r = await getMatchReadiness('team-1')
  assert.ok(r.ok)
  const d = r.data
  assert.ok('teamId'               in d, 'teamId missing')
  assert.ok('squadReadinessPct'    in d, 'squadReadinessPct missing')
  assert.ok('availabilityPct'      in d, 'availabilityPct missing')
  assert.ok('injuryConcerns'       in d, 'injuryConcerns missing')
  assert.ok('trainingCompletion'   in d, 'trainingCompletion missing')
  assert.ok('preparationChecklist' in d, 'preparationChecklist missing')
  assert.ok('missingActions'       in d, 'missingActions missing')
  assert.ok('explanationIds'       in d, 'explanationIds missing')
  assert.ok('confidence'           in d, 'confidence missing')
  assert.ok('isMock'               in d, 'isMock missing')
})

test('getMatchReadiness: teamId echoed in data', async () => {
  const r = await getMatchReadiness('team-abc')
  assert.equal(r.data.teamId, 'team-abc')
})

test('getMatchReadiness: squadReadinessPct is number or null', async () => {
  const r = await getMatchReadiness('team-1')
  const v = r.data.squadReadinessPct
  assert.ok(v === null || typeof v === 'number')
})

test('getMatchReadiness: availabilityPct is number or null', async () => {
  const r = await getMatchReadiness('team-1')
  const v = r.data.availabilityPct
  assert.ok(v === null || typeof v === 'number')
})

test('getMatchReadiness: injuryConcerns is an array', async () => {
  const r = await getMatchReadiness('team-1')
  assert.ok(Array.isArray(r.data.injuryConcerns))
  assert.ok(r.data.injuryConcerns.length <= 5)
})

test('getMatchReadiness: trainingCompletion has total and estimatedMinutes', async () => {
  const r = await getMatchReadiness('team-1')
  const tc = r.data.trainingCompletion
  assert.ok('total'            in tc)
  assert.ok('estimatedMinutes' in tc)
  assert.ok(typeof tc.total === 'number')
})

test('getMatchReadiness: preparationChecklist is an array', async () => {
  const r = await getMatchReadiness('team-1')
  assert.ok(Array.isArray(r.data.preparationChecklist))
})

test('getMatchReadiness: missingActions is an array', async () => {
  const r = await getMatchReadiness('team-1')
  assert.ok(Array.isArray(r.data.missingActions))
  assert.ok(r.data.missingActions.length <= 8)
})

test('getMatchReadiness: each missingAction has overdue boolean', async () => {
  const r = await getMatchReadiness('team-1')
  for (const a of r.data.missingActions) {
    assert.ok('overdue'       in a)
    assert.ok('title'         in a)
    assert.ok('suggestedDate' in a)
    assert.ok(typeof a.overdue === 'boolean')
  }
})

test('getMatchReadiness: disabled when product flag off', async () => {
  const r = await getMatchReadiness('team-1', {
    flags: { 'ai.product.matchReadiness': false },
  })
  assert.equal(r.ok,         false)
  assert.equal(r.error.code, PRODUCT_ERROR.DISABLED)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — getPlayerCard
// ─────────────────────────────────────────────────────────────────────────────

test('getPlayerCard: never rejects', async () => {
  await assert.doesNotReject(getPlayerCard('player-1'))
  await assert.doesNotReject(getPlayerCard(null))
  await assert.doesNotReject(getPlayerCard(undefined))
})

test('getPlayerCard: returns ProductResponse envelope', async () => {
  const r = await getPlayerCard('player-1')
  assert.equal(r.productId,      PRODUCT_ID.PLAYER_CARD)
  assert.equal(r.productVersion, PRODUCT_VERSION)
  assert.ok(typeof r.ok === 'boolean')
})

test('getPlayerCard: ok=true for valid playerId', async () => {
  const r = await getPlayerCard('player-1')
  assert.equal(r.ok, true)
})

test('getPlayerCard: ok=false for missing playerId', async () => {
  const r = await getPlayerCard(null)
  assert.equal(r.ok, false)
})

test('getPlayerCard: data has all required fields', async () => {
  const r = await getPlayerCard('player-1')
  assert.ok(r.ok)
  const d = r.data
  assert.ok('playerId'              in d, 'playerId missing')
  assert.ok('attendance'            in d, 'attendance missing')
  assert.ok('availability'          in d, 'availability missing')
  assert.ok('improvementTrend'      in d, 'improvementTrend missing')
  assert.ok('coachObservations'     in d, 'coachObservations missing')
  assert.ok('welfareIndicators'     in d, 'welfareIndicators missing')
  assert.ok('developmentPriorities' in d, 'developmentPriorities missing')
  assert.ok('explanationIds'        in d, 'explanationIds missing')
  assert.ok('confidence'            in d, 'confidence missing')
  assert.ok('isMock'                in d, 'isMock missing')
})

test('getPlayerCard: playerId echoed in data', async () => {
  const r = await getPlayerCard('player-xyz')
  assert.equal(r.data.playerId, 'player-xyz')
})

test('getPlayerCard: attendance has trend, recentRate, evidence', async () => {
  const r = await getPlayerCard('player-1')
  const a = r.data.attendance
  assert.ok('trend'      in a)
  assert.ok('recentRate' in a)
  assert.ok('evidence'   in a)
  assert.ok(Array.isArray(a.evidence))
  assert.ok(['improving','stable','declining','unknown'].includes(a.trend))
})

test('getPlayerCard: availability has same shape as attendance', async () => {
  const r = await getPlayerCard('player-1')
  const a = r.data.availability
  assert.ok('trend'      in a)
  assert.ok('recentRate' in a)
  assert.ok('evidence'   in a)
})

test('getPlayerCard: improvementTrend has direction and observations', async () => {
  const r = await getPlayerCard('player-1')
  const it = r.data.improvementTrend
  assert.ok('direction'    in it)
  assert.ok('observations' in it)
  assert.ok(Array.isArray(it.observations))
  assert.ok(['improving','stable','declining','unknown'].includes(it.direction))
})

test('getPlayerCard: coachObservations is an array, max 8', async () => {
  const r = await getPlayerCard('player-1')
  assert.ok(Array.isArray(r.data.coachObservations))
  assert.ok(r.data.coachObservations.length <= 8)
})

test('getPlayerCard: welfareIndicators is an array', async () => {
  const r = await getPlayerCard('player-1')
  assert.ok(Array.isArray(r.data.welfareIndicators))
})

test('getPlayerCard: developmentPriorities is an array, max 4', async () => {
  const r = await getPlayerCard('player-1')
  assert.ok(Array.isArray(r.data.developmentPriorities))
  assert.ok(r.data.developmentPriorities.length <= 4)
})

test('getPlayerCard: each developmentPriority has area, priority, summary', async () => {
  const r = await getPlayerCard('player-1')
  for (const p of r.data.developmentPriorities) {
    assert.ok('area'     in p)
    assert.ok('priority' in p)
    assert.ok('summary'  in p)
  }
})

test('getPlayerCard: explanationIds is an array', async () => {
  const r = await getPlayerCard('player-1')
  assert.ok(Array.isArray(r.data.explanationIds))
})

test('getPlayerCard: disabled when product flag off', async () => {
  const r = await getPlayerCard('player-1', {
    flags: { 'ai.product.playerCard': false },
  })
  assert.equal(r.ok,         false)
  assert.equal(r.error.code, PRODUCT_ERROR.DISABLED)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 6 — getClubSnapshot
// ─────────────────────────────────────────────────────────────────────────────

test('getClubSnapshot: never rejects', async () => {
  await assert.doesNotReject(getClubSnapshot('club-1'))
  await assert.doesNotReject(getClubSnapshot(null))
  await assert.doesNotReject(getClubSnapshot(undefined))
})

test('getClubSnapshot: returns ProductResponse envelope', async () => {
  const r = await getClubSnapshot('club-1')
  assert.equal(r.productId,      PRODUCT_ID.CLUB_SNAPSHOT)
  assert.equal(r.productVersion, PRODUCT_VERSION)
  assert.ok(typeof r.ok === 'boolean')
})

test('getClubSnapshot: ok=true for valid clubId', async () => {
  const r = await getClubSnapshot('club-1')
  assert.equal(r.ok, true)
})

test('getClubSnapshot: ok=false for missing clubId', async () => {
  const r = await getClubSnapshot(null)
  assert.equal(r.ok, false)
})

test('getClubSnapshot: data has all required fields', async () => {
  const r = await getClubSnapshot('club-1')
  assert.ok(r.ok)
  const d = r.data
  assert.ok('clubId'               in d, 'clubId missing')
  assert.ok('engagement'           in d, 'engagement missing')
  assert.ok('attendance'           in d, 'attendance missing')
  assert.ok('operationalHealth'    in d, 'operationalHealth missing')
  assert.ok('activityTrends'       in d, 'activityTrends missing')
  assert.ok('keyWarnings'          in d, 'keyWarnings missing')
  assert.ok('suggestedFocusAreas'  in d, 'suggestedFocusAreas missing')
  assert.ok('explanationIds'       in d, 'explanationIds missing')
  assert.ok('confidence'           in d, 'confidence missing')
  assert.ok('isMock'               in d, 'isMock missing')
})

test('getClubSnapshot: clubId echoed in data', async () => {
  const r = await getClubSnapshot('club-99')
  assert.equal(r.data.clubId, 'club-99')
})

test('getClubSnapshot: engagement has score, trend, grade, isMock', async () => {
  const r = await getClubSnapshot('club-1')
  const e = r.data.engagement
  assert.ok('score'  in e)
  assert.ok('trend'  in e)
  assert.ok('grade'  in e)
  assert.ok('isMock' in e)
})

test('getClubSnapshot: attendance has trend and summary', async () => {
  const r = await getClubSnapshot('club-1')
  const a = r.data.attendance
  assert.ok('trend'   in a)
  assert.ok('summary' in a)
})

test('getClubSnapshot: operationalHealth has score, grade, summary, isMock', async () => {
  const r = await getClubSnapshot('club-1')
  const oh = r.data.operationalHealth
  assert.ok('score'   in oh)
  assert.ok('grade'   in oh)
  assert.ok('summary' in oh)
  assert.ok('isMock'  in oh)
  assert.ok(typeof oh.summary === 'string')
})

test('getClubSnapshot: activityTrends is an array', async () => {
  const r = await getClubSnapshot('club-1')
  assert.ok(Array.isArray(r.data.activityTrends))
})

test('getClubSnapshot: each activityTrend has type, direction, summary', async () => {
  const r = await getClubSnapshot('club-1')
  for (const t of r.data.activityTrends) {
    assert.ok('type'      in t)
    assert.ok('direction' in t)
    assert.ok('summary'   in t)
  }
})

test('getClubSnapshot: keyWarnings is an array, max 6', async () => {
  const r = await getClubSnapshot('club-1')
  assert.ok(Array.isArray(r.data.keyWarnings))
  assert.ok(r.data.keyWarnings.length <= 6)
})

test('getClubSnapshot: suggestedFocusAreas is an array, max 3', async () => {
  const r = await getClubSnapshot('club-1')
  assert.ok(Array.isArray(r.data.suggestedFocusAreas))
  assert.ok(r.data.suggestedFocusAreas.length <= 3)
})

test('getClubSnapshot: each focusArea has area, rationale, priority', async () => {
  const r = await getClubSnapshot('club-1')
  for (const area of r.data.suggestedFocusAreas) {
    assert.ok('area'      in area)
    assert.ok('rationale' in area)
    assert.ok('priority'  in area)
  }
})

test('getClubSnapshot: explanationIds is an array', async () => {
  const r = await getClubSnapshot('club-1')
  assert.ok(Array.isArray(r.data.explanationIds))
})

test('getClubSnapshot: disabled when product flag off', async () => {
  const r = await getClubSnapshot('club-1', {
    flags: { 'ai.product.clubSnapshot': false },
  })
  assert.equal(r.ok,         false)
  assert.equal(r.error.code, PRODUCT_ERROR.DISABLED)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 7 — AI namespace exports
// ─────────────────────────────────────────────────────────────────────────────

test('AI.getWeeklyBrief is exposed', () => {
  assert.equal(typeof AI.getWeeklyBrief,    'function')
})

test('AI.getMatchReadiness is exposed', () => {
  assert.equal(typeof AI.getMatchReadiness, 'function')
})

test('AI.getPlayerCard is exposed', () => {
  assert.equal(typeof AI.getPlayerCard,     'function')
})

test('AI.getClubSnapshot is exposed', () => {
  assert.equal(typeof AI.getClubSnapshot,   'function')
})

test('AI.getWeeklyBrief: never rejects', async () => {
  await assert.doesNotReject(AI.getWeeklyBrief(null, null))
  await assert.doesNotReject(AI.getWeeklyBrief('c', 'b'))
})

test('AI.getMatchReadiness: never rejects', async () => {
  await assert.doesNotReject(AI.getMatchReadiness('team-1'))
})

test('AI.getPlayerCard: never rejects', async () => {
  await assert.doesNotReject(AI.getPlayerCard('player-1'))
})

test('AI.getClubSnapshot: never rejects', async () => {
  await assert.doesNotReject(AI.getClubSnapshot('club-1'))
})

test('All four products return correct productId from AI namespace', async () => {
  const [brief, readiness, card, snapshot] = await Promise.all([
    AI.getWeeklyBrief('c', 'b'),
    AI.getMatchReadiness('t'),
    AI.getPlayerCard('p'),
    AI.getClubSnapshot('b'),
  ])
  assert.equal(brief.productId,     PRODUCT_ID.WEEKLY_BRIEF)
  assert.equal(readiness.productId, PRODUCT_ID.MATCH_READINESS)
  assert.equal(card.productId,      PRODUCT_ID.PLAYER_CARD)
  assert.equal(snapshot.productId,  PRODUCT_ID.CLUB_SNAPSHOT)
})

test('API-layer flags pass through from product opts to underlying API', async () => {
  // Disabling the dashboard API flag should not crash the product — it returns an error product
  const r = await AI.getWeeklyBrief('c', 'b', {
    flags: { 'ai.dashboard': false },
  })
  // Product flag not disabled — but API is disabled, so product will error or degrade gracefully
  assert.ok(typeof r.ok === 'boolean')
  assert.ok('productId' in r)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 8 — M1–M15 regression
// ─────────────────────────────────────────────────────────────────────────────

test('AI.request() BrainResponse shape preserved after M16', async () => {
  const r = await AI.request({})
  assert.ok(Array.isArray(r.recommendations))
  assert.ok('meta'  in r)
  assert.ok('trace' in r)
})

test('AI.getDashboard() still resolves after M16', async () => {
  const r = await AI.getDashboard('c', 'b')
  assert.equal(r.apiVersion, 'v1')
  assert.ok(typeof r.ok === 'boolean')
})

test('AI.getPlayerInsight() still resolves after M16', async () => {
  const r = await AI.getPlayerInsight('p')
  assert.equal(r.apiVersion, 'v1')
})

test('AI.getTeamInsight() still resolves after M16', async () => {
  const r = await AI.getTeamInsight('t')
  assert.equal(r.apiVersion, 'v1')
})

test('AI.getClubInsight() still resolves after M16', async () => {
  const r = await AI.getClubInsight('b')
  assert.equal(r.apiVersion, 'v1')
})

test('AI.plan() still resolves after M16', async () => {
  await assert.doesNotReject(AI.plan(null))
})

test('AI.status() still returns { cis, accuracy } after M16', async () => {
  const r = await AI.status()
  assert.ok(typeof r.cis      === 'object')
  assert.ok(typeof r.accuracy === 'object')
})

test('AI.policyCheck() still resolves after M16', async () => {
  const r      = await AI.request({})
  const result = await AI.policyCheck(r)
  assert.ok(typeof result.overallStatus === 'string')
})

test('AI.ask() still resolves after M16', async () => {
  const r = await AI.ask('test')
  assert.equal(typeof r.answer, 'string')
})

test('AI.memory.* still resolves after M16', async () => {
  await assert.doesNotReject(AI.memory.get('m16-reg'))
})
