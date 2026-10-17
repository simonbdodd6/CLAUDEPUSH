/**
 * @brain-decision-planner — Decision / Plan Context Mapper (DORMANT, boundary adapter)
 *
 * Converts an M167 Decision Plan Source provider into the internal decision-planning context the
 * planner consumes. Boundary adapter ONLY — no transformation, derived fields, IDs, timestamps,
 * inference, recommendation logic, AI, networking, persistence, or runtime wiring. It validates the
 * provider (M167 contract), reads its two accessors once each, and returns a deeply-frozen
 * `{ fixture, match, coachContext }` where `fixture`/`match` come from getFixtureContext() and
 * `coachContext` from getCoachIdentity().
 *
 * Pure & deterministic. Imports nothing outside this package except the M167 validator. Accessor
 * results are deep-copied (identity), so the provider's data is never mutated or frozen.
 */

import { createDecisionPlanSourceContract } from './decision-plan-source-contract.js'

const CONTRACT = createDecisionPlanSourceContract()   // module-scoped (deterministic)

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Pure deterministic deep clone of plain data (objects / arrays / primitives). */
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

/**
 * Map an M167 decision-plan source provider to the internal decision-planning context.
 *
 * @param {{ getFixtureContext: Function, getCoachIdentity: Function }} provider
 * @returns {Readonly<{ fixture: any, match: any, coachContext: any }>}
 */
export function mapDecisionPlanContext(provider) {
  CONTRACT.validate(provider)   // M167 shape validation — throws TypeError if the provider is malformed

  // each accessor called exactly once, in order; results deep-copied (no mutation of provider data)
  const fixtureContext = provider.getFixtureContext()
  const coachContext = provider.getCoachIdentity()
  const ctx = isObj(fixtureContext) ? fixtureContext : {}

  return deepFreeze({
    fixture: deepClone(ctx.fixture),
    match: deepClone(ctx.match),
    coachContext: deepClone(coachContext),
  })
}
