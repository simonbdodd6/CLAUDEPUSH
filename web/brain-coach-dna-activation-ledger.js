/**
 * web/brain-coach-dna-activation-ledger.js - Coach DNA Activation Ledger (M248, DORMANT)
 *
 * A purely auditive layer that seals the OUTCOME of the dormant activation pipeline into a single, stable
 * ledger entry — without ever activating anything. It consumes the M247 activation readiness envelope (the
 * consolidated view over the M245 technical gate and the M246 human gate) and folds it into a fingerprinted,
 * frozen record that a future operator could file as the auditable "this is what the activation pipeline
 * concluded" entry. It is the bookkeeping surface for the whole activation chain (M242-M247), nothing more.
 *
 * The ledger decides nothing and activates nothing: it copies the readiness verdict forward, carries the
 * blocking reasons and warnings, and stamps `activationGranted: false` unconditionally. Today, with no
 * approval channel in existence, every ledger entry records a blocked, ungranted activation.
 *
 * Pure function. It builds no pipeline artifacts, reuses ONLY the M247 envelope, mutates no input, performs no
 * writes, makes no recommendation, calls no AI, and uses no DOM/network/storage/env/clock/randomness. It
 * touches no engine, prior milestone, index.html, runtime, or API. Same input → same ledger entry, byte for
 * byte.
 */

import { buildCoachDnaActivationReadiness } from './brain-coach-dna-activation-readiness.js' // M247

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

// FNV-1a 32-bit — the same fingerprint used across M239-M247, for cross-stage consistency.
function fingerprint(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`
}

const LEDGER_VERSION = 1
const MILESTONE = 'M248'

// The full activation provenance chain this ledger entry attests to — every dormant activation milestone.
const MILESTONES = Object.freeze([
  { milestone: 'M242', artifact: 'web/brain-coach-dna-release-gateway.js', role: 'release gateway (activation seam)' },
  { milestone: 'M243', artifact: 'web/brain-coach-dna-gateway-validator.js', role: 'gateway contract validator' },
  { milestone: 'M244', artifact: 'web/brain-coach-dna-gateway-harness.js', role: 'gateway scenario harness' },
  { milestone: 'M245', artifact: 'web/brain-coach-dna-gateway-certificate.js', role: 'gateway activation certificate' },
  { milestone: 'M246', artifact: 'web/brain-coach-dna-activation-approval.js', role: 'human approval stub' },
  { milestone: 'M247', artifact: 'web/brain-coach-dna-activation-readiness.js', role: 'activation readiness envelope' },
  { milestone: 'M248', artifact: 'web/brain-coach-dna-activation-ledger.js', role: 'activation ledger (this entry)' },
])

// A readiness envelope is usable only if it is the genuine M247 shape with a boolean readiness flag.
const isValidEnvelope = (e) => isObj(e)
  && e.type === 'coach-dna-activation-readiness'
  && typeof e.ready === 'boolean'

/**
 * Build the deterministic, sealed Coach DNA activation ledger entry.
 *
 * @param {object} [options]
 * @param {object} [options.envelope] an M247 readiness envelope to record; if the `envelope` key is present it
 *                 is used as-is (and validated), otherwise a live envelope is built
 * @param {object} [options.gateway] optional gateway override threaded to M247 when building a live envelope
 * @returns {object} frozen ledger entry; `activationGranted` is always false (dormant — audit only).
 */
export function buildCoachDnaActivationLedger(options = {}) {
  const opts = isObj(options) ? options : {}
  const downstream = isObj(opts.gateway) ? { gateway: opts.gateway } : {}

  // Honour an explicitly supplied envelope (even a malformed one, so the ledger can fail safe); only build a
  // live envelope when none was provided. The input is read, never mutated.
  const provided = Object.prototype.hasOwnProperty.call(opts, 'envelope')
  const envelope = provided ? opts.envelope : buildCoachDnaActivationReadiness(downstream)

  const envelopeValid = isValidEnvelope(envelope)
  const readinessPassed = envelopeValid ? envelope.ready === true : false
  const readinessFingerprint = envelopeValid && typeof envelope.envelopeFingerprint === 'string'
    ? envelope.envelopeFingerprint
    : null
  const readinessState = envelopeValid && typeof envelope.readinessState === 'string'
    ? envelope.readinessState
    : 'envelope-invalid'

  const approval = envelopeValid && isObj(envelope.approval) ? envelope.approval : null
  const approvalRequired = approval ? approval.approvalRequired === true : true
  const humanApproved = approval ? approval.humanApproved === true : false

  // Carry the readiness verdict's blocking reasons and warnings forward verbatim; add a ledger-level reason
  // when the envelope itself could not be read.
  const envBlocking = envelopeValid && Array.isArray(envelope.blockingReasons) ? envelope.blockingReasons : []
  const envWarnings = envelopeValid && Array.isArray(envelope.warnings) ? envelope.warnings : []
  const blockingReasons = envelopeValid
    ? [...envBlocking]
    : ['readiness envelope missing or malformed: activation outcome cannot be ledgered']
  const warnings = [...envWarnings]

  const draft = {
    type: 'coach-dna-activation-ledger',
    schemaVersion: 1,
    ledgerVersion: LEDGER_VERSION,
    milestone: MILESTONE,
    milestones: MILESTONES,
    mode: 'dormant',
    activationGranted: false,
    envelopeValid,
    readinessPassed,
    readinessState,
    readinessFingerprint,
    approvalRequired,
    humanApproved,
    blockingReasons,
    warnings,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this entry.
  draft.ledgerFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the ledger entry for logs or PR notes.
 * @param {object} [options]
 * @returns {string}
 */
export function summarizeCoachDnaActivationLedger(options = {}) {
  const l = buildCoachDnaActivationLedger(options)
  return [
    `Coach DNA activation ledger: ${l.readinessState}`,
    `Readiness passed: ${l.readinessPassed}`,
    `Activation granted: ${l.activationGranted}`,
    `Human approved: ${l.humanApproved}`,
    ...(l.blockingReasons.length ? ['Blocking:', ...l.blockingReasons.map((r) => `  - ${r}`)] : []),
    `Readiness fingerprint: ${l.readinessFingerprint}`,
    `Ledger fingerprint: ${l.ledgerFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the ledger entry deterministically.
 * @param {object} [options]
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaActivationLedger(options = {}, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const l = buildCoachDnaActivationLedger(options)
  if (format === 'json') return canonicalStringify(l)
  if (format === 'line') {
    return `coach-dna-activation-ledger state=${l.readinessState} readinessPassed=${l.readinessPassed} `
      + `activationGranted=${l.activationGranted} humanApproved=${l.humanApproved} `
      + `readinessFp=${l.readinessFingerprint} fp=${l.ledgerFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA activation ledger format '${format}'`)
}
