# brain-decision-planner — Read-Only Boundary Architecture Map

> **Status: DORMANT.** This package defines the **read-only boundary** at which a future Coach's Eye
> Premium integration would feed real data into the Brain. It is **not imported by Core or the app**,
> changes **no Core code and no Brain engine**, runs **no AI, no live recommendations, no pipeline in
> production**, and performs **no UI, database, network, persistence, clock or randomness**. Every
> function is pure and deterministic, validates its inputs, and returns deeply-frozen output. It is
> proven entirely by tests; nothing is wired into the live product.

Milestones covered: **M164–M172** (the two contracts, two mappers, two integration harnesses, the
unified facade, the snapshot helper, and the boundary→squad capstone).

---

## 1. Package purpose

`brain-decision-planner` is the **intelligence-side read boundary** for the dormant AI Brain. It (and
its sibling boundary in `coach-core-adapter`) describe — as *documentation-as-code contracts* — the
provider interface a Premium feature must implement to supply real data, and the pure mappers that
turn those providers into the inputs the proven selection/intelligence pipeline already consumes.

## 2. Why this package exists

The Brain engines (`coach-memory` M108–M117, `coach-intelligence` M118–M131) and the Core→Brain
adapter (`coach-core-adapter` M132–M162) are complete and proven, but they run on adapter-supplied /
test data. To eventually run on *real* Core data **without touching Core and without turning anything
on**, there must be a single, validated, side-effect-free boundary at which data enters. This package
is that boundary: two read-only contracts (squad data + decision/planning context), the mappers that
shape provider output into pipeline inputs, a facade that unifies them, and harnesses that prove the
whole thing composes — all dormant.

## 3. The read-only boundary architecture

```
 PREMIUM PROVIDERS (future, read-only)        BOUNDARY (dormant/pure)                       PROVEN PIPELINE (unchanged)
 ─────────────────────────────────────        ───────────────────────                       ───────────────────────────
 squadLoader  ─────────────────────► M164 contract ─► M165 loaderToSelectionInputs ─┐
   getActivePlayers / Availability /            (coach-core-adapter)                 │
   CoachMemories / PlayerTags                                                        │
                                                                                     ├─► M170 buildBrainInputs ─► { squadInput, decisionInput }
 decisionPlanSource ───────────────► M167 contract ─► M168 mapDecisionPlanContext ──┤        │
   getFixtureContext / CoachIdentity            ─► M135 buildDecisionPlanContext     │        │
                                                ─► M140 completeIntelligenceInput    │        ▼
                                                   (= M169 completeDecisionPlanningInput)   M171 summarizeBrainInputs (snapshot)
                                                                                              │
                                              M172 runBoundarySquadCapstone:                  ▼
                                                squadInput → M132 candidates + M133 formation,
                                                decisionInput → plan/decision,
                                                → M137 runPipelineBridge → M118 → M119 → M131 → MATCH-DAY SQUAD
```

Two independent read boundaries (selection/squad + decision/planning) converge in M170, are
describable via M171, and are proven end-to-end to a squad in M172.

## 4. Selection side (lives in `coach-core-adapter`)

- **M164 — Core squad loader contract** (`createCoreSquadLoaderContract`): documentation-as-code
  describing + validating a provider with `getActivePlayers`, `getAvailabilityResponses`,
  `getCoachMemories`, `getPlayerTags`. Shape-only `validate(provider)` — never invokes the provider.
- **M165 — loader → selection inputs** (`loaderToSelectionInputs`): validates the provider (M164),
  calls each accessor once, and returns a frozen `{ players, availability, memories, playerTags }`
  (accessor results deep-copied, so provider data is never mutated/frozen).
- **M166 — selection boundary proof** (test): an in-memory M164 provider → M165 → `assembleSelectionInputs`
  (M160) → a populated `SelectionInputs` DTO.

## 5. Decision-planning side (this package)

- **M167 — decision plan source contract** (`createDecisionPlanSourceContract`): the M164 sibling —
  describes + validates a provider with `getFixtureContext`, `getCoachIdentity`. Shape-only validator,
  never invokes the provider.
- **M168 — decision plan context mapper** (`mapDecisionPlanContext`): validates (M167), reads both
  accessors once, returns a frozen `{ fixture, match, coachContext }` (deep-copied; no transformation,
  no derived fields, no IDs/timestamps).
- **M169 — intelligence boundary harness** (`completeDecisionPlanningInput`): orchestrates
  M168 → M135 `buildDecisionPlanContext` → M140 `completeIntelligenceInput`, returning the M118-ready
  `{ plan, decision }`. (Stages are injectable only to enable call-order tests; the single-arg call
  uses the real functions.)

## 6. Unified inputs (this package)

- **M170 — `buildBrainInputs({ squadLoader, decisionPlanSource })`**: thin composition of the two
  boundaries → frozen `{ squadInput, decisionInput }`. No transformation/derivation; each side called
  once (squad before decision); failures propagate.
