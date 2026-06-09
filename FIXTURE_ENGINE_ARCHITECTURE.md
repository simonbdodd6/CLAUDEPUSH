# Coach's Eye — Fixture & Match Intelligence Engine Architecture

## Overview

The Fixture Engine makes the Club Digital Twin aware of time. Every fixture is an intelligent object that tracks its own lifecycle from scheduling through post-match review. The engine connects directly to the Digital Twin — fixture data flows into team objects, health calculations, and risk detection automatically.

---

## System Position

```
┌────────────────────────────────────────────────────────────────────────┐
│  CONSUMER LAYER                                                         │
│  Command Centre (React SPA)  ·  API clients  ·  Mobile (future)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│  FIXTURE ENGINE  (fixture-engine/)  Port 3003                           │
│                                                                         │
│  fixture-schema.js    ← canonical Fixture object + FIXTURE_STATUS      │
│  fixture-store.js     ← file-based CRUD + query layer                  │
│  fixture-timeline.js  ← automatic preparation timeline (13 tasks)      │
│  fixture-prep.js      ← enrich fixture from Digital Twin (squad/vols)  │
│  fixture-pack.js      ← AI match pack generation                       │
│  fixture-review.js    ← post-match review + Digital Twin feedback       │
│  fixture-standings.js ← league table + season timeline                 │
│  fixture-api.js       ← REST API (port 3003, 18 endpoints)             │
│  index.js             ← public API + lifecycle helpers                  │
└───────────┬───────────────────────────────────────────────────────────┘
            │  reads                                │  writes results back
┌───────────▼──────────┐              ┌─────────────▼──────────────────┐
│  CLUB DIGITAL TWIN   │              │  CLUB DIGITAL TWIN             │
│  club-model.js       │              │  runDigitalTwin()              │
│  builds fixtures {}  │              │  updateSeasonTimeline()        │
│  into team objects   │              │  health recalculated           │
└───────────┬──────────┘              └────────────────────────────────┘
            │  reads
┌───────────▼──────────┐
│  EXISTING ENGINES    │
│  memory-engine       │ ← squad, players, injuries
│  knowledge-engine    │ ← AI analysis, match packs
│  club-intelligence   │ ← health, availability
└──────────────────────┘
```

---

## Module Responsibilities

| Module | Responsibility | Key exports |
|---|---|---|
| `fixture-schema.js` | Fixture object shape, status constants, factory | `createFixture()`, `FIXTURE_STATUS`, `daysToKickoff()` |
| `fixture-store.js` | File-based persistence (JSON per fixture) | `saveFixture()`, `getFixture()`, `listUpcomingFixtures()` |
| `fixture-timeline.js` | 13-task preparation checklist keyed to kickoff | `generateTimeline()`, `getActionableTasks()`, `timelineProgress()` |
| `fixture-prep.js` | Live squad status, volunteers, medical from Digital Twin | `prepareFixture()`, `analyseOpposition()` |
| `fixture-pack.js` | Complete AI-powered match pack document | `generateMatchPack()` |
| `fixture-review.js` | Result recording, review generation, Digital Twin update | `completeFixture()`, `generatePostMatchReview()`, `updateDigitalTwin()` |
| `fixture-standings.js` | League table, season calendar, team summaries | `getSeasonStandings()`, `updateSeasonTimeline()` |
| `fixture-api.js` | REST HTTP server | `startFixtureApiServer()` |
| `index.js` | Public API + full lifecycle helpers | `scheduleFixture()`, `finaliseMatch()` |

---

## Fixture Object Shape

