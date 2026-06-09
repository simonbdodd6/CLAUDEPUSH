# Coach's Eye Orchestrator — Architecture & Test Report

*Generated: 2026-06-09*

---

## What Is This?

The **Coach's Eye Orchestrator** is the brain above every AI system.

It accepts one natural language request, determines automatically which engines are
required, executes them in the correct order, shares context between them, prevents
duplicate work, retries failed steps, and returns a final execution report.

**Spec example handled:**

> "Prepare Thursday's U14 training, check injured players, create a session,
>  generate PDFs, notify coaches and update the season plan."

The Orchestrator detects 4 engines are needed, resolves their execution order,
shares player/injury data on the context bus, and produces a full report.

---

## Architecture

```
orchestrator/
├── index.js                 ← Orchestrator class (EventEmitter) + public API
├── engine-registry.js       ← Plugin registry — engines self-register on import
├── context-bus.js           ← Shared key-value store with provenance tracking
├── request-analyser.js      ← NL → OrchestratorRequest (engines + entities)
├── execution-planner.js     ← Dependency graph → ExecutionPlan (Kahn's topo sort)
├── executor.js              ← Phase-by-phase runner with retry + progress events
├── report-builder.js        ← Markdown execution report builder
└── adapters/
    ├── index.js             ← Bootstrap (imports all → self-register)
    ├── memory-engine.js     ← Foundation data layer
    ├── coaching-engine.js   ← Session and programme generation
    ├── player-development.js← Development scores and injury risk
    ├── rugby-knowledge.js   ← Laws, technique, drills
    ├── discovery-agent.js   ← Prospect discovery (CLI stub)
    ├── market-intel.js      ← Market intelligence (CLI stub)
    ├── lead-personalisation.js ← Lead outreach (CLI stub)
    ├── ai-copilot.js        ← AI synthesis layer
    ├── workflow-engine.js   ← Multi-step workflow execution
    └── club-intelligence.js ← Club-level overview and DoR brief
```

### Data Flow

```
Natural language message
        │
        ▼
  request-analyser.js
  Extract entities, score intent signals, select engines
        │
        ▼
  execution-planner.js
  Build dependency graph (Kahn's topo sort) → phases
        │
        ▼
  context-bus (initialised with request metadata)
        │
        ▼
  executor.js — for each phase:
    ├─ engine.started event
    ├─ adapter.execute(contextSnapshot, options)
    │    └─ reads from bus, calls real engine, returns contextWrites
    ├─ contextWrites committed to bus
    ├─ engine.completed / engine.failed event
    └─ retry on failure (exponential backoff, default 2 retries)
        │
        ▼
  report-builder.js
  Markdown execution report
        │
        ▼
  OrchestrationResult { engines, phases, contextSnapshot, report }
```

---

## Plugin Architecture

New engines require **only a registration call** — no other file needs to change:

```js
// orchestrator/adapters/my-new-engine.js
import { registerEngine } from '../engine-registry.js';

registerEngine({
  name:           'my-new-engine',
  version:        '1.0.0',
  description:    'What this engine does',
  capabilities:   ['my_capability'],
  requiredInputs: [],           // bus keys that MUST exist
  optionalInputs: ['players'],  // bus keys consumed if present
  outputs:        ['myData'],   // bus keys this engine writes
  priority:       65,

  async execute(ctx, opts) {
    // ctx contains: all bus data + ctx._request.{ entities, originalMessage }
    return {
      success:       true,
      data:          rawResult,
      contextWrites: { myData: processedData },
      summary:       'One-line summary',
      evidence:      ['Bullet point 1', 'Bullet point 2'],
      warnings:      [],
    };
  },
});
```

Then add one import line to `adapters/index.js`. That's it.

---

## Context Bus

The context bus is a shared key-value store that engines read from and write to.
It has provenance tracking (which engine wrote which key) and read tracking.

Standard keys populated during a coaching-focused orchestration:

| Key | Producer | Contents |
|-----|----------|---------|
| `players` | memory-engine | All player entities for the request |
| `teams` | memory-engine | All team entities |
| `injuries` | memory-engine | Active injury records |
| `programmes` | memory-engine | Active training programmes |
| `playerAnalysis` | player-development | Dev scores, injury risk, readiness |
| `teamAnalysis` | player-development | Team-level aggregates |
| `injuryRiskSummary` | player-development | High-risk players list |
| `session` | coaching-engine | Generated training session |
| `sessionMarkdown` | coaching-engine | Printable Markdown session |
| `workflowPlan` | workflow-engine | Planned workflow steps |
| `workflowResult` | workflow-engine | Execution result |
| `clubReport` | club-intelligence | Full club report |
| `clubHealth` | club-intelligence | 7-dimension health score |
| `dorBrief` | club-intelligence | Director of Rugby brief |
| `aiResponse` | ai-copilot | Synthesised AI response |
| `aiRecommendations` | ai-copilot | Recommended actions |

---

## Execution Order Example

**Request:** "Prepare Thursday's U14 training, check injured players, create a session, generate PDFs, notify coaches and update the season plan."

**Detected engines:** memory-engine, player-development, coaching-engine, workflow-engine

**Phases (auto-resolved by dependency graph):**

```
Phase 1: memory-engine                  (no deps — produces players, teams, injuries)
Phase 2: player-development             (needs players → injury risk analysis)
Phase 3: coaching-engine                (needs players + injuryRisk → session)
Phase 4: workflow-engine                (needs session → PDF, notify, season update)
```

