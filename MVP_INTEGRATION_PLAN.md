# MVP Integration Plan

**Phase: V1 — Connect the AI Foundation to the Production App**  
**Target:** Working, demo-able, single-club application with real (not mock) AI outputs  
**Date:** June 2026

---

## Guiding Principle

Every integration in this plan is a wire, not a build. The engines exist. The APIs exist. The UI components exist. This plan draws lines between them.

No new engines. No new architecture. No new backend systems.

---

## Integration Sprints

### Sprint 1 — API Gateway (2 days)
*Goal: All engine outputs accessible through one port (3001)*

| Task | File to edit | Change |
|------|-------------|--------|
| Add `/api/season/phase` | `app/api-server.js` | Import `season-intelligence/index.js`, call `detectCurrentPhase()` + `getPrescription()` |
| Add `/api/season/health` | `app/api-server.js` | Call `buildClubHealthScore()` with real team data |
| Add `/api/season/predictions` | `app/api-server.js` | Call `generateAllPredictions()` |
| Add `/api/season/simulation` | `app/api-server.js` | Call `runSimulation()` |
| Add `/api/learning/status` | `app/api-server.js` | Call `computeClubIntelligenceScore()` |
| Add `/api/learning/feedback` | `app/api-server.js` | Call `generateFeedbackReport()` |
| Add `/api/comms/preview` | `app/api-server.js` | Call `previewCommunication()` |
| Add `/api/comms/send` | `app/api-server.js` | Call `sendCommunication()` (simulated) |
| Add `/api/comms/templates` | `app/api-server.js` | Call `listTemplates()` |
| Add `/api/timeline` | `app/api-server.js` | Proxy to `autonomous-assistant/ai-timeline.js` |
| Add `/api/briefing/morning` | `app/api-server.js` | Call `runMorningBriefing()` (live) |

**Smallest implementation of Sprint 1:**
```js
// In app/api-server.js — add these 3 lines per endpoint
import * as season from '../season-intelligence/index.js';

app.get('/api/season/phase', async (req, res) => {
  const phase = season.detectCurrentPhase();
  const presc = season.getPrescription(phase.id);
  res.json({ phase, prescription: presc });
});
```

---

### Sprint 2 — Live Observations (3 days)
*Goal: Autonomous Assistant reads real data, not MOCK_OBSERVATIONS*

The single most impactful change in the entire integration plan.

**File:** `autonomous-assistant/observation-engine.js`  
**Change:** Replace `MOCK_OBSERVATIONS` fallback with real engine calls

```js
// CURRENT (mock):
export async function observe() {
  return MOCK_OBSERVATIONS;
}

// TARGET (live):
export async function observe() {
  const [mem, fixtures, season] = await Promise.all([
    _memory().then(m => m?.getStats()),
    _fixtures().then(f => f?.listUpcomingFixtures(7)),
    _season().then(s => s?.buildClubHealthScore()),
  ]);
  
  return {
    observedAt: new Date().toISOString(),
    confidence: mem ? 85 : 45,
    source: mem ? 'live' : 'partial',
    attendance:   buildAttendanceFromMemory(mem),
    injuries:     buildInjuriesFromMemory(mem),
    fixtures:     buildFixturesFromEngine(fixtures),
    volunteers:   buildVolunteersFromMemory(mem),
    memberships:  buildMembershipsFromMemory(mem),
    workload:     buildWorkloadFromMemory(mem),
    // ... etc
  };
}
```

| Sub-task | File | Change |
|----------|------|--------|
| Wire attendance | `observation-engine.js` | Read from `memory-engine.searchMemory({type:'attendance'})` |
| Wire injuries | `observation-engine.js` | Read from `memory-engine.searchMemory({type:'player',injured:true})` |
| Wire fixtures | `observation-engine.js` | Read from `fixture-engine.listUpcomingFixtures(7)` |
| Wire volunteers | `observation-engine.js` | Read from `memory-engine.searchMemory({type:'volunteer',status:'unfilled'})` |
| Wire memberships | `observation-engine.js` | Read from `memory-engine.searchMemory({type:'membership',expiring:true})` |
| Wire workload | `observation-engine.js` | Read from `memory-engine.searchMemory({type:'session'})` and calculate |
| Phase context | `observation-engine.js` | Read from `season-intelligence.getPrescription()` for targets |

