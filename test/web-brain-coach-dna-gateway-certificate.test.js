/**
 * web/brain-coach-dna-gateway-certificate - Coach DNA Gateway Activation Certificate (M245) tests
 *
 * Verifies the dormant M245 certificate: it folds the M243 contract validator and the M244 scenario harness
 * into one sealed PASS/FAIL verdict, reports blocking reasons when either fails, and — the headline guarantee
 * — NEVER grants activation (activationGranted is false on PASS and on FAIL alike). Injected broken gateways
 * prove the FAIL path and the fail-safe behaviour; identical inputs produce byte-identical certificates.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCoachDnaGatewayCertificate,
  summarizeCoachDnaGatewayCertificate,
  serializeCoachDnaGatewayCertificate,
} from '../web/brain-coach-dna-gateway-certificate.js'
import { validateCoachDnaGateway } from '../web/brain-coach-dna-gateway-validator.js'
import { runCoachDnaGatewayHarness } from '../web/brain-coach-dna-gateway-harness.js'

const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

// Computed once and shared by the read-only shape assertions (the build is deterministic).
const CERT = buildCoachDnaGatewayCertificate()

// A gateway that refuses every request — forces both the validator and the harness to fail.
const refusingGateway = { request: () => Object.freeze({ ok: false, api: 'coach-dna-release', apiVersion: 1, mode: 'dormant', action: null, result: null, error: { code: 'down' } }) }

test('the live certificate passes and folds both the validator and the harness', () => {
  assert.equal(CERT.type, 'coach-dna-gateway-certificate')
  assert.equal(CERT.schemaVersion, 1)
  assert.equal(CERT.milestone, 'M245')
  assert.equal(CERT.verdict, 'PASS')
  assert.equal(CERT.certificatePassed, true)
  assert.equal(CERT.validator.pass, true)
  assert.equal(CERT.harness.pass, true)
  assert.deepEqual(CERT.blockingReasons, [])
  assert.match(CERT.certificateFingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('the certificate folds the SAME numbers the M243 validator and M244 harness report', () => {
  const v = validateCoachDnaGateway()
  const h = runCoachDnaGatewayHarness()
  assert.equal(CERT.validator.totalChecks, v.totalChecks)
  assert.equal(CERT.validator.passedChecks, v.passedChecks)
  assert.equal(CERT.validator.failedChecks, v.failedChecks)
  assert.equal(CERT.harness.scenarioCount, h.scenarioCount)
  assert.equal(CERT.harness.passedScenarios, h.passedScenarios)
  assert.equal(CERT.harness.failedScenarios, h.failedScenarios)
  assert.equal(CERT.harness.fingerprint, h.fingerprint)
})

test('it names M243 and M244 as its sources', () => {
  assert.deepEqual(CERT.sources.map((s) => s.milestone), ['M243', 'M244'])
})

test('a PASS still grants NO activation (dormant)', () => {
  assert.equal(CERT.mode, 'dormant')
  assert.equal(CERT.activationGranted, false)
  // even on a clean PASS, a warning makes the dormancy explicit
  assert.ok(CERT.warnings.some((w) => /grants no activation/.test(w)))
})

test('the certificate is deeply frozen', () => {
  assert.ok(Object.isFrozen(CERT))
  assert.ok(Object.isFrozen(CERT.sources))
  assert.ok(Object.isFrozen(CERT.validator))
  assert.ok(Object.isFrozen(CERT.harness))
  assert.ok(Object.isFrozen(CERT.blockingReasons))
})

test('identical inputs produce a byte-identical certificate', () => {
  const a = serializeCoachDnaGatewayCertificate()
  const b = serializeCoachDnaGatewayCertificate()
  assert.equal(a, b)
  assert.equal(buildCoachDnaGatewayCertificate().certificateFingerprint, CERT.certificateFingerprint)
})

test('a broken gateway fails the certificate and lists blocking reasons — but still grants no activation', () => {
  const c = buildCoachDnaGatewayCertificate({ gateway: refusingGateway })
  assert.equal(c.verdict, 'FAIL')
  assert.equal(c.certificatePassed, false)
  assert.ok(c.blockingReasons.length >= 1)
  assert.ok(c.blockingReasons.some((r) => /contract-validator/.test(r)))
  assert.ok(c.blockingReasons.some((r) => /scenario-harness/.test(r)))
  // the headline guarantee holds on the FAIL path too
  assert.equal(c.activationGranted, false)
})

test('a throwing gateway fails safely without throwing and grants no activation', () => {
  const throwing = { request: () => { throw new Error('boom') } }
  let c
  assert.doesNotThrow(() => { c = buildCoachDnaGatewayCertificate({ gateway: throwing }) })
  assert.equal(c.verdict, 'FAIL')
  assert.equal(c.activationGranted, false)
})

test('activationGranted is false regardless of verdict', () => {
  assert.equal(buildCoachDnaGatewayCertificate().activationGranted, false)
  assert.equal(buildCoachDnaGatewayCertificate({ gateway: refusingGateway }).activationGranted, false)
})

test('malformed options are tolerated and never throw', () => {
  for (const bad of [null, undefined, 'x', 7, true, { gateway: 'nope' }]) {
    assert.doesNotThrow(() => buildCoachDnaGatewayCertificate(bad))
    assert.equal(buildCoachDnaGatewayCertificate(bad).activationGranted, false)
  }
})

test('serialization is deterministic, supports json + line, and rejects bad formats', () => {
  const json = serializeCoachDnaGatewayCertificate({}, { format: 'json' })
  assert.equal(json, JSON.stringify(JSON.parse(json)) && json, json) // parseable
  assert.deepEqual(JSON.parse(json).verdict, 'PASS')
  const line = serializeCoachDnaGatewayCertificate({}, { format: 'line' })
  assert.match(line, /^coach-dna-gateway-certificate verdict=PASS activationGranted=false /)
  assert.match(line, /fp=fnv1a32:[0-9a-f]{8}$/)
  assert.throws(() => serializeCoachDnaGatewayCertificate({}, { format: 'xml' }), /unsupported/)
})

test('the certificate and summary carry no recommendation or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaGatewayCertificate(), ADVICE_LANG)
  assert.doesNotMatch(summarizeCoachDnaGatewayCertificate(), ADVICE_LANG)
})

test('the summary reports verdict and dormant activation status', () => {
  const s = summarizeCoachDnaGatewayCertificate()
  assert.match(s, /activation certificate: PASS/)
  assert.match(s, /Activation granted: false/)
})

test('exports exist', () => {
  assert.equal(typeof buildCoachDnaGatewayCertificate, 'function')
  assert.equal(typeof summarizeCoachDnaGatewayCertificate, 'function')
  assert.equal(typeof serializeCoachDnaGatewayCertificate, 'function')
})
