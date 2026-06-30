/**
 * web/brain-coach-dna-activation-audit-pack.js - Coach DNA Activation Audit Pack (M250, DORMANT)
 *
 * The single immutable audit artifact for the entire dormant activation governance chain. It assembles, in one
 * frozen pack, every stage of the activation pipeline:
 *   - M245 gateway activation certificate   (the technical gate)
 *   - M246 human approval stub              (the human gate)
 *   - M247 activation readiness envelope    (the consolidated gate view)
 *   - M248 activation ledger                (the sealed audit entry)
 *   - M249 activation ledger validator      (the contract check over the ledger)
 *
 * The pack assembles the chain WITHOUT changing any source data: it embeds each artifact verbatim, records its
 * deterministic fingerprint to prove the source is unaltered, preserves the full M242-M250 provenance, folds
 * in the validation summary, and aggregates the chain's blocking reasons and warnings. It decides nothing and
 * activates nothing: `activationGranted` is stamped false unconditionally — even a fully valid chain grants no
 * activation.
 *
 * Pure function. It reuses ONLY M245-M249, mutates no input, performs no writes, makes no recommendation,
 * calls no AI, and uses no DOM/network/storage/env/clock/randomness. It touches no engine, prior milestone,
 * index.html, runtime, or API. Same input → same pack, byte for byte.
 */

import { buildCoachDnaGatewayCertificate } from './brain-coach-dna-gateway-certificate.js'         // M245
import { buildCoachDnaActivationApproval } from './brain-coach-dna-activation-approval.js'          // M246
import { buildCoachDnaActivationReadiness } from './brain-coach-dna-activation-readiness.js'        // M247
import { buildCoachDnaActivationLedger } from './brain-coach-dna-activation-ledger.js'              // M248
import { validateCoachDnaActivationLedger } from './brain-coach-dna-activation-ledger-validator.js' // M249

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isStrArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')

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