**Result:** Autonomous Assistant recommendations are based on the club's actual current state.

---

### Sprint 3 — Recommendation Decision Feedback (1 day)
*Goal: Every coach decision is forwarded to Learning Engine*

**File:** `app/api-server.js`  
**Change:** Three new endpoints

```js
// Smallest implementation — 30 lines total
import * as learning from '../learning-engine/index.js';
import * as assistant from '../autonomous-assistant/index.js';

app.post('/api/recommendations/:id/accept', async (req, res) => {
  const rec = await assistant.resolve(req.params.id);
  learning.recordOutcome({
    recommendationId:   req.params.id,
    recommendationType: rec.type,
    coachDecision:      'ACCEPTED',
    confidenceAtTime:   rec.confidence,
    actionTaken:        req.body.actionTaken ?? null,
    predictionCorrect:  req.body.predictionCorrect ?? null,
  });
  res.json({ ok: true });
});

app.post('/api/recommendations/:id/reject', async (req, res) => {
  await assistant.dismiss(req.params.id);
  learning.recordOutcome({ /* ... */ coachDecision: 'REJECTED' });
  res.json({ ok: true });
});

app.post('/api/recommendations/:id/snooze', async (req, res) => {
  await assistant.snooze(req.params.id, req.body.hours ?? 24);
  learning.recordOutcome({ /* ... */ coachDecision: 'SNOOZED' });
  res.json({ ok: true });
});
```

**This closes the core feedback loop. After this sprint, the platform starts getting smarter.**

---

### Sprint 4 — Orchestrator Adapters (2 days)
*Goal: NL commands route to all engines*

Create 6 new adapter files in `orchestrator/adapters/`:

| Adapter | Routes these NL commands |
|---------|--------------------------|
| `season-intelligence.js` | "what phase are we in", "season health", "show predictions", "training targets" |
| `autonomous-assistant.js` | "show recommendations", "run morning check", "what needs attention", "automate this" |
| `fixture-engine.js` | "prepare Thursday's fixture", "show standings", "generate match pack", "mark task complete" |
| `learning-engine.js` | "how accurate are we", "club intelligence score", "show feedback" |
| `communications-engine.js` | "send the newsletter", "message U16 parents", "schedule training reminder" |
| `club-digital-twin.js` | "show club health", "what are the risks", "morning briefing" |

**Smallest implementation per adapter:**
```js
// orchestrator/adapters/season-intelligence.js
import * as season from '../../season-intelligence/index.js';

export default {
  name: 'season-intelligence',
  description: 'Season phases, prescriptions, team health scores, predictions',
  intents: ['season_phase', 'health_check', 'predictions', 'training_targets'],
  
  async execute(request) {
    const phase = season.detectCurrentPhase();
    const presc = season.getPrescription(phase.id);
    return { phase, prescription: presc, summary: `Currently in ${phase.label}. Target attendance: ${presc.attendanceExpectation.target}%.` };
  }
};
```

---

### Sprint 5 — UI Wiring (3 days)
*Goal: New API endpoints surface in Command Centre and Mobile UI*

| Component | File | Change |
|-----------|------|--------|
| Phase chip in top nav | `app/command-centre/src/components/layout/TopBar.jsx` | `useEffect → GET /api/season/phase` |
| Season card on Dashboard | `app/command-centre/src/pages/DashboardPage.jsx` | Phase + prescription card |
| Recommendation buttons | `app/command-centre/src/components/AIRecommendations.jsx` | Accept/Snooze/Dismiss buttons → POST endpoints |
| Health score upgrade | `app/command-centre/src/components/ClubHealthCard.jsx` | Use `/api/season/health` not `/api/club/health` |
| Timeline in Today screen | `app/mobile/src/pages/TodayPage.jsx` | `GET /api/timeline` |
| Phase chip in mobile Home | `app/mobile/src/pages/HomePage.jsx` | `GET /api/season/phase` |
| Communications send button | `app/command-centre/src/pages/CommunicationsPage.jsx` | POST to `/api/comms/send` |

---

### Sprint 6 — Digital Twin Phase Integration (1 day)
*Goal: Club Digital Twin uses season phase context for health scoring*

