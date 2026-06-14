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

## 2026-06-14 — Travel Intelligence Itinerary Platform Foundation (M7)

- Added the deterministic Itinerary Platform foundation at `lib/itinerary-platform/`.
- Consumes a Trip Intelligence trip-plan snapshot and turns it into an editable, versioned, multi-day itinerary without mutating the Trip Intelligence Platform or any upstream domain. No AI/LLMs, no external APIs, maps, or providers.
- Each day carries ordered Morning / Afternoon / Evening sections plus a rain-day alternatives list; each section holds ordered, editable blocks and every block has an editable notes field.
- Supports block types: activity, transport placeholder, meal placeholder (breakfast/lunch/dinner/snack), rest period, free-time block, and rain-day alternative. Generated days are complete editable skeletons and fall back to free-time blocks for empty activity slots.
- Added editing APIs: add/update/remove/move blocks, set block notes, add rain-day alternatives, create from trip plan, create blank skeleton, and list by trip / by owner.
- Added draft/published lifecycle: publishing snapshots the published state; editing a published itinerary reopens it as a draft so published snapshots are preserved.
- Added append-only version history — every create/edit/publish/revert appends an immutable snapshot; `revertToVersion` restores a snapshot's days/title/status by creating a new version rather than deleting later ones.
- Added privacy validation that rejects exact traveller location-style inputs on every entry point.
- Added adapter-based in-memory repository (`InMemoryItineraryRepository`), audit events, README documentation, and comprehensive automated tests (`test/travel-itinerary-platform.test.js`).
- Verified: full `node --test` suite passes (444/444); travel platform suite 85/85; no existing platform modified.

## 2026-06-14 — Travel Intelligence Travel Memory Platform Foundation (M8)

- Added the deterministic Travel Memory Platform at `lib/travel-memory-platform/` for durable long-term traveller preference memory. No AI, LLMs, embeddings, or external APIs — confidence, decay, and polarity changes are pure functions of explicit input and deterministic observation counts.
- Memory identity is `(travellerIdentityId, key, value)`. Each record supports: explicit (traveller-entered) and learned (behaviour-derived) origin; positive and negative preferences; confidence score; observation count; first observed; last confirmed; decay (freshness) score; manual correction with retained prior state; manual lock that blocks automatic updates; explainable snapshots; append-only audit history; and append-only version history.
- Deterministic rules: explicit input is authoritative (base 0.9) and applies even when locked; same-polarity learned observations reinforce (+0.1, cap 0.95); opposite observations weaken (−0.1) and flip polarity (reset to learned base 0.4) when confidence collapses to ≤ the flip threshold (0.2); locked memories ignore learned observations and are exempt from decay; decay is a linear 180-day freshness recomputed from `lastConfirmed` and a supplied `asOf` timestamp.
- Consumes immutable snapshots from other platforms via `recordFromSnapshot` (reads a plain snapshot object + derived `{key,value,polarity}` signals, records `snapshotType`/`snapshotId` provenance) — no upstream module is imported or mutated, preserving the clean-interface boundary.
- Added APIs: record explicit memory, observe learned memory, record from snapshot, manual correct, lock/unlock, apply decay, get/list (with polarity/origin/key/minConfidence filters), explain memory, version history, and audit events.
- Added privacy validation that rejects exact traveller location-style inputs and snapshots on every entry point.
- Added adapter-based in-memory repository (`InMemoryTravelMemoryRepository`), audit events, README documentation, and comprehensive automated tests (`test/travel-memory-platform.test.js`).
- Verified: full `node --test` suite passes (456/456); travel platform suite 97/97; no existing platform modified.

## 2026-06-14 — Travel Intelligence Companion Discovery Platform Foundation (M9)

