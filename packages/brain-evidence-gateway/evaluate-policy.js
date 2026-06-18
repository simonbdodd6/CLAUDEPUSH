/**
 * @brain/evidence-gateway — gate policy engine / evaluateGatePolicy (M74, DORMANT)
 *
 * A pure declarative policy evaluator: it decides whether an EXISTING M72 gate outcome
 * satisfies configurable release criteria. It re-runs nothing and recomputes no evidence —
 * it only READS the M72 outcome fields and a policy, returning a frozen
 * { ok, reasons, policyApplied } verdict. No store, engine, persistence, serialization,
 * filesystem, API, network, clock or randomness. The outcome is never mutated.
 *
 * Supported policy fields (defaults in parentheses):
 *   - requirePass        (true)  — fail unless the gate passed (or every failing case is allowed)
 *   - maxViolations      (none)  — fail if the outcome's total violations exceed this
 *   - maxTolerated       (none)  — fail if the outcome's total tolerated exceed this
 *   - forbiddenStages    ([])    — fail if any effective affected stage is listed
 *   - allowedFailingCases([])    — failing case names excused BEFORE evaluation
 *
 * `allowedFailingCases` removes those cases first: the pass decision and the affected-stage
 * set are recomputed from the remaining (non-allowed) annotations. Note the M72 outcome
 * exposes gate-wide violation/tolerated totals (not decomposable per case), so the
 * maxViolations / maxTolerated budgets apply to those totals; and if the upstream emitter
 * truncated annotations, only the annotation-visible failing cases/stages can be excused.
 */

const isObj = (v) => v !== null && typeof v === 'object'
const isInt = (v) => typeof v === 'number' && Number.isInteger(v)
const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')

const ALLOWED_KEYS = Object.freeze(['requirePass', 'maxViolations', 'maxTolerated', 'forbiddenStages', 'allowedFailingCases'])

/** Sorted, de-duplicated copy of a string array. */
const uniqSorted = (arr) => [...new Set(arr)].sort()

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Validate + normalize the policy, applying defaults. Throws TypeError on invalid values. */
function normalizePolicy(policy) {
  if (policy === undefined || policy === null) policy = {}
  if (!isObj(policy) || Array.isArray(policy)) {
    throw new TypeError('evaluateGatePolicy: policy must be an object')
  }
  for (const k of Object.keys(policy)) {
    if (!ALLOWED_KEYS.includes(k)) throw new TypeError(`evaluateGatePolicy: unknown policy field "${k}"`)
  }

  let requirePass = true
  if (policy.requirePass !== undefined) {
    if (typeof policy.requirePass !== 'boolean') throw new TypeError('evaluateGatePolicy: requirePass must be a boolean')
    requirePass = policy.requirePass
  }

  let maxViolations = null
  if (policy.maxViolations !== undefined) {
    if (!isInt(policy.maxViolations) || policy.maxViolations < 0) {
      throw new TypeError('evaluateGatePolicy: maxViolations must be a non-negative integer')
    }
    maxViolations = policy.maxViolations
  }

  let maxTolerated = null
  if (policy.maxTolerated !== undefined) {
    if (!isInt(policy.maxTolerated) || policy.maxTolerated < 0) {
      throw new TypeError('evaluateGatePolicy: maxTolerated must be a non-negative integer')
    }
    maxTolerated = policy.maxTolerated
  }

  let forbiddenStages = []
  if (policy.forbiddenStages !== undefined) {
    if (!isStringArray(policy.forbiddenStages)) throw new TypeError('evaluateGatePolicy: forbiddenStages must be an array of strings')
    forbiddenStages = uniqSorted(policy.forbiddenStages)
  }

  let allowedFailingCases = []
  if (policy.allowedFailingCases !== undefined) {
    if (!isStringArray(policy.allowedFailingCases)) throw new TypeError('evaluateGatePolicy: allowedFailingCases must be an array of strings')
    allowedFailingCases = uniqSorted(policy.allowedFailingCases)
  }

  return Object.freeze({ requirePass, maxViolations, maxTolerated, forbiddenStages, allowedFailingCases })
}

/** Minimal shape check for an M72 outcome. */
function assertOutcome(outcome) {
  if (!isObj(outcome) || typeof outcome.status !== 'string' ||
      !Array.isArray(outcome.affectedStages) || !Array.isArray(outcome.annotations) ||
      typeof outcome.violations !== 'number' || typeof outcome.tolerated !== 'number') {
    throw new TypeError('evaluateGatePolicy requires an M72 gate outcome object')
  }
}

/**
 * Evaluate a declarative release policy against an existing M72 gate outcome.
 *
 * @param {object} outcome  an outcome from `emitGateOutcome` (M72)
 * @param {{ requirePass?:boolean, maxViolations?:number, maxTolerated?:number,
 *           forbiddenStages?:string[], allowedFailingCases?:string[] }} [policy]
 * @returns {Readonly<{ ok:boolean, reasons:ReadonlyArray<string>, policyApplied:Readonly<object> }>}
 */
export function evaluateGatePolicy(outcome, policy = {}) {
  assertOutcome(outcome)
  const policyApplied = normalizePolicy(policy)

  const allowed = new Set(policyApplied.allowedFailingCases)

  // remove allowed failing cases first; recompute the failing set + affected stages from what remains
  const effAnnotations = outcome.annotations.filter((a) => !allowed.has(a.caseName))
  const failingSeen = new Set()
  const failingCases = []
  const addFailing = (name) => {
    if (name !== null && name !== undefined && !allowed.has(name) && !failingSeen.has(name)) {
      failingSeen.add(name); failingCases.push(name)
    }
  }
  addFailing(outcome.firstFailingCase)
  for (const a of effAnnotations) addFailing(a.caseName)
  const remainingFailing = [...failingCases].sort()

  const effAffectedStages = allowed.size === 0
    ? [...outcome.affectedStages]
    : uniqSorted(effAnnotations.map((a) => a.stage))

  const gatePassedEffectively = outcome.status === 'pass' || remainingFailing.length === 0

  const reasons = []

  // 1 — requirePass
  if (policyApplied.requirePass && !gatePassedEffectively) {
    reasons.push(`requirePass: gate failed with un-allowed failing case(s): ${remainingFailing.join(', ')}`)
  }
  // 2 — maxViolations (gate-wide total)
  if (policyApplied.maxViolations !== null && outcome.violations > policyApplied.maxViolations) {
    reasons.push(`maxViolations: ${outcome.violations} > ${policyApplied.maxViolations}`)
  }
  // 3 — maxTolerated (gate-wide total)
  if (policyApplied.maxTolerated !== null && outcome.tolerated > policyApplied.maxTolerated) {
    reasons.push(`maxTolerated: ${outcome.tolerated} > ${policyApplied.maxTolerated}`)
  }
  // 4 — forbiddenStages
  if (policyApplied.forbiddenStages.length) {
    const matched = policyApplied.forbiddenStages.filter((s) => effAffectedStages.includes(s))
    if (matched.length) reasons.push(`forbiddenStages: ${matched.join(', ')}`)
  }

  return deepFreeze({ ok: reasons.length === 0, reasons, policyApplied })
}
