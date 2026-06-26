/**
 * @coach-intelligence — Match Readiness Explanations (M208, DORMANT, read-only)
 *
 * Explains, in plain rugby language, WHY a player's readiness looks the way it does — so the Brain
 * never just emits a score. It reports positive factors, limiting factors, missing-information
 * warnings, and a confidence note, all as deterministic FIXED-TEMPLATE strings (no generated/AI
 * language). It NEVER recommends selecting or dropping a player and never overrides coach judgement —
 * it only describes what the readiness inputs say. The coach decides.
 *
 * Pure and side-effect free: no AI/LLM, network, filesystem, persistence, randomness, clock, or
 * timestamps. Input is never mutated; output is deeply frozen.
 *
 * Input (a per-player readiness record):
 *   {
 *     playerId: string,                                  // required
 *     availability?: 'available'|'unavailable'|'maybe',  // optional
 *     fitness?: 'fit'|'returning'|'injured',             // optional
 *     attendance?: ('good'|'average'|'poor') | number,   // optional (number = rate in [0,1])
 *     suspended?: boolean,                               // optional (default: treated as not suspended)
 *   }
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const sortByCode = (a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)

// fixed, coach-friendly templates — descriptive observations only, never advice
const POSITIVE = Object.freeze({
  AVAILABLE: 'Marked available for this fixture',
  FULLY_FIT: 'Reported fully fit',
  GOOD_ATTENDANCE: 'Strong recent training attendance',
})
const LIMITING = Object.freeze({
  UNAVAILABLE: 'Marked unavailable for this fixture',
  TENTATIVE_AVAILABILITY: 'Availability not yet confirmed',
  RETURNING_FROM_INJURY: 'Recently returned from injury',
  INJURED: 'Currently carrying an injury',
  POOR_ATTENDANCE: 'Limited recent training attendance',
  SUSPENDED: 'Currently suspended',
})
const MISSING = Object.freeze({
  NO_AVAILABILITY_DATA: 'No availability response on record',
  NO_FITNESS_DATA: 'No fitness status on record',
  NO_ATTENDANCE_DATA: 'No recent attendance data on record',
})
const CONFIDENCE_LABEL = Object.freeze({
  HIGH: 'High confidence — availability, fitness, and attendance are all known',
  MEDIUM: 'Moderate confidence — some readiness information is missing',
  LOW: 'Low confidence — key readiness information is missing',
})

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

const factors = (codes, map) => codes.map((code) => ({ code, label: map[code] })).sort(sortByCode)

/** Normalise attendance (level string or rate number) to 'good' | 'average' | 'poor' | null. */
function attendanceLevel(v) {
  if (typeof v === 'string') {
    const l = v.trim().toLowerCase()
    return l === 'good' || l === 'average' || l === 'poor' ? l : null
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v >= 0.7) return 'good'
    if (v < 0.4) return 'poor'
    return 'average'
  }
  return null
}

const AVAILABILITY = new Set(['available', 'unavailable', 'maybe'])
const FITNESS = new Set(['fit', 'returning', 'injured'])

/**
 * Explain a single player's readiness.
 *
 * @param {object} input  a per-player readiness record
 * @returns {Readonly<{ playerId:string,
 *   positiveFactors: ReadonlyArray<{code:string,label:string}>,
 *   limitingFactors: ReadonlyArray<{code:string,label:string}>,
 *   missingInformation: ReadonlyArray<{code:string,label:string}>,
 *   confidence: Readonly<{ level:string, label:string }> }>}
 */
export function explainPlayerReadiness(input) {
  if (!isObj(input) || !isNonEmptyString(input.playerId)) {
    throw new TypeError('explainPlayerReadiness requires a record with a non-empty string playerId')
  }

  const positive = []
  const limiting = []
  const missing = []

  // availability
  const availability = typeof input.availability === 'string' ? input.availability.trim().toLowerCase() : null
  if (availability === 'available') positive.push('AVAILABLE')
  else if (availability === 'unavailable') limiting.push('UNAVAILABLE')
  else if (availability === 'maybe') limiting.push('TENTATIVE_AVAILABILITY')
  else if (!AVAILABILITY.has(availability)) missing.push('NO_AVAILABILITY_DATA')

  // fitness
  const fitness = typeof input.fitness === 'string' ? input.fitness.trim().toLowerCase() : null
  if (fitness === 'fit') positive.push('FULLY_FIT')
  else if (fitness === 'returning') limiting.push('RETURNING_FROM_INJURY')
  else if (fitness === 'injured') limiting.push('INJURED')
  else if (!FITNESS.has(fitness)) missing.push('NO_FITNESS_DATA')

  // attendance
  const attendance = attendanceLevel(input.attendance)
  if (attendance === 'good') positive.push('GOOD_ATTENDANCE')
  else if (attendance === 'poor') limiting.push('POOR_ATTENDANCE')
  else if (attendance === null) missing.push('NO_ATTENDANCE_DATA')
  // 'average' is known but neither a positive nor a limiting factor

  // discipline (suspension is treated as known: absent/false ⇒ not suspended, no factor)
  if (input.suspended === true) limiting.push('SUSPENDED')

  // confidence in the assessment = how complete the readiness inputs are
  const level = missing.length === 0 ? 'HIGH' : missing.length === 1 ? 'MEDIUM' : 'LOW'

  return deepFreeze({
    playerId: input.playerId,
    positiveFactors: factors(positive, POSITIVE),
    limitingFactors: factors(limiting, LIMITING),
    missingInformation: factors(missing, MISSING),
    confidence: { level, label: CONFIDENCE_LABEL[level] },
  })
}
