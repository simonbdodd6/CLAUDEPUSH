# Workout History & Immutability (SC7)

Source of truth: `domain/workout-completion.js` + `services/workout-store.js`.

## Immutability guarantees

`completeWorkout` deep-freezes the finished session; the store keeps
history as values. Historical rendering uses ONLY the stored snapshots —
exercise names come from `exerciseSnapshot`, structure from
`sourceSessionSnapshot`, prescriptions from `sourcePrescription` — so
later exercise renames, programme edits or archivals can never change what
a player sees they did (byte-equivalence test-proven, Scenario H).

## History view

List: date, programme, session, completion state (Done / Review /
Abandoned), duration, set counts, PR star. Detail: per-exercise blocks
with every set exactly as logged, substitution provenance (original AND
replacement), pain-stop marks, notes.

## Completion summary

Duration, sets completed vs prescribed, average RPE, skipped work, pain
flags, substitution count, PRs (achievements with
`triggersProgression: false` — never commands), review flags. Unfinished
prescribed work is recorded as skipped — honestly, never celebrated and
never silently completed. No celebratory language attaches to overexertion.
