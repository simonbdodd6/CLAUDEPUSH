/**
 * web/brain-coach-dna-intelligence-inputs.js - Coach DNA Intelligence Inputs (M252, DORMANT)
 *
 * The first module of the Coach's Eye Intelligence subsystem. Where M230-M251 PUBLISH a Coach DNA profile,
 * this module DERIVES from one: it reads an existing M230 `coachView` and extracts a stable, machine-readable
 * Intelligence Inputs object that future Brain systems (Match Intelligence, Season Memory, Coach Evolution,
 * Selection Intelligence, ...) can consume without re-parsing the view.
 *
 * It is NOT an inference engine. It invents nothing, predicts nothing and recommends nothing — every field is
 * a deterministic projection of values already present in the coachView. Each of the eight Coach Memory
 * categories is mapped to a named signal group (style/communication/training/player-development/selection/
 * tactical/planning/risk), carrying only the view's already-public aggregates (occurrences, strength, theme
 * count, averaged confidence/weight, and a supporting COUNT — never raw ids). It adds evidence-coverage
 * statistics, deterministic confidence flags copied from the view, derivation metadata, and provenance back to
 * the source profile.
 *
 * Pure function. It reuses ONLY the M230 view shape, mutates no input, performs no writes, makes no
 * recommendation, calls no AI/LLM, and uses no DOM/network/storage/env/database/clock/randomness. It touches
 * no engine, prior milestone, index.html, runtime, or API. Same input → same inputs object, byte for byte.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const numOr0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const strOrNull = (v) => (typeof v === 'string' && v.length > 0 ? v : null)
const arr = (v) => (Array.isArray(v) ? v : [])

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

// Human labels for the coaching dimensions — mirrors the M230 CATEGORY_LABEL so labels stay consistent.
const CATEGORY_LABEL = Object.freeze({
  'philosophy': 'Philosophy',
  'selection-preference': 'Selection',
  'training-preference': 'Training',
  'tactical-preference': 'Tactics',
  'player-management': 'Player management',
  'communication-style': 'Communication',
  'risk-warning': 'Risk warnings',
  'learned-pattern': 'Learned patterns',
})
const labelFor = (category) => (typeof category === 'string' ? (CATEGORY_LABEL[category] || category) : null)

// Each named signal group maps to exactly one Coach Memory category — a 1:1, total cover of all eight
// COACH_MEMORY_TYPES. Order is fixed so derivation and fingerprints are deterministic.
const SIGNAL_GROUPS = Object.freeze([
  { field: 'coachingStyleSignals', category: 'philosophy' },
  { field: 'communicationSignals', category: 'communication-style' },
  { field: 'trainingSignals', category: 'training-preference' },
  { field: 'playerDevelopmentSignals', category: 'player-management' },
  { field: 'selectionSignals', category: 'selection-preference' },
  { field: 'tacticalSignals', category: 'tactical-preference' },
  { field: 'planningSignals', category: 'learned-pattern' },
  { field: 'riskSignals', category: 'risk-warning' },
])
const CATEGORIES_POSSIBLE = SIGNAL_GROUPS.length

// Derive a single signal group from the view's dominantSignals + themes + identity. Pure projection — every
// value already exists in the coachView; nothing is computed beyond selecting and copying it.
function deriveSignalGroup(view, category) {
  const dom = arr(view.dominantSignals).filter(isObj).find((s) => s.category === category) || null
  const theme = arr(view.themes).filter(isObj).find((t) => t.type === category) || null
  const identity = isObj(view.identity) ? view.identity : {}
  return {
    category,
    label: labelFor(category),
    present: dom !== null || theme !== null,
    isDominant: dom !== null,
    occurrences: dom ? numOr0(dom.occurrences) : 0,
    strength: dom ? numOr0(dom.strength) : 0,
    supportingCount: dom ? numOr0(dom.supportingCount) : 0,    // count only — never the raw ids
    themeCount: theme ? numOr0(theme.count) : 0,
    averageConfidence: dom ? numOr0(dom.averageConfidence) : (theme ? numOr0(theme.averageConfidence) : 0),
    averageWeight: dom ? numOr0(dom.averageWeight) : (theme ? numOr0(theme.averageWeight) : 0),
    isStrongest: identity.strongestCategory === category,
    isWeakest: identity.weakestCategory === category,
  }
}

// A coachView is recognizable when it carries at least one of its structural fields. This separates a real
// (possibly empty) profile from arbitrary malformed input.
const isRecognizableView = (v) => isObj(v) && (
  isObj(v.identity) || isObj(v.knowledge) || isObj(v.confidence)
  || Array.isArray(v.dominantSignals) || Array.isArray(v.themes)
)

/**
 * Build the deterministic Coach DNA intelligence inputs object from an M230 coachView.
 *
 * @param {object} profile an M230 `coachView` (the output of buildCoachDnaCoachView)
 * @returns {object} frozen intelligence inputs; `valid` is false for unrecognizable/malformed input.
 */
