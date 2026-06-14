# Universal Travel Relationship Graph

The canonical relationship model under the Travel Intelligence Platform (Milestone M13).

This is **not** a graph visualisation and **not** AI. It is the underlying
relationship layer that every travel platform can reason over: *which things are
connected, and how.* Everything exists exactly once in its source platform; the
graph holds the connections between those things.

## Purpose

Answer relationship questions across the whole ecosystem — "what did this
traveller visit?", "who did they travel with?", "what is this booking attached
to?", "how is this memory connected to that trip?" — without any module needing
to know about any other module's storage.

## Reference-only architecture

The graph stores **edges (relationships) only**. A node is a pure reference:

```
{ type: <entityType>, id: <entityId> }
```

Nodes are not stored as records and carry **no business data** — they are
implied by the edges that reference them. Each relationship stores:

| field | meaning |
|---|---|
| `relationshipId` | `rel_*` id of the edge |
| `fromType` / `fromId` | source entity reference |
| `toType` / `toId` | target entity reference |
| `relationshipType` | closed vocabulary (+ `custom`) |
| `directed` | `true` (A→B) or `false` (A↔B) |
| `metadata` | small reference bag — **not** business data |
| `createdAt` | when the edge was created |

### Entity types (open namespace)

`traveller`, `trip`, `country`, `city`, `destination`, `accommodation`,
`transport`, `flight`, `booking`, `memory`, `photo`, `journal`, `companion`,
`recommendation`, `timeline_event`, … and **any future entity**. Entity types
are an **open slug namespace** — a new entity type works immediately, no code
change. (The "Future Entity" requirement.)

### Relationship types (closed + escape hatch)

`visited`, `planned`, `booked`, `remembered`, `travelled_with`, `located_in`,
`generated`, `references`, `created`, `related_to`, `owns`, `attached_to`,
`connected_to`, `custom`. `travelled_with`, `connected_to`, and `related_to` are
symmetric and default to **undirected**; all others default to directed.

## Graph ownership

- **The graph owns relationships. Source platforms own data.** The graph never
  duplicates business data, so it can never drift from the source of truth.
- **Duplicate prevention:** an equivalent edge (same `from`, `to`, type — and the
  reverse too, for undirected) is rejected with `DUPLICATE_RELATIONSHIP`.
- **Repository is dumb:** it stores edges and two adjacency indexes. All
  decisions (dedup, direction, traversal, ordering) live in the service.
- **Deterministic:** neighbours and traversal results are sorted by stable keys,
  never by insertion order. All traversal is cycle-safe (BFS visited-set).

## Operations

- `createRelationship({ from, to, relationshipType, directed?, metadata? })`
- `deleteRelationship(relationshipId)`
- `getRelationship(relationshipId)`
- `queryNeighbours({ type, id }, { direction?, relationshipType?, limit? })`
- `queryByRelationshipType(relationshipType, { limit? })`
- `queryEntityGraph({ type, id }, { depth?, direction?, relationshipType? })` — reachable subgraph (nodes + induced edges)
- `queryGraphDepth({ type, id }, { maxDepth?, direction? })` — nodes grouped by BFS distance
- `queryShortestPath(from, to, { direction?, relationshipType?, maxDepth? })` — fewest-hops path

`direction` is `out` | `in` | `both` (default `both`; undirected edges are always
bidirectional).

## Future AI consumers

Built to stay correct at 100 modules and 100M+ relationships, and to be the
substrate for later layers without rework:

- **AI reasoning / summarisation** reads the graph to explain how things connect.
- **A Digital Twin** is a projection over this graph — it needs the relationships
  to exist exactly once, which is what this module guarantees.
- Recommendations, journaling, "year in review", and notifications all traverse
  the same edges instead of re-deriving relationships per product.

None of these require the graph to hold business data — they follow references
back to the authoritative source platforms.

## Repository abstraction

State lives behind `InMemoryTravelRelationshipRepository`, a dumb adjacency-index
adapter. A production graph/SQL store can implement the same async surface
without changing the domain service.
