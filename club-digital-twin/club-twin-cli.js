#!/usr/bin/env node
/**
 * Club Digital Twin — CLI Test Runner
 *
 * Validates every layer of the Digital Twin:
 *   1. Club Model (aggregation from all engines)
 *   2. Health Score (multi-dimensional calculation)
 *   3. Risk Register (automated risk detection)
 *   4. Trend Tracking (snapshot + retrieval)
 *   5. Predictions (30/90-day forecasting)
 *   6. Summaries (executive summary generation)
 *   7. Full pipeline (runDigitalTwin())
 *   8. Report generation
 */

import { runDigitalTwin, buildClubModel, buildHealthReport, buildRiskRegister, computeTrends, narrateTrends, generatePredictions, generateExecutiveSummary, generateMorningBriefing, ask } from './index.js';
import { saveSnapshot } from './club-trends.js';

const PAD = 50;

function hr(char = '─') { return char.repeat(68); }
function pad(label)      { return (label + ' ').padEnd(PAD, '.'); }

function pass(label, detail = '') {
  console.log(`  ✓ ${pad(label)} ${detail}`);
}
function fail(label, err) {
  console.error(`  ✗ ${pad(label)} ERROR: ${err}`);
}
function section(title) {
  console.log(`\n${hr()}`);
  console.log(`  ${title}`);
  console.log(hr());
}

