/**
 * @brain/evidence-gateway — expectation-set registry / named baseline store-plan (M70, DORMANT)
 *
 * Pure data-only helpers that assemble a NAMED catalogue of expectation baselines and
 * resolve it against freshly-supplied runs into the M68 `cases` array — closing the loop
 * baseline-catalogue → suite gate (M68) → human-readable report (M69). These functions
 * only ASSEMBLE and VALIDATE data: they never run a check, diff, or report (no duplicated
 * gate logic), and touch no store, engine, persistence, API, UI, network, clock or
 * randomness. Inputs are never mutated; outputs are frozen.
 *
 * An expectation entry is `{ name, expectedSnapshot, allowlist?, planOrSnapshot? }`:
 *   - name            — non-empty, unique within the set
 *   - expectedSnapshot — an M65 snapshot or M64 plan baseline (held by reference)
 *   - allowlist?      — per-case allowlist, preserved verbatim for M67/M68
 *   - planOrSnapshot? — an optional default run, used when no fresh run is supplied
 */

const isObj = (v) => v !== null && typeof v === 'object'

/**
 * Assemble a frozen, name-keyed expectation-set registry from entries. Validates shape
 * and uniqueness; runs no checks.
 *
 * @param {Array<{ name:string, expectedSnapshot:object,
 *                 allowlist?:(string[]|{paths?:string[],stages?:string[]}), planOrSnapshot?:object }>} entries
 * @returns {Readonly<{
 *   size:number,
 *   names: ReadonlyArray<string>,
 *   entries: ReadonlyArray<Readonly<object>>,
 *   byName: Readonly<Record<string, Readonly<object>>>
 * }>}
 */
export function createExpectationSet(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError('createExpectationSet requires an array of entries')
  }
  const names = []
  const wrappers = []
  const byName = {}

  for (const e of entries) {
    if (!isObj(e)) {
      throw new TypeError('createExpectationSet: each entry must be an object { name, expectedSnapshot }')
    }
    if (typeof e.name !== 'string' || e.name.length === 0) {
      throw new TypeError('createExpectationSet: each entry requires a non-empty string name')
    }
    if (Object.prototype.hasOwnProperty.call(byName, e.name)) {
      throw new TypeError(`createExpectationSet: duplicate entry name "${e.name}"`)
    }
    if (!isObj(e.expectedSnapshot)) {
      throw new TypeError(`createExpectationSet: entry "${e.name}" requires an expectedSnapshot`)
    }

    const wrapper = { name: e.name, expectedSnapshot: e.expectedSnapshot }
    if (e.planOrSnapshot !== undefined) wrapper.planOrSnapshot = e.planOrSnapshot
    if (e.allowlist !== undefined) wrapper.allowlist = e.allowlist
    Object.freeze(wrapper)

    names.push(e.name)
    wrappers.push(wrapper)
    byName[e.name] = wrapper
  }

  return Object.freeze({
    size: wrappers.length,
    names: Object.freeze(names),
    entries: Object.freeze(wrappers),
    byName: Object.freeze(byName),
  })
}

/** True for an object produced by `createExpectationSet`. */
function isExpectationSet(s) {
  return isObj(s) && Array.isArray(s.names) && Array.isArray(s.entries) && isObj(s.byName)
}

/** Extract the run plan/snapshot from a run value: `{ planOrSnapshot }` wrapper or the plan itself. */
function extractRunPlan(runValue) {
  if (isObj(runValue) && Object.prototype.hasOwnProperty.call(runValue, 'planOrSnapshot')) {
    return runValue.planOrSnapshot
  }
  return runValue
}

/** Normalise `runs` (object keyed by name OR array of { name, planOrSnapshot }) to a Map. */
function buildRunMap(runs) {
  const map = new Map()
  if (Array.isArray(runs)) {
    for (const r of runs) {
      if (!isObj(r) || typeof r.name !== 'string' || r.name.length === 0) {
        throw new TypeError('resolveExpectationSet: each run must be an object { name, planOrSnapshot }')
      }
      if (map.has(r.name)) {
        throw new TypeError(`resolveExpectationSet: duplicate run name "${r.name}"`)
      }
      map.set(r.name, extractRunPlan(r))
    }
  } else if (isObj(runs)) {
    for (const name of Object.keys(runs)) map.set(name, extractRunPlan(runs[name]))
  } else {
    throw new TypeError('resolveExpectationSet requires runs as an object keyed by name or an array of named runs')
  }
  return map
}

/**
 * Resolve an expectation set against fresh runs into an M68-compatible `cases` array.
 * Preserves the expectation set's ordering; validates missing and unknown runs.
 *
 * @param {object} expectationSet  the output of `createExpectationSet`
 * @param {(Record<string, object> | Array<{ name:string, planOrSnapshot:object }>)} [runs]
 * @returns {ReadonlyArray<Readonly<{ name:string, planOrSnapshot:object, expectedSnapshot:object,
 *   allowlist?:(string[]|{paths?:string[],stages?:string[]}) }>>}
 */
export function resolveExpectationSet(expectationSet, runs = {}) {
  if (!isExpectationSet(expectationSet)) {
    throw new TypeError('resolveExpectationSet requires an expectation set from createExpectationSet')
  }
  const runMap = buildRunMap(runs)

  // unknown runs — a supplied run whose name is not in the set
  for (const name of runMap.keys()) {
    if (!Object.prototype.hasOwnProperty.call(expectationSet.byName, name)) {
      throw new TypeError(`resolveExpectationSet: unknown run "${name}" (not in expectation set)`)
    }
  }

  const cases = []
  for (const entry of expectationSet.entries) {
    const hasRun = runMap.has(entry.name)
    const planOrSnapshot = hasRun ? runMap.get(entry.name) : entry.planOrSnapshot
    if (planOrSnapshot === undefined) {
      throw new TypeError(`resolveExpectationSet: missing run for "${entry.name}"`)
    }
    const c = { name: entry.name, planOrSnapshot, expectedSnapshot: entry.expectedSnapshot }
    if (entry.allowlist !== undefined) c.allowlist = entry.allowlist
    cases.push(Object.freeze(c))
  }

  return Object.freeze(cases)
}
