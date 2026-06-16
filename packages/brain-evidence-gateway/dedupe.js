/**
 * @brain/evidence-gateway — dedupe-key derivation (M57, DORMANT, data-only)
 *
 * Pure deterministic derivation of M42 §3.4 dedupe keys from the ACCEPTED entries of a
 * normalization ApplicationPlan (M54). It groups the accepted (record, signal) pairs
 * that WOULD be considered duplicates — it does NOT collapse anything, read or write
 * the Evidence Store, or activate persistence.
 *
 * The dedupe key follows §3.4 exactly:
 *   tenant + subjectId + signal.key + observedAt-bucket + sourceType
 * Each component comes only from data already present on the accepted entry / its
 * EvidenceRecord. The observedAt bucket is a deterministic CALENDAR-DAY bucket taken
 * from the ISO date prefix (`YYYY-MM-DD`) — derived by string slice, never `Date`/
 * clock. Only records in the `accepted` partition contribute, so unknown_source and
 * invalid_signals records never enter a group.
 *
 * No imports, no I/O, no clock, no randomness. Results are immutable; input is never
 * mutated.
 */

/** Component separator — ASCII Unit Separator, won't collide with field contents. */
const DELIM = '\u001f'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/

const seg = (v) => (v === null || v === undefined ? '' : String(v))

/** Deterministic tenant component: clubId|teamId|seasonId (nulls → empty). */
function tenantKey(tenant) {
  if (!tenant || typeof tenant !== 'object') return ''
  return [seg(tenant.clubId), seg(tenant.teamId), seg(tenant.seasonId)].join('|')
}

/**
 * Deterministic observedAt bucket: the `YYYY-MM-DD` calendar-day prefix of an ISO
 * timestamp, by string slice (NO Date/clock). Non-ISO / missing → '' (a stable bucket).
 * @param {unknown} observedAt @returns {string}
 */
export function observedAtBucket(observedAt) {
  return (typeof observedAt === 'string' && ISO_DATE.test(observedAt)) ? observedAt.slice(0, 10) : ''
}

/** The §3.4 dedupe key for one (record, signalKey) pair. */
export function deriveDedupeKey(record, signalKey) {
  const r = record && typeof record === 'object' ? record : {}
  return [
    tenantKey(r.tenant),
    seg(r.subjectId),
    seg(signalKey),
    observedAtBucket(r.observedAt),
    seg(r.sourceType),
  ].join(DELIM)
}

/**
 * Group the accepted (record, signal) pairs by dedupe key, preserving first-seen
 * order for groups and encounter order within each group. Returns a deferred
 * deduplication report — grouping only, NO collapsing.
 *
 * @param {{ accepted?: Array<{ index:number, recordId:string, signals:Array<{key:string}> }>,
 *           records?: Array<{ id:string, tenant?:object, subjectId?:string, observedAt?:string, sourceType?:string }> }} [input]
 * @returns {Readonly<{
 *   groups: ReadonlyArray<Readonly<{ key:string, entries:ReadonlyArray<object>, count:number, wouldCollapse:boolean }>>,
 *   total:number, duplicateGroups:number, wouldCollapseAny:boolean
 * }>}
 */
export function deriveDedupeGroups({ accepted = [], records = [] } = {}) {
  if (!Array.isArray(accepted) || !Array.isArray(records)) {
    throw new TypeError('deriveDedupeGroups requires { accepted: array, records: array }')
  }
  const byId = new Map()
  for (const r of records) {
    if (r && typeof r === 'object' && typeof r.id === 'string') byId.set(r.id, r)
  }

  const order = []
  const groups = new Map()    // key -> { key, entries: [] }

  for (const entry of accepted) {
    if (!entry || typeof entry !== 'object') continue
    const record = byId.get(entry.recordId)
    if (!record) continue       // accepted entries always have a record; skip defensively, never crash
    const signals = Array.isArray(entry.signals) ? entry.signals : []
    for (const signal of signals) {
      const signalKey = signal && typeof signal === 'object' ? signal.key : undefined
      const key = deriveDedupeKey(record, signalKey)
      let group = groups.get(key)
      if (!group) { group = { key, entries: [] }; groups.set(key, group); order.push(key) }
      group.entries.push(Object.freeze({ index: entry.index, recordId: entry.recordId, signalKey: seg(signalKey) }))
    }
  }

  const out = order.map((key) => {
    const { entries } = groups.get(key)
    const count = entries.length
    return Object.freeze({ key, entries: Object.freeze(entries), count, wouldCollapse: count > 1 })
  })

  return Object.freeze({
    groups: Object.freeze(out),
    total: out.reduce((n, g) => n + g.count, 0),
    duplicateGroups: out.filter((g) => g.wouldCollapse).length,
    wouldCollapseAny: out.some((g) => g.wouldCollapse),
  })
}
