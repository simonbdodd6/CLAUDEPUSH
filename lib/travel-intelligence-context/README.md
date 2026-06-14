# Travel Intelligence Context Engine

The final deterministic layer before intelligence begins (Milestone M15).

## Purpose

The Context Engine composes the existing travel platforms into a **single
deterministic reasoning context** — one assembled, evidence-tagged view a future
intelligence capability can reason over. It is the boundary between the
deterministic foundation and any future AI: everything below it is fact;
everything above it (reasoning, recommendations, notifications) consumes this.

It owns **no source data, no memory, no identity, no timeline, no graph**. It
persists nothing and has no repository. It only composes.

## Architecture

- **Read-only, reference-aware, deterministic.** No persistence, no AI, no
  reasoning, no recommendations, no GPS, no external APIs.
- **Composes only through injected ports.** It imports no platform directly; it
  mirrors upstream vocabulary as local string literals (the M10/M14 decoupling
  pattern), so platforms evolve independently.
- **Source platforms remain authoritative.** Cross-module entities (trips,
  destinations, companions, accommodation) are surfaced as `{ type, id }`
  references. The memory, preference, and discovery platforms own their data, so
  the engine passes through their authoritative read outputs (projected, not
  copied into any store).

## Platform composition

Inject any subset; identity is required, the rest are optional and degrade
gracefully:

```js
const context = createTravelIntelligenceContext({
  travellerIdentityPlatform,     // REQUIRED (assertActiveTraveller + getTravellerView)
  travellerDigitalTwinPlatform,  // optional
  travelTimelinePlatform,        // optional
  travelRelationshipGraph,       // optional
  travelMemoryPlatform,          // optional
  travellerPreferencesPlatform,  // optional
  companionDiscoveryPlatform,    // optional
});
```

Services:

- `buildContextSnapshot(id, options)` — the full Travel Intelligence Context
- `buildTravellerContext(id)` / `buildTripContext` / `buildRelationshipContext` / `buildMemoryContext`
- `buildEvidenceSummary(id)` / `buildRiskSummary(id)`

## Output

`buildContextSnapshot` returns a deterministic context including: `traveller`,
`currentTripContext`, `travelHistory`, `travelPreferences`, `travelMemory`,
`travelRelationships`, `timelineHighlights`, `companions`, `visitedDestinations`,
`plannedDestinations`, `travelPatterns`, `riskSignals`, `missingInformation`,
`availableEvidence`, `confidenceSignals`, `generatedFrom`, `schemaVersion`,
`contextVersion`, `generatedAt`, `lastUpdated`.

## Evidence philosophy

**Every value is traceable.** `availableEvidence` records which sources
contributed (`identity`, `timeline`, `relationship`, `memory`, `preference`,
`discovery`, `digital_twin`) and how much; `generatedFrom` records which
platforms were present; risk signals carry their `source`. There is no hidden
logic — if a value isn't backed by an evidence source, it isn't in the context.

Information the current ports cannot determine (e.g. emergency contact, which the
identity public view omits; passport data, for which no port exists) is surfaced
**honestly as placeholders** in `missingInformation`, never fabricated as a risk.

## Context versioning

- `schemaVersion` — the context schema (constant per release).
- `generatedFrom` — which platforms contributed.
- `contextVersion` — a deterministic SHA-256 fingerprint of the composed inputs
  (counts + sources + `lastUpdated`); identical inputs always yield the same
  version.
- `generatedAt` / `lastUpdated` — **derived from the underlying data** (latest
  event / relationship / memory / preference / traveller update), never
  wall-clock, so output is fully reproducible.

## Future consumers

- **AI reasoning engines** read one composed, evidence-tagged context instead of
  re-querying and re-joining seven platforms — and can cite evidence sources.
- **Notification engines** watch `riskSignals` / `missingInformation`.
- **Digital Twins** (and multiple of them) can be built on top, as can multiple
  recommendation engines — all without changing this engine or duplicating data.

Because the engine is pure, reference-aware, and deterministic, every layer above
it stays explainable: its inputs are facts with provenance.
