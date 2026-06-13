/**
 * AI Brain — Match Strategy Game Model (M26)
 *
 * Normalises the heterogeneous upstream inputs into a single, deterministic
 * "game model" the strategy engines reason over: our profile, the opponent's
 * dimension scores, the relative strength index, the resulting posture
 * (favourite / even / underdog), weather, referee, and constraints.
 *
 * Pure + deterministic. Tolerant of missing inputs (graceful degradation):
 * a missing input simply lowers confidence rather than throwing.
 */

import {
  GRADE, GRADE_META, FORMAT, FORMAT_META, POSTURE, POSTURE_MARGIN,
  WEATHER, isNum, clamp, round, round2,
} from './strategy-types.js'

/** Build a single evidence-backed recommendation. */
export function rec(id, recommendation, why, evidence = [], opts = {}) {
  return {
    id,
    recommendation,
    why,
    evidence: (evidence ?? []).filter(Boolean).slice(0, 8),
    priority: opts.priority ?? 'medium',
    confidence: typeof opts.confidence === 'number' ? round2(opts.confidence) : null,
  }
}

/** Build a strategy block (summary + intent + recommendations). */
export function block(summary, intent, recommendations, confidence) {
  const recs = (recommendations ?? []).filter(Boolean)
  return {
    summary,
    intent: intent ?? null,
    recommendations: recs,
    confidence: typeof confidence === 'number' ? round2(confidence) : null,
  }
}

const dimScore = (opponent, key) => {
  const e = opponent?.dimensions?.[key]
  return e && isNum(e.score) ? e.score : null
}
const dimEvidence = (opponent, key) => opponent?.dimensions?.[key]?.evidence ?? []

/** Coach DNA characteristic score (0–100, default 50). */
const dnaScore = (coachDNA, key) => {
  const c = coachDNA?.characteristics?.[key]
  return c && isNum(c.score) ? c.score : 50
}

/**
 * Our team strength proxy from Match Readiness + Selection Assistant.
 * Returns 0–100 (50 = neutral when unknown).
 */
function ourStrength(context) {
  const mr = context.matchReadiness ?? null
  const sel = context.selection ?? null
  const parts = []
  if (isNum(mr?.overallScore)) parts.push(mr.overallScore)
  if (isNum(mr?.availabilityScore)) parts.push(mr.availabilityScore)
  if (isNum(mr?.fitnessScore)) parts.push(mr.fitnessScore)
  // Coverage from the selection assistant: secure coverage ⇒ stronger.
  if (sel) {
    const cov = [sel.frontRowCoverage, sel.lineoutCoverage, sel.backlineBalance]
      .map(c => (c?.status === 'secure' ? 80 : c?.status === 'thin' ? 55 : c?.status === 'exposed' ? 30 : null))
      .filter(isNum)
    parts.push(...cov)
  }
  if (!parts.length) return { value: 50, known: false }
  return { value: round(parts.reduce((a, b) => a + b, 0) / parts.length), known: true }
}

/**
 * Opponent overall strength proxy from their dimension scores (those that mean
 * "stronger = higher"). Returns 0–100.
 */
function opponentStrength(opponent) {
  const keys = ['attackTendencies', 'defensiveTendencies', 'scrumProfile', 'lineoutProfile', 'breakdownSpeed', 'kickProfile']
  const vals = keys.map(k => dimScore(opponent, k)).filter(isNum)
  if (!vals.length) return { value: 50, known: false }
  return { value: round(vals.reduce((a, b) => a + b, 0) / vals.length), known: true }
}

export function buildGameModel(context = {}) {
  const grade = GRADE_META[context.grade] ? context.grade : GRADE.SENIOR
  const format = FORMAT_META[context.format] ? context.format : FORMAT.FIFTEENS
  const gm = GRADE_META[grade]
  const fm = FORMAT_META[format]

  const us = ourStrength(context)
  const them = opponentStrength(context.opponent)
  const strengthIndex = us.value - them.value          // >0 ⇒ we're stronger
  let posture = POSTURE.EVEN
  if (strengthIndex >= POSTURE_MARGIN) posture = POSTURE.FAVOURITE
  else if (strengthIndex <= -POSTURE_MARGIN) posture = POSTURE.UNDERDOG
  if (context.overrides?.posture && Object.values(POSTURE).includes(context.overrides.posture)) {
    posture = context.overrides.posture
  }

  const weather = Object.values(WEATHER).includes(context.weather) ? context.weather : WEATHER.DRY
  const referee = Array.isArray(context.refereeTendencies) ? context.refereeTendencies : []

  // Confidence reflects how much real input we had.
  let inputs = 0
  if (context.opponent?.dimensions) inputs++
  if (context.matchReadiness) inputs++
  if (context.selection) inputs++
  if (context.coachDNA?.characteristics) inputs++
  if (context.weeklyBrief) inputs++
  const confidence = round2(clamp(0.35 + inputs * 0.13, 0.3, 0.95))

  const sel = context.selection ?? null
  return {
    grade, format, gradeMeta: gm, formatMeta: fm,
    posture, strengthIndex,
    us, them,
    weather, referee,
    confidence,
    inputsAvailable: inputs,
    // our coverage statuses from the Selection Assistant (M22)
    frontRowStatus: sel?.frontRowCoverage?.status ?? null,
    lineoutStatus:  sel?.lineoutCoverage?.status ?? null,
    backlineStatus: sel?.backlineBalance?.status ?? null,
    selection: sel,
    // convenience accessors bound to this model
    dim: (key) => dimScore(context.opponent, key),
    dimEvidence: (key) => dimEvidence(context.opponent, key),
    dna: (key) => dnaScore(context.coachDNA, key),
    opponentId: context.opponent?.opponentId ?? null,
    matchImportance: context.matchImportance ?? 'normal',
  }
}
