# Coach's Eye — Knowledge Graph Architecture

## Overview

The Knowledge Graph is a Labeled Property Graph (LPG) that acts as the single
source of truth connecting every Intelligence engine. It lives entirely inside
the `feature/nightly-qa-agent` branch under:

```
knowledge-graph/          ← backend modules (Node.js / ES modules)
  graph-model.js          ← type vocabulary: NODE and EDGE enums, meta tables
  graph-store.js          ← in-memory store + JSONL persistence
  graph-builder.js        ← typed factory functions + link helpers + upsert
  graph-query.js          ← BFS traversal + domain-specific queries
  graph-sync.js           ← non-breaking engine integration bridges
  graph-seed.js           ← rich demo seed: ~60 nodes, ~140 edges
  index.js                ← clean public API (re-exports everything)
  data/
    nodes.jsonl           ← persisted node log
    edges.jsonl           ← persisted edge log
```

---

## Data Model

### Nodes (22 types)

Every node carries:
- `id`         — stable unique identifier (e.g. `player-jack`, `rec-001`)
- `type`       — one of the 22 NODE constants
- `label`      — human-readable display name
- `metadata`   — arbitrary property map (position, confidence, etc.)
- `confidence` — 0–100 score (where applicable)
- `source`     — which engine created it
- `clubId`     — multi-club isolation key
- `version`    — auto-incremented mutation counter
- `createdAt`  — ISO timestamp

People: `Coach`, `Player`
Clubs:  `Club`, `Team`, `Season`, `Competition`, `Position`
Events: `Fixture`, `TrainingSession`, `MedicalEvent`, `AttendanceEvent`
Knowledge: `Document`, `Video`, `CoachingPrinciple`, `Theme`, `KnowledgeBase`
Intelligence: `Observation`, `Recommendation`, `Decision`, `IntelligenceEngine`
Training: `Exercise`, `Drill`

### Edges (33 types)

Every edge carries:
- `type`     — one of the 33 EDGE constants
- `from`     — source node id
- `to`       — target node id
- `weight`   — traversal weight (default 1.0)
- `metadata` — arbitrary property map
- `source`   — creator
- `version`  — mutation counter

Selected edge types:
```
COACHES, MEMBER_OF, PART_OF, HAS_POSITION   ← structural
CREATED, UPLOADED, ACCEPTED, DISMISSED      ← authorship / decisions
ATTENDED, PARTICIPATED_IN, PLAYED           ← events
USES, TEACHES, SUPPORTS, REFERENCES        ← knowledge links
CONTRIBUTES_TO, COVERS, MENTIONS           ← document wiring
GENERATED_BY, CREATED_FROM, RESULTED_IN    ← intelligence chain
CONCERNS, OBSERVED_IN, HAS_MEDICAL_EVENT   ← player context
PRECEDES, FOLLOWS, SIMILAR_TO, RELATED_TO  ← temporal / semantic
```

---

## Storage

**In-memory:** Two `Map<id, entity>` instances (`nodes`, `edges`) with an
adjacency index `Map<nodeId, Set<edgeId>>` for O(1) neighbour lookups.

**Persistence:** `flush()` writes append-only JSONL to `data/nodes.jsonl` and
`data/edges.jsonl`. On server restart the store is re-seeded via `bootGraph()`.

**Seeding:** `graph-seed.js` populates ~60 nodes and ~140 edges on first boot.
Subsequent boots are no-ops (guarded by `isSeeded()`).

---

## Traversal

All traversal is BFS over the in-memory adjacency index:

```
expand(nodeId, depth, opts)       → subgraph (nodes + edges within depth hops)
shortestPath(fromId, toId)        → minimal edge sequence between two nodes
search(query, opts)               → full-text search with relevance scoring
```

Domain-specific helpers derive their answers from these primitives:

```
drillsForPrinciple(principleId)   → drills that TEACH the principle
docsForPrinciple(principleId)     → documents that COVER the principle
recsForPlayer(playerId)           → recommendations that CONCERN a player
docsForRecommendation(recId)      → documents REFERENCED by a recommendation
sessionsForExercise(exerciseId)   → sessions that USE an exercise/drill
decisionsForFixture(fixtureId)    → coach decisions linked to a fixture
principlesThisSeason(seasonId)    → coaching principles active this season
```

---

## Integration Bridges (graph-sync.js)

Each Intelligence engine calls the appropriate sync function after its own
logic completes. Sync functions are **idempotent** — safe to call multiple times.

