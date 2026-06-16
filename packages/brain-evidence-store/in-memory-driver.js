/**
 * @brain/evidence-store — in-memory EvidenceDriver (M46)
 *
 * A deterministic, append-only, tenant-scoped storage driver — for TESTS and the
 * future dormant gateway validation ONLY. NOT production storage.
 *
 * Guarantees:
 *   - deterministic: no Date, no Math.random, no auto-generated ids — the caller
 *     supplies all ids and timestamps;
 *   - tenant-scoped: every read/write is keyed by the full tenant; cross-tenant
 *     data never leaks;
 *   - append-only: a record id is written once (re-put → `conflict`); stored
 *     records are never mutated or deleted; audit entries only accumulate;
 *   - insertion order preserved on queries;
 *   - never mutates caller input (everything is deep-cloned on the way in);
 *   - returns deeply-frozen clones (callers cannot mutate the store).
 *
 * No files, no database, no network, no engine/Core/Experience imports. Implements
 * the `EvidenceDriver` seam ({ put, get, find, appendAudit }) the store delegates to.
 */

import { fail, STORE_ERROR } from './errors.js'
import { frozenClone } from './clone.js'

/** Deterministic key for a full tenant scope (club + team + season). */
const tenantKey = (t) => JSON.stringify([t.clubId, t.teamId ?? null, t.seasonId ?? null])

export function createInMemoryEvidenceDriver() {
  const records = []          // append-only: { key, id, record (frozen clone) } — insertion order
  const byKeyId = new Map()   // `${key}::${id}` → frozen record (O(1) get + duplicate detection)
  const audits  = new Map()   // `${key}::${id}` → AuditEntry[] (internal, append-only)

  /** A frozen view of a record with its appended audit entries merged in (append-only). */
  function view(key, id, record) {
    const extra = audits.get(`${key}::${id}`)
    if (!extra || extra.length === 0) return record
    return frozenClone({ ...record, audit: [...(Array.isArray(record.audit) ? record.audit : []), ...extra] })
  }

  return Object.freeze({
    /** Append one immutable record (append-only; caller input is cloned, never mutated). */
    put(record) {
      const key = tenantKey(record.tenant)
      const kid = `${key}::${record.id}`
      if (byKeyId.has(kid)) fail(STORE_ERROR.CONFLICT, `evidence "${record.id}" already exists (append-only)`)
      const stored = frozenClone(record)
      records.push({ key, id: record.id, record: stored })
      byKeyId.set(kid, stored)
      return Object.freeze({ id: record.id })
    },

    /** Fetch one record by id within a tenant, or null. */
    get(tenant, id) {
      const key = tenantKey(tenant)
      const rec = byKeyId.get(`${key}::${id}`)
      return rec ? view(key, id, rec) : null
    },

    /** Find records within a tenant by optional filters, in insertion order. */
    find(tenant, query) {
      const key = tenantKey(tenant)
      const q = query ?? {}
      const out = []
      for (const e of records) {
        if (e.key !== key) continue                                  // strict tenant isolation
        const r = e.record
        if (q.subjectType && r.subjectType !== q.subjectType) continue
        if (q.subjectId && r.subjectId !== q.subjectId) continue
        if (q.sourceType && r.sourceType !== q.sourceType) continue
        if (q.sourceFamily && r.sourceFamily !== q.sourceFamily) continue
        if (q.signalKey && !(Array.isArray(r.signals) && r.signals.some(s => s && s.key === q.signalKey))) continue
        if (q.since && !(typeof r.observedAt === 'string' && r.observedAt >= q.since)) continue
        if (q.until && !(typeof r.observedAt === 'string' && r.observedAt <= q.until)) continue
        if (typeof q.minConfidence === 'number' && !(r.confidence >= q.minConfidence)) continue
        out.push(view(key, e.id, r))
        if (typeof q.limit === 'number' && out.length >= q.limit) break
      }
      return Object.freeze(out)
    },

    /** Append an audit entry to an existing record (append-only; caller entry cloned). */
    appendAudit(tenant, evidenceId, entry) {
      const key = tenantKey(tenant)
      const kid = `${key}::${evidenceId}`
      if (!byKeyId.has(kid)) fail(STORE_ERROR.NOT_FOUND, `evidence "${evidenceId}" not found in tenant`)
      const list = audits.get(kid) ?? []
      list.push(frozenClone(entry))
      audits.set(kid, list)
    },
  })
}
