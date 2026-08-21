// CoachEasier Performance — workout runtime aggregator (SC7).
//
// Single dynamic-import surface for the workout UI (same convention as
// exercise-catalogue.js for the library): index.html imports THIS module
// once and gets every pure workout capability. index.html stays
// integration + rendering; the modules below are the source of truth.

export {
  createWorkoutSession, startWorkout, pauseWorkout, resumeWorkout,
  abandonWorkout, recordReadiness, logSet, skipSet, setSessionNote,
  setExerciseNote, setCurrentExercise, eligibleSubstitutes,
  substituteExercise, painStopExercise, sessionProgress, nextPendingSet,
} from '../domain/workout-session.js';
export { completeWorkout, validateCompletion, detectPersonalRecords } from '../domain/workout-completion.js';
export { exposuresFromWorkout, progressionPreviewForExercise } from '../domain/workout-exposure.js';
export { platesPerSide, warmupSuggestions, BAR_WEIGHTS_KG, DEFAULT_PLATES_KG } from '../domain/plate-calculator.js';
export {
  archiveCompletedWorkout, createInitialWorkoutState, getHistory,
  normalizeWorkoutState, previousBestsFromHistory, priorExposuresForExercise,
  saveActiveSession,
} from './workout-store.js';
export { formatLoad, makeLoad, totalExternalLoad } from '../domain/load-model.js';
export { analyseReadiness } from '../domain/progression-evidence.js';
export { getDemoAssignment } from './demo-assignment.js';
export { getCatalogue, getExerciseById } from './exercise-catalogue.js';
export { PAIN_STOP_GUIDANCE, SUBSTITUTION_REQUEST_REASONS, SYNC_STATUSES, DEFAULT_REST_SEC } from '../types/workout.js';

// SC5 development context — the Core integration seam. The host supplies the
// operational group's structured developmentCategory as teamCategory; athlete
// age evidence still outranks it inside the resolver.
export { resolveDevelopmentContext, isYouthContext } from '../domain/development-context.js';
export { engineInputFromProfile } from '../domain/programme-blueprint.js';
export { TEAM_DEVELOPMENT_CATEGORIES, normalizeTeamDevelopmentCategory } from '../types/coaching.js';
