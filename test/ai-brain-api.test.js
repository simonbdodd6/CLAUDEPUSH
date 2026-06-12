/**
 * AI Brain — M15 Coach Experience API Tests
 *
 * Verifies:
 * 1. api-types.js     — API_VERSION, API_STATUS, FEATURE_FLAG, API_ERROR, API_LIMITS
 * 2. api-response.js  — toSuccess, toError, toDisabled, isFlagEnabled
 * 3. getDashboard     — shape, fields, feature flag, never rejects
 * 4. getPlayerInsight — shape, fields, feature flag, never rejects
 * 5. getTeamInsight   — shape, fields, feature flag, never rejects
 * 6. getClubInsight   — shape, fields, feature flag, never rejects
 * 7. AI namespace     — all four methods exposed
 * 8. M1–M14 regression — all prior contracts unaffected
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  API_VERSION, API_STATUS, FEATURE_FLAG, API_ERROR, API_LIMITS, PRIORITY_RANK,
} from '../ai-brain/api/api-types.js'
import {
  toSuccess, toError, toDisabled, isFlagEnabled,
} from '../ai-brain/api/api-response.js'
import { getDashboard }    from '../ai-brain/api/dashboard.js'
import { getPlayerInsight } from '../ai-brain/api/player-insight.js'
import { getTeamInsight }  from '../ai-brain/api/team-insight.js'
import { getClubInsight }  from '../ai-brain/api/club-insight.js'
import { AI }              from '../ai-brain/index.js'

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — api-types.js
// ─────────────────────────────────────────────────────────────────────────────

test('API_VERSION is v1', () => {
  assert.equal(API_VERSION, 'v1')
})

test('API_STATUS has ok, error, disabled', () => {
  assert.equal(API_STATUS.OK,       'ok')
  assert.equal(API_STATUS.ERROR,    'error')
  assert.equal(API_STATUS.DISABLED, 'disabled')
})

test('FEATURE_FLAG has all four endpoints', () => {
  assert.equal(FEATURE_FLAG.DASHBOARD,      'ai.dashboard')
  assert.equal(FEATURE_FLAG.PLAYER_INSIGHT, 'ai.playerInsight')
  assert.equal(FEATURE_FLAG.TEAM_INSIGHT,   'ai.teamInsight')
  assert.equal(FEATURE_FLAG.CLUB_INSIGHT,   'ai.clubInsight')
})

test('API_ERROR has expected codes', () => {
  assert.equal(typeof API_ERROR.DISABLED,          'string')
  assert.equal(typeof API_ERROR.INVALID_INPUT,     'string')
  assert.equal(typeof API_ERROR.BRAIN_UNAVAILABLE, 'string')
  assert.equal(typeof API_ERROR.INTERNAL,          'string')
})

test('API_LIMITS has positive numeric values', () => {
  for (const [key, val] of Object.entries(API_LIMITS)) {
    assert.ok(typeof val === 'number' && val > 0, `${key} must be a positive number`)
  }
})

test('PRIORITY_RANK: HIGH > MEDIUM > LOW', () => {
  assert.ok(PRIORITY_RANK.HIGH > PRIORITY_RANK.MEDIUM)
  assert.ok(PRIORITY_RANK.MEDIUM > PRIORITY_RANK.LOW)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — api-response.js builders
// ─────────────────────────────────────────────────────────────────────────────

test('toSuccess: returns ok=true with apiVersion and data', () => {
  const r = toSuccess({ foo: 'bar' }, { t0: Date.now() - 10 })
  assert.equal(r.apiVersion,   API_VERSION)
  assert.equal(r.status,       API_STATUS.OK)
  assert.equal(r.ok,           true)
  assert.equal(r.error,        null)
  assert.deepEqual(r.data,     { foo: 'bar' })
  assert.ok(typeof r.generatedAt === 'string')
  assert.ok(r.durationMs >= 0)
})

test('toSuccess: data null when no payload', () => {
  const r = toSuccess(null, {})
  assert.equal(r.data, null)
})

test('toError: returns ok=false with error object', () => {
  const r = toError(new Error('test error'), { t0: Date.now(), code: 'INTERNAL_ERROR' })
  assert.equal(r.ok,            false)
  assert.equal(r.status,        API_STATUS.ERROR)
  assert.equal(r.data,          null)
  assert.equal(r.error.message, 'test error')
  assert.equal(r.error.code,    'INTERNAL_ERROR')
})

test('toError: accepts string errors', () => {
  const r = toError('something went wrong', {})
  assert.equal(r.error.message, 'something went wrong')
})

test('toError: uses INTERNAL as default code', () => {
  const r = toError('boom', {})
  assert.equal(r.error.code, API_ERROR.INTERNAL)
})

test('toDisabled: returns ok=false with FEATURE_DISABLED code', () => {
  const r = toDisabled(FEATURE_FLAG.DASHBOARD, { t0: Date.now() })
  assert.equal(r.ok,           false)
  assert.equal(r.status,       API_STATUS.DISABLED)
  assert.equal(r.data,         null)
  assert.equal(r.error.code,   API_ERROR.DISABLED)
  assert.ok(r.error.message.includes(FEATURE_FLAG.DASHBOARD))
})

test('isFlagEnabled: true by default (flag absent)', () => {
  assert.equal(isFlagEnabled(FEATURE_FLAG.DASHBOARD, {}), true)
  assert.equal(isFlagEnabled(FEATURE_FLAG.DASHBOARD, { flags: {} }), true)
})

test('isFlagEnabled: false when explicitly set to false', () => {
  assert.equal(
    isFlagEnabled(FEATURE_FLAG.DASHBOARD, { flags: { 'ai.dashboard': false } }),
    false
  )
})

test('isFlagEnabled: true when explicitly set to true', () => {
  assert.equal(
    isFlagEnabled(FEATURE_FLAG.DASHBOARD, { flags: { 'ai.dashboard': true } }),
    true
  )
})

test('isFlagEnabled: different flags are independent', () => {
  const opts = { flags: { 'ai.dashboard': false, 'ai.playerInsight': true } }
  assert.equal(isFlagEnabled(FEATURE_FLAG.DASHBOARD,      opts), false)
  assert.equal(isFlagEnabled(FEATURE_FLAG.PLAYER_INSIGHT, opts), true)
})

test('every ApiResponse has all 7 required envelope fields', () => {
  const responses = [
    toSuccess({ x: 1 }, {}),
    toError('err', {}),
    toDisabled('ai.x', {}),
  ]
  for (const r of responses) {
    assert.ok('apiVersion'  in r, 'apiVersion missing')
    assert.ok('status'      in r, 'status missing')
    assert.ok('ok'          in r, 'ok missing')
    assert.ok('generatedAt' in r, 'generatedAt missing')
    assert.ok('durationMs'  in r, 'durationMs missing')
    assert.ok('data'        in r, 'data missing')
    assert.ok('error'       in r, 'error missing')
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — getDashboard
// ─────────────────────────────────────────────────────────────────────────────

test('getDashboard: never rejects', async () => {
  await assert.doesNotReject(getDashboard(null, null))
  await assert.doesNotReject(getDashboard('coach-1', 'club-1'))
  await assert.doesNotReject(getDashboard(undefined, undefined))
})

test('getDashboard: returns ApiResponse envelope', async () => {
  const r = await getDashboard('coach-1', 'club-1')
  assert.equal(r.apiVersion, API_VERSION)
  assert.ok(typeof r.ok          === 'boolean')
  assert.ok(typeof r.status      === 'string')
  assert.ok(typeof r.generatedAt === 'string')
  assert.ok(typeof r.durationMs  === 'number')
})

test('getDashboard: ok=true on success', async () => {
  const r = await getDashboard('coach-1', 'club-1')
  assert.equal(r.ok, true)
})

test('getDashboard: data has all required fields', async () => {
  const r = await getDashboard('coach-1', 'club-1')
  assert.ok(r.ok)
  const d = r.data
  assert.ok('coachId'               in d, 'coachId missing')
  assert.ok('clubId'                in d, 'clubId missing')
  assert.ok('topRecommendations'    in d, 'topRecommendations missing')
  assert.ok('planningChecklist'     in d, 'planningChecklist missing')
  assert.ok('importantObservations' in d, 'importantObservations missing')
  assert.ok('urgentPolicyWarnings'  in d, 'urgentPolicyWarnings missing')
  assert.ok('explanationSummaries'  in d, 'explanationSummaries missing')
  assert.ok('confidence'            in d, 'confidence missing')
  assert.ok('isMock'                in d, 'isMock missing')
})

test('getDashboard: topRecommendations is an array', async () => {
  const r = await getDashboard('coach-1', 'club-1')
  assert.ok(Array.isArray(r.data.topRecommendations))
})

test('getDashboard: topRecommendations max length is API_LIMITS.TOP_RECOMMENDATIONS', async () => {
  const r = await getDashboard('coach-1', 'club-1')
  assert.ok(r.data.topRecommendations.length <= API_LIMITS.TOP_RECOMMENDATIONS)
})

test('getDashboard: each topRecommendation has required fields', async () => {
  const r = await getDashboard('coach-1', 'club-1')
  for (const rec of r.data.topRecommendations) {
    assert.ok('id'           in rec, 'rec.id missing')
    assert.ok('title'        in rec, 'rec.title missing')
    assert.ok('category'     in rec, 'rec.category missing')
    assert.ok('priority'     in rec, 'rec.priority missing')
    assert.ok('confidence'   in rec, 'rec.confidence missing')
    assert.ok('action'       in rec, 'rec.action missing')
    assert.ok('policyStatus' in rec, 'rec.policyStatus missing')
  }
})

test('getDashboard: planningChecklist is an array', async () => {
  const r = await getDashboard('coach-1', 'club-1')
  assert.ok(Array.isArray(r.data.planningChecklist))
})

test('getDashboard: each checklist item has planId, actionId, title, suggestedDate', async () => {
  const r = await getDashboard('coach-1', 'club-1')
  for (const item of r.data.planningChecklist) {
    assert.ok('planId'           in item)
    assert.ok('recommendationId' in item)
    assert.ok('actionId'         in item)
    assert.ok('title'            in item)
    assert.ok('suggestedDate'    in item)
    assert.ok('planScope'        in item)
    assert.ok('planStatus'       in item)
  }
})

test('getDashboard: importantObservations is an array', async () => {
  const r = await getDashboard('coach-1', 'club-1')
  assert.ok(Array.isArray(r.data.importantObservations))
})

test('getDashboard: urgentPolicyWarnings is an array', async () => {
  const r = await getDashboard('coach-1', 'club-1')
  assert.ok(Array.isArray(r.data.urgentPolicyWarnings))
})

test('getDashboard: explanationSummaries is an array', async () => {
  const r = await getDashboard('coach-1', 'club-1')
  assert.ok(Array.isArray(r.data.explanationSummaries))
})

test('getDashboard: confidence is number or null', async () => {
  const r = await getDashboard('coach-1', 'club-1')
  const c = r.data.confidence
  assert.ok(c === null || typeof c === 'number')
})

test('getDashboard: disabled when feature flag off', async () => {
  const r = await getDashboard('c', 'b', { flags: { 'ai.dashboard': false } })
  assert.equal(r.ok,     false)
  assert.equal(r.status, API_STATUS.DISABLED)
  assert.equal(r.data,   null)
  assert.equal(r.error.code, API_ERROR.DISABLED)
})

test('getDashboard: coachId and clubId echoed in data', async () => {
  const r = await getDashboard('coach-x', 'club-x')
  assert.equal(r.data.coachId, 'coach-x')
  assert.equal(r.data.clubId,  'club-x')
})

test('getDashboard: durationMs is non-negative', async () => {
  const r = await getDashboard('c', 'b')
  assert.ok(r.durationMs >= 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — getPlayerInsight
// ─────────────────────────────────────────────────────────────────────────────

test('getPlayerInsight: never rejects', async () => {
  await assert.doesNotReject(getPlayerInsight('player-1'))
  await assert.doesNotReject(getPlayerInsight(null))
  await assert.doesNotReject(getPlayerInsight(undefined))
})

test('getPlayerInsight: returns ApiResponse envelope', async () => {
  const r = await getPlayerInsight('player-1')
  assert.equal(r.apiVersion, API_VERSION)
  assert.ok(typeof r.ok === 'boolean')
})

test('getPlayerInsight: ok=true for valid playerId', async () => {
  const r = await getPlayerInsight('player-1')
  assert.equal(r.ok, true)
})

test('getPlayerInsight: ok=false for missing playerId', async () => {
  const r = await getPlayerInsight(null)
  assert.equal(r.ok, false)
})

test('getPlayerInsight: data has all required fields', async () => {
  const r = await getPlayerInsight('player-1')
  assert.ok(r.ok)
  const d = r.data
  assert.ok('playerId'                in d, 'playerId missing')
  assert.ok('attendanceTrend'         in d, 'attendanceTrend missing')
  assert.ok('availabilityTrend'       in d, 'availabilityTrend missing')
  assert.ok('improvementObservations' in d, 'improvementObservations missing')
  assert.ok('welfareObservations'     in d, 'welfareObservations missing')
  assert.ok('supportingEvidence'      in d, 'supportingEvidence missing')
  assert.ok('explanations'            in d, 'explanations missing')
  assert.ok('isMock'                  in d, 'isMock missing')
})

test('getPlayerInsight: playerId echoed in data', async () => {
  const r = await getPlayerInsight('player-xyz')
  assert.equal(r.data.playerId, 'player-xyz')
})

test('getPlayerInsight: attendanceTrend has trend, recentRate, evidence', async () => {
  const r = await getPlayerInsight('player-1')
  const t = r.data.attendanceTrend
  assert.ok('trend'      in t)
  assert.ok('recentRate' in t)
  assert.ok('evidence'   in t)
  assert.ok(Array.isArray(t.evidence))
})

test('getPlayerInsight: attendanceTrend.trend is a known value or unknown', async () => {
  const r = await getPlayerInsight('player-1')
  const valid = ['improving', 'stable', 'declining', 'unknown']
  assert.ok(valid.includes(r.data.attendanceTrend.trend))
})

test('getPlayerInsight: availabilityTrend has same shape as attendanceTrend', async () => {
  const r = await getPlayerInsight('player-1')
  const t = r.data.availabilityTrend
  assert.ok('trend'      in t)
  assert.ok('recentRate' in t)
  assert.ok('evidence'   in t)
})

test('getPlayerInsight: improvementObservations is an array', async () => {
  const r = await getPlayerInsight('player-1')
  assert.ok(Array.isArray(r.data.improvementObservations))
})

test('getPlayerInsight: welfareObservations is an array', async () => {
  const r = await getPlayerInsight('player-1')
  assert.ok(Array.isArray(r.data.welfareObservations))
})

test('getPlayerInsight: supportingEvidence is an array', async () => {
  const r = await getPlayerInsight('player-1')
  assert.ok(Array.isArray(r.data.supportingEvidence))
})

test('getPlayerInsight: explanations is an array', async () => {
  const r = await getPlayerInsight('player-1')
  assert.ok(Array.isArray(r.data.explanations))
})

test('getPlayerInsight: disabled when feature flag off', async () => {
  const r = await getPlayerInsight('player-1', { flags: { 'ai.playerInsight': false } })
  assert.equal(r.ok,   false)
  assert.equal(r.status, API_STATUS.DISABLED)
  assert.equal(r.error.code, API_ERROR.DISABLED)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — getTeamInsight
// ─────────────────────────────────────────────────────────────────────────────

test('getTeamInsight: never rejects', async () => {
  await assert.doesNotReject(getTeamInsight('team-1'))
  await assert.doesNotReject(getTeamInsight(null))
  await assert.doesNotReject(getTeamInsight(undefined))
})

test('getTeamInsight: returns ApiResponse envelope', async () => {
  const r = await getTeamInsight('team-1')
  assert.equal(r.apiVersion, API_VERSION)
  assert.ok(typeof r.ok === 'boolean')
})

test('getTeamInsight: ok=true for valid teamId', async () => {
  const r = await getTeamInsight('team-1')
  assert.equal(r.ok, true)
})

test('getTeamInsight: ok=false for missing teamId', async () => {
  const r = await getTeamInsight(null)
  assert.equal(r.ok, false)
})

test('getTeamInsight: data has all required fields', async () => {
  const r = await getTeamInsight('team-1')
  assert.ok(r.ok)
  const d = r.data
  assert.ok('teamId'            in d, 'teamId missing')
  assert.ok('squadHealth'       in d, 'squadHealth missing')
  assert.ok('availability'      in d, 'availability missing')
  assert.ok('trainingLoad'      in d, 'trainingLoad missing')
  assert.ok('preparationStatus' in d, 'preparationStatus missing')
  assert.ok('planningActions'   in d, 'planningActions missing')
  assert.ok('isMock'            in d, 'isMock missing')
})

test('getTeamInsight: teamId echoed in data', async () => {
  const r = await getTeamInsight('team-abc')
  assert.equal(r.data.teamId, 'team-abc')
})

test('getTeamInsight: squadHealth has score and isMock', async () => {
  const r = await getTeamInsight('team-1')
  const sh = r.data.squadHealth
  assert.ok('score'  in sh)
  assert.ok('isMock' in sh)
})

test('getTeamInsight: availability has confirmed, pending, unavailable', async () => {
  const r = await getTeamInsight('team-1')
  const av = r.data.availability
  assert.ok('confirmed'   in av)
  assert.ok('pending'     in av)
  assert.ok('unavailable' in av)
})

test('getTeamInsight: trainingLoad has status field', async () => {
  const r = await getTeamInsight('team-1')
  const tl = r.data.trainingLoad
  assert.ok('status' in tl)
  const valid = ['normal', 'high', 'low', 'unknown']
  assert.ok(valid.includes(tl.status))
})

test('getTeamInsight: preparationStatus has readiness and activePlans', async () => {
  const r = await getTeamInsight('team-1')
  const ps = r.data.preparationStatus
  assert.ok('readiness'   in ps)
  assert.ok('activePlans' in ps)
  assert.ok(Array.isArray(ps.activePlans))
})

test('getTeamInsight: planningActions is an array', async () => {
  const r = await getTeamInsight('team-1')
  assert.ok(Array.isArray(r.data.planningActions))
})

test('getTeamInsight: disabled when feature flag off', async () => {
  const r = await getTeamInsight('team-1', { flags: { 'ai.teamInsight': false } })
  assert.equal(r.ok,   false)
  assert.equal(r.status, API_STATUS.DISABLED)
  assert.equal(r.error.code, API_ERROR.DISABLED)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 6 — getClubInsight
// ─────────────────────────────────────────────────────────────────────────────

test('getClubInsight: never rejects', async () => {
  await assert.doesNotReject(getClubInsight('club-1'))
  await assert.doesNotReject(getClubInsight(null))
  await assert.doesNotReject(getClubInsight(undefined))
})

test('getClubInsight: returns ApiResponse envelope', async () => {
  const r = await getClubInsight('club-1')
  assert.equal(r.apiVersion, API_VERSION)
  assert.ok(typeof r.ok === 'boolean')
})

test('getClubInsight: ok=true for valid clubId', async () => {
  const r = await getClubInsight('club-1')
  assert.equal(r.ok, true)
})

test('getClubInsight: ok=false for missing clubId', async () => {
  const r = await getClubInsight(null)
  assert.equal(r.ok, false)
})

test('getClubInsight: data has all required fields', async () => {
  const r = await getClubInsight('club-1')
  assert.ok(r.ok)
  const d = r.data
  assert.ok('clubId'            in d, 'clubId missing')
  assert.ok('activity'          in d, 'activity missing')
  assert.ok('engagement'        in d, 'engagement missing')
  assert.ok('operationalHealth' in d, 'operationalHealth missing')
  assert.ok('trends'            in d, 'trends missing')
  assert.ok('recommendations'   in d, 'recommendations missing')
  assert.ok('isMock'            in d, 'isMock missing')
})

test('getClubInsight: clubId echoed in data', async () => {
  const r = await getClubInsight('club-99')
  assert.equal(r.data.clubId, 'club-99')
})

test('getClubInsight: activity has totalEvents and recentEvents', async () => {
  const r = await getClubInsight('club-1')
  const a = r.data.activity
  assert.ok('totalEvents'  in a)
  assert.ok('recentEvents' in a)
  assert.ok(Array.isArray(a.recentEvents))
  assert.ok(typeof a.totalEvents === 'number')
})

test('getClubInsight: engagement has score and trend', async () => {
  const r = await getClubInsight('club-1')
  const e = r.data.engagement
  assert.ok('score'  in e)
  assert.ok('trend'  in e)
  assert.ok('isMock' in e)
})

test('getClubInsight: operationalHealth has score and grade', async () => {
  const r = await getClubInsight('club-1')
  const oh = r.data.operationalHealth
  assert.ok('score'  in oh)
  assert.ok('grade'  in oh)
  assert.ok('isMock' in oh)
})

test('getClubInsight: trends is an array', async () => {
  const r = await getClubInsight('club-1')
  assert.ok(Array.isArray(r.data.trends))
  assert.ok(r.data.trends.length <= API_LIMITS.TRENDS)
})

test('getClubInsight: recommendations is an array', async () => {
  const r = await getClubInsight('club-1')
  assert.ok(Array.isArray(r.data.recommendations))
  assert.ok(r.data.recommendations.length <= API_LIMITS.TOP_RECOMMENDATIONS)
})

test('getClubInsight: each recommendation has id, title, priority, confidence', async () => {
  const r = await getClubInsight('club-1')
  for (const rec of r.data.recommendations) {
    assert.ok('id'         in rec)
    assert.ok('title'      in rec)
    assert.ok('priority'   in rec)
    assert.ok('confidence' in rec)
  }
})

test('getClubInsight: disabled when feature flag off', async () => {
  const r = await getClubInsight('club-1', { flags: { 'ai.clubInsight': false } })
  assert.equal(r.ok,   false)
  assert.equal(r.status, API_STATUS.DISABLED)
  assert.equal(r.error.code, API_ERROR.DISABLED)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 7 — AI namespace exports
// ─────────────────────────────────────────────────────────────────────────────

test('AI.getDashboard is exposed', () => {
  assert.equal(typeof AI.getDashboard, 'function')
})

test('AI.getPlayerInsight is exposed', () => {
  assert.equal(typeof AI.getPlayerInsight, 'function')
})

test('AI.getTeamInsight is exposed', () => {
  assert.equal(typeof AI.getTeamInsight, 'function')
})

test('AI.getClubInsight is exposed', () => {
  assert.equal(typeof AI.getClubInsight, 'function')
})

test('AI.getDashboard: never rejects', async () => {
  await assert.doesNotReject(AI.getDashboard(null, null))
  await assert.doesNotReject(AI.getDashboard('c', 'b'))
})

test('AI.getDashboard: returns valid envelope', async () => {
  const r = await AI.getDashboard('c', 'b')
  assert.equal(r.apiVersion, API_VERSION)
  assert.ok(typeof r.ok === 'boolean')
})

test('AI.getPlayerInsight: never rejects', async () => {
  await assert.doesNotReject(AI.getPlayerInsight('player-1'))
})

test('AI.getTeamInsight: never rejects', async () => {
  await assert.doesNotReject(AI.getTeamInsight('team-1'))
})

test('AI.getClubInsight: never rejects', async () => {
  await assert.doesNotReject(AI.getClubInsight('club-1'))
})

test('AI namespace: all four M15 methods return ApiResponse with apiVersion v1', async () => {
  const results = await Promise.all([
    AI.getDashboard('c', 'b'),
    AI.getPlayerInsight('p'),
    AI.getTeamInsight('t'),
    AI.getClubInsight('b'),
  ])
  for (const r of results) {
    assert.equal(r.apiVersion, 'v1')
    assert.ok(typeof r.ok === 'boolean')
    assert.ok(typeof r.status === 'string')
    assert.ok('data' in r)
    assert.ok('error' in r)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 8 — M1–M14 regression
// ─────────────────────────────────────────────────────────────────────────────

test('AI.request() BrainResponse shape preserved after M15', async () => {
  const r = await AI.request({})
  assert.ok(Array.isArray(r.recommendations))
  assert.ok('meta'  in r)
  assert.ok('trace' in r)
  assert.ok('isMock' in r.meta)
})

test('AI.request() meta.plans present after M15', async () => {
  const r = await AI.request({})
  assert.ok('plans' in r.meta)
  assert.ok(Array.isArray(r.meta.plans))
})

test('AI.request() trace.modules includes planning after M15', async () => {
  const r = await AI.request({})
  assert.ok(r.trace.modules.includes('planning'))
})

test('AI.plan() still resolves after M15', async () => {
  await assert.doesNotReject(AI.plan(null))
})

test('AI.policyCheck() still resolves after M15', async () => {
  const r      = await AI.request({})
  const result = await AI.policyCheck(r)
  assert.ok(typeof result.overallStatus === 'string')
})

test('AI.explain() still resolves after M15', async () => {
  const r   = await AI.request({})
  const exp = await AI.explain(r.recommendations[0]?.id)
  if (exp) assert.ok(typeof exp.plainLanguageExplanation === 'string')
})

test('AI.status() still returns { cis, accuracy } after M15', async () => {
  const r = await AI.status()
  assert.ok(typeof r.cis      === 'object')
  assert.ok(typeof r.accuracy === 'object')
})

test('AI.ask() still resolves after M15', async () => {
  const r = await AI.ask('test question')
  assert.equal(typeof r.answer, 'string')
})

test('AI.learn() still resolves after M15', async () => {
  await assert.doesNotReject(
    AI.learn({ outcome: 'accepted', recommendationType: 'Training' })
  )
})

test('AI.memory.* still resolves after M15', async () => {
  await assert.doesNotReject(AI.memory.get('m15-reg'))
})

test('AI.observations.* still resolves after M15', async () => {
  await assert.doesNotReject(AI.observations.all())
})

test('getDashboard and getPlayerInsight return independent responses', async () => {
  const [dash, player] = await Promise.all([
    AI.getDashboard('c', 'b'),
    AI.getPlayerInsight('player-1'),
  ])
  assert.equal(dash.apiVersion,   'v1')
  assert.equal(player.apiVersion, 'v1')
  // They have different data shapes
  if (dash.ok && player.ok) {
    assert.ok('topRecommendations' in dash.data)
    assert.ok('attendanceTrend'    in player.data)
  }
})
