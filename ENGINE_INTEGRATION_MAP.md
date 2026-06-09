# Engine Integration Map

**Coach's Eye — Full Platform Integration Architecture**  
**Date:** June 2026

---

## Canonical Data Flow

```
REAL CLUB DATA (UI inputs, imports)
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                   MEMORY ENGINE                          │
│  Players · Teams · Sessions · Injuries · Attendance      │
│  Fixtures · Conversations · Programmes · Season          │
│  storage: memory-engine/data/entities/*.jsonl            │
└──────────────┬──────────────────────────────────────────┘
               │ reads
               ▼
┌─────────────────────────────────────────────────────────┐
│              KNOWLEDGE ENGINE                            │
│  ask() · search() · cite() · buildIndex()               │
│  Answers NL questions about the club's own data          │
│  ← memory-engine · fixture-engine · club-digital-twin   │
└──────────────┬──────────────────────────────────────────┘
               │ enriches
               ▼
┌─────────────────────────────────────────────────────────┐
│             CLUB DIGITAL TWIN                  port 3002 │
│  buildClubModel()  ← aggregates ALL engines             │
│  generateMorningBriefing() · generatePredictions()       │
│  buildRiskRegister() · computeTrends()                   │
│  ← memory-engine · knowledge-engine · fixture-engine    │
│  ← communications-engine · workflow-engine              │
│  ← season-intelligence [MISSING — needs wiring]         │
│  ← learning-engine     [MISSING — needs wiring]         │
│  ← autonomous-assistant [MISSING — needs wiring]        │
└──────────────┬──────────────────────────────────────────┘
               │ feeds
               ▼
┌─────────────────────────────────────────────────────────┐
│           COMMUNICATIONS ENGINE                          │
│  selectAudience() · generateContent() · render()        │
│  buildWeeklyNewsletter() · buildVolunteerRequest()      │
│  sendCommunication() · scheduleCommunication()          │
│  ← memory-engine (audience) · fixture-engine (match)   │
│  ← club-digital-twin (team context)                     │
│  NOTE: no HTTP API — Node module only                   │
└──────────────┬──────────────────────────────────────────┘
               │ outputs to
               ▼
┌─────────────────────────────────────────────────────────┐
│          AUTONOMOUS ASSISTANT               port 3004    │
│  observe() → detect() → rank() → classify()             │
│  runMorningBriefing() · runAutomations()                 │
│  generateTimeline() · generateCoachBriefing()           │
│  ← MOCK_OBSERVATIONS [must be replaced by live data]    │
│  ← fixture-engine · memory-engine [wired]               │
│  ← season-intelligence [MISSING — phase context]        │
│  → learning-engine [MISSING — must send each outcome]   │
└──────────────┬──────────────────────────────────────────┘
               │ feeds recommendations
               ▼
┌─────────────────────────────────────────────────────────┐
│          SEASON INTELLIGENCE               port 3005     │
│  detectCurrentPhase() · getPrescription()               │
│  buildClubHealthScore() · generateAllPredictions()      │
│  runSimulation() · getGapSummary()                      │
│  ← memory-engine (attendance, injuries, workload)       │
│  ← fixture-engine (schedule)                            │
│  → club-digital-twin [MISSING — must push phase context]│
│  → autonomous-assistant [MISSING — phase-aware targets] │
│  COMPLETELY ABSENT from Command Centre API (3001)       │
└──────────────┬──────────────────────────────────────────┘
               │ context
               ▼
┌─────────────────────────────────────────────────────────┐
│            LEARNING ENGINE                  port 3006    │
│  recordOutcome() · calibrateAllTypes()                   │
│  getPredictionAccuracy() · runMonthlyFeedback()          │
│  computeClubIntelligenceScore() · getAutoApplyDeltas()   │
│  ← autonomous-assistant [MISSING — outcomes not sent]   │
│  → autonomous-assistant [MISSING — deltas not consumed] │
│  COMPLETELY ABSENT from Command Centre API (3001)       │
└──────────────┬──────────────────────────────────────────┘
               │ calibrates
               ▼
┌─────────────────────────────────────────────────────────┐
│             COACH EXPERIENCE                             │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │   COMMAND CENTRE API                  port 3001   │  │
│  │   /api/health · /api/actions          [live]      │  │
│  │   /api/nl (→ orchestrator)            [live]      │  │
│  │   /api/club/health                    [live]      │  │
│  │   /api/recommendations                [partial]   │  │
│  │   /api/dashboard/briefing             [partial]   │  │
│  │   /api/season/*          [MISSING]               │  │
│  │   /api/learning/*        [MISSING]               │  │
│  │   /api/comms/*           [MISSING]               │  │
│  └────────────────┬──────────────────────────────────┘  │
│                   │ serves                               │
│      ┌────────────┴─────────────┐                       │
│      ▼                          ▼                       │
│  ┌──────────────┐     ┌──────────────────────┐          │
│  │ COMMAND      │     │  MOBILE UI           │          │
│  │ CENTRE UI    │     │  port 5174           │          │
│  │ port 5173    │     │  Home · Today        │          │
│  │ Dashboard    │     │  Match · Actions     │          │
│  │ Actions      │     │  Alerts              │          │
│  │ Players      │     │  AI Command Bar      │          │
│  │ Comms        │     │                      │          │
│  │ Reports      │     └──────────────────────┘          │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
```

---

## Detailed Engine-to-Engine Connections

### Memory Engine → Everything

