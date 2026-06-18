/**
 * M85 — Evidence Gateway gate-manifest serializers (serializeGateManifest) tests
 *
 * Deterministic tests for the dormant serializers over an M83 manifest: json (canonical,
 * round-trips, reuses canonicalStringify), line (compact one-liner from existing fields),
 * default format, determinism, missing optional fields omitted cleanly, invalid-format
 * rejection, invalid-manifest rejection, frozen input untouched, gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest,
  serializeGateManifest, canonicalStringify, createEvidenceGateway,
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

const failManifest = () => createGateManifest(gateCI(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_FAIL }))
const passManifest = () => createGateManifest(gateCI(setOf('a', 'b'), { a: PLAN_PASS, b: PLAN_PASS }))

// ── json ─────────────────────────────────────────────────────────────────────────────

test('format:"json" → canonical JSON that round-trips, reusing canonicalStringify', () => {
  const m = failManifest()
  const s = serializeGateManifest(m, { format: 'json' })
  assert.equal(s, canonicalStringify(m))
  assert.deepEqual(JSON.parse(s), JSON.parse(canonicalStringify(m)))
  assert.ok(s.indexOf('"artifactType"') < s.indexOf('"pipelineDigest"'))   // canonical key sort
})

test('default format is json', () => {
  const m = passManifest()
  assert.equal(serializeGateManifest(m), serializeGateManifest(m, { format: 'json' }))
})

// ── line ─────────────────────────────────────────────────────────────────────────────

test('format:"line" → compact one-liner from existing fields', () => {
  const m = failManifest()
  const s = serializeGateManifest(m, { format: 'line' })
  assert.equal(s, `manifest pipelineDigest=${m.pipelineDigest} cases=${m.inputs.caseCount} status=${m.outcome.status} exit=${m.decision.exitCode}`)
  assert.ok(s.startsWith('manifest pipelineDigest='))
  assert.ok(s.includes('status=fail') && s.includes('exit=1'))
})

test('line for a passing manifest', () => {
  const m = passManifest()
  const s = serializeGateManifest(m, { format: 'line' })
  assert.ok(s.includes('status=pass') && s.includes('exit=0'))
})

// ── determinism ──────────────────────────────────────────────────────────────────────

test('deterministic — identical manifest → identical serialization (both formats)', () => {
  for (const format of ['json', 'line']) {
    assert.equal(serializeGateManifest(failManifest(), { format }), serializeGateManifest(failManifest(), { format }))
  }
})

// ── missing optional fields omitted cleanly ──────────────────────────────────────────

test('line omits tokens for missing optional fields cleanly', () => {
  // only pipelineDigest present
  assert.equal(serializeGateManifest({ pipelineDigest: 'abc123' }, { format: 'line' }), 'manifest pipelineDigest=abc123')
  // pipelineDigest + caseCount only
  assert.equal(serializeGateManifest({ pipelineDigest: 'abc123', inputs: { caseCount: 4 } }, { format: 'line' }),
    'manifest pipelineDigest=abc123 cases=4')
  // status only (no digest/cases/exit)
  assert.equal(serializeGateManifest({ outcome: { status: 'pass' } }, { format: 'line' }), 'manifest status=pass')
  // nothing optional present → just the prefix
  assert.equal(serializeGateManifest({}, { format: 'line' }), 'manifest')
})

test('line includes exit=0 (falsy but present number is not omitted)', () => {
  const s = serializeGateManifest({ decision: { exitCode: 0 } }, { format: 'line' })
  assert.equal(s, 'manifest exit=0')
})

// ── invalid format / manifest ────────────────────────────────────────────────────────

test('unknown format → TypeError', () => {
  const m = passManifest()
  assert.throws(() => serializeGateManifest(m, { format: 'yaml' }), TypeError)
  assert.throws(() => serializeGateManifest(m, { format: '' }), TypeError)
  assert.throws(() => serializeGateManifest(m, { format: 9 }), TypeError)
})

test('invalid manifest → TypeError', () => {
  assert.throws(() => serializeGateManifest(null), TypeError)
  assert.throws(() => serializeGateManifest('nope'), TypeError)
})

// ── purity: input untouched ──────────────────────────────────────────────────────────

test('frozen input manifest is left untouched', () => {
  const m = failManifest()
  assert.ok(Object.isFrozen(m))
  const before = JSON.stringify(m)
  serializeGateManifest(m, { format: 'json' })
  serializeGateManifest(m, { format: 'line' })
  assert.equal(JSON.stringify(m), before)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.serializeGateManifest matches serializeGateManifest (both formats + default)', () => {
  const gw = createEvidenceGateway()
  const m = failManifest()
  for (const format of ['json', 'line']) {
    assert.equal(gw.serializeGateManifest(m, { format }), serializeGateManifest(m, { format }))
  }
  assert.equal(gw.serializeGateManifest(m), serializeGateManifest(m))
})
