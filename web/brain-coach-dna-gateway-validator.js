/**
 * web/brain-coach-dna-gateway-validator.js - Coach DNA Release Gateway Contract Validator (M243, DORMANT)
 *
 * A pure, read-only validation layer that verifies every request and every response of the M242 release
 * gateway against its public contract BEFORE any real activation layer exists — the activation-layer analogue
 * of the M236 export validator. For the live gateway it validates:
 *   - contract       : the public API descriptor (name, version, dormant mode, activation flags, action list)
 *   - response       : every successful action returns the canonical response envelope, correctly typed
 *   - versioning     : the api name and apiVersion are stamped on the contract and every response
 *   - frozen         : every response (and its result) is deeply frozen
 *   - routing        : each action routes to the correct read-only view (status/record/bundle/envelope/...)
 *   - dormant        : request-release reports activated:false / dispatched:false and publishes nothing
 *   - no-payload     : the bundle view exposes the manifest but never the raw content payload
 *   - malformed      : non-object / missing-action requests return structured errors and never throw
 *   - unknown-action : unsupported actions are refused — there is no hidden publish path
 *   - serialization  : json round-trips, line format is well-formed, bad formats throw a programmer error
 *   - determinism    : the same request always serializes to the same bytes
 *
 * It produces a deterministic, timestamp-free report (PASS/FAIL, per-check pass + mismatch, totals). It has
 * NO repair logic — it only reports. It never mutates inputs, performs no writes, exposes no internal bundle
 * fields, calls no AI, and introduces no recommendation language. It changes no engine, the M242 gateway, any
 * prior milestone, index.html, runtime, or API. No DOM, network, storage, clock, or randomness — same input →
 * same report.
 */

import {
  requestCoachDnaRelease,
  serializeCoachDnaReleaseResponse,
  describeCoachDnaReleaseApi,
} from './brain-coach-dna-release-gateway.js'                                        // M242
import { buildCoachDnaReleaseEnvelope } from './brain-coach-dna-release-envelope.js'  // M239
import { buildCoachDnaReleaseBundle } from './brain-coach-dna-release-bundle.js'      // M240
import { buildCoachDnaReleaseRecord } from './brain-coach-dna-release-record.js'      // M241
import { buildCoachDnaReleaseChecklist } from './brain-coach-dna-release-checklist.js' // M238

