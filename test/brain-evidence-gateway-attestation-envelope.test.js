/**
 * M90 — Evidence Gateway attestation envelope (attestationEnvelope) tests
 *
 * Deterministic tests over an M83 manifest: payload-only, +signature, +keyId, +algorithm,
 * undefined-option omission, explicit falsy values preserved, determinism, deep-frozen
 * output, invalid-manifest rejection, no input mutation, gateway parity. Transport container
 * only — payload always from M88; no crypto/signing/verification/hashing.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, gateManifestSigningPayload,
  attestationEnvelope, createEvidenceGateway,
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

// ── 1. payload only ──────────────────────────────────────────────────────────────────

test('payload only → { payload } with M88 payload, no metadata keys', () => {
  const m = manifest()
  const e = attestationEnvelope(m)
  assert.deepEqual(Object.keys(e), ['payload'])
  assert.deepEqual(e.payload, gateManifestSigningPayload(m))
  assert.equal(e.payload.pipelineDigest, m.pipelineDigest)
  assert.equal(typeof e.payload.canonical, 'string')
  assert.ok(!('signature' in e) && !('keyId' in e) && !('algorithm' in e))
})

// ── 2. payload + signature ───────────────────────────────────────────────────────────

test('payload + signature', () => {
  const e = attestationEnvelope(manifest(), { signature: 'sig-abc' })
  assert.equal(e.signature, 'sig-abc')
  assert.ok(!('keyId' in e) && !('algorithm' in e))
})

// ── 3. payload + signature + keyId ───────────────────────────────────────────────────

test('payload + signature + keyId', () => {
  const e = attestationEnvelope(manifest(), { signature: 'sig-abc', keyId: 'key-1' })
  assert.equal(e.signature, 'sig-abc')
  assert.equal(e.keyId, 'key-1')
  assert.ok(!('algorithm' in e))
})

// ── 4. payload + signature + keyId + algorithm ───────────────────────────────────────

test('payload + signature + keyId + algorithm', () => {
  const e = attestationEnvelope(manifest(), { signature: 'sig-abc', keyId: 'key-1', algorithm: 'ed25519' })
  assert.deepEqual(Object.keys(e).sort(), ['algorithm', 'keyId', 'payload', 'signature'])
  assert.equal(e.signature, 'sig-abc')
  assert.equal(e.keyId, 'key-1')
  assert.equal(e.algorithm, 'ed25519')
})

// ── 5. undefined option omission ─────────────────────────────────────────────────────

test('undefined options are omitted cleanly', () => {
  const e = attestationEnvelope(manifest(), { signature: undefined, keyId: undefined, algorithm: 'x' })
  assert.ok(!('signature' in e) && !('keyId' in e))
  assert.equal(e.algorithm, 'x')
  // empty options object behaves like no options
  assert.deepEqual(Object.keys(attestationEnvelope(manifest(), {})), ['payload'])
})

// ── 6. explicit falsy values preserved ───────────────────────────────────────────────

test('explicit falsy values are preserved (empty string / false / 0)', () => {
  const e = attestationEnvelope(manifest(), { signature: '', keyId: 0, algorithm: false })
  assert.ok('signature' in e && e.signature === '')
  assert.ok('keyId' in e && e.keyId === 0)
  assert.ok('algorithm' in e && e.algorithm === false)
})

// ── 7. determinism ───────────────────────────────────────────────────────────────────

test('deterministic — identical inputs → identical envelope', () => {
  const m = manifest()
  const opts = { signature: 'sig', keyId: 'k', algorithm: 'a' }
  assert.deepEqual(attestationEnvelope(m, opts), attestationEnvelope(m, opts))
})

// ── 8. deep frozen output ────────────────────────────────────────────────────────────

test('envelope and its M88 payload are frozen', () => {
  const e = attestationEnvelope(manifest(), { signature: 'sig' })
  assert.ok(Object.isFrozen(e) && Object.isFrozen(e.payload))
  assert.throws(() => { e.signature = 'x' })
  assert.throws(() => { e.payload.pipelineDigest = 'x' })
})

// ── 9. invalid manifest rejection ────────────────────────────────────────────────────

test('invalid manifest → TypeError', () => {
  assert.throws(() => attestationEnvelope(null, { signature: 's' }), TypeError)
  assert.throws(() => attestationEnvelope({}, { signature: 's' }), TypeError)
})

// ── 10. input not mutated ────────────────────────────────────────────────────────────

test('does not mutate the input manifest or options', () => {
  const m = manifest()
  const opts = { signature: 'sig', keyId: 'k', algorithm: 'a' }
  const beforeM = JSON.stringify(m)
  const beforeOpts = JSON.stringify(opts)
  attestationEnvelope(m, opts)
  assert.equal(JSON.stringify(m), beforeM)
  assert.equal(JSON.stringify(opts), beforeOpts)
})

// ── 11. gateway parity ───────────────────────────────────────────────────────────────

test('gateway.attestationEnvelope matches attestationEnvelope', () => {
  const gw = createEvidenceGateway()
  const m = manifest()
  const opts = { signature: 'sig', keyId: 'k', algorithm: 'a' }
  assert.deepEqual(gw.attestationEnvelope(m, opts), attestationEnvelope(m, opts))
  assert.deepEqual(gw.attestationEnvelope(m), attestationEnvelope(m))
})
