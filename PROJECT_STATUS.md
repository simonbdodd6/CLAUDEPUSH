# Project Status

## 2026-06-11 — Proactive Intelligence Engine

- Added a read-only Proactive Intelligence Engine at `lib/ai/proactive-intelligence/`.
- The engine monitors platform health, executive dashboard signals, autonomous assistant output, Digital Twin confidence, opportunities, provider health, and owner approval bottlenecks.
- Added Executive Briefings with urgency, evidence, confidence, recommended action, time sensitivity, risk if ignored, business impact, and links back to missions/opportunities/world model/company memory/executive decisions.
- Added an append-only Executive Inbox with `UNREAD`, `ACKNOWLEDGED`, `DISMISSED`, `ACTED_ON`, and `SNOOZED` states.
- Added dashboard projections for most urgent, newest, highest impact, awaiting owner, resolved, and trend over time.
- Added a CEO Morning Briefing with company health, biggest opportunity, biggest risk, AI workforce summary, world changes, required approvals, recommended priorities, predicted revenue impact, confidence, and top three actions.
- Human approval remains mandatory and the engine never executes external actions autonomously.

## 2026-06-11 — Travel Intelligence Identity Platform Foundation

- Added the universal Identity Platform foundation at `lib/identity-platform/`.
- Supports one canonical identity record with multiple roles for travellers, businesses, hosts, local guides, moderators, administrators, AI agents, and future organisation accounts.
- Added public/internal profile separation, privacy settings, verification status, verified flag, country/languages/timezone, emergency contact placeholder, trust placeholder, and reputation placeholder.
- Added clean domain APIs for create, read, update profile, change role, set verification status, suspend, soft delete, and audit reads.
- Added an adapter-based repository boundary so future production storage, federation, SSO, and enterprise accounts can attach without changing the domain API.
- Added tests for privacy-safe public reads, internal read audit, role changes, verification, suspension, GDPR-style anonymising soft delete, and validation.

## 2026-06-11 — Travel Intelligence Trip Platform Foundation

- Added the Trip Platform foundation at `lib/trip-platform/`.
- Supports traveller-owned trips with country, destination, approximate area, dates, status, visibility, and timestamps.
- Added clean domain APIs for create, update, date changes, destination changes, visibility changes, start, complete, cancel, read by ID, and list by owner identity.
- Added owner isolation so travellers cannot read or mutate another identity's trips while allowing privileged system/admin access paths for future operations.
- Added terminal-state protections for completed and cancelled trips.
- Added validation that rejects exact live location-style fields; trips store approximate area only.
- Added tests for creation, required fields, status transitions, visibility, owner isolation, cancelled/completed rules, and exact-location rejection.

## 2026-06-12 — Travel Intelligence Destination Platform Foundation

- Added the Destination Platform foundation at `lib/destination-platform/`.
- Supports canonical travel destinations for countries, regions, cities, islands, beaches, mountains, national parks, neighbourhoods, and transport hubs.
- Added destination fields for name, type, country, region, timezone, currency, languages, safety notes, seasonality, status, and timestamps.
- Added clean domain APIs for create, update, activate, pause, close, read by ID, list by country, list active, and search by name.
- Added privileged management controls so only administrators, moderators, or system actors can create or mutate canonical destinations.
- Added validation that rejects exact traveller location-style fields; destinations do not store live or precise traveller location.
- Added tests for creation, updates, activation, pausing, closing, country filtering, active lists, search, invalid types, invalid status transitions, and exact-location rejection.

## 2026-06-12 — Travel Intelligence Destination Hierarchy and Area Platform

