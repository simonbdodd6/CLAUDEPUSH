# Player Development Intelligence Engine — Architecture Report

*Generated: 2026-06-09*

---

## What Is This?

The **Player Development Intelligence Engine** analyses historical Memory Engine data and calculates structured development metrics for every player. It does NOT store data — that is the Memory Engine's job. It detects progress and explains WHY every recommendation was made.

---

## Architecture

```
Memory Engine
     │
     ▼
qa/player-development/
├── index.js                  ← Public API (analysePlayer, analyseTeam, comparePlayers, generateDevelopmentReport, predictNextPhase)
├── progress-engine.js        ← Orchestrator — runs all modules in order
│
├── attendance-analysis.js    ← Attendance trends + shared helpers (gradeFromScore, confidenceFromDataPoints, trendDirection)
├── injury-risk.js            ← Position-specific risk calculation (0-100 risk score)
├── strength-progress.js      ← Strength development trends from programme history
├── speed-progress.js         ← Speed / conditioning trends
├── readiness-score.js        ← Training readiness + programme compliance + coach feedback
├── development-summary.js    ← Composite development score + promotion readiness
│
├── recommendation-engine.js  ← Rules-based WHY-explained recommendations
├── projection-engine.js      ← Trajectory prediction (4/8/12 week projections)
└── player-report.js          ← Markdown report generator
```

---

## Modules

### 1. attendance-analysis.js
Analyses attendance rate and trend. Contains shared utility functions used by all other modules:
- `gradeFromScore(score)` — A+ to F grade
- `confidenceFromDataPoints(n, agedays)` — high/medium/low/none
- `trendDirection(values)` — improving/stable/declining/insufficient-data

### 2. injury-risk.js
Position-specific injury risk scoring (0-100). Higher score = more risk.
- Props carry highest base risk (18-20 points) due to scrum demands
- Tracks: active injuries, recent clearances, recurrence patterns, youth age factors

### 3. strength-progress.js / speed-progress.js
Analyses programme history for strength/conditioning goals. Scores improvement by:
- Phase progression (preseason → early-season → mid-season is positive)
- Programme completion rate
- Coach feedback sentiment

### 4. readiness-score.js
Composite readiness (is the player ready for the next training challenge?):
- Injury status: 35%
- Attendance: 30%
- Programme compliance: 20%
- Experience level: 15%

Also provides: `analyseProgrammeCompliance()`, `analyseCoachFeedback()`

### 5. development-summary.js
Composite development score weighted across all dimensions:
- Attendance: 25%
- Programme compliance: 20%
- Injury-free (inverted risk): 20%
- Strength progress: 15%
- Speed progress: 10%
- Coach feedback: 10%

Also provides: `assessPromotionReadiness()` — checks age boundaries and promotion criteria.

### 6. recommendation-engine.js
Rules-based engine. Every recommendation includes:
- `type` — category (rehab-plan, programme, prehab, attendance-intervention, etc.)
- `priority` — critical / high / medium / low
- `action` — what to do
- `why` — the specific evidence-based reason
- `suggestedInput` — pre-filled coaching engine input (where applicable)
- `tags` — for filtering

### 7. projection-engine.js
Predicts development trajectory:
- Weekly delta estimated from trend + confidence
- Projections at 4, 8, 12 weeks
- Time to next grade
- Blockers and accelerators identified

### 8. player-report.js
Generates Markdown or JSON reports. Markdown includes:
- Score bars with visual representation
- Dimension table
- Recommendation list with priority icons
- Projection section with blockers/accelerators

---

## Data Flow

```
analysePlayer(playerInput)
  → resolvePlayerData()      ← Memory Engine lookup
  → resolvePlayerProgrammes() ← Memory Engine lookup
  → runPlayerAnalysis()
      → analyseAttendance()
      → analyseInjuryRisk()
      → analyseStrengthProgress()
      → analyseSpeedProgress()
      → analyseProgrammeCompliance()
      → analyseCoachFeedback()
      → analyseReadiness()
      → buildDevelopmentSummary()
      → assessPromotionReadiness()
      → generateRecommendations()
      → predictNextPhase()
  → return { analyses, recommendations, projection, promotionReadiness }
```

---

## Standard Analysis Result Shape

