/**
 * web/brain-coach-dna-gateway-harness.js - Coach DNA Release Gateway Test Harness (M244, DORMANT)
 *
 * A deterministic, read-only harness that executes complete end-to-end release scenarios through the M242
 * gateway's public interface and gates them with the M243 contract validator — without activating any
 * production behaviour. It scripts canonical SUCCESS and FAILURE scenarios (a healthy eligible release, a
 * degraded on-hold release, refused activation-style actions, and malformed requests), runs each scenario's
 * steps against `requestCoachDnaRelease`, checks every observed outcome against a declared expectation, and
 * folds the M243 validation result into one frozen, fingerprinted report.
 *
 * It reuses ONLY the M242 gateway and the M243 validator. It never publishes, never activates (every release
 * acknowledgement stays `activated:false` / `dispatched:false`), calls no AI, makes no recommendation, and
 * uses no DOM/network/storage/clock/randomness. It changes no engine, no prior milestone, index.html,
 * runtime, or API. Same input → same report, byte for byte.
 */

import { requestCoachDnaRelease } from './brain-coach-dna-release-gateway.js'     // M242
import { validateCoachDnaGateway } from './brain-coach-dna-gateway-validator.js' // M243

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

function fingerprint(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`
}

// A hand-authored, frozen degraded record used only to drive the on-hold FAILURE scenario through the public
// gateway (passed as a dependency override). It is harness test data — no pipeline builder is imported.
const ON_HOLD_RECORD = deepFreeze({
  type: 'coach-dna-release-record',
  status: 'on-hold',
  eligible: false,
  bundleFingerprint: 'fnv1a32:00000000',
  recordFingerprint: 'fnv1a32:00000000',
  gate: { bundleSealed: false, envelopeStatus: 'blocked-for-review', envelopePass: false, checklistPass: true, validatorPass: true, allClear: false },
})

/**
 * The canonical scenario script (frozen). Each step declares an expectation; the harness records the observed
 * outcome and whether it matched. `useBaseDeps` reuses the seeded healthy pipeline; `overrides` injects a
 * specific dependency state; absence of both drives the gateway with its own defaults.
 */
export const COACH_DNA_GATEWAY_SCENARIOS = deepFreeze([
  {
    name: 'canonical-eligible-release',
    kind: 'success',
    description: 'A healthy pipeline: every read-only view resolves and the release is eligible — yet dormant.',
    useBaseDeps: true,
    steps: [
      { action: 'describe', expect: { ok: true } },
      { action: 'checklist', expect: { ok: true, resultType: 'coach-dna-publishing-readiness-checklist' } },
      { action: 'envelope', expect: { ok: true, resultType: 'coach-dna-release-review-envelope' } },
      { action: 'bundle', expect: { ok: true } },
      { action: 'record', expect: { ok: true, resultType: 'coach-dna-release-record', status: 'eligible-for-publish' } },
      { action: 'status', expect: { ok: true, status: 'eligible-for-publish', eligible: true } },
      { action: 'request-release', expect: { ok: true, accepted: true, activated: false, dispatched: false } },
    ],
  },
  {
    name: 'on-hold-not-accepted',
    kind: 'failure',
    description: 'A degraded pipeline (injected on-hold record): not eligible, not accepted, and nothing activates.',
    overrides: { record: ON_HOLD_RECORD },
    steps: [
      { action: 'status', expect: { ok: true, status: 'on-hold', eligible: false } },
      { action: 'request-release', expect: { ok: true, accepted: false, activated: false, dispatched: false } },
    ],
  },
  {
    name: 'activation-actions-refused',
    kind: 'failure',
    description: 'Activation-style actions are refused — there is no publish path through the gateway.',
    steps: [
      { action: 'publish', expect: { ok: false, errorCode: 'unknown-action' } },
      { action: 'activate', expect: { ok: false, errorCode: 'unknown-action' } },
      { action: 'deploy', expect: { ok: false, errorCode: 'unknown-action' } },
    ],
  },
  {
    name: 'malformed-requests-refused',
    kind: 'failure',
    description: 'Malformed requests are refused with structured errors and never throw.',
    steps: [
      { input: null, expect: { ok: false, errorCode: 'invalid-request' } },
      { input: 'not-a-request', expect: { ok: false, errorCode: 'invalid-request' } },
      { input: {}, expect: { ok: false, errorCode: 'missing-action' } },
    ],
  },
])

// Reduce a gateway response to the comparable outcome fields (null when absent).
function observe(response) {
  if (!isObj(response)) return { ok: false, errorCode: 'no-response', resultType: null, status: null, eligible: null, accepted: null, activated: null, dispatched: null }
  const r = isObj(response.result) ? response.result : {}
  const e = isObj(response.error) ? response.error : {}
  return {
    ok: response.ok === true,
    errorCode: typeof e.code === 'string' ? e.code : null,
    resultType: typeof r.type === 'string' ? r.type : null,
    status: typeof r.status === 'string' ? r.status : null,
    eligible: typeof r.eligible === 'boolean' ? r.eligible : null,
    accepted: typeof r.accepted === 'boolean' ? r.accepted : null,
    activated: typeof r.activated === 'boolean' ? r.activated : null,
    dispatched: typeof r.dispatched === 'boolean' ? r.dispatched : null,
  }
}

function stepLabel(step) {
  if ('input' in step) return `input:${typeof step.input}:${canonicalStringify(step.input)}`
  return step.action
}

function runStep(request, step, overrides) {
  const input = 'input' in step ? step.input : { action: step.action }
  const label = stepLabel(step)
  let response
  try {
    response = overrides ? request(input, overrides) : request(input)
  } catch (e) {
    return { request: label, pass: false, expected: step.expect, observed: null, mismatches: [`threw: ${e && e.message ? e.message : 'error'}`] }
  }
  const observed = observe(response)
  const mismatches = []
  const observedView = {}
  for (const key of Object.keys(step.expect)) {
    observedView[key] = observed[key]
    if (observed[key] !== step.expect[key]) {
      mismatches.push(`${key}=${JSON.stringify(observed[key])} expected ${JSON.stringify(step.expect[key])}`)
    }
  }
  return { request: label, pass: mismatches.length === 0, expected: step.expect, observed: observedView, mismatches }
}

/**
 * Execute the canonical Coach DNA release gateway scenarios end-to-end and return a deterministic report.
 *
 * @param {object} [options]
 * @param {{ request?: Function, serialize?: Function }} [options.gateway]  inject an alternate gateway to
 *   exercise the harness's own failure detection (default: the live M242 gateway + M243 validator).
 * @returns {Readonly<object>}  a frozen, fingerprinted harness report. No activation or publish is performed.
 */
export function runCoachDnaGatewayHarness(options = {}) {
  const opts = isObj(options) ? options : {}
  const gw = isObj(opts.gateway) ? opts.gateway : {}
  const request = typeof gw.request === 'function' ? gw.request : requestCoachDnaRelease

  // Seed the healthy pipeline once through the public gateway, then reuse it as a dependency override so the
  // success scenario does not rebuild the heavy bundle for every step.
  const seed = (action) => {
    try { const r = request({ action }); return isObj(r) && r.ok ? r.result : null } catch { return null }
  }
  const baseDeps = { record: seed('record'), envelope: seed('envelope'), checklist: seed('checklist'), bundle: seed('bundle') }

  const validation = validateCoachDnaGateway(isObj(opts.gateway) ? { gateway: opts.gateway } : {})

  const scenarios = COACH_DNA_GATEWAY_SCENARIOS.map((scenario) => {
    const overrides = scenario.useBaseDeps ? baseDeps : (isObj(scenario.overrides) ? scenario.overrides : null)
    const steps = scenario.steps.map((step) => runStep(request, step, overrides))
    const passedSteps = steps.filter((s) => s.pass).length
    return {
      name: scenario.name,
      kind: scenario.kind,
      description: scenario.description,
      pass: passedSteps === steps.length,
      stepCount: steps.length,
      passedSteps,
      steps,
    }
  })

  const failedScenarios = scenarios.filter((s) => !s.pass)
  const pass = validation.pass === true && failedScenarios.length === 0

  const mismatchSummary = []
  for (const s of scenarios) {
    for (const step of s.steps) {
      if (!step.pass) mismatchSummary.push(`${s.name}/${step.request}: ${step.mismatches.join('; ')}`)
    }
  }
  if (validation.pass !== true) mismatchSummary.push(`contract-validator: ${validation.failedChecks} checks failed`)

  const report = {
    type: 'coach-dna-gateway-harness',
    schemaVersion: 1,
    pass,
    validator: { pass: validation.pass === true, totalChecks: validation.totalChecks, failedChecks: validation.failedChecks },
    scenarioCount: scenarios.length,
    passedScenarios: scenarios.length - failedScenarios.length,
    failedScenarios: failedScenarios.length,
    scenarios,
    mismatchSummary,
  }
  report.fingerprint = fingerprint(canonicalStringify(report))
  return deepFreeze(report)
}

/**
 * Serialize the harness report deterministically.
 * @param {object} [options]
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaGatewayHarness(options = {}, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const report = runCoachDnaGatewayHarness(options)
  if (format === 'json') return canonicalStringify(report)
  if (format === 'line') {
    return `coach-dna-gateway-harness pass=${report.pass} scenarios=${report.passedScenarios}/${report.scenarioCount} `
      + `validator=${report.validator.totalChecks - report.validator.failedChecks}/${report.validator.totalChecks} fp=${report.fingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA gateway harness format '${format}'`)
}
