/**
 * AI Brain — Match Bench Engine (M26)
 *
 * Plans the impact bench: how to use replacements to win the closing phase,
 * informed by the opponent's late-game / fitness picture and our own bench
 * coverage. Pure + deterministic.
 */

import { rec, block } from './game-model.js'
import { POSTURE, WEAK_DIM, STRONG_DIM } from './strategy-types.js'

export function buildBenchPlan(model) {
  const recs = []
  const oppFitness = model.dim('fitnessTrends')
  const oppLate = model.dim('lateGameBehaviour')
  const oppSubs = model.dim('substitutionBehaviour')
  const benchSize = model.formatMeta.benchSize

  recs.push(rec('bench-frontrow', 'Protect the front-row first — keep a hooker + both prop sides covered',
    'Front-row cover prevents uncontested scrums', model.selection?.frontRowCoverage?.status === 'exposed' ? [] : [],
    { priority: 'high', confidence: 0.8 }))

  if (oppFitness != null && oppFitness <= WEAK_DIM) {
    recs.push(rec('bench-finish', 'Load the bench with finishers and unleash energy after 55\' — they fade late',
      `Opponent fades late (fitness ${oppFitness}/100)`, model.dimEvidence('fitnessTrends'),
      { priority: 'high', confidence: 0.75 }))
  } else if (oppFitness != null && oppFitness >= STRONG_DIM) {
    recs.push(rec('bench-match', 'Match their bench impact — stagger replacements to keep our intensity into the last 20',
      `Opponent finishes strong (fitness ${oppFitness}/100)`, model.dimEvidence('fitnessTrends'),
      { priority: 'medium', confidence: 0.7 }))
  }

  if (oppLate != null && oppLate <= WEAK_DIM) {
    recs.push(rec('bench-closeout', 'Back ourselves in a tight finish — they concede late',
      `Opponent concedes late (${oppLate}/100)`, model.dimEvidence('lateGameBehaviour'),
      { priority: 'medium', confidence: 0.7 }))
  }

  if (oppSubs != null && oppSubs <= WEAK_DIM) {
    recs.push(rec('bench-tempo', 'Raise tempo when their starters tire — their bench adds little',
      `Opponent bench impact low (${oppSubs}/100)`, model.dimEvidence('substitutionBehaviour'),
      { priority: 'medium', confidence: 0.65 }))
  }

  if (model.posture === POSTURE.UNDERDOG) {
    recs.push(rec('bench-hold', 'Hold your impact forwards until the game is in the balance late on',
      'Underdog posture — keep the game alive for a late surge', [], { priority: 'medium', confidence: 0.6 }))
  }

  return block(`Impact bench plan (${benchSize} replacements)`, null, recs, model.confidence)
}