Every module returns the same shape:

```json
{
  "score":      0-100,
  "grade":      "A+|A|B+|B|C+|C|D|F",
  "trend":      "improving|stable|declining|insufficient-data",
  "confidence": "high|medium|low|none",
  "reasons":    ["Why this score was calculated"],
  "flags":      [{ "level": "critical|warning|info", "message": "..." }],
  "rawData":    {}
}
```

---

## Live Test Results (Ciarán Murphy, U18 Prop, Kildare Valley RFC)

### Development Score
- **Score:** 67/100 — Grade: **C**
- **Trend:** stable | **Confidence:** low
- **Data completeness:** 83%

### Dimension Breakdown
| Dimension | Score | Grade | Confidence |
|-----------|-------|-------|------------|
| Attendance | 67/100 | C | low |
| Injury Risk | 23/100 | Low | low |
| Strength Progress | 75/100 | B | low |
| Speed Progress | n/a/100 | n/a | none |
| Programme Compliance | 50/100 | F | low |
| Coach Feedback | 72/100 | C+ | low |
| Readiness | 73/100 | C+ | low |

### Top Recommendations
1. **[MEDIUM]** Set an attendance target with the player (aim for 80%+)
   > **Why:** Attendance is at 67% — below the recommended 75–80% minimum for consistent physical development. A simple goal-setting conversation can significantly improve attendance when player...

2. **[MEDIUM]** Focus development attention on programmeCompliance (current: 50/100)
   > **Why:** The weakest dimension in the player's profile is programmeCompliance with a score of 50/100. Targeted attention here will have the highest leverage on the overall development score...

### Trajectory Projection
> Stable trajectory — consistent performance at 67/100. Small improvements in speed-progress could drive meaningful progress

| Timeframe | Projected Score | Grade |
|-----------|----------------|-------|
| +4 weeks | 67/100 | C |
| +8 weeks | 67/100 | C |
| +12 weeks | 67/100 | C |

### Blockers
- 🔴 Low attendance (67%) — Identify and resolve attendance barriers — target 75%+ in next 4 weeks

### Accelerators
- ✓ Increase attendance to 80%+ — Each additional session attended compounds training adaptations — attendance is the most controllabl

### Player Comparison
| Player | Position | Dev Score | Attendance | Trajectory |
|--------|----------|-----------|------------|------------|
| Ciarán Murphy | Prop | 67/100 (C) | 67% | Stable trajectory — consistent performance at 67/100. Small  |
| Fixture Teammate | Hooker | 60/100 (D) | 90% | Stable trajectory — consistent performance at 60/100. Small  |


---

## Future Integrations

### 1. Player Dashboard (Coach's Eye App)
The engine JSON output maps directly to player profile UI components:
- `developmentSummary.score` → headline score widget
- `analyses.injuryRisk` → injury risk indicator
- `recommendations` → coach action list
- `projection.projections` → trend chart data points

### 2. Coach Notifications
`recommendations` with `priority: 'critical'` can trigger push notifications to coaches (via existing notification infrastructure in api/).

### 3. Team Intelligence Dashboard
`analyseTeam()` provides per-team averages, top/bottom performers, and critical flags. Ready for a Mission Control panel.

### 4. Automated Weekly Reports
The engine can be called from the nightly cron job (api/cron.js) to generate weekly development summaries for each player and push to coaches.

### 5. Vector Search (Future Memory Enhancement)
The memory engine architecture is designed to support vector embeddings. When implemented, `getRelevantContext()` will use semantic search to find similar players and past programmes — enabling the engine to benchmark a player against comparable athletes.

### 6. Provincial / National Benchmarking
Development scores can be normalised against provincial benchmarks (IRFU age-group standards) once integrated with external data sources.

---

## How This Powers Player Dashboards

1. Nightly cron runs `analysePlayer()` for every active player
2. Results stored in memory-engine's AI generations store
3. App API exposes `GET /api/player/:id/development` returning cached JSON
4. Dashboard components consume: score, grade, trend, topRecommendation
5. Coach action list driven by `recommendations` array (sorted by priority)
6. Charts driven by `projection.projections` (4/8/12 week data points)

---

*Report generated by Coach's Eye Player Development Intelligence Engine*
