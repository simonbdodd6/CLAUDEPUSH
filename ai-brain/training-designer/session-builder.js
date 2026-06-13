/**
 * AI Brain — Training Session Builder (M25)
 *
 * Allocates the session minutes across phases (optimising for format, grade,
 * contact level, match importance and season phase), then fills each phase with
 * drills via the selector. Pure + deterministic.
 */

import {
  PHASE, PHASE_ORDER, PHASE_META, FORMAT, SEASON_PHASE, MATCH_IMPORTANCE, clamp, round,
} from './training-types.js'
import { selectPhaseDrills } from './drill-selector.js'
import { contactScaleFactor } from './welfare-engine.js'

/**
 * Compute the minute budget per phase. Returns { phaseKey: minutes } summing to
 * the session duration.
 */
export function allocateTime(constraints, overrides = {}) {
  const pct = {}
  for (const k of PHASE_ORDER) pct[k] = PHASE_META[k].basePct

  // Non-contact grades: drop the contact block AND contested set piece (no
  // contested scrum/lineout in young rugby); redistribute to skills/decisions/games.
  if (constraints.contactLevel === 'none') {
    const freed = pct[PHASE.CONTACT] + pct[PHASE.SET_PIECE]
    pct[PHASE.SKILL] += freed * 0.4
    pct[PHASE.DECISION] += freed * 0.3
    pct[PHASE.CONDITIONED] += freed * 0.3
    pct[PHASE.CONTACT] = 0
    pct[PHASE.SET_PIECE] = 0
  } else {
    // Welfare-driven contact reduction → spill into conditioned games.
    const csf = contactScaleFactor(constraints)
    if (csf < 1) {
      const freed = pct[PHASE.CONTACT] * (1 - csf)
      pct[PHASE.CONTACT] *= csf
      pct[PHASE.CONDITIONED] += freed
    }
  }

  // Format: sevens/tens reduce set-piece, add conditioning + conditioned games.
  const setMul = constraints.formatMeta.setPieceMul
  if (setMul < 1) {
    const freed = pct[PHASE.SET_PIECE] * (1 - setMul)
    pct[PHASE.SET_PIECE] *= setMul
    pct[PHASE.CONDITIONING] += freed * 0.5
    pct[PHASE.CONDITIONED] += freed * 0.5
  }

  // Match importance: high/cup_final → sharpen (more set-piece + conditioned, less conditioning/skill).
  if (constraints.matchImportance === MATCH_IMPORTANCE.HIGH || constraints.matchImportance === MATCH_IMPORTANCE.CUP_FINAL) {
    pct[PHASE.SET_PIECE] += 0.04
    pct[PHASE.CONDITIONED] += 0.02
    pct[PHASE.CONDITIONING] = Math.max(0.02, pct[PHASE.CONDITIONING] - 0.03)
    pct[PHASE.SKILL] = Math.max(0.08, pct[PHASE.SKILL] - 0.03)
  }

  // Season phase: pre-season → more conditioning; late/playoffs → taper conditioning.
  if (constraints.seasonPhase === SEASON_PHASE.PRESEASON) {
    pct[PHASE.CONDITIONING] += 0.05
    pct[PHASE.SET_PIECE] = Math.max(0.04, pct[PHASE.SET_PIECE] - 0.03)
    pct[PHASE.CONDITIONED] = Math.max(0.06, pct[PHASE.CONDITIONED] - 0.02)
  } else if (constraints.seasonPhase === SEASON_PHASE.LATE || constraints.seasonPhase === SEASON_PHASE.PLAYOFFS) {
    pct[PHASE.CONDITIONING] = Math.max(0.02, pct[PHASE.CONDITIONING] - 0.03)
    pct[PHASE.REVIEW] += 0.01
    pct[PHASE.SKILL] += 0.02
  }

  // Manual skip-phases override.
  for (const k of (overrides.skipPhases ?? [])) if (k in pct) pct[k] = 0

  // Renormalise and convert to minutes.
  const totalPct = PHASE_ORDER.reduce((s, k) => s + pct[k], 0) || 1
  const raw = {}
  for (const k of PHASE_ORDER) raw[k] = (pct[k] / totalPct) * constraints.durationMin

  const minutes = {}
  let allocated = 0
  for (const k of PHASE_ORDER) { minutes[k] = Math.round(raw[k]); allocated += minutes[k] }
  // Fix rounding drift on the skill block.
  minutes[PHASE.SKILL] += constraints.durationMin - allocated
  if (minutes[PHASE.SKILL] < 0) minutes[PHASE.SKILL] = 0
  return minutes
}

/**
 * Build all session phases (except review, handled by review-engine).
 * @returns {object} { [phaseKey]: { label, durationMin, activities } }
 */
export function buildPhases(objectives, constraints, overrides = {}) {
  const minutes = allocateTime(constraints, overrides)
  const phases = {}
  for (const k of PHASE_ORDER) {
    if (k === PHASE.REVIEW) continue
    const activities = selectPhaseDrills(k, minutes[k], objectives, constraints, {
      exclude: overrides.excludeDrills ?? [],
      pin: overrides.pinDrills ?? [],
    })
    const durationMin = activities.reduce((s, a) => s + a.estimatedDuration, 0)
    phases[k] = { label: PHASE_META[k].label, durationMin, activities }
  }
  return { phases, minutes }
}
