/**
 * M84 — Evidence Gateway gate manifest comparator (compareGateManifests) tests
 *
 * Deterministic tests for the dormant comparator over two M83 manifests: identical,
 * pipelineDigest-only match (flags computed independently), changed/added/removed case
 * digests, artifact-digest changes, policy/outcome/decision/report change detection,
 * deterministic `changed` ordering, invalid-input rejection, deep-frozen output, no input
 * mutation, gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, compareGateManifests, createEvidenceGateway,
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

const manifestOf = (spec, opts) => createGateManifest(gateCI(
  createExpectationSet(Object.keys(spec).map(n => ({ name: n, expectedSnapshot: SNAP_A }))),
  Object.fromEntries(Object.entries(spec).map(([n, ok]) => [n, ok ? PLAN_PASS : PLAN_FAIL])),
  opts,
))
const clone = (x) => structuredClone(x)

// ── identical ────────────────────────────────────────────────────────────────────────

test('identical manifests → identical true, no changes', () => {
  const c = compareGateManifests(manifestOf({ ok: true, bad: false }), manifestOf({ ok: true, bad: false }))
  assert.equal(c.identical, true)
  assert.equal(c.pipelineDigestMatch, true)
  assert.deepEqual(c.changed, [])
  assert.deepEqual(c.caseChanges, [])
  assert.deepEqual(c.artifactChanges, [])
  assert.equal(c.policyChanged, false)
  assert.equal(c.outcomeChanged, false)
  assert.equal(c.decisionChanged, false)
  assert.equal(c.reportChanged, false)
})

// ── pipelineDigestMatch vs identical computed independently ───────────────────────────

test('pipelineDigest-only match → pipelineDigestMatch true but identical false', () => {
  const a = manifestOf({ ok: true, bad: false })
  const b = clone(a)
  // tamper a non-digest field but copy the same pipelineDigest
  b.report.headline = `${b.report.headline} (tampered)`
  const c = compareGateManifests(a, b)
  assert.equal(c.pipelineDigestMatch, true)   // digests still equal (copied)
  assert.equal(c.identical, false)            // full comparison detects the difference
  assert.equal(c.reportChanged, true)
})

// ── case digest changes ──────────────────────────────────────────────────────────────

test('changed case digest → caseChanges status "changed"', () => {
  const a = manifestOf({ ok: true, bad: false })
  const b = clone(a); b.inputs.caseDigests[1] = 'ffffffffffffffff'   // alter the 'bad' case digest
  const c = compareGateManifests(a, b)
  assert.deepEqual(c.caseChanges, [{ name: 'bad', status: 'changed', beforeDigest: a.inputs.caseDigests[1], afterDigest: 'ffffffffffffffff' }])
  assert.ok(c.changed.includes('inputs'))
  assert.equal(c.identical, false)
})

test('added case → status "added", beforeDigest null', () => {
  const a = manifestOf({ ok: true })
  const b = clone(a); b.inputs.caseNames.push('extra'); b.inputs.caseDigests.push('aaaaaaaaaaaaaaaa')
  const c = compareGateManifests(a, b)
  assert.deepEqual(c.caseChanges, [{ name: 'extra', status: 'added', beforeDigest: null, afterDigest: 'aaaaaaaaaaaaaaaa' }])
})

test('removed case → status "removed", afterDigest null', () => {
  const a = manifestOf({ ok: true, bad: false })
  const b = clone(a)
  const removedDigest = b.inputs.caseDigests[1]
  b.inputs.caseNames.pop(); b.inputs.caseDigests.pop()   // drop 'bad'
  const c = compareGateManifests(a, b)
  assert.deepEqual(c.caseChanges, [{ name: 'bad', status: 'removed', beforeDigest: removedDigest, afterDigest: null }])
})

// ── artifact changes ─────────────────────────────────────────────────────────────────

test('artifact digest change → artifactChanges entry in fixed key order', () => {
  const a = manifestOf({ ok: true, bad: false })
  const b = clone(a)
  b.artifacts.outcomeDigest = 'bbbbbbbbbbbbbbbb'
  b.artifacts.reportDigest = 'cccccccccccccccc'
  const c = compareGateManifests(a, b)
  assert.deepEqual(c.artifactChanges.map(x => x.name), ['outcomeDigest', 'reportDigest'])   // ARTIFACT_KEYS order
  assert.equal(c.artifactChanges[0].beforeDigest, a.artifacts.outcomeDigest)
  assert.equal(c.artifactChanges[0].afterDigest, 'bbbbbbbbbbbbbbbb')
  assert.ok(c.changed.includes('artifacts'))
})

// ── policy / outcome / decision / report changes ─────────────────────────────────────

test('policy change → policyChanged true', () => {
  const a = manifestOf({ ok: true, bad: false })
  const b = clone(a); b.policy.policyAppliedDigest = '1111111111111111'
  assert.equal(compareGateManifests(a, b).policyChanged, true)
  const b2 = clone(a); b2.policy.reasonCodes = [...a.policy.reasonCodes, 'extra']
  assert.equal(compareGateManifests(a, b2).policyChanged, true)
})

test('outcome change → outcomeChanged true (digest or summary field)', () => {
  const a = manifestOf({ ok: true, bad: false })
  const b = clone(a); b.outcome.outcomeDigest = '2222222222222222'
  assert.equal(compareGateManifests(a, b).outcomeChanged, true)
  const b2 = clone(a); b2.outcome.totalViolations = a.outcome.totalViolations + 1
  assert.equal(compareGateManifests(a, b2).outcomeChanged, true)
})

test('decision change → decisionChanged true', () => {
  const a = manifestOf({ ok: true, bad: false })
  const b = clone(a); b.decision.exitCode = a.decision.exitCode === 0 ? 1 : 0
  assert.equal(compareGateManifests(a, b).decisionChanged, true)
})

test('report change → reportChanged true', () => {
  const a = manifestOf({ ok: true, bad: false })
  const b = clone(a); b.report.reportDigest = '3333333333333333'
  assert.equal(compareGateManifests(a, b).reportChanged, true)
})

// ── deterministic ordering of `changed` ──────────────────────────────────────────────

test('changed areas are in fixed deterministic order', () => {
  const a = manifestOf({ ok: true, bad: false })
  const b = clone(a)
  // perturb several areas at once
  b.inputs.caseDigests[0] = 'dddddddddddddddd'
  b.report.reportDigest = 'eeeeeeeeeeeeeeee'
  b.policy.policyAppliedDigest = 'ffffffffffffffff'
  b.artifacts.envelopeDigest = '0000000000000000'
  const c = compareGateManifests(a, b)
  assert.deepEqual(c.changed, ['inputs', 'policy', 'report', 'artifacts'])   // AREA_ORDER subset
})

// ── invalid input ────────────────────────────────────────────────────────────────────

test('invalid input → TypeError', () => {
  const m = manifestOf({ ok: true })
  assert.throws(() => compareGateManifests(null, m), TypeError)
  assert.throws(() => compareGateManifests(m, {}), TypeError)
  assert.throws(() => compareGateManifests({ pipelineDigest: 'x' }, m), TypeError)   // missing sub-objects
})

// ── immutability / mutation ──────────────────────────────────────────────────────────

test('result is deeply frozen', () => {
  const a = manifestOf({ ok: true, bad: false })
  const b = clone(a); b.inputs.caseDigests[1] = '9999999999999999'
  const c = compareGateManifests(a, b)
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.changed) && Object.isFrozen(c.caseChanges) &&
    Object.isFrozen(c.artifactChanges) && Object.isFrozen(c.caseChanges[0]))
  assert.throws(() => c.caseChanges.push({}))
  assert.throws(() => { c.identical = true })
})

test('does not mutate inputs', () => {
  const a = manifestOf({ ok: true, bad: false })
  const b = manifestOf({ ok: true, bad: false })
  const beforeA = JSON.stringify(a)
  const beforeB = JSON.stringify(b)
  compareGateManifests(a, b)
  assert.equal(JSON.stringify(a), beforeA)
  assert.equal(JSON.stringify(b), beforeB)
})

test('deterministic — identical inputs → identical comparison', () => {
  const a = manifestOf({ ok: true, bad: false })
  const b = clone(a); b.inputs.caseDigests[1] = '8888888888888888'
  assert.deepEqual(compareGateManifests(a, b), compareGateManifests(a, b))
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.compareGateManifests matches compareGateManifests', () => {
  const gw = createEvidenceGateway()
  const a = manifestOf({ ok: true, bad: false })
  const b = clone(a); b.decision.line = `${b.decision.line} x`
  assert.deepEqual(gw.compareGateManifests(a, b), compareGateManifests(a, b))
})