- Extended the Destination Platform with `parentDestinationId` support for canonical place hierarchies such as Indonesia > Bali > Canggu.
- Added broad destination `areas` so destinations can carry named local areas without storing exact traveller location.
- Added hierarchy protections that reject self-parenting, missing parents, parented country records, and circular parent relationships.
- Added APIs for listing child destinations, listing active children under a parent, and reading full breadcrumb paths.
- Added `town` as a supported destination type while preserving all existing destination APIs.
- Added tests for parent creation, child creation, breadcrumbs, child listing, active child listing, self-parent rejection, circular hierarchy rejection, and existing destination behavior.

## 2026-06-12 — Travel Intelligence Activity Platform Foundation

- Added the Activity Platform foundation at `lib/activity-platform/`.
- Supports canonical activities linked to destinations by `destinationId` without coupling to the Destination module.
- Added activity categories, difficulty, duration, estimated cost range, seasonality, age restrictions, weather sensitivity, indoor/outdoor environment, active/inactive lifecycle, and public/private visibility.
- Added owner isolation for private reads, updates, lifecycle changes, visibility changes, and owner activity lists.
- Added validation that rejects exact traveller location-style fields; activities do not store live or precise traveller location.
- Added adapter-based in-memory repository, service layer validation, audit events, README documentation, and comprehensive automated tests.

## 2026-06-12 — Travel Intelligence Traveller Preferences Platform Foundation

- Added the Traveller Preferences Platform foundation at `lib/traveller-preferences-platform/`.
- Supports one private preference profile per traveller identity for budget, accommodation, travel styles, activities, fitness, accessibility, food, languages, transport, risk, crowds, climate, pace, budget caps, trip duration, favourite/avoided destinations, and favourite/avoided activities.
- Added owner isolation so only the traveller identity owner or privileged actors can create, read, update, or delete preference records.
- Added validation that rejects exact traveller location-style fields; preferences do not store live or precise traveller location.
- Added privacy-safe deletion that clears preference details while retaining a tombstone for lifecycle/audit handling.
- Added adapter-based in-memory repository, service layer validation, audit events, README documentation, and comprehensive automated tests.

## 2026-06-12 — Travel Intelligence Recommendation Platform Foundation

- Added the deterministic Recommendation Platform foundation at `lib/recommendation-platform/`.
- Supports non-AI ranked recommendations for activities, destinations, food, accommodation, transport, safety, and weather suitability.
- Added weighted scoring factors for traveller interests, budget, trip duration, activity preferences, accessibility, travel pace, crowd tolerance, climate, language, transport, and risk tolerance.
- Added explainable recommendations with score, confidence, explanation, and source factors for every result.
- Added privacy validation that rejects exact traveller location-style inputs.
- Added adapter-based in-memory recommendation run storage, audit events, README documentation, and comprehensive automated tests.

## 2026-06-12 — Travel Intelligence Trip Intelligence Planner Foundation

- Added the deterministic Trip Intelligence Platform foundation at `lib/trip-intelligence-platform/`.
- Turns trip, destination, activity, traveller preference, and recommendation snapshots into explainable daily trip plans without mutating source domains.
- Supports morning, afternoon, evening, and rainy-day backup suggestions plus safety, transport, budget, and traveller-fit notes.
- Added APIs for generating trip plans, generating daily plans, suggesting day activities, suggesting destination focus, detecting trip gaps, and explaining plans.
- Added privacy validation that rejects exact traveller location-style inputs.
- Added adapter-based in-memory plan storage, audit events, README documentation, and comprehensive automated tests.

## 2026-06-13 — Interactive AI Consciousness Visualization v1 (shipped)

- Replaced the Command Centre dashboard centrepiece with a GPU-rendered neural brain at `app/command-centre/src/components/dashboard/NeuralConsciousness.jsx` (React Three Fiber + Three.js).
- 3,500-particle human-brain silhouette across six cognitive subsystems, ~7k synaptic connections, traveling signal pulses, custom GLSL shaders, bloom + depth-of-field, spring-physics rotation, hover-to-fire neurons, and click-to-dive intelligence layers.
- This is purely a presentation-layer change; it consumes no new backend and mutates no Core data. Feature-complete; no further visual work planned.

