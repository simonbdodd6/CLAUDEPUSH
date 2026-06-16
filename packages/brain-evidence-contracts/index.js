/**
 * @brain/evidence-contracts (M43)
 *
 * Shared AI Brain evidence-ingestion contracts — the pure data spine for the
 * inbound (evidence) half of the intelligence loop defined in the approved M42
 * architecture. Canonical enums + the confidence-weight contract + the documented
 * type surface (EvidenceRecord / NormalizedSignal / AuditEntry / Provenance …).
 *
 * Depends on NOTHING. No storage, no ingestion, no providers, no network, no
 * browser code, no engine/Core imports, no runtime logic. DORMANT in M43 —
 * imported by nobody yet; the later Evidence Gateway will build on it.
 */

export * from './enums.js'
export * from './weights.js'
export * from './types.js'
