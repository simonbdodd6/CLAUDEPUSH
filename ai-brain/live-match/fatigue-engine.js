/**
 * AI Brain — Live Fatigue Engine (M27)
 *
 * Models per-side fatigue from elapsed time, collision load and numerical
 * disadvantage (14 men work harder). Produces fatigue alerts. Deterministic.
 */

import { EVENT, clamp, round, rec } from './match-state.js'

const COLLISION_TYPES = new Set([EVENT.TACKLE, EVENT.RUCK, EVENT.CARRY, EVENT.MAUL])

function sideFatigue(state, events, side) {
  const timeBase = (state.clock / state.fullTime) * 60
  const collisions = events.filter(e => COLLISION_TYPES.has(e.type) && e.team === side).length
  const load = Math.min(30, collisions * 0.4)
  const onField = state.playersOnField[side]
  const down = onField < state.basePlayers
  const downPenalty = down ? (state.basePlayers - onField) * 12 : 0
  return clamp(round(timeBase + load + downPenalty), 0, 100)
}

export function buildFatigue(state, events) {
  const us = sideFatigue(state, events, 'us')
  const them = sideFatigue(state, events, 'them')
  const alerts = []

  if (us >= 75) {
    alerts.push(rec('fat-us', 'Our fatigue is high — get fresh legs on and simplify our game',
      `Fatigue index ${us}/100${state.numericalAdvantage < 0 ? ' (working with fewer players)' : ''} at ${state.clock}'`,
      [], { priority: 'high', confidence: 0.7, fallback: 'Manage energy: slow the tempo and use the bench' }))
  }
  if (them >= 75) {
    alerts.push(rec('fat-them', 'Opponent is tiring — raise tempo and keep the ball alive to expose them',
      `Opponent fatigue index ${them}/100 at ${state.clock}'`, [],
      { priority: 'medium', confidence: 0.65, fallback: 'Push the pace late to exploit tiring opponents' }))
  }
  if (state.numericalAdvantage < 0) {
    alerts.push(rec('fat-14', 'Down to ' + state.playersOnField.us + ' — share the defensive load and protect tiring forwards',
      'Playing with fewer players accelerates fatigue', [],
      { priority: 'high', confidence: 0.7, fallback: 'Tighten the game and reduce time defending' }))
  }

  return {
    us, them,
    differential: us - them,
    alerts,
    summary: `Fatigue — us ${us}/100, them ${them}/100`,
    confidence: state.eventCount >= 5 ? 0.65 : 0.4,
    fallback: 'Assume normal fatigue progression with the clock',
  }
}
