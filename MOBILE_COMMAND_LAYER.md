# Coach's Eye Mobile Command Layer

**Version:** 1.0  
**Status:** Complete — build verified  
**Port:** 5174 (dev) · proxies to 3001 / 3002 / 3003

---

## What It Is

A mobile-first Progressive Web App (PWA) that puts the full Coach's Eye AI Platform in a coach's pocket. Runs in any mobile browser, can be installed as a home screen app on iOS/Android, and works with mock data when the backend is offline.

---

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Framework   | React 18 + React Router 6           |
| Build       | Vite 5                              |
| Styling     | Tailwind CSS v3 (dark tokens)       |
| PWA         | manifest.json + iOS meta tags       |
| APIs        | Fetch + AbortController + mock fallback |

---

## Architecture

```
app/mobile/
├── index.html              ← PWA meta: viewport-fit=cover, apple-mobile-web-app-capable
├── public/manifest.json    ← standalone display, portrait, theme #09090E
├── src/
│   ├── main.jsx            ← ReactDOM.createRoot entry
│   ├── App.jsx             ← BrowserRouter + routes + shared data hooks
│   ├── api/
│   │   └── client.js       ← fetcher, MOCK fallback, api/twin/fixtures namespaces
│   ├── hooks/
│   │   ├── useMobileData.js  ← parallel fetch with 60s cache
│   │   └── useCommandBar.js  ← AI command bar state machine
│   ├── styles/
│   │   └── globals.css     ← Tailwind base + component layer (no /12 opacity bugs)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── MobileLayout.jsx  ← Outlet + CommandBar + BottomNav
│   │   │   ├── BottomNav.jsx     ← 5-tab frosted glass nav with badge
│   │   │   └── CommandBar.jsx    ← collapsed pill + full-screen AI overlay
│   │   ├── ui/
│   │   │   ├── HomeCard.jsx      ← large metric card with accent colour
│   │   │   ├── QuickButton.jsx   ← icon + label tile
│   │   │   ├── AlertItem.jsx     ← severity-coloured alert row
│   │   │   └── Spinner.jsx       ← animated SVG ring
│   │   └── match/
│   │       └── MatchCountdown.jsx ← SVG arc ring + prep progress bar
│   └── pages/
│       ├── HomePage.jsx    ← 6-card grid + recommendations
│       ├── TodayPage.jsx   ← briefing + health dimensions + this week
│       ├── MatchPage.jsx   ← countdown + 4 tabs (overview/squad/timeline/pack)
│       ├── ActionsPage.jsx ← 12 quick action buttons (3-col grid)
│       └── AlertsPage.jsx  ← filtered alert list with severity chips
```

---

## Data Layer

All API calls go through `src/api/client.js`:

```
/api/*      → Command Centre API    (localhost:3001)
/twin/*     → Digital Twin API      (localhost:3002)
/fixtures/* → Fixture Engine API    (localhost:3003)
/season/*   → Fixture Engine API    (localhost:3003)
```

Every call has a 10-second timeout and falls back to static `MOCK` data when the server is unreachable. `useMobileData` adds a 60-second in-memory cache layer on top.

---

## Screens

### Home (`/`)
Six large metric cards in a 2-column grid:
1. Today's Training — days to next match
2. Next Match — opponent + date
3. Club Health — score + grade
4. Players — registered count
5. Alerts — critical count with red badge
6. AI Assistant — recommendation count

Plus a recommendations strip at the bottom.

### Today (`/today`)
- AI briefing summary from Digital Twin
- Club health dimension progress bars
- Upcoming fixtures this week
- Critical + high alerts

### Match (`/match`)
- Fixture selector (up to 5 upcoming)
- SVG countdown ring (days urgency-coloured: green→purple→amber→red)
- Preparation progress bar (from timeline tasks)
- 4 tabs: Overview / Squad / Timeline / Pack
- Pack tab can generate match pack on demand

### Actions (`/actions`)
12 one-tap quick actions in a 3×4 grid. Each calls the Action Library via `/api/actions/run`. Result toast appears inline.

### Alerts (`/alerts`)
Full alert list aggregated from Injury Engine + Risk Register. Filterable by: ALL / CRITICAL / HIGH / MEDIUM. Badge count on bottom nav tab.

---

## AI Command Bar

Present on every screen as a frosted-glass pill at the top. Tap to expand to full-screen overlay with:
- Free-text input → calls `/twin/ask` then `/api/actions/resolve`
- 8 suggestion prompts (examples)
- Result displayed inline
- History stored in hook state (last 20)

---

## PWA Features

- `display: standalone` — runs without browser chrome
- `viewport-fit=cover` — safe area padding on iOS notch/home indicator
- `apple-mobile-web-app-capable` — home screen installation
- `apple-mobile-web-app-status-bar-style: black-translucent` — status bar blends with dark background
- Frosted glass bottom nav uses `backdrop-filter: blur(20px)`
- All animations defined in Tailwind config: fadeIn, slideUp, scaleIn, shimmer, cmdOpen

---

## Design Tokens (Tailwind)

```
surface-0: #09090E    surface-1: #0D0F17
surface-2: #141620    surface-3: #1C1E2A    surface-4: #232637
ink-1: #F0F1FA        ink-2: #A0A4BC        ink-3: #52566E
accent: #6366F1       success: #22C55E      warning: #F59E0B
danger: #EF4444       border-subtle: rgba(255,255,255,0.07)
```

---

## Running

```bash
# from repo root
npm run mobile:dev     # starts Vite on port 5174

# or directly
cd app/mobile
npm install
npm run dev
```

Build verification: `npm run build` (produces ~195KB JS + ~21KB CSS gzipped).
