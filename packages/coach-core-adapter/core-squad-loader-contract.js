/**
 * @coach-core-adapter — Core Squad Loader Contract (DORMANT, CONTRACT-ONLY)
 *
 * Documentation-as-code: describes and validates the provider a FUTURE Coach's Eye Premium
 * feature would supply to feed real Core data into the adapter layer. It is CONTRACT-ONLY — it
 * implements no loading, imports no Core, and touches nothing: no networking, storage, filesystem,
 * AI, engine execution, clock or randomness. `validate` checks the provider's SHAPE only and never
 * invokes the provider's functions (no side effects). Output is deeply frozen and deterministic.
 *
 * The provider must expose four pure read accessors that map onto the adapter's input fields:
 *   getActivePlayers        → Core player records          (→ assembleCandidates / M132)
 *   getAvailabilityResponses→ Core availability responses  (→ mapAvailability / candidate availability)
 *   getCoachMemories        → M108 coach memory entries     (→ coachDnaProfileFromMemories / M157)
 *   getPlayerTags           → per-player DNA tag profiles   (→ derivePlayerDnaSignals / M153)
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// module-scoped so every contract instance shares identical references (deterministic / deepEqual-stable)
const METHODS = Object.freeze(['getActivePlayers', 'getAvailabilityResponses', 'getCoachMemories', 'getPlayerTags'])

const GUARANTEES = Object.freeze([
  'each method must be a pure read accessor — it must not mutate Core data',
  'getActivePlayers must return Core player records (id / userId / position)',
  'getAvailabilityResponses must return the Core availability responses map (keyed by userId)',
  'getCoachMemories must return M108 coach memory entries',
  'getPlayerTags must return per-player DNA tag profiles ({ [playerId]: { tags, traits, attributes } })',
  'the loader must preserve tenant / club boundaries (never expose one club\'s data to another)',
  'this contract validates shape only and never invokes the provider',
])

/**
 * Validate that a loader provider exposes the four required read accessors. Shape-only — the
 * provider functions are never called. Returns true, or throws TypeError describing the problem.
 *
 * @param {object} provider
 * @returns {true}
 */
function validate(provider) {
  if (!isObj(provider)) throw new TypeError('core squad loader provider must be an object')
  const missing = METHODS.filter((m) => typeof provider[m] !== 'function')
  if (missing.length) throw new TypeError(`core squad loader provider is missing functions: ${missing.join(', ')}`)
  return true
}

/**
 * Return the frozen Core squad loader contract (methods, guarantees, and a shape validator).
 *
 * @returns {Readonly<{ methods: ReadonlyArray<string>, guarantees: ReadonlyArray<string>, validate: (provider:object) => true }>}
 */
export function createCoreSquadLoaderContract() {
  return Object.freeze({ methods: METHODS, guarantees: GUARANTEES, validate })
}
