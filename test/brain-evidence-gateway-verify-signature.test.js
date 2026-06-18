/**
 * M89 — Evidence Gateway gate manifest signature verifier (verifyGateManifestSignature) tests
 *
 * Deterministic tests over an M83 manifest with an injected, crypto-agnostic verifyFn:
 * valid → ok true, invalid → ok false, verifyFn receives { canonical, pipelineDigest } +
 * signature, pipelineDigest returned, invalid-manifest / missing-signature / non-function
 * rejection, verifyFn throw propagation, deep-frozen output, no input mutation, gateway
 * parity. No cryptography is used — the verifier is injected.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, gateManifestSigningPayload,
  verifyGateManifestSignature, createEvidenceGateway,
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

// a fake, deterministic "signature scheme": signature is valid iff it equals `sig:${pipelineDigest}`
const fakeSign = (m) => `sig:${gateManifestSigningPayload(m).pipelineDigest}`
const fakeVerify = (payload, signature) => signature === `sig:${payload.pipelineDigest}`

// ── valid / invalid ──────────────────────────────────────────────────────────────────

test('valid signature → ok true', () => {
  const m = manifest()
  const v = verifyGateManifestSignature(m, fakeSign(m), fakeVerify)
  assert.equal(v.ok, true)
  assert.equal(v.pipelineDigest, m.pipelineDigest)
})

test('invalid signature → ok false', () => {
  const m = manifest()
  const v = verifyGateManifestSignature(m, 'sig:wrong', fakeVerify)
  assert.equal(v.ok, false)
  assert.ok(HEX16.test(v.pipelineDigest))
})

test('ok coerces verifyFn truthiness to a boolean', () => {
  const m = manifest()
  assert.equal(verifyGateManifestSignature(m, 's', () => 1).ok, true)
  assert.equal(verifyGateManifestSignature(m, 's', () => 0).ok, false)
  assert.equal(verifyGateManifestSignature(m, 's', () => '').ok, false)
})

// ── verifyFn receives the signing payload + signature ────────────────────────────────

test('verifyFn receives { canonical, pipelineDigest } and the signature', () => {
  const m = manifest()
  const expected = gateManifestSigningPayload(m)
  let seenPayload, seenSig
  verifyGateManifestSignature(m, 'the-signature', (payload, signature) => {
    seenPayload = payload; seenSig = signature; return true
  })
  assert.equal(seenPayload.canonical, expected.canonical)
  assert.equal(seenPayload.pipelineDigest, expected.pipelineDigest)
  assert.equal(seenSig, 'the-signature')
})

// ── pipelineDigest returned ──────────────────────────────────────────────────────────

test('pipelineDigest returned equals the signing payload digest', () => {
  const m = manifest()
  assert.equal(verifyGateManifestSignature(m, 's', () => true).pipelineDigest, gateManifestSigningPayload(m).pipelineDigest)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid manifest → TypeError', () => {
  assert.throws(() => verifyGateManifestSignature(null, 's', () => true), TypeError)
  assert.throws(() => verifyGateManifestSignature({}, 's', () => true), TypeError)
})

test('missing signature → TypeError', () => {
  const m = manifest()
  assert.throws(() => verifyGateManifestSignature(m, undefined, () => true), TypeError)
  assert.throws(() => verifyGateManifestSignature(m, null, () => true), TypeError)
})

test('non-function verifyFn → TypeError', () => {
  const m = manifest()
  assert.throws(() => verifyGateManifestSignature(m, 's', null), TypeError)
  assert.throws(() => verifyGateManifestSignature(m, 's', 'nope'), TypeError)
  assert.throws(() => verifyGateManifestSignature(m, 's'), TypeError)   // omitted
})

// ── verifyFn throw propagation ───────────────────────────────────────────────────────

test('verifyFn throwing propagates unchanged', () => {
  const m = manifest()
  const boom = new Error('verifier exploded')
  assert.throws(() => verifyGateManifestSignature(m, 's', () => { throw boom }), (e) => e === boom)
})

// ── immutability / mutation ──────────────────────────────────────────────────────────

test('result is frozen', () => {
  const v = verifyGateManifestSignature(manifest(), 's', () => true)
  assert.ok(Object.isFrozen(v))
  assert.throws(() => { v.ok = false })
  assert.throws(() => { v.pipelineDigest = 'x' })
})

test('does not mutate the input manifest', () => {
  const m = manifest()
  const before = JSON.stringify(m)
  verifyGateManifestSignature(m, fakeSign(m), fakeVerify)
  assert.equal(JSON.stringify(m), before)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.verifyGateManifestSignature matches verifyGateManifestSignature', () => {
  const gw = createEvidenceGateway()
  const m = manifest()
  const sig = fakeSign(m)
  assert.deepEqual(gw.verifyGateManifestSignature(m, sig, fakeVerify), verifyGateManifestSignature(m, sig, fakeVerify))
  assert.deepEqual(gw.verifyGateManifestSignature(m, 'bad', fakeVerify), verifyGateManifestSignature(m, 'bad', fakeVerify))
})
