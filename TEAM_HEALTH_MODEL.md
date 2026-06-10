# Team Health Model

**Module:** `season-intelligence/team-health-score.js`  
**Version:** 1.0

---

## Overview

The Team Health Score produces a single 0–100 score for each team from 8 weighted dimensions. The score is phase-calibrated — the same 80% attendance rate scores differently in pre-season (good) versus finals month (below target).

---

## Dimensions and Weights

| Dimension              | Weight | Measures                                    |
|------------------------|--------|---------------------------------------------|
| Availability           |  20%   | % of registered players available to train/play |
| Attendance             |  15%   | Average session attendance rate              |
| Injury Burden          |  20%   | Inverse of injury count × severity          |
| Squad Continuity       |  10%   | Lineup stability (% consistent selection)   |
| Workload Balance       |  15%   | Players in optimal load zone vs over/under  |
| Communication Health   |  10%   | Newsletter cadence + message response rate  |
| Volunteer Support      |   5%   | % of required volunteer roles filled        |
| Committee Health       |   5%   | Approval turnaround, outstanding items      |

**Total weight = 100%**

---

## Scoring Rules

### Availability (20%)
```
raw = available_players / total_registered * 100
target = 90% (FINALS/PLAYOFFS) | 80% (all other phases)
score = min(100, raw / target * 100)
```
Notes below 70% trigger a dimension alert.

---

### Attendance (15%)
```
target   = phase prescription.attendanceExpectation.target
minimum  = phase prescription.attendanceExpectation.minimum
score    = min(100, raw / target * 100)
```
Phase targets:
- Pre-season: 85% target / 75% minimum
- Playoffs: 88% target / 80% minimum
- Finals: 93% target / 85% minimum
- Off-season: 50% target (voluntary)

---

### Injury Burden (20%)
```
rate  = injuries / playerCount * 100
score = max(0, 100 - rate * 3)
```
Scale: 0 injuries = 100, 33% squad injured = 0.

Burden labels: NONE (0) · LIGHT (1–2) · MODERATE (3–4) · HEAVY (5+)

---

### Squad Continuity (10%)
Measures how consistently the same players appear in selections. High turnover (new faces every week) suppresses cohesion and score.

```
score = min(100, continuity_percent)
```

---

### Workload Balance (15%)
```
imbalance = (overloaded + underloaded) / playerCount * 100
score     = max(0, 100 - imbalance * 2)
```

Overloaded: >5 sessions/week (pre-season: >4)  
Underloaded: <1 session/week outside off-season

---

### Communication Health (10%)
```
penalty = min(50, daysSinceNewsletter * 2.5) + min(20, unreadMessages * 2)
score   = max(0, 100 - penalty)
```

A 14-day newsletter gap costs 35 points. 10 unread messages cost 20 points.

---

### Volunteer Support (5%)
```
fillRate = (totalRoles - openRoles) / totalRoles * 100
score    = fillRate
```

Any unfilled first-aider role for an upcoming fixture automatically lowers score below 80.

---

### Committee Health (5%)
```
penalty = (overdue * 15) + (pending * 5)
score   = max(0, 100 - penalty)
```

2 overdue approvals costs 30 points. Governance bottlenecks depress club morale.

---

## Overall Score Formula

```
overall = Σ (dimension.score × dimension.weight)
```

---

## Grading Scale

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

---

## Example Output (from live CLI run)

```
CLUB HEALTH SCORE
  Overall: 79/100  B  (good)  improving
  ███████████████████░░░░░

  Club dimensions:
    teamAverage        █████████████░░░  84   Team avg: 84
    membership         ████████████████  97   145 members · 5 expiring · 1 at risk
    finance            ██████████████░░  85   1 overdue invoice
    governance         ██████░░░░░░░░░░  40   4 pending · 2 overdue ← WEAK
    volunteerDepth     █████████████░░░  80   12/15 roles filled

  Teams:
    U16 Red        ████████████░░░░  78 B
    U14 Blue       ██████████████░░  85 A
    U12 White      ██████████████░░  89 A
```

---

## Using the Score

The team health score feeds:
1. **Autonomous Assistant** — dimensions below 65 generate recommendations
2. **Season Simulation** — current vs expected comparison
3. **Club Health Score** — team average contributes 60% of overall club score
4. **Predictive Models** — injury burden and workload scores seed the injury risk index

---

## Multi-Team Summary

`buildMultiTeamSummary()` returns the team array sorted by score, plus best/worst team identification for the Director of Rugby's weekly briefing.
