# AI Memory & Infrastructure Review — M107

> Strategic technology evaluation, not a coding milestone. The goal: stop Coach's Eye
> Intelligence from rebuilding infrastructure that already exists, while protecting the
> unique coaching IP. This is intended to guide the next several hundred milestones.
> Documentation only — no runtime code, tests, dependencies, or installs change.
>
> Companion to [`brain-architecture-review.md`](./brain-architecture-review.md) (M105) and
> [`brain-decision-register.md`](./brain-decision-register.md) (M106).
>
> *Note on currency:* assessments reflect the landscape as of early 2026. Treat specific
> product mentions as **category exemplars**, not endorsements — no vendor is selected here.

---

## How to read this

Each category answers a fixed set of questions: **what problem it solves**, **build / wrap /
buy**, **business impact**, **engineering effort saved**, **risk**, and **recommended
timing**. The recurring verdict pattern is deliberate:

- **Build** only where the value is rugby/coaching domain judgement (our IP).
- **Wrap** anything we'll plausibly swap — isolate it behind a small interface today.
- **Adopt** mature commodity capabilities rather than hand-building them.

---

## 1. Memory Frameworks

*Examples: Mem0, LangGraph memory, LlamaIndex memory, OpenAI memory patterns, semantic memory architectures.*

- **What it solves:** persisting and recalling facts/preferences/history across sessions so an
  AI behaves like it "remembers." Handles extraction, storage, recency/relevance, and
  retrieval of memories — the mechanics beneath "the assistant knows this player/coach."
- **Why it exists:** LLMs are stateless; every product needs a memory layer and most reinvent
  it badly. Frameworks standardise the extract → store → retrieve loop.
- **Where it fits:** sits between the LLM/reasoning layer and the vector/graph stores. It is
  *mechanism*; the *schema of what is worth remembering for rugby coaching* is ours.
