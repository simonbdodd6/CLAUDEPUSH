/**
 * @coach-core-adapter — Decision / Plan Builder (DORMANT)
 *
 * Builds the intelligence-side input the M118 pipeline expects — a memory query `plan` (an M109
 * structured request) and a `decision` (the M116/M117 shape) — from fixture / match / coach
 * context. Adapter-layer composition only: no intelligence engine, recommendation, ranking, DNA
 * logic, LLM, generated text or tactical inference. It never inspects player data or calls the
 * selection pipeline. Pure and deterministic: no Core, Redis, network, filesystem, clock or
 * randomness. Inputs are never mutated; output is deeply frozen.
 *
 * The built `plan` is the M109 REQUEST shape (validated by calling createCoachMemoryQueryPlan).
 * Note: M118/M110 consume the NORMALISED plan ({ filters, retrieval }) — to feed M118, run
 * createCoachMemoryQueryPlan(plan) first. Reusing M109 here adds no new cross-package edge
 * (coach-core-adapter already depends on coach-memory) and no cycle.
 */

import { createCoachMemoryQueryPlan } from '../coach-memory/index.js'

const DEFAULT_PLAN_TYPES = Object.freeze(['selection-preference', 'tactical-preference', 'learned-pattern', 'risk-warning'])
const DEFAULT_LIMIT = 25
const DEFAULT_SORT = 'score'
const DEFAULT_CATEGORY = 'selection-preference'
const DEFAULT_CONFIDENCE = 0.5

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isString = (v) => typeof v === 'string'
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)
const isUnitNumber = (v) => isFiniteNumber(v) && v >= 0 && v <= 1
const isStringArray = (v) => Array.isArray(v) && v.every(isString)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

