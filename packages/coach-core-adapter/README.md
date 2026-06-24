# coach-core-adapter — Architecture & Readiness Guide

> **Status: DORMANT.** This package is a pure, deterministic adapter layer that bridges Coach's
> Eye **Core** data into the dormant Coach Intelligence / AI Brain engines. It is **not imported
> by Core or the app**, modifies **no engine and no Core code**, performs **no I/O, network,
> persistence, clock, randomness, or AI generation**, and produces only **deeply-frozen** outputs.
> Everything here is proven by tests; nothing is wired into the live product.

Milestones covered: **M132–M162** (adapter helpers + harnesses).

---

## 1. Architecture overview

Three layers, strictly one-directional:

```
COACH'S EYE CORE            coach-core-adapter (THIS PACKAGE, dormant/pure)        BRAIN ENGINES (unchanged)
(production, untouched)     bridges Core data → Brain inputs                       coach-memory (M108–M117)
 players / availability     normalize · map · derive · compose · assemble          coach-intelligence (M118–M131)
 fixtures / memories(*)     → candidates + formation + DNA + DTO → bridge           selection pipeline + DNA
```

The adapter **never reaches into the Brain engines' internals** and **never edits Core**. Brain
engines are either imported read-only (pure functions) or **injected** as services, so the adapter
stays decoupled and dependency-cruiser reports zero boundary violations.

`(*)` Coach memories and a real per-player form/confidence source do not exist in Core yet — see §11.

### ASCII data-flow diagram

```
 CORE-SHAPED INPUT                     ADAPTER (pure, dormant)                              BRAIN (unchanged)
 ─────────────────                     ───────────────────────                              ─────────────────
 players ───────────┐
 availability ──────┤ normalizePosition (M132) ┐
                    │ mapAvailability   (M132) ─┤
 (form source) ─────┤ confidence provider:      │
                    │   createBaselineConfidence (M145, availability-history)
                    ▼                            ▼
              assembleCandidates (M132) ─► resolvePositionAssignments (M142) ─► candidates ─┐
                    │   (coarse Flanker/Wing/Centre → Blindside/Openside/…)                  │
                    │                                                                        │
                    └─► resolveFormationFromCandidates (M133) ─► formation ──────────────────┤
                                                                                             │
 coach memories ─► coachDnaProfileFromMemories (M157) ─► coach DNA profile ──┐ [real M113→M114]
 player tags ────► derivePlayerDnaSignals (M153) ─► player DNA signals ──────┤
                                                                             ▼
                          createDnaConfidenceProvider (M155) = baseline (M145)
                                + signals (M153) + influence (M152) ─► DNA-adjusted confidence
                                              (feeds assembleCandidates above)
                    ▼
            assembleSelectionInputs (M160) ─► createSelectionInputs DTO (M159)
            { players, availability, coachMemories, coachDnaProfile,
              playerDnaProfiles, candidates, formation }
                    │
                    ▼  candidates + formation
            runPipelineBridge (M137) ─► M118 ─► M119 ─► M131 ─► MATCH-DAY SQUAD
            intelligence input: buildDecisionPlanContext (M135) → completeIntelligenceInput (M140)
            services: assembleIntelligenceServices (M138)   memory: inMemoryCoachMemoryAdapter (M132)
```

---

## 2. Core → Candidate flow

`assembleCandidate` / `assembleCandidates` (M132) turn a Core player record into the exact
M120/M121 candidate `{ playerId, position, availability, confidence }`:

- **playerId** ← Core `userId` (falling back to `id`, or a configurable `playerIdField`).
- **position** ← `normalizePosition` (M132): `"Loosehead Prop" → LH`, `"Scrum-half" → ScrumHalf`,
  jersey numbers, case/punctuation tolerant; `"TBC"`/unknown → `null` (rejected); coarse Core terms
  (`Flanker`/`Wing`/`Centre`) normalize to coarse family tokens.
- **availability** ← `mapAvailability` (M132): `available → true`, `unavailable → false`,
  `maybe`/unknown → policy (default `false`).
- **confidence** ← an injected confidence provider (see §6).

A batch can `skipUnknownPosition` to drop `"TBC"` players. Output candidates are frozen; Core
records are never mutated.

## 3. Candidate → Formation flow

