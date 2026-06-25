/**
 * @brain-decision-planner — Dry Run Decision Diff Harness (M194, DORMANT, composition-only)
 *
 * Proves the Decision Intelligence Diff engine works end-to-end from two complete M186 dry-run
 * results. It extracts the already-completed decision state from each dry run, runs the M192 diff,
 * and renders it with the M193 presenter:
 *
 *   dryRun A → decision state ─┐
 *                             ├─► diffDecisions (M192) → summarizeDecisionDiff (M193)
 *   dryRun B → decision state ─┘
 *
 * Composition ONLY. It is read-only and NEVER rebuilds squads, reruns Brain logic, selects, scores,
 * ranks, recommends, or gives advice. No providers, networking, persistence, timestamps, randomness,
 * UI, or Core changes. Inputs are never mutated; the result is deeply frozen.
 *
 * The decision state is read straight from the dry run: explanation.starters/bench (M184, whose
 * `explanationCodes` the M192 engine reads directly), captain/viceCaptain from the M130 squad, the
 * M124 risks from explanation.risks, and the M188 coverage ratio (explained starters / starters).
 */

import { diffDecisions, summarizeDecisionDiff } from '../coach-intelligence/index.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const numOr0 = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)
const playerIdOf = (v) => (typeof v === 'string' && v.trim() ? v : (isObj(v) && typeof v.playerId === 'string' ? v.playerId : null))

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Read an already-completed decision state out of an M186 dry-run result (no recompute). */
function decisionStateFromDryRun(dryRun, label) {
  if (!isObj(dryRun)) throw new TypeError(`diffBrainDryRuns: ${label} must be a dry-run result object`)
  if (!isObj(dryRun.explanation)) throw new TypeError(`diffBrainDryRuns: ${label}.explanation is missing`)
  if (!isObj(dryRun.capstone) || !isObj(dryRun.capstone.squad)) throw new TypeError(`diffBrainDryRuns: ${label}.capstone.squad is missing`)
  if (!isObj(dryRun.verification)) throw new TypeError(`diffBrainDryRuns: ${label}.verification is missing`)

  const expl = dryRun.explanation
  const squad = dryRun.capstone.squad
  const starters = Array.isArray(expl.starters) ? expl.starters : []
  const bench = Array.isArray(expl.bench) ? expl.bench : []
  const risks = Array.isArray(expl.risks) ? expl.risks : []

  // M188 coverage ratio: explained starters / starters (null when there are no starters)
  const startingCount = numOr0(dryRun.verification.startingCount)
  const coverage = startingCount === 0 ? null : Math.round((starters.length / startingCount) * 100) / 100

  return { starters, bench, captain: squad.captain, viceCaptain: squad.viceCaptain, risks, coverage }
}

/** Compact recap of a decision state, for the before/after summary. */
function stateSummary(state) {
  return {
    starterCount: state.starters.length,
    benchCount: state.bench.length,
    captain: playerIdOf(state.captain),
    viceCaptain: playerIdOf(state.viceCaptain),
    riskCount: state.risks.length,
    coverage: state.coverage,
  }
}

/**
 * Diff two complete M186 dry-run results via the Decision Intelligence engine.
 *
 * @param {object} beforeDryRun  an M186 runBrainDryRun result
 * @param {object} afterDryRun   an M186 runBrainDryRun result
 * @returns {Readonly<{ beforeSummary: object, afterSummary: object, diff: object, diffView: object }>}
 */
export function diffBrainDryRuns(beforeDryRun, afterDryRun) {
  const before = decisionStateFromDryRun(beforeDryRun, 'beforeDryRun')
  const after = decisionStateFromDryRun(afterDryRun, 'afterDryRun')

  const diff = diffDecisions(before, after)          // M192
  const diffView = summarizeDecisionDiff(diff)        // M193 (object form)

  return deepFreeze({
    beforeSummary: stateSummary(before),
    afterSummary: stateSummary(after),
    diff,
    diffView,
  })
}
