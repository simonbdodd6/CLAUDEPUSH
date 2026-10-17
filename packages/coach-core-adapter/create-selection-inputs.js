/**
 * @coach-core-adapter — Selection Inputs Facade (DORMANT, DTO)
 *
 * Packages all the intelligence inputs a future selection recommendation will need into one
 * deeply-frozen Data Transfer Object: players, availability, coach memories, coach DNA profile,
 * player DNA profiles, candidates, and formation. It is a DTO ONLY — it generates no
 * recommendation, executes no pipeline / M118 / M120 / runPipelineBridge, runs no AI, and touches
 * no Core / network / storage. Inputs are deep-copied (so no caller object is mutated or frozen);
 * the returned DTO is deeply frozen and deterministic.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Pure deterministic deep clone of plain JSON data (objects / arrays / primitives). */
function deepClone(value) {
  if (Array.isArray(value)) return value.map(deepClone)
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value)) out[k] = deepClone(value[k])
    return out
  }
  return value
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function assertInput(input) {
  if (!isObj(input)) throw new TypeError('createSelectionInputs requires an input object')
  if (input.players !== undefined && !Array.isArray(input.players)) throw new TypeError('createSelectionInputs: players must be an array')
  if (input.availability !== undefined && !isObj(input.availability)) throw new TypeError('createSelectionInputs: availability must be an object')
  if (input.coachMemories !== undefined && !Array.isArray(input.coachMemories)) throw new TypeError('createSelectionInputs: coachMemories must be an array')
  if (input.coachDnaProfile !== undefined && input.coachDnaProfile !== null && !isObj(input.coachDnaProfile)) throw new TypeError('createSelectionInputs: coachDnaProfile must be an object or null')
  if (input.playerDnaProfiles !== undefined && !isObj(input.playerDnaProfiles)) throw new TypeError('createSelectionInputs: playerDnaProfiles must be an object')
  if (input.candidates !== undefined && !Array.isArray(input.candidates)) throw new TypeError('createSelectionInputs: candidates must be an array')
  if (input.formation !== undefined && !isObj(input.formation)) throw new TypeError('createSelectionInputs: formation must be an object')
}

/**
 * Package selection inputs into one deeply-frozen DTO.
 *
 * @param {{
 *   players?: object[], availability?: object, coachMemories?: object[],
 *   coachDnaProfile?: (object|null), playerDnaProfiles?: object, candidates?: object[], formation?: object
 * }} [input]
 * @returns {Readonly<{
 *   players: ReadonlyArray<object>, availability: object, coachMemories: ReadonlyArray<object>,
 *   coachDnaProfile: (object|null), playerDnaProfiles: object, candidates: ReadonlyArray<object>,
 *   formation: object, metadata: object
 * }>}
 */
export function createSelectionInputs(input = {}) {
  assertInput(input)

  const players = input.players !== undefined ? deepClone(input.players) : []
  const availability = input.availability !== undefined ? deepClone(input.availability) : {}
  const coachMemories = input.coachMemories !== undefined ? deepClone(input.coachMemories) : []
  const coachDnaProfile = input.coachDnaProfile !== undefined && input.coachDnaProfile !== null ? deepClone(input.coachDnaProfile) : null
  const playerDnaProfiles = input.playerDnaProfiles !== undefined ? deepClone(input.playerDnaProfiles) : {}
  const candidates = input.candidates !== undefined ? deepClone(input.candidates) : []
  const formation = input.formation !== undefined ? deepClone(input.formation) : {}

  return deepFreeze({
    players,
    availability,
    coachMemories,
    coachDnaProfile,
    playerDnaProfiles,
    candidates,
    formation,
    metadata: {
      playerCount: players.length,
      candidateCount: candidates.length,
      coachMemoryCount: coachMemories.length,
      playerDnaProfileCount: Object.keys(playerDnaProfiles).length,
      hasCoachDnaProfile: coachDnaProfile !== null,
      formationSize: Object.keys(formation).length,
      deterministic: true,
      adapterLayer: true,
    },
  })
}
