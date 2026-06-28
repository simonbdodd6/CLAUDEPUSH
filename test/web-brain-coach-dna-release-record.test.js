/**
 * web/brain-coach-dna-release-record - Coach DNA Release Record (M241) tests
 *
 * Verifies the dormant M241 release record after M240: canonical shape, gate derivation from the live
 * checklist/validator/envelope/bundle, provenance chain (M230-M240) inside safe source paths, eligibility
 * logic (all preconditions required), deterministic self-fingerprinting, attestation text, deterministic
 * serialization, safety boundaries, immutability, and no production wiring.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaReleaseRecord,
  serializeCoachDnaReleaseRecord,
} from '../web/brain-coach-dna-release-record.js'
import { buildCoachDnaReleaseBundle } from '../web/brain-coach-dna-release-bundle.js'
import { buildCoachDnaReleaseEnvelope } from '../web/brain-coach-dna-release-envelope.js'

const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

// A frozen envelope clone with one evidence sub-field overridden (for precondition tests).
function envelopeWith(overrides) {
  const base = buildCoachDnaReleaseEnvelope()
  const evidence = { ...base.evidence, ...(overrides.evidence || {}) }
  return { ...base, ...overrides, evidence }
}

test('canonical record is eligible with the expected shape', () => {
  const r = buildCoachDnaReleaseRecord()
  assert.equal(r.type, 'coach-dna-release-record')
  assert.equal(r.schemaVersion, 1)
  assert.equal(r.status, 'eligible-for-publish')
  assert.equal(r.eligible, true)
  for (const key of ['bundleFingerprint', 'release', 'gate', 'provenance', 'attestation', 'summary', 'recordFingerprint']) {
    assert.ok(key in r, key)
  }
  assert.match(r.bundleFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
  assert.match(r.recordFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('gate is derived from the live envelope and bundle', () => {
  const r = buildCoachDnaReleaseRecord()
  const envelope = buildCoachDnaReleaseEnvelope()
  const bundle = buildCoachDnaReleaseBundle()
  assert.equal(r.gate.bundleSealed, bundle.sealed)
  assert.equal(r.gate.envelopeStatus, envelope.status)
  assert.equal(r.gate.envelopePass, envelope.pass)
  assert.equal(r.gate.checklistPass, envelope.evidence.checklist.pass)
  assert.equal(r.gate.validatorPass, envelope.evidence.validator.pass)
  assert.equal(r.gate.allClear, true)
})

test('release block mirrors the live M240 bundle', () => {
  const r = buildCoachDnaReleaseRecord()
  const bundle = buildCoachDnaReleaseBundle()
  assert.equal(r.bundleFingerprint, bundle.bundleFingerprint)
  assert.equal(r.release.bundleStatus, bundle.status)
  assert.equal(r.release.artifactCount, bundle.artifactCount)
  assert.equal(r.release.totalBytes, bundle.totalBytes)
})

test('provenance chain covers M230-M240 inside dormant source paths', () => {
  const r = buildCoachDnaReleaseRecord()
  assert.equal(r.provenance.length, 12)
  const milestones = r.provenance.map((p) => p.milestone)
  for (const m of ['M230', 'M231', 'M232', 'M233', 'M234', 'M235', 'M236', 'M237', 'M238', 'M239', 'M240']) {
    assert.ok(milestones.includes(m), m)
  }
  for (const p of r.provenance) {
    assert.ok(p.artifact.startsWith('web/') || p.artifact.startsWith('packages/coach-intelligence/'), p.artifact)
    assert.doesNotMatch(p.artifact, /index\.html|api\/|app\/|src\/|CLAUDEPUSH|package-lock/)
    assert.equal(typeof p.role, 'string')
  }
})

test('attestation text reports the bundle, gate, and human sign-off requirement', () => {
  const r = buildCoachDnaReleaseRecord()
  assert.ok(r.attestation.includes(r.bundleFingerprint))
  assert.ok(r.attestation.includes('Readiness checklist: passing'))
  assert.ok(r.attestation.includes('Export validator: passing'))
  assert.ok(r.attestation.includes('human sign-off is still required'))
  assert.ok(r.attestation.includes('No content is published by this record'))
  assert.ok(r.attestation.includes('M230-M240'))
})

test('record fingerprint is deterministic and reacts to bundle identity changes', () => {
  const a = buildCoachDnaReleaseRecord()
  const b = buildCoachDnaReleaseRecord()
  assert.equal(a.recordFingerprint, b.recordFingerprint)
  const bundle = { ...buildCoachDnaReleaseBundle(), bundleFingerprint: 'fnv1a32:deadbeef' }
  const changed = buildCoachDnaReleaseRecord({ bundle })
  assert.notEqual(changed.recordFingerprint, a.recordFingerprint)
  assert.equal(changed.bundleFingerprint, 'fnv1a32:deadbeef')
})

test('an unsealed bundle puts the record on hold', () => {
  const bundle = { ...buildCoachDnaReleaseBundle(), sealed: false, status: 'unsealed' }
  const r = buildCoachDnaReleaseRecord({ bundle })
  assert.equal(r.eligible, false)
  assert.equal(r.status, 'on-hold')
  assert.equal(r.gate.bundleSealed, false)
  assert.match(r.attestation, /on hold/)
  assert.match(r.summary, /status=on-hold/)
})

test('a failing checklist or validator puts the record on hold', () => {
  const failChecklist = envelopeWith({ evidence: { checklist: { ...buildCoachDnaReleaseEnvelope().evidence.checklist, pass: false } } })
  const rc = buildCoachDnaReleaseRecord({ envelope: failChecklist })
  assert.equal(rc.eligible, false)
  assert.equal(rc.gate.checklistPass, false)

  const failValidator = envelopeWith({ evidence: { validator: { ...buildCoachDnaReleaseEnvelope().evidence.validator, pass: false } } })
  const rv = buildCoachDnaReleaseRecord({ envelope: failValidator })
  assert.equal(rv.eligible, false)
  assert.equal(rv.gate.validatorPass, false)
})

test('a blocked envelope puts the record on hold', () => {
  const envelope = envelopeWith({ pass: false, status: 'blocked-for-review' })
  const r = buildCoachDnaReleaseRecord({ envelope })
  assert.equal(r.eligible, false)
  assert.equal(r.gate.envelopePass, false)
  assert.equal(r.gate.envelopeStatus, 'blocked-for-review')
})

test('eligibility requires every precondition to hold', () => {
  // With all four true the record is eligible; flipping any single one breaks eligibility (covered above).
  assert.equal(buildCoachDnaReleaseRecord().eligible, true)
  const bundle = { ...buildCoachDnaReleaseBundle(), sealed: false }
  assert.equal(buildCoachDnaReleaseRecord({ bundle }).eligible, false)
})

test('canonical JSON serialization is deterministic, sorted, and parseable', () => {
  const a = serializeCoachDnaReleaseRecord()
  const b = serializeCoachDnaReleaseRecord()
  assert.equal(a, b)
  const parsed = JSON.parse(a)
  assert.equal(parsed.type, 'coach-dna-release-record')
  assert.equal(parsed.status, 'eligible-for-publish')
  assert.equal(parsed.provenance.length, 12)
  assert.ok(a.indexOf('"attestation"') < a.indexOf('"bundleFingerprint"'), 'top-level keys are sorted canonically')
})

test('attestation and line serializations match the record fields', () => {
  assert.equal(serializeCoachDnaReleaseRecord({}, { format: 'attestation' }), buildCoachDnaReleaseRecord().attestation)
  const line = serializeCoachDnaReleaseRecord({}, { format: 'line' })
  assert.equal(line, buildCoachDnaReleaseRecord().summary)
  assert.match(line, /^status=eligible-for-publish bundle=fnv1a32:[0-9a-f]{8} checklist=pass validator=pass envelope=ready-for-review provenance=12$/)
})

test('unsupported serialization format throws a programmer error', () => {
  assert.throws(() => serializeCoachDnaReleaseRecord({}, { format: 'xml' }), TypeError)
  assert.throws(() => serializeCoachDnaReleaseRecord({}, { format: 'pdf' }), TypeError)
})

test('malformed options safely fall back to the canonical record', () => {
  assert.equal(buildCoachDnaReleaseRecord(null).eligible, true)
  assert.equal(buildCoachDnaReleaseRecord('x').eligible, true)
  assert.equal(serializeCoachDnaReleaseRecord(null), serializeCoachDnaReleaseRecord('x'))
})

test('record exposes no recommendation or advice language', () => {
  const r = buildCoachDnaReleaseRecord()
  assert.doesNotMatch(r.attestation, ADVICE_LANG)
  assert.doesNotMatch(serializeCoachDnaReleaseRecord(), ADVICE_LANG)
})

test('record output is deeply frozen', () => {
  const r = buildCoachDnaReleaseRecord()
  assert.ok(Object.isFrozen(r))
  assert.ok(Object.isFrozen(r.gate))
  assert.ok(Object.isFrozen(r.release))
  assert.ok(Object.isFrozen(r.provenance))
  assert.ok(Object.isFrozen(r.provenance[0]))
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaReleaseRecord, 'function')
  assert.equal(typeof serializeCoachDnaReleaseRecord, 'function')
})
