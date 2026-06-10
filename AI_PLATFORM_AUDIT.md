# AI Platform Audit

**Date:** June 2026  
**Status:** AI Foundation Complete — Integration Phase beginning  
**Engines audited:** 19 engines / services across the platform

---

## Audit Summary

| Engine | Port | Has CLI | Has HTTP API | In Prod API | In Mobile | Integration Priority |
|--------|------|---------|--------------|-------------|-----------|---------------------|
| Memory Engine | — | ✓ | — | Indirect | Indirect | P1 — Foundation |
| Club Digital Twin | 3002 | ✓ | ✓ | ✓ | Partial | P1 — Core |
| Fixture Engine | 3003 | ✓ | ✓ | ✓ | Partial | P1 — Core |
| Autonomous Assistant | 3004 | ✓ | ✓ | Partial | Partial | P1 — High Value |
| Season Intelligence | 3005 | ✓ | ✓ | **Missing** | **Missing** | P1 — High Value |
| Learning Engine | 3006 | ✓ | ✓ | **Missing** | **Missing** | P2 — Background |
| Workflow Engine | — | ✓ | — | Partial | Partial | P2 — Enabling |
| Knowledge Engine | — | ✓ | — | ✓ | — | P2 — Supporting |
| Communications Engine | — | ✓ | — | Partial | **Missing** | P1 — High Value |
| Orchestrator | — | ✓ | — | ✓ | ✓ | P1 — Gateway |
| Action Registry | — | ✓ | — | ✓ | Partial | P1 — Enabling |
| Coaching Engine (qa/) | — | ✓ | — | — | — | P3 — Future |
| Club Intelligence (qa/) | — | ✓ | — | Partial | — | P2 — Supporting |
| Data Integration (qa/) | — | ✓ | — | — | — | P2 — Critical |
| Player Development (qa/) | — | ✓ | — | — | — | P3 — Future |
| Knowledge Engine | — | ✓ | — | ✓ | — | P2 — Supporting |
| Command Centre API | 3001 | — | ✓ | — | — | P1 — Live |
| Command Centre UI | 5173 | — | — | ✓ | — | P1 — Live |
| Mobile UI | 5174 | — | — | ✓ | — | P1 — Live |

---

## Engine-by-Engine Audit

---

### 1. Memory Engine

**Directory:** `memory-engine/`  
**Port:** None  

**Available Functions:**
```
rememberPlayer, rememberCoach, rememberTeam, rememberClub
rememberProgramme, rememberSession, rememberSeason, rememberConversation
getRelevantContext, searchMemory, updateAfterGeneration
checkHealth, repairIndex, getStats
recordAttendance, clearInjury, updateProgrammeStatus
```

**Data In:** Player profiles, coaching sessions, injury data, team season info, conversation logs  
**Data Out:** Entity summaries, indexed memory snapshots, relevant context objects  
**Storage:** JSONL files in `memory-engine/data/entities/`

**Dependencies:**
- Used by: club-digital-twin, orchestrator, autonomous-assistant, communications-engine, workflow-engine, knowledge-engine, season-intelligence, learning-engine (all engines import from here)
- Imports from: none (root dependency)

**Missing Integrations:**
- No HTTP API — every consumer must have Node.js access
- Memory Engine has no way to receive data from the production MVP database
- `recordAttendance()` and injury mutations exist but are never called from production API
- No event hook for "new player registered" or "attendance submitted" from the UI

**Duplicate Logic:**
- Mock attendance data exists separately in `autonomous-assistant/observation-engine.js` and `season-intelligence/season-cli.js` — all should read from Memory Engine
- Club name/identity is hardcoded in multiple places instead of reading from memory

**Integration Priority: P1 — Foundation (everything depends on this)**

---

### 2. Club Digital Twin

**Directory:** `club-digital-twin/`  
**Port:** 3002  

**Available Functions:**
```
buildClubModel, buildHealthReport, getHealthHistory, scoreDimensions
buildRiskRegister, getClubRisks, getCriticalRisks
computeTrends, saveSnapshot, narrateTrends
generateExecutiveSummary, generateBoardReport, generateMorningBriefing
generatePredictions, runDigitalTwin
```

**API Routes (3002):**
```
GET /twin                — full model
GET /twin/summary        — lightweight summary
GET /twin/health         — health scores by dimension
GET /twin/health/history — trend over time
GET /twin/risks          — all risks
GET /twin/risks/critical — critical risks only
GET /twin/trends         — computed trends
GET /twin/predictions    — predictive outputs
GET /twin/briefing       — morning briefing
GET /twin/ask            — NL query
```

