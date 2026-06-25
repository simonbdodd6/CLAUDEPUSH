# coach-intelligence — Selection & Recommendation Pipeline

> **Status: DORMANT.** This package composes the dormant Coach Memory / Coach DNA engines
> (`coach-memory`, M110–M117) into a complete, deterministic **selection and recommendation pipeline**.
> Every module is **pure and deterministic**: no LLM, generated language, storage, persistence,
> filesystem, network, vector search, orchestration framework, clock, or randomness. It **creates no
> new intelligence** — it orchestrates and presents intelligence built elsewhere. Inputs are never
> mutated; outputs are deeply frozen. Imported by nobody in production — only by its tests (and, via
> injection, by the adapter). Milestones **M118–M131**.

---

## 1. Package purpose

`coach-intelligence` turns a coaching **decision** plus a set of **candidate players** into a complete,
coach-reviewable **match-day squad** — Starting XV, depth chart, selection risk, sign-off, captain,
bench, and reserves — and a structured **recommendation**. It does this by composing the memory/DNA
engines through dependency injection and chaining a series of small, single-purpose, deterministic
engines.

## 2. Why coach-intelligence exists

The memory engines (`coach-memory`) measure *what the coach knows and how they think*, but they do not
pick a team. This package is the layer that **applies** that intelligence to selection: it runs the
memory reasoning (via injected services), derives a recommendation, scores and ranks candidates, fills
a formation, surfaces risks, gates sign-off, and assembles the squad — all without generating language
or inventing scores beyond the declared arithmetic. It is deliberately separate so the engines stay
reusable and the selection logic stays testable and store-agnostic.

## 3. High-level architecture

```
  INTELLIGENCE SUB-PIPELINE (memory reasoning)        SELECTION SUB-PIPELINE (team building)
  ───────────────────────────────────────────        ──────────────────────────────────────
  input { plan, decision } + injected services        candidates[] + pipelineResult + recommendation
        │                                                   │
  M118 runCoachIntelligencePipeline                   M131 runSelectionPipeline:
   (retrieve→synthesize→DNA signals→DNA profile         M121 evaluateSquad        (per-candidate via M120)
    →explanation→alignment→challenge)                   M122 buildDepthChart
        │                                               M123 recommendStartingXV  (+ DEFAULT_FORMATION)
        ▼                                               M124 evaluateSelectionRisk → M125 summarize
  M119 buildCoachRecommendation                         M126 evaluateTeamSignOff   → M127 team sheet
        │                                               M128 recommendCaptain
        └──────────── feeds ─────────────►              M129 recommendBench
                                                        M130 composeMatchDaySquad
                                                              │
                                                              ▼
                                                   MATCH-DAY SQUAD (deeply frozen)
```

The two sub-pipelines meet at the selection input: M118→M119 produce the recommendation and pipeline
result, which (with candidates) feed M131's chain to the squad.

## 4. The M118–M131 milestone chain

| Milestone | Module | Export(s) |
|---|---|---|
| **M118** | `pipeline.js` | `runCoachIntelligencePipeline` |
| **M119** | `recommendation.js` | `buildCoachRecommendation` |
| **M120** | `selection-engine.js` | `evaluateSelectionCandidate` |
| **M121** | `squad-evaluation.js` | `evaluateSquad` |
| **M122** | `depth-chart.js` | `buildDepthChart` |
| **M123** | `recommend-starting-xv.js` | `recommendStartingXV`, `DEFAULT_FORMATION` |
| **M124** | `selection-risk.js` | `evaluateSelectionRisk` |
| **M125** | `summarize-selection-risk.js` | `summarizeSelectionRisk` |
| **M126** | `team-signoff.js` | `evaluateTeamSignOff` |
| **M127** | `team-sheet.js` | `composeTeamSheet` |
| **M128** | `captain-recommendation.js` | `recommendCaptain` |
| **M129** | `bench-recommendation.js` | `recommendBench` |
| **M130** | `match-day-squad.js` | `composeMatchDaySquad` |
| **M131** | `selection-pipeline.js` | `runSelectionPipeline` |

## 5. Per-module responsibilities and exports

- **pipeline (M118)** — `runCoachIntelligencePipeline({ plan, decision }, services)` composes the
  injected M110–M117 services (retrieve → synthesize → DNA signals → DNA profile → explanation →
  alignment → challenge) into one frozen pipeline result. Imports none of them; validates services and
  each stage's output.
- **recommendation (M119)** — `buildCoachRecommendation(pipelineResult)` emits recommendation metadata
  derived from the alignment (M116) and challenge (M117) stages (tiers: `excellent | good | neutral |
  weak | poor`). No language, no team selection.
- **selection-engine (M120)** — `evaluateSelectionCandidate` scores one candidate:
  `clamp01(recommendation.confidence*0.4 + candidate.confidence*0.3 + alignmentScore*0.3)`; `eligible`
  is the availability gate (score is independent of availability).
- **squad-evaluation (M121)** — `evaluateSquad` runs M120 across all candidates against a shared
  pipeline result + recommendation and returns a deterministic `{ ranked, ineligible }` (default
  `limit: 15`, range `[1,100]`).
