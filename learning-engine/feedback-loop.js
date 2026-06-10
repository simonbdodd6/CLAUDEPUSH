/**
 * Feedback Loop
 *
 * Monthly snapshot that answers:
 *   1. Overall prediction accuracy (precision / recall / F1)
 *   2. False positive rate by recommendation type
 *   3. False negative rate by recommendation type
 *   4. Coach acceptance rate (ACCEPTED + AUTO) / total
 *   5. Automation success rate (AUTO worked) / total_auto
 *   6. Time saved (estimated based on outcomes resolved)
 *
 * Snapshots are stored in data/feedback.jsonl.
 * The self-improvement engine reads them to trigger re-calibration.
 */

import { loadOutcomes, saveFeedback, loadFeedback } from './learning-store.js';
import { getPredictionAccuracy, getAccuracyTrend } from './prediction-accuracy.js';
import { getCalibrationSummary } from './confidence-calibrator.js';
import { OUTCOME_TYPE } from './outcome-tracker.js';

const TIME_SAVED_BY_TYPE = {
  ATTENDANCE_DECLINE:     30,
  INJURY_POSITION_CRISIS: 60,
  VOLUNTEER_GAP:          45,
  APPROVAL_BACKLOG:       20,
  MEMBERSHIP_EXPIRY:      15,
  COMMUNICATION_GAP:      25,
  PLAYER_OVERLOAD:        40,
  WEATHER_RISK:           20,
};

function estimateTimeSaved(outcomes) {
  let totalMinutes = 0;
  for (const o of outcomes) {
    if (o.outcomeType === OUTCOME_TYPE.INTERVENTION_SUCCESSFUL) {
      totalMinutes += TIME_SAVED_BY_TYPE[o.recommendationType] ?? 20;
    }
    if (o.outcomeType === OUTCOME_TYPE.PREDICTION_CORRECT && o.coachDecision === 'AUTO') {
      totalMinutes += TIME_SAVED_BY_TYPE[o.recommendationType] ?? 15;
    }
  }
  return totalMinutes;
}

export function runMonthlyFeedback(yearMonth = null) {
  const label    = yearMonth ?? new Date().toISOString().slice(0, 7);
  const outcomes = yearMonth
    ? loadOutcomes(500).filter(o => (o.savedAt ?? '').startsWith(yearMonth))
    : loadOutcomes(500);

  if (outcomes.length === 0) {
    return {
      period:       label,
      message:      'No outcomes in this period.',
      recommendations: 0,
    };
  }

  const total     = outcomes.length;
  const accepted  = outcomes.filter(o => ['ACCEPTED', 'AUTO'].includes(o.coachDecision)).length;
  const rejected  = outcomes.filter(o => o.coachDecision === 'REJECTED').length;
  const snoozed   = outcomes.filter(o => o.coachDecision === 'SNOOZED').length;
  const autoRuns  = outcomes.filter(o => o.coachDecision === 'AUTO').length;
  const autoWorks = outcomes.filter(o => o.coachDecision === 'AUTO' &&
    o.outcomeType === OUTCOME_TYPE.INTERVENTION_SUCCESSFUL).length;

  const accuracy  = getPredictionAccuracy();
  const timeSaved = estimateTimeSaved(outcomes);
  const calSummary = getCalibrationSummary();

  const falsePositives = outcomes.filter(o => o.outcomeType === OUTCOME_TYPE.PREDICTION_WRONG ||
    o.outcomeType === OUTCOME_TYPE.INTERVENTION_INEFFECTIVE).length;
  const falseNegatives = outcomes.filter(o => o.outcomeType === OUTCOME_TYPE.FALSE_NEGATIVE).length;

  const snapshot = {
    period:                     label,
    totalRecommendations:        total,
    acceptanceRate:              Math.round(accepted / total * 100),
    rejectionRate:               Math.round(rejected / total * 100),
    snoozeRate:                  Math.round(snoozed  / total * 100),
    automationCount:             autoRuns,
    automationSuccessRate:       autoRuns > 0 ? Math.round(autoWorks / autoRuns * 100) : null,
    falsePositives,
    falseNegatives,
    falsePositiveRate:           Math.round(falsePositives / total * 100),
    overallPrecision:            accuracy.overall.precision,
    overallRecall:               accuracy.overall.recall,
    overallF1:                   accuracy.overall.f1,
    accuracyGrade:               accuracy.overall.grade,
    timeSavedMinutes:            timeSaved,
    timeSavedHours:              Math.round(timeSaved / 60 * 10) / 10,
    averageConfidence:           calSummary.averageConfidence,
    calibrationMaturity:         calSummary.calibrationMaturity,
    bestType:                    accuracy.topPerformer?.type ?? null,
    worstType:                   accuracy.bottomPerformer?.type ?? null,
    generatedAt:                 new Date().toISOString(),
  };

  saveFeedback(snapshot);
  return snapshot;
}

export function getFeedbackHistory() {
  return loadFeedback(12);
}

export function getMonthlyTrend() {
  const history = loadFeedback(12);
  if (history.length < 2) return { trend: 'insufficient_data', periods: history.length };

  const first = history[0];
  const last  = history[history.length - 1];
  const deltaF1         = (last.overallF1 ?? 0) - (first.overallF1 ?? 0);
  const deltaAcceptance = (last.acceptanceRate ?? 0) - (first.acceptanceRate ?? 0);
  const deltaTimeSaved  = (last.timeSavedHours ?? 0) - (first.timeSavedHours ?? 0);

  return {
    periods:                   history.length,
    f1Improvement:             deltaF1,
    acceptanceRateChange:      deltaAcceptance,
    timeSavedGrowth:           Math.round(deltaTimeSaved * 10) / 10,
    trend:                     deltaF1 > 5 ? 'strongly_improving'
                             : deltaF1 > 0 ? 'improving'
                             : deltaF1 < -5 ? 'degrading'
                             : 'stable',
    fromPeriod:  first.period,
    toPeriod:    last.period,
    firstF1:     first.overallF1,
    latestF1:    last.overallF1,
  };
}

export function generateFeedbackReport() {
  const history    = loadFeedback(12);
  const latest     = history[history.length - 1] ?? runMonthlyFeedback();
  const trend      = getMonthlyTrend();
  const accuracy   = getPredictionAccuracy();
  const accTrend   = getAccuracyTrend(4);

  return {
    latestSnapshot:  latest,
    monthlyTrend:    trend,
    overallAccuracy: accuracy.overall,
    byType:          accuracy.byType,
    accuracyOverTime: accTrend,
    historyCount:    history.length,
  };
}