const API_NAME = 'coach-dna-release'
const API_VERSION = 1
const PUBLIC_ACTIONS = Object.freeze(['describe', 'status', 'record', 'bundle', 'envelope', 'checklist', 'request-release'])
const RESPONSE_KEYS = Object.freeze(['action', 'api', 'apiVersion', 'error', 'mode', 'ok', 'result'])
const UNKNOWN_ACTIONS = Object.freeze(['publish', 'deploy', 'activate', 'delete', 'dispatch', ''])
const NON_OBJECT_REQUESTS = Object.freeze([null, undefined, 'x', 7, true])

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`
}

const sameJson = (a, b) => canonicalStringify(a) === canonicalStringify(b)
const sortedKeys = (o) => (isObj(o) ? Object.keys(o).sort() : [])

function isDeeplyFrozen(value) {
  if (value && typeof value === 'object') {
    if (!Object.isFrozen(value)) return false
    for (const k of Object.keys(value)) if (!isDeeplyFrozen(value[k])) return false
  }
  return true
}

// ── shared envelope validation ───────────────────────────────────────────────────────────

function envelopeMismatch(resp, { action, ok }) {
  if (!isObj(resp)) return 'response is not an object'
  if (!sameJson(sortedKeys(resp), RESPONSE_KEYS)) return `response keys ${sortedKeys(resp).join(',')} != canonical envelope`
  if (resp.api !== API_NAME) return `api is '${resp.api}', expected '${API_NAME}'`
  if (resp.apiVersion !== API_VERSION) return `apiVersion is ${resp.apiVersion}, expected ${API_VERSION}`
  if (resp.mode !== 'dormant') return `mode is '${resp.mode}', expected 'dormant'`
  if (resp.ok !== ok) return `ok is ${resp.ok}, expected ${ok}`
  if (resp.action !== action) return `action is ${JSON.stringify(resp.action)}, expected ${JSON.stringify(action)}`
  if (ok) {
    if (resp.error !== null) return 'successful response carries a non-null error'
    if (resp.result === null || resp.result === undefined) return 'successful response has no result'
  } else {
    if (resp.result !== null) return 'error response carries a non-null result'
    if (!isObj(resp.error) || typeof resp.error.code !== 'string') return 'error response missing error.code'
  }
  return null
}

// ── per-action routing checks (result kind → mismatch string or null) ─────────────────────

const ROUTING = Object.freeze({
  describe: (r) => (r.api === API_NAME && Array.isArray(r.actions) ? null : 'describe did not return the contract'),
  status: (r) => (['status', 'eligible', 'bundleFingerprint', 'recordFingerprint', 'gate'].every((k) => k in r) ? null : 'status view missing fields'),
  record: (r) => (r.type === 'coach-dna-release-record' ? null : `record type is '${r.type}'`),
  bundle: (r) => {
    if ('contents' in r) return 'bundle view leaks the raw content payload'
    if (!Array.isArray(r.manifest)) return 'bundle view missing manifest'
    if (typeof r.bundleFingerprint !== 'string') return 'bundle view missing fingerprint'
    return null
  },
  envelope: (r) => (r.type === 'coach-dna-release-review-envelope' ? null : `envelope type is '${r.type}'`),
  checklist: (r) => (r.type === 'coach-dna-publishing-readiness-checklist' ? null : `checklist type is '${r.type}'`),
  'request-release': (r) => {
    if (typeof r.accepted !== 'boolean') return 'acknowledgement missing boolean accepted'
    if (r.activated !== false) return 'acknowledgement is activated — must be dormant'
    if (r.dispatched !== false) return 'acknowledgement is dispatched — must be dormant'
    if (!isObj(r.record) || r.record.type !== 'coach-dna-release-record') return 'acknowledgement missing release record'
    if (typeof r.notice !== 'string' || !r.notice.includes('no content is published')) return 'acknowledgement missing dormant notice'
    return null
  },
})

// ── individual checks against an injected gateway ─────────────────────────────────────────

function checkContract(api) {
  if (!isObj(api)) return 'contract is not an object'
  if (api.api !== API_NAME) return `api is '${api.api}'`
  if (api.apiVersion !== API_VERSION) return `apiVersion is ${api.apiVersion}`
  if (api.mode !== 'dormant') return `mode is '${api.mode}'`
  if (!sameJson(api.activation, { wired: false, publishes: false, requiresHumanSignoff: true })) return 'activation flags are not dormant'
  if (!Array.isArray(api.actions) || !sameJson(api.actions.map((a) => a.action), PUBLIC_ACTIONS)) return 'action list does not match the public contract'
  for (const a of api.actions) if (typeof a.summary !== 'string' || a.summary.length === 0) return `action '${a.action}' missing summary`
  if (!isDeeplyFrozen(api)) return 'contract is not deeply frozen'
  return null
}

function checkBadFormatThrows(serialize) {
  try {
    serialize({ action: 'status' }, {}, { format: 'totally-unsupported' })
    return 'unsupported serialization format did not throw'
  } catch (e) {
    return e instanceof TypeError ? null : `threw ${e && e.name ? e.name : 'non-TypeError'}`
  }
}

function runCheck(fn) {
  try { return fn() } catch (e) { return `threw: ${e && e.message ? e.message : 'error'}` }
}

/**
 * Validate the Coach DNA release gateway against its public contract.
 *
 * @param {object} [options]
 * @param {{ request?: Function, serialize?: Function, api?: object }} [options.gateway]  inject an alternate
 *   gateway to exercise failure detection (default: the live M242 gateway).
 * @returns {Readonly<object>}  a deterministic, timestamp-free validation report.
 */
export function validateCoachDnaGateway(options = {}) {
  const opts = isObj(options) ? options : {}
  const gw = isObj(opts.gateway) ? opts.gateway : {}
  const request = typeof gw.request === 'function' ? gw.request : requestCoachDnaRelease
  const serialize = typeof gw.serialize === 'function' ? gw.serialize : serializeCoachDnaReleaseResponse
  const api = isObj(gw.api) ? gw.api : describeCoachDnaReleaseApi()

  // Build the read-only pipeline ONCE and feed it through the gateway's injection seam, so each probe reuses
  // the same deterministic deps instead of rebuilding the heavy bundle (gallery + exports) every call. The
  // deps mirror the gateway's own defaults exactly, so responses are byte-identical to the un-injected path.
  const envelope = buildCoachDnaReleaseEnvelope()
  const bundle = buildCoachDnaReleaseBundle({ envelope })
  const record = buildCoachDnaReleaseRecord({ bundle, envelope })
  const checklist = buildCoachDnaReleaseChecklist()
  const deps = { envelope, bundle, record, checklist }
  const req = (action) => request({ action }, deps)
  const ser = (action, sopts) => serialize({ action }, deps, sopts)

  const raw = []
  const add = (subject, aspect, fn) => raw.push({ subject, aspect, mismatch: runCheck(fn) })

  // Global contract checks
  add('(api)', 'contract', () => checkContract(api))
  add('(api)', 'serialization', () => checkBadFormatThrows(serialize))

  // Per public action: response shape, frozen, routing, serialization round-trip, determinism
  for (const action of PUBLIC_ACTIONS) {
    add(action, 'response', () => envelopeMismatch(req(action), { action, ok: true }))
    add(action, 'frozen', () => (isDeeplyFrozen(req(action)) ? null : 'response is not deeply frozen'))
    add(action, 'versioning', () => {
      const r = req(action)
      return r.api === API_NAME && r.apiVersion === API_VERSION ? null : 'response not stamped with api/version'
    })
    add(action, 'routing', () => {
      const r = req(action)
      if (!r.ok || !isObj(r.result)) return 'action did not return a successful object result'
      return ROUTING[action](r.result)
    })
    add(action, 'serialization', () => {
      const json = ser(action)
      const parsed = JSON.parse(json)
      if (!sameJson(parsed, req(action))) return 'json serialization does not round-trip to the response'
      const line = ser(action, { format: 'line' })
      return typeof line === 'string' && line.startsWith(`${API_NAME} v${API_VERSION} action=${action} ok=true`)
        ? null : 'line serialization malformed'
    })
    add(action, 'determinism', () => (ser(action) === ser(action) ? null : 'response not deterministic'))
  }

  // End-to-end determinism: a full, un-injected rebuild of the gateway response is byte-stable.
  add('(live)', 'determinism', () => {
    try { return serialize({ action: 'status' }) === serialize({ action: 'status' }) ? null : 'live rebuild not deterministic' }
    catch (e) { return `threw: ${e && e.message ? e.message : 'error'}` }
  })

  // Dormancy: request-release must never activate or dispatch.
  add('request-release', 'dormant', () => {
    const r = req('request-release')
    if (!r.ok) return 'request-release was refused'
    if (r.result.activated !== false || r.result.dispatched !== false) return 'request-release performed activation'
    return null
  })

  // Malformed input: must return structured errors, never throw.
  for (const bad of NON_OBJECT_REQUESTS) {
    add(`(non-object:${String(bad)})`, 'malformed', () => {
      const r = request(bad)
      const m = envelopeMismatch(r, { action: null, ok: false })
      if (m) return m
      return r.error.code === 'invalid-request' ? null : `error.code is '${r.error.code}', expected 'invalid-request'`
    })
  }
  add('(missing-action)', 'malformed', () => {
    const r = request({})
    const m = envelopeMismatch(r, { action: null, ok: false })
    if (m) return m
    if (r.error.code !== 'missing-action') return `error.code is '${r.error.code}', expected 'missing-action'`
    return sameJson(r.error.supportedActions, PUBLIC_ACTIONS) ? null : 'missing-action did not list supported actions'
  })

  // Unknown actions: refused deterministically — proves there is no hidden publish path.
  for (const action of UNKNOWN_ACTIONS) {
    add(`(unknown:${action || 'empty'})`, 'unknown-action', () => {
      const r = request({ action })
      if (r.ok !== false) return `unknown action '${action}' was accepted`
      const expectedCode = action === '' ? 'missing-action' : 'unknown-action'
      if (r.error.code !== expectedCode) return `error.code is '${r.error.code}', expected '${expectedCode}'`
      return sameJson(r.error.supportedActions, PUBLIC_ACTIONS) ? null : 'refusal did not list supported actions'
    })
  }

  const checks = raw.map((c) => ({ subject: c.subject, aspect: c.aspect, pass: c.mismatch === null, mismatch: c.mismatch }))
  const failed = checks.filter((c) => !c.pass)
  const aspects = [...new Set(checks.map((c) => c.aspect))].sort()

  return deepFreeze({
    type: 'coach-dna-gateway-validation',
    schemaVersion: 1,
    pass: failed.length === 0,
    totalChecks: checks.length,
    passedChecks: checks.length - failed.length,
    failedChecks: failed.length,
    aspects,
    checks,
    mismatchSummary: failed.map((c) => `${c.aspect}[${c.subject}]: ${c.mismatch}`),
  })
}

/**
 * Render a compact deterministic summary of the gateway validation for logs or PR notes.
 * @param {object} [options]
 * @returns {string}
 */
export function summarizeCoachDnaGatewayValidation(options = {}) {
  const v = validateCoachDnaGateway(options)
  return [
    `Coach DNA gateway validation: ${v.pass ? 'PASS' : 'FAIL'}`,
    `Checks: ${v.passedChecks}/${v.totalChecks}`,
    `Aspects: ${v.aspects.join(', ')}`,
    ...(v.failedChecks ? [`Failures:`, ...v.mismatchSummary.map((s) => `  - ${s}`)] : []),
  ].join('\n')
}
