# Deload, Plateau, Failures & Missed Sessions (SC6)

Source of truth: `DELOAD_RULES` / `PLATEAU_RULES` / `BREAK_RULES` in
`types/progression.js` and their handling in `progression-rules.js`.
All thresholds PROVISIONAL_REQUIRES_SNC_REVIEW.

## Failed work (Part 10)

Set results: completed · partial · technical_failure · effort_failure ·
missed_target · aborted · pain_stop. The engine never guesses WHY a set
failed.

- **Single failed session** → repeat the prescription; no overreaction.
- **Repeated failures (≥2 recent)** → one modest step back (one equipment
  increment or one rep), volume untouched, `repeated_failure` review flag.
- **Technical failure** → hold + `technical_review_required`; explicitly a
  coaching call, never a medical one, never treated as injury.
- **Pain-stop** → progression `blocked`, nothing proposed, review routed;
  no therapeutic substitution ever. Outranks even coach force-overrides.

## Missed sessions & breaks (Part 16)

- One miss → repeat the same prescription. Missed work is never crammed
  and the programme never advances as if work happened.
- ≥7 days without exposure → repeat with one set trimmed.
- ≥21 days → reduced return dose + `prolonged_training_break`
  (requires review).
- A miss pauses — never resets — a success streak, BUT streaks are also
  **continuity-checked**: successes separated by more than
  `streakGapDays` (14) no longer form one progression-ready streak.
  Historical evidence stays in the totals; progression eligibility comes
  only from recent, continuous work. Two old successes + a 3-week break +
  one good return session therefore yields `repeat_exposure` with a
  `stale_streak` reason — never immediate progression (test-enforced).
  Continuity bands: gap ≤13 d continuous · 14–20 d streak restarts ·
  ≥21 d prolonged-break handling (reduced dose + review) also applies.

## Deload (Part 17)

Never from one signal and never from one hard session (test-enforced).

- **Planned** (programme phase) and **coach-forced** deloads apply
  directly.
- **Rule-triggered** deloads require ≥2 of: long accumulation
  (≥12 successful exposures since last deload), repeated failure (≥3 in
  window), sustained low readiness.
- Deload structure: −1 set, −1 RPE, −10 percentage points on
  percentage-based sets, −30% on durations. Categorical and bounded.

## Plateau (Part 18)

Defined only from repeated evidence: ≥4 unchanged exposures AND ≥2 failed
progression attempts (with adherence implied by the exposure record).
`progressionAttemptFailures` counts genuine failed attempts at an offered
progression — increment-limited holds (`equipment_increment_too_large`)
and missed sessions are NOT failed attempts, so an athlete blocked by a
coarse dumbbell jump or with poor adherence is never labelled plateaued.
The plateau gate also sits behind the evidence gate, so insufficient
recent success exits earlier as `repeat_exposure`.
Response is `coach_review` with the current prescription held — the engine
NEVER rotates exercises automatically, and a PR is never plateau evidence.
Strategy changes (rep-target change, SC3 progression relationship) are
coach decisions surfaced by the flag.