**Data In:** Aggregates from memory-engine, club-intelligence, knowledge-engine, fixture-engine, communications-engine, workflow-engine  
**Data Out:** Club model object, health scores (8 dimensions), risk register, trends, predictions, morning briefing  
**Storage:** JSONL snapshots in `club-digital-twin/data/`

**Dependencies:**
- Imports from (lazy): memory-engine, knowledge-engine, club-intelligence, workflow-engine, fixture-engine, communications-engine

**Missing Integrations:**
- Does NOT aggregate from Season Intelligence (no phase-aware health scoring)
- Does NOT aggregate from Learning Engine (no calibration feedback in club model)
- Does NOT aggregate from Autonomous Assistant (recommendations not in club model)
- Twin API (3002) is **not called from Command Centre API** (3001) — a separate API instead of proxy
- Command Centre API has its own `/api/club/health` that calls club-intelligence directly, bypassing the Twin

**Duplicate Logic:**
- Health scoring logic exists in both `club-digital-twin/health-scorer.js` and `season-intelligence/team-health-score.js` — should be unified
- Risk detection overlaps with Autonomous Assistant recommendation detection

**Integration Priority: P1 — Central aggregation hub**

---

### 3. Fixture Engine

**Directory:** `fixture-engine/`  
**Port:** 3003  

**Available Functions:**
```
createFixture, generateFixtureId, FIXTURE_STATUS, RESULT_STATUS
saveFixture, getFixture, listAllFixtures, listUpcomingFixtures
listRecentFixtures, getNextFixture, fixtureStats
generateTimeline, getActionableTasks, markTaskDone, timelineProgress
prepareFixture, analyseOpposition, buildAvailabilityPoll
generateMatchPack, completeFixture, generatePostMatchReview
updateSeasonTimeline, getSeasonStandings, getTeamSeasonSummary
```

**API Routes (3003):**
```
GET/POST /fixtures            — list & create
GET      /fixtures/upcoming   — upcoming fixtures
GET      /fixtures/recent     — recent results
GET      /fixtures/stats      — season stats
GET/PUT  /fixtures/:id        — get & update
POST     /fixtures/:id/prepare
GET      /fixtures/:id/timeline
GET      /fixtures/:id/pack
POST     /fixtures/:id/pack/generate
POST     /fixtures/:id/complete
GET      /fixtures/:id/review
POST     /fixtures/:id/twin-update
POST     /fixtures/:id/opposition
GET      /season/timeline
GET      /season/standings
GET      /season/team/:teamId
```

**Data In:** Fixture data (opponent, kickoff, home/away), match results, player availability  
**Data Out:** Fixture objects, preparation timelines, match packs, post-match reviews, season standings  
**Storage:** JSON files in `fixture-engine/data/fixtures/` (one per fixture)

**Dependencies:**
- Reads from: memory-engine (team/player data), season-intelligence (phase context)
- Used by: club-digital-twin, autonomous-assistant, command-centre API, mobile API

**Missing Integrations:**
- Fixture Engine API (3003) is **not proxied through Command Centre API** (3001) — mobile and UI must call port 3003 directly or go through 3001 separately
- No webhook/event when a fixture is created — downstream engines don't know
- `updateDigitalTwin()` exists but is not wired — post-match data doesn't flow back to twin automatically
- No integration with Season Intelligence phase context when building match packs
- Availability poll (`buildAvailabilityPoll()`) is generated but not connected to Communications Engine for delivery

**Duplicate Logic:**
- Fixture-related mock data in `autonomous-assistant/observation-engine.js` should come from Fixture Engine
- Season standings calculation duplicates logic that Season Intelligence also tracks

**Integration Priority: P1 — Core data for match operations**

---

### 4. Autonomous Assistant

**Directory:** `autonomous-assistant/`  
**Port:** 3004  

**Available Functions:**
```
runCheck, runMorningBriefing, runAutomations
dismiss, snooze, resolve, getStatus, getActiveRecommendations
observe, detect, rank, detectAndRank, summarise
generateTimeline, getHighPriorityEvents, getAutomatableEvents
classifyRecommendations, getAutomationReport
getDecisionQueue, generateCoachBriefing
loadActiveRecommendations, dismissRecommendation, snoozeRecommendation, resolveRecommendation
```

**API Routes (3004):**
```
GET  /status
GET  /briefing
GET  /recommendations
POST /recommendations/:id/dismiss
POST /recommendations/:id/snooze
POST /recommendations/:id/resolve
GET  /timeline
GET  /decision-support
GET  /automation-report
POST /run
POST /automate
```

