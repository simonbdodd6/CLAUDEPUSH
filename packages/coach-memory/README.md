# coach-memory — Coach Memory & Coach DNA Engines

> **Status: DORMANT (proprietary IP).** This package is the **memory-engine side** of the Coach's Eye
> Brain. Every module is **pure and deterministic**: no persistence, filesystem, network, store,
> vector search, embeddings, LLM, engine, clock, or randomness. IDs and timestamps are **supplied by
> the caller** — this package never generates them. Inputs are never mutated; outputs are deeply
> frozen. It is imported by nobody in production — only by its tests (and, via injection, by the
> adapter that feeds the pipeline). Milestones **M108–M117**.

---

## 1. Package purpose

`coach-memory` defines and operates on a **coach memory entry** — a single reusable coaching insight —
and derives a **Coach DNA profile** from a body of such memories. It provides the model, scoring,
retrieval planning + execution, learning assessment, synthesis, DNA extraction/profiling, and the
decision explanation/alignment/challenge engines. It is the proprietary "what the coach knows and how
the coach thinks" layer the rest of the Brain reasons over.

## 2. Why coach-memory exists

Team selection that reflects a coach's actual philosophy needs a durable, structured, queryable record
of that philosophy — independent of any particular database or AI model. This package is that record's
**engine**: it captures the memory model and all the deterministic computations over it, so the
intelligence layer can stay store-agnostic and model-agnostic. Storage is deliberately *not* here — it
sits behind a documentation-as-code adapter contract (M108) for a future, tenant-safe store.

## 3. The memory-side architecture

```
                 ┌──────────────── model (M108) ────────────────┐
                 │ validate / normalize / enums / scoring        │
                 └───────────────┬───────────────────────────────┘
   query-plan (M109) ────────────┤ (reuses enums)
        │                        │
        ▼                        ▼
   retrieval (M110) ── injected provider.searchCoachMemory(plan)
        │
        ├─► synthesis (M112)      memories → summary/themes/statistics
        ├─► dna-signals (M113)    memories → measurable signals
        │        └─► dna-profile (M114)  signals → Coach DNA Profile
        │                 └─► decision-explanation (M115)
        │                 └─► decision-alignment (M116) → score/tier
        │                          └─► decision-challenge (M117)
        └─► learning (M111)       candidate decision → "should this become a memory?"
   adapter-contract (M108)        describes the FUTURE store (no storage here)
```

Each module reads validated inputs, computes deterministically, and returns frozen data. The only
"pluggable" seam is retrieval's **injected provider** — everything else is self-contained arithmetic
and ordering.

## 4. The M108–M117 milestone chain

| Milestone | Module | Export(s) |
|---|---|---|
| **M108** | `model.js` | `validateCoachMemoryEntry`, `normalizeCoachMemoryEntry`, `COACH_MEMORY_TYPES`, `COACH_MEMORY_SOURCES`, `ONTOLOGY_KINDS` |
| **M108** | `scoring.js` | `scoreCoachMemoryEntry` |
| **M108** | `adapter-contract.js` | `createCoachMemoryStoreContract` |
| **M109** | `query-plan.js` | `createCoachMemoryQueryPlan`, `COACH_MEMORY_SORTS` |
| **M110** | `retrieval.js` | `retrieveCoachMemories` |
| **M111** | `learning.js` | `assessCoachMemoryCandidate` |
| **M112** | `synthesis.js` | `synthesizeCoachMemories` |
| **M113** | `dna-signals.js` | `extractCoachDnaSignals` |
| **M114** | `dna-profile.js` | `buildCoachDnaProfile` |
| **M115** | `decision-explanation.js` | `buildDecisionExplanation` |
| **M116** | `decision-alignment.js` | `scoreDecisionAlignment` |
| **M117** | `decision-challenge.js` | `buildDecisionChallenge` |

## 5. What each module/export is responsible for

- **model (M108)** — defines a coach memory entry and its vocabularies (`COACH_MEMORY_TYPES`,
  `COACH_MEMORY_SOURCES`, `ONTOLOGY_KINDS`); `validateCoachMemoryEntry` throws on the first problem,
  `normalizeCoachMemoryEntry` returns a frozen canonical entry. Caller supplies `id`/`createdAt`.
- **scoring (M108)** — `scoreCoachMemoryEntry` computes a clamped `[0,1]` relevance/quality score from
  the entry's own fields: `confidence*0.5 + weight*0.3 + evidence/ontology/tag contributions`.
- **adapter-contract (M108)** — `createCoachMemoryStoreContract` returns the frozen description of a
  *future* store (`upsert/get/search/list/deleteCoachMemory`) plus tenant-isolation and
  deterministic-ordering guarantees. It implements no storage.
- **query-plan (M109)** — `createCoachMemoryQueryPlan` turns a **structured** retrieval request into a
  frozen normalised plan `{ filters, retrieval }` (sorts: `COACH_MEMORY_SORTS = score | confidence |
  weight | createdAt`). It does not parse English — a future LLM would produce the structured request.
- **retrieval (M110)** — `retrieveCoachMemories(plan, provider)` executes an M109 plan against an
  **injected** `provider.searchCoachMemory(plan)` and deterministically filters/scores/sorts/limits.
  Store-agnostic; provider results never mutated; result frozen.
- **learning (M111)** — `assessCoachMemoryCandidate` decides, against a declarative policy, whether a
  coaching decision is important enough to become a permanent memory. Stores nothing.
