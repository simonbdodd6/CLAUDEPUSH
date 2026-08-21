# Exercise Substitution Rules (SC3)

Source of truth: `performance/domain/exercise-substitution.js`; tested in
`performance/tests/exercise-substitution.test.js`.

## Supported substitution reasons

regression · progression · equipment · pattern · lower_skill · lower_impact ·
time_saving · bodyweight · coach_custom

Declared relationships on the exercise record always rank first; structural
matches fill in after them.

## Compatibility constraints (all structural, none medical)

A candidate is compatible when ALL hold (or the pair is a declared
relationship):

1. same primary movement pattern (or lists it as secondary),
2. shares the original's primary physical quality (primary or secondary),
3. at least one common prescription type,

and it survives the requested constraints:

- **equipment** — `equipmentGap(candidate, athleteEquipment).missing` empty,
- **technical level** — candidate difficulty ≤ athlete level,
- **impact tolerance** — candidate impact ≤ tolerance,
- **session intent** — category preserved when requested,
- **restriction tags** — candidates carrying an active restriction tag are
  excluded (exclusion is the ONLY behaviour; nothing is selected *because*
  of a tag),
- **visibility** — `canViewExercise` for the requesting viewer; unapproved,
  archived, draft, other-club and other-coach-private content never appears.

## What substitution is NOT

- **Not medical.** A pain report routes to `painReportRouting()` →
  `stop_and_review` with no substitute and no "therapeutic" pick. The SC2
  clearance-review rules own that path.
- **Not automatic prescription.** SC3 returns ranked candidates for humans
  (and later the engine) to choose from; nothing is auto-applied.
- **Not rehabilitation.** No return-to-play or rehab protocols exist
  anywhere in the module.

## Coach-approved custom substitutions

`coach_custom` is reserved for explicit coach picks recorded at assignment
time (SC4+); the rules above never generate it.
