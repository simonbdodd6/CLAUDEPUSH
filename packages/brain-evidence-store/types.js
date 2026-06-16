/**
 * @brain/evidence-store — type surface (M44)
 *
 * JSDoc typedefs for the store contract. DOCUMENTATION ONLY — no runtime values.
 * The `EvidenceDriver` typedef documents the seam a FUTURE milestone fills with a
 * storage implementation (in-memory, then persistent); M44 ships no driver.
 *
 * @typedef {import('@brain/evidence-contracts').EvidenceRecord} EvidenceRecord
 * @typedef {import('@brain/evidence-contracts').AuditEntry} AuditEntry
 * @typedef {import('@brain/evidence-contracts').Tenant} Tenant
 */

/**
 * A reference to one subject in the knowledge graph.
 * @typedef {Object} SubjectRef
 * @property {'player'|'team'|'coach'|'fixture'|'opponent'|'club'|'drill'|'session'} subjectType
 * @property {string} subjectId
 */

/**
 * Optional query filters (all optional; tenant is passed separately + always required).
 * @typedef {Object} EvidenceQuery
 * @property {string}  [subjectType]
 * @property {string}  [subjectId]
 * @property {string}  [sourceType]
 * @property {string}  [sourceFamily]
 * @property {string}  [signalKey]
 * @property {string}  [since]          ISO — observedAt lower bound
 * @property {string}  [until]          ISO — observedAt upper bound
 * @property {number}  [minConfidence]  0..1
 * @property {number}  [limit]
 */

/**
 * The tenant-scoped Evidence Store contract. Every method is tenant-scoped; reads
 * never cross a tenant boundary. (M44: validates then throws `not_implemented`.)
 * @typedef {Object} EvidenceStore
 * @property {(record:EvidenceRecord) => Promise<{id:string}>} appendEvidence
 * @property {(tenant:Tenant, id:string) => Promise<EvidenceRecord|null>} getEvidenceById
 * @property {(tenant:Tenant, query?:EvidenceQuery) => Promise<EvidenceRecord[]>} queryEvidence
 * @property {(tenant:Tenant, subject:SubjectRef) => Promise<EvidenceRecord[]>} listEvidenceForSubject
 * @property {(tenant:Tenant, evidenceId:string, auditEntry:AuditEntry) => Promise<void>} appendAuditEntry
 * @property {(tenant:Tenant, evidenceIds:string[]) => Promise<EvidenceRecord[]>} resolveEvidenceCitation
 */

/**
 * FUTURE seam — the storage driver a later milestone injects behind the store.
 * Not implemented in M44. A driver receives already-validated, tenant-scoped input
 * and is the ONLY component that touches persistence; it must itself never cross a
 * tenant boundary.
 * @typedef {Object} EvidenceDriver
 * @property {(record:EvidenceRecord) => Promise<{id:string}>} put
 * @property {(tenant:Tenant, id:string) => Promise<EvidenceRecord|null>} get
 * @property {(tenant:Tenant, query:EvidenceQuery) => Promise<EvidenceRecord[]>} find
 * @property {(tenant:Tenant, evidenceId:string, auditEntry:AuditEntry) => Promise<void>} appendAudit
 */

export {}
