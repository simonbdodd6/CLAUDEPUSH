# Brain Architecture Atlas

> **Scope.** This is the engineering blueprint for the dormant **Coach's Eye Intelligence / AI Brain**
> as it exists on `feature/coaches-eye-intelligence` after **M173**. It describes only what currently
> exists — no future behaviour is invented. Everything documented here is **dormant**: it is not
> imported by Coach's Eye Core or the app, changes no Core code, runs no AI/recommendations in
> production, and is proven entirely by the test suite.

---

## 1. Overall Brain philosophy

The Brain is an **optional, premium intelligence layer** that sits *beside* Coach's Eye Core, never
inside it. Core remains a complete product on its own; the Brain adds memory-driven, explainable team
selection. The guiding rule: **Core works unchanged with the Brain absent or switched off.** The Brain
is built as a set of pure, deterministic, side-effect-free engines and adapters that can be proven in
isolation long before any of it is wired into the live product.

## 2. Core design principles

1. **Dormant by default** — nothing runs in production; activation is a future, deliberate, gated step.
2. **Pure & deterministic** — no `Date.now`, no `Math.random`, no clock, no I/O; identical input → identical output.
3. **Immutability** — inputs are never mutated; outputs are deeply frozen.
4. **Store/engine agnostic** — engines depend on contracts and injected services, not concrete stores or other engines.
5. **Explainable, not magical** — every recommendation carries evidence; no opaque inference.
6. **Strict boundaries** — enforced mechanically by dependency-cruiser; layers may only import downward.
7. **Read-only entry** — real data enters only through validated, side-effect-free provider contracts.

## 3. Read-only architecture

Real Core data would enter the Brain only through **read-only provider contracts** that are validated
*by shape* and never invoked during validation. The boundary mappers call each accessor at most once,
deep-copy results, and return frozen objects — so the Brain can never write to, or mutate, Core data.
There is exactly one direction of flow: **providers → boundary → adapter → engines → output**.

## 4. Boundary philosophy

A *boundary* is the seam where untrusted/external data becomes a validated, frozen, engine-ready
input. Boundaries are **documentation-as-code**: a contract describes the required provider methods and
guarantees; a mapper validates and shapes the provider output; a harness proves the composition. The
engines themselves never know where data came from — they receive plain validated objects (or injected
services). This keeps the engines testable and the integration replaceable.

## 5. Package map

```
packages/
├─ EVIDENCE / PROVENANCE LAYER (workspace @brain/* packages, pre-existing)
│   brain-contracts                  shared contract types (depends on nothing)
│   brain-evidence-contracts         evidence type contracts (depends on nothing)
│   brain-evidence-store             evidence persistence contract (imports only evidence-contracts)
│   brain-evidence-normalization     normalises evidence (imports only evidence-contracts)
│   brain-evidence-weighting         weights evidence (imports only evidence-contracts)
│   brain-evidence-citation          citation/provenance (imports only the evidence layer)
│   brain-evidence-gateway           facade over the evidence layer; canonical JSON + pipeline digests
│   brain-recommendation-validation  validates recommendations against the evidence layer
│   brain-products / brain-versioning product + version contracts
│   product-coaches-eye              product-level composition package
│
├─ INTELLIGENCE STACK (relative-import packages, built M108–M131)
│   coach-memory                     proprietary Coach Memory + Coach DNA engines (M108–M117)
│   coach-intelligence               selection/recommendation pipeline (M118–M131)
│
├─ ADAPTER (relative-import, built M132–M162)
│   coach-core-adapter               Core → Brain adapter: normalise/map/derive/compose/assemble
│
└─ READ-ONLY BOUNDARY (relative-import, built M164–M173)
    brain-decision-planner           decision-planning read boundary + unified inputs + capstone
```

Two packaging styles coexist: **workspace `@brain/*` packages** (with `package.json`, the evidence
layer) and **relative-import packages** (no `package.json`, imported by relative path in tests — the
newer `coach-*` and `brain-decision-planner` packages, which need no `npm install`).

## 6. Engine map

**coach-memory (M108–M117)** — the proprietary memory + DNA engines:

