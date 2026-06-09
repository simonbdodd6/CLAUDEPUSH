# Workflow Engine — Architecture & Test Report

*Generated: 2026-06-09*

---

## What Is This?

The **Workflow Engine** is the execution layer for the Coach's Eye AI Copilot.
Where other engines analyse, remember, and recommend — the Workflow Engine *acts*.
It chains multiple Coach's Eye actions into auditable, reversible workflows triggered
by natural language.

**Verbatim spec example:**

> User: "Build next Tuesday's U16 training."
>
> Workflow:
> 1. Build session
> 2. Save session
> 3. Schedule session
> 4. Notify coaches
> 5. Generate printable PDF
> 6. Update season objectives

---

## Architecture

```
workflow-engine/
├── index.js                  ← Public API (executeWorkflow, previewWorkflow, ...)
├── workflow-actions.js       ← Registry of 15 executable actions with execute() + undo()
├── workflow-parser.js        ← Natural language → WorkflowDefinition (keyword/regex, no LLM)
├── workflow-planner.js       ← WorkflowDefinition → ExecutionPlan (Kahn's topo sort)
├── workflow-runner.js        ← Step-by-step executor with rollback
├── workflow-history.js       ← Append-only audit log (JSONL persistence)
└── workflow-queue.js         ← In-memory queue for scheduled workflows

ai-copilot/engines/
└── workflow-engine-adapter.js  ← Copilot plugin (auto-registered at priority 80)
```

### Data Flow

```
Natural language message
        │
        ▼
 workflow-parser.js
 (intent → WorkflowDefinition)
        │
        ▼
 workflow-planner.js
 (definition → ExecutionPlan via Kahn's topo sort)
        │
        ▼
 workflow-runner.js
 (wave-by-wave execution + rollback on failure)
        │
        ├─→ workflow-history.js  (every event logged)
        └─→ workflow-queue.js    (if scheduled for future)
```

---

## The 15 Actions

| Action | Category | Reversible | Est. Time |
|--------|----------|-----------|-----------|
| Create Training Session | coaching | No | ~2500ms |
| Save Session | memory | ↩ Yes | ~300ms |
| Assign Session to Team | memory | ↩ Yes | ~200ms |
| Generate PDF | reporting | No | ~1500ms |
| Send Player Notification | notification | No | ~500ms |
| Send Coach Notification | notification | No | ~500ms |
| Update Player Memory | memory | No | ~300ms |
| Update Season Plan | memory | No | ~300ms |
| Schedule Future Session | scheduling | ↩ Yes | ~100ms |
| Create Rehabilitation Programme | coaching | No | ~2500ms |
| Assign Programme | memory | ↩ Yes | ~300ms |
| Generate Match Report | reporting | No | ~3000ms |
| Generate Director of Rugby Report | reporting | No | ~5000ms |
| Create Player Review | reporting | No | ~3000ms |
| Create Club Report | reporting | No | ~6000ms |

### Action Contract

Every action implements:
- `execute(params, context, stepOutputs)` → `{ success, data, summary, undoKey? }`
- `undo(params, context, result)` (if `isReversible: true`)

**Step-to-step wiring:** `stepOutputs` passes the previous steps' result data forward.
Example: `save_session` reads `stepOutputs.create_session.data` to get the generated session.

### Notification Actions

`send_player_notification` and `send_coach_notification` are stubs that
connect to `api/push.js` (VAPID web push) once player/coach device tokens are
registered. The stubs return a complete, loggable result so workflows succeed
in tests without real push credentials.

---

## The 7 Workflow Templates

### Build & Schedule Training Session

Generate, save, schedule, notify and PDF a training session

**Steps (7):** build, create, generate, make, plan...

### Create & Assign Rehabilitation Programme

Generate a return-to-play rehab plan and assign it to a player

**Steps (4):** rehab, rehabilitation, injury, recover, return...

### Generate Director of Rugby Report

Build and notify DoR of weekly intelligence brief

**Steps (3):** director, dor, weekly, brief, report...

### Create Player Development Review

Generate and save a full player development analysis

**Steps (3):** review, assess, evaluate, analyse, analyze...

### Create Full Club Report

Generate a comprehensive club intelligence report

**Steps (3):** club, whole, full, all, everything...

### Generate Match Report

Create a post-match analysis and notify coaches

**Steps (3):** match, game, fixture, result, performance...

### Notify Squad

Send a notification to players and coaches

**Steps (2):** notify, notification, message, alert, send...



---

## Parser — Natural Language → WorkflowDefinition

The parser uses **keyword-weighted intent scoring** (no LLM required):

1. Score every template against the message (keywords: +1 each, phrase regexes: +3 each)
2. Select highest-scoring template; fall back to `build_session` at score 0
3. Extract entities: `ageGroup`, `position`, `dayOfWeek`, `time`, `durationMinutes`, `playerName`, `sessionFocus`
4. Prune optional steps (e.g. skip `schedule_future_session` if no date hint)
5. Validate all action IDs against the registry

---

## Planner — Kahn's Topological Sort

The planner resolves step dependencies into **execution waves**:

