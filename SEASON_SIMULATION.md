# Season Simulation

**Module:** `season-intelligence/season-simulation.js`  
**Version:** 1.0

---

## What It Does

The Season Simulation compares three trajectories across four metrics over an 8-week window:

| Trajectory | Meaning                                           |
|------------|---------------------------------------------------|
| **Current**  | What happens if nothing changes                 |
| **Expected** | What the platform targets for this phase        |
| **Ideal**    | A perfectly-run season benchmark                |

When the gap between current and expected exceeds the threshold, the simulation generates specific intervention recommendations.

---

## The Four Metrics

| Metric              | Description                                      | Ideal Peak |
|---------------------|--------------------------------------------------|------------|
| `availability`      | % of registered players available               | 92%        |
| `attendance`        | Average training session attendance rate        | 88%        |
| `injuryBurden`      | Injury health score (inverse of injury rate)    | 90%        |
| `workloadBalance`   | Players in optimal load zone                    | 88%        |

---

## Expected Benchmarks by Phase

| Phase            | Availability | Attendance | Injury | Workload |
|------------------|-------------|------------|--------|----------|
| PRE_SEASON       | 80%         | 85%        | 88%    | 82%      |
| EARLY_SEASON     | 82%         | 82%        | 82%    | 80%      |
| MID_SEASON       | 80%         | 80%        | 78%    | 78%      |
| REP_WINDOWS      | 72%         | 75%        | 82%    | 80%      |
| PLAYOFF_PREP     | 86%         | 88%        | 84%    | 82%      |
| FINALS           | 90%         | 93%        | 86%    | 85%      |
| OFF_SEASON       | 60%         | 45%        | 92%    | 88%      |

---

## Gap Severity Thresholds

| Gap        | Severity | Action                               |
|------------|----------|--------------------------------------|
| > 15 pts   | HIGH     | Immediate intervention recommended   |
| 8–15 pts   | MEDIUM   | Monitor + one targeted action        |
| 3–8 pts    | LOW      | Note in briefing                     |
| < 3 pts    | NONE     | Within acceptable range              |

---

## Simulation Status Labels

| Status           | Meaning                                              |
|------------------|------------------------------------------------------|
| `ON_TRACK`       | All metrics within expected range (max gap ≤ 4)     |
| `SLIGHTLY_BEHIND`| 1–2 metrics in MEDIUM gap territory                 |
| `BEHIND_PLAN`    | Any metric in HIGH severity gap territory           |

---

## 8-Week Series

Each metric generates a weekly projection series for current, expected, and ideal:

```js
series: {
  weeks:    ['+0w', '+1w', '+2w', ..., '+8w'],
  current:  [68, 68, 69, 70, 70, 71, 71, 72, 72],  // slow recovery without intervention
  expected: [80, 80, 81, 81, 82, 82, 83, 83, 84],  // phase target
  ideal:    [85, 85, 85, 86, 86, 86, 87, 87, 88],  // perfect season
}
```

This series feeds chart renderers in the Mobile Command Layer and Command Centre.

---

## Intervention Recommendations

When a gap is HIGH or MEDIUM, the simulation generates specific interventions:

| Metric          | HIGH gap interventions                                      |
|-----------------|-------------------------------------------------------------|
| availability    | Physio review all injuries · Return-to-train programme      |
| attendance      | Parent engagement message · Review session time             |
| injuryBurden    | Modify drill intensity · Physio session for at-risk players |
| workloadBalance | Mandatory rest day · Session load review                    |

---

## Example Output (from live CLI run — Off-Season phase)

```
SEASON SIMULATION — Off-Season
  Status: SLIGHTLY BEHIND  (gap: 9 pts)
  Club is slightly behind plan. Monitor trends and action recommendations.

  Metric              Current  Expected  Ideal   Gap Severity
  Player availability      88        60     92   -28 NONE     ← above target (great)
  Training attendance      68        45     88   -23 NONE     ← above off-season target
  Injury health score      58        92     90    34 HIGH     ← needs attention
  Workload balance        100        88     88   -12 NONE     ← perfectly balanced

  Recommended interventions:
    [HIGH]   Modify high-contact drill intensity
    [HIGH]   Physio session for all injury-risk players
    [MEDIUM] Injury pattern audit with coaching staff
```

Note: Negative gaps (current > expected) are positive signals — the team is performing above phase targets on those metrics.

---

## API Output

`GET /simulation` returns:
```js
{
  generatedAt:   ISO string,
  phase:         'OFF_SEASON',
  phaseLabel:    'Off-Season',
  weeks:         8,
  overallStatus: 'SLIGHTLY_BEHIND',
  overallGap:    9,
  summary:       'Club is slightly behind plan...',
  metrics:       [...],
  current:       { availability: 88, attendance: 68, injuryBurden: 58, workloadBalance: 100 },
  expected:      { availability: 60, attendance: 45, injuryBurden: 92, workloadBalance: 88 },
  ideal:         { availability: 92, attendance: 88, injuryBurden: 90, workloadBalance: 88 },
  interventions: [...],
  highGapCount:  1,
  onTrackCount:  3,
}
```