```js
syncRecommendations(recs, { engineId, coachId, teamId })
  → creates Recommendation nodes, wires to engines, players, observations

syncDocument(doc, { coachId, kbId })
  → creates Document node, wires to coach, knowledge base, themes

syncDecision(action, recId, outcome, coachId)
  → creates Decision node, wires rec→decision, coach→decision

syncObservation(obs, fixtureId)
  → creates Observation node, wires to fixture
```

The sync functions **do not change** any existing engine outputs. They enrich
the graph as a side-effect, keeping Core MVP untouched.

---

## API Endpoints

```
GET  /api/graph/nodes           → all nodes (filter: type, clubId, q)
GET  /api/graph/nodes/:id       → single node
GET  /api/graph/edges           → all edges (filter: type, from, to)
GET  /api/graph/stats           → nodeCount, edgeCount, typeCount, edgeCounts
GET  /api/graph/expand/:id      → subgraph BFS from node (depth param, default 2)
GET  /api/graph/query?q=fn&id=  → call any named query function
POST /api/graph/nodes           → add node
POST /api/graph/edges           → add edge
```

---

## React Integration

```js
// Hooks
import { useGraphNodes, useGraphEdges, useGraphStats, useGraphExpand } from '../hooks/useClubData.js'

// Client
import { api } from '../api/client.js'
api.graphNodes(params)          // GET /api/graph/nodes
api.graphEdges(params)          // GET /api/graph/edges
api.graphStats()                // GET /api/graph/stats
api.graphNode(id)               // GET /api/graph/nodes/:id
api.graphExpand(id, depth)      // GET /api/graph/expand/:id
api.graphQuery(queryName, p)    // GET /api/graph/query
```

---

## Developer Graph Viewer (KnowledgeGraphPage)

Route: `/knowledge-graph` (badge: **DEV**, shown in sidebar)

Features:
- **Force-directed SVG** — spring-repulsion simulation (no external library)
- **Node type colour coding** — 22 colours matching NODE_META
- **Click to select** — highlights node + all connected edges + edge labels
- **Double-click to expand** — marks for BFS neighbourhood expansion
- **Drag nodes** — pin any node during drag, release to resume simulation
- **Pan** — drag on canvas background
- **Zoom** — mouse wheel, +/−/1:1 buttons
- **Search** — full-text node search via `/api/graph/nodes?q=`
- **Type filter dropdown** — show only selected type
- **Type toggle sidebar** — click any type to show/hide from canvas
- **Node detail panel** — shows metadata, confidence bar, all edges with navigation

---

## Seed Data Summary

~60 nodes across 17 types, ~140 edges across 25 relationship types:

| Category         | Nodes                                                    |
|------------------|----------------------------------------------------------|
| People           | 1 Coach (Simon Dodd), 6 Players                          |
| Club structure   | 1 Club (Lansdowne FC), 4 Teams, 4 Positions              |
| Season / comp    | 1 Season (2025-26), 2 Competitions                       |
| Fixtures         | 4 (past results + 1 upcoming)                            |
| Training         | 5 Sessions, 5 Drills, 2 Exercises                        |
| Principles       | 8 Coaching Principles                                    |
| Themes           | 8 Themes                                                 |
| Knowledge        | 12 Documents, 2 Knowledge Bases                          |
| Intelligence     | 6 Engines, 5 Observations, 5 Recommendations, 4 Decisions|

---

## Architectural Separation

```
Core MVP (main branch)
  └── No graph dependency. Unchanged.

Coach's Eye Intelligence (feature/nightly-qa-agent)
  ├── knowledge-graph/         ← graph store, builder, query, sync, seed
  ├── knowledge-engine/        ← upload engine, search, mock extraction
  ├── app/api-server.js        ← graph endpoints added here
  └── app/command-centre/
      ├── src/api/client.js    ← graph API methods
      ├── src/hooks/useClubData.js  ← graph hooks
      └── src/pages/KnowledgeGraphPage.jsx  ← developer viewer
```

---

## Future Extensions

- **Coach DNA** — expand Coach node with `EMBODIES` edges to CoachingPrinciple nodes
- **Digital Twin** — Player node tracks wellness scores as metadata mutations
- **Multi-agent** — each agent registers as IntelligenceEngine node; decisions attributed to agent
- **Temporal snapshots** — version counter enables time-travel queries
- **Club DNA** — Club node aggregates `EMBODIES` from all sessions' principles
- **Learning History** — Decision nodes chain via `PRECEDES`/`FOLLOWS` to show how coaching evolved
- **New relationship types** — add to EDGE enum in graph-model.js; backward compatible