- **Build / Wrap / Buy:** **Wrap an adopted framework.** Build the *coaching memory model*
  (what a Player/Team/Season/Coach memory contains and how it's weighted); wrap a commodity
  framework for the extract/store/retrieve plumbing.
- **Business impact:** High — memory is the foundation of every P1 module.
- **Engineering saved:** Large (months) — extraction, dedup, recency decay, retrieval ranking
  are fiddly and already solved.
- **Risk:** Medium — frameworks are young and churn; data-safety/self-hosting must be verified.
  Mitigate by keeping our memory *model* independent of the framework via an adapter.
- **Timing:** **Now (M108).** This is the first thing to adopt.

## 2. Agent Orchestration

*Examples: LangGraph, OpenAI Agents SDK, CrewAI, AutoGen.*

- **What it solves:** coordinating multi-step LLM reasoning — state machines, branching,
  retries, multi-agent handoffs, human-in-the-loop checkpoints.
- **Why it exists:** "call the model in a loop" gets unmanageable fast; orchestration makes
  reasoning durable, inspectable, and testable.
- **Where it fits:** the reasoning layer — drives the steps that turn evidence + memory into a
  recommendation.
- **Build / Wrap / Buy:** **Wrap.** Adopt one orchestrator behind an internal interface. The
  *guardrails and draft-first rules* that make reasoning coach-safe are ours; the graph
  execution is commodity.
- **Business impact:** Medium-high — enables reliable recommendations, but invisible to coaches.
- **Engineering saved:** Large — don't build a workflow/state engine for LLMs.
- **Risk:** Medium-high — **lock-in risk is real**; orchestration frameworks are opinionated.
  Wrap thinly; avoid leaking framework types into domain code.
- **Timing:** Phase B / when reasoning gets multi-step (after memory exists). Not yet.

## 3. Retrieval (RAG, Hybrid, GraphRAG, Knowledge Graphs)

- **What it solves:** finding the right evidence/context to give the model. RAG = semantic
  lookup; hybrid = semantic + keyword; GraphRAG = traverse relationships; knowledge graphs =
  explicit entities/edges (player↔unit↔role↔opposition).
- **Why it exists:** context windows are finite and models hallucinate without grounding.
  Retrieval supplies grounded, current facts.
- **Where it fits:** between memory/stores and the LLM. **Retrieval quality is product
  quality** for us — but the *value is the curated coaching evidence*, not the retriever.
- **Build / Wrap / Buy:** **Wrap (RAG/hybrid) + Build (the rugby knowledge graph schema).**
  Adopt retrieval mechanics; the *ontology and relationships* are core IP (a KEEP module).
- **Business impact:** High — directly drives recommendation relevance and explainability.
- **Engineering saved:** Medium-large for RAG/hybrid; the *graph schema* we must design ourselves.
- **Risk:** Medium — GraphRAG is powerful but heavier; start with hybrid RAG, add graph later.
- **Timing:** RAG/hybrid alongside memory (Phase B/C). Knowledge graph in Phase C (selection/opposition).

## 4. Vector Storage

*Vector databases, embedding storage, semantic search.*

- **What it solves:** storing embeddings and doing fast nearest-neighbour search — the index
  under semantic retrieval and memory.
- **Why it exists:** specialised ANN indexing/scaling that general databases don't do well
  (though Postgres+pgvector now covers a lot).
- **Where it fits:** the storage layer beneath memory/retrieval.
- **Build / Wrap / Buy:** **Adopt, behind an adapter.** Never build a vector DB. Strongly
  prefer an option that's self-hostable / data-safe and ideally **Postgres-compatible** to
  avoid a second datastore and keep ops simple.
- **Business impact:** Medium (enabler) — invisible but mandatory for memory.
- **Engineering saved:** Huge — ANN search at scale is a research field.
- **Risk:** Low-medium — main risk is lock-in and operational sprawl. Pick something boring,
  Vercel-friendly, and ideally already in our stack (pgvector) before reaching for a bespoke vector cloud.
- **Timing:** **Now (M108)** — pick the simplest viable store to unblock Coach/Player memory.

## 5. Workflow Orchestration

*Temporal, n8n, background workflow engines.*

- **What it solves:** durable, long-running, retryable multi-step processes (ingest → reason →
  learn) that survive restarts — distinct from *agent* orchestration (which is per-request reasoning).
- **Why it exists:** real pipelines need durability, scheduling, and exactly-once semantics that
  ad-hoc code can't guarantee.
- **Where it fits:** the infrastructure layer — async evidence ingestion, periodic learning,
  scheduled refresh.
- **Build / Wrap / Buy:** **Adopt when needed, wrap.** Temporal-class durability is overkill
  until we have real async scale; n8n-class is more for integrations. Don't build a workflow engine.
- **Business impact:** Low-medium short term — clubs won't see it.
- **Engineering saved:** Large *if* we'd otherwise build durability ourselves (we shouldn't).
- **Risk:** Medium — heavyweight engines add ops burden; premature adoption is over-engineering.
- **Timing:** Later (Phase D / when async scale is real). Not now.

## 6. Tool Calling

*MCP ecosystem, OpenAI tool calling, provider-agnostic tool routing.*

- **What it solves:** letting the model invoke functions/tools/data sources in a structured,
  provider-portable way. MCP is emerging as a standard protocol for exposing tools/resources.
- **Why it exists:** every provider has its own tool-calling format; without abstraction you
  marry one model vendor.
- **Where it fits:** between reasoning and the rest of the system (Brain capabilities exposed as tools).
- **Build / Wrap / Buy:** **Wrap (provider-agnostic) + lean toward MCP as the boundary
  standard.** Build none of it; isolate provider specifics behind one interface so model/vendor
  churn never reaches domain code.
- **Business impact:** Medium — buys vendor flexibility and future-proofing.
- **Engineering saved:** Medium.
- **Risk:** Low-medium — the space is moving fast; betting on the *standard* (MCP) over a single
  vendor's SDK reduces lock-in.
- **Timing:** Alongside the reasoning layer (Phase B/C).

## 7. Evaluation

*Prompt evaluation, regression testing, AI quality scoring, benchmarking.*

- **What it solves:** measuring whether AI output is *good* and catching regressions when
  prompts/models/memory change — the equivalent of tests for non-deterministic systems.
- **Why it exists:** you cannot improve or safely ship AI you can't measure; manual spot-checks
  don't scale.
- **Where it fits:** a cross-cutting layer over reasoning/recommendation. **This is where the
  M100–M104 explainability/assessment work pays off** — our deterministic gate/assessment code
  is a head start on internal eval.
