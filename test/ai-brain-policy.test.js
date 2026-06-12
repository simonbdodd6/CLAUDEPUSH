/**
 * AI Brain — M12 Brain Safety Policy Guard Tests
 *
 * Verifies:
 * 1. policy-types.js  — constants and STATUS_RANK
 * 2. policy-rules.js  — each of the 8 rules in isolation
 * 3. policy-engine.js — checkRecommendation + checkPolicy shapes
 * 4. AI.policyCheck() — integration, never rejects, backward compat
 * 5. Safety contracts — evidence/confidence immutability, no deletions
 * 6. M1–M11 regression — all prior AI contracts unaffected
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'crypto'

import { POLICY_STATUS, RULE_ID, STATUS_RANK, POLICY_SCHEMA_VERSION } from '../ai-brain/policy/policy-types.js'
import {
  checkSelectionChange, checkAutoMessaging, checkMedicalAction,
  checkDisciplineAction, checkPrivateData, checkCrossClubData,
  checkMissingEvidence, checkHighImpact, RULES,
} from '../ai-brain/policy/policy-rules.js'
import { checkRecommendation, checkPolicy } from '../ai-brain/policy/policy-engine.js'
import { AI } from '../ai-brain/index.js'
import { makeRec, CATEGORY, PRIORITY } from '../ai-brain/reasoners/shared.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function rec(overrides = {}) {
  return makeRec({
    category:       overrides.category       ?? CATEGORY.TRAINING,
    priority:       overrides.priority       ?? PRIORITY.MEDIUM,
    confidence:     overrides.confidence     ?? 65,
    title:          overrides.title          ?? 'Improve sprint endurance',
    description:    overrides.description    ?? 'Increase high-intensity interval work.',
    action:         overrides.action         ?? 'Adjust training plan for next session.',
    source:         overrides.source         ?? 'coach-reasoner',
    explainability: 'Evidence from recent session data.',
    evidence:       overrides.evidence       ?? [{ type: 'metric', source: 'session', value: 'sprint_load', confidence: 70 }],
  })
}

function lowRiskRec() {
  return rec()   // Training, MEDIUM, has evidence — no rules should trigger
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — policy-types.js
// ─────────────────────────────────────────────────────────────────────────────

test('POLICY_STATUS has the three required values', () => {
  assert.equal(POLICY_STATUS.ALLOWED,      'allowed')
  assert.equal(POLICY_STATUS.NEEDS_REVIEW, 'needs_review')
  assert.equal(POLICY_STATUS.BLOCKED,      'blocked')
})

test('STATUS_RANK preserves severity order: allowed < needs_review < blocked', () => {
  assert.ok(STATUS_RANK.allowed      < STATUS_RANK.needs_review)
  assert.ok(STATUS_RANK.needs_review < STATUS_RANK.blocked)
})

test('RULE_ID has all 8 rule identifiers', () => {
  assert.equal(typeof RULE_ID.SELECTION_CHANGE,  'string')
  assert.equal(typeof RULE_ID.AUTO_MESSAGING,    'string')
  assert.equal(typeof RULE_ID.MEDICAL_ACTION,    'string')
  assert.equal(typeof RULE_ID.DISCIPLINE_ACTION, 'string')
  assert.equal(typeof RULE_ID.PRIVATE_DATA,      'string')
  assert.equal(typeof RULE_ID.CROSS_CLUB_DATA,   'string')
  assert.equal(typeof RULE_ID.MISSING_EVIDENCE,  'string')
  assert.equal(typeof RULE_ID.HIGH_IMPACT,       'string')
})

test('POLICY_SCHEMA_VERSION is a string', () => {
  assert.equal(typeof POLICY_SCHEMA_VERSION, 'string')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — policy-rules.js: each rule in isolation
// ─────────────────────────────────────────────────────────────────────────────

// Rule 1 — SELECTION_CHANGE

test('checkSelectionChange: triggered for Selection category', () => {
  const r = checkSelectionChange(rec({ category: 'Selection' }))
  assert.equal(r.triggered,  true)
  assert.equal(r.status,     POLICY_STATUS.NEEDS_REVIEW)
  assert.equal(r.ruleId,     RULE_ID.SELECTION_CHANGE)
  assert.ok(typeof r.reason === 'string' && r.reason.length > 0)
})

test('checkSelectionChange: not triggered for Training category', () => {
  const r = checkSelectionChange(rec({ category: 'Training' }))
  assert.equal(r.triggered, false)
  assert.equal(r.status,    POLICY_STATUS.ALLOWED)
  assert.equal(r.reason,    null)
})

test('checkSelectionChange: not triggered for Medical category', () => {
  assert.equal(checkSelectionChange(rec({ category: 'Medical' })).triggered, false)
})

// Rule 2 — AUTO_MESSAGING

test('checkAutoMessaging: blocked when action contains "send message"', () => {
  const r = checkAutoMessaging(rec({ action: 'Send message to player about training' }))
  assert.equal(r.triggered, true)
  assert.equal(r.status,    POLICY_STATUS.BLOCKED)
  assert.equal(r.ruleId,    RULE_ID.AUTO_MESSAGING)
})

test('checkAutoMessaging: blocked when action contains "notify player"', () => {
  const r = checkAutoMessaging(rec({ action: 'Notify player of selection decision' }))
  assert.equal(r.triggered, true)
  assert.equal(r.status,    POLICY_STATUS.BLOCKED)
})

test('checkAutoMessaging: blocked when action contains "message player"', () => {
  const r = checkAutoMessaging(rec({ action: 'Message player about injury concern' }))
  assert.equal(r.triggered, true)
  assert.equal(r.status,    POLICY_STATUS.BLOCKED)
})

test('checkAutoMessaging: blocked when category is Messaging', () => {
  const r = checkAutoMessaging(rec({ category: 'Messaging' }))
  assert.equal(r.triggered, true)
  assert.equal(r.status,    POLICY_STATUS.BLOCKED)
})

test('checkAutoMessaging: allowed for normal training action', () => {
  const r = checkAutoMessaging(rec({ action: 'Adjust sprint intervals in next session' }))
  assert.equal(r.triggered, false)
  assert.equal(r.status,    POLICY_STATUS.ALLOWED)
})

// Rule 3 — MEDICAL_ACTION

test('checkMedicalAction: triggered for Medical category', () => {
  const r = checkMedicalAction(rec({ category: 'Medical' }))
  assert.equal(r.triggered, true)
  assert.equal(r.status,    POLICY_STATUS.NEEDS_REVIEW)
  assert.equal(r.ruleId,    RULE_ID.MEDICAL_ACTION)
})

test('checkMedicalAction: triggered for Player Welfare category', () => {
  const r = checkMedicalAction(rec({ category: 'Player Welfare' }))
  assert.equal(r.triggered, true)
  assert.equal(r.status,    POLICY_STATUS.NEEDS_REVIEW)
})

test('checkMedicalAction: not triggered for Training category', () => {
  const r = checkMedicalAction(rec({ category: 'Training' }))
  assert.equal(r.triggered, false)
  assert.equal(r.status,    POLICY_STATUS.ALLOWED)
})

test('checkMedicalAction: not triggered for Performance category', () => {
  assert.equal(checkMedicalAction(rec({ category: 'Performance' })).triggered, false)
})

// Rule 4 — DISCIPLINE_ACTION

test('checkDisciplineAction: triggered when action contains "discipline"', () => {
  const r = checkDisciplineAction(rec({ action: 'Discipline player for repeated lateness' }))
  assert.equal(r.triggered, true)
  assert.equal(r.status,    POLICY_STATUS.NEEDS_REVIEW)
  assert.equal(r.ruleId,    RULE_ID.DISCIPLINE_ACTION)
})

test('checkDisciplineAction: triggered when title contains "suspend"', () => {
  const r = checkDisciplineAction(rec({ title: 'Suspend player from next match' }))
  assert.equal(r.triggered, true)
  assert.equal(r.status,    POLICY_STATUS.NEEDS_REVIEW)
})

test('checkDisciplineAction: triggered when action contains "bench player"', () => {
  const r = checkDisciplineAction(rec({ action: 'Bench player for poor conduct' }))
  assert.equal(r.triggered, true)
})

test('checkDisciplineAction: not triggered for normal training', () => {
  const r = checkDisciplineAction(rec({ title: 'Increase training load', action: 'Add 2 extra sessions' }))
  assert.equal(r.triggered, false)
  assert.equal(r.status,    POLICY_STATUS.ALLOWED)
})

// Rule 5 — PRIVATE_DATA

test('checkPrivateData: triggered when evidence type is health_record', () => {
  const r = checkPrivateData(rec({
    evidence: [{ type: 'health_record', source: 'physio', value: 'injury_history', confidence: 80 }],
  }))
  assert.equal(r.triggered, true)
  assert.equal(r.status,    POLICY_STATUS.NEEDS_REVIEW)
  assert.equal(r.ruleId,    RULE_ID.PRIVATE_DATA)
  assert.ok(typeof r.warning === 'string')
})

test('checkPrivateData: triggered when evidence source contains medical_record', () => {
  const r = checkPrivateData(rec({
    evidence: [{ type: 'metric', source: 'medical_record', value: 'blood_test', confidence: 75 }],
  }))
  assert.equal(r.triggered, true)
  assert.equal(r.status,    POLICY_STATUS.NEEDS_REVIEW)
})

test('checkPrivateData: triggered when evidence type contains personal_data', () => {
  const r = checkPrivateData(rec({
    evidence: [{ type: 'personal_data', source: 'player_profile', value: 'contract_info', confidence: 60 }],
  }))
  assert.equal(r.triggered, true)
})

test('checkPrivateData: not triggered for normal session metric evidence', () => {
  const r = checkPrivateData(rec({
    evidence: [{ type: 'metric', source: 'session', value: 'sprint_load', confidence: 70 }],
  }))
  assert.equal(r.triggered, false)
  assert.equal(r.status,    POLICY_STATUS.ALLOWED)
})

test('checkPrivateData: not triggered when evidence is empty', () => {
  // empty evidence triggers MISSING_EVIDENCE, not PRIVATE_DATA
  const r = checkPrivateData(rec({ evidence: [] }))
  assert.equal(r.triggered, false)
})

// Rule 6 — CROSS_CLUB_DATA

test('checkCrossClubData: blocked when evidence contains foreign clubId', () => {
  const r = checkCrossClubData(
    rec({ evidence: [{ type: 'metric', source: 'session', clubId: 'club-B', value: 'load' }] }),
    { clubId: 'club-A' }
  )
  assert.equal(r.triggered, true)
  assert.equal(r.status,    POLICY_STATUS.BLOCKED)
  assert.equal(r.ruleId,    RULE_ID.CROSS_CLUB_DATA)
})

test('checkCrossClubData: allowed when evidence clubId matches context', () => {
  const r = checkCrossClubData(
    rec({ evidence: [{ type: 'metric', source: 'session', clubId: 'club-A', value: 'load' }] }),
    { clubId: 'club-A' }
  )
  assert.equal(r.triggered, false)
  assert.equal(r.status,    POLICY_STATUS.ALLOWED)
})

test('checkCrossClubData: allowed when no context clubId provided', () => {
  const r = checkCrossClubData(
    rec({ evidence: [{ type: 'metric', source: 'session', clubId: 'club-B', value: 'load' }] }),
    {}
  )
  assert.equal(r.triggered, false)
  assert.equal(r.status,    POLICY_STATUS.ALLOWED)
})

test('checkCrossClubData: allowed when evidence has no clubId at all', () => {
  const r = checkCrossClubData(
    rec({ evidence: [{ type: 'metric', source: 'session', value: 'load' }] }),
    { clubId: 'club-A' }
  )
  assert.equal(r.triggered, false)
  assert.equal(r.status,    POLICY_STATUS.ALLOWED)
})

// Rule 7 — MISSING_EVIDENCE

test('checkMissingEvidence: triggered when evidence array is empty', () => {
  const r = checkMissingEvidence(rec({ evidence: [] }))
  assert.equal(r.triggered, true)
  assert.equal(r.status,    POLICY_STATUS.NEEDS_REVIEW)
  assert.equal(r.ruleId,    RULE_ID.MISSING_EVIDENCE)
})

test('checkMissingEvidence: triggered when evidence field is missing', () => {
  const bare = makeRec({ category: CATEGORY.TRAINING, priority: PRIORITY.MEDIUM, confidence: 60, title: 't', description: 'd', action: 'a', source: 's', explainability: 'e' })
  delete bare.evidence
  const r = checkMissingEvidence(bare)
  assert.equal(r.triggered, true)
})

test('checkMissingEvidence: not triggered when evidence has items', () => {
  const r = checkMissingEvidence(rec({ evidence: [{ type: 'metric', source: 'session', value: 'load' }] }))
  assert.equal(r.triggered, false)
  assert.equal(r.status,    POLICY_STATUS.ALLOWED)
})

// Rule 8 — HIGH_IMPACT

test('checkHighImpact: triggered for HIGH priority', () => {
  const r = checkHighImpact(rec({ priority: 'HIGH' }))
  assert.equal(r.triggered, true)
  assert.equal(r.status,    POLICY_STATUS.NEEDS_REVIEW)
  assert.equal(r.ruleId,    RULE_ID.HIGH_IMPACT)
})

test('checkHighImpact: not triggered for MEDIUM priority', () => {
  const r = checkHighImpact(rec({ priority: 'MEDIUM' }))
  assert.equal(r.triggered, false)
  assert.equal(r.status,    POLICY_STATUS.ALLOWED)
})

test('checkHighImpact: not triggered for LOW priority', () => {
  const r = checkHighImpact(rec({ priority: 'LOW' }))
  assert.equal(r.triggered, false)
  assert.equal(r.status,    POLICY_STATUS.ALLOWED)
})

// RULES registry

test('RULES array contains exactly 8 rules', () => {
  assert.equal(RULES.length, 8)
  assert.ok(RULES.every(r => typeof r === 'function'))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — policy-engine: checkRecommendation + checkPolicy shapes
// ─────────────────────────────────────────────────────────────────────────────

test('checkRecommendation: returns rec with policy field attached', () => {
  const result = checkRecommendation(lowRiskRec())
  assert.ok('policy' in result)
  assert.ok(typeof result.policy.status  === 'string')
  assert.ok(typeof result.policy.blocked === 'boolean')
  assert.ok(typeof result.policy.requiresReview === 'boolean')
  assert.ok(Array.isArray(result.policy.rules))
  assert.ok(Array.isArray(result.policy.warnings))
  assert.ok(Array.isArray(result.policy.reasons))
})

test('checkRecommendation: policy.rules has exactly 8 entries', () => {
  const result = checkRecommendation(lowRiskRec())
  assert.equal(result.policy.rules.length, 8)
})

test('checkRecommendation: each rule entry has ruleId, triggered, status, reason', () => {
  const result = checkRecommendation(lowRiskRec())
  for (const r of result.policy.rules) {
    assert.ok(typeof r.ruleId    === 'string')
    assert.ok(typeof r.triggered === 'boolean')
    assert.ok(typeof r.status    === 'string')
    assert.ok('reason' in r)
  }
})

test('checkRecommendation: low-risk Training/MEDIUM/with-evidence is "allowed"', () => {
  const result = checkRecommendation(lowRiskRec())
  assert.equal(result.policy.status,        POLICY_STATUS.ALLOWED)
  assert.equal(result.policy.blocked,       false)
  assert.equal(result.policy.requiresReview, false)
})

test('checkRecommendation: Medical category produces "needs_review"', () => {
  const result = checkRecommendation(rec({ category: 'Medical' }))
  assert.equal(result.policy.status, POLICY_STATUS.NEEDS_REVIEW)
  assert.equal(result.policy.requiresReview, true)
  assert.equal(result.policy.blocked, false)
})

test('checkRecommendation: Player Welfare category produces "needs_review"', () => {
  const result = checkRecommendation(rec({ category: 'Player Welfare' }))
  assert.equal(result.policy.status, POLICY_STATUS.NEEDS_REVIEW)
})

test('checkRecommendation: auto-messaging action produces "blocked"', () => {
  const result = checkRecommendation(rec({ action: 'Send message to all players about lineup' }))
  assert.equal(result.policy.status,  POLICY_STATUS.BLOCKED)
  assert.equal(result.policy.blocked, true)
})

test('checkRecommendation: cross-club evidence produces "blocked"', () => {
  const result = checkRecommendation(
    rec({ evidence: [{ type: 'metric', clubId: 'foreign-club' }] }),
    { clubId: 'home-club' }
  )
  assert.equal(result.policy.status,  POLICY_STATUS.BLOCKED)
})

test('checkRecommendation: blocked status takes precedence over needs_review', () => {
  // Medical (needs_review) + send message (blocked) → blocked
  const result = checkRecommendation(
    rec({ category: 'Medical', action: 'Send message to player' }),
  )
  assert.equal(result.policy.status,  POLICY_STATUS.BLOCKED)
})

test('checkRecommendation: missing evidence produces "needs_review"', () => {
  const result = checkRecommendation(rec({ evidence: [] }))
  assert.equal(result.policy.status, POLICY_STATUS.NEEDS_REVIEW)
})

test('checkRecommendation: HIGH priority produces "needs_review"', () => {
  const result = checkRecommendation(rec({ priority: 'HIGH' }))
  assert.equal(result.policy.status, POLICY_STATUS.NEEDS_REVIEW)
})

test('checkRecommendation: selection change produces "needs_review"', () => {
  const result = checkRecommendation(rec({ category: 'Selection' }))
  assert.equal(result.policy.status, POLICY_STATUS.NEEDS_REVIEW)
})

test('checkRecommendation: null/undefined rec returns input unchanged', () => {
  assert.equal(checkRecommendation(null), null)
  assert.equal(checkRecommendation(undefined), undefined)
})

// ── checkPolicy ──────────────────────────────────────────────────────────────

test('checkPolicy: returns required shape', () => {
  const result = checkPolicy([lowRiskRec()])
  assert.equal(typeof result.policySchemaVersion, 'string')
  assert.equal(typeof result.checkedAt,           'string')
  assert.ok(['allowed','needs_review','blocked'].includes(result.overallStatus))
  assert.ok(Array.isArray(result.recommendations))
  assert.equal(typeof result.summary.total,       'number')
  assert.equal(typeof result.summary.allowed,     'number')
  assert.equal(typeof result.summary.needsReview, 'number')
  assert.equal(typeof result.summary.blocked,     'number')
})

test('checkPolicy: accepts BrainResponse object', () => {
  const fakeResponse = { recommendations: [lowRiskRec(), lowRiskRec()] }
  const result = checkPolicy(fakeResponse)
  assert.equal(result.recommendations.length, 2)
})

test('checkPolicy: accepts array directly', () => {
  const result = checkPolicy([lowRiskRec(), lowRiskRec(), lowRiskRec()])
  assert.equal(result.recommendations.length, 3)
})

test('checkPolicy: handles empty array', () => {
  const result = checkPolicy([])
  assert.equal(result.recommendations.length, 0)
  assert.equal(result.summary.total, 0)
  assert.equal(result.overallStatus, POLICY_STATUS.ALLOWED)
})

test('checkPolicy: handles null input gracefully', () => {
  const result = checkPolicy(null)
  assert.equal(result.recommendations.length, 0)
})

test('checkPolicy: summary counts are accurate', () => {
  const recs = [
    lowRiskRec(),                                              // allowed
    rec({ evidence: [] }),                                     // needs_review (missing evidence)
    rec({ action: 'Notify player of team news' }),             // blocked
  ]
  const result = checkPolicy(recs)
  assert.equal(result.summary.total,       3)
  assert.equal(result.summary.allowed,     1)
  assert.equal(result.summary.needsReview, 1)
  assert.equal(result.summary.blocked,     1)
})

test('checkPolicy: overallStatus reflects worst-case across all recs', () => {
  // One blocked rec → overallStatus should be blocked
  const result = checkPolicy([
    lowRiskRec(),
    rec({ action: 'Send message to player about injury' }),
  ])
  assert.equal(result.overallStatus, POLICY_STATUS.BLOCKED)
})

test('checkPolicy: overallStatus is needs_review with only review-flagged recs', () => {
  const result = checkPolicy([
    rec({ evidence: [] }),
    rec({ category: 'Medical' }),
  ])
  assert.equal(result.overallStatus, POLICY_STATUS.NEEDS_REVIEW)
})

test('checkPolicy: overallStatus is allowed when all recs pass', () => {
  const result = checkPolicy([lowRiskRec(), lowRiskRec()])
  assert.equal(result.overallStatus, POLICY_STATUS.ALLOWED)
})

test('checkPolicy: all recommendations preserved (none deleted)', () => {
  const recs = [
    lowRiskRec(),
    rec({ action: 'Send message to player' }),  // blocked — must still appear
    rec({ category: 'Medical' }),               // needs_review — must still appear
  ]
  const result = checkPolicy(recs)
  assert.equal(result.recommendations.length, 3)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — Safety contracts: immutability
// ─────────────────────────────────────────────────────────────────────────────

test('policy never changes evidence', () => {
  const original = rec({
    evidence: [{ type: 'metric', source: 'session', value: 'load', confidence: 80 }],
  })
  const evidenceBefore = JSON.stringify(original.evidence)
  const result = checkRecommendation(original)
  assert.equal(JSON.stringify(result.evidence), evidenceBefore)
  assert.equal(JSON.stringify(original.evidence), evidenceBefore)  // original untouched
})

test('policy never changes confidence', () => {
  const original = rec({ confidence: 73 })
  checkRecommendation(original)
  assert.equal(original.confidence, 73)

  const result = checkRecommendation(original)
  assert.equal(result.confidence, 73)
})

test('policy never changes title or description', () => {
  const original = rec({ title: 'Exact title', description: 'Exact description' })
  const result = checkRecommendation(original)
  assert.equal(result.title,       'Exact title')
  assert.equal(result.description, 'Exact description')
})

test('policy never changes recommendation id', () => {
  const original = rec()
  const result = checkRecommendation(original)
  assert.equal(result.id, original.id)
  assert.equal(result.recommendationId, original.recommendationId)
})

test('checkPolicy does not mutate input array', () => {
  const recs   = [lowRiskRec(), rec({ evidence: [] })]
  const before = recs.map(r => r.id)
  checkPolicy(recs)
  assert.deepEqual(recs.map(r => r.id), before)
  assert.ok(!('policy' in recs[0]), 'original recs must not be mutated')
})

test('checkRecommendation does not mutate original rec', () => {
  const original = lowRiskRec()
  assert.ok(!('policy' in original), 'rec must not have policy before check')
  checkRecommendation(original)
  assert.ok(!('policy' in original), 'original rec must not have policy after check')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — AI.policyCheck() integration
// ─────────────────────────────────────────────────────────────────────────────

test('AI.policyCheck is a function on the AI namespace', () => {
  assert.equal(typeof AI.policyCheck, 'function')
})

test('AI.policyCheck() never rejects', async () => {
  await assert.doesNotReject(AI.policyCheck([]))
})

test('AI.policyCheck() with empty array returns allowed', async () => {
  const result = await AI.policyCheck([])
  assert.equal(result.overallStatus, POLICY_STATUS.ALLOWED)
  assert.equal(result.summary.total, 0)
})

test('AI.policyCheck() with Medical rec returns needs_review', async () => {
  const medRec = rec({ category: 'Medical' })
  const result = await AI.policyCheck([medRec])
  assert.equal(result.overallStatus, POLICY_STATUS.NEEDS_REVIEW)
  assert.equal(result.summary.needsReview, 1)
})

test('AI.policyCheck() with messaging rec returns blocked', async () => {
  const msgRec = rec({ action: 'Send message to all players about training tomorrow' })
  const result = await AI.policyCheck([msgRec])
  assert.equal(result.overallStatus, POLICY_STATUS.BLOCKED)
  assert.equal(result.summary.blocked, 1)
})

test('AI.policyCheck() preserves all recommendations', async () => {
  const recs = [lowRiskRec(), rec({ evidence: [] }), rec({ action: 'Notify player immediately' })]
  const result = await AI.policyCheck(recs)
  assert.equal(result.recommendations.length, 3)
})

test('AI.policyCheck() accepts BrainResponse from AI.request()', async () => {
  const response = await AI.request({})
  const result   = await AI.policyCheck(response)
  assert.ok(typeof result.overallStatus === 'string')
  assert.equal(result.recommendations.length, response.recommendations.length)
})

test('AI.policyCheck() with BrainResponse never deletes recommendations', async () => {
  const response = await AI.request({})
  const result   = await AI.policyCheck(response)
  assert.equal(result.recommendations.length, response.recommendations.length)
})

test('AI.policyCheck() result has policySchemaVersion field', async () => {
  const result = await AI.policyCheck([])
  assert.equal(typeof result.policySchemaVersion, 'string')
})

test('AI.policyCheck() result has checkedAt ISO timestamp', async () => {
  const result = await AI.policyCheck([])
  assert.ok(new Date(result.checkedAt).getTime() > 0)
})

test('AI.policyCheck() context.clubId is used for cross-club rule', async () => {
  const foreignRec = rec({ evidence: [{ type: 'metric', clubId: 'enemy-club' }] })
  const result = await AI.policyCheck([foreignRec], { clubId: 'home-club' })
  const checked = result.recommendations[0]
  assert.equal(checked.policy.status, POLICY_STATUS.BLOCKED)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 6 — AI.request() integration: policy field in BrainResponse
// ─────────────────────────────────────────────────────────────────────────────

test('AI.request() meta.policy is set after M12', async () => {
  const response = await AI.request({})
  assert.ok('policy' in response.meta, 'response.meta.policy must exist')
})

test('AI.request() meta.policy.overallStatus is a valid policy status', async () => {
  const response = await AI.request({})
  if (response.meta.policy) {
    assert.ok(['allowed','needs_review','blocked'].includes(response.meta.policy.overallStatus))
  }
})

test('AI.request() recommendations have policy fields after M12', async () => {
  const response = await AI.request({})
  for (const r of response.recommendations) {
    assert.ok('policy' in r, `recommendation ${r.id} must have policy field`)
    assert.ok(typeof r.policy.status === 'string')
    assert.ok(Array.isArray(r.policy.rules))
  }
})

test('AI.request() trace.modules includes "policy" after M12', async () => {
  const response = await AI.request({})
  assert.ok(response.trace.modules.includes('policy'), 'policy module must appear in trace')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 7 — M1–M11 regression
// ─────────────────────────────────────────────────────────────────────────────

test('AI.request() BrainResponse shape unchanged by M12', async () => {
  const r = await AI.request({})
  assert.ok(Array.isArray(r.recommendations))
  assert.ok('isMock'    in r.meta)
  assert.ok('modules'   in r.trace)
  assert.ok('duration'  in r.trace)
})

test('AI.learn() still resolves after M12', async () => {
  await assert.doesNotReject(AI.learn({ outcome: 'accepted', recommendationType: 'Training' }))
})

test('AI.ask() still resolves after M12', async () => {
  const r = await AI.ask('What is training load?')
  assert.equal(typeof r.answer, 'string')
})

test('AI.status() still returns { cis, accuracy } after M12', async () => {
  const r = await AI.status()
  assert.ok(typeof r.cis      === 'object')
  assert.ok(typeof r.accuracy === 'object')
})

test('AI.explain() still resolves after M12', async () => {
  const response = await AI.request({})
  const exp = await AI.explain(response.recommendations[0]?.id)
  if (exp) assert.ok(typeof exp.plainLanguageExplanation === 'string')
})

test('AI.reason() still resolves after M12', async () => {
  const rb = await AI.reason({})
  assert.ok(Array.isArray(rb.recommendations))
})

test('AI.memory.* still resolves after M12', async () => {
  await assert.doesNotReject(AI.memory.get('m12-reg'))
})

test('AI.observations.* still resolves after M12', async () => {
  await assert.doesNotReject(AI.observations.all())
})

test('AI.policyCheck() on null input never rejects', async () => {
  await assert.doesNotReject(AI.policyCheck(null))
})

test('recommendations still include id and recommendationId after M12', async () => {
  const r = await AI.request({})
  for (const rec of r.recommendations) {
    assert.ok(typeof rec.id === 'string')
    assert.equal(rec.recommendationId, rec.id)
  }
})
