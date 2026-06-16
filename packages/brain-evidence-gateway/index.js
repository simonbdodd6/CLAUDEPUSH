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
export * from './types.js'
