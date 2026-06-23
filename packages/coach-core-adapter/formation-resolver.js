/**
 * @coach-core-adapter — Formation & Position-Group Resolver (DORMANT)
 *
 * Closes the structural gap between Coach's Eye Core positions and the Brain selection pipeline.
 * Core may only know coarse positions ("Flanker", "Wing", "Centre"); the pipeline fills specific
 * jerseys (6/7, 11/14, 12/13). Given assembled candidates, this reports which candidates can
 * cover each jersey of a formation, applying position groups so a coarse Core position counts
 * toward its specific jerseys. It assigns no team and invents no positions — coverage only.
 *
 * Adapter-layer only. Pure, deterministic: no LLM, network, storage, Redis, filesystem, clock
 * or randomness. Inputs are never mutated; output is deeply frozen.
 *
 * NOTE: the default formation is defined LOCALLY (identical to the Brain's M123 DEFAULT_FORMATION)
 * rather than imported, to keep this adapter layer independent of the intelligence package it
 * feeds. Callers can override it via options.formation.
 */

export const DEFAULT_FORMATION = Object.freeze({
  1: 'LH', 2: 'Hooker', 3: 'TH', 4: 'Lock', 5: 'Lock', 6: 'Blindside', 7: 'Openside', 8: 'Number8',
  9: 'ScrumHalf', 10: 'FlyHalf', 11: 'LeftWing', 12: 'InsideCentre', 13: 'OutsideCentre', 14: 'RightWing', 15: 'Fullback',
})

export const DEFAULT_POSITION_GROUPS = Object.freeze({
  Blindside: Object.freeze(['Blindside', 'Flanker']),
  Openside: Object.freeze(['Openside', 'Flanker']),
  LeftWing: Object.freeze(['LeftWing', 'Wing']),
  RightWing: Object.freeze(['RightWing', 'Wing']),
  InsideCentre: Object.freeze(['InsideCentre', 'Centre']),
  OutsideCentre: Object.freeze(['OutsideCentre', 'Centre']),
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

/** Validate the assembled candidates and reject duplicate playerIds. */
function assertCandidates(candidates) {
  if (!Array.isArray(candidates)) throw new TypeError('resolveFormationFromCandidates requires an array of candidates')
  const seen = new Set()
  for (const c of candidates) {
    if (!isObj(c) || !isNonEmptyString(c.playerId) || !isNonEmptyString(c.position) ||
        typeof c.availability !== 'boolean' || !isFiniteNumber(c.confidence)) {
      throw new TypeError('resolveFormationFromCandidates: malformed candidate (requires { playerId, position, availability, confidence })')
    }
    if (seen.has(c.playerId)) throw new TypeError(`resolveFormationFromCandidates: duplicate playerId "${c.playerId}"`)
    seen.add(c.playerId)
  }
}

/** Validate a formation: object of jersey → non-empty position string. */
function assertFormation(formation) {
  if (!isObj(formation)) throw new TypeError('resolveFormationFromCandidates: malformed formation')
  const keys = Object.keys(formation)
  if (keys.length === 0) throw new TypeError('resolveFormationFromCandidates: malformed formation (empty)')
  for (const k of keys) {
    if (!isNonEmptyString(formation[k])) throw new TypeError(`resolveFormationFromCandidates: malformed formation at jersey "${k}"`)
  }
}

/** Validate position groups: object of position → array of non-empty position strings. */
function assertPositionGroups(positionGroups) {
  if (!isObj(positionGroups)) throw new TypeError('resolveFormationFromCandidates: malformed positionGroups')
  for (const k of Object.keys(positionGroups)) {
    const group = positionGroups[k]
    if (!Array.isArray(group) || !group.every(isNonEmptyString)) {
      throw new TypeError(`resolveFormationFromCandidates: malformed positionGroups at "${k}"`)
    }
  }
}

const byConfidenceThenId = (a, b) =>
  (b.confidence - a.confidence) || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0)

/**
 * Resolve which candidates can cover each jersey of a formation, applying position groups so a
 * coarse Core position counts toward its specific jerseys.
 *
 * @param {Array<{ playerId:string, position:string, availability:boolean, confidence:number }>} candidates
 * @param {{ formation?: Record<string,string>, positionGroups?: Record<string,string[]> }} [options]
 * @returns {Readonly<{
 *   formation: Record<string,string>,
 *   positionGroups: Record<string,string[]>,
 *   coverage: ReadonlyArray<Readonly<{ jersey:string, position:string, candidateCount:number, candidateIds:string[] }>>,
 *   unresolved: ReadonlyArray<Readonly<{ jersey:string, position:string, reason:string }>>,
 *   metadata: object
 * }>}
 */
export function resolveFormationFromCandidates(candidates, options = {}) {
  assertCandidates(candidates)
  if (!isObj(options)) throw new TypeError('resolveFormationFromCandidates: options must be an object')

  if (options.formation !== undefined) assertFormation(options.formation)
  if (options.positionGroups !== undefined) assertPositionGroups(options.positionGroups)

  const formation = options.formation !== undefined ? options.formation : DEFAULT_FORMATION
  const positionGroups = options.positionGroups !== undefined ? options.positionGroups : DEFAULT_POSITION_GROUPS

  const coverage = []
  const unresolved = []

  for (const jersey of Object.keys(formation)) {
    const position = formation[jersey]

    // acceptable tokens = the exact position plus any explicitly grouped (coarse) tokens
    const acceptable = new Set([position])
    if (positionGroups[position]) for (const token of positionGroups[position]) acceptable.add(token)

    const matching = candidates.filter((c) => acceptable.has(c.position))   // exact tokens preserved

    if (matching.length === 0) {
      unresolved.push({ jersey, position, reason: 'no candidate coverage' })
    } else {
      const candidateIds = matching.slice().sort(byConfidenceThenId).map((c) => c.playerId)
      coverage.push({ jersey, position, candidateCount: matching.length, candidateIds })
    }
  }

  // copy the resolved formation / groups so freezing the output never touches caller inputs
  const formationOut = { ...formation }
  const positionGroupsOut = {}
  for (const k of Object.keys(positionGroups)) positionGroupsOut[k] = positionGroups[k].slice()

  return deepFreeze({
    formation: formationOut,
    positionGroups: positionGroupsOut,
    coverage,
    unresolved,
    metadata: {
      candidateCount: candidates.length,
      formationSize: Object.keys(formation).length,
      unresolvedCount: unresolved.length,
      deterministic: true,
      adapterLayer: true,
    },
  })
}