## 2026-06-13 — Platform Intelligence Foundation PIF-1 (shipped — integration only)

- Implemented the smallest safe integration layer that makes existing intelligence reachable, explainable, and approval-gated. No new AI brain, no new engine, no duplicated reasoning, no new store, no new product domain — only the existing engines re-exposed through `app/api-server.js`, gated by the existing `brain/config.js` feature-flag schema.
- Fixed the broken `GET /api/approvals` route (it imported a non-existent `approval-manager.js` and silently returned empty); it now reads the live queue via `dashboard/index.js`.
- Added `POST /api/approvals/:id/approve` and `:id/reject` reusing `dashboard/index.js` `approve()/reject()`. The already-built `ApprovalsQueue.jsx` buttons are wired to these via the `useApprovals()` hook (busy-state, coach-triggered, no visual change).
- Added `POST /api/approvals/route` that routes Decision-Engine output into the queue through the existing `approval-router.routeGeneric()`. Flag-gated behind `autonomousAssistant` (off below elite tier) so no low-provenance items reach the queue by default.
- Closed the documented feedback gap: on approve/reject the API records the real coach decision through the existing `learning-engine.recordOutcome()` (ACCEPTED→prediction validated, REJECTED→prediction rejected). Flag-gated behind intelligence-enabled; the coach decision is real human input, not a simulated outcome.
- Added `knowledge-engine/evidence-view.js` — a thin read-only composer reusing Knowledge Engine citations + Memory entity links (no new store, no reasoning), exposed at `GET /api/evidence`.
- Added `GET /api/simulation`: `runSimulation()` exists but every current code path feeds it mock observations, so per platform rules it is NOT surfaced as truth — the endpoint returns an honest flag-gated "available-but-deferred until a live observation feed is wired" envelope. No mock fabricated or duplicated.
- Verified: command-centre `vite build` passes; full `node --test` suite passes (368/368); live smoke test confirmed route→list→approve→reject→evidence→simulation, idempotency guards, 404s, and feature-flag gating (starter tier degrades every intelligence endpoint while Core `GET /api/approvals` still works).
- Boundaries held: Core works with AI disabled, Intelligence only reads/returns, all Intelligence writes are coach-triggered, no engine-to-engine imports added, persistence unchanged (existing JSONL/file stores).

## 2026-06-13 — Platform Intelligence Foundation PIF-2 (shipped — durable approval & evidence ledger)

- Made approval state, decisions, evidence references and learning outcomes durable across process restarts / serverless cold starts, reusing the existing append-only JSONL — no new store schema, no new AI system, no engine duplication.
- Added `dashboard/approval-centre/approval-ledger.js`: a swappable ledger adapter. `FileLedgerAdapter` (default, local/dev) wraps the existing `memory-engine/data/approval-queue.jsonl` event log and adds a consolidated `approval-audit.jsonl` audit trail. `ProductionLedgerAdapter` is an isolated, inert placeholder for a future Postgres/Supabase/Vercel backend — it holds no credentials and throws a clear "not configured" error if selected via `APPROVAL_LEDGER=production`.
- Made the approval queue durable: `approval-queue.js` now routes every write through the ledger and rebuilds its in-memory Map by replaying the event log on first use (`replayState()`), so the queue survives restart. The event-log format is unchanged, so pre-existing logs replay as-is. Public API and all 368 tests unchanged.
- Each approve/reject now writes an auditable record via `appendAudit()`: decision id, action, timestamp, source engine, evidence ids / citation ids (where available), human decision, and learning outcome. Audit writes are always-on (a coach decision is an accountability event, not an optional feature); the learning-outcome field is populated only when intelligence is enabled.
- Added read-only `GET /api/approvals/audit` (flag-gated behind intelligence-enabled, like the other intelligence read surfaces). Reads the durable ledger; no mock fabricated.
- Verified: `node --test` 368/368 pass; module-level and full live HTTP restart tests confirm an approved item + its audit record survive a process kill and rehydrate in a fresh process; starter-tier degrades the audit endpoint while Core `GET /api/approvals` still works; the production adapter is confirmed inert (no DB connection).
- Known limitations: (1) the file adapter is single-host — concurrent writers on different instances can interleave/duplicate log lines; true multi-instance safety needs the production adapter backed by a transactional store (deferred, by design). (2) Full event-log replay is O(history); a periodic snapshot/compaction step is a later optimisation. (3) No retention/rotation policy on the JSONL files yet. (4) Evidence/citation ids are captured only when the upstream item already carries them.

