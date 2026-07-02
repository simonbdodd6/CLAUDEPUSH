/**
 * web/brain-coach-dna-training-intelligence-index.js - Coach DNA Training Intelligence Index (M271, DORMANT)
 *
 * The stable navigation layer for the training domain — the training-domain analogue of the M254 core index
 * and the M263 selection index. Where M270 produces the complete Training Intelligence Profile, this module
 * turns it into keyed lookup surfaces (by lens, by evidence, by confidence, by provenance) so future training
 * consumers can query a single lens in O(1) without walking the profile or depending on its internal structure.
 *
 * It is critically NOT a training engine: it does NOT analyse sessions, does NOT evaluate players, does NOT
 * generate training content and makes NO recommendation. It contains NO player data. Every index entry is a
 * deterministic re-keying or projection of values already present in the M270 profile. The lens index is keyed
 * and total — every expected training lens always exists (present or absent) so downstream consumers never
 * need existence checks. Nothing is ordered or scored; unknown remains unknown.
 *
 * Pure function. It reuses ONLY the M270 profile shape, mutates no input, performs no writes, makes no
 * recommendation, calls no AI/LLM, and uses no DOM/network/storage/env/database/clock/randomness. Same input →
 * same index, byte for byte.
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

// The six training lenses, fixed order — total and deterministic.
const LENS_FIELDS = Object.freeze(['planningSignals', 'sessionStructureSignals', 'developmentSignals', 'technicalSignals', 'tacticalSignals', 'feedbackSignals'])
// The full training-domain provenance lineage this index attests to.
const PROVENANCE_CHAIN = Object.freeze(['M230', 'M252', 'M253', 'M254', 'M255', 'M269', 'M270', 'M271'])

/**
 * Build the deterministic Coach DNA training intelligence index from an M270 training profile.
 *
 * @param {object} profile an M270 training intelligence profile
 * @returns {object} frozen training index; validationState.profileUsable is false for malformed/invalid input.
 */
