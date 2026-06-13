/**
 * AI Brain — Live Territory Engine (M27)
 *
 * Produces the territory map, the dominant collision zone, and the pressure
 * index (who is applying pressure, where, right now). Deterministic.
 */

import { ZONE, ZONE_ORDER, EVENT, clamp, round, pct } from './match-state.js'

const PRESSURE_WINDOW = 6
const COLLISION_TYPES = new Set([EVENT.TACKLE, EVENT.RUCK, EVENT.CARRY, EVENT.MAUL])

export function buildTerritoryMap(state, events) {
  const zones = { own_22: { us: 0, them: 0 }, own_half: { us: 0, them: 0 }, opp_half: { us: 0, them: 0 }, opp_22: { us: 0, them: 0 } }
  let any = false
  for (const e of events) {
    if (!e.zone || !zones[e.zone]) continue
    any = true
    zones[e.zone][e.team === 'us' ? 'us' : 'them']++
  }
  return {
    zones,
    territoryPct: state.territory,
    summary: state.territory?.us != null ? `We have ~${state.territory.us}% of territory` : 'Territory unknown',
    confidence: any ? 0.7 : 0,
    fallback: 'Territory not tracked — rely on score and possession',
  }
}

export function buildDominantCollisionZone(state, events) {
  const counts = { own_22: 0, own_half: 0, opp_half: 0, opp_22: 0 }
  const winner = { own_22: { us: 0, them: 0 }, own_half: { us: 0, them: 0 }, opp_half: { us: 0, them: 0 }, opp_22: { us: 0, them: 0 } }
  const evidence = []
  for (const e of events) {
    if (!COLLISION_TYPES.has(e.type) || !e.zone || !(e.zone in counts)) continue
    counts[e.zone]++
    winner[e.zone][e.team === 'us' ? 'us' : 'them']++
    if (e.eventId) evidence.push(e.eventId)
  }
  let zone = null, max = 0
  for (const z of ZONE_ORDER) if (counts[z] > max) { max = counts[z]; zone = z }
  const w = zone ? winner[zone] : null
  const winningSide = w ? (w.us > w.them ? 'us' : w.them > w.us ? 'them' : 'even') : null
  return {
    zone, collisions: max, winningSide,
    summary: zone ? `Most collisions in the ${zone.replace('_', ' ')} — ${winningSide === 'us' ? 'we are winning them' : winningSide === 'them' ? 'they are winning them' : 'evenly contested'}` : 'No collision data',
    evidence: evidence.slice(-8),
    confidence: max >= 4 ? 0.7 : max >= 1 ? 0.45 : 0,
    fallback: 'Collision zone not tracked — assume contest around halfway',
  }
}

export function buildPressureIndex(state, events) {
  const clock = state.clock
  const recent = events.filter(e => e.minute >= clock - PRESSURE_WINDOW)
  let onThem = 0, onUs = 0
  const evidence = []
  for (const e of recent) {
    if (e.zone === ZONE.OPP_22 && e.team === 'us') { onThem++; if (e.eventId) evidence.push(e.eventId) }
    if (e.zone === ZONE.OWN_22 && e.team === 'them') { onUs++; if (e.eventId) evidence.push(e.eventId) }
  }
  const value = clamp((onThem - onUs) * 12, -100, 100)   // + = we pressure them
  return {
    value,
    onThem, onUs,
    side: value > 12 ? 'attacking' : value < -12 ? 'defending' : 'neutral',
    summary: value > 12 ? 'We are applying sustained pressure' : value < -12 ? 'We are under sustained pressure' : 'Pressure is even',
    evidence: evidence.slice(-8),
    confidence: recent.length >= 3 ? 0.7 : recent.length >= 1 ? 0.45 : 0,
    fallback: 'Pressure unknown — manage the next 5 minutes conservatively',
  }
}
