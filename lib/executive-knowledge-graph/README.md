# Executive Knowledge Graph

The shared, **canonical relationship layer** for the entire Executive Intelligence
Platform. Every entity — person, company, project, lead, meeting, task,
recommendation, evidence, decision, memory, event, product, customer — exists
**exactly once**; everything else references it.

It is **domain-agnostic**: Coach's Eye, Website Lead, Wedding, Travel, Hospitality
and future products all participate **without modifying this module**.

## What it is — and is not

- **Is:** the connective tissue. Entities (thin canonical nodes) + relationships
  (temporal, versioned edges) + traversal + derived views.
- **Is not:** another AI / reasoning / memory / recommendation / explanation engine.
  An entity **references** its source of truth via `ref:{engine, externalId}` — it
  never copies the domain record. The owning engine stays authoritative.

## Architecture

```
                        ┌──────────────────────────────────────────────┐
   Domains (owners of    │           EXECUTIVE KNOWLEDGE GRAPH           │
   the real records)     │            (canonical references)            │
                        │                                              │
  memory-engine  ─────► │  Entity ─┐                                    │
  lead-personalisation ►│  Entity ─┼─► Relationship ─► Relationship ─┐  │
  knowledge-engine ────►│  Entity ─┘        (temporal, versioned)    │  │
  identity-platform ───►│  Entity ◄─────────────────────────────────┘  │
  trip-platform  ──────►│                                              │
                        │   Registry (exists-once, versioned, audited) │
                        │        │                                     │
                        │   Traversal: neighbors · bfs · shortestPath  │
                        │              subgraph · asOf (temporal)      │
                        │        │                                     │
                        │   Views: recommendation-dep · decision-dep   │
                        │          evidence-graph · digital-twin       │
                        └──────────────────────────────────────────────┘
                                   ▲                       │
            ref:{engine,externalId}│                       ▼  data only (UI-independent)
            (source of truth stays │            consumers: Executive Reasoning (PIF-3),
             in the owning engine) │            dashboards, future AI capabilities
```

## Determinism & the platform rules

Identity is **content-derived**, never random:

- `entityId = sha1(domain | type | naturalKey)` → the same logical entity always
  collapses to one id (upsert + version, never a duplicate).
- `relationshipId = sha1(from | type | to)` → the same triple is structurally
  impossible to duplicate.

No `Math.random()` / `Date.now()` in identity; the clock is injectable, so builds
are reproducible across processes. Every change is **versioned** (entity &
relationship history) and can be **mirrored to an append-only journal sink** (the
PIF-2 ledger pattern) for audit — the graph itself does no file I/O.

## Universal Entity — every entity supports

`id` · `type` · `domain` · `ref{engine,externalId}` · `owner` · `label` · `status`
· `confidence` · `created` · `updated` · `version` · `relationships[]` · `timeline[]`
· `citations[]` · `approvalHistory[]` · `featureFlags[]` · `attributes{}`

## Usage

```js
import { createExecutiveKnowledgeGraph, ENTITY_TYPE, RELATIONSHIP_TYPE } from './lib/executive-knowledge-graph/index.js';

const kg = createExecutiveKnowledgeGraph();                       // in-memory; inject { clock, sink }
const team = kg.addEntity({ domain: 'coaches-eye', type: ENTITY_TYPE.TEAM, externalId: 'u16', ref: { engine: 'memory-engine', externalId: 'team-u16' } });
const coach = kg.addEntity({ domain: 'platform', type: ENTITY_TYPE.PERSON, externalId: 'simon@coacheye.io' });
kg.addRelationship({ from: coach.id, to: team.id, type: RELATIONSHIP_TYPE.OWNS });

kg.neighbors(coach.id);                  // direct edges
kg.shortestPath(coach.id, team.id);      // path
kg.subgraph(coach.id, { maxDepth: 2 });  // local subgraph
kg.recommendationDependencyGraph();      // derived view (#7)
kg.digitalTwin();                        // canonical grouped snapshot (#10)
```

A worked five-domain example is in `example.js` (`buildExampleGraph()`), documented
in the root `EXECUTIVE_KNOWLEDGE_GRAPH.md`.

## Files

| File | Responsibility |
|---|---|
| `constants.js` | entity / relationship / status / domain registries (open enums) |
| `id.js` | deterministic content-hash identity |
| `entity.js` | Universal Entity model + versioned updates |
| `relationship.js` | temporal, versioned edge model |
| `registry.js` | canonical store: upsert/dedup, version history, incident index, journal sink |
| `traversal.js` | neighbors / bfs / shortestPath / subgraph / dependencies / dependents |
| `views.js` | recommendation-, decision-, evidence-dependency graphs + digital-twin registry |
| `graph.js` | facade |
| `service.js` | factory |
| `example.js` | deterministic cross-domain example |
| `index.js` | public API |
