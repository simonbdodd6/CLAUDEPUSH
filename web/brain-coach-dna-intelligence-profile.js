/**
 * web/brain-coach-dna-intelligence-profile.js - Coach DNA Intelligence Profile (M253, DORMANT)
 *
 * The first higher-level object of the Coach's Eye Intelligence subsystem. Where M252 exposes eight raw signal
 * groups, this module assembles them into a single immutable Intelligence Profile — one stable interface that
 * later Brain subsystems (Match Intelligence, Selection Intelligence, Coach Evolution, Season Memory, ...) can
 * consume without re-walking the individual signal groups.
 *
 * It is NOT an inference engine. It invents nothing, predicts nothing and recommends nothing: every field is a
 * deterministic aggregation or projection of values already present in the M252 inputs. It folds the signal
 * groups into a signal summary, a category coverage map, a confidence summary, and carries the evidence
 * coverage, provenance (preserving the chain back through M252 to the M230 view) and a validation state
 * describing whether the source inputs were usable.
 *
 * Pure function. It reuses ONLY the M252 inputs shape, mutates no input, performs no writes, makes no
 * recommendation, calls no AI/LLM, and uses no DOM/network/storage/env/database/clock/randomness. It touches
 * no engine, prior milestone, index.html, runtime, or API. Same input → same profile, byte for byte.
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

// The eight M252 signal-group fields, in fixed order so aggregation and fingerprints are deterministic.
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

// Read one signal group from the M252 inputs, defaulting to an empty/absent group when missing or malformed.
function readGroup(inputs, field, category) {
  const g = isObj(inputs) && isObj(inputs[field]) ? inputs[field] : null
  return {
    field,
    category,
    label: (g && strOrNull(g.label)) || labelFor(category),
    present: g ? g.present === true : false,
    isDominant: g ? g.isDominant === true : false,
    occurrences: g ? numOr0(g.occurrences) : 0,
    strength: g ? numOr0(g.strength) : 0,
    themeCount: g ? numOr0(g.themeCount) : 0,
    supportingCount: g ? numOr0(g.supportingCount) : 0,   // count only — never the raw ids
    averageConfidence: g ? numOr0(g.averageConfidence) : 0,
    averageWeight: g ? numOr0(g.averageWeight) : 0,
    isStrongest: g ? g.isStrongest === true : false,
    isWeakest: g ? g.isWeakest === true : false,
  }
}

/**
 * Build the deterministic Coach DNA intelligence profile from an M252 intelligence inputs object.
 *
 * @param {object} inputs an M252 intelligence inputs object (output of buildCoachDnaIntelligenceInputs)
 * @returns {object} frozen intelligence profile; validationState.usable is false for malformed/invalid inputs.
 */
