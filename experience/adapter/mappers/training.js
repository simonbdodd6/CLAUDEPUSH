// ─────────────────────────────────────────────────────────────────────────────
// Training Intelligence mapper (Experience Adapter, M40)
//
// Maps the façade envelope's `data` (the Brain's training session plan from
// AI.designTrainingSession) into the presentation-only `training` slice of a
// VisualModel. PURE field selection guarded against malformed input — it presents
// the plan the Brain already designed; it performs NO calculation, scheduling,
// drill selection, reasoning or recommendation.
//
// The session-plan shape (read-only reference, ai-brain/training-designer):
//   { theme, durationMin, workloadStatus,
//     objectives: [{ label, outcome }],
//     phases: { [k]: { label, durationMin, activities } } }
// ─────────────────────────────────────────────────────────────────────────────

import { isObj, num, str, arr } from '../shape-guards.js'

/**
 * @param {any} data       façade envelope.data (training session plan)
 * @param {object} fallback the placeholder training slice (defaults)
 * @returns {object}        a 'live' training slice, view-safe
 */
export function mapTraining(data, fallback) {
  const fb = isObj(fallback) ? fallback : {}
  if (!isObj(data)) return { ...fb }

  const objectives = arr(data.objectives)
    .filter(isObj)
    .map(o => ({ label: str(o.label, ''), outcome: str(o.outcome, '') }))
    .filter(o => o.label)

  // phases is an object keyed by phase; present it as an ordered list.
  const phases = (isObj(data.phases) ? Object.values(data.phases) : [])
    .filter(isObj)
    .map(p => ({ label: str(p.label, ''), durationMin: num(p.durationMin, 0, 0, 1000) }))
    .filter(p => p.label)

  return {
    state: 'live',
    theme: str(data.theme, str(fb.theme, '')),
    durationMin: num(data.durationMin, num(fb.durationMin, 0), 0, 1000),
    workloadStatus: str(data.workloadStatus, str(fb.workloadStatus, '')),
    objectives: objectives.length ? objectives : arr(fb.objectives),
    phases: phases.length ? phases : arr(fb.phases),
  }
}
