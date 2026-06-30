/**
 * web/brain-coach-dna-intelligence-snapshot-manifest.js - Coach DNA Intelligence Snapshot Manifest (M259, DORMANT)
 *
 * A deterministic, compact INVENTORY of a snapshot package — the M257 snapshot plus an optional M258 validation
 * result. It lets a downstream Brain subsystem identify what it was handed (which coach, what coverage, valid
 * or not, contract honoured or not) WITHOUT inspecting the full snapshot body or re-running the validator, and
 * WITHOUT rebuilding the intelligence subsystem.
 *
 * It is NOT a new intelligence layer. It derives no new intelligence, predicts nothing and recommends nothing:
 * every manifest field is a compact projection of values already present in the snapshot and the validation
 * result. It surfaces the package fingerprints, the validity/contract flags, summary roll-ups of provenance,
 * coverage, confidence and evidence, and the error/warning counts.
 *
 * Pure function. It reuses ONLY the M257 snapshot and M258 result shapes (importing neither builder), mutates
 * no input, performs no writes, makes no recommendation, calls no AI/LLM, and uses no DOM/network/storage/env/
 * database/clock/randomness. Same input → same manifest, byte for byte.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const numOr0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const strOrNull = (v) => (typeof v === 'string' && v.length > 0 ? v : null)

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

// FNV-1a 32-bit — the same fingerprint convention used across the Coach DNA pipeline, for consistency.
function fingerprint(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`
}

const MANIFEST_VERSION = 1
const MILESTONE = 'M259'

/**
 * Build the deterministic Coach DNA intelligence snapshot manifest.
 *
 * @param {object} snapshot an M257 intelligence snapshot
 * @param {object} [validation] an optional M258 snapshot validation result
 * @returns {object} frozen manifest (compact inventory of the snapshot package).
 */
export function buildCoachDnaIntelligenceSnapshotManifest(snapshot, validation) {
  const snapOk = isObj(snapshot) && snapshot.type === 'coach-dna-intelligence-snapshot'
  const valOk = isObj(validation) && validation.type === 'coach-dna-intelligence-snapshot-validation'

  const snapshotFingerprint = snapOk && typeof snapshot.snapshotFingerprint === 'string' ? snapshot.snapshotFingerprint : null
  const validationFingerprint = valOk && typeof validation.validationFingerprint === 'string' ? validation.validationFingerprint : null

  // snapshotValid is only known when a validation result is supplied; otherwise null (unknown, not assumed).
  const snapshotValid = valOk ? validation.valid === true : null
  const contractHonoured = snapOk && isObj(snapshot.contract) ? snapshot.contract.honoured === true : false

  const prov = snapOk && isObj(snapshot.provenance) ? snapshot.provenance : {}
  const provenanceSummary = {
    chain: Array.isArray(prov.chain) ? [...prov.chain] : null,
    profileFingerprint: strOrNull(prov.profileFingerprint),
    intelligenceInputsFingerprint: strOrNull(prov.intelligenceInputsFingerprint),
    indexFingerprint: strOrNull(prov.indexFingerprint),
    originMilestone: isObj(prov.origin) ? strOrNull(prov.origin.sourceMilestone) : null,
    provenanceVerified: valOk ? validation.provenanceVerified === true : null,
  }

  const cov = snapOk && isObj(snapshot.coverage) ? snapshot.coverage : {}
  const coverageSummary = {
    categoriesCovered: numOr0(cov.categoriesCovered),
    categoriesPossible: numOr0(cov.categoriesPossible),
    coverageRatio: numOr0(cov.coverageRatio),
    presentSignals: numOr0(cov.presentSignals),
  }

  const conf = snapOk && isObj(snapshot.confidence) ? snapshot.confidence : {}
  const confidenceSummary = {
    level: strOrNull(conf.level) || 'LOW',
    value: numOr0(conf.value),
    high: conf.high === true,
    low: conf.low === true,
  }

  const ev = snapOk && isObj(snapshot.evidence) ? snapshot.evidence : {}
  const evidenceSummary = {
    totalMemories: numOr0(ev.totalMemories),
    uniqueTypes: numOr0(ev.uniqueTypes),
    totalEvidence: numOr0(ev.totalEvidence),
    totalOntologyLinks: numOr0(ev.totalOntologyLinks),
  }

  const errorCount = valOk && Array.isArray(validation.validationErrors) ? validation.validationErrors.length : 0
  const warningCount = valOk && Array.isArray(validation.validationWarnings) ? validation.validationWarnings.length : 0

  const draft = {
    type: 'coach-dna-intelligence-snapshot-manifest',
    schemaVersion: 1,
    manifestVersion: MANIFEST_VERSION,
    milestone: MILESTONE,
    snapshotFingerprint,
    validationFingerprint,
    snapshotValid,
    contractHonoured,
    provenanceSummary,
    coverageSummary,
    confidenceSummary,
    evidenceSummary,
    errorCount,
    warningCount,
    manifestMetadata: {
      milestone: MILESTONE,
      describes: 'coach-dna-intelligence-snapshot',
      sourceMilestone: 'M257',
      validatorMilestone: 'M258',
      snapshotRecognized: snapOk,
      validated: valOk,
      // when both are present, whether the validation result actually pairs with this snapshot
      validationMatchesSnapshot: valOk && snapOk ? validation.snapshotFingerprint === snapshot.snapshotFingerprint : null,
      deterministic: true,
      llmGenerated: false,
      readOnly: true,
      dormant: true,
    },
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this manifest.
  draft.manifestFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the manifest for logs or PR notes.
 * @param {object} snapshot an M257 intelligence snapshot
 * @param {object} [validation] an optional M258 snapshot validation result
 * @returns {string}
 */
export function summarizeCoachDnaIntelligenceSnapshotManifest(snapshot, validation) {
  const m = buildCoachDnaIntelligenceSnapshotManifest(snapshot, validation)
  const validity = m.snapshotValid === null ? 'unvalidated' : (m.snapshotValid ? 'valid' : 'invalid')
  return [
    `Coach DNA intelligence snapshot manifest: ${validity}`,
    `Contract honoured: ${m.contractHonoured}`,
    `Coverage: ${m.coverageSummary.categoriesCovered}/${m.coverageSummary.categoriesPossible}`,
    `Confidence: ${m.confidenceSummary.level}`,
    `Errors/Warnings: ${m.errorCount}/${m.warningCount}`,
    `Snapshot fp: ${m.snapshotFingerprint}`,
    `Manifest fp: ${m.manifestFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the manifest deterministically.
 * @param {object} snapshot an M257 intelligence snapshot
 * @param {object} [validation] an optional M258 snapshot validation result
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaIntelligenceSnapshotManifest(snapshot, validation, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const m = buildCoachDnaIntelligenceSnapshotManifest(snapshot, validation)
  if (format === 'json') return canonicalStringify(m)
  if (format === 'line') {
    return `coach-dna-intelligence-snapshot-manifest snapshotValid=${m.snapshotValid} contractHonoured=${m.contractHonoured} `
      + `coverage=${m.coverageSummary.categoriesCovered}/${m.coverageSummary.categoriesPossible} `
      + `errors=${m.errorCount} warnings=${m.warningCount} snapshotFp=${m.snapshotFingerprint} fp=${m.manifestFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA intelligence snapshot manifest format '${format}'`)
}
