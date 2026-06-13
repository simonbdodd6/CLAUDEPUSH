/**
 * Coach Products — Weekly Brief Personaliser (M20)
 *
 * Pure, deterministic functions that tailor a Weekly Brief to an individual
 * coach's learned preferences from the M19 CoachProfile.
 *
 * Rules:
 *   - NEVER modifies the CoachProfile (read-only)
 *   - NEVER mutates the incoming briefData
 *   - When profile is absent or thin (<MIN_PROFILE_OBSERVATIONS), returns
 *     the brief unchanged so behaviour is identical to pre-M20
 *   - Feature flag 'ai.personalisation' controls the whole layer
 *   - All transformations are explained in personalisation.signalsUsed
 *     and personalisation.explanation
 *
 * What personalisation does:
 *   1. Re-ranks topPriorities by historical accept rate per category
 *   2. Adjusts training load messaging for preferred training emphasis
 *   3. Adds a risk-tolerance note when tolerance is non-null
 *   4. Surfaces squad rotation pattern in explanations
 *   5. Adapts explanation tone to communicationStyle preference
 */

import { PREFERENCE_KEY, MIN_OBSERVATIONS_FOR_SIGNAL } from '../../ai-brain/learning/learning-types.js'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum observations before personalisation kicks in. */
export const MIN_PROFILE_OBSERVATIONS = MIN_OBSERVATIONS_FOR_SIGNAL

/** Feature flag that gates all personalisation. */
export const PERSONALISATION_FLAG = 'ai.personalisation'

// ── Helpers ───────────────────────────────────────────────────────────────────

function isFlagEnabled(flagName, flags = {}) {
  if (!flags || !(flagName in flags)) return true
  return Boolean(flags[flagName])
}

/**
 * Look up the coach's historical accept rate for a given recommendation category.
 * Returns 0.5 (neutral) when no history exists for that category.
 *
 * @param {string} category
 * @param {object} byCategory  - profile.recommendationHistory.byCategory
 * @returns {number}  0–1
 */
function acceptRate(category, byCategory) {
  if (!category || !byCategory) return 0.5
  const key   = String(category).toLowerCase()
  const match = Object.entries(byCategory).find(([k]) => k.toLowerCase() === key)
  if (!match) return 0.5
  const [, counts] = match
  const total = (counts.accepted ?? 0) + (counts.rejected ?? 0) + (counts.ignored ?? 0)
  return total > 0 ? (counts.accepted ?? 0) / total : 0.5
}

// ── Pure transformation functions ─────────────────────────────────────────────

/**
 * Re-rank topPriorities so categories the coach historically acts on rise first.
 * Preserves the original rank field (for reference) and adds a coachWeight field.
 * Within equal accept-rate bands, preserves original order.
 *
 * @param {object[]} priorities
 * @param {object}   profile
 * @returns {object[]}  new array, priorities unchanged structurally
 */
export function reRankPriorities(priorities, profile) {
  if (!priorities?.length || !profile) return priorities ?? []
  const history = profile.recommendationHistory?.byCategory ?? {}

  return [...priorities]
    .map(p => ({ ...p, _coachWeight: acceptRate(p.category, history) }))
    .sort((a, b) => {
      const diff = b._coachWeight - a._coachWeight
      if (Math.abs(diff) > 0.05) return diff   // meaningful accept-rate difference
      return (a.rank ?? 0) - (b.rank ?? 0)      // original rank as tiebreaker
    })
    .map(({ _coachWeight, ...p }) => p)          // strip internal field
}

/**
 * Build the list of preference signal names that will actually be used.
 * Only keys with a non-null value count as "used".
 *
 * @param {object} profile
 * @returns {string[]}
 */
export function buildSignalsUsed(profile) {
  if (!profile?.preferences) return []
  const signals = []

  // recommendationHistory is a special signal — not a preference key
  const h = profile.recommendationHistory
  if (h && (h.accepted + h.rejected + h.ignored) >= MIN_PROFILE_OBSERVATIONS) {
    signals.push('recommendationHistory')
  }

  for (const key of Object.values(PREFERENCE_KEY)) {
    if (profile.preferences[key]?.value != null) {
      signals.push(key)
    }
  }

  return signals
}

/**
 * Build a human-readable explanation of what was personalised and why.
 *
 * @param {object}   profile
 * @param {string[]} signalsUsed
 * @returns {string}
 */
