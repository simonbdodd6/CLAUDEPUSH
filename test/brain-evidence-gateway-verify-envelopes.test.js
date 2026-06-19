/**
 * M93 — Evidence Gateway batch attestation verifier (verifyAttestationEnvelopes) tests
 *
 * Deterministic tests over a batch of M90 envelopes with an injected, crypto-agnostic
 * verifyFn: single / multiple-valid / mixed / all-invalid / empty; order preservation;
 * total/valid/invalid counts; allValid true/false; verifyFn call count + argument
 * forwarding; reuse of M91 verifyAttestationEnvelope; invalid-envelopes / invalid-verifyFn
 * rejection; verifyFn throw propagation; frozen output; determinism; no input mutation;
 * gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, attestationEnvelope,
  verifyAttestationEnvelope, verifyAttestationEnvelopes, createEvidenceGateway,
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

// distinct manifests by case-name set → distinct pipelineDigests
const manifestFor = (name) => createGateManifest(gateCI(setOf(name), { [name]: PLAN_PASS }))

// fake scheme: signature valid iff equals `sig:${payload.pipelineDigest}`
const fakeVerify = (payload, signature) => signature === `sig:${payload.pipelineDigest}`
const goodEnvelope = (name, opts = {}) => {
  const m = manifestFor(name)
  const base = attestationEnvelope(m)
  return attestationEnvelope(m, { signature: `sig:${base.payload.pipelineDigest}`, ...opts })
}
const badEnvelope = (name) => attestationEnvelope(manifestFor(name), { signature: 'sig:wrong' })

// ── single ───────────────────────────────────────────────────────────────────────────

test('single valid envelope', () => {
  const r = verifyAttestationEnvelopes([goodEnvelope('a')], fakeVerify)
  assert.deepEqual({ total: r.total, valid: r.valid, invalid: r.invalid, allValid: r.allValid }, { total: 1, valid: 1, invalid: 0, allValid: true })
  assert.equal(r.results.length, 1)
  assert.equal(r.results[0].ok, true)
})

// ── multiple valid ───────────────────────────────────────────────────────────────────

test('multiple valid envelopes → allValid true, counts correct', () => {
  const r = verifyAttestationEnvelopes([goodEnvelope('a'), goodEnvelope('b'), goodEnvelope('c')], fakeVerify)
  assert.equal(r.total, 3)
  assert.equal(r.valid, 3)
  assert.equal(r.invalid, 0)
  assert.equal(r.allValid, true)
  assert.ok(r.results.every(x => x.ok === true))
})

// ── mixed ──────────────────────────────────────────────────────────────────────────

test('mixed valid/invalid → counts + allValid false', () => {
  const r = verifyAttestationEnvelopes([goodEnvelope('a'), badEnvelope('b'), goodEnvelope('c')], fakeVerify)
  assert.equal(r.total, 3)
  assert.equal(r.valid, 2)
  assert.equal(r.invalid, 1)
  assert.equal(r.allValid, false)
  assert.deepEqual(r.results.map(x => x.ok), [true, false, true])   // order preserved
})

// ── all invalid ──────────────────────────────────────────────────────────────────────

test('all invalid → allValid false, valid 0', () => {
  const r = verifyAttestationEnvelopes([badEnvelope('a'), badEnvelope('b')], fakeVerify)
  assert.equal(r.valid, 0)
  assert.equal(r.invalid, 2)
  assert.equal(r.allValid, false)
})

// ── empty ──────────────────────────────────────────────────────────────────────────

test('empty array → zeros and allValid true (vacuous)', () => {
  const r = verifyAttestationEnvelopes([], fakeVerify)
  assert.deepEqual({ total: r.total, valid: r.valid, invalid: r.invalid, allValid: r.allValid }, { total: 0, valid: 0, invalid: 0, allValid: true })
  assert.deepEqual(r.results, [])
})

// ── order preservation ───────────────────────────────────────────────────────────────

test('preserves input order (results align with envelopes, no sorting)', () => {
  const envs = [badEnvelope('a'), goodEnvelope('b'), badEnvelope('c'), goodEnvelope('d')]
  const r = verifyAttestationEnvelopes(envs, fakeVerify)
  assert.deepEqual(r.results.map(x => x.ok), [false, true, false, true])
  // pipelineDigests echo the envelopes in order
  assert.deepEqual(r.results.map(x => x.pipelineDigest), envs.map(e => e.payload.pipelineDigest))
})

// ── verifyFn call count + argument forwarding ────────────────────────────────────────

test('verifyFn called once per envelope with the envelope payload + signature', () => {
  const envs = [goodEnvelope('a'), goodEnvelope('b')]
  const calls = []
  verifyAttestationEnvelopes(envs, (payload, signature) => { calls.push({ payload, signature }); return true })
  assert.equal(calls.length, 2)
  envs.forEach((e, i) => {
    assert.equal(calls[i].payload, e.payload)         // exact object forwarded
    assert.equal(calls[i].signature, e.signature)
  })
})

// ── reuse of M91 (not duplicated behaviour) ──────────────────────────────────────────

test('each result equals calling verifyAttestationEnvelope individually', () => {
  const envs = [goodEnvelope('a', { keyId: 'k', algorithm: 'ed25519' }), badEnvelope('b')]
  const r = verifyAttestationEnvelopes(envs, fakeVerify)
  envs.forEach((e, i) => assert.deepEqual(r.results[i], verifyAttestationEnvelope(e, fakeVerify)))
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('non-array envelopes → TypeError', () => {
  assert.throws(() => verifyAttestationEnvelopes(null, fakeVerify), TypeError)
  assert.throws(() => verifyAttestationEnvelopes({}, fakeVerify), TypeError)
  assert.throws(() => verifyAttestationEnvelopes('nope', fakeVerify), TypeError)
})

test('non-function verifyFn → TypeError', () => {
  assert.throws(() => verifyAttestationEnvelopes([goodEnvelope('a')], null), TypeError)
  assert.throws(() => verifyAttestationEnvelopes([], 'nope'), TypeError)
  assert.throws(() => verifyAttestationEnvelopes([goodEnvelope('a')]), TypeError)
})

test('a malformed envelope in the batch propagates M91 TypeError', () => {
  assert.throws(() => verifyAttestationEnvelopes([goodEnvelope('a'), { payload: { pipelineDigest: 'x' } }], fakeVerify), TypeError)  // no signature
})

// ── verifyFn throw propagation ───────────────────────────────────────────────────────

test('verifyFn throwing propagates unchanged', () => {
  const boom = new Error('verifier exploded')
  assert.throws(() => verifyAttestationEnvelopes([goodEnvelope('a')], () => { throw boom }), (e) => e === boom)
})

// ── immutability / mutation ──────────────────────────────────────────────────────────

test('output is frozen (aggregate + results array + entries)', () => {
  const r = verifyAttestationEnvelopes([goodEnvelope('a'), badEnvelope('b')], fakeVerify)
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.results) && Object.isFrozen(r.results[0]))
  assert.throws(() => { r.total = 99 })
  assert.throws(() => r.results.push({}))
})

test('deterministic — identical inputs → identical aggregate', () => {
  const envs = [goodEnvelope('a'), badEnvelope('b'), goodEnvelope('c')]
  assert.deepEqual(verifyAttestationEnvelopes(envs, fakeVerify), verifyAttestationEnvelopes(envs, fakeVerify))
})

test('does not mutate the input envelopes array or its envelopes', () => {
  const envs = [goodEnvelope('a', { keyId: 'k' }), badEnvelope('b')]
  const before = JSON.stringify(envs)
  const len = envs.length
  verifyAttestationEnvelopes(envs, fakeVerify)
  assert.equal(JSON.stringify(envs), before)
  assert.equal(envs.length, len)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.verifyAttestationEnvelopes matches verifyAttestationEnvelopes', () => {
  const gw = createEvidenceGateway()
  const envs = [goodEnvelope('a'), badEnvelope('b'), goodEnvelope('c')]
  assert.deepEqual(gw.verifyAttestationEnvelopes(envs, fakeVerify), verifyAttestationEnvelopes(envs, fakeVerify))
})
