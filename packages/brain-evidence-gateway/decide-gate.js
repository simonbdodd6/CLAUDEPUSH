/**
 * @brain/evidence-gateway — gate decision / exit-code mapper / decideGate (M75, DORMANT)
 *
 * The final decision layer: it turns an evaluated release policy into a CI-friendly
 * release decision. Pure ORCHESTRATION — it evaluates the policy via M74
 * (`evaluateGatePolicy`), maps the result to a process exit code (0 pass / 1 fail; no
 * other codes), and renders a deterministic one-line summary, reusing the M73
 * `serializeGateOutcome` line for the optional "full" format. If given an M71 envelope /
 * M68 / M67 input instead of an M72 outcome, it normalises via M72 `emitGateOutcome` first.
 *
 * No gate execution, no report generation, no evidence logic, no duplicated serialization.
 * Reads only — no store, engine, persistence, filesystem, API, network, clock or
 * randomness. Inputs are never mutated; the decision is deeply frozen.
 */

import { emitGateOutcome } from './emit-gate.js'
import { evaluateGatePolicy } from './evaluate-policy.js'
import { serializeGateOutcome } from './serialize-gate.js'

const SUPPORTED_FORMATS = Object.freeze(['line', 'full'])
const isObj = (v) => v !== null && typeof v === 'object'

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** True for an already-built M72 gate outcome (vs. an M71 envelope / M68 / M67 input). */
function isGateOutcome(x) {
  return isObj(x) && typeof x.status === 'string' && isObj(x.cases) && !Array.isArray(x.cases) &&
    Array.isArray(x.annotations) && Array.isArray(x.affectedStages) &&
    typeof x.violations === 'number' && typeof x.tolerated === 'number'
}

/** Coerce an M72 outcome / M71 envelope / M68 / M67 input to an M72 outcome (reuse M72). */
function toOutcome(x) {
  return isGateOutcome(x) ? x : emitGateOutcome(x)
}

/**
 * Decide a gate's release status from a policy, returning a CI-friendly decision.
 *
 * @param {object} outcomeOrEnvelope  an M72 outcome, M71 envelope, M68 suite verdict, or M67 verdict
 * @param {object} [policy]           an M74 policy (see `evaluateGatePolicy`)
 * @param {{ format?: ('line'|'full') }} [options]
 *   format — "line" (default): `policy=pass` / `policy=fail reasons=2 requirePass,forbiddenStages`;
 *            "full": the same, plus the M73 gate status line appended after " | ".
 * @returns {Readonly<{ ok:boolean, exitCode:(0|1), reasons:ReadonlyArray<string>, line:string, policyApplied:object }>}
 */
export function decideGate(outcomeOrEnvelope, policy = {}, options = {}) {
  const format = (options && options.format !== undefined) ? options.format : 'line'
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`decideGate: unknown format "${format}" (expected one of: ${SUPPORTED_FORMATS.join(', ')})`)
  }

  const outcome = toOutcome(outcomeOrEnvelope)              // M72 (normalise if needed)
  const policyResult = evaluateGatePolicy(outcome, policy)  // M74 → { ok, reasons, policyApplied }

  const ok = policyResult.ok
  const exitCode = ok ? 0 : 1

  const ruleNames = policyResult.reasons.map((r) => r.split(':')[0])
  const base = ok ? 'policy=pass' : `policy=fail reasons=${policyResult.reasons.length} ${ruleNames.join(',')}`
  const line = format === 'full'
    ? `${base} | ${serializeGateOutcome(outcome, { format: 'line' })}`   // reuse M73
    : base

  return deepFreeze({
    ok,
    exitCode,
    reasons: policyResult.reasons,
    line,
    policyApplied: policyResult.policyApplied,
  })
}
