/**
 * AI Brain — Coach DNA Season Layer (M23)
 *
 * Groups observations into rugby seasons and computes season-over-season
 * evolution. Pure and deterministic — season inference uses an observation's
 * explicit `season` label, or its recordedAt date (Aug–Jul rugby year), never
 * a wall-clock.
 */

import { CHARACTERISTIC_KEYS, CHARACTERISTIC_META, TREND_DELTA, DISCOVERY_CONFIDENCE, MIN_OBSERVATIONS_FOR_SIGNAL } from './coach-dna-types.js'

export const UNKNOWN_SEASON = 'unknown'

/**
 * Derive the rugby season label for an observation.
 *   - explicit eventData.season wins
 *   - else from recordedAt (YYYY-MM-DD): month ≥ 8 → "YYYY/YYYY+1", else "YYYY-1/YYYY"
 *   - else UNKNOWN_SEASON
 */
export function seasonOf(obs) {
  const explicit = obs?.eventData?.season
  if (explicit) return String(explicit)
  const d = obs?.recordedAt
  if (typeof d === 'string') {
    const m = d.match(/^(\d{4})-(\d{2})/)
    if (m) {
      const y = Number(m[1]), mo = Number(m[2])
      return mo >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`
    }
  }
  return UNKNOWN_SEASON
}

/** Group observations by season. @returns {Map<string, object[]>} insertion = sorted seasons */
export function groupBySeason(observations) {
  const obs = Array.isArray(observations) ? observations : []
  const map = new Map()
  for (const o of obs) {
    const s = seasonOf(o)
    if (!map.has(s)) map.set(s, [])
    map.get(s).push(o)
  }
  // Return a season-sorted map (unknown last)
  const sorted = new Map()
  for (const s of [...map.keys()].sort(seasonCompare)) sorted.set(s, map.get(s))
  return sorted
}

/** Sort season labels ascending; UNKNOWN_SEASON always last. */
export function seasonCompare(a, b) {
  if (a === UNKNOWN_SEASON) return 1
  if (b === UNKNOWN_SEASON) return -1
  return a < b ? -1 : a > b ? 1 : 0
}

/** Ordered list of real (non-unknown) seasons present in the stream. */
export function seasonsIn(observations) {
  return [...groupBySeason(observations).keys()].filter(s => s !== UNKNOWN_SEASON)
}

function direction(delta) {
  if (delta >= TREND_DELTA) return 'rising'
  if (delta <= -TREND_DELTA) return 'falling'
  return 'stable'
}

/**
 * Compute per-characteristic changes between two CoachDNA snapshots.
 * @returns {{key,label,from,to,delta,direction}[]}
 */
export function diffCharacteristics(prevDna, curDna) {
  return CHARACTERISTIC_KEYS.map(key => {
    const from = prevDna.characteristics[key]?.score ?? 50
    const to   = curDna.characteristics[key]?.score ?? 50
    const delta = to - from
    return { key, label: CHARACTERISTIC_META[key].label, from, to, delta, direction: direction(delta) }
  })
}

/**
 * Identify characteristics newly "discovered" in `curDna` relative to `prevDna`
 * (crossed the discovery threshold this period).
 */
export function newlyDiscovered(prevDna, curDna) {
  const out = []
  for (const key of CHARACTERISTIC_KEYS) {
    const before = prevDna?.characteristics?.[key]
    const after  = curDna.characteristics[key]
    const wasKnown = before && before.confidence >= DISCOVERY_CONFIDENCE && before.observationCount >= MIN_OBSERVATIONS_FOR_SIGNAL
    const isKnown  = after.confidence >= DISCOVERY_CONFIDENCE && after.observationCount >= MIN_OBSERVATIONS_FOR_SIGNAL
    if (isKnown && !wasKnown) {
      out.push({ key, label: after.label, score: after.score, confidence: after.confidence, descriptor: after.descriptor })
    }
  }
  return out
}
