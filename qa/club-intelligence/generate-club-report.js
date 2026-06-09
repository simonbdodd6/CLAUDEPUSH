/**
 * Club Report Generator
 * Runs the full Club Intelligence pipeline and returns structured output.
 * Used by the CLI, the AI Copilot adapter, and future API endpoints.
 */

import { buildClubProfile }       from './club-profile.js';
import { calculateClubHealth }    from './club-health.js';
import { generateInsights }       from './club-insights.js';
import { generateRecommendations } from './club-recommendations.js';
import { buildDashboard }         from './club-dashboard.js';

// ── Full pipeline ─────────────────────────────────────────────────────────────

export async function generateClubReport(options = {}) {
  const start = Date.now();

  const profile         = await buildClubProfile(options);
  const health          = calculateClubHealth(profile);
  const insightResult   = generateInsights(profile, health);
  const recommendations = generateRecommendations(profile, health, insightResult);

  const dashboard = buildDashboard(profile, health, insightResult, recommendations, {
    format: options.format ?? 'markdown',
    date:   options.date,
  });

  return {
    profile,
    health,
    insights: insightResult,
    recommendations,
    dashboard,
    generatedAt: new Date().toISOString(),
    buildTimeMs: Date.now() - start,
  };
}

// ── Quick accessors ───────────────────────────────────────────────────────────

export async function getClubHealth(options = {}) {
  const profile = await buildClubProfile(options);
  return calculateClubHealth(profile);
}

export async function getTopInsights(limit = 5, options = {}) {
  const profile = await buildClubProfile(options);
  const health  = calculateClubHealth(profile);
  const result  = generateInsights(profile, health);
  return result.insights.slice(0, limit);
}

export async function getDorBrief(options = {}) {
  const profile         = await buildClubProfile(options);
  const health          = calculateClubHealth(profile);
  const insightResult   = generateInsights(profile, health);
  const recommendations = generateRecommendations(profile, health, insightResult);
  return recommendations.thisWeekPriorities;
}
