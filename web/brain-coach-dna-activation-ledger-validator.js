/**
 * web/brain-coach-dna-activation-ledger-validator.js - Coach DNA Activation Ledger Validator (M249, DORMANT)
 *
 * A pure, read-only validator for the M248 activation ledger — the audit-layer analogue of how M243 validates
 * the M242 gateway. It accepts a ledger entry (built live, or supplied via `options.ledger`) and checks it
 * against the M248 contract:
 *   - schema        : type, versions, mode and every required field are present and correctly typed
 *   - fingerprint   : the ledger's self-fingerprint actually matches a fresh canonical hash of its fields
 *   - provenance    : the milestones array is exactly the M242-M248 chain, in order
 *   - readiness-fp  : readinessFingerprint is the expected shape and consistent with envelopeValid
 *   - dormant       : activationGranted is false (a true value is a hard error — never accepted)
 *   - approval      : approvalRequired/humanApproved are booleans and humanApproved stays false (dormant)
 *   - blocking      : blockingReasons is a string array, non-empty whenever readiness did not pass
 *   - warnings      : warnings is a string array
 *
 * It produces a deterministic, timestamp-free validation result (valid flag, fingerprinted, with errors and
 * warnings). It has NO repair logic — it only reports. It never mutates inputs, performs no writes, makes no
 * recommendation, calls no AI, and uses no DOM/network/storage/env/clock/randomness. It changes no engine, the
 * M248 ledger, any prior milestone, index.html, runtime, or API. Same input → same result, byte for byte.
 */

import { buildCoachDnaActivationLedger } from './brain-coach-dna-activation-ledger.js' // M248

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isStr = (v) => typeof v === 'string'
const isBool = (v) => typeof v === 'boolean'
const isStrArray = (v) => Array.isArray(v) && v.every(isStr)

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

