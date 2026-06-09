# Coach's Eye — Autonomous Coaching Assistant

**Version:** 1.0  
**Status:** Complete — tests passing  
**Port:** 3004 (API) · no UI dependency

---

## What It Is

The Autonomous Coaching Assistant is the active intelligence layer of the Coach's Eye platform. It watches everything, notices when something needs attention, ranks what matters most, and tells the coach clearly: *act now*, *approve this*, or *I've already handled it*.

The platform stops waiting for the coach. The coach starts each day with a briefing, not a to-do list.

---

## Architecture

```
autonomous-assistant/
├── index.js                ← public API exports
├── observation-engine.js   ← reads all 10 data sources, produces Observations snapshot
├── recommendation-engine.js← 8 detectors → ranked Recommendation objects
├── ai-timeline.js          ← 14-day predictive timeline with probability scores
├── decision-support.js     ← AUTO / APPROVE / HUMAN classification + briefing
├── assistant-state.js      ← JSONL state store for rec lifecycle (dismiss/snooze/resolve)
├── assistant-core.js       ← pipeline orchestrator: observe → detect → classify → brief
├── assistant-api.js        ← Express server port 3004
├── assistant-cli.js        ← CLI test runner
└── data/
    └── recommendations.jsonl ← append-only recommendation state (compacts at 300 lines)
```

---

## The Pipeline

```
observe()
  ├── reads: Digital Twin, Fixture Engine (lazy, graceful fail)
  ├── fallback: MOCK_OBSERVATIONS (realistic mock data)
  └── returns: Observations { attendance, injuries, fixtures, volunteers,
                               memberships, workload, approvals, communications,
                               finance, weather }

detectAndRank(observations)
  ├── runs 8 detectors in sequence
  ├── each returns Recommendation | null
  ├── ranks by: urgency 40% · impact 25% · confidence 20% · time-saved 15%
  └── returns: Recommendation[]

generateTimeline(observations, fixtures)
  ├── fixture events (scheduled)
  ├── attendance predictions (trending)
  ├── injury risk windows
  ├── communication reminders (newsletter, post-match)
  ├── membership expiry reminders
  ├── volunteer confirmation deadlines
  └── opportunities (positive reinforcement, sponsor check-in)

classifyRecommendations(recommendations)
  ├── AUTO    → confidence > 75, impact ≠ HIGH, not personnel decision
  ├── APPROVE → one-tap confirm (medium confidence / high urgency)
  └── HUMAN   → low confidence, CRITICAL, or involves people/welfare

generateCoachBriefing(recs, timeline, obs)
  └── headline, severity, summary, stats (auto/approve/human/minutes saved)
```

---

## Observation Domains

| Domain         | What it tracks                              | Source              |
|----------------|---------------------------------------------|---------------------|
| Attendance     | Team rates, trend, declining teams          | Digital Twin        |
| Injuries       | Count, by position, critical shortages      | Digital Twin        |
| Fixtures       | Upcoming, within 48h/7d, next match         | Fixture Engine      |
| Volunteers     | Open roles, critical gaps, fixture-linked   | Digital Twin        |
| Memberships    | Expiring this week, at-risk, renewal rate   | Digital Twin        |
| Workload       | Overloaded players, sessions/week           | Digital Twin        |
| Approvals      | Pending count, overdue, type breakdown      | Digital Twin        |
| Communications | Days since newsletter, unread, pending      | Digital Twin        |
| Finance        | Overdue invoices, balance alerts            | Digital Twin        |
| Weather        | Weekend forecast, pitch risk                | Placeholder         |

---

## Recommendation Schema

```js
{
  id:           UUID,
  type:         'VOLUNTEER_GAP' | 'INJURY_POSITION_CRISIS' | 'ATTENDANCE_DECLINE' | ...,
  category:     'Operations' | 'Player Welfare' | 'Membership' | 'Governance' | ...,
  title:        string,          // One-line, action-oriented
  reason:       string,          // Why this matters now
  supportingData: object,        // Raw numbers behind the recommendation
  confidence:   0–100,           // How certain the engine is
  urgency:      'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
  impact:       'HIGH' | 'MEDIUM' | 'LOW',
  riskIfIgnored: string,
  timeSaved:    number,          // Minutes saved if actioned/automated
  rankScore:    number,          // Calculated: urgency·impact·confidence·time-saved
  actions: [
    { id, label, actionId, params },   // One-tap actions
    { id: 'snooze-4h',  type: 'SNOOZE', system: true },
    { id: 'snooze-24h', type: 'SNOOZE', system: true },
    { id: 'dismiss',    type: 'DISMISS',system: true },
  ],
  state:        'ACTIVE' | 'DISMISSED' | 'SNOOZED' | 'RESOLVED',
  snoozedUntil: ISO string | null,
  createdAt:    ISO string,
}
```

---

## API Reference

Base: `http://localhost:3004`

| Method | Path                          | Description                        |
|--------|-------------------------------|------------------------------------|
| GET    | `/status`                     | Last run time, summary             |
| GET    | `/briefing`                   | Morning briefing (auto-observe)    |
| GET    | `/recommendations`            | Active ranked recommendations      |
| POST   | `/recommendations/:id/dismiss`| Dismiss recommendation             |
| POST   | `/recommendations/:id/snooze` | Snooze (body: `{ hours }`)         |
| POST   | `/recommendations/:id/resolve`| Mark resolved                      |
| GET    | `/timeline`                   | 14-day AI timeline                 |
| GET    | `/decision-support`           | AUTO / APPROVE / HUMAN split       |
| GET    | `/automation-report`          | Time savings breakdown             |
| POST   | `/run`                        | Trigger full check                 |
| POST   | `/automate`                   | Execute auto-executable actions    |

---

## Running

```bash
# Start the API server
npm run assistant:api      # http://localhost:3004

# CLI test runner
npm run assistant:cli
npm run assistant:cli -- --all
npm run assistant:cli -- --timeline
npm run assistant:cli -- --report
```

---

## Integration Points

The assistant **reads** from:
- Club Digital Twin (`club-digital-twin/index.js`)
- Fixture Engine (`fixture-engine/index.js`)
- All via lazy import — works at partial capacity when engines are unavailable

The assistant **writes** via:
- Action Library (`actions/index.js`) — auto-executes AUTO-classified actions
- `autonomous-assistant/data/recommendations.jsonl` — persists rec state

The **Mobile Command Layer** and **Command Centre** can both consume:
- `GET /recommendations` — for the Alerts tab
- `GET /briefing` — for the Today/Home screen
- `GET /timeline` — for the Timeline view

---

## Design Principles

1. **Never block the coach.** Every observation falls back to mock data. The briefing is always produced.
2. **Rank by business impact, not volume.** A 3-min check that surfaces 2 CRITICAL items beats a 20-item list.
3. **Earn trust incrementally.** LOW confidence → HUMAN decision. HIGH confidence, LOW impact → AUTO.
4. **Leave an audit trail.** Every recommendation, action, and state change is appended to the JSONL store.
5. **No new data stores.** The assistant reads from existing engines — it adds intelligence, not infrastructure.
