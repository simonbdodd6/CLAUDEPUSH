# Coach's Eye — Command Centre Architecture

## Overview

The Command Centre is the visual operating system for the entire Coach's Eye platform. It is a React single-page application that consumes all existing engines through a thin HTTP API bridge. It never duplicates backend logic — it only presents and orchestrates what already exists.

---

## System Boundary

```
┌─────────────────────────────────────────────────────────────────────┐
│  Coach's Eye Command Centre (React SPA)                             │
│  app/command-centre/  ·  Port 5173                                  │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Dashboard   │  │  Actions     │  │  Command Bar  (⌘K)       │  │
│  │  5 widgets   │  │  51 cards    │  │  NL → Action → Result    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Players     │  │  Comms       │  │  Reports                 │  │
│  │              │  │              │  │                          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │  HTTP /api/*
┌──────────────────────────────────▼──────────────────────────────────┐
│  API Server  (Node.js HTTP)                                          │
│  app/api-server.js  ·  Port 3001                                     │
│                                                                      │
│  GET  /api/actions          POST /api/actions/run                    │
│  POST /api/actions/preview  POST /api/nl                             │
│  GET  /api/club/health      GET  /api/alerts/injuries                │
│  GET  /api/alerts/attendance GET /api/recommendations                │
│  GET  /api/history          GET  /api/approvals                      │
│  GET  /api/platform/status  GET  /api/dashboard/briefing             │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │  ES Module imports
┌──────────────────────────────────▼──────────────────────────────────┐
│  Platform Integration Layer                                          │
│  platform/ · actions/ · knowledge-engine/ · dashboard/              │
│  communications-engine/ · qa/ · memory-engine/ · workflow-engine/   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| UI Framework | React 18 | Component model, concurrent rendering |
| Routing | React Router 6 | File-based-style client routing |
| Styling | Tailwind CSS 3 | Utility-first, rapid iteration, dark mode |
| Build Tool | Vite 5 | Fast HMR, ES module native |
| Icons | Lucide React + inline SVG | Minimal bundle, consistent visual |
| API Layer | Node.js built-in `http` | Zero dependencies, ESM-compatible |
| State | React hooks (useState, useEffect, useMemo) | No external state library needed |

---

## Directory Structure

```
app/
├── api-server.js                   ← Node HTTP bridge to platform layer
└── command-centre/
    ├── package.json
    ├── vite.config.js              ← Proxy /api → localhost:3001
    ├── tailwind.config.js          ← Custom design tokens
    ├── index.html
    └── src/
        ├── main.jsx                ← React entry point
        ├── App.jsx                 ← Router
        ├── styles/globals.css      ← Design system + Tailwind layers
        ├── api/client.js           ← Fetch wrapper + mock fallbacks
        ├── hooks/
        │   ├── useClubData.js      ← Data fetching hooks
        │   ├── useActions.js       ← Action library hooks
        │   └── useCommandBar.js    ← ⌘K keyboard shortcut
        ├── components/
        │   ├── layout/
        │   │   ├── CommandLayout.jsx ← Shell: sidebar + topbar + outlet
        │   │   ├── Sidebar.jsx       ← Navigation + search shortcut
        │   │   └── TopBar.jsx        ← Header + notifications
        │   ├── ui/
        │   │   ├── Card.jsx
        │   │   ├── Button.jsx
        │   │   ├── Badge.jsx
        │   │   ├── Spinner.jsx
        │   │   └── EmptyState.jsx
        │   ├── command-bar/
        │   │   └── CommandBar.jsx  ← NL command palette
        │   └── dashboard/
        │       ├── ClubHealthCard.jsx      ← Animated health ring
        │       ├── TodayPriorities.jsx     ← Urgency-ranked list
        │       ├── QuickActions.jsx        ← 12-button action grid
        │       ├── PlayerAlerts.jsx        ← Injury + attendance
        │       ├── ApprovalsQueue.jsx      ← Pending approvals
        │       ├── AIRecommendations.jsx   ← Club Intelligence recs
        │       └── ActionHistoryFeed.jsx   ← Execution log
        └── pages/
            ├── DashboardPage.jsx       ← Home
            ├── ActionsPage.jsx         ← All 51 actions
            ├── PlayersPage.jsx         ← Player management
            ├── CommunicationsPage.jsx  ← Comms hub
            └── ReportsPage.jsx         ← Reports & analytics
```

---

## Design System

| Token | Value | Usage |
|---|---|---|
| `surface-0` | `#0C0D12` | Page background |
| `surface-1` | `#111318` | Card base |
| `surface-2` | `#181B24` | Elevated card |
| `surface-3` | `#1F2333` | Hover state |
| `ink-1` | `#ECEEF5` | Primary text |
| `ink-2` | `#8B8FA8` | Secondary text |
| `ink-3` | `#4E5270` | Muted / placeholder |
| `accent` | `#6366F1` | Indigo — primary action |
| `success` | `#22C55E` | Positive state |
| `warning` | `#EAB308` | Caution state |
| `danger` | `#EF4444` | Alert / error |

Inspired by: Linear, Notion, Arc Browser, Apple Human Interface Guidelines.

---

## Command Bar

The `CommandBar` component is the primary AI interface:

1. Opens with `⌘K` (Mac) or `Ctrl+K` (Windows/Linux)
2. Accepts any natural language input
3. Shows action suggestions filtered in real-time from the 51-action library
4. On Enter or suggestion click → calls `POST /api/nl` → `runFromNL()` → Platform Orchestrator
5. Displays result inline with summary, evidence, and timing
6. Escape to close

**Resolution flow:**
```
User types "Prepare Thursday's U14 training."
  → CommandBar queries /api/actions/resolve
  → resolveFromNL() matches coaching.training_session (60% confidence)
  → POST /api/nl with text + role
  → action-runner.run('coaching.training_session', {}, {role:'admin'})
  → Platform executes training_prepare pipeline
  → Response displayed with summary + evidence
```

---

## Data Flow

```
React Component
  → useClubData hook (useState + useEffect)
    → api.clubHealth() (fetch /api/club/health)
      → api-server.js route handler
        → getClubHealth() from qa/club-intelligence/index.js
          → Club Intelligence Engine
            → Memory Engine + Data Integration
            → Returns { overallScore, trend, domains }
      ← JSON response
    ← parsed JSON
  ← data prop to ClubHealthCard
← renders HealthRing + DomainBars
```

---

## Starting the Command Centre

```bash
# Terminal 1 — API Server
node app/api-server.js

# Terminal 2 — React Dev Server
cd app/command-centre && npm run dev

# Then open: http://localhost:5173
```

Or via npm:
```bash
npm run command-centre:server   # API server
npm run command-centre:ui       # React UI
```
