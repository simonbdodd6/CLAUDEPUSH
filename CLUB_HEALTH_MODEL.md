# Coach's Eye — Club Health Model

## Philosophy

The Club Health Score is a single number (0–100) that represents the live operational health of a sports club. It should answer the question: *"Is this club in a good state to fulfil its mission?"*

It is not a vanity metric. It is a diagnostic tool. When the score falls, the system tells you exactly which dimension drove the change and what action to take.

---

## Score Scale

| Score | Grade | Status | Meaning |
|---|---|---|---|
| 90–100 | A | Excellent | Club is firing on all cylinders. Maintain. |
| 80–89 | B | Good | Strong position. One or two areas to watch. |
| 70–79 | C | Fair | Functional but meaningful gaps exist. |
| 55–69 | D | Poor | Multiple areas need attention. Risks elevated. |
| 0–54 | F | Critical | Immediate intervention required. |

---

## Dimensions

The score is the weighted average of 8 independently-scored dimensions.

---

### 1. Attendance — weight 20%

**Why 20%:** Attendance is the leading indicator of club health. Low attendance predicts player dropout, poor competitive performance, and reduced revenue. It is the canary.

| Score | Condition |
|---|---|
| 100 | ≥ 95% average training attendance |
| 80 | 80–94% |
| 60 | 60–79% |
| 30 | < 60% |

**Inputs:** Team average attendance rates from Memory Engine. Falls back to Club Intelligence attendance dimension score if available.

**When to act:** Any team below 75% for 2+ consecutive weeks. Run attendance poll. Personal contact for 2+ consecutive absences.

---

### 2. Player Availability — weight 15%

**Why 15%:** On-field availability directly determines competitive capacity and programme delivery. An unavailable player is a dropout risk.

| Score | Condition |
|---|---|
| 100 | ≥ 95% players available |
| 80 | 80–94% |
| 60 | 60–79% |
| 30 | < 60% |

**Inputs:** `players.availabilityRate` from club model (derived from injury tracking in Memory Engine).

**When to act:** Below 80%. Check injury protocols. Notify DoR of squad depth risk.

---

### 3. Membership — weight 15%

**Why 15%:** Retention rate predicts revenue sustainability and community strength. A shrinking membership is a slow existential threat.

| Score | Condition |
|---|---|
| 100 | Retention ≥ 90% |
| 80 | 75–89% |
| 60 | 60–74% |
| 35 | < 60% |
| +5 bonus | Trend is 'growing' |
| −10 penalty | Trend is 'shrinking' |

**Inputs:** Retention proxy derived from attendance + development data. Improving with dedicated Membership Engine (future).

**When to act:** Below 75%. Launch retention campaign. Review membership value proposition.

---

### 4. Coach Activity — weight 15%

**Why 15%:** Coaching quality and coverage directly determines player development and retention. Overloaded coaches produce lower-quality sessions and burn out.

Composite of two sub-scores averaged:

**Player:coach ratio sub-score:**
| Ratio | Score |
|---|---|
| ≤ 20:1 | 95 |
| ≤ 30:1 | 75 |
| ≤ 40:1 | 55 |
| > 40:1 | 35 |

**Sessions delivered sub-score:**
| Sessions | Score |
|---|---|
| 0 | 40 |
| 1–4 | 65 |
| 5–19 | 85 |
| ≥ 20 | 100 |

**Inputs:** `coaches.playerRatio`, `coaches.sessionsDelivered` from Memory Engine.

**When to act:** Ratio > 30. Recruit assistant coaches or restructure groups.

---

### 5. Injury Management — weight 10%

**Why 10%:** Injury rate is a lagging indicator of training load and player welfare. High rates signal programme problems or inadequate recovery.

| Squad Injury Rate | Score |
|---|---|
| 0% | 100 |
| 1–5% | 90 |
| 6–10% | 75 |
| 11–20% | 55 |
| > 20% | 30 |

**Inputs:** `players.injuredCount / players.activeCount`.

**When to act:** > 10%. Review session intensity. Physio assessment day.

---

### 6. Communication — weight 10%

**Why 10%:** Communication engagement is a proxy for community health. A disengaged membership is more likely to lapse. Pending drafts signal operational friction.

Composite of two sub-scores averaged:

**Email open rate sub-score:**
| Open rate | Score |
|---|---|
| ≥ 40% | 100 |
| 25–39% | 80 |
| 15–24% | 60 |
| < 15% | 35 |
| No data | 60 (neutral) |

**Pending drafts queue sub-score:**
| Pending | Score |
|---|---|
| 0–1 | 100 |
| 2–3 | 80 |
| 4–6 | 60 |
| > 6 | 40 |

**Inputs:** `communications.openRate`, `communications.pendingDrafts`.

**When to act:** Open rate < 25%. Review content quality and send frequency. Pending > 5 — clear queue.

---

### 7. Volunteer Coverage — weight 10%

**Why 10%:** Volunteer roles are the operational backbone of a community sports club. Gaps in critical roles (e.g. welfare officer, first aider) create compliance and safety risks.

| Coverage % | Score |
|---|---|
| ≥ 90% | 100 |
| 70–89% | 75 |
| 50–69% | 55 |
| < 50% | 30 |

**Inputs:** `volunteers.coveragePercent`, `volunteers.missingRoles` from Data Integration layer.

**When to act:** < 70%. Targeted recruitment campaign. Post in club newsletter.

---

### 8. Data Completeness — weight 5%

**Why 5%:** The Digital Twin can only score what it knows. A low completeness score means the other 7 dimensions are calculated on incomplete information — the real health score could be higher or lower. This dimension encourages data hygiene.

| Completeness % | Score |
|---|---|
| 90–100% | 90–100 (proportional) |
| 50–89% | proportional |
| < 50% | 0–50 |

**Inputs:** Internal computation — 10 key model fields checked for population. Score = `(populated_fields / 10) * 100`.

**Checked fields:** identity.name, membership.active, teams.length, players.activeCount, coaches.activeCount, health.score, insights.length, recommendations.length, committee.pendingApprovals, actionActivity.totalActionsRun.

---

## Delta Tracking

On each score computation, the system:
1. Reads the previous snapshot from `club-digital-twin/data/health-snapshots.jsonl`
2. Computes `delta = currentScore - previousScore`
3. Shows per-dimension deltas so the UI can display "Attendance fell 8 points"
4. Saves a new snapshot for the next run

This creates an automatic history of health changes without requiring a database.

---

## Trend Derivation

| Delta | Trend label |
|---|---|
| > +5 | improving |
| < −5 | declining |
| −5 to +5 | stable |
| No previous snapshot | unknown |

---

## Score Interpretation Guide

### For the Head Coach
Focus on **Attendance**, **Player Availability**, and **Injury Management**. These are the dimensions you control most directly through session design and player communication.

### For the Director of Rugby
Focus on **Coach Activity**, **Player Availability** (availability rate), and **Membership** trend. These predict competitive performance and player pipeline.

### For the Committee Chair
Focus on **Membership**, **Volunteer Coverage**, **Communication**, and the overall composite score trend. These predict the club's long-term sustainability.

---

## Integration Points

The health score is intentionally separate from the Club Intelligence Engine's existing `calculateClubHealth()` function. The Digital Twin health model:

- Has **explicit weights** (documented and auditable)
- Covers **8 dimensions** including data completeness (new)
- Tracks **deltas** against previous runs (new)
- Is **computed from the aggregated model**, not from raw engine calls
- Stores **snapshots** for trend analysis (new)

The Club Intelligence Engine score is used as a **fallback input** for the Attendance dimension when engine data is directly available.
