/**
 * Club Intelligence Engine — Public API
 *
 * The highest-level AI engine in Coach's Eye.
 * Aggregates every other engine into a living club overview.
 *
 * Usage:
 *   import { getClubReport, answerQuestion } from './qa/club-intelligence/index.js';
 *
 *   const report = await getClubReport();
 *   console.log(report.health.overallScore);
 *
 *   const answer = await answerQuestion("Which players are likely to leave?");
 */

import { buildClubProfile }        from './club-profile.js';
import { calculateClubHealth }     from './club-health.js';
import { generateInsights, answerQuestion as _answerQuestion } from './club-insights.js';
import { generateRecommendations } from './club-recommendations.js';
import { buildDashboard }          from './club-dashboard.js';
import { generateClubReport, getClubHealth, getTopInsights, getDorBrief } from './generate-club-report.js';

// ── Full report pipeline ──────────────────────────────────────────────────────

export { generateClubReport, getClubHealth, getTopInsights, getDorBrief };

export async function getClubProfile(options = {}) {
  return buildClubProfile(options);
}

export async function getInsights(options = {}) {
  const profile = await buildClubProfile(options);
  const health  = calculateClubHealth(profile);
  return generateInsights(profile, health);
}

export async function getRecommendations(options = {}) {
  const profile         = await buildClubProfile(options);
  const health          = calculateClubHealth(profile);
  const insightResult   = generateInsights(profile, health);
  return generateRecommendations(profile, health, insightResult);
}

export async function getDashboard(options = {}) {
  const report = await generateClubReport(options);
  return report.dashboard;
}

// ── Question answering ────────────────────────────────────────────────────────

export async function answerQuestion(question, options = {}) {
  const profile         = await buildClubProfile(options);
  const health          = calculateClubHealth(profile);
  const insightResult   = generateInsights(profile, health);
  return _answerQuestion(question, profile, health, insightResult);
}

// ── Copilot-compatible chat response ─────────────────────────────────────────

export async function handleCopilotRequest(intent, context = {}) {
  const report = await generateClubReport();

  const { profile, health, insights, recommendations } = report;

  if (intent === 'club_report' || intent === 'squad_analysis') {
    return {
      success:  true,
      data:     report,
      summary:  `${profile.club?.name ?? 'Club'}: health ${health.overallScore ?? 'n/a'}/100 (${health.overallGrade ?? '?'}) — ${health.trend}. ${insights.totalCount} insights, ${recommendations.criticalCount} critical.`,
      evidence: [
        `Players: ${profile.summary.totalPlayers}`,
        `Teams: ${profile.summary.totalTeams}`,
        `Coaches: ${profile.summary.totalCoaches}`,
        `Active injuries: ${profile.summary.activeInjuries}`,
        health.overallScore != null ? `Club health: ${health.overallScore}/100` : null,
        recommendations.criticalCount > 0 ? `${recommendations.criticalCount} critical recommendation(s)` : null,
      ].filter(Boolean),
    };
  }

  // DoR brief
  if (intent === 'weekly_plan') {
    return {
      success:  true,
      data:     recommendations,
      summary:  `DoR brief: ${recommendations.thisWeekPriorities.length} priorities this week, ${recommendations.criticalCount} critical.`,
      evidence: (recommendations.thisWeekPriorities ?? []).slice(0, 3).map(r => r.action),
    };
  }

  // Default: return top-level summary
  return {
    success:  true,
    data:     { health, topInsights: insights.insights.slice(0, 5), priorities: recommendations.thisWeekPriorities },
    summary:  health.summary,
    evidence: health.dimensions.filter(d => d.score != null).map(d => `${d.dimension}: ${d.score}/100`),
  };
}

export default {
  generateClubReport,
  getClubProfile,
  getClubHealth,
  getInsights,
  getRecommendations,
  getDashboard,
  getTopInsights,
  getDorBrief,
  answerQuestion,
  handleCopilotRequest,
};
