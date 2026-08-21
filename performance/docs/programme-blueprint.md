# Programme Blueprint (SC5)

Source of truth: `performance/domain/programme-blueprint.js`
(`generateBlueprint`, `validateBlueprint`, `engineInputFromProfile`).

## What a blueprint is

The structured, explainable, auditable output of the SC5 rule engine — the
decision layer between athlete context and the future progressive
programme.

**Programme Blueprint ≠ Published Programme.** A blueprint is a working
coaching document: it is never frozen, never published, never snapshotted
and never assignable. The blueprint module deliberately has no access to
SC4's `publishProgrammeVersion` / `snapshotForProgrammeAssignment`
(test-enforced); SC6 and later milestones transform validated blueprints
into progressive prescriptions and only then into SC4 programme versions,
which alone can be published and assigned.

Slots that no eligible exercise can satisfy stay **unresolved** on the
block (`unresolvedSlots: [{pattern, reason}]`) with a coverage-gap flag —
the engine never invents an exercise or relaxes a safety constraint to
fill a hole.

## Shape

```
{
  kind: 'programme_blueprint',
  engineVersion, provisional: true,
  input: {context, phase, experience, position, goals, availableDays, matchDay},
  developmentContext: {context, youth, safeguardsActive, source, conflicts},
  frequency,                        // 0–4 sessions
  volumeCategory,                   // very_low | low | moderate | high
  intensityCategory,                // technique | low | moderate | high
  qualityPriorities, boostedQualities,
  patternPlan: {required, recommended},
  patternCoverage: {covered, missing},
  sessions: [{slot, archetype, blocks: [{blockType, collectionRef,
    exercises: [{exerciseId, name, score, reasons}]}]}],
  matchWeek: {placements: [{day, md, avoid, prefer, reason}]},
  optionalWork, excludedCount,
  reasons: [{code, text}],
  flags: [{id, severity, label}],
  requiresReview,
}
```

## Guarantees

- **Deterministic:** same input → byte-equivalent blueprint (test-enforced
  across all scenario fixtures).
- **Categories only:** `validateBlueprint` rejects any blueprint carrying
  kg/percentage-resolution/progression keys; scope-guard tests grep both
  outputs and module sources.
- **Validated content only:** exercise picks come exclusively from SC3
  engine-eligible records, filtered for safety BEFORE ranking; a slot with
  no eligible exercise is a coverage gap flag, never an invented exercise.
- **Explainable:** every frequency/dose/context/placement/selection
  decision carries deterministic reason codes with readable text.
- **Auditable:** `beta_rules_provisional` is always present; flags carry
  severities (info / warning / requires_review / blocking) and
  `requiresReview` aggregates them.
- **Fail-safe:** zero availability produces a valid, empty, blocked
  blueprint; unknown context/equipment/restrictions produce conservative
  plans with review flags.

## Session archetypes

Nine reusable archetypes (types/coaching.js) with deterministic block plans
(`ARCHETYPE_PLANS`): warm-up/activation blocks reference SC3 collections;
strength/power/trunk blocks declare pattern slots the selector fills.
Archetype choice follows frequency × goal × phase × development context —
never a hardcoded universal programme.

## SC6 boundary

SC6 reads: frequency, sessions (archetype + block + exercise picks), dose
categories, pattern plan, match-week placements and flags — and produces
progressive SC4 trees plus concrete scheduling. It must respect
`requiresReview` and never bypass a blocking flag.
