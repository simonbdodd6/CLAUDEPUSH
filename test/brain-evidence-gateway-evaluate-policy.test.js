/**
 * M74 — Evidence Gateway gate policy engine (evaluateGatePolicy) tests
 *
 * Deterministic tests for the dormant declarative policy evaluator over an M72 outcome:
 * default requirePass, requirePass:false, maxViolations, maxTolerated, forbiddenStages,
 * allowedFailingCases, multiple failures, deterministic reason ordering, invalid-policy
 * rejection, deep-frozen return, no input mutation, gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, runExpectationGate, emitGateOutcome,
  evaluateGatePolicy, createEvidenceGateway,
} from '@brain/evidence-gateway'
import { createNormalizerRegistry } from '@brain/evidence-normalization'
import { SOURCE_TYPE, SIGNAL_POLARITY } from '@brain/evidence-contracts'

const TENANT = Object.freeze({ clubId: 'c1', teamId: 't1', seasonId: 's1' })
const NCTX = Object.freeze({ now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' })
const rec = (id, over = {}) => Object.freeze({
  id, tenant: TENANT, subjectType: 'player', subjectId: 'player-9',
  sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, observedAt: '2026-06-16T09:30:00.000Z', confidence: 0.8, ...over,
})
const frame = (value = 0.82, confidence = 0.5) => ({
  sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, version: '1.0',
  normalize: (r) => [{ key: 'lineout.winRate', value, unit: null, polarity: SIGNAL_POLARITY.STRENGTH, confidence, evidenceId: r.id }],
})
const badNote = { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE, version: '1.0',
  normalize: (r) => [{ key: 'bad key', value: 1, unit: null, polarity: null, confidence: 0.5, evidenceId: r.id }] }

const REG = createNormalizerRegistry([frame(), badNote])
const REG_CONF = createNormalizerRegistry([frame(0.82, 0.6), badNote])

const planFor = (registry, records) => prepareFullPipelinePlan({ registry, records, context: NCTX })
const snapFor = (registry, records) => snapshotPipelinePlan(planFor(registry, records))

const SNAP_A = snapFor(REG, [rec('ev_1')])
const PLAN_PASS = planFor(REG, [rec('ev_1')])
const PLAN_FAIL = planFor(REG_CONF, [rec('ev_1')])
const setOf = (...names) => createExpectationSet(names.map(n => ({ name: n, expectedSnapshot: SNAP_A })))

const passOutcome = () => emitGateOutcome(runExpectationGate(setOf('a', 'b'), { a: PLAN_PASS, b: PLAN_PASS }))
const failOutcome = (opts) => emitGateOutcome(runExpectationGate(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_FAIL }), opts)

// ── default requirePass ──────────────────────────────────────────────────────────────

test('default policy → requirePass:true; passing outcome ok, failing outcome not ok', () => {
  const okv = evaluateGatePolicy(passOutcome())
  assert.equal(okv.ok, true)
  assert.deepEqual(okv.reasons, [])
  assert.deepEqual(okv.policyApplied, { requirePass: true, maxViolations: null, maxTolerated: null, forbiddenStages: [], allowedFailingCases: [] })

  const failv = evaluateGatePolicy(failOutcome())
  assert.equal(failv.ok, false)
  assert.equal(failv.reasons.length, 1)
  assert.ok(failv.reasons[0].startsWith('requirePass:'))
  assert.ok(failv.reasons[0].includes('bad'))
})

// ── requirePass:false ────────────────────────────────────────────────────────────────

test('requirePass:false → a failing gate alone does not fail the policy', () => {
  const v = evaluateGatePolicy(failOutcome(), { requirePass: false })
  assert.equal(v.ok, true)
  assert.deepEqual(v.reasons, [])
  assert.equal(v.policyApplied.requirePass, false)
})

// ── maxViolations ────────────────────────────────────────────────────────────────────

test('maxViolations → fails when total violations exceed the budget', () => {
  const o = failOutcome()
  const over = evaluateGatePolicy(o, { requirePass: false, maxViolations: o.violations - 1 })
  assert.equal(over.ok, false)
  assert.ok(over.reasons.some(r => r === `maxViolations: ${o.violations} > ${o.violations - 1}`))

  const within = evaluateGatePolicy(o, { requirePass: false, maxViolations: o.violations })
  assert.equal(within.ok, true)   // boundary: equal is allowed
})

// ── maxTolerated ─────────────────────────────────────────────────────────────────────

test('maxTolerated → fails when total tolerated exceed the budget', () => {
  // tolerate the failing case's stages → tolerated > 0, gate passes
  const env = runExpectationGate(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_FAIL })
  const tolerantStages = env.verdict.cases.find(c => c.name === 'bad').verdict.affectedStages
  const tolerated = emitGateOutcome(runExpectationGate(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_FAIL }, { allowlist: { stages: tolerantStages } }))
  assert.ok(tolerated.tolerated > 0)
  const over = evaluateGatePolicy(tolerated, { maxTolerated: tolerated.tolerated - 1 })
  assert.equal(over.ok, false)
  assert.ok(over.reasons.some(r => r.startsWith('maxTolerated:')))
  assert.equal(evaluateGatePolicy(tolerated, { maxTolerated: tolerated.tolerated }).ok, true)
})

// ── forbiddenStages ──────────────────────────────────────────────────────────────────

test('forbiddenStages → fails if any affected stage is forbidden', () => {
  const o = failOutcome()
  const stage = o.affectedStages[0]
  const v = evaluateGatePolicy(o, { requirePass: false, forbiddenStages: [stage, 'never-a-stage'] })
  assert.equal(v.ok, false)
  assert.ok(v.reasons.some(r => r === `forbiddenStages: ${stage}`))

  const clean = evaluateGatePolicy(o, { requirePass: false, forbiddenStages: ['never-a-stage'] })
  assert.equal(clean.ok, true)
})

// ── allowedFailingCases ──────────────────────────────────────────────────────────────

test('allowedFailingCases → excuses a failing case so requirePass passes', () => {
  const o = failOutcome()
  const v = evaluateGatePolicy(o, { allowedFailingCases: ['bad'] })
  assert.equal(v.ok, true)            // 'bad' was the only failing case → excused
  assert.deepEqual(v.reasons, [])
  assert.deepEqual(v.policyApplied.allowedFailingCases, ['bad'])
})

test('allowedFailingCases not covering the failing case → still fails', () => {
  const v = evaluateGatePolicy(failOutcome(), { allowedFailingCases: ['someoneelse'] })
  assert.equal(v.ok, false)
  assert.ok(v.reasons[0].includes('bad'))
})

test('allowedFailingCases removes that case from forbidden-stage evaluation', () => {
  const o = failOutcome()
  const stage = o.affectedStages[0]   // a stage that came from the 'bad' case
  // with 'bad' excused, its stages drop out of the effective affected set
  const v = evaluateGatePolicy(o, { allowedFailingCases: ['bad'], forbiddenStages: [stage] })
  assert.equal(v.ok, true)
})

// ── multiple failures + deterministic ordering ───────────────────────────────────────

test('multiple policy failures → reasons in fixed order requirePass, maxViolations, maxTolerated, forbiddenStages', () => {
  const o = failOutcome()
  const v = evaluateGatePolicy(o, {
    requirePass: true,
    maxViolations: o.violations - 1,
    maxTolerated: -0 === 0 ? 0 : 0,           // 0 budget; tolerated may be 0 → no maxTolerated reason here
    forbiddenStages: [o.affectedStages[0]],
  })
  assert.equal(v.ok, false)
  const prefixes = v.reasons.map(r => r.split(':')[0])
  // requirePass first, forbiddenStages last; ordering monotonic in the fixed sequence
  const order = ['requirePass', 'maxViolations', 'maxTolerated', 'forbiddenStages']
  const idxs = prefixes.map(p => order.indexOf(p))
  assert.deepEqual(idxs, [...idxs].sort((a, b) => a - b))
  assert.ok(prefixes.includes('requirePass') && prefixes.includes('maxViolations') && prefixes.includes('forbiddenStages'))
})

test('deterministic — identical inputs → identical verdict', () => {
  const o = failOutcome()
  const policy = { maxViolations: 0, forbiddenStages: ['z', 'a', o.affectedStages[0]] }
  assert.deepEqual(evaluateGatePolicy(o, policy), evaluateGatePolicy(o, policy))
})

// ── invalid policy rejection ─────────────────────────────────────────────────────────

test('invalid policy values → TypeError', () => {
  const o = passOutcome()
  assert.throws(() => evaluateGatePolicy(o, { requirePass: 'yes' }), TypeError)
  assert.throws(() => evaluateGatePolicy(o, { maxViolations: -1 }), TypeError)
  assert.throws(() => evaluateGatePolicy(o, { maxViolations: 1.5 }), TypeError)
  assert.throws(() => evaluateGatePolicy(o, { maxTolerated: 'lots' }), TypeError)
  assert.throws(() => evaluateGatePolicy(o, { forbiddenStages: 'normalize' }), TypeError)
  assert.throws(() => evaluateGatePolicy(o, { forbiddenStages: [1, 2] }), TypeError)
  assert.throws(() => evaluateGatePolicy(o, { allowedFailingCases: [null] }), TypeError)
  assert.throws(() => evaluateGatePolicy(o, { unknownField: true }), TypeError)
  assert.throws(() => evaluateGatePolicy(o, 'nope'), TypeError)
})

test('invalid outcome → TypeError', () => {
  assert.throws(() => evaluateGatePolicy(null), TypeError)
  assert.throws(() => evaluateGatePolicy({}), TypeError)
  assert.throws(() => evaluateGatePolicy({ status: 'fail' }), TypeError)   // missing fields
})

// ── immutability / mutation ──────────────────────────────────────────────────────────

test('return is deeply frozen', () => {
  const v = evaluateGatePolicy(failOutcome(), { forbiddenStages: ['x'] })
  assert.ok(Object.isFrozen(v) && Object.isFrozen(v.reasons) && Object.isFrozen(v.policyApplied))
  assert.ok(Object.isFrozen(v.policyApplied.forbiddenStages) && Object.isFrozen(v.policyApplied.allowedFailingCases))
  assert.throws(() => { v.ok = true })
  assert.throws(() => v.reasons.push('x'))
})

test('does not mutate the input outcome or policy', () => {
  const o = failOutcome()
  const policy = { maxViolations: 1, forbiddenStages: ['b', 'a'], allowedFailingCases: ['x'] }
  const beforeO = JSON.stringify(o)
  const beforeP = JSON.stringify(policy)
  evaluateGatePolicy(o, policy)
  assert.equal(JSON.stringify(o), beforeO)
  assert.equal(JSON.stringify(policy), beforeP)
  assert.deepEqual(policy.forbiddenStages, ['b', 'a'])   // input order preserved (we copy + sort internally)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.evaluateGatePolicy matches evaluateGatePolicy', () => {
  const gw = createEvidenceGateway()
  const o = failOutcome()
  const policy = { maxViolations: 0, forbiddenStages: [o.affectedStages[0]] }
  assert.deepEqual(gw.evaluateGatePolicy(o, policy), evaluateGatePolicy(o, policy))
  assert.deepEqual(gw.evaluateGatePolicy(passOutcome()), evaluateGatePolicy(passOutcome()))   // default
})
