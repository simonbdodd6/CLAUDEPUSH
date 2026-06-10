/**
 * Prediction Accuracy
 *
 * Classic information retrieval metrics per recommendation type:
 *   Precision  = TP / (TP + FP)   — of all fired recommendations, how many were right
 *   Recall     = TP / (TP + FN)   — of all real events, how many did we catch
 *   F1         = harmonic mean of precision and recall
 *   Specificity = TN / (TN + FP)  — how well we avoid false alarms
 *
 * Mapping from outcome types:
 *   TP: INTERVENTION_SUCCESSFUL, PREDICTION_CORRECT (coach ignored → outcome happened as predicted)
 *   FP: PREDICTION_WRONG (fired, but outcome did NOT happen)
 *   FN: FALSE_NEGATIVE (outcome happened without a recommendation)
 *   TN: implicit — estimated from observation cadence
 */

import { loadOutcomes } from './learning-store.js';
import { OUTCOME_TYPE } from './outcome-tracker.js';

function classify(o) {
  if (o.outcomeType === OUTCOME_TYPE.INTERVENTION_SUCCESSFUL ||
      o.outcomeType === OUTCOME_TYPE.PREDICTION_CORRECT)    return 'TP';
  if (o.outcomeType === OUTCOME_TYPE.PREDICTION_WRONG ||
      o.outcomeType === OUTCOME_TYPE.INTERVENTION_INEFFECTIVE) return 'FP';
  if (o.outcomeType === OUTCOME_TYPE.FALSE_NEGATIVE)        return 'FN';
  return 'OTHER';
}

function metricsFromCounts(tp, fp, fn, tn = 0) {
  const precision    = tp + fp > 0 ? tp / (tp + fp)       : null;
  const recall       = tp + fn > 0 ? tp / (tp + fn)       : null;
  const f1           = precision != null && recall != null && (precision + recall) > 0
                       ? 2 * precision * recall / (precision + recall) : null;
  const specificity  = tn + fp > 0 ? tn / (tn + fp) : null;
  const accuracy     = tp + fp + fn + tn > 0 ? (tp + tn) / (tp + fp + fn + tn) : null;

  function pct(v) { return v == null ? null : Math.round(v * 100); }
  return {
    tp, fp, fn, tn,
    precision:   pct(precision),
    recall:      pct(recall),
    f1:          pct(f1),
    specificity: pct(specificity),
    accuracy:    pct(accuracy),
  };
}

function grade(f1) {
  if (f1 == null) return 'N/A';
  if (f1 >= 85)   return 'A';
  if (f1 >= 75)   return 'B';
  if (f1 >= 65)   return 'C';
  if (f1 >= 50)   return 'D';
  return 'F';
}

export function getPredictionAccuracy() {
  const outcomes  = loadOutcomes();
  const byType    = {};

  for (const o of outcomes) {
    const k = o.recommendationType;
    byType[k] = byType[k] ?? { tp: 0, fp: 0, fn: 0 };
    const c = classify(o);
    if (c === 'TP') byType[k].tp++;
    else if (c === 'FP') byType[k].fp++;
    else if (c === 'FN') byType[k].fn++;
  }

  const typeMetrics = Object.entries(byType).map(([type, counts]) => {
    const m = metricsFromCounts(counts.tp, counts.fp, counts.fn);
    return {
      type,
      sampleSize: counts.tp + counts.fp + counts.fn,
      grade:      grade(m.f1),
      ...m,
    };
  }).sort((a, b) => (b.f1 ?? 0) - (a.f1 ?? 0));

  const totalTP = typeMetrics.reduce((s, t) => s + t.tp, 0);
  const totalFP = typeMetrics.reduce((s, t) => s + t.fp, 0);
  const totalFN = typeMetrics.reduce((s, t) => s + t.fn, 0);
  const overall  = metricsFromCounts(totalTP, totalFP, totalFN);

  return {
    overall: { ...overall, grade: grade(overall.f1) },
    byType: typeMetrics,
    topPerformer:    typeMetrics[0] ?? null,
    bottomPerformer: typeMetrics[typeMetrics.length - 1] ?? null,
    totalOutcomes:   outcomes.length,
  };
}

export function getAccuracyTrend(buckets = 4) {
  const outcomes = loadOutcomes();
  if (outcomes.length < buckets) return [];

  const perBucket = Math.floor(outcomes.length / buckets);
  return Array.from({ length: buckets }, (_, i) => {
    const slice = outcomes.slice(i * perBucket, (i + 1) * perBucket);
    let tp = 0, fp = 0, fn = 0;
    for (const o of slice) {
      const c = classify(o);
      if (c === 'TP') tp++;
      else if (c === 'FP') fp++;
      else if (c === 'FN') fn++;
    }
    const m = metricsFromCounts(tp, fp, fn);
    return {
      bucket:     i + 1,
      label:      `Period ${i + 1}`,
      sampleSize: slice.length,
      f1:         m.f1,
      precision:  m.precision,
      recall:     m.recall,
      grade:      grade(m.f1),
    };
  });
}

export function getWeakestTypes(threshold = 65) {
  const acc = getPredictionAccuracy();
  return acc.byType.filter(t => t.f1 != null && t.f1 < threshold);
}

export function getStrongestTypes(threshold = 75) {
  const acc = getPredictionAccuracy();
  return acc.byType.filter(t => t.f1 != null && t.f1 >= threshold);
}
