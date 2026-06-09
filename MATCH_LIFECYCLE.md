# Coach's Eye — Match Lifecycle

## Overview

Every fixture passes through a defined lifecycle from creation to Digital Twin update. The system automatically tracks which stage each fixture is in and generates the appropriate preparation tasks.

---

## Lifecycle States

```
SCHEDULED → PREPARING → READY → IN_PROGRESS → COMPLETED
                                             ↘ CANCELLED
                                             ↘ POSTPONED
```

| Status | Trigger | What it means |
|---|---|---|
| `scheduled` | `createFixture()` | Fixture entered in the system. Timeline generated. |
| `preparing` | `prepareFixture()` | Digital Twin data pulled in. Squad status populated. |
| `ready` | Match pack generated | All preparation complete. Pack sent to squad. |
| `in_progress` | Kickoff (manual or auto) | Squad locked. Match underway. |
| `completed` | `completeFixture()` | Result recorded. Review generated. |
| `cancelled` | Manual | Fixture will not take place. |
| `postponed` | Manual | Fixture rescheduled — create new fixture with new date. |

---

## Full Lifecycle — Step by Step

### Stage 1: Scheduling (14+ days out)

**Trigger:** Fixture added to system manually or imported from league calendar.

**Actions:**
1. `createFixture(data)` — creates fixture entity with full schema
2. `generateTimeline(fixture)` — produces 13 preparation tasks with due dates
3. `saveFixture(fixture)` — persists to `fixture-engine/data/fixtures/`
4. Digital Twin `buildClubModel()` — picks up fixture in `teams[].fixtures[]`

**Fixture state:** `scheduled`

**Key data populated:**
- opponent, venue, kickoff, competition, isHome
- volunteers.required (5 default roles)
- transport.required (true if away)
- weather._placeholder: true
- preparationChecklist: 13 tasks

---

### Stage 2: Early Preparation (7 days out)

**Trigger:** Automatic — `squad_review` task becomes actionable.

**Actions:**
1. `prepareFixture(fixtureId)` — enriches fixture from Digital Twin:
   - Pulls injured players from `model.players.injured`
   - Pulls at-risk players as `uncertain`
   - Computes `availabilityRate`
   - Checks volunteer coverage
   - Generates medical alerts for active injuries
   - Detects player milestones

2. `analyseOpposition(fixture)` — Knowledge Engine generates tactical analysis

**Fixture state:** `preparing`

**Key data added:**
- squadStatus.injured, squadStatus.uncertain, squadStatus.available
- medicalAlerts[]
- playerMilestones[]
- volunteers.missing[]
- _availabilityRate

---

### Stage 3: Volunteer & Attendance Confirmation (3–2 days out)

**Trigger:** `volunteer_check` and `attendance_confirm` tasks due.

**Actions:**
1. Check `volunteers.required` — flag unfilled roles as missing
2. Send availability poll to full squad
3. Update `squadStatus.uncertain` with responses
4. Set `transport.departureTime` for away fixtures

**Risk Engine alert if:**
- Any required volunteer role unfilled → `VOLUNTEER_GAP` risk raised
- Availability < 80% → `SQUAD_DEPTH` risk raised
- Away transport not arranged → task overdue

---

### Stage 4: Match Pack (1 day before)

**Trigger:** `match_pack` task due (−1 day).

**Actions:**
1. `generateMatchPack(fixture)` — produces full match document:

```
Match Pack Contents:
  ┌ Fixture summary          — opponent, venue, kickoff, referee
  ├ Squad list               — selected, injured, uncertain
  ├ Opposition analysis      — AI tactical briefing (Knowledge Engine)
  ├ Final session plan       — AI-generated 45-min prep session
  ├ Volunteer assignments    — confirmed roles + missing gaps
  ├ Transport details        — departure time, venue directions
  ├ Medical alerts           — injuries, first aider assignment
  ├ Player milestones        — celebrations, development notes
  ├ Head-to-head record      — previous results vs opponent
  └ Team messages            — motivational + tactical brief
```

2. Pack saved to `fixture.matchPack`
3. Pre-match brief sent to squad (via Communications Engine — manual trigger)

**Fixture state:** `ready`

---

### Stage 5: Matchday

