/**
 * @coach-core-adapter — DNA Confidence Provider (DORMANT)
 *
 * Packages the proven M154 chain into one reusable confidence provider:
 *   availability history → baseline confidence   (M145 createBaselineConfidenceProvider)
 *   player DNA profile   → DNA signals           (M153 derivePlayerDnaSignals)
 *   coach DNA profile    → DNA influence          (M152 applyPlayerDnaInfluence)
 *
 * It returns a standard `{ getConfidence(player) }` compatible with the M132 confidence-provider
 * contract, so it drops straight into the candidate assembler / buildSelectionContext. Pure
 * adapter composition: no engine/M120/pipeline/Core changes, no Redis, no network, no clock.
 * Missing coach profile or missing history degrade safely to the availability baseline. The
 * returned provider is frozen; inputs are never mutated.
 */

import { createBaselineConfidenceProvider } from './confidence-source.js'
import { derivePlayerDnaSignals } from './player-dna-source.js'
import { applyPlayerDnaInfluence } from './player-dna-influence.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0

/**
 * Build a confidence provider that layers Coach DNA influence on top of an availability baseline.
 *
 * @param {{
 *   historyByPlayer?: Record<string, Array<string|{response:string}>>,   // M145 baseline source
 *   dnaProfiles?: Record<string, { tags?:string[], traits?:string[], attributes?:Record<string,string> }>,  // M153 input
 *   mappings?: object,            // M153 mappings (defaults to DEFAULT_DNA_MAPPINGS)
 *   coachDnaProfile?: (object|null),   // M152 profile; null/absent → no influence
 *   enabled?: boolean,            // M152 toggle (default true)
 *   adjustmentWeight?: number,    // M152
 *   maxAdjustment?: number,       // M152
 *   baselineOptions?: object,     // M145 derive options (weights / unknownWeight / default)
 *   playerIdField?: string,       // how to key player → history / dna lookup (default userId→id)
 * }} [config]
 * @returns {Readonly<{ getConfidence: (player: object) => number }>}
 */
export function createDnaConfidenceProvider(config = {}) {
  if (!isObj(config)) throw new TypeError('createDnaConfidenceProvider requires a config object')

  const historyByPlayer = config.historyByPlayer !== undefined ? config.historyByPlayer : {}
  const dnaProfiles = config.dnaProfiles !== undefined ? config.dnaProfiles : {}
  const coachDnaProfile = config.coachDnaProfile !== undefined ? config.coachDnaProfile : null
  const mappings = config.mappings
  const enabled = config.enabled !== false
  const playerIdField = config.playerIdField
  const baselineOptions = config.baselineOptions !== undefined ? config.baselineOptions : {}

  if (!isObj(dnaProfiles)) throw new TypeError('createDnaConfidenceProvider: dnaProfiles must be an object')
  if (playerIdField !== undefined && !isNonEmptyString(playerIdField)) throw new TypeError('createDnaConfidenceProvider: playerIdField must be a non-empty string')

  // M145 baseline (validates historyByPlayer + baselineOptions; clamps result)
  const baseline = createBaselineConfidenceProvider(historyByPlayer, { ...baselineOptions, ...(playerIdField !== undefined ? { playerIdField } : {}) })
  const influenceOptions = { enabled, adjustmentWeight: config.adjustmentWeight, maxAdjustment: config.maxAdjustment }

  const resolveKey = (player) => {
    if (playerIdField !== undefined) return player[playerIdField]
    if (isNonEmptyString(player.userId)) return player.userId
    return player.id
  }

  return Object.freeze({
    getConfidence(player) {
      if (!isObj(player)) throw new TypeError('getConfidence requires a player object')

      const base = baseline.getConfidence(player)   // M145
      const key = resolveKey(player)
      if (!isNonEmptyString(key)) return base        // can't identify player for DNA → baseline only

      const dnaProfile = { playerId: key, ...(isObj(dnaProfiles[key]) ? dnaProfiles[key] : {}) }
      const { dnaSignals } = derivePlayerDnaSignals(dnaProfile, mappings !== undefined ? { mappings } : {})   // M153
      return applyPlayerDnaInfluence({ playerId: key, confidence: base, dnaSignals }, coachDnaProfile, influenceOptions).finalConfidence   // M152
    },
  })
}
