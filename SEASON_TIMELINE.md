# Coach's Eye — Season Timeline

## Overview

The Season Timeline is the full view of a club's year — every fixture for every team, grouped by month, with standings and team summaries. It is computed entirely from the fixture store and updates automatically as results are recorded.

---

## Season Structure (Rugby Union)

```
YEAR 1                                    YEAR 2
Sep   Oct   Nov   Dec   Jan   Feb   Mar   Apr   May   Jun
│─────────────────────────────────────────────────────────│
│  PRE-SEASON   │           SEASON           │  OFF-SEASON │
│               │                            │             │
│ Friendlies    │ League + Cup rounds        │ End-of-season│
│ Trials        │ Knockout stages            │ reviews      │
│ Academy       │ Playoffs                   │ Recruitment  │
│ selection     │                            │              │
```

Season label auto-derived: `YYYY/YYYY+1` (Sep–May) or `YYYY-1/YYYY` (June–Aug).

---

## Timeline Data Model

```js
SeasonTimeline {
  season:        '2025/2026',
  fixtures:      42,          // total across all teams
  completed:     18,
  upcoming:      24,
  months: {
    'September 2025': [ FixtureEntry, ... ],
    'October 2025':   [ FixtureEntry, ... ],
    ...
  },
  teams:    ['Senior XV', 'U20', 'U16 Red', 'U14'],
  nextFixture: FixtureEntry,
  lastResult:  FixtureEntry,
  summary:     'Season: 18 played — W12 D2 L4. 24 fixtures remaining.',
  generatedAt: ISO timestamp,
}

FixtureEntry {
  id, teamName, ageGroup, opponent, competition,
  kickoff, kickoffLabel,
  isHome, status,
  result:  '24–18 (win)' | 'scheduled' | 'preparing',
}
```

---

## League Standings

Points are accumulated from completed fixtures in the store:

| Pos | Team | P | W | D | L | PF | PA | PD | Pts | Form |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Senior XV | 12 | 9 | 1 | 2 | 218 | 143 | +75 | 38 | WWDWW |
| 2 | City RFC | 12 | 7 | 2 | 3 | 196 | 168 | +28 | 30 | WWLDW |
| 3 | Rival RFC | 12 | 5 | 1 | 6 | 154 | 191 | -37 | 21 | LLLWW |

Points: Win = 4, Draw = 2, Loss = 0.
Form: last 5 results (most recent last).

Standings are filtered by competition — call `getSeasonStandings('league')` for the league table only.

---

## Team Season Summary

Each team has a standalone season summary:

```js
TeamSeasonSummary {
  teamId, teamName,
  played:   15,
  wins:     10, draws: 2, losses: 3,
  points:   44,
  pointsFor: 248, pointsAgainst: 162,
  pointsDiff: +86,
  form:     'WWWDL',   // last 5
  winRate:  67,
  upcoming: 8,
  nextFixture: FixtureEntry,
}
```

---

## Season Milestones

The Season Timeline naturally captures club milestones:

| Milestone | When |
|---|---|
| First win of season | First `result.status === 'win'` |
| Unbeaten run | N consecutive wins/draws |
| Top scorer | Derived from `result.scorers` |
| 100 points scored | Sum of `result.teamScore` across season |
| Cup progression | Fixture `competition = 'cup'` completed with win |
| Promotion challenge | League position + remaining fixtures |

Milestone detection is not yet automated — future enhancement.

---

## Multi-Team View

A club may have multiple age-group teams on the same season timeline:

```
JUNE 2026
  Sat 14  │ U16 Red     vs City Youth RFC    — Away   CUP
  Sat 21  │ Senior XV   vs Rival RFC         — Home   LEAGUE
  Sat 21  │ U14         vs Northside RFC     — Home   LEAGUE
```

`updateSeasonTimeline()` aggregates all fixtures from all teams into a single calendar. Each entry includes `teamName` and `ageGroup` so multi-team views are always clear.

---

## Digital Twin Season Data

The Club Digital Twin's `fixtures` block reflects the season state:

```js
model.fixtures = {
  upcomingCount: 8,
  upcoming: [
    { teamName: 'Senior XV', opponent: 'Rival RFC', daysToKickoff: 12, ... },
    { teamName: 'U16 Red',   opponent: 'City Youth', daysToKickoff: 5, ... },
    ...
  ],
  nextFixture: { opponent: 'City Youth', daysToKickoff: 5, teamName: 'U16 Red' },
  source: 'fixture-engine',
}
```

And each team object carries its own upcoming fixtures:
```js
model.teams[0].fixtures     = [ upcoming fixtures for this team ]
model.teams[0].nextFixture  = next fixture entry
```

This makes the season timeline accessible to every consumer of the Digital Twin — from the Command Centre dashboard to the Risk Engine.

---

## Season Timeline API Endpoints

```
GET /season/timeline                — Full calendar grouped by month
GET /season/standings               — League table (all competitions)
GET /season/standings?competition=league  — League only
GET /season/standings?competition=cup     — Cup only
GET /season/team/:teamId            — Team season summary
```

---

## Season Lifecycle

```
PHASE 1 — PRE-SEASON (Aug–Sep)
  ↓ Create friendly fixtures
  ↓ Trial sessions scheduled
  ↓ Academy assessments
  ↓ Season registration

PHASE 2 — EARLY SEASON (Sep–Nov)
  ↓ League rounds begin
  ↓ Cup first rounds
  ↓ Health score monitored weekly
  ↓ Injury patterns detected

PHASE 3 — MID-SEASON (Dec–Feb)
  ↓ Table positions crystallise
  ↓ Key fixtures prioritised
  ↓ Recruitment review (fill gaps)
  ↓ Development player reviews

PHASE 4 — END OF SEASON (Mar–May)
  ↓ Playoffs (if applicable)
  ↓ Final standings
  ↓ Season report generated
  ↓ Digital Twin end-of-season snapshot
  ↓ Player renewal / departure tracking

PHASE 5 — OFF-SEASON (Jun–Aug)
  ↓ Review season health trends
  ↓ Recruitment campaign
  ↓ Club AGM pack generation
  ↓ Pre-season schedule built
```

---

## Generating the Season Report

Use the Action Library + Knowledge Engine to generate a full season narrative:

```js
// Action: committee.executive_dashboard
const result = await actions.run('committee.executive_dashboard', {}, { role: 'admin' });

// Or directly:
import { generateBoardReport } from './club-digital-twin/club-summary.js';
import { buildClubModel }      from './club-digital-twin/club-model.js';
import { buildRiskRegister }   from './club-digital-twin/club-risk.js';
import { computeTrends }       from './club-digital-twin/club-trends.js';
import { updateSeasonTimeline } from './fixture-engine/fixture-standings.js';

const model    = await buildClubModel();
const risks    = buildRiskRegister(model);
const trends   = computeTrends();
const timeline = updateSeasonTimeline();

const report = await generateBoardReport(model, risks, trends);
// report.sections includes 'Membership & Retention', 'Coaching & Development',
// 'Sponsorship', 'Finance (placeholder)' etc.
// Add 'Season Performance' section from timeline.summary.
```

---

## Future: Fixture Import

The Fixture Engine is designed to accept external data sources:

- **CSV import** — paste fixtures from league website
- **iCal/ICS** — subscribe to league fixture calendar
- **API integration** — direct connection to national union fixture system

The store interface (`saveFixture`, `getFixture`, `listAllFixtures`) is the single integration point. External importers write to the store; all downstream logic works unchanged.
