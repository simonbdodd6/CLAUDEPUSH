/**
 * M75 — Evidence Gateway gate decision / exit-code mapper (decideGate) tests
 *
 * Deterministic tests for the dormant decision layer over M74 policy + M73 line: passing
 * policy (exitCode 0, line policy=pass), failing policy (exitCode 1, deterministic line),
 * accepts an M71 envelope or a bare M72 outcome, "full" format reuses the M73 gate line,
 * unknown-format rejection, determinism, deep-frozen return, no input mutation, invalid
 * input propagation, gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, runExpectationGate, emitGateOutcome, serializeGateOutcome,
  decideGate, createEvidenceGateway,
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

const passEnv = () => runExpectationGate(setOf('a', 'b'), { a: PLAN_PASS, b: PLAN_PASS })
const failEnv = () => runExpectationGate(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_FAIL })

// ── passing policy ───────────────────────────────────────────────────────────────────

test('passing policy → ok true, exitCode 0, line "policy=pass"', () => {
  const d = decideGate(passEnv())
  assert.equal(d.ok, true)
  assert.equal(d.exitCode, 0)
  assert.equal(d.line, 'policy=pass')
  assert.deepEqual(d.reasons, [])
  assert.equal(d.policyApplied.requirePass, true)
})

// ── failing policy ───────────────────────────────────────────────────────────────────

test('failing policy → ok false, exitCode 1, deterministic policy=fail line', () => {
  const d = decideGate(failEnv())   // default requirePass:true → fails
  assert.equal(d.ok, false)
  assert.equal(d.exitCode, 1)
  assert.equal(d.line, 'policy=fail reasons=1 requirePass')
  assert.equal(d.reasons.length, 1)
})

test('multiple failed rules → reasons count + comma-joined rule names in line', () => {
  const o = emitGateOutcome(failEnv())
  const d = decideGate(o, { maxViolations: o.violations - 1, forbiddenStages: [o.affectedStages[0]] })
  assert.equal(d.ok, false)
  assert.equal(d.exitCode, 1)
  assert.equal(d.line, 'policy=fail reasons=3 requirePass,maxViolations,forbiddenStages')
})

// ── exitCode is only ever 0 or 1 ─────────────────────────────────────────────────────

test('exitCode is 0 on pass and 1 on fail, never anything else', () => {
  assert.equal(decideGate(passEnv()).exitCode, 0)
  assert.equal(decideGate(failEnv()).exitCode, 1)
  assert.equal(decideGate(failEnv(), { requirePass: false }).exitCode, 0)   // failing gate, but policy lenient
})

// ── accepts an already-built M72 outcome ─────────────────────────────────────────────

test('accepts a bare M72 outcome as well as an M71 envelope', () => {
  const o = emitGateOutcome(failEnv())
  assert.deepEqual(decideGate(o), decideGate(failEnv()))
})

// ── full format reuses the M73 gate line ─────────────────────────────────────────────

test('format:"full" appends the M73 gate status line after " | "', () => {
  const o = emitGateOutcome(failEnv())
  const d = decideGate(o, {}, { format: 'full' })
  const gateLine = serializeGateOutcome(o, { format: 'line' })
  assert.equal(d.line, `policy=fail reasons=1 requirePass | ${gateLine}`)
})

test('unknown format → TypeError', () => {
  assert.throws(() => decideGate(passEnv(), {}, { format: 'json' }), TypeError)
  assert.throws(() => decideGate(passEnv(), {}, { format: '' }), TypeError)
})

// ── determinism ──────────────────────────────────────────────────────────────────────

test('deterministic — identical inputs → identical decision', () => {
  const o = emitGateOutcome(failEnv())
  const policy = { maxViolations: 0, forbiddenStages: [o.affectedStages[0]] }
  assert.deepEqual(decideGate(o, policy), decideGate(o, policy))
  assert.deepEqual(decideGate(o, policy, { format: 'full' }), decideGate(o, policy, { format: 'full' }))
})

// ── immutability / mutation ──────────────────────────────────────────────────────────

test('decision is deeply frozen', () => {
  const d = decideGate(failEnv(), { forbiddenStages: ['x'] })
  assert.ok(Object.isFrozen(d) && Object.isFrozen(d.reasons) && Object.isFrozen(d.policyApplied))
  assert.throws(() => { d.exitCode = 0 })
  assert.throws(() => d.reasons.push('x'))
})

test('does not mutate inputs', () => {
  const env = failEnv()
  const policy = { maxViolations: 1, forbiddenStages: ['b', 'a'] }
  const beforeEnv = JSON.stringify(env)
  const beforePolicy = JSON.stringify(policy)
  decideGate(env, policy, { format: 'full' })
  assert.equal(JSON.stringify(env), beforeEnv)
  assert.equal(JSON.stringify(policy), beforePolicy)
})

// ── invalid input propagation ────────────────────────────────────────────────────────

test('invalid input propagates as TypeError (via M72/M74)', () => {
  assert.throws(() => decideGate(null), TypeError)                          // bad outcome/envelope (M72)
  assert.throws(() => decideGate({}), TypeError)                            // not an outcome/envelope (M72)
  assert.throws(() => decideGate(failEnv(), { unknownField: 1 }), TypeError)  // bad policy (M74)
  assert.throws(() => decideGate(failEnv(), { maxViolations: -1 }), TypeError)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.decideGate matches decideGate', () => {
  const gw = createEvidenceGateway()
  const o = emitGateOutcome(failEnv())
  const policy = { maxViolations: 0 }
  assert.deepEqual(gw.decideGate(o, policy), decideGate(o, policy))
  assert.deepEqual(gw.decideGate(o, policy, { format: 'full' }), decideGate(o, policy, { format: 'full' }))
  assert.deepEqual(gw.decideGate(passEnv()), decideGate(passEnv()))
})
