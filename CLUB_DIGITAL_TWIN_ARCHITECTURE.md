# Coach's Eye — Club Digital Twin Architecture

## Overview

The Club Digital Twin is the central model that every engine, workflow and future feature reads from. The Club is the primary object of the entire platform. Every engine already built contributes information to this model — the Digital Twin aggregates without duplicating.

---

## System Position

```
┌────────────────────────────────────────────────────────────────────────┐
│  CONSUMER LAYER                                                         │
│  Command Centre (React SPA)  ·  API clients  ·  Future mobile app      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │  HTTP /twin/*
┌───────────────────────────────────▼────────────────────────────────────┐
│  CLUB DIGITAL TWIN  (club-digital-twin/)  Port 3002                     │
│                                                                         │
│  club-model.js       ← canonical Club object (aggregator)              │
│  club-health.js      ← multi-dimensional health score (0–100)          │
│  club-risk.js        ← automated risk register (11 risk types)         │
│  club-trends.js      ← metric snapshots + trend computation            │
│  club-predictions.js ← 7/30/90-day forecasting                        │
│  club-summary.js     ← executive summaries + board reports             │
│  club-api.js         ← REST API server (14 endpoints)                  │
│  index.js            ← public API + runDigitalTwin() pipeline          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │  ES module imports (lazy, graceful)
┌───────────────────────────────────▼────────────────────────────────────┐
│  EXISTING PLATFORM LAYER  (read-only — Digital Twin never writes)       │
│                                                                         │
│  qa/club-intelligence/   ← profile, health, insights, recommendations  │
│  dashboard/              ← approvals, briefings, adapters              │
│  knowledge-engine/       ← ask() for AI-powered answers                │
│  memory-engine/          ← players, teams, coaches, stats              │
│  workflow-engine/        ← history, queue, workflow runs               │
│  actions/action-history  ← action execution stats                      │
│  communications-engine/  ← drafts, schedule, engagement                │
│  platform/               ← orchestrator, pipelines                     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Module Responsibilities

| Module | Responsibility | Engine Sources |
|---|---|---|
| `club-model.js` | Build canonical Club object | club-intelligence, dashboard, workflow, action-history |
| `club-health.js` | Multi-dimensional health scoring + delta tracking | Derived from model |
| `club-risk.js` | Automated risk register (11 detectors) | Derived from model |
| `club-trends.js` | JSONL snapshot storage + trend computation | Internal |
| `club-predictions.js` | 7/30/90-day linear extrapolation + scenarios | club-trends + knowledge-engine |
| `club-summary.js` | Executive summaries, board reports, morning briefing | knowledge-engine + model |
| `club-api.js` | REST HTTP server (14 endpoints) | All modules |
| `index.js` | Public API + full pipeline | All modules |

---

## Club Object Model

```
ClubModel {
  identity {
    name, sport, country, timezone, logo, colours
  }
  membership {
    active, new, former, trend, retentionRate, atRiskCount
  }
  teams []{
    id, name, ageGroup, playerCount, healthScore, avgAttendance,
    activeInjuries, highRiskCount, avgDevelopment,
    fixtures[], results[], leaguePosition            ← future: Fixture Engine
  }
  players {
    activeCount, injuredCount, availableCount, atRiskCount,
    injured []{ id, name, ageGroup, injuries[] },
    atRisk  []{ id, name, retentionRisk, injuryRisk },
    development { improving, stable, declining, noData },
    availabilityRate
  }
  coaches {
    activeCount, coaches[], playerRatio, sessionsDelivered
  }
  volunteers {
    active, coveragePercent, missingRoles[], recruitmentNeeds
  }
  sponsors {
    active, totalValue, upcomingRenewals[], health
  }
  communications {
    pendingDrafts, pendingApprovals, engagementScore, openRate, sentThisMonth
  }
  committee {
    pendingApprovals, criticalDecisions, riskItems[]
  }
  finance { _placeholder: true }       ← Finance Engine (planned)
  facilities { _placeholder: true }    ← Facilities Engine (planned)
  health {
    score (0–100), grade (A–F), status, trend, delta,
    dimensions [{ id, label, weight, score, drivers[] }]
  }
  insights [{ type, message, severity, action }]
  recommendations [{ action, priority, reason }]
  actionActivity { totalActionsRun, successRate, avgDurationMs }
  dataCompleteness (0–100)
  lastUpdated, buildTimeMs
}
```

---

## Health Score Model

8 dimensions, weights summing to 100. See [CLUB_HEALTH_MODEL.md](CLUB_HEALTH_MODEL.md) for full specification.

| Dimension | Weight |
|---|---|
| Attendance | 20% |
| Player Availability | 15% |
| Membership | 15% |
| Coach Activity | 15% |
| Injury Management | 10% |
| Communication | 10% |
| Volunteer Coverage | 10% |
| Data Completeness | 5% |

---

## Risk Register

11 automated risk detectors scan the model on every call:

| Type | Trigger | Default Severity |
|---|---|---|
| `INJURY_CLUSTER` | Injury rate > 10% squad | HIGH |
| `ATTENDANCE_DECLINE` | Team attendance < 75% | MEDIUM–HIGH |
| `PLAYER_RETENTION` | >10% players at retention risk | MEDIUM–HIGH |
| `VOLUNTEER_GAP` | Coverage < 70% or missing critical roles | HIGH |
| `SPONSOR_EXPIRY` | Renewal due within 90 days | MEDIUM–CRITICAL |
| `COACH_OVERLOAD` | Player:coach ratio > 30:1 | MEDIUM–HIGH |
| `MEMBERSHIP_CHURN` | Retention rate < 70% | HIGH |
| `COMMITTEE_BACKLOG` | >5 pending approvals | MEDIUM–HIGH |
| `DATA_STALENESS` | Data completeness < 50% | MEDIUM |
| `SQUAD_DEPTH` | <10 available players in team | MEDIUM–HIGH |
| `COMMS_BACKLOG` | >5 pending draft approvals | MEDIUM |

---

## API Endpoints

Base: `http://localhost:3002`

