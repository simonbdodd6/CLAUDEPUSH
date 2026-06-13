/**
 * AI Brain — Training Drill Selector (M25)
 *
 * Deterministically selects drills for a phase by scoring each eligible drill
 * against the session objectives (tag overlap × objective priority), then
 * tie-breaking by id. No randomness. Each selected drill is turned into a fully
 * annotated activity, including WHY it was chosen and the supporting evidence.
 */

import {
  DRILL_LIBRARY, DRILL_BY_ID, PHASE_META, CONTACT_RANK, SPACE_RANK, GRADE_ORDER, clamp, round,
} from './training-types.js'
import { activityWorkload } from './workload-engine.js'
import { activityWelfareImpact } from './welfare-engine.js'
import { progressDrill } from './progression-engine.js'

function gradeIndexOf(grade) { const i = GRADE_ORDER.indexOf(grade); return i < 0 ? 0 : i }

/** Is a drill eligible under the constraints? */
export function isEligible(drill, constraints) {
  if (CONTACT_RANK[drill.contact] > CONTACT_RANK[constraints.contactLevel]) return false
  if (gradeIndexOf(drill.minGrade) > constraints.gradeIndex) return false
  if (SPACE_RANK[drill.space] > SPACE_RANK[constraints.space]) return false
  if (drill.weatherSensitive && constraints.badWeather) return false
  if (drill.minPlayers > constraints.players) return false
  if (drill.decisionComplexity > constraints.complexityCap + 1) return false
  return true
}

/** Objectives whose target tags overlap this drill, with the overlap weight. */
function matchObjectives(drill, objectives) {
  const matched = []
  for (const obj of objectives) {
    const overlap = obj.tags.filter(t => drill.tags.includes(t)).length
    if (overlap > 0) matched.push({ objective: obj, overlap })
  }
  return matched
}

function scoreDrill(drill, objectives) {
  let score = 0.1 // small base so phases always fill
  for (const { objective, overlap } of matchObjectives(drill, objectives)) {
    score += overlap * objective.priority
  }
  return score
}

function buildWhy(drill, matched) {
  if (!matched.length) return `Develops ${drill.tags.join('/')} as part of a balanced session`
  const top = matched.slice().sort((a, b) => b.objective.priority - a.objective.priority)[0].objective
  const src = top.sources.includes('opponent-opportunity') ? 'to exploit a scouted opponent weakness'
    : top.sources.includes('opponent-threat') ? 'to nullify a scouted opponent strength'
      : top.sources.includes('match-readiness') ? 'to address a match-readiness need'
        : top.sources.includes('weekly-brief') ? 'because the coach prioritised it this week'
          : 'to maintain core skills'
  return `Selected ${src}: ${top.label}`
}

function unionEvidence(matched) {
  const out = []
  for (const { objective } of matched) for (const e of objective.evidence) if (e && !out.includes(e)) out.push(e)
  return out
}

/** Convert a drill into a fully-annotated activity. */
export function toActivity(drill, phaseKey, durationMin, constraints, objectives) {
  const matched = matchObjectives(drill, objectives)
  const prog = progressDrill(drill, constraints)
  const intensity = clamp(drill.intensity, 1, constraints.intensityCap)
  const constraintNotes = [
    `${constraints.players} players`,
    `${drill.space} space`,
    ...prog.variantNotes,
  ]
  return {
    id: drill.id,
    name: drill.name,
    phase: phaseKey,
    purpose: drill.purpose,
    estimatedDuration: durationMin,
    coachingFocus: drill.coachingFocus,
    equipment: drill.equipment,
    constraints: constraintNotes,
    workload: activityWorkload(intensity, durationMin),
    intensity,
    welfareImpact: activityWelfareImpact(drill, constraints),
    learningObjective: drill.learningObjective,
    decisionComplexity: prog.decisionComplexity,
    confidence: round((0.5 + Math.min(0.4, matched.reduce((s, m) => s + m.overlap * 0.05, 0))) * 100) / 100,
    why: buildWhy(drill, matched),
    evidence: unionEvidence(matched),
  }
}

/**
 * Select activities for a phase, filling `phaseMinutes` deterministically.
 * @returns {object[]} activities
 */
export function selectPhaseDrills(phaseKey, phaseMinutes, objectives, constraints, opts = {}) {
  if (phaseMinutes <= 0) return []
  const meta = PHASE_META[phaseKey]
  const exclude = new Set(opts.exclude ?? [])
  const pinned = (opts.pin ?? []).map(id => DRILL_BY_ID[id]).filter(Boolean)
    .filter(d => meta.categories.includes(d.category) && isEligible(d, constraints) && !exclude.has(d.id))

  const candidates = DRILL_LIBRARY
    .filter(d => meta.categories.includes(d.category))
    .filter(d => isEligible(d, constraints))
    .filter(d => !exclude.has(d.id))
    .map(d => ({ d, score: scoreDrill(d, objectives) }))
    .sort((a, b) => (b.score - a.score) || (a.d.id < b.d.id ? -1 : 1))
    .map(x => x.d)

  // Pinned drills first, then top-scored, deduped.
  const ordered = []
  const seen = new Set()
  for (const d of [...pinned, ...candidates]) {
    if (seen.has(d.id)) continue
    seen.add(d.id); ordered.push(d)
  }
  if (!ordered.length) return []

  // How many drills: scale with phase minutes, within the phase's min/max.
  const count = clamp(Math.round(phaseMinutes / 12), meta.minDrills, Math.min(meta.maxDrills, ordered.length))
  const chosen = ordered.slice(0, Math.max(1, count))

  // Distribute phaseMinutes across chosen drills (remainder to the first).
  const per = Math.floor(phaseMinutes / chosen.length)
  let remainder = phaseMinutes - per * chosen.length
  return chosen.map((d, i) => {
    const dur = per + (i === 0 ? remainder : 0)
    return toActivity(d, phaseKey, dur, constraints, objectives)
  })
}