export function buildCoachDnaIntelligenceInputs(profile) {
  const recognizable = isRecognizableView(profile)
  const view = isObj(profile) ? profile : {}
  const confidence = isObj(view.confidence) ? view.confidence : {}
  const identity = isObj(view.identity) ? view.identity : {}
  const knowledge = isObj(view.knowledge) ? view.knowledge : {}
  const metadata = isObj(view.metadata) ? view.metadata : {}

  // Eight named signal groups — total, 1:1 cover of the Coach Memory categories.
  const groups = {}
  for (const { field, category } of SIGNAL_GROUPS) groups[field] = deriveSignalGroup(view, category)
  const categoriesCovered = SIGNAL_GROUPS.filter(({ field }) => groups[field].present).length

  const totalMemories = numOr0(knowledge.totalMemories)

  const evidenceCoverage = {
    totalMemories,
    uniqueTypes: numOr0(knowledge.uniqueTypes),
    totalEvidence: numOr0(knowledge.totalEvidence),
    totalOntologyLinks: numOr0(knowledge.totalOntologyLinks),
    averageConfidence: numOr0(knowledge.averageConfidence),
    averageWeight: numOr0(knowledge.averageWeight),
    categoriesCovered,
    categoriesPossible: CATEGORIES_POSSIBLE,
    coverageRatio: CATEGORIES_POSSIBLE ? categoriesCovered / CATEGORIES_POSSIBLE : 0,
  }

  // Confidence flags are copied/derived directly from the view's already-computed fields — no new thresholds.
  const confidenceFlags = {
    confidenceLevel: strOrNull(confidence.level) || 'LOW',
    confidenceValue: numOr0(confidence.value),
    highConfidence: confidence.level === 'HIGH',
    lowConfidence: confidence.level === 'LOW' || !recognizable,
    diversityLabel: strOrNull(identity.diversityLabel),
    narrowSpread: identity.diversityLabel === 'Narrow',
    empty: totalMemories === 0,
    llmGenerated: metadata.llmGenerated === true,
    deterministicSource: metadata.deterministic === true,
    explainableSource: metadata.explainable === true,
  }

  const derivationMetadata = {
    milestone: 'M252',
    derivedFrom: 'coach-dna-coach-view',
    sourceMilestone: 'M230',
    deterministic: true,
    llmGenerated: false,
    readOnly: true,
    dormant: true,
    categoriesPossible: CATEGORIES_POSSIBLE,
  }

  const provenance = {
    source: 'coach-dna-coach-view',
    sourceMilestone: 'M230',
    recognizable,
    profileVersion: strOrNull(view.profileVersion),
    sourceConfidenceLevel: strOrNull(confidence.level),
    sourceHeadline: strOrNull(view.headline),
  }

  const draft = {
    type: 'coach-dna-intelligence-inputs',
    schemaVersion: 1,
    inputsVersion: 1,
    valid: recognizable,
    ...groups,
    evidenceCoverage,
    confidenceFlags,
    derivationMetadata,
    provenance,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for these inputs.
  draft.inputsFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the intelligence inputs for logs or PR notes.
 * @param {object} profile an M230 coachView
 * @returns {string}
 */
export function summarizeCoachDnaIntelligenceInputs(profile) {
  const i = buildCoachDnaIntelligenceInputs(profile)
  const present = SIGNAL_GROUPS.filter(({ field }) => i[field].present).map(({ field }) => i[field].label)
  return [
    `Coach DNA intelligence inputs: ${i.valid ? 'derived' : 'unrecognized source'}`,
    `Coverage: ${i.evidenceCoverage.categoriesCovered}/${i.evidenceCoverage.categoriesPossible} categories`,
    `Confidence: ${i.confidenceFlags.confidenceLevel}`,
    `Present signals: ${present.length ? present.join(', ') : 'none'}`,
    `Fingerprint: ${i.inputsFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the intelligence inputs deterministically.
 * @param {object} profile an M230 coachView
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaIntelligenceInputs(profile, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const i = buildCoachDnaIntelligenceInputs(profile)
  if (format === 'json') return canonicalStringify(i)
  if (format === 'line') {
    return `coach-dna-intelligence-inputs valid=${i.valid} coverage=${i.evidenceCoverage.categoriesCovered}/${i.evidenceCoverage.categoriesPossible} `
      + `confidence=${i.confidenceFlags.confidenceLevel} fp=${i.inputsFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA intelligence inputs format '${format}'`)
}
