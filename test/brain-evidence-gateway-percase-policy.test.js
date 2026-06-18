/**
 * M78 — Evidence Gateway per-case policy budgets tests
 *
 * Deterministic tests for the additive per-case policy fields on evaluateGatePolicy:
 * maxViolationsPerCase, maxToleratedPerCase, forbiddenStagesPerCase — including multiple
 * failing cases, deterministic reason ordering, additive compatibility (existing fields
 * untouched when new ones absent), allowedFailingCases interaction, validation, deep-frozen
 * return, no input mutation, gateway parity.
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

// build an outcome from named { name → pass|fail } cases
const outcomeOf = (spec, opts) => emitGateOutcome(runExpectationGate(
  createExpectationSet(Object.keys(spec).map(n => ({ name: n, expectedSnapshot: SNAP_A }))),
  Object.fromEntries(Object.entries(spec).map(([n, ok]) => [n, ok ? PLAN_PASS : PLAN_FAIL])),
), opts)

// ── maxViolationsPerCase ─────────────────────────────────────────────────────────────

test('maxViolationsPerCase → fails the case that exceeds the budget, names it + values', () => {
  const o = outcomeOf({ ok: true, bad: false })
  const bad = o.perCase.find(p => p.name === 'bad')
  const v = evaluateGatePolicy(o, { requirePass: false, maxViolationsPerCase: bad.violations - 1 })
  assert.equal(v.ok, false)
  assert.deepEqual(v.reasons, [`bad exceeded maxViolationsPerCase (${bad.violations} > ${bad.violations - 1})`])

  const within = evaluateGatePolicy(o, { requirePass: false, maxViolationsPerCase: bad.violations })
  assert.equal(within.ok, true)   // boundary equal allowed; passing case 'ok' has 0
})

// ── maxToleratedPerCase ──────────────────────────────────────────────────────────────

test('maxToleratedPerCase → fails the case whose tolerated count exceeds the budget', () => {
  // tolerate the failing case's stages so its tolerated > 0 (and it passes the gate)
  const tolerantStages = runExpectationGate(setOf('bad'), { bad: PLAN_FAIL }).verdict.cases[0].verdict.affectedStages
  const o = emitGateOutcome(runExpectationGate(setOf('bad'), { bad: PLAN_FAIL }, { allowlist: { stages: tolerantStages } }))
  const bad = o.perCase[0]
  assert.ok(bad.tolerated > 0)
  const v = evaluateGatePolicy(o, { maxToleratedPerCase: bad.tolerated - 1 })
  assert.equal(v.ok, false)
  assert.deepEqual(v.reasons, [`bad exceeded maxToleratedPerCase (${bad.tolerated} > ${bad.tolerated - 1})`])
  assert.equal(evaluateGatePolicy(o, { maxToleratedPerCase: bad.tolerated }).ok, true)
})

// ── forbiddenStagesPerCase ───────────────────────────────────────────────────────────

test('forbiddenStagesPerCase → fails the individual case whose affected stage matches', () => {
  const o = outcomeOf({ bad: false })
  const stage = o.perCase[0].affectedStages[0]
  const v = evaluateGatePolicy(o, { requirePass: false, forbiddenStagesPerCase: [stage, 'never'] })
  assert.equal(v.ok, false)
  assert.deepEqual(v.reasons, [`bad affected forbidden stage(s): ${stage}`])

  const clean = evaluateGatePolicy(o, { requirePass: false, forbiddenStagesPerCase: ['never'] })
  assert.equal(clean.ok, true)
})

// ── multiple failing cases + deterministic ordering ──────────────────────────────────

test('multiple failing cases → one reason each, in perCase (suite) order', () => {
  const o = outcomeOf({ f1: false, ok: true, f2: false })
  const v = evaluateGatePolicy(o, { requirePass: false, maxViolationsPerCase: 0 })
  assert.equal(v.ok, false)
  // f1 before f2 (suite order); 'ok' has 0 violations → not reported
  assert.deepEqual(v.reasons.map(r => r.split(' ')[0]), ['f1', 'f2'])
  assert.ok(v.reasons.every(r => r.includes('maxViolationsPerCase')))
})

test('rules apply in fixed order: gate-wide first, then per-case (violations, tolerated, stages)', () => {
  const o = outcomeOf({ bad: false })
  const stage = o.perCase[0].affectedStages[0]
  const v = evaluateGatePolicy(o, {
    requirePass: true,                 // gate-wide reason (#1)
    maxViolationsPerCase: 0,           // per-case violations (#5)
    forbiddenStagesPerCase: [stage],   // per-case stages (#7)
  })
  assert.equal(v.ok, false)
  // requirePass (gate-wide) must come before the per-case reasons
  assert.ok(v.reasons[0].startsWith('requirePass:'))
  assert.ok(v.reasons.some(r => r.includes('maxViolationsPerCase')))
  assert.ok(v.reasons[v.reasons.length - 1].includes('affected forbidden stage(s)'))
})

// ── additive compatibility ───────────────────────────────────────────────────────────

test('additive — without new fields, policyApplied shape is unchanged', () => {
  const o = outcomeOf({ a: true })
  const v = evaluateGatePolicy(o)
  assert.deepEqual(v.policyApplied, { requirePass: true, maxViolations: null, maxTolerated: null, forbiddenStages: [], allowedFailingCases: [] })
  assert.ok(!('maxViolationsPerCase' in v.policyApplied))
})

test('per-case fields appear in policyApplied only when supplied', () => {
  const o = outcomeOf({ bad: false })
  const v = evaluateGatePolicy(o, { requirePass: false, maxViolationsPerCase: 5, forbiddenStagesPerCase: ['z', 'a'] })
  assert.equal(v.policyApplied.maxViolationsPerCase, 5)
  assert.deepEqual(v.policyApplied.forbiddenStagesPerCase, ['a', 'z'])   // uniq-sorted
  assert.ok(!('maxToleratedPerCase' in v.policyApplied))                 // not supplied → absent
})

test('allowedFailingCases excuses a case from per-case budgets too', () => {
  const o = outcomeOf({ bad: false })
  const v = evaluateGatePolicy(o, { allowedFailingCases: ['bad'], maxViolationsPerCase: 0 })
  assert.equal(v.ok, true)   // 'bad' excused → no per-case reason and requirePass satisfied
  assert.deepEqual(v.reasons, [])
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid per-case policy values → TypeError', () => {
  const o = outcomeOf({ a: true })
  assert.throws(() => evaluateGatePolicy(o, { maxViolationsPerCase: -1 }), TypeError)
  assert.throws(() => evaluateGatePolicy(o, { maxViolationsPerCase: 1.5 }), TypeError)
  assert.throws(() => evaluateGatePolicy(o, { maxToleratedPerCase: 'lots' }), TypeError)
  assert.throws(() => evaluateGatePolicy(o, { forbiddenStagesPerCase: 'normalize' }), TypeError)
  assert.throws(() => evaluateGatePolicy(o, { forbiddenStagesPerCase: [1] }), TypeError)
})

test('per-case field on an outcome lacking perCase → TypeError', () => {
  const o = outcomeOf({ bad: false })
  const { perCase, ...withoutPerCase } = o   // strip the M77 field
  assert.throws(() => evaluateGatePolicy(withoutPerCase, { maxViolationsPerCase: 0 }), TypeError)
  // but gate-wide-only policy still works on the stripped outcome
  assert.equal(evaluateGatePolicy(withoutPerCase, { requirePass: false }).ok, true)
})

// ── immutability / mutation ──────────────────────────────────────────────────────────

test('return is deeply frozen', () => {
  const o = outcomeOf({ bad: false })
  const v = evaluateGatePolicy(o, { requirePass: false, forbiddenStagesPerCase: ['x'] })
  assert.ok(Object.isFrozen(v) && Object.isFrozen(v.reasons) && Object.isFrozen(v.policyApplied))
  assert.ok(Object.isFrozen(v.policyApplied.forbiddenStagesPerCase))
  assert.throws(() => v.reasons.push('x'))
})

test('does not mutate the input outcome or policy', () => {
  const o = outcomeOf({ f1: false, f2: false })
  const policy = { requirePass: false, maxViolationsPerCase: 0, forbiddenStagesPerCase: ['b', 'a'] }
  const beforeO = JSON.stringify(o)
  const beforeP = JSON.stringify(policy)
  evaluateGatePolicy(o, policy)
  assert.equal(JSON.stringify(o), beforeO)
  assert.equal(JSON.stringify(policy), beforeP)
  assert.deepEqual(policy.forbiddenStagesPerCase, ['b', 'a'])   // input order preserved
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.evaluateGatePolicy supports the per-case fields automatically', () => {
  const gw = createEvidenceGateway()
  const o = outcomeOf({ ok: true, bad: false })
  const policy = { requirePass: false, maxViolationsPerCase: 0 }
  assert.deepEqual(gw.evaluateGatePolicy(o, policy), evaluateGatePolicy(o, policy))
})
