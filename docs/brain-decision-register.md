# AI Brain Decision Register — M106

> Converts the M105 architecture review into concrete, trackable engineering decisions.
> Documentation only — no runtime code, tests, or dependencies change. Companion to
> [`brain-architecture-review.md`](./brain-architecture-review.md).

**Decision legend**

- **KEEP** — proprietary Coach's Eye IP; keep building/owning it in-house.
- **WRAP** — keep the current implementation for now, but hide it behind a thin internal
  interface so it can be swapped without touching domain code.
- **EVALUATE OSS** — commodity capability we will need; assess mature open-source options
  (Section "Open-Source Evaluation Backlog") before building more ourselves.
- **REPLACE LATER** — currently custom and working, but commodity; plan to retire it in
  favour of a proven tool when there's a reason to.

**Priority legend:** P1 = build/protect now · P2 = next 6–12 months · P3 = later / opportunistic.
**Review dates** are checkpoints to revisit the decision, not deadlines.

---

## 1. Decision Register

| Module | Current Status | Decision | Priority | Reason | Review Date |
|--------|----------------|----------|----------|--------|-------------|
| **Evidence Gateway** | Built, dormant (M45–M66) | **WRAP** | P2 | The *contract* (tenant-scoped evidence → normalize → dedupe → confidence/memory/audit/exposure) is Coach's Eye-shaped and worth keeping; the pipeline mechanics are commodity. Wrap so the engine can be swapped. Proprietary-ish shape, commodity internals. | 2026-09 |
| **Manifest Pipeline** (snapshot/diff/provenance) | Built (M64–M66, M83–M87) | **REPLACE LATER** | P3 | Content-addressing + canonical serialisation + provenance is pure commodity. Works and is tested; no urgency, but a standard hashing/canonical-JSON lib should replace the hand-rolled parts eventually. | 2026-12 |
| **Manifest Index** (build/lookup/summarize/merge/filter/diff) | Built (M95–M101) | **REPLACE LATER** | P3 | Generic indexing/diffing utilities with no rugby content. Keep for now (free, tested); treat as replaceable commodity, not a product feature. | 2026-12 |
| **Explanation Layer** (diff explanation, summaries) | Built (M102, M101, M104) | **WRAP** | P2 | The *plumbing* is commodity; the *coaching vocabulary* it will carry is IP. Wrap so the presentation can grow without re-plumbing. Hybrid. | 2026-09 |
| **Assessment Layer** (explanation assessment) | Built (M103) | **WRAP** | P2 | Small declarative decision layer; fit-for-purpose. The *policies that matter for coaching* are IP; the mechanism is commodity. | 2026-09 |
| **Policy Engine** (gate/explanation policies) | Built (M74, M103) | **EVALUATE OSS** | P3 | Our policy code is tiny and works. If policy complexity grows, evaluate a proven policy engine rather than expanding ours. Commodity. | 2026-12 |
| **Memory Engine** | Partial (`memory-engine`) | **KEEP** | **P1** | The *layered coaching memory model* is core IP. Storage/retrieval underneath is commodity (→ EVALUATE OSS for the store), but the model and what it remembers about coaching is ours. Highest commercial value. | 2026-08 |
| **Learning Engine** | Partial (`learning-engine`) | **KEEP** | P2 | Club-specific learning from outcomes is proprietary judgement. ML primitives are commodity; the *what/why we learn for this club* is IP. | 2026-10 |
| **Digital Twin** (`club-digital-twin`) | Partial | **WRAP** | P2 | Club model/health/predictions framing is IP; snapshot/storage is commodity. Wrap the storage; keep the model. Hybrid. | 2026-10 |
| **Autonomous Assistant** (`autonomous-assistant`) | Partial | **WRAP** | P2 | Orchestration/tool-calling is commodity (→ EVALUATE OSS); *what it may recommend and how it explains itself* is IP. Keep behaviour, wrap the runtime. | 2026-10 |
| **Coach DNA** | Not built | **KEEP** | **P1** | The single most defensible asset — a structured model of a coach's philosophy/preferences/risk. Nothing generic can copy it. Build it. | 2026-08 |
| **Club Intelligence** (`intelligence-timeline`, summaries/trends/risk) | Partial | **KEEP** | P2 | Club-level coaching insight is proprietary; timeline/storage mechanics are commodity (→ wrap). | 2026-10 |
| **Selection Intelligence** | Not built | **KEEP** | **P1** | Defensible selection options from memory + ontology + Coach DNA. Pure IP, directly coach-visible. | 2026-09 |
| **Match Intelligence** (match preparation) | Not built | **KEEP** | P2 | Opposition-aware, context-aware match prep. Proprietary; high coach value. | 2026-11 |
| **Training Intelligence** | Not built | **KEEP** | P2 | What to train next given evidence + goals. Proprietary rugby logic. | 2026-11 |
| **Season Intelligence / Season Memory** | Not built | **KEEP** | P2 | Campaign arc, rotation history, congestion, trends. Proprietary, longitudinal — hard to copy. | 2026-11 |
| **Player Memory** | Not built | **KEEP** | **P1** | Longitudinal, evidence-backed understanding of an individual. Foundational to everything else. | 2026-08 |
| **Team Memory** | Not built | **KEEP** | P2 | Combinations, partnerships, cohesion signals. Proprietary. | 2026-10 |
| **Opposition Memory / Opponent Intelligence** | Not built | **KEEP** | P2 | Scouting, tendencies, threats. Proprietary domain knowledge. | 2026-11 |
| **Reasoning Engine** | Not built (implicit) | **WRAP** | P2 | The *reasoning substrate* (LLM calls, tool use, retrieval) is commodity (→ EVALUATE OSS / wrap behind interface); the *rules and guardrails that make reasoning coach-safe* are IP. | 2026-10 |
| **Recommendation Engine** | Not built | **KEEP** | **P1** | Turns memory + intelligence into draft-first, explained recommendations a coach acts on. This is the product surface. Pure IP. | 2026-09 |
| **Canonicalisation / Digest** (`snapshot.js`) | Built | **REPLACE LATER** | P3 | `canonicalStringify` + non-crypto digest. Works, dependency-free. Commodity — replace with a standard lib when convenient; wrap so the swap is invisible. | 2026-12 |
| **Attestation Scaffolding** (signing payload/verify/envelope/batch) | Built (M88–M93) | **EVALUATE OSS** | P3 | Deliberately crypto-agnostic plumbing; real crypto already external. When signing is needed, adopt a proven crypto lib behind the existing injected interface. Commodity. | 2026-12 |

