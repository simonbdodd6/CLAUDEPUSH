# Club Health Score

**Module:** `season-intelligence/club-health-score.js`  
**Version:** 1.0

---

## Purpose

The Club Health Score aggregates team health and club-wide governance metrics into a single number that tells the Director of Rugby, the club chairperson, and the committee: **is the club healthy right now?**

One number. One grade. One trend direction.

---

## Structure

```
Club Health Score (0–100)
│
├── Team Average (60% weight)
│   ├── Team 1 Health Score
│   ├── Team 2 Health Score
│   └── Team N Health Score (averaged)
│
└── Club-Wide Metrics (40% weight)
    ├── Membership Health   (12%)
    ├── Financial Indicators (8%)
    ├── Governance           (10%)
    └── Volunteer Depth     (10%)
```

---

## Club-Wide Dimension Scorers

### Membership Health (12%)
```
atRisk  = expiringThisWeek × (1 - renewalRate)
atRiskPct = atRisk / total * 100
score   = max(0, 100 - atRiskPct * 3)
```

Example: 145 members, 5 expiring, renewal rate 82% → 1 at risk (0.7%) → score 97.

---

### Financial Indicators (8%)
```
score = max(0, 100 - overdueInvoices * 15 - (lowBalance ? 30 : 0))
```

Placeholder in v1. Production version connects to accounting integration.

---

### Governance (10%)
```
score = max(0, 100 - overdueApprovals * 20 - pendingApprovals * 5)
```

2 overdue + 4 pending = 100 - 40 - 20 = **40/100** (POOR).

Governance is the most common weak dimension in amateur clubs — committees are volunteers with day jobs.

---

### Volunteer Depth (10%)
```
score = (totalRoles - openRoles) / totalRoles * 100
```

12 filled / 15 total = **80/100**.

---

## Grading and Trend

| Score    | Grade | Status      |
|----------|-------|-------------|
| 90–100   | A+    | Excellent   |
| 85–89    | A     | Excellent   |
| 80–84    | B+    | Good        |
| 75–79    | B     | Good        |
| 70–74    | C+    | Fair        |
| 65–69    | C     | Fair        |
| 55–64    | D     | Concerning  |
| < 55     | F     | Critical    |

Trend is calculated from stored weekly snapshots:
- **improving** — score rising
- **stable** — ±2 pts
- **declining** — score falling

---

## Weak Dimension Detection

Any dimension scoring below 65 is flagged as a `weakDimension`:

```js
weakDimensions: [
  { dimension: 'governance', score: 40, note: '2 overdue committee approvals' }
]
```

These are surfaced in:
- The morning briefing headline
- The Mobile app's Today screen
- The Autonomous Assistant's APPROVE queue

---

## Example Score (live run, 9 June 2026 — Off-Season)

```
Club Health Score
  Overall: 79/100  Grade B  (good)  ↑ improving

  Team average:      84/100  (U12 White 89, U14 Blue 85, U16 Red 78)
  Membership:        97/100  145 members, 1 at risk
  Finance:           85/100  1 overdue invoice
  Governance:        40/100  ← WEAK — 4 pending, 2 overdue ★
  Volunteer depth:   80/100  12/15 roles filled
```

**Primary action:** Address governance backlog. Two quick approvals would lift score from 79 → 82 (B+ range).

---

## Using the Score

### In the Autonomous Assistant
The club health score feeds the morning briefing severity:
- Score ≥ 80 → Normal briefing
- Score 65–79 → "Club health below target" highlighted
- Score < 65 → Briefing headline becomes the health score

### In the Season Simulation
The team average component feeds the `teamAverage` trajectory in the simulation's 8-week series.

### In the Mobile Command Layer
Displayed as the "Club Health" card on the Home screen (value + grade + trend arrow).

---

## Delta Tracking

```js
getClubHealthDelta(snapshot1, snapshot2)
→ { overall: +4, trend: 'improving', daysBetween: 7 }
```

Weekly deltas are stored in `season-snapshots.jsonl` for trend analysis.
