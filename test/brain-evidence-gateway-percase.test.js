/**
 * M77 — Evidence Gateway per-case outcome enrichment tests
 *
 * Deterministic tests for the additive `perCase` array on the M72 outcome: passing case,
 * failing case, mixed suite, deterministic ordering, first-violation extraction, stage
 * extraction, additive compatibility (existing fields unchanged), deep-frozen output, no
 * input mutation, gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, runExpectationGate, checkPipelineSuite, checkPipelineAgainstExpected,
  emitGateOutcome, createEvidenceGateway,
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

const outcomeFor = (cases, opts) => emitGateOutcome(runExpectationGate(
  createExpectationSet(cases.map(c => ({ name: c.name, expectedSnapshot: SNAP_A }))),
  Object.fromEntries(cases.map(c => [c.name, c.plan])),
), opts)

// ── passing case ─────────────────────────────────────────────────────────────────────

test('passing case → zeroed per-case entry, no first violation', () => {
  const o = outcomeFor([{ name: 'a', plan: PLAN_PASS }, { name: 'b', plan: PLAN_PASS }])
  assert.equal(o.perCase.length, 2)
  for (const pc of o.perCase) {
    assert.equal(pc.pass, true)
    assert.equal(pc.violations, 0)
    assert.equal(pc.tolerated, 0)
    assert.deepEqual(pc.affectedStages, [])
    assert.equal(pc.firstViolationPath, null)
    assert.equal(pc.firstViolationStage, null)
  }
})

// ── failing case ─────────────────────────────────────────────────────────────────────

test('failing case → counts + stages + first violation populated', () => {
  const o = outcomeFor([{ name: 'bad', plan: PLAN_FAIL }])
  const pc = o.perCase[0]
  assert.equal(pc.name, 'bad')
  assert.equal(pc.pass, false)
  assert.ok(pc.violations > 0)
  assert.ok(pc.affectedStages.length > 0)
  assert.equal(typeof pc.firstViolationPath, 'string')
  assert.equal(typeof pc.firstViolationStage, 'string')
})

test('per-case counts/stages mirror the underlying M67 verdict exactly', () => {
  const env = runExpectationGate(setOf('bad'), { bad: PLAN_FAIL })
  const o = emitGateOutcome(env)
  const caseVerdict = env.verdict.cases[0].verdict
  const pc = o.perCase[0]
  assert.equal(pc.violations, caseVerdict.summary.total)
  assert.equal(pc.tolerated, caseVerdict.summary.tolerated)
  assert.deepEqual(pc.affectedStages, caseVerdict.affectedStages)
})

// ── mixed suite + ordering ───────────────────────────────────────────────────────────

test('mixed suite → one entry per case, in suite order, pass flags correct', () => {
  const o = outcomeFor([
    { name: 'p1', plan: PLAN_PASS },
    { name: 'f1', plan: PLAN_FAIL },
    { name: 'p2', plan: PLAN_PASS },
    { name: 'f2', plan: PLAN_FAIL },
  ])
  assert.deepEqual(o.perCase.map(p => p.name), ['p1', 'f1', 'p2', 'f2'])
  assert.deepEqual(o.perCase.map(p => p.pass), [true, false, true, false])
})

test('deterministic ordering — identical input → identical perCase', () => {
  const build = () => outcomeFor([{ name: 'a', plan: PLAN_PASS }, { name: 'bad', plan: PLAN_FAIL }]).perCase
  assert.deepEqual(build(), build())
})

// ── first violation / stage extraction ───────────────────────────────────────────────

test('firstViolationPath/Stage match the first emitted annotation for that case', () => {
  const o = outcomeFor([{ name: 'bad', plan: PLAN_FAIL }])
  const firstAnnForCase = o.annotations.find(a => a.caseName === 'bad')
  assert.equal(o.perCase[0].firstViolationPath, firstAnnForCase.path)
  assert.equal(o.perCase[0].firstViolationStage, firstAnnForCase.stage)
})

test('first violation present even when annotations are truncated to zero', () => {
  const o = outcomeFor([{ name: 'bad', plan: PLAN_FAIL }], { maxAnnotations: 0 })
  assert.equal(o.annotations.length, 0)                       // annotations capped away…
  assert.equal(typeof o.perCase[0].firstViolationPath, 'string')   // …but perCase still has it
  assert.equal(typeof o.perCase[0].firstViolationStage, 'string')
})

// ── additive compatibility ───────────────────────────────────────────────────────────

test('additive — all existing outcome fields are unchanged by enrichment', () => {
  const o = outcomeFor([{ name: 'ok', plan: PLAN_PASS }, { name: 'bad', plan: PLAN_FAIL }])
  // existing top-level keys still present
  for (const k of ['status', 'statusLine', 'cases', 'firstFailingCase', 'violations', 'tolerated', 'affectedStages', 'annotations', 'overflow']) {
    assert.ok(Object.prototype.hasOwnProperty.call(o, k), `missing existing field ${k}`)
  }
  assert.ok(Object.prototype.hasOwnProperty.call(o, 'perCase'))
  // aggregate totals still equal the sum across perCase
  assert.equal(o.violations, o.perCase.reduce((s, p) => s + p.violations, 0))
  assert.equal(o.tolerated, o.perCase.reduce((s, p) => s + p.tolerated, 0))
})

test('accepts a single M67 verdict → one (single) per-case entry', () => {
  const o = emitGateOutcome(checkPipelineAgainstExpected(PLAN_FAIL, SNAP_A))
  assert.equal(o.perCase.length, 1)
  assert.equal(o.perCase[0].name, '(single)')
  assert.equal(o.perCase[0].pass, false)
})

test('accepts a bare M68 suite verdict', () => {
  const suite = checkPipelineSuite([
    { name: 'p', planOrSnapshot: PLAN_PASS, expectedSnapshot: SNAP_A },
    { name: 'f', planOrSnapshot: PLAN_FAIL, expectedSnapshot: SNAP_A },
  ])
  const o = emitGateOutcome(suite)
  assert.deepEqual(o.perCase.map(p => p.name), ['p', 'f'])
})

// ── immutability / mutation ──────────────────────────────────────────────────────────

test('perCase is deeply frozen', () => {
  const o = outcomeFor([{ name: 'bad', plan: PLAN_FAIL }])
  assert.ok(Object.isFrozen(o.perCase) && Object.isFrozen(o.perCase[0]) && Object.isFrozen(o.perCase[0].affectedStages))
  assert.throws(() => o.perCase.push({}))
  assert.throws(() => { o.perCase[0].pass = true })
})

test('does not mutate the input envelope/verdict', () => {
  const env = runExpectationGate(setOf('bad'), { bad: PLAN_FAIL })
  const before = JSON.stringify(env)
  emitGateOutcome(env)
  assert.equal(JSON.stringify(env), before)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.emitGateOutcome exposes the enriched perCase automatically', () => {
  const gw = createEvidenceGateway()
  const env = runExpectationGate(setOf('a', 'bad'), { a: PLAN_PASS, bad: PLAN_FAIL })
  const viaGw = gw.emitGateOutcome(env)
  assert.ok(Array.isArray(viaGw.perCase) && viaGw.perCase.length === 2)
  assert.deepEqual(viaGw, emitGateOutcome(env))
})