**Data In:** Observations (injuries, attendance, fixtures, volunteers, memberships, workload)  
**Data Out:** Ranked recommendations, 14-day timeline, automation candidates, morning briefing  
**Mock Data:** `MOCK_OBSERVATIONS` in `observation-engine.js` — currently the primary data source  
**Storage:** JSONL in `autonomous-assistant/data/recommendations.jsonl`

**Dependencies:**
- Should read from: memory-engine (real observations), fixture-engine, club-digital-twin
- Should feed to: learning-engine (every recommendation outcome)
- Currently reads: MOCK_OBSERVATIONS (not wired to live engines)

**Missing Integrations:**
- `observe()` uses MOCK_OBSERVATIONS — not wired to real memory-engine data
- Recommendation outcomes are NOT automatically sent to Learning Engine — must be done manually
- Autonomous Assistant API (3004) is partially exposed through Command Centre API — only `/api/recommendations` proxies it; `/briefing`, `/timeline`, `/decision-support`, `/automation-report` are NOT exposed
- No cron job to run `runMorningBriefing()` automatically at a set time
- `runAutomations()` is wired but no production scheduler triggers it
- Coach decision (ACCEPTED/REJECTED/AUTO) is stored in assistant-state.js but not forwarded to learning-engine

**Duplicate Logic:**
- Detection logic partially overlaps with club-digital-twin's risk register
- Morning briefing generation duplicates some of what club-digital-twin's `generateMorningBriefing()` produces

**Integration Priority: P1 — Highest user-visible value**

---

### 5. Season Intelligence

**Directory:** `season-intelligence/`  
**Port:** 3005  

**Available Functions:**
```
PHASE, detectCurrentPhase, getPhaseMeta, getSeasonYear, getSeasonLabel
getSeasonWeek, getPhaseProgress, getUpcomingPhases, getAllPhases, daysUntilNextPhase
getPrescription, compareToPrescription
buildTeamHealthScore, buildMultiTeamSummary, buildClubHealthScore, getClubHealthDelta
generateAllPredictions, playerWorkloadForecast, attendanceForecast
availabilityTrajectory, injuryRiskIndex, seasonOutcomeProjection
runSimulation, getGapSummary, compareSimulations
saveSnapshot, loadSnapshots, loadLatestSnapshot, getHealthTrend
```

**API Routes (3005):**
```
GET /status
GET /phase
GET /phase/prescription
GET /phases
GET /health/team/:teamId
GET /health/club
GET /predictions
GET /simulation
GET /season
POST /snapshot
GET /trend
```

**Data In:** Team roster, attendance, injuries, fixture schedule, workload data  
**Data Out:** Phase (current/upcoming), prescriptions, team health scores, 8-week simulations, 5 predictive models  
**Mock Data:** `MOCK_TEAMS` and `MOCK_OBS` in season-api.js and season-cli.js  
**Storage:** JSONL in `season-intelligence/data/season-snapshots.jsonl`

**Dependencies:**
- Should read from: memory-engine (attendance, injuries), fixture-engine (schedule), club-digital-twin (team health baseline)
- Should feed to: club-digital-twin (phase context for health scoring), autonomous-assistant (phase-aware recommendations)

**Missing Integrations:**
- Season Intelligence API (3005) is **completely absent from Command Centre API** (3001) — not exposed at all
- Season Intelligence is **completely absent from Mobile API** — phase info not shown anywhere in mobile UI
- Club Digital Twin does not call season-intelligence — health scores are not phase-calibrated
- Autonomous Assistant does not use phase prescriptions — recommendations use generic targets, not phase-appropriate ones
- Simulations and predictions are not surfaced in any UI
- Season phase context not injected into match pack generation (Fixture Engine)

**Integration Priority: P1 — Major gap in platform coherence**

---

### 6. Learning Engine

**Directory:** `learning-engine/`  
**Port:** 3006  

**Available Functions:**
```
recordOutcome, getOutcomeSummary, getRecentOutcomes, seedMockOutcomes
calibrateTypeConfidence, calibrateAllTypes, getCalibrationSummary, applyCalibration
getPredictionAccuracy, getAccuracyTrend, getWeakestTypes, getStrongestTypes
runMonthlyFeedback, getFeedbackHistory, getMonthlyTrend, generateFeedbackReport
computeClubIntelligenceScore, buildClubProfile, getStoredProfile
generateImprovementPlan, getAutoApplyDeltas
saveOutcome, loadOutcomes, saveClubProfile, loadClubProfile
```

