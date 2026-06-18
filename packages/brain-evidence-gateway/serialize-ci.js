/**
 * @brain/evidence-gateway — unified CI artifact bundler / serializeGateCI (M82, DORMANT)
 *
 * A pure orchestration helper that takes a `gateCI` result ({ envelope, outcome, decision },
 * M76) and returns one frozen bundle of stable text artifacts — the human report, the
 * machine outcome, and the decision — each serialized in a chosen format by reusing the
 * existing serializers: M81 `serializeGateReport`, M73 `serializeGateOutcome`, and M79
 * `serializeGateDecision`.
 *
 * Orchestration only: it adds no serialization logic of its own; per-artifact format
 * selection, defaults, and unknown-format rejection all come from those serializers. Reads
 * only — no store, engine, persistence, filesystem, API, network, clock or randomness. The
 * input is never mutated; the returned bundle (a record of strings) is frozen.
 */

import { serializeGateReport } from './serialize-report.js'
import { serializeGateOutcome } from './serialize-gate.js'
import { serializeGateDecision } from './serialize-decision.js'

const isObj = (v) => v !== null && typeof v === 'object'

/**
 * Bundle the serialized artifacts of a gate CI run.
 *
 * @param {{ envelope: { report: object }, outcome: object, decision: object }} result
 *   a result from `gateCI` (M76)
 * @param {{
 *   reportFormat?: ('text'|'json'|'markdown'),
 *   outcomeFormat?: ('json'|'line'|'annotations'),
 *   decisionFormat?: ('json'|'line'|'reasons')
 * }} [options]
 *   per-artifact format selection; each defaults to its serializer's default
 *   (report→"text", outcome→"json", decision→"json") when omitted.
 * @returns {Readonly<{ report:string, outcome:string, decision:string }>}
 */
export function serializeGateCI(result, options = {}) {
  if (!isObj(result) || !isObj(result.envelope) || !isObj(result.envelope.report) ||
      !isObj(result.outcome) || !isObj(result.decision)) {
    throw new TypeError('serializeGateCI requires a gateCI result { envelope: { report }, outcome, decision }')
  }
  const { reportFormat, outcomeFormat, decisionFormat } = options || {}

  return Object.freeze({
    report: serializeGateReport(result.envelope.report, { format: reportFormat }),       // M81
    outcome: serializeGateOutcome(result.outcome, { format: outcomeFormat }),            // M73
    decision: serializeGateDecision(result.decision, { format: decisionFormat }),        // M79
  })
}
