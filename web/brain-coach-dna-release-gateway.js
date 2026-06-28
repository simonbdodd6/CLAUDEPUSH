/**
 * web/brain-coach-dna-release-gateway.js - Coach DNA Release Gateway (M242, DORMANT)
 *
 * The FIRST activation layer for the Coach DNA publishing pipeline: a single stable, versioned, public
 * request interface through which an external future system would request a Coach DNA release — while every
 * existing module stays completely dormant. It is a deterministic router over the read-only pipeline
 * (M238 checklist, M239 envelope, M240 bundle, M241 record); it builds no new artifacts of its own, it only
 * dispatches a structured request to the matching read-only view.
 *
 * Crucially, the `request-release` action does NOT publish. It returns a deterministic dormant acknowledgement
 * — the eligibility verdict plus the sealed M241 record — and explicitly reports `activated: false`,
 * `dispatched: false`. This is exactly the seam where a future system + human sign-off would later wire a real
 * publish; today it performs none. The gateway never throws on caller input: malformed or unknown requests
 * return a structured `ok:false` response so the boundary is stable for external callers.
 *
 * It does not publish, deploy, repair, persist, call AI, use DOM/network/storage/clock/randomness, touch
 * index.html, or wire anything into production. Same request → same response, byte for byte.
 */

import { buildCoachDnaReleaseRecord } from './brain-coach-dna-release-record.js'      // M241
import { buildCoachDnaReleaseBundle } from './brain-coach-dna-release-bundle.js'      // M240
import { buildCoachDnaReleaseEnvelope } from './brain-coach-dna-release-envelope.js'  // M239
import { buildCoachDnaReleaseChecklist } from './brain-coach-dna-release-checklist.js' // M238

const API_NAME = 'coach-dna-release'
const API_VERSION = 1

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

// The stable public contract: every action is read-only and mutates nothing in this dormant layer.
const ACTIONS = Object.freeze([
  { action: 'describe', summary: 'Return this gateway contract (supported actions and version).' },
  { action: 'status', summary: 'Return the compact release eligibility status.' },
  { action: 'record', summary: 'Return the full M241 release record.' },
  { action: 'bundle', summary: 'Return the M240 sealed bundle manifest (fingerprints and sizes, no raw content).' },
  { action: 'envelope', summary: 'Return the M239 release review envelope.' },
  { action: 'checklist', summary: 'Return the M238 publishing readiness checklist.' },
  { action: 'request-release', summary: 'Submit a release request; returns a dormant acknowledgement — publishes nothing.' },
])

const ACTION_NAMES = Object.freeze(ACTIONS.map((a) => a.action))

/** The frozen, versioned public contract for the Coach DNA release interface. */
export const COACH_DNA_RELEASE_API = deepFreeze({
  api: API_NAME,
  apiVersion: API_VERSION,
  mode: 'dormant',
  activation: { wired: false, publishes: false, requiresHumanSignoff: true },
  actions: ACTIONS,
})

/** Return the stable public contract for the Coach DNA release gateway. */
export function describeCoachDnaReleaseApi() {
  return COACH_DNA_RELEASE_API
}

function normalizeDeps(overrides) {
  const o = isObj(overrides) ? overrides : {}
  const envelope = isObj(o.envelope) ? o.envelope : buildCoachDnaReleaseEnvelope()
  const bundle = isObj(o.bundle) ? o.bundle : buildCoachDnaReleaseBundle(isObj(o.envelope) ? { envelope } : {})
  const record = isObj(o.record) ? o.record : buildCoachDnaReleaseRecord({ bundle, envelope })
  const checklist = isObj(o.checklist) ? o.checklist : buildCoachDnaReleaseChecklist()
  return { envelope, bundle, record, checklist }
}

function ok(action, result) {
  return deepFreeze({ ok: true, api: API_NAME, apiVersion: API_VERSION, mode: 'dormant', action, result, error: null })
}