**API Routes (3006):**
```
GET  /health
GET  /outcomes
POST /outcomes
GET  /calibration
GET  /accuracy
GET  /accuracy/trend
GET  /feedback/latest
GET  /feedback/history
POST /feedback/run
GET  /club-intelligence
GET  /club-profile
POST /club-profile/build
GET  /improvement-plan
GET  /status
```

**Data In:** Recommendation outcomes (type, decision, result, confidence at time)  
**Data Out:** F1/precision/recall per type, calibration deltas, monthly feedback, Club Intelligence Score (0-100)  
**Mock Data:** 34 seeded outcomes via `seedMockOutcomes()`  
**Storage:** JSONL in `learning-engine/data/`

**Dependencies:**
- Should receive from: autonomous-assistant (every recommendation + coach decision)
- Should feed to: autonomous-assistant (calibration deltas via `getAutoApplyDeltas()`)

**Missing Integrations:**
- Learning Engine is **completely absent from Command Centre API** (3001) — not exposed
- Autonomous Assistant does NOT call `applyCalibration()` — recommendations use uncalibrated confidence
- Coach decisions (ACCEPTED/REJECTED/AUTO) are NOT forwarded to Learning Engine from any UI action
- `getAutoApplyDeltas()` is implemented but never consumed
- No monthly cron to trigger `runMonthlyFeedback()` automatically
- Club Intelligence Score not shown anywhere in UI

**Integration Priority: P2 — Background process (valuable but invisible to end user)**

---

### 7. Workflow Engine

**Directory:** `workflow-engine/`  
**Port:** None  

**Available Functions:**
```
parseWorkflow, listTemplates
planWorkflow, formatPlan, validatePlan
runWorkflow, approveAndRun, dryRun, formatRunResult
logEvent, getRunHistory, getWorkflowHistory, getRecentHistory
enqueue, dequeue, cancel, peek, listPending, processDue
getAction, getAllActions, listActions, hasAction
executeWorkflow
```

**Dependencies:**
- Reads from: action-registry, memory-engine, fixture-engine
- Used by: orchestrator, command-centre API (NL execution)

**Missing Integrations:**
- Workflow templates not exposed as a browseable catalogue in the UI
- Queue processing (`processDue()`) never called automatically — workflows scheduled for the future will never fire
- No webhook events when workflow steps complete
- Workflow history not shown in Command Centre UI beyond the action history feed

**Integration Priority: P2 — Enabling layer (needed for complex multi-step actions)**

---

### 8. Knowledge Engine

**Directory:** `knowledge-engine/`  
**Port:** None  

**Available Functions:**
```
ask, formatAnswer, buildIndex, getIndex, refreshDomain, indexStats, DOMAINS
search, keywordSearch
parseQuery, describeQuery, INTENTS
cite, citeMany, dedupeCitations, formatCitations
cacheGet, cacheSet, cacheHas, cacheInvalidate
logQuery, getRecentQueries, getQueryStats
scoreResult, rankResults, topResult
checkHealth
```

**Dependencies:**
- Reads from: memory-engine, fixture-engine, club-digital-twin
- Used by: command-centre API (`/api/knowledge/ask`)

**Missing Integrations:**
- Knowledge Engine is connected to `/api/knowledge/ask` but NOT to mobile UI
- Index rebuild (`buildIndex()`) never triggered on data changes — index can become stale
- Citation results not rendered in UI (answers shown as plain text)
- DOMAINS not all mapped to real engine data sources

**Integration Priority: P2 — Supporting (connected but underutilised)**

---

### 9. Communications Engine

**Directory:** `communications-engine/`  
**Port:** None  

**Available Functions (60+ exported):**
```
selectAudience, deduplicateAudience, filterByChannel
generateContent, generatePersonalised, render, adaptForChannel
buildWeeklyNewsletter, buildCoachMessage, buildMatchReport, buildMatchPreview
buildTrainingReminder, buildCancelledTraining, buildVolunteerRequest
buildRenewalReminder, buildWelcomeNewMember, buildLapsedMemberReEngagement
planDelivery, executeDelivery, scheduleNow, scheduleAt, scheduleRecurring
logCommunication, getRecipientHistory, getRecentHistory, hasRecentlySent
getChurnRisk, generateInsightsReport
createDraft, approveDraft, rejectDraft
sendCommunication, scheduleCommunication, previewCommunication
```

