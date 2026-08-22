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

// SC8 — programme assignment: lifecycle, calendar resolution and the
// blueprint→SC4 authoring seam. The host resolves Today from a PINNED
// assignment snapshot, never from a live programme definition.
export {
  createAssignment, activateAssignment, pauseAssignment, resumeAssignment,
  completeAssignment, cancelAssignment, markReplaced, canTransition,
  effectiveStatus, isLiveToday, programmePosition, programmeWeekCount,
  orderedWeeks, weekdayOf, sessionForDate, weekPlan, occupyingAssignments,
  planAssignmentConflict, validateAssignmentRequest, attachProgressionSuggestion,
  reviewProgressionSuggestion, daysBetween, parseDate, catalogueFromSnapshot,
} from '../domain/programme-assignment.js';
export { programmeDraftFromBlueprint, chooseTrainingDays } from '../domain/blueprint-to-programme.js';
export { generateBlueprint, validateBlueprint } from '../domain/programme-blueprint.js';
export { validateProgrammeVersion, validateProgramme } from '../domain/programme.js';
export { publishProgrammeVersion, beginEdit, snapshotForProgrammeAssignment } from '../domain/programme-versioning.js';
export { COLLECTIONS } from './exercise-collections-catalogue.js';
export {
  ASSIGNMENT_STATUSES, LIVE_ASSIGNMENT_STATUSES, OCCUPYING_ASSIGNMENT_STATUSES,
  TERMINAL_ASSIGNMENT_STATUSES, ASSIGNMENT_SOURCES,
} from '../types/assignment.js';

// SC8 — the athlete AUTHORING PROFILE: the small, coach-readable projection of
// an SC2 profile. Coach authoring consumes this and never a full profile.
export {
  authoringProfileFrom, authoringProfileUsable, missingAuthoringInputs,
  engineInputFromAuthoringProfile, AUTHORING_PROFILE_VERSION,
  FORBIDDEN_PROFILE_SECTIONS,
} from '../domain/authoring-profile.js';
