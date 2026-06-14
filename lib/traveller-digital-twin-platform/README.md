# Traveller Digital Twin Read Model

One canonical, read-only view of a traveller's travel world (Milestone M14).

## What this is

The Digital Twin is a **read model, not a store.** It owns no source data, has no
repository, and persists nothing. It is a deterministic projection that composes
three existing platforms through **injected ports only**:

- **M10 Traveller Identity Platform** — who the traveller is (validation + view)
- **M12 Universal Travel Timeline Platform** — what happened, in time order
- **M13 Universal Travel Relationship Graph** — how things are connected

Everything in the twin is **derived from injected platform outputs** as
references. Source platforms remain authoritative; the twin never duplicates
their business data, so it can never drift from them.

## It owns no source data

- No new canonical data, no new store, no new id space.
- Trips, destinations, memories, companions, recommendations etc. are surfaced as
  **references** (`{ type, id }`) — never copied business records. To render full
  detail, a consumer follows the reference back to the owning platform.
- The only "rich" object passed through is the traveller view, which is itself
  M10's privacy-applied projection (not new data).

## Composition & decoupling

The twin imports none of the three platforms directly — it mirrors their
vocabulary as local string literals and calls them through the injected ports,
the same decoupling pattern M10 established. This keeps it swappable and testable
with fakes, and lets the platforms evolve independently.

## The view

`getTravellerTwin` returns a deterministic object:

`traveller`, `timelineSummary`, `relationshipSummary`, `activeTrips`,
`recentTimelineEvents`, `importantEntities`, `companions`, `destinations`,
`memories`, `recommendations`, `riskSignals`, `missingSignals`, `lastUpdated`.

- **Summaries** are counts/rollups (by type, by importance, source platforms, …).
- **References** (`activeTrips`, `companions`, `destinations`, `memories`,
  `recommendations`, `importantEntities`) are `{ type, id }` only.
- **riskSignals** / **missingSignals** are deterministic derived flags (e.g.
  `identity_unverified`, `critical_timeline_event`; `no_timeline_events`,
  `no_companions`, `profile_country_missing`).
- **lastUpdated** is derived from the underlying data (latest event / relationship
  / traveller update) — not wall-clock — so output is fully deterministic.

## API

```js
const twin = createTravellerDigitalTwinPlatform({
  travellerIdentityPlatform, // required
  travelTimelinePlatform,    // required for timeline views (or pass allowPartial)
  travelRelationshipGraph,   // required for relationship views (or pass allowPartial)
});

await twin.getTravellerTwin(id, options);
await twin.getTravellerTimelineView(id, options);     // requires timeline platform
await twin.getTravellerRelationshipView(id, options); // requires graph platform
await twin.getTravellerContextSummary(id, options);   // lightweight combined summary
```

Validation & guarantees:

- `assertActiveTraveller` runs **before** any view is built — inactive,
  suspended, soft-deleted, or non-traveller identities are rejected with the
  identity platform's typed errors.
- A missing required platform **fails clearly** (`CONFIGURATION_ERROR`); the full
  twin and context summary can degrade with `options.allowPartial`, recording the
  gap in `missingSignals`.
- **Deterministic ordering everywhere** — all arrays sort by stable keys, never
  insertion order.
- **No exact-location fields** ever appear in output (defensively scrubbed).

## Future substrate

The twin is the read surface a later **AI reasoning / summarisation** layer,
**smart notifications**, **recommendations**, and **travel summaries / year in
review** would consume — they read one composed view instead of re-querying and
re-joining identity, timeline, and graph themselves. Because the twin is pure and
reference-only, those layers can be added without changing it or duplicating any
source data.