**Dependencies:**
- Reads from: memory-engine (audience), fixture-engine (match data), club-digital-twin (team data)
- Used by: command-centre API (partially), orchestrator, autonomous-assistant (for auto-send actions)

**Missing Integrations:**
- No HTTP API — only accessible as a Node module
- Completely absent from mobile UI — coaches cannot send communications from mobile
- Delivery (`executeDelivery()`) is simulated — no real email/SMS/WhatsApp integration
- `scheduleRecurring()` is implemented but no background process calls `getDueSchedules()` + `markScheduleSent()`
- Availability poll (from fixture-engine) is not wired to Communications Engine for delivery
- Autonomous Assistant recommendation "COMMUNICATION_GAP" auto-action is not wired to `buildWeeklyNewsletter()`
- Draft approval flow (createDraft → approveDraft) is not surfaced in UI

**Duplicate Logic:**
- Message personalization vars exist in both `communications-engine/content-generator.js` and `orchestrator/adapters/`
- Channel selection logic partially duplicated in action-registry

**Integration Priority: P1 — Direct user value (coaches want to communicate)**

---

### 10. Orchestrator

**Directory:** `orchestrator/`  
**Port:** None  

**Available Functions:**
```
orchestrate, createOrchestrator, createConsoleOrchestrator
registryStats, listEngines, analyseRequest, planExecution, formatPlan
Orchestrator.run, Orchestrator.preview, Orchestrator.stats, Orchestrator.engines
```

**Adapters registered (12):**
memory-engine, workflow-engine, coaching-engine, data-integration, club-intelligence, player-development, rugby-knowledge, ai-copilot, discovery-agent, lead-personalisation, market-intel

**Missing Integrations:**
- Autonomous Assistant NOT registered as an orchestrator adapter
- Season Intelligence NOT registered as an orchestrator adapter
- Learning Engine NOT registered as an orchestrator adapter
- Fixture Engine NOT registered as an orchestrator adapter
- Communications Engine NOT registered as an orchestrator adapter
- Club Digital Twin NOT registered as an orchestrator adapter (uses separate API call path)
- NL command "show me today's recommendations" would not route to Autonomous Assistant
- NL command "what's the season phase?" would not route to Season Intelligence

**Integration Priority: P1 — All NL commands flow through here**

---

## Critical Integration Gaps (Priority Order)

| # | Gap | Impact | Effort |
|---|-----|--------|--------|
| 1 | Season Intelligence not in Command Centre API | Phase-calibrated health missing from all UI | Low |
| 2 | Learning Engine not in Command Centre API | CIS and accuracy not visible to coach | Low |
| 3 | Autonomous Assistant using mock observations | Recommendations not based on real data | High |
| 4 | Coach decisions not forwarded to Learning Engine | Platform never gets smarter | Medium |
| 5 | Orchestrator missing 5 adapters | NL commands route to wrong or no engine | Medium |
| 6 | No real delivery in Communications Engine | All messages are simulated | Very High |
| 7 | No background scheduler for due workflows | Scheduled actions never fire | Medium |
| 8 | Digital Twin not calling Season Intelligence | Health scores not phase-aware | Low |
| 9 | Fixture availability poll not wired to Comms | Coach can't send availability requests | Medium |
| 10 | Learning Engine calibration not used by Assistant | Confidence never improves | Low |

---

## Duplicate Logic Register

| Logic | Location A | Location B | Resolution |
|-------|-----------|-----------|------------|
| Health scoring | `club-digital-twin/health-scorer.js` | `season-intelligence/team-health-score.js` | Deprecate Twin's scorer; call Season Intelligence |
| Attendance mock data | `autonomous-assistant/observation-engine.js` | `season-intelligence/season-cli.js` | Both read from memory-engine |
| Club identity defaults | `club-digital-twin/club-model.js` | Multiple CLI files | Read from memory-engine club entity |
| Morning briefing generation | `club-digital-twin/report-builder.js` | `autonomous-assistant/decision-support.js` | Autonomous Assistant calls Twin's briefing |
| Fixture mock data | `autonomous-assistant/observation-engine.js` | `fixture-engine/` (live) | Wire assistant to fixture engine |
| Message personalization vars | `communications-engine/content-generator.js` | `orchestrator/adapters/` | Centralise in comms engine |
| Risk detection | `club-digital-twin/risk-register.js` | `autonomous-assistant/recommendation-engine.js` | Assistant reads Twin's risks as input |

---

*Audit complete. 19 engines/services mapped. See ENGINE_INTEGRATION_MAP.md for connection diagram.*
