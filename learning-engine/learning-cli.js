/**
 * Learning Engine CLI — test runner
 *
 * Usage:
 *   node learning-engine/learning-cli.js [--seed] [--accuracy] [--calibration]
 *                                        [--feedback] [--club] [--plan] [--all]
 */

import { seedMockOutcomes, getOutcomeSummary, getRecentOutcomes } from './outcome-tracker.js';
import { getCalibrationSummary, calibrateAllTypes } from './confidence-calibrator.js';
import { getPredictionAccuracy, getAccuracyTrend } from './prediction-accuracy.js';
import { runMonthlyFeedback, getMonthlyTrend } from './feedback-loop.js';
import { computeClubIntelligenceScore, buildClubProfile } from './club-intelligence-model.js';
import { generateImprovementPlan } from './self-improvement.js';

const args = process.argv.slice(2);
const all  = args.includes('--all') || args.length === 0;

function sep(title) { console.log(`\n${'─'.repeat(60)}\n  ${title}\n${'─'.repeat(60)}`); }

async function run() {
  // Always seed first
  sep('Seeding mock outcomes (first run only)');
  seedMockOutcomes();
  const summary = getOutcomeSummary();
  console.log(`Outcomes in store: ${summary.total}`);
  if (summary.total > 0) {
    console.log(`Overall accuracy:  ${summary.overallAccuracy}%`);
    console.log(`Correct:           ${summary.correct}`);
    console.log(`Wrong:             ${summary.wrong}`);
  }

  if (all || args.includes('--accuracy')) {
    sep('Prediction Accuracy (Precision / Recall / F1)');
    const acc = getPredictionAccuracy();
    console.log(`Overall F1:    ${acc.overall.f1 ?? 'N/A'}%  Grade: ${acc.overall.grade}`);
    console.log(`Precision:     ${acc.overall.precision ?? 'N/A'}%`);
    console.log(`Recall:        ${acc.overall.recall ?? 'N/A'}%`);
    console.log(`\nBy type:`);
    for (const t of acc.byType) {
      console.log(`  ${t.type.padEnd(26)} F1=${String(t.f1 ?? 'N/A').padStart(3)}%  P=${String(t.precision ?? 'N/A').padStart(3)}%  R=${String(t.recall ?? 'N/A').padStart(3)}%  n=${t.sampleSize}  (${t.grade})`);
    }

    const trend = getAccuracyTrend(4);
    if (trend.length > 0) {
      console.log(`\nAccuracy over time (${trend.length} periods):`);
      for (const b of trend) {
        const bar = b.f1 != null ? '█'.repeat(Math.round(b.f1 / 10)) : '░';
        console.log(`  Period ${b.bucket}: ${String(b.f1 ?? 'N/A').padStart(3)}% F1  ${bar}  (n=${b.sampleSize})`);
      }
    }
  }

  if (all || args.includes('--calibration')) {
    sep('Confidence Calibration (EMA per type)');
    const cal = getCalibrationSummary();
    console.log(`Maturity:           ${cal.calibrationMaturity}`);
    console.log(`Avg confidence:     ${cal.averageConfidence}%`);
    console.log(`Total outcomes:     ${cal.totalOutcomesSeen}`);
    console.log(`Most accurate type: ${cal.mostAccurateType?.type ?? 'N/A'} (${cal.mostAccurateType?.confidence ?? 'N/A'}%)`);
    console.log(`Least accurate:     ${cal.leastAccurateType?.type ?? 'N/A'} (${cal.leastAccurateType?.confidence ?? 'N/A'}%)`);
    console.log(`\nCalibrated confidence by type:`);
    for (const c of cal.calibrations) {
      const bar = '█'.repeat(Math.round(c.confidence / 10));
      console.log(`  ${c.type.padEnd(26)} ${String(c.confidence).padStart(3)}%  ${bar}  (n=${c.sampleSize})`);
    }
  }

  if (all || args.includes('--feedback')) {
    sep('Monthly Feedback Loop');
    const snapshot = runMonthlyFeedback();
    console.log(`Period:                 ${snapshot.period}`);
    console.log(`Total recommendations:  ${snapshot.totalRecommendations}`);
    console.log(`Acceptance rate:        ${snapshot.acceptanceRate}%`);
    console.log(`Rejection rate:         ${snapshot.rejectionRate}%`);
    console.log(`Automation success:     ${snapshot.automationSuccessRate ?? 'N/A'}%`);
    console.log(`False positive rate:    ${snapshot.falsePositiveRate}%`);
    console.log(`Overall F1:             ${snapshot.overallF1 ?? 'N/A'}%  (${snapshot.accuracyGrade})`);
    console.log(`Time saved:             ${snapshot.timeSavedHours}h`);
    console.log(`Calibration maturity:   ${snapshot.calibrationMaturity}`);

    const trend = getMonthlyTrend();
    if (trend.trend !== 'insufficient_data') {
      console.log(`\nMonth-over-month trend: ${trend.trend}`);
      console.log(`F1 improvement:         ${trend.f1Improvement > 0 ? '+' : ''}${trend.f1Improvement}%`);
    }
  }

  if (all || args.includes('--club')) {
    sep('Club Intelligence Model');
    const profile = buildClubProfile('Ballymena RFC');
    console.log(`Club:                ${profile.clubName}`);
    console.log(`CIS Score:           ${profile.cisScore}/100  (${profile.cisGrade})`);
    console.log(`Stage:               ${profile.cisStage}`);
    console.log(`Total outcomes:      ${profile.totalOutcomes}`);
    console.log(`\nComponents:`);
    for (const [name, c] of Object.entries(profile.components)) {
      console.log(`  ${name.padEnd(22)} ${String(c.score).padStart(3)}/100  (weight ${c.weight})`);
    }
    console.log(`\nStrengths:`);
    for (const s of profile.topStrengths) console.log(`  ✓ ${s}`);
    console.log(`Improvement areas:`);
    for (const a of profile.improvementAreas) console.log(`  → ${a}`);
    console.log(`\nProjected CIS at end of season: ${profile.projectedScoreIn1Season}/100`);
    console.log(`\n${profile.description}`);
  }

  if (all || args.includes('--plan')) {
    sep('Self-Improvement Plan');
    const plan = generateImprovementPlan();
    console.log(`CIS: ${plan.cisScore}/100 (${plan.cisGrade})  Overall F1: ${plan.overallF1 ?? 'N/A'}%`);
    console.log(`Trend: ${plan.monthlyTrend}`);
    console.log(`\nWeak types requiring attention:`);
    if (plan.weakTypes.length > 0) {
      for (const t of plan.weakTypes) console.log(`  ⚠ ${t}`);
    } else {
      console.log(`  None — all types above threshold`);
    }
    console.log(`\nStrong types:`);
    for (const t of plan.strongTypes) console.log(`  ✓ ${t}`);
    console.log(`\nConfidence adjustments:`);
    const confAdj = Object.entries(plan.confidenceAdjustments);
    if (confAdj.length > 0) {
      for (const [type, adj] of confAdj) console.log(`  ${type}: ${adj.delta > 0 ? '+' : ''}${adj.delta}%  — ${adj.reason}`);
    } else {
      console.log(`  None required`);
    }
    if (plan.rankingAdjustments) {
      console.log(`\nRanking weight update:`);
      const r = plan.rankingAdjustments;
      console.log(`  Urgency ${r.urgencyWeight} · Impact ${r.impactWeight} · Confidence ${r.confidenceWeight} · TimeSaved ${r.timeSavedWeight}`);
      console.log(`  Reason: ${r.reason}`);
    }
    console.log(`\nMaturity-gated advice:`);
    for (const a of plan.maturityAdvice) console.log(`  → ${a}`);
    console.log(`\n${plan.summary}`);
  }

  sep('Learning Engine CLI — Complete');
  console.log(`API server: npm run learning:api (port 3006)\n`);
}

run().catch(e => { console.error(e); process.exit(1); });
