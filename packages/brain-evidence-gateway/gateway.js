/**
 * @brain/evidence-gateway — the Evidence Gateway (M45, DORMANT)
 *
 * The write-side composition root: it sits between evidence sources and the
 * Evidence Store and defines the deterministic ingestion pipeline. It runs the
 * fixed stage registry in order; `validate` enforces strict tenant scoping FIRST,
 * and every substantive stage is a deferred placeholder (no work, no persistence).
 *
 * An Evidence Store may be injected for the FUTURE (when stages do real work), but
 * M45 NEVER calls a store persistence method — the gateway writes nothing. The
 * only dependencies are @brain/evidence-store (pure `assertTenant`, via the stages)
 * and @brain/evidence-contracts (the contract version). No engines, no Core, no
 * I/O, no LLM, no randomness, no clock.
 */

import { EVIDENCE_GATEWAY_STAGES, EVIDENCE_GATEWAY_STAGE_NAMES } from './registry.js'
import { createGatewayContext, isGatewayContext } from './context.js'
import { prepareFullPipelinePlan } from './pipeline.js'
import { snapshotPipelinePlan } from './snapshot.js'
import { checkPipelineAgainstExpected } from './check.js'
import { checkPipelineSuite } from './check-suite.js'
import { formatPipelineSuiteReport } from './check-report.js'
import { createExpectationSet, resolveExpectationSet } from './expectation-set.js'
import { runExpectationGate } from './run-gate.js'
import { emitGateOutcome } from './emit-gate.js'
import { serializeGateOutcome } from './serialize-gate.js'
import { evaluateGatePolicy } from './evaluate-policy.js'
import { decideGate } from './decide-gate.js'
import { gateCI } from './gate-ci.js'
import { serializeGateDecision } from './serialize-decision.js'
import { serializeGateReport } from './serialize-report.js'
import { serializeGateCI } from './serialize-ci.js'
import { createGateManifest } from './manifest.js'
import { compareGateManifests } from './compare-manifests.js'
import { serializeGateManifest } from './serialize-manifest.js'
import { summarizeManifestComparison } from './summarize-comparison.js'
import { verifyGateManifest } from './verify-manifest.js'
import { gateManifestSigningPayload } from './signing-payload.js'
import { verifyGateManifestSignature } from './verify-signature.js'

/**
 * Build the dormant Evidence Gateway.
 *
 * @param {{ store?: object|null, onStage?: ((name:string)=>void)|null }} [deps]
 *   store   — an @brain/evidence-store instance, held for future use (NEVER called
 *             for persistence in M45)
 *   onStage — optional observability hook, invoked with each stage name BEFORE it
 *             runs (pure DI; default off — used by tests to prove stage order)
 * @returns {Readonly<import('./types.js').EvidenceGateway>}
 */
