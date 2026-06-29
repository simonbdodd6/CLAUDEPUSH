/**
 * web/brain-coach-dna-activation-approval - Coach DNA Activation Human Approval Stub (M246) tests
 *
 * Verifies the dormant M246 stub: it consumes the M245 certificate, requires approval, records that no human
 * sign-off exists, and — the headline guarantee — NEVER grants activation. A passing certificate alone does
 * not activate; a failed or malformed certificate is blocked and fails safe; output is byte-deterministic and
 * the supplied certificate input is never mutated.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaActivationApproval,
  summarizeCoachDnaActivationApproval,
  serializeCoachDnaActivationApproval,
} from '../web/brain-coach-dna-activation-approval.js'
import { buildCoachDnaGatewayCertificate } from '../web/brain-coach-dna-gateway-certificate.js'

const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

// A gateway that refuses every request — forces the live M245 certificate to FAIL.
const refusingGateway = { request: () => Object.freeze({ ok: false, api: 'coach-dna-release', apiVersion: 1, mode: 'dormant', action: null, result: null, error: { code: 'down' } }) }

// Computed once and shared by the read-only shape assertions (the build is deterministic).
const APPROVAL = buildCoachDnaActivationApproval()

test('the stub has the dormant constants regardless of input', () => {
  assert.equal(APPROVAL.type, 'coach-dna-activation-approval')
  assert.equal(APPROVAL.schemaVersion, 1)
  assert.equal(APPROVAL.milestone, 'M246')
  assert.equal(APPROVAL.mode, 'dormant')
  assert.equal(APPROVAL.approvalRequired, true)
  assert.equal(APPROVAL.humanApproved, false)
  assert.equal(APPROVAL.activationGranted, false)
  assert.deepEqual(APPROVAL.sources.map((s) => s.milestone), ['M245'])
  assert.match(APPROVAL.approvalFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('a PASSED certificate still does not activate without human approval', () => {
  // sanity: the live certificate genuinely passes
  assert.equal(buildCoachDnaGatewayCertificate().certificatePassed, true)
  assert.equal(APPROVAL.certificateValid, true)
  assert.equal(APPROVAL.certificatePassed, true)
  assert.equal(APPROVAL.humanApproved, false)
  assert.equal(APPROVAL.activationGranted, false)
  assert.ok(APPROVAL.blockingReasons.some((r) => /human approval not granted/.test(r)))
  assert.ok(APPROVAL.warnings.some((w) => /pending human approval/.test(w)))
})

test('a FAILED certificate blocks approval and is reported', () => {
  const a = buildCoachDnaActivationApproval({ gateway: refusingGateway })
  assert.equal(a.certificateValid, true)
  assert.equal(a.certificatePassed, false)
  assert.equal(a.activationGranted, false)
  assert.ok(a.blockingReasons.some((r) => /certificate did not pass/.test(r)))
  assert.ok(a.blockingReasons.some((r) => /human approval not granted/.test(r)))
  // a failed certificate yields no "passed but pending" warning
  assert.deepEqual(a.warnings, [])
})

test('certificatePassed is copied forward from the M245 certificate', () => {
  const passing = buildCoachDnaGatewayCertificate()
  assert.equal(buildCoachDnaActivationApproval({ certificate: passing }).certificatePassed, passing.certificatePassed)
  const failing = buildCoachDnaGatewayCertificate({ gateway: refusingGateway })
  assert.equal(buildCoachDnaActivationApproval({ certificate: failing }).certificatePassed, failing.certificatePassed)
})

test('a missing or malformed certificate fails safe — never activates', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, { type: 'wrong' }, { type: 'coach-dna-gateway-certificate' }]) {
    const a = buildCoachDnaActivationApproval({ certificate: bad })
    assert.equal(a.certificateValid, false)
    assert.equal(a.certificatePassed, false)
    assert.equal(a.certificateFingerprint, null)
    assert.equal(a.activationGranted, false)
    assert.ok(a.blockingReasons.some((r) => /missing or malformed/.test(r)))
  }
})

test('activationGranted is always false — across every input', () => {
  assert.equal(buildCoachDnaActivationApproval().activationGranted, false)
  assert.equal(buildCoachDnaActivationApproval({ gateway: refusingGateway }).activationGranted, false)
  assert.equal(buildCoachDnaActivationApproval({ certificate: null }).activationGranted, false)
  // even if a caller forges humanApproved/activationGranted on the certificate, the stub ignores them
  const forged = { ...buildCoachDnaGatewayCertificate(), humanApproved: true, activationGranted: true }
  const a = buildCoachDnaActivationApproval({ certificate: forged })
  assert.equal(a.humanApproved, false)
  assert.equal(a.activationGranted, false)
})

test('repeated output is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaActivationApproval(), serializeCoachDnaActivationApproval())
  assert.equal(buildCoachDnaActivationApproval().approvalFingerprint, APPROVAL.approvalFingerprint)
  // same supplied certificate → same record
  const c = buildCoachDnaGatewayCertificate()
  assert.equal(
    buildCoachDnaActivationApproval({ certificate: c }).approvalFingerprint,
    buildCoachDnaActivationApproval({ certificate: c }).approvalFingerprint,
  )
})

test('the supplied certificate input is never mutated', () => {
  const cert = buildCoachDnaGatewayCertificate()
  const before = JSON.parse(JSON.stringify(cert))
  buildCoachDnaActivationApproval({ certificate: cert })
  assert.deepEqual(JSON.parse(JSON.stringify(cert)), before)
  // a mutable options object is left untouched too
  const opts = { certificate: { type: 'coach-dna-gateway-certificate', certificatePassed: true, certificateFingerprint: 'fnv1a32:00000000' } }
  const optsBefore = JSON.parse(JSON.stringify(opts))
  buildCoachDnaActivationApproval(opts)
  assert.deepEqual(opts, optsBefore)
})

test('the record is deeply frozen (no runtime side effects)', () => {
  assert.ok(Object.isFrozen(APPROVAL))
  assert.ok(Object.isFrozen(APPROVAL.sources))
  assert.ok(Object.isFrozen(APPROVAL.blockingReasons))
  assert.ok(Object.isFrozen(APPROVAL.warnings))
})

test('malformed options are tolerated and never throw', () => {
  for (const bad of [null, undefined, 'x', 7, true]) {
    assert.doesNotThrow(() => buildCoachDnaActivationApproval(bad))
    assert.equal(buildCoachDnaActivationApproval(bad).activationGranted, false)
  }
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaActivationApproval({}, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-activation-approval')
  const line = serializeCoachDnaActivationApproval({}, { format: 'line' })
  assert.match(line, /^coach-dna-activation-approval activationGranted=false humanApproved=false /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaActivationApproval({}, { format: 'xml' }), /unsupported/)
})

test('the record and summary carry no recommendation or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaActivationApproval(), ADVICE_LANG)
  assert.doesNotMatch(summarizeCoachDnaActivationApproval(), ADVICE_LANG)
  assert.match(summarizeCoachDnaActivationApproval(), /activation approval: BLOCKED/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaActivationApproval, 'function')
  assert.equal(typeof summarizeCoachDnaActivationApproval, 'function')
  assert.equal(typeof serializeCoachDnaActivationApproval, 'function')
})
