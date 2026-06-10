/**
 * Confidence Calibrator
 *
 * Bayesian-style exponential moving average (EMA) per recommendation type.
 * After each verified outcome, adjust the type's base confidence up or down.
 *
 * Update rules:
 *   INTERVENTION_SUCCESSFUL / PREDICTION_CORRECT → boost  (+EMA step toward observed 80%)
 *   PREDICTION_WRONG / INTERVENTION_INEFFECTIVE  → reduce (+EMA step toward observed 40%)
 *   FALSE_NEGATIVE                               → boost sensitivity  (+5% on urgency weight)
 *
 * Alpha (learning rate): 0.15 per event. Chosen so a single outcome shifts
 * confidence by ~3–5%, but 10+ consistent outcomes fully converge.
 */

import { loadOutcomesByType } from './learning-store.js';
import { OUTCOME_TYPE } from './outcome-tracker.js';

const ALPHA = 0.15;
const COLD_START_CONFIDENCE = 55;
const POSITIVE_TARGET  = 82;
const NEGATIVE_TARGET  = 38;

const RECOMMENDATION_TYPES = [
  'ATTENDANCE_DECLINE',
  'INJURY_POSITION_CRISIS',
  'VOLUNTEER_GAP',
  'APPROVAL_BACKLOG',
  'MEMBERSHIP_EXPIRY',
  'COMMUNICATION_GAP',
  'PLAYER_OVERLOAD',
  'WEATHER_RISK',
];

function ema(current, target, alpha) {
  return Math.round(current * (1 - alpha) + target * alpha);
}

function classifyOutcomeSign(outcomeType) {
  if (outcomeType === OUTCOME_TYPE.INTERVENTION_SUCCESSFUL ||
      outcomeType === OUTCOME_TYPE.PREDICTION_CORRECT) return 'positive';
  if (outcomeType === OUTCOME_TYPE.PREDICTION_WRONG ||
      outcomeType === OUTCOME_TYPE.INTERVENTION_INEFFECTIVE) return 'negative';
  return 'neutral';
}

export function calibrateTypeConfidence(type) {
  const outcomes = loadOutcomesByType(type);
  if (outcomes.length === 0) {
    return {
      type,
      confidence:       COLD_START_CONFIDENCE,
      sampleSize:       0,
      trend:            'insufficient_data',
      calibrationNote:  'Cold start — using prior of 55%',
    };
  }

  let confidence = COLD_START_CONFIDENCE;
  let positive   = 0;
  let negative   = 0;
  let falseNeg   = 0;

  for (const o of outcomes) {
    const sign = classifyOutcomeSign(o.outcomeType);
    if (sign === 'positive') { confidence = ema(confidence, POSITIVE_TARGET, ALPHA); positive++; }
    else if (sign === 'negative') { confidence = ema(confidence, NEGATIVE_TARGET, ALPHA); negative++; }
    else if (o.outcomeType === OUTCOME_TYPE.FALSE_NEGATIVE) falseNeg++;
  }

  const n         = outcomes.length;
  const accuracy  = positive / (positive + negative || 1);
  const trend     = positive > negative * 1.5 ? 'improving'
                  : negative > positive * 1.5 ? 'degrading'
                  : 'stable';

  confidence = Math.max(25, Math.min(92, confidence));

  return {
    type,
    confidence,
    sampleSize:      n,
    positiveOutcomes: positive,
    negativeOutcomes: negative,
    falseNegatives:  falseNeg,
    observedAccuracy: Math.round(accuracy * 100),
    trend,
    calibrationNote: n < 5 ? 'Limited data — treat with caution'
                   : n < 10 ? 'Emerging signal'
                   : n < 20 ? 'Moderate confidence in calibration'
                   : 'Well-calibrated',
  };
}

export function calibrateAllTypes() {
  return RECOMMENDATION_TYPES.map(calibrateTypeConfidence);
}

export function getCalibrationSummary() {
  const calibrations = calibrateAllTypes();
  const sorted       = [...calibrations].sort((a, b) => b.confidence - a.confidence);
  const avg          = Math.round(calibrations.reduce((s, c) => s + c.confidence, 0) / calibrations.length);
  const totalSamples = calibrations.reduce((s, c) => s + c.sampleSize, 0);

  return {
    averageConfidence:   avg,
    totalOutcomesSeen:   totalSamples,
    mostAccurateType:    sorted[0],
    leastAccurateType:   sorted[sorted.length - 1],
    calibrations:        sorted,
    calibrationMaturity: totalSamples < 10 ? 'COLD_START'
                        : totalSamples < 30 ? 'EARLY_LEARNING'
                        : totalSamples < 80 ? 'CALIBRATING'
                        : 'MATURE',
  };
}

export function applyCalibration(recommendation) {
  const cal = calibrateTypeConfidence(recommendation.type);
  if (cal.sampleSize < 3) return recommendation;

  const originalConf = recommendation.confidence;
  const adjustment   = Math.round((cal.confidence - COLD_START_CONFIDENCE) * 0.4);
  const newConf      = Math.max(25, Math.min(95, originalConf + adjustment));

  return {
    ...recommendation,
    confidence:          newConf,
    calibrationApplied:  adjustment !== 0,
    calibrationDelta:    adjustment,
    originalConfidence:  originalConf,
    calibrationSource:   `${cal.sampleSize} prior outcomes (${cal.observedAccuracy}% accurate)`,
  };
}
