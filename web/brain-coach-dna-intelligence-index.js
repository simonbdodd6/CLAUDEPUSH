/**
 * web/brain-coach-dna-intelligence-index.js - Coach DNA Intelligence Index (M254, DORMANT)
 *
 * The stable navigation layer of the Coach's Eye Intelligence subsystem. Where M253 produces a complete
 * structured Intelligence Profile, this module turns that profile into an Intelligence INDEX: a set of keyed
 * lookup surfaces (by category, by signal, by evidence, by provenance) plus a compact coverage summary, so
 * downstream Brain modules (Match Intelligence, Selection Intelligence, Coach Evolution, Season Memory,
 * Opposition Analysis, ...) can query a single category or signal in O(1) without walking the whole profile.
 *
 * It is NOT an inference engine. It invents nothing, predicts nothing and recommends nothing: every index
 * entry is a deterministic re-keying or projection of values already present in the M253 profile. It builds a
 * category index, a signal index, an evidence index, a provenance index (preserving the chain back through
 * M253/M252 to the M230 view), a coverage summary, and a validation state.
 *
 * Pure function. It reuses ONLY the M253 profile shape, mutates no input, performs no writes, makes no
 * recommendation, calls no AI/LLM, and uses no DOM/network/storage/env/database/clock/randomness. It touches
 * no engine, prior milestone, index.html, runtime, or API. Same input → same index, byte for byte.
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

// The eight signal-group field↔category bindings, in fixed order so the index is deterministic and total.
const SIGNAL_FIELDS = Object.freeze([
  { field: 'coachingStyleSignals', category: 'philosophy' },
  { field: 'communicationSignals', category: 'communication-style' },
  { field: 'trainingSignals', category: 'training-preference' },
  { field: 'playerDevelopmentSignals', category: 'player-management' },
  { field: 'selectionSignals', category: 'selection-preference' },
  { field: 'tacticalSignals', category: 'tactical-preference' },
  { field: 'planningSignals', category: 'learned-pattern' },
  { field: 'riskSignals', category: 'risk-warning' },
])

/**
 * Build the deterministic Coach DNA intelligence index from an M253 intelligence profile.
 *
 * @param {object} profile an M253 intelligence profile (output of buildCoachDnaIntelligenceProfile)
 * @returns {object} frozen intelligence index; validationState.profileUsable is false for malformed/invalid input.
 */