// FNV-1a 32-bit — the same fingerprint used across M239-M248, for cross-stage consistency.
function fingerprint(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`
}

const MILESTONE = 'M249'
const FP_RE = /^fnv1a32:[0-9a-f]{8}$/
const EXPECTED_PROVENANCE = Object.freeze(['M242', 'M243', 'M244', 'M245', 'M246', 'M247', 'M248'])

// Recompute the ledger's self-fingerprint exactly as M248 does: hash every field except the fingerprint.
function recomputeLedgerFingerprint(ledger) {
  const clone = {}
  for (const k of Object.keys(ledger)) {
    if (k === 'ledgerFingerprint') continue
    clone[k] = ledger[k]
  }
  return fingerprint(canonicalStringify(clone))
}

/**
 * Validate an M248 activation ledger entry against its public contract.
 *
 * @param {object} [options]
 * @param {object} [options.ledger] a ledger entry to validate; if the `ledger` key is present it is used
 *                 as-is (and validated), otherwise a live ledger is built
 * @param {object} [options.gateway] optional gateway override threaded to M248 when building a live ledger
 * @returns {object} frozen validation result; `activationGranted` is always false (this validator activates nothing).
 */
export function validateCoachDnaActivationLedger(options = {}) {
  const opts = isObj(options) ? options : {}
  const downstream = isObj(opts.gateway) ? { gateway: opts.gateway } : {}

  const provided = Object.prototype.hasOwnProperty.call(opts, 'ledger')
  const ledger = provided ? opts.ledger : buildCoachDnaActivationLedger(downstream)

  const errors = []
  const warnings = []
  const fail = (msg) => errors.push(msg)
  const warn = (msg) => warnings.push(msg)

  const ledgerFingerprint = isObj(ledger) && isStr(ledger.ledgerFingerprint) ? ledger.ledgerFingerprint : null

  // schema -----------------------------------------------------------------------------------------------
  if (!isObj(ledger)) {
    fail('ledger missing or not an object')
  } else {
    if (ledger.type !== 'coach-dna-activation-ledger') fail(`type is '${ledger.type}', expected 'coach-dna-activation-ledger'`)
    if (ledger.schemaVersion !== 1) fail(`schemaVersion is '${ledger.schemaVersion}', expected 1`)
    if (ledger.ledgerVersion !== 1) fail(`ledgerVersion is '${ledger.ledgerVersion}', expected 1`)
    if (ledger.milestone !== 'M248') fail(`milestone is '${ledger.milestone}', expected 'M248'`)
    if (ledger.mode !== 'dormant') fail(`mode is '${ledger.mode}', expected 'dormant'`)
    if (!isBool(ledger.envelopeValid)) fail('envelopeValid is not a boolean')
    if (!isBool(ledger.readinessPassed)) fail('readinessPassed is not a boolean')
    if (!isStr(ledger.readinessState)) fail('readinessState is not a string')
    if (!isStrArray(ledger.blockingReasons)) fail('blockingReasons is not a string array')
    if (!isStrArray(ledger.warnings)) fail('warnings is not a string array')
    if (!isStr(ledger.ledgerFingerprint)) fail('ledgerFingerprint is not a string')

    // dormant — the hard invariant. A truthy activationGranted is rejected outright, never tolerated.
    if (ledger.activationGranted !== false) fail(`activationGranted is '${ledger.activationGranted}', must be false`)

    // approval ---------------------------------------------------------------------------------------------
    if (!isBool(ledger.approvalRequired)) fail('approvalRequired is not a boolean')
    if (!isBool(ledger.humanApproved)) fail('humanApproved is not a boolean')
    else if (ledger.humanApproved !== false) fail('humanApproved is true, must be false while dormant')

    // provenance -------------------------------------------------------------------------------------------
    const chain = Array.isArray(ledger.milestones) ? ledger.milestones.map((m) => isObj(m) ? m.milestone : m) : null
    if (chain === null) fail('milestones is not an array')
    else if (canonicalStringify(chain) !== canonicalStringify(EXPECTED_PROVENANCE)) {
      fail(`milestone provenance is ${JSON.stringify(chain)}, expected ${JSON.stringify(EXPECTED_PROVENANCE)}`)
    }

    // readiness-fp -----------------------------------------------------------------------------------------
    if (ledger.readinessFingerprint === null) {
      if (ledger.envelopeValid !== false) fail('readinessFingerprint is null but envelopeValid is not false')
    } else if (!isStr(ledger.readinessFingerprint) || !FP_RE.test(ledger.readinessFingerprint)) {
      fail(`readinessFingerprint '${ledger.readinessFingerprint}' is not a valid fnv1a32 fingerprint`)
    } else if (ledger.envelopeValid !== true) {
      fail('readinessFingerprint is present but envelopeValid is not true')
    }

    // blocking consistency: a not-passed readiness must record at least one blocking reason
    if (isBool(ledger.readinessPassed) && ledger.readinessPassed === false && isStrArray(ledger.blockingReasons) && ledger.blockingReasons.length === 0) {
      fail('readinessPassed is false but blockingReasons is empty')
    }
    // a passed readiness with blocking reasons is contradictory
    if (ledger.readinessPassed === true && isStrArray(ledger.blockingReasons) && ledger.blockingReasons.length > 0) {
      fail('readinessPassed is true but blockingReasons is non-empty')
    }

    // fingerprint integrity --------------------------------------------------------------------------------
    if (isStr(ledger.ledgerFingerprint)) {
      if (!FP_RE.test(ledger.ledgerFingerprint)) fail(`ledgerFingerprint '${ledger.ledgerFingerprint}' is malformed`)
      else if (recomputeLedgerFingerprint(ledger) !== ledger.ledgerFingerprint) fail('ledgerFingerprint does not match a fresh hash of the ledger (tampered or stale)')
    }

    // a malformed-envelope ledger is valid structurally, but worth surfacing as a warning
    if (ledger.envelopeValid === false) warn('ledger recorded a missing or malformed readiness envelope')
  }

  const draft = {
    type: 'coach-dna-activation-ledger-validation',
    schemaVersion: 1,
    milestone: MILESTONE,
    validates: 'M248',
    valid: errors.length === 0,
    activationGranted: false,
    ledgerFingerprint,
    validationErrors: errors,
    validationWarnings: warnings,
  }

  draft.validationFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the validation for logs or PR notes.
 * @param {object} [options]
 * @returns {string}
 */
export function summarizeCoachDnaActivationLedgerValidation(options = {}) {
  const v = validateCoachDnaActivationLedger(options)
  return [
    `Coach DNA activation ledger validation: ${v.valid ? 'VALID' : 'INVALID'}`,
    `Activation granted: ${v.activationGranted}`,
    `Ledger fingerprint: ${v.ledgerFingerprint}`,
    ...(v.validationErrors.length ? ['Errors:', ...v.validationErrors.map((e) => `  - ${e}`)] : []),
    ...(v.validationWarnings.length ? ['Warnings:', ...v.validationWarnings.map((w) => `  - ${w}`)] : []),
    `Validation fingerprint: ${v.validationFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the validation result deterministically.
 * @param {object} [options]
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaActivationLedgerValidation(options = {}, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const v = validateCoachDnaActivationLedger(options)
  if (format === 'json') return canonicalStringify(v)
  if (format === 'line') {
    return `coach-dna-activation-ledger-validation valid=${v.valid} activationGranted=${v.activationGranted} `
      + `errors=${v.validationErrors.length} warnings=${v.validationWarnings.length} `
      + `ledgerFp=${v.ledgerFingerprint} fp=${v.validationFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA activation ledger validation format '${format}'`)
}
