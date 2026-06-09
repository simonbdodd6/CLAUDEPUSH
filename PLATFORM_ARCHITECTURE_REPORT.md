# Coach's Eye — AI Platform Integration Layer
## Architecture Report

**Generated:** 2026-06-09T13:02:39.413Z

---

## Overview

The Platform Integration Layer connects every Coach's Eye engine into one intelligent platform.
The **AI Copilot is the single entry point** — it accepts any natural language request, detects
the required pipeline, executes engines in dependency order, and returns one unified response.

---

## System Architecture


╔══════════════════════════════════════════════════════════════════════╗
║              COACH'S EYE PLATFORM — ENGINE DEPENDENCY MAP            ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║   ┌─────────────────────────────────────────────────────────────┐   ║
║   │  🤖  AI Copilot  ←  SINGLE ENTRY POINT  (Platform Layer)   │   ║
║   └──────────────────────────┬──────────────────────────────────┘   ║
║                              │                                       ║
║          ┌───────────────────┼──────────────────────┐               ║
║          │                   │                       │               ║
║   ┌──────▼──────┐   ┌────────▼───────┐   ┌──────────▼──────────┐   ║
║   │  Workflow   │   │  Knowledge     │   │  Club Intelligence  │   ║
║   │  Engine     │   │  Engine        │   │  Engine             │   ║
║   └──────┬──────┘   └────────┬───────┘   └──────────┬──────────┘   ║
║          │                   │                       │               ║
║   ┌──────▼──────┐   ┌────────▼───────┐              │               ║
║   │  Coaching   │   │  Data          │              │               ║
║   │  Engine     │   │  Integration   │              │               ║
║   └──────┬──────┘   └────────────────┘              │               ║
║          │                                           │               ║
║   ┌──────▼──────┐   ┌─────────────────┐             │               ║
║   │   Player    │   │  Communications │◄────────────┘               ║
║   │  Dev Engine │   │  Engine         │                              ║
║   └─────────────┘   └─────────────────┘                             ║
║                              ▲                                       ║
║                    ┌─────────┴─────────┐                            ║
║                    │                   │                             ║
║             ┌──────┴──────┐   ┌────────┴───────┐                   ║
║             │   Memory    │   │  Executive     │                   ║
║             │   Engine    │   │  Dashboard     │                   ║
║             └─────────────┘   └────────────────┘                   ║
║                                                                      ║
╠══════════════════════════════════════════════════════════════════════╣
║  FOUNDATION LAYER  │  Memory Engine · Data Integration              ║
║  DOMAIN LAYER      │  Coaching · Player Dev · Club Intelligence      ║
║  INTEGRATION LAYER │  Workflow · Communications · Knowledge          ║
║  PRESENTATION LAYER│  Executive Dashboard · AI Copilot               ║
╠══════════════════════════════════════════════════════════════════════╣
║  PLATFORM LAYER    │  Registry · Contracts · Events · Orchestrator   ║
╚══════════════════════════════════════════════════════════════════════╝


---

## Platform Components

```
platform/
├── index.js                   ← Public API: ask(), checkHealth(), runDiagnostics()
├── platform-registry.js       ← Engine catalogue: 10 engines, capabilities, dependencies
├── platform-contracts.js      ← Standard PlatformRequest / PlatformResponse shapes
├── platform-entities.js       ← Canonical entity models (Player, Team, Injury, etc.)
├── platform-events.js         ← Event bus: 32 event types, pub/sub, JSONL audit log
├── platform-errors.js         ← Standard error types with codes and JSON serialisation
├── platform-health.js         ← Parallel health checks on all 10 engines
├── platform-orchestrator.js   ← Multi-engine pipeline execution (phases, parallel, deps)
├── platform-map.js            ← Dependency graph, topological sort, ASCII renderer
└── platform-diagnostics.js    ← Full system check: health + deps + caps + smoke tests
```

---

## Registered Engines

| Engine | ID | Capabilities | Dependencies |
|---|---|---|---|
| **Memory Engine** | `memory-engine` | 7 | — |
| **Data Integration Layer** | `data-integration` | 8 | — |
| **Coaching Engine** | `coaching-engine` | 4 | memory-engine |
| **Player Development Engine** | `player-development` | 5 | memory-engine, coaching-engine |
| **Workflow Engine** | `workflow-engine` | 4 | memory-engine, coaching-engine |
| **Communications Engine** | `communications-engine` | 8 | memory-engine, data-integration |
| **Club Intelligence Engine** | `club-intelligence` | 5 | memory-engine |
| **Knowledge Engine** | `knowledge-engine` | 6 | memory-engine, data-integration, club-intelligence, communications-engine |
| **Executive Dashboard** | `executive-dashboard` | 4 | memory-engine, data-integration, club-intelligence, communications-engine, workflow-engine, knowledge-engine |
| **AI Copilot** | `ai-copilot` | 4 | memory-engine, coaching-engine, player-development, workflow-engine, communications-engine, knowledge-engine |

