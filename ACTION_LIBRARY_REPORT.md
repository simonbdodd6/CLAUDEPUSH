# Coach's Eye — Action Library
## Implementation Report

**Generated:** 2026-06-09T13:26:40.801Z
**Total Actions:** 51
**Status:** All 51 actions implemented and tested

---

## Overview

The Coach's Eye Action Library provides **51 production-ready one-click actions** that orchestrate existing engines through the Platform Integration Layer. Every action exposes preview mode, permission enforcement, execution history and natural language resolution.

**Design principle:** Actions orchestrate existing engines — they never duplicate business logic.

---

## Action Summary by Category

| Category | Actions | Avg Runtime | Sends Comms | Needs Approval |
|---|---|---|---|---|
| 🏉 **Coaching** | 12 | 4000ms | 0 | 0 |
| 👤 **Players** | 7 | 3643ms | 2 | 2 |
| 📣 **Communications** | 10 | 3500ms | 10 | 9 |
| 📊 **Director of Rugby** | 6 | 4833ms | 0 | 0 |
| 🏛 **Committee** | 8 | 5250ms | 0 | 1 |
| ⚙️ **Club Operations** | 8 | 5625ms | 6 | 5 |

---

## All Actions (51)

| Action | ID | Category | Engines | Est. Runtime | Comms | Approval |
|---|---|---|---|---|---|---|
| **Generate Training Session** | `coaching.training_session` | COACHING | 4 | 4000ms | — | — |
| **Generate Season Plan** | `coaching.season_plan` | COACHING | 4 | 6000ms | — | — |
| **Generate Player Programme** | `coaching.player_programme` | COACHING | 4 | 5000ms | — | — |
| **Generate Rehab Plan** | `coaching.rehab_plan` | COACHING | 4 | 4000ms | — | — |
| **Prepare Match** | `coaching.match_preparation` | COACHING | 4 | 5000ms | — | — |
| **Select Squad** | `coaching.squad_selection` | COACHING | 4 | 4000ms | — | — |
| **Review Attendance** | `coaching.attendance_review` | COACHING | 2 | 2500ms | — | — |
| **Review Injuries** | `coaching.injury_review` | COACHING | 2 | 2500ms | — | — |
| **Compare Players** | `coaching.player_comparison` | COACHING | 4 | 4000ms | — | — |
| **Create Session PDF** | `coaching.session_pdf` | COACHING | 1 | 2000ms | — | — |
| **Generate Drill Library** | `coaching.drill_library` | COACHING | 2 | 3500ms | — | — |
| **Pre-Season Plan** | `coaching.pre_season_plan` | COACHING | 4 | 5500ms | — | — |
| **Player Review** | `players.player_review` | PLAYERS | 4 | 4000ms | — | — |
| **Parent Update** | `players.parent_update` | PLAYERS | 3 | 3000ms | 📨 | ✅ |
| **Return To Play Review** | `players.return_to_play` | PLAYERS | 4 | 4500ms | — | — |
| **Training Load Review** | `players.training_load` | PLAYERS | 3 | 3000ms | — | — |
| **Progress Report** | `players.progress_report` | PLAYERS | 4 | 4000ms | 📨 | ✅ |
| **Squad Health Summary** | `players.squad_health` | PLAYERS | 2 | 2500ms | — | — |
| **Development Pathway** | `players.development_pathway` | PLAYERS | 3 | 4500ms | — | — |
| **Build Newsletter** | `comms.newsletter` | COMMUNICATIONS | 4 | 5000ms | 📨 | ✅ |
| **Generate Social Media Pack** | `comms.social_media_pack` | COMMUNICATIONS | 3 | 4000ms | 📨 | ✅ |
| **Create Sponsor Update** | `comms.sponsor_update` | COMMUNICATIONS | 3 | 4000ms | 📨 | ✅ |
| **Create Parent Email** | `comms.parent_email` | COMMUNICATIONS | 2 | 3000ms | 📨 | ✅ |
| **Create Volunteer Request** | `comms.volunteer_request` | COMMUNICATIONS | 3 | 3000ms | 📨 | ✅ |
| **Create Membership Reminder** | `comms.membership_reminder` | COMMUNICATIONS | 3 | 3500ms | 📨 | ✅ |
| **Match Preview** | `comms.match_preview` | COMMUNICATIONS | 4 | 4000ms | 📨 | ✅ |
| **Match Report** | `comms.match_report` | COMMUNICATIONS | 4 | 4000ms | 📨 | ✅ |
| **Training Reminder** | `comms.training_reminder` | COMMUNICATIONS | 2 | 2000ms | 📨 | — |
| **Club Announcement** | `comms.club_announcement` | COMMUNICATIONS | 1 | 2500ms | 📨 | ✅ |
| **Weekly Academy Review** | `dor.academy_review` | DIRECTOR OF_RUGBY | 5 | 6000ms | — | — |
| **Team Comparison** | `dor.team_comparison` | DIRECTOR OF_RUGBY | 4 | 4500ms | — | — |
| **Coach Performance Review** | `dor.coach_performance` | DIRECTOR OF_RUGBY | 3 | 5000ms | — | — |
| **Player Pathway Review** | `dor.player_pathway` | DIRECTOR OF_RUGBY | 4 | 5500ms | — | — |
| **Injury Trends** | `dor.injury_trends` | DIRECTOR OF_RUGBY | 3 | 4000ms | — | — |
| **Attendance Trends** | `dor.attendance_trends` | DIRECTOR OF_RUGBY | 3 | 4000ms | — | — |
| **Weekly Committee Pack** | `committee.weekly_pack` | COMMITTEE | 5 | 7000ms | — | — |
| **Executive Dashboard** | `committee.executive_dashboard` | COMMITTEE | 6 | 6000ms | — | — |
| **Club Health Report** | `committee.club_health` | COMMITTEE | 3 | 5000ms | — | — |
| **Risk Register** | `committee.risk_register` | COMMITTEE | 3 | 5000ms | — | — |
| **Membership Summary** | `committee.membership_summary` | COMMITTEE | 2 | 3000ms | — | — |
| **Volunteer Summary** | `committee.volunteer_summary` | COMMITTEE | 2 | 3000ms | — | — |
| **Sponsor Summary** | `committee.sponsor_summary` | COMMITTEE | 2 | 3000ms | — | — |
| **AGM Pack** | `committee.agm_pack` | COMMITTEE | 5 | 10000ms | — | ✅ |
| **Open Club** | `ops.open_club` | CLUB OPERATIONS | 4 | 5000ms | — | — |
| **Close Club** | `ops.close_club` | CLUB OPERATIONS | 3 | 3500ms | — | — |
| **Match Day Pack** | `ops.match_day` | CLUB OPERATIONS | 4 | 5500ms | 📨 | — |
| **Event Pack** | `ops.event_pack` | CLUB OPERATIONS | 3 | 6000ms | 📨 | ✅ |
| **Awards Evening Pack** | `ops.awards_evening` | CLUB OPERATIONS | 4 | 7000ms | 📨 | ✅ |
| **Christmas Function Pack** | `ops.christmas_function` | CLUB OPERATIONS | 3 | 6000ms | 📨 | ✅ |
| **Fundraising Campaign** | `ops.fundraising` | CLUB OPERATIONS | 4 | 6500ms | 📨 | ✅ |
| **Recruitment Campaign** | `ops.recruitment` | CLUB OPERATIONS | 3 | 5500ms | 📨 | ✅ |

