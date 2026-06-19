/**
 * @brain/evidence-gateway (M45)
 *
 * The dormant write-side composition root for AI Brain evidence ingestion, per the
 * approved M42 architecture. It defines the deterministic pipeline
 * (receive → validate → normalize → deduplicate → prepare confidence/memory/audit/
 * exposure) as a fixed stage registry. `validate` enforces strict tenant scoping
 * first; every substantive stage is a pure deferred placeholder.
 *
 * Performs NO work and NO persistence: it never writes files, touches a database
 * or network, calls an engine, or invokes a store persistence method. Depends only
 * on @brain/evidence-contracts + @brain/evidence-store. Imported by nobody yet.
 */

export { createEvidenceGateway } from './gateway.js'
export { createGatewayContext, isGatewayContext } from './context.js'
export { EVIDENCE_GATEWAY_STAGES, EVIDENCE_GATEWAY_STAGE_NAMES, STAGE_BY_NAME } from './registry.js'
export { deriveDedupeGroups, deriveDedupeKey, observedAtBucket } from './dedupe.js'
export { deriveProvenanceProposals } from './provenance.js'
export { deriveConfidenceReweightProposals } from './reweight.js'
export { deriveConfidenceUpdatePlan } from './confidence-update.js'
export { deriveMemoryLinkPlan } from './memory-link.js'
export { deriveAuditPlan, AUDIT_PLAN_ACTION, AUDIT_OUTCOME_DEFERRED } from './audit.js'
export { deriveEngineExposurePlan } from './exposure.js'
export { prepareFullPipelinePlan } from './pipeline.js'
export { snapshotPipelinePlan, canonicalStringify, pipelineDigest } from './snapshot.js'
export { diffPipelineSnapshots } from './diff.js'
export { checkPipelineAgainstExpected } from './check.js'
export { checkPipelineSuite } from './check-suite.js'
export { formatPipelineSuiteReport } from './check-report.js'
export { createExpectationSet, resolveExpectationSet } from './expectation-set.js'
export { runExpectationGate } from './run-gate.js'
export { emitGateOutcome } from './emit-gate.js'
export { serializeGateOutcome } from './serialize-gate.js'
export { evaluateGatePolicy } from './evaluate-policy.js'
export { decideGate } from './decide-gate.js'
export { gateCI } from './gate-ci.js'
export { serializeGateDecision } from './serialize-decision.js'
export { serializeGateReport } from './serialize-report.js'
export { serializeGateCI } from './serialize-ci.js'
export { createGateManifest } from './manifest.js'
export { compareGateManifests } from './compare-manifests.js'
export { serializeGateManifest } from './serialize-manifest.js'
export { summarizeManifestComparison } from './summarize-comparison.js'
export { verifyGateManifest } from './verify-manifest.js'
export { gateManifestSigningPayload } from './signing-payload.js'
export { verifyGateManifestSignature } from './verify-signature.js'
export { attestationEnvelope } from './attestation-envelope.js'
export { verifyAttestationEnvelope } from './verify-envelope.js'
export { serializeAttestationEnvelope } from './serialize-envelope.js'
export { verifyAttestationEnvelopes } from './verify-envelopes.js'
export { summarizeAttestationBatch } from './summarize-attestation-batch.js'
export { gateManifestIndex } from './manifest-index.js'
export * from './types.js'
