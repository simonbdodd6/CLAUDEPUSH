/**
 * web/brain-coach-dna-governance-summary.js - Coach DNA Governance Summary (M251, DORMANT)
 *
 * The single top-level, read-only summary object for the complete dormant Coach DNA activation governance
 * subsystem (M242-M250). This is NOT another activation layer: it adds no new gate and no new check. It
 * consumes the M250 activation audit pack — the immutable assembly of certificate, approval, readiness,
 * ledger and validator — and distils it into one compact governance verdict an operator can read at a glance:
 * is the pipeline complete, is it valid, what is blocking activation, and what is the provenance behind it.
 *
 * It activates nothing and decides nothing: `activationGranted` is stamped false unconditionally. It copies
 * the pack's verdicts, blocking reasons and warnings forward, computes deterministic summary statistics over
 * the chain, and carries the full M242-M251 provenance.
 *
 * Pure function. It reuses ONLY the M250 pack, mutates no input, performs no writes, makes no recommendation,
 * calls no AI, and uses no DOM/network/storage/env/clock/randomness. It touches no engine, prior milestone,
 * index.html, runtime, or API. Same input → same governance summary, byte for byte.
 */

import { buildCoachDnaActivationAuditPack } from './brain-coach-dna-activation-audit-pack.js' // M250

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

// FNV-1a 32-bit — the same fingerprint used across M239-M250, for cross-stage consistency.
function fingerprint(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`
}

const GOVERNANCE_VERSION = 1
const MILESTONE = 'M251'

// The full governance provenance chain this summary attests to — every milestone of the activation subsystem
// plus this summary. Defined as a constant so the provenance is deterministic even when the pack is malformed.
const PROVENANCE = Object.freeze([
  { milestone: 'M242', artifact: 'web/brain-coach-dna-release-gateway.js', role: 'release gateway (activation seam)' },
  { milestone: 'M243', artifact: 'web/brain-coach-dna-gateway-validator.js', role: 'gateway contract validator' },
  { milestone: 'M244', artifact: 'web/brain-coach-dna-gateway-harness.js', role: 'gateway scenario harness' },
  { milestone: 'M245', artifact: 'web/brain-coach-dna-gateway-certificate.js', role: 'gateway activation certificate' },
  { milestone: 'M246', artifact: 'web/brain-coach-dna-activation-approval.js', role: 'human approval stub' },
  { milestone: 'M247', artifact: 'web/brain-coach-dna-activation-readiness.js', role: 'activation readiness envelope' },
  { milestone: 'M248', artifact: 'web/brain-coach-dna-activation-ledger.js', role: 'activation ledger' },
  { milestone: 'M249', artifact: 'web/brain-coach-dna-activation-ledger-validator.js', role: 'activation ledger validator' },
  { milestone: 'M250', artifact: 'web/brain-coach-dna-activation-audit-pack.js', role: 'activation audit pack' },
  { milestone: 'M251', artifact: 'web/brain-coach-dna-governance-summary.js', role: 'governance summary (this object)' },
])

// The five assembled activation stages the M250 pack embeds — used to count presence deterministically.
const STAGE_KEYS = Object.freeze(['certificate', 'approval', 'readiness', 'ledger', 'validation'])

/**
 * Build the deterministic, top-level Coach DNA governance summary.
 *
 * @param {object} [options]
 * @param {object} [options.pack] an M250 audit pack to summarize; if the `pack` key is present it is used
 *                 as-is (and validated), otherwise a live pack is built
 * @param {object} [options.gateway] optional gateway override threaded to M250 when building a live pack
 * @param {object} [options.overrides] per-stage overrides threaded to M250 when building a live pack
 * @returns {object} frozen governance summary; `activationGranted` is always false (dormant — summary only).
 */
export function buildCoachDnaGovernanceSummary(options = {}) {
  const opts = isObj(options) ? options : {}

  const provided = Object.prototype.hasOwnProperty.call(opts, 'pack')
  const pack = provided ? opts.pack : buildCoachDnaActivationAuditPack({
    ...(isObj(opts.gateway) ? { gateway: opts.gateway } : {}),
    ...(isObj(opts.overrides) ? { overrides: opts.overrides } : {}),
  })

  const packOk = isObj(pack) && pack.type === 'coach-dna-activation-audit-pack'

  const pipelineComplete = packOk ? pack.complete === true : false
  const governanceValid = packOk ? pack.valid === true : false

  const approval = packOk && isObj(pack.artifacts) ? pack.artifacts.approval : null
  const approvalRequired = isObj(approval) ? approval.approvalRequired === true : true

  // Carry the pack's governance signals forward verbatim; add a governance-level reason if the pack is unusable.
  const blockingReasons = packOk && isStrArray(pack.blockingReasons)
    ? [...pack.blockingReasons]
    : ['activation audit pack missing or malformed: governance cannot be summarized']
  const warnings = packOk && isStrArray(pack.warnings) ? [...pack.warnings] : []

  const artifactsPresent = packOk && isObj(pack.artifacts)
    ? STAGE_KEYS.filter((k) => isObj(pack.artifacts[k])).length
    : 0

  const statistics = {
    milestoneCount: PROVENANCE.length,        // M242-M251
    activationStages: STAGE_KEYS.length,      // 5 assembled stages
    artifactsPresent,                         // 0..5
    validationValid: packOk && isObj(pack.validationSummary) ? pack.validationSummary.valid === true : false,
    blockingReasonCount: blockingReasons.length,
    warningCount: warnings.length,
  }

  const draft = {
    type: 'coach-dna-governance-summary',
    schemaVersion: 1,
    governanceVersion: GOVERNANCE_VERSION,
    milestone: MILESTONE,
    provenance: PROVENANCE,
    mode: 'dormant',
    activationGranted: false,
    pipelineComplete,
    governanceValid,
    approvalRequired,
    auditFingerprint: packOk && typeof pack.auditFingerprint === 'string' ? pack.auditFingerprint : null,
    statistics,
    blockingReasons,
    warnings,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this summary.
  draft.governanceFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary line set for logs or PR notes.
 * @param {object} [options]
 * @returns {string}
 */
export function summarizeCoachDnaGovernanceSummary(options = {}) {
  const g = buildCoachDnaGovernanceSummary(options)
  return [
    `Coach DNA governance: ${g.governanceValid ? 'VALID' : 'INVALID'}${g.pipelineComplete ? '' : ' (incomplete)'}`,
    `Activation granted: ${g.activationGranted}`,
    `Approval required: ${g.approvalRequired}`,
    `Chain: ${g.statistics.artifactsPresent}/${g.statistics.activationStages} stages, ${g.statistics.milestoneCount} milestones`,
    ...(g.blockingReasons.length ? ['Blocking:', ...g.blockingReasons.map((r) => `  - ${r}`)] : []),
    `Audit fingerprint: ${g.auditFingerprint}`,
    `Governance fingerprint: ${g.governanceFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the governance summary deterministically.
 * @param {object} [options]
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaGovernanceSummary(options = {}, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const g = buildCoachDnaGovernanceSummary(options)
  if (format === 'json') return canonicalStringify(g)
  if (format === 'line') {
    return `coach-dna-governance-summary governanceValid=${g.governanceValid} pipelineComplete=${g.pipelineComplete} `
      + `activationGranted=${g.activationGranted} approvalRequired=${g.approvalRequired} `
      + `auditFp=${g.auditFingerprint} fp=${g.governanceFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA governance summary format '${format}'`)
}