export function buildCoachDnaIntelligenceIndex(profile) {
  const profileOk = isObj(profile) && profile.type === 'coach-dna-intelligence-profile'
  const profileUsable = profileOk && isObj(profile.validationState) && profile.validationState.usable === true

  const signalSummary = profileOk && isObj(profile.signalSummary) ? profile.signalSummary : {}
  const groups = Array.isArray(signalSummary.groups) ? signalSummary.groups.filter(isObj) : []
  const groupByCategory = (cat) => groups.find((g) => g.category === cat) || null

  // categoryIndex + signalIndex: O(1) lookup surfaces keyed by category and by signal field. Every one of the
  // eight categories is keyed (absent ones default to an empty entry) so the index is total and stable.
  const categoryIndex = {}
  const signalIndex = {}
  for (const { field, category } of SIGNAL_FIELDS) {
    const g = groupByCategory(category)
    categoryIndex[category] = {
      category,
      label: (g && strOrNull(g.label)) || labelFor(category),
      signalKey: field,
      present: g ? g.present === true : false,
      isDominant: g ? g.isDominant === true : false,
      isStrongest: g ? g.isStrongest === true : false,
      isWeakest: g ? g.isWeakest === true : false,
    }
    signalIndex[field] = {
      field,
      category,
      label: (g && strOrNull(g.label)) || labelFor(category),
      present: g ? g.present === true : false,
      isDominant: g ? g.isDominant === true : false,
      occurrences: g ? numOr0(g.occurrences) : 0,
      strength: g ? numOr0(g.strength) : 0,
      supportingCount: g ? numOr0(g.supportingCount) : 0,   // count only — never the raw ids
      themeCount: g ? numOr0(g.themeCount) : 0,
      averageConfidence: g ? numOr0(g.averageConfidence) : 0,
      averageWeight: g ? numOr0(g.averageWeight) : 0,
    }
  }

  // evidenceIndex: the evidence-coverage roll-up plus a quick per-category evidence presence map.
  const ec = profileOk && isObj(profile.evidenceCoverage) ? profile.evidenceCoverage : {}
  const byCategory = {}
  for (const { category } of SIGNAL_FIELDS) {
    const g = groupByCategory(category)
    byCategory[category] = {
      present: g ? g.present === true : false,
      occurrences: g ? numOr0(g.occurrences) : 0,
      supportingCount: g ? numOr0(g.supportingCount) : 0,
      themeCount: g ? numOr0(g.themeCount) : 0,
    }
  }
  const evidenceIndex = {
    totalMemories: numOr0(ec.totalMemories),
    uniqueTypes: numOr0(ec.uniqueTypes),
    totalEvidence: numOr0(ec.totalEvidence),
    totalOntologyLinks: numOr0(ec.totalOntologyLinks),
    byCategory,
  }

  const profileFingerprint = profileOk && typeof profile.profileFingerprint === 'string' ? profile.profileFingerprint : null
  const intelligenceInputsFingerprint = profileOk && typeof profile.intelligenceInputsFingerprint === 'string'
    ? profile.intelligenceInputsFingerprint
    : null
  const origin = profileOk && isObj(profile.provenance) && isObj(profile.provenance.origin) ? profile.provenance.origin : null

  // provenanceIndex: a navigable lineage. `chain` is the full ancestry; `byMilestone` indexes each source.
  const provenanceIndex = {
    chain: ['M230', 'M252', 'M253', 'M254'],
    profileFingerprint,
    intelligenceInputsFingerprint,
    origin: origin ? {
      sourceMilestone: strOrNull(origin.sourceMilestone),
      profileVersion: strOrNull(origin.profileVersion),
      sourceConfidenceLevel: strOrNull(origin.sourceConfidenceLevel),
    } : null,
    byMilestone: {
      M230: { milestone: 'M230', role: 'coach-dna-coach-view', profileVersion: origin ? strOrNull(origin.profileVersion) : null },
      M252: { milestone: 'M252', role: 'intelligence-inputs', fingerprint: intelligenceInputsFingerprint },
      M253: { milestone: 'M253', role: 'intelligence-profile', fingerprint: profileFingerprint },
    },
  }

  const categoryCoverage = profileOk && isObj(profile.categoryCoverage) ? profile.categoryCoverage : {}
  const confidenceSummary = profileOk && isObj(profile.confidenceSummary) ? profile.confidenceSummary : {}
  const presentSignals = SIGNAL_FIELDS.filter(({ field }) => signalIndex[field].present).length
  const dominantSignals = SIGNAL_FIELDS.filter(({ field }) => signalIndex[field].isDominant).length

  const coverageSummary = {
    categoriesCovered: numOr0(categoryCoverage.coveredCount),
    categoriesPossible: numOr0(categoryCoverage.possibleCount) || SIGNAL_FIELDS.length,
    coverageRatio: numOr0(categoryCoverage.coverageRatio),
    presentSignals,
    dominantSignals,
    totalSignals: SIGNAL_FIELDS.length,
    confidenceLevel: strOrNull(confidenceSummary.level) || 'LOW',
  }

  const issues = []
  if (!profileOk) issues.push('intelligence profile missing or malformed')
  else if (!profileUsable) issues.push('intelligence profile not usable (source inputs were invalid)')
  const validationState = {
    profileRecognized: profileOk,
    profileUsable,
    issues,
  }

  const derivationMetadata = {
    milestone: 'M254',
    derivedFrom: 'coach-dna-intelligence-profile',
    sourceMilestone: 'M253',
    deterministic: true,
    llmGenerated: false,
    readOnly: true,
    dormant: true,
  }

  const draft = {
    type: 'coach-dna-intelligence-index',
    schemaVersion: 1,
    indexVersion: 1,
    profileFingerprint,
    categoryIndex,
    signalIndex,
    evidenceIndex,
    provenanceIndex,
    coverageSummary,
    validationState,
    derivationMetadata,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this index.
  draft.indexFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the intelligence index for logs or PR notes.
 * @param {object} profile an M253 intelligence profile
 * @returns {string}
 */
export function summarizeCoachDnaIntelligenceIndex(profile) {
  const x = buildCoachDnaIntelligenceIndex(profile)
  return [
    `Coach DNA intelligence index: ${x.validationState.profileUsable ? 'queryable' : 'unusable source'}`,
    `Categories indexed: ${Object.keys(x.categoryIndex).length}`,
    `Coverage: ${x.coverageSummary.categoriesCovered}/${x.coverageSummary.categoriesPossible}, ${x.coverageSummary.presentSignals} present signals`,
    `Confidence: ${x.coverageSummary.confidenceLevel}`,
    `Fingerprint: ${x.indexFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the intelligence index deterministically.
 * @param {object} profile an M253 intelligence profile
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaIntelligenceIndex(profile, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const x = buildCoachDnaIntelligenceIndex(profile)
  if (format === 'json') return canonicalStringify(x)
  if (format === 'line') {
    return `coach-dna-intelligence-index usable=${x.validationState.profileUsable} `
      + `coverage=${x.coverageSummary.categoriesCovered}/${x.coverageSummary.categoriesPossible} `
      + `signals=${x.coverageSummary.presentSignals}/${x.coverageSummary.totalSignals} `
      + `confidence=${x.coverageSummary.confidenceLevel} fp=${x.indexFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA intelligence index format '${format}'`)
}