```
memory-engine
├── rememberPlayer()           → coaching-engine (context)
│                              → player-development (history)
│                              → autonomous-assistant (workload)
├── rememberSession()          → season-intelligence (attendance)
│                              → learning-engine (training outcomes)
├── getRelevantContext()       → orchestrator (query enrichment)
│                              → knowledge-engine (answers)
├── recordAttendance()         → season-intelligence (health scoring)
│                              → autonomous-assistant (observe())
└── searchMemory()             → knowledge-engine (search results)
```

### Fixture Engine (3003) → Downstream

```
fixture-engine
├── listUpcomingFixtures()    → autonomous-assistant (timeline)
│                             → mobile MatchPage
│                             → command-centre Dashboard
├── generateTimeline()        → command-centre ActionsPage
│                             → mobile TodayPage
├── generateMatchPack()       → mobile MatchPage (pack tab)
│                             → command-centre Reports
├── completeFixture()         → club-digital-twin (updates model)
│                             → season-intelligence (standings)
│                             → memory-engine (records result)
└── getSeasonStandings()      → command-centre Reports
                              → mobile Home card
```

### Club Digital Twin (3002) → Downstream

```
club-digital-twin
├── generateMorningBriefing() → command-centre Dashboard
│                             → mobile Home
├── buildRiskRegister()       → autonomous-assistant [SHOULD]
│                             → command-centre Alerts section
├── generatePredictions()     → command-centre Reports
│                             → season-intelligence [SHOULD]
├── buildHealthReport()       → command-centre Dashboard card
│                             → mobile Home health card
└── buildClubModel()          → knowledge-engine (searchable)
                              → season-intelligence [SHOULD]
```

### Autonomous Assistant (3004) → Downstream

```
autonomous-assistant
├── generateCoachBriefing()   → command-centre Dashboard
│                             → mobile TodayPage
├── getActiveRecommendations()→ command-centre AIRecommendations
│                             → mobile ActionsPage
├── generateTimeline()        → command-centre ActionsPage
│                             → mobile TodayPage
├── getDecisionQueue()        → command-centre ApprovalsQueue
│                             → mobile ActionsPage
└── runAutomations()          → communications-engine [SHOULD]
                              → learning-engine.recordOutcome() [SHOULD]
```

### Season Intelligence (3005) → Downstream [ALL MISSING]

```
season-intelligence  ← [NO CONNECTIONS TO PRODUCTION]
├── detectCurrentPhase()  → command-centre Dashboard [MISSING]
│                         → mobile Home [MISSING]
│                         → club-digital-twin.buildClubModel() [MISSING]
├── getPrescription()     → autonomous-assistant.observe() [MISSING]
│                         → fixture-engine.generateMatchPack() [MISSING]
├── buildClubHealthScore()→ command-centre Reports [MISSING]
│                         → mobile Home health card [MISSING]
├── runSimulation()       → command-centre Reports [MISSING]
└── generateAllPredictions()→ autonomous-assistant [MISSING]
                            → command-centre Reports [MISSING]
```

### Learning Engine (3006) → Downstream [ALL MISSING]

```
learning-engine  ← [NO CONNECTIONS TO PRODUCTION]
├── computeClubIntelligenceScore() → command-centre Dashboard [MISSING]
│                                   → mobile Home [MISSING]
├── getCalibrationSummary()         → autonomous-assistant [MISSING]
├── generateFeedbackReport()        → command-centre Reports [MISSING]
└── getAutoApplyDeltas()            → autonomous-assistant.rank() [MISSING]
```

---

## Orchestrator Adapter Registry

### Current (12 adapters)

```
memory-engine, workflow-engine, coaching-engine, data-integration,
club-intelligence, player-development, rugby-knowledge, ai-copilot,
discovery-agent, lead-personalisation, market-intel
```

### Missing adapters (need to be created)

```
autonomous-assistant  — route "show recommendations", "run morning check"
season-intelligence   — route "what phase are we in", "season health"
fixture-engine        — route "prepare Thursday's fixture", "show standings"
learning-engine       — route "how accurate are predictions", "club intelligence score"
communications-engine — route "send the newsletter", "message U16 parents"
club-digital-twin     — route "show club health", "what are the risks"
```

---

## Port Allocation Reference

| Port | Service | Status |
|------|---------|--------|
| 3001 | Command Centre API | Live |
| 3002 | Club Digital Twin API | Live, not proxied through 3001 |
| 3003 | Fixture Engine API | Live, not proxied through 3001 |
| 3004 | Autonomous Assistant API | Live, partially proxied |
| 3005 | Season Intelligence API | Live, NOT in 3001 at all |
| 3006 | Learning Engine API | Live, NOT in 3001 at all |
| 5173 | Command Centre UI | Live |
| 5174 | Mobile UI | Live |

**Target state:** All engine APIs should be proxied through Command Centre API (3001) so that UIs have a single backend.

---

## The Single Missing Wire

The most consequential missing integration in the entire platform is one data flow:

```
autonomous-assistant → learning-engine.recordOutcome()
```

Without this, every other engine continues to improve and operate, but the platform **never gets smarter**. The Learning Engine sits fully built with no input, and `getAutoApplyDeltas()` returns deltas that are never consumed.

This is a 30-line integration:
1. When a coach accepts/rejects/snoozes a recommendation via the UI, POST to `/api/recommendations/:id/[accept|reject|snooze]`
2. Command Centre API calls `learning-engine.recordOutcome()` with the decision
3. Monthly cron calls `runMonthlyFeedback()`
4. `applyCalibration()` is called when `detectAndRank()` runs

This single wire closes the feedback loop on the entire AI platform.

---

*See AI_PLATFORM_AUDIT.md for detailed per-engine analysis.*  
*See PRODUCTION_ROADMAP.md for implementation priorities.*
