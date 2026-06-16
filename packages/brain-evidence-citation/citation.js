/**
 * @brain/evidence-citation — deterministic citation validation (M48, DORMANT)
 *
 * Pure deterministic validation that a recommendation's evidence citation traces
 * back to real, same-tenant, non-duplicate evidence records — the M42 §4a citation
 * gate. It owns NO storage: store-backed checks read through an INJECTED
 * @brain/evidence-store (tenant-scoped); the data-only helpers are pure over
 * caller-supplied records.
 *
 * Guarantees:
 *   - every cited id must resolve (missing reported); every record same-tenant;
 *     duplicate citations rejected; deterministic ordering (citation order); never
 *     mutates caller input; immutable (frozen) results;
 *   - no Date, no Math.random, no side effects, no storage of its own, no network,
 *     no engine/gateway/Experience imports.
 *
 * Imports only @brain/evidence-store (pure `assertTenant` / `sameTenant`). Imported
 * by nobody yet (dormant).
 */

import { assertTenant, sameTenant } from '@brain/evidence-store'
import { CitationError, CITATION_ERROR } from './errors.js'

const isStr = (v) => typeof v === 'string' && v.length > 0

function assertIdArray(ids, label = 'evidenceIds') {
  if (!Array.isArray(ids) || !ids.every(isStr)) {
    throw new CitationError(CITATION_ERROR.INVALID_INPUT, `${label} must be a string[]`)
  }
  return ids
}

function assertRecordArray(records, label = 'records') {
  if (!Array.isArray(records)) throw new CitationError(CITATION_ERROR.INVALID_INPUT, `${label} must be an array`)
  return records
}

function assertStore(store) {
  if (!store || typeof store.getEvidenceById !== 'function') {
    throw new CitationError(CITATION_ERROR.INVALID_INPUT, 'a store with getEvidenceById(tenant,id) is required')
  }
  return store
}

// ── pure, data-only helpers ─────────────────────────────────────────────────────

/** Cited ids that appear more than once, in first-duplicate-detection order. */
export function duplicateEvidence(evidenceIds) {
  assertIdArray(evidenceIds)
  const seen = new Set(), dup = new Set()
  for (const id of evidenceIds) (seen.has(id) ? dup : seen).add(id)
  const duplicates = [...dup]
  return Object.freeze({ duplicates: Object.freeze(duplicates), hasDuplicates: duplicates.length > 0 })
}

/** Cited ids with no matching record (by `id`), in citation order, de-duplicated. */
export function missingEvidence(evidenceIds, records) {
  assertIdArray(evidenceIds); assertRecordArray(records)
  const present = new Set(records.filter(r => r && isStr(r.id)).map(r => r.id))
  const missing = [], seen = new Set()
  for (const id of evidenceIds) {
    if (!present.has(id) && !seen.has(id)) { missing.push(id); seen.add(id) }
  }
  return Object.freeze(missing)
}

/** Coverage of a citation by a resolved record set (unique cited ids). */
export function citationCoverage(evidenceIds, records) {
  assertIdArray(evidenceIds); assertRecordArray(records)
  const unique = [...new Set(evidenceIds)]
  const present = new Set(records.filter(r => r && isStr(r.id)).map(r => r.id))
  const resolved = unique.filter(id => present.has(id)).length
  return Object.freeze({
    cited: unique.length,
    resolved,
    missing: unique.length - resolved,
    coverage: unique.length === 0 ? 0 : resolved / unique.length,
  })
}

/** Validate an already-resolved record set within a tenant (pure). */
export function validateEvidenceSet(records, { tenant } = {}) {
  assertRecordArray(records); assertTenant(tenant)
  const ids = new Set(), duplicateIds = new Set(), crossTenant = []
  for (const r of records) {
    if (!r || typeof r !== 'object') throw new CitationError(CITATION_ERROR.INVALID_INPUT, 'records must contain objects')
    if (ids.has(r.id)) duplicateIds.add(r.id); else ids.add(r.id)
    if (!sameTenant(r.tenant, tenant)) crossTenant.push(r.id)
  }
  const dups = [...duplicateIds]
  return Object.freeze({
    valid: dups.length === 0 && crossTenant.length === 0 && records.length > 0,
    count: records.length,
    duplicateIds: Object.freeze(dups),
    crossTenant: Object.freeze(crossTenant),
  })
}

// ── store-backed validation (async; reads via the injected store) ────────────────

/**
 * Validate a recommendation's evidence citation against the injected store.
 * A citation is valid iff: it is non-empty, has no duplicates, and every unique id
 * resolves to a same-tenant record. Missing / duplicate / cross-tenant ids are all
 * reported (never hidden). Deterministic; reads are tenant-scoped.
 *
 * @returns {Promise<Readonly<{ valid:boolean, missing:string[], duplicates:string[], crossTenant:string[], resolved:object[], coverage:object }>>}
 */
export async function validateEvidenceCitation(evidenceIds, { store, tenant } = {}) {
  assertIdArray(evidenceIds); assertTenant(tenant); assertStore(store)
  const dup = duplicateEvidence(evidenceIds)
  const uniqueIds = [...new Set(evidenceIds)]            // resolve uniques, citation order
  const resolved = [], missing = [], crossTenant = []
  for (const id of uniqueIds) {
    const rec = await store.getEvidenceById(tenant, id)
    if (!rec) { missing.push(id); continue }
    if (!sameTenant(rec.tenant, tenant)) { crossTenant.push(id); continue }   // defence in depth
    resolved.push(rec)
  }
  const coverage = citationCoverage(evidenceIds, resolved)
  const valid = uniqueIds.length > 0 && missing.length === 0 && crossTenant.length === 0 && !dup.hasDuplicates
  return Object.freeze({
    valid,
    missing: Object.freeze(missing),
    duplicates: dup.duplicates,
    crossTenant: Object.freeze(crossTenant),
    resolved: Object.freeze(resolved),
    coverage,
  })
}

/**
 * Resolve a citation and its provenance chain (each record's
 * `provenance.derivedFrom`), breadth-first, deterministic and cycle-safe, scoped to
 * a tenant. Unresolved ids are skipped. `maxDepth` bounds the chain (0 = only the
 * cited records).
 *
 * @returns {Promise<Readonly<{ records:object[], order:string[], truncated:boolean }>>}
 */
export async function resolveCitationChain(evidenceIds, { store, tenant, maxDepth = Infinity } = {}) {
  assertIdArray(evidenceIds); assertTenant(tenant); assertStore(store)
  const visited = new Set(), records = [], order = []
  let frontier = [...new Set(evidenceIds)]
  let depth = 0, truncated = false
  while (frontier.length) {
    if (depth > maxDepth) { truncated = true; break }
    const next = []
    for (const id of frontier) {
      if (visited.has(id)) continue
      visited.add(id)
      const rec = await store.getEvidenceById(tenant, id)
      if (!rec) continue
      records.push(rec); order.push(id)
      const parents = Array.isArray(rec.provenance && rec.provenance.derivedFrom) ? rec.provenance.derivedFrom : []
      for (const p of parents) if (isStr(p) && !visited.has(p)) next.push(p)
    }
    frontier = next
    depth++
  }
  return Object.freeze({ records: Object.freeze(records), order: Object.freeze(order), truncated })
}