- `resolveFormationFromCandidates` (M133) reports **coverage** — which candidates could fill each
  jersey, applying coverage position-groups (a `Flanker` *covers* jerseys 6 **and** 7).
- `resolvePositionAssignments` (M142) converts coverage into **assignment** — each coarse-family
  candidate is given one specific position (`Flanker → Blindside / Openside`, `Wing → Left/Right`,
  `Centre → Inside/Outside`), deterministically by `playerId`, derived from the formation's slots.
  This is required because M122 needs one-to-one positions, not coverage groups.
- `DEFAULT_FORMATION` / `DEFAULT_POSITION_GROUPS` (M133) provide the standard 15-jersey rugby shape.

## 4. Memories → Coach DNA flow

`coachDnaProfileFromMemories(memories, services)` (M157) runs the **real M113
`extractCoachDnaSignals` → M114 `buildCoachDnaProfile`** (injected) over the coach's memory entries
and returns the M114 coach DNA profile (`dominantSignals: [{ category, strength }]`). This is the
*same* profile the recommendation path derives, so one set of memories drives **both** the overall
recommendation and the per-player influence (proven by M158).

Alternative source: `composeCoachDnaProfile` (M156) builds the same profile shape from coach-level
`tags`/`traits`/`attributes`/`signals` via configurable mappings (summed-and-clamped strengths).

## 5. Player tags → Player DNA flow

`derivePlayerDnaSignals(playerProfile, options)` (M153) maps a player's `tags`/`traits`/`attributes`
to signed affinity signals `[{ category, weight }]` via configurable mappings (first-seen dedupe,
sorted, `DEFAULT_DNA_MAPPINGS` overridable). These are exactly the `dnaSignals` M152 consumes.

## 6. Confidence adjustment flow

