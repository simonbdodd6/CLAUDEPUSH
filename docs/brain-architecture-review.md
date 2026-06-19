# Brain Architecture Review — M105

> Strategic checkpoint after 100+ milestones. This is a decision document for Simon as
> founder/product owner — not an academic paper. It is documentation only: no runtime code,
> tests, exports, dependencies, or vendor commitments change as a result of writing it.

---

## 1. Executive Summary

The first 100+ milestones did something genuinely valuable but easy to undervalue: they
built the **trust and explainability foundation** of the AI Brain. The evidence gateway,
the manifest/provenance chain, the diff → summary → explanation → assessment pipeline, and
the attestation scaffolding all answer one question reliably — *"can we prove what the Brain
saw, what changed, and why a decision was made?"* That is the part most AI products skip and
later regret skipping.

That foundation is now solid enough. Continuing to add small, pure utilities indefinitely
has **diminishing product value**: each new helper is correct and well-tested, but none of
them are things a coach can see, understand, or pay for. The next phase must shift the centre
of gravity from infrastructure toward **Coach's Eye-specific intelligence**.

Two principles guide that shift:

1. **Reuse open-source tooling wherever it replaces generic infrastructure.** Canonical JSON,
   hashing, indexing, diffing, queues, vector search, orchestration, observability — these
   are commodity. We should not keep hand-building them once a mature, well-maintained tool
   does the job behind a thin adapter.
2. **Protect and deepen the unique coaching IP.** The rugby ontology, Coach DNA, the layered
   memory model, selection and match-prep intelligence, and the evidence/explainability
   surfaces that make recommendations *defensible* — these are the moat. They are where
   effort should concentrate.

**Bottom line:** keep just enough infrastructure to be trustworthy, borrow the commodity
parts, and spend the majority of future milestones on intelligence coaches can act on.

---

## 2. Current Brain Inventory

Classification key: **IP** = proprietary Coach's Eye intellectual property · **Commodity** =
generic infrastructure any competent team (or OSS project) could build/replace · **Hybrid** =
a thin proprietary shape wrapped around commodity mechanics.

| Area | Classification | Notes |
|------|----------------|-------|
| **Evidence Gateway** (`packages/brain-evidence-gateway`) | **Hybrid** | The *contract* (evidence → normalize → dedupe → confidence/memory/audit/exposure, tenant-scoped, deferred/dormant) is Coach's Eye-shaped IP. The *mechanics* (pipeline composition, plan/snapshot, validation) are commodity patterns. |
| **Manifest pipeline** (build/lookup/summarize/merge/filter/diff) | **Commodity** | Content-addressed indexing, set diffing, filtering, merging. Genuinely generic — strong candidates to wrap or replace later. |
| **Provenance** (manifest create/verify/serialize) | **Hybrid** | The *idea* of run-level provenance for coaching evidence is valuable; the *digest/canonicalisation* under it is commodity. |
| **Attestation** (signing payload, signature verify, envelope, batch) | **Commodity** | Deliberately crypto-agnostic scaffolding. The real crypto is (correctly) external. This is plumbing, not IP. |
| **Confidence / reweighting** (`@brain/evidence-weighting`, reweight/confidence-update) | **IP** | *How* evidence confidence is weighted and updated for rugby coaching signals is proprietary judgement, not a generic algorithm. |
| **Comparison / diffing** | **Commodity** | Structured diff over indexes/snapshots. Generic. |
| **Explanation / assessment** (diff explanation, explanation assessment, summaries) | **Hybrid** | The *plumbing* (verdicts, statements, policy checks) is commodity; the *vocabulary and policy that matters for coaching* is where IP will accrue. |
| **Product gateway / adapters** | **Hybrid** | The boundary contract is IP-relevant (it enforces Core/Brain separation); the wiring is commodity. |
| **Memory engine** (`memory-engine`) | **IP** (target) | Today partly infrastructure; the *layered coaching memory model* (player/team/season/opposition) is core IP and should be deepened. |
| **Learning engine** (`learning-engine`) | **IP** (target) | Club-specific learning from outcomes is proprietary. Underlying ML primitives are commodity. |
| **Digital twin** (`club-digital-twin`) | **Hybrid** | The club model/health/predictions framing is IP; the snapshotting/storage is commodity. |
| **Autonomous assistant** (`autonomous-assistant`) | **Hybrid** | Orchestration/tool-calling is commodity; *what it is allowed to recommend and how it explains itself* is IP. |
| **Club intelligence** (`intelligence-timeline`, club summaries/trends/risk) | **IP** (target) | Club-level coaching insight is proprietary; timeline/storage mechanics are commodity. |
| **Coach DNA / future coaching logic** | **IP** (highest value) | Not yet built. This is the single most defensible asset and should be a priority. |

**Reading of the table:** most of what we've built so far is **commodity or hybrid plumbing**.
The genuinely proprietary parts (confidence/weighting judgement, layered memory, learning,
Coach DNA) are the least built. That is the imbalance M106+ should correct.