// FNV-1a 32-bit — the same fingerprint used across M239-M249, for cross-stage consistency.
function fingerprint(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`
}

const PACK_VERSION = 1
const MILESTONE = 'M250'

// The full activation provenance chain this pack attests to — every dormant activation milestone.
const PROVENANCE = Object.freeze([
  { milestone: 'M242', artifact: 'web/brain-coach-dna-release-gateway.js', role: 'release gateway (activation seam)' },
  { milestone: 'M243', artifact: 'web/brain-coach-dna-gateway-validator.js', role: 'gateway contract validator' },
  { milestone: 'M244', artifact: 'web/brain-coach-dna-gateway-harness.js', role: 'gateway scenario harness' },
  { milestone: 'M245', artifact: 'web/brain-coach-dna-gateway-certificate.js', role: 'gateway activation certificate' },
  { milestone: 'M246', artifact: 'web/brain-coach-dna-activation-approval.js', role: 'human approval stub' },
  { milestone: 'M247', artifact: 'web/brain-coach-dna-activation-readiness.js', role: 'activation readiness envelope' },
  { milestone: 'M248', artifact: 'web/brain-coach-dna-activation-ledger.js', role: 'activation ledger' },
  { milestone: 'M249', artifact: 'web/brain-coach-dna-activation-ledger-validator.js', role: 'activation ledger validator' },
  { milestone: 'M250', artifact: 'web/brain-coach-dna-activation-audit-pack.js', role: 'activation audit pack (this artifact)' },
])

// Each chain stage: its embed key, the expected `type`, the milestone, and the field that names its fingerprint.
const STAGES = Object.freeze([
  { key: 'certificate', milestone: 'M245', type: 'coach-dna-gateway-certificate', fpField: 'certificateFingerprint' },
  { key: 'approval', milestone: 'M246', type: 'coach-dna-activation-approval', fpField: 'approvalFingerprint' },
  { key: 'readiness', milestone: 'M247', type: 'coach-dna-activation-readiness', fpField: 'envelopeFingerprint' },
  { key: 'ledger', milestone: 'M248', type: 'coach-dna-activation-ledger', fpField: 'ledgerFingerprint' },
  { key: 'validation', milestone: 'M249', type: 'coach-dna-activation-ledger-validation', fpField: 'validationFingerprint' },
])

/**
 * Build the deterministic, immutable Coach DNA activation audit pack.
 *
 * @param {object} [options]
 * @param {object} [options.gateway] optional gateway override threaded through the whole live chain
 * @param {object} [options.overrides] per-stage overrides ({ certificate, approval, readiness, ledger,
 *                 validation }) used as-is (and validated) instead of the live-built artifact; useful for tests
 * @returns {object} frozen audit pack; `activationGranted` is always false (dormant — audit only).
 */
export function buildCoachDnaActivationAuditPack(options = {}) {
  const opts = isObj(options) ? options : {}
  const downstream = isObj(opts.gateway) ? { gateway: opts.gateway } : {}
  const overrides = isObj(opts.overrides) ? opts.overrides : {}
  const has = (k) => Object.prototype.hasOwnProperty.call(overrides, k)

  // Build the chain once, threading each artifact into the next so the live pack is internally consistent.
  // An explicit override (even a malformed one) replaces the corresponding stage so the pack can fail safe.
  const certificate = has('certificate') ? overrides.certificate : buildCoachDnaGatewayCertificate(downstream)
  const readiness = has('readiness') ? overrides.readiness : buildCoachDnaActivationReadiness({ certificate })
  const approval = has('approval') ? overrides.approval : buildCoachDnaActivationApproval({ certificate })
  const ledger = has('ledger') ? overrides.ledger : buildCoachDnaActivationLedger({ envelope: readiness })
  const validation = has('validation') ? overrides.validation : validateCoachDnaActivationLedger({ ledger })

  const built = { certificate, approval, readiness, ledger, validation }

  const errors = []
  const artifacts = {}
  const fingerprints = {}

  for (const stage of STAGES) {
    const a = built[stage.key]
    const present = isObj(a) && a.type === stage.type
    if (!present) {
      errors.push(`${stage.milestone} ${stage.key}: missing or wrong-typed artifact`)
      artifacts[stage.key] = null
      fingerprints[stage.key] = null
      continue
    }
    // The hard invariant across every stage: no artifact may report a granted activation.
    if ('activationGranted' in a && a.activationGranted !== false) {
      errors.push(`${stage.milestone} ${stage.key}: activationGranted is '${a.activationGranted}', must be false`)
    }
    artifacts[stage.key] = a // embedded verbatim — source data is never altered
    fingerprints[stage.key] = typeof a[stage.fpField] === 'string' ? a[stage.fpField] : null
  }

  // The contract check from M249 gates the pack's validity.
  const validationOk = isObj(validation) && validation.type === 'coach-dna-activation-ledger-validation'
  const validationValid = validationOk && validation.valid === true
  if (validationOk && !validationValid) errors.push('M249 validation: ledger is invalid')

  const validationSummary = {
    present: validationOk,
    valid: validationValid,
    errorCount: validationOk && isStrArray(validation.validationErrors) ? validation.validationErrors.length : null,
    warningCount: validationOk && isStrArray(validation.validationWarnings) ? validation.validationWarnings.length : null,
  }

  // Aggregate the chain's governance signals. The readiness envelope is the canonical source of activation
  // blocking reasons and warnings; the validator contributes its own warnings.
  const readinessOk = isObj(readiness) && readiness.type === 'coach-dna-activation-readiness'
  const blockingReasons = [
    ...(readinessOk && isStrArray(readiness.blockingReasons) ? readiness.blockingReasons : []),
    ...errors,
  ]
  const warnings = [
    ...(readinessOk && isStrArray(readiness.warnings) ? readiness.warnings : []),
    ...(validationOk && isStrArray(validation.validationWarnings) ? validation.validationWarnings : []),
  ]

  const draft = {
    type: 'coach-dna-activation-audit-pack',
    schemaVersion: 1,
    packVersion: PACK_VERSION,
    milestone: MILESTONE,
    provenance: PROVENANCE,
    mode: 'dormant',
    activationGranted: false,
    complete: errors.length === 0,
    valid: errors.length === 0 && validationValid,
    artifacts,
    fingerprints,
    validationSummary,
    blockingReasons,
    warnings,
    assemblyErrors: errors,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this pack.
  draft.auditFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the audit pack for logs or PR notes.
 * @param {object} [options]
 * @returns {string}
 */
export function summarizeCoachDnaActivationAuditPack(options = {}) {
  const p = buildCoachDnaActivationAuditPack(options)
  return [
    `Coach DNA activation audit pack: ${p.valid ? 'VALID' : 'INVALID'}${p.complete ? '' : ' (incomplete)'}`,
    `Activation granted: ${p.activationGranted}`,
    `Chain: ${STAGES.map((s) => `${s.key}=${p.fingerprints[s.key] || 'missing'}`).join(' ')}`,
    `Validation: ${p.validationSummary.valid ? 'valid' : 'invalid'}`,
    ...(p.blockingReasons.length ? ['Blocking:', ...p.blockingReasons.map((r) => `  - ${r}`)] : []),
    `Audit fingerprint: ${p.auditFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the audit pack deterministically.
 * @param {object} [options]
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaActivationAuditPack(options = {}, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const p = buildCoachDnaActivationAuditPack(options)
  if (format === 'json') return canonicalStringify(p)
  if (format === 'line') {
    return `coach-dna-activation-audit-pack valid=${p.valid} complete=${p.complete} activationGranted=${p.activationGranted} `
      + `validation=${p.validationSummary.valid} fp=${p.auditFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA activation audit pack format '${format}'`)
}