| Module | Export | Role |
|---|---|---|
| model | `validateCoachMemoryEntry`, enums (`COACH_MEMORY_TYPES`, `…SOURCES`, `ONTOLOGY_KINDS`) | the memory record + vocabularies |
| adapter-contract | `createCoachMemoryStoreContract` | the future store interface |
| query-plan | `createCoachMemoryQueryPlan`, `COACH_MEMORY_SORTS` | structured retrieval request → normalised plan |
| retrieval | `retrieveCoachMemories` | store-agnostic filter/score/sort/limit over an injected provider |
| scoring | `scoreCoachMemoryEntry` | deterministic memory scoring |
| learning | `assessCoachMemoryCandidate` | candidate-memory assessment |
| synthesis | `synthesizeCoachMemories` | summarise retrieved memories |
| dna-signals | `extractCoachDnaSignals` | memories → DNA signals |
| dna-profile | `buildCoachDnaProfile` | signals → Coach DNA profile |
| decision-explanation | `buildDecisionExplanation` | profile + decision → explanation |
| decision-alignment | `scoreDecisionAlignment` | profile + decision → alignment score/tier |
| decision-challenge | `buildDecisionChallenge` | profile + decision + alignment → challenge |

**coach-intelligence (M118–M131)** — the selection pipeline:

| Module | Export | Role |
|---|---|---|
| pipeline (M118) | `runCoachIntelligencePipeline` | orchestrates M110–M117 via injected services |
| recommendation (M119) | `buildCoachRecommendation` | pipeline result → recommendation |
| selection-engine (M120) | `evaluateSelectionCandidate` | per-candidate score/eligibility |
| squad-evaluation (M121) | `evaluateSquad` | rank eligible candidates |
| depth-chart (M122) | `buildDepthChart` | positional depth |
| recommend-starting-xv (M123) | `recommendStartingXV`, `DEFAULT_FORMATION` | fill the XV |
| selection-risk (M124) | `evaluateSelectionRisk` | risk flags |
| summarize-selection-risk (M125) | `summarizeSelectionRisk` | risk presenter (canonical JSON via gateway) |
| team-signoff (M126) | `evaluateTeamSignOff` | approval gate |
| team-sheet (M127) | `composeTeamSheet` | team-sheet presenter |
| captain-recommendation (M128) | `recommendCaptain` | captain/vice |
| bench-recommendation (M129) | `recommendBench` | bench/reserves |
| match-day-squad (M130) | `composeMatchDaySquad` | assemble the squad |
| selection-pipeline (M131) | `runSelectionPipeline` | one-call facade M121→M130 |

## 7. Memory flow

```
coach memory entries (M108 model)
  → createCoachMemoryQueryPlan (M109)         structured request → normalised plan
  → retrieveCoachMemories (M110)              plan + injected provider → filtered/scored/sorted memories
  → synthesizeCoachMemories (M112)            synthesis
  → extractCoachDnaSignals (M113)             DNA signals
  → buildCoachDnaProfile (M114)               Coach DNA profile { dominantSignals: [{category, strength}] }
```

The store is **injected** (`provider.searchCoachMemory(plan)`); M110 does all the filtering/scoring/
sorting/limiting itself, so any backing store (Redis, pgvector, in-memory) sits behind the same contract.

## 8. Decision flow

```
decision { category, confidence, matchedSignals, supportingMemoryIds }  +  Coach DNA profile (M114)
  → buildDecisionExplanation (M115)
  → scoreDecisionAlignment (M116)   → { alignmentScore, alignmentTier, … }
  → buildDecisionChallenge (M117)   → { challenged, metadata.requiresCoachReview, … }
  → buildCoachRecommendation (M119) → { action, confidence, requiresCoachReview, evidence }
```

## 9. Evidence flow

