# Coach's Eye Season Intelligence Engine

**Version:** 1.0  
**Status:** Complete — tests passing  
**Port:** 3005 (API)

---

## What It Is

The Season Intelligence Engine gives Coach's Eye a memory that spans the entire season — not just today. It knows where the team is, where it should be, and what the gap means. Every recommendation, health score, and prediction is calibrated to the current phase of the season, not a generic baseline.

---

## Architecture

```
season-intelligence/
├── index.js               ← public API exports
├── season-phases.js       ← auto-detect phase, season week, calendar utilities
├── phase-prescriptions.js ← per-phase coaching targets and benchmarks
├── team-health-score.js   ← 8-dimension weighted team health (0–100)
├── club-health-score.js   ← aggregate club health from all teams + club-wide metrics
├── predictive-models.js   ← 5 forward-looking models with interventions
├── season-simulation.js   ← current vs expected vs ideal trajectory comparison
├── season-store.js        ← JSONL snapshot persistence (rolling 52 weeks)
├── season-api.js          ← Express server port 3005
├── season-cli.js          ← CLI test runner
└── data/
    └── season-snapshots.jsonl
```

---

## Season Phase Calendar (Irish Rugby Union / IRFU)

| Phase             | Months      | Priority                         |
|-------------------|-------------|----------------------------------|
| 🏗️ Pre-Season    | Jul–Aug     | Fitness · Cohesion · Assessment  |
| ⚡ Early Season   | Sep–Oct     | Results · Systems · Rhythm       |
| 🔥 Mid-Season     | Nov–Dec     | Performance · Depth · Load mgmt  |
| 🏉 Rep Windows    | January     | Depth · Development players      |
| 🎯 Playoff Prep   | Feb–Mar     | Precision · Fitness peak         |
| 🏆 Finals         | Apr–May     | Peak performance · Execution     |
| 🌱 Off-Season     | June        | Recovery · Reflection            |

---

## Per-Phase Prescriptions

Each phase has specific targets that the platform enforces:

```js
getPrescription('PLAYOFF_PREP') → {
  intensity:          { target: 90, max: 100, rampRate: '+3%/week tapering -5%' },
  workload:           { sessionsPerWeek: { min: 2, target: 3, max: 3 } },
  attendanceExpectation: { target: 90, minimum: 80 },
  injuryTolerance:    'ZERO',
  squadRotation:      { policy: 'MERIT_STRICT' },
  playerDevelopment:  ['Performance reviews', 'Mental skills sessions'],
  recoveryRecommendations: ['Taper 10 days before', 'Match-day nutrition locked'],
  alerts:             ['Playoff pressure = increased injury risk.'],
}
```

The autonomous assistant compares live observations against these targets and fires recommendations when gaps appear.

---

## API Reference

Base: `http://localhost:3005`

| Method | Path                     | Description                              |
|--------|--------------------------|------------------------------------------|
| GET    | `/status`                | Engine status, current phase, season week|
| GET    | `/phase`                 | Current phase + prescription summary     |
| GET    | `/phase/prescription`    | Full phase coaching targets              |
| GET    | `/phases`                | Full season calendar                     |
| GET    | `/health/team/:teamId`   | 8-dimension team health score            |
| GET    | `/health/club`           | Aggregate club health score              |
| GET    | `/predictions`           | All active predictions                   |
| GET    | `/simulation`            | Current vs expected vs ideal (8 weeks)   |
| GET    | `/season`                | Full season overview (all data combined) |
| POST   | `/snapshot`              | Save a weekly snapshot                   |
| GET    | `/trend`                 | Health trend from saved snapshots        |

---

## Running

```bash
npm run season:cli          # CLI full output
npm run season:api          # API server port 3005
npm run season:health       # Health scores only
npm run season:predict      # Predictions only
npm run season:simulate     # Simulation only
```

---

## Integration with Autonomous Assistant

The Season Intelligence Engine provides phase context that sharpens the Autonomous Assistant's recommendations:

- **Attendance 68%** in Mid-Season → MEDIUM urgency (acceptable range)
- **Attendance 68%** in Playoff Prep → CRITICAL (target is 88%, 20-point gap)

The phase prescription is the benchmark. Without it, every alert is context-free.

---

## Design Principles

1. **Phase-aware, not date-aware.** Logic branches on phase (PRE_SEASON, PLAYOFFS) not calendar dates — makes it portable across clubs and hemispheres.
2. **Graceful degradation.** All engine imports are lazy. Works on mock data at partial capacity.
3. **Trend over snapshot.** Snapshots are stored weekly; health trends over 52 weeks are more valuable than any single score.
4. **Conservative predictions.** Confidence scores are calibrated low (52–90%). Better to be right 65% of the time than confident and wrong.
