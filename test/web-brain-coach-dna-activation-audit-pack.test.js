/**
 * web/brain-coach-dna-activation-audit-pack - Coach DNA Activation Audit Pack (M250) tests
 *
 * Verifies the dormant M250 pack: it assembles the M245-M249 chain into one immutable audit artifact, embeds
 * each artifact verbatim with its fingerprint (proving source data is unaltered), folds in the M249 validation
 * summary, aggregates blocking reasons and warnings, references the full M242-M250 provenance, and — the
 * headline guarantee — never activates. Missing artifacts and an invalid validator result mark the pack
 * invalid; output is byte-deterministic and inputs are never mutated.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaActivationAuditPack,
  summarizeCoachDnaActivationAuditPack,
  serializeCoachDnaActivationAuditPack,
} from '../web/brain-coach-dna-activation-audit-pack.js'
import { buildCoachDnaGatewayCertificate } from '../web/brain-coach-dna-gateway-certificate.js'
import { buildCoachDnaActivationReadiness } from '../web/brain-coach-dna-activation-readiness.js'
import { buildCoachDnaActivationLedger } from '../web/brain-coach-dna-activation-ledger.js'
import { validateCoachDnaActivationLedger } from '../web/brain-coach-dna-activation-ledger-validator.js'

const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

// Computed once and shared by the read-only shape assertions (the build is deterministic).
const PACK = buildCoachDnaActivationAuditPack()

test('the pack assembles a complete valid chain and references M242-M250', () => {
  assert.equal(PACK.type, 'coach-dna-activation-audit-pack')
  assert.equal(PACK.schemaVersion, 1)
  assert.equal(PACK.packVersion, 1)
  assert.equal(PACK.milestone, 'M250')
  assert.equal(PACK.mode, 'dormant')
  assert.equal(PACK.complete, true)
  assert.equal(PACK.valid, true)
  assert.deepEqual(PACK.provenance.map((p) => p.milestone), ['M242', 'M243', 'M244', 'M245', 'M246', 'M247', 'M248', 'M249', 'M250'])
  assert.match(PACK.auditFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('every chain stage is embedded verbatim with its true fingerprint (source data unchanged)', () => {
  assert.equal(PACK.artifacts.certificate.type, 'coach-dna-gateway-certificate')
  assert.equal(PACK.artifacts.approval.type, 'coach-dna-activation-approval')
  assert.equal(PACK.artifacts.readiness.type, 'coach-dna-activation-readiness')
  assert.equal(PACK.artifacts.ledger.type, 'coach-dna-activation-ledger')
  assert.equal(PACK.artifacts.validation.type, 'coach-dna-activation-ledger-validation')
  // the recorded fingerprints match the embedded artifacts' own fingerprints
  assert.equal(PACK.fingerprints.certificate, PACK.artifacts.certificate.certificateFingerprint)
  assert.equal(PACK.fingerprints.approval, PACK.artifacts.approval.approvalFingerprint)
  assert.equal(PACK.fingerprints.readiness, PACK.artifacts.readiness.envelopeFingerprint)
  assert.equal(PACK.fingerprints.ledger, PACK.artifacts.ledger.ledgerFingerprint)
  assert.equal(PACK.fingerprints.validation, PACK.artifacts.validation.validationFingerprint)
})

test('embedded fingerprints equal independently built artifacts (nothing was altered)', () => {
  const cert = buildCoachDnaGatewayCertificate()
  const readiness = buildCoachDnaActivationReadiness()
  const ledger = buildCoachDnaActivationLedger()
  const validation = validateCoachDnaActivationLedger()
  assert.equal(PACK.fingerprints.certificate, cert.certificateFingerprint)
  assert.equal(PACK.fingerprints.readiness, readiness.envelopeFingerprint)
  assert.equal(PACK.fingerprints.ledger, ledger.ledgerFingerprint)
  assert.equal(PACK.fingerprints.validation, validation.validationFingerprint)
})

test('the validation summary and aggregated signals are folded in', () => {
  assert.equal(PACK.validationSummary.present, true)
  assert.equal(PACK.validationSummary.valid, true)
  assert.equal(typeof PACK.validationSummary.errorCount, 'number')
  assert.equal(typeof PACK.validationSummary.warningCount, 'number')
  // today the readiness gate is open → a blocking reason about human approval is carried up
  assert.ok(PACK.blockingReasons.some((r) => /human approval not granted/.test(r)))
  assert.ok(Array.isArray(PACK.warnings))
})

test('an invalid validator result marks the pack invalid (but never activates)', () => {
  const badValidation = Object.freeze({ type: 'coach-dna-activation-ledger-validation', valid: false, validationErrors: ['boom'], validationWarnings: [], activationGranted: false, validationFingerprint: 'fnv1a32:00000000' })
  const p = buildCoachDnaActivationAuditPack({ overrides: { validation: badValidation } })
  assert.equal(p.valid, false)
  assert.equal(p.validationSummary.valid, false)
  assert.ok(p.blockingReasons.some((r) => /ledger is invalid/.test(r)))
  assert.equal(p.activationGranted, false)
})

test('a missing artifact marks the pack incomplete and invalid (but never activates)', () => {
  for (const key of ['certificate', 'approval', 'readiness', 'ledger', 'validation']) {
    const p = buildCoachDnaActivationAuditPack({ overrides: { [key]: null } })
    assert.equal(p.complete, false, key)
    assert.equal(p.valid, false, key)
    assert.equal(p.artifacts[key], null, key)
    assert.equal(p.fingerprints[key], null, key)
    assert.ok(p.assemblyErrors.some((e) => new RegExp(key).test(e)), key)
    assert.equal(p.activationGranted, false, key)
  }
})

test('a forged activationGranted on an embedded artifact is rejected (pack still grants nothing)', () => {
  const forgedCert = Object.freeze({ ...buildCoachDnaGatewayCertificate(), activationGranted: true })
  const p = buildCoachDnaActivationAuditPack({ overrides: { certificate: forgedCert } })
  assert.equal(p.valid, false)
  assert.ok(p.assemblyErrors.some((e) => /activationGranted/.test(e)))
  assert.equal(p.activationGranted, false)
})

test('activationGranted is always false — across every input', () => {
  assert.equal(buildCoachDnaActivationAuditPack().activationGranted, false)
  assert.equal(buildCoachDnaActivationAuditPack({ overrides: { ledger: null } }).activationGranted, false)
  assert.equal(buildCoachDnaActivationAuditPack({ gateway: { request: () => { throw new Error('x') } } }).activationGranted, false)
})

test('repeated output is byte-identical and the audit fingerprint is stable', () => {
  assert.equal(serializeCoachDnaActivationAuditPack(), serializeCoachDnaActivationAuditPack())
  assert.equal(buildCoachDnaActivationAuditPack().auditFingerprint, PACK.auditFingerprint)
})

test('the supplied override inputs are never mutated', () => {
  const cert = buildCoachDnaGatewayCertificate()
  const before = JSON.parse(JSON.stringify(cert))
  buildCoachDnaActivationAuditPack({ overrides: { certificate: cert } })
  assert.deepEqual(JSON.parse(JSON.stringify(cert)), before)
})

test('the pack is deeply frozen (no runtime side effects)', () => {
  assert.ok(Object.isFrozen(PACK))
  assert.ok(Object.isFrozen(PACK.provenance))
  assert.ok(Object.isFrozen(PACK.artifacts))
  assert.ok(Object.isFrozen(PACK.fingerprints))
  assert.ok(Object.isFrozen(PACK.blockingReasons))
  assert.ok(Object.isFrozen(PACK.warnings))
})

test('malformed options are tolerated and never throw', () => {
  for (const bad of [null, undefined, 'x', 7, true]) {
    assert.doesNotThrow(() => buildCoachDnaActivationAuditPack(bad))
    assert.equal(buildCoachDnaActivationAuditPack(bad).activationGranted, false)
  }
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaActivationAuditPack({}, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-activation-audit-pack')
  const line = serializeCoachDnaActivationAuditPack({}, { format: 'line' })
  assert.match(line, /^coach-dna-activation-audit-pack valid=true complete=true activationGranted=false /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaActivationAuditPack({}, { format: 'xml' }), /unsupported/)
})

test('the pack and summary carry no recommendation or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaActivationAuditPack(), ADVICE_LANG)
  assert.doesNotMatch(summarizeCoachDnaActivationAuditPack(), ADVICE_LANG)
  assert.match(summarizeCoachDnaActivationAuditPack(), /audit pack: VALID/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaActivationAuditPack, 'function')
  assert.equal(typeof summarizeCoachDnaActivationAuditPack, 'function')
  assert.equal(typeof serializeCoachDnaActivationAuditPack, 'function')
})
