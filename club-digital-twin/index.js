/**
 * Club Digital Twin — Public API
 *
 * The central model that every engine, workflow and future feature reads from.
 * The Club is the primary object of the entire platform.
 *
 * Quick start:
 *   import { getClub, getClubHealth, getClubRisks, generateExecutiveSummary } from './club-digital-twin/index.js';
 *
 *   const club = await getClub();
 *   console.log(`${club.identity.name}: ${club.health.score}/100`);
 *
 *   const risks = await getClubRisks();
 *   console.log(`${risks.critical} critical risks`);
 *
 *   const summary = await generateExecutiveSummary();
 *   console.log(summary.narrative);
 *
 * Full pipeline:
 *   import { runDigitalTwin } from './club-digital-twin/index.js';
 *   const twin = await runDigitalTwin();
 *   // twin.model, twin.health, twin.risks, twin.trends, twin.predictions, twin.summary
 */

// ── Core model ────────────────────────────────────────────────────────────────
export { buildClubModel, getClub, getClubIdentity, getClubSummary } from './club-model.js';

// ── Health ────────────────────────────────────────────────────────────────────
export { buildHealthReport, getHealthHistory, scoreDimensions, computeHealthScore } from './club-health.js';

// ── Risks ─────────────────────────────────────────────────────────────────────
export { buildRiskRegister, getClubRisks, getCriticalRisks, RISK_TYPES, SEVERITY } from './club-risk.js';

// ── Trends ────────────────────────────────────────────────────────────────────
export { computeTrends, saveSnapshot, narrateTrends, loadSnapshots, getLatestSnapshot } from './club-trends.js';

// ── Summaries ─────────────────────────────────────────────────────────────────
export { generateExecutiveSummary, generateBoardReport, generateMorningBriefing, answerClubQuestion } from './club-summary.js';

// ── Predictions ───────────────────────────────────────────────────────────────
export { generatePredictions, SCENARIO_TYPES } from './club-predictions.js';

// ── API server ────────────────────────────────────────────────────────────────
export { startApiServer } from './club-api.js';

// ── Full pipeline convenience function ───────────────────────────────────────

import { buildClubModel }           from './club-model.js';
import { buildHealthReport }        from './club-health.js';
import { buildRiskRegister }        from './club-risk.js';
import { computeTrends, saveSnapshot } from './club-trends.js';
import { generateExecutiveSummary } from './club-summary.js';
import { generatePredictions }      from './club-predictions.js';

/**
 * Run the full Digital Twin pipeline and return all outputs.
 *
 * @param {object} options
 * @param {boolean} [options.saveTrends=true]  — save snapshot for trend tracking
 * @param {boolean} [options.withPredictions=true]
 * @param {boolean} [options.withSummary=false] — AI summary (slower, requires knowledge engine)
 */
export async function runDigitalTwin(options = {}) {
  const {
    saveTrends     = true,
    withPredictions = true,
    withSummary    = false,
    identity,
  } = options;

  const start = Date.now();

  // Step 1: Build the model (aggregates all engines)
  const model = await buildClubModel({ identity });

  // Step 2: Compute live health score against the model
  const health = buildHealthReport(model);
  model.health = { ...model.health, ...health }; // merge computed health back in

  // Step 3: Detect risks
  const risks = buildRiskRegister(model);

  // Step 4: Save snapshot for trend tracking
  if (saveTrends) saveSnapshot(model);

  // Step 5: Compute trends from saved snapshots
  const trends = computeTrends();

  // Step 6: Generate predictions
  const predictions = withPredictions ? await generatePredictions(model, trends) : null;

  // Step 7: Generate AI summary (optional — requires knowledge engine)
  const summary = withSummary ? await generateExecutiveSummary(model, risks, trends) : null;

  return {
    model,
    health,
    risks,
    trends,
    predictions,
    summary,
    pipelineMs: Date.now() - start,
    twinVersion: '1.0.0',
    runAt: new Date().toISOString(),
  };
}

// ── Convenience question-answering API ────────────────────────────────────────

/**
 * Ask any natural language question about the club.
 * Routes to answerClubQuestion() with full context.
 */
export async function ask(question, options = {}) {
  const { answerClubQuestion: _ask } = await import('./club-summary.js');
  const { computeTrends: _trends }   = await import('./club-trends.js');
  const model     = await buildClubModel(options);
  const risks     = buildRiskRegister(model);
  const trends    = _trends();
  return _ask(question, model, risks, trends);
}

// ── Default export ────────────────────────────────────────────────────────────

export default {
  run:         runDigitalTwin,
  getClub:     buildClubModel,
  getHealth:   async () => { const m = await buildClubModel(); return buildHealthReport(m); },
  getRisks:    async () => { const m = await buildClubModel(); return buildRiskRegister(m); },
  getTrends:   computeTrends,
  ask,
  startApi:    async () => { const { startApiServer } = await import('./club-api.js'); return startApiServer(); },
};
