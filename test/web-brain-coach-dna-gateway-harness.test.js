/**
 * web/brain-coach-dna-gateway-harness - Coach DNA Release Gateway Test Harness (M244) tests
 *
 * Verifies the dormant M244 harness: it drives canonical success and failure scenarios end-to-end through
 * the live M242 gateway, folds in the M243 contract validator, never activates or publishes, and — the
 * headline guarantee — produces byte-identical reports for identical inputs. Injected broken gateways prove
 * the harness actually detects activation, refusal, and throwing failures.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  runCoachDnaGatewayHarness,
  serializeCoachDnaGatewayHarness,
  COACH_DNA_GATEWAY_SCENARIOS,
} from '../web/brain-coach-dna-gateway-harness.js'
import { validateCoachDnaGateway } from '../web/brain-coach-dna-gateway-validator.js'

const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

// Computed once and shared by the read-only shape assertions (the harness run is deterministic).
const REPORT = runCoachDnaGatewayHarness()

test('the live harness passes every scenario and the contract validator', () => {
  assert.equal(REPORT.type, 'coach-dna-gateway-harness')
  assert.equal(REPORT.schemaVersion, 1)
  assert.equal(REPORT.pass, true)
  assert.equal(REPORT.failedScenarios, 0)
  assert.equal(REPORT.passedScenarios, REPORT.scenarioCount)
  assert.equal(REPORT.validator.pass, true)
  assert.deepEqual(REPORT.mismatchSummary, [])
  assert.match(REPORT.fingerprint, /^fnv1a32:[0-9a-f]{8}$/)
})

test('all four canonical scenarios run with the right kinds and full step coverage', () => {
  assert.equal(REPORT.scenarioCount, 4)
  const byName = Object.fromEntries(REPORT.scenarios.map((s) => [s.name, s]))
  assert.equal(byName['canonical-eligible-release'].kind, 'success')
  assert.equal(byName['on-hold-not-accepted'].kind, 'failure')
  assert.equal(byName['activation-actions-refused'].kind, 'failure')
  assert.equal(byName['malformed-requests-refused'].kind, 'failure')
  for (const s of REPORT.scenarios) {
    assert.equal(s.pass, true, s.name)
    assert.equal(s.passedSteps, s.stepCount, s.name)
    assert.ok(s.stepCount >= 2, s.name)
  }
})

test('each step records request, expectation, observed view, and verdict', () => {
  for (const s of REPORT.scenarios) {
    for (const step of s.steps) {
      assert.equal(typeof step.request, 'string')
      assert.ok('expected' in step && 'observed' in step)
      assert.equal(typeof step.pass, 'boolean')
      assert.ok(Array.isArray(step.mismatches))
      assert.equal(step.pass, step.mismatches.length === 0)
      // the observed view mirrors exactly the asserted keys
      assert.deepEqual(Object.keys(step.observed).sort(), Object.keys(step.expected).sort())
    }
  }
})

test('the harness never activates or dispatches a release', () => {
  const releaseSteps = REPORT.scenarios.flatMap((s) => s.steps.filter((st) => st.request === 'request-release'))
  assert.ok(releaseSteps.length >= 2)
  for (const step of releaseSteps) {
    assert.equal(step.observed.activated, false)
    assert.equal(step.observed.dispatched, false)
  }
  const success = REPORT.scenarios.find((s) => s.name === 'canonical-eligible-release')
  const hold = REPORT.scenarios.find((s) => s.name === 'on-hold-not-accepted')
  assert.equal(success.steps.find((st) => st.request === 'request-release').observed.accepted, true)
  assert.equal(hold.steps.find((st) => st.request === 'request-release').observed.accepted, false)
})

test('activation-style and malformed actions are refused end-to-end', () => {
  const refused = REPORT.scenarios.find((s) => s.name === 'activation-actions-refused')
  for (const step of refused.steps) assert.equal(step.observed.errorCode, 'unknown-action')
  const malformed = REPORT.scenarios.find((s) => s.name === 'malformed-requests-refused')
  assert.deepEqual(malformed.steps.map((s) => s.observed.errorCode), ['invalid-request', 'invalid-request', 'missing-action'])
})

test('the folded-in validator summary matches the live M243 validator', () => {
  const v = validateCoachDnaGateway()
  assert.equal(REPORT.validator.totalChecks, v.totalChecks)
  assert.equal(REPORT.validator.failedChecks, v.failedChecks)
  assert.equal(REPORT.validator.pass, v.pass)
})

test('identical inputs always produce identical outputs (headline determinism)', () => {
  const a = serializeCoachDnaGatewayHarness()
  const b = serializeCoachDnaGatewayHarness()
  assert.equal(a, b)
  // a fresh run reproduces the shared report's fingerprint and full serialization, byte for byte
  assert.equal(runCoachDnaGatewayHarness().fingerprint, REPORT.fingerprint)
  assert.equal(JSON.parse(a).fingerprint, REPORT.fingerprint)
})

test('canonical JSON serialization is sorted and parseable', () => {
  const json = serializeCoachDnaGatewayHarness()
  const parsed = JSON.parse(json)
  assert.equal(parsed.type, 'coach-dna-gateway-harness')
  assert.equal(parsed.pass, true)
  assert.equal(parsed.scenarios.length, 4)
  assert.ok(json.indexOf('"fingerprint"') < json.indexOf('"pass"'), 'top-level keys sorted canonically')
})

test('line serialization is compact and reflects the verdict', () => {
  const line = serializeCoachDnaGatewayHarness({}, { format: 'line' })
  assert.match(line, /^coach-dna-gateway-harness pass=true scenarios=4\/4 validator=\d+\/\d+ fp=fnv1a32:[0-9a-f]{8}$/)
  assert.ok(line.includes(REPORT.fingerprint))
})

test('unsupported serialization format throws a programmer error', () => {
  assert.throws(() => serializeCoachDnaGatewayHarness({}, { format: 'xml' }), TypeError)
})

test('malformed options safely fall back to the live harness', () => {
  assert.equal(runCoachDnaGatewayHarness(null).pass, true)
  assert.equal(runCoachDnaGatewayHarness('x').pass, true)
  assert.equal(runCoachDnaGatewayHarness({ gateway: 'nope' }).pass, true)
})

test('the scenario script and the report are deeply frozen', () => {
  assert.ok(Object.isFrozen(COACH_DNA_GATEWAY_SCENARIOS))
  assert.ok(Object.isFrozen(COACH_DNA_GATEWAY_SCENARIOS[0]))
  assert.ok(Object.isFrozen(REPORT))
  assert.ok(Object.isFrozen(REPORT.scenarios))
  assert.ok(Object.isFrozen(REPORT.scenarios[0].steps[0]))
})

test('detects a gateway that activates a release', () => {
  const request = (req) => Object.freeze({
    ok: true, api: 'coach-dna-release', apiVersion: 1, mode: 'dormant', action: req?.action ?? null,
    result: Object.freeze({ type: 'coach-dna-release-record', status: 'eligible-for-publish', eligible: true, accepted: true, activated: true, dispatched: true }), error: null,
  })
  const r = runCoachDnaGatewayHarness({ gateway: { request } })
  assert.equal(r.pass, false)
  assert.ok(r.mismatchSummary.some((m) => /activated=true/.test(m)))
})

test('detects a gateway that refuses every request', () => {
  const request = () => Object.freeze({ ok: false, api: 'coach-dna-release', apiVersion: 1, mode: 'dormant', action: null, result: null, error: { code: 'down' } })
  const r = runCoachDnaGatewayHarness({ gateway: { request } })
  assert.equal(r.pass, false)
  assert.ok(r.failedScenarios >= 1)
})

test('never throws even when the injected gateway throws', () => {
  const request = () => { throw new Error('boom') }
  let r
  assert.doesNotThrow(() => { r = runCoachDnaGatewayHarness({ gateway: { request } }) })
  assert.equal(r.pass, false)
  assert.ok(r.mismatchSummary.some((m) => /threw/.test(m)))
})

test('the report carries no recommendation or advice language', () => {
  assert.doesNotMatch(serializeCoachDnaGatewayHarness(), ADVICE_LANG)
})

test('exports exist', () => {
  assert.equal(typeof runCoachDnaGatewayHarness, 'function')
  assert.equal(typeof serializeCoachDnaGatewayHarness, 'function')
  assert.ok(Array.isArray(COACH_DNA_GATEWAY_SCENARIOS))
})