---

## Dependency Layers

## Engine Dependency Report

### Layer 0: Foundation (no deps)
- **Memory Engine** — 7 capabilities · no dependencies · used by: [coaching-engine, player-development, workflow-engine, communications-engine, club-intelligence, knowledge-engine, executive-dashboard, ai-copilot]
- **Data Integration Layer** — 8 capabilities · no dependencies · used by: [communications-engine, knowledge-engine, executive-dashboard]

### Layer 1: Domain Layer
- **Coaching Engine** — 4 capabilities · deps: [memory-engine] · used by: [player-development, workflow-engine, ai-copilot]
- **Communications Engine** — 8 capabilities · deps: [memory-engine, data-integration] · used by: [knowledge-engine, executive-dashboard, ai-copilot]
- **Club Intelligence Engine** — 5 capabilities · deps: [memory-engine] · used by: [knowledge-engine, executive-dashboard] _(optional)_

### Layer 2: Integration Layer
- **Player Development Engine** — 5 capabilities · deps: [memory-engine, coaching-engine] · used by: [ai-copilot] _(optional)_
- **Workflow Engine** — 4 capabilities · deps: [memory-engine, coaching-engine] · used by: [executive-dashboard, ai-copilot]
- **Knowledge Engine** — 6 capabilities · deps: [memory-engine, data-integration, club-intelligence, communications-engine] · used by: [executive-dashboard, ai-copilot] _(optional)_

### Layer 3: Presentation / AI Layer
- **Executive Dashboard** — 4 capabilities · deps: [memory-engine, data-integration, club-intelligence, communications-engine, workflow-engine, knowledge-engine] · no dependents _(optional)_
- **AI Copilot** — 4 capabilities · deps: [memory-engine, coaching-engine, player-development, workflow-engine, communications-engine, knowledge-engine] · no dependents

**Total:** 10 engines · 24 dependencies · max depth 3

---

## Engine Health (latest run)

