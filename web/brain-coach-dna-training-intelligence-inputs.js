/**
 * web/brain-coach-dna-training-intelligence-inputs.js - Coach DNA Training Intelligence Inputs (M269, DORMANT)
 *
 * The first module of the SECOND deterministic reasoning domain — training. It mirrors the proven Selection
 * Intelligence architecture (M261): it reads the M255 core query surface and projects the coach's existing DNA
 * signals into the lenses a future TRAINING reasoning system would consume (planning, session structure,
 * development, technical, tactical, feedback).
 *
 * It is critically NOT a training engine. It does NOT analyse sessions, does NOT evaluate players, does NOT
 * generate training plans or content, and makes NO recommendation. It contains NO player data. Each "training
 * lens" is a deterministic re-view of one existing Coach DNA category, carrying only that category's already-
 * public aggregates (a supporting COUNT, never ids). Where the Coach DNA carries nothing for a lens, the lens
 * is simply not present — nothing is invented or inferred.
 *
 * Pure function. It reuses ONLY the M255 surface (building one on demand from a profile/index), mutates no
 * input, performs no writes, makes no recommendation, calls no AI/LLM, and uses no DOM/network/storage/env/
 * database/clock/randomness. Same input → same inputs object, byte for byte.
 */

import { createCoachDnaIntelligenceQuery } from './brain-coach-dna-intelligence-query.js' // M255

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

// Each training lens is a deterministic re-view of one existing Coach DNA category, chosen as most relevant to
// that training concern. The data is 100% the source category's; the lens only renames/frames it. Fixed order
// so the projection and fingerprint are deterministic. (Some lenses share a source — e.g. session-structure and
// technical both reflect the coach's training-preference DNA, viewed differently — which is declared honestly.)
const TRAINING_LENSES = Object.freeze([
  { field: 'planningSignals', sourceCategory: 'learned-pattern', relevance: 'learned patterns that inform training planning' },
  { field: 'sessionStructureSignals', sourceCategory: 'training-preference', relevance: 'the coach\'s training preferences (session structure)' },
  { field: 'developmentSignals', sourceCategory: 'player-management', relevance: 'the coach\'s player-development emphasis' },
  { field: 'technicalSignals', sourceCategory: 'training-preference', relevance: 'training preferences viewed through a technical lens' },
  { field: 'tacticalSignals', sourceCategory: 'tactical-preference', relevance: 'tactical preferences relevant to training' },
  { field: 'feedbackSignals', sourceCategory: 'communication-style', relevance: 'communication style relevant to training feedback' },
])

function resolveSurface(input) {
  if (isObj(input) && typeof input.getSignalGroup === 'function' && typeof input.getProvenance === 'function') return input
  return createCoachDnaIntelligenceQuery(input)
}

// Build one training lens from the surface's existing category view. Pure projection — no derivation.
function readLens(surface, field, sourceCategory) {
  const g = typeof surface.getSignalGroup === 'function' ? surface.getSignalGroup(sourceCategory) : null
  const c = typeof surface.getCategory === 'function' ? surface.getCategory(sourceCategory) : null
  const ok = isObj(g)
  return {
    lens: field,
    sourceCategory,
    label: (ok && strOrNull(g.label)) || labelFor(sourceCategory),
    present: ok ? g.present === true : false,
    isDominant: ok ? g.isDominant === true : false,
    occurrences: ok ? numOr0(g.occurrences) : 0,
    strength: ok ? numOr0(g.strength) : 0,
    supportingCount: ok ? numOr0(g.supportingCount) : 0,   // count only — never the raw ids
    themeCount: ok ? numOr0(g.themeCount) : 0,
    averageConfidence: ok ? numOr0(g.averageConfidence) : 0,
    averageWeight: ok ? numOr0(g.averageWeight) : 0,
    isStrongest: isObj(c) ? c.isStrongest === true : false,
    isWeakest: isObj(c) ? c.isWeakest === true : false,
  }
}

/**
 * Build the deterministic Coach DNA training intelligence inputs from an M255 query surface.
 *
 * @param {object} input an M255 query surface (or an M253 profile / M254 index that yields one)
 * @returns {object} frozen training inputs; `valid` is false when the source is unusable.
 */
