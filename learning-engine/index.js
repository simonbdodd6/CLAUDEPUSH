/**
 * Learning Engine — public exports
 *
 * Provides the surface area consumed by:
 *   - assistant-core (calibrated recommendations)
 *   - learning-api (HTTP endpoints)
 *   - learning-cli (test runner)
 */

export { recordOutcome, getOutcomeSummary, getRecentOutcomes, seedMockOutcomes, COACH_DECISION, OUTCOME_TYPE }
  from './outcome-tracker.js';

export { calibrateTypeConfidence, calibrateAllTypes, getCalibrationSummary, applyCalibration }
  from './confidence-calibrator.js';

export { getPredictionAccuracy, getAccuracyTrend, getWeakestTypes, getStrongestTypes }
  from './prediction-accuracy.js';

export { runMonthlyFeedback, getFeedbackHistory, getMonthlyTrend, generateFeedbackReport }
  from './feedback-loop.js';

export { computeClubIntelligenceScore, buildClubProfile, getStoredProfile }
  from './club-intelligence-model.js';

export { generateImprovementPlan, getAutoApplyDeltas }
  from './self-improvement.js';

export { saveOutcome, loadOutcomes, saveClubProfile, loadClubProfile }
  from './learning-store.js';
