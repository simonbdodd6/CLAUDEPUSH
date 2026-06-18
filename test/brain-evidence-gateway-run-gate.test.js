/**
 * M71 — Evidence Gateway end-to-end expectation gate (runExpectationGate) tests
 *
 * Deterministic tests for the dormant one-call orchestration of resolve (M70) → check
 * (M68) → report (M69): end-to-end pass, end-to-end fail, report generation, suite
 * allowlist pass-through, maxEntriesPerCase pass-through, determinism, deep-frozen
 * envelope, no input mutation, gateway parity, invalid-input propagation, and equivalence
 * to composing the helpers by hand.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, resolveExpectationSet, checkPipelineSuite, formatPipelineSuiteReport,
  runExpectationGate, createEvidenceGateway,
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
const REG_CONF = createNormalizerRegistry([frame(0.82, 0.6), badNote])   // changed confidence

const planFor = (registry, records) => prepareFullPipelinePlan({ registry, records, context: NCTX })
const snapFor = (registry, records) => snapshotPipelinePlan(planFor(registry, records))

const SNAP_A = snapFor(REG, [rec('ev_1')])
const PLAN_PASS = planFor(REG, [rec('ev_1')])
const PLAN_FAIL = planFor(REG_CONF, [rec('ev_1')])

const setOf = (...names) => createExpectationSet(names.map(n => ({ name: n, expectedSnapshot: SNAP_A })))

// ── successful end-to-end pass ───────────────────────────────────────────────────────

test('end-to-end pass → frozen { cases, verdict, report }, all green', () => {
  const set = setOf('a', 'b')
  const env = runExpectationGate(set, { a: PLAN_PASS, b: PLAN_PASS })
  assert.deepEqual(Object.keys(env).sort(), ['cases', 'report', 'verdict'])
  assert.deepEqual(env.cases.map(c => c.name), ['a', 'b'])
  assert.equal(env.verdict.pass, true)
  assert.equal(env.report.pass, true)
  assert.equal(env.report.headline, 'PASS — 2/2 cases passed')
})

// ── failing end-to-end verdict + report ──────────────────────────────────────────────

test('end-to-end fail → verdict fails; report names first failing case', () => {
  const set = setOf('ok', 'bad')
  const env = runExpectationGate(set, { ok: PLAN_PASS, bad: PLAN_FAIL })
  assert.equal(env.verdict.pass, false)
  assert.equal(env.verdict.firstFailingCase, 'bad')
  assert.equal(env.report.pass, false)
  assert.ok(env.report.headline.includes('first failing: bad'))
  assert.ok(env.report.text.includes('Failing cases:'))
})

// ── equivalence to composing the helpers by hand ─────────────────────────────────────

test('equals composing resolve → check → report manually', () => {
  const set = setOf('a', 'bad')
  const runs = { a: PLAN_PASS, bad: PLAN_FAIL }
  const opts = { allowlist: ['counts'], maxEntriesPerCase: 3 }

  const cases = resolveExpectationSet(set, runs)
  const verdict = checkPipelineSuite(cases, { allowlist: opts.allowlist })
  const report = formatPipelineSuiteReport(verdict, { maxEntriesPerCase: opts.maxEntriesPerCase })

  const env = runExpectationGate(set, runs, opts)
  assert.deepEqual(env.cases, cases)
  assert.deepEqual(env.verdict, verdict)
  assert.deepEqual(env.report, report)
})

// ── suite allowlist pass-through ─────────────────────────────────────────────────────

test('suite allowlist is passed through to the suite gate', () => {
  const tolerantStages = checkPipelineSuite(resolveExpectationSet(setOf('x'), { x: PLAN_FAIL }))
    .cases[0].verdict.affectedStages
  const env = runExpectationGate(setOf('x'), { x: PLAN_FAIL }, { allowlist: { stages: tolerantStages } })
  assert.equal(env.verdict.pass, true)              // tolerated → pass…
  assert.ok(env.verdict.summary.tolerated > 0)      // …via the allowlist
  assert.equal(env.report.pass, true)
})

// ── maxEntriesPerCase pass-through ───────────────────────────────────────────────────

test('maxEntriesPerCase is passed through to the report formatter', () => {
  const env = runExpectationGate(setOf('bad'), { bad: PLAN_FAIL }, { maxEntriesPerCase: 1 })
  const cr = env.report.cases[0]
  assert.equal(cr.sample.length, 1)
  assert.ok(cr.truncated > 0)
  assert.ok(env.report.text.includes(`…and ${cr.truncated} more`))
})

// ── determinism / immutability / mutation ────────────────────────────────────────────

test('deterministic — identical inputs → identical envelope', () => {
  const build = () => runExpectationGate(setOf('a', 'bad'), { a: PLAN_PASS, bad: PLAN_FAIL }, { maxEntriesPerCase: 2 })
  assert.deepEqual(build(), build())
})

test('envelope is frozen, with frozen parts', () => {
  const env = runExpectationGate(setOf('bad'), { bad: PLAN_FAIL })
  assert.ok(Object.isFrozen(env) && Object.isFrozen(env.cases) && Object.isFrozen(env.verdict) && Object.isFrozen(env.report))
  assert.throws(() => { env.verdict = null })
  assert.throws(() => env.cases.push({}))
})

test('does not mutate inputs', () => {
  const set = setOf('a')
  const runs = { a: PLAN_PASS }
  const beforeRuns = JSON.stringify(runs)
  runExpectationGate(set, runs, { allowlist: ['counts'], maxEntriesPerCase: 5 })
  assert.equal(JSON.stringify(runs), beforeRuns)
})

// ── invalid input propagates through the existing helpers ────────────────────────────

test('invalid expectation set / runs / missing run propagate as TypeError', () => {
  assert.throws(() => runExpectationGate({ not: 'a set' }, {}), TypeError)              // bad set (M70)
  assert.throws(() => runExpectationGate(setOf('a'), {}), TypeError)                    // missing run (M70)
  assert.throws(() => runExpectationGate(setOf('a'), { a: PLAN_PASS, ghost: PLAN_PASS }), TypeError)  // unknown run (M70)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.runExpectationGate matches runExpectationGate', () => {
  const gw = createEvidenceGateway()
  const set = gw.createExpectationSet([{ name: 'a', expectedSnapshot: SNAP_A }, { name: 'bad', expectedSnapshot: SNAP_A }])
  const runs = { a: PLAN_PASS, bad: PLAN_FAIL }
  const opts = { allowlist: ['counts'], maxEntriesPerCase: 2 }
  assert.deepEqual(gw.runExpectationGate(set, runs, opts), runExpectationGate(set, runs, opts))
})

test('gateway.runExpectationGate end-to-end pass', () => {
  const gw = createEvidenceGateway()
  const set = gw.createExpectationSet([{ name: 'a', expectedSnapshot: SNAP_A }])
  const env = gw.runExpectationGate(set, { a: PLAN_PASS })
  assert.equal(env.verdict.pass, true)
  assert.equal(env.report.headline, 'PASS — 1/1 cases passed')
})
