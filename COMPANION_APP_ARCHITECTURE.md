# Coach's Eye Companion App Architecture

**Version:** 1.0  
**Classification:** Design Document

---

## Position in the Platform

```
┌─────────────────────────────────────────────────────────────┐
│                 Coach's Eye AI Platform                     │
│                                                             │
│  ┌──────────────────┐    ┌───────────────────────────────┐  │
│  │  Command Centre  │    │   Mobile Command Layer        │  │
│  │  (Desktop PWA)   │    │   (Mobile PWA — this doc)     │  │
│  │  port 5173       │    │   port 5174                   │  │
│  └────────┬─────────┘    └──────────────┬────────────────┘  │
│           │                             │                   │
│           └──────────────┬──────────────┘                   │
│                          ▼                                  │
│           ┌──────────────────────────────┐                  │
│           │    Club Digital Twin API     │ port 3002        │
│           │    Fixture Engine API        │ port 3003        │
│           │    Command Centre API        │ port 3001        │
│           └──────────────┬───────────────┘                  │
│                          ▼                                  │
│        ┌────────────────────────────────────┐               │
│        │  10 AI Engines (club-intelligence, │               │
│        │  memory, knowledge, workflows,     │               │
│        │  scouting, safeguarding,           │               │
│        │  performance, social, analytics,   │               │
│        │  club-digital-twin, fixture-engine │               │
│        └────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

The Mobile Command Layer is a pure consumer. It reads from the same three APIs as the desktop Command Centre. It writes nothing directly to engines — all mutations go through the Action Library (`/api/actions/run`).

---

## Module Responsibilities

| Module                         | Responsibility                                             |
|--------------------------------|------------------------------------------------------------|
| `src/api/client.js`            | Single source of truth for all HTTP calls + mock fallback  |
| `src/hooks/useMobileData.js`   | Parallel data loading, 60s cache, refresh trigger          |
| `src/hooks/useCommandBar.js`   | AI command bar state: open/close, query, result, history   |
| `src/components/layout/`       | Shell: MobileLayout wraps every page; BottomNav, CommandBar|
| `src/components/ui/`           | Stateless leaf components: HomeCard, QuickButton, AlertItem|
| `src/components/match/`        | MatchCountdown SVG ring — isolated, no data fetch          |
| `src/pages/`                   | Stateful pages; receive data from App-level hooks via props |
| `src/styles/globals.css`       | Tailwind component layer; no `/12` opacity in @apply       |

---

## State Architecture

State is owned at three levels:

```
App.jsx
  useMobileData()   ← platform-wide: health, fixtures, briefing, recommendations
  useAlerts()       ← alert list: injuries + risks merged
  useCommandBar()   ← AI bar: open state, query, result, history

  └─ MobileLayout (receives cmdBar, alertCount)
       └─ CommandBar (reads all cmdBar state)
       └─ BottomNav  (reads alertCount for badge)
       └─ Outlet → Pages (receive data/alerts as props)
                     └─ MatchPage: own fixture detail state
                     └─ ActionsPage: own running/result state
                     └─ AlertsPage: own filter state
```

No global state library needed. Data lives in hooks at App level. Each page owns only transient UI state.

---

## API Contract

The Mobile layer depends on these endpoints existing:

```
GET  /twin/health              → { score, grade, dimensions[] }
GET  /twin/status              → { healthScore, playerCount, lastUpdated }
GET  /twin/briefing            → { summary, sections[] }
POST /twin/ask                 → { answer }
GET  /api/dashboard/briefing   → { summary, sections[] }
GET  /api/recommendations      → [{ action, priority }]
GET  /api/alerts/injuries      → { data: [{ playerId, playerName, status }] }
GET  /twin/risks/critical      → [{ type, severity, title, description }]
GET  /fixtures/upcoming?limit= → [Fixture]
GET  /fixtures/:id             → Fixture
GET  /fixtures/:id/timeline    → { tasks[], total, done }
GET  /fixtures/:id/pack        → MatchPack
POST /fixtures/:id/pack/generate → MatchPack
POST /fixtures/:id/complete    → { result }
POST /api/actions/run          → { result: { message } }
POST /api/nl                   → { answer }
```

All endpoints return `null` safely — every call wrapped in `safe(fn, mockKey)`.

---

## Security Model

- The mobile app has no authentication layer in v1 (intended for local network use by trusted coaches)
- All writes go through the Action Library which has its own role validation
- No credentials stored in the app
- PWA manifest does not request sensitive permissions

---

## Performance Characteristics

| Metric                 | Value         |
|------------------------|---------------|
| JS bundle (gzipped)    | ~63 KB        |
| CSS bundle (gzipped)   | ~4.4 KB       |
| Build time             | ~5.4s         |
| API timeout            | 10s           |
| Cache TTL              | 60s           |
| First meaningful paint | <1s (mock)    |

---

## PWA Installation

The app meets Apple's criteria for home screen installation:

| Requirement                  | Met? | How                              |
|------------------------------|------|----------------------------------|
| HTTPS / localhost            | ✅   | Vite dev server / prod deploy    |
| manifest.json                | ✅   | `/public/manifest.json`          |
| viewport-fit=cover           | ✅   | `<meta name="viewport">`         |
| apple-mobile-web-app-capable | ✅   | `<meta>` tag                     |
| status bar style             | ✅   | `black-translucent`              |
| standalone display           | ✅   | `"display": "standalone"`        |
| Icons (192/512)              | ⏳   | Placeholder paths — add PNG icons|

---

## Relationship to Desktop Command Centre

| Aspect        | Command Centre (5173)           | Mobile (5174)              |
|---------------|----------------------------------|----------------------------|
| Target device | Desktop/tablet (1024px+)         | Mobile (375px+)            |
| UI style      | Sidebar + multi-panel dashboard  | Bottom nav + single column |
| AI bar        | Floating modal                   | Pinned frosted pill        |
| Data source   | Same 3 APIs                      | Same 3 APIs                |
| Action auth   | Admin role                       | Coach role                 |
| State         | React Query / local              | Custom hooks + cache       |
| Offline       | No explicit fallback             | MOCK data fallback         |

They are independent applications sharing the same API surface. Neither imports from the other.

---

## Future Milestones

### 1 — Push Notifications (highest value)
Send real-time alerts to coaches via Web Push. The Digital Twin already emits risk events; a service worker can receive them and display native notifications even when the app is closed.

### 2 — Offline Write Queue
Cache action calls (take attendance, confirm volunteers) in IndexedDB and sync when connection restores.

### 3 — Player Self-Service
Separate `/player` route with attendance self-check-in, injury reporting, and availability confirmation.

### 4 — Service Worker Caching
Cache the JS/CSS shell so the app loads instantly with no network. Combine with Background Sync for the write queue.

### 5 — Native App Shell
Wrap in Capacitor.js for true App Store distribution, camera access (player photos), and native haptics.
