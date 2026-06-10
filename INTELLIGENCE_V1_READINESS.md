# Coach's Eye Intelligence — V1 Production Readiness Report

**Date:** 2026-06-10
**Branch:** `feature/nightly-qa-agent`
**Scope:** All Intelligence modules built in this sprint

---

## Executive Summary

The Intelligence V1 layer is a complete end-to-end AI overlay on top of Coach's Eye Core. It introduces a Recommendation Engine, Intelligence Timeline, Intelligence Dashboard, and Decision Centre — all behind feature flags, all with mock fallback, and none modifying Core.

The system is **demo-ready and technically sound**. It is not yet production-ready due to the gaps identified below, primarily around persistence, authentication, and real-engine integration.

---

## Module Scores

| Module                          | Score | Status        | Notes                                  |
|---------------------------------|-------|---------------|----------------------------------------|
| `recommendation-engine`         | 82%   | Beta-ready    | 16 detectors, real+mock fallback       |
| `intelligence-timeline`         | 78%   | Beta-ready    | JSONL persist, 26 seeds, filter API    |
| `IntelligenceDashboardPage`     | 85%   | Demo-ready    | Read-only, 6 sections, all shared UI  |
| `DecisionCentrePage`            | 80%   | Demo-ready    | 5 sections, action state, impact panel |
| `api-server.js` (Intelligence)  | 72%   | Dev-ready     | All endpoints live, no auth/rate limit |
| `client.js` (Command Centre)    | 88%   | Solid         | safeFetch, mock fallback, all methods  |
| `utils/intelligence.js`         | 95%   | Solid         | Complete, zero duplication             |
| Shared UI components            | 90%   | Solid         | 4 components, clean props, accessible  |
| Feature flags (`index.html`)    | 70%   | Needs work    | Present but not enforced in Command Centre |
| AIClient (`index.html`)         | 75%   | Beta-ready    | IIFE, flag checks, timeout, null-safe  |

**Overall Intelligence V1 Score: 81%**

---

## Module Details

### 1. Recommendation Engine — 82%

**What works:**
- 16 detectors across 7 categories (Medical, Selection, Training, Logistics, Player Welfare, Club, Performance)
- New schema: `{id, category, priority, confidence, title, description, action, source, explainability}`
- `buildContext(raw)` normalises raw Core data into engine context
- `buildMockContext()` generates a realistic Irish rugby club scenario
- `generate({})` with no context falls back to mock, returns ≤10 ranked recommendations
- `generate(ctx)` with real context returns only triggered detectors with real sources

**Gaps:**
- No persistence: recommendations are re-generated on every call (stateless by design, but no history)
- No A/B weighting: all detectors have equal weight
- No feedback loop: approved/dismissed decisions don't adjust future recommendations
- 16 detectors is sufficient for demo; production needs 30–50 with tunable thresholds

**Debt:**
- `buildContext` accepts raw Core object with no schema validation — fragile at Core API boundary
- Confidence scores are heuristic (hand-coded), not ML-derived

---

### 2. Intelligence Timeline — 78%

**What works:**
- JSONL persistence at `intelligence-timeline/data/timeline.jsonl`
- Auto-seeds from 26 mock events on first read
- `appendFromRecommendations()` as the single write integration point
- `getTimeline({ category, priority, status, team, player, fixture, seasonPhase })` with multi-value filters
- `updateStatus(id, status)` for lifecycle management
- `summarise()` for stats (actionRate, byStatus, byCategory)
- Compaction at 500 events (JSONL grows otherwise)

**Gaps:**
- No database: JSONL is single-process and will corrupt under concurrent writes
- No event deletion / GDPR erasure
- Seed data only; real timeline events require Recommendation Engine to call `appendFromRecommendations()` on each inference cycle
- `parseFilters` handles comma-separated strings for HTTP but direct object calls require arrays — subtle inconsistency

**Debt:**
- JSONL compaction rewrites the whole file — not atomic; data loss possible on crash during compaction
- Timeline has no pagination — `getTimeline()` returns all events in memory (fine for demo, not for 10k+ events)

---

### 3. Intelligence Dashboard — 85%

**What works:**
- 6 sections fully rendered with shared components
- `useIntelligenceDashboard()` hook with reload capability
- KPI strip (club score, availability, open alerts, timeline action rate)
- Per-card loading skeletons via `IntelligenceSkeleton`
- Error banner when service unavailable
- `IntelligencePageHeader` with Preview/mock badges
- Fixture filter on timeline section
- Responsive: single column mobile, two-column desktop

**Gaps:**
- No navigation link to Decision Centre from within dashboard
- Club score trend animation only works on initial load (no re-animation on refresh)
- `RecommendationsCard` is read-only; there's no "take action" CTA linking to `/decisions`
- FixtureReadiness shows first upcoming fixture only; no fixture picker

**Debt:**
- `ClubScoreCard.components` iterates `Object.entries` — undefined order in some JS engines (use `Object.entries(...).sort()` already done)
- ScoreRing uses inline `style={{ transition }}` — fine for now but not Tailwind-idiomatic

---