**Trigger:** Kickoff day — `squad_lock` task becomes active.

**Actions:**
1. Lock squad — `fixture.squadLockedAt` set to current timestamp
2. No further squad changes permitted
3. `fixture.status = 'in_progress'` (optional manual trigger)
4. First aider confirms on-site

---

### Stage 6: Post-Match (same day / next day)

**Trigger:** Match ends. Coach or system calls `completeFixture()`.

**Actions:**
1. `completeFixture(fixtureId, result)`:
   - Records `teamScore`, `opponentScore`, `scorers`, `yellowCards`, `redCards`, `manOfMatch`
   - Computes `result.status` (win/loss/draw)
   - Sets `fixture.status = 'completed'`
   - Marks `squad_lock` and `coach_review` tasks done

2. `generatePostMatchReview(fixtureId, notes)`:
   - AI narrative (Knowledge Engine): 2-paragraph match review
   - Match insights: discipline, scoring, squad depth
   - Performance areas: strengths, improvements, focus
   - Next fixture focus

3. `generatePlayerReports(fixture, ratings)`:
   - Per-player rating + notes
   - Man of match flag

**Fixture state:** `completed`

---

### Stage 7: Digital Twin Update (post +3 days)

**Trigger:** `twin_update` task due (+3 days after match).

**Actions:**
1. `updateDigitalTwin(fixtureId)`:
   - Calls `runDigitalTwin({ saveTrends: true })`
   - Digital Twin rebuilds with match result data
   - Club health score recalculates
   - New snapshot saved for trend tracking
   - `fixture.twinUpdateApplied = true`

2. Season standings update automatically (`getSeasonStandings()`)

---

## Preparation Checklist Progress

The checklist tracks completion through the lifecycle:

```
Day 14: [⏳] Opposition research
Day  7: [✓ ] Squad review
Day  5: [✓ ] Injury analysis
Day  4: [✓ ] Venue confirmed
Day  3: [⚠ ] Volunteer check — OVERDUE (2 roles missing)
Day  2: [⏳] Attendance confirmation
Day  2: [⏳] Medical brief
Day  1: [⏳] Generate match pack  ← critical
Day  1: [⏳] Pre-match brief
Day  0: [⏳] Lock squad           ← critical
Post 0: [⏳] Coach review
Post 1: [⏳] Player reports
Post 3: [⏳] Update Digital Twin
```

Task status: `pending` → `in_progress` → `done` | `overdue` | `skipped`

---

## Result Computation

Points system (rugby union default):

| Outcome | Points |
|---|---|
| Win | 4 |
| Draw | 2 |
| Loss | 0 |
| Losing bonus (within 7 pts) | +1 |
| Scoring bonus (4+ tries) | +1 |

Note: Bonus points are not automatically computed — they require scorer data. The basic W/D/L table is computed from `teamScore` vs `opponentScore`.

---

## Risk Detection (Fixture-Aware)

The risk engine detects fixture-specific risks when the Digital Twin has fixture data:

| Risk | Condition | Severity |
|---|---|---|
| `SQUAD_DEPTH` | < 10 fit players and fixture within 3 days | HIGH |
| `VOLUNTEER_GAP` | Missing first aider for upcoming fixture | CRITICAL |
| `ATTENDANCE_DECLINE` | < 75% attendance trend + fixture this week | HIGH |
| `INJURY_CLUSTER` | > 3 injuries in same team with fixture upcoming | HIGH |

---

## Automatic vs Manual Actions

| Action | Automatic | Manual |
|---|---|---|
| Timeline generation | ✓ On schedule | — |
| Squad enrichment from Digital Twin | ✓ On prepare | ✓ `prepareFixture()` |
| Opposition analysis | — | ✓ `analyseOpposition()` |
| Match pack generation | — | ✓ `generateMatchPack()` |
| Result recording | — | ✓ `completeFixture()` |
| Post-match review | — | ✓ `generatePostMatchReview()` |
| Digital Twin update | — | ✓ `updateDigitalTwin()` |
| Season standings | ✓ Derived from store | ✓ `getSeasonStandings()` |

All "automatic" actions are triggered by the preparation timeline task system. A future cron/scheduler layer can call the `autoAction` field on each overdue task.
