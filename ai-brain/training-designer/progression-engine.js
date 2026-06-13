/**
 * AI Brain — Training Progression Engine (M25)
 *
 * Adapts a drill to the age grade and season phase: caps decision complexity,
 * adds a grade-appropriate variant note (e.g. tag/touch for non-contact grades),
 * and tunes volume by season phase. Pure + deterministic.
 */

import { clamp, SEASON_PHASE } from './training-types.js'

/**
 * Return { decisionComplexity, variantNotes[] } for a drill under the grade /
 * season constraints. Never mutates the drill.
 */
export function progressDrill(drill, constraints) {
  const notes = []
  let complexity = clamp(drill.decisionComplexity, 1, constraints.complexityCap)

  if (constraints.contactLevel === 'none' && (drill.contact === 'light' || drill.contact === 'full')) {
    notes.push('Tag/touch variant — no contact at this grade')
  } else if (constraints.contactLevel === 'light' && drill.contact === 'full') {
    notes.push('Controlled-contact variant — technique focus, no full collisions')
  }

  if (constraints.gradeIndex <= 1) {
    notes.push('Keep instructions short; maximise ball touches and fun')
  }

  if (constraints.seasonPhase === SEASON_PHASE.PRESEASON) {
    notes.push('Pre-season: add a set / extend work blocks')
  } else if (constraints.seasonPhase === SEASON_PHASE.LATE || constraints.seasonPhase === SEASON_PHASE.PLAYOFFS) {
    notes.push('In-season taper: sharpen, reduce volume')
  }

  return { decisionComplexity: complexity, variantNotes: notes }
}
