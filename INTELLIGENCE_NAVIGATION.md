# Coach's Eye Intelligence — Navigation Flow

Complete journey map for the Intelligence feature layer. Every screen, state, and transition.

---

## Overview

```
Core App (index.html)
  └── Coach logs in
        └── Daily Briefing (Home)
              └── [AI Brain card] → Command Centre
                    ├── /intelligence   Intelligence Dashboard
                    ├── /decisions      Decision Centre
                    └── /availability, /match, /home, ...
```

Intelligence is a premium overlay. All paths enter via Command Centre. Core is never modified.

---

## 1. Entry: Core App → Command Centre

**Page:** Coach's Eye Core (`index.html`)
**Purpose:** Main operational app. Bridge to AI layer via Daily Briefing.
**Entry:** Login
**Exit to Intelligence:** Daily Briefing "AI Brain" card → opens Command Centre in new tab / iframe
**Feature flags:** `aiDashboard`, `aiDecisionCentre` (checked by Command Centre; Core is unaware)
**Loading state:** N/A (Core loads independently)
**Error state:** If Command Centre unreachable, Core continues normally — no dependency
**Mobile:** Core is the primary mobile surface; Command Centre is desktop-first

---

## 2. Command Centre: Root `/`

**Page:** `App.jsx` router root → redirects to `/home`
**Purpose:** Container. Sidebar navigation, route rendering, dark mode.
**Entry:** Direct URL or from Core Daily Briefing link
**Exit:** Any sidebar nav item
**Components:** `Sidebar.jsx`, `App.jsx` router
**API calls:** None at root
**Feature flags:** N/A
**Loading state:** Instant (shell only, no data)
**Empty state:** N/A
**Error state:** N/A
**Mobile:** Sidebar collapses; hamburger menu at `sm:hidden`
**Desktop:** Persistent left sidebar 240px

---

## 3. Intelligence Dashboard `/intelligence`

**Page:** `IntelligenceDashboardPage.jsx`
**Purpose:** Read-only overview of club AI health. Six aggregated data sections.
**Entry:** Sidebar → "Intelligence" nav item (AI badge)
**Exit:** Sidebar → any route, or "Decision Centre" button (planned, not yet wired)
**Components:**
  - `IntelligencePageHeader` — title, AI BRAIN badge, Preview badge, timestamp, Refresh
  - `ScoreRing` + `ClubScoreCard` — composite score with progress ring
  - `ObservationsCard` — today's anomaly signals with severity dots
  - `RecommendationsCard` → `RecommendationCard` — expandable recommendation list
  - `SquadHealthCard` — availability %, injuries, uncertain, at-risk players
  - `FixtureReadinessCard` — next fixture readiness gauges
  - `TimelineCard` → `TimelineEventRow` — recent AI events, filterable by fixture
**API calls:**
  - `GET /api/intelligence/dashboard` → `useIntelligenceDashboard()`
  - Aggregates: club-score-engine, match-readiness-engine, recommendation-engine, timeline
**Feature flags:** `aiDashboard` (checked by Command Centre routing; no hard gate in page)
**Loading state:** Each card renders `IntelligenceSkeleton` independently
**Empty state:** Per-section empty messages (e.g. "No observations — all systems nominal")
**Error state:** Banner: "Intelligence service unavailable — showing preview data"
**isMock:** "Preview" badge in header; footer note per card
**Mobile:** Single column stack
**Desktop:** Two-column grid (`lg:grid-cols-2`), KPI strip above

---

## 4. Decision Centre `/decisions`

**Page:** `DecisionCentrePage.jsx`
**Purpose:** Actionable AI recommendations. Coach approves, dismisses, or snoozes each.
**Entry:** Sidebar → "Decision Centre" nav item (AI badge)
**Exit:** Sidebar → any route
**Components:**
  - `IntelligencePageHeader` — title, AI BRAIN badge, Preview badge, timestamp, Refresh
  - `HighPriorityActions` → `RecommendationCard` (with actions prop) — approve / dismiss / snooze
  - `DecisionsWaiting` — pending coaching actions (publish squad, medical follow-up, etc.)
  - `RecentlyCompleted` — session-local + server-sourced completed decisions
  - `ImpactPreview` — sticky right panel; updates when recommendation selected
  - `DecisionHistory` → `TimelineEventRow` — full timeline with multi-filter (team/player/fixture/date)
**API calls:**
  - `GET /api/intelligence/decisions` → `useIntelligenceDecisions()`
  - `POST /api/intelligence/decisions/:id/approve` (fire-and-forget)
  - `POST /api/intelligence/decisions/:id/dismiss` (fire-and-forget)
  - `POST /api/intelligence/decisions/:id/snooze`  (fire-and-forget)
**Feature flags:** `aiDecisionCentre`
**Local state:** `dismissed` Set, `snoozed` Set, `approvedPending` Set, `localCompleted` array — session only
**Loading state:** Five `IntelligenceSkeleton` placeholders in left column
**Empty state:** "All actions addressed ✓" when all recs dismissed/snoozed
**Error state:** Banner same as Intelligence Dashboard
**isMock:** "Preview" badge + right-panel "Preview Mode" card
**Mobile:** Single column; Impact Preview appears below Decision History
**Desktop:** Two-column (`xl:grid-cols-[1fr_320px]`); right panel sticky top-6