- **Baseline** — `deriveAvailabilityConfidence` / `createBaselineConfidenceProvider` (M145) turn a
  player's recent availability history into a `[0,1]` confidence (`available=1, maybe=0.5,
  unavailable=0`, averaged; empty → default). This is a real, Core-derivable stand-in for the
  missing form/rating signal.
- **Influence** — `applyPlayerDnaInfluence(candidate, coachDnaProfile, options)` (M152) adjusts a
  candidate's confidence by the dot-product of its `dnaSignals` and the profile's `dominantSignals`,
  scaled and clamped: aligned players are boosted, conflicting players penalised, others unchanged.
- **Composition** — `createDnaConfidenceProvider(config)` (M155) packages M145 + M153 + M152 into a
  single standard `{ getConfidence(player) }` provider (missing profile/history degrade to baseline;
  `enabled:false` disables influence). This provider plugs straight into M132/M134.

## 7. DTO assembly flow

- `createSelectionInputs(input)` (M159) — a passive DTO: validates and **deep-copies** then freezes
  `{ players, availability, coachMemories, coachDnaProfile, playerDnaProfiles, candidates, formation,
  metadata }`. Caller inputs are never mutated or frozen.
- `assembleSelectionInputs(input, services)` (M160) — the active builder: orchestration only, no
  business logic. It passes raw fields through and calls **injected producer thunks**
  (`buildCandidates`/`buildFormation`/`buildCoachDnaProfile`/`buildPlayerDnaProfiles`, each wired by
  the caller to the real adapters), then packages everything via M159.

## 8. PipelineBridge flow

`runPipelineBridge(pipelineInput, services)` (M137) is composition-only: it runs the **injected**
real engines **M118 → M119 → M131** in order and returns the match-day squad. Supporting helpers:

- `buildDecisionPlanContext` (M135) + `completeIntelligenceInput` (M140) → the normalized M109 plan
  + the M116/M117 decision (with `supportingMemoryIds`).
- `assembleIntelligenceServices` (M138) → the real M110–M117 bundle around an injected memory
  provider.
- `inMemoryCoachMemoryAdapter` (M132) → a `searchCoachMemory` provider over in-memory entries.
- `squadOptions` passthrough (M141) → lift M121's default `limit:15` so a real bench/reserves form.

## 9. End-to-end proven chain

Harness tests prove the whole flow on realistic Core-shaped data, **without executing the pipeline
in the live product**:

| Harness | Proves |
|---|---|
| M139 | Core-shaped data (specific positions) → full match-day squad via real M118/M119/M131 |
| M143 | Coarse Core positions (`Flanker`/`Wing`/`Centre`) → full XV (validates M142) |
| M154 | DNA influence flips the starting selection (per-player) |
| M158 | The same memories drive both the recommendation profile and the per-player profile |
| M161 | Real adapters assemble a fully-populated `SelectionInputs` DTO |
| **M162** | **Core data → DNA confidence → DTO → bridge → complete squad; DNA flips jersey 9** |

All are deterministic, repeatable, non-mutating, and produce frozen outputs.

## 10. Closed architecture risks

- **DNA did not differentiate players (review risk #1)** — **closed.** M152/M153/M155/M157 + the
  M154/M158/M162 harnesses prove Coach DNA adjusts *per-player* confidence and can flip selections.
- **Position vocabulary mismatch** — closed by `normalizePosition` (M132).
- **Coverage vs assignment incompatibility** — closed by `resolvePositionAssignments` (M142).
- **Request-shape vs normalized plan** — closed by `completeIntelligenceInput` (M140).
- **Missing `supportingMemoryIds` for M115** — closed by M140.
- **Silent bench cap (`limit:15`)** — closed by `squadOptions` passthrough (M141).
- **Availability 3-state → boolean / `maybe` policy** — closed by `mapAvailability` (M132).

## 11. Remaining unimplemented production dependencies

The chain is proven but runs on **adapter-supplied / test data**. A live run still needs:

1. **A real coach-memory store** — a production `searchCoachMemory` (Redis/pgvector/…) behind the
   M132 adapter contract, **and a capture flow** so coaches can record memories (Core stores none).
2. **A real per-player form/confidence source** — M145's availability baseline is a stand-in; Core
   has no form/rating. (Review risk #2 is *mitigated*, not fully closed.)
3. **A real player DNA-tag source** — M153/M156 mappings are illustrative; real player
   tags/traits/attributes must be captured.
4. **A Core squad loader** — read active players + availability from Core's identity/availability
   stores into the adapter input (the M144 loader contract was not built).
5. **A decision/plan producer from real match context** — fixture/opponent/intent → M118 inputs.
6. **Position data quality** — Core positions default to `"TBC"`; needs coach-set positions.
7. **Captain inputs** — leadership/experience/consistency (M128) are absent in Core → default 0.

## 12. Future live integration path

A safe, gated route from "proven in tests" to a real feature:

1. Build the **Core squad loader** + decision/plan producer (DI contracts, no live I/O first).
2. Implement a **real memory store adapter** + memory capture.
3. Add a **form/confidence source** (or accept the M145 availability baseline as v1).
4. Compose a single dormant entry point, e.g. `selectMatchDaySquad(coreServices)`, wiring loaders +
   adapters + `runPipelineBridge` (no Core edits).
5. Wire it behind a **premium feature flag** in an API endpoint — **off by default**.
6. Persist the output as a **draft** matchday selection (never auto-publish).

## 13. Premium gating considerations

- The Brain is an **optional premium layer**; **Core must work unchanged with AI off** (a hard
  product constraint). The selection feature must be entirely behind a flag.
- No Core behaviour may change when the flag is off; the adapter/Brain must not be imported on the
  Core path unless the premium flag is on.
- Outputs are **recommendations/drafts** for the coach to review — never an automatic team sheet.

## 14. Safety guarantees

- **No Core modifications**, **no Brain-engine modifications**, **no runtime wiring** — entirely
  dormant on `feature/coaches-eye-intelligence`.
- **No I/O**: no filesystem, network, Redis, database, clock, or randomness anywhere in the adapter.
- **No AI generation**: deterministic mappings/derivations only.
- **Inputs never mutated**; **outputs deeply frozen** (DTOs, profiles, candidates, squads).
- **Injected services** keep the adapter decoupled from the engines it feeds.
- **dependency-cruiser**: 0 boundary violations across the package.

## 15. Determinism guarantees

- Pure functions only — identical input always yields identical output (asserted by every harness's
  repeatability test).
- No `Date.now` / `new Date` / `Math.random` — no time- or randomness-dependent behaviour.
- **Deterministic ordering** everywhere (sorted by category / playerId / jersey).
- Frozen outputs prevent downstream mutation from introducing nondeterminism.

---

*This document is descriptive only. It adds no exports and changes no runtime behaviour.*