- Added the deterministic, privacy-first Companion Discovery Platform at `lib/companion-discovery-platform/`. It lets travellers discover compatible nearby travellers without exposing exact locations. No AI, LLMs, embeddings, or external APIs.
- Privacy & safety are first-class: no exact GPS is ever stored or returned (profiles hold a broad `approximateArea` label + canonical `destinationId` only); coordinate-style fields and coordinate-like area strings are rejected on every entry point; opt-in is required and opt-out is absolute; a seeker must be opted in to discover (no lurking); blocked travellers never appear in either direction; and visibility controls (`everyone`, `same_destination`, `same_area`, `hidden`) gate discoverability.
- Supports traveller discovery by approximate area, shared destination matching, shared activity interests, and overlapping travel dates; deterministic compatibility scoring over Traveller Preferences + Travel Memory snapshots (shared activities/styles/positive-memory tags, with a penalty for conflicting memory tags), plus shared statuses and an `available_today` boost. Every result is explainable with `explanation` + `sourceFactors`.
- Traveller statuses: looking for dinner, diving, surfing, exploring, photography, coffee, and available today.
- Consumes immutable snapshots via `deriveProfileFieldsFromSnapshots({ preferences, memories })` — reads plain Traveller Preferences and Travel Memory snapshot objects and returns privacy-safe discovery fields; no upstream module is imported or mutated and no location is carried over.
- Added APIs: derive-from-snapshots, create/update profile, opt in/out, set statuses, set visibility, block/unblock traveller, get by id / by traveller, discover companions (with `requireStatus` and `onlySharedDestination` filters), and audit events.
- Added adapter-based in-memory repository (`InMemoryCompanionDiscoveryRepository`, which never decides discoverability — all opt-in/visibility/block filtering lives in the service), audit events, README documentation, and comprehensive automated tests (`test/travel-companion-discovery-platform.test.js`).
- Verified: full `node --test` suite passes (468/468); travel platform suite 109/109; no existing platform modified.

## 2026-06-14 — Travel Intelligence Traveller Identity Platform (M10)

