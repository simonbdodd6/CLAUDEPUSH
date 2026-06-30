/**
 * web/brain-coach-dna-intelligence-snapshot.js - Coach DNA Intelligence Snapshot (M257, DORMANT)
 *
 * The portable, self-contained record of a coach's intelligence state. Where M255 gives live read access and
 * M256 guarantees a surface honours the consumer contract, this module SEALS the whole intelligence state into
 * one immutable, fingerprinted Snapshot that a downstream Brain subsystem can hold, cache, diff or hand off —
 * without re-walking the profile/index or re-running the query surface.
 *
 * It is NOT a new intelligence layer. It derives no new intelligence, predicts nothing and recommends nothing:
 * it assembles values already produced by M253/M254 (via the M255 surface) and embeds them, each with the
 * fingerprint that proves the source is unaltered. It also embeds the M256 consumer-contract verdict, so a
 * snapshot self-certifies it came from a contract-honouring surface, and carries the full M230-M257 provenance
 * chain.
 *
 * Pure function. It reuses ONLY the M254 index builder, the M255 query surface and the M256 validator (building
 * them on demand from a profile), mutates no input, performs no writes, makes no recommendation, calls no
 * AI/LLM, and uses no DOM/network/storage/env/database/clock/randomness. It touches no engine, prior milestone,
 * index.html, runtime, or API. Same input → same snapshot, byte for byte.
 */

import { buildCoachDnaIntelligenceIndex } from './brain-coach-dna-intelligence-index.js'        // M254
import { createCoachDnaIntelligenceQuery } from './brain-coach-dna-intelligence-query.js'       // M255
import { validateCoachDnaIntelligenceConsumer } from './brain-coach-dna-intelligence-consumer-contract.js' // M256

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
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

const SNAPSHOT_VERSION = 1
const MILESTONE = 'M257'
const PROVENANCE_CHAIN = Object.freeze(['M230', 'M252', 'M253', 'M254', 'M255', 'M256', 'M257'])

const fpOrNull = (obj, field) => (isObj(obj) && typeof obj[field] === 'string' ? obj[field] : null)

/**
 * Build the deterministic, sealed Coach DNA intelligence snapshot.
 *
 * @param {object} profile an M253 intelligence profile (the canonical input)
 * @returns {object} frozen snapshot; `usable` is false for malformed/invalid input but the contract still holds.
 */
export function buildCoachDnaIntelligenceSnapshot(profile) {
  const profileOk = isObj(profile) && profile.type === 'coach-dna-intelligence-profile'

  // Rebuild the read-stack on demand from the profile, then seal what it produces.
  const index = buildCoachDnaIntelligenceIndex(profile)
  const surface = createCoachDnaIntelligenceQuery(profile)
  const contractValidation = validateCoachDnaIntelligenceConsumer(surface)

  const usable = isObj(index.validationState) && index.validationState.profileUsable === true

  const profileFingerprint = fpOrNull(profile, 'profileFingerprint')
  const intelligenceInputsFingerprint = fpOrNull(profile, 'intelligenceInputsFingerprint')
  const indexFingerprint = fpOrNull(index, 'indexFingerprint')
  const contractFingerprint = fpOrNull(contractValidation, 'validationFingerprint')

  // Sealed deterministic views, copied from the query surface (which copies from M253/M254). No new derivation.
  const coverage = surface.getCoverage()
  const confidence = surface.getConfidence()
  const evidence = surface.getEvidence()
  const presentCategories = surface.listPresentCategories()

  const navigation = {
    presentCategories,
    categoryIndex: isObj(index.categoryIndex) ? index.categoryIndex : {},
    signalIndex: isObj(index.signalIndex) ? index.signalIndex : {},
  }

  // Self-certification: this snapshot was produced from a surface that honours the M256 consumer contract.
  const contract = {
    honoured: contractValidation.valid === true,
    surfaceUsable: contractValidation.surfaceUsable === true,
    failedChecks: typeof contractValidation.failedChecks === 'number' ? contractValidation.failedChecks : null,
    fingerprint: contractFingerprint,
  }

  const origin = isObj(index.provenanceIndex) && isObj(index.provenanceIndex.origin) ? index.provenanceIndex.origin : null
  const provenance = {
    chain: PROVENANCE_CHAIN,
    profileFingerprint,
    intelligenceInputsFingerprint,
    indexFingerprint,
    origin: origin ? {
      sourceMilestone: strOrNull(origin.sourceMilestone),
      profileVersion: strOrNull(origin.profileVersion),
      sourceConfidenceLevel: strOrNull(origin.sourceConfidenceLevel),
    } : null,
  }

  const issues = []
  if (!profileOk) issues.push('intelligence profile missing or malformed')
  else if (!usable) issues.push('intelligence profile not usable (source inputs were invalid)')
  if (!contract.honoured) issues.push('source surface did not honour the consumer contract')
  const validationState = {
    profileRecognized: profileOk,
    profileUsable: usable,
    contractHonoured: contract.honoured,
    issues,
  }

  const derivationMetadata = {
    milestone: MILESTONE,
    sealsFrom: 'coach-dna-intelligence-profile',
    sourceMilestone: 'M253',
    uses: ['M254', 'M255', 'M256'],
    deterministic: true,
    llmGenerated: false,
    readOnly: true,
    dormant: true,
  }

  const draft = {
    type: 'coach-dna-intelligence-snapshot',
    schemaVersion: 1,
    snapshotVersion: SNAPSHOT_VERSION,
    milestone: MILESTONE,
    mode: 'dormant',
    usable,
    fingerprints: {
      profile: profileFingerprint,
      intelligenceInputs: intelligenceInputsFingerprint,
      index: indexFingerprint,
      contractValidation: contractFingerprint,
    },
    coverage,
    confidence,
    evidence,
    navigation,
    contract,
    provenance,
    validationState,
    derivationMetadata,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this snapshot.
  draft.snapshotFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the snapshot for logs or PR notes.
 * @param {object} profile an M253 intelligence profile
 * @returns {string}
 */
export function summarizeCoachDnaIntelligenceSnapshot(profile) {
  const s = buildCoachDnaIntelligenceSnapshot(profile)
  return [
    `Coach DNA intelligence snapshot: ${s.usable ? 'sealed' : 'sealed (empty source)'}`,
    `Contract honoured: ${s.contract.honoured}`,
    `Coverage: ${s.coverage.categoriesCovered ?? 0}/${s.coverage.categoriesPossible ?? 0}`,
    `Confidence: ${s.confidence.level ?? 'LOW'}`,
    `Profile fp: ${s.fingerprints.profile}`,
    `Snapshot fp: ${s.snapshotFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the snapshot deterministically.
 * @param {object} profile an M253 intelligence profile
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaIntelligenceSnapshot(profile, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const s = buildCoachDnaIntelligenceSnapshot(profile)
  if (format === 'json') return canonicalStringify(s)
  if (format === 'line') {
    return `coach-dna-intelligence-snapshot usable=${s.usable} contractHonoured=${s.contract.honoured} `
      + `coverage=${s.coverage.categoriesCovered ?? 0}/${s.coverage.categoriesPossible ?? 0} `
      + `confidence=${s.confidence.level ?? 'LOW'} profileFp=${s.fingerprints.profile} fp=${s.snapshotFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA intelligence snapshot format '${format}'`)
}