## 2026-06-13 — Platform Intelligence Foundation PIF-3 (shipped — Executive Reasoning Layer)

- Added a domain-agnostic Executive Reasoning / explainability layer at `lib/executive-reasoning/` that sits ABOVE existing intelligence and makes every recommendation traceable, inspectable and self-explaining. It never makes decisions — it only exposes reasoning. It calls no engine and invokes no model: every field is COMPOSED from signals the platform already produced (detector confidence, learning-engine calibration, decision tiers, citations, the PIF-2 approval/audit ledger, lifecycle timestamps). No new AI brain, reasoning engine, LLM wrapper, store or API duplication.
- The layer is pure and reusable UNMODIFIED across Website Lead, Coach's Eye, Wedding, Travel and Hospitality intelligence: each domain maps its recommendation object onto a neutral `ReasoningInput` and receives a universal `ExecutiveExplanation`. Only Node built-ins are imported; the Coach's-Eye-specific mapping lives in the API binding, not the module. A test proves the same layer explains both a Coach's Eye recommendation and a Website Lead recommendation with zero code changes.
- Delivers all 10 requested capabilities: (1) Executive Explanation object, (2) Reasoning Trace model, (3) Evidence Graph + pure traversal, (4) Confidence composition (normalises the upstream value + calibration provenance — never recomputes a probability), (5) Missing-Evidence detector (from mock/stale/absent/thin-sample signals), (6) Recommendation Inspector API, (7) Explainability panel data model, (8) Recommendation timeline, (9) Decision provenance, (10) Human approval linkage to the durable PIF-2 record.
- Files: `lib/executive-reasoning/{constants,errors,confidence,evidence-graph,missing-evidence,reasoning-trace,timeline,explanation,repository,service,index}.js` + `README.md`; `test/executive-reasoning.test.js` (14 tests). API binding added to `app/api-server.js`: `POST /api/recommendations/explain` (generic — any domain posts a recommendation) and `GET /api/recommendations/explain?approvalId=X` (composes the real PIF-2 ledger; never mock). Both flag-gated behind `isIntelligenceEnabled` (existing schema; no new flag key).
- UI-independent by design: the layer returns data only (including a flat `toExplainabilityPanel()` projection) for a UI to consume later. Verified: full `node --test` suite passes (396/396); live smoke test confirmed the generic POST, the durable-approval GET (approval linkage + learning outcome + provenance + 11-section panel), and starter-tier degradation.
- Known limitations: (1) live recommendations run on mock observations, so no GET regenerates them — the inspector explains a POSTed object or a durable approval item only (no mock surfaced as truth). (2) Reasoning/assumptions are composed from structured signals the caller supplies; richness depends on how much the upstream object carries. (3) Decision tier is absent on the approval-id path because approval records don't store the original tier (owner is taken from `requiresRole`); the POST path carries full decision context.

## 2026-06-13 — Platform Intelligence Foundation PIF-4 (shipped — Executive Knowledge Graph)

