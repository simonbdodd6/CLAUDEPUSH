# Coach's Eye Command Centre — UI Component Map

## Component Hierarchy

```
App (BrowserRouter)
└── CommandLayout
    ├── Sidebar
    │   ├── Logo mark
    │   ├── Search shortcut (→ CommandBar)
    │   └── NavLink × 5 (Home, Actions, Players, Comms, Reports)
    ├── TopBar
    │   ├── Page title
    │   ├── ⌘K shortcut button
    │   └── NotificationBell
    ├── CommandBar (overlay, conditional)
    │   ├── NL Input
    │   ├── Action Suggestions × n
    │   ├── "Ask AI" row
    │   └── Result Panel
    └── <Routes>
        ├── DashboardPage (/)
        │   ├── ClubHealthCard
        │   │   ├── HealthRing (SVG animated)
        │   │   └── DomainBar × 5
        │   ├── TodayPriorities
        │   │   └── PriorityRow × n
        │   ├── ApprovalsQueue
        │   │   └── ApprovalItem × n
        │   ├── QuickActions
        │   │   └── ActionButton × 12
        │   ├── InjuryAlerts
        │   │   └── InjuredPlayer × n
        │   ├── AttendanceAlerts
        │   │   └── AbsentPlayer × n
        │   ├── AIRecommendations
        │   │   └── RecommendationRow × n (with Run button)
        │   └── ActionHistoryFeed
        │       └── HistoryRow × n
        │
        ├── ActionsPage (/actions)
        │   ├── SearchInput
        │   ├── CategoryTabs × 7
        │   └── ActionCard × 51
        │       ├── Category badge
        │       ├── Engine pills
        │       └── Run button → useActionRunner
        │
        ├── PlayersPage (/players)
        │   ├── PlayerActionGrid × 7
        │   ├── InjuryAlerts (shared)
        │   ├── AttendanceAlerts (shared)
        │   └── ResultPanel (conditional)
        │
        ├── CommunicationsPage (/communications)
        │   ├── CommunicationActionGrid × 10
        │   └── DraftQueue (live results)
        │
        └── ReportsPage (/reports)
            ├── ReportCard × 12
            └── ResultViewer (sticky panel)
```

---

## UI Primitives

| Component | File | Props | Usage |
|---|---|---|---|
| `Card` | `ui/Card.jsx` | `hoverable`, `onClick` | All widget containers |
| `CardHeader` | `ui/Card.jsx` | `title`, `action`, `icon` | Widget headers |
| `Button` | `ui/Button.jsx` | `variant` (primary/ghost/surface/danger), `size` | All interactive buttons |
| `Badge` | `ui/Badge.jsx` | `variant` (accent/success/warning/danger/neutral) | Status labels |
| `Spinner` | `ui/Spinner.jsx` | `size` | Loading states |
| `SkeletonBlock` | `ui/Spinner.jsx` | `className` | Loading placeholders |
| `SkeletonCard` | `ui/Spinner.jsx` | — | Full card loading |
| `EmptyState` | `ui/EmptyState.jsx` | `icon`, `title`, `description`, `action` | Zero-data states |

---

## Dashboard Widgets

| Widget | Data Source | Engine(s) | Refresh |
|---|---|---|---|
| `ClubHealthCard` | `useClubHealth()` → `/api/club/health` | Club Intelligence | On mount |
| `TodayPriorities` | Derived from health data + static rules | Memory Engine | On mount |
| `ApprovalsQueue` | `useApprovals()` → `/api/approvals` | Workflow Engine | On mount |
| `QuickActions` | Static manifest (12 most-used) | All (via action runner) | On click |
| `InjuryAlerts` | `useInjuries()` → `/api/alerts/injuries` | Knowledge Engine | On mount |
| `AttendanceAlerts` | `useAttendance()` → `/api/alerts/attendance` | Knowledge Engine | On mount |
| `AIRecommendations` | `useRecommendations()` → `/api/recommendations` | Club Intelligence | On mount |
| `ActionHistoryFeed` | `useHistory()` → `/api/history` | Action Library | On mount |

---

## State Architecture

All state is managed with React hooks — no external state management library.

| Hook | Location | Manages |
|---|---|---|
| `useClubData` | `hooks/useClubData.js` | All dashboard data: health, injuries, attendance, recs, history, approvals |
| `useActions` | `hooks/useActions.js` | Action list, search filtering, category grouping |
| `useActionRunner` | `hooks/useActions.js` | Action execution: running state, result, error |
| `useCommandBar` | `hooks/useCommandBar.js` | Open/close state + ⌘K keyboard shortcut |

Each `useData()` call follows the pattern:
```js
{ data, loading, error, reload }
```

---

## Loading States

| Context | Component | Behaviour |
|---|---|---|
| Widget loading | `SkeletonCard` | Pulse animation placeholder |
| Action running | `Spinner` inline | Replace icon while executing |
| Command bar running | `Spinner` in search icon | Replaces search magnifier |
| Page navigation | `animate-fade-in` | 150ms CSS opacity transition |

---

## Empty States

Every data-driven widget has an `EmptyState` component with:
- Relevant emoji icon
- Clear title ("No active injuries")
- Helpful description
- Optional action button

---

## Responsive Breakpoints

| Breakpoint | Layout |
|---|---|
| `< lg` (< 1024px) | Single-column stacked |
| `lg` (≥ 1024px) | Dashboard: 3-col top row, 2-col bottom |
| `xl` (≥ 1280px) | Actions: 3-col grid |

Sidebar is fixed at 220px. Main content has `ml-[220px]`.

---

## Animations

| Animation | Class | Duration | Trigger |
|---|---|---|---|
| Page fade | `animate-fade-in` | 150ms | Route change |
| Slide up | `animate-slide-up` | 200ms | Result reveal |
| Command bar open | `slideIn` keyframe | 200ms cubic-bezier | ⌘K press |
| Health ring | CSS transition `stroke-dashoffset` | 1.2s spring | Mount |
| Card hover | `translate-y-[-1px]` | 150ms | Hover |
| Button press | `scale-[0.97]` | 100ms | Active |
| Notification | `slideFromRight` keyframe | 300ms | New notification |
