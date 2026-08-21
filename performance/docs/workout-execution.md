# Workout Execution (SC7)

Source of truth: `performance/domain/workout-session.js` + the
`workout-runtime.js` aggregator (single dynamic import for the UI).
index.html is integration + rendering only.

## Lifecycle

not_started → in_progress ⇄ paused → completed | abandoned |
stopped_for_review (pain during the session). Every transition is audited
(`workout_started/paused/resumed`, `set_completed/failed/skipped`,
`exercise_substituted`, `exercise_stopped_pain`, `session_completed/
abandoned`, `readiness_recorded`) with a capped log — enough to
reconstruct the session without noise.

## The flow

Today's Workout (session title, purpose, programme/phase/week, duration,
match proximity, exercise count, honest demo label, Start) → optional
readiness check-in (SC2 wellness scales; bounded, non-medical adjustment
text like "optional extras are worth skipping"; never "you are injured")
→ active workout (one-hand 390px UI: exercise tabs, cues from the live
catalogue, previous performance, per-set prescribed text + editable
actuals, Done/Skip, notes, substitution, Pain/Stop, sticky rest timer,
plate calculator for straight-bar work, warm-up suggestions clearly
labelled provisional) → finish (validation; >25% unfinished prescribed
work requires confirmation; leftovers recorded as skipped, never silently
completed) → summary (honest work counts, PRs as achievements, pain/review
flags, SC6 progression previews labelled pending) → immutable history.

## Player vs coach responsibility

Players edit ACTUAL load/reps/RPE/duration, notes, allowed substitutions
and completion state. They can never edit source prescriptions, historical
programme versions, exercise definitions, progression rules, coach
ceilings or safety restrictions — enforced by the module API surface
(logging only writes `actual`) and test-guarded in the UI region.

## Session interruption & recovery

Every meaningful change autosaves the active session through the
namespaced store (`state.performanceWorkout` → localStorage via the app's
existing persistence). Draft input values are written into `actual` on
change (status stays pending — drafts never complete a set), so an
accidental close/refresh restores the exact exercise, set, entered values
and (where practical) the running rest timer. Completed work is never
lost.

## SC8 boundary

Scheduling/orchestration, coach assignment tooling, production API sync,
analytics beyond the session summary, and any AI remain out of scope.
