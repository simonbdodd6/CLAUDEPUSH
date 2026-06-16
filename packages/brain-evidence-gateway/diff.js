/**
 * @brain/evidence-gateway — pipeline snapshot diff (M66, DORMANT, pure diff engine)
 *
 * A pure deterministic diff over two M65 PipelinePlan snapshots. It REUSES the M65
 * snapshot contract (no duplicated logic): it short-circuits on the fingerprint/digest,
 * and walks the already-CANONICAL snapshot trees so object-key / input order never
 * affects the result. It only reads — no store, graph, runtime, browser, engine, clock
 * or randomness.
 *
 * Returns a frozen PipelineDiff: identical flag, fingerprint match, the added / removed
 * / changed value paths, the affected stages, the change-count per stage, and an overall
 * summary. Inputs may be M65 snapshots or raw M64 PipelinePlans (the latter are snapshotted
 * via the M65 helper first). Output is deeply frozen; inputs are never mutated.
 */

import { snapshotPipelinePlan } from './snapshot.js'

/** Map a top-level snapshot key to its pipeline stage (for stage attribution). */
const TOP_STAGE = Object.freeze({
  applicationPlan: 'normalize',
  dedupe: 'deduplicate',
  confidenceUpdatePlan: 'prepareConfidenceUpdate',
  memoryLinkPlan: 'prepareMemoryLink',
  auditPlan: 'prepareAudit',
  engineExposurePlan: 'prepareEngineExposure',
  counts: 'counts',
  context: 'context',
  stages: 'stages',
  results: 'results',
  deferred: 'meta',
  version: 'meta',
})

const isObj = (v) => v !== null && typeof v === 'object'

/** Coerce an input (snapshot or raw plan) to an M65 snapshot — reuses the M65 contract. */
function toSnapshot(x) {
  if (x && typeof x === 'object' && typeof x.digest === 'string' && isObj(x.snapshot)) return x
  return snapshotPipelinePlan(x)
}

/** Attribute a diff path to a stage. `results[N]` → that stage; else the top-level key map. */
function stageOf(path, snapA, snapB) {
  const m = /^results\[(\d+)\]/.exec(path)
  if (m) {
    const i = Number(m[1])
    const r = (snapA.results && snapA.results[i]) || (snapB.results && snapB.results[i])
    return (r && typeof r.stage === 'string') ? r.stage : 'results'
  }
  const key = path.split(/[.[]/, 1)[0]
  return TOP_STAGE[key] || key || 'meta'
}

/** Recursive canonical walk collecting added / removed / changed leaves. */
function walk(a, b, path, out) {
  if (a === b) return
  const aA = Array.isArray(a), bA = Array.isArray(b)
  if (aA && bA) {
    const n = Math.max(a.length, b.length)
    for (let i = 0; i < n; i++) {
      const p = `${path}[${i}]`
      if (i >= a.length) out.added.push(Object.freeze({ path: p, value: b[i] }))
      else if (i >= b.length) out.removed.push(Object.freeze({ path: p, value: a[i] }))
      else walk(a[i], b[i], p, out)
    }
    return
  }
  if (isObj(a) && isObj(b) && !aA && !bA) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
    for (const k of keys) {
      const p = path ? `${path}.${k}` : k
      const hasA = Object.prototype.hasOwnProperty.call(a, k)
      const hasB = Object.prototype.hasOwnProperty.call(b, k)
      if (!hasA) out.added.push(Object.freeze({ path: p, value: b[k] }))
      else if (!hasB) out.removed.push(Object.freeze({ path: p, value: a[k] }))
      else walk(a[k], b[k], p, out)
    }
    return
  }
  // primitive≠primitive, or shape mismatch (object vs primitive / array vs object)
  out.changed.push(Object.freeze({ path, from: a, to: b }))
}

const byPath = (x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0)

/**
 * Diff two pipeline snapshots (or raw plans). Deterministic and canonical-order-based.
 *
 * @param {object} aInput  an M65 snapshot or an M64 PipelinePlan
 * @param {object} bInput  an M65 snapshot or an M64 PipelinePlan
 * @returns {Readonly<{
 *   identical:boolean,
 *   fingerprint: Readonly<{ a:string, b:string, match:boolean }>,
 *   added:ReadonlyArray<object>, removed:ReadonlyArray<object>, changed:ReadonlyArray<object>,
 *   affectedStages:ReadonlyArray<string>, countsPerStage:Readonly<object>,
 *   summary: Readonly<{ added:number, removed:number, changed:number, total:number, affectedStages:number }>
 * }>}
 */
export function diffPipelineSnapshots(aInput, bInput) {
  const a = toSnapshot(aInput)
  const b = toSnapshot(bInput)
  const match = a.digest === b.digest

  const fingerprint = Object.freeze({ a: a.digest, b: b.digest, match })

  if (match) {
    return Object.freeze({
      identical: true,
      fingerprint,
      added: Object.freeze([]),
      removed: Object.freeze([]),
      changed: Object.freeze([]),
      affectedStages: Object.freeze([]),
      countsPerStage: Object.freeze({}),
      summary: Object.freeze({ added: 0, removed: 0, changed: 0, total: 0, affectedStages: 0 }),
    })
  }

  const out = { added: [], removed: [], changed: [] }
  walk(a.snapshot, b.snapshot, '', out)
  out.added.sort(byPath); out.removed.sort(byPath); out.changed.sort(byPath)

  const countsPerStage = {}
  const stageSet = new Set()
  for (const e of [...out.added, ...out.removed, ...out.changed]) {
    const stage = stageOf(e.path, a.snapshot, b.snapshot)
    stageSet.add(stage)
    countsPerStage[stage] = (countsPerStage[stage] ?? 0) + 1
  }
  const affectedStages = [...stageSet].sort()
  const orderedCounts = {}
  for (const s of affectedStages) orderedCounts[s] = countsPerStage[s]

  const total = out.added.length + out.removed.length + out.changed.length
  return Object.freeze({
    identical: false,
    fingerprint,
    added: Object.freeze(out.added),
    removed: Object.freeze(out.removed),
    changed: Object.freeze(out.changed),
    affectedStages: Object.freeze(affectedStages),
    countsPerStage: Object.freeze(orderedCounts),
    summary: Object.freeze({
      added: out.added.length,
      removed: out.removed.length,
      changed: out.changed.length,
      total,
      affectedStages: affectedStages.length,
    }),
  })
}
