/**
 * @brain/evidence-gateway — assess manifest explanation / assessManifestExplanation (M103, DORMANT)
 *
 * The first decision layer over an M102 explanation. It does NOT inspect manifests or
 * recompute the explanation — it evaluates an EXISTING explanation against a declarative
 * policy and returns a frozen { ok, verdict, reasons }.
 *
 * Supported policy fields (defaults in parentheses):
 *   - forbidVerdicts    ([])        — fail if the explanation's verdict is listed
 *   - maxStatements     (Infinity)  — fail if statements.length exceeds this
 *   - requireNoRemovals (false)     — fail if summary.removed > 0
 *   - requireNoChanges  (false)     — fail if summary.changed > 0
 *
 * Checks run in the above order; each failure appends one reason. When nothing fails,
 * reasons is ["Explanation satisfies policy."]. Reads only — no mutation, persistence,
 * filesystem, API, network, engine, crypto, clock or randomness. Output is deeply frozen.
 */

const isObj = (v) => v !== null && typeof v === 'object'

/** Validate the explanation shape (M102). */
function assertExplanation(explanation) {
  if (!isObj(explanation)) throw new TypeError('assessManifestExplanation requires an explanation object')
  if (typeof explanation.verdict !== 'string') throw new TypeError('assessManifestExplanation requires explanation.verdict')
  if (!isObj(explanation.summary)) throw new TypeError('assessManifestExplanation requires explanation.summary')
  if (!Array.isArray(explanation.statements)) throw new TypeError('assessManifestExplanation requires explanation.statements')
}

/** Validate + normalize the policy, applying defaults. */
function normalizePolicy(policy) {
  if (!isObj(policy) || Array.isArray(policy)) throw new TypeError('assessManifestExplanation: policy must be an object')

  let forbidVerdicts = []
  if (policy.forbidVerdicts !== undefined) {
    if (!Array.isArray(policy.forbidVerdicts) || !policy.forbidVerdicts.every((x) => typeof x === 'string')) {
      throw new TypeError('assessManifestExplanation: forbidVerdicts must be an array of strings')
    }
    forbidVerdicts = policy.forbidVerdicts
  }

  let maxStatements = Infinity
  if (policy.maxStatements !== undefined) {
    if (typeof policy.maxStatements !== 'number' || Number.isNaN(policy.maxStatements)) {
      throw new TypeError('assessManifestExplanation: maxStatements must be a number')
    }
    maxStatements = policy.maxStatements
  }

  let requireNoRemovals = false
  if (policy.requireNoRemovals !== undefined) {
    if (typeof policy.requireNoRemovals !== 'boolean') throw new TypeError('assessManifestExplanation: requireNoRemovals must be a boolean')
    requireNoRemovals = policy.requireNoRemovals
  }

  let requireNoChanges = false
  if (policy.requireNoChanges !== undefined) {
    if (typeof policy.requireNoChanges !== 'boolean') throw new TypeError('assessManifestExplanation: requireNoChanges must be a boolean')
    requireNoChanges = policy.requireNoChanges
  }

  return { forbidVerdicts, maxStatements, requireNoRemovals, requireNoChanges }
}

/**
 * Evaluate an M102 explanation against a declarative policy.
 *
 * @param {object} explanation  an explanation from `explainManifestDiff` (M102)
 * @param {{ forbidVerdicts?:string[], maxStatements?:number, requireNoRemovals?:boolean, requireNoChanges?:boolean }} [policy]
 * @returns {Readonly<{ ok:boolean, verdict:string, reasons:ReadonlyArray<string> }>}
 */
export function assessManifestExplanation(explanation, policy = {}) {
  assertExplanation(explanation)
  const p = normalizePolicy(policy)

  const reasons = []
  // 1 — forbidVerdicts
  if (p.forbidVerdicts.includes(explanation.verdict)) {
    reasons.push(`Verdict "${explanation.verdict}" is forbidden.`)
  }
  // 2 — maxStatements
  if (explanation.statements.length > p.maxStatements) {
    reasons.push(`Statement count ${explanation.statements.length} exceeds maxStatements ${p.maxStatements}.`)
  }
  // 3 — requireNoRemovals
  if (p.requireNoRemovals && explanation.summary.removed > 0) {
    reasons.push(`Removals are not allowed (removed=${explanation.summary.removed}).`)
  }
  // 4 — requireNoChanges
  if (p.requireNoChanges && explanation.summary.changed > 0) {
    reasons.push(`Changes are not allowed (changed=${explanation.summary.changed}).`)
  }

  const ok = reasons.length === 0

  return Object.freeze({
    ok,
    verdict: explanation.verdict,
    reasons: Object.freeze(ok ? ['Explanation satisfies policy.'] : reasons),
  })
}