export function buildCoachDnaTrainingIntelligenceInputs(input) {
  const surface = resolveSurface(input)
  const valid = typeof surface.isUsable === 'function' ? surface.isUsable() === true : false

  const lenses = {}
  for (const { field, sourceCategory } of TRAINING_LENSES) lenses[field] = readLens(surface, field, sourceCategory)

  const ev = typeof surface.getEvidence === 'function' && isObj(surface.getEvidence()) ? surface.getEvidence() : {}
  const evByCategory = isObj(ev.byCategory) ? ev.byCategory : {}
  const byLens = {}
  for (const { field, sourceCategory } of TRAINING_LENSES) {
    const e = isObj(evByCategory[sourceCategory]) ? evByCategory[sourceCategory] : {}
    byLens[field] = {
      present: e.present === true,
      occurrences: numOr0(e.occurrences),
      supportingCount: numOr0(e.supportingCount),
      themeCount: numOr0(e.themeCount),
    }
  }
  const evidenceCoverage = {
    totalMemories: numOr0(ev.totalMemories),
    uniqueTypes: numOr0(ev.uniqueTypes),
    totalEvidence: numOr0(ev.totalEvidence),
    totalOntologyLinks: numOr0(ev.totalOntologyLinks),
    byLens,
  }

  const conf = typeof surface.getConfidence === 'function' && isObj(surface.getConfidence()) ? surface.getConfidence() : {}
  const confidenceSummary = {
    level: strOrNull(conf.level) || 'LOW',
    value: numOr0(conf.value),
    high: conf.high === true,
    low: conf.low === true,
  }

  const prov = typeof surface.getProvenance === 'function' && isObj(surface.getProvenance()) ? surface.getProvenance() : {}
  const origin = isObj(prov.origin) ? prov.origin : null
  const provenance = {
    source: 'coach-dna-intelligence-query',
    sourceMilestone: 'M255',
    chain: Array.isArray(prov.chain) ? [...prov.chain] : null,
    profileFingerprint: strOrNull(prov.profileFingerprint),
    intelligenceInputsFingerprint: strOrNull(prov.intelligenceInputsFingerprint),
    origin: origin ? {
      sourceMilestone: strOrNull(origin.sourceMilestone),
      profileVersion: strOrNull(origin.profileVersion),
      sourceConfidenceLevel: strOrNull(origin.sourceConfidenceLevel),
    } : null,
  }

  const derivationMetadata = {
    milestone: 'M269',
    domain: 'training',
    derivedFrom: 'coach-dna-intelligence-query',
    sourceMilestone: 'M255',
    deterministic: true,
    llmGenerated: false,
    readOnly: true,
    dormant: true,
    describesCoach: true,
    containsPlayerData: false,
    playerEvaluation: false,
    trainingRecommendation: false,
    generatesTrainingContent: false,
    analysesSessions: false,
  }

  const draft = {
    type: 'coach-dna-training-intelligence-inputs',
    schemaVersion: 1,
    trainingInputsVersion: 1,
    milestone: 'M269',
    valid,
    planningSignals: lenses.planningSignals,
    sessionStructureSignals: lenses.sessionStructureSignals,
    developmentSignals: lenses.developmentSignals,
    technicalSignals: lenses.technicalSignals,
    tacticalSignals: lenses.tacticalSignals,
    feedbackSignals: lenses.feedbackSignals,
    evidenceCoverage,
    confidenceSummary,
    provenance,
    derivationMetadata,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for these inputs.
  draft.trainingInputsFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the training inputs for logs or PR notes.
 * @param {object} input an M255 query surface (or a profile/index)
 * @returns {string}
 */
export function summarizeCoachDnaTrainingIntelligenceInputs(input) {
  const t = buildCoachDnaTrainingIntelligenceInputs(input)
  const present = TRAINING_LENSES.filter(({ field }) => t[field].present).map(({ field }) => field)
  return [
    `Coach DNA training intelligence inputs: ${t.valid ? 'derived' : 'unusable source'}`,
    `Present lenses: ${present.length ? present.join(', ') : 'none'}`,
    `Confidence: ${t.confidenceSummary.level}`,
    `Fingerprint: ${t.trainingInputsFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the training inputs deterministically.
 * @param {object} input an M255 query surface (or a profile/index)
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaTrainingIntelligenceInputs(input, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const t = buildCoachDnaTrainingIntelligenceInputs(input)
  if (format === 'json') return canonicalStringify(t)
  if (format === 'line') {
    const present = TRAINING_LENSES.filter(({ field }) => t[field].present).length
    return `coach-dna-training-intelligence-inputs valid=${t.valid} presentLenses=${present}/${TRAINING_LENSES.length} `
      + `confidence=${t.confidenceSummary.level} fp=${t.trainingInputsFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA training intelligence inputs format '${format}'`)
}