- **M171 — `summarizeBrainInputs(brainInputs)`**: a pure, frozen snapshot of what the boundary would
  supply (presence flags + counts: players/availability/memories/playerTags, plan/decision,
  category/confidence/supportingMemory counts). Reads only — no pipeline, no providers, no `buildBrainInputs`.
- **M172 — `runBoundarySquadCapstone(input, options)`**: the capstone proof — two providers →
  `buildBrainInputs` → candidates (M132) + formation (M133) from `squadInput`, `decisionInput` as
  plan/decision → `runPipelineBridge` (M137 → real M118/M119/M131) → a complete match-day squad. The
  coach-intelligence engines are **injected** via `options.pipelineServices`.

## 7. Everything remains dormant

Nothing in this package is imported by Core or the app. There is no entry point that runs in
production, no feature flag, and no scheduled or triggered execution. The harnesses (M166, M169, M172)
are exercised only by the test suite. Activation would be a deliberate, separate, flag-gated step
(see §10) — none of which exists yet.

## 8. Coach's Eye Core is not changed

This package imports nothing from Core, writes nothing to Core, and alters no Core behaviour. Core
continues to work exactly as it does today, with or without the (dormant) Brain present. The
Core/Intelligence separation is preserved: data enters only through the read-only provider contracts.

## 9. No AI or live recommendations run here

The boundary performs only deterministic shape-mapping and validation. It generates no text, makes no
inferences, and produces no recommendations. The capstone (M172) does exercise the real selection
engines in tests, but only with injected engines over deterministic in-memory fixtures — never against
live data and never in the product.

## 10. How future Premium integration should use this safely

1. Implement a `squadLoader` (M164) and a `decisionPlanSource` (M167) over real Core reads — strictly
   read-only, tenant- and club-isolated.
2. Validate them via the contracts; map via M165 / M168.
3. Compose with `buildBrainInputs` (M170); inspect with `summarizeBrainInputs` (M171) for diagnostics.
4. Drive the proven pipeline only behind a **premium feature flag, off by default**, supplying the
   coach-intelligence engines as injected `pipelineServices` (as M172 demonstrates).
5. Treat the squad output as a **draft recommendation** for the coach to review — never auto-publish,
   never change Core behaviour when the flag is off.

## 11. Import / boundary rules

- **No UI**, **no database**, **no network**, **no persistence**, **no clock/randomness** anywhere in
  this package.
- **No provider side effects**: validators never invoke provider functions; mappers call each accessor
  exactly once and deep-copy results (provider data is never mutated or frozen).
- **Core / Intelligence separation preserved**: this package imports nothing from Core, and only the
  permitted boundary-adapter imports from `coach-core-adapter` (M135/M140/M165 and the assemblers used
  by the capstone). dependency-cruiser reports zero violations.
- **AI engines injected only where needed**: the coach-intelligence engines (M118/M119/M131) are never
  imported here — they are injected (M172 `options.pipelineServices`), preserving the engine
  decoupling and keeping this package free of any engine dependency.
- **Deeply-frozen, deterministic outputs**; inputs never mutated.

## 12. Dry-run regression diagnostics (M178–M182)

A dormant, **engineering-diagnostics-only** harness for verifying the whole stack from fixed in-memory
scenarios. It is **not production runtime, not Core integration, and not user-facing coaching advice**;
services stay injected, providers stay read-only, and every output is deterministic.

- **M178 — `runBrainDryRun(input, options)`** — runs the full stack (M172 capstone → M171 summary) and
  returns frozen `{ brainInputs, summary, capstone, verification }`, where `verification` is a small
  deterministic count of what was present (`hasSquadInput`, `hasDecisionInput`, `hasSquad`,
  `startingCount`, `benchCount`, `reserveCount`, `warningCount`).
- **M179 — `runBrainDryRunMatrix(scenarios, options)`** — runs M178 across a fixed list of scenarios
  **in input order**, capturing each outcome (one failing scenario never stops the matrix) and
  returning frozen `{ total, passed, failed, scenarios:[{ id, ok, dryRun, verification, error }] }`.
- **M180 — `summarizeBrainDryRunMatrix(matrixResult, format)`** — a pure presenter of an M179 result in
  `object` (default), `text`, or `json` for engineering logs. Reads only; derives no conclusions.
- **M181 — canonical regression fixtures** (`test/fixtures/brain-regression-fixtures.js`) —
  `createFullSquadScenario` / `createInjuryThinnedScenario` / `createInvalidProviderScenario`: the
  single source of truth for the dry-run/capstone scenario pair, returning **fresh deterministic
  objects** every call (no shared mutable references).
- **M182 — fixture consolidation** — every test using that scenario pair (M172/M178/M179) imports the
  shared fixtures; the adapter/contract-unit tests keep their own layer-specific fixtures.

The engines (M118/M119/M131) are still **injected** via `options.pipelineServices` throughout — no
diagnostics module imports `coach-intelligence` or Core.

---

*This document is descriptive only. It adds no exports and changes no runtime behaviour.*
