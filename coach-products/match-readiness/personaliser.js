/**
 * Coach Products — Match Readiness Personaliser (M21)
 *
 * Tailors a Match Readiness report to an individual coach's learned
 * preferences from the M19 CoachProfile.
 *
 * HARD RULES:
 *   - READS the CoachProfile; NEVER mutates it (the Learning Engine alone writes).
 *   - NEVER mutates the incoming report.
 *   - EMPHASIS ONLY — re-orders and annotates presentation arrays.
 *     It MUST NOT change any score: overallScore, availabilityScore,
 *     fitnessScore, cohesionScore, confidence, selectionRisk,
 *     trainingLoadStatus and verdict are passed through untouched.
 *   - No profile / thin profile / flag off  →  report returned unchanged.
 *
 * Personalisation surfaces (all re-orderings are stable):
 *   1. keyConcerns      — surface the categories this coach historically acts on,
 *                         nudged by risk tolerance.
 *   2. trainingFocus    — surface the coach's preferred training emphasis first.
 *   3. recommendedActions — order by coaching style (task vs welfare focus).
 *   4. criticalPlayers  — nurturing communicators see welfare items first.
 */

import { PREFERENCE_KEY } from '../../ai-brain/learning/learning-types.js'
import { MIN_PROFILE_OBSERVATIONS, PERSONALISATION_FLAG } from './match-readiness-types.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function isFlagEnabled(flagName, flags = {}) {
  if (!flags || !(flagName in flags)) return true
  return Boolean(flags[flagName])
}

/** Stable sort by descending numeric weight; ties keep original order. */
function stableSortByWeight(arr, weightOf) {
  return arr
    .map((item, i) => ({ item, i, w: weightOf(item) }))
    .sort((a, b) => (b.w - a.w) || (a.i - b.i))
    .map(x => x.item)
}

/** Historical accept rate (0–1) for a recommendation category; 0.5 = neutral. */
function acceptRate(type, byCategory) {
  if (!type || !byCategory) return 0.5
  const key = String(type).toLowerCase()
  const match = Object.entries(byCategory).find(([k]) => k.toLowerCase() === key)
  if (!match) return 0.5
  const [, c] = match
  const total = (c.accepted ?? 0) + (c.rejected ?? 0) + (c.ignored ?? 0)
  return total > 0 ? (c.accepted ?? 0) / total : 0.5
}

function pref(profile, key) {
  return profile?.preferences?.[key]?.value ?? null
}

// ── Re-ordering (emphasis only — element objects untouched) ───────────────────

export function reorderConcerns(concerns, profile) {
  if (!concerns?.length) return concerns ?? []
  const hist = profile.recommendationHistory?.byCategory ?? {}
  const risk = pref(profile, PREFERENCE_KEY.RISK_TOLERANCE)
  return stableSortByWeight(concerns, c => {
    let w = acceptRate(c.type, hist)
    if (risk === 'low'  && (c.type === 'injury' || c.type === 'availability')) w += 0.3
    if (risk === 'high' && c.severity === 'medium') w -= 0.15
    return w
  })
}

export function reorderTrainingFocus(focus, profile) {
  if (!focus?.length) return focus ?? []
  const emphasis = pref(profile, PREFERENCE_KEY.TRAINING_EMPHASIS)
  if (!emphasis) return focus
  return stableSortByWeight(focus, f => (f.emphasis === emphasis ? 1 : 0))
}

export function reorderActions(actions, profile) {
  if (!actions?.length) return actions ?? []
  const style = pref(profile, PREFERENCE_KEY.COACHING_STYLE)
  if (!style) return actions
  const taskCats    = new Set(['selection', 'preparation', 'training'])
  const welfareCats = new Set(['cohesion', 'welfare', 'medical'])
  return stableSortByWeight(actions, a => {
    if (style === 'directive'  && taskCats.has(a.category))    return 1
    if (style === 'supportive' && welfareCats.has(a.category)) return 1
    if (style === 'collaborative' && a.category === 'cohesion') return 1
    return 0
  })
}