---

## 3. Keep / Own / Deepen

These are the things Coach's Eye should keep inventing in-house, because they encode rugby
and coaching judgement that does not exist in any library:

- **Coach DNA** — a structured model of a coach's philosophy, preferences, risk tolerance,
  and decision style, used to shape recommendations so they feel like *that coach's* thinking.
- **Rugby ontology** — positions, units (front row, back row, midfield, back three), set-piece
  vs phase play, roles, KPIs, and how they relate. This is the schema everything else reasons over.
- **Player memory** — longitudinal, evidence-backed understanding of an individual: form,
  fitness, availability, strengths, development trajectory.
- **Team memory** — combinations, partnerships, what has worked, cohesion signals.
- **Season memory** — arc of a campaign, fixtures congestion, rotation history, trends.
- **Opposition memory** — scouting, tendencies, threats and how we've fared.
- **Selection intelligence** — turning the above into defensible selection options.
- **Training recommendation logic** — what to train next given evidence and goals.
- **Match preparation intelligence** — opposition-aware, context-aware prep.
- **Explainable coaching decisions** — every recommendation comes with its evidence and reasoning.
- **Club-specific learning** — the system gets better *for this club* over time.
- **Trust & evidence surfaces** — the provenance/explanation work already built, repurposed so
  a coach can see *why* a recommendation is credible and override it confidently.

**Why generic GitHub projects can't copy these:** open-source AI tooling is horizontal — it
provides storage, retrieval, orchestration, and model access. None of it contains *rugby
domain knowledge*, *a coach's philosophy*, *a specific club's longitudinal history*, or the
*editorial judgement* about which evidence justifies a selection. The moat is the
**domain + data + judgement + explainability**, not the plumbing. Anyone can clone a vector
DB; nobody can clone three seasons of a club's coaching context and the rules for reasoning
over it responsibly.

---

## 4. Reuse / Replace / Wrap

Commodity categories and the recommended near-term stance. "Wrap" means hide behind a thin
Coach's Eye interface now so the implementation can change later without touching domain code.

| Category | Recommended stance | Rationale |
|----------|--------------------|-----------|
| Generic agent orchestration | **Wrap behind an interface** | We'll want orchestration; don't marry a framework. Define a small internal interface; swap implementations later. |
| Vector storage | **Evaluate OSS options (Phase B)** | Needed for memory/retrieval. Many mature choices. Don't build our own. |
| Embeddings | **Reuse (provider-agnostic)** | Pure commodity. Keep behind an adapter so the model/provider can change. |
| RAG | **Evaluate, keep thin** | Useful pattern, but the *value* is the curated coaching evidence, not the retriever. |
| Workflow execution | **Wrap / evaluate** | Don't hand-build a workflow engine for production; wrap a proven one. |
| Scheduling | **Reuse** | Commodity. Use platform/OSS scheduling. |
| Observability | **Reuse (adopt early)** | Don't build. Adopt a standard (logs/metrics/traces) behind an interface. |
| Generic policy engines | **Keep for now, wrap** | Our current policy/assessment code is small and fit-for-purpose; wrap it so a real engine can replace it if needed. |
| Generic diff/index utilities | **Keep for now, candidate to replace** | The manifest index/diff family works and is tested. Don't rip out, but treat as replaceable commodity, not a product feature. |
| Generic serialization / canonicalisation | **Keep for now, wrap** | `canonicalStringify`/digest are fine and dependency-free. Wrap so a standard (e.g. canonical-JSON/hashing lib) could replace them invisibly. |
| Queues | **Reuse when needed** | Don't build. Adopt when a real async need appears. |
| Background jobs | **Reuse when needed** | Same. |
| Tool-calling infrastructure | **Wrap behind an interface** | Provider-specific; isolate it so model/provider churn doesn't reach domain code. |

**Principle:** *keep* small things that already work and cost nothing to maintain; *wrap*
anything we'll likely swap; *evaluate* (not adopt blindly) the bigger building blocks in
Phase B. **Do not choose final vendors yet** unless already obvious.

---

## 5. Open-Source Evaluation Criteria

Any tool we adopt should clear these bars:

- **Mature** — proven in real production, not a weekend project.
- **Actively maintained** — recent releases, responsive issues, healthy community.
- **Good TypeScript/Node support** — first-class, not an afterthought binding.
- **Simple to deploy** — minimal moving parts; we are a small team.
- **Works with Vercel or a realistic backend** — fits our actual deployment, not a hypothetical cluster.
- **No premature vendor lock-in** — replaceable behind an adapter; open formats/protocols preferred.
- **Testable** — deterministic enough to test around; doesn't force flaky integration tests everywhere.
- **Good documentation** — we should be able to onboard it in days, not weeks.
- **Safe for user/player data** — clear data handling, self-hostable or compliant; player data is sensitive.
- **Respects Core/AI Brain separation** — does not force Brain logic into the Core product or the UI.

