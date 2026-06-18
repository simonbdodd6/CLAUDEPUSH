/**
 * M80 — Evidence Gateway decision reason codes tests
 *
 * Deterministic tests for the additive machine-readable reasonCodes emitted by M74
 * evaluateGatePolicy and surfaced on the M75 decideGate decision: single reason, multiple
 * reasons, parallel-to-reasons ordering, per-case codes, backwards compatibility (existing
 * reasons + decision line unchanged), decideGate now consumes reasonCodes (clean per-case
 * tokens), serializer parity, invalid inputs, deep freeze, no mutation, gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, runExpectationGate, emitGateOutcome,
  evaluateGatePolicy, decideGate, serializeGateDecision, createEvidenceGateway,
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

const outcomeOf = (spec, opts) => emitGateOutcome(runExpectationGate(
  createExpectationSet(Object.keys(spec).map(n => ({ name: n, expectedSnapshot: SNAP_A }))),
  Object.fromEntries(Object.entries(spec).map(([n, ok]) => [n, ok ? PLAN_PASS : PLAN_FAIL])),
), opts)

// ── single reason ────────────────────────────────────────────────────────────────────

test('single reason → single matching reasonCode', () => {
  const v = evaluateGatePolicy(outcomeOf({ ok: true, bad: false }))   // default requirePass fails
  assert.deepEqual(v.reasonCodes, ['requirePass'])
  assert.equal(v.reasonCodes.length, v.reasons.length)
  assert.ok(v.reasons[0].startsWith('requirePass:'))
})

test('passing policy → empty reasons and empty reasonCodes', () => {
  const v = evaluateGatePolicy(outcomeOf({ a: true }))
  assert.deepEqual(v.reasons, [])
  assert.deepEqual(v.reasonCodes, [])
})

// ── multiple reasons ─────────────────────────────────────────────────────────────────

test('multiple gate-wide reasons → codes parallel to reasons, fixed order', () => {
  const o = outcomeOf({ ok: true, bad: false })
  const v = evaluateGatePolicy(o, { maxViolations: o.violations - 1, forbiddenStages: [o.affectedStages[0]] })
  assert.deepEqual(v.reasonCodes, ['requirePass', 'maxViolations', 'forbiddenStages'])
  assert.equal(v.reasonCodes.length, v.reasons.length)
  // each code is the prefix of its parallel human reason (gate-wide reasons are colon-prefixed)
  v.reasons.forEach((r, i) => assert.equal(r.split(':')[0], v.reasonCodes[i]))
})

// ── per-case codes ───────────────────────────────────────────────────────────────────

test('per-case failures → clean reasonCodes even though reasons are colon-less', () => {
  const o = outcomeOf({ f1: false, f2: false })
  const v = evaluateGatePolicy(o, { requirePass: false, maxViolationsPerCase: 0 })
  assert.deepEqual(v.reasonCodes, ['maxViolationsPerCase', 'maxViolationsPerCase'])
  assert.equal(v.reasonCodes.length, v.reasons.length)
})

// ── deterministic ordering ───────────────────────────────────────────────────────────

test('deterministic — identical inputs → identical reasonCodes', () => {
  const o = outcomeOf({ ok: true, bad: false })
  const policy = { maxViolations: 0, forbiddenStages: [o.affectedStages[0]], maxViolationsPerCase: 0 }
  assert.deepEqual(evaluateGatePolicy(o, policy).reasonCodes, evaluateGatePolicy(o, policy).reasonCodes)
})

// ── backwards compatibility ──────────────────────────────────────────────────────────

test('backwards compatible — existing reasons strings are byte-identical', () => {
  const o = outcomeOf({ ok: true, bad: false })
  const v = evaluateGatePolicy(o, { maxViolations: o.violations - 1 })
  assert.deepEqual(v.reasons, [
    `requirePass: gate failed with un-allowed failing case(s): bad`,
    `maxViolations: ${o.violations} > ${o.violations - 1}`,
  ])
})

test('backwards compatible — decideGate line for gate-wide reasons is unchanged', () => {
  // gate-wide-only failures: codes equal the old split tokens → identical line
  const d = decideGate(outcomeOf({ ok: true, bad: false }))
  assert.equal(d.line, 'policy=fail reasons=1 requirePass')
  const o = outcomeOf({ ok: true, bad: false })
  const d2 = decideGate(o, { maxViolations: o.violations - 1, forbiddenStages: [o.affectedStages[0]] })
  assert.equal(d2.line, 'policy=fail reasons=3 requirePass,maxViolations,forbiddenStages')
})

// ── decideGate consumes reasonCodes (clean per-case tokens) ───────────────────────────

test('decideGate surfaces reasonCodes and uses them for the line (clean per-case tokens)', () => {
  const o = outcomeOf({ bad: false })
  const d = decideGate(o, { requirePass: false, maxViolationsPerCase: 0 })
  assert.deepEqual(d.reasonCodes, ['maxViolationsPerCase'])
  // line token is the clean code, not the full colon-less reason string
  assert.equal(d.line, 'policy=fail reasons=1 maxViolationsPerCase')
})

test('decision reasonCodes parallel the decision reasons', () => {
  const o = outcomeOf({ ok: true, bad: false })
  const d = decideGate(o, { maxViolations: o.violations - 1 })
  assert.equal(d.reasonCodes.length, d.reasons.length)
  assert.deepEqual(d.reasonCodes, ['requirePass', 'maxViolations'])
})

// ── serializer parity ────────────────────────────────────────────────────────────────

test('serializer parity — reasonCodes appear in json; line/reasons formats unchanged', () => {
  const o = outcomeOf({ ok: true, bad: false })
  const d = decideGate(o, { maxViolations: o.violations - 1 })
  const json = serializeGateDecision(d, { format: 'json' })
  assert.ok(json.includes('"reasonCodes"'))
  assert.equal(serializeGateDecision(d, { format: 'line' }), d.line)
  assert.deepEqual(serializeGateDecision(d, { format: 'reasons' }).split('\n'), [...d.reasons])
})

// ── invalid inputs ───────────────────────────────────────────────────────────────────

test('invalid inputs still rejected (unchanged)', () => {
  assert.throws(() => evaluateGatePolicy(null), TypeError)
  assert.throws(() => evaluateGatePolicy(outcomeOf({ a: true }), { unknownField: 1 }), TypeError)
  assert.throws(() => decideGate(null), TypeError)
})

// ── immutability / mutation ──────────────────────────────────────────────────────────

test('reasonCodes are deeply frozen on both policy result and decision', () => {
  const o = outcomeOf({ ok: true, bad: false })
  const v = evaluateGatePolicy(o, { maxViolations: o.violations - 1 })
  assert.ok(Object.isFrozen(v.reasonCodes))
  assert.throws(() => v.reasonCodes.push('x'))
  const d = decideGate(o, { maxViolations: o.violations - 1 })
  assert.ok(Object.isFrozen(d.reasonCodes))
  assert.throws(() => d.reasonCodes.push('x'))
})

test('does not mutate inputs', () => {
  const o = outcomeOf({ ok: true, bad: false })
  const policy = { maxViolations: 0 }
  const beforeO = JSON.stringify(o)
  const beforeP = JSON.stringify(policy)
  evaluateGatePolicy(o, policy)
  decideGate(o, policy)
  assert.equal(JSON.stringify(o), beforeO)
  assert.equal(JSON.stringify(policy), beforeP)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway parity — reasonCodes exposed via gateway helpers', () => {
  const gw = createEvidenceGateway()
  const o = outcomeOf({ ok: true, bad: false })
  const policy = { maxViolations: o.violations - 1 }
  assert.deepEqual(gw.evaluateGatePolicy(o, policy), evaluateGatePolicy(o, policy))
  assert.deepEqual(gw.decideGate(o, policy), decideGate(o, policy))
  assert.deepEqual(gw.decideGate(o, policy).reasonCodes, ['requirePass', 'maxViolations'])
})
