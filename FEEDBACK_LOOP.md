# Feedback Loop

**Module:** `learning-engine/feedback-loop.js`

---

## Purpose

The Feedback Loop converts a season's worth of recommendation outcomes into six actionable metrics that tell the Director of Rugby (and the platform itself) whether Coach's Eye is improving.

---

## Six Monthly Metrics

### 1. Prediction Accuracy (F1 Score)

F1 is the harmonic mean of precision and recall. It penalises both false alarms and missed events equally.

```
Precision  = TP / (TP + FP)   — when we fire, how often are we right?
Recall     = TP / (TP + FN)   — of all real events, how many did we catch?
F1         = 2 × Precision × Recall / (Precision + Recall)
```

Grading: A (≥85%), B (≥75%), C (≥65%), D (≥50%), F (<50%).

---

### 2. False Positive Rate

How often did the platform fire a recommendation and the predicted event didn't happen?

```
FPR = FP / (TP + FP + FN) × 100
```

A high FPR erodes coach trust. The platform will automatically reduce confidence for types with FPR > 25%.

---

### 3. False Negative Rate

How often did an event happen that the platform failed to predict?

These are the most damaging misses — a volunteer no-show, an injury cluster, a membership crisis — that the platform didn't flag. Detected retrospectively by recording `FALSE_NEGATIVE` outcomes.

---

### 4. Coach Acceptance Rate

```
Acceptance rate = (ACCEPTED + AUTO) / total × 100
```

A proxy for coach trust. If acceptance is falling, recommendations are arriving too late, are poorly worded, or the confidence threshold is miscalibrated.

Typical trajectory:
- Month 1: 40–50% (coach is cautious)
- Month 3: 60–70% (patterns becoming familiar)
- Month 6: 75–85% (trust established)

---

### 5. Automation Success Rate

```
Auto success = AUTO outcomes where worked=true / total AUTO × 100
```

Measures whether the autonomous platform actions (auto-newsletters, auto-reminders, auto-renewals) are actually working. Target: ≥80%. Below 70% triggers a review of automation thresholds.

---

### 6. Time Saved

Estimated admin hours eliminated per month:

| Recommendation Type | Minutes saved per successful intervention |
|--------------------|------------------------------------------|
| INJURY_POSITION_CRISIS | 60 (schedule changes, squad comms) |
| VOLUNTEER_GAP | 45 (recruitment, logistics) |
| ATTENDANCE_DECLINE | 30 (parent outreach, session planning) |
| PLAYER_OVERLOAD | 40 (load management, injury prevention) |
| COMMUNICATION_GAP | 25 (newsletter drafting) |
| APPROVAL_BACKLOG | 20 (committee co-ordination) |
| WEATHER_RISK | 20 (venue logistics) |
| MEMBERSHIP_EXPIRY | 15 (renewal reminders) |

---

## Monthly Snapshot (June 2026 — mock data)

```
Period:                 2026-06
Total recommendations:  34
Acceptance rate:        85%
Rejection rate:         9%
Automation success:     100%
False positive rate:    9%
Overall F1:             95%  (A)
Time saved:             14.5 hours
Calibration maturity:   CALIBRATING
```

---

## Feedback Loop Flow

```
Every month:
  1. Load all outcomes from outcomes.jsonl
  2. Compute 6 metrics above
  3. Save snapshot to feedback.jsonl
  4. Self-improvement engine reads snapshots
  5. Adjustments applied to next recommendation cycle
```

The loop is triggered:
- Manually: `POST /feedback/run`
- Via CLI: `npm run learning:feedback`
- In production: monthly cron at start of month

---

## Trend Detection

Once 2+ monthly snapshots exist, the trend engine detects:

| Trend | Condition |
|-------|-----------|
| strongly_improving | F1 gain > 5% month-over-month |
| improving | F1 gain > 0% |
| stable | F1 ±2% |
| degrading | F1 loss |

A degrading trend triggers an immediate self-improvement audit.

---

*Coach's Eye Feedback Loop v1.0 · June 2026*
