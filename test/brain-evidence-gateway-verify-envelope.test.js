/**
 * M91 — Evidence Gateway attestation envelope verifier (verifyAttestationEnvelope) tests
 *
 * Deterministic tests over an M90 envelope with an injected, crypto-agnostic verifyFn:
 * valid → ok true, invalid → ok false, verifyFn receives payload + signature, pipelineDigest
 * returned, keyId/algorithm returned when present (falsy preserved), missing-payload /
 * missing-signature / non-function rejection, verifyFn throw propagation, deep-frozen output,
 * no input mutation, gateway parity. No cryptography is used — the verifier is injected and
 * the envelope's own payload is trusted as-is.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, attestationEnvelope,
  verifyAttestationEnvelope, createEvidenceGateway,
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
const HEX16 = /^[0-9a-f]{16}$/

// fake, deterministic scheme: signature valid iff it equals `sig:${payload.pipelineDigest}`
const fakeVerify = (payload, signature) => signature === `sig:${payload.pipelineDigest}`
const signedEnvelope = (opts = {}) => {
  const m = manifest()
  const base = attestationEnvelope(m)
  return attestationEnvelope(m, { signature: `sig:${base.payload.pipelineDigest}`, ...opts })
}

// ── valid / invalid ──────────────────────────────────────────────────────────────────

test('valid envelope → ok true, pipelineDigest returned', () => {
  const e = signedEnvelope()
  const v = verifyAttestationEnvelope(e, fakeVerify)
  assert.equal(v.ok, true)
  assert.equal(v.pipelineDigest, e.payload.pipelineDigest)
  assert.ok(HEX16.test(v.pipelineDigest))
})

test('invalid signature → ok false', () => {
  const m = manifest()
  const e = attestationEnvelope(m, { signature: 'sig:wrong' })
  const v = verifyAttestationEnvelope(e, fakeVerify)
  assert.equal(v.ok, false)
  assert.equal(v.pipelineDigest, e.payload.pipelineDigest)
})

test('ok coerces verifyFn truthiness to boolean', () => {
  const e = signedEnvelope()
  assert.equal(verifyAttestationEnvelope(e, () => 1).ok, true)
  assert.equal(verifyAttestationEnvelope(e, () => 0).ok, false)
  assert.equal(verifyAttestationEnvelope(e, () => '').ok, false)
})

// ── verifyFn receives payload + signature ────────────────────────────────────────────

test('verifyFn receives envelope.payload and envelope.signature', () => {
  const e = signedEnvelope()
  let seenPayload, seenSig
  verifyAttestationEnvelope(e, (payload, signature) => { seenPayload = payload; seenSig = signature; return true })
  assert.equal(seenPayload, e.payload)            // the envelope's own payload, as-is
  assert.equal(seenSig, e.signature)
})

// ── keyId / algorithm returned when present (falsy preserved) ────────────────────────

test('keyId returned when present', () => {
  const v = verifyAttestationEnvelope(signedEnvelope({ keyId: 'key-1' }), () => true)
  assert.equal(v.keyId, 'key-1')
  assert.ok(!('algorithm' in v))
})

test('algorithm returned when present', () => {
  const v = verifyAttestationEnvelope(signedEnvelope({ algorithm: 'ed25519' }), () => true)
  assert.equal(v.algorithm, 'ed25519')
  assert.ok(!('keyId' in v))
})

test('falsy keyId/algorithm values are preserved', () => {
  const v = verifyAttestationEnvelope(signedEnvelope({ keyId: 0, algorithm: false }), () => true)
  assert.ok('keyId' in v && v.keyId === 0)
  assert.ok('algorithm' in v && v.algorithm === false)
})

test('keyId/algorithm omitted when not present on the envelope', () => {
  const v = verifyAttestationEnvelope(signedEnvelope(), () => true)
  assert.ok(!('keyId' in v) && !('algorithm' in v))
  assert.deepEqual(Object.keys(v).sort(), ['ok', 'pipelineDigest'])
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('missing payload → TypeError', () => {
  assert.throws(() => verifyAttestationEnvelope(null, () => true), TypeError)
  assert.throws(() => verifyAttestationEnvelope({}, () => true), TypeError)
  assert.throws(() => verifyAttestationEnvelope({ signature: 's' }, () => true), TypeError)
})

test('missing signature → TypeError', () => {
  const m = manifest()
  const e = attestationEnvelope(m)   // no signature
  assert.throws(() => verifyAttestationEnvelope(e, () => true), TypeError)
  assert.throws(() => verifyAttestationEnvelope({ payload: { pipelineDigest: 'x' }, signature: null }, () => true), TypeError)
})

test('non-function verifyFn → TypeError', () => {
  const e = signedEnvelope()
  assert.throws(() => verifyAttestationEnvelope(e, null), TypeError)
  assert.throws(() => verifyAttestationEnvelope(e, 'nope'), TypeError)
  assert.throws(() => verifyAttestationEnvelope(e), TypeError)
})

// ── verifyFn throw propagation ───────────────────────────────────────────────────────

test('verifyFn throwing propagates unchanged', () => {
  const e = signedEnvelope()
  const boom = new Error('verifier exploded')
  assert.throws(() => verifyAttestationEnvelope(e, () => { throw boom }), (err) => err === boom)
})

// ── immutability / mutation ──────────────────────────────────────────────────────────

test('result is frozen', () => {
  const v = verifyAttestationEnvelope(signedEnvelope({ keyId: 'k' }), () => true)
  assert.ok(Object.isFrozen(v))
  assert.throws(() => { v.ok = false })
  assert.throws(() => { v.pipelineDigest = 'x' })
})

test('does not mutate the input envelope', () => {
  const e = signedEnvelope({ keyId: 'k', algorithm: 'a' })
  const before = JSON.stringify(e)
  verifyAttestationEnvelope(e, fakeVerify)
  assert.equal(JSON.stringify(e), before)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.verifyAttestationEnvelope matches verifyAttestationEnvelope', () => {
  const gw = createEvidenceGateway()
  const e = signedEnvelope({ keyId: 'k', algorithm: 'a' })
  assert.deepEqual(gw.verifyAttestationEnvelope(e, fakeVerify), verifyAttestationEnvelope(e, fakeVerify))
  const bad = attestationEnvelope(manifest(), { signature: 'sig:wrong', keyId: 'k' })
  assert.deepEqual(gw.verifyAttestationEnvelope(bad, fakeVerify), verifyAttestationEnvelope(bad, fakeVerify))
})
