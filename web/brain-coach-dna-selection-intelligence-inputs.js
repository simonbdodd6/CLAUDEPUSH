/**
 * web/brain-coach-dna-selection-intelligence-inputs.js - Coach DNA Selection Intelligence Inputs (M261, DORMANT)
 *
 * The FIRST true consumer of the Coach DNA Intelligence subsystem. Where M252-M260 built the infrastructure
 * (inputs/profile/index/query/contract/snapshot/package), this module begins a domain-specific capability: it
 * reads the M255 query surface and projects the coach's existing DNA signals into the lenses a future SELECTION
 * reasoning system would consume.
 *
 * It is critically NOT a selector. It contains NO player data and performs NO player reasoning: it never
 * invents data, never infers missing information, never predicts, never recommends a player, never scores a
 * player and never ranks anything. Each "selection lens" is simply a deterministic re-view of one existing
 * Coach DNA category (e.g. the coach's selection-preference, player-management, philosophy signals), carrying
 * only that category's already-public aggregates — a supporting COUNT, never ids. The lens names describe the
 * coach's tendencies, not any judgement about players.
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

// Each selection lens is a deterministic re-view of exactly one existing Coach DNA category — chosen because
// it is the category most relevant to that selection concern. The data is 100% the source category's; the
// lens only renames/groups it. Fixed order so the projection and fingerprint are deterministic.
const SELECTION_LENSES = Object.freeze([
  { field: 'selectionSignals', sourceCategory: 'selection-preference', relevance: 'the coach\'s explicit selection preferences' },
  { field: 'playerTrustSignals', sourceCategory: 'player-management', relevance: 'how the coach manages and develops players' },
  { field: 'continuitySignals', sourceCategory: 'philosophy', relevance: 'philosophy that drives selection continuity' },
  { field: 'rotationSignals', sourceCategory: 'tactical-preference', relevance: 'tactical preferences that inform rotation' },
  { field: 'availabilitySignals', sourceCategory: 'risk-warning', relevance: 'risk/warning signals relevant to availability' },
])

// Resolve a query surface: an existing M255 surface is used as-is; anything else is fed to M255 (which yields
// a real, contract-shaped surface — usable or not, never throwing).
function resolveSurface(input) {
  if (isObj(input) && typeof input.getSignalGroup === 'function' && typeof input.getProvenance === 'function') return input
  return createCoachDnaIntelligenceQuery(input)
}

// Build one selection lens from the surface's existing category view. Pure projection — no derivation.
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
 * Build the deterministic Coach DNA selection intelligence inputs from an M255 query surface.
 *
 * @param {object} input an M255 query surface (or an M253 profile / M254 index that yields one)
 * @returns {object} frozen selection inputs; `valid` is false when the source is unusable.
 */
export function buildCoachDnaSelectionIntelligenceInputs(input) {
  const surface = resolveSurface(input)
  const valid = typeof surface.isUsable === 'function' ? surface.isUsable() === true : false

  // The five selection lenses — each a re-view of one Coach DNA category. No scoring, no ranking, no ordering.
  const lenses = {}
  for (const { field, sourceCategory } of SELECTION_LENSES) lenses[field] = readLens(surface, field, sourceCategory)

  const ev = typeof surface.getEvidence === 'function' && isObj(surface.getEvidence()) ? surface.getEvidence() : {}
  const evByCategory = isObj(ev.byCategory) ? ev.byCategory : {}
  const byLens = {}
  for (const { field, sourceCategory } of SELECTION_LENSES) {
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
    milestone: 'M261',
    domain: 'selection',
    derivedFrom: 'coach-dna-intelligence-query',
    sourceMilestone: 'M255',
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
    type: 'coach-dna-selection-intelligence-inputs',
    schemaVersion: 1,
    selectionInputsVersion: 1,
    milestone: 'M261',
    valid,
    selectionSignals: lenses.selectionSignals,
    playerTrustSignals: lenses.playerTrustSignals,
    continuitySignals: lenses.continuitySignals,
    rotationSignals: lenses.rotationSignals,
    availabilitySignals: lenses.availabilitySignals,
    evidenceCoverage,
    confidenceSummary,
    provenance,
    derivationMetadata,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for these inputs.
  draft.selectionInputsFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the selection inputs for logs or PR notes.
 * @param {object} input an M255 query surface (or a profile/index)
 * @returns {string}
 */
export function summarizeCoachDnaSelectionIntelligenceInputs(input) {
  const s = buildCoachDnaSelectionIntelligenceInputs(input)
  const present = SELECTION_LENSES.filter(({ field }) => s[field].present).map(({ field }) => field)
  return [
    `Coach DNA selection intelligence inputs: ${s.valid ? 'derived' : 'unusable source'}`,
    `Present lenses: ${present.length ? present.join(', ') : 'none'}`,
    `Confidence: ${s.confidenceSummary.level}`,
    `Fingerprint: ${s.selectionInputsFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the selection inputs deterministically.
 * @param {object} input an M255 query surface (or a profile/index)
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaSelectionIntelligenceInputs(input, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const s = buildCoachDnaSelectionIntelligenceInputs(input)
  if (format === 'json') return canonicalStringify(s)
  if (format === 'line') {
    const present = SELECTION_LENSES.filter(({ field }) => s[field].present).length
    return `coach-dna-selection-intelligence-inputs valid=${s.valid} presentLenses=${present}/${SELECTION_LENSES.length} `
      + `confidence=${s.confidenceSummary.level} fp=${s.selectionInputsFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA selection intelligence inputs format '${format}'`)
}
