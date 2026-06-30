/**
 * web/brain-coach-dna-intelligence-snapshot-validator.js - Coach DNA Intelligence Snapshot Validator (M258, DORMANT)
 *
 * A pure, self-contained validator for the M257 intelligence snapshot. It checks the INTEGRITY of a portable
 * snapshot WITHOUT rebuilding the intelligence subsystem — it never re-derives from a profile, it only reads
 * the snapshot's own contents and recomputes its self-fingerprint. This lets a downstream consumer trust a
 * snapshot it was handed (cached, transferred) without access to the original profile/index/query stack.
 *
 * It verifies:
 *   - schema        : type, versions, mode and required blocks present and correctly typed
 *   - fingerprint   : the snapshot's self-fingerprint matches a fresh canonical hash of its fields
 *   - provenance    : the provenance chain is exactly M230-M257, in order
 *   - contract      : the embedded M256 verdict is honoured and its fingerprint matches the fingerprints block
 *   - profile-fp    : the profile fingerprint is consistent between the fingerprints and provenance blocks
 *   - activation    : the Intelligence layer must never carry an active activation flag (defensive)
 *
 * It produces a deterministic, timestamp-free validation result. It has NO repair logic — it only reports. It
 * never mutates inputs, performs no writes, makes no recommendation, calls no AI/LLM, and uses no
 * DOM/network/storage/env/database/clock/randomness. Same input → same result, byte for byte.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isStr = (v) => typeof v === 'string'

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

const MILESTONE = 'M258'
const FP_RE = /^fnv1a32:[0-9a-f]{8}$/
const EXPECTED_CHAIN = Object.freeze(['M230', 'M252', 'M253', 'M254', 'M255', 'M256', 'M257'])

// Recompute the snapshot's self-fingerprint exactly as M257 does: hash every field except the fingerprint.
function recomputeSnapshotFingerprint(snapshot) {
  const shallow = {}
  for (const k of Object.keys(snapshot)) {
    if (k === 'snapshotFingerprint') continue
    shallow[k] = snapshot[k]
  }
  return fingerprint(canonicalStringify(shallow))
}

/**
 * Validate the integrity of an M257 intelligence snapshot.
 *
 * @param {object} snapshot an M257 intelligence snapshot
 * @returns {object} frozen validation result.
 */
