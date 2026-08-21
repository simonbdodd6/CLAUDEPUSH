# Workout Safety (SC7)

## Pain / Stop (safety-critical)

An unmistakable "Pain / Stop" control sits on every exercise. Activating
it (with confirmation): stops the exercise, marks remaining sets
`pain_stop`, raises the `pain_stop_review` flag, records the event
permanently in history, excludes the exercise from positive progression
evidence, and blocks SC6 progression for it. The fixed guidance
(`PAIN_STOP_GUIDANCE`) is strictly non-medical: stop, don't train through
pain, flag to appropriate staff — the app cannot assess it. NO therapeutic
alternative is ever suggested; substitution for a pain-stopped exercise
throws (`pain_requires_review_not_substitution`). Unrelated exercises may
continue. Sessions containing a pain-stop complete as
`stopped_for_review`.

## Substitution boundaries

Player substitution reasons are equipment/availability/time/preference
only — pain is structurally not a reason. Candidates come from SC3
substitution rules (validated, approved, kit- and level-appropriate; no
draft/club/private leakage) and both original and replacement are
preserved in history.

## Readiness boundaries

Optional SC2 wellness scales only; no restricted health data. One entry
produces at most a gentle note; wording never claims injury, clearance or
instructs training through pain. Missing check-ins are never penalised.

## Other guards

- Timer expiry never completes a set.
- Unfinished work records as skipped, never as done.
- Warm-up suggestions are provisional, conservative, skippable and never
  required or counted.
- PRs are achievements; progression still requires SC6's repeated
  evidence.
