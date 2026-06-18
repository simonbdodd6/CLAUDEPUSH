/**
 * M87 — Evidence Gateway gate manifest integrity verifier (verifyGateManifest) tests
 *
 * Deterministic tests over an M83 manifest: untouched → ok true with expected===actual,
 * tampered payload → ok false, expected/actual exposed, recomputation excludes
 * pipelineDigest itself, determinism, invalid-input rejection, deep-frozen output, no input
 * mutation, gateway parity. Verifier reuses the M65 canonicalStringify/pipelineDigest
 * approach used by createGateManifest.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest,
  verifyGateManifest, canonicalStringify, pipelineDigest, createEvidenceGateway,
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
const planFor = (registry, records) => prepareFullPipelinePlan({ registry, records, context: NCTX })
const snapFor = (registry, records) => snapshotPipelinePlan(planFor(registry, records))

const SNAP_A = snapFor(REG, [rec('ev_1')])
const PLAN_PASS = planFor(REG, [rec('ev_1')])
const setOf = (...names) => createExpectationSet(names.map(n => ({ name: n, expectedSnapshot: SNAP_A })))
const clone = (x) => structuredClone(x)

const manifest = () => createGateManifest(gateCI(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_PASS }))
const HEX16 = /^[0-9a-f]{16}$/

// ── valid untouched manifest ─────────────────────────────────────────────────────────

test('untouched manifest → ok true, expected === actual === pipelineDigest', () => {
  const m = manifest()
  const v = verifyGateManifest(m)
  assert.equal(v.ok, true)
  assert.equal(v.expected, m.pipelineDigest)
  assert.equal(v.actual, m.pipelineDigest)
  assert.equal(v.expected, v.actual)
  assert.ok(HEX16.test(v.actual))
})

// ── tampered manifest ────────────────────────────────────────────────────────────────

test('tampered payload field → ok false; actual reflects the tamper, expected does not', () => {
  const m = manifest()
  const t = clone(m)
  t.report.headline = `${t.report.headline} (tampered)`   // change payload but leave stored digest
  const v = verifyGateManifest(t)
  assert.equal(v.ok, false)
  assert.equal(v.expected, m.pipelineDigest)              // stored digest unchanged
  assert.notEqual(v.actual, v.expected)                   // recomputed digest differs
  assert.ok(HEX16.test(v.actual))
})

test('tampered inputs/outcome/decision/policy/artifacts each → ok false', () => {
  const mutate = [
    (t) => { t.inputs.caseDigests[0] = 'ffffffffffffffff' },
    (t) => { t.outcome.totalViolations += 1 },
    (t) => { t.decision.exitCode = t.decision.exitCode === 0 ? 1 : 0 },
    (t) => { t.policy.reasonCodes = [...t.policy.reasonCodes, 'x'] },
    (t) => { t.artifacts.outcomeDigest = '0000000000000000' },
  ]
  for (const apply of mutate) {
    const t = clone(manifest()); apply(t)
    assert.equal(verifyGateManifest(t).ok, false)
  }
})

// ── recomputation excludes pipelineDigest itself ─────────────────────────────────────

test('changing ONLY pipelineDigest → ok false; actual stays the true payload digest', () => {
  const m = manifest()
  const t = clone(m); t.pipelineDigest = 'deadbeefdeadbeef'
  const v = verifyGateManifest(t)
  assert.equal(v.ok, false)
  assert.equal(v.expected, 'deadbeefdeadbeef')            // the tampered stored value
  assert.equal(v.actual, m.pipelineDigest)                // recomputed payload digest is the real one
})

test('actual matches an independent recompute of the payload (M65 approach)', () => {
  const m = manifest()
  const { pipelineDigest: _omit, ...payload } = m
  const independent = pipelineDigest(canonicalStringify(payload))
  assert.equal(verifyGateManifest(m).actual, independent)
})

// ── determinism ──────────────────────────────────────────────────────────────────────

test('deterministic — identical manifest → identical verdict', () => {
  const m = manifest()
  assert.deepEqual(verifyGateManifest(m), verifyGateManifest(m))
})

// ── invalid input ────────────────────────────────────────────────────────────────────

test('invalid input → TypeError', () => {
  assert.throws(() => verifyGateManifest(null), TypeError)
  assert.throws(() => verifyGateManifest('nope'), TypeError)
  assert.throws(() => verifyGateManifest({}), TypeError)                        // no pipelineDigest/sub-objects
  assert.throws(() => verifyGateManifest({ pipelineDigest: 'x' }), TypeError)   // missing sub-objects
})

// ── immutability / mutation ──────────────────────────────────────────────────────────

test('verdict is frozen', () => {
  const v = verifyGateManifest(manifest())
  assert.ok(Object.isFrozen(v))
  assert.throws(() => { v.ok = false })
  assert.throws(() => { v.actual = 'x' })
})

test('does not mutate the input manifest', () => {
  const m = manifest()
  const before = JSON.stringify(m)
  verifyGateManifest(m)
  assert.equal(JSON.stringify(m), before)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.verifyGateManifest matches verifyGateManifest', () => {
  const gw = createEvidenceGateway()
  const m = manifest()
  assert.deepEqual(gw.verifyGateManifest(m), verifyGateManifest(m))
  // and on a tampered copy
  const t = clone(m); t.decision.line = `${t.decision.line} x`
  assert.deepEqual(gw.verifyGateManifest(t), verifyGateManifest(t))
})