export function buildExplanation(profile, signalsUsed) {
  if (!signalsUsed.length) return ''
  const prefs = profile.preferences ?? {}
  const parts = []

  if (signalsUsed.includes('recommendationHistory')) {
    const h = profile.recommendationHistory
    const total = (h?.accepted ?? 0) + (h?.rejected ?? 0) + (h?.ignored ?? 0)
    parts.push(`Priorities ranked by your historical action rate across ${total} decisions`)
  }

  const cs = prefs[PREFERENCE_KEY.COACHING_STYLE]?.value
  if (cs) {
    const labels = { directive: 'task-focused actions', supportive: 'player welfare items', collaborative: 'team-input recommendations' }
    parts.push(`Your ${cs} coaching style surfaces ${labels[cs] ?? cs} higher`)
  }

  const te = prefs[PREFERENCE_KEY.TRAINING_EMPHASIS]?.value
  if (te) parts.push(`Training emphasis (${te}) reflected in load summary`)

  const rt = prefs[PREFERENCE_KEY.RISK_TOLERANCE]?.value
  if (rt) {
    const rtLabels = { high: 'urgent items shown prominently', low: 'conservative framing applied', medium: 'balanced urgency framing' }
    parts.push(`Risk tolerance (${rt}): ${rtLabels[rt] ?? rt}`)
  }

  const comm = prefs[PREFERENCE_KEY.COMMUNICATION_STYLE]?.value
  if (comm) {
    const commLabels = { nurturing: 'welfare context expanded', analytical: 'data context included', direct: 'action-first ordering' }
    parts.push(`Communication style (${comm}): ${commLabels[comm] ?? comm}`)
  }

  const sr = prefs[PREFERENCE_KEY.SQUAD_ROTATION]?.value
  if (sr) parts.push(`Squad rotation pattern (${sr}) tracked`)

  return parts.join('. ')
}

// ── Empty personalisation ─────────────────────────────────────────────────────

/**
 * Return an empty personalisation block (personalisation.applied = false).
 * Used when no profile, flag disabled, or profile below threshold.
 */
export function emptyPersonalisation() {
  return {
    applied:           false,
    coachProfileId:    null,
    profileVersion:    null,
    overallConfidence: null,
    signalsUsed:       [],
    explanation:       '',
  }
}

// ── Main personalise function ─────────────────────────────────────────────────

/**
 * Personalise a Weekly Brief using a CoachProfile.
 *
 * IMMUTABLE: briefData and profile are never mutated.
 * Returns the (possibly modified) briefData plus a personalisation block.
 *
 * Personalisation is SKIPPED (emptyPersonalisation returned) when:
 *   - profile is null or falsy
 *   - observationCount < MIN_PROFILE_OBSERVATIONS
 *   - PERSONALISATION_FLAG is explicitly disabled in opts.flags
 *
 * @param {object} briefData   - the brief built by buildBrief()
 * @param {object} profile     - CoachProfile from M19 (read-only)
 * @param {object} opts        - { flags? }
 * @returns {{ briefData: object, personalisation: object }}
 */
export function personalise(briefData, profile, opts = {}) {
  // Guard: feature flag
  if (!isFlagEnabled(PERSONALISATION_FLAG, opts?.flags)) {
    return { briefData, personalisation: emptyPersonalisation() }
  }

  // Guard: no profile or insufficient signal
  if (!profile || (profile.observationCount ?? 0) < MIN_PROFILE_OBSERVATIONS) {
    return { briefData, personalisation: emptyPersonalisation() }
  }

  const signalsUsed = buildSignalsUsed(profile)

  // No usable signals at all
  if (!signalsUsed.length) {
    return { briefData, personalisation: emptyPersonalisation() }
  }

  // ── Apply transformations (immutable — each returns a new object) ──────────

  let modified = { ...briefData }

  // 1. Re-rank top priorities by historical accept rate
  if (signalsUsed.includes('recommendationHistory')) {
    modified = { ...modified, topPriorities: reRankPriorities(modified.topPriorities, profile) }
  }

  // 2. Training emphasis — annotate trainingLoadSummary headline
  const te = profile.preferences?.[PREFERENCE_KEY.TRAINING_EMPHASIS]?.value
  if (te && modified.trainingLoadSummary) {
    modified = {
      ...modified,
      trainingLoadSummary: {
        ...modified.trainingLoadSummary,
        headline: modified.trainingLoadSummary.headline + ` — ${te} emphasis preferred`,
      },
    }
  }

  // 3. Communication style — annotate availabilitySummary for nurturing coaches
  const comm = profile.preferences?.[PREFERENCE_KEY.COMMUNICATION_STYLE]?.value
  if (comm === 'nurturing' && modified.attendanceSummary) {
    // Nurturing coaches: surface a care note in the attendance headline
    const existing = modified.attendanceSummary.headline ?? ''
    if (existing && !existing.includes('check')) {
      modified = {
        ...modified,
        attendanceSummary: {
          ...modified.attendanceSummary,
          headline: existing + ' — check in individually',
        },
      }
    }
  }

  // 4. Squad rotation — append pattern to matchPreparationStatus if notable
  const sr = profile.preferences?.[PREFERENCE_KEY.SQUAD_ROTATION]?.value
  if (sr === 'low' && modified.matchPreparationStatus?.isMatchWeek) {
    const existing = modified.matchPreparationStatus.headline ?? ''
    if (existing && !existing.includes('core XI')) {
      modified = {
        ...modified,
        matchPreparationStatus: {
          ...modified.matchPreparationStatus,
          headline: existing + ' — core XI pattern noted',
        },
      }
    }
  }

  // ── Build personalisation metadata ──────────────────────────────────────────

  const personalisation = {
    applied:           true,
    coachProfileId:    profile.coachId,
    profileVersion:    profile.profileVersion ?? null,
    overallConfidence: profile.overallConfidence ?? 0,
    signalsUsed,
    explanation:       buildExplanation(profile, signalsUsed),
  }

  return { briefData: modified, personalisation }
}
