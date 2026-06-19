/**
 * M92 — Evidence Gateway attestation envelope serializers (serializeAttestationEnvelope) tests
 *
 * Deterministic tests over an M90 envelope: json (default + explicit, canonical round-trip),
 * line (compact one-liner from existing fields), keyId/algorithm present/absent, falsy
 * preserved, signed=true with signature / signed=false when absent, missing-payload
 * rejection, unsupported-format rejection, determinism, no input mutation, gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, attestationEnvelope,
  serializeAttestationEnvelope, canonicalStringify, createEvidenceGateway,
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

const manifest = () => createGateManifest(gateCI(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_PASS }))
const envOf = (opts) => attestationEnvelope(manifest(), opts)

// ── json ─────────────────────────────────────────────────────────────────────────────

test('default format is json (canonical, round-trips)', () => {
  const e = envOf({ signature: 'sig', keyId: 'k', algorithm: 'a' })
  const s = serializeAttestationEnvelope(e)
  assert.equal(s, canonicalStringify(e))
  assert.deepEqual(JSON.parse(s), JSON.parse(canonicalStringify(e)))
  assert.equal(serializeAttestationEnvelope(e, { format: 'json' }), s)   // explicit == default
})

test('json key sort is canonical', () => {
  const e = envOf({ signature: 'sig', keyId: 'k', algorithm: 'a' })
  const s = serializeAttestationEnvelope(e, { format: 'json' })
  assert.ok(s.indexOf('"algorithm"') < s.indexOf('"keyId"'))
  assert.ok(s.indexOf('"keyId"') < s.indexOf('"payload"'))
})

// ── line ─────────────────────────────────────────────────────────────────────────────

test('line → compact one-liner with all tokens when present', () => {
  const e = envOf({ signature: 'sig', keyId: 'k', algorithm: 'ed25519' })
  const s = serializeAttestationEnvelope(e, { format: 'line' })
  assert.equal(s, `attestation pipelineDigest=${e.payload.pipelineDigest} keyId=k algorithm=ed25519 signed=true`)
})

test('line omits keyId/algorithm when absent', () => {
  const e = envOf({ signature: 'sig' })
  assert.equal(serializeAttestationEnvelope(e, { format: 'line' }), `attestation pipelineDigest=${e.payload.pipelineDigest} signed=true`)
})

test('line keyId present, algorithm absent', () => {
  const e = envOf({ signature: 'sig', keyId: 'k' })
  assert.equal(serializeAttestationEnvelope(e, { format: 'line' }), `attestation pipelineDigest=${e.payload.pipelineDigest} keyId=k signed=true`)
})

// ── falsy preservation ───────────────────────────────────────────────────────────────

test('line preserves explicit falsy keyId/algorithm', () => {
  const e = envOf({ signature: 'sig', keyId: 0, algorithm: false })
  assert.equal(serializeAttestationEnvelope(e, { format: 'line' }), `attestation pipelineDigest=${e.payload.pipelineDigest} keyId=0 algorithm=false signed=true`)
})

// ── signed rule ──────────────────────────────────────────────────────────────────────

test('signed=true when a signature is present', () => {
  assert.ok(serializeAttestationEnvelope(envOf({ signature: 'sig' }), { format: 'line' }).endsWith('signed=true'))
  // explicit falsy signature '' still counts as present
  assert.ok(serializeAttestationEnvelope(envOf({ signature: '' }), { format: 'line' }).endsWith('signed=true'))
})

test('signed=false when no signature is present', () => {
  assert.ok(serializeAttestationEnvelope(envOf(), { format: 'line' }).endsWith('signed=false'))
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('missing payload → TypeError', () => {
  assert.throws(() => serializeAttestationEnvelope(null), TypeError)
  assert.throws(() => serializeAttestationEnvelope({}), TypeError)
  assert.throws(() => serializeAttestationEnvelope({ signature: 's' }), TypeError)
})

test('unsupported format → TypeError', () => {
  const e = envOf({ signature: 'sig' })
  assert.throws(() => serializeAttestationEnvelope(e, { format: 'yaml' }), TypeError)
  assert.throws(() => serializeAttestationEnvelope(e, { format: '' }), TypeError)
  assert.throws(() => serializeAttestationEnvelope(e, { format: 9 }), TypeError)
})

// ── determinism / mutation ───────────────────────────────────────────────────────────

test('deterministic — identical envelope → identical output (both formats)', () => {
  const e = envOf({ signature: 'sig', keyId: 'k', algorithm: 'a' })
  for (const format of ['json', 'line']) {
    assert.equal(serializeAttestationEnvelope(e, { format }), serializeAttestationEnvelope(e, { format }))
  }
})

test('does not mutate the input envelope', () => {
  const e = envOf({ signature: 'sig', keyId: 'k', algorithm: 'a' })
  const before = JSON.stringify(e)
  serializeAttestationEnvelope(e, { format: 'json' })
  serializeAttestationEnvelope(e, { format: 'line' })
  assert.equal(JSON.stringify(e), before)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.serializeAttestationEnvelope matches serializeAttestationEnvelope', () => {
  const gw = createEvidenceGateway()
  const e = envOf({ signature: 'sig', keyId: 'k', algorithm: 'a' })
  for (const format of ['json', 'line']) {
    assert.equal(gw.serializeAttestationEnvelope(e, { format }), serializeAttestationEnvelope(e, { format }))
  }
  assert.equal(gw.serializeAttestationEnvelope(e), serializeAttestationEnvelope(e))   // default
})