export function reorderCriticalPlayers(players, profile) {
  if (!players?.length) return players ?? []
  const comm = pref(profile, PREFERENCE_KEY.COMMUNICATION_STYLE)
  if (comm !== 'nurturing') return players
  const welfareSrc = new Set(['medical', 'welfare', 'readiness'])
  return stableSortByWeight(players, p => (welfareSrc.has(p.source) ? 1 : 0))
}

// ── Signals + explanation ─────────────────────────────────────────────────────

export function buildSignalsUsed(profile) {
  if (!profile?.preferences) return []
  const signals = []
  const h = profile.recommendationHistory
  if (h && (h.accepted + h.rejected + h.ignored) >= MIN_PROFILE_OBSERVATIONS) {
    signals.push('recommendationHistory')
  }
  for (const key of Object.values(PREFERENCE_KEY)) {
    if (profile.preferences[key]?.value != null) signals.push(key)
  }
  return signals
}

export function buildExplanation(profile, signalsUsed) {
  if (!signalsUsed.length) return ''
  const prefs = profile.preferences ?? {}
  const parts = []

  if (signalsUsed.includes('recommendationHistory')) {
    const h = profile.recommendationHistory
    const total = (h?.accepted ?? 0) + (h?.rejected ?? 0) + (h?.ignored ?? 0)
    parts.push(`Concerns ordered by the categories you act on most (${total} past decisions)`)
  }
  const rt = prefs[PREFERENCE_KEY.RISK_TOLERANCE]?.value
  if (rt) {
    const m = { high: 'higher risk tolerance — medium concerns de-emphasised',
                low:  'lower risk tolerance — availability & injury surfaced first',
                medium: 'balanced risk framing' }
    parts.push(`Risk tolerance (${rt}): ${m[rt] ?? rt}`)
  }
  const te = prefs[PREFERENCE_KEY.TRAINING_EMPHASIS]?.value
  if (te) parts.push(`Training focus surfaces your ${te} emphasis first`)
  const cs = prefs[PREFERENCE_KEY.COACHING_STYLE]?.value
  if (cs) parts.push(`Actions ordered for a ${cs} coaching style`)
  const comm = prefs[PREFERENCE_KEY.COMMUNICATION_STYLE]?.value
  if (comm === 'nurturing') parts.push('Welfare items raised for your nurturing communication style')

  return parts.join('. ')
}

// ── Empty personalisation ─────────────────────────────────────────────────────

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

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * Personalise a Match Readiness report. EMPHASIS ONLY — scores never change.
 *
 * @param {object} report  - a built MatchReadinessResponse
 * @param {object} profile - CoachProfile (read-only)
 * @param {object} opts    - { flags? }
 * @returns {{ data: object, personalisation: object }}
 */
export function personalise(report, profile, opts = {}) {
  if (!isFlagEnabled(PERSONALISATION_FLAG, opts?.flags)) {
    return { data: report, personalisation: emptyPersonalisation() }
  }
  if (!profile || (profile.observationCount ?? 0) < MIN_PROFILE_OBSERVATIONS) {
    return { data: report, personalisation: emptyPersonalisation() }
  }
  const signalsUsed = buildSignalsUsed(profile)
  if (!signalsUsed.length) {
    return { data: report, personalisation: emptyPersonalisation() }
  }

  // Re-order presentation arrays only — every score field is spread through unchanged.
  const data = {
    ...report,
    keyConcerns:        reorderConcerns(report.keyConcerns, profile),
    trainingFocus:      reorderTrainingFocus(report.trainingFocus, profile),
    recommendedActions: reorderActions(report.recommendedActions, profile),
    criticalPlayers:    reorderCriticalPlayers(report.criticalPlayers, profile),
  }

  const personalisation = {
    applied:           true,
    coachProfileId:    profile.coachId,
    profileVersion:    profile.profileVersion ?? null,
    overallConfidence: profile.overallConfidence ?? 0,
    signalsUsed,
    explanation:       buildExplanation(profile, signalsUsed),
  }

  return { data, personalisation }
}