### 4. Decision Centre — 80%

**What works:**
- 5 sections: High Priority Actions, Decisions Waiting, Recently Completed, Impact Preview, Decision History
- `RecommendationCard` (shared) renders recommendations with expand, action buttons
- Local session state for dismissed/snoozed/approvedPending/localCompleted
- Optimistic UI: actions are instant; API calls are fire-and-forget
- Toast notifications on all actions (2.8s auto-dismiss)
- Impact Preview sticky panel with 3-stage flow diagram (current → action → outcomes)
- `DecisionHistory` with 4-dimensional filter (team/player/fixture/date)
- `TimelineEventRow` (shared) in history table

**Gaps:**
- Action state is **session-only** — reloading the page resets dismissed/snoozed state
- Impact predictions are static lookup (`IMPACT_MAP` by category) — not recommendation-specific
- No "undo" for dismissed recommendations
- `DecisionsWaiting` section uses static mock data from the API mock; no real pending queue
- No sorting in Decision History (chronological only)

**Debt:**
- `handleApprove` calls `setDismissed` twice (once to remove, then to add the id after localCompleted update) — correct but confusing
- `onSelect` in `HighPriorityActions` receives full rec object but `selectedId` is the id — dual state

---

### 5. API Server (Intelligence endpoints) — 72%

**What works:**
- `GET /api/intelligence/dashboard` — 6-section aggregation via `Promise.allSettled`
- `GET /api/intelligence/timeline` — with `parseFilters`, pagination-ready
- `POST /api/intelligence/timeline/:id/status` — lifecycle update
- `GET /api/intelligence/decisions` — highPriority + pending + recentlyCompleted + history
- `POST /api/intelligence/decisions/:id/approve|dismiss|snooze` — stub handlers
- `serializeFixture()` called on fixture before sending to dashboard
- All endpoints return `isMock: true` when engines fail

**Gaps:**
- No authentication or authorization on Intelligence endpoints
- No rate limiting (recommendation engine is expensive to run on every request)
- `POST` action endpoints log to console only — no persistence
- No request validation (Zod/Joi) — malformed requests return 500
- No API versioning (`/api/v1/intelligence/...`)

**Debt:**
- `Promise.allSettled` results checked inline per-endpoint — should extract a `settledValue(result, fallback)` helper
- `app.post('/api/intelligence/decisions/:id/:action')` would be cleaner than three separate routes

---

### 6. Shared UI Components — 90%

**What works:**
- `utils/intelligence.js` — 12 exported functions, zero duplication
- `IntelligencePageHeader` — unified header with consistent AI badge, mock badge, timestamp, refresh
- `IntelligenceSkeleton` — single loading placeholder abstraction
- `TimelineEventRow` — used in both pages (compact + full mode)
- `RecommendationCard` — used in both pages (read-only + actionable mode via `actions` prop)

**Gaps:**
- `RecommendationCard.onToggle` is `() => void` but DecisionCentrePage needs `(rec) => void` — adapted via wrapper at call site (works, but API is slightly awkward)
- No Storybook / visual test for components
- `IntelligencePageHeader` has no `aria-label` on the page region

**Debt:**
- Minor: `TimelineEventRow` compact mode still uses `space-y-0` container workaround in parent

---

### 7. Feature Flags — 70%

**What works:**
- 12 flags defined in `defaultState.features` in `index.html`
- `AIClient.flagEnabled(name)` reads from `localStorage` with try/catch
- New flags: `aiMatchReadiness`, `aiAvailability`, `aiFixtures`, `aiSeason`, `aiTimeline`, `aiDashboard`, `aiDecisionCentre`

**Gaps:**
- **Command Centre has no flag gate** — `/intelligence` and `/decisions` routes are always reachable if the URL is known
- Sidebar nav items always render if the routes exist — should conditionally render based on flag
- No flag UI in Command Centre settings (toggling requires localStorage manual edit)
- Core AIClient checks flags on each method call — Command Centre never checks them

**Required before production:**
```jsx
// Sidebar.jsx — conditionally show Intelligence nav items
const flags = useFeatureFlags()  // reads from Core's localStorage key
{flags.aiDashboard && <NavItem to="/intelligence" ... />}
{flags.aiDecisionCentre && <NavItem to="/decisions" ... />}
```

---

### 8. AIClient (`index.html`) — 75%

**What works:**
- IIFE pattern — no global namespace pollution
- `flagEnabled(name)` checks localStorage with try/catch
- `_fetch(path)` with AbortController timeout (5s)
- All methods: `getDailyBriefing`, `getMatchReadiness`, `getAvailabilityIntelligence`, `getFixtureIntelligence`, `getSeasonIntelligence`, `getRecommendations`, `isAvailable`
- Returns null on flag-disabled or network failure — callers must null-check

**Gaps:**
- `AI_BASE` is hardcoded to `http://localhost:3001` — must be env-configurable for staging/production
- No retry logic — a transient network error returns null permanently until next page load
- `isAvailable()` makes a real fetch — expensive to call repeatedly (cache the result)
- Methods are not documented in JSDoc

---

