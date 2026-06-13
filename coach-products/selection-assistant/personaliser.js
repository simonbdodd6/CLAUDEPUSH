/**
 * Coach Products — Selection Assistant Personaliser (M22)
 *
 * Tailors a Selection Assistant assessment to a coach's learned preferences
 * from the M19 CoachProfile.
 *
 * HARD RULES:
 *   - READS the CoachProfile; NEVER mutates it.
 *   - NEVER mutates the incoming report.
 *   - EMPHASIS ONLY — re-orders advisory arrays (recommendedChanges,
 *     selectionWarnings, injuryRisks). It MUST NOT change the selected XV,
 *     bench balance, coverage objects, confidence or evidence. The squad the
 *     assistant picks is provably independent of the coach profile.
 *   - No profile / thin profile / flag off  →  report returned unchanged.
 *
 * Emphasis logic:
 *   - squadRotation: low → de-emphasise rotation/rest suggestions (coach keeps a
 *     settled XV); high → surface them.
 *   - riskTolerance: low → elevate coverage / injury items; high → soften medium.
 *   - communicationStyle nurturing → welfare-sourced injury risks first.
 */

import { PREFERENCE_KEY } from '../../ai-brain/learning/learning-types.js'
import { MIN_PROFILE_OBSERVATIONS, PERSONALISATION_FLAG, SEVERITY } from './selection-assistant-types.js'

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 }

function isFlagEnabled(flagName, flags = {}) {
  if (!flags || !(flagName in flags)) return true
  return Boolean(flags[flagName])
}

function pref(profile, key) {
  return profile?.preferences?.[key]?.value ?? null
}

/** Stable sort by descending weight; ties keep original order. Pure (copies). */
function stableSortByWeight(arr, weightOf) {
  return arr
    .map((item, i) => ({ item, i, w: weightOf(item) }))
    .sort((a, b) => (b.w - a.w) || (a.i - b.i))
    .map(x => x.item)
}

function sevWeight(severity) {
  return 2 - (SEVERITY_RANK[severity] ?? 2)   // high=2, medium=1, low=0
}

// ── Re-ordering (emphasis only) ───────────────────────────────────────────────

export function reorderChanges(changes, profile) {
  if (!changes?.length) return changes ?? []
  const rotation = pref(profile, PREFERENCE_KEY.SQUAD_ROTATION)
  const risk     = pref(profile, PREFERENCE_KEY.RISK_TOLERANCE)
  return stableSortByWeight(changes, c => {
    let w = sevWeight(c.priority)
    if (c.category === 'rotation') {
      if (rotation === 'high') w += 1.5
      else if (rotation === 'low') w -= 1.5
    }
    if (risk === 'low'  && (c.category === 'recruitment' || c.category === 'bench')) w += 0.5
    if (risk === 'high' && c.priority === SEVERITY.MEDIUM) w -= 0.5
    return w
  })
}

export function reorderWarnings(warnings, profile) {
  if (!warnings?.length) return warnings ?? []
  const risk = pref(profile, PREFERENCE_KEY.RISK_TOLERANCE)
  return stableSortByWeight(warnings, w => {
    let s = sevWeight(w.severity)
    if (risk === 'low'  && w.severity === SEVERITY.MEDIUM) s += 0.4
    if (risk === 'high' && w.severity === SEVERITY.MEDIUM) s -= 0.4
    return s
  })
}

export function reorderInjuryRisks(risks, profile) {
  if (!risks?.length) return risks ?? []
  const comm = pref(profile, PREFERENCE_KEY.COMMUNICATION_STYLE)
  if (comm !== 'nurturing') return risks
  const welfareSrc = new Set(['welfare', 'squad'])
  return stableSortByWeight(risks, r => sevWeight(r.severity) + (welfareSrc.has(r.source) ? 0.5 : 0))
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
  const sr = prefs[PREFERENCE_KEY.SQUAD_ROTATION]?.value
  if (sr) {
    parts.push(sr === 'low' ? 'Settled-XV preference — rotation suggestions de-emphasised'
      : sr === 'high' ? 'Rotation preference — rest/rotation suggestions surfaced'
        : 'Balanced rotation framing')
  }
  const rt = prefs[PREFERENCE_KEY.RISK_TOLERANCE]?.value
  if (rt) parts.push(`Risk tolerance (${rt}) applied to warning order`)
  const comm = prefs[PREFERENCE_KEY.COMMUNICATION_STYLE]?.value
  if (comm === 'nurturing') parts.push('Welfare risks raised for your nurturing communication style')
  return parts.join('. ')
}

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
 * Personalise a Selection Assistant report. EMPHASIS ONLY — the XV, coverage,
 * confidence and evidence are never changed.
 *
 * @param {object} report  - a built SelectionAssistantResponse
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

  const data = {
    ...report,
    recommendedChanges: reorderChanges(report.recommendedChanges, profile),
    selectionWarnings:  reorderWarnings(report.selectionWarnings, profile),
    injuryRisks:        reorderInjuryRisks(report.injuryRisks, profile),
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
