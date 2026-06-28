/**
 * web/brain-coach-dna-release-gateway - Coach DNA Release Gateway (M242) tests
 *
 * Verifies the dormant M242 activation layer: the stable public contract, deterministic routing to every
 * read-only pipeline view, the dormant `request-release` acknowledgement (publishes nothing), robust
 * structured error handling (never throws on caller input), deterministic serialization, immutability,
 * and the guarantee that no production wiring or mutation occurs.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  requestCoachDnaRelease,
  describeCoachDnaReleaseApi,
  serializeCoachDnaReleaseResponse,
  COACH_DNA_RELEASE_API,
} from '../web/brain-coach-dna-release-gateway.js'
import { buildCoachDnaReleaseRecord } from '../web/brain-coach-dna-release-record.js'
import { buildCoachDnaReleaseBundle } from '../web/brain-coach-dna-release-bundle.js'
import { buildCoachDnaReleaseEnvelope } from '../web/brain-coach-dna-release-envelope.js'
import { buildCoachDnaReleaseChecklist } from '../web/brain-coach-dna-release-checklist.js'

const ACTIONS = ['describe', 'status', 'record', 'bundle', 'envelope', 'checklist', 'request-release']
const ADVICE_LANG = /\b(you should|recommend|must start|must bench|drop him|pick him|best xv)\b/i

test('the public contract is stable, versioned, and dormant', () => {
  const api = describeCoachDnaReleaseApi()
  assert.equal(api, COACH_DNA_RELEASE_API)
  assert.equal(api.api, 'coach-dna-release')
  assert.equal(api.apiVersion, 1)
  assert.equal(api.mode, 'dormant')
  assert.deepEqual(api.activation, { wired: false, publishes: false, requiresHumanSignoff: true })
  assert.deepEqual(api.actions.map((a) => a.action), ACTIONS)
  for (const a of api.actions) assert.equal(typeof a.summary, 'string')
})

test('every response carries the canonical envelope shape', () => {
  for (const action of ACTIONS) {
    const r = requestCoachDnaRelease({ action })
    assert.equal(r.ok, true, action)
    assert.equal(r.api, 'coach-dna-release', action)
    assert.equal(r.apiVersion, 1, action)
    assert.equal(r.mode, 'dormant', action)
    assert.equal(r.action, action, action)
    assert.equal(r.error, null, action)
    assert.ok(r.result !== null, action)
  }
})

test('describe returns the frozen contract', () => {
  const r = requestCoachDnaRelease({ action: 'describe' })
  assert.equal(r.result, COACH_DNA_RELEASE_API)
})

test('status mirrors the live M241 record verdict', () => {
  const r = requestCoachDnaRelease({ action: 'status' })
  const record = buildCoachDnaReleaseRecord()
  assert.equal(r.result.status, record.status)
  assert.equal(r.result.eligible, record.eligible)
  assert.equal(r.result.bundleFingerprint, record.bundleFingerprint)
  assert.equal(r.result.recordFingerprint, record.recordFingerprint)
  assert.deepEqual(r.result.gate, record.gate)
})

test('record / envelope / checklist route to the live builders', () => {
  assert.deepEqual(requestCoachDnaRelease({ action: 'record' }).result, buildCoachDnaReleaseRecord())
  assert.deepEqual(requestCoachDnaRelease({ action: 'envelope' }).result, buildCoachDnaReleaseEnvelope())
  assert.deepEqual(requestCoachDnaRelease({ action: 'checklist' }).result, buildCoachDnaReleaseChecklist())
})

test('bundle view exposes the manifest but never the raw content payload', () => {
  const r = requestCoachDnaRelease({ action: 'bundle' })
  const bundle = buildCoachDnaReleaseBundle()
  assert.equal(r.result.bundleFingerprint, bundle.bundleFingerprint)
  assert.equal(r.result.artifactCount, bundle.artifactCount)
  assert.deepEqual(r.result.manifest, bundle.manifest)
  assert.ok(!('contents' in r.result), 'raw content excluded from the gateway view')
})

test('request-release returns a dormant acknowledgement and publishes nothing', () => {
  const r = requestCoachDnaRelease({ action: 'request-release' })
  assert.equal(r.ok, true)
  assert.equal(r.result.accepted, true) // canonical pipeline is eligible
  assert.equal(r.result.activated, false)
  assert.equal(r.result.dispatched, false)
  assert.deepEqual(r.result.record, buildCoachDnaReleaseRecord())
  assert.match(r.result.notice, /no content is published/)
  assert.match(r.result.notice, /human sign-off/)
})

test('request-release acceptance follows eligibility (unsealed bundle is not accepted)', () => {
  const bundle = { ...buildCoachDnaReleaseBundle(), sealed: false, status: 'unsealed' }
  const r = requestCoachDnaRelease({ action: 'request-release' }, { bundle })
  assert.equal(r.result.accepted, false)
  assert.equal(r.result.activated, false)
  assert.equal(r.result.dispatched, false)
  assert.equal(r.result.record.status, 'on-hold')
})

test('a non-object request returns a structured error, never throws', () => {
  for (const bad of [null, undefined, 'x', 7, [], true]) {
    const r = requestCoachDnaRelease(bad)
    assert.equal(r.ok, false)
    assert.equal(r.error.code, 'invalid-request')
    assert.equal(r.action, null)
  }
})

test('a missing action returns a structured error with the supported list', () => {
  const r = requestCoachDnaRelease({})
  assert.equal(r.ok, false)
  assert.equal(r.error.code, 'missing-action')
  assert.deepEqual(r.error.supportedActions, ACTIONS)
})

test('an unknown action is refused deterministically (no publish path)', () => {
  for (const action of ['publish', 'deploy', 'activate', 'delete']) {
    const r = requestCoachDnaRelease({ action })
    assert.equal(r.ok, false)
    assert.equal(r.error.code, 'unknown-action')
    assert.equal(r.action, action)
    assert.deepEqual(r.error.supportedActions, ACTIONS)
  }
})

test('responses are deterministic across calls', () => {
  for (const action of ACTIONS) {
    const a = serializeCoachDnaReleaseResponse({ action })
    const b = serializeCoachDnaReleaseResponse({ action })
    assert.equal(a, b, action)
  }
})

test('canonical JSON serialization is sorted and parseable', () => {
  const json = serializeCoachDnaReleaseResponse({ action: 'status' })
  const parsed = JSON.parse(json)
  assert.equal(parsed.api, 'coach-dna-release')
  assert.equal(parsed.ok, true)
  assert.ok(json.indexOf('"action"') < json.indexOf('"api"'), 'top-level keys sorted canonically')
})

test('line serialization is compact and reflects ok/action/outcome', () => {
  assert.equal(serializeCoachDnaReleaseResponse({ action: 'status' }, {}, { format: 'line' }),
    'coach-dna-release v1 action=status ok=true eligible-for-publish')
  assert.equal(serializeCoachDnaReleaseResponse({ action: 'request-release' }, {}, { format: 'line' }),
    'coach-dna-release v1 action=request-release ok=true accepted=true')
  assert.equal(serializeCoachDnaReleaseResponse({ action: 'nope' }, {}, { format: 'line' }),
    'coach-dna-release v1 action=nope ok=false unknown-action')
})

test('unsupported serialization format throws a programmer error', () => {
  assert.throws(() => serializeCoachDnaReleaseResponse({ action: 'status' }, {}, { format: 'xml' }), TypeError)
})

test('the request-release acknowledgement carries no advice language', () => {
  const r = requestCoachDnaRelease({ action: 'request-release' })
  assert.doesNotMatch(r.result.notice, ADVICE_LANG)
  assert.doesNotMatch(serializeCoachDnaReleaseResponse({ action: 'request-release' }), ADVICE_LANG)
})

test('every response is deeply frozen', () => {
  const r = requestCoachDnaRelease({ action: 'request-release' })
  assert.ok(Object.isFrozen(r))
  assert.ok(Object.isFrozen(r.result))
  assert.ok(Object.isFrozen(r.result.record))
  const err = requestCoachDnaRelease({ action: 'nope' })
  assert.ok(Object.isFrozen(err))
  assert.ok(Object.isFrozen(err.error))
})

test('exports exist', () => {
  assert.equal(typeof requestCoachDnaRelease, 'function')
  assert.equal(typeof describeCoachDnaReleaseApi, 'function')
  assert.equal(typeof serializeCoachDnaReleaseResponse, 'function')
  assert.ok(Object.isFrozen(COACH_DNA_RELEASE_API))
})
