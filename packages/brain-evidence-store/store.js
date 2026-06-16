/**
 * @brain/evidence-store — the Evidence Store (M44 skeleton + M46 driver injection)
 *
 * Defines the tenant-scoped store contract + API surface. Each method
 * deterministically validates its arguments (tenant scoping + contract shape),
 * then delegates to an injected `EvidenceDriver` (see types.js).
 *
 * DORMANT BY DEFAULT: with NO driver, every well-formed call throws
 * `not_implemented` — the store persists nothing of its own (no files, no
 * database, no network). A driver is injected only by tests / future dormant
 * gateway validation (e.g. the in-memory driver), never by runtime code.
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
 * Build the Evidence Store. Validates every call (tenant first), then delegates to
 * the injected driver. With no driver the store is DORMANT — well-formed calls
 * throw `not_implemented` and nothing is persisted.
 *
 * @param {{ driver?: import('./types.js').EvidenceDriver|null }} [deps]
 * @returns {Readonly<import('./types.js').EvidenceStore>}
 */
export function createEvidenceStore({ driver = null } = {}) {
  const drv = driver && typeof driver === 'object' ? driver : null

  return Object.freeze({
    /** Append one immutable EvidenceRecord (tenant comes from the record). */
    async appendEvidence(record) {
      validateRecord(record)                       // includes tenant scoping
      return drv ? drv.put(record) : dormant('appendEvidence')
    },

    /** Fetch one record by id, scoped to a tenant. */
    async getEvidenceById(tenant, id) {
      assertTenant(tenant)
      assertId(id, 'id')
      return drv ? drv.get(tenant, id) : dormant('getEvidenceById')
    },

    /** Query records within a tenant by optional filters. */
    async queryEvidence(tenant, query) {
      assertTenant(tenant)
      const q = validateQuery(query)
      return drv ? drv.find(tenant, q) : dormant('queryEvidence')
    },

    /** List all records about one subject within a tenant (composed on the driver). */
    async listEvidenceForSubject(tenant, subject) {
      assertTenant(tenant)
      validateSubjectRef(subject)
      return drv
        ? drv.find(tenant, { subjectType: subject.subjectType, subjectId: subject.subjectId })
        : dormant('listEvidenceForSubject')
    },

    /** Append an audit entry to an existing record (append-only), scoped to a tenant. */
    async appendAuditEntry(tenant, evidenceId, auditEntry) {
      assertTenant(tenant)
      assertId(evidenceId, 'evidenceId')
      validateAuditEntry(auditEntry)
      return drv ? drv.appendAudit(tenant, evidenceId, auditEntry) : dormant('appendAuditEntry')
    },

    /**
     * Resolve a recommendation's evidence citation (ids → records) within a tenant,
     * preserving citation order and skipping ids that do not resolve. Composed on
     * the driver's `get`.
     */
    async resolveEvidenceCitation(tenant, evidenceIds) {
      assertTenant(tenant)
      assertIdArray(evidenceIds, 'evidenceIds')
      if (!drv) return dormant('resolveEvidenceCitation')
      const out = []
      for (const id of evidenceIds) {
        const rec = await drv.get(tenant, id)
        if (rec) out.push(rec)
      }
      return Object.freeze(out)
    },
  })
}
