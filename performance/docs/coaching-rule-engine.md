# Coaching Rule Engine (SC5)

Source of truth: `performance/types/coaching.js` (vocabularies, precedence,
reason codes, review flags) plus the `performance/domain/` modules:
`development-context.js`, `position-demands.js`, `exercise-selection.js`,
`coaching-rules.js`, `programme-blueprint.js`.

## What it is

A **deterministic** rule engine that converts structured athlete context
into explainable programme decisions. No language model participates in any
decision; every rule is explicit, versioned data (`ENGINE_VERSION`). The
same input object always produces a byte-equivalent output (test-enforced).

## Inputs

Normalised engine input (see `engineInputFromProfile`, the SC2-profile
adapter): age band / DOB / team category, playing level, position, season
phase, training experience, technical confidence, goals (typed + weighted),
equipment access, available days, rugby days, match day(s), session-duration
limit, restriction tags, restriction-knowledge state, supervision
availability.

**Required:** available training days (empty → blocking flag).
**Optional with conservative fallbacks:** everything else — see
Part 17 handling in programme-blueprint.js: unknown equipment → bodyweight
assumptions + flag; unknown age/team → context `unknown` with youth-level
safeguards + review flag (never silently adult); unknown restrictions →
`restrictions_unknown` flag (never assumed clear); experience defaults to
beginner. **Never consumed at all:** strength numbers and 1RM data —
structural decisions cannot be blocked by missing testing.

## What SC5 decides

Frequency, session archetypes, block composition, movement-pattern
requirements and coverage, physical-quality priorities, exercise
eligibility + ranking + selection (validated content only), volume and
intensity **categories**, match-week placement constraints, optional-work
availability, and review/approval state.

## What SC5 never does

No kilograms, no percentage resolution, no week-to-week progression, no
recovery-week calculations, no plateau/failed-set logic, no execution or
logging, no analytics, no AI text, no medical decisions. Scope guards in
`programme-blueprint.test.js` grep both the outputs and the module sources.

## Rule precedence

`RULE_PRECEDENCE` (types/coaching.js), highest first: hard safety
restrictions → development/youth safeguards → coach restrictions → exercise
eligibility → schedule/match constraints → athlete experience → equipment →
primary goal → position requirements → season phase → secondary goal →
preferences. `outranks(a, b)` makes it queryable; eligibility gates run in
this order so a lower layer can never resurrect what a higher layer
excluded.

## Explainability

Every decision carries `{code, text}` reasons built by `reason(code,
params)` from fixed templates — deterministic, human-readable, no free
text, unknown codes throw. Exclusions, rankings, frequency, dose, context
resolution and match-week placements all explain themselves.

## Determinism guarantees

Pure modules: no clock (callers pass `now` where a date is ever needed), no
randomness, no I/O; ties in ranking break alphabetically by slug. Verified
by byte-equality tests over repeated runs.

## SC6 boundary

SC6 consumes the blueprint (see programme-blueprint.md) and the match-week
placement constraints to build progressive SC4 programme trees. It must not
re-decide anything SC5 already decided without surfacing the change.