---

## 5. Recommendation Card Interaction Flow

```
Coach sees HighPriorityActions list
  └── Taps/clicks a RecommendationCard
        ├── Card expands (description + action + "Why am I seeing this?")
        ├── Impact Preview panel updates (right column)
        └── Coach chooses:
              ├── Approve → toast "Approved: …" → card removed from list
              │                → appended to RecentlyCompleted (local)
              │                → POST /api/intelligence/decisions/:id/approve (async)
              ├── Remind Later → toast "Snoozed 24h" → card hidden (snoozed Set)
              │                → POST /api/intelligence/decisions/:id/snooze (async)
              └── Dismiss → toast "Dismissed" → card removed (dismissed Set)
                           → POST /api/intelligence/decisions/:id/dismiss (async)
```

---

## 6. Intelligence Timeline Event Flow

```
Recommendation Engine generates recommendation
  → appendFromRecommendations() → writes to timeline.jsonl
        → GET /api/intelligence/timeline → TimelineCard (Dashboard)
        → GET /api/intelligence/decisions → DecisionHistory (Decision Centre)
        → POST /api/intelligence/timeline/:id/status → lifecycle update
```

Timeline events are immutable records. Status updates are appended, not overwritten.

---

## 7. Feature Flag Gates

| Flag              | Controls                                      | Default |
|-------------------|-----------------------------------------------|---------|
| `aiDashboard`     | Intelligence Dashboard page + sidebar item    | false   |
| `aiDecisionCentre`| Decision Centre page + sidebar item           | false   |
| `aiMatchReadiness`| Match readiness engine data in dashboard      | false   |
| `aiAvailability`  | Availability intelligence in dashboard        | false   |
| `aiFixtures`      | Fixture intelligence in dashboard             | false   |
| `aiSeason`        | Season intelligence in dashboard              | false   |
| `aiTimeline`      | Intelligence timeline API + persistence       | false   |
| `aiRecommendations` (legacy) | Old recommendation endpoint      | false   |

Flags are stored in `localStorage` under `defaultState.features`. Core sets defaults; flags can be toggled via settings or URL param for preview.

---

## 8. Data Flow Diagram

```
Core App (index.html)
  AIClient.getRecommendations()
  AIClient.getDailyBriefing()
         │
         ▼
  Intelligence Server (api-server.js :3001)
    ├── /api/intelligence/dashboard
    │     ├── club-score-engine
    │     ├── match-readiness-engine (serializeFixture)
    │     ├── recommendation-engine
    │     └── intelligence-timeline (stats)
    │
    ├── /api/intelligence/decisions
    │     ├── recommendation-engine (highPriority)
    │     ├── pending actions (static for now)
    │     ├── recently-completed (timeline JSONL)
    │     └── history (timeline JSONL filtered)
    │
    ├── /api/intelligence/timeline
    │     └── timeline-store.js (timeline.jsonl)
    │
    └── /api/recommendations (legacy)
          └── recommendation-engine
```

---

## 9. Error Handling Strategy

Every Intelligence endpoint:
1. Wraps each engine call in `Promise.allSettled` — one engine failure cannot break others
2. Returns `{ isMock: true, data: mockData }` on total failure
3. Client `safeFetch` returns null on network error → falls through to `MOCK[key]`
4. Pages show error banner only when `error && !data` (i.e. even mocks failed)

This means a coach always sees data — even in a complete outage scenario.

---

## 10. Consistency Guarantees (post-refactor)

| Concern              | Before                         | After                              |
|----------------------|--------------------------------|------------------------------------|
| Priority colours     | Duplicated in 2 pages          | Single source: `utils/intelligence.js` |
| Category colours     | Duplicated in 2 pages          | Single source: `utils/intelligence.js` |
| Status badges        | Duplicated in 2 pages          | Single source: `utils/intelligence.js` |
| Relative time        | `relativeTime` vs `relTime`    | Unified: `relTime` in utils        |
| Page header          | Duplicated JSX in 2 pages      | `IntelligencePageHeader` component |
| Skeleton loader      | `Skeleton`/`Sk` per-page       | `IntelligenceSkeleton` component   |
| Timeline rows        | Duplicated JSX in 2 places     | `TimelineEventRow` component       |
| Recommendation cards | Duplicated JSX in 2 places     | `RecommendationCard` component     |

---

## 11. Recommended Next Steps (V2 Navigation)

1. **Cross-link pages** — "View in Decision Centre" button on Intelligence Dashboard recommendations
2. **Deep-link from Core** — Daily Briefing AI card links to `/decisions` when `openHigh > 0`
3. **Notification badge** — Sidebar "Decision Centre" item shows red dot when `openHigh > 0`
4. **Player profile deep-link** — Timeline event `playerName` links to Core player profile
5. **Fixture deep-link** — Fixture Readiness card links to `/match` Command Centre page
6. **Search** — Global search across timeline events (title, player, team, fixture)
