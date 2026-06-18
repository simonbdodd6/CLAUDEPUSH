/**
 * M82 — Evidence Gateway unified CI artifact bundler (serializeGateCI) tests
 *
 * Deterministic tests for the dormant bundler over a gateCI result: default formats,
 * per-artifact format selection, equivalence to calling the underlying serializers,
 * determinism, deep-frozen bundle, no input mutation, invalid-result rejection, invalid
 * per-artifact format propagation, gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI,
  serializeGateReport, serializeGateOutcome, serializeGateDecision, serializeGateCI,
  createEvidenceGateway,
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

const passRun = () => gateCI(setOf('a', 'b'), { a: PLAN_PASS, b: PLAN_PASS })
const failRun = (opts) => gateCI(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_FAIL }, opts)

// ── default formats ──────────────────────────────────────────────────────────────────

test('default formats → report=text, outcome=json, decision=json', () => {
  const r = failRun()
  const b = serializeGateCI(r)
  assert.deepEqual(Object.keys(b).sort(), ['decision', 'outcome', 'report'])
  assert.equal(b.report, serializeGateReport(r.envelope.report, { format: 'text' }))
  assert.equal(b.outcome, serializeGateOutcome(r.outcome, { format: 'json' }))
  assert.equal(b.decision, serializeGateDecision(r.decision, { format: 'json' }))
})

// ── per-artifact format selection ────────────────────────────────────────────────────

test('per-artifact format selection is threaded to each serializer', () => {
  const r = failRun()
  const b = serializeGateCI(r, { reportFormat: 'markdown', outcomeFormat: 'line', decisionFormat: 'reasons' })
  assert.equal(b.report, serializeGateReport(r.envelope.report, { format: 'markdown' }))
  assert.equal(b.outcome, serializeGateOutcome(r.outcome, { format: 'line' }))
  assert.equal(b.decision, serializeGateDecision(r.decision, { format: 'reasons' }))
  assert.ok(b.report.startsWith('# '))               // markdown
  assert.ok(b.outcome.startsWith('gate=fail'))        // outcome line
})

test('partial options → only specified artifact changes, others stay default', () => {
  const r = failRun()
  const b = serializeGateCI(r, { decisionFormat: 'line' })
  assert.equal(b.report, serializeGateReport(r.envelope.report, { format: 'text' }))    // default
  assert.equal(b.outcome, serializeGateOutcome(r.outcome, { format: 'json' }))          // default
  assert.equal(b.decision, serializeGateDecision(r.decision, { format: 'line' }))       // selected
  assert.ok(b.decision.startsWith('policy=fail'))
})

// ── determinism ──────────────────────────────────────────────────────────────────────

test('deterministic — identical run → identical bundle (all formats)', () => {
  const opts = { reportFormat: 'markdown', outcomeFormat: 'annotations', decisionFormat: 'reasons' }
  assert.deepEqual(serializeGateCI(failRun(), opts), serializeGateCI(failRun(), opts))
})

test('passing run bundles cleanly', () => {
  const b = serializeGateCI(passRun(), { reportFormat: 'markdown', outcomeFormat: 'line', decisionFormat: 'line' })
  assert.ok(b.report.includes('**Status:** PASS'))
  assert.ok(b.outcome.startsWith('gate=pass'))
  assert.equal(b.decision, 'policy=pass')
})

// ── immutability / mutation ──────────────────────────────────────────────────────────

test('bundle is frozen', () => {
  const b = serializeGateCI(failRun())
  assert.ok(Object.isFrozen(b))
  assert.throws(() => { b.report = 'x' })
})

test('does not mutate the input result', () => {
  const r = failRun({ maxEntriesPerCase: 1 })
  const before = JSON.stringify(r)
  serializeGateCI(r, { reportFormat: 'markdown', outcomeFormat: 'annotations', decisionFormat: 'reasons' })
  assert.equal(JSON.stringify(r), before)
})

// ── invalid input / format ───────────────────────────────────────────────────────────

test('invalid result → TypeError', () => {
  assert.throws(() => serializeGateCI(null), TypeError)
  assert.throws(() => serializeGateCI({}), TypeError)                                  // no envelope/outcome/decision
  assert.throws(() => serializeGateCI({ envelope: {}, outcome: {}, decision: {} }), TypeError)  // envelope has no report
  const r = failRun()
  assert.throws(() => serializeGateCI({ outcome: r.outcome, decision: r.decision }), TypeError) // missing envelope
})

test('invalid per-artifact format propagates as TypeError from the serializer', () => {
  const r = failRun()
  assert.throws(() => serializeGateCI(r, { reportFormat: 'html' }), TypeError)
  assert.throws(() => serializeGateCI(r, { outcomeFormat: 'yaml' }), TypeError)
  assert.throws(() => serializeGateCI(r, { decisionFormat: 'xml' }), TypeError)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.serializeGateCI matches serializeGateCI', () => {
  const gw = createEvidenceGateway()
  const r = failRun()
  const opts = { reportFormat: 'markdown', outcomeFormat: 'line', decisionFormat: 'reasons' }
  assert.deepEqual(gw.serializeGateCI(r, opts), serializeGateCI(r, opts))
  assert.deepEqual(gw.serializeGateCI(r), serializeGateCI(r))   // default
})
