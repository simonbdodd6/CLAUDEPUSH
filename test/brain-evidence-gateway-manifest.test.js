/**
 * M83 — Evidence Gateway gate manifest / provenance descriptor (createGateManifest) tests
 *
 * Deterministic tests for the dormant provenance manifest over a gateCI result: valid
 * creation, determinism, identical-input digest stability, per-artifact digest sensitivity
 * (case / policyApplied / outcome / decision / report each change their digest AND the
 * pipelineDigest), case-name ordering, reasonCodes fallback, invalid-input rejection,
 * deep-frozen output, no input mutation, gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, createEvidenceGateway,
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

const failRun = (opts) => gateCI(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_FAIL }, opts)
const passRun = () => gateCI(setOf('a', 'b'), { a: PLAN_PASS, b: PLAN_PASS })
const clone = (x) => structuredClone(x)
const HEX16 = /^[0-9a-f]{16}$/

// ── valid creation ───────────────────────────────────────────────────────────────────

test('valid manifest creation → required fields + stable identifiers', () => {
  const r = failRun()
  const m = createGateManifest(r)
  assert.equal(m.manifestVersion, 'gate-manifest/v1')
  assert.equal(m.artifactType, 'coach-eye-intelligence.gate-manifest')
  assert.ok(HEX16.test(m.pipelineDigest))

  assert.equal(m.inputs.caseCount, 2)
  assert.deepEqual(m.inputs.caseNames, ['ok', 'bad'])
  assert.equal(m.inputs.caseDigests.length, 2)
  assert.ok(m.inputs.caseDigests.every(d => HEX16.test(d)))

  assert.equal(m.policy.ok, r.decision.ok)
  assert.ok(HEX16.test(m.policy.policyAppliedDigest))
  assert.deepEqual(m.policy.reasonCodes, [...r.decision.reasonCodes])

  assert.equal(m.outcome.status, r.outcome.status)
  assert.equal(m.outcome.statusLine, r.outcome.statusLine)
  assert.deepEqual(m.outcome.affectedStages, r.outcome.affectedStages)
  assert.equal(m.outcome.totalViolations, r.outcome.violations)
  assert.equal(m.outcome.totalTolerated, r.outcome.tolerated)
  assert.ok(HEX16.test(m.outcome.outcomeDigest))

  assert.equal(m.decision.ok, r.decision.ok)
  assert.equal(m.decision.exitCode, r.decision.exitCode)
  assert.equal(m.decision.line, r.decision.line)
  assert.ok(HEX16.test(m.decision.decisionDigest))

  assert.equal(m.report.headline, r.envelope.report.headline)
  assert.ok(HEX16.test(m.report.reportDigest))

  // artifacts block mirrors the per-section digests
  assert.equal(m.artifacts.outcomeDigest, m.outcome.outcomeDigest)
  assert.equal(m.artifacts.decisionDigest, m.decision.decisionDigest)
  assert.equal(m.artifacts.reportDigest, m.report.reportDigest)
  assert.ok(HEX16.test(m.artifacts.envelopeDigest))
})

// ── determinism ──────────────────────────────────────────────────────────────────────

test('deterministic — same input → identical manifest', () => {
  const r = failRun()
  assert.deepEqual(createGateManifest(r), createGateManifest(r))
})

test('identical independent runs → identical pipelineDigest', () => {
  assert.equal(createGateManifest(failRun()).pipelineDigest, createGateManifest(failRun()).pipelineDigest)
  // a different run (pass vs fail) → different digest
  assert.notEqual(createGateManifest(passRun()).pipelineDigest, createGateManifest(failRun()).pipelineDigest)
})

// ── per-artifact digest sensitivity ──────────────────────────────────────────────────

test('changed case → caseDigest + pipelineDigest change', () => {
  const m1 = createGateManifest(failRun())
  const r2 = clone(failRun()); r2.envelope.cases[0].name = 'renamed'
  const m2 = createGateManifest(r2)
  assert.notEqual(m2.inputs.caseDigests[0], m1.inputs.caseDigests[0])
  assert.notEqual(m2.pipelineDigest, m1.pipelineDigest)
})

test('changed policyApplied → policyAppliedDigest + pipelineDigest change', () => {
  const m1 = createGateManifest(failRun())
  const r2 = clone(failRun()); r2.decision.policyApplied = { ...r2.decision.policyApplied, requirePass: false }
  const m2 = createGateManifest(r2)
  assert.notEqual(m2.policy.policyAppliedDigest, m1.policy.policyAppliedDigest)
  assert.notEqual(m2.pipelineDigest, m1.pipelineDigest)
})

test('changed outcome → outcomeDigest + pipelineDigest change', () => {
  const m1 = createGateManifest(failRun())
  const r2 = clone(failRun()); r2.outcome.overflow = (r2.outcome.overflow || 0) + 1   // deep field, not surfaced
  const m2 = createGateManifest(r2)
  assert.notEqual(m2.outcome.outcomeDigest, m1.outcome.outcomeDigest)
  assert.notEqual(m2.pipelineDigest, m1.pipelineDigest)
})

test('changed decision → decisionDigest + pipelineDigest change', () => {
  const m1 = createGateManifest(failRun())
  const r2 = clone(failRun()); r2.decision.line = `${r2.decision.line} (edited)`
  const m2 = createGateManifest(r2)
  assert.notEqual(m2.decision.decisionDigest, m1.decision.decisionDigest)
  assert.notEqual(m2.pipelineDigest, m1.pipelineDigest)
})

test('changed report → reportDigest + pipelineDigest change', () => {
  const m1 = createGateManifest(failRun())
  const r2 = clone(failRun()); r2.envelope.report.headline = 'CHANGED HEADLINE'
  const m2 = createGateManifest(r2)
  assert.notEqual(m2.report.reportDigest, m1.report.reportDigest)
  assert.notEqual(m2.pipelineDigest, m1.pipelineDigest)
})

// ── case-name ordering ───────────────────────────────────────────────────────────────

test('caseNames preserve the envelope.cases order', () => {
  const r = gateCI(setOf('c', 'a', 'b'), { c: PLAN_PASS, a: PLAN_PASS, b: PLAN_PASS })
  const m = createGateManifest(r)
  assert.deepEqual(m.inputs.caseNames, ['c', 'a', 'b'])
  assert.deepEqual(m.inputs.caseNames, r.envelope.cases.map(c => c.name))
})

// ── reasonCodes fallback ─────────────────────────────────────────────────────────────

test('missing reasonCodes → empty array', () => {
  const r2 = clone(passRun()); delete r2.decision.reasonCodes
  const m = createGateManifest(r2)
  assert.deepEqual(m.policy.reasonCodes, [])
})

// ── invalid input ────────────────────────────────────────────────────────────────────

test('invalid input → TypeError', () => {
  const r = failRun()
  assert.throws(() => createGateManifest(null), TypeError)
  assert.throws(() => createGateManifest({}), TypeError)
  assert.throws(() => createGateManifest({ outcome: r.outcome, decision: r.decision }), TypeError)        // no envelope
  assert.throws(() => createGateManifest({ envelope: { report: {} }, outcome: {}, decision: {} }), TypeError) // cases not array
  assert.throws(() => createGateManifest({ envelope: { cases: [] }, outcome: {}, decision: {} }), TypeError)  // no report
  assert.throws(() => createGateManifest({ envelope: { cases: [], report: {} }, decision: {} }), TypeError)   // no outcome
})

// ── immutability / mutation ──────────────────────────────────────────────────────────

test('manifest is deeply frozen', () => {
  const m = createGateManifest(failRun())
  assert.ok(Object.isFrozen(m) && Object.isFrozen(m.inputs) && Object.isFrozen(m.inputs.caseNames) &&
    Object.isFrozen(m.inputs.caseDigests) && Object.isFrozen(m.policy) && Object.isFrozen(m.policy.reasonCodes) &&
    Object.isFrozen(m.outcome) && Object.isFrozen(m.outcome.affectedStages) && Object.isFrozen(m.decision) &&
    Object.isFrozen(m.report) && Object.isFrozen(m.artifacts))
  assert.throws(() => { m.pipelineDigest = 'x' })
  assert.throws(() => m.inputs.caseNames.push('x'))
})

test('does not mutate the input result', () => {
  const r = failRun({ maxEntriesPerCase: 1 })
  const before = JSON.stringify(r)
  createGateManifest(r)
  assert.equal(JSON.stringify(r), before)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.createGateManifest matches createGateManifest', () => {
  const gw = createEvidenceGateway()
  const r = failRun()
  assert.deepEqual(gw.createGateManifest(r), createGateManifest(r))
})