Each phase can run multiple engines in parallel if their outputs don't depend on each other.

---

## Progress Events

The Orchestrator extends Node EventEmitter. Listen for live progress:

```js
const orch = createOrchestrator();
orch.on('progress', event => {
  // event.type: analysis.complete | plan.ready | engine.started |
  //             engine.completed | engine.failed | engine.retrying |
  //             orchestration.completed
  console.log(event.type, event.engineName, event.durationMs);
});
const result = await orch.run("Prepare Thursday's U14 training...");
```

---

## Retry Logic

- **Default:** 2 retries per engine (configurable via `options.maxRetries`)
- **Backoff:** linear — delay × attempt number (default 400ms base)
- **Deduplication:** engines that already completed successfully in this run are skipped
- **Required inputs:** engines with missing `requiredInputs` are skipped with a warning

---

## Registered Engines

| **memory-engine** | 100 | data_load, player_lookup, team_lookup, memory_read |
| **coaching-engine** | 80 | session_create, rehab_create, programme_generate, drill_lookup |
| **player-development** | 75 | player_analysis, injury_check, development_review, team_analysis |
| **rugby-knowledge** | 60 | rules_knowledge, technique_guidance, drill_lookup |
| **discovery-agent** | 55 | prospect_discovery, market_research |
| **market-intel** | 52 | market_research, competitive_analysis, lead_scoring |
| **lead-personalisation** | 45 | lead_outreach, personalise, email_draft |
| **ai-copilot** | 70 | ai_assist, question_answering, synthesis, recommendation |
| **workflow-engine** | 65 | pdf_generate, notify_coaches, season_update, workflow_execute, schedule_session |
| **club-intelligence** | 72 | club_overview, dor_report, health_score, retention_analysis |

*(Priority: higher = runs earlier within the same dependency tier)*

---

## Test Results (2026-06-09)

**6/6 scenarios completed successfully** (all run as dry-run — no side effects)

### 1. ✓ "Full U14 Thursday training workflow (spec example)"

**Message:** Prepare Thursday's U14 training, check injured players, create a session, generate PDFs, notify coaches and update the season plan.
**Outcome:** DRY_RUN (351ms)
**Engines:** memory-engine, player-development, coaching-engine, workflow-engine
**Phases:** 4

  - ✓ **memory-engine**: [dry-run] memory-engine
  - ✓ **player-development**: [dry-run] player-development
  - ✓ **coaching-engine**: [dry-run] coaching-engine
  - ✓ **workflow-engine**: [dry-run] workflow-engine

### 2. ✓ "Player development + injury review"

**Message:** Analyse all players, check injury risk and flag anyone needing a review.
**Outcome:** DRY_RUN (7ms)
**Engines:** memory-engine, player-development
**Phases:** 2

  - ✓ **memory-engine**: [dry-run] memory-engine
  - ✓ **player-development**: [dry-run] player-development

### 3. ✓ "Club-level Director of Rugby overview"

**Message:** Give me a full club overview for the Director of Rugby — health score, risks, and priorities.
**Outcome:** DRY_RUN (6ms)
**Engines:** memory-engine, club-intelligence
**Phases:** 2

  - ✓ **memory-engine**: [dry-run] memory-engine
  - ✓ **club-intelligence**: [dry-run] club-intelligence

### 4. ✓ "Rugby knowledge + session plan for scrummaging"

**Message:** Build a scrum technique session for the Senior front row.
**Outcome:** DRY_RUN (2ms)
**Engines:** memory-engine, coaching-engine, rugby-knowledge
**Phases:** 2

  - ✓ **memory-engine**: [dry-run] memory-engine
  - ✓ **rugby-knowledge**: [dry-run] rugby-knowledge
  - ✓ **coaching-engine**: [dry-run] coaching-engine

### 5. ✓ "Market intelligence + lead personalisation"

**Message:** Research our market, find leads and generate personalised outreach.
**Outcome:** DRY_RUN (3ms)
**Engines:** market-intel, discovery-agent, lead-personalisation
**Phases:** 3

  - ✓ **discovery-agent**: [dry-run] discovery-agent
  - ✓ **market-intel**: [dry-run] market-intel
  - ✓ **lead-personalisation**: [dry-run] lead-personalisation

### 6. ✓ "Preview-only mode (no execution)"

**Message:** Create a match preparation session for the U18s on Friday evening.
**Outcome:** PREVIEW (4ms)
**Engines:** memory-engine, coaching-engine
**Phases:** 2





---

## Future Integrations

1. **WebSocket progress stream** — expose Orchestrator progress events via WebSocket for Mission Control real-time dashboard
2. **CLI-engine promotion** — Discovery, Market Intel, Lead Personalisation are currently CLI stubs; promote to importable modules with a public `run(options)` function
3. **Persistent orchestration log** — write every OrchestrationResult to JSONL alongside workflow-history for full system audit trail
4. **Conditional orchestration** — allow engines to signal "I need engine X to run first" at runtime, not just at registration
5. **Orchestration templates** — pre-defined engine combinations for common tasks (weekly prep, DoR brief, injury review)
6. **Mission Control panel** — live orchestration viewer showing phase progress, context bus state, engine results

---

*Report generated by Coach's Eye Orchestrator*
