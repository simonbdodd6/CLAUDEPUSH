/**
 * @brain/evidence-gateway — machine-readable gate outcome / emitGateOutcome (M72, DORMANT)
 *
 * A pure CI/automation-facing emitter that converts an M71 envelope, an M68 suite verdict,
 * or an M67 single verdict into one deterministic, frozen machine-readable outcome: a
 * pass/fail status, a stable single-line status string, case counts, the first failing
 * case, total violation/tolerated counts, the affected-stage union, and a compact
 * annotation list ({ caseName, stage, path }) capped by `maxAnnotations` with an explicit
 * overflow count.
 *
 * It REUSES existing fields only — the M69 `toSuiteShape` normaliser and the diff-layer
 * `stageOf` path→stage attribution (no new check / diff / format logic) — and only READS
 * its input: no store, engine, persistence, API, UI, network, no clock, no randomness.
 * Inputs are never mutated; the outcome is deeply frozen.
 */

import { toSuiteShape } from './check-report.js'
import { stageOf } from './diff.js'

const DEFAULT_MAX_ANNOTATIONS = 50
const EMPTY = Object.freeze({})   // stageOf falls back to its top-level key map / 'results'

const isObj = (v) => v !== null && typeof v === 'object'

/** Coerce an M71 envelope / M68 suite verdict / M67 single verdict to the common suite shape. */
function resolveSuiteVerdict(input) {
  if (!isObj(input)) {
    throw new TypeError('emitGateOutcome requires an M71 envelope, an M68 suite verdict, or an M67 single verdict')
  }
  // M71 envelope { cases, verdict, report } → use its suite verdict
  if (isObj(input.verdict) && isObj(input.report) && Array.isArray(input.cases)) {
    return toSuiteShape(input.verdict)
  }
  return toSuiteShape(input)   // M68 suite or M67 single (throws if neither)
}

/**
 * Emit a deterministic machine-readable gate outcome.
 *
 * @param {object} envelopeOrVerdict  an M71 envelope, M68 suite verdict, or M67 single verdict
 * @param {{ maxAnnotations?: number }} [options]
 *   maxAnnotations — cap on emitted annotations (default 50; 0 allowed → none, all overflow).
 * @returns {Readonly<{
 *   status:('pass'|'fail'),
 *   statusLine:string,
 *   cases: Readonly<{ total:number, passed:number, failed:number }>,
 *   firstFailingCase: string|null,
 *   violations:number, tolerated:number,
 *   affectedStages: ReadonlyArray<string>,
 *   annotations: ReadonlyArray<Readonly<{ caseName:string, stage:string, path:string }>>,
 *   overflow:number
 * }>}
 */
export function emitGateOutcome(envelopeOrVerdict, options = {}) {
  const suite = resolveSuiteVerdict(envelopeOrVerdict)

  const rawMax = options && options.maxAnnotations
  const max = (typeof rawMax === 'number' && Number.isFinite(rawMax) && rawMax >= 0)
    ? Math.floor(rawMax)
    : DEFAULT_MAX_ANNOTATIONS

  const status = suite.pass ? 'pass' : 'fail'
  const violations = suite.summary.violations
  const tolerated = suite.summary.tolerated

  // compact annotations — case order, then added → removed → changed (each already path-sorted)
  const annotations = []
  for (const c of suite.cases) {
    if (c.pass) continue
    for (const kind of ['added', 'removed', 'changed']) {
      for (const e of c.verdict.violations[kind]) {
        if (annotations.length < max) {
          annotations.push(Object.freeze({ caseName: c.name, stage: stageOf(e.path, EMPTY, EMPTY), path: e.path }))
        }
      }
    }
  }
  const overflow = violations - annotations.length

  const parts = [`gate=${status}`, `cases=${suite.passed}/${suite.total}`]
  if (suite.firstFailingCase !== null && suite.firstFailingCase !== undefined) {
    parts.push(`first=${suite.firstFailingCase}`)
  }
  parts.push(`violations=${violations}`, `tolerated=${tolerated}`)
  const statusLine = parts.join(' ')

  return Object.freeze({
    status,
    statusLine,
    cases: Object.freeze({ total: suite.total, passed: suite.passed, failed: suite.failed }),
    firstFailingCase: suite.firstFailingCase ?? null,
    violations,
    tolerated,
    affectedStages: Object.freeze([...suite.affectedStages]),
    annotations: Object.freeze(annotations),
    overflow,
  })
}
