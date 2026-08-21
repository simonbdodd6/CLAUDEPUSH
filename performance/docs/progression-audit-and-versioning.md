# Progression Audit & SC4 Versioning Integration (SC6)

Source of truth: decision assembly in `progression-rules.js` and
`applyPlanToProgrammeDraft` in `progression-plan.js`.

## Every decision is reconstructable (Part 22)

A `progression_decision` stores: engine/rule version, deterministic id,
athlete/programme/version/exercise (+ exercise version) references, the
source prescription, the proposed prescription (null when blocked), the
outcome, reason codes with fixed text, the evidence summary (exposure
counts, streaks, readiness status, PR count, method, required exposures),
constraints applied (bounds, caps, coach overrides), development context,
match context, flags with severities, `requiresReview` and `asOf`.
Decisions are values — nothing ever rewrites a previous decision.

## Coach overrides (Part 21) — two classes

**A. Decision overrides** (`force_maintain`, `force_deload`,
`manual_next_target`, `freeze_progression`) may alter normal progression.
**B. Safety ceilings** (`max_load`, `max_percentage`, `cap_sets`,
`cap_complexity`, `require_review`) only ever restrict.

A decision override can never bypass hard safety: pain-stop is checked
before any override; a manual next target is clamped by `max_load` /
`max_percentage` / `cap_sets` AND — for youth contexts — by the youth
per-step ceiling relative to the current prescription, with every clamp
recorded (`manual_clamped` reasons, `capsApplied` entries,
`youth_progression_review` flag). Test-enforced: a manual 140 kg target
for a U18 on 100 kg lands at 102.5; with a 105 kg `max_load` it lands at
105; with pain reported it is blocked entirely.

`makeCoachOverride` requires author + reason and stamps an audit record;
`activeOverrides` honours effective periods. Nothing is silent.

## Progression plans (Part 24)

`buildProgressionPlan` = ordered decisions + programme-wide budget +
aggregated flags + `coachApprovalRequired`. Explicit in data:
`isCompletedWorkout: false`, `isPublishedProgramme: false`.

**Progression Plan ≠ Completed Workout ≠ Published Programme.** Future
orchestration decides when an approved plan becomes a new programme
version.

## Programme-wide budget (Part 25)

`applyProgressionBudget` caps simultaneous progressions per session by
volume category (very_low/low 1 · moderate 2 · high 3), minus one under
rugby congestion, capped at 2 for youth. Excess progressions downgrade to
maintain with `budget_exhausted` reasons — load, reps and sets can never
all surge across every exercise at once.

## SC4 integration (Part 23)

`applyPlanToProgrammeDraft(programme, plan)`:

- refuses blocked plans;
- obtains a DRAFT via SC4 `beginEdit` (published latest → new version
  n+1; existing draft reused);
- writes only translatable fields (sets, rep ranges, absolute kg loads —
  never onto percentage-based sets — RPE targets, durations); everything
  else is reported in `skipped` for coach completion;
- appends audit entries at draft and programme level.

Published and superseded versions are frozen by SC4 and proven
byte-identical after progression is applied (test-enforced). Historical
assignment snapshots are untouched by construction. Publishing the
progressed draft remains a separate, coach-driven SC4 action.