| Method | Path | Description |
|---|---|---|
| GET | `/twin` | Full Club Digital Twin model |
| GET | `/twin/summary` | Quick summary (name, score, counts) |
| GET | `/twin/health` | Health score + all 8 dimensions |
| GET | `/twin/health/history?n=30` | Historical health snapshots |
| GET | `/twin/risks` | Full risk register |
| GET | `/twin/risks/critical` | Critical + high risks only |
| GET | `/twin/trends` | Trend data + narrative |
| GET | `/twin/predictions` | 7/30/90-day forecasts + scenarios |
| GET | `/twin/briefing` | Morning briefing |
| POST | `/twin/summary/weekly` | Generate weekly executive summary |
| POST | `/twin/summary/board` | Generate monthly board report |
| POST | `/twin/ask` | `{ question }` → AI answer |
| GET | `/twin/status` | API health + last model stats |
| GET | `/health` | Ping |

---

## Trend Tracking

Snapshots are persisted as JSONL to `club-digital-twin/data/twin-snapshots.jsonl`. No database required. Each line stores a flat metrics object stamped with an ISO timestamp. Rolling window: 500 snapshots. Trend computation windows: 7d, 30d, 90d.

---

## Full Pipeline

```js
const twin = await runDigitalTwin({ saveTrends: true, withPredictions: true });
// twin.model       — canonical Club object
// twin.health      — health score + dimensions + delta
// twin.risks       — risk register with 11 detector types
// twin.trends      — computed from JSONL snapshots
// twin.predictions — 30/90-day forecasts + scenarios
// twin.summary     — executive summary (if withSummary: true)
```

---

## Data Flow — Key Paths

### Health Score
```
buildClubModel()
  → buildHealthReport(model)
    → scoreDimensions(model)
      → scoreOneDimension('attendance', model)    ← reads team avgAttendance
      → scoreOneDimension('injury_management', ...) ← reads players.injuredCount
      → ...
    → computeHealthScore(dimensions)               ← weighted sum
    → getLastSnapshot()                            ← load previous for delta
    → saveSnapshot()                               ← persist for next run
```

### Risk Detection
```
buildClubModel()
  → buildRiskRegister(model)
    → detectInjuryCluster(model)    ← injuryRate > threshold
    → detectSponsorExpiry(model)    ← daysUntilRenewal < 90
    → detectCoachOverload(model)    ← playerRatio > 30
    → ... (8 more detectors)
    → sort by severity
    → return { total, critical, high, medium, risks[] }
```

### AI Question Answering
```
ask("What are our biggest risks?")
  → buildClubModel()
  → buildRiskRegister(model)
  → computeTrends()
  → answerClubQuestion(question, model, risks, trends)
    → knowledge.ask(enriched_prompt)   ← Knowledge Engine
    → return { answer, evidence, source }
```

---

## Starting the API

```bash
# Start Digital Twin API (port 3002)
node club-digital-twin/club-api.js

# Or via npm
npm run twin:api

# Run full validation
npm run twin:cli
```

---

## Design Principles

1. **Read-only** — the Digital Twin never writes to any engine. It aggregates; it does not modify.
2. **Graceful degradation** — every engine import is lazy and wrapped in try/catch. The Twin works at 10% data with reduced completeness score.
3. **No duplication** — health calculation, player enrichment, insight generation all delegate to existing engines. Zero logic is reimplemented.
4. **Snapshot-based trends** — no time-series database needed. A JSONL append file with rolling compaction handles all trend tracking.
5. **AI-augmented, not AI-dependent** — every output has a deterministic fallback. AI narrative from the Knowledge Engine enhances but does not block.
