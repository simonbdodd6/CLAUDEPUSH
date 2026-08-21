# Progression-Rule Review Requirements (SC6)

Every numeric table and threshold in the SC6 engine ships as a beta
default marked **PROVISIONAL_REQUIRES_SNC_REVIEW**, and every decision and
plan carries the always-on `progression_rules_provisional` flag. Passing
automated tests is NOT professional S&C validation, and the product must
not present these rules as validated until qualified review is recorded.

## Tables requiring qualified S&C review

| Table | Where | Also needs |
|---|---|---|
| Baseline set/rep/effort mappings (`BASE_SETS_BY_VOLUME`, `BASE_SCHEME_BY_INTENSITY`, durations) | progression-rules.js | safeguarding (youth rows) |
| Volume/intensity category mappings consumed from SC5 | coaching-rules.js (SC5) + progression-rules.js | safeguarding |
| e1RM formula policy (`E1RM_FORMULAS`, confidence rules) | types/progression.js + load-model.js | — |
| Successful-exposure thresholds (`EXPOSURE_REQUIREMENTS`, method overrides) | types/progression.js | — |
| Load-increase bounds (`LOAD_INCREASE_BOUNDS`, `TIME_DISTANCE_BOUNDS`) | types/progression.js | safeguarding (youth rows), medical (youth high-load) |
| Youth progression bounds & complexity gates | types/progression.js + progression-rules.js | medical + safeguarding |
| Equipment increments (`EQUIPMENT_INCREMENTS`) | types/progression.js | — |
| Deload thresholds (`DELOAD_RULES`) and deload structure | types/progression.js + progression-rules.js | — |
| Plateau definitions (`PLATEAU_RULES`) | types/progression.js | — |
| Readiness thresholds (`READINESS_RULES`) and modifier actions | types/progression.js + progression-evidence.js | medical (pain adjacency) |
| Break rules (`BREAK_RULES`) incl. exposure-continuity `streakGapDays` | types/progression.js + progression-evidence.js | — |
| Implement-load convention (per-implement values, `totalExternalLoad`) and per-implement increments | load-model.js + types/progression.js | — |
| Manual-target clamping (youth per-step ceiling, safety ceilings) | progression-rules.js | medical + safeguarding (youth rows) |
| Match-week progression modifiers | progression-rules.js (consuming SC5 tables) | — |
| Programme-wide progression budget (`PROGRESSION_BUDGET`) | types/progression.js | — |

## Medical / safeguarding review required

- Pain-stop routing (blocking behaviour and wording) — medical.
- All youth high-load / high-skill progression behaviour (bounds,
  supervision gates, complexity gates) — medical + safeguarding.
- Any future neck/contact progression rules — medical + safeguarding
  (SC6 inherits SC3/SC5 gating; no neck-specific progression tables exist
  yet).

## Process

A qualified reviewer signs off each table (reviewer + date recorded,
lifting the marker for that table) or amends values. Until then every
surface showing progression output must carry the beta status — the
`progression_rules_provisional` flag exists for exactly this.
