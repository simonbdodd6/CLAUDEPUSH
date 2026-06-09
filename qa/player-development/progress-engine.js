/**
 * Progress Engine
 * Orchestrates all analysis modules and produces a complete player analysis.
 * This is the internal pipeline — index.js exposes the public API.
 */

import { analyseAttendance }                         from './attendance-analysis.js';
import { analyseInjuryRisk }                         from './injury-risk.js';
import { analyseStrengthProgress }                   from './strength-progress.js';
import { analyseSpeedProgress }                      from './speed-progress.js';
import { analyseReadiness, analyseProgrammeCompliance, analyseCoachFeedback } from './readiness-score.js';
import { buildDevelopmentSummary, assessPromotionReadiness } from './development-summary.js';
import { generateRecommendations }                   from './recommendation-engine.js';
import { predictNextPhase }                          from './projection-engine.js';
import { generatePlayerReport }                      from './player-report.js';

// ── Single player pipeline ─────────────────────────────────────────────────────

export async function runPlayerAnalysis(player, programmes = []) {
  // Run all independent analysis modules
  const attendance          = analyseAttendance(player);
  const injuryRisk          = analyseInjuryRisk(player);
  const strengthProgress    = analyseStrengthProgress(player, programmes);
  const speedProgress       = analyseSpeedProgress(player, programmes);
  const programmeCompliance = analyseProgrammeCompliance(player, programmes);
  const coachFeedback       = analyseCoachFeedback(player, programmes);
  const readiness           = analyseReadiness(player, programmes, injuryRisk, attendance);

  const analyses = {
    attendance,
    injuryRisk,
    strengthProgress,
    speedProgress,
    programmeCompliance,
    coachFeedback,
    readiness,
  };

  // Composite scores (depend on individual analyses)
  const developmentSummary = buildDevelopmentSummary(analyses);
  analyses.developmentSummary = developmentSummary;

  // Promotion readiness
  const promotionReadiness = assessPromotionReadiness(player, developmentSummary, readiness);

  // Recommendations
  const recommendations = generateRecommendations(player, programmes, analyses, promotionReadiness);

  // Trajectory projection
  const projection = predictNextPhase(player, programmes, analyses);

  return {
    player,
    programmes,
    analyses,
    developmentSummary,
    promotionReadiness,
    recommendations,
    projection,
    generatedAt: new Date().toISOString(),
  };
}

// ── Team pipeline ──────────────────────────────────────────────────────────────

export async function runTeamAnalysis(players, programmesByPlayer = {}) {
  const playerResults = await Promise.all(
    players.map(player => runPlayerAnalysis(player, programmesByPlayer[player.id] ?? []))
  );

  const teamScores = playerResults
    .map(r => r.developmentSummary?.score)
    .filter(s => s != null);

  const avg = teamScores.length
    ? Math.round(teamScores.reduce((a, b) => a + b, 0) / teamScores.length)
    : null;

  const topPlayer    = playerResults.reduce((best, r) =>
    (r.developmentSummary?.score ?? 0) > (best?.developmentSummary?.score ?? 0) ? r : best, playerResults[0]);
  const bottomPlayer = playerResults.reduce((worst, r) =>
    (r.developmentSummary?.score ?? 100) < (worst?.developmentSummary?.score ?? 100) ? r : worst, playerResults[0]);

  const criticalFlags = playerResults
    .flatMap(r => Object.values(r.analyses).flatMap(a => (a?.flags ?? []).filter(f => f.level === 'critical')))
    .filter(Boolean);

  return {
    playerCount:     players.length,
    averageDevScore: avg,
    playerResults,
    topPlayer:       topPlayer ? { name: topPlayer.player?.core?.name, score: topPlayer.developmentSummary?.score } : null,
    bottomPlayer:    bottomPlayer ? { name: bottomPlayer.player?.core?.name, score: bottomPlayer.developmentSummary?.score } : null,
    criticalFlagCount: criticalFlags.length,
    criticalFlags,
    generatedAt: new Date().toISOString(),
  };
}

// ── Compare players ────────────────────────────────────────────────────────────

export async function comparePlayers(players, programmesByPlayer = {}) {
  const results = await Promise.all(
    players.map(player => runPlayerAnalysis(player, programmesByPlayer[player.id] ?? []))
  );

  const comparison = results.map(r => ({
    name:               r.player?.core?.name,
    position:           r.player?.core?.position,
    developmentScore:   r.developmentSummary?.score,
    developmentGrade:   r.developmentSummary?.grade,
    readinessScore:     r.analyses.readiness?.score,
    injuryRisk:         r.analyses.injuryRisk?.score,
    attendanceRate:     Math.round((r.player?.attendance?.rate ?? 0) * 100),
    topRecommendation:  r.recommendations?.[0]?.action ?? 'No urgent recommendation',
    trajectory:         r.projection?.trajectoryNarrative,
  }));

  comparison.sort((a, b) => (b.developmentScore ?? 0) - (a.developmentScore ?? 0));

  return {
    comparison,
    totalPlayers: results.length,
    generatedAt:  new Date().toISOString(),
  };
}

// ── Development report ─────────────────────────────────────────────────────────

export async function generateDevelopmentReport(player, programmes = [], options = {}) {
  const analysis = await runPlayerAnalysis(player, programmes);
  return generatePlayerReport(analysis, options);
}