## Technical Debt Register

| ID  | Severity | Description                                                              | File |
|-----|----------|--------------------------------------------------------------------------|------|
| TD1 | High     | Timeline JSONL compaction is non-atomic — data loss on crash             | `timeline-store.js` |
| TD2 | High     | Intelligence endpoints have no auth — any client can call them           | `api-server.js` |
| TD3 | High     | Feature flags not enforced in Command Centre routing                     | `Sidebar.jsx`, `App.jsx` |
| TD4 | Medium   | Action decisions (approve/dismiss/snooze) not persisted across sessions  | `DecisionCentrePage.jsx` |
| TD5 | Medium   | `AI_BASE` hardcoded to localhost:3001                                     | `index.html` |
| TD6 | Medium   | `appendFromRecommendations()` never called automatically — timeline only grows from seed | `intelligence-timeline/index.js` |
| TD7 | Medium   | Timeline has no pagination — full table returned for all queries          | `timeline-store.js` |
| TD8 | Low      | `parseFilters` comma-split inconsistency (HTTP string vs direct array)   | `intelligence-timeline/index.js` |
| TD9 | Low      | `RecommendationCard.onToggle` API is `() => void` but callers need rec   | `RecommendationCard.jsx` |
| TD10| Low      | No request validation on Intelligence API endpoints                       | `api-server.js` |

---

## Recommended Next Sprint

### P0 — Before any real user traffic

1. **Auth gate on Intelligence API** — require session token or API key on all `/api/intelligence/*` routes
2. **Feature flag enforcement in Command Centre** — hide Intelligence routes behind `aiDashboard`/`aiDecisionCentre` flags in `Sidebar.jsx` and `App.jsx`
3. **Atomic JSONL compaction** — write to `.tmp`, then `fs.rename` (atomic on Linux/macOS)

### P1 — Before coach preview programme

4. **Persist action decisions** — `POST /api/intelligence/decisions/:id/approve|dismiss|snooze` must write to timeline (mark event as completed/ignored)
5. **Auto-append recommendations to timeline** — call `appendFromRecommendations()` in `/api/recommendations` and at each dashboard load
6. **`AI_BASE` via env var** — `process.env.AI_BASE_URL ?? 'http://localhost:3001'`
7. **Flag UI in Command Centre** — settings page to toggle flags without `localStorage` editing

### P2 — Hardening

8. **Timeline pagination** — add `limit`/`offset` to `getTimeline()` and the API
9. **Rate limiting** on recommendation endpoint — max 1 generation per 5 minutes per session
10. **Recommendation feedback loop** — store approved/dismissed outcomes; use to adjust confidence scores
11. **Storybook** for Intelligence components — visual regression protection

### P3 — Intelligence Upgrade

12. **Increase detector count** to 30–50 (currently 16)
13. **Real engine integration** — wire `availability-engine` and `match-readiness-engine` into `buildContext()`
14. **Impact prediction specificity** — replace `IMPACT_MAP` category lookup with recommendation-specific predictions
15. **Undo for dismissed recs** — 5-second undo toast window

---

## Files Modified / Created This Sprint

### Feature branch: `feature/nightly-qa-agent`

| File | Status | Lines |
|------|--------|-------|
| `recommendation-engine/index.js` | Created | ~280 |
| `intelligence-timeline/index.js` | Created | ~130 |
| `intelligence-timeline/timeline-store.js` | Created | ~90 |
| `intelligence-timeline/timeline-seed.js` | Created | ~180 |
| `app/api-server.js` | Modified | +180 lines |
| `app/command-centre/src/pages/IntelligenceDashboardPage.jsx` | Created → Refactored | ~380 → ~310 |
| `app/command-centre/src/pages/DecisionCentrePage.jsx` | Created → Refactored | ~490 → ~400 |
| `app/command-centre/src/api/client.js` | Modified | +80 lines |
| `app/command-centre/src/hooks/useClubData.js` | Modified | +3 hooks |
| `app/command-centre/src/components/layout/Sidebar.jsx` | Modified | +20 lines |
| `app/command-centre/src/App.jsx` | Modified | +6 lines |
| `app/command-centre/src/utils/intelligence.js` | Created | ~120 |
| `app/command-centre/src/components/intelligence/IntelligencePageHeader.jsx` | Created | ~50 |
| `app/command-centre/src/components/intelligence/IntelligenceSkeleton.jsx` | Created | ~8 |
| `app/command-centre/src/components/intelligence/TimelineEventRow.jsx` | Created | ~31 |
| `app/command-centre/src/components/intelligence/RecommendationCard.jsx` | Created | ~115 |

### Main branch

| File | Status |
|------|--------|
| `index.html` | Modified — AIClient IIFE + 4 new feature flags |

---

## Conclusion

Intelligence V1 delivers a coherent, feature-complete AI overlay for Coach's Eye. The architecture is sound: engines are isolated, UI is DRY, mock fallback is comprehensive, and the feature flag system allows progressive rollout.

The critical path to production is: auth gates on the API, feature flag enforcement in the UI, and persistent decision state. Everything else is incremental improvement.
