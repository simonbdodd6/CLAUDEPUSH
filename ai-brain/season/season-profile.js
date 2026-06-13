/**
 * AI Brain — Season Profile Assembly (M28)
 *
 * The top-level orchestrator. Derives the season state, runs every engine, and
 * assembles the complete Season Intelligence object (20 outputs). Deterministic,
 * evidence-backed, with graceful fallback and manual coach overrides.
 *
 * Pipeline: state → fixtures → trend/projection → fatigue/development/
 * performance/coach-impact/rotation/injury → goals/milestones/risks →
 * priority recommendations → timeline → assemble.
 */

import { SEASON_VERSION, deriveSeasonState, clamp, round } from './season-state.js'
import { buildFixtureAnalysis } from './fixture-engine.js'
import { buildTrajectory, buildLeagueTrend } from './trend-engine.js'
import { buildExpectedPoints, buildExpectedPosition, buildProbabilities } from './projection-engine.js'
import { buildFatigueCurves } from './fatigue-tracker.js'
import { buildDevelopment } from './development-engine.js'
import { buildPerformance } from './performance-engine.js'
import { buildCoachImpact } from './coach-impact.js'
import { buildRotationHealth } from './rotation-engine.js'
import { buildInjuryForecast } from './injury-forecast.js'
import { buildTargetAchievement } from './goal-engine.js'
import { buildMilestones } from './milestone-engine.js'
import { buildSeasonRisks } from './risk-engine.js'
import { buildPriorityRecommendations } from './recommendation-engine.js'
import { buildSeasonTimeline } from './timeline-engine.js'
import { scoreSeasonConfidence } from './confidence-engine.js'

function seasonScore(state) {
  // A single 0–100 "season score" blending points pace and points difference.
  const pacePct = clamp((state.pointsPerGame / (state.league.pointsForWin + 2)) * 100, 0, 100)
  const pdPer = state.gamesPlayed ? state.pointsDifference / state.gamesPlayed : 0
  const pdPct = clamp(50 + pdPer * 2, 0, 100)
  return {
    value: round(pacePct * 0.7 + pdPct * 0.3),
    record: state.record,
    points: state.points,
    pointsPerGame: state.pointsPerGame,
    pointsDifference: state.pointsDifference,
    position: state.position,
    form: state.form,
    streak: state.streak,
    summary: `${state.record.wins}W-${state.record.draws}D-${state.record.losses}L, ${state.points} pts (${state.pointsPerGame}/game)`,
  }
}

function applyOverrides(intel, overrides = {}) {
  if (overrides.expectedPosition != null) {
    intel.expectedEndPosition = { ...intel.expectedEndPosition, value: overrides.expectedPosition, overridden: true }
  }
  if (overrides.suppress && Array.isArray(overrides.suppress)) {
    for (const field of overrides.suppress) if (intel[field]) intel[field] = { ...intel[field], suppressed: true }
  }
  return intel
}

/**
 * Build the complete Season Intelligence from a season context.
 * @param {object} context  fixtures + results + training/attendance + dev +
 *   selection history + coachDNA + learning + goals + league + grade/format +
 *   opponentRatings + injuryHistory + availability + overrides
 * @returns {SeasonIntelligence}
 */
export function buildSeasonProfile(context = {}) {
  const state = deriveSeasonState(context)

  const fixtures = buildFixtureAnalysis(state, context)
  const trajectory = buildTrajectory(state)
  const leagueTrend = buildLeagueTrend(state, context)

  const expectedPoints = buildExpectedPoints(state, fixtures)
  const expectedPosition = buildExpectedPosition(state, expectedPoints)
  const probabilities = buildProbabilities(state, expectedPosition)
  const projection = { expectedPoints, expectedPosition, probabilities }

  const fatigue = buildFatigueCurves(state, context)
  const development = buildDevelopment(context)
  const performance = buildPerformance(state, development)
  const coachImpact = buildCoachImpact(state, trajectory, development, context)
  const rotation = buildRotationHealth(state, context)
  const injuryForecast = buildInjuryForecast(state, fatigue, context)

  const goals = buildTargetAchievement(state, expectedPoints, expectedPosition, context)
  const milestones = buildMilestones(state, projection)
  const risks = buildSeasonRisks({ trajectory, projection, rotation, fatigue, injuryForecast })
  const priority = buildPriorityRecommendations({ risks, goals, rotation, development, projection, fatigue, injuryForecast })
  const timeline = buildSeasonTimeline(state, milestones)

  const isFallback = state.gamesPlayed === 0
  let intel = {
    seasonVersion: SEASON_VERSION,
    generatedAt: context.generatedAt ?? null,
    ok: true,
    isFallback,
    grade: state.grade,
    format: state.format,
    seasonId: state.seasonId,

    // 20 outputs
    currentSeasonScore: seasonScore(state),
    seasonTrajectory: trajectory,
    leagueTrend,
    playerDevelopmentCurves: { curves: development.curves, summary: development.summary, confidence: development.confidence, fallback: development.fallback },
    workloadGraphs: { workload: fatigue.workload, summary: fatigue.summary, confidence: fatigue.confidence, fallback: fatigue.fallback },
    fatigueCurves: { curves: fatigue.curves, peakWeek: fatigue.peakWeek, alerts: fatigue.alerts, summary: fatigue.summary, confidence: fatigue.confidence, fallback: fatigue.fallback },
    injuryForecast,
    championshipProbability: probabilities.championship,
    playoffProbability: probabilities.playoff,
    relegationProbability: probabilities.relegation,
    targetAchievement: goals,
    developmentTargets: { targets: development.targets, summary: development.summary, confidence: development.confidence, fallback: development.fallback },
    playerImprovement: performance,
    coachImpact,
    squadRotationHealth: rotation,
    seasonRisks: risks,
    priorityRecommendations: priority,
    milestoneAlerts: milestones,
    expectedEndPosition: expectedPosition,
    expectedPointsTotal: expectedPoints,

    seasonTimeline: timeline,
    fixtureAnalysis: fixtures,

    confidence: scoreSeasonConfidence(state, context),
    explanation: `${state.record.wins}-${state.record.draws}-${state.record.losses}, ${state.points} pts after ${state.gamesPlayed}/${state.totalGames} games. ` +
      `${trajectory.summary}. Projected ${expectedPoints.value} pts, ~${expectedPosition.value}${expectedPosition.value ? 'th' : ''} (title ${probabilities.championship.value}%, playoff ${probabilities.playoff.value}%, relegation ${probabilities.relegation.value}%).` +
      (isFallback ? ' [no results yet — pre-season fallback]' : ''),
  }

  intel = applyOverrides(intel, context.overrides ?? {})
  return intel
}
