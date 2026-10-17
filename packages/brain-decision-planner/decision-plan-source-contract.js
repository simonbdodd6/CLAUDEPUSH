/**
 * @brain-decision-planner — Decision / Plan Source Contract (DORMANT, CONTRACT-ONLY)
 *
 * Intelligence-side equivalent of M164: documentation-as-code describing and validating the
 * provider a FUTURE Coach's Eye Premium integration would supply to feed decision-planning context
 * into the Brain. It is CONTRACT-ONLY — it implements no loading, imports no Core and no engine, and
 * touches nothing: no networking, storage, filesystem, AI execution, clock or randomness. `validate`
 * checks the provider's SHAPE only and never invokes the provider's functions (no side effects).
 * Output is deeply frozen and deterministic.
 *
 * The provider must expose two pure read accessors that feed buildDecisionPlanContext (M135):
 *   getFixtureContext → fixture / match context (opponent, competition, venue, date, …)
 *   getCoachIdentity  → coach / club identity   (coachId, clubId, …)
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// module-scoped so every contract instance shares identical references (deterministic / deepEqual-stable)
const METHODS = Object.freeze(['getFixtureContext', 'getCoachIdentity'])

const GUARANTEES = Object.freeze([
  'each method must be a pure read-only accessor — it must not mutate or side-effect',
  'getFixtureContext must return the fixture / match context (opponent, competition, venue, date, …)',
  'getCoachIdentity must return the coach / club identity (coachId, clubId, …)',
  'the source must be tenant-isolated (one coach cannot read another coach\'s context)',
  'the source must be club-isolated (one club cannot read another club\'s context)',
  'this contract validates shape only and never invokes the provider',
  'no networking, no storage, no AI execution',
])

/**
 * Validate that a decision-plan source provider exposes the two required read accessors. Shape-only
 * — the provider functions are never called. Returns true, or throws TypeError describing the problem.
 *
 * @param {object} provider
 * @returns {true}
 */
function validate(provider) {
  if (!isObj(provider)) throw new TypeError('decision plan source provider must be an object')
  const missing = METHODS.filter((m) => typeof provider[m] !== 'function')
  if (missing.length) throw new TypeError(`decision plan source provider is missing functions: ${missing.join(', ')}`)
  return true
}

/**
 * Return the frozen decision-plan source contract (methods, guarantees, and a shape validator).
 *
 * @returns {Readonly<{ methods: ReadonlyArray<string>, guarantees: ReadonlyArray<string>, validate: (provider:object) => true }>}
 */
export function createDecisionPlanSourceContract() {
  return Object.freeze({ methods: METHODS, guarantees: GUARANTEES, validate })
}
