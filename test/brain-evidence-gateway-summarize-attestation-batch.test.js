/**
 * M94 — Evidence Gateway attestation batch summary (summarizeAttestationBatch) tests
 *
 * Deterministic tests over an M93 batch result: json default + explicit (canonical,
 * round-trips, key sort), line, text, markdown, malformed-batch rejection, unsupported-
 * format rejection, determinism, no input mutation, gateway parity. Presentation only.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, attestationEnvelope,
  verifyAttestationEnvelopes, summarizeAttestationBatch, canonicalStringify, createEvidenceGateway,
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

const manifestFor = (name) => createGateManifest(gateCI(setOf(name), { [name]: PLAN_PASS }))
const fakeVerify = (payload, signature) => signature === `sig:${payload.pipelineDigest}`
const goodEnvelope = (name) => {
  const m = manifestFor(name)
  const base = attestationEnvelope(m)
  return attestationEnvelope(m, { signature: `sig:${base.payload.pipelineDigest}` })
}
const badEnvelope = (name) => attestationEnvelope(manifestFor(name), { signature: 'sig:wrong' })

// total=3 valid=2 invalid=1 allValid=false  (matches the spec examples)
const batch = () => verifyAttestationEnvelopes([goodEnvelope('a'), badEnvelope('b'), goodEnvelope('c')], fakeVerify)
const allGood = () => verifyAttestationEnvelopes([goodEnvelope('a'), goodEnvelope('b')], fakeVerify)

// ── json ─────────────────────────────────────────────────────────────────────────────

test('default format is json (canonical, round-trips)', () => {
  const b = batch()
  const s = summarizeAttestationBatch(b)
  assert.equal(s, canonicalStringify(b))
  assert.deepEqual(JSON.parse(s), JSON.parse(canonicalStringify(b)))
  assert.equal(summarizeAttestationBatch(b, { format: 'json' }), s)   // explicit == default
})

test('json canonical key ordering', () => {
  const s = summarizeAttestationBatch(batch(), { format: 'json' })
  assert.ok(s.indexOf('"allValid"') < s.indexOf('"invalid"'))
  assert.ok(s.indexOf('"invalid"') < s.indexOf('"results"'))
  assert.ok(s.indexOf('"results"') < s.indexOf('"total"'))
  assert.ok(s.indexOf('"total"') < s.indexOf('"valid"'))
})

// ── line ─────────────────────────────────────────────────────────────────────────────

test('line format', () => {
  assert.equal(summarizeAttestationBatch(batch(), { format: 'line' }), 'attestation-batch total=3 valid=2 invalid=1 allValid=false')
  assert.equal(summarizeAttestationBatch(allGood(), { format: 'line' }), 'attestation-batch total=2 valid=2 invalid=0 allValid=true')
})

// ── text ─────────────────────────────────────────────────────────────────────────────

test('text format', () => {
  assert.equal(summarizeAttestationBatch(batch(), { format: 'text' }),
    ['Attestation Batch', '-----------------', 'Total: 3', 'Valid: 2', 'Invalid: 1', 'All Valid: No'].join('\n'))
  assert.ok(summarizeAttestationBatch(allGood(), { format: 'text' }).includes('All Valid: Yes'))
})

// ── markdown ─────────────────────────────────────────────────────────────────────────

test('markdown format', () => {
  assert.equal(summarizeAttestationBatch(batch(), { format: 'markdown' }), [
    '# Attestation Batch',
    '',
    '| Metric | Value |',
    '|--------|------:|',
    '| Total | 3 |',
    '| Valid | 2 |',
    '| Invalid | 1 |',
    '| All Valid | No |',
  ].join('\n'))
  assert.ok(summarizeAttestationBatch(allGood(), { format: 'markdown' }).includes('| All Valid | Yes |'))
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('malformed batch → TypeError', () => {
  assert.throws(() => summarizeAttestationBatch(null), TypeError)
  assert.throws(() => summarizeAttestationBatch({}), TypeError)
  assert.throws(() => summarizeAttestationBatch({ total: 1, valid: 1, invalid: 0, allValid: true }), TypeError)   // no results
  assert.throws(() => summarizeAttestationBatch({ total: 1, valid: 1, invalid: 0, results: [] }), TypeError)      // no allValid
  assert.throws(() => summarizeAttestationBatch({ total: '3', valid: 2, invalid: 1, allValid: false, results: [] }), TypeError)  // wrong types
})

test('unsupported format → TypeError', () => {
  const b = batch()
  assert.throws(() => summarizeAttestationBatch(b, { format: 'yaml' }), TypeError)
  assert.throws(() => summarizeAttestationBatch(b, { format: '' }), TypeError)
  assert.throws(() => summarizeAttestationBatch(b, { format: 7 }), TypeError)
})

// ── determinism / mutation ───────────────────────────────────────────────────────────

test('deterministic — identical batch → identical output (all formats)', () => {
  for (const format of ['json', 'line', 'text', 'markdown']) {
    assert.equal(summarizeAttestationBatch(batch(), { format }), summarizeAttestationBatch(batch(), { format }))
  }
})

test('does not mutate the input batch result', () => {
  const b = batch()
  const before = JSON.stringify(b)
  for (const format of ['json', 'line', 'text', 'markdown']) summarizeAttestationBatch(b, { format })
  assert.equal(JSON.stringify(b), before)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.summarizeAttestationBatch matches summarizeAttestationBatch (all formats + default)', () => {
  const gw = createEvidenceGateway()
  const b = batch()
  for (const format of ['json', 'line', 'text', 'markdown']) {
    assert.equal(gw.summarizeAttestationBatch(b, { format }), summarizeAttestationBatch(b, { format }))
  }
  assert.equal(gw.summarizeAttestationBatch(b), summarizeAttestationBatch(b))
})
