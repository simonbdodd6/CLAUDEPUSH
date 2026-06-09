/**
 * Club Intelligence Model
 *
 * Tracks how well Coach's Eye has learned the specific patterns of THIS club.
 * Each club has distinct rhythms: when their volunteers disappear, which months
 * attendance dips, which position groups get injured. The more outcomes we see,
 * the more club-specific the predictions become.
 *
 * Coaching Intelligence Score (CIS): 0–100
 *   0–20:  Cold start — using generic models only
 *   21–40: Early learning — first season patterns emerging
 *   41–60: Calibrating — club-specific adjustments active
 *   61–80: Well-calibrated — reliable club-specific predictions
 *   81–95: Expert — highly tuned, predictive months in advance
 *
 * The score is a weighted composite:
 *   sampleDepth          (30%) — how many outcomes has the club generated
 *   predictionAccuracy   (30%) — F1 score across all types
 *   acceptanceRate       (20%) — how much the coach trusts the platform
 *   calibrationMaturity  (20%) — EMA convergence quality
 */

import { loadOutcomes, loadClubProfile, saveClubProfile } from './learning-store.js';
import { getPredictionAccuracy } from './prediction-accuracy.js';
import { getCalibrationSummary } from './confidence-calibrator.js';
import { loadFeedback } from './learning-store.js';

const MATURITY_SAMPLE_TARGET = 100;

function sampleDepthScore(n) {
  if (n >= MATURITY_SAMPLE_TARGET) return 100;
  return Math.round((n / MATURITY_SAMPLE_TARGET) * 100);
}

function acceptanceScore(history) {
  if (history.length === 0) return 50;
  const latest = history.slice(-6);
  const avg    = latest.reduce((s, h) => s + (h.acceptanceRate ?? 50), 0) / latest.length;
  return Math.round(avg);
}

function calibrationMaturityScore(maturity) {
  return { COLD_START: 10, EARLY_LEARNING: 35, CALIBRATING: 65, MATURE: 90 }[maturity] ?? 10;
}

export function computeClubIntelligenceScore() {
  const outcomes   = loadOutcomes();
  const accuracy   = getPredictionAccuracy();
  const calSummary = getCalibrationSummary();
  const history    = loadFeedback(6);

  const n                  = outcomes.length;
  const depthScore         = sampleDepthScore(n);
  const f1Score            = accuracy.overall.f1 ?? 50;
  const acceptance         = acceptanceScore(history);
  const calScore           = calibrationMaturityScore(calSummary.calibrationMaturity);

  const cis = Math.round(
    depthScore  * 0.30 +
    f1Score     * 0.30 +
    acceptance  * 0.20 +
    calScore    * 0.20
  );

  const bounded = Math.max(5, Math.min(95, cis));

  return {
    score:               bounded,
    grade:               cisGrade(bounded),
    stage:               cisStage(bounded),
    description:         cisDescription(bounded),
    components: {
      sampleDepth:       { score: depthScore,  weight: '30%', samples: n },
      predictionAccuracy:{ score: f1Score,     weight: '30%', f1: accuracy.overall.f1 },
      coachAcceptance:   { score: acceptance,  weight: '20%', rate: acceptance + '%' },
      calibration:       { score: calScore,    weight: '20%', maturity: calSummary.calibrationMaturity },
    },
    topStrengths:        strengths(accuracy, calSummary, history),
    improvementAreas:    improvementAreas(accuracy, calSummary, n, history),
    generatedAt:         new Date().toISOString(),
  };
}

function cisGrade(score) {
  if (score >= 80) return 'Expert';
  if (score >= 60) return 'Calibrated';
  if (score >= 40) return 'Learning';
  if (score >= 20) return 'Emerging';
  return 'Cold Start';
}

function cisStage(score) {
  if (score >= 80) return 'EXPERT';
  if (score >= 60) return 'CALIBRATED';
  if (score >= 40) return 'CALIBRATING';
  if (score >= 20) return 'EARLY_LEARNING';
  return 'COLD_START';
}

