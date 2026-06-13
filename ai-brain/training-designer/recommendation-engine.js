/**
 * AI Brain — Training Recommendation Engine (M25)
 *
 * The top-level orchestrator. Resolves constraints, builds objectives, assembles
 * and validates a session, and — if validation fails — falls back to a safe
 * template. Applies manual overrides last (the coach always wins).
 *
 * Pure + deterministic. The complete pipeline:
 *   constraints → objectives → phases (+ drills/workload/welfare/progression)
 *   → review/messages → validate → (fallback) → overrides → session plan
 */

import {
  DESIGNER_VERSION, PHASE, PHASE_ORDER, PHASE_META, round2,
} from './training-types.js'
import { resolveConstraints } from './constraint-engine.js'
import { buildObjectives } from './objective-builder.js'
import { buildPhases } from './session-builder.js'
import { buildReview, buildCoachMessages } from './review-engine.js'
import { validateSession } from './session-validator.js'
import { buildWelfareNotes } from './welfare-engine.js'
import { allocateTime } from './session-builder.js'
import { selectPhaseDrills } from './drill-selector.js'

function sessionConfidence(activities, context) {
  if (!activities.length) return 0
  const mean = activities.reduce((s, a) => s + a.confidence, 0) / activities.length
  // Down-weight when key inputs are missing (graceful degradation is honest about it).
  let availability = 0.6
  if (context.opponent?.opportunities?.length || context.opponent?.threats?.length) availability += 0.2
  if (context.matchReadiness?.trainingFocus?.length) availability += 0.1
  if (context.coachDNA?.characteristics) availability += 0.1
  return round2(mean * Math.min(1, availability))
}

function unionEvidence(objectives) {
  const out = []
  for (const o of objectives) for (const e of o.evidence) if (e && !out.includes(e)) out.push(e)
  return out
}

/** A guaranteed-valid generic session, used when validation fails. */
function fallbackSession(constraints) {
  const objectives = [{ id: 'handling-skills', label: 'Core handling', tags: ['handling'], priority: 1, sources: ['fallback'], evidence: [], outcome: 'Maintain core skills' }]
  const minutes = allocateTime(constraints, { skipPhases: constraints.contactLevel === 'none' ? [PHASE.CONTACT, PHASE.SET_PIECE] : [] })
  const phases = {}
  for (const k of PHASE_ORDER) {
    if (k === PHASE.REVIEW) continue
    phases[k] = { label: PHASE_META[k].label, durationMin: 0, activities: selectPhaseDrills(k, minutes[k], objectives, constraints) }
    phases[k].durationMin = phases[k].activities.reduce((s, a) => s + a.estimatedDuration, 0)
  }
  const reviewMin = Math.max(3, minutes[PHASE.REVIEW])
  phases[PHASE.REVIEW] = buildReview(objectives, constraints, 'Skills & conditioning', reviewMin)
  return { phases, objectives, theme: 'Skills & conditioning', keyOutcomes: ['Maintain core skills'] }
}

/**
 * Design a complete training session from a designer context.
 *
 * @param {object} context  upstream products + constraints + overrides
 *   { coachDNA, weeklyBrief, matchReadiness, opponent, squad, welfare,
 *     trainingLoad, learning, format, grade, durationMin, players, space,
 *     weather, matchImportance, seasonPhase, overrides, generatedAt }
 * @returns {SessionPlan}
 */
export function designSession(context = {}) {
  const constraints = resolveConstraints(context)
  const overrides = context.overrides ?? {}

  const { objectives, theme, keyOutcomes } = buildObjectives(context, constraints)
  let built = buildPhases(objectives, constraints, overrides)

  // Review block uses leftover review minutes.
  const reviewMin = Math.max(3, allocateTime(constraints, overrides)[PHASE.REVIEW])
  const review = buildReview(objectives, constraints, theme, reviewMin)
  let phases = { ...built.phases, [PHASE.REVIEW]: review }

  let usedObjectives = objectives
  let usedTheme = theme
  let usedKeyOutcomes = keyOutcomes
  let validation = validateSession({ phases }, constraints)
  let isFallback = false

  if (!validation.ok) {
    const fb = fallbackSession(constraints)
    phases = fb.phases
    usedObjectives = fb.objectives
    usedTheme = overrides.theme ?? fb.theme
    usedKeyOutcomes = fb.keyOutcomes
    validation = validateSession({ phases }, constraints)
    isFallback = true
  }

  const activities = Object.values(phases).flatMap(p => p.activities)
  const coachMessages = buildCoachMessages(usedObjectives, constraints, usedTheme, context)
  const welfareNotes = buildWelfareNotes(constraints)

  const explanation = `${usedTheme} — ${usedObjectives.length} objective(s) for a ${constraints.durationMin}m ${constraints.format} ${constraints.grade} session` +
    (isFallback ? ' (fallback template applied)' : '') +
    `. Optimised for ${constraints.players} players, ${constraints.space} space, ${constraints.weather} weather, ${constraints.matchImportance} match, ${constraints.seasonPhase} season.`

  return {
    designerVersion: DESIGNER_VERSION,
    generatedAt: context.generatedAt ?? null,
    ok: true,
    isFallback,

    format: constraints.format,
    grade: constraints.grade,
    durationMin: constraints.durationMin,
    players: constraints.players,

    theme: usedTheme,
    objectives: usedObjectives.map(o => ({ id: o.id, label: o.label, priority: o.priority, sources: o.sources, evidence: o.evidence, outcome: o.outcome })),
    keyOutcomes: usedKeyOutcomes,

    phases,

    coachMessages,
    welfareNotes,
    totalWorkload: validation.totalWorkload,
    workloadCap: validation.workloadCap,
    workloadStatus: validation.workloadStatus,

    constraintsApplied: {
      contactLevel: constraints.contactLevel,
      intensityCap: constraints.intensityCap,
      complexityCap: constraints.complexityCap,
      matchImportance: constraints.matchImportance,
      seasonPhase: constraints.seasonPhase,
      space: constraints.space,
      weather: constraints.weather,
      injured: constraints.injuredIds.length,
      highLoad: constraints.highLoadIds.length,
    },

    confidence: sessionConfidence(activities, context),
    evidence: unionEvidence(usedObjectives),
    explanation,
    validation: { ok: validation.ok, issues: validation.issues },
  }
}
