/**
 * AI Brain — Match Territory & Kicking Engine (M26)
 *
 * Produces the kick strategy, territory plan, kick-off plan and restart plan
 * from the opponent's kicking/back-field/restart picture, weather and posture.
 * Pure + deterministic, every rec evidence-backed.
 */

import { rec, block } from './game-model.js'
import { INTENT, POSTURE, WEATHER, WEAK_DIM, STRONG_DIM } from './strategy-types.js'

export function buildKickStrategy(model) {
  const recs = []
  const oppKick = model.dim('kickProfile')
  const oppCounter = model.dim('counterattackFrequency')
  const wet = model.weather === WEATHER.WET
  const windy = model.weather === WEATHER.WINDY

  if (oppKick != null && oppKick <= WEAK_DIM) {
    recs.push(rec('kick-counter', 'Hold ball and counter their kicks from deep — their kicking is poor',
      `Opponent kicking rated weak (${oppKick}/100)`, model.dimEvidence('kickProfile'),
      { priority: 'high', confidence: 0.75 }))
  }
  if (oppCounter != null && oppCounter >= STRONG_DIM) {
    recs.push(rec('kick-contest', 'Favour contestable box kicks with a strong chase over long territorial kicks',
      `They counter dangerously (${oppCounter}/100) — keep kicks contestable`, model.dimEvidence('counterattackFrequency'),
      { priority: 'high', confidence: 0.7 }))
  }
  if (wet) {
    recs.push(rec('kick-territory-wet', 'Kick for territory and pressure — keep ball-in-hand phases low in the wet',
      'Wet conditions raise handling-error risk', [], { priority: 'high', confidence: 0.7 }))
  }
  if (windy) {
    recs.push(rec('kick-wind', 'Use the wind: long kicking with it, contestable/short against it',
      'Wind materially changes kick selection by end', [], { priority: 'medium', confidence: 0.65 }))
  }
  if (model.posture === POSTURE.UNDERDOG && !recs.some(r => r.id.startsWith('kick-territory'))) {
    recs.push(rec('kick-territory', 'Kick for territory and play the game in their half',
      'Underdog posture — pressure and field position over possession', [], { priority: 'medium', confidence: 0.65 }))
  }
  if (!recs.length) {
    recs.push(rec('kick-base', 'Smart, contestable kicking with a connected chase line',
      'Default kicking discipline', [], { priority: 'medium', confidence: 0.5 }))
  }
  const intent = (wet || model.posture === POSTURE.UNDERDOG) ? INTENT.TERRITORIAL : INTENT.CONTROL
  return block('Kicking game tuned to opponent back-field and conditions', intent, recs, model.confidence)
}

export function buildTerritoryPlan(model) {
  const discipline = model.dim('disciplineProfile')
  const recs = []
  // Opponent penalty-prone → play in their half and take points.
  if (discipline != null && discipline <= WEAK_DIM) {
    recs.push(rec('terr-half', 'Camp in their half — they are penalty-prone; kick the points and build pressure',
      `Opponent discipline rated weak (${discipline}/100)`, model.dimEvidence('disciplineProfile'),
      { priority: 'high', confidence: 0.8 }))
  }
  recs.push(rec('terr-exit', 'Exit cleanly from our own 22 — first phase clearance, no risk inside our half',
    'Field-position discipline reduces conceded points', [], { priority: 'medium', confidence: 0.7 }))
  if (model.posture === POSTURE.FAVOURITE) {
    recs.push(rec('terr-pin', 'Pin them in their 22 and squeeze for set-piece penalties',
      'Favourite posture — convert territory into scoreboard', [], { priority: 'medium', confidence: 0.7 }))
  }
  return block('Win and hold field position', INTENT.TERRITORIAL, recs, model.confidence)
}

export function buildKickoffPlan(model) {
  const recs = []
  const oppRestart = model.dim('restartProfile')
  recs.push(rec('ko-receipt', 'Set the catch pod and target a clean first-phase exit on receipt',
    'Secure restart receipt prevents early pressure', [], { priority: 'medium', confidence: 0.65 }))
  if (oppRestart != null && oppRestart <= WEAK_DIM) {
    recs.push(rec('ko-contest', 'Contest aggressively on our restart — they struggle to retain',
      `Opponent restart retention weak (${oppRestart}/100)`, model.dimEvidence('restartProfile'),
      { priority: 'high', confidence: 0.75 }))
  } else {
    recs.push(rec('ko-long', 'Mix long restarts with the chase to apply field-position pressure',
      'Vary restart length to deny easy receipt', [], { priority: 'low', confidence: 0.55 }))
  }
  return block('Kick-off & receipt plan', null, recs, model.confidence)
}

export function buildRestartPlan(model) {
  const recs = []
  const oppRestart = model.dim('restartProfile')
  if (oppRestart != null && oppRestart >= STRONG_DIM) {
    recs.push(rec('re-long', 'Go long and chase hard — they retain their own restarts well',
      `Opponent restart retention strong (${oppRestart}/100)`, model.dimEvidence('restartProfile'),
      { priority: 'medium', confidence: 0.7 }))
  } else {
    recs.push(rec('re-contest', 'Contest the drop zone — pressure their restart receipt',
      `Opponent restart retention ${oppRestart != null ? `(${oppRestart}/100)` : 'unknown'} — apply pressure`, model.dimEvidence('restartProfile'),
      { priority: 'medium', confidence: 0.6 }))
  }
  recs.push(rec('re-reset', 'After conceding, reset shape before the restart — no soft second scores',
    'Concession discipline protects momentum', [], { priority: 'medium', confidence: 0.65 }))
  return block('Restart (22 drop-out & post-score) plan', null, recs, model.confidence)
}
