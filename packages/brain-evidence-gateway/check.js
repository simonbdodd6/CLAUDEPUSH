/**
 * @brain/evidence-gateway — pipeline expectation / regression-gate contract (M67, DORMANT)
 *
 * A pure deterministic gate over a freshly-snapshotted pipeline run versus a stored
 * EXPECTED snapshot. It REUSES the M65 snapshot contract (to coerce inputs) and the
 * M66 diff engine (to compute the structured deviation) — no duplicated logic. It only
 * READS its inputs: no store, graph, runtime, browser, engine, no clock, no randomness.
 *
 * The verdict PASSES when the fingerprints match (or when every deviation is covered by
 * the optional allowlist), and FAILS otherwise — carrying the full M66 diff, the diff
 * entries split into tolerated vs. violating, the stages affected by violations, and an
 * overall summary. An allowlist may tolerate whole stages and/or value-path SUBTREES, so
 * permitted differences don't fail the gate. Output is deeply frozen; inputs are never
 * mutated.
 *
 * Diff direction is expected → actual: `added` = present in the fresh run but not the
 * baseline, `removed` = in the baseline but missing from the run, `changed` = from the
 * baseline value to the run value.
 */

import { diffPipelineSnapshots, toSnapshot, stageOf } from './diff.js'

const asStringArray = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])

/**
 * Normalise the optional allowlist to a canonical `{ paths, stages }` shape.
 * Accepts: nullish (→ empty), an array of strings (treated as path-subtrees), or an
 * object `{ paths?: string[], stages?: string[] }`. Non-string entries are ignored.
 */
function normalizeAllowlist(allowlist) {
  if (!allowlist) return { paths: [], stages: [] }
  if (Array.isArray(allowlist)) return { paths: asStringArray(allowlist), stages: [] }
  if (typeof allowlist === 'object') {
    return { paths: asStringArray(allowlist.paths), stages: asStringArray(allowlist.stages) }
  }
  return { paths: [], stages: [] }
}

/** True if a diff entry (its value path + attributed stage) is covered by the allowlist. */
function isTolerated(path, stage, paths, stages) {
  if (stages.includes(stage)) return true
  return paths.some((a) => path === a || path.startsWith(a + '.') || path.startsWith(a + '['))
}

/**
 * Check a fresh pipeline run against a stored EXPECTED snapshot — a dormant regression gate.
 *
 * @param {object} planOrSnapshot    an M64 PipelinePlan or an M65 snapshot of the fresh run
 * @param {object} expectedSnapshot  the stored baseline — an M65 snapshot or an M64 plan
 * @param {{ allowlist?: (string[] | { paths?: string[], stages?: string[] }) }} [options]
 * @returns {Readonly<{
 *   pass:boolean,
 *   fingerprint: Readonly<{ actual:string, expected:string, match:boolean }>,
 *   diff: object,
 *   violations: Readonly<{ added:ReadonlyArray<object>, removed:ReadonlyArray<object>, changed:ReadonlyArray<object> }>,
 *   tolerated: Readonly<{ added:ReadonlyArray<object>, removed:ReadonlyArray<object>, changed:ReadonlyArray<object> }>,
 *   affectedStages:ReadonlyArray<string>,
 *   allowlist: Readonly<{ paths:ReadonlyArray<string>, stages:ReadonlyArray<string> }>,
 *   summary: Readonly<{ added:number, removed:number, changed:number, total:number, tolerated:number, affectedStages:number }>
 * }>}
 */
export function checkPipelineAgainstExpected(planOrSnapshot, expectedSnapshot, options = {}) {
  const actual = toSnapshot(planOrSnapshot)
  const expected = toSnapshot(expectedSnapshot)
  const diff = diffPipelineSnapshots(expected, actual)   // expected → actual
  const { paths, stages } = normalizeAllowlist(options && options.allowlist)

  const violations = { added: [], removed: [], changed: [] }
  const tolerated = { added: [], removed: [], changed: [] }
  const violationStages = new Set()

  for (const kind of ['added', 'removed', 'changed']) {
    for (const entry of diff[kind]) {
      const stage = stageOf(entry.path, expected.snapshot, actual.snapshot)
      if (isTolerated(entry.path, stage, paths, stages)) {
        tolerated[kind].push(entry)
      } else {
        violations[kind].push(entry)
        violationStages.add(stage)
      }
    }
  }

  const total = violations.added.length + violations.removed.length + violations.changed.length
  const toleratedCount = tolerated.added.length + tolerated.removed.length + tolerated.changed.length
  const affectedStages = [...violationStages].sort()

  const freezeBucket = (b) => Object.freeze({
    added: Object.freeze(b.added),
    removed: Object.freeze(b.removed),
    changed: Object.freeze(b.changed),
  })

  return Object.freeze({
    pass: total === 0,
    fingerprint: Object.freeze({ actual: actual.digest, expected: expected.digest, match: diff.fingerprint.match }),
    diff,
    violations: freezeBucket(violations),
    tolerated: freezeBucket(tolerated),
    affectedStages: Object.freeze(affectedStages),
    allowlist: Object.freeze({ paths: Object.freeze([...paths]), stages: Object.freeze([...stages]) }),
    summary: Object.freeze({
      added: violations.added.length,
      removed: violations.removed.length,
      changed: violations.changed.length,
      total,
      tolerated: toleratedCount,
      affectedStages: affectedStages.length,
    }),
  })
}