A tool that fails on *data safety* or *Core/Brain separation* is disqualified regardless of how
good it is technically.

---

## 6. Recommended Architecture Direction

The target shape is deliberately boring at the edges and rich in the middle:

- **Coach's Eye Core stays the simple commercial product.** Availability, scheduling, comms,
  the things clubs already pay for. It must keep working with no AI present.
- **The AI Brain owns the intelligence:** reasoning, evidence, memory, learning, prediction,
  recommendation, and coach-level intelligence. This is where proprietary value lives.
- **Generic infrastructure hides behind adapters/interfaces.** Vector store, embeddings,
  orchestration, observability, queues — all reached through small internal interfaces so the
  implementation can change without touching coaching logic.
- **The Brain does not depend on app UI.** Outputs are data (recommendations + evidence +
  explanations); the UI is a consumer, never a dependency. This keeps the Brain testable,
  reusable, and safe to evolve independently.

```
            ┌──────────────────────────┐
            │   Coach's Eye Core (app)  │   simple, commercial, works without AI
            └────────────▲──────────────┘
                         │ safe, draft-first API (feature-flagged)
            ┌────────────┴──────────────┐
            │         AI Brain          │   reasoning · evidence · memory · learning
            │  (domain IP, explainable) │   · prediction · recommendation · Coach DNA
            └────────────▲──────────────┘
                         │ thin adapters / interfaces
   ┌─────────────────────┴─────────────────────────┐
   │  Commodity infra: vector store · embeddings ·  │  reusable, replaceable, hidden
   │  orchestration · observability · queues · jobs │
   └────────────────────────────────────────────────┘
```

---

## 7. Phased Roadmap

### Phase A — Stabilise Current Brain (M105–M110)
- Finish the architecture review (this document) and turn it into a decision register (M106).
- Identify and document **module boundaries** and which interfaces the Brain exposes/consumes.
- Add docs around **what is IP vs commodity** so future contributors don't re-litigate it.
- **Avoid adding unnecessary low-level utilities.** If a milestone produces another tiny pure
  helper with no path to coach-visible value, question it.

### Phase B — Open-Source Scan (M110–M120)
- Systematically compare candidates for **memory, vector search, orchestration, observability,
  and workflow** against the Section 5 criteria.
- Choose only tools that **clearly accelerate the product**; write down the decision and the rejected alternatives.
- **Avoid hype** — popularity is not a selection criterion.

### Phase C — Coaching Intelligence Layer (M120–M170)
- Build **Coach Memory** and **Player Memory** first (highest-leverage, most defensible).
- Build **Team / Season Memory**.
- Build **Selection Intelligence** on top of memory + ontology.
- Build **Match Preparation Intelligence**.
- Every output carries evidence + explanation (reuse the M100–M104 explanation/assessment work).

### Phase D — Product Integration (M170–M220)
- Connect Brain outputs to Coach's Eye Core through **safe, versioned APIs**.
- Keep AI **behind feature flags** — clubs opt in.
- **Draft-first** — the Brain proposes; the coach decides. Never auto-act.
- **Explain every recommendation** — the trust foundation pays off here.

---

## 8. What We Should Stop Doing

- **Reinventing mature infrastructure** (hashing, indexing, queues, vector search) when a proven tool exists.
- **Building endless tiny utilities** with no direct line to product value.
- **Mixing Coach's Eye Core and AI Brain logic** — the separation is a feature; protect it.
- **Putting AI logic in the UI** — UI consumes Brain outputs, never hosts reasoning.
- **Over-engineering before clubs are using the product** — real usage should drive the next build.
- **Installing tools because they are popular** rather than because they solve a real, current need.

---

## 9. What We Should Start Doing

- **Build domain-specific coaching intelligence** — Coach DNA, ontology, memory, selection, prep.
- **Evaluate open-source tools systematically** against written criteria, with the decision recorded.
- **Create thin adapters** around commodity tools so implementations are swappable.
- **Prioritise commercial Coach's Eye outcomes** — features a club would notice and pay for.
- **Keep evidence and explainability as a unique trust advantage** — it differentiates us from
  black-box AI competitors.
- **Move toward features coaches can see, understand, and pay for** — the test for every future milestone.

---

## 10. Final Recommendation

The foundation is built and trustworthy. **After M105, continue only the minimum infrastructure
needed to keep the Brain reliable and well-bounded, then shift the majority of work toward
Coach's Eye-specific intelligence and commercial integration.** Reuse open source for the
commodity layers behind thin adapters; concentrate invention on rugby domain knowledge,
layered coaching memory, Coach DNA, and the explainable recommendations that make Coach's Eye
defensible and worth paying for. Measure each future milestone by one question: *does this move
us closer to intelligence a coach can see, understand, and act on?* If not, it probably
shouldn't be built.

---

*M105 — documentation only. No runtime code, tests, exports, dependencies, or vendor
selections were changed. Next: M106 turns this review into a concrete decision register.*
