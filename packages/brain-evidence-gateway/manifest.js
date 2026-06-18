/**
 * @brain/evidence-gateway — gate manifest / provenance descriptor / createGateManifest (M83, DORMANT)
 *
 * A pure deterministic provenance descriptor of exactly what a `gateCI` run (M76) consists
 * of — for audit, replay, caching, signatures, and future CI traceability. It is NOT a
 * report, decision, or serializer: it only DESCRIBES the result it is given.
 *
 * Digests reuse the existing M65 canonicaliser + digest helper (`canonicalStringify` →
 * `pipelineDigest`); no new hashing/canonicalisation system is introduced. Only existing
 * deterministic objects are digested — no timestamps, UUIDs, process/environment/filesystem
 * data, branch/commit names, clock or randomness. Reads only; the input is never mutated;
 * the manifest is deeply frozen.
 */

import { canonicalStringify, pipelineDigest } from './snapshot.js'

const MANIFEST_VERSION = 'gate-manifest/v1'
const ARTIFACT_TYPE = 'coach-eye-intelligence.gate-manifest'

const isObj = (v) => v !== null && typeof v === 'object'

/** Deterministic digest of any JSON value — reuses the M65 helpers (no new hashing logic). */
const digestOf = (value) => pipelineDigest(canonicalStringify(value))

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/**
 * Build a deterministic, deeply-frozen provenance manifest for a gateCI result.
 *
 * @param {{ envelope: { cases: object[], verdict: object, report: object },
 *           outcome: object, decision: object }} result  a gateCI result (M76)
 * @returns {Readonly<object>} the gate manifest
 */
export function createGateManifest(result) {
  if (!isObj(result) || !isObj(result.envelope) ||
      !Array.isArray(result.envelope.cases) || !isObj(result.envelope.report) ||
      !isObj(result.outcome) || !isObj(result.decision)) {
    throw new TypeError('createGateManifest requires a gateCI result { envelope: { cases, verdict, report }, outcome, decision }')
  }

  const { envelope, outcome, decision } = result
  const report = envelope.report

  // artifact digests — over the existing deterministic objects only
  const envelopeDigest = digestOf(envelope)
  const outcomeDigest = digestOf(outcome)
  const decisionDigest = digestOf(decision)
  const reportDigest = digestOf(report)

  const inputs = {
    caseCount: envelope.cases.length,
    caseNames: envelope.cases.map((c) => c.name),               // deterministic order from envelope.cases
    caseDigests: envelope.cases.map((c) => digestOf(c)),        // one digest per resolved case object
  }

  const policy = {
    ok: decision.ok,
    policyAppliedDigest: digestOf(decision.policyApplied),
    reasonCodes: Array.isArray(decision.reasonCodes) ? [...decision.reasonCodes] : [],
  }

  const outcomeBlock = {
    status: outcome.status,
    statusLine: outcome.statusLine,
    affectedStages: [...outcome.affectedStages],
    totalViolations: outcome.violations,
    totalTolerated: outcome.tolerated,
    outcomeDigest,
  }

  const decisionBlock = {
    ok: decision.ok,
    exitCode: decision.exitCode,
    line: decision.line,
    decisionDigest,
  }

  const reportBlock = {
    headline: report.headline,
    reportDigest,
  }

  const artifacts = { envelopeDigest, outcomeDigest, decisionDigest, reportDigest }

  // payload = the whole manifest minus its own pipelineDigest (so it never digests itself)
  const payload = {
    manifestVersion: MANIFEST_VERSION,
    artifactType: ARTIFACT_TYPE,
    inputs,
    policy,
    outcome: outcomeBlock,
    decision: decisionBlock,
    report: reportBlock,
    artifacts,
  }
  const manifestPipelineDigest = digestOf(payload)

  return deepFreeze({
    manifestVersion: MANIFEST_VERSION,
    artifactType: ARTIFACT_TYPE,
    pipelineDigest: manifestPipelineDigest,
    inputs,
    policy,
    outcome: outcomeBlock,
    decision: decisionBlock,
    report: reportBlock,
    artifacts,
  })
}
