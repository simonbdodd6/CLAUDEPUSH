# Coach's Eye — Club Knowledge Engine
## Architecture Report

**Generated:** 2026-06-09T12:47:54.921Z

---

## Purpose

The Knowledge Engine is the searchable knowledge layer for the entire Coach's Eye platform. It gives every AI feature structured, evidence-backed answers about any aspect of the club — players, fixtures, sponsors, attendance, health, volunteers, membership, and more.

Every answer includes:
- **Structured JSON data** ready for any consumer
- **Evidence citations** tracing each fact to its source engine
- **Confidence score** based on data quality and source count
- **Intent classification** for query analytics

---

## Architecture

```
knowledge-engine/
├── index.js                  ← Public API: ask(), search(), buildIndex()
├── knowledge-answer.js       ← Main orchestrator — dispatches to intent handlers
├── knowledge-query.js        ← NL → structured Query (intent, filters, timeRange)
├── knowledge-search.js       ← Structured query → ranked results from index
├── knowledge-index.js        ← Unified in-memory index across all engines
├── knowledge-citations.js    ← Citation model and formatting
├── knowledge-ranking.js      ← Relevance scoring and intent-specific sort
├── knowledge-cache.js        ← TTL cache with domain invalidation
├── knowledge-history.js      ← Query audit log (ring buffer + JSONL)
├── knowledge-health.js       ← Index coverage + engine connectivity check
└── knowledge-cli.js          ← npm run knowledge:engine
```

---

## Domains

| Domain | Entries | Status | Source Engine |
|---|---|---|---|
| fixtures | 0 | mock | data-integration |
| match_history | 0 | mock | data-integration |
| attendance | 0 | mock | data-integration |
| training | 0 | mock | data-integration |
| players | 1 | live | memory-engine |
| teams | 3 | live | memory-engine |
| medical | 0 | mock | memory-engine |
| communications | 0 | live | communications-engine |
| membership | 0 | mock | communications-engine |
| sponsors | 1 | mock | communications-engine |
| volunteers | 1 | mock | communications-engine |

**Total:** 6 entries across 11 domains

---

## Supported Intents

| Intent | Example Query | Domain |
|---|---|---|
| `injury_report` | "Show all injured props." | medical |
| `attendance_worst` | "Who has missed the most training?" | players |
| `attendance_compare` | "Compare attendance this season with last season." | attendance |
| `attendance_report` | "What is the average attendance rate?" | attendance |
| `sponsor_expiry` | "Which sponsors expire this month?" | sponsors |
| `sponsor_report` | "List all active sponsors." | sponsors |
| `coach_summary` | "What has the U14 coach achieved this season?" | teams |
| `health_summary` | "Summarise club health." | club-intelligence |
| `volunteer_inactive` | "Who hasn't volunteered recently?" | volunteers |
| `volunteer_report` | "Show all volunteers." | volunteers |
| `player_find` | "Find all senior players." | players |
| `team_report` | "How is the U18 team performing?" | teams |
| `membership_report` | "How many members are registered?" | membership |
| `fixture_upcoming` | "List all upcoming fixtures." | fixtures |
| `match_history` | "Show recent match results." | match_history |
| `training_report` | "What sessions ran this week?" | training |
| `comms_pending` | "Show pending communications." | communications |
| `general` | Any other query | cross-domain |

---

## Query Results (this run)

| Query | Intent | Results | Confidence | Time |
|---|---|---|---|---|
| "Show all injured props." | injury_report | 0 | 70% | 1ms |
| "Who has missed the most training?" | attendance_worst | 1 | 90% | 3ms |
| "Which sponsors expire this month?" | sponsor_expiry | 0 | 40% | 0ms |
| "What has the U14 coach achieved this season?" | coach_summary | 0 | 50% | 4ms |
| "Summarise club health." | health_summary | 1 | 85% | 234ms |
| "Compare attendance this season with last season." | attendance_compare | 2 | 40% | 0ms |
| "Who hasn't volunteered recently?" | volunteer_inactive | 0 | 40% | 1ms |
| "List all upcoming fixtures." | fixture_upcoming | 0 | 50% | 1ms |
| "Show recent match results." | match_history | 0 | 40% | 1ms |
| "How many members are registered?" | membership_report | 1 | 40% | 0ms |
| "Which players have low attendance?" | player_find | 1 | 85% | 1ms |
| "Show pending communications." | comms_pending | 0 | 90% | 3ms |
| "What are the top AI recommendations for the club?" | general | 7 | 75% | 4ms |
| "Find all senior players." | player_find | 0 | 60% | 1ms |

**Query stats:** 16 total · avg 64% confidence · avg 16ms

---

## Answer Shape

```json
{
  "question":    "Show all injured props.",
  "intent":      "injury_report",
  "domain":      "medical",
  "answer":      "2 injured players (props): Tom Kelly, Jack Ryan.",
  "summary":     "2 active injuries (2 prop)",
  "data":        [ { "name": "Tom Kelly", "injuryType": "hamstring", "status": "active" } ],
  "count":       2,
  "confidence":  85,
  "citations":   [ { "engine": "memory-engine", "fact": "Tom Kelly: hamstring injury" } ],
  "parsedQuery": { "intent": "injury_report", "filters": { "positions": ["prop"] } },
  "timing":      { "durationMs": 12 },
  "cached":      false
}
```

---

## Integration Points

| Engine | Role | Data Provided |
|---|---|---|
| Memory Engine | Primary player/team store | Players, teams, injuries, coaches |
| Data Integration | Structured queries | Fixtures, attendance, sessions, membership |
| Club Intelligence | Health & insights | Scores, insights, recommendations |
| Communications Engine | Comms data | Sponsors, volunteers, membership stats |
| Dashboard Approval Queue | Pending items | Approval queue contents |

---

## Health Summary (latest run)

- Coverage: 100%
- Live data ratio: 67%
- Index age: 0 minutes
- Warnings: 0
- Errors: 0

---

## npm Script

```bash
npm run knowledge:engine
```

---

## Design Principles

1. **Evidence-backed** — every answer cites its source engine and the specific fact.
2. **No logic duplication** — the Knowledge Engine reads from existing engines, never reimplements.
3. **Parallel index build** — all domain builders run with `Promise.all`.
4. **Graceful degradation** — missing engines return empty domains, never crash queries.
5. **Intent-aware sorting** — attendance queries sort by absences, sponsor queries by expiry, volunteer queries by last-active.
6. **TTL cache** — repeated queries hit the cache; domain refreshes invalidate only their domain.
7. **Audit trail** — every query is logged to JSONL for analytics.

---

*Report generated by Coach's Eye Knowledge Engine v1.0.0*