export function buildCoachDnaTrainingIntelligenceIndex(profile) {
  const profileOk = isObj(profile) && profile.type === 'coach-dna-training-intelligence-profile'
  const profileUsable = profileOk && isObj(profile.validationState) && profile.validationState.usable === true

  const summary = profileOk && isObj(profile.trainingLensSummary) ? profile.trainingLensSummary : {}
  const lensArray = Array.isArray(summary.lenses) ? summary.lenses.filter(isObj) : []
  const lensByName = (name) => lensArray.find((l) => l.lens === name) || null

  // trainingLensIndex: O(1) lookup keyed by lens name. Every one of the six lenses is keyed (absent ones
  // default to an empty entry) so the index is total and stable. No ordering, no scoring.
  const trainingLensIndex = {}
  for (const field of LENS_FIELDS) {
    const l = lensByName(field)
    trainingLensIndex[field] = {
      lens: field,
      sourceCategory: l ? strOrNull(l.sourceCategory) : null,
      label: l ? strOrNull(l.label) : null,
      present: l ? l.present === true : false,
      isDominant: l ? l.isDominant === true : false,
      occurrences: l ? numOr0(l.occurrences) : 0,
      strength: l ? numOr0(l.strength) : 0,
      supportingCount: l ? numOr0(l.supportingCount) : 0,   // count only — never the raw ids
      themeCount: l ? numOr0(l.themeCount) : 0,
      averageConfidence: l ? numOr0(l.averageConfidence) : 0,
      averageWeight: l ? numOr0(l.averageWeight) : 0,
      isStrongest: l ? l.isStrongest === true : false,
      isWeakest: l ? l.isWeakest === true : false,
    }
  }

  const ec = profileOk && isObj(profile.evidenceCoverage) ? profile.evidenceCoverage : {}
  const ecByLens = isObj(ec.byLens) ? ec.byLens : {}
  const evidenceIndex = {
    totalMemories: numOr0(ec.totalMemories),
    uniqueTypes: numOr0(ec.uniqueTypes),
    totalEvidence: numOr0(ec.totalEvidence),
    totalOntologyLinks: numOr0(ec.totalOntologyLinks),
    byLens: LENS_FIELDS.reduce((acc, field) => {
      const e = isObj(ecByLens[field]) ? ecByLens[field] : {}
      acc[field] = {
        present: e.present === true,
        occurrences: numOr0(e.occurrences),
        supportingCount: numOr0(e.supportingCount),
        themeCount: numOr0(e.themeCount),
      }
      return acc
    }, {}),
  }

  const cf = profileOk && isObj(profile.confidenceSummary) ? profile.confidenceSummary : {}
  const confidenceIndex = {
    level: strOrNull(cf.level) || 'LOW',
    value: numOr0(cf.value),
    high: cf.high === true,
    low: cf.low === true,
    byLens: LENS_FIELDS.reduce((acc, field) => {
      acc[field] = { present: trainingLensIndex[field].present, averageConfidence: trainingLensIndex[field].averageConfidence }
      return acc
    }, {}),
  }

  const profileFingerprint = profileOk && typeof profile.profileFingerprint === 'string' ? profile.profileFingerprint : null
  const trainingInputsFingerprint = profileOk && typeof profile.trainingInputsFingerprint === 'string' ? profile.trainingInputsFingerprint : null
  const origin = profileOk && isObj(profile.provenance) && isObj(profile.provenance.origin) ? profile.provenance.origin : null

  const provenanceIndex = {
    chain: PROVENANCE_CHAIN,
    profileFingerprint,
    trainingInputsFingerprint,
    origin: origin ? {
      source: strOrNull(origin.source),
      sourceMilestone: strOrNull(origin.sourceMilestone),
      chain: Array.isArray(origin.chain) ? [...origin.chain] : null,
      profileFingerprint: strOrNull(origin.profileFingerprint),
    } : null,
    byMilestone: {
      M269: { milestone: 'M269', role: 'training-intelligence-inputs', fingerprint: trainingInputsFingerprint },
      M270: { milestone: 'M270', role: 'training-intelligence-profile', fingerprint: profileFingerprint },
    },
  }

  const presentLenses = LENS_FIELDS.filter((f) => trainingLensIndex[f].present).length
  const dominantLenses = LENS_FIELDS.filter((f) => trainingLensIndex[f].isDominant).length

  const issues = []
  if (!profileOk) issues.push('training profile missing or malformed')
  else if (!profileUsable) issues.push('training profile not usable (source inputs were invalid)')
  const validationState = {
    profileRecognized: profileOk,
    profileUsable,
    presentLenses,
    dominantLenses,
    totalLenses: LENS_FIELDS.length,
    issues,
  }

  const derivationMetadata = {
    milestone: 'M271',
    domain: 'training',
    derivedFrom: 'coach-dna-training-intelligence-profile',
    sourceMilestone: 'M270',
    deterministic: true,
    llmGenerated: false,
    readOnly: true,
    dormant: true,
    containsPlayerData: false,
    playerEvaluation: false,
    trainingRecommendation: false,
    generatesTrainingContent: false,
    analysesSessions: false,
  }

  const draft = {
    type: 'coach-dna-training-intelligence-index',
    schemaVersion: 1,
    indexVersion: 1,
    profileFingerprint,
    trainingLensIndex,
    evidenceIndex,
    confidenceIndex,
    provenanceIndex,
    validationState,
    derivationMetadata,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this index.
  draft.indexFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the training index for logs or PR notes.
 * @param {object} profile an M270 training intelligence profile
 * @returns {string}
 */
export function summarizeCoachDnaTrainingIntelligenceIndex(profile) {
  const x = buildCoachDnaTrainingIntelligenceIndex(profile)
  return [
    `Coach DNA training intelligence index: ${x.validationState.profileUsable ? 'queryable' : 'unusable source'}`,
    `Lenses indexed: ${Object.keys(x.trainingLensIndex).length}`,
    `Present: ${x.validationState.presentLenses}/${x.validationState.totalLenses}`,
    `Confidence: ${x.confidenceIndex.level}`,
    `Fingerprint: ${x.indexFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the training index deterministically.
 * @param {object} profile an M270 training intelligence profile
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaTrainingIntelligenceIndex(profile, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const x = buildCoachDnaTrainingIntelligenceIndex(profile)
  if (format === 'json') return canonicalStringify(x)
  if (format === 'line') {
    return `coach-dna-training-intelligence-index usable=${x.validationState.profileUsable} `
      + `present=${x.validationState.presentLenses}/${x.validationState.totalLenses} `
      + `confidence=${x.confidenceIndex.level} fp=${x.indexFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA training intelligence index format '${format}'`)
}