**File:** `club-digital-twin/club-model.js`  
**Change:** Import season-intelligence and enrich club model

```js
// In buildClubModel()
const phaseContext = await _season().then(s => s?.detectCurrentPhase());
const prescription  = phaseContext ? await _season().then(s => s?.getPrescription(phaseContext.id)) : null;

// Inject into health scoring
const healthScore = await buildHealthReport({ ...data, phaseContext, prescription });
```

**Result:** Health scores are now compared against the correct seasonal target, not a generic baseline. 68% attendance in off-season (correct) no longer triggers the same alert as 68% in playoffs (critical).

---

### Sprint 7 — Background Scheduler (1 day)
*Goal: Scheduled actions fire automatically*

**New file:** `app/scheduler.js`

```js
import cron from 'node-cron';
import * as assistant from '../autonomous-assistant/index.js';
import * as workflows from '../workflow-engine/index.js';
import * as learning from '../learning-engine/index.js';

// Morning briefing — 07:00 every day
cron.schedule('0 7 * * *', () => assistant.runMorningBriefing());

// Due workflow queue — every 15 minutes
cron.schedule('*/15 * * * *', () => workflows.processDue());

// Monthly feedback loop — 1st of each month
cron.schedule('0 8 1 * *', () => learning.runMonthlyFeedback());

// Daily calibration update
cron.schedule('0 1 * * *', () => learning.calibrateAllTypes());
```

Add `node-cron` to dependencies. Start scheduler alongside API server.

---

## Integration Test Checklist

After all sprints complete, verify these paths end-to-end:

### Core Paths
- [ ] `GET /api/season/phase` returns current phase (not mock)
- [ ] `GET /api/dashboard/briefing` returns briefing using live observations
- [ ] `GET /api/recommendations` returns recommendations based on live data
- [ ] `POST /api/recommendations/:id/accept` calls `learning.recordOutcome()`
- [ ] `GET /api/club/health` returns phase-calibrated score
- [ ] `GET /api/timeline` returns 14-day AI timeline
- [ ] `POST /api/comms/send` calls `communications-engine.sendCommunication()`

### NL Command Paths (via `/api/nl`)
- [ ] "What phase are we in?" routes to season-intelligence
- [ ] "Show me today's recommendations" routes to autonomous-assistant
- [ ] "Prepare Saturday's fixture" routes to fixture-engine
- [ ] "Send the newsletter" routes to communications-engine
- [ ] "How accurate are predictions?" routes to learning-engine

### Feedback Loop Path
- [ ] Mock outcome data seeded in Learning Engine
- [ ] `getCalibrationSummary()` returns calibrated confidence per type
- [ ] `applyCalibration()` adjusts a recommendation's confidence
- [ ] Monthly feedback snapshot created via `/feedback/run`

---

## Sprint Summary

| Sprint | Work | Days | Outcome |
|--------|------|------|---------|
| 1 | API Gateway | 2 | All engines accessible through port 3001 |
| 2 | Live Observations | 3 | Autonomous Assistant uses real data |
| 3 | Feedback Loop | 1 | Every decision improves the platform |
| 4 | Orchestrator Adapters | 2 | NL routes to all engines |
| 5 | UI Wiring | 3 | Phase, health, recommendations in UI |
| 6 | Digital Twin Phase | 1 | Health scores phase-calibrated |
| 7 | Scheduler | 1 | Background tasks fire automatically |
| **Total** | | **13 days** | **V1 — Working, integrated platform** |

---

## What V1 Does NOT Need

| Not Needed | Why |
|-----------|-----|
| Database migration | JSONL is fine for single-club V1 beta |
| User accounts / auth | V1 is password-protected single-club deployment |
| Real email delivery | Simulated delivery is sufficient for V1 UX validation |
| Stripe billing | Not charging V1 beta clubs |
| Push notifications (multi-device) | Single-coach web push already exists |
| Player portal | Out of scope for V1 |
| Mobile app store submission | Mobile is PWA — runs in browser |

---

*This plan is 13 working days of integration, not new development.*  
*Every line of code described above connects existing functions.*  
*See ENTERPRISE_FEATURES.md for what comes after V2.*
