/**
 * AI Brain — Coach Learning Layer (M19)
 *
 * Public barrel for the learning module.
 * The AI namespace in ai-brain/index.js exposes:
 *
 *   AI.coachProfile.get(coachId)                  — full profile
 *   AI.coachProfile.record(coachId, event, opts)  — append event, return new profile
 *   AI.coachProfile.replay(coachId, observations) — rebuild profile from history
 *   AI.coachProfile.preferences(coachId)          — derived preferences only
 *   AI.coachProfile.snapshot(coachId)             — lightweight summary
 *   AI.coachProfile.explain(coachId)              — confidence report per preference
 *
 * Products may call AI.coachProfile.get() / AI.coachProfile.preferences()
 * to read the profile. They must NEVER call AI.coachProfile.record() —
 * only the Learning Engine route (via AI.learn()) should write.
 */

export {
  // Pure functions — fully testable without a store
  recordEvent, recordEvents, replayProfile,
  isFlagEnabled, createObservation,
  // Store operations
  getProfile, saveProfile, recordAndSave, replayAndSave, _clear,
} from './learning-engine.js'

export {
  extractSignals, extractPreferences, derivePreference,
  extractSquadRotation, extractRecommendationHistory, extractPlayerSelections,
} from './preference-extractor.js'

export {
  scoreOverall, explainConfidence, buildConfidenceReport,
} from './confidence-scorer.js'

export {
  createProfile, emptyPreference, emptyPreferences,
  emptyRecommendationHistory, validateProfile, trimObservations,
} from './coach-profile.js'

export {
  LEARNING_VERSION, LEARNING_FLAG, PROFILE_FLAG,
  EVENT_TYPE, PREFERENCE_KEY,
  COACHING_STYLE, TRAINING_EMPHASIS, SQUAD_ROTATION,
  COMMUNICATION_STYLE, RISK_TOLERANCE, WORKLOAD_PREFERENCE,
  CONFIDENCE_SATURATION, PREFERENCE_SATURATION,
  MIN_OBSERVATIONS_FOR_SIGNAL, RECENT_ACTIONS_LIMIT,
  MAX_EVIDENCE_REFS, MAX_OBSERVATIONS_STORED,
  EXPLICIT_PREFERENCE_WEIGHT,
} from './learning-types.js'