const sortStrings = (arr) => [...new Set(arr)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

/** Dedupe ontology targets by `kind:id` (first-seen), then sort by kind, then id. */
function sortTargets(arr) {
  const seen = new Set()
  const out = []
  for (const t of arr) {
    const key = `${t.kind}:${t.id}`
    if (!seen.has(key)) { seen.add(key); out.push({ kind: t.kind, id: t.id }) }
  }
  out.sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return out
}

function assertFixture(fixture) {
  if (!isObj(fixture)) throw new TypeError('buildDecisionPlanContext: malformed fixture')
  for (const k of ['fixtureId', 'opponent', 'competition', 'venue', 'date']) {
    if (fixture[k] !== undefined && !isString(fixture[k])) throw new TypeError(`buildDecisionPlanContext: malformed fixture.${k}`)
  }
}

function assertMatch(match) {
  if (!isObj(match)) throw new TypeError('buildDecisionPlanContext: malformed match')
  if (match.category !== undefined && !isNonEmptyString(match.category)) throw new TypeError('buildDecisionPlanContext: malformed match.category')
  if (match.confidence !== undefined && !isUnitNumber(match.confidence)) throw new TypeError('buildDecisionPlanContext: invalid confidence (must be a number in [0,1])')
  if (match.matchedSignals !== undefined && !isStringArray(match.matchedSignals)) throw new TypeError('buildDecisionPlanContext: invalid matchedSignals (must be an array of strings)')
}

function assertOntologyTargets(targets, where) {
  if (!Array.isArray(targets)) throw new TypeError(`buildDecisionPlanContext: invalid ontologyTargets (${where})`)
  for (const t of targets) {
    if (!isObj(t) || !isNonEmptyString(t.kind) || !isNonEmptyString(t.id)) {
      throw new TypeError(`buildDecisionPlanContext: invalid ontologyTargets (${where}) — each must be { kind, id }`)
    }
  }
}

function assertCoachContext(coachContext) {
  if (!isObj(coachContext)) throw new TypeError('buildDecisionPlanContext: malformed coachContext')
  for (const k of ['coachId', 'clubId']) {
    if (coachContext[k] !== undefined && !isString(coachContext[k])) throw new TypeError(`buildDecisionPlanContext: malformed coachContext.${k}`)
  }
  if (coachContext.tags !== undefined && !isStringArray(coachContext.tags)) throw new TypeError('buildDecisionPlanContext: invalid tags (must be an array of strings)')
  if (coachContext.ontologyTargets !== undefined) assertOntologyTargets(coachContext.ontologyTargets, 'coachContext')
}

function assertOptions(options) {
  if (!isObj(options)) throw new TypeError('buildDecisionPlanContext: options must be an object')
  if (options.types !== undefined && !isStringArray(options.types)) throw new TypeError('buildDecisionPlanContext: options.types must be an array of strings')
  if (options.tags !== undefined && !isStringArray(options.tags)) throw new TypeError('buildDecisionPlanContext: invalid tags (options)')
  if (options.ontologyTargets !== undefined) assertOntologyTargets(options.ontologyTargets, 'options')
  if (options.limit !== undefined && !isFiniteNumber(options.limit)) throw new TypeError('buildDecisionPlanContext: options.limit must be a number')
  if (options.minimumScore !== undefined && !isFiniteNumber(options.minimumScore)) throw new TypeError('buildDecisionPlanContext: options.minimumScore must be a number')
  if (options.sort !== undefined && !isString(options.sort)) throw new TypeError('buildDecisionPlanContext: options.sort must be a string')
}

/**
 * Build the { plan, decision, metadata } intelligence context.
 *
 * @param {{ fixture?: object, match?: object, coachContext?: object }} context
 * @param {{ types?: string[], tags?: string[], ontologyTargets?: object[], limit?: number, minimumScore?: number, sort?: string }} [options]
 * @returns {Readonly<{ plan: object, decision: object, metadata: object }>}
 */
export function buildDecisionPlanContext(context, options = {}) {
  if (!isObj(context)) throw new TypeError('buildDecisionPlanContext requires a context object { fixture?, match?, coachContext? }')
  const fixture = context.fixture
  const match = context.match
  const coachContext = context.coachContext
  if (fixture !== undefined) assertFixture(fixture)
  if (match !== undefined) assertMatch(match)
  if (coachContext !== undefined) assertCoachContext(coachContext)
  assertOptions(options)

  // plan (M109 request shape) — options override defaults; coachContext supplies tags/targets
  const tagsSource = options.tags !== undefined ? options.tags : (coachContext && coachContext.tags !== undefined ? coachContext.tags : [])
  const targetsSource = options.ontologyTargets !== undefined ? options.ontologyTargets : (coachContext && coachContext.ontologyTargets !== undefined ? coachContext.ontologyTargets : [])
  const plan = {
    types: options.types !== undefined ? options.types : [...DEFAULT_PLAN_TYPES],
    ontologyTargets: sortTargets(targetsSource),
    tags: sortStrings(tagsSource),
    minimumScore: options.minimumScore !== undefined ? options.minimumScore : 0,
    limit: options.limit !== undefined ? options.limit : DEFAULT_LIMIT,
    sort: options.sort !== undefined ? options.sort : DEFAULT_SORT,
  }
  createCoachMemoryQueryPlan(plan)   // validate the request against M109 (throws TypeError if invalid); result discarded

  // decision (M116/M117 shape)
  const decision = {
    category: match && match.category !== undefined ? match.category : DEFAULT_CATEGORY,
    confidence: match && match.confidence !== undefined ? match.confidence : DEFAULT_CONFIDENCE,
    matchedSignals: sortStrings(match && match.matchedSignals !== undefined ? match.matchedSignals : []),
  }

  const metadata = {
    fixtureId: fixture && fixture.fixtureId !== undefined ? fixture.fixtureId : null,
    opponent: fixture && fixture.opponent !== undefined ? fixture.opponent : null,
    competition: fixture && fixture.competition !== undefined ? fixture.competition : null,
    venue: fixture && fixture.venue !== undefined ? fixture.venue : null,
    deterministic: true,
    adapterLayer: true,
  }

  return deepFreeze({ plan, decision, metadata })
}
