/**
 * AI Brain — Match Strategy Recommendation Engine (M26)
 *
 * The top-level orchestrator. Builds the game model, runs every strategy engine,
 * assembles the complete Match Plan, applies manual coach overrides, and falls
 * back to a safe template if no usable inputs were available.
 *
 * Pure + deterministic. The complete pipeline:
 *   game model → {attack, defence, kicking, set-piece, bench, subs, risk,
 *   adaptation, scenario} → match plan → overrides → (fallback)
 */

import {
  STRATEGY_VERSION, PLAN_FIELD, POSTURE, round2,
} from './strategy-types.js'
import { buildGameModel, block, rec } from './game-model.js'
import { buildAttackStrategy } from './attack-engine.js'
import { buildDefensiveStrategy } from './defence-engine.js'
import { buildKickStrategy, buildTerritoryPlan, buildKickoffPlan, buildRestartPlan } from './territory-engine.js'
import { buildScrumStrategy, buildLineoutStrategy } from './setpiece-engine.js'
import { buildBenchPlan } from './bench-engine.js'
import { buildReplacementTiming } from './substitution-engine.js'
import { buildRiskWarnings, buildWeatherAdjustments, buildRefereeAdjustments } from './risk-engine.js'
import { buildMomentumTriggers } from './adaptation-engine.js'
import { buildPressureZones } from './scenario-engine.js'

const POSTURE_GAMEPLAN = {
  [POSTURE.FAVOURITE]: 'Control the game: assert set-piece and territory, build a lead, stay ruthless.',
  [POSTURE.EVEN]: 'Win the margins: discipline, set-piece, and the closing 20 minutes.',
  [POSTURE.UNDERDOG]: 'Disrupt and endure: territory, defensive resilience, and a late surge off the bench.',
}

function collectEvidence(plan) {
  const out = []
  for (const key of Object.values(PLAN_FIELD)) {
    for (const r of (plan[key]?.recommendations ?? [])) {
      for (const e of (r.evidence ?? [])) if (e && !out.includes(e)) out.push(e)
    }
  }
  return out
}

function planConfidence(plan, model) {
  const confs = Object.values(PLAN_FIELD)
    .map(k => plan[k]?.confidence)
    .filter(c => typeof c === 'number')
  const mean = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0.5
  return round2(Math.min(mean, model.confidence))
}

/** A guaranteed, generic match plan used when no usable inputs exist. */
function fallbackPlan(model) {
  const base = (summary, recs) => block(summary, null, recs, 0.5)
  const r = (id, t, why) => rec(id, t, why, [], { priority: 'medium', confidence: 0.5 })
  return {
    [PLAN_FIELD.ATTACK]: base('Balanced, accurate attack', [r('atk', 'Go through the phases, hold width, finish chances', 'Fundamentals')]),
    [PLAN_FIELD.DEFENCE]: base('Connected, dominant defence', [r('def', 'Defend in pairs, dominant tackle, quick reload', 'Fundamentals')]),
    [PLAN_FIELD.KICK]: base('Smart kicking', [r('kick', 'Contestable kicks with a connected chase', 'Fundamentals')]),
    [PLAN_FIELD.TERRITORY]: base('Field position', [r('terr', 'Exit cleanly, play in their half', 'Fundamentals')]),
    [PLAN_FIELD.KICKOFF]: base('Kick-off', [r('ko', 'Secure receipt, contest our restart', 'Fundamentals')]),
    [PLAN_FIELD.RESTART]: base('Restart', [r('re', 'Reset shape before restarts', 'Fundamentals')]),
    [PLAN_FIELD.SCRUM]: base('Scrum', [r('scr', 'Secure own feed, exit fast', 'Fundamentals')]),
    [PLAN_FIELD.LINEOUT]: base('Lineout', [r('lo', 'Keep calls simple and secure', 'Fundamentals')]),
    [PLAN_FIELD.BENCH]: base('Bench', [r('bench', 'Protect front-row, finish strong', 'Fundamentals')]),
    [PLAN_FIELD.REPLACEMENTS]: base('Replacements', [r('sub', 'Standard energy-management windows', 'Fundamentals')]),
    [PLAN_FIELD.PRESSURE_ZONES]: base('Pressure zones', [r('pz', 'Win the opening and the closing 20', 'Fundamentals')]),
    [PLAN_FIELD.MOMENTUM]: base('Momentum triggers', [r('mom', 'Tighten with a lead; chase with the bench when behind', 'Fundamentals')]),
    [PLAN_FIELD.RISKS]: base('Risk warnings', [r('risk', 'Stay disciplined and protect the front row', 'Fundamentals')]),
    [PLAN_FIELD.WEATHER]: base('Weather adjustments', [r('wx', 'Adapt kicking and handling to conditions', 'Fundamentals')]),
    [PLAN_FIELD.REFEREE]: base('Referee adjustments', [r('ref', 'Standard breakdown and offside discipline', 'Fundamentals')]),
  }
}