| Engine | Status | Time | Details |
|---|---|---|---|
| **Memory Engine** | ✅ healthy | 506ms | {"status":"ok","checkedAt":"2026-06-09T13:02:39.20 |
| **Data Integration Layer** | ❌ unhealthy | 454ms | {"error":"Duplicate export of 'getDataPermissions' |
| **Coaching Engine** | ✅ healthy | 495ms | {"available":true} |
| **Player Development Engine** | ✅ healthy | 379ms | {"available":true} |
| **Workflow Engine** | ✅ healthy | 340ms | {"available":true} |
| **Communications Engine** | ✅ healthy | 309ms | {"available":true} |
| **Club Intelligence Engine** | ✅ healthy | 284ms | {"score":52} |
| **Knowledge Engine** | ✅ healthy | 256ms | {"healthy":true,"coverage":100,"liveRatio":71,"tot |
| **Executive Dashboard** | ✅ healthy | 165ms | {"available":true} |
| **AI Copilot** | ✅ healthy | 101ms | {"available":true} |

**Platform status: UNHEALTHY**

---

## Orchestration Pipelines

The orchestrator maps natural language → pipeline → parallel engine phases → unified response.

### Available Pipelines

#### `training_prepare` — Prepare Training Session
- **Phase: gather** → engines: [memory-engine, knowledge-engine] (parallel)
- **Phase: generate** → engines: [ai-copilot] (sequential)
- **Phase: communicate** → engines: [communications-engine] (sequential, optional)

#### `health_report` — Club Health Report
- **Phase: intelligence** → engines: [club-intelligence, knowledge-engine] (parallel)
- **Phase: dashboard** → engines: [executive-dashboard] (sequential, optional)

#### `player_profile` — Player Profile & Development
- **Phase: memory** → engines: [memory-engine] (sequential)
- **Phase: analysis** → engines: [player-development, knowledge-engine] (parallel, optional)

#### `injury_assessment` — Squad Injury Assessment
- **Phase: medical** → engines: [knowledge-engine, memory-engine] (parallel)

#### `communications_pack` — Weekly Communications Pack
- **Phase: data** → engines: [memory-engine, data-integration, knowledge-engine] (parallel)
- **Phase: build** → engines: [communications-engine] (sequential)

#### `general` — General Query
- **Phase: answer** → engines: [ai-copilot] (sequential)


### Orchestrator Test Results

| Query | Pipeline | Engines Used | Time | Result |
|---|---|---|---|---|
| "Prepare Thursday's U14 training." | training_prepare | memory-engine, knowledge-engine, ai-copilot, communications-engine | 54ms | ✅ |
| "Summarise club health." | health_report | club-intelligence, knowledge-engine, executive-dashboard | 22ms | ✅ |
| "Show all injured props." | injury_assessment | memory-engine, knowledge-engine | 5ms | ✅ |

### Example: "Prepare Thursday's U14 training."

```
1. detectPipeline() → training_prepare
2. Phase 1 [PARALLEL]: memory-engine + knowledge-engine
   - Memory: get U14 squad, recent sessions
   - Knowledge: check U14 injuries, recent results
3. Phase 2 [SEQUENTIAL]: ai-copilot
   - Build training session using squad + injury context
4. Phase 3 [OPTIONAL]: communications-engine
   - Draft training reminder for squad
5. mergeResponses() → unified PlatformResponse
   - data.memory-engine: { players, teams }
   - data.knowledge-engine: { injuries, answer }
   - data.ai-copilot: { session, drills, focus }
   - data.communications-engine: { reminderDraft }
   - unified.summary: "Session for U14..."
```

---

## Standard Contracts

### PlatformRequest
```json
{
  "requestId":   "req-1234567890-1",
  "intent":      "training_prepare",
  "payload":     { "text": "Prepare Thursday's U14 training." },
  "context":     { "entities": { "ageGroup": "U14" } },
  "role":        "coach",
  "requestedAt": "2026-06-09T14:00:00.000Z",
  "source":      "platform"
}
```

### PlatformResponse
```json
{
  "requestId":   "req-1234567890-1",
  "success":     true,
  "data":        { "memory-engine": { ... }, "ai-copilot": { ... } },
  "error":       null,
  "meta": {
    "engine":    "platform",
    "durationMs": 420,
    "confidence": 85,
    "isMock":    false,
    "citations": [ { "engine": "memory-engine", "fact": "14 players in U14 squad" } ]
  }
}
```

---

## Shared Entity Models

| Entity | Fields | Version |
|---|---|---|
| **Player** | 11 | 1.0.0 |
| **Team** | 12 | 1.0.0 |
| **Injury** | 12 | 1.0.0 |
| **TrainingSession** | 15 | 1.0.0 |
| **Fixture** | 11 | 1.0.0 |
| **Sponsor** | 10 | 1.0.0 |
| **Member** | 7 | 1.0.0 |
| **Volunteer** | 9 | 1.0.0 |
| **Communication** | 12 | 1.0.0 |
| **ApprovalCard** | 16 | 1.0.0 |

---

## Event Bus

32 standard event types across 32 domains.

`player.created`, `player.updated`, `player.injured`, `player.cleared`, `player.attended`, `player.absent`, `team.created`, `team.updated`, `team.player_added`, `team.player_removed`, `session.planned`, `session.completed`, `session.cancelled`, `fixture.created`, `fixture.result_recorded`, `communication.drafted`, `communication.approved`, `communication.sent`, `communication.failed`, `workflow.started`, `workflow.completed`, `workflow.failed`, `workflow.step_done`, `approval.requested`, `approval.approved`, `approval.rejected`, `knowledge.queried`, `knowledge.indexed`, `platform.engine_registered`, `platform.engine_health_changed`, `platform.started`, `platform.pipeline_completed`

All events are:
- Emitted synchronously (non-blocking handlers)
- Logged to `memory-engine/data/platform-events.jsonl`
- Available via `getRecentEvents()`, `getEventsByType()`, `getEventsBySource()`

---

## Error Handling

| Error Type | Code | When |
|---|---|---|
| `EngineNotFoundError` | `ENGINE_NOT_FOUND` | Engine ID not in registry |
| `EngineUnavailableError` | `ENGINE_UNAVAILABLE` | Module import failed |
| `EngineTimeoutError` | `ENGINE_TIMEOUT` | Health check / execution timed out |
| `InvalidRequestError` | `INVALID_REQUEST` | Request missing required fields |
| `DependencyFailedError` | `ENGINE_DEPENDENCY_FAILED` | Required dependency engine down |
| `PipelineFailedError` | `PIPELINE_FAILED` | Pipeline phase could not complete |

---

## Diagnostics

```
Platform status:    HEALTHY
Engines:            10 registered
Capabilities:       54 total
Coverage:           100% (8/8 required)
Circular deps:      None
Issues:             3 (0 errors)
```

---

## npm Script

```bash
npm run platform:integration
```

---

## Design Principles

1. **Single entry point** — every request enters via `platform.ask(text)`; the orchestrator decides which engines run.
2. **No logic duplication** — platform layer never reimplements engine logic; it only routes, coordinates, and merges.
3. **Dependency-aware execution** — engines run in topological order; parallel where possible.
4. **Contract-first** — every engine I/O is a `PlatformRequest` / `PlatformResponse`; adapters normalise engine-native shapes.
5. **Observable** — every engine call, event, query, and approval is logged to JSONL.
6. **Graceful degradation** — optional engine failures don't fail required pipelines.
7. **Zero coupling** — engines communicate via the event bus; no engine imports another directly.

---

*Report generated by Coach's Eye Platform Integration Layer v1.0.0*