The **evidence/provenance layer** (`brain-evidence-*`, `brain-recommendation-validation`) handles
evidence contracts, normalisation, weighting, citation, and validation behind the **evidence-gateway**
facade. The gateway provides canonical JSON (`canonicalStringify`) and pipeline digests
(`pipelineDigest`); `coach-intelligence` reuses these (e.g. M125's `json` summary) for stable,
comparable output. The layer is strictly ordered (see §12): contracts depend on nothing; everything
else imports only downward toward the contracts.

## 10. Pipeline flow

```
candidates [{playerId, position, availability, confidence}]
  + pipelineResult (M118)  + recommendation (M119)  + formation
  → runSelectionPipeline (M131):
      evaluateSquad (M121) → buildDepthChart (M122) → recommendStartingXV (M123)
      → evaluateSelectionRisk (M124) → evaluateTeamSignOff (M126)
      → recommendCaptain (M128) → recommendBench (M129) → composeMatchDaySquad (M130)
  → match-day squad { startingXV, captain, viceCaptain, bench, reserves, risk, signOff, metadata }
```

## 11. Read-boundary chain (M164–M173)

```
 SELECTION SIDE (coach-core-adapter)              DECISION-PLANNING SIDE (brain-decision-planner)
 ───────────────────────────────────             ───────────────────────────────────────────────
 M164 createCoreSquadLoaderContract              M167 createDecisionPlanSourceContract
   getActivePlayers / getAvailabilityResponses     getFixtureContext / getCoachIdentity
   / getCoachMemories / getPlayerTags
 M165 loaderToSelectionInputs                    M168 mapDecisionPlanContext
   → { players, availability, memories, playerTags } → { fixture, match, coachContext }
 M166 selection boundary proof (test)            M169 completeDecisionPlanningInput
                                                   (M168 → M135 buildDecisionPlanContext
                                                    → M140 completeIntelligenceInput → { plan, decision })
                          \                              /
                           ▼                            ▼
              M170 buildBrainInputs({ squadLoader, decisionPlanSource }) → { squadInput, decisionInput }
              M171 summarizeBrainInputs(brainInputs) → presence flags + counts (snapshot)
              M172 runBoundarySquadCapstone(input, { pipelineServices }) :
                   squadInput → candidates (M132) + formation (M133);  decisionInput → plan/decision
                   → runPipelineBridge (M137) → M118 → M119 → M131 → MATCH-DAY SQUAD
              M173 brain-decision-planner README
```

(Adapter chain referenced above: M132 candidate assembler, M133 formation resolver, M135 decision-plan
builder, M137 pipeline bridge, M138 intelligence-services assembler, M140 intelligence-input completer
— all in `coach-core-adapter`, see its own README from M163.)

## 12. Dependency rules

Enforced mechanically by `dependency-cruiser` (`.dependency-cruiser.cjs`); the build is **0 violations**.
Key forbidden rules:

- `no-circular` — no import cycles anywhere.
- `contracts-depends-on-nothing`, `evidence-contracts-depends-on-nothing` — the contract layers are leaves.
- `evidence-store / -weighting / -normalization-imports-only-evidence-contracts` — store/weighting/normalisation may import only the evidence contracts.
- `evidence-gateway-imports-only-evidence-layer`, `evidence-citation-imports-only-evidence-layer`, `recommendation-validation-imports-only-evidence-layer` — these may import only within the evidence layer.
- `packages-only-import-contracts`, `platform-not-importing-engines-or-core`, `host-not-importing-core` — platform/host packages must not reach into engines or Core.
- `experience-*`, `render-layers-are-pure`, `no-reverse-into-experience` — UI/experience boundary rules.
- `no-orphans` — every cruised module is reachable.

Direction of allowed flow (high level):

```
contracts (leaf) ◄── evidence layer ◄── evidence-gateway ◄── coach-intelligence (reuses gateway helpers)
coach-memory ◄── coach-core-adapter ◄── brain-decision-planner
coach-intelligence ──(injected, never imported)──► coach-core-adapter / brain-decision-planner
```

## 13. Package responsibilities

- **brain-evidence-\* / brain-recommendation-validation** — evidence provenance, canonical serialisation, digests, recommendation validation.
- **coach-memory** — the proprietary Coach Memory model + Coach DNA + decision scoring engines.
- **coach-intelligence** — the deterministic selection/recommendation pipeline.
- **coach-core-adapter** — turns Core-shaped data into engine inputs (normalisation, mapping, DNA, DTO assembly) and bridges to the pipeline; defines the selection read boundary (M164/M165).
- **brain-decision-planner** — the decision-planning read boundary, the unified `buildBrainInputs` facade, the snapshot summary, and the boundary→squad capstone.

## 14. Injection philosophy

The Brain prefers **dependency injection over hard imports** at layer seams, so that:

- engines stay store-agnostic (`retrieveCoachMemories` takes an injected `searchCoachMemory` provider);
- the pipeline bridge (M137) **injects** the M118/M119/M131 engines rather than importing them — so
  `coach-core-adapter` and `brain-decision-planner` carry **no dependency on `coach-intelligence`**;
- the capstone (M172) receives the engines via `options.pipelineServices`;
- harnesses can inject spies to assert call order / call-once without breaking the production single-call path.

This keeps the dependency graph one-directional and the engine layer replaceable.

## 15. Why everything is deterministic

Determinism is a hard requirement, not a nicety:

- No `Date.now` / `new Date` / `Math.random` anywhere — outputs never depend on time or luck.
- All ordering is explicit (sorted by category / playerId / jersey).
- Deeply-frozen outputs prevent downstream code from introducing nondeterminism by mutation.
- Every harness asserts **repeatability** (identical input → byte-identical output), which is the
  operative proof that no hidden clock, randomness, or external state leaks in.

Determinism is what makes the dormant stack *provable*: tests can assert exact outputs end-to-end.

## 16. Dormant vs Runtime architecture

| | Dormant (today) | Runtime (future, gated) |
|---|---|---|
| Imported by Core/app | No | Behind a premium flag only |
| Data source | adapter-supplied / in-memory test fixtures | real Core reads via the provider contracts |
| Engines run | only in tests | only when the flag is on |
| Output | proven in tests | a **draft** recommendation for coach review |
| Core behaviour | unchanged | unchanged when the flag is off |

The architecture is identical in both modes — the only difference is *where the providers come from* and
*whether a flag turns it on*. Nothing structural changes to go live.

## 17. Future Premium activation path

(Describing the seam that exists, not inventing new behaviour.) A future activation would: implement a
`squadLoader` (M164) and `decisionPlanSource` (M167) over real, read-only, tenant-isolated Core reads;
validate + map via M165/M168; compose with `buildBrainInputs` (M170); inspect via `summarizeBrainInputs`
(M171); and drive the pipeline only behind a premium feature flag (off by default), injecting the
coach-intelligence engines as `pipelineServices` exactly as the M172 capstone demonstrates — treating
the squad as a draft, never auto-publishing, never altering Core when the flag is off.

## 18. Core vs Intelligence separation

The separation is structural and enforced:

- The Brain **imports nothing from Core**; the depcruise rules forbid platform/host packages from
  reaching into engines or Core.
- Data crosses the boundary **only** through read-only provider contracts (M164/M167) — shape-validated,
  side-effect-free, deep-copied.
- The engines are decoupled from the adapters via **injection** (§14), so neither the adapter nor the
  boundary depends on the intelligence engines.

Result: Core and Intelligence are independently buildable, testable, and shippable.

## 19. Repository structure

```
coacheseye-nightly-qa/  (worktree on feature/coaches-eye-intelligence)
├─ packages/
│   ├─ brain-*                     evidence/provenance + product packages (@brain/* workspace)
│   ├─ coach-memory/               M108–M117 engines  (+ README from earlier docs)
│   ├─ coach-intelligence/         M118–M131 pipeline
│   ├─ coach-core-adapter/         M132–M162 adapter  (+ README, M163)
│   └─ brain-decision-planner/     M164–M173 boundary (+ README, M173)
├─ test/                           node --test suites (one file per module/harness)
├─ docs/
│   ├─ brain-architecture-review.md, brain-decision-register.md, ai-memory-infrastructure-review.md
│   └─ BRAIN_ARCHITECTURE_ATLAS.md (this file)
└─ .dependency-cruiser.cjs         boundary enforcement
```

Tests live in `test/` and run via Node's built-in test runner (`node --test`) with `node:assert/strict`.

## 20. Future extension guidelines

When adding to the Brain (without going live):

1. **Pick the right layer.** New engine logic → `coach-memory`/`coach-intelligence`; Core-data shaping →
   `coach-core-adapter`; a new read boundary → a contract + mapper + harness in the boundary package.
2. **Stay pure & dormant.** No I/O, clock, randomness, or AI generation; deep-freeze outputs; never
   mutate inputs; never import Core.
3. **Inject, don't import, across layer seams** (especially the engines).
4. **Validate by shape, never by invoking** providers.
5. **Add a deterministic test** asserting exact output + repeatability; keep `dependency-cruiser` green.
6. **Document** new boundaries in the package README; keep this atlas current.
7. **Never change Core behaviour**, and gate any eventual runtime use behind a premium flag, off by default.

## 21. Dry-run regression diagnostics (M178–M182)

A dormant verification harness in `brain-decision-planner` for exercising the whole stack from fixed
in-memory scenarios. It is **engineering diagnostics only** — not production runtime, not Core
integration, and not user-facing coaching advice. Services remain **injected**, providers remain
**read-only**, outputs are **deterministic**, and scenarios are **fixed in-memory test fixtures**.

```
fixtures (M181)  →  runBrainDryRun (M178)  →  runBrainDryRunMatrix (M179)  →  summarizeBrainDryRunMatrix (M180)
{squadLoader,       full stack →               many fixed scenarios,            object | text | json report
 decisionPlanSource} {brainInputs, summary,     in order, per-scenario
                      capstone, verification}    capture { ok, verification, error }
```

- **M178 `runBrainDryRun`** — runs M172 capstone + M171 summary; returns frozen `{ brainInputs, summary,
  capstone, verification }` (verification = deterministic counts of starters/bench/reserves/warnings).
- **M179 `runBrainDryRunMatrix`** — runs M178 across scenarios in input order; one failure never stops
  the matrix; returns frozen `{ total, passed, failed, scenarios }`.
- **M180 `summarizeBrainDryRunMatrix`** — pure presenter (`object`/`text`/`json`) for engineering logs.
- **M181 canonical fixtures** (`test/fixtures/brain-regression-fixtures.js`) — full-squad /
  injury-thinned / invalid-provider builders; fresh deterministic objects every call.
- **M182 consolidation** — all dry-run/capstone tests share those fixtures; adapter/contract tests keep
  their own layer-specific fixtures.

The coach-intelligence selection **engines** stay injected (`options.pipelineServices`) throughout.

## 22. Selection explanation + coverage (M184–M190)

A dormant **explanation** layer (in `coach-intelligence`) interprets an already-built squad as codes —
"the coach decides; the Brain explains what it sees" — and the dry-run diagnostics surface it.

```
M184 buildSelectionExplanation(squad)  →  explanation { summary, starters[codes], bench[codes], risks, alternatives, confidenceNotes }
M185 summarizeSelectionExplanation     →  object | text | json (+ counts)
M186 runBrainDryRun                    →  result also carries { explanation, explanationView }
M187 matrix presenter                  →  per-scenario explanationStarter/Bench/RiskCount (read from dryRun)
M188 matrix presenter                  →  explanationCoverage = explained starters / starters (2 d.p.)
M190 matrix presenter                  →  run-wide coverage rollup { scored, mean, min, fullyExplained }
```

- **M184/M185** are pure and read-only: they never select, score, rank, recommend, or generate prose;
  codes are a fixed enum in canonical order, risks reuse M124 verbatim, confidence surfaces existing
  values only.
- **M186** introduces the one direct `brain-decision-planner → coach-intelligence` import edge — but only
  for the read-only explanation helpers; the selection engines remain injected.
- **M187/M188** read only what M186 already returned (never recompute), defaulting to null when absent.

## 23. Decision Intelligence diff (M192–M200)

The first dormant **Decision Intelligence** engine — it compares two already-completed decision states
and reports what changed and why, as deterministic codes. It never selects, scores, ranks, recommends,
rebuilds squads, or recalculates explanations.

```
two decision states  →  diffDecisions (M192)  →  summarizeDecisionDiff (M193)
                          { playerChanges, captainChanges, benchChanges, riskChanges,
                            explanationChanges, coverageChanges }
brain-decision-planner: diffBrainDryRuns (M194) reads a decision state out of each M186 dry-run result,
                        then runs M192 → M193 → { beforeSummary, afterSummary, diff, diffView }
                        runBrainDryRunDiffMatrix (M196) runs M194 over many pairs → rollup of change codes
                        summarizeBrainDryRunDiffMatrix (M197) → object | text | json report
```

- **M192/M193** live in `coach-intelligence`, are pure and read-only, and emit/render change codes
  (`PLAYER_PROMOTED`, `CAPTAIN_CHANGED`, `RISK_INCREASED`, `EXPLANATION_GAINED`, `COVERAGE_DECREASED`, …).
- **M194** lives in `brain-decision-planner` and is composition only — it reuses the existing read-only
  `coach-intelligence` import (no new dependency edge) and reruns no Brain logic.
- **M196/M197** (also `brain-decision-planner`) run the diff over many before/after pairs in order and
  roll up which change codes appeared across the set, then present it — diagnostics only, deterministic.
- **M199** (`coach-intelligence`) classifies a diff's impact magnitude as a deterministic severity band
  (`NONE…CRITICAL`); **M200** surfaces per-pair severity + a `severityCounts` rollup in the M196 matrix
  and M197 presenter. Classification only — never advice.

---

*This document is descriptive only. It adds no exports, changes no runtime behaviour, and describes the
architecture exactly as it exists after M200.*