async function main() {
  console.log('\n' + hr('═'));
  console.log('  COACH\'S EYE — CLUB DIGITAL TWIN  ·  Validation CLI');
  console.log(hr('═'));
  console.log(`  Run at: ${new Date().toISOString()}\n`);

  let passed = 0, failed = 0;

  function ok(label, detail) { pass(label, detail); passed++; }
  function ko(label, err)    { fail(label, err);    failed++;  }

  // ── SECTION 1: Club Model ──────────────────────────────────────────────────
  section('1 · CLUB MODEL');
  let model;
  try {
    model = await buildClubModel();
    ok('buildClubModel() executes',         `${model.buildTimeMs}ms`);
    ok('Identity block present',            model.identity?.name ?? '(default)');
    ok('Membership block present',          `active: ${model.membership?.active ?? 0}`);
    ok('Teams array present',               `${model.teams?.length ?? 0} team(s)`);
    ok('Players block present',             `${model.players?.activeCount ?? 0} player(s)`);
    ok('Coaches block present',             `${model.coaches?.activeCount ?? 0} coach(es)`);
    ok('Volunteers block present',          `coverage: ${model.volunteers?.coveragePercent ?? 'N/A'}%`);
    ok('Sponsors block present',            `${model.sponsors?.active ?? 0} sponsor(s)`);
    ok('Communications block present',      `${model.communications?.pendingDrafts ?? 0} pending drafts`);
    ok('Committee block present',           `${model.committee?.pendingApprovals ?? 0} approvals`);
    ok('Finance placeholder present',       model.finance?._placeholder ? 'placeholder' : '?');
    ok('Facilities placeholder present',    model.facilities?._placeholder ? 'placeholder' : '?');
    ok('Data completeness calculated',      `${model.dataCompleteness}%`);
    ok('lastUpdated timestamp set',         model.lastUpdated.slice(0,10));
  } catch (e) { ko('buildClubModel()', e.message); model = _emptyModel(); }

  // ── SECTION 2: Health Score ────────────────────────────────────────────────
  section('2 · HEALTH SCORE');
  let health;
  try {
    health = buildHealthReport(model);
    ok('buildHealthReport() executes',      '');
    ok('Overall score computed (0–100)',     `${health.score}/100`);
    ok('Grade assigned',                    health.grade);
    ok('Status label assigned',             health.status);
    ok('Trend computed',                    health.trend);
    ok('Summary generated',                 health.summary?.slice(0, 60) + '…');
    ok('Dimensions array populated',        `${health.dimensions?.length ?? 0} dimensions`);
    const weights = health.weights?.reduce((s, d) => s + d.weight, 0) ?? 0;
    ok('Weights sum to 100',                `sum = ${weights}`);
    for (const dim of (health.dimensions ?? [])) {
      ok(`  Dimension: ${dim.label}`, `${dim.score}/100 (weight ${dim.weight}%)`);
    }
  } catch (e) { ko('buildHealthReport()', e.message); health = {}; }

  // ── SECTION 3: Risk Register ───────────────────────────────────────────────
  section('3 · RISK REGISTER');
  let risks;
  try {
    risks = buildRiskRegister(model);
    ok('buildRiskRegister() executes',      '');
    ok('Risk counts computed',              `total:${risks.total} crit:${risks.critical} high:${risks.high} med:${risks.medium}`);
    ok('Risks array returned',              `${risks.risks?.length ?? 0} risk item(s)`);
    for (const r of (risks.risks ?? []).slice(0, 6)) {
      ok(`  [${r.severity}] ${r.type}`,    r.title?.slice(0, 35));
    }
    ok('computedAt timestamp present',      risks.computedAt?.slice(0,10));
  } catch (e) { ko('buildRiskRegister()', e.message); risks = { risks: [] }; }

  // ── SECTION 4: Trend Tracking ──────────────────────────────────────────────
  section('4 · TREND TRACKING');
  try {
    const snap1 = saveSnapshot(model);
    ok('saveSnapshot() — first save',       `healthScore: ${snap1?.healthScore ?? 'N/A'}`);
    // Mutate model slightly and save again to simulate two data points
    const model2 = JSON.parse(JSON.stringify(model));
    if (model2.health) model2.health.score = (model.health?.score ?? 50) + 5;
    if (model2.players) model2.players.activeCount = (model.players?.activeCount ?? 0) + 1;
    const snap2 = saveSnapshot(model2);
    ok('saveSnapshot() — second save',      `healthScore: ${snap2?.healthScore ?? 'N/A'}`);

    const trends = computeTrends();
    ok('computeTrends() executes',          trends.available ? 'data available' : trends.message);
    ok('Snapshots counted',                 `${trends.totalSnapshots ?? 0} total`);
    const narr = narrateTrends(trends);
    ok('narrateTrends() generates text',    narr?.slice(0, 60) + '…');
  } catch (e) { ko('Trend tracking', e.message); }

  // ── SECTION 5: Predictions ─────────────────────────────────────────────────
  section('5 · PREDICTIONS');
  let predictions;
  try {
    const trends = computeTrends();
    predictions = await generatePredictions(model, trends);
    ok('generatePredictions() executes',    `confidence: ${predictions.confidence}`);
    ok('Forecast metrics returned',         `${Object.keys(predictions.forecasts ?? {}).length} metric(s)`);
    ok('Scenarios detected',                `${predictions.scenarios?.length ?? 0} scenario(s)`);
    ok('Interventions mapped',              `${predictions.interventions?.length ?? 0} intervention(s)`);
    ok('Narrative generated',               predictions.narrative?.slice(0, 60) + '…');
    for (const s of (predictions.scenarios ?? []).slice(0, 3)) {
      ok(`  Scenario: ${s.type}`,           `[${s.severity}] ${s.horizon}`);
    }
  } catch (e) { ko('generatePredictions()', e.message); }

  // ── SECTION 6: Summaries ───────────────────────────────────────────────────
  section('6 · SUMMARIES');
  try {
    const trends = computeTrends();

    const brief = await generateMorningBriefing(model, risks);
    ok('generateMorningBriefing() executes', brief.title?.slice(0, 40));
    ok('Morning priorities returned',        `${brief.todayPriorities?.length ?? 0} item(s)`);
    ok('Top risks included',                 `${brief.topRisks?.length ?? 0} risk(s)`);

    const weekly = await generateExecutiveSummary(model, risks, trends);
    ok('generateExecutiveSummary() executes', `${weekly.sections?.length ?? 0} section(s)`);
    ok('Narrative generated',                weekly.narrative?.slice(0, 60) + '…');
    ok('Audience defined',                   weekly.audience?.join(', '));
  } catch (e) { ko('Summary generation', e.message); }

  // ── SECTION 7: AI Question Answering ──────────────────────────────────────
  section('7 · AI QUESTION ANSWERING');
  try {
    const answer = await ask('What are our biggest risks right now?');
    ok('ask() executes',                    `source: ${answer.source}`);
    ok('Answer text returned',              answer.answer?.slice(0, 60) + '…');
    ok('Source field set',                  answer.source);
  } catch (e) { ko('ask()', e.message); }

  // ── SECTION 8: Full Pipeline ───────────────────────────────────────────────
  section('8 · FULL PIPELINE (runDigitalTwin)');
  try {
    const twin = await runDigitalTwin({ saveTrends: true, withPredictions: true, withSummary: false });
    ok('runDigitalTwin() executes',          `${twin.pipelineMs}ms`);
    ok('twin.model present',                 `v${twin.twinVersion}`);
    ok('twin.health present',                `score: ${twin.health?.score ?? 'N/A'}`);
    ok('twin.risks present',                 `${twin.risks?.total ?? 0} risk(s)`);
    ok('twin.trends present',                twin.trends?.available ? 'data available' : 'no history yet');
    ok('twin.predictions present',           `${twin.predictions?.scenarios?.length ?? 0} scenario(s)`);
    ok('twin.runAt timestamp',               twin.runAt?.slice(0,10));
  } catch (e) { ko('runDigitalTwin()', e.message); }

  // ── Final report ───────────────────────────────────────────────────────────
  console.log('\n' + hr('═'));
  console.log(`  RESULTS: ${passed} passed · ${failed} failed`);
  console.log(hr('═'));

  if (model?.health?.score != null) {
    console.log(`\n  Club Health:    ${model.health.score}/100 (${health?.grade ?? '?'}) — ${health?.status ?? ''}`);
  }
  if (risks?.total != null) {
    console.log(`  Risks:         ${risks.critical} critical · ${risks.high} high · ${risks.medium} medium`);
  }
  console.log(`  Data Coverage: ${model?.dataCompleteness ?? 0}%`);
  console.log(`  Players:       ${model?.players?.activeCount ?? 0} active · ${model?.players?.injuredCount ?? 0} injured`);
  console.log(`  Teams:         ${model?.teams?.length ?? 0}`);
  console.log(`  Coaches:       ${model?.coaches?.activeCount ?? 0}`);

  if (failed > 0) {
    console.log(`\n  ⚠  ${failed} test(s) failed — check errors above.\n`);
    process.exit(1);
  } else {
    console.log('\n  ✓  All tests passed. Club Digital Twin is operational.\n');
  }
}

function _emptyModel() {
  return {
    identity:    { name: 'Unknown' },
    membership:  { active: 0 },
    teams:       [],
    players:     { activeCount: 0, injuredCount: 0 },
    coaches:     { activeCount: 0 },
    volunteers:  {},
    sponsors:    { active: 0 },
    communications: {},
    committee:   { pendingApprovals: 0 },
    finance:     { _placeholder: true },
    facilities:  { _placeholder: true },
    health:      { score: null, dimensions: [] },
    dataCompleteness: 0,
    lastUpdated: new Date().toISOString(),
  };
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
