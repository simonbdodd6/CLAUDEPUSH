/**
 * @coach-core-adapter — assembleSelectionInputs Builder (DORMANT)
 *
 * The active counterpart to M159: it orchestrates the available adapter outputs into the immutable
 * createSelectionInputs DTO. Orchestration ONLY — it holds no business logic. Field producers are
 * INJECTED as thunks (the caller wires them to the real adapters — M132 assembleCandidates,
 * M133 resolveFormationFromCandidates, M157 coachDnaProfileFromMemories, M153 derivePlayerDnaSignals,
 * etc.), so this builder stays free of any adapter-specific knowledge. It passes the raw fields
 * through, calls each provided producer, and packages everything via M159.
 *
 * No recommendation, no pipeline / M118 / M120 / runPipelineBridge execution, no AI, no Core/Redis/
 * network/storage. The output is the deeply-frozen, deterministic M159 DTO; inputs are not mutated.
 */

import { createSelectionInputs } from './create-selection-inputs.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const PRODUCERS = ['buildCandidates', 'buildFormation', 'buildCoachDnaProfile', 'buildPlayerDnaProfiles']

/**
 * Assemble all available selection intelligence into the M159 DTO.
 *
 * @param {{
 *   players?: object[], availability?: object, coachMemories?: object[],
 *   coachDnaProfile?: (object|null), playerDnaProfiles?: object, candidates?: object[], formation?: object,
 *   ...any   // additional inputs the injected producers may read
 * }} [input]
 * @param {{
 *   buildCandidates?: (input:object) => object[],
 *   buildFormation?: (input:object, candidates:any) => object,
 *   buildCoachDnaProfile?: (input:object) => (object|null),
 *   buildPlayerDnaProfiles?: (input:object) => object,
 * }} [services]   // injected producers, each optional; absent → passthrough from input
 * @returns {Readonly<object>}  the createSelectionInputs (M159) DTO
 */
export function assembleSelectionInputs(input = {}, services = {}) {
  if (!isObj(input)) throw new TypeError('assembleSelectionInputs requires an input object')
  if (!isObj(services)) throw new TypeError('assembleSelectionInputs requires a services object')
  for (const k of PRODUCERS) {
    if (services[k] !== undefined && typeof services[k] !== 'function') throw new TypeError(`assembleSelectionInputs: services.${k} must be a function`)
  }

  // passthrough fields
  const players = input.players
  const availability = input.availability
  const coachMemories = input.coachMemories

  // assembled via injected producers (compose existing adapters); absent → passthrough from input
  const candidates = services.buildCandidates ? services.buildCandidates(input) : input.candidates
  const formation = services.buildFormation ? services.buildFormation(input, candidates) : input.formation
  const coachDnaProfile = services.buildCoachDnaProfile ? services.buildCoachDnaProfile(input) : input.coachDnaProfile
  const playerDnaProfiles = services.buildPlayerDnaProfiles ? services.buildPlayerDnaProfiles(input) : input.playerDnaProfiles

  // package into the immutable M159 DTO (validates + deep-copies + freezes)
  return createSelectionInputs({ players, availability, coachMemories, coachDnaProfile, playerDnaProfiles, candidates, formation })
}
