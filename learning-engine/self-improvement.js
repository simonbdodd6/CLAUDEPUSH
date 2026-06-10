/**
 * Self-Improvement Engine
 *
 * Reads the feedback loop and applies automatic adjustments to:
 *   1. Confidence thresholds (raise/lower per type based on FP/FN rate)
 *   2. Urgency weights (increase sensitivity for high-miss types)
 *   3. Timing adjustments (fire earlier if coach consistently needs more lead time)
 *   4. Ranking weights (boost types the coach consistently acts on)
 *   5. Wording suggestions (generic improvement hints by type)
 *
 * Changes are additive adjustments stored as a delta object, not hard overrides.
 * The assistant-core reads these deltas when generating recommendations.
 */

import { getPredictionAccuracy, getWeakestTypes, getStrongestTypes } from './prediction-accuracy.js';
import { getCalibrationSummary } from './confidence-calibrator.js';
import { getFeedbackHistory, getMonthlyTrend } from './feedback-loop.js';
import { computeClubIntelligenceScore } from './club-intelligence-model.js';

function confidenceAdjustments(accuracy) {
  const adjustments = {};
  for (const type of accuracy.byType) {
    if (type.sampleSize < 3) continue;
    if (type.precision != null && type.precision < 50) {
      adjustments[type.type] = { delta: -5, reason: `High false positive rate — reduce confidence by 5%` };
    } else if (type.precision != null && type.precision >= 80) {
      adjustments[type.type] = { delta: +5, reason: `High precision — safe to raise confidence by 5%` };
    }
  }
  return adjustments;
}

function urgencyAdjustments(accuracy) {
  const adjustments = {};
  for (const type of accuracy.byType) {
    if (type.sampleSize < 3) continue;
    if (type.recall != null && type.recall < 50) {
      adjustments[type.type] = { delta: +1, reason: `Misses ${100 - type.recall}% of real events — lower trigger threshold` };
    }
  }
  return adjustments;
}

function timingAdjustments(history) {
  const adjustments = {};
  if (history.length < 3) return adjustments;

  const avgAcceptance = history.reduce((s, h) => s + (h.acceptanceRate ?? 50), 0) / history.length;
  if (avgAcceptance < 40) {
    adjustments['ALL'] = {
      leadTimeDays: +1,
      reason: `Low acceptance rate (${Math.round(avgAcceptance)}%) may indicate recommendations arrive too late — add 1-day lead time`,
    };
  }
  return adjustments;
}

function rankingWeightAdjustments(history) {
  if (history.length < 2) return null;
  const recent = history.slice(-3);
  const avgAcceptance = recent.reduce((s, h) => s + (h.acceptanceRate ?? 50), 0) / recent.length;

  if (avgAcceptance > 70) {
    return {
      urgencyWeight:   0.42,
      impactWeight:    0.25,
      confidenceWeight: 0.20,
      timeSavedWeight: 0.13,
      reason: `High acceptance rate (${Math.round(avgAcceptance)}%) — boost urgency weight slightly`,
    };
  }
  return null;
}

function wordingSuggestions(accuracy) {
  const suggestions = [];
  for (const type of accuracy.byType) {
    if (type.sampleSize < 5) continue;
    if (type.f1 != null && type.f1 < 55) {
      suggestions.push({
        type: type.type,
        suggestion: `Low F1 (${type.f1}%) — consider restructuring the recommendation copy to be more specific and actionable`,
      });
    }
  }
  return suggestions;
}

function maturityGatedAdvice(cisScore) {
  if (cisScore >= 80) {
    return [
      'Platform is at expert level — enable proactive pre-season planning mode',
      'Consider reducing APPROVE threshold from 50% to 45% confidence for auto-classification',
      'Enable multi-week attendance predictions (14-day horizon)',
    ];
  }
  if (cisScore >= 60) {
    return [
      'Good calibration — consider enabling weather risk automation',
      'Communication gap type is well-tuned — safe to move to full AUTO',
    ];
  }
  if (cisScore >= 40) {
    return [
      'Confidence is calibrating — wait for 5 more outcomes before expanding automation',
      'Focus on accepting or rejecting recommendations (not snoozeing) for faster learning',
    ];
  }
  return [
    'Accept or act on at least 10 recommendations to move past cold start',
    'Record outcomes for rejected recommendations — this is the most valuable learning signal',
  ];
}

export function generateImprovementPlan() {
  const accuracy  = getPredictionAccuracy();
  const calSummary = getCalibrationSummary();
  const history   = getFeedbackHistory();
  const trend     = getMonthlyTrend();
  const cis       = computeClubIntelligenceScore();

  const plan = {
    generatedAt:          new Date().toISOString(),
    cisScore:             cis.score,
    cisGrade:             cis.grade,
    overallF1:            accuracy.overall.f1,
    confidenceAdjustments: confidenceAdjustments(accuracy),
    urgencyAdjustments:   urgencyAdjustments(accuracy),
    timingAdjustments:    timingAdjustments(history),
    rankingAdjustments:   rankingWeightAdjustments(history),
    wordingSuggestions:   wordingSuggestions(accuracy),
    maturityAdvice:       maturityGatedAdvice(cis.score),
    weakTypes:            getWeakestTypes(65).map(t => t.type),
    strongTypes:          getStrongestTypes(75).map(t => t.type),
    monthlyTrend:         trend.trend,
    summary:              buildSummary(accuracy, trend, cis),
  };

  return plan;
}

function buildSummary(accuracy, trend, cis) {
  const lines = [];
  if (accuracy.overall.f1 != null) {
    lines.push(`Overall prediction accuracy: ${accuracy.overall.f1}% F1 (${accuracy.overall.grade})`);
  }
  if (trend.trend !== 'insufficient_data') {
    const dir = trend.trend === 'strongly_improving' ? 'strongly improving'
              : trend.trend === 'improving' ? 'improving'
              : trend.trend === 'degrading' ? 'degrading'
              : 'stable';
    lines.push(`Accuracy trend: ${dir} over ${trend.periods} months`);
  }
  lines.push(`Club Intelligence Score: ${cis.score}/100 (${cis.grade})`);
  lines.push(cis.description);
  return lines.join('\n');
}

export function getAutoApplyDeltas() {
  const plan = generateImprovementPlan();
  return {
    confidenceDeltas:  plan.confidenceAdjustments,
    urgencyDeltas:     plan.urgencyAdjustments,
    timingDeltas:      plan.timingAdjustments,
    rankingOverride:   plan.rankingAdjustments,
  };
}
