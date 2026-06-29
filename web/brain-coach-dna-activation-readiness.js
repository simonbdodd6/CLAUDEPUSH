/**
 * web/brain-coach-dna-activation-readiness.js - Coach DNA Activation Readiness Envelope (M247, DORMANT)
 *
 * The single consolidated view over the Coach DNA activation gate. It combines the two preceding dormant
 * layers — the M245 gateway activation certificate (the TECHNICAL gate: "is the seam ready?") and the M246
 * human approval stub (the HUMAN gate: "has a person signed off?") — into one frozen Activation Readiness
 * Envelope. It is the place a future operator would read a single answer to "could this be activated, and if
 * not, what is blocking it?".
 *
 * Readiness requires BOTH gates: a passing certificate AND a recorded human approval. No approval channel
 * exists yet, so `ready` is permanently false today. And readiness is NOT activation: even a fully-ready
 * envelope stamps `activationGranted: false` — granting activation is out of scope for this milestone and
 * every milestone in this dormant pipeline.
 *
 * It builds no pipeline artifacts, reuses ONLY M245 and M246, mutates no input, performs no writes, makes no
 * recommendation, calls no AI, and uses no DOM/network/storage/clock/randomness. It touches no engine, prior
 * milestone, index.html, runtime, or API. Same input → same envelope, byte for byte.
 */

import { buildCoachDnaGatewayCertificate } from './brain-coach-dna-gateway-certificate.js' // M245
import { buildCoachDnaActivationApproval } from './brain-coach-dna-activation-approval.js' // M246

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

// FNV-1a 32-bit — the same fingerprint used across M239/M240/M241/M244/M245/M246, for cross-stage consistency.
function fingerprint(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`
}

const MILESTONE = 'M247'
const SOURCES = Object.freeze([
  { milestone: 'M245', artifact: 'web/brain-coach-dna-gateway-certificate.js', role: 'gateway activation certificate (technical gate)' },
  { milestone: 'M246', artifact: 'web/brain-coach-dna-activation-approval.js', role: 'human approval stub (human gate)' },
])

/**
 * Build the deterministic Coach DNA activation readiness envelope.
 *
 * @param {object} [options]
 * @param {object} [options.certificate] an M245 certificate to evaluate; if the `certificate` key is present
 *                 it is used as-is (and validated), otherwise a live certificate is built
 * @param {object} [options.gateway] optional gateway override threaded to M245 when building a live certificate
 * @returns {object} frozen envelope. `ready` reflects both gates; `activationGranted` is always false (dormant).
 */
export function buildCoachDnaActivationReadiness(options = {}) {
  const opts = isObj(options) ? options : {}
  const downstream = isObj(opts.gateway) ? { gateway: opts.gateway } : {}

  // Resolve a single certificate, then feed that SAME certificate to the M246 approval so both gates agree.
  // Inputs are read, never mutated.
  const provided = Object.prototype.hasOwnProperty.call(opts, 'certificate')
  const certificate = provided ? opts.certificate : buildCoachDnaGatewayCertificate(downstream)
  const approval = buildCoachDnaActivationApproval({ certificate })

  // M246 has already validated the certificate shape and copied its pass/fail forward — reuse that verdict.
  const certificateValid = approval.certificateValid === true
  const certificatePassed = approval.certificatePassed === true
  const humanApproved = approval.humanApproved === true // permanently false — no approval channel exists yet
  const certVerdict = certificateValid && typeof certificate.verdict === 'string' ? certificate.verdict : null

  // Readiness requires BOTH gates. Readiness is NOT activation — activationGranted stays false regardless.
  const ready = certificatePassed && humanApproved

  let readinessState
  if (!certificateValid) readinessState = 'certificate-invalid'
  else if (!certificatePassed) readinessState = 'certificate-failed'
  else if (!humanApproved) readinessState = 'awaiting-human-approval'
  else readinessState = 'ready-pending-activation'

  // Aggregate why activation is blocked: technical detail from the certificate, then the human gate.
  const blockingReasons = []
  if (!certificateValid) {
    blockingReasons.push('gateway certificate missing or malformed: activation readiness cannot be evaluated')
  } else if (!certificatePassed) {
    blockingReasons.push('gateway certificate did not pass: activation readiness not certified')
    for (const r of Array.isArray(certificate.blockingReasons) ? certificate.blockingReasons : []) {
      blockingReasons.push(`certificate: ${r}`)
    }
  }
  if (!humanApproved) {
    blockingReasons.push('human approval not granted: no sign-off has been recorded')
  }

  // A warning, never a recommendation: make the dormant human gate explicit when the technical gate is clear.
  const warnings = []
  if (certificatePassed && !humanApproved) {
    warnings.push('certificate passed; activation blocked pending human approval')
  }

  const draft = {
    type: 'coach-dna-activation-readiness',
    schemaVersion: 1,
    milestone: MILESTONE,
    sources: SOURCES,
    mode: 'dormant',
    ready,
    readinessState,
    activationGranted: false,
    certificate: {
      milestone: 'M245',
      valid: certificateValid,
      passed: certificatePassed,
      verdict: certVerdict,
      fingerprint: certificateValid && typeof certificate.certificateFingerprint === 'string' ? certificate.certificateFingerprint : null,
    },
    approval: {
      milestone: 'M246',
      approvalRequired: approval.approvalRequired === true,
      humanApproved,
      fingerprint: typeof approval.approvalFingerprint === 'string' ? approval.approvalFingerprint : null,
    },
    blockingReasons,
    warnings,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this envelope.
  draft.envelopeFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the envelope for logs or PR notes.
 * @param {object} [options]
 * @returns {string}
 */
export function summarizeCoachDnaActivationReadiness(options = {}) {
  const e = buildCoachDnaActivationReadiness(options)
  return [
    `Coach DNA activation readiness: ${e.readinessState}`,
    `Ready: ${e.ready}`,
    `Activation granted: ${e.activationGranted}`,
    `Certificate: ${e.certificate.passed ? 'passed' : (e.certificate.valid ? 'failed' : 'invalid')}`,
    `Human approved: ${e.approval.humanApproved}`,
    ...(e.blockingReasons.length ? ['Blocking:', ...e.blockingReasons.map((r) => `  - ${r}`)] : []),
    `Fingerprint: ${e.envelopeFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the envelope deterministically.
 * @param {object} [options]
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaActivationReadiness(options = {}, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const e = buildCoachDnaActivationReadiness(options)
  if (format === 'json') return canonicalStringify(e)
  if (format === 'line') {
    return `coach-dna-activation-readiness state=${e.readinessState} ready=${e.ready} activationGranted=${e.activationGranted} `
      + `certificatePassed=${e.certificate.passed} humanApproved=${e.approval.humanApproved} fp=${e.envelopeFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA activation readiness format '${format}'`)
}