- **Build / Wrap / Buy:** **Hybrid — adopt a framework, build the rugby-specific eval sets.**
  The *criteria for a good selection/match-prep recommendation* are IP; the eval harness is commodity.
- **Business impact:** High (quality/trust/retention) but indirect.
- **Engineering saved:** Medium.
- **Risk:** Low — the bigger risk is *not* doing it and shipping silent regressions.
- **Timing:** Early in Phase C, before recommendations reach clubs.

## 8. Observability

*Tracing, reasoning inspection, telemetry, performance.*

- **What it solves:** seeing what the Brain did, why, how long it took, and what it cost —
  traces of reasoning steps, prompts, retrievals, and outcomes.
- **Why it exists:** AI systems are opaque; without tracing you cannot debug, optimise cost, or
  explain behaviour to a club.
- **Where it fits:** cross-cutting, infrastructure layer.
- **Build / Wrap / Buy:** **Adopt early, wrap behind a standard.** Prefer open standards
  (OpenTelemetry-style) so we're not locked to one AI-tracing vendor.
- **Business impact:** Medium — operational necessity; also feeds explainability and trust.
- **Engineering saved:** Large — don't build tracing/telemetry.
- **Risk:** Low-medium — data-safety of traces (player data in prompts) must be handled.
- **Timing:** Early — adopt before real club usage (Phase B/C).

## 9. Knowledge Representation

*Graphs, documents, memory timelines, structured knowledge.*

- **What it solves:** how knowledge is *modelled* — graph (entities/relationships), document
  (text + metadata), timeline (events over time), or structured records. The right shape makes
  reasoning tractable.
- **Why it exists:** retrieval/memory quality depends on representation; the wrong shape makes
  everything downstream harder.
- **Where it fits:** the schema beneath memory and the knowledge graph — **this is core IP**
  (the rugby ontology, layered memory, timelines we already have in `intelligence-timeline`).
- **Build / Wrap / Buy:** **Build the representation; adopt the storage engines under it.** The
  *rugby ontology + layered coaching memory model* is the moat; the graph/doc/vector engines are commodity.
- **Business impact:** Very high — it shapes how "smart" everything else can be.
- **Engineering saved:** Low for the model (we design it); high for the engines (adopt them).
- **Risk:** Medium — over-designing the ontology before real usage is a trap; start minimal, grow with evidence.
- **Timing:** Phase C, evolved continuously. Start small in M108 (Player/Coach entities).

## 10. Commercial Readiness

*Security, scalability, maintainability, cost, vendor lock-in, deployment complexity.*

- **What it solves:** the non-functional bar a tool must clear to be safe for a real product
  handling player data on a small team's budget.
- **Why it exists:** great AI tech that's insecure, unmaintainable, or locks you in is a
  liability, not an asset.
- **Where it fits:** a gate over *every* adoption decision (the M105 criteria, applied).
- **Build / Wrap / Buy:** n/a — it's the **filter**. Hard disqualifiers: unsafe for player data;
  forces Brain logic into Core/UI; heavy ops for a small team; aggressive lock-in.
- **Business impact:** Existential — a security/compliance failure with player data is fatal.
- **Engineering saved:** Indirect — avoids expensive mistakes.
- **Risk:** This *is* the risk lens. Favour self-hostable/open formats, simple deploys
  (Vercel-friendly), and tools that respect the Core/Brain separation.
- **Timing:** Always.

---

## Recommended Architecture (future Brain stack)

Each layer is tagged: **[CUSTOM IP]** = build and own · **[WRAP]** = wrapped open source behind
an interface · **[COMMODITY]** = adopt directly.

