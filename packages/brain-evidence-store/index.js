/**
 * @brain/evidence-store (M44)
 *
 * The dormant Evidence Store skeleton — the tenant-scoped store contract + API
 * surface for the inbound (evidence) half of the AI Brain, per the approved M42
 * architecture and built on @brain/evidence-contracts (its ONLY dependency).
 *
 * Pure + deterministic: it VALIDATES (tenant scoping + contract shape) and nothing
 * more. It PERSISTS NOTHING — no in-memory state, no files, no database, no
 * network, no driver. Every well-formed call resolves to `not_implemented` until a
 * later milestone injects a storage driver behind this surface. Imported by
 * nobody yet (dormant).
 */

export { createEvidenceStore, EVIDENCE_STORE_METHODS } from './store.js'
export { EvidenceStoreError, STORE_ERROR, fail } from './errors.js'
export { assertTenant, sameTenant } from './validate.js'
export * from './types.js'