---

## Engine Dependency Matrix

| Engine | Used By (actions) | Sample Actions |
|---|---|---|
| `memory-engine` | 46 | Generate Training Session, Generate Season Plan, Generate Player Programme, Generate Rehab Plan, Prepare Match... |
| `knowledge-engine` | 38 | Generate Training Session, Generate Rehab Plan, Prepare Match, Select Squad, Review Attendance... |
| `ai-copilot` | 28 | Generate Training Session, Generate Season Plan, Generate Player Programme, Generate Rehab Plan, Prepare Match... |
| `communications-engine` | 19 | Parent Update, Build Newsletter, Generate Social Media Pack, Create Sponsor Update, Create Parent Email... |
| `player-development` | 12 | Generate Season Plan, Generate Player Programme, Select Squad, Compare Players, Pre-Season Plan... |
| `coaching-engine` | 10 | Generate Training Session, Generate Season Plan, Generate Player Programme, Generate Rehab Plan, Prepare Match... |
| `club-intelligence` | 7 | Injury Trends, Attendance Trends, Weekly Committee Pack, Executive Dashboard, Club Health Report... |
| `executive-dashboard` | 4 | Weekly Committee Pack, Executive Dashboard, Club Health Report, Open Club |
| `workflow-engine` | 4 | Weekly Committee Pack, Executive Dashboard, Open Club, Close Club |
| `data-integration` | 1 | Build Newsletter |

---

## Execution Graph

### 🏉 Coaching
- **Generate Training Session** → [memory-engine → knowledge-engine → coaching-engine → ai-copilot]
- **Generate Season Plan** → [memory-engine → coaching-engine → player-development → ai-copilot]
- **Generate Player Programme** → [memory-engine → coaching-engine → player-development → ai-copilot]
- **Generate Rehab Plan** → [memory-engine → knowledge-engine → coaching-engine → ai-copilot]
- **Prepare Match** → [memory-engine → knowledge-engine → coaching-engine → ai-copilot]
- **Select Squad** → [memory-engine → knowledge-engine → player-development → ai-copilot]
- **Review Attendance** → [memory-engine → knowledge-engine]
- **Review Injuries** → [memory-engine → knowledge-engine]
- **Compare Players** → [memory-engine → player-development → knowledge-engine → ai-copilot]
- **Create Session PDF** → [coaching-engine]
- **Generate Drill Library** → [coaching-engine → ai-copilot]
- **Pre-Season Plan** → [memory-engine → coaching-engine → player-development → ai-copilot]