- **synthesis (M112)** — `synthesizeCoachMemories` aggregates entries into `{ summary, themes,
  statistics, supportingEvidence }` by counting/grouping/averaging/ordering. Not generative.
- **dna-signals (M113)** — `extractCoachDnaSignals` measures recurring behaviour into
  `{ signals:[{ category, occurrences, averageConfidence, averageWeight, strength, supportingMemoryIds }], summary }`.
- **dna-profile (M114)** — `buildCoachDnaProfile` ranks/selects signals into the Coach DNA Profile
  (`{ profileVersion, dominantSignals, … }`) — the single structured source of truth for a coach's style.
- **decision-explanation (M115)** — `buildDecisionExplanation` orders the evidence behind a decision
  against the profile (surfaces evidence; invents nothing).
- **decision-alignment (M116)** — `scoreDecisionAlignment` scores how strongly a decision matches the
  profile: `clamp01(dominantSignalStrength*0.5 + confidence*0.3 + matchedSignals contribution*0.2)`.
- **decision-challenge (M117)** — `buildDecisionChallenge` turns alignment tier (`excellent | good |
  neutral | weak | poor`) into structured challenge data for review (severity, requiresCoachReview).

## 6. How summaries, tags, DNA, learning, and ordering relate

These are **derived views over the same validated memory entries** — there is no separate snapshot or
timeline module; each "view" is one of the functions above:

- **Tags / types / ontology links** live on the entry (M108) and drive filtering in the query plan
  (M109) and scoring contributions (M108).
- **Summaries** are `synthesizeCoachMemories` (M112) — a deterministic snapshot-like aggregate
  (`statistics`, `themes`) over a memory set, never free text.
- **Timeline-style ordering** is not a separate feature: it is the `createdAt` option in
  `COACH_MEMORY_SORTS` (M109) applied by retrieval (M110).
- **DNA** is the M113 → M114 chain: signals measured from memories, then ranked into a profile.
- **Learning outputs** (M111) feed *back* into the model: an accepted candidate becomes a new M108
  entry (with caller-supplied id/timestamp), which then participates in synthesis and DNA.
- **Decision engines** (M115/M116/M117) consume the **profile** plus a decision, not raw memories.

## 7. Determinism guarantees

- No `Date.now`/`new Date`/`Math.random`/clock/IO anywhere; output depends only on inputs.
- All ordering is explicit (score/confidence/weight/createdAt, with stable tie-breaks); duplicate ids
  are rejected so aggregates are well-defined.
- Numeric outputs are clamped to `[0,1]` where they represent strengths/scores.
- Outputs are deeply frozen and inputs are never mutated, so downstream code cannot introduce
  nondeterminism by mutation. Tests assert byte-identical repeated output.

## 8. What remains dormant

Nothing here runs in production. No module is imported by Coach's Eye Core or the app; there is no
store, no scheduler, no entry point, and no feature flag. The engines execute only in the test suite
and — at a future, gated activation — behind injection from the adapter. Activation is a separate,
deliberate step that does not exist yet.

## 9. What the package must never do

- Never persist, read, or write any store/filesystem/network — storage lives behind the M108 contract.
- Never call an LLM, generate natural language, or "infer" beyond the declared arithmetic.
- Never generate ids or timestamps (callers supply them).
- Never import from Coach's Eye Core, the app, or another package.
- Never mutate inputs or return unfrozen output.

## 10. How coach-intelligence consumes memory outputs safely

The selection pipeline never reaches into a store. Memory capability is **injected**: the adapter
(`coach-core-adapter`, M138 `assembleIntelligenceServices`) wires the real M110–M117 functions over a
memory provider and hands them to the pipeline (M118) as services. The pipeline therefore consumes
**validated, frozen, deterministic** memory outputs (retrieved memories, synthesis, DNA profile,
explanation/alignment/challenge) without importing `coach-memory` directly — preserving the engine
decoupling and the Core/Intelligence separation.

## 11. Import / boundary rules

- **Internal imports only.** Modules import only from within `coach-memory` (`query-plan`←`model`;
  `retrieval`←`scoring`,`query-plan`; `learning`/`synthesis`/`dna-signals`/`dna-profile`←`model`). The
  package imports **nothing** from other packages, the engines, or Core.
- **Injected seam, not imported store.** The only external dependency is retrieval's injected
  `searchCoachMemory(plan)` provider — never a concrete database.
- **Validate by shape, fail fast.** Every export validates its inputs and throws a descriptive
  `TypeError` on the first problem; validators never perform IO.
- `dependency-cruiser` reports zero violations for this package.

## 12. Future extension guidelines

1. **Keep it pure.** New logic must stay deterministic and side-effect free; deep-freeze outputs; never
   mutate inputs; never add IO, clock, randomness, or generated text.
2. **Reuse the model.** New computations should validate against M108 and reuse the enums rather than
   redefining vocabularies.
3. **Inject, don't import, storage.** Anything needing data takes a provider argument (as M110 does);
   no concrete store belongs in this package.
4. **Add deterministic tests** asserting exact output + repeatability; keep `dependency-cruiser` green.
5. **Never change Core**, and keep any eventual runtime use gated and injected via the adapter.

---

*This document is descriptive only. It adds no exports and changes no runtime behaviour; it describes
`coach-memory` exactly as it exists today.*