- **depth-chart (M122)** — `buildDepthChart` organises the M121 ranking into per-position
  `{ starter, depth }`, optionally collapsing source positions into named groups.
- **recommend-starting-xv (M123)** — `recommendStartingXV(depthChart, formation)` fills each jersey
  with the first unselected eligible player for that position; leaves a jersey vacant if none remain.
  `DEFAULT_FORMATION` maps jerseys 1–15 (LH, Hooker, TH, Lock, Lock, Blindside, Openside, Number8,
  ScrumHalf, FlyHalf, LeftWing, InsideCentre, OutsideCentre, RightWing, Fullback).
- **selection-risk (M124)** — `evaluateSelectionRisk` flags coaching risks (vacancies,
  requiresCoachReview, per-position signals) with fixed-template reasons; severities `NONE … CRITICAL`.
- **summarize-selection-risk (M125)** — `summarizeSelectionRisk` presents the M124 report in `line`
  (default), `text`, `markdown`, or `json` (canonical key-sorted JSON via the shared evidence gateway).
  Reads only.
- **team-signoff (M126)** — `evaluateTeamSignOff` is the deterministic approval gate over M123 + M124.
- **team-sheet (M127)** — `composeTeamSheet({ startingXV, riskReport, signOff })` presents M123/M124/
  M126 in `line`/`text`/`markdown`/`json`. Reads only.
- **captain-recommendation (M128)** — `recommendCaptain` picks captain + vice from the selected XV
  using existing structured fields only (missing scores treated as 0).
- **bench-recommendation (M129)** — `recommendBench` builds the bench from the squad remaining after
  the XV, reusing the M121 ranking (default size 8; never duplicates an XV player).
- **match-day-squad (M130)** — `composeMatchDaySquad` maps M123 + M124 + M126 + M128 + M129 into one
  canonical frozen squad. Composition only.
- **selection-pipeline (M131)** — `runSelectionPipeline(input)` orchestrates M121→M122→M123→M124→M126→
  M128→M129→M130 and returns the M130 squad verbatim. Validates the top-level input; delegates the rest.

## 6. End-to-end recommendation pipeline (decision → recommendation → squad)

```
decision (+ retrieval plan)                          candidates[]
   │                                                     │
   ▼                                                     │
M118 pipeline (memory reasoning via injected services)   │
   → { memories, synthesis, profile, explanation,        │
       alignment, challenge }                            │
   │                                                     │
   ▼                                                     │
M119 recommendation  ──────────────► combined with ◄─────┘
                                     candidates as M131 input
                                          │
                                          ▼
                       M131 selection pipeline (M121 … M130)
                                          │
                                          ▼
                              match-day squad + (M125/M127 presenters)
```

The memory sub-pipeline turns a decision into alignment/challenge evidence and a recommendation; the
selection sub-pipeline turns that (plus candidates) into a match-day squad. Presenters (M125, M127)
render risk and team-sheet views without changing any decision.

## 7. How coach-memory is injected safely (M138 architecture)

The pipeline (M118) declares the memory capabilities it needs as a `services` interface
(`retrieveCoachMemories`, `synthesizeCoachMemories`, `extractCoachDnaSignals`, `buildCoachDnaProfile`,
`buildDecisionExplanation`, `scoreDecisionAlignment`, `buildDecisionChallenge`) and **imports none of
them**. The adapter (`coach-core-adapter`, **M138** `assembleIntelligenceServices`) wires the real
`coach-memory` functions over a memory provider and hands them to the pipeline as `services`. So
`coach-intelligence` never imports `coach-memory`: it consumes only validated, frozen, deterministic
memory outputs through the injected interface — preserving the engine decoupling and the
Core/Intelligence separation.

## 8. Determinism guarantees

- No `Date.now`/`new Date`/`Math.random`/clock/IO anywhere; output depends only on inputs (and injected
  pure services).
- All ordering, ranking, and tie-breaking is explicit; duplicate playerIds are rejected so squads are
  well-defined.
- Scores are clamped to `[0,1]`; "reasons" and presenter strings are fixed templates / canonical JSON,
  never generated language.
- Outputs are deeply frozen and inputs are never mutated. Tests assert byte-identical repeated output.

## 9. Dormant behaviour vs runtime behaviour

| | Dormant (today) | Runtime (future, gated) |
|---|---|---|
| Imported by Core/app | No | Behind a premium flag only |
| Memory services | injected stubs / real engines in tests | injected by the adapter (M138) over a real provider |
| Output | proven in tests | a **draft** match-day squad + recommendation for coach review |
| Core behaviour | unchanged | unchanged when the flag is off |

The structure is identical in both modes; only *who supplies the injected services* and *whether a flag
turns it on* differ.

## 10. What this package must never do

- Never generate natural language, call an LLM, or invent scores beyond the declared arithmetic.
- Never persist, read, or write any store/filesystem/network.
- Never import `coach-memory` directly — memory capability is injected.
- Never import from Coach's Eye Core or the app.
- Never mutate inputs or return unfrozen output; never introduce a clock or randomness.