```
Fixture {
  id                      fixture_YYYYMMDD_teamId
  teamId, teamName, ageGroup
  opponent, venue, isHome
  competition             COMPETITION_TYPES enum
  kickoff                 ISO timestamp
  referee
  status                  FIXTURE_STATUS enum
  prepStage               early | mid | final | matchday | post

  squadStatus {
    selected []           { id, name, position, confirmed }
    unavailable []        { id, name, reason, injuries[] }
    injured []            { id, name, injury, expectedReturn }
    uncertain []          { id, name, reason }
    available []          { label, playerCount, injured }
  }
  squadLockedAt

  medicalAlerts []        { playerId, name, alert, severity }
  playerMilestones []     { playerId, name, milestone, note }
  previousMeetings []     { date, result, score, competition }

  volunteers {
    required []           { role, filled, assignee }
    confirmed []
    missing []
  }

  transport {
    required, arranged, details, departureTime
  }

  weather {
    _placeholder: true    ← Weather API integration (future)
    forecast, conditions, temperature, windSpeed
  }

  preparationChecklist [] { id, type, stage, dueAt, description,
                            assignee, status, priority, autoAction }
  matchPack               generated match pack document

  result {
    status                win | loss | draw | void
    teamScore, opponentScore
    scorers [], yellowCards [], redCards [], manOfMatch, coachNotes, attendance
  }

  postMatchReview         generated review document
  playerReports []        { playerId, name, rating, notes, manOfMatch }
  twinUpdateApplied

  notes, tags, createdAt, updatedAt
}
```

---

## Preparation Timeline

Every fixture automatically generates 13 preparation tasks at scheduling time:

| Days to Kickoff | Stage | Task | Priority | Auto-action |
|---|---|---|---|---|
| −14 | early | Opposition research | medium | — |
| −7 | early | Squad review | high | `prepareFixture` |
| −5 | mid | Injury & availability analysis | high | — |
| −4 | mid | Venue confirmation | medium | — |
| −4 | mid | Transport arrangement (away only) | high | — |
| −3 | mid | Volunteer confirmation | high | `checkVolunteers` |
| −2 | final | Attendance confirmation | high | — |
| −2 | final | Medical brief | medium | — |
| −1 | final | Generate match pack | critical | `generateMatchPack` |
| −1 | final | Pre-match brief to squad | high | — |
| 0 | matchday | Lock squad | critical | `lockSquad` |
| 0 | post | Coach review submission | high | `requestCoachReview` |
| +1 | post | Player performance reports | medium | `generatePlayerReports` |
| +3 | post | Update Club Digital Twin | medium | `updateDigitalTwin` |

---

## API Endpoints

Base: `http://localhost:3003`

| Method | Path | Description |
|---|---|---|
| GET | `/fixtures` | All fixtures |
| GET | `/fixtures/upcoming` | Upcoming fixtures (sorted by kickoff) |
| GET | `/fixtures/recent` | Recently completed fixtures |
| GET | `/fixtures/stats` | Win/loss/draw stats |
| POST | `/fixtures` | Create + schedule fixture |
| GET | `/fixtures/:id` | Get single fixture |
| POST | `/fixtures/:id/prepare` | Enrich from Digital Twin |
| GET | `/fixtures/:id/timeline` | Preparation checklist + progress |
| POST | `/fixtures/:id/pack/generate` | Generate match pack |
| GET | `/fixtures/:id/pack` | Retrieve generated pack |
| POST | `/fixtures/:id/complete` | Record match result |
| POST | `/fixtures/:id/review` | Generate post-match review |
| POST | `/fixtures/:id/twin-update` | Feed result to Digital Twin |
| GET | `/fixtures/:id/opposition` | AI opposition analysis |
| GET | `/season/timeline` | Full season calendar |
| GET | `/season/standings` | League table |
| GET | `/season/team/:teamId` | Team season summary |
| GET | `/health` | API status |

---

## Digital Twin Integration

The Fixture Engine integrates with the Digital Twin in two directions:

**Outbound (fixture → twin on read):**
`buildClubModel()` now imports `getUpcomingFixtures()` from the Fixture Engine. Each team object in the model gets a `fixtures[]` array and `nextFixture` field populated from the fixture store.

**Inbound (result → twin on complete):**
`updateDigitalTwin(fixtureId)` calls `runDigitalTwin({ saveTrends: true })` after a match completes. The twin rebuilds with fresh data, health score recalculates, and new snapshots are saved for trend tracking.

---

## Storage

Each fixture is stored as an individual JSON file in `fixture-engine/data/fixtures/`. No database required. Files are named by fixture ID (`fixture_YYYYMMDD_teamId.json`).

Compatible with PostgreSQL migration: replace file I/O in `fixture-store.js` with DB calls — all consumers unchanged.

---

## Starting the Fixture API

```bash
node fixture-engine/fixture-api.js    # or: npm run fixture:api
node fixture-engine/fixture-cli.js    # or: npm run fixture:cli
```
