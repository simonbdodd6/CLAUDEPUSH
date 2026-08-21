# Workout → Progression (SC6 Integration) (SC7)

Source of truth: `performance/domain/workout-exposure.js`.

## Exposure records (SC6 evidence)

`exposuresFromWorkout(completedWorkout)` produces one SC6-classified
exposure per exercise log: set results mapped onto the SC6 failure
taxonomy, rep/effort targets from the prescription, plus provenance
(sourceWorkoutId, programmeId, programmeVersionId, prescription, actuals,
technique input). Eligibility rules: pain-stop → excluded (`pain_stop`);
fully skipped → excluded (`skipped`, classified missed); technical
failure → excluded; warm-up sets never counted; substituted work produces
an exposure for the SUBSTITUTE flagged `comparableToOriginal: false`.

## Progression preview

`progressionPreviewForExercise` appends the fresh exposure to prior
history and calls SC6 `decideProgression` — display only. The summary
labels results "pending — nothing is published automatically"; the UI
never calls `applyPlanToProgrammeDraft`, never mutates a programme and
never publishes (test-guarded). Youth ceilings, match-week holds,
equipment-increment logic and pain blocks all flow through unchanged
(Scenarios C, E, I, J). SC6 remains authoritative; the UI computes
nothing itself.