### 👤 Players
- **Player Review** → [memory-engine → knowledge-engine → player-development → ai-copilot]
- **Parent Update** → [memory-engine → communications-engine → ai-copilot]
- **Return To Play Review** → [memory-engine → knowledge-engine → coaching-engine → ai-copilot]
- **Training Load Review** → [memory-engine → knowledge-engine → player-development]
- **Progress Report** → [memory-engine → player-development → knowledge-engine → ai-copilot]
- **Squad Health Summary** → [memory-engine → knowledge-engine]
- **Development Pathway** → [memory-engine → player-development → ai-copilot]

### 📣 Communications
- **Build Newsletter** → [memory-engine → data-integration → communications-engine → knowledge-engine]
- **Generate Social Media Pack** → [memory-engine → communications-engine → knowledge-engine]
- **Create Sponsor Update** → [memory-engine → communications-engine → knowledge-engine]
- **Create Parent Email** → [memory-engine → communications-engine]
- **Create Volunteer Request** → [memory-engine → communications-engine → knowledge-engine]
- **Create Membership Reminder** → [memory-engine → knowledge-engine → communications-engine]
- **Match Preview** → [memory-engine → knowledge-engine → communications-engine → ai-copilot]
- **Match Report** → [memory-engine → knowledge-engine → communications-engine → ai-copilot]
- **Training Reminder** → [memory-engine → communications-engine]
- **Club Announcement** → [communications-engine]

### 📊 Director of Rugby
- **Weekly Academy Review** → [memory-engine → knowledge-engine → player-development → coaching-engine → ai-copilot]
- **Team Comparison** → [memory-engine → knowledge-engine → player-development → ai-copilot]
- **Coach Performance Review** → [memory-engine → knowledge-engine → ai-copilot]
- **Player Pathway Review** → [memory-engine → player-development → knowledge-engine → ai-copilot]
- **Injury Trends** → [memory-engine → knowledge-engine → club-intelligence]
- **Attendance Trends** → [memory-engine → knowledge-engine → club-intelligence]

### 🏛 Committee
- **Weekly Committee Pack** → [memory-engine → knowledge-engine → club-intelligence → executive-dashboard → workflow-engine]
- **Executive Dashboard** → [memory-engine → knowledge-engine → club-intelligence → executive-dashboard → workflow-engine → communications-engine]
- **Club Health Report** → [club-intelligence → knowledge-engine → executive-dashboard]
- **Risk Register** → [club-intelligence → knowledge-engine → ai-copilot]
- **Membership Summary** → [memory-engine → knowledge-engine]
- **Volunteer Summary** → [memory-engine → knowledge-engine]
- **Sponsor Summary** → [memory-engine → knowledge-engine]
- **AGM Pack** → [memory-engine → knowledge-engine → club-intelligence → communications-engine → ai-copilot]

### ⚙️ Club Operations
- **Open Club** → [memory-engine → knowledge-engine → workflow-engine → executive-dashboard]
- **Close Club** → [memory-engine → workflow-engine → knowledge-engine]
- **Match Day Pack** → [memory-engine → knowledge-engine → communications-engine → ai-copilot]
- **Event Pack** → [memory-engine → communications-engine → ai-copilot]
- **Awards Evening Pack** → [memory-engine → knowledge-engine → communications-engine → ai-copilot]
- **Christmas Function Pack** → [memory-engine → communications-engine → ai-copilot]
- **Fundraising Campaign** → [memory-engine → communications-engine → knowledge-engine → ai-copilot]
- **Recruitment Campaign** → [memory-engine → communications-engine → ai-copilot]

---

## Permission Matrix

| Category | Coach | Head Coach | DoR | Committee | Chairperson | Admin |
|---|---|---|---|---|---|---|
| **Coaching** | 10/12 | ✅ All | ✅ All | — | — | ✅ All |
| **Players** | ✅ All | ✅ All | ✅ All | — | — | ✅ All |
| **Communications** | 6/10 | 6/10 | 6/10 | 9/10 | 9/10 | ✅ All |
| **Director of Rugby** | — | — | ✅ All | — | — | ✅ All |
| **Committee** | — | — | 2/8 | 7/8 | ✅ All | ✅ All |
| **Club Operations** | — | — | 2/8 | ✅ All | ✅ All | ✅ All |

---

## Natural Language Resolution