- Added the Traveller Identity Platform at `lib/traveller-identity-platform/` as a zero-storage, travel-facing identity **port and projection** (Option 3). It lets travel modules resolve and validate a `travellerIdentityId` safely without importing `lib/identity-platform/` directly.
- Architecture decision: M10 creates **no second traveller entity, store, or id space**. The canonical traveller remains the existing universal identity record (`idn_*` id, `PERSON` type, `TRAVELLER` role, `ACTIVE` status, with the identity module's own privacy settings, trust, reputation, and verification). M10 owns no canonical data and has no repository.
- Implemented the `IdentitySourceAdapter` port (the sole seam to identity data) and the default `IdentityPlatformSourceAdapter`, which wraps an **injected** identity-platform instance and reads only `readIdentity(id, { view: 'public' })` — so internal/PII fields never reach M10 and there is no module-level coupling to the identity module.
- Implemented `createTravellerIdentityPlatform({ identitySource })` exposing `resolveTraveller(id)`, `assertActiveTraveller(id)`, `getTravellerView(id)`, and `isTraveller(id)`.
- Validation: a valid traveller must exist, be `ACTIVE` (suspended → `IDENTITY_INACTIVE`; soft-deleted/missing → `TRAVELLER_NOT_FOUND`), have the `TRAVELLER` role (else `NOT_A_TRAVELLER`), and be `PERSON` type where the snapshot provides it (else `NOT_A_TRAVELLER`). The projection is deterministic and exposes only privacy-safe fields, honoring the identity's privacy-applied public view.
- Strict rules held: `lib/identity-platform/` is unchanged; the 9 existing travel modules are NOT retrofitted (they still use raw `travellerIdentityId` strings); no travel module imports identity-platform; M10 consumes identity snapshots through the injected adapter only.
- Files changed: new `lib/traveller-identity-platform/` (`identity-source.js`, `service.js`, `constants.js`, `errors.js`, `index.js`, `README.md`); new `test/travel-traveller-identity-platform.test.js` (12 tests using both a fake identity source and a real identity-platform instance); this `PROJECT_STATUS.md` entry.
- Verified: full `node --test` suite passes (480/480); travel platform suite 121/121; decoupling confirmed (no `identity-platform` import in module source — only in the test composition root); no existing platform modified.
- Risks: (1) adoption gap — exposing the port does not enforce it; ids are still trusted until modules adopt `assertActiveTraveller`; (2) coupling creep — the adapter must remain the sole seam; (3) coarse lifecycle detection — soft-deleted maps to `TRAVELLER_NOT_FOUND` because the public view returns null (richer status needs an actor-gated internal read); (4) privacy-view tension — fields hidden by identity privacy settings (e.g. timezone) cannot be projected by design.
- Recommended M11: phase in `assertActiveTraveller` adoption at the boundary of existing travel modules, one module at a time (starting with `trip-platform`), keeping the suite green — closing the adoption gap without a big-bang refactor.

## 2026-06-14 — Traveller Identity Adoption Phase 1 (M11)

- Began phased adoption of the M10 Traveller Identity port by wiring `assertActiveTraveller` into exactly one existing travel module: `lib/trip-platform/`. No big-bang refactor; no other travel module changed.
- Module adopted: `trip-platform`. Selected as the safest first target because `createTrip` is the binding point where a `travellerIdentityId` (as `ownerIdentityId`) first enters the system and is persisted — a single, narrow boundary with the highest value-per-change, an existing DI seam, and trivial backward compatibility.
- Architecture decision: validation is injected via dependency injection — `createTripPlatform({ repository, travellerIdentityPlatform })`. The M10 port is injected, never imported, so trip-platform remains fully decoupled from `lib/identity-platform/`. When `travellerIdentityPlatform` is not injected, behaviour is identical to before (backward compatible), which is why all pre-existing tests stay green. The single boundary check runs in `createTrip` just before persistence (after existing field/permission checks, preserving error precedence) and validates the trip owner even for privileged actors. The port's deterministic typed errors (`TRAVELLER_NOT_FOUND` / `IDENTITY_INACTIVE` / `NOT_A_TRAVELLER`) propagate unwrapped.
- Scope held: only `createTrip` validates (the creation/binding boundary); mutations are not re-validated in Phase 1 by design. No store, no new identity data, no traveller records created, no exact GPS, repository unchanged, identity-platform and traveller-identity-platform unchanged.
- Files changed: `lib/trip-platform/service.js` (DI + guarded helper + one `assertActiveTraveller` call); `test/travel-trip-platform.test.js` (7 new tests added, all originals preserved); this `PROJECT_STATUS.md` entry.
- Tests: trip-platform 17/17 (10 original + 7 new: valid traveller accepted, missing/inactive/non-traveller rejected, behaviour preserved with no port, misconfigured port rejected, and an automated guard asserting trip-platform source imports no identity module directly). Travel suite 128/128. Full `node --test` suite 487/487. Decoupling grep confirms no `identity-platform` reference in trip-platform source.
- Risks: (1) adoption is still partial — 8 travel modules continue to trust raw ids until phased in; (2) creation-only validation means an owner suspended/deleted after trip creation is not re-checked on mutation (deliberate Phase 1 scope); (3) callers must remember to inject the port — an un-injected platform silently skips validation (backward-compat trade-off).
- Recommended M11 Phase 2: adopt the port in `itinerary-platform` (M7) at `createItineraryFromTripPlan`/`createBlankItinerary`, or in `traveller-preferences-platform` at profile creation — both are owner-binding boundaries with the same injected-port pattern.

## 2026-06-14 — Universal Travel Timeline Platform (M12)

- Added the Universal Travel Timeline Platform at `lib/travel-timeline-platform/` — the chronological backbone for the whole travel ecosystem. Phased identity adoption (M11) is paused; this is a new foundational platform. Deterministic; no AI, LLMs, embeddings, GPS, or external APIs.
- Reference-only by design: the timeline owns chronology, not business data. Each event stores `timelineEventId`, `travellerIdentityId`, optional `tripId`, `eventType`, `sourcePlatform`, `sourceEntityId`, `timestamp`, `importance`, `visibility`, `status`, optional `confidence`, `metadata`, and `recordedAt`. The source platform stays authoritative — consumers follow `sourcePlatform` + `sourceEntityId` back to the owner, so the timeline can never drift from or duplicate source data.
- Supported event types (closed vocabulary + escape hatch): trip_created, trip_updated, destination_added, booking_planned, booking_confirmed, accommodation, flight, transport, activity, memory_created, recommendation_generated, companion_match, notification, photo_imported, journal_entry, custom. `sourcePlatform` is an OPEN slug namespace on purpose — adding the 101st publisher never requires editing the module.
- Immutability & corrections: events are immutable and the repository has no update/delete method (no mutate path exists at the storage layer). `correctEvent` appends a NEW superseding event linked by `correctsEventId` (identity fields cannot change); `redactEvent` appends a `redacted` superseding event with cleared metadata while keeping the chronological slot. Queries return the effective timeline (superseded originals hidden by default, with a derived `effectiveStatus`/`superseded` flag and an `includeSuperseded` option for full history). Every append/correct/redact writes an append-only audit record.
- Duplicate prevention via optional `idempotencyKey` (re-append throws `DUPLICATE_TIMELINE_EVENT`); without a key, genuinely repeatable events (e.g. trip_updated) are allowed.
- Query API: a single future-friendly `query(filter)` with named wrappers — by traveller, by trip, by date range, by source platform, by event type — plus `groupByDay` and `groupByTrip`. Filters: traveller, trip, sourcePlatform, eventType, importance, visibility, status, from/to, includeSuperseded, includeRedacted, order (asc/desc), limit. Output is deterministic (timestamp → recordedAt → id).
- Architecture decision: built for the next decade (100 modules, 10M+ events, multiple products, future AI summarisation/notifications/journals/memories/bookings/companions) — event-sourced immutability, reference-only storage, dumb append-only repository, open publisher namespace, and a single filter-driven read surface.
- Files changed: new `lib/travel-timeline-platform/` (`index.js`, `service.js`, `repository.js`, `constants.js`, `errors.js`, `README.md`); new `test/travel-travel-timeline-platform.test.js` (12 tests: creation, ordering, immutability, duplicate prevention, references/filters, grouping, corrections, redaction, audit, validation, determinism); this `PROJECT_STATUS.md` entry.
- Verified: full `node --test` suite passes (503/503); travel platform suite 140/140; no existing platform modified.
- Risks: (1) in-memory only — production needs a real append-only event-store adapter, and the current `query` reads an index then filters in-memory (needs server-side indexing/pagination at 10M+ scale); (2) `metadata` is structurally validated (object, no GPS) but cannot be semantically guaranteed free of business data — publisher discipline required; (3) correction chains are single-hop in the effective view (correcting an already-superseded original is allowed but not collapsed) — acceptable for the foundation, revisit if deep chains appear; (4) no cross-instance ordering guarantees beyond the deterministic sort keys.
- Recommended M13: a thin **timeline publisher adapter** so existing platforms emit reference events on their write boundaries via dependency injection (same injected-port pattern as M11) — starting with `trip-platform` (trip_created/updated) and `itinerary-platform` — without coupling those modules to the timeline.

## 2026-06-14 — Universal Travel Relationship Graph (M13)

- Added the Universal Travel Relationship Graph at `lib/travel-relationship-graph/` — the canonical relationship model under the whole travel platform (not a visualisation, not AI). Timeline publishers (M13-original recommendation) are paused; no existing module retrofitted. Deterministic; no AI, LLMs, GPS, or external APIs.
- Reference-only by design: the graph owns RELATIONSHIPS (edges) only. A node is a pure reference `{ type, id }` to a fact owned authoritatively by a source platform — nodes carry no business data and are implied by the edges that reference them, so the graph can never duplicate or drift from source data.
- Entity types are an OPEN slug namespace (traveller, trip, country, city, destination, accommodation, transport, flight, booking, memory, photo, journal, companion, recommendation, timeline_event, and any future entity — no code change needed). Relationship types are a closed vocabulary + `custom`: visited, planned, booked, remembered, travelled_with, located_in, generated, references, created, related_to, owns, attached_to, connected_to. `travelled_with`/`connected_to`/`related_to` are symmetric and default to undirected; others default directed.
- Operations: create relationship, delete relationship, get relationship, query neighbours (direction out/in/both + type filter), query by relationship type, query entity graph (reachable subgraph + induced edges within depth), query graph depth (nodes grouped by BFS distance), query shortest path (fewest hops). All traversal is cycle-safe (BFS visited-set) and deterministic (sorted by stable keys, never insertion order).
- Duplicate prevention rejects an equivalent edge (same from/to/type, and the reverse for undirected) with `DUPLICATE_RELATIONSHIP`; different relationship types between the same nodes are allowed.
- Architecture decision: built for the next decade (100 modules, 100M+ relationships, later AI reasoning, later Digital Twin). The Digital Twin is intended to be a projection over this graph — which is why relationships must exist exactly once here. Repository stays dumb (edge store + two adjacency indexes); all business logic (dedup, direction, traversal, ordering) lives in the service.
- Files changed: new `lib/travel-relationship-graph/` (`index.js`, `service.js`, `repository.js`, `constants.js`, `errors.js`, `README.md`); new `test/travel-travel-relationship-graph.test.js` (11 tests: creation, symmetric defaults, duplicate prevention incl. undirected reverse, neighbour/direction/type queries, query-by-type, cycle-safe entity graph + depth grouping, deterministic shortest path incl. self/unreachable, deletion + audit, deterministic ordering, future-entity compatibility, validation/location rejection); this `PROJECT_STATUS.md` entry.
- Verified: full `node --test` suite passes (538/538); travel platform suite 151/151; no existing platform modified.
- Risks: (1) in-memory only — production needs a real graph/SQL adapter; current traversal/`queryByRelationshipType` scan in-memory and need server-side indexing/pagination at 100M+ scale; (2) `metadata` is structurally validated (object, no GPS) but cannot be semantically guaranteed free of business data — publisher discipline required; (3) graph is unweighted, so shortest path is fewest-hops only (no cost/recency weighting yet); (4) no cross-instance ordering guarantees beyond the deterministic sort keys.
- Recommended M14: a **graph projection / read-model layer** (e.g. a Traveller Digital Twin view) that composes the relationship graph (M13) with the timeline (M12) and the traveller-identity port (M10) into a single deterministic, reference-following read surface — still no business-data duplication, still no AI — as the substrate a later AI/reasoning layer would consume.

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
