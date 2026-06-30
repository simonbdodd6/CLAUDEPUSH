/**
 * web/brain-coach-dna-intelligence-snapshot-validator - Coach DNA Intelligence Snapshot Validator (M258) tests
 *
 * Verifies the dormant M258 validator: it checks an M257 snapshot's integrity WITHOUT rebuilding the subsystem —
 * schema, self-fingerprint, M230-M257 provenance, embedded M256 contract verdict, profile-fingerprint
 * consistency, and the no-activation guard. Tampered fields, provenance edits and contract edits are detected;
 * output is deterministic, frozen, and inputs are never mutated.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  validateCoachDnaIntelligenceSnapshot,
  summarizeCoachDnaIntelligenceSnapshotValidation,
  serializeCoachDnaIntelligenceSnapshotValidation,
} from '../web/brain-coach-dna-intelligence-snapshot-validator.js'
import { buildCoachDnaIntelligenceInputs } from '../web/brain-coach-dna-intelligence-inputs.js'
import { buildCoachDnaIntelligenceProfile } from '../web/brain-coach-dna-intelligence-profile.js'
import { buildCoachDnaIntelligenceSnapshot } from '../web/brain-coach-dna-intelligence-snapshot.js'

const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv|predict|forecast)\b/i

// Local mirrors of the repo fingerprint convention, so tests can reseal a tampered snapshot to isolate one error.
function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`
}
function fingerprint(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`
}
const clone = (s) => JSON.parse(JSON.stringify(s))
function reseal(snapshot) {
  const out = clone(snapshot)
  delete out.snapshotFingerprint
  return { ...out, snapshotFingerprint: fingerprint(canonicalStringify(out)) }
}

function freeze(o) {
  if (o && typeof o === 'object') { for (const k of Object.keys(o)) freeze(o[k]); Object.freeze(o) }
  return o
}
const FULL_VIEW = freeze({
  profileVersion: 'coach-dna-v3',
  confidence: { value: 0.72, level: 'HIGH', label: 'High' },
  headline: 'Philosophy focus',
  identity: { strongestCategory: 'philosophy', strongestLabel: 'Philosophy', weakestCategory: 'risk-warning', weakestLabel: 'Risk warnings', diversityScore: 0.5, diversityLabel: 'Balanced' },
  dominantSignals: [{ category: 'philosophy', label: 'Philosophy', occurrences: 6, strength: 0.8, averageConfidence: 0.75, averageWeight: 0.6, supportingCount: 5 }],
  themes: [{ type: 'philosophy', label: 'Philosophy', count: 6, averageConfidence: 0.75, averageWeight: 0.6 }],
  knowledge: { totalMemories: 12, uniqueTypes: 4, averageConfidence: 0.68, averageWeight: 0.57, totalEvidence: 20, totalOntologyLinks: 8 },
  summary: 'A philosophy-led coach.',
  metadata: { explainable: true, deterministic: true, llmGenerated: false },
})
const PROFILE = freeze(JSON.parse(JSON.stringify(buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(FULL_VIEW)))))
const SNAP = freeze(JSON.parse(JSON.stringify(buildCoachDnaIntelligenceSnapshot(PROFILE))))
const RESULT = validateCoachDnaIntelligenceSnapshot(SNAP)

test('a valid snapshot passes with every integrity flag verified', () => {
  assert.equal(RESULT.type, 'coach-dna-intelligence-snapshot-validation')
  assert.equal(RESULT.validates, 'M257')
  assert.equal(RESULT.valid, true)
  assert.equal(RESULT.provenanceVerified, true)
  assert.equal(RESULT.contractVerified, true)
  assert.equal(RESULT.profileFingerprintVerified, true)
  assert.equal(RESULT.snapshotFingerprint, SNAP.snapshotFingerprint)
  assert.deepEqual(RESULT.validationErrors, [])
  assert.match(RESULT.validationFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('activation state is absent for an Intelligence snapshot and reported unchanged', () => {
  assert.equal(RESULT.activationState.present, false)
  assert.equal(RESULT.activationState.activationGranted, null)
})

test('a malformed snapshot is rejected with errors', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, { type: 'wrong' }]) {
    const v = validateCoachDnaIntelligenceSnapshot(bad)
    assert.equal(v.valid, false)
    assert.ok(v.validationErrors.length >= 1)
  }
})

test('a fingerprint mismatch is detected (corrupt stored fingerprint)', () => {
  const tampered = clone(SNAP)
  tampered.snapshotFingerprint = 'fnv1a32:deadbeef'
  const v = validateCoachDnaIntelligenceSnapshot(tampered)
  assert.equal(v.valid, false)
  assert.ok(v.validationErrors.some((e) => /does not match a fresh hash/.test(e)))
})

test('a tampered body without reseal is caught via the fingerprint', () => {
  const tampered = clone(SNAP)
  tampered.usable = false        // body changed, fingerprint left stale
  const v = validateCoachDnaIntelligenceSnapshot(tampered)
  assert.equal(v.valid, false)
  assert.ok(v.validationErrors.some((e) => /does not match a fresh hash/.test(e)))
})

test('a provenance mismatch is detected (isolated via reseal)', () => {
  const tampered = clone(SNAP)
  tampered.provenance.chain = ['M230', 'M252', 'M253']  // truncated chain
  const v = validateCoachDnaIntelligenceSnapshot(reseal(tampered))
  assert.equal(v.valid, false)
  assert.equal(v.provenanceVerified, false)
  assert.ok(v.validationErrors.some((e) => /provenance chain mismatch/.test(e)))
  assert.ok(!v.validationErrors.some((e) => /does not match a fresh hash/.test(e)))
})

test('a contract mismatch is detected (isolated via reseal)', () => {
  const tampered = clone(SNAP)
  tampered.contract.honoured = false
  const v = validateCoachDnaIntelligenceSnapshot(reseal(tampered))
  assert.equal(v.valid, false)
  assert.equal(v.contractVerified, false)
  assert.ok(v.validationErrors.some((e) => /contract is not honoured/.test(e)))
})

test('a contract fingerprint that no longer matches the fingerprints block is detected', () => {
  const tampered = clone(SNAP)
  tampered.contract.fingerprint = 'fnv1a32:00000000'
  const v = validateCoachDnaIntelligenceSnapshot(reseal(tampered))
  assert.equal(v.valid, false)
  assert.equal(v.contractVerified, false)
  assert.ok(v.validationErrors.some((e) => /contract fingerprint does not match/.test(e)))
})

test('an inconsistent profile fingerprint between blocks is detected', () => {
  const tampered = clone(SNAP)
  tampered.fingerprints.profile = 'fnv1a32:11111111'  // no longer equals provenance.profileFingerprint
  const v = validateCoachDnaIntelligenceSnapshot(reseal(tampered))
  assert.equal(v.valid, false)
  assert.equal(v.profileFingerprintVerified, false)
  assert.ok(v.validationErrors.some((e) => /profile fingerprint inconsistent/.test(e)))
})

test('a forged active activationGranted flag is rejected', () => {
  const tampered = clone(SNAP)
  tampered.activationGranted = true
  const v = validateCoachDnaIntelligenceSnapshot(reseal(tampered))
  assert.equal(v.valid, false)
  assert.equal(v.activationState.present, true)
  assert.equal(v.activationState.activationGranted, true)   // reported unchanged
  assert.ok(v.validationErrors.some((e) => /active activationGranted flag/.test(e)))
})

test('a well-formed empty snapshot is valid integrity with a warning', () => {
  const minimal = buildCoachDnaIntelligenceProfile(buildCoachDnaIntelligenceInputs(null))
  const emptySnap = buildCoachDnaIntelligenceSnapshot(minimal)
  const v = validateCoachDnaIntelligenceSnapshot(emptySnap)
  assert.equal(v.valid, true)
  assert.equal(v.provenanceVerified, true)
  assert.equal(v.contractVerified, true)
  assert.ok(v.validationWarnings.some((w) => /empty\/unusable/.test(w)))
})

test('repeated execution is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaIntelligenceSnapshotValidation(SNAP), serializeCoachDnaIntelligenceSnapshotValidation(SNAP))
  assert.equal(validateCoachDnaIntelligenceSnapshot(SNAP).validationFingerprint, RESULT.validationFingerprint)
})

test('the source snapshot is never mutated', () => {
  const before = JSON.parse(JSON.stringify(SNAP))
  validateCoachDnaIntelligenceSnapshot(SNAP)
  assert.deepEqual(JSON.parse(JSON.stringify(SNAP)), before)
})

test('the validation result is deeply frozen', () => {
  assert.ok(Object.isFrozen(RESULT))
  assert.ok(Object.isFrozen(RESULT.validationErrors))
  assert.ok(Object.isFrozen(RESULT.validationWarnings))
  assert.ok(Object.isFrozen(RESULT.activationState))
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaIntelligenceSnapshotValidation(SNAP, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-intelligence-snapshot-validation')
  const line = serializeCoachDnaIntelligenceSnapshotValidation(SNAP, { format: 'line' })
  assert.match(line, /^coach-dna-intelligence-snapshot-validation valid=true provenance=true contract=true /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaIntelligenceSnapshotValidation(SNAP, { format: 'xml' }), /unsupported/)
})

test('the result and summary carry no recommendation or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaIntelligenceSnapshotValidation(SNAP), ADVICE_LANG)
  assert.doesNotMatch(summarizeCoachDnaIntelligenceSnapshotValidation(SNAP), ADVICE_LANG)
  assert.match(summarizeCoachDnaIntelligenceSnapshotValidation(SNAP), /snapshot validation: VALID/)
})

test('exports exist', () => {
  assert.equal(typeof validateCoachDnaIntelligenceSnapshot, 'function')
  assert.equal(typeof summarizeCoachDnaIntelligenceSnapshotValidation, 'function')
  assert.equal(typeof serializeCoachDnaIntelligenceSnapshotValidation, 'function')
})
