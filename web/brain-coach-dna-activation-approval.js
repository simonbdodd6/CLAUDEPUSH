/**
 * web/brain-coach-dna-activation-approval.js - Coach DNA Activation Human Approval Stub (M246, DORMANT)
 *
 * The dormant layer that sits directly above the M245 gateway activation certificate. Where M245 answers
 * "is the activation seam technically ready?", this stub answers the gating human question: "has a person
 * signed off on activation?" — and records, deterministically, that no human approval exists yet. There is no
 * approval channel in the codebase today, so the honest, safe answer is permanently `humanApproved: false`.
 *
 * It consumes the M245 certificate (built live, or supplied via `options.certificate`), copies its pass/fail
 * forward, and produces a frozen approval record: activation stays blocked while either the certificate has
 * not passed OR human approval is missing — and BOTH gates must clear before activation could ever be granted.
 * Even with a passing certificate AND a (future) human sign-off, this stub still stamps
 * `activationGranted: false`: granting activation is deliberately out of scope for this milestone.
 *
 * It builds no pipeline artifacts, reuses ONLY the M245 certificate, mutates no input, performs no writes,
 * makes no recommendation, calls no AI, and uses no DOM/network/storage/clock/randomness. It touches no
 * engine, prior milestone, index.html, runtime, or API. Same input → same approval record, byte for byte.
 */

import { buildCoachDnaGatewayCertificate } from './brain-coach-dna-gateway-certificate.js' // M245

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

// FNV-1a 32-bit — the same fingerprint used across M239/M240/M241/M244/M245, for cross-stage consistency.
function fingerprint(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`
}

const MILESTONE = 'M246'
const SOURCES = Object.freeze([
  { milestone: 'M245', artifact: 'web/brain-coach-dna-gateway-certificate.js', role: 'gateway activation certificate' },
])

// A certificate is usable only if it is the genuine M245 shape with a boolean pass flag.
const isValidCertificate = (c) => isObj(c)
  && c.type === 'coach-dna-gateway-certificate'
  && typeof c.certificatePassed === 'boolean'

/**
 * Build the deterministic Coach DNA activation human-approval stub.
 *
 * @param {object} [options]
 * @param {object} [options.certificate] an M245 certificate to evaluate; if the `certificate` key is present
 *                 it is used as-is (and validated), otherwise a live certificate is built
 * @param {object} [options.gateway] optional gateway override threaded to M245 when building a live certificate
 * @returns {object} frozen approval record. `approvalRequired` is always true, `humanApproved` and
 *                   `activationGranted` are always false (dormant — no approval channel exists yet).
 */
export function buildCoachDnaActivationApproval(options = {}) {
  const opts = isObj(options) ? options : {}

  // Honour an explicitly supplied certificate (even a malformed one, so the stub can fail safe); only build a
  // live certificate when none was provided. The input is read, never mutated.
  const provided = Object.prototype.hasOwnProperty.call(opts, 'certificate')
  const certificate = provided
    ? opts.certificate
    : buildCoachDnaGatewayCertificate(isObj(opts.gateway) ? { gateway: opts.gateway } : {})

  const certValid = isValidCertificate(certificate)
  const certificatePassed = certValid ? certificate.certificatePassed === true : false
  const certificateFingerprint = certValid && typeof certificate.certificateFingerprint === 'string'
    ? certificate.certificateFingerprint
    : null

  // No human approval channel exists yet — this stub records the ABSENCE of sign-off. Permanently false.
  const humanApproved = false

  // Activation is blocked while EITHER gate is unmet. Both reasons are reported when both gates fail.
  const blockingReasons = []
  if (!certValid) {
    blockingReasons.push('certificate missing or malformed: activation readiness cannot be evaluated')
  } else if (!certificatePassed) {
    blockingReasons.push('gateway certificate did not pass: activation readiness not certified')
  }
  if (!humanApproved) {
    blockingReasons.push('human approval not granted: no sign-off has been recorded')
  }

  // Surface the dormancy explicitly when the technical gate is clear but the human gate is not. A warning,
  // never a recommendation.
  const warnings = []
  if (certValid && certificatePassed) {
    warnings.push('certificate passed but activation remains blocked pending human approval')
  }

  const draft = {
    type: 'coach-dna-activation-approval',
    schemaVersion: 1,
    milestone: MILESTONE,
    sources: SOURCES,
    mode: 'dormant',
    approvalRequired: true,
    humanApproved,
    activationGranted: false,
    certificateValid: certValid,
    certificatePassed,
    certificateFingerprint,
    blockingReasons,
    warnings,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this record.
  draft.approvalFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the approval stub for logs or PR notes.
 * @param {object} [options]
 * @returns {string}
 */
export function summarizeCoachDnaActivationApproval(options = {}) {
  const a = buildCoachDnaActivationApproval(options)
  return [
    `Coach DNA activation approval: ${a.activationGranted ? 'GRANTED' : 'BLOCKED'}`,
    `Approval required: ${a.approvalRequired}`,
    `Human approved: ${a.humanApproved}`,
    `Certificate passed: ${a.certificatePassed}`,
    ...(a.blockingReasons.length ? ['Blocking:', ...a.blockingReasons.map((r) => `  - ${r}`)] : []),
    `Fingerprint: ${a.approvalFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the approval stub deterministically.
 * @param {object} [options]
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaActivationApproval(options = {}, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const a = buildCoachDnaActivationApproval(options)
  if (format === 'json') return canonicalStringify(a)
  if (format === 'line') {
    return `coach-dna-activation-approval activationGranted=${a.activationGranted} humanApproved=${a.humanApproved} `
      + `approvalRequired=${a.approvalRequired} certificatePassed=${a.certificatePassed} fp=${a.approvalFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA activation approval format '${format}'`)
}
