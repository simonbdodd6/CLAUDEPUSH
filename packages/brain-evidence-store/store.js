/**
 * @brain/evidence-store — the Evidence Store skeleton (M44, DORMANT)
 *
 * Defines the tenant-scoped store contract + API surface ONLY. Each method
 * deterministically validates its arguments (tenant scoping + contract shape),
 * then — because M44 ships NO storage driver — throws `not_implemented`.
 *
 * It therefore PERSISTS NOTHING: no in-memory state, no files, no database, no
 * network. A later milestone injects a driver behind this exact surface (the seam
 * is documented as `EvidenceDriver` in types.js). Imported by nobody yet.
 */

import { EvidenceStoreError, STORE_ERROR } from './errors.js'
import {
  assertTenant, assertId, assertIdArray,
  validateRecord, validateAuditEntry, validateSubjectRef, validateQuery,
} from './validate.js'

/** The contract surface — the method names every EvidenceStore implementation provides. */
export const EVIDENCE_STORE_METHODS = Object.freeze([
  'appendEvidence',
  'getEvidenceById',
  'queryEvidence',
  'listEvidenceForSubject',
  'appendAuditEntry',
  'resolveEvidenceCitation',
])

function dormant(method) {
  throw new EvidenceStoreError(
    STORE_ERROR.NOT_IMPLEMENTED,
    `EvidenceStore.${method} has no storage driver — M44 skeleton is dormant`,
  )
}

/**
 * Build the dormant Evidence Store. Validates every call (tenant first), then
 * defers to a driver — which does not exist in M44, so every well-formed call
 * resolves to `not_implemented`. No persistence of any kind.
 *
 * @returns {Readonly<import('./types.js').EvidenceStore>}
 */
export function createEvidenceStore() {
  return Object.freeze({
    /** Append one immutable EvidenceRecord (tenant comes from the record). */
    async appendEvidence(record) {
      validateRecord(record)                       // includes tenant scoping
      return dormant('appendEvidence')
    },

    /** Fetch one record by id, scoped to a tenant. */
    async getEvidenceById(tenant, id) {
      assertTenant(tenant)
      assertId(id, 'id')
      return dormant('getEvidenceById')
    },

    /** Query records within a tenant by optional filters. */
    async queryEvidence(tenant, query) {
      assertTenant(tenant)
      validateQuery(query)
      return dormant('queryEvidence')
    },

    /** List all records about one subject within a tenant. */
    async listEvidenceForSubject(tenant, subject) {
      assertTenant(tenant)
      validateSubjectRef(subject)
      return dormant('listEvidenceForSubject')
    },

    /** Append an audit entry to an existing record (append-only), scoped to a tenant. */
    async appendAuditEntry(tenant, evidenceId, auditEntry) {
      assertTenant(tenant)
      assertId(evidenceId, 'evidenceId')
      validateAuditEntry(auditEntry)
      return dormant('appendAuditEntry')
    },

    /** Resolve a recommendation's evidence citation (ids → records) within a tenant. */
    async resolveEvidenceCitation(tenant, evidenceIds) {
      assertTenant(tenant)
      assertIdArray(evidenceIds, 'evidenceIds')
      return dormant('resolveEvidenceCitation')
    },
  })
}
