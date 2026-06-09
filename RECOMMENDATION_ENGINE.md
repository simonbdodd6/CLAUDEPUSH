# Recommendation Engine

**Module:** `autonomous-assistant/recommendation-engine.js`  
**Version:** 1.0

---

## Overview

The Recommendation Engine turns raw observations into ranked, actionable recommendations. It runs 8 detectors in a fixed priority order, each returning a `Recommendation` object or `null`. The resulting list is ranked by a weighted score and returned with one-tap actions, dismiss, and snooze controls.

---

## Ranking Algorithm

```
rankScore = urgency_score * 0.40
          + impact_score  * 0.25
          + confidence    * 0.20
          + time_saved_score * 0.15
```

| Input          | Scale         | Notes                                  |
|----------------|---------------|----------------------------------------|
| urgency_score  | CRITICAL=100, HIGH=75, MEDIUM=50, LOW=25 | Match urgency first |
| impact_score   | HIGH=100, MEDIUM=60, LOW=25              | Club-wide vs team-level |
| confidence     | 0–100 (%)     | Engine confidence in the data source   |
| time_saved_score | minutes_saved/60 * 100, capped at 100 | Operational efficiency signal |

Higher score → appears first in the coach's briefing.

---

## The 8 Detectors

### 1. `detectInjuryPositionCrisis`
**Triggers when:** 2+ players in the same position are unavailable  
**Urgency:** CRITICAL if fixture within 48h, otherwise HIGH  
**Impact:** HIGH  
**Actions:** Check availability, Alert selectors, Update injury log

The most game-critical detector. Position clusters of injuries cause lineup failures that can't be worked around at short notice. Fires before `detectVolunteerGap` in the ordering to ensure it surfaces first when both are active.

---

### 2. `detectVolunteerGap`
**Triggers when:** Any critical volunteer role unfilled (`openRoles >= 1`)  
**Urgency:** CRITICAL if fixture within 48h, otherwise HIGH  
**Impact:** HIGH  
**Actions:** Contact volunteers, Broadcast appeal

First Aider absence is a match-stopping condition — no insurer will allow a game to proceed. Linesperson gaps are a competition rule violation. The detector reads volunteer gap risks directly from the Digital Twin's risk register.

---

### 3. `detectApprovalBacklog`
**Triggers when:** `pending >= 2` approvals  
**Urgency:** HIGH if any overdue, otherwise MEDIUM  
**Impact:** MEDIUM  
**Actions:** Review approvals, Remind committee

Overdue approvals become exponential blockers: a kit order held for 3 days causes a delayed delivery causing players to play without proper equipment.

---

### 4. `detectAttendanceDecline`
**Triggers when:** Any team shows a negative attendance trend  
**Urgency:** HIGH if rate < 60%, otherwise MEDIUM  
**Impact:** MEDIUM  
**Actions:** Message parents, Review schedule, Full attendance report

Consistent decline over 3+ weeks predicts player dropout 6–8 weeks ahead. The detector calculates weeks-to-minimum and surfaces it in the recommendation reason.

---

### 5. `detectMembershipExpiry`
**Triggers when:** `expiringThisWeek >= 2`  
**Urgency:** HIGH if >10 expiring, otherwise MEDIUM  
**Impact:** MEDIUM  
**Actions:** Send renewal reminders (automatable)

Uses historical renewal rate (default 82%) to calculate members "at risk" of lapsing. Revenue impact is quantified: `atRisk * €85`.

---

### 6. `detectCommunicationGap`
**Triggers when:** No newsletter sent in >10 days  
**Urgency:** HIGH if >21 days, otherwise MEDIUM  
**Impact:** MEDIUM  
**Actions:** Generate newsletter (auto-generatable)

Member communications have a weekly cadence. Any gap above 10 days signals disengagement risk. The recommended action calls the AI newsletter generator — fully automatable.

---

### 7. `detectPlayerWorkload`
**Triggers when:** Any player has attended 5+ sessions in a week  
**Urgency:** HIGH if riskLevel === 'HIGH', otherwise MEDIUM  
**Impact:** MEDIUM  
**Actions:** Log workload note, Alert lead coach

Youth players especially have mandatory rest requirements. This detector surfaces both injury risk and safeguarding (duty of care) concerns. Always classified as HUMAN decision — a coach must personally review.

---

### 8. `detectWeatherRisk`
**Triggers when:** Weekend forecast is not CLEAR AND fixture within 7 days  
**Urgency:** MEDIUM  
**Impact:** LOW  
**Actions:** Check pitch status, Notify players

Lowest-priority detector. Fires as an early-warning to modify training content or notify transport arrangements. Placeholder data in v1; production version will integrate Met Éireann API.

---

## Classification Into Decision Tiers

After ranking, each recommendation is classified:

```
AUTO    → confidence > 75% AND impact ≠ HIGH AND type not in HUMAN_TYPES
APPROVE → confidence 50–75% OR urgency HIGH (one-tap confirm)
HUMAN   → CRITICAL urgency OR low confidence OR HUMAN_TYPES
```

**HUMAN_TYPES (never auto-executed):** `INJURY_POSITION_CRISIS`, `PLAYER_OVERLOAD`, `SAFEGUARDING`, `FINANCIAL_DECISION`

---

## Adding New Detectors

1. Write a function `detectXxx(obs)` that returns `rec({ ... }) | null`
2. Add it to the `detectors` array in `detectAndRank()`
3. Ensure it reads only from `observations` (never queries engines directly)

The pattern keeps the engine stateless and testable. Any detector can be tested by passing `MOCK_OBSERVATIONS`.

---

## One-Tap Actions

Every recommendation's non-system actions are wired to the Action Library:

```js
{ id: string, label: string, actionId: string, params: object }
```

`actionId` must match a registered action in `actions/action-registry.js`. The Mobile app and Command Centre can pass these directly to `POST /api/actions/run`.

System actions (snooze / dismiss) are handled entirely by the assistant state store and never reach the Action Library.

---

## Example Output (from live CLI run)

```
[CRITICAL] 3 volunteer roles unfilled — MATCH THIS WEEKEND
           Score: 83 · Confidence: 60% · Time saved: 25min

[CRITICAL] 3 Front Row players unavailable — match THIS WEEKEND
           Score: 82 · Confidence: 45% · Time saved: 30min

[HIGH    ] 4 items awaiting approval (2 overdue)
           Score: 63 · Confidence: 70% · Time saved: 15min

[MEDIUM  ] 5 memberships expiring this week — 1 at risk
           Score: 57 · Confidence: 55% · Time saved: 45min

[MEDIUM  ] No newsletter sent in 18 days
           Score: 57 · Confidence: 60% · Time saved: 40min
```