function fail(action, code, message, extra = {}) {
  return deepFreeze({ ok: false, api: API_NAME, apiVersion: API_VERSION, mode: 'dormant', action, result: null, error: { code, message, ...extra } })
}

function statusView(record) {
  return {
    status: record.status,
    eligible: record.eligible === true,
    bundleFingerprint: record.bundleFingerprint,
    recordFingerprint: record.recordFingerprint,
    gate: record.gate,
  }
}

function bundleManifestView(bundle) {
  return {
    status: bundle.status,
    sealed: bundle.sealed === true,
    bundleFingerprint: bundle.bundleFingerprint,
    artifactCount: bundle.artifactCount,
    totalBytes: bundle.totalBytes,
    gate: bundle.gate,
    manifest: bundle.manifest,
  }
}

function releaseAcknowledgement(record) {
  return {
    // The dormant acknowledgement: it reports the deterministic eligibility verdict and the sealed record,
    // but no publish is performed and no production system is invoked.
    accepted: record.eligible === true,
    activated: false,
    dispatched: false,
    bundleFingerprint: record.bundleFingerprint,
    recordFingerprint: record.recordFingerprint,
    record,
    notice: 'Coach DNA release is dormant: this gateway records eligibility and returns the sealed release '
      + 'record; no content is published and no production system is invoked. A future external system plus a '
      + 'human sign-off are required before any publish.',
  }
}

/**
 * The single public entry point: handle a structured Coach DNA release request.
 *
 * The gateway is a stable boundary — it never throws on caller input. A malformed request, a missing action,
 * or an unknown action returns a deterministic `ok:false` response carrying an error code and the supported
 * action list. Every successful response is read-only; nothing is published or mutated.
 *
 * @param {{ action?: string }} request the request object (must carry a known `action`).
 * @param {object} [overrides] optional injected record/bundle/envelope/checklist for deterministic tests.
 * @returns {Readonly<object>} a frozen response envelope.
 */
export function requestCoachDnaRelease(request, overrides = {}) {
  if (!isObj(request)) return fail(null, 'invalid-request', 'request must be an object')
  const action = request.action
  if (typeof action !== 'string' || action.length === 0) {
    return fail(null, 'missing-action', 'request.action must be a non-empty string', { supportedActions: [...ACTION_NAMES] })
  }
  if (!ACTION_NAMES.includes(action)) {
    return fail(action, 'unknown-action', `unsupported action '${action}'`, { supportedActions: [...ACTION_NAMES] })
  }

  const { envelope, bundle, record, checklist } = normalizeDeps(overrides)

  switch (action) {
    case 'describe': return ok(action, COACH_DNA_RELEASE_API)
    case 'status': return ok(action, statusView(record))
    case 'record': return ok(action, record)
    case 'bundle': return ok(action, bundleManifestView(bundle))
    case 'envelope': return ok(action, envelope)
    case 'checklist': return ok(action, checklist)
    case 'request-release': return ok(action, releaseAcknowledgement(record))
    /* c8 ignore next */
    default: return fail(action, 'unknown-action', `unsupported action '${action}'`, { supportedActions: [...ACTION_NAMES] })
  }
}

/**
 * Serialize a gateway response deterministically.
 * @param {{ action?: string }} request
 * @param {object} [overrides]
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaReleaseResponse(request, overrides = {}, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const response = requestCoachDnaRelease(request, overrides)
  if (format === 'json') return canonicalStringify(response)
  if (format === 'line') {
    const a = response.action || 'none'
    let tail
    if (!response.ok) tail = response.error?.code || 'error'
    else if (response.result?.status) tail = response.result.status
    else if (typeof response.result?.accepted === 'boolean') tail = `accepted=${response.result.accepted}`
    else tail = response.result?.api || 'ok'
    return `${API_NAME} v${API_VERSION} action=${a} ok=${response.ok} ${tail}`
  }
  throw new TypeError(`unsupported Coach DNA release response format '${format}'`)
}
