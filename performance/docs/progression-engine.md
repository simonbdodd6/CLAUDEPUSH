# Progression Engine (SC6)

Source of truth: `performance/types/progression.js` plus the domain
modules `load-model.js`, `progression-evidence.js`, `progression-rules.js`,
`progression-plan.js`. Engine version: `PROGRESSION_ENGINE_VERSION`.

## What it is

A **deterministic** engine that converts SC5 blueprints and SC4 structures
into bounded, explainable progression decisions. No language model decides
progression; same inputs produce byte-equivalent outputs (test-enforced).
No clock or randomness exists in decision logic — `asOf` and all dates are
inputs.

## The safety principle: progression is earned

- `completed session → add weight` does not exist. Progression requires
  **consecutive successful exposures** (`EXPOSURE_REQUIREMENTS`: 3 for
  new/beginner, 2 for intermediate/advanced; complexity needs 4–6).
- One PR never triggers an increase (evidence only, test-enforced).
- One failed set → repeat, not regress. One low readiness entry → no
  change. One difficult session → never a deload.
- Safety always outranks progression: pain-stop blocks everything —
  including coach force-overrides.

## Decision pipeline (precedence order)

1. Pain-stop / active restriction → `blocked` / `coach_review`
2. Coach overrides (freeze, force maintain/deload, manual target; ceilings
   recorded as caps) — never silent, never exceeded
3. Missed sessions & breaks (repeat; reduce return dose; review after
   prolonged break — never cram, never advance as if completed)
4. Deload (planned, or ≥2 accumulated signals)
5. Failure handling (single → hold; repeated → modest regress + review;
   technical → hold + technique review, a coaching call never a medical one)
6. Match proximity (SC5 MD rules: MD-1/MD/MD+1 no progression; MD-2 holds
   lower-body)
7. Readiness modifier (trend-based, anti-overreaction)
8. Evidence gate (consecutive successes ≥ required; PRs never bypass)
9. Plateau detection (repeated evidence only)
10. Complexity gates (never automatic)
11. Method progression bounded by training-age/development bounds, coach
    ceilings and equipment increments

## Inputs / outputs

Input: identity refs, SC3 exercise (record or snapshot), current
prescription (typed loads), equipment kind, classified exposure history,
readiness entries, match context, athlete context (development context,
training age, technical confidence, supervision), restrictions, coach
overrides, phase, deload/plateau counters, `asOf`.

Output: a `progression_decision` carrying outcome (17 controlled values),
source + proposed prescriptions, reason codes, evidence summary,
constraints applied (bounds/caps/overrides), development context, match
context, flags with severities, `requiresReview`, engine version — fully
reconstructable (see progression-audit-and-versioning.md).

`buildProgressionPlan` assembles session decisions, applies the
programme-wide progression budget, and returns a plan that is explicitly
**not a completed workout and not a published programme**.

## SC7 boundary

SC6 produces plans and can write approved plans into SC4 DRAFT versions.
Orchestration (when plans are generated, approved, published, assigned),
workout execution, set logging, analytics and all UI belong to SC7+.