export function validateCoachDnaIntelligenceSnapshot(snapshot) {
  const errors = []
  const warnings = []
  const fail = (m) => errors.push(m)
  const warn = (m) => warnings.push(m)

  const snapOk = isObj(snapshot) && snapshot.type === 'coach-dna-intelligence-snapshot'
  const snapshotFingerprint = snapOk && isStr(snapshot.snapshotFingerprint) ? snapshot.snapshotFingerprint : null

  // schema -------------------------------------------------------------------------------------------------
  if (!snapOk) {
    fail('snapshot missing or not a coach-dna-intelligence-snapshot')
  } else {
    if (snapshot.schemaVersion !== 1) fail(`schemaVersion is '${snapshot.schemaVersion}', expected 1`)
    if (snapshot.snapshotVersion !== 1) fail(`snapshotVersion is '${snapshot.snapshotVersion}', expected 1`)
    if (snapshot.milestone !== 'M257') fail(`milestone is '${snapshot.milestone}', expected 'M257'`)
    if (snapshot.mode !== 'dormant') fail(`mode is '${snapshot.mode}', expected 'dormant'`)
    if (typeof snapshot.usable !== 'boolean') fail('usable is not a boolean')
    if (!isObj(snapshot.fingerprints)) fail('fingerprints block missing')
    if (!isObj(snapshot.provenance)) fail('provenance block missing')
    if (!isObj(snapshot.contract)) fail('contract block missing')
    if (!isStr(snapshot.snapshotFingerprint)) fail('snapshotFingerprint is not a string')

    // fingerprint integrity
    if (isStr(snapshot.snapshotFingerprint)) {
      if (!FP_RE.test(snapshot.snapshotFingerprint)) fail(`snapshotFingerprint '${snapshot.snapshotFingerprint}' is malformed`)
      else if (recomputeSnapshotFingerprint(snapshot) !== snapshot.snapshotFingerprint) {
        fail('snapshotFingerprint does not match a fresh hash of the snapshot (tampered or stale)')
      }
    }
  }

  // provenance ---------------------------------------------------------------------------------------------
  let provenanceVerified = false
  if (snapOk && isObj(snapshot.provenance) && Array.isArray(snapshot.provenance.chain)) {
    provenanceVerified = canonicalStringify(snapshot.provenance.chain) === canonicalStringify(EXPECTED_CHAIN)
    if (!provenanceVerified) fail(`provenance chain mismatch: expected ${JSON.stringify(EXPECTED_CHAIN)}`)
  } else if (snapOk) {
    fail('provenance chain missing')
  }

  // profile fingerprint consistency ------------------------------------------------------------------------
  let profileFingerprintVerified = false
  if (snapOk && isObj(snapshot.fingerprints) && isObj(snapshot.provenance)) {
    const a = snapshot.fingerprints.profile
    const b = snapshot.provenance.profileFingerprint
    const bothNull = a === null && b === null
    const bothEqualFp = a === b && isStr(a) && FP_RE.test(a)
    profileFingerprintVerified = bothNull || bothEqualFp
    if (!profileFingerprintVerified) fail('profile fingerprint inconsistent between the fingerprints and provenance blocks')
    if (snapshot.usable === true && !(isStr(a) && FP_RE.test(a))) fail('usable snapshot has no valid profile fingerprint')
  }

  // contract verification ----------------------------------------------------------------------------------
  let contractVerified = false
  if (snapOk && isObj(snapshot.contract)) {
    const c = snapshot.contract
    const embedded = isObj(snapshot.fingerprints) ? snapshot.fingerprints.contractValidation : undefined
    const fpMatches = c.fingerprint === embedded && isStr(c.fingerprint) && FP_RE.test(c.fingerprint)
    contractVerified = c.honoured === true && fpMatches
    if (c.honoured !== true) fail('snapshot contract is not honoured')
    else if (!fpMatches) fail('contract fingerprint does not match the embedded contractValidation fingerprint')
  } else if (snapOk) {
    fail('contract block missing')
  }

  // activation state — reported UNCHANGED; the Intelligence layer must never carry an active flag -----------
  const hasActivation = snapOk && Object.prototype.hasOwnProperty.call(snapshot, 'activationGranted')
  const activationState = {
    present: hasActivation,
    activationGranted: hasActivation ? snapshot.activationGranted : null,
  }
  if (hasActivation && snapshot.activationGranted !== false) {
    fail('snapshot carries an active activationGranted flag (forbidden in the Intelligence layer)')
  }

  // data note (not an integrity failure)
  if (snapOk && snapshot.usable === false) warn('snapshot sealed an empty/unusable source profile')

  const draft = {
    type: 'coach-dna-intelligence-snapshot-validation',
    schemaVersion: 1,
    validates: 'M257',
    valid: errors.length === 0,
    snapshotFingerprint,
    provenanceVerified,
    contractVerified,
    profileFingerprintVerified,
    activationState,
    validationErrors: errors,
    validationWarnings: warnings,
    validationMetadata: {
      milestone: MILESTONE,
      validates: 'M257',
      deterministic: true,
      llmGenerated: false,
      readOnly: true,
      dormant: true,
    },
  }

  draft.validationFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the snapshot validation.
 * @param {object} snapshot an M257 intelligence snapshot
 * @returns {string}
 */
export function summarizeCoachDnaIntelligenceSnapshotValidation(snapshot) {
  const v = validateCoachDnaIntelligenceSnapshot(snapshot)
  return [
    `Coach DNA intelligence snapshot validation: ${v.valid ? 'VALID' : 'INVALID'}`,
    `Provenance verified: ${v.provenanceVerified}`,
    `Contract verified: ${v.contractVerified}`,
    `Profile fingerprint verified: ${v.profileFingerprintVerified}`,
    `Snapshot fingerprint: ${v.snapshotFingerprint}`,
    ...(v.validationErrors.length ? ['Errors:', ...v.validationErrors.map((e) => `  - ${e}`)] : []),
    ...(v.validationWarnings.length ? ['Warnings:', ...v.validationWarnings.map((w) => `  - ${w}`)] : []),
    `Validation fingerprint: ${v.validationFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the snapshot validation deterministically.
 * @param {object} snapshot an M257 intelligence snapshot
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaIntelligenceSnapshotValidation(snapshot, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const v = validateCoachDnaIntelligenceSnapshot(snapshot)
  if (format === 'json') return canonicalStringify(v)
  if (format === 'line') {
    return `coach-dna-intelligence-snapshot-validation valid=${v.valid} provenance=${v.provenanceVerified} `
      + `contract=${v.contractVerified} profileFp=${v.profileFingerprintVerified} `
      + `snapshotFp=${v.snapshotFingerprint} fp=${v.validationFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA intelligence snapshot validation format '${format}'`)
}
