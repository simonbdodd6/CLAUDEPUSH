# Workout Data Model (SC7)

Source of truth: `performance/types/workout.js` +
`domain/workout-session.js`.

## Workout session

`workout_session` carries: schemaVersion, workoutSessionId, athleteId,
programmeId/Title, programmeVersionId, programmeAssignmentId,
sourceSessionId + frozen sourceSessionSnapshot (title/purpose/duration/
objective/phase/week), developmentContext, matchContext, optional
readiness snapshot + bounded adjustment text, status, timestamps,
currentExerciseIndex, exerciseLogs, sessionNote, reviewFlags, timer
recovery state, audit.

## Exercise log

exerciseId + pinned exerciseVersion + frozen SC3 `exerciseSnapshot`
(names, classification, prescription types, safety notes, pain-stop text)
— historical display NEVER depends on the current library record. Plus the
untouched `sourcePrescription` (full SC4 prescription node), coachingNotes,
substitution record (original id/name + substitute snapshot + reason +
timestamp + source — both preserved), status, painStop {at, guidance},
sets, restSec, exerciseNote, timings.

## Set log

`prescribed` (SC4 set fields, immutable) beside `actual` {reps, typed load
(with per-implement semantics), rpe, rir, durationSec, distanceM} +
status (pending/completed/partial/failed_effort/failed_technical/aborted/
pain_stop/skipped — mapped onto the SC6 failure taxonomy), techniqueStatus
(player/coach input; never a machine judgement), note, completedAt,
isWarmup flag (warm-ups never count as work sets).

## Demo assignment

`services/demo-assignment.js` builds the demo programme through the REAL
SC4 seam (builders → publish) so the UI executes a genuine
SC4-compatible session snapshot. Clearly isolated (`isDemo: true`,
"Demo assignment" pill); production assignment tooling replaces it later.
