/**
 * @brain/evidence-gateway — suite report / human-readable gate summary (M69, DORMANT)
 *
 * A pure deterministic formatter that turns an M68 aggregate suite verdict (or a single
 * M67 verdict) into a frozen, human-readable report: a one-line headline, a per-failing-
 * case breakdown (affected stages + a bounded sample of violation paths, with an explicit
 * "…and N more" truncation note), and a tolerated-vs-violation roll-up — plus the same
 * information as structured fields and a ready-to-print plain-text string.
 *
 * It REUSES the M67/M68 verdict shapes only (no new checking or diff logic) and does pure
 * string/report assembly: it only READS the verdict it is given — no store, engine,
 * persistence, API, UI, network, no clock, no randomness. Output is deeply frozen; the
 * input verdict is never mutated.
 */

const DEFAULT_MAX_ENTRIES_PER_CASE = 10

const isObj = (v) => v !== null && typeof v === 'object'

/** Deep-freeze a plain JSON value (objects/arrays). */
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Recognise an M67 single-case verdict (has fingerprint + diff + violations buckets). */
function isSingleVerdict(v) {
  return isObj(v) && isObj(v.fingerprint) && isObj(v.violations) && isObj(v.summary) &&
    !Array.isArray(v.cases)
}

/** Recognise an M68 suite verdict (has a `cases` array + total/passed/failed). */
function isSuiteVerdict(v) {
  return isObj(v) && Array.isArray(v.cases) && isObj(v.summary) &&
    typeof v.total === 'number' && typeof v.passed === 'number' && typeof v.failed === 'number'
}

/** Normalise either verdict to a common suite shape so one code path handles both. */
export function toSuiteShape(verdict) {
  if (isSuiteVerdict(verdict)) return verdict
  if (isSingleVerdict(verdict)) {
    return {
      pass: verdict.pass,
      total: 1,
      passed: verdict.pass ? 1 : 0,
      failed: verdict.pass ? 0 : 1,
      firstFailingCase: verdict.pass ? null : '(single)',
      cases: [{ name: '(single)', pass: verdict.pass, verdict }],
      affectedStages: verdict.affectedStages,
      summary: {
        violations: verdict.summary.total,
        tolerated: verdict.summary.tolerated,
        affectedStages: verdict.summary.affectedStages,
      },
    }
  }
  throw new TypeError('formatPipelineSuiteReport requires an M68 suite verdict or an M67 single verdict')
}

/** Gather a case's violation entries (already path-sorted per kind) in a stable order. */
function violationEntries(caseVerdict) {
  const out = []
  for (const kind of ['added', 'removed', 'changed']) {
    for (const e of caseVerdict.violations[kind]) out.push({ kind, path: e.path })
  }
  return out
}

/**
 * Format a gate verdict into a deterministic, frozen human-readable report.
 *
 * @param {object} verdict  an M68 suite verdict or an M67 single verdict
 * @param {{ maxEntriesPerCase?: number }} [options]
 *   maxEntriesPerCase — cap on sampled violation paths per failing case (default 10).
 * @returns {Readonly<{
 *   pass:boolean,
 *   headline:string,
 *   text:string,
 *   cases: ReadonlyArray<Readonly<{
 *     name:string, affectedStages:ReadonlyArray<string>,
 *     violations: Readonly<{ added:number, removed:number, changed:number, total:number }>,
 *     sample: ReadonlyArray<Readonly<{ kind:string, path:string }>>,
 *     truncated:number
 *   }>>,
 *   summary: Readonly<{ totalCases:number, passed:number, failed:number,
 *     violations:number, tolerated:number, affectedStages:ReadonlyArray<string> }>
 * }>}
 */
export function formatPipelineSuiteReport(verdict, options = {}) {
  const suite = toSuiteShape(verdict)

  const rawMax = options && options.maxEntriesPerCase
  const max = (typeof rawMax === 'number' && Number.isFinite(rawMax) && rawMax >= 0)
    ? Math.floor(rawMax)
    : DEFAULT_MAX_ENTRIES_PER_CASE

  const headline = suite.pass
    ? `PASS — ${suite.passed}/${suite.total} cases passed`
    : `FAIL — ${suite.failed}/${suite.total} cases failed (first failing: ${suite.firstFailingCase})`

  // per-failing-case sections (input order preserved)
  const caseReports = []
  for (const c of suite.cases) {
    if (c.pass) continue
    const v = c.verdict
    const entries = violationEntries(v)
    const sample = entries.slice(0, max).map((e) => ({ kind: e.kind, path: e.path }))
    const truncated = entries.length - sample.length
    caseReports.push({
      name: c.name,
      affectedStages: [...v.affectedStages],
      violations: {
        added: v.summary.added,
        removed: v.summary.removed,
        changed: v.summary.changed,
        total: v.summary.total,
      },
      sample,
      truncated,
    })
  }

  // plain-text assembly
  const stagesLine = suite.affectedStages.length ? suite.affectedStages.join(', ') : 'none'
  const lines = [
    headline,
    '',
    `Cases: total=${suite.total} passed=${suite.passed} failed=${suite.failed}`,
    `Violations: ${suite.summary.violations}  Tolerated: ${suite.summary.tolerated}  Affected stages: ${stagesLine}`,
  ]
  if (caseReports.length) {
    lines.push('', 'Failing cases:')
    for (const cr of caseReports) {
      const cs = cr.affectedStages.length ? cr.affectedStages.join(', ') : 'none'
      lines.push(`  - ${cr.name}: stages=[${cs}] violations=${cr.violations.total} ` +
        `(added=${cr.violations.added} removed=${cr.violations.removed} changed=${cr.violations.changed})`)
      for (const s of cr.sample) lines.push(`      ${s.kind.padEnd(7)} ${s.path}`)
      if (cr.truncated > 0) lines.push(`      …and ${cr.truncated} more`)
    }
  }
  const text = lines.join('\n')

  return deepFreeze({
    pass: suite.pass,
    headline,
    text,
    cases: caseReports,
    summary: {
      totalCases: suite.total,
      passed: suite.passed,
      failed: suite.failed,
      violations: suite.summary.violations,
      tolerated: suite.summary.tolerated,
      affectedStages: [...suite.affectedStages],
    },
  })
}