function cisDescription(score) {
  if (score >= 80)
    return 'Highly tuned to this club. Predictions are club-specific and arrive weeks in advance. The platform knows your patterns better than most committee members.';
  if (score >= 60)
    return 'Well-calibrated for this club. Recommendations are significantly more accurate than generic models. Coach trust is high.';
  if (score >= 40)
    return 'Club-specific adjustments are active. Early patterns have been identified. Accuracy improving month-on-month.';
  if (score >= 20)
    return 'First season patterns emerging. The platform is learning your club\'s rhythms. Generic models are being replaced by club-specific ones.';
  return 'Cold start. The platform is using generic models. Accuracy will improve rapidly with each accepted recommendation.';
}

function strengths(accuracy, calSummary, history) {
  const s = [];
  if (accuracy.overall.f1 != null && accuracy.overall.f1 >= 75)
    s.push(`${accuracy.overall.f1}% overall F1 — strong prediction accuracy`);
  if (accuracy.topPerformer?.f1 != null && accuracy.topPerformer.f1 >= 80)
    s.push(`${accuracy.topPerformer.type} is highly accurate (${accuracy.topPerformer.f1}% F1)`);
  if (calSummary.calibrationMaturity === 'MATURE')
    s.push('Confidence calibration fully converged');
  if (history.length > 0 && (history.slice(-1)[0].acceptanceRate ?? 0) >= 75)
    s.push(`High coach acceptance rate (${history.slice(-1)[0].acceptanceRate}%)`);
  if (s.length === 0)
    s.push('Collecting initial performance data');
  return s;
}

function improvementAreas(accuracy, calSummary, n, history) {
  const areas = [];
  if (n < 20)
    areas.push(`More outcome data needed (${n}/20 minimum for calibration)`);
  if (accuracy.bottomPerformer?.f1 != null && accuracy.bottomPerformer.f1 < 60)
    areas.push(`${accuracy.bottomPerformer.type} has low accuracy (${accuracy.bottomPerformer.f1}% F1) — review trigger thresholds`);
  if (history.length > 0 && (history.slice(-1)[0].automationSuccessRate ?? 100) < 70)
    areas.push(`Automation success rate below 70% — consider raising automation confidence threshold`);
  if (history.length > 0 && (history.slice(-1)[0].falsePositiveRate ?? 0) > 25)
    areas.push(`High false positive rate (${history.slice(-1)[0].falsePositiveRate}%) — reduce recommendation sensitivity`);
  if (calSummary.calibrationMaturity === 'COLD_START')
    areas.push('Accept more recommendations to build calibration baseline');
  return areas;
}

export function buildClubProfile(clubName = 'Club') {
  const cis     = computeClubIntelligenceScore();
  const outcomes = loadOutcomes();

  const typeBreakdown = {};
  for (const o of outcomes) {
    typeBreakdown[o.recommendationType] = typeBreakdown[o.recommendationType] ?? 0;
    typeBreakdown[o.recommendationType]++;
  }

  const profile = {
    clubName,
    cisScore:         cis.score,
    cisGrade:         cis.grade,
    cisStage:         cis.stage,
    totalOutcomes:    outcomes.length,
    typeBreakdown,
    components:       cis.components,
    topStrengths:     cis.topStrengths,
    improvementAreas: cis.improvementAreas,
    description:      cis.description,
    projectedScoreIn1Season: projectEndOfSeasonCIS(cis.score, outcomes.length),
    updatedAt:        new Date().toISOString(),
  };

  saveClubProfile(profile);
  return profile;
}

function projectEndOfSeasonCIS(currentCIS, currentN) {
  const projectedN = currentN + 120;
  const depthScore = sampleDepthScore(projectedN);
  const projected  = Math.round(currentCIS * 0.4 + depthScore * 0.6);
  return Math.min(92, Math.max(currentCIS, projected));
}

export function getStoredProfile() {
  return loadClubProfile();
}