- Steps in the same wave have no inter-dependencies → can run in parallel (parallel opt-in in options)
- Steps with unmet critical dependencies abort the workflow
- Optional steps with unmet dependencies are silently skipped

**Critical path** — non-optional steps only. Failure triggers rollback.

**Reversibility checkpoint** — the last reversible step before any non-reversible step.
Rollback undoes all completed steps in reverse order.

---

## Runner — Execution Model

1. Execute waves in order
2. For each step: check dependencies → `action.execute()` → log event
3. `stepOutputs` accumulates each step's result data for downstream steps
4. On critical failure: rollback completed reversible steps in reverse order
5. On optional failure: log warning, continue

**Audit log:** every event (`step.started`, `step.completed`, `step.failed`,
`undo.started`, `undo.completed`) is written to `memory-engine/data/workflow-history.jsonl`
with timestamps and step details.

---

## AI Copilot Integration

The Workflow Engine registers with the Copilot at **priority 80**.

When a workflow intent is detected, the adapter returns a **structured preview**:
- Planned steps with labels and reversibility flags
- Estimated execution time
- Quick actions: "Execute Now", "Schedule for Later", "Dry Run"

If `context.autoExecute = true`, the full pipeline runs immediately.

---

## Test Results (2026-06-09)

**8/8 scenarios parsed and planned successfully**

### 1. ✓ "Build next Tuesday's U16 training"


- **Plan:** Build & Schedule Training Session
- **Steps:** 7
- **Outcome:** dry_run
- **Duration:** 82ms
  - Generate session plan
  - Save to memory ↩
  - Generate printable PDF
  - Assign to team ↩
  - Schedule for future date ↩ (optional)
  - Notify coaches

**Warnings:** 3 non-reversible step(s): Generate session plan, Notify coaches, Generate printable PDF

### 2. ✓ "Create a fitness session for the Senior squad"


- **Plan:** Build & Schedule Training Session
- **Steps:** 7
- **Outcome:** dry_run
- **Duration:** 14ms
  - Generate session plan
  - Save to memory ↩
  - Generate printable PDF
  - Assign to team ↩
  - Schedule for future date ↩ (optional)
  - Notify coaches

**Warnings:** 3 non-reversible step(s): Generate session plan, Notify coaches, Generate printable PDF

### 3. ✓ "Generate a rehab programme for injured player"


- **Plan:** Create & Assign Rehabilitation Programme
- **Steps:** 4
- **Outcome:** dry_run
- **Duration:** 3ms
  - Generate rehab plan
  - Assign to player ↩
  - Update player record
  - Notify player (optional)

**Warnings:** 2 non-reversible step(s): Generate rehab plan, Update player record

### 4. ✓ "Generate the weekly Director of Rugby report"


- **Plan:** Generate Director of Rugby Report
- **Steps:** 3
- **Outcome:** dry_run
- **Duration:** 4ms
  - Generate DoR brief
  - Export to PDF
  - Notify coaching staff (optional)

**Warnings:** 2 non-reversible step(s): Generate DoR brief, Export to PDF

### 5. ✓ "Create a player review for Sarah O'Brien"


- **Plan:** Create Player Development Review
- **Steps:** 3
- **Outcome:** dry_run
- **Duration:** 3ms
  - Generate player review
  - Update player record
  - Notify player (optional)

**Warnings:** 2 non-reversible step(s): Generate player review, Update player record

### 6. ✓ "Generate a full club report"


- **Plan:** Create Full Club Report
- **Steps:** 3
- **Outcome:** dry_run
- **Duration:** 3ms
  - Generate club report
  - Generate DoR brief (optional)
  - Notify all coaches (optional)

**Warnings:** 1 non-reversible step(s): Generate club report

### 7. ✓ "Notify the U18 squad about training"


- **Plan:** Notify Squad
- **Steps:** 2
- **Outcome:** dry_run
- **Duration:** 3ms
  - Notify players
  - Notify coaches

**Warnings:** 2 non-reversible step(s): Notify players, Notify coaches

### 8. ✓ "Preview workflow without executing"


- **Plan:** Build & Schedule Training Session
- **Steps:** 6
- **Outcome:** preview
- **Duration:** 0ms
  - Generate session plan
  - Save to memory ↩
  - Generate printable PDF
  - Assign to team ↩
  - Notify coaches
  - Update season objectives (optional)

**Warnings:** No date specified — schedule step skipped · 3 non-reversible step(s): Generate session plan, Notify coaches, Generate printable PDF



---

## Future Integrations

1. **PDF Generation** — connect to a headless browser (Puppeteer) or PDF service once hosted
2. **Push Notifications** — connect `send_player_notification` / `send_coach_notification` to `api/push.js` with device token store
3. **Match Report** — connect `generate_match_report` to Match Analysis Engine when built
4. **Parallel execution** — enable `canRunInParallel` waves for waves with no step dependencies
5. **Persistent queue** — write queue state to JSONL alongside history for restart-safe scheduling
6. **Workflow history UI** — surface audit log in Mission Control panel

---

*Report generated by Coach's Eye Workflow Engine*