- Added the shared, canonical relationship layer at `lib/executive-knowledge-graph/`: the connective tissue where every entity (person, company, project, lead, meeting, task, recommendation, evidence, decision, memory, event, product, customer, plus domain types like player/team/venue/trip/booking) exists EXACTLY ONCE and everything else references it. No new AI/reasoning/memory/recommendation/explanation engine — entities are canonical references (`ref:{engine, externalId}`) into their owning engines; the graph never copies domain records.
- Delivers all 10 core capabilities: (1) Universal Entity model, (2) Relationship model, (3) graph traversal engine (neighbors/bfs/shortestPath/subgraph/dependencies/dependents), (4) temporal relationship history (validFrom/validUntil + `relationshipsAsOf`), (5) entity + relationship version history, (6) cross-domain references, (7) recommendation dependency graph, (8) decision dependency graph, (9) evidence relationship graph, (10) Digital Twin entity registry (canonical grouped snapshot).
- Every entity supports the required fields: id, type, owner, created, updated, status, confidence, relationships, timeline, citations, approvalHistory, featureFlags (plus domain, ref, version, attributes). Every relationship is temporal and versioned.
- Platform rules enforced structurally: identity is content-hash derived (`entityId = sha1(domain|type|naturalKey)`, `relationshipId = sha1(from|type|to)`) so duplicate entities/ids/relationships are impossible (upsert + version, never insert). No `Math.random`/`Date.now` in identity; the clock is injectable, so the graph is fully deterministic (`buildExampleGraph().export()` is reproducible). Every change is versioned and can be mirrored to an append-only journal sink (the PIF-2 ledger pattern) for audit; the graph does no file I/O itself.
- Domain-agnostic by construction: a test and the worked example (`buildExampleGraph()`) connect FIVE domains (Coach's Eye, Website Lead, Wedding, Travel + a shared platform identity domain) through one graph, with the same canonical `person` nodes referenced across Coach's Eye, Website Lead, Wedding and Travel simultaneously — proving "exists only once, referenced everywhere" without any code change.
- Files: `lib/executive-knowledge-graph/{constants,errors,id,entity,relationship,registry,traversal,views,graph,service,example,index}.js` + `README.md`; `test/executive-knowledge-graph.test.js` (15 tests); root `EXECUTIVE_KNOWLEDGE_GRAPH.md` (architecture diagram, entity registry, relationship registry, generated example). UI-independent: the graph returns data only; no API endpoint added this milestone (consumers like the PIF-3 reasoning layer and future dashboards read it).
- Verified: full `node --test` suite passes (411/411); example graph generates deterministically (14 entities across 5 domains, 13 relationships, recommendation/decision/evidence dependency graphs + digital-twin registry all project correctly).
- Known limitations: (1) in-memory registry by default — durable/multi-instance persistence is via an injectable journal sink (the PIF-2 production adapter would back it later; not connected here). (2) No graph-wide query language yet (traversal is programmatic). (3) Entity merge is field-level upsert; cross-id identity resolution (deciding two externalIds are the same person) is a future capability. (4) No API endpoint yet — added when a consumer needs one, to keep this milestone UI-independent.

## 2026-06-13 — PIF-5A Living Neural Activity (shipped — visual)

- Made the existing GPU brain visualization feel alive WITHOUT adding particles, redesigning the brain, or changing its shape. All work is in `app/command-centre/src/components/dashboard/NeuralConsciousness.jsx` (the `/` Home route). Particle count unchanged (3,500 neurons, ~7,000 synapses, 200 signal carriers).
- Delivered the 8 behaviours: (1) Living synaptic network — connections now breathe independently (per-edge phase/rate) and brighten when carrying an active pathway, via a new connection ShaderMaterial; endpoints follow their neuron's lobe breathing so synapses stay attached. (2) Electrical impulses — the signal system now has a continuous baseline flow and routes ~70% of impulses onto the active reasoning pathway. (3) Reasoning mode — a cognition state machine periodically forms a reasoning pathway in the frontal cortex, drops global activity so only that pathway is highly active, and travels activation along it (simulating a recommendation forming). (4) Memory mode — recall episodes activate the temporal lobes instead (different region + its native violet colour). (5) Confidence heat map — a `uConfidence` uniform shifts firing glow from cool/dim (low) to warm/bright (high); confidence varies per reasoning episode and is shown in the HUD. (6) Region isolation — clicking a lobe now softly expands it (in-shader positional expansion around its centroid) while dimming unrelated regions. (7) Camera choreography — the camera gently leans toward the currently active region (subtle, damped, disabled while inspecting a focused layer). (8) Time-based breathing — replaced the single uniform brain breath with independent per-lobe breathing computed in the vertex shader (each region pulses on its own clock).
- Implementation notes: a shared `cognitionRef` carries mode/confidence/active-region/pathway; per-lobe breathing + focus expansion are done in the vertex shader (dynamic uniform-array indexing by lobe); confidence and synaptic activation are decayed buffers (no new geometry). Optimised for realism over spectacle — low amplitudes, subtle camera motion, no new post effects.
- Verified: production `vite build` passes; full `node --test` backend suite unaffected (461/461 pass); headless run shows the canvas renders with no shader-compile or runtime errors, the cognition HUD reports live state (observed REASONING ↔ IDLE cycling) and confidence varying per episode (66%→91%).
- Known limitations: (1) cognition modes are autonomously simulated on a timer — not yet wired to real backend recommendation/memory events (a later milestone can drive `cognitionRef` from the PIF-3/PIF-5 layers). (2) Camera choreography is a gentle lean, not full target tracking, to avoid fighting user rotation.

## 2026-06-13 — Demo Mode M1 "The Living Intelligence" (shipped — cinematic visual)

- Turned the brain into a cinematic, self-demonstrating experience. All in `app/command-centre/src/components/dashboard/NeuralConsciousness.jsx`; particle count unchanged (3,500 neurons / ~7,000 synapses / 200 signal carriers); production build passes and runs at 60fps.
- (1) Demo Mode (press **D**): the canvas smoothly expands to full-screen (covering the sidebar/topbar — "softly fades"), a radial vignette darkens the void, the brain becomes the centrepiece. No reload; 0.9s eased transition.
- (2) Autonomous thinking: the PIF-5A cognition state machine continues — regions wake, signals travel, memory flashes, confidence drifts, reasoning pathways activate — with randomised regions/timing so it never reads as a loop.
- (3) Live synaptic electricity: replaced point "dots" with line-segment electrical bolts — varied speed, brightness and trail length; bolts branch into child bolts at synaptic junctions (split/merge feel) following the real connection graph.
- (4) Knowledge Graph reveal (press **G**): brain particles drift outward and fade (shader `uReveal`) while a representative Executive Knowledge Graph fades/scales in — labelled entity nodes (Executive Core hub + Memory, Evidence, Decision, Recommendation, Project, Person, Team, Lead, Customer, Meeting, Task, Event) with edges that animate (grow) into place and a live legend; press G again to fold back.
- (5) Reasoning Journey (press **SPACE**): a scripted 5-stage sequence — Memory Search → Evidence Gathering → Reasoning → Confidence → Recommendation — driven purely by behaviour (region activation, pathway travel, confidence stabilising, a closing energy wave + executive flash), with a subtle stage banner.
- (6) Energy waves: a soft travelling front periodically sweeps one lobe (shader, exp-falloff around a moving z-front).
- (7) Particle trails: bolts render head→tail with an alpha gradient, giving fading motion trails without clutter.
- (8) Executive spotlight: camera gently leans toward the active region AND the depth-of-field `target` tracks it (focus follows cognition); non-active regions dim.
- (9) Micro details: a faint floating dust layer (~130 motes, separate from neurons), slow bloom shimmer, and very slow HSL colour evolution of the void.
- (10) Presentation loop: after 30s with no interaction the brain auto-enters demo styling and runs a gentle looping sequence (journey → idle → graph reveal → idle) with a slow camera orbit; any interaction exits it.
- Verified: production `vite build` passes (only the pre-existing Three.js chunk-size advisory); backend `node --test` suite unaffected (461/461 pass); headless run confirmed D/G/SPACE all work with zero shader-compile or runtime errors (screenshots show full-screen demo mode, the staged journey banner, and the labelled knowledge-graph reveal).
- Known limitations: (1) the knowledge-graph reveal uses a representative entity layout in the viz, not a live read of the PIF-4 graph (wiring it to real entities is a later step). (2) Presentation loop and cognition remain simulated, not backend-driven. (3) No new post-processing passes were added (kept for performance).

## 2026-06-13 — PIF-7 "The Living Mind" — signature presentation system (shipped)

- Evolved the brain into a true living connectome and the signature visual identity of the AI ecosystem. Particle count unchanged (3,500 neurons); the connectome grew to ~16,000 animated neural fibres (organised local networks + structured long-range fibre bundles between semantically linked regions — bundles, not spaghetti). Production build passes; capped DPR at 1.75 for headroom.
- 14 named knowledge regions, each with its own colour, breathing rhythm, density and electrical behaviour: Reasoning, Coach's Eye, Travel, Website Lead, Personal, Memory, Learning, Evidence, Recommendations, Projects, People, Knowledge, Simulations, Goals. Regions communicate continuously (subconscious chatter lights inter-region fibres).
- Live electricity: constant background impulses; every several seconds a STORM — a large pulse — propagates across multiple regions via the region graph (BFS with delays), igniting each region and lighting the fibre bundle it travels along; the whole brain reacts. Electrical bolts are line-segments with trails that branch/merge along real fibres.
- Thought Journey (SPACE): a full 12-stage cognition sequence — Question → Memory Search → People → Projects → Evidence → Reasoning → Simulation → Confidence → Recommendation → Approval → Learning → Memory Updated — visibly moving through the nervous system (each stage activates its region, lights the fibre from the previous stage, and confidence climbs), with a stage banner.
- Knowledge Graph (G): the particle brain dissolves into a 3D graph of REAL entities in clustered communities (People: Simon/Manon/Nick; Coach's Eye: Belgium Rugby/Players/Teams/Videos; Travel: Travel App/Trips/Documents/Calendar; Website Lead: Customers/Emails/Leads; Intelligence: Reasoning/Evidence/Recommendations/Memory/Learning/Knowledge; Work: Projects/Goals/Meetings/Simulations/Approvals) with labelled nodes, animated growing edges, breathing communities, and HOVER DISCOVERY (hovering a node illuminates it + its neighbourhood and dims the rest).
- Cinematic camera: always-on micro-drift and sway, slow orbit, gentle zoom breathing, depth-of-field target that follows the active region; never static.
- Presentation mode after 20s idle: UI fades, brain expands near full-screen with a radial vignette, ambient motion and slow orbit increase, and it auto-runs a looping sequence (journey → storm → graph reveal → idle). It demonstrates itself.
- Architecture: no new AI/engine; this is purely making the existing intelligence visible. Region names map onto the platform's real domains; the graph entities mirror the PIF-4 knowledge-graph entity model.
- Verified: production `vite build` passes; backend `node --test` 461/461 pass; headless capture confirmed the dense connectome, the 12-stage journey banner ("3/12 People"), and the labelled 3D knowledge graph with zero shader-compile/runtime errors.
- Demo: open the Home route (`/`), press D (presentation), SPACE (thought journey), G (knowledge graph), hover/click to explore; leave it 20s and it presents itself.
- Known limitations: (1) graph entities + cognition are a representative live simulation, not yet a live backend feed (wiring to PIF-3/4/5 is a later step). (2) Long-range fibres use additive lines (no geometry shader tubes) to preserve frame rate.
