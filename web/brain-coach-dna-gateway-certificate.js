/**
 * web/brain-coach-dna-gateway-certificate.js - Coach DNA Gateway Activation Certificate (M245, DORMANT)
 *
 * The single authoritative go / no-go verdict for the Coach DNA activation seam. Where M243 validates the
 * gateway's public contract and M244 exercises it with end-to-end scenarios, this module FOLDS both into one
 * sealed, fingerprinted certificate: it runs the M243 contract validator and the M244 scenario harness, and
 * reports a deterministic PASS/FAIL verdict with per-source summaries and explicit blocking reasons. It is the
 * activation-side analogue of the M241 release record — the place a future system + human sign-off would later
 * read before wiring a real publish.
 *
 * Crucially, the certificate certifies READINESS only. It stamps `mode: 'dormant'` and `activationGranted: false`
 * unconditionally — even on a clean PASS it grants no activation. It builds no new pipeline artifacts, reuses
 * ONLY the M243 validator and M244 harness, publishes nothing, makes no recommendation, calls no AI, and uses
 * no DOM/network/storage/clock/randomness. It mutates no input and touches no engine, prior milestone,
 * index.html, runtime, or API. Same input → same certificate, byte for byte.
 */

import { validateCoachDnaGateway } from './brain-coach-dna-gateway-validator.js' // M243
import { runCoachDnaGatewayHarness } from './brain-coach-dna-gateway-harness.js' // M244

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

// FNV-1a 32-bit — the same fingerprint used across M239/M240/M241/M244, for cross-stage consistency.
function fingerprint(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`
}

const MILESTONE = 'M245'
// The two activation-seam checks this certificate folds together.
const SOURCES = Object.freeze([
  { milestone: 'M243', artifact: 'web/brain-coach-dna-gateway-validator.js', role: 'gateway contract validator' },
  { milestone: 'M244', artifact: 'web/brain-coach-dna-gateway-harness.js', role: 'gateway scenario harness' },
])

/**
 * Build the sealed, deterministic Coach DNA gateway activation certificate.
 *
 * @param {object} [options]
 * @param {object} [options.gateway] optional gateway override ({ request }) threaded to M243 + M244 for tests
 * @returns {object} frozen certificate; verdict is PASS only when both the validator and harness pass, and
 *                   `activationGranted` is always false (dormant — readiness is certified, never granted).
 */
export function buildCoachDnaGatewayCertificate(options = {}) {
  const opts = isObj(options) ? options : {}
  const downstream = isObj(opts.gateway) ? { gateway: opts.gateway } : {}

  const validation = validateCoachDnaGateway(downstream)
  const harness = runCoachDnaGatewayHarness(downstream)

  const validatorPassed = validation.pass === true
  const harnessPassed = harness.pass === true
  const certificatePassed = validatorPassed && harnessPassed

  // Why activation is still blocked. Empty on a clean PASS — but PASS never implies activation (see below).
  const blockingReasons = []
  if (!validatorPassed) {
    blockingReasons.push(`contract-validator: ${validation.failedChecks}/${validation.totalChecks} checks failed`)
  }
  if (!harnessPassed) {
    blockingReasons.push(`scenario-harness: ${harness.failedScenarios}/${harness.scenarioCount} scenarios failed`)
  }

  // Surfaced even when the certificate passes: a contract-valid, fully-exercised seam is still dormant until a
  // future system + human sign-off explicitly grants activation. This is a warning, never a recommendation.
  const warnings = ['activation remains dormant: this certificate grants no activation (activationGranted is always false)']

  const draft = {
    type: 'coach-dna-gateway-certificate',
    schemaVersion: 1,
    milestone: MILESTONE,
    sources: SOURCES,
    mode: 'dormant',
    activationGranted: false,
    verdict: certificatePassed ? 'PASS' : 'FAIL',
    certificatePassed,
    validator: {
      milestone: 'M243',
      pass: validatorPassed,
      totalChecks: validation.totalChecks,
      passedChecks: validation.passedChecks,
      failedChecks: validation.failedChecks,
    },
    harness: {
      milestone: 'M244',
      pass: harnessPassed,
      scenarioCount: harness.scenarioCount,
      passedScenarios: harness.passedScenarios,
      failedScenarios: harness.failedScenarios,
      fingerprint: harness.fingerprint,
    },
    blockingReasons,
    warnings,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this certificate.
  draft.certificateFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the certificate for logs or PR notes.
 * @param {object} [options]
 * @returns {string}
 */
export function summarizeCoachDnaGatewayCertificate(options = {}) {
  const c = buildCoachDnaGatewayCertificate(options)
  return [
    `Coach DNA gateway activation certificate: ${c.verdict}`,
    `Activation granted: ${c.activationGranted}`,
    `Validator: ${c.validator.passedChecks}/${c.validator.totalChecks} checks`,
    `Harness: ${c.harness.passedScenarios}/${c.harness.scenarioCount} scenarios`,
    ...(c.blockingReasons.length ? ['Blocking:', ...c.blockingReasons.map((r) => `  - ${r}`)] : []),
    `Fingerprint: ${c.certificateFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the certificate deterministically.
 * @param {object} [options]
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaGatewayCertificate(options = {}, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const c = buildCoachDnaGatewayCertificate(options)
  if (format === 'json') return canonicalStringify(c)
  if (format === 'line') {
    return `coach-dna-gateway-certificate verdict=${c.verdict} activationGranted=${c.activationGranted} `
      + `validator=${c.validator.passedChecks}/${c.validator.totalChecks} `
      + `harness=${c.harness.passedScenarios}/${c.harness.scenarioCount} fp=${c.certificateFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA gateway certificate format '${format}'`)
}
