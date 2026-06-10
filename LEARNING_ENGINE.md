# Learning Engine

**Module:** `learning-engine/`  
**API Port:** 3006  
**Version:** 1.0

---

## Purpose

Every other AI engine in Coach's Eye generates recommendations based on patterns it was built with. The Learning Engine makes those recommendations *better over time* by tracking what actually happened after each recommendation was acted on — or ignored.

The Learning Engine answers: **is Coach's Eye getting smarter?**

---

## Architecture

```
Recommendation generated
        │
        ▼
  outcome-tracker.js    ← Coach decides: ACCEPTED / REJECTED / SNOOZED / AUTO
        │
        ▼
  learning-store.js     ← Persisted to outcomes.jsonl
        │
        ├──→ confidence-calibrator.js   ← EMA updates per recommendation type
        ├──→ prediction-accuracy.js     ← Precision / Recall / F1 per type
        ├──→ feedback-loop.js           ← Monthly snapshot (acceptance rate, time saved)
        ├──→ club-intelligence-model.js ← Club Intelligence Score (0–100)
        └──→ self-improvement.js        ← Adjustment plan (confidence, urgency, timing)
```

---

## Files

| File | Purpose |
|------|---------|
| `outcome-tracker.js` | Records the full lifecycle: recommendation → decision → outcome |
| `learning-store.js` | JSONL persistence (outcomes, feedback, club-profile) |
| `confidence-calibrator.js` | Bayesian EMA confidence updates per type |
| `prediction-accuracy.js` | TP/FP/FN/TN → Precision/Recall/F1/Specificity |
| `feedback-loop.js` | Monthly feedback snapshots (6 metrics) |
| `club-intelligence-model.js` | Coaching Intelligence Score (CIS) |
| `self-improvement.js` | Auto-adjustment plan from feedback data |
| `learning-api.js` | Express HTTP server, port 3006 |
| `learning-cli.js` | CLI test runner |
| `index.js` | Public exports |

---

## Outcome Lifecycle

```
recommendation
    │
    ├── Coach ACCEPTED → action taken → outcome observed
    │       ├── INTERVENTION_SUCCESSFUL  (platform wins)
    │       └── INTERVENTION_INEFFECTIVE (action didn't prevent outcome)
    │
    ├── Coach REJECTED → wait → observe what happened
    │       ├── PREDICTION_CORRECT  (outcome happened as predicted)
    │       └── PREDICTION_WRONG    (outcome didn't happen — false positive)
    │
    ├── Coach SNOOZED → same as REJECTED
    │
    ├── AUTO → platform acted without asking
    │       ├── INTERVENTION_SUCCESSFUL
    │       └── INTERVENTION_INEFFECTIVE
    │
    └── FALSE_NEGATIVE → outcome happened without any recommendation fired
```

---

## Confidence Calibration

The Calibrator uses an exponential moving average (EMA) per recommendation type:

```
α = 0.15 (learning rate — shifts ~4% per event)

POSITIVE outcome → EMA step toward 82% (observed high-accuracy target)
NEGATIVE outcome → EMA step toward 38% (observed low-accuracy floor)
```

A single false positive shifts confidence by ~3%. Ten consistent false positives converge confidence toward 38%. Ten consistent successes converge toward 82%.

Cold start confidence: **55%** (prior).

---

## Monthly Feedback Loop

Every month, six metrics are computed and stored:

| Metric | What it measures |
|--------|-----------------|
| Prediction accuracy (F1) | Overall quality of recommendations |
| False positive rate | How often the platform cries wolf |
| False negative rate | How often the platform misses real events |
| Coach acceptance rate | How much the coach trusts the platform |
| Automation success rate | How often AUTO actions work without human review |
| Time saved (hours) | Estimated admin hours eliminated |

These snapshots are read by the Self-Improvement Engine to trigger re-calibration.

---

## Club Intelligence Score (CIS)

A single number (0–100) representing how well Coach's Eye has learned THIS specific club's patterns.

| Score | Stage | Description |
|-------|-------|-------------|
| 0–20 | Cold Start | Generic models only |
| 21–40 | Emerging | First season patterns |
| 41–60 | Calibrating | Club-specific adjustments active |
| 61–80 | Calibrated | Reliable club-specific predictions |
| 81–95 | Expert | Predictive months in advance |

**Weighted components:**

| Component | Weight | What it tracks |
|-----------|--------|---------------|
| Sample depth | 30% | Total outcomes recorded |
| Prediction accuracy (F1) | 30% | How often predictions were right |
| Coach acceptance rate | 20% | How much the coach trusts the system |
| Calibration maturity | 20% | EMA convergence quality |

---

## Live Run Result (34 mock outcomes, June 2026)

```
Club Intelligence Score: 69/100  (Calibrated)
Overall F1:              95%  Grade: A

By type:
  ATTENDANCE_DECLINE        100% F1  (6 outcomes)  A
  VOLUNTEER_GAP             100% F1  (6 outcomes)  A
  APPROVAL_BACKLOG          100% F1  (4 outcomes)  A
  MEMBERSHIP_EXPIRY         100% F1  (4 outcomes)  A
  COMMUNICATION_GAP         100% F1  (3 outcomes)  A
  PLAYER_OVERLOAD           100% F1  (3 outcomes)  A
  INJURY_POSITION_CRISIS     86% F1  (4 outcomes)  A
  WEATHER_RISK               67% F1  (4 outcomes)  C ← needs more data

Monthly time saved:       14.5 hours
Coach acceptance rate:    85%
Automation success rate:  100%
Projected CIS (1 season): 88/100
```

---

## API Endpoints

```
GET  /health              Liveness check
GET  /outcomes            Recent outcomes + summary
POST /outcomes            Record a new outcome
GET  /calibration         Calibration per type
GET  /accuracy            Precision / Recall / F1
GET  /accuracy/trend      F1 trend over 4 periods
GET  /feedback/latest     Latest monthly snapshot
GET  /feedback/history    Last 12 snapshots
POST /feedback/run        Run feedback loop now
GET  /club-intelligence   Club Intelligence Score
GET  /club-profile        Stored club profile
POST /club-profile/build  Build and persist club profile
GET  /improvement-plan    Self-improvement recommendations
GET  /status              Full engine status summary
```

---

*Coach's Eye Learning Engine v1.0 · June 2026*
