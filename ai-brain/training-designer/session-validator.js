/**
 * AI Brain — Training Session Validator (M25)
 *
 * Validates an assembled session against the constraints. If invalid, the
 * recommendation engine falls back to a safe template. Pure + deterministic.
 *
 * Checks:
 *   - total minutes within tolerance of the requested duration
 *   - workload not over the cap
 *   - no full-contact activity for a non-contact grade (safety)
 *   - decision complexity never exceeds the grade cap (safety)
 *   - non-review phases that should have drills actually do
 */

import { PHASE, CONTACT_RANK, DRILL_BY_ID } from './training-types.js'
import { workloadCap, classifyWorkload } from './workload-engine.js'

export function validateSession(session, constraints) {
  const issues = []
  const activities = Object.values(session.phases).flatMap(p => p.activities)

  const totalMin = activities.reduce((s, a) => s + a.estimatedDuration, 0)
  if (Math.abs(totalMin - constraints.durationMin) > 6) {
    issues.push({ code: 'duration_mismatch', detail: `Session is ${totalMin}m vs requested ${constraints.durationMin}m` })
  }

  const totalWorkload = activities.reduce((s, a) => s + a.workload, 0)
  const cap = workloadCap(constraints)
  if (classifyWorkload(totalWorkload, cap) === 'over') {
    issues.push({ code: 'workload_over_cap', detail: `Workload ${totalWorkload} exceeds cap ${cap}` })
  }

  for (const a of activities) {
    const drill = DRILL_BY_ID[a.id]
    if (drill && CONTACT_RANK[drill.contact] > CONTACT_RANK[constraints.contactLevel]) {
      issues.push({ code: 'unsafe_contact', detail: `${a.name} exceeds contact level for ${constraints.grade}` })
    }
    if (a.decisionComplexity > constraints.complexityCap) {
      issues.push({ code: 'complexity_over_cap', detail: `${a.name} complexity ${a.decisionComplexity} > cap ${constraints.complexityCap}` })
    }
  }

  // Warm-up and at least one skill block must always be present.
  if (!session.phases[PHASE.WARM_UP]?.activities.length) issues.push({ code: 'missing_warmup', detail: 'No warm-up activities' })
  if (!session.phases[PHASE.SKILL]?.activities.length) issues.push({ code: 'missing_skill', detail: 'No skill block activities' })

  return { ok: issues.length === 0, issues, totalMin, totalWorkload, workloadCap: cap, workloadStatus: classifyWorkload(totalWorkload, cap) }
}
