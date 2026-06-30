/**
 * web/brain-coach-dna-selection-intelligence-profile.js - Coach DNA Selection Intelligence Profile (M262, DORMANT)
 *
 * The stable assembled object for the selection domain. Where M261 exposes the five raw selection lenses, this
 * module folds them into one immutable Selection Intelligence Profile that future selection modules can consume
 * through a single interface.
 *
 * It is critically NOT player selection: it contains NO player data, performs NO player scoring, NO player
 * ranking and makes NO recommendation. Every field is a deterministic aggregation or projection of values
 * already present in the M261 inputs — the lens summary is an inventory of the coach's own tendency signals,
 * never a judgement about players. The lens list is kept in a fixed order (never sorted by strength) so nothing
 * is implicitly ranked.
 *
 * Pure function. It reuses ONLY the M261 inputs shape, mutates no input, performs no writes, makes no
 * recommendation, calls no AI/LLM, and uses no DOM/network/storage/env/database/clock/randomness. Same input →
 * same profile, byte for byte.
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

// The five M261 selection-lens fields, fixed order so aggregation and fingerprints are deterministic.
const LENS_FIELDS = Object.freeze(['selectionSignals', 'playerTrustSignals', 'continuitySignals', 'rotationSignals', 'availabilitySignals'])

// Read one selection lens from the M261 inputs, defaulting to an empty/absent lens when missing or malformed.
function readLens(inputs, field) {
  const l = isObj(inputs) && isObj(inputs[field]) ? inputs[field] : null
  return {
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

/**
 * Build the deterministic Coach DNA selection intelligence profile from an M261 selection inputs object.
 *
 * @param {object} inputs an M261 selection intelligence inputs object
 * @returns {object} frozen selection profile; validationState.usable is false for malformed/invalid input.
 */
export function buildCoachDnaSelectionIntelligenceProfile(inputs) {
  const inputsOk = isObj(inputs) && inputs.type === 'coach-dna-selection-intelligence-inputs'
  const inputsValid = inputsOk && inputs.valid === true
  const usable = inputsValid

  // Lenses kept in FIXED order — never sorted — so nothing is implicitly ranked.
  const lenses = LENS_FIELDS.map((field) => readLens(inputs, field))
  const present = lenses.filter((l) => l.present)
  const dominant = lenses.filter((l) => l.isDominant)
  const strongest = lenses.find((l) => l.isStrongest) || null
  const weakest = lenses.find((l) => l.isWeakest) || null

  const selectionLensSummary = {
    totalLenses: lenses.length,
    presentLenses: present.length,
    dominantLenses: dominant.length,
    totalOccurrences: lenses.reduce((a, l) => a + l.occurrences, 0),
    totalSupporting: lenses.reduce((a, l) => a + l.supportingCount, 0),
    strongestLens: strongest ? strongest.lens : null,
    strongestSourceCategory: strongest ? strongest.sourceCategory : null,
    weakestLens: weakest ? weakest.lens : null,
    weakestSourceCategory: weakest ? weakest.sourceCategory : null,
    lenses,
  }

  const ec = inputsOk && isObj(inputs.evidenceCoverage) ? inputs.evidenceCoverage : {}
  const byLens = isObj(ec.byLens) ? ec.byLens : {}
  const evidenceCoverage = {
    totalMemories: numOr0(ec.totalMemories),
    uniqueTypes: numOr0(ec.uniqueTypes),
    totalEvidence: numOr0(ec.totalEvidence),
    totalOntologyLinks: numOr0(ec.totalOntologyLinks),
    byLens: LENS_FIELDS.reduce((acc, field) => {
      const e = isObj(byLens[field]) ? byLens[field] : {}
      acc[field] = {
        present: e.present === true,
        occurrences: numOr0(e.occurrences),
        supportingCount: numOr0(e.supportingCount),
        themeCount: numOr0(e.themeCount),
      }
      return acc
    }, {}),
  }

  const cf = inputsOk && isObj(inputs.confidenceSummary) ? inputs.confidenceSummary : {}
  const confidenceSummary = {
    level: strOrNull(cf.level) || 'LOW',
    value: numOr0(cf.value),
    high: cf.high === true,
    low: cf.low === true || !usable,
  }

  const selectionInputsFingerprint = inputsOk && typeof inputs.selectionInputsFingerprint === 'string'
    ? inputs.selectionInputsFingerprint
    : null

  // Preserve the provenance chain: this profile ← M261 inputs ← (origin) M255 surface ← ... ← M230 view.
  const inProv = inputsOk && isObj(inputs.provenance) ? inputs.provenance : null
  const provenance = {
    source: 'coach-dna-selection-intelligence-inputs',
    sourceMilestone: 'M261',
    selectionInputsFingerprint,
    recognizable: inputsOk,
    origin: inProv ? {
      source: strOrNull(inProv.source),
      sourceMilestone: strOrNull(inProv.sourceMilestone),
      chain: Array.isArray(inProv.chain) ? [...inProv.chain] : null,
      profileFingerprint: strOrNull(inProv.profileFingerprint),
    } : null,
  }

  const issues = []
  if (!inputsOk) issues.push('selection inputs missing or malformed')
  else if (!inputsValid) issues.push('selection inputs marked invalid (unusable source surface)')
  const validationState = {
    inputsRecognized: inputsOk,
    inputsValid,
    usable,
    issues,
  }

  const derivationMetadata = {
    milestone: 'M262',
    domain: 'selection',
    derivedFrom: 'coach-dna-selection-intelligence-inputs',
    sourceMilestone: 'M261',
    deterministic: true,
    llmGenerated: false,
    readOnly: true,
    dormant: true,
    containsPlayerData: false,
    playerScoring: false,
    playerRanking: false,
    playerRecommendation: false,
  }

  const draft = {
    type: 'coach-dna-selection-intelligence-profile',
    schemaVersion: 1,
    profileVersion: 'selection-intelligence-profile-v1',
    selectionInputsFingerprint,
    selectionLensSummary,
    evidenceCoverage,
    confidenceSummary,
    provenance,
    validationState,
    derivationMetadata,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this profile.
  draft.profileFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the selection profile for logs or PR notes.
 * @param {object} inputs an M261 selection intelligence inputs object
 * @returns {string}
 */
export function summarizeCoachDnaSelectionIntelligenceProfile(inputs) {
  const p = buildCoachDnaSelectionIntelligenceProfile(inputs)
  return [
    `Coach DNA selection intelligence profile: ${p.validationState.usable ? 'usable' : 'unusable source'}`,
    `Lenses: ${p.selectionLensSummary.presentLenses}/${p.selectionLensSummary.totalLenses} present, ${p.selectionLensSummary.dominantLenses} dominant`,
    `Confidence: ${p.confidenceSummary.level}`,
    `Fingerprint: ${p.profileFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the selection profile deterministically.
 * @param {object} inputs an M261 selection intelligence inputs object
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaSelectionIntelligenceProfile(inputs, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const p = buildCoachDnaSelectionIntelligenceProfile(inputs)
  if (format === 'json') return canonicalStringify(p)
  if (format === 'line') {
    return `coach-dna-selection-intelligence-profile usable=${p.validationState.usable} `
      + `lenses=${p.selectionLensSummary.presentLenses}/${p.selectionLensSummary.totalLenses} `
      + `confidence=${p.confidenceSummary.level} fp=${p.profileFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA selection intelligence profile format '${format}'`)
}
