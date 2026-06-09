# Self-Improvement Engine

**Module:** `learning-engine/self-improvement.js`

---

## Purpose

The Self-Improvement Engine reads the monthly feedback snapshots and generates an adjustment plan that makes Coach's Eye more accurate without any human configuration. It is the automated equivalent of a product manager reviewing analytics and deciding what to tune.

Five categories of automatic adjustment:

1. **Confidence adjustments** — raise or lower per-type confidence based on observed precision
2. **Urgency adjustments** — increase sensitivity for types with high miss rates (low recall)
3. **Timing adjustments** — fire recommendations earlier if coach acceptance is low (suggesting late delivery)
4. **Ranking weight adjustments** — increase urgency weight when coach is acting on most recommendations
5. **Wording suggestions** — flag low-F1 types for recommendation copy review

---

## Adjustment Rules

### Confidence Adjustments

| Condition | Adjustment |
|-----------|------------|
| Precision ≥ 80% (type well-calibrated) | +5% confidence |
| Precision < 50% (too many false alarms) | −5% confidence |
| Recall < 50% (missing real events) | No confidence change — see urgency |

### Urgency Adjustments

| Condition | Adjustment |
|-----------|------------|
| Recall < 50% (missing real events) | +1 to urgency threshold (lower the trigger) |

### Timing Adjustments

| Condition | Adjustment |
|-----------|------------|
| Acceptance rate < 40% (coach consistently ignoring) | Add 1 day lead time to all recommendations |

### Ranking Weight Adjustments

Default weights: urgency(40%) · impact(25%) · confidence(20%) · timeSaved(15%)

| Condition | Adjustment |
|-----------|------------|
| Acceptance rate ≥ 70% (recent months) | Boost urgency to 42%, reduce timeSaved to 13% |

### Wording Suggestions

Types with F1 < 55% and ≥5 outcomes are flagged for recommendation copy review. The platform cannot rewrite its own copy automatically, but surfaces the flag to the developer/product owner.

---

## Maturity-Gated Advice

The improvement plan unlocks different advice at each CIS stage:

| CIS Stage | Advice unlocked |
|-----------|-----------------|
| COLD_START (0–20) | Accept more recommendations. Record outcomes for rejections. |
| EARLY_LEARNING (21–40) | Don't expand automation yet. Prefer ACCEPTED over SNOOZED. |
| CALIBRATING (41–60) | Consider enabling weather risk automation. Expand COMMUNICATION_GAP to full AUTO. |
| CALIBRATED (61–80) | Enable proactive pre-season planning. Lower APPROVE threshold to 45%. |
| EXPERT (81–95) | Enable 14-day predictions. Consider reducing human review requirements for INJURY type. |

---

## Live Run (June 2026)

```
CIS: 69/100 (Calibrated)  Overall F1: 95%

Confidence adjustments:
  ATTENDANCE_DECLINE    +5%  (Precision 100%)
  VOLUNTEER_GAP         +5%  (Precision 100%)
  APPROVAL_BACKLOG      +5%  (Precision 100%)
  MEMBERSHIP_EXPIRY     +5%  (Precision 100%)
  COMMUNICATION_GAP     +5%  (Precision 100%)
  PLAYER_OVERLOAD       +5%  (Precision 100%)
  WEATHER_RISK          −5%  (Precision 50% — false alarms)

Urgency adjustments:
  None — recall above 50% for all types

Ranking override:
  Urgency 42% · Impact 25% · Confidence 20% · TimeSaved 13%
  (Acceptance rate 85% → boost urgency weight)

Maturity advice (Calibrated stage):
  → Good calibration — consider enabling weather risk automation
  → Communication gap type is well-tuned — safe to move to full AUTO
```

---

## What the Self-Improvement Engine Does NOT Do

- It does not rewrite recommendation copy (copy is a product decision)
- It does not change classification thresholds (AUTO/APPROVE/HUMAN) automatically
- It does not delete historical outcome data
- It does not change the confidence of an in-flight recommendation already shown to the coach

All adjustments take effect on the *next* recommendation generation cycle.

---

## How Auto-Apply Works in Practice

When `assistant-core.js` generates a new recommendation:

1. It calls `getAutoApplyDeltas()` from the Learning Engine
2. If the type has a confidence delta (+5% or −5%), the confidence is adjusted before ranking
3. If urgency weights were overridden, the ranking formula uses the new weights
4. If a timing delta exists, the lead-time window for the recommendation is shifted

This happens silently and does not change the recommendation text shown to the coach — only its ranking position and confidence band.

---

*Coach's Eye Self-Improvement Engine v1.0 · June 2026*
