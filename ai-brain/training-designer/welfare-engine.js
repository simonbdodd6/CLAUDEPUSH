/**
 * AI Brain — Training Welfare Engine (M25)
 *
 * Applies player-welfare safeguards to the session: classifies each activity's
 * welfare impact, scales contact/intensity when players are injured or carrying
 * high load, and produces welfare notes + protected-player guidance.
 *
 * Pure + deterministic. Welfare always trumps optimisation.
 */

import { WELFARE_IMPACT } from './training-types.js'

/** Welfare impact of a single activity given the drill + constraints. */
export function activityWelfareImpact(drill, constraints) {
  if (drill.contact === 'full') return WELFARE_IMPACT.HIGH
  if (drill.contact === 'light') return WELFARE_IMPACT.MODERATE
  if (drill.intensity >= 4) return WELFARE_IMPACT.MODERATE
  return WELFARE_IMPACT.LOW
}

/**
 * Whether a full-contact phase should be reduced (and by how much) given the
 * welfare picture. Returns a 0–1 scale factor for contact duration/intensity.
 */
export function contactScaleFactor(constraints) {
  const pressure = constraints.welfarePressure
  if (constraints.contactLevel === 'none') return 0
  if (pressure >= 8) return 0.5
  if (pressure >= 4) return 0.75
  return 1
}

/** Global welfare notes for the session. */
export function buildWelfareNotes(constraints) {
  const notes = []
  if (constraints.injuredIds.length) {
    notes.push(`${constraints.injuredIds.length} player(s) unavailable/injured — modify or rest from contact: ${constraints.injuredIds.join(', ')}`)
  }
  if (constraints.doubtfulIds.length) {
    notes.push(`${constraints.doubtfulIds.length} doubtful player(s) — non-contact / monitored involvement: ${constraints.doubtfulIds.join(', ')}`)
  }
  if (constraints.highLoadIds.length) {
    notes.push(`${constraints.highLoadIds.length} high-load player(s) — cap minutes and avoid heavy collisions: ${constraints.highLoadIds.join(', ')}`)
  }
  if (constraints.welfareFlagIds.length) {
    notes.push(`${constraints.welfareFlagIds.length} welfare flag(s) — coach to check in individually: ${constraints.welfareFlagIds.join(', ')}`)
  }
  if (contactScaleFactor(constraints) < 1 && constraints.contactLevel !== 'none') {
    notes.push('Contact volume reduced this week to protect player welfare')
  }
  return notes
}