export function createEvidenceGateway({ store = null, onStage = null } = {}) {
  const hook = typeof onStage === 'function' ? onStage : null

  return Object.freeze({
    /** Held for a future milestone's real stages; not called for persistence in M45. */
    store,
    /** The canonical pipeline order. */
    stages: EVIDENCE_GATEWAY_STAGE_NAMES,

    /**
     * Run the pipeline for one submission. Deterministic; tenant-validated first.
     * @param {import('./types.js').GatewayContext|object} input
     * @returns {Promise<Readonly<import('./types.js').GatewayResult>>}
     */
    async submit(input) {
      const context = isGatewayContext(input) ? input : createGatewayContext(input)
      const results = []
      for (const stage of EVIDENCE_GATEWAY_STAGES) {
        if (hook) hook(stage.name)
        results.push(stage.run(context))   // `validate` throws invalid_tenant → halts the pipeline
      }
      return Object.freeze({
        ingestRunId: context.ingestRunId,
        tenant: context.tenant,
        ok: true,
        stages: EVIDENCE_GATEWAY_STAGE_NAMES,
        results: Object.freeze(results),
      })
    },

    /**
     * Run the entire DORMANT pipeline once and return one immutable PipelinePlan
     * (M64). Pure composition over the existing stage helpers — deferred, deterministic,
     * stores/writes nothing. Delegates to `prepareFullPipelinePlan`.
     * @param {{ registry: object, records: object[], context: object }} input
     */
    planRun(input) {
      return prepareFullPipelinePlan(input)
    },

    /**
     * Run the dormant pipeline once and return its deterministic snapshot (canonical
     * JSON + fingerprint, M65). Pure composition of `planRun` + `snapshotPipelinePlan`.
     * @param {{ registry: object, records: object[], context: object }} input
     */
    snapshotRun(input) {
      return snapshotPipelinePlan(prepareFullPipelinePlan(input))
    },

    /**
     * Run the dormant pipeline once and check it against a stored EXPECTED snapshot —
     * a dormant regression gate (M67). Pure composition of `planRun` +
     * `checkPipelineAgainstExpected`; reads only, persists nothing.
     * @param {{ registry: object, records: object[], context: object }} input
     * @param {object} expectedSnapshot  the stored baseline (M65 snapshot or M64 plan)
     * @param {{ allowlist?: (string[] | { paths?: string[], stages?: string[] }) }} [options]
     */
    checkRun(input, expectedSnapshot, options = {}) {
      return checkPipelineAgainstExpected(prepareFullPipelinePlan(input), expectedSnapshot, options)
    },

    /**
     * Run a suite of expectation cases through the dormant gate and aggregate the
     * verdicts — a multi-case regression gate (M68). Pure delegation to
     * `checkPipelineSuite`; reads only, persists nothing.
     * @param {Array<{ name:string, planOrSnapshot:object, expectedSnapshot:object,
     *                 allowlist?:(string[] | { paths?:string[], stages?:string[] }) }>} cases
     * @param {{ allowlist?: (string[] | { paths?:string[], stages?:string[] }) }} [options]
     */
    checkSuite(cases, options = {}) {
      return checkPipelineSuite(cases, options)
    },

    /**
     * Format an M68 suite verdict (or a single M67 verdict) into a deterministic,
     * human-readable report (M69). Pure delegation to `formatPipelineSuiteReport`;
     * reads only, persists nothing.
     * @param {object} verdict  an M68 suite verdict or an M67 single verdict
     * @param {{ maxEntriesPerCase?: number }} [options]
     */
    formatSuiteReport(verdict, options = {}) {
      return formatPipelineSuiteReport(verdict, options)
    },

    /**
     * Assemble a frozen, named expectation-set registry (M70). Pure data assembly —
     * runs no checks; reads only.
     * @param {Array<object>} entries
     */
    createExpectationSet(entries) {
      return createExpectationSet(entries)
    },

    /**
     * Resolve an expectation set against fresh runs into an M68-compatible cases array
     * (M70). Pure data assembly; reads only.
     * @param {object} expectationSet
     * @param {(Record<string, object>|Array<object>)} [runs]
     */
    resolveExpectationSet(expectationSet, runs = {}) {
      return resolveExpectationSet(expectationSet, runs)
    },

    /**
     * Run the whole dormant gate chain in one call — resolve (M70) → check (M68) →
     * report (M69) — returning a frozen { cases, verdict, report } envelope (M71).
     * Pure delegation to `runExpectationGate`; reads only, persists nothing.
     * @param {object} expectationSet
     * @param {(Record<string, object>|Array<object>)} [runs]
     * @param {{ allowlist?: (string[]|{paths?:string[],stages?:string[]}), maxEntriesPerCase?: number }} [options]
     */
    runExpectationGate(expectationSet, runs = {}, options = {}) {
      return runExpectationGate(expectationSet, runs, options)
    },

    /**
     * Convert an M71 envelope / M68 suite verdict / M67 single verdict into a
     * deterministic machine-readable gate outcome for CI (M72). Pure delegation to
     * `emitGateOutcome`; reads only, persists nothing.
     * @param {object} envelopeOrVerdict
     * @param {{ maxAnnotations?: number }} [options]
     */
    emitGateOutcome(envelopeOrVerdict, options = {}) {
      return emitGateOutcome(envelopeOrVerdict, options)
    },

    /**
     * Serialize an M72 gate outcome into a stable CI text representation — "json",
     * "line", or "annotations" (M73). Pure delegation to `serializeGateOutcome`;
     * returns a string, writes nothing.
     * @param {object} outcome
     * @param {{ format?: ('json'|'line'|'annotations') }} [options]
     */
    serializeGateOutcome(outcome, options = {}) {
      return serializeGateOutcome(outcome, options)
    },

    /**
     * Evaluate a declarative release policy against an existing M72 gate outcome (M74).
     * Pure delegation to `evaluateGatePolicy`; reads only, reruns nothing, persists nothing.
     * @param {object} outcome
     * @param {object} [policy]
     */
    evaluateGatePolicy(outcome, policy = {}) {
      return evaluateGatePolicy(outcome, policy)
    },

    /**
     * Turn a policy decision into a CI-friendly release decision — { ok, exitCode (0|1),
     * reasons, line, policyApplied } (M75). Pure delegation to `decideGate`; reads only,
     * reruns nothing, persists nothing.
     * @param {object} outcomeOrEnvelope
     * @param {object} [policy]
     * @param {{ format?: ('line'|'full') }} [options]
     */
    decideGate(outcomeOrEnvelope, policy = {}, options = {}) {
      return decideGate(outcomeOrEnvelope, policy, options)
    },

    /**
     * Run the complete dormant verification pipeline in one call — resolve (M70) → suite
     * (M68) → report (M69) → outcome (M72) → policy (M74) → decision (M75) — returning a
     * frozen { envelope, outcome, decision } (M76). Pure delegation to `gateCI`; reads
     * only, persists nothing.
     * @param {object} expectationSet
     * @param {(Record<string, object>|Array<object>)} [runs]
     * @param {{ allowlist?:any, maxEntriesPerCase?:number, policy?:object, decisionFormat?:('line'|'full') }} [options]
     */
    gateCI(expectationSet, runs = {}, options = {}) {
      return gateCI(expectationSet, runs, options)
    },

    /**
     * Serialize an M75 gate decision into a stable text representation — "json", "line",
     * or "reasons" (M79). Pure delegation to `serializeGateDecision`; returns a string,
     * writes nothing.
     * @param {object} decision
     * @param {{ format?: ('json'|'line'|'reasons') }} [options]
     */
    serializeGateDecision(decision, options = {}) {
      return serializeGateDecision(decision, options)
    },

    /**
     * Serialize an M69 human report into a stable text representation — "text", "json",
     * or "markdown" (M81). Pure delegation to `serializeGateReport`; returns a string,
     * writes nothing.
     * @param {object} report
     * @param {{ format?: ('text'|'json'|'markdown') }} [options]
     */
    serializeGateReport(report, options = {}) {
      return serializeGateReport(report, options)
    },

    /**
     * Bundle the serialized artifacts of a gateCI result — report (M81), outcome (M73),
     * and decision (M79) — into one frozen { report, outcome, decision } record of
     * strings (M82). Pure delegation to `serializeGateCI`; reads only, writes nothing.
     * @param {object} result   a gateCI result { envelope, outcome, decision }
     * @param {{ reportFormat?:string, outcomeFormat?:string, decisionFormat?:string }} [options]
     */
    serializeGateCI(result, options = {}) {
      return serializeGateCI(result, options)
    },

    /**
     * Build a deterministic, deeply-frozen provenance manifest describing a gateCI result —
     * for audit, replay, caching, signatures (M83). Pure delegation to `createGateManifest`;
     * reads only, describes the result only (reruns nothing), persists nothing.
     * @param {object} result   a gateCI result { envelope, outcome, decision }
     */
    createGateManifest(result) {
      return createGateManifest(result)
    },

    /**
     * Compare two M83 gate manifests and report what changed — a deterministic, deeply
     * frozen diff (M84). Pure delegation to `compareGateManifests`; reads manifest fields
     * only, re-digests nothing, reruns nothing.
     * @param {object} a   an M83 manifest (before)
     * @param {object} b   an M83 manifest (after)
     */
    compareGateManifests(a, b) {
      return compareGateManifests(a, b)
    },

    /**
     * Serialize an M83 gate manifest into a stable text representation — "json" or "line"
     * (M85). Pure delegation to `serializeGateManifest`; returns a string, writes nothing.
     * @param {object} manifest
     * @param {{ format?: ('json'|'line') }} [options]
     */
    serializeGateManifest(manifest, options = {}) {
      return serializeGateManifest(manifest, options)
    },

    /**
     * Summarize an M84 manifest comparison into a stable text representation — "line",
     * "text", "markdown", or "json" (M86). Pure delegation to
     * `summarizeManifestComparison`; returns a string, writes nothing.
     * @param {object} comparison
     * @param {{ format?: ('line'|'text'|'markdown'|'json') }} [options]
     */
    summarizeManifestComparison(comparison, options = {}) {
      return summarizeManifestComparison(comparison, options)
    },

    /**
     * Verify an M83 gate manifest's self-digest — recompute its pipelineDigest from the
     * payload and compare to the stored value (M87). Pure delegation to
     * `verifyGateManifest`; reads only, reruns nothing, persists nothing.
     * @param {object} manifest
     */
    verifyGateManifest(manifest) {
      return verifyGateManifest(manifest)
    },

    /**
     * Expose the deterministic signing payload for an M83 gate manifest — { pipelineDigest,
     * canonical } — groundwork for future attestation/signing (M88). No crypto, no real
     * signing. Pure delegation to `gateManifestSigningPayload`; reads only, writes nothing.
     * @param {object} manifest
     */
    gateManifestSigningPayload(manifest) {
      return gateManifestSigningPayload(manifest)
    },

    /**
     * Verify a signature over an M83 manifest's signing payload using an injected,
     * external crypto verifier (M89). No crypto is imported or implemented here. Pure
     * delegation to `verifyGateManifestSignature`; reads only.
     * @param {object} manifest
     * @param {*} signature
     * @param {(payload: object, signature:*) => boolean} verifyFn
     */
    verifyGateManifestSignature(manifest, signature, verifyFn) {
      return verifyGateManifestSignature(manifest, signature, verifyFn)
    },
  })
}
