/**
 * @brain/evidence-store — pure contract validators (M44)
 *
 * Deterministic, side-effect-free guards that enforce the Evidence Store contract:
 * strict tenant scoping (§4.6) and EvidenceRecord/argument shape (against the
 * @brain/evidence-contracts enums — the ONLY import). No storage, no I/O, no
 * randomness, no clock. These are the only behaviour the M44 skeleton has.
 */

import { SOURCE_TYPE, SOURCE_FAMILY, SUBJECT_TYPE, AUDIT_ACTION } from '@brain/evidence-contracts'
import { fail, STORE_ERROR } from './errors.js'

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v)
const isStr = (v) => typeof v === 'string' && v.length > 0

const SOURCE_TYPES   = new Set(Object.values(SOURCE_TYPE))
const SOURCE_FAMILIES = new Set(Object.values(SOURCE_FAMILY))
const SUBJECT_TYPES  = new Set(Object.values(SUBJECT_TYPE))
const AUDIT_ACTIONS  = new Set(Object.values(AUDIT_ACTION))

/** Every store call is tenant-scoped: a tenant MUST carry a clubId. Returns the tenant. */
export function assertTenant(tenant) {
  if (!isObj(tenant) || !isStr(tenant.clubId)) fail(STORE_ERROR.INVALID_TENANT, 'tenant.clubId is required')
  if (tenant.teamId != null && typeof tenant.teamId !== 'string') fail(STORE_ERROR.INVALID_TENANT, 'tenant.teamId must be string|null')
  if (tenant.seasonId != null && typeof tenant.seasonId !== 'string') fail(STORE_ERROR.INVALID_TENANT, 'tenant.seasonId must be string|null')
  return tenant
}

/** Two tenants are the same scope iff club + team + season all match (null-normalised). */
export function sameTenant(a, b) {
  return isObj(a) && isObj(b) &&
    a.clubId === b.clubId &&
    (a.teamId ?? null) === (b.teamId ?? null) &&
    (a.seasonId ?? null) === (b.seasonId ?? null)
}

export function assertId(id, label = 'id') {
  if (!isStr(id)) fail(STORE_ERROR.INVALID_ARGUMENT, `${label} is required`)
  return id
}

export function assertIdArray(ids, label = 'evidenceIds') {
  if (!Array.isArray(ids) || !ids.every(isStr)) fail(STORE_ERROR.INVALID_ARGUMENT, `${label} must be a string[]`)
  return ids
}

/** Validate an EvidenceRecord against the contract (shape + tenant). Returns the record. */
export function validateRecord(record) {
  if (!isObj(record)) fail(STORE_ERROR.INVALID_RECORD, 'record must be an object')
  assertTenant(record.tenant)
  if (!isStr(record.id)) fail(STORE_ERROR.INVALID_RECORD, 'record.id is required')
  if (!SOURCE_TYPES.has(record.sourceType)) fail(STORE_ERROR.INVALID_RECORD, `unknown sourceType: ${record.sourceType}`)
  if (!SOURCE_FAMILIES.has(record.sourceFamily)) fail(STORE_ERROR.INVALID_RECORD, `unknown sourceFamily: ${record.sourceFamily}`)
  if (!SUBJECT_TYPES.has(record.subjectType)) fail(STORE_ERROR.INVALID_RECORD, `unknown subjectType: ${record.subjectType}`)
  if (!isStr(record.subjectId)) fail(STORE_ERROR.INVALID_RECORD, 'record.subjectId is required')
  if (typeof record.confidence !== 'number' || record.confidence < 0 || record.confidence > 1) fail(STORE_ERROR.INVALID_RECORD, 'record.confidence must be 0..1')
  if (!Array.isArray(record.signals)) fail(STORE_ERROR.INVALID_RECORD, 'record.signals must be an array')
  return record
}

/** Validate an audit entry against the contract. Returns the entry. */
export function validateAuditEntry(entry) {
  if (!isObj(entry)) fail(STORE_ERROR.INVALID_ARGUMENT, 'auditEntry must be an object')
  if (!AUDIT_ACTIONS.has(entry.action)) fail(STORE_ERROR.INVALID_ARGUMENT, `unknown audit action: ${entry.action}`)
  if (!isStr(entry.at)) fail(STORE_ERROR.INVALID_ARGUMENT, 'auditEntry.at is required')
  if (!isStr(entry.actor)) fail(STORE_ERROR.INVALID_ARGUMENT, 'auditEntry.actor is required')
  return entry
}

/** Validate a subject reference { subjectType, subjectId }. Returns it. */
export function validateSubjectRef(subject) {
  if (!isObj(subject)) fail(STORE_ERROR.INVALID_ARGUMENT, 'subject must be an object')
  if (!SUBJECT_TYPES.has(subject.subjectType)) fail(STORE_ERROR.INVALID_ARGUMENT, `unknown subjectType: ${subject.subjectType}`)
  if (!isStr(subject.subjectId)) fail(STORE_ERROR.INVALID_ARGUMENT, 'subject.subjectId is required')
  return subject
}

/** Validate optional query filters. Returns a normalised (never null) query object. */
export function validateQuery(query) {
  if (query != null && !isObj(query)) fail(STORE_ERROR.INVALID_ARGUMENT, 'query must be an object')
  return query ?? {}
}
