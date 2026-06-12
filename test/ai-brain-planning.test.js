/**
 * AI Brain — M14 Planning Engine Tests
 *
 * Verifies:
 * 1. planning-types.js   — PLAN_STATUS, ACTION_STATUS, PLAN_SCOPE, PLAN_SCHEMA_VERSION
 * 2. planning-rules.js   — resolvePlanStatus policy gate; resolveScope keyword/category
 * 3. planning-library.js — all 9 templates: estimatedDurationDays, action count
 * 4. planning-engine.js  — createPlan: null for blocked; draft/active for others
 *                          createPlan: plan shape; evidence pass-through; fields
 *                          createPlans: array; blocked recs excluded
 * 5. AI.plan()           — integration; never rejects; shape; blocked → null
 * 6. AI.request()        — meta.plans present after M14
 * 7. Workflow trace      — 'planning' in modules
 * 8. M1–M13 regression   — all prior contracts unaffected
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  PLAN_SCHEMA_VERSION, PLAN_STATUS, ACTION_STATUS, PLAN_SCOPE,
} from '../ai-brain/planning/planning-types.js'
import {
  resolvePlanStatus, resolveScope,
} from '../ai-brain/planning/planning-rules.js'
import { getTemplate, ALL_SCOPES } from '../ai-brain/planning/planning-library.js'
import { createPlan, createPlans } from '../ai-brain/planning/planning-engine.js'
import { AI } from '../ai-brain/index.js'

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — planning-types.js
// ─────────────────────────────────────────────────────────────────────────────

test('PLAN_SCHEMA_VERSION is a string', () => {
  assert.equal(typeof PLAN_SCHEMA_VERSION, 'string')
})

test('PLAN_STATUS has active and draft', () => {
  assert.equal(PLAN_STATUS.ACTIVE, 'active')
  assert.equal(PLAN_STATUS.DRAFT,  'draft')
})

test('ACTION_STATUS has all four values', () => {
  assert.equal(ACTION_STATUS.PENDING,     'pending')
  assert.equal(ACTION_STATUS.IN_PROGRESS, 'in_progress')
  assert.equal(ACTION_STATUS.DONE,        'done')
  assert.equal(ACTION_STATUS.CANCELLED,   'cancelled')
})

test('PLAN_SCOPE has all 9 scopes', () => {
  assert.equal(PLAN_SCOPE.ATTENDANCE,   'attendance')
  assert.equal(PLAN_SCOPE.LOAD,         'load')
  assert.equal(PLAN_SCOPE.WELFARE,      'welfare')
  assert.equal(PLAN_SCOPE.SELECTION,    'selection')
  assert.equal(PLAN_SCOPE.PREPARATION,  'preparation')
  assert.equal(PLAN_SCOPE.AVAILABILITY, 'availability')
  assert.equal(PLAN_SCOPE.LOGISTICS,    'logistics')
  assert.equal(PLAN_SCOPE.CLUB,         'club')
  assert.equal(PLAN_SCOPE.PERFORMANCE,  'performance')
})

test('PLAN_SCOPE is frozen', () => {
  assert.ok(Object.isFrozen(PLAN_SCOPE))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — planning-rules.js: resolvePlanStatus
// ─────────────────────────────────────────────────────────────────────────────

test('resolvePlanStatus: blocked → null', () => {
  assert.equal(resolvePlanStatus('blocked'), null)
})

test('resolvePlanStatus: needs_review → draft', () => {
  assert.equal(resolvePlanStatus('needs_review'), PLAN_STATUS.DRAFT)
})

test('resolvePlanStatus: allowed → active', () => {
  assert.equal(resolvePlanStatus('allowed'), PLAN_STATUS.ACTIVE)
})

test('resolvePlanStatus: unknown status → active (permissive default)', () => {
  assert.equal(resolvePlanStatus('unknown'), PLAN_STATUS.ACTIVE)
  assert.equal(resolvePlanStatus(undefined), PLAN_STATUS.ACTIVE)
  assert.equal(resolvePlanStatus(null), PLAN_STATUS.ACTIVE)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — planning-rules.js: resolveScope
// ─────────────────────────────────────────────────────────────────────────────

test('resolveScope: attendance keyword wins over category', () => {
  const rec = { title: 'Poor attendance', description: 'Attendance is low', category: 'Training' }
  assert.equal(resolveScope(rec), PLAN_SCOPE.ATTENDANCE)
})

test('resolveScope: training load keyword', () => {
  const rec = { title: 'High training load', description: 'Reduce training load', action: '' }
  assert.equal(resolveScope(rec), PLAN_SCOPE.LOAD)
})

test('resolveScope: session load keyword', () => {
  const rec = { title: 'Manage session load', description: '', action: '' }
  assert.equal(resolveScope(rec), PLAN_SCOPE.LOAD)
})

test('resolveScope: overload keyword', () => {
  const rec = { title: 'Player overload detected', description: '' }
  assert.equal(resolveScope(rec), PLAN_SCOPE.LOAD)
})

test('resolveScope: match preparation keyword', () => {
  const rec = { title: 'Match preparation checklist incomplete', description: '' }
  assert.equal(resolveScope(rec), PLAN_SCOPE.PREPARATION)
})

test('resolveScope: availability keyword', () => {
  const rec = { title: 'Player not available for selection', description: '' }
  assert.equal(resolveScope(rec), PLAN_SCOPE.AVAILABILITY)
})

test('resolveScope: Medical category fallback', () => {
  const rec = { title: 'Player injury', description: '', category: 'Medical' }
  assert.equal(resolveScope(rec), PLAN_SCOPE.WELFARE)
})

test('resolveScope: Player Welfare category fallback', () => {
  const rec = { title: 'Check in needed', description: '', category: 'Player Welfare' }
  assert.equal(resolveScope(rec), PLAN_SCOPE.WELFARE)
})

test('resolveScope: Selection category fallback', () => {
  const rec = { title: 'Review squad options', description: '', category: 'Selection' }
  assert.equal(resolveScope(rec), PLAN_SCOPE.SELECTION)
})

test('resolveScope: Logistics category fallback', () => {
  const rec = { title: 'Travel arrangements', description: '', category: 'Logistics' }
  assert.equal(resolveScope(rec), PLAN_SCOPE.LOGISTICS)
})

test('resolveScope: Club category fallback', () => {
  const rec = { title: 'Committee issue', description: '', category: 'Club' }
  assert.equal(resolveScope(rec), PLAN_SCOPE.CLUB)
})

test('resolveScope: Training category fallback maps to load', () => {
  const rec = { title: 'Session plan review', description: '', category: 'Training' }
  assert.equal(resolveScope(rec), PLAN_SCOPE.LOAD)
})

test('resolveScope: unknown category → performance (default)', () => {
  const rec = { title: 'Random rec', description: '', category: 'Unknown' }
  assert.equal(resolveScope(rec), PLAN_SCOPE.PERFORMANCE)
})

test('resolveScope: missing fields do not throw', () => {
  assert.doesNotThrow(() => resolveScope({}))
  assert.doesNotThrow(() => resolveScope({ title: null }))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — planning-library.js: template shape and coverage
// ─────────────────────────────────────────────────────────────────────────────

test('ALL_SCOPES covers all 9 plan scopes', () => {
  const expected = Object.values(PLAN_SCOPE)
  assert.equal(ALL_SCOPES.length, expected.length)
  for (const scope of expected) {
    assert.ok(ALL_SCOPES.includes(scope), `ALL_SCOPES must include ${scope}`)
  }
})

test('getTemplate returns a template for every scope', () => {
  for (const scope of ALL_SCOPES) {
    const tpl = getTemplate(scope)
    assert.ok(tpl, `template missing for scope ${scope}`)
    assert.ok(typeof tpl.goalTemplate === 'function')
    assert.ok(typeof tpl.estimatedDurationDays === 'number')
    assert.ok(Array.isArray(tpl.actions))
    assert.ok(Array.isArray(tpl.checkpoints))
  }
})

test('getTemplate falls back to PERFORMANCE for unknown scope', () => {
  const tpl = getTemplate('unknown_scope')
  const perf = getTemplate(PLAN_SCOPE.PERFORMANCE)
  assert.equal(tpl.estimatedDurationDays, perf.estimatedDurationDays)
})

const EXPECTED_DURATIONS = {
  [PLAN_SCOPE.ATTENDANCE]:   21,
  [PLAN_SCOPE.LOAD]:         14,
  [PLAN_SCOPE.WELFARE]:       7,
  [PLAN_SCOPE.SELECTION]:     7,
  [PLAN_SCOPE.PREPARATION]:   7,
  [PLAN_SCOPE.AVAILABILITY]:  5,
  [PLAN_SCOPE.LOGISTICS]:    14,
  [PLAN_SCOPE.CLUB]:         21,
  [PLAN_SCOPE.PERFORMANCE]:  14,
}

for (const [scope, days] of Object.entries(EXPECTED_DURATIONS)) {
  test(`${scope} template: estimatedDurationDays = ${days}`, () => {
    assert.equal(getTemplate(scope).estimatedDurationDays, days)
  })
}

const EXPECTED_ACTION_COUNTS = {
  [PLAN_SCOPE.ATTENDANCE]:   5,
  [PLAN_SCOPE.LOAD]:         5,
  [PLAN_SCOPE.WELFARE]:      5,
  [PLAN_SCOPE.SELECTION]:    5,
  [PLAN_SCOPE.PREPARATION]:  5,
  [PLAN_SCOPE.AVAILABILITY]: 4,
  [PLAN_SCOPE.LOGISTICS]:    4,
  [PLAN_SCOPE.CLUB]:         5,
  [PLAN_SCOPE.PERFORMANCE]:  5,
}

for (const [scope, count] of Object.entries(EXPECTED_ACTION_COUNTS)) {
  test(`${scope} template: has ${count} actions`, () => {
    assert.equal(getTemplate(scope).actions.length, count)
  })
}

test('each template action has required fields', () => {
  for (const scope of ALL_SCOPES) {
    for (const action of getTemplate(scope).actions) {
      assert.ok(typeof action.title            === 'string',  `${scope} action: title`)
      assert.ok(typeof action.description      === 'string',  `${scope} action: description`)
      assert.ok(typeof action.estimatedMinutes === 'number',  `${scope} action: estimatedMinutes`)
      assert.ok(typeof action.dayOffset        === 'number',  `${scope} action: dayOffset`)
    }
  }
})

test('each template checkpoint has required fields', () => {
  for (const scope of ALL_SCOPES) {
    for (const cp of getTemplate(scope).checkpoints) {
      assert.ok(typeof cp.label       === 'string', `${scope} checkpoint: label`)
      assert.ok(typeof cp.dayOffset   === 'number', `${scope} checkpoint: dayOffset`)
      assert.ok(typeof cp.description === 'string', `${scope} checkpoint: description`)
    }
  }
})

test('goalTemplate produces a non-empty string from a rec', () => {
  const rec = { title: 'Test rec', id: 'rec-1' }
  for (const scope of ALL_SCOPES) {
    const goal = getTemplate(scope).goalTemplate(rec)
    assert.ok(typeof goal === 'string')
    assert.ok(goal.length > 0)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — planning-engine.js: createPlan
// ─────────────────────────────────────────────────────────────────────────────

function makeRec(overrides = {}) {
  return {
    id:          'rec-test-1',
    title:       'Review attendance',
    description: 'Attendance has declined',
    action:      'Review records',
    category:    'Training',
    priority:    'HIGH',
    confidence:  75,
    evidence:    ['obs-1', 'obs-2'],
    policy:      { status: 'allowed' },
    ...overrides,
  }
}

test('createPlan: returns null for blocked rec', () => {
  const rec = makeRec({ policy: { status: 'blocked' } })
  assert.equal(createPlan(rec), null)
})

test('createPlan: returns draft plan for needs_review rec', () => {
  const rec  = makeRec({ policy: { status: 'needs_review' } })
  const plan = createPlan(rec)
  assert.ok(plan !== null)
  assert.equal(plan.status, PLAN_STATUS.DRAFT)
})

test('createPlan: returns active plan for allowed rec', () => {
  const rec  = makeRec({ policy: { status: 'allowed' } })
  const plan = createPlan(rec)
  assert.ok(plan !== null)
  assert.equal(plan.status, PLAN_STATUS.ACTIVE)
})

test('createPlan: plan has all required top-level fields', () => {
  const plan = createPlan(makeRec())
  assert.ok(typeof plan.planId            === 'string')
  assert.ok(typeof plan.schemaVersion     === 'string')
  assert.ok(typeof plan.recommendationId  === 'string')
  assert.ok(typeof plan.status            === 'string')
  assert.ok(typeof plan.scope             === 'string')
  assert.ok(typeof plan.goal              === 'string')
  assert.ok(typeof plan.estimatedDuration === 'string')
  assert.ok(typeof plan.reviewDate        === 'string')
  assert.ok(Array.isArray(plan.actions))
  assert.ok(Array.isArray(plan.checkpoints))
  assert.ok(Array.isArray(plan.evidence))
  assert.ok(typeof plan.createdAt         === 'string')
  assert.ok(typeof plan.context           === 'object')
})

test('createPlan: recommendationId matches rec.id', () => {
  const rec  = makeRec({ id: 'rec-abc-123' })
  const plan = createPlan(rec)
  assert.equal(plan.recommendationId, 'rec-abc-123')
})

test('createPlan: schemaVersion matches PLAN_SCHEMA_VERSION', () => {
  const plan = createPlan(makeRec())
  assert.equal(plan.schemaVersion, PLAN_SCHEMA_VERSION)
})

test('createPlan: priority and confidence passed through unchanged', () => {
  const rec  = makeRec({ priority: 'MEDIUM', confidence: 60 })
  const plan = createPlan(rec)
  assert.equal(plan.priority,   'MEDIUM')
  assert.equal(plan.confidence, 60)
})

test('createPlan: evidence is a copy of rec.evidence', () => {
  const rec      = makeRec({ evidence: ['e1', 'e2', 'e3'] })
  const plan     = createPlan(rec)
  assert.deepEqual(plan.evidence, ['e1', 'e2', 'e3'])
  // must be a copy, not the same reference
  plan.evidence.push('mutated')
  assert.equal(rec.evidence.length, 3, 'original evidence must not be mutated')
})

test('createPlan: evidence is empty array when rec.evidence missing', () => {
  const rec  = makeRec({ evidence: undefined })
  const plan = createPlan(rec)
  assert.deepEqual(plan.evidence, [])
})

test('createPlan: actions have required fields', () => {
  const plan = createPlan(makeRec())
  for (const action of plan.actions) {
    assert.ok(typeof action.actionId         === 'string')
    assert.ok(typeof action.title            === 'string')
    assert.ok(typeof action.description      === 'string')
    assert.ok(typeof action.owner            === 'string')
    assert.ok(typeof action.suggestedDate    === 'string')
    assert.ok(typeof action.estimatedMinutes === 'number')
    assert.equal(action.status, ACTION_STATUS.PENDING)
  }
})

test('createPlan: actions have owner = coach', () => {
  const plan = createPlan(makeRec())
  for (const action of plan.actions) {
    assert.equal(action.owner, 'coach')
  }
})

test('createPlan: suggestedDate is a valid YYYY-MM-DD string', () => {
  const plan = createPlan(makeRec())
  for (const action of plan.actions) {
    assert.match(action.suggestedDate, /^\d{4}-\d{2}-\d{2}$/)
  }
})

test('createPlan: reviewDate is a valid YYYY-MM-DD string', () => {
  const plan = createPlan(makeRec())
  assert.match(plan.reviewDate, /^\d{4}-\d{2}-\d{2}$/)
})

test('createPlan: checkpoints have targetDate, label, description', () => {
  const plan = createPlan(makeRec())
  for (const cp of plan.checkpoints) {
    assert.ok(typeof cp.label       === 'string')
    assert.ok(typeof cp.targetDate  === 'string')
    assert.ok(typeof cp.description === 'string')
    assert.match(cp.targetDate, /^\d{4}-\d{2}-\d{2}$/)
  }
})

test('createPlan: estimatedDuration is a string like "N days"', () => {
  const plan = createPlan(makeRec())
  assert.match(plan.estimatedDuration, /^\d+ days$/)
})

test('createPlan: context records coachId and clubId', () => {
  const plan = createPlan(makeRec(), { coachId: 'coach-1', clubId: 'club-1' })
  assert.equal(plan.context.coachId, 'coach-1')
  assert.equal(plan.context.clubId,  'club-1')
})

test('createPlan: context nulls when not provided', () => {
  const plan = createPlan(makeRec())
  assert.equal(plan.context.coachId, null)
  assert.equal(plan.context.clubId,  null)
})

test('createPlan: attendance rec uses attendance template (21 days)', () => {
  const rec  = makeRec({ title: 'Poor attendance', policy: { status: 'allowed' } })
  const plan = createPlan(rec)
  assert.equal(plan.scope, PLAN_SCOPE.ATTENDANCE)
  assert.equal(plan.estimatedDuration, '21 days')
})

test('createPlan: welfare rec uses welfare template (7 days)', () => {
  const rec  = makeRec({ title: 'Player concern', description: 'Player needs support', action: '', category: 'Player Welfare', policy: { status: 'allowed' } })
  const plan = createPlan(rec)
  assert.equal(plan.scope, PLAN_SCOPE.WELFARE)
  assert.equal(plan.estimatedDuration, '7 days')
})

test('createPlan: each call produces a unique planId', () => {
  const rec  = makeRec()
  const p1   = createPlan(rec)
  const p2   = createPlan(rec)
  assert.notEqual(p1.planId, p2.planId)
})

test('createPlan: each action has a unique actionId', () => {
  const plan = createPlan(makeRec())
  const ids  = plan.actions.map(a => a.actionId)
  const unique = new Set(ids)
  assert.equal(unique.size, ids.length)
})

test('createPlan: no rec.policy uses allowed as default', () => {
  const rec = makeRec()
  delete rec.policy
  const plan = createPlan(rec)
  assert.ok(plan !== null)
  assert.equal(plan.status, PLAN_STATUS.ACTIVE)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 (cont) — createPlans
// ─────────────────────────────────────────────────────────────────────────────

test('createPlans: returns array', () => {
  const recs = [makeRec({ id: 'r1' }), makeRec({ id: 'r2' })]
  const plans = createPlans(recs)
  assert.ok(Array.isArray(plans))
})

test('createPlans: blocked recs produce no plan', () => {
  const recs = [
    makeRec({ id: 'r1', policy: { status: 'allowed' } }),
    makeRec({ id: 'r2', policy: { status: 'blocked' } }),
    makeRec({ id: 'r3', policy: { status: 'needs_review' } }),
  ]
  const plans = createPlans(recs)
  assert.equal(plans.length, 2)
  const ids = plans.map(p => p.recommendationId)
  assert.ok(ids.includes('r1'))
  assert.ok(!ids.includes('r2'))
  assert.ok(ids.includes('r3'))
})

test('createPlans: empty input returns empty array', () => {
  assert.deepEqual(createPlans([]), [])
  assert.deepEqual(createPlans(), [])
})

test('createPlans: all blocked → empty array', () => {
  const recs = [
    makeRec({ id: 'r1', policy: { status: 'blocked' } }),
    makeRec({ id: 'r2', policy: { status: 'blocked' } }),
  ]
  assert.deepEqual(createPlans(recs), [])
})

test('createPlans: passes context to each plan', () => {
  const recs  = [makeRec({ id: 'r1' })]
  const plans = createPlans(recs, { coachId: 'c99', clubId: 'b99' })
  assert.equal(plans[0].context.coachId, 'c99')
  assert.equal(plans[0].context.clubId,  'b99')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — AI.plan() integration
// ─────────────────────────────────────────────────────────────────────────────

test('AI.plan() is exposed on the AI namespace', () => {
  assert.ok(typeof AI.plan === 'function')
})

test('AI.plan() never rejects', async () => {
  await assert.doesNotReject(AI.plan(null))
  await assert.doesNotReject(AI.plan(undefined))
  await assert.doesNotReject(AI.plan(makeRec()))
})

test('AI.plan() returns null for null/undefined rec', async () => {
  assert.equal(await AI.plan(null), null)
  assert.equal(await AI.plan(undefined), null)
})

test('AI.plan() returns a plan for an allowed rec', async () => {
  const rec  = makeRec({ policy: { status: 'allowed' } })
  const plan = await AI.plan(rec)
  assert.ok(plan !== null)
  assert.equal(typeof plan.planId, 'string')
  assert.equal(plan.recommendationId, rec.id)
})

test('AI.plan() returns null for a blocked rec (policy field present)', async () => {
  const rec  = makeRec({ policy: { status: 'blocked' } })
  const plan = await AI.plan(rec)
  assert.equal(plan, null)
})

test('AI.plan() runs policy check when rec has no policy field', async () => {
  const rec = makeRec()
  delete rec.policy
  const plan = await AI.plan(rec)
  // rec has no extreme policy triggers → should pass and produce a plan
  assert.ok(plan !== null)
})

test('AI.plan() plan has expected shape', async () => {
  const rec  = makeRec({ policy: { status: 'allowed' } })
  const plan = await AI.plan(rec)
  assert.ok(plan !== null)
  assert.ok(typeof plan.planId            === 'string')
  assert.ok(typeof plan.goal              === 'string')
  assert.ok(typeof plan.status            === 'string')
  assert.ok(typeof plan.scope             === 'string')
  assert.ok(typeof plan.estimatedDuration === 'string')
  assert.ok(Array.isArray(plan.actions))
  assert.ok(Array.isArray(plan.checkpoints))
  assert.ok(Array.isArray(plan.evidence))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 6 — AI.request() includes meta.plans after M14
// ─────────────────────────────────────────────────────────────────────────────

test('AI.request() meta.plans is present after M14', async () => {
  const r = await AI.request({})
  assert.ok('plans' in r.meta, 'meta.plans must be present after M14')
})

test('AI.request() meta.plans is an array', async () => {
  const r = await AI.request({})
  assert.ok(Array.isArray(r.meta.plans))
})

test('AI.request() each plan in meta.plans has planId and recommendationId', async () => {
  const r = await AI.request({})
  for (const plan of r.meta.plans) {
    assert.ok(typeof plan.planId           === 'string')
    assert.ok(typeof plan.recommendationId === 'string')
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 7 — Workflow trace includes 'planning'
// ─────────────────────────────────────────────────────────────────────────────

test('AI.request() trace.modules includes planning after M14', async () => {
  const r = await AI.request({})
  assert.ok(r.trace.modules.includes('planning'), 'planning must be in trace.modules')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 8 — M1–M13 regression
// ─────────────────────────────────────────────────────────────────────────────

test('AI.request() BrainResponse shape preserved (M1 contract)', async () => {
  const r = await AI.request({})
  assert.ok(Array.isArray(r.recommendations))
  assert.ok(Array.isArray(r.insights))
  assert.ok(Array.isArray(r.warnings))
  assert.ok('schemaVersion'  in r)
  assert.ok('isMock'         in r.meta)
  assert.ok('modules'        in r.trace)
  assert.ok('duration'       in r.trace)
})

test('AI.request() meta.policy still present after M14', async () => {
  const r = await AI.request({})
  assert.ok('policy' in r.meta)
})

test('AI.request() recommendations have policy fields after M14', async () => {
  const r = await AI.request({})
  for (const rec of r.recommendations) {
    assert.ok('policy' in rec)
    assert.ok(typeof rec.policy.status === 'string')
  }
})

test('AI.request() trace.workflowId present after M14', async () => {
  const r = await AI.request({})
  assert.ok(typeof r.trace.workflowId === 'string')
})

test('AI.request() trace.modules includes calibration, policy and planning', async () => {
  const r = await AI.request({})
  assert.ok(r.trace.modules.includes('calibration'))
  assert.ok(r.trace.modules.includes('policy'))
  assert.ok(r.trace.modules.includes('planning'))
})

test('AI.ask() still resolves after M14', async () => {
  const r = await AI.ask('What is training load?')
  assert.equal(typeof r.answer, 'string')
})

test('AI.learn() still resolves after M14', async () => {
  await assert.doesNotReject(
    AI.learn({ outcome: 'accepted', recommendationType: 'Training' })
  )
})

test('AI.status() still returns { cis, accuracy } after M14', async () => {
  const r = await AI.status()
  assert.ok(typeof r.cis      === 'object')
  assert.ok(typeof r.accuracy === 'object')
})

test('AI.explain() still resolves after M14', async () => {
  const r   = await AI.request({})
  const exp = await AI.explain(r.recommendations[0]?.id)
  if (exp) assert.ok(typeof exp.plainLanguageExplanation === 'string')
})

test('AI.policyCheck() still resolves after M14', async () => {
  const r      = await AI.request({})
  const result = await AI.policyCheck(r)
  assert.ok(typeof result.overallStatus === 'string')
  assert.equal(result.recommendations.length, r.recommendations.length)
})

test('AI.memory.* still resolves after M14', async () => {
  await assert.doesNotReject(AI.memory.get('m14-reg'))
})

test('AI.observations.* still resolves after M14', async () => {
  await assert.doesNotReject(AI.observations.all())
})

test('recommendations have id and recommendationId after M14', async () => {
  const r = await AI.request({})
  for (const rec of r.recommendations) {
    assert.ok(typeof rec.id === 'string')
    assert.equal(rec.recommendationId, rec.id)
  }
})
