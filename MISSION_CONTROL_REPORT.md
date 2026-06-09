# Coach's Eye — Executive Dashboard & Approval Centre
## Mission Control Report

**Generated:** 2026-06-09T12:10:14.214Z

---

## Overview

The Executive Dashboard is the production interface connecting every Coach's Eye engine into a single, unified command centre. It answers the question: **"What do I need to know right now?"**

---

## Architecture

```
dashboard/
├── index.js                        ← Public API: buildDashboard(role, options)
├── adapters/                        ← Thin adapters over each engine (no logic)
│   ├── memory-adapter.js            ← Memory Engine: players, teams, injuries, sessions
│   ├── club-intel-adapter.js        ← Club Intelligence: health, recommendations, insights
│   ├── comms-adapter.js             ← Communications Engine: drafts, schedule, approvals
│   ├── workflow-adapter.js          ← Workflow Engine: pending workflows, run history
│   └── data-adapter.js             ← Data Integration: membership, sponsors, volunteers
├── approval-centre/                 ← Human-in-the-loop approval layer
│   ├── approval-queue.js            ← Enqueue / approve / reject / archive / JSONL log
│   ├── approval-card.js             ← ApprovalCard shape + factory functions
│   └── approval-router.js          ← Route engine outputs → ApprovalCards
├── widgets/                         ← Individual dashboard widgets
│   ├── morning-briefing.js          ← "What do I need to know today?"
│   ├── club-health.js               ← Health score, trend, risks, ASCII bar
│   ├── todays-tasks.js              ← All actionable items, prioritised
│   ├── activity-feed.js             ← Live events from all engines
│   ├── recommendations.js           ← AI recommendations with evidence
│   └── global-copilot.js           ← Persistent AI assistant (wraps ai-copilot)
├── executive/
│   └── executive-briefing.js        ← Full dashboard: all widgets combined
└── today/
    └── today-agenda.js              ← Chronological agenda for today + tomorrow
```

---

## Widgets

| Widget | Source | Description |
|---|---|---|
| Good Morning Briefing | All adapters | Headline + prioritised items by urgency |
| Club Health | Club Intelligence | Score/grade/trend/risks + ASCII bar |
| Today's Tasks | All engines | Every actionable item, sorted by priority |
| Approval Centre | approval-queue.js | Pending comms/workflows/AI suggestions |
| Live Activity Feed | Comms + Workflow + Approvals | Chronological events from all engines |
| AI Recommendations | Club Intelligence + data | Ranked recs with why/benefit/confidence/evidence |
| Global Copilot | AI Copilot engine | Natural language queries from anywhere in dashboard |
| Today's Agenda | Memory + Workflow + Approvals | Chronological schedule for today + tomorrow |

---

## Approval Centre

Every AI-generated output requires human sign-off before going anywhere.

### ApprovalCard Shape

```json
{
  "approvalId":     "uuid",
  "type":           "training_session | weekly_newsletter | sponsor_update | ...",
  "title":          "Human-readable title",
  "generatedBy":    "engine name",
  "confidence":     85,
  "evidence":       ["evidence point 1", "evidence point 2"],
  "preview":        "markdown preview of the content",
  "riskLevel":      "low | medium | high",
  "requiresRole":   "coach | manager | admin",
  "status":         "pending | approved | rejected | archived",
  "editedContent":  null,
  "approvedBy":     null,
  "rejectedBy":     null,
  "rejectionReason": null,
  "createdAt":      "ISO timestamp",
  "reviewedAt":     null
}
```

### Risk Levels

| Level | Meaning | Examples |
|---|---|---|
| 🟢 Low | Internal, low-stakes | Training session plans, session reminders |
| 🟡 Medium | Squad-wide, visible | Newsletters, volunteer requests |
| 🔴 High | External/mass/financial | Sponsor updates, press releases, financial comms |

### Routing

Outputs from every engine are automatically routed to the approval queue:

- **Communications Engine** → `routeCommsDraft()` / `routeCommsPack()`
- **Workflow Engine** → `routeWorkflowResult()`
- **AI Copilot** → `routeCopilotSuggestion()`
- **Generic / Custom** → `routeGeneric()`

---

## Global Copilot — Example Prompts

- "Prepare tonight's U16 training."
- "Who needs contacting today?"
- "Generate committee report."
- "How healthy is the club?"
- "Show injury trends."
- "What should I focus on today?"
- "Build this week's club communications pack."
- "Who are the top performers this season?"
- "Generate a match report for last weekend."
- "Which players have low attendance?"
- "Create a sponsor update for Kildare Motor Group."
- "Ask for volunteers for the Christmas Dinner."

---

## Dashboard Summary (latest run)

| Metric | Value |
|---|---|
| Club Health Score | 52/100 (D) |
| Total Tasks | 8 (3 critical) |
| Pending Approvals | 8 |
| AI Recommendations | 5 |
| Recent Activity Events | 8 |
| Dashboard Headline | "2 priority items to address today." |

---

## Integration Points

| Engine | Adapter | Data |
|---|---|---|
| Memory Engine | memory-adapter.js | Players, injuries, sessions, fixtures |
| Club Intelligence | club-intel-adapter.js | Health score, recommendations, insights |
| Communications Engine | comms-adapter.js | Drafts, schedule, approval summary |
| Workflow Engine | workflow-adapter.js | Pending workflows, run history |
| Data Integration | data-adapter.js | Membership, sponsors, volunteers |
| AI Copilot | global-copilot.js | Natural language queries |
| Approval Queue | approval-queue.js | All pending human approvals |

---

## npm Script

```bash
npm run dashboard:mission-control
```

---

## Design Principles

1. **No duplicated logic** — adapters read from engines; widgets read from adapters. Zero business logic in the dashboard layer.
2. **Human in the loop** — every AI-generated output enters the approval queue before going anywhere.
3. **Parallel data fetch** — all widget data fetched with `Promise.all`, sub-second regardless of engine count.
4. **Graceful degradation** — missing engines return `isMock: true`, never crash the dashboard.
5. **Role-aware** — all widgets accept a `role` parameter and respect engine-level RBAC.

---

*Report generated by Coach's Eye Mission Control v1.0.0*