## 11. Import and dependency rules

- **Memory is injected, not imported.** M118 takes the memory services as an argument; the package has
  no import edge to `coach-memory`.
- **Internal composition.** Engines import only sibling modules where they genuinely compose
  (`squad-evaluation`←`selection-engine`; `selection-pipeline`← the eight engines it orchestrates).
- **One external edge:** the presenters `summarize-selection-risk` (M125) and `team-sheet` (M127) import
  `canonicalStringify` from `@brain/evidence-gateway` for canonical, key-sorted JSON output. This is the
  only cross-package dependency, and it is downward into the evidence layer.
- **No Core / no app imports.** `dependency-cruiser` reports zero violations for this package.

## 12. Future extension guidelines

1. **Keep it pure & deterministic.** New engines must be side-effect free, deep-freeze output, never
   mutate inputs, and add no clock/randomness/IO/generated language.
2. **Compose, don't reinvent.** Reuse the existing engine outputs (as M125/M127/M130/M131 do) rather
   than rescoring or duplicating logic.
3. **Inject capabilities.** Anything needing memory or external data takes a services/provider argument;
   never import a store or `coach-memory` directly.
4. **Add deterministic tests** asserting exact output + repeatability; keep `dependency-cruiser` green.
5. **Never change Core**, and keep any eventual runtime use gated and driven by adapter-injected services.

## 13. Selection Explanation layer (M184–M185)

A dormant, deterministic **explanation** layer that interprets an already-built squad — "the coach makes
the decision; the Brain explains what it sees." It **never selects, scores, ranks, or recommends**, runs
no pipeline, inspects no provider, and generates no prose — it reads existing outputs and emits codes.

- **M184 — `buildSelectionExplanation(squad)`** — takes an M130 match-day squad and returns a deeply
  frozen `{ summary, starters, bench, risks, alternatives, confidenceNotes }`. `starters`/`bench` carry
  **explanation codes only** (`FORMATION_REQUIREMENT`, `CAPTAIN_SELECTION`, `POSITION_MATCH`,
  `HIGH_ALIGNMENT`, `CONSISTENT_SELECTION`, `LOW_SELECTION_RISK`, `BENCH_COVER`) derived in a fixed
  canonical order from existing fields; `risks` reuses the M124 entries verbatim; `alternatives`
  exposes the existing reserves; `confidenceNotes` surfaces existing `score`/`alignmentTier` only.
- **M185 — `summarizeSelectionExplanation(explanation, format)`** — a pure presenter of an M184
  explanation in `object` (default), `text`, or `json` (canonical, via the shared `@brain/evidence-gateway`
  serializer, as in M125/M127), adding a `counts` block. Reads only; derives no new conclusions.

These power the dormant dry-run diagnostics in `brain-decision-planner` (M186 attaches both to the
dry-run result; M187/M188 surface their counts and a coverage metric across the regression matrix).

## 14. Decision Intelligence layer (M192–M193, M199)

The first dormant **Decision Intelligence** engine: it compares two already-completed decision states
and reports WHAT changed and WHY — as deterministic codes only. It **never selects, scores, ranks,
recommends, rebuilds squads, reruns selection, or recalculates explanations**; it reads only the two
supplied states.

- **M192 — `diffDecisions(beforeDecision, afterDecision)`** — each decision state is
  `{ starters:[{playerId, codes}], bench:[{playerId, codes}], captain, viceCaptain, riskCount|risks,
  coverage }` (accepts `explanationCodes` as a `codes` alias, so an M184 explanation feeds in directly).
  Returns a deeply frozen `{ summary, playerChanges, captainChanges, benchChanges, riskChanges,
  explanationChanges, coverageChanges }`, with change codes such as `PLAYER_PROMOTED`/`PLAYER_DEMOTED`/
  `PLAYER_ADDED`/`PLAYER_REMOVED`, `CAPTAIN_CHANGED`/`VICE_CAPTAIN_CHANGED`, `RISK_INCREASED`/
  `RISK_DECREASED`, `EXPLANATION_GAINED`/`EXPLANATION_LOST` (only for players whose role is unchanged),
  and `COVERAGE_INCREASED`/`COVERAGE_DECREASED`. All ordering is deterministic.
- **M193 — `summarizeDecisionDiff(diff, format)`** — a pure presenter of an M192 diff in `object`
  (default, + a flat `changeCount`), `text`, or `json` (canonical, via the shared serializer). Reads only.
- **M199 — `classifyDecisionDiff(diff)`** — classifies an M192 diff's impact magnitude as a
  deterministic severity band (`NONE`/`MINOR`/`MODERATE`/`MAJOR`/`CRITICAL`) from a transparent
  fixed-weight score (captain change weighted heaviest; improvements weigh 0). Returns
  `{ severity, score, changed, factors }` — classification only, never advice.

End-to-end composition lives in `brain-decision-planner` (M194 `diffBrainDryRuns` diffs two M186
dry-run results by reading their decision states).

---

*This document is descriptive only. It adds no exports and changes no runtime behaviour; it describes
`coach-intelligence` exactly as it exists today.*
