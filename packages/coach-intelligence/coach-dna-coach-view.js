/**
 * @coach-intelligence — Coach DNA Coach View Contract (M230, DORMANT, read-only)
 *
 * Maps the deterministic Coach Memory aggregates — an M114 Coach DNA profile plus an M112 memory
 * synthesis — into a stable, simplified `coachView` a future UI can render WITHOUT understanding any
 * internal engine detail. It exposes only deliberately-mapped fields (e.g. a supporting-memory COUNT,
 * never the raw id arrays) — never the raw internals wholesale. This is the Coach Memory analogue of
 * the M217 readiness coach-view, and is designed to be rendered by the same M221–M228 view kit.
 *
 * It selects/ranks nothing new, builds no team, recommends nothing, calls no AI, invents no
 * philosophy, and touches no database/network/filesystem/timestamp/clock/randomness. Pure,
 * deterministic; input never mutated; output deeply frozen.
 *
 * Input: { profile, synthesis } — an M114 buildCoachDnaProfile result and an M112
 * synthesizeCoachMemories result (e.g. the `profile` and `synthesis` fields of an M118 pipeline run).
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const numOr0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const strOrNull = (v) => (typeof v === 'string' && v.length > 0 ? v : null)
const arr = (v) => (Array.isArray(v) ? v : [])

// Human labels for the coaching dimensions (COACH_MEMORY_TYPES). Falls back to the raw category for
// any future type not yet mapped, so the view never throws on an unknown-but-valid category.
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

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

// Map the profile's 0..1 average-strength confidence to a level + label, mirroring the readiness
// coach-view's HIGH/MEDIUM/LOW vocabulary. Thresholds are documented and deterministic.
function confidenceOf(value) {
  const v = numOr0(value)
  const level = v >= 0.66 ? 'HIGH' : v >= 0.33 ? 'MEDIUM' : 'LOW'
  const label = level === 'HIGH' ? 'High' : level === 'MEDIUM' ? 'Medium' : 'Low'
  return { value: v, level, label }
}

// Map the 0..1 diversity score (categories covered / possible dimensions) to a spread label.
function diversityLabel(score) {
  const v = numOr0(score)
  if (v >= 0.75) return 'Broad'
  if (v >= 0.5) return 'Balanced'
  if (v >= 0.25) return 'Focused'
  return 'Narrow'
}

function mapDominantSignals(signals) {
  return arr(signals).filter(isObj).map((s) => ({
    category: strOrNull(s.category),
    label: labelFor(s.category),
    occurrences: numOr0(s.occurrences),
    strength: numOr0(s.strength),
    averageConfidence: numOr0(s.averageConfidence),
    averageWeight: numOr0(s.averageWeight),
    supportingCount: arr(s.supportingMemoryIds).length,   // count only — never leak the raw ids
  }))
}

function mapThemes(themes) {
  return arr(themes).filter(isObj).map((t) => ({
    type: strOrNull(t.type),
    label: labelFor(t.type),
    count: numOr0(t.count),
    averageConfidence: numOr0(t.averageConfidence),
    averageWeight: numOr0(t.averageWeight),
  }))
}

/**
 * Build the coach-facing Coach DNA view from the Coach Memory aggregates.
 *
 * @param {{ profile:object, synthesis:object }} bundle  an M114 profile + an M112 synthesis
 * @returns {Readonly<{ profileVersion:(string|null), confidence:object, headline:string,
 *   identity:object, dominantSignals:object[], themes:object[], knowledge:object,
 *   summary:(string|null), metadata:object }>}
 */
export function buildCoachDnaCoachView(bundle) {
  if (!isObj(bundle) || !isObj(bundle.profile) || !isObj(bundle.synthesis)) {
    throw new TypeError('buildCoachDnaCoachView requires { profile (M114), synthesis (M112) }')
  }

  const profile = bundle.profile
  const synthesis = bundle.synthesis
  const balance = isObj(profile.balance) ? profile.balance : {}
  const stats = isObj(synthesis.statistics) ? synthesis.statistics : {}

  const signalCount = isObj(profile.generatedFrom) ? numOr0(profile.generatedFrom.signalCount) : 0
  const confidence = confidenceOf(profile.confidence)

  const identity = {
    strongestCategory: strOrNull(balance.strongestCategory),
    strongestLabel: labelFor(balance.strongestCategory),
    weakestCategory: strOrNull(balance.weakestCategory),
    weakestLabel: labelFor(balance.weakestCategory),
    diversityScore: numOr0(balance.diversityScore),
    diversityLabel: diversityLabel(balance.diversityScore),
  }

  const dominantSignals = mapDominantSignals(profile.dominantSignals)
  const themes = mapThemes(synthesis.themes)

  const knowledge = {
    totalMemories: numOr0(stats.totalMemories),
    uniqueTypes: numOr0(stats.uniqueTypes),
    averageConfidence: numOr0(stats.averageConfidence),
    averageWeight: numOr0(stats.averageWeight),
    totalEvidence: numOr0(stats.totalEvidence),
    totalOntologyLinks: numOr0(stats.totalOntologyLinks),
  }

  const headline = signalCount === 0
    ? 'No coaching profile yet — add memories to build Coach DNA'
    : `${identity.strongestLabel} focus — ${knowledge.totalMemories} `
      + `${knowledge.totalMemories === 1 ? 'memory' : 'memories'} across ${knowledge.uniqueTypes} `
      + `${knowledge.uniqueTypes === 1 ? 'theme' : 'themes'}, ${confidence.label.toLowerCase()} confidence`

  const metadata = isObj(profile.metadata) ? profile.metadata : {}

  return deepFreeze({
    profileVersion: strOrNull(profile.profileVersion),
    confidence,
    headline,
    identity,
    dominantSignals,
    themes,
    knowledge,
    summary: strOrNull(synthesis.summary),
    metadata: {
      explainable: metadata.explainable === true,
      deterministic: metadata.deterministic === true,
      llmGenerated: metadata.llmGenerated === true,
    },
  })
}
