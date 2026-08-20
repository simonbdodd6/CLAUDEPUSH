# Progression Methods (SC6)

Source of truth: `selectProgressionMethod` + `progressByMethod` in
`performance/domain/progression-rules.js`. Method selection follows the
exercise's SC3 prescription capabilities — no method is forced onto an
exercise that doesn't declare the matching prescription type.
All parameters PROVISIONAL_REQUIRES_SNC_REVIEW.

## Methods

- **Double progression** (load + rep range): reps climb inside the range
  first; load steps only after repeated top-of-range completion, and reps
  reset toward the bottom of the range. The default for loaded lifts.
- **Fixed-load rep progression**: reps (then sets) progress where equipment
  increments are too coarse or no load dimension exists.
- **Percentage-based**: +2.5% steps, only where a reliable percentage
  reference exists (never resolved silently; capped by coach
  max_percentage).
- **Effort-based (RPE/RIR)**: repeated below-target effort earns a bounded
  load step; achieved effort above target holds progression.
- **Set progression**: used when rep/load steps are unavailable and volume
  increase is appropriate; always subject to coach `cap_sets`.
- **Duration / distance / density**: +10% single-step bound
  (`TIME_DISTANCE_BOUNDS`) for isometrics, running and conditioning.
- **Complexity progression** — extremely constrained and never automatic.
  ALL gates must pass: high technical confidence, 4–6 competent
  consecutive exposures, an SC3-declared `progression` relationship,
  development-context eligibility of the target's difficulty, and
  supervision where the target is high-skill. Completing load/reps alone
  never advances complexity (test-enforced).

## Bounds (Part 11)

`LOAD_INCREASE_BOUNDS[context][experience]` — the smaller of a relative %
and an absolute kg cap per step. Adults: 2.5–5% / 2.5–5 kg by training
age; U18 ≤2.5 kg; U16 ≤1.25–2.5 kg. Youth ceilings bind regardless of
success streaks (test-enforced), and a coach `max_load`/`max_percentage`
always clamps the result.

## Equipment increments (Part 12)

`EQUIPMENT_INCREMENTS`: barbell/trap-bar 2.5 kg, dumbbells 2 kg,
kettlebells 4 kg, machine stack 5 kg; bands are ordinal and bodyweight has
no load increment. When the smallest available jump exceeds the permitted
bound the engine says so and progresses reps/sets instead — it never
forces a too-large jump and never invents a load for bodyweight/band work.
