/**
 * web/brain-coach-dna-gateway-validator - Coach DNA Release Gateway Contract Validator (M243) tests
 *
 * Follows the M236 export-validator test style: confirm the live M242 gateway passes every contract check,
 * the report is deterministic and frozen, every public action and edge case is covered, and — by injecting
 * deliberately broken gateways — that the validator detects contract, dormancy, versioning, serialization,
 * unknown-action, and malformed-handling violations without ever throwing.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  validateCoachDnaGateway,
  summarizeCoachDnaGatewayValidation,
} from '../web/brain-coach-dna-gateway-validator.js'
import {
  requestCoachDnaRelease,
  serializeCoachDnaReleaseResponse,
  describeCoachDnaReleaseApi,
} from '../web/brain-coach-dna-release-gateway.js'

const PUBLIC_ACTIONS = ['describe', 'status', 'record', 'bundle', 'envelope', 'checklist', 'request-release']
const ALL_ASPECTS = ['contract', 'determinism', 'dormant', 'frozen', 'malformed', 'response', 'routing', 'serialization', 'unknown-action', 'versioning']

// A gateway that delegates to the live one but lets a single behaviour be perturbed.
function gatewayWith(overrides = {}) {
  return {
    request: overrides.request || requestCoachDnaRelease,
    serialize: overrides.serialize || serializeCoachDnaReleaseResponse,
    api: overrides.api || describeCoachDnaReleaseApi(),
  }
}

function failuresForAspect(report, aspect) {
  return report.checks.filter((c) => !c.pass && c.aspect === aspect)
}

test('the live gateway passes every contract check', () => {
  const v = validateCoachDnaGateway()
  assert.equal(v.type, 'coach-dna-gateway-validation')
  assert.equal(v.schemaVersion, 1)
  assert.equal(v.pass, true)
  assert.equal(v.failedChecks, 0)
  assert.equal(v.passedChecks, v.totalChecks)
  assert.ok(v.totalChecks >= 40, `expected broad coverage, got ${v.totalChecks}`)
  assert.deepEqual(v.mismatchSummary, [])
})

test('the report enumerates the full aspect matrix', () => {
  const v = validateCoachDnaGateway()
  assert.deepEqual(v.aspects, ALL_ASPECTS)
})

test('every check has the canonical shape', () => {
  for (const c of validateCoachDnaGateway().checks) {
    assert.equal(typeof c.subject, 'string')
    assert.equal(typeof c.aspect, 'string')
    assert.equal(typeof c.pass, 'boolean')
    assert.ok(c.mismatch === null || typeof c.mismatch === 'string')
    assert.equal(c.pass, c.mismatch === null)
  }
})

test('every public action is covered by response and routing checks', () => {
  const checks = validateCoachDnaGateway().checks
  for (const action of PUBLIC_ACTIONS) {
    assert.ok(checks.some((c) => c.subject === action && c.aspect === 'response'), `${action} response`)
    assert.ok(checks.some((c) => c.subject === action && c.aspect === 'routing'), `${action} routing`)
    assert.ok(checks.some((c) => c.subject === action && c.aspect === 'serialization'), `${action} serialization`)
  }
})

test('malformed and unknown-action edge cases are covered', () => {
  const checks = validateCoachDnaGateway().checks
  assert.ok(checks.some((c) => c.aspect === 'malformed' && c.subject === '(missing-action)'))
  assert.ok(checks.some((c) => c.aspect === 'malformed' && c.subject.startsWith('(non-object')))
  assert.ok(checks.some((c) => c.aspect === 'unknown-action'))
})

test('the report is deterministic', () => {
  assert.equal(JSON.stringify(validateCoachDnaGateway()), JSON.stringify(validateCoachDnaGateway()))
})

test('the report is deeply frozen', () => {
  const v = validateCoachDnaGateway()
  assert.ok(Object.isFrozen(v))
  assert.ok(Object.isFrozen(v.checks))
  assert.ok(Object.isFrozen(v.checks[0]))
  assert.ok(Object.isFrozen(v.aspects))
})

test('detects a non-dormant gateway (activation must never happen)', () => {
  const request = (req) => {
    const r = requestCoachDnaRelease(req)
    if (req && req.action === 'request-release') {
      return Object.freeze({ ...r, result: Object.freeze({ ...r.result, activated: true, dispatched: true }) })
    }
    return r
  }
  const v = validateCoachDnaGateway({ gateway: gatewayWith({ request }) })
  assert.equal(v.pass, false)
  assert.ok(failuresForAspect(v, 'dormant').length >= 1, 'dormant violation flagged')
  assert.ok(v.mismatchSummary.some((s) => /activation|activated|dispatched/.test(s)))
})

test('detects a tampered contract (wrong action list)', () => {
  const api = { ...describeCoachDnaReleaseApi(), actions: [{ action: 'publish', summary: 'x' }] }
  const v = validateCoachDnaGateway({ gateway: gatewayWith({ api }) })
  assert.equal(v.pass, false)
  assert.ok(failuresForAspect(v, 'contract').length >= 1)
})

test('detects a serializer that does not reject bad formats', () => {
  const serialize = () => '{}' // ignores format, never throws, never round-trips
  const v = validateCoachDnaGateway({ gateway: gatewayWith({ serialize }) })
  assert.equal(v.pass, false)
  assert.ok(failuresForAspect(v, 'serialization').length >= 1)
})

test('detects a gateway that accepts unknown actions (no hidden publish path)', () => {
  const request = (req) => {
    if (isStr(req?.action)) {
      return Object.freeze({ ok: true, api: 'coach-dna-release', apiVersion: 1, mode: 'dormant', action: req.action, result: Object.freeze({ type: 'x' }), error: null })
    }
    return requestCoachDnaRelease(req)
  }
  const v = validateCoachDnaGateway({ gateway: gatewayWith({ request }) })
  assert.equal(v.pass, false)
  assert.ok(failuresForAspect(v, 'unknown-action').length >= 1)
})

test('detects responses missing canonical envelope keys', () => {
  const request = (req) => Object.freeze({ ok: true, action: req?.action ?? null, result: {} })
  const v = validateCoachDnaGateway({ gateway: gatewayWith({ request }) })
  assert.equal(v.pass, false)
  assert.ok(failuresForAspect(v, 'response').length >= 1)
})

test('never throws even when the injected gateway throws', () => {
  const request = () => { throw new Error('boom') }
  let v
  assert.doesNotThrow(() => { v = validateCoachDnaGateway({ gateway: gatewayWith({ request }) }) })
  assert.equal(v.pass, false)
  assert.ok(v.mismatchSummary.some((s) => /threw/.test(s)))
})

test('malformed options safely fall back to validating the live gateway', () => {
  assert.equal(validateCoachDnaGateway(null).pass, true)
  assert.equal(validateCoachDnaGateway('x').pass, true)
  assert.equal(validateCoachDnaGateway({ gateway: 'nope' }).pass, true)
})

test('summarize renders a deterministic PASS line for the live gateway', () => {
  const s = summarizeCoachDnaGatewayValidation()
  assert.match(s, /^Coach DNA gateway validation: PASS/)
  assert.match(s, /Checks: \d+\/\d+/)
  assert.equal(s, summarizeCoachDnaGatewayValidation())
})

test('summarize lists failures when validation fails', () => {
  const request = () => { throw new Error('boom') }
  const s = summarizeCoachDnaGatewayValidation({ gateway: gatewayWith({ request }) })
  assert.match(s, /^Coach DNA gateway validation: FAIL/)
  assert.match(s, /Failures:/)
})

test('exports exist', () => {
  assert.equal(typeof validateCoachDnaGateway, 'function')
  assert.equal(typeof summarizeCoachDnaGatewayValidation, 'function')
})

function isStr(v) { return typeof v === 'string' && v.length > 0 }