51 actions register NL trigger patterns. The runner resolves text to actions before falling back to the Platform Copilot.

| Query | Resolved Action | Confidence |
|---|---|---|
| "Prepare Thursday's U14 training." | `coaching.training_session` | 60% |
| "Run this week's club." | `committee.weekly_pack` | 30% |
| "Review injured players." | `coaching.injury_review` | 60% |
| "Create the AGM pack." | `committee.agm_pack` | 90% |
| "Who has missed the most training?" | `coaching.attendance_review` | 60% |
| "Show all injured props." | `coaching.injury_review` | 60% |
| "Build this week's newsletter." | `comms.newsletter` | 60% |
| "Create the match day pack." | `ops.match_day` | 60% |
| "How is the club performing overall?" | Platform Copilot | n/a% |
| "Select the Senior squad for Saturday." | `coaching.squad_selection` | 30% |
| "Which sponsors expire this month?" | `committee.sponsor_summary` | 30% |
| "Generate a player programme for our out-half." | `coaching.player_programme` | 60% |
| "Start the fundraising campaign." | `ops.fundraising` | 90% |
| "Create the parent email for U14." | `comms.parent_email` | 60% |
| "Build the awards evening pack." | `ops.awards_evening` | 60% |

---

## Live Execution Results

- **COACHING** [`coaching.attendance_review`]: ✅ 213ms — Top 1 players by missed training: Ciarán Murphy
- **PLAYERS** [`players.squad_health`]: ✅ 104ms — Club health: 52/100. Club health: 52/100 (F) — stable
- **COMMUNICATIONS** [`comms.training_reminder`]: ✅ 1ms — Training reminder drafted for Senior
- **DIRECTOR OF RUGBY** [`dor.injury_trends`]: ✅ 2ms — No injured players found.
- **COMMITTEE** [`committee.club_health`]: ✅ 141ms — club-intelligence: ✓ · knowledge-engine: Club health: 52/100. Club health: 52/100 (F) — stable · exe
- **CLUB OPERATIONS** [`ops.close_club`]: ✅ 2ms — End-of-day summary: Club health: 52/100. Club health: 52/100 (F) — stable

---

## Architecture

```
actions/
├── index.js               ← Public API: run(), runFromNL(), preview(), listActions()
├── action-registry.js     ← 51 actions: metadata + execute + preview + undo
├── action-categories.js   ← 6 categories with role mappings
├── action-runner.js       ← NL resolution, permission check, execution, history logging
├── action-preview.js      ← Dry-run preview: describes without executing
├── action-history.js      ← Ring buffer (500) + JSONL: action-history.jsonl
├── action-permissions.js  ← RBAC: 7 roles with hierarchy expansion
└── action-cli.js          ← This CLI — tests all actions, generates report
```

### Action Shape

```js
{
  id:                  'coaching.training_session',
  name:                'Generate Training Session',
  category:            'COACHING',
  description:         'Build a structured training session...',
  requiredEngines:     ['memory-engine', 'knowledge-engine', 'coaching-engine', 'ai-copilot'],
  requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
  estimatedRuntimeMs:  4000,
  sendsComms:          false,
  requiresApproval:    false,
  nlTriggers:          [/prepare.*training/i, /generate.*session/i, ...],
  tags:                ['training', 'session', 'coaching'],
  inputs:              [{ name: 'ageGroup', type: 'string', default: 'Senior' }],
  preview:             async (params, ctx) => ({ willGenerate: '...' }),
  execute:             async (params, ctx) => ({ success, data, summary }),
  undo:                null,
}
```

### Engine Integration

Every action uses one of three patterns:

**Pattern 1 — NL via Platform Orchestrator** (most actions):
```js
const { execute } = await import('../platform/platform-orchestrator.js');
return execute(`Prepare ${params.ageGroup} training.`, { role: ctx.role });
```

**Pattern 2 — Named Pipeline**:
```js
const { executePipeline } = await import('../platform/platform-orchestrator.js');
return executePipeline('health_report', { role: ctx.role });
```

**Pattern 3 — Direct Engine API**:
```js
const { buildWeeklyNewsletter } = await import('../communications-engine/index.js');
const result = await buildWeeklyNewsletter({ weekOf: params.weekOf });
```

---

## npm Script

```bash
npm run actions:library
```

---

## Recommended Next Milestone

**Coach's Eye Mobile Shortcut Layer** — expose the top 15 highest-frequency actions as one-tap shortcuts in the mobile interface. The Action Library gives you everything needed: the IDs, the NL triggers, the permission model, and the engine dependencies. The next step is surfacing them through a mobile-optimised UI.

Alternative: **Action Scheduler** — allow any action to be scheduled (e.g. "Run committee.weekly_pack every Monday at 8am") using the existing cron infrastructure.

---

*Report generated by Coach's Eye Action Library v1.0.0*