/** Apply manual coach overrides to the assembled plan. */
function applyOverrides(plan, overrides = {}) {
  if (!overrides || typeof overrides !== 'object') return plan
  // overrides.plan: { [planField]: { summary?, addRecommendations?: [...], replace?: bool } }
  for (const [field, ov] of Object.entries(overrides.plan ?? {})) {
    if (!plan[field]) continue
    if (ov.summary) plan[field] = { ...plan[field], summary: ov.summary }
    if (Array.isArray(ov.addRecommendations)) {
      const extra = ov.addRecommendations.map((x, i) =>
        rec(x.id ?? `coach-${field}-${i}`, x.recommendation ?? String(x), x.why ?? 'Coach override', x.evidence ?? [], { priority: x.priority ?? 'high', confidence: 1 }))
      plan[field] = ov.replace
        ? { ...plan[field], recommendations: extra }
        : { ...plan[field], recommendations: [...extra, ...plan[field].recommendations] }
    }
  }
  return plan
}

/**
 * Build a complete Match Plan from a strategy context.
 *
 * @param {object} context
 *   { coachDNA, opponent, selection, matchReadiness, training, weeklyBrief,
 *     squad, welfare, grade, format, weather, refereeTendencies,
 *     matchImportance, overrides, generatedAt }
 * @returns {MatchPlan}
 */
export function buildMatchPlan(context = {}) {
  const model = buildGameModel(context)
  const overrides = context.overrides ?? {}

  let plan = {
    [PLAN_FIELD.ATTACK]:        buildAttackStrategy(model),
    [PLAN_FIELD.DEFENCE]:       buildDefensiveStrategy(model),
    [PLAN_FIELD.KICK]:          buildKickStrategy(model),
    [PLAN_FIELD.TERRITORY]:     buildTerritoryPlan(model),
    [PLAN_FIELD.KICKOFF]:       buildKickoffPlan(model),
    [PLAN_FIELD.RESTART]:       buildRestartPlan(model),
    [PLAN_FIELD.SCRUM]:         buildScrumStrategy(model),
    [PLAN_FIELD.LINEOUT]:       buildLineoutStrategy(model),
    [PLAN_FIELD.BENCH]:         buildBenchPlan(model),
    [PLAN_FIELD.REPLACEMENTS]:  buildReplacementTiming(model, context),
    [PLAN_FIELD.PRESSURE_ZONES]:buildPressureZones(model),
    [PLAN_FIELD.MOMENTUM]:      buildMomentumTriggers(model),
    [PLAN_FIELD.RISKS]:         buildRiskWarnings(model, context),
    [PLAN_FIELD.WEATHER]:       buildWeatherAdjustments(model),
    [PLAN_FIELD.REFEREE]:       buildRefereeAdjustments(model),
  }

  const isFallback = model.inputsAvailable === 0
  if (isFallback) plan = fallbackPlan(model)

  plan = applyOverrides(plan, overrides)

  const gamePlan = overrides.gamePlan ?? POSTURE_GAMEPLAN[model.posture]

  return {
    strategyVersion: STRATEGY_VERSION,
    generatedAt: context.generatedAt ?? null,
    ok: true,
    isFallback,

    grade: model.grade,
    format: model.format,
    opponentId: model.opponentId,
    posture: model.posture,
    strengthIndex: model.strengthIndex,
    gamePlan,

    ...plan,

    confidence: planConfidence(plan, model),
    evidence: collectEvidence(plan),
    explanation: `${model.posture} posture (strength index ${model.strengthIndex >= 0 ? '+' : ''}${model.strengthIndex}). ${gamePlan}` +
      (isFallback ? ' [fallback template — limited inputs]' : ''),
  }
}
