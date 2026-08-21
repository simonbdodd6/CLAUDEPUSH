# Workout Persistence & Offline (SC7)

Source of truth: `performance/services/workout-store.js`; inline
fail-safe mirror `perfNormalizeWorkoutState` in index.html (lockstep
test-verified).

## Namespace

`state.performanceWorkout = {stateVersion, active, history[], syncQueue[],
syncStatus}` rides the app's existing localStorage persistence. Malformed,
foreign or future-versioned data fails safely to an empty state; valid
active sessions and history survive JSON round-trips (recovery test-
proven).

## Ordering guarantee

`archiveCompletedWorkout` writes history FIRST and clears the active
recovery state only afterwards — completed work can never be lost to
ordering, and a non-completed workout is refused.

## Offline honesty

The prototype persists on-device only. Completed workouts join
`syncQueue` with `syncStatus: 'pending'`; the UI always shows
"Saved on device" / "sync pending" and NEVER claims "Synced" — no
production sync exists yet. The queue + status fields are the future
API-sync seam; no production API or migration ships in SC7.
