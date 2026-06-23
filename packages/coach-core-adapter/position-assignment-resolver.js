/**
 * @coach-core-adapter — Coverage → Assignment Position Resolver (DORMANT)
 *
 * M133 resolves coarse Core positions as COVERAGE (a "Flanker" covers jerseys 6 AND 7), but
 * M122/M123 need ASSIGNMENT (each player has one specific position). This helper deterministically
 * splits coarse-family candidates across their specific positions, derived from the formation:
 *   Flanker → Blindside / Openside
 *   Wing    → LeftWing / RightWing
 *   Centre  → InsideCentre / OutsideCentre
 *
 * It performs no intelligence, scoring, ranking or selection — ordering is purely structural
 * (playerId ascending). Adapter-layer only. Pure deterministic: no Core, Redis, network,
 * filesystem, clock or randomness. Inputs are never mutated; output is deeply frozen.
 */

// coarse family token → its ordered specific Brain positions
const FAMILIES = Object.freeze({
  Flanker: Object.freeze(['Blindside', 'Openside']),
  Wing: Object.freeze(['LeftWing', 'RightWing']),
  Centre: Object.freeze(['InsideCentre', 'OutsideCentre']),
})

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function assertCandidates(candidates) {
  if (!Array.isArray(candidates)) throw new TypeError('resolvePositionAssignments requires an array of candidates')
  const seen = new Set()
  for (const c of candidates) {
    if (!isObj(c) || !isNonEmptyString(c.playerId) || !isNonEmptyString(c.position) ||
        typeof c.availability !== 'boolean' || !isFiniteNumber(c.confidence)) {
      throw new TypeError('resolvePositionAssignments: malformed candidate (requires { playerId, position, availability, confidence })')
    }
    if (seen.has(c.playerId)) throw new TypeError(`resolvePositionAssignments: duplicate playerId "${c.playerId}"`)
    seen.add(c.playerId)
  }
}

function assertFormation(formation) {
  if (!isObj(formation)) throw new TypeError('resolvePositionAssignments: malformed formation')
  const keys = Object.keys(formation)
  if (keys.length === 0) throw new TypeError('resolvePositionAssignments: malformed formation (empty)')
  for (const k of keys) {
    if (!isNonEmptyString(formation[k])) throw new TypeError(`resolvePositionAssignments: malformed formation at jersey "${k}"`)
  }
}

const byPlayerIdAsc = (a, b) => (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0)

/** Ordered specific-position slots for a coarse family, taken from the formation (jersey order). */
function slotsForFamily(formation, family) {
  const specific = new Set(FAMILIES[family])
  const slots = []
  for (const jersey of Object.keys(formation)) {
    if (specific.has(formation[jersey])) slots.push(formation[jersey])
  }
  return slots
}

/**
 * Deterministically assign coarse-family candidates to specific positions from the formation.
 *
 * @param {Array<{ playerId:string, position:string, availability:boolean, confidence:number }>} candidates
 * @param {Record<string,string>} formation  jersey → specific position
 * @returns {Readonly<{
 *   assignments: ReadonlyArray<{ playerId:string, position:string, availability:boolean, confidence:number }>,
 *   unresolved: ReadonlyArray<{ playerId:string, position:string, availability:boolean, confidence:number, reason:string }>,
 *   metadata: object
 * }>}
 */
export function resolvePositionAssignments(candidates, formation) {
  assertCandidates(candidates)
  assertFormation(formation)

  // 1. compute the coarse → specific assignment for each family (playerId asc → first open slot)
  const assignedPosition = new Map()   // playerId → specific position
  const unassignedIds = new Set()      // coarse candidates with no open slot
  for (const family of Object.keys(FAMILIES)) {
    const slots = slotsForFamily(formation, family)
    const familyCandidates = candidates.filter((c) => c.position === family).slice().sort(byPlayerIdAsc)
    for (let i = 0; i < familyCandidates.length; i++) {
      if (i < slots.length) assignedPosition.set(familyCandidates[i].playerId, slots[i])
      else unassignedIds.add(familyCandidates[i].playerId)
    }
  }

  // 2. build outputs in input order (coarse reassigned in place; non-coarse passed through)
  const assignments = []
  const unresolved = []
  for (const c of candidates) {
    if (FAMILIES[c.position]) {
      if (assignedPosition.has(c.playerId)) {
        assignments.push({ playerId: c.playerId, position: assignedPosition.get(c.playerId), availability: c.availability, confidence: c.confidence })
      } else {
        unresolved.push({ playerId: c.playerId, position: c.position, availability: c.availability, confidence: c.confidence, reason: 'no open assignment' })
      }
    } else {
      assignments.push({ playerId: c.playerId, position: c.position, availability: c.availability, confidence: c.confidence })
    }
  }

  return deepFreeze({
    assignments,
    unresolved,
    metadata: {
      candidateCount: candidates.length,
      assignedCount: assignments.length,
      unresolvedCount: unresolved.length,
      deterministic: true,
      adapterLayer: true,
    },
  })
}
