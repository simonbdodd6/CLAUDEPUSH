# Club Intelligence Model

**Module:** `learning-engine/club-intelligence-model.js`

---

## The Core Idea

Every rugby club has its own rhythms. Some clubs lose volunteers every October half-term. Others get an attendance dip every February. Some age groups always have front row injury clusters in pre-season. These patterns are invisible in generic models but become visible after one full season of outcome tracking.

The Club Intelligence Model tracks how well Coach's Eye has learned the specific, repeating patterns of a single club — and converts that learning into a single score.

---

## Coaching Intelligence Score (CIS)

A number from 0 to 100:

| Score | Stage | Description |
|-------|-------|-------------|
| 0–20 | Cold Start | Generic models only. No club-specific knowledge. |
| 21–40 | Emerging | First patterns detected. High false positive rate expected. |
| 41–60 | Calibrating | Club-specific adjustments active. Accuracy improving monthly. |
| 61–80 | Calibrated | Reliable predictions for this club. Coach trust is high. |
| 81–95 | Expert | Months-ahead predictions. Highly tuned to club rhythms. |

---

## Scoring Formula

```
CIS = sampleDepth(30%) + predictionF1(30%) + coachAcceptance(20%) + calibrationMaturity(20%)
```

### Sample Depth (30%)
```
score = min(100, totalOutcomes / 100 × 100)
```
Scales linearly. 100 outcomes = full depth score. At 34 outcomes: 34 points.

### Prediction F1 (30%)
The overall F1 score from `prediction-accuracy.js` (0–100). At 95% F1: 95 points.

### Coach Acceptance Rate (20%)
Average acceptance rate across the last 6 monthly snapshots. Reflects trust. At 85%: 85 points.

### Calibration Maturity (20%)
```
COLD_START   → 10
EARLY_LEARNING → 35
CALIBRATING  → 65
MATURE       → 90
```
Reflects EMA convergence. With 34 outcomes: CALIBRATING → 65 points.

---

## Live Score (June 2026)

```
Club: Ballymena RFC

CIS Score:   69/100  (Calibrated)

Components:
  Sample depth:          34/100  (weight 30%)
  Prediction accuracy:   95/100  (weight 30%)
  Coach acceptance:      85/100  (weight 20%)
  Calibration maturity:  65/100  (weight 20%)

Strengths:
  ✓ 95% overall F1 — strong prediction accuracy
  ✓ ATTENDANCE_DECLINE is highly accurate (100% F1)
  ✓ High coach acceptance rate (85%)

Improvement areas:
  → More outcome data needed (34/20 minimum — already past threshold)
  → Weather risk type needs more samples before confidence boost

Projected CIS at end of one full season: 88/100
```

---

## How the Score Grows

The dominant bottleneck at the start is sample depth. It takes roughly:

| Period | Estimated outcomes | CIS projection |
|--------|-------------------|----------------|
| Month 1 (cold start) | 5–10 | 25–35 |
| Month 3 | 20–30 | 45–55 |
| Month 6 | 40–60 | 60–70 |
| End of first season (10 months) | 80–120 | 75–85 |
| End of second season | 150–200 | 85–92 |

Once sample depth reaches ~100 (roughly one full season), the CIS is driven by accuracy and acceptance rate — both of which are expected to remain high once initial calibration is complete.

---

## Why Acceptance Rate Matters

A coach who rejects recommendations isn't just reducing the acceptance score — they're starving the calibration model of outcome data. The most valuable learning events are:

1. Coach accepts → outcome observed (cleanest signal)
2. Coach rejects → outcome observed (reveals whether recommendation was correct)
3. AUTO fires → outcome observed (shows whether automation was right)

A coach who snoozed everything would have a low acceptance score AND slow calibration — both penalised in the CIS.

---

## Club-Specific Patterns Detected After One Season

After a full season of data, the Learning Engine can identify:

- **Seasonal attendance dip months** specific to this club (not just generic "school holidays")
- **Position groups most at risk** for this club's training style and pitch conditions
- **Volunteer reliabilities** — which roles fill quickly vs. which need 2-week lead time
- **Membership renewal seasonality** — this club's members tend to lapse in February, not April
- **Committee response time** — how many days this committee needs for approvals, not the generic 2-day assumption

These club-specific calibrations are what make a 90/100 CIS a fundamentally different (and more valuable) product than the 20/100 cold start.

---

*Coach's Eye Club Intelligence Model v1.0 · June 2026*
