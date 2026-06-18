/**
 * M76 — Evidence Gateway one-call CI entry point (gateCI) tests
 *
 * Deterministic tests for the dormant end-to-end orchestration resolve (M70) → suite (M68)
 * → report (M69) → outcome (M72) → policy (M74) → decision (M75): successful pipeline,
 * failing pipeline, policy pass, policy fail, equivalence to composing the helpers by hand,
 * options pass-through, determinism, deep-frozen return, no input mutation, invalid-input
 * propagation, gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, runExpectationGate, emitGateOutcome, decideGate,
  gateCI, createEvidenceGateway,
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

// ── successful pipeline / policy pass ────────────────────────────────────────────────

test('successful pipeline → green envelope/outcome, policy passes, exitCode 0', () => {
  const r = gateCI(setOf('a', 'b'), { a: PLAN_PASS, b: PLAN_PASS })
  assert.deepEqual(Object.keys(r).sort(), ['decision', 'envelope', 'outcome'])
  assert.equal(r.envelope.verdict.pass, true)
  assert.equal(r.outcome.status, 'pass')
  assert.equal(r.decision.ok, true)
  assert.equal(r.decision.exitCode, 0)
  assert.equal(r.decision.line, 'policy=pass')
})

// ── failing pipeline / policy fail ───────────────────────────────────────────────────

test('failing pipeline → red outcome, default policy fails, exitCode 1', () => {
  const r = gateCI(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_FAIL })
  assert.equal(r.envelope.verdict.pass, false)
  assert.equal(r.outcome.status, 'fail')
  assert.equal(r.outcome.firstFailingCase, 'bad')
  assert.equal(r.decision.ok, false)
  assert.equal(r.decision.exitCode, 1)
  assert.equal(r.decision.line, 'policy=fail reasons=1 requirePass')
})

// ── policy interaction ───────────────────────────────────────────────────────────────

test('policy pass — lenient policy turns a failing gate into a passing decision', () => {
  const r = gateCI(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_FAIL }, { policy: { requirePass: false } })
  assert.equal(r.outcome.status, 'fail')   // gate still failed…
  assert.equal(r.decision.ok, true)        // …but the policy is satisfied
  assert.equal(r.decision.exitCode, 0)
})

test('policy fail — extra rule (forbiddenStages) fails an otherwise-passing gate', () => {
  const r = gateCI(setOf('a'), { a: PLAN_PASS })
  assert.equal(r.outcome.status, 'pass')
  // a passing gate has no affected stages, so forbiddenStages can't trip — use a failing gate
  const r2 = gateCI(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_FAIL },
    { policy: { requirePass: false, forbiddenStages: [emitGateOutcome(runExpectationGate(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_FAIL })).affectedStages[0]] } })
  assert.equal(r2.decision.ok, false)
  assert.ok(r2.decision.line.includes('forbiddenStages'))
})

// ── equivalence to composing by hand ─────────────────────────────────────────────────

test('equals composing runExpectationGate → emitGateOutcome → decideGate manually', () => {
  const set = setOf('ok', 'bad')
  const runs = { ok: PLAN_PASS, bad: PLAN_FAIL }
  const options = { allowlist: ['counts'], maxEntriesPerCase: 2, policy: { maxViolations: 0 }, decisionFormat: 'full' }

  const envelope = runExpectationGate(set, runs, { allowlist: options.allowlist, maxEntriesPerCase: options.maxEntriesPerCase })
  const outcome = emitGateOutcome(envelope)
  const decision = decideGate(outcome, options.policy, { format: options.decisionFormat })

  const r = gateCI(set, runs, options)
  assert.deepEqual(r.envelope, envelope)
  assert.deepEqual(r.outcome, outcome)
  assert.deepEqual(r.decision, decision)
})

// ── options pass-through ─────────────────────────────────────────────────────────────

test('maxEntriesPerCase + decisionFormat are threaded through', () => {
  const r = gateCI(setOf('bad'), { bad: PLAN_FAIL }, { maxEntriesPerCase: 1, decisionFormat: 'full' })
  assert.equal(r.envelope.report.cases[0].sample.length, 1)         // M69 cap applied
  assert.ok(r.envelope.report.cases[0].truncated > 0)
  assert.ok(r.decision.line.includes(' | gate=fail'))               // M75 full format
})

// ── determinism ──────────────────────────────────────────────────────────────────────

test('deterministic — identical inputs → identical result', () => {
  const build = () => gateCI(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_FAIL }, { policy: { maxViolations: 0 }, decisionFormat: 'full' })
  assert.deepEqual(build(), build())
})

// ── immutability / mutation ──────────────────────────────────────────────────────────

test('result is frozen with frozen parts', () => {
  const r = gateCI(setOf('bad'), { bad: PLAN_FAIL })
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.envelope) && Object.isFrozen(r.outcome) && Object.isFrozen(r.decision))
  assert.throws(() => { r.decision = null })
  assert.throws(() => { r.outcome.status = 'pass' })
})

test('does not mutate inputs', () => {
  const runs = { ok: PLAN_PASS, bad: PLAN_FAIL }
  const policy = { maxViolations: 1, forbiddenStages: ['b', 'a'] }
  const beforeRuns = JSON.stringify(runs)
  const beforePolicy = JSON.stringify(policy)
  gateCI(setOf('ok', 'bad'), runs, { policy, decisionFormat: 'full' })
  assert.equal(JSON.stringify(runs), beforeRuns)
  assert.equal(JSON.stringify(policy), beforePolicy)
})

// ── invalid input propagation ────────────────────────────────────────────────────────

test('invalid input propagates as TypeError from the underlying milestone', () => {
  assert.throws(() => gateCI({ not: 'a set' }, {}), TypeError)                              // bad set (M70)
  assert.throws(() => gateCI(setOf('a'), {}), TypeError)                                    // missing run (M70)
  assert.throws(() => gateCI(setOf('a'), { a: PLAN_PASS, ghost: PLAN_PASS }), TypeError)    // unknown run (M70)
  assert.throws(() => gateCI(setOf('bad'), { bad: PLAN_FAIL }, { policy: { unknownField: 1 } }), TypeError)  // bad policy (M74)
  assert.throws(() => gateCI(setOf('bad'), { bad: PLAN_FAIL }, { decisionFormat: 'yaml' }), TypeError)       // bad format (M75)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.gateCI matches gateCI', () => {
  const gw = createEvidenceGateway()
  const set = gw.createExpectationSet([{ name: 'ok', expectedSnapshot: SNAP_A }, { name: 'bad', expectedSnapshot: SNAP_A }])
  const runs = { ok: PLAN_PASS, bad: PLAN_FAIL }
  const options = { policy: { maxViolations: 0 }, decisionFormat: 'full', maxEntriesPerCase: 2 }
  assert.deepEqual(gw.gateCI(set, runs, options), gateCI(set, runs, options))
})

test('gateway.gateCI end-to-end pass', () => {
  const gw = createEvidenceGateway()
  const set = gw.createExpectationSet([{ name: 'a', expectedSnapshot: SNAP_A }])
  const r = gw.gateCI(set, { a: PLAN_PASS })
  assert.equal(r.decision.exitCode, 0)
  assert.equal(r.decision.line, 'policy=pass')
})