```
┌───────────────────────────────────────────────────────────────────────────┐
│  COACH'S EYE CORE (app)                                       [unchanged]   │
│  Availability · scheduling · comms — simple, commercial, works without AI   │
└───────────────────────────────▲───────────────────────────────────────────┘
                                 │  safe, versioned, feature-flagged, draft-first API
┌───────────────────────────────┴───────────────────────────────────────────┐
│  COACH'S EYE INTELLIGENCE (AI Brain)                                        │
│                                                                             │
│  Recommendation Engine ........................................ [CUSTOM IP] │
│  Selection Intelligence · Match · Training · Season · Opposition  [CUSTOM IP]│
│  Coach DNA .................................................... [CUSTOM IP] │
│  Learning Engine (what/why we learn per club) ................ [CUSTOM IP] │
│  Explainability / Assessment (M100–M104, extended) ........... [CUSTOM IP] │
│                                                                             │
│  ── Coaching Memory Model ──────────────────────────────────── [CUSTOM IP] │
│     Coach Memory · Player Memory · Team Memory · Season Memory               │
│                                                                             │
│  ── Reasoning layer ────────────────────────────────────────────── [WRAP]  │
│     agent orchestration · tool calling (MCP-leaning) · eval harness         │
└───────────────────────────────▲───────────────────────────────────────────┘
                                 │  thin adapters (no framework types in domain code)
┌───────────────────────────────┴───────────────────────────────────────────┐
│  MEMORY LAYER ............ memory framework (extract/store/retrieve)  [WRAP]│
│  RETRIEVAL .............. RAG / hybrid + rugby knowledge graph schema        │
│                           (mechanics [WRAP] · ontology/schema [CUSTOM IP])   │
│  VECTOR LAYER ........... embeddings + vector store (prefer pgvector) [COMMODITY]│
│  LLM LAYER .............. model access, provider-agnostic            [COMMODITY]│
└───────────────────────────────▲───────────────────────────────────────────┘
                                 │
┌───────────────────────────────┴───────────────────────────────────────────┐
│  INFRASTRUCTURE LAYER                                                        │
│  observability/tracing · scheduling · queues/jobs · workflow engine [COMMODITY/WRAP]│
│  canonicalisation/hashing · diff/index utilities (existing, replace later)  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**The line that matters:** everything *above* the memory model — recommendations, the
intelligence modules, Coach DNA, the ontology/schema, explainability — is **CUSTOM IP** and is
where our months should go. Everything *at or below* the memory framework is **WRAP/COMMODITY**
and should be adopted, not invented.

---

## Final Recommendation — "If this were my own AI company"

Direct and opinionated, prioritising engineering time:

**What I would personally BUILD (and protect):**
1. The **coaching memory model** — Coach/Player/Team/Season memory schema and weighting. This is
   the foundation and the moat.
2. **Coach DNA** — the personalisation layer nothing generic can replicate.
3. **Selection / Match / Training intelligence** — the visibly "smart" outputs coaches pay for.
4. The **rugby ontology / knowledge representation** — the schema everything reasons over.
5. **Explainability** — extend the M100–M104 work; it's a genuine trust differentiator vs black-box competitors.
6. The **rugby-specific evaluation sets** — our definition of a "good" recommendation.

**What I would WRAP (adopt, hide behind an interface, never marry):**
- Memory framework (extract/store/retrieve), agent orchestration, tool calling (lean MCP),
  RAG/hybrid retrieval mechanics, the eval harness, observability/tracing.
- Rule: **no framework type ever appears in domain code.** Adapters only.

**What I would NEVER build:**
- A vector database, an embedding model, an LLM, a workflow/durability engine, a tracing system,
  a queue, canonical-JSON/hashing from scratch (we already have placeholder versions — replace,
  don't extend), or a generic agent framework.

**What could save us months, starting now:**
- **Adopt a vector store (prefer pgvector to avoid a second datastore) + a memory framework in
  M108** instead of hand-building memory. This alone likely saves *months* and unblocks every P1
  module.
- **Adopt observability and an eval harness early** — cheap now, expensive to retrofit, and they
  protect quality once clubs are live.
- **Stop extending the manifest/index/canonicalisation utilities** — they're commodity; further
  investment there has near-zero product value.

**The discipline going forward:** every milestone must pass the success metric —
*"Does this make the AI Brain a better rugby coach?"* If it's infrastructure, it must *directly
unblock* a CUSTOM IP module, and we should reach for a wrapped open-source tool before writing
new bespoke code.

---

*M107 — documentation only. No runtime code, tests, dependencies, or installs changed.
Next: M108 begins building Coach Memory on a wrapped vector/memory foundation rather than
reinventing it.*
