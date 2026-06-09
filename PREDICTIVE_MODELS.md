# Predictive Models

**Module:** `season-intelligence/predictive-models.js`  
**Version:** 1.0

---

## Overview

Five forward-looking models scan current observations and generate predictions about what will happen — before it happens. Each prediction includes a confidence score, timeframe, plain-English explanation, and specific interventions.

The platform does not wait for things to go wrong. It flags the trajectory.

---

## Model 1: Player Workload Forecast

**Question:** "When will this player hit the overload threshold?"

**Input:** Observed sessions this week per player, phase prescription target

**Algorithm:**
```
threshold       = 4 (pre-season) | 5 (all other phases)
daysToThreshold = (threshold - sessionsNow) / (sessionsNow/7) * 7
```

**Output example:**
```
[PLAYER_WORKLOAD] Ciarán Murphy — workload threshold exceeded
→ Currently overloaded
Confidence: 90%  ·  Timeframe: Now
Interventions: Mandatory rest day · Reduce intensity next session
```

**Also fires:** Squad-wide workload alert when average sessions/week > 3.5 even if no individual is overloaded.

---

## Model 2: Attendance Forecast

**Question:** "Where will attendance be in 4 weeks? Will holidays cause a dip?"

**Inputs:** Current rate, weekly trend, Irish school holiday calendar

**Algorithm:**
```
in4Weeks = current + (weeklyDelta * 4)
weeklyDelta = declining → -4 | stable → 0 | strong → +2
```

**Holiday model:**
```
holidayDrop = current * 0.18   // 18% average drop during Irish school holidays
```

Holiday calendar: October mid-term · Christmas · February mid-term · Easter · Summer

**Output examples:**
```
[ATTENDANCE_FORECAST] Attendance decline forecast
→ Attendance will reach ~52% in 4 weeks at current trend
Confidence: 68%  ·  Timeframe: 4 weeks

[HOLIDAY_ATTENDANCE_DIP] Currently in holiday period — attendance suppressed
→ Attendance will recover to ~78% within 2 weeks of term restart
Confidence: 78%
```

---

## Model 3: Availability Trajectory

**Question:** "Will we have enough players available by the playoffs?"

**Input:** Current injuries, player count, target phase availability benchmark

**Algorithm:**
```
injuryRecoveryRate = 0.5 injuries/week (empirical average for amateur rugby)
weeksToTarget      = 10
projectedInjuries  = max(0, current - recoveryRate * weeks)
projectedAvail     = (playerCount - projectedInjuries) / playerCount * 100
```

**Output example:**
```
[AVAILABILITY_TRAJECTORY] Availability trajectory → PLAYOFF PREP
→ On track to reach ~100% availability by PLAYOFF PREP
Current: 88%  →  Projected: 100%  |  Target: 85%
Confidence: 58%  ·  Timeframe: 10 weeks
```

---

## Model 4: Injury Risk Index

**Question:** "Is injury risk increasing in a specific area? Is this the right phase for it?"

**Two sub-models:**

### Position Cluster Risk
Fires when 2+ players in the same position are injured simultaneously.
```
risk   = count >= 3 ? 68% above baseline : 42% above baseline
trigger = byPosition[pos] >= 2
```

**Output:**
```
[INJURY_RISK_INDEX] Front Row injury risk: HIGH
→ 3 Front Row players injured. Probability of further Front Row injury 68% above baseline.
Confidence: 70%  ·  Timeframe: 14 days
```

### Phase-Specific Risk
- **Pre-season overuse:** Rapid fitness build in weeks 3–5 elevates hamstring/calf risk by 35%
- **Playoff pressure:** Accumulated fatigue + intensity spike elevates season-ending injury risk

---

## Model 5: Season Outcome Projection

**Question:** "Where will the club's health score be at the end of the season?"

**Algorithm:**
```
weeklyDelta     = improving → +0.8 | stable → 0 | declining → -1.2
projectedScore  = clamp(30, 95, current + weeklyDelta * weeksLeft)
```

**Output:**
```
[SEASON_OUTCOME] Season-end club health projection
→ At current trajectory: club health 79/100 by end of season (currently 79/100)
Confidence: 52%  ·  Timeframe: 0 weeks (season ending)
Ideal: 88/100  |  Gap to ideal: 9 points
```

---

## Confidence Calibration

| Model                    | Confidence | Method                                    |
|--------------------------|------------|-------------------------------------------|
| Player workload          | 65–90%     | Direct observation (high confidence)      |
| Attendance 4-week trend  | 68%        | Linear extrapolation of 3-week trend      |
| Holiday attendance dip   | 78–82%     | Historical Irish rugby attendance pattern |
| Availability trajectory  | 58%        | Linear injury recovery model              |
| Injury risk (position)   | 70%        | Position cluster analysis                 |
| Injury risk (phase)      | 65–72%     | Phase + load combination                  |
| Season outcome           | 52%        | Long-range projection (high uncertainty)  |

Confidence < 60% predictions are displayed but not auto-executed.

---

## Interventions

Every prediction includes specific, actionable interventions linked to the Action Library:

```js
interventions: [
  { action: 'Mandatory rest day',      actionId: 'LOG_PLAYER_NOTE',    priority: 'HIGH'   },
  { action: 'Reduce intensity',         actionId: 'SEND_TEAM_MESSAGE',  priority: 'MEDIUM' },
  { action: 'Physio assessment',        actionId: 'LOG_INJURY',          priority: 'MEDIUM' },
]
```

These feed directly into the Autonomous Assistant's APPROVE/HUMAN decision queue.

---

## Running All Predictions

```js
import { generateAllPredictions } from './season-intelligence/index.js';
const predictions = generateAllPredictions(observations, clubHealth);
// Returns: [...workload, ...attendance, ...availability, ...injuryRisk, ...outcome]
```
