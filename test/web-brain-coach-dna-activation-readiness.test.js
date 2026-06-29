/**
 * web/brain-coach-dna-activation-readiness - Coach DNA Activation Readiness Envelope (M247) tests
 *
 * Verifies the dormant M247 envelope: it combines the M245 certificate (technical gate) and the M246 approval
 * stub (human gate) into one frozen readiness view, reports a deterministic readiness state and blocking
 * reasons, and — the headline guarantee — NEVER grants activation. A passing certificate with no approval is
 * "awaiting-human-approval", a failed/malformed certificate is blocked, output is byte-deterministic, and the
 * supplied certificate input is never mutated.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaActivationReadiness,
  summarizeCoachDnaActivationReadiness,
  serializeCoachDnaActivationReadiness,
} from '../web/brain-coach-dna-activation-readiness.js'
import { buildCoachDnaGatewayCertificate } from '../web/brain-coach-dna-gateway-certificate.js'

const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

// A gateway that refuses every request — forces the live M245 certificate to FAIL.
const refusingGateway = { request: () => Object.freeze({ ok: false, api: 'coach-dna-release', apiVersion: 1, mode: 'dormant', action: null, result: null, error: { code: 'down' } }) }

// Computed once and shared by the read-only shape assertions (the build is deterministic).
const ENV = buildCoachDnaActivationReadiness()

test('the envelope has the dormant constants and references M245-M247', () => {
  assert.equal(ENV.type, 'coach-dna-activation-readiness')
  assert.equal(ENV.schemaVersion, 1)
  assert.equal(ENV.milestone, 'M247')
  assert.equal(ENV.mode, 'dormant')
  assert.deepEqual(ENV.sources.map((s) => s.milestone), ['M245', 'M246'])
  assert.equal(ENV.certificate.milestone, 'M245')
  assert.equal(ENV.approval.milestone, 'M246')
  assert.match(ENV.envelopeFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('certificate PASS + approval MISSING => awaiting-human-approval, not ready, not activated', () => {
  // sanity: the live certificate genuinely passes
  assert.equal(buildCoachDnaGatewayCertificate().certificatePassed, true)
  assert.equal(ENV.certificate.valid, true)
  assert.equal(ENV.certificate.passed, true)
  assert.equal(ENV.certificate.verdict, 'PASS')
  assert.equal(ENV.approval.humanApproved, false)
  assert.equal(ENV.readinessState, 'awaiting-human-approval')
  assert.equal(ENV.ready, false)
  assert.equal(ENV.activationGranted, false)
  assert.ok(ENV.blockingReasons.some((r) => /human approval not granted/.test(r)))
  assert.ok(ENV.warnings.some((w) => /pending human approval/.test(w)))
})

test('certificate FAIL => certificate-failed, blocked, not activated, with certificate detail', () => {
  const e = buildCoachDnaActivationReadiness({ gateway: refusingGateway })
  assert.equal(e.certificate.valid, true)
  assert.equal(e.certificate.passed, false)
  assert.equal(e.certificate.verdict, 'FAIL')
  assert.equal(e.readinessState, 'certificate-failed')
  assert.equal(e.ready, false)
  assert.equal(e.activationGranted, false)
  assert.ok(e.blockingReasons.some((r) => /certificate did not pass/.test(r)))
  assert.ok(e.blockingReasons.some((r) => /^certificate: /.test(r))) // forwarded certificate detail
  assert.ok(e.blockingReasons.some((r) => /human approval not granted/.test(r)))
  assert.deepEqual(e.warnings, []) // no "passed but pending" warning on a failed certificate
})

test('malformed / missing certificate => certificate-invalid, blocked, fails safe', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true, { type: 'wrong' }]) {
    const e = buildCoachDnaActivationReadiness({ certificate: bad })
    assert.equal(e.certificate.valid, false)
    assert.equal(e.certificate.passed, false)
    assert.equal(e.certificate.fingerprint, null)
    assert.equal(e.readinessState, 'certificate-invalid')
    assert.equal(e.ready, false)
    assert.equal(e.activationGranted, false)
    assert.ok(e.blockingReasons.some((r) => /missing or malformed/.test(r)))
  }
})

test('a supplied passing certificate is reflected (verdict + fingerprint carried forward)', () => {
  const cert = buildCoachDnaGatewayCertificate()
  const e = buildCoachDnaActivationReadiness({ certificate: cert })
  assert.equal(e.certificate.passed, cert.certificatePassed)
  assert.equal(e.certificate.verdict, cert.verdict)
  assert.equal(e.certificate.fingerprint, cert.certificateFingerprint)
})

test('activationGranted is always false — across every input', () => {
  assert.equal(buildCoachDnaActivationReadiness().activationGranted, false)
  assert.equal(buildCoachDnaActivationReadiness({ gateway: refusingGateway }).activationGranted, false)
  assert.equal(buildCoachDnaActivationReadiness({ certificate: null }).activationGranted, false)
  // even a forged "already approved/activated" certificate cannot flip activation
  const forged = { ...buildCoachDnaGatewayCertificate(), activationGranted: true, humanApproved: true }
  const e = buildCoachDnaActivationReadiness({ certificate: forged })
  assert.equal(e.approval.humanApproved, false)
  assert.equal(e.ready, false)
  assert.equal(e.activationGranted, false)
})

test('repeated output is byte-identical (deterministic)', () => {
  assert.equal(serializeCoachDnaActivationReadiness(), serializeCoachDnaActivationReadiness())
  assert.equal(buildCoachDnaActivationReadiness().envelopeFingerprint, ENV.envelopeFingerprint)
  const c = buildCoachDnaGatewayCertificate()
  assert.equal(
    buildCoachDnaActivationReadiness({ certificate: c }).envelopeFingerprint,
    buildCoachDnaActivationReadiness({ certificate: c }).envelopeFingerprint,
  )
})

test('the supplied certificate input is never mutated', () => {
  const cert = buildCoachDnaGatewayCertificate()
  const before = JSON.parse(JSON.stringify(cert))
  buildCoachDnaActivationReadiness({ certificate: cert })
  assert.deepEqual(JSON.parse(JSON.stringify(cert)), before)
  const opts = { certificate: { type: 'coach-dna-gateway-certificate', certificatePassed: true, verdict: 'PASS', certificateFingerprint: 'fnv1a32:00000000', blockingReasons: [] } }
  const optsBefore = JSON.parse(JSON.stringify(opts))
  buildCoachDnaActivationReadiness(opts)
  assert.deepEqual(opts, optsBefore)
})

test('the envelope is deeply frozen (no runtime side effects)', () => {
  assert.ok(Object.isFrozen(ENV))
  assert.ok(Object.isFrozen(ENV.sources))
  assert.ok(Object.isFrozen(ENV.certificate))
  assert.ok(Object.isFrozen(ENV.approval))
  assert.ok(Object.isFrozen(ENV.blockingReasons))
  assert.ok(Object.isFrozen(ENV.warnings))
})

test('malformed options are tolerated and never throw', () => {
  for (const bad of [null, undefined, 'x', 7, true]) {
    assert.doesNotThrow(() => buildCoachDnaActivationReadiness(bad))
    assert.equal(buildCoachDnaActivationReadiness(bad).activationGranted, false)
  }
})

test('serialization supports json + line and rejects bad formats', () => {
  const json = serializeCoachDnaActivationReadiness({}, { format: 'json' })
  assert.equal(JSON.parse(json).type, 'coach-dna-activation-readiness')
  const line = serializeCoachDnaActivationReadiness({}, { format: 'line' })
  assert.match(line, /^coach-dna-activation-readiness state=awaiting-human-approval ready=false activationGranted=false /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaActivationReadiness({}, { format: 'xml' }), /unsupported/)
})

test('the envelope and summary carry no recommendation or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaActivationReadiness(), ADVICE_LANG)
  assert.doesNotMatch(summarizeCoachDnaActivationReadiness(), ADVICE_LANG)
  assert.match(summarizeCoachDnaActivationReadiness(), /activation readiness: awaiting-human-approval/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaActivationReadiness, 'function')
  assert.equal(typeof summarizeCoachDnaActivationReadiness, 'function')
  assert.equal(typeof serializeCoachDnaActivationReadiness, 'function')
})
