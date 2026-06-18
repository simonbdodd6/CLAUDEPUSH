/**
 * M72 — Evidence Gateway machine-readable gate outcome (emitGateOutcome) tests
 *
 * Deterministic tests for the dormant CI emitter over M71 envelopes / M68 suite verdicts /
 * M67 single verdicts: pass + fail envelopes, suite-verdict input, single-verdict input,
 * stable statusLine, annotation extraction, maxAnnotations truncation + overflow,
 * maxAnnotations=0, affected stages, deep-frozen output, no input mutation, gateway parity,
 * and invalid-input handling.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, runExpectationGate, checkPipelineSuite,
  checkPipelineAgainstExpected, emitGateOutcome, createEvidenceGateway,
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

// ── M71 envelope: pass ───────────────────────────────────────────────────────────────

test('M71 envelope (pass) → status pass, clean statusLine, no annotations', () => {
  const env = runExpectationGate(setOf('a', 'b'), { a: PLAN_PASS, b: PLAN_PASS })
  const o = emitGateOutcome(env)
  assert.equal(o.status, 'pass')
  assert.equal(o.statusLine, 'gate=pass cases=2/2 violations=0 tolerated=0')
  assert.equal(o.firstFailingCase, null)
  assert.deepEqual(o.cases, { total: 2, passed: 2, failed: 0 })
  assert.deepEqual(o.annotations, [])
  assert.equal(o.overflow, 0)
})

// ── M71 envelope: fail ───────────────────────────────────────────────────────────────

test('M71 envelope (fail) → status fail, statusLine names first case, annotations present', () => {
  const env = runExpectationGate(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_FAIL })
  const o = emitGateOutcome(env)
  assert.equal(o.status, 'fail')
  assert.ok(o.statusLine.startsWith('gate=fail cases=1/2 first=bad violations='))
  assert.equal(o.firstFailingCase, 'bad')
  assert.equal(o.cases.failed, 1)
  assert.ok(o.violations > 0)
  assert.ok(o.annotations.length > 0)
  assert.ok(o.annotations.every(a => a.caseName === 'bad' && typeof a.stage === 'string' && typeof a.path === 'string'))
})

// ── M68 suite verdict input ──────────────────────────────────────────────────────────

test('accepts a bare M68 suite verdict', () => {
  const suite = checkPipelineSuite([
    { name: 'p', planOrSnapshot: PLAN_PASS, expectedSnapshot: SNAP_A },
    { name: 'f', planOrSnapshot: PLAN_FAIL, expectedSnapshot: SNAP_A },
  ])
  const o = emitGateOutcome(suite)
  assert.equal(o.status, 'fail')
  assert.equal(o.firstFailingCase, 'f')
  assert.equal(o.violations, suite.summary.violations)
  assert.equal(o.tolerated, suite.summary.tolerated)
})

// ── M67 single verdict input ─────────────────────────────────────────────────────────

test('accepts a bare M67 single verdict → (single) case', () => {
  const v = checkPipelineAgainstExpected(PLAN_FAIL, SNAP_A)
  const o = emitGateOutcome(v)
  assert.equal(o.status, 'fail')
  assert.equal(o.statusLine, `gate=fail cases=0/1 first=(single) violations=${v.summary.total} tolerated=${v.summary.tolerated}`)
  assert.equal(o.violations, v.summary.total)
  assert.ok(o.annotations.every(a => a.caseName === '(single)'))
})

test('single passing verdict → status pass, 1/1', () => {
  const v = checkPipelineAgainstExpected(PLAN_PASS, SNAP_A)
  const o = emitGateOutcome(v)
  assert.equal(o.status, 'pass')
  assert.equal(o.statusLine, 'gate=pass cases=1/1 violations=0 tolerated=0')
})

// ── deterministic statusLine + annotation extraction ─────────────────────────────────

test('deterministic — identical input → identical outcome', () => {
  const build = () => emitGateOutcome(runExpectationGate(setOf('a', 'bad'), { a: PLAN_PASS, bad: PLAN_FAIL }))
  assert.deepEqual(build(), build())
})

test('annotation count equals violations when uncapped; stages map to known stages', () => {
  const o = emitGateOutcome(runExpectationGate(setOf('bad'), { bad: PLAN_FAIL }))
  assert.equal(o.annotations.length, o.violations)
  assert.equal(o.overflow, 0)
  // every annotation stage appears in the affected-stage union (top-level-keyed paths)
  for (const a of o.annotations) assert.ok(o.affectedStages.includes(a.stage) || a.stage === 'results')
})

// ── maxAnnotations truncation + overflow ─────────────────────────────────────────────

test('maxAnnotations truncates and reports overflow', () => {
  const full = emitGateOutcome(runExpectationGate(setOf('bad'), { bad: PLAN_FAIL }))
  assert.ok(full.violations > 1, 'fixture should yield several violations')
  const o = emitGateOutcome(runExpectationGate(setOf('bad'), { bad: PLAN_FAIL }), { maxAnnotations: 1 })
  assert.equal(o.annotations.length, 1)
  assert.equal(o.overflow, full.violations - 1)
})

test('maxAnnotations=0 → no annotations, all overflow', () => {
  const o = emitGateOutcome(runExpectationGate(setOf('bad'), { bad: PLAN_FAIL }), { maxAnnotations: 0 })
  assert.equal(o.annotations.length, 0)
  assert.equal(o.overflow, o.violations)
})

test('invalid maxAnnotations falls back to default (no throw)', () => {
  const o1 = emitGateOutcome(runExpectationGate(setOf('bad'), { bad: PLAN_FAIL }), { maxAnnotations: -3 })
  const o2 = emitGateOutcome(runExpectationGate(setOf('bad'), { bad: PLAN_FAIL }), { maxAnnotations: 'all' })
  assert.ok(o1.annotations.length >= 0 && o2.annotations.length >= 0)
  assert.equal(o1.overflow, o1.violations - o1.annotations.length)
})

// ── affected stages ──────────────────────────────────────────────────────────────────

test('affectedStages mirrors the underlying suite verdict union', () => {
  const env = runExpectationGate(setOf('bad'), { bad: PLAN_FAIL })
  const o = emitGateOutcome(env)
  assert.deepEqual(o.affectedStages, env.verdict.affectedStages)
})

// ── immutability / mutation ──────────────────────────────────────────────────────────

test('outcome is deeply frozen', () => {
  const o = emitGateOutcome(runExpectationGate(setOf('bad'), { bad: PLAN_FAIL }), { maxAnnotations: 2 })
  assert.ok(Object.isFrozen(o) && Object.isFrozen(o.cases) && Object.isFrozen(o.annotations) && Object.isFrozen(o.affectedStages))
  assert.ok(o.annotations.length === 0 || Object.isFrozen(o.annotations[0]))
  assert.throws(() => { o.status = 'pass' })
  assert.throws(() => o.annotations.push({}))
})

test('does not mutate the input envelope/verdict', () => {
  const env = runExpectationGate(setOf('bad'), { bad: PLAN_FAIL })
  const before = JSON.stringify(env)
  emitGateOutcome(env, { maxAnnotations: 1 })
  assert.equal(JSON.stringify(env), before)
})

// ── invalid input ────────────────────────────────────────────────────────────────────

test('invalid input → TypeError', () => {
  assert.throws(() => emitGateOutcome(null), TypeError)
  assert.throws(() => emitGateOutcome({}), TypeError)
  assert.throws(() => emitGateOutcome('nope'), TypeError)
  assert.throws(() => emitGateOutcome({ foo: 1 }), TypeError)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.emitGateOutcome matches emitGateOutcome', () => {
  const gw = createEvidenceGateway()
  const env = runExpectationGate(setOf('a', 'bad'), { a: PLAN_PASS, bad: PLAN_FAIL })
  assert.deepEqual(gw.emitGateOutcome(env, { maxAnnotations: 2 }), emitGateOutcome(env, { maxAnnotations: 2 }))
})

test('gateway.emitGateOutcome accepts a single M67 verdict', () => {
  const gw = createEvidenceGateway()
  const v = checkPipelineAgainstExpected(PLAN_FAIL, SNAP_A)
  assert.deepEqual(gw.emitGateOutcome(v), emitGateOutcome(v))
})