**For each module, the four questions answered (compressed into the table):** *proprietary vs
commodity* → the Reason column; *remain custom?* → KEEP/WRAP = yes for the IP shape, EVALUATE
OSS/REPLACE LATER = no for the mechanics; *investigate OSS?* → EVALUATE OSS rows + WRAP rows
whose internals are commodity; *commercial importance* → the Priority column (P1 = directly
sellable coaching intelligence, P3 = invisible infrastructure).

---

## 2. Open-Source Evaluation Backlog

Categories to evaluate, ranked by **business impact** (how much adopting a proven tool would
accelerate sellable coaching intelligence). **Categories only — no vendors chosen here.**

| Rank | Category | Why it matters now | Unblocks |
|------|----------|--------------------|----------|
| 1 | **Vector database** | Player/team/season memory needs retrieval over evidence. Highest leverage. | Memory engine, recommendation |
| 2 | **Memory framework** | A structured layer over the vector store (sessions, entities, recency). | Coach/Player/Team memory |
| 3 | **Knowledge graph** | Rugby ontology + relationships (player↔unit↔role↔opposition). | Selection, opposition intelligence |
| 4 | **Agent orchestration** | Coordinating reasoning steps safely and testably. | Reasoning, autonomous assistant |
| 5 | **Tool calling** | Provider-agnostic model/tool invocation behind one interface. | Reasoning engine |
| 6 | **Observability** | See what the Brain did and why; required before real club usage. | All — trust/ops |
| 7 | **Evaluation framework** | Measure recommendation quality deterministically; prevent regressions. | Recommendation, learning |
| 8 | **Workflow engine** | Durable multi-step pipelines (ingest → reason → recommend). | Evidence gateway, learning |
| 9 | **Policy engine** | If gate/assessment policy complexity grows beyond the current tiny code. | Assessment, gating |
| 10 | **Scheduling** | Periodic learning/refresh jobs once clubs are live. | Learning engine |
| 11 | **Background jobs / Queue** | Async ingestion and long-running reasoning at scale. | Evidence gateway, twin |
| 12 | **Canonical-JSON / hashing lib** | Replace the hand-rolled canonicalisation/digest. | Manifest/provenance |

Selection for any of these is gated by the M105 criteria (mature, maintained, TS/Node, simple
deploy, Vercel-friendly, no lock-in, testable, documented, **data-safe**, respects Core/Brain
separation). Data-safety and separation are hard disqualifiers.

---

## 3. Commercial Roadmap — where engineering time should go (next 12 months)

Ranked highest → lowest. The top of this list is what clubs would notice and pay for; the
bottom is invisible infrastructure that should be reused, not hand-built.

1. **Coach Memory** — foundation of personalised, philosophy-aware recommendations.
2. **Player Memory** — longitudinal individual understanding; everything builds on it.
3. **Team Memory** — combinations, cohesion, what works.
4. **Season Memory** — campaign arc, rotation, congestion, trends.
5. **Selection Intelligence** — the first visibly "smart" coaching output.
6. **Match Preparation** — opposition-aware prep coaches feel immediately.
7. **Training Intelligence** — what to train next, justified by evidence.
8. **Coach DNA** — the personalisation layer that makes it *this coach's* assistant.
9. **Opponent Intelligence** — scouting/tendencies; high perceived value.
10. **Learning Engine** — gets better per club over time (retention/stickiness).
11. **Recommendation Engine** — the unifying surface that delivers all of the above, explained.
12. **Explainability** — the trust advantage already partly built (M100–M104); deepen and surface it.

**Below the line (reuse, don't invent):** vector store, embeddings, orchestration,
observability, scheduling, queues, workflow, canonicalisation/hashing, generic policy/diff/index.

---

## 4. Success Metric

> **Every future milestone must answer: "Does this make the AI Brain a better rugby coach?"**

If the answer is **no**, reconsider whether the work belongs in Coach's Eye Intelligence at
all. Infrastructure work is justified only when it *directly unblocks* something on the
Commercial Roadmap — and even then, prefer reusing a proven tool over building another bespoke
utility.

---

## 5. How to use this register

- It is a **living document**. Revisit each row on its Review Date (or sooner if circumstances
  change) and update Status/Decision.
- New modules get a row with an explicit Decision before significant code is written.
- A change from KEEP → WRAP/REPLACE (or vice-versa) should be recorded with a one-line note and
  a new review date — the register is the audit trail for architecture choices.

---

*M106 — documentation only. No runtime code, tests, exports, or dependencies were changed.
Next: M107 begins evaluating the first open-source category (see Backlog rank 1–2) while
protecting the KEEP modules.*
