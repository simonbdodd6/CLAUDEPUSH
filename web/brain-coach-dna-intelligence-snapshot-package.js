/**
 * web/brain-coach-dna-intelligence-snapshot-package.js - Coach DNA Intelligence Snapshot Package (M260, DORMANT)
 *
 * The complete, immutable transport unit for the Coach DNA Intelligence subsystem. Where M257 seals the
 * snapshot, M258 validates it and M259 inventories it, this module ASSEMBLES those artifacts into one package
 * suitable for transfer, storage, caching or consumption by a future Brain subsystem — a single object that
 * carries everything a consumer needs and proves its own internal consistency.
 *
 * It is NOT a new intelligence layer and it never rebuilds the subsystem. It derives no new intelligence,
 * predicts nothing and recommends nothing: it embeds the supplied artifacts verbatim (as deep copies, so the
 * caller's inputs are never frozen or mutated), preserves every existing fingerprint and the snapshot's
 * provenance chain, records which artifacts are present, and cross-checks that the validation and manifest
 * actually pair with the snapshot.
 *
 * Pure function. It reuses ONLY the M257/M258/M259 shapes (importing no builder), mutates no input, performs
 * no writes, makes no recommendation, calls no AI/LLM, and uses no DOM/network/storage/env/database/clock/
 * randomness. Same input → same package, byte for byte.
 */

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

// FNV-1a 32-bit — the same fingerprint convention used across the Coach DNA pipeline, for consistency.
function fingerprint(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`
}

// Deep copy a plain-data artifact so the package embeds it WITHOUT freezing/mutating the caller's object.
const cloneArtifact = (o) => (isObj(o) ? JSON.parse(JSON.stringify(o)) : null)
const fpOf = (o) => (isObj(o) && typeof o.snapshotFingerprint === 'string' ? o.snapshotFingerprint : null)

const PACKAGE_VERSION = 1
const MILESTONE = 'M260'

/**
 * Build the deterministic, immutable Coach DNA intelligence snapshot package.
 *
 * @param {object} snapshot an M257 intelligence snapshot
 * @param {object} [validation] an optional M258 snapshot validation result
 * @param {object} [manifest] an optional M259 snapshot manifest
 * @returns {object} frozen transport package; embedded artifacts are deep copies (inputs are never mutated).
 */
export function buildCoachDnaIntelligenceSnapshotPackage(snapshot, validation, manifest) {
  const snapOk = isObj(snapshot) && snapshot.type === 'coach-dna-intelligence-snapshot'
  const valOk = isObj(validation) && validation.type === 'coach-dna-intelligence-snapshot-validation'
  const manOk = isObj(manifest) && manifest.type === 'coach-dna-intelligence-snapshot-manifest'

  // Embed verbatim deep copies — fingerprints are preserved exactly; the caller's objects are untouched.
  const embeddedSnapshot = snapOk ? cloneArtifact(snapshot) : null
  const embeddedValidation = valOk ? cloneArtifact(validation) : null
  const embeddedManifest = manOk ? cloneArtifact(manifest) : null

  const snapshotFingerprint = snapOk ? fpOf(snapshot) : null
  const validationFingerprint = valOk && typeof validation.validationFingerprint === 'string' ? validation.validationFingerprint : null
  const manifestFingerprint = manOk && typeof manifest.manifestFingerprint === 'string' ? manifest.manifestFingerprint : null

  // Preserve the intelligence provenance lineage exactly as the snapshot carries it (M230-M257).
  const provenanceChain = snapOk && isObj(snapshot.provenance) && Array.isArray(snapshot.provenance.chain)
    ? [...snapshot.provenance.chain]
    : null

  // Cross-artifact pairing: does each optional artifact actually belong to this snapshot?
  const validationMatchesSnapshot = (valOk && snapOk) ? validation.snapshotFingerprint === snapshot.snapshotFingerprint : null
  const manifestMatchesSnapshot = (manOk && snapOk) ? manifest.snapshotFingerprint === snapshot.snapshotFingerprint : null
  const manifestMatchesValidation = (manOk && valOk) ? manifest.validationFingerprint === validation.validationFingerprint : null
  const pairChecks = [validationMatchesSnapshot, manifestMatchesSnapshot, manifestMatchesValidation].filter((v) => v !== null)
  const consistent = pairChecks.every((v) => v === true)

  const transportMetadata = {
    milestone: MILESTONE,
    included: { snapshot: snapOk, validation: valOk, manifest: manOk },
    complete: snapOk && valOk && manOk,
    snapshotFingerprint,
    validationFingerprint,
    manifestFingerprint,
    validationMatchesSnapshot,
    manifestMatchesSnapshot,
    manifestMatchesValidation,
    consistent,
  }

  const packageMetadata = {
    milestone: MILESTONE,
    assembles: ['M257', 'M258', 'M259'],
    snapshotRecognized: snapOk,
    validationRecognized: valOk,
    manifestRecognized: manOk,
    deterministic: true,
    llmGenerated: false,
    readOnly: true,
    dormant: true,
  }

  const draft = {
    type: 'coach-dna-intelligence-snapshot-package',
    schemaVersion: 1,
    packageVersion: PACKAGE_VERSION,
    milestone: MILESTONE,
    mode: 'dormant',
    snapshot: embeddedSnapshot,
    validation: embeddedValidation,
    manifest: embeddedManifest,
    provenanceChain,
    packageMetadata,
    transportMetadata,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this package.
  draft.packageFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the package for logs or PR notes.
 * @param {object} snapshot an M257 snapshot
 * @param {object} [validation] an optional M258 validation
 * @param {object} [manifest] an optional M259 manifest
 * @returns {string}
 */
export function summarizeCoachDnaIntelligenceSnapshotPackage(snapshot, validation, manifest) {
  const p = buildCoachDnaIntelligenceSnapshotPackage(snapshot, validation, manifest)
  const t = p.transportMetadata
  const parts = ['snapshot', 'validation', 'manifest'].filter((k) => t.included[k])
  return [
    `Coach DNA intelligence snapshot package: ${t.complete ? 'complete' : 'partial'}`,
    `Includes: ${parts.length ? parts.join(', ') : 'none'}`,
    `Consistent: ${t.consistent}`,
    `Snapshot fp: ${t.snapshotFingerprint}`,
    `Package fp: ${p.packageFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the package deterministically.
 * @param {object} snapshot an M257 snapshot
 * @param {object} [validation] an optional M258 validation
 * @param {object} [manifest] an optional M259 manifest
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaIntelligenceSnapshotPackage(snapshot, validation, manifest, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const p = buildCoachDnaIntelligenceSnapshotPackage(snapshot, validation, manifest)
  if (format === 'json') return canonicalStringify(p)
  if (format === 'line') {
    const t = p.transportMetadata
    return `coach-dna-intelligence-snapshot-package complete=${t.complete} consistent=${t.consistent} `
      + `snapshot=${t.included.snapshot} validation=${t.included.validation} manifest=${t.included.manifest} `
      + `snapshotFp=${t.snapshotFingerprint} fp=${p.packageFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA intelligence snapshot package format '${format}'`)
}
