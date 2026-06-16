/**
 * @brain/evidence-store — error model (M44)
 *
 * Pure, deterministic error codes for the Evidence Store contract. No logic
 * beyond carrying a stable `code`. No I/O.
 */

/** Stable store error codes. */
export const STORE_ERROR = Object.freeze({
  INVALID_TENANT:   'invalid_tenant',    // missing/malformed tenant — every call is tenant-scoped (§4.6)
  INVALID_RECORD:   'invalid_record',    // EvidenceRecord fails the contract shape
  INVALID_ARGUMENT: 'invalid_argument',  // id / query / subject / auditEntry malformed
  CROSS_TENANT:     'cross_tenant',      // an operation crossed a tenant boundary (reserved for the driver)
  NOT_IMPLEMENTED:  'not_implemented',   // skeleton has no storage driver yet (M44 — dormant)
})

export class EvidenceStoreError extends Error {
  /** @param {string} code @param {string} [message] */
  constructor(code, message) {
    super(message ?? code)
    this.name = 'EvidenceStoreError'
    this.code = code
  }
}

/** Throw helper — deterministic, no side effects. */
export function fail(code, message) {
  throw new EvidenceStoreError(code, message)
}
