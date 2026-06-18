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

const ALLOWED_KEYS = Object.freeze([
  'requirePass', 'maxViolations', 'maxTolerated', 'forbiddenStages', 'allowedFailingCases',
  // M78 — per-case budgets (additive; only present in policyApplied when supplied)
  'maxViolationsPerCase', 'maxToleratedPerCase', 'forbiddenStagesPerCase',
])

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

  // base policy — shape preserved exactly for additive compatibility
  const applied = { requirePass, maxViolations, maxTolerated, forbiddenStages, allowedFailingCases }

  // M78 per-case budgets — only added to policyApplied when actually supplied
  if (policy.maxViolationsPerCase !== undefined) {
    if (!isInt(policy.maxViolationsPerCase) || policy.maxViolationsPerCase < 0) {
      throw new TypeError('evaluateGatePolicy: maxViolationsPerCase must be a non-negative integer')
    }
    applied.maxViolationsPerCase = policy.maxViolationsPerCase
  }
  if (policy.maxToleratedPerCase !== undefined) {
    if (!isInt(policy.maxToleratedPerCase) || policy.maxToleratedPerCase < 0) {
      throw new TypeError('evaluateGatePolicy: maxToleratedPerCase must be a non-negative integer')
    }
    applied.maxToleratedPerCase = policy.maxToleratedPerCase
  }
  if (policy.forbiddenStagesPerCase !== undefined) {
    if (!isStringArray(policy.forbiddenStagesPerCase)) throw new TypeError('evaluateGatePolicy: forbiddenStagesPerCase must be an array of strings')
    applied.forbiddenStagesPerCase = uniqSorted(policy.forbiddenStagesPerCase)
  }

  return Object.freeze(applied)
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
 *           forbiddenStages?:string[], allowedFailingCases?:string[],
 *           maxViolationsPerCase?:number, maxToleratedPerCase?:number, forbiddenStagesPerCase?:string[] }} [policy]
 * @returns {Readonly<{ ok:boolean, reasons:ReadonlyArray<string>,
 *   reasonCodes:ReadonlyArray<string>, policyApplied:Readonly<object> }>}
 *   `reasonCodes` is parallel to `reasons` (same length/order) — the machine-readable rule
 *   code for each failed rule (e.g. 'requirePass', 'maxViolationsPerCase').
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

  // `reasons` (human-readable) and `reasonCodes` (machine-readable rule code) are kept
  // strictly parallel — same length, same order — via addReason, so downstream layers can
  // consume the codes without parsing strings (M80).
  const reasons = []
  const reasonCodes = []
  const addReason = (code, message) => { reasonCodes.push(code); reasons.push(message) }

  // 1 — requirePass
  if (policyApplied.requirePass && !gatePassedEffectively) {
    addReason('requirePass', `requirePass: gate failed with un-allowed failing case(s): ${remainingFailing.join(', ')}`)
  }
  // 2 — maxViolations (gate-wide total)
  if (policyApplied.maxViolations !== null && outcome.violations > policyApplied.maxViolations) {
    addReason('maxViolations', `maxViolations: ${outcome.violations} > ${policyApplied.maxViolations}`)
  }
  // 3 — maxTolerated (gate-wide total)
  if (policyApplied.maxTolerated !== null && outcome.tolerated > policyApplied.maxTolerated) {
    addReason('maxTolerated', `maxTolerated: ${outcome.tolerated} > ${policyApplied.maxTolerated}`)
  }
  // 4 — forbiddenStages
  if (policyApplied.forbiddenStages.length) {
    const matched = policyApplied.forbiddenStages.filter((s) => effAffectedStages.includes(s))
    if (matched.length) addReason('forbiddenStages', `forbiddenStages: ${matched.join(', ')}`)
  }

  // 5–7 — per-case budgets (M78). Reuse outcome.perCase only; allowed failing cases are
  // excused first; rules are checked in field order, cases in perCase (suite) order.
  const hasPerCaseRule = policyApplied.maxViolationsPerCase !== undefined ||
    policyApplied.maxToleratedPerCase !== undefined ||
    policyApplied.forbiddenStagesPerCase !== undefined
  if (hasPerCaseRule) {
    if (!Array.isArray(outcome.perCase)) {
      throw new TypeError('evaluateGatePolicy: per-case policy fields require an M72 outcome with a perCase array (M77+)')
    }
    const cases = outcome.perCase.filter((pc) => !allowed.has(pc.name))

    // 5 — maxViolationsPerCase
    if (policyApplied.maxViolationsPerCase !== undefined) {
      for (const pc of cases) {
        if (pc.violations > policyApplied.maxViolationsPerCase) {
          addReason('maxViolationsPerCase', `${pc.name} exceeded maxViolationsPerCase (${pc.violations} > ${policyApplied.maxViolationsPerCase})`)
        }
      }
    }
    // 6 — maxToleratedPerCase
    if (policyApplied.maxToleratedPerCase !== undefined) {
      for (const pc of cases) {
        if (pc.tolerated > policyApplied.maxToleratedPerCase) {
          addReason('maxToleratedPerCase', `${pc.name} exceeded maxToleratedPerCase (${pc.tolerated} > ${policyApplied.maxToleratedPerCase})`)
        }
      }
    }
    // 7 — forbiddenStagesPerCase
    if (policyApplied.forbiddenStagesPerCase !== undefined && policyApplied.forbiddenStagesPerCase.length) {
      for (const pc of cases) {
        const matched = policyApplied.forbiddenStagesPerCase.filter((s) => pc.affectedStages.includes(s))
        if (matched.length) addReason('forbiddenStagesPerCase', `${pc.name} affected forbidden stage(s): ${matched.join(', ')}`)
      }
    }
  }

  return deepFreeze({ ok: reasons.length === 0, reasons, reasonCodes, policyApplied })
}