export function buildCoachDnaIntelligenceProfile(inputs) {
  const inputsOk = isObj(inputs) && inputs.type === 'coach-dna-intelligence-inputs'
  const inputsValid = inputsOk && inputs.valid === true
  const usable = inputsValid

  const groups = SIGNAL_FIELDS.map(({ field, category }) => readGroup(inputs, field, category))
  const present = groups.filter((g) => g.present)
  const dominant = groups.filter((g) => g.isDominant)
  const strongest = groups.find((g) => g.isStrongest) || null
  const weakest = groups.find((g) => g.isWeakest) || null

  const signalSummary = {
    totalGroups: groups.length,
    presentGroups: present.length,
    dominantGroups: dominant.length,
    totalOccurrences: groups.reduce((a, g) => a + g.occurrences, 0),
    totalSupporting: groups.reduce((a, g) => a + g.supportingCount, 0),
    strongestCategory: strongest ? strongest.category : null,
    strongestLabel: strongest ? strongest.label : null,
    weakestCategory: weakest ? weakest.category : null,
    weakestLabel: weakest ? weakest.label : null,
    groups,
  }

  const covered = present.map((g) => g.category)
  const missing = groups.filter((g) => !g.present).map((g) => g.category)
  const categoryCoverage = {
    covered,
    missing,
    coveredCount: covered.length,
    possibleCount: groups.length,
    coverageRatio: groups.length ? covered.length / groups.length : 0,
  }

  const cf = isObj(inputs) && isObj(inputs.confidenceFlags) ? inputs.confidenceFlags : {}
  const presentConfidences = present.map((g) => g.averageConfidence)
  const confidenceSummary = {
    level: strOrNull(cf.confidenceLevel) || 'LOW',
    value: numOr0(cf.confidenceValue),
    high: cf.highConfidence === true,
    low: cf.lowConfidence === true || !usable,
    empty: cf.empty === true,
    diversityLabel: strOrNull(cf.diversityLabel),
    narrowSpread: cf.narrowSpread === true,
    // a deterministic mean of the present groups' averaged confidence — a summary, not a prediction
    averageSignalConfidence: presentConfidences.length
      ? presentConfidences.reduce((a, b) => a + b, 0) / presentConfidences.length
      : 0,
  }

  const ec = isObj(inputs) && isObj(inputs.evidenceCoverage) ? inputs.evidenceCoverage : {}
  const evidenceCoverage = {
    totalMemories: numOr0(ec.totalMemories),
    uniqueTypes: numOr0(ec.uniqueTypes),
    totalEvidence: numOr0(ec.totalEvidence),
    totalOntologyLinks: numOr0(ec.totalOntologyLinks),
    averageConfidence: numOr0(ec.averageConfidence),
    averageWeight: numOr0(ec.averageWeight),
    categoriesCovered: numOr0(ec.categoriesCovered),
    categoriesPossible: numOr0(ec.categoriesPossible) || groups.length,
    coverageRatio: numOr0(ec.coverageRatio),
  }

  const intelligenceInputsFingerprint = inputsOk && typeof inputs.inputsFingerprint === 'string'
    ? inputs.inputsFingerprint
    : null

  // Preserve the full provenance chain: this profile ← M252 inputs ← (origin) M230 view.
  const origin = inputsOk && isObj(inputs.provenance) ? inputs.provenance : null
  const provenance = {
    source: 'coach-dna-intelligence-inputs',
    sourceMilestone: 'M252',
    intelligenceInputsFingerprint,
    recognizable: inputsOk,
    origin: origin ? {
      source: strOrNull(origin.source),
      sourceMilestone: strOrNull(origin.sourceMilestone),
      profileVersion: strOrNull(origin.profileVersion),
      sourceConfidenceLevel: strOrNull(origin.sourceConfidenceLevel),
    } : null,
  }

  const derivationMetadata = {
    milestone: 'M253',
    derivedFrom: 'coach-dna-intelligence-inputs',
    sourceMilestone: 'M252',
    deterministic: true,
    llmGenerated: false,
    readOnly: true,
    dormant: true,
  }

  const issues = []
  if (!inputsOk) issues.push('intelligence inputs missing or malformed')
  else if (!inputsValid) issues.push('intelligence inputs marked invalid (unrecognized source profile)')
  const validationState = {
    inputsRecognized: inputsOk,
    inputsValid,
    usable,
    issues,
  }

  const draft = {
    type: 'coach-dna-intelligence-profile',
    schemaVersion: 1,
    profileVersion: 'intelligence-profile-v1',
    intelligenceInputsFingerprint,
    signalSummary,
    categoryCoverage,
    confidenceSummary,
    evidenceCoverage,
    provenance,
    derivationMetadata,
    validationState,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this profile.
  draft.profileFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the intelligence profile for logs or PR notes.
 * @param {object} inputs an M252 intelligence inputs object
 * @returns {string}
 */
export function summarizeCoachDnaIntelligenceProfile(inputs) {
  const p = buildCoachDnaIntelligenceProfile(inputs)
  return [
    `Coach DNA intelligence profile: ${p.validationState.usable ? 'usable' : 'unusable source'}`,
    `Signals: ${p.signalSummary.presentGroups}/${p.signalSummary.totalGroups} present, ${p.signalSummary.dominantGroups} dominant`,
    `Coverage: ${p.categoryCoverage.coveredCount}/${p.categoryCoverage.possibleCount} categories`,
    `Confidence: ${p.confidenceSummary.level}`,
    `Strongest: ${p.signalSummary.strongestLabel || 'none'}`,
    `Fingerprint: ${p.profileFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the intelligence profile deterministically.
 * @param {object} inputs an M252 intelligence inputs object
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaIntelligenceProfile(inputs, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const p = buildCoachDnaIntelligenceProfile(inputs)
  if (format === 'json') return canonicalStringify(p)
  if (format === 'line') {
    return `coach-dna-intelligence-profile usable=${p.validationState.usable} `
      + `signals=${p.signalSummary.presentGroups}/${p.signalSummary.totalGroups} `
      + `coverage=${p.categoryCoverage.coveredCount}/${p.categoryCoverage.possibleCount} `
      + `confidence=${p.confidenceSummary.level} fp=${p.profileFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA intelligence profile format '${format}'`)
}
