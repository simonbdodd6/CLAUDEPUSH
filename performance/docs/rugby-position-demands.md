# Rugby Position Demand Model (SC5)

Source of truth: `performance/domain/position-demands.js`.
Status: **PROVISIONAL_REQUIRES_SNC_REVIEW** — every weight below is a beta
default awaiting qualified S&C review.

## Model

Each of the 13 SC2 positions (+ utility forward/back) carries a weighted
profile (0–5) across 14 qualities: max strength, relative strength,
hypertrophy, power, acceleration, max velocity, repeat sprint, aerobic,
anaerobic, contact prep, neck capacity, trunk capacity, mobility,
robustness.

Headline defaults (weights, not prescriptions): props peak on max strength
/ hypertrophy / neck / contact prep with low max-velocity emphasis; the
openside flanker peaks on repeat sprint / aerobic / contact prep; halves
and the back three peak on acceleration / max velocity / relative strength
with low neck/hypertrophy defaults; centres sit between. Utility athletes
take a balanced profile; unknown positions get the balanced default.

## Position is a prior, not a verdict

`adjustDemandsForAthlete(demands, goals)` tilts the positional prior toward
the athlete's own goals: the top three goals add +3/+2/+1 to their mapped
qualities AND floor those qualities at 4, so an individual need always
surfaces above a low positional default. Test-enforced examples:

- a **prop whose goal is acceleration** gets genuine acceleration emphasis
  in the top qualities — not "more max strength because props need
  strength";
- a **wing whose goal is maximal strength** gets max-strength emphasis.

The same seam will later accept measured deficits (assessment data) — the
adjustment API is deliberately goal/deficit-shaped rather than goal-only.

`topQualities(demands, n)` produces the deterministic priority list the
blueprint reports (ties break alphabetically).

## Goal → quality map

`GOAL_QUALITY_MAP` covers all 11 supported goals; every entry maps to valid
demand qualities (test-enforced). `position_development` maps to the
positional prior itself.
