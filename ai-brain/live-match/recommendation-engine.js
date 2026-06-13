/**
 * AI Brain — Live Recommendation Engine (M27)
 *
 * The top-level orchestrator. Derives state, runs every analytical engine,
 * synthesises Live Tactical Advice and a single Recommended Next Action, and
 * assembles the complete Live Match Intelligence object (16 outputs).
 *
 * Deterministic, evidence-backed, with graceful fallback when inputs are thin
 * and support for manual coach overrides.
 */

import {
  LIVE_VERSION, deriveMatchState, rec, clamp,
} from './match-state.js'
import { buildMomentum } from './momentum-engine.js'
import { buildTerritoryMap, buildDominantCollisionZone, buildPressureIndex } from './territory-engine.js'
import { buildWinProbability, buildExpectedNextPhase } from './prediction-engine.js'
import { buildDisciplineRisk } from './discipline-engine.js'
import { buildFatigue } from './fatigue-engine.js'
import { buildInjuryImpact } from './injury-engine.js'
import { buildBenchRecommendations, buildReplacementTiming } from './substitution-engine.js'
import { buildPatterns } from './pattern-engine.js'
import { buildOpportunities, buildDangers } from './scenario-engine.js'
import { buildCriticalMoments } from './timeline-engine.js'
import { scoreOverallConfidence } from './confidence-engine.js'

/** Pre-match strength index from the Match Strategy model (or selection). */
function strengthIndex(context) {
  if (typeof context.matchStrategy?.strengthIndex === 'number') return context.matchStrategy.strengthIndex
  const mr = context.matchReadiness
  if (mr && typeof mr.overallScore === 'number') return clamp(mr.overallScore - 50, -50, 50)
  return 0
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 }

/** Live tactical advice: a ranked, de-duplicated digest of the live signals. */
function buildTacticalAdvice(bundle) {
  const pool = [
    ...bundle.dangers.recommendations,
    ...bundle.opportunities.recommendations,
    ...bundle.disciplineRisk.recommendations,
    ...bundle.fatigueAlerts.alerts,
    ...bundle.benchRecommendations.recommendations,
  ].filter(r => r && r.priority !== 'low')
  const seen = new Set()
  const advice = pool
    .filter(r => !seen.has(r.id) && seen.add(r.id))
    .sort((a, b) => (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]))
    .slice(0, 6)
  return {
    recommendations: advice,
    summary: advice.length ? advice[0].recommendation : 'Execute the plan and stay disciplined',
    confidence: 0.7,
    fallback: 'Follow the pre-match match plan',
  }
}

/** The single highest-priority action right now. */
function buildRecommendedNextAction(bundle, overrides = {}) {
  if (overrides.nextAction) {
    return rec('coach-override', overrides.nextAction, 'Manual coach override', [], { priority: 'high', confidence: 1, fallback: null })
  }
  const ranked = [
    ...bundle.dangers.recommendations,
    ...bundle.opportunities.recommendations,
    ...bundle.disciplineRisk.recommendations,
  ].filter(r => r && r.priority === 'high')
  const chosen = ranked[0]
    ?? bundle.opportunities.recommendations[0]
    ?? bundle.tacticalAdvice.recommendations[0]
    ?? rec('next-base', 'Hold structure, stay accurate, win the next collision', 'No dominant signal', [], { priority: 'medium', confidence: 0.5, fallback: 'Play the percentages' })
  return { ...chosen, summary: chosen.recommendation }
}

/** Apply manual coach overrides to the assembled intelligence. */
function applyOverrides(intel, overrides = {}) {
  if (overrides.winProbability != null && typeof overrides.winProbability === 'number') {
    intel.winProbability = { ...intel.winProbability, value: clamp(Math.round(overrides.winProbability), 1, 99), overridden: true }
  }
  if (overrides.suppress && Array.isArray(overrides.suppress)) {
    for (const field of overrides.suppress) if (intel[field]) intel[field] = { ...intel[field], suppressed: true, recommendations: [] }
  }
  return intel
}

/**
 * Build the complete Live Match Intelligence from the event log + pre-match context.
 *
 * @param {object[]} events   normalised live events
 * @param {object}   context  { grade, format, matchId, coachDNA, opponent,
 *   matchStrategy, selection, training, matchReadiness, overrides, generatedAt }
 * @returns {LiveMatchIntelligence}
 */
export function buildLiveIntelligence(events = [], context = {}) {
  const state = deriveMatchState(events, context)
  const sorted = [...events]
  const model = { strengthIndex: strengthIndex(context) }

  const momentum = buildMomentum(state, sorted)
  model.momentumScore = momentum.score

  const territoryMap = buildTerritoryMap(state, sorted)
  const collisionZone = buildDominantCollisionZone(state, sorted)
  const pressure = buildPressureIndex(state, sorted)
  const winProbability = buildWinProbability(state, model)
  const expectedNextPhase = buildExpectedNextPhase(state)
  const disciplineRisk = buildDisciplineRisk(state, sorted)
  const fatigue = buildFatigue(state, sorted)
  const injury = buildInjuryImpact(state, context)
  const patterns = buildPatterns(state, sorted)

  const signals = { momentum, pressure, discipline: disciplineRisk, patterns }
  const opportunities = buildOpportunities(state, signals, context)
  const dangers = buildDangers(state, signals, context)
  const bench = buildBenchRecommendations(state, fatigue, injury, context)
  const replacementTiming = buildReplacementTiming(state, fatigue, context)
  const criticalMoments = buildCriticalMoments(state, sorted)

  const bundle = {
    opportunities, dangers, disciplineRisk, fatigueAlerts: fatigue, benchRecommendations: bench,
  }
  const tacticalAdvice = buildTacticalAdvice(bundle)
  bundle.tacticalAdvice = tacticalAdvice
  const recommendedNextAction = buildRecommendedNextAction(bundle, context.overrides ?? {})

  const isFallback = state.eventCount === 0
  let intel = {
    liveVersion: LIVE_VERSION,
    generatedAt: context.generatedAt ?? null,
    ok: true,
    isFallback,
    grade: state.grade,
    format: state.format,
    matchId: state.matchId,

    // 16 outputs
    matchState: state,
    momentumScore: momentum,
    pressureIndex: pressure,
    winProbability,
    expectedNextPhase,
    dominantCollisionZone: collisionZone,
    fatigueAlerts: fatigue,
    benchRecommendations: bench,
    replacementTiming,
    disciplineRisk,
    territoryMap,
    liveTacticalAdvice: tacticalAdvice,
    criticalMoments,
    opportunityDetection: opportunities,
    dangerDetection: dangers,
    recommendedNextAction,

    confidence: scoreOverallConfidence(state),
    explanation: `${state.score.us}-${state.score.them} at ${state.clock}' (${state.phase}). ` +
      `Momentum ${momentum.score}, win probability ${winProbability.value}%. ${recommendedNextAction.recommendation}.` +
      (isFallback ? ' [no events yet — pre-match fallback]' : ''),
  }

  intel = applyOverrides(intel, context.overrides ?? {})
  return intel
}
