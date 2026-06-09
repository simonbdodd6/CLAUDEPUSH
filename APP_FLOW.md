# Coach's Eye Command Centre — App Flow

## Primary User Flows

---

### 1. Morning Startup Flow

```
Coach opens browser → http://localhost:5173
  │
  ├── React Router renders CommandLayout
  │     ├── Sidebar loads (navigation links)
  │     └── TopBar loads (title + ⌘K button)
  │
  └── DashboardPage mounts
        │
        ├── useClubData() fires 6 parallel fetch calls:
        │     ├── /api/club/health      → ClubHealthCard
        │     ├── /api/alerts/injuries  → InjuryAlerts
        │     ├── /api/alerts/attendance→ AttendanceAlerts
        │     ├── /api/recommendations  → AIRecommendations
        │     ├── /api/history          → ActionHistoryFeed
        │     └── /api/approvals        → ApprovalsQueue
        │
        ├── Each widget shows SkeletonCard while loading
        │
        └── Data arrives → widgets render:
              ├── Club Health Ring animates to score (1.2s spring)
              ├── Domain bars render (Training, Fitness, Comms, Admin, Finance)
              ├── Today's Priorities derive from health domains
              ├── Injury + Attendance alerts populate
              ├── AI Recommendations appear with Run buttons
              └── Approvals Queue shows pending items
```

---

### 2. Command Bar (⌘K) Flow

```
User presses ⌘K anywhere in the app
  │
  ├── useCommandBar sets isOpen = true
  ├── CommandBar overlay renders (cmd-overlay CSS)
  ├── Input field auto-focuses
  │
  ├── User types "Prepare Thursday's U14 training"
  │     │
  │     └── onChange → debounced resolveNL()
  │           → GET /api/actions/resolve?q=...
  │           → resolveFromNL() scores all 51 actions
  │           → Returns { action: coaching.training_session, confidence: 0.72 }
  │           → Action suggestion appears highlighted at top
  │
  ├── User presses Enter (or clicks suggestion)
  │     │
  │     └── POST /api/nl { text, role: 'admin' }
  │           → api-server routes to runFromNL()
  │           → action-runner resolves → coaching.training_session
  │           → Platform Orchestrator executes training_prepare pipeline
  │           → Knowledge Engine + Coaching Engine run
  │           → Result: { success: true, summary: "...", evidence: [...] }
  │
  ├── CommandBar shows result:
  │     ├── ✓ icon + action name
  │     ├── Summary text
  │     └── Evidence list (first 4 items)
  │
  └── User presses Escape → overlay closes → state resets
```

**Command Bar quick prompts (shown when input is empty):**
```
"Prepare Thursday's U14 session"       → coaching.training_session
"Show injured players"                 → players.injury_report
"Create sponsor update"                → comms.sponsor_update
"Review this week's attendance"        → players.attendance_report
"Generate club health report"          → committee.club_health
"Write match report"                   → comms.match_report
"Run DOR weekly review"                → dor.weekly_review
"Check who needs to renew membership"  → ops.membership_renewals
"Generate committee briefing"          → committee.weekly_pack
"Schedule fitness assessment"          → coaching.fitness_assessment
```

---

### 3. Action Library Navigation Flow

```
User clicks "Actions" in Sidebar (or navigates to /actions)
  │
  ├── ActionsPage mounts
  │     └── useActions() → GET /api/actions → all 51 actions
  │
  ├── Page renders:
  │     ├── Search input (top)
  │     └── 7 category tabs: ALL · COACHING · PLAYERS · COMMUNICATIONS
  │                          DIRECTOR_OF_RUGBY · COMMITTEE · CLUB_OPERATIONS
  │
  ├── User clicks category tab
  │     └── Filtered grid of ActionCards for that category
  │
  ├── User types in search input
  │     └── useMemo filters by name, description, tags
  │           → Grid re-renders filtered actions
  │
  └── User clicks "Run" on an ActionCard
        │
        └── useActionRunner hook:
              ├── Sets state: running
              ├── POST /api/actions/run { actionId, params: {}, context: { role: 'admin' } }
              ├── API server → action-runner.run()
              ├── Action executes via Platform Integration Layer
              ├── Result arrives → state: done
              └── Result panel expands inline below card
                    ├── ✓ or ✕ status
                    ├── Summary text
                    └── Evidence list
```

---

### 4. Quick Actions Flow (Dashboard)

```
Dashboard QuickActions widget shows 12 most-used actions:
  ├── 🏉 Training Session    ├── 📋 Match Report
  ├── 🤕 Injury Report       ├── 📈 Attendance Report
  ├── 📰 Newsletter          ├── 📊 Club Health
  ├── 📬 Parent Email        ├── 🎓 Academy Review
  ├── ⚖️  Team Comparison    ├── 📦 Weekly Pack
  ├── 📱 Social Media Pack   └── 🙋 Volunteer Request

User clicks any button:
  ├── Button shows Spinner (loading state)
  ├── POST /api/actions/run fires immediately
  ├── Action resolves
  └── Result toast or inline panel appears
```

---

### 5. Approvals Flow

```
ApprovalsQueue widget on Dashboard shows pending items
  │
  ├── Each approval: title + requester + timestamp + Approve/Reject buttons
  │
  ├── User clicks "Approve"
  │     └── POST /api/approvals/:id/approve
  │           → Workflow Engine marks approved
  │           → Item removed from queue
  │           → Count badge on sidebar updates
  │
  └── User clicks "Reject"
        └── POST /api/approvals/:id/reject
              → Item removed from queue
```

---

### 6. AI Recommendations Flow

```
AIRecommendations widget shows 3-5 prioritised actions
generated by Club Intelligence Engine based on:
  ├── Club health score domains (low scores → prioritised)
  ├── Recent action history (avoid duplicates)
  ├── Time of week (Wednesday → training prep)
  └── Player alerts (injuries → recommend injury report)

User clicks "Run" on a recommendation:
  ├── Button shows Spinner
  ├── POST /api/actions/run { actionId from recommendation }
  ├── Action executes
  └── Result opens inline
```

---

### 7. Player Management Flow

```
User navigates to /players (sidebar "Players" link)
  │
  ├── PlayersPage mounts
  ├── InjuryAlerts and AttendanceAlerts fetch fresh data
  │
  ├── Player action grid (7 quick actions):
  │     ├── Player Profile    ├── Injury Report
  │     ├── Attendance Report ├── Fitness Assessment
  │     ├── Availability Poll ├── Player Stats
  │     └── Squad Selection
  │
  ├── User clicks action → runs via api.runAction()
  └── ResultPanel appears below grid with output
```

---

### 8. Communications Draft Flow

```
User navigates to /communications (sidebar "Comms" link)
  │
  ├── CommunicationsPage mounts
  │
  ├── 10 communication action buttons displayed
  │
  ├── User clicks "Newsletter"
  │     ├── Action button shows Spinner
  │     ├── POST /api/actions/run { actionId: 'comms.newsletter' }
  │     ├── Communications Engine generates draft
  │     └── Draft appears in right panel:
  │           ├── Summary preview (first 120 chars)
  │           ├── Edit button (open in text editor)
  │           └── Approve button (mark ready to send)
  │
  └── Draft Queue accumulates up to 10 items (newest first)
        └── Clear button empties queue
```

---

### 9. Reports Flow

```
User navigates to /reports (sidebar "Reports" link)
  │
  ├── ReportsPage mounts
  │   12 report cards in 2-col grid
  │
  ├── User clicks "Generate" on any card
  │     ├── Card shows Spinner while generating
  │     ├── POST /api/actions/run fires
  │     ├── Result stored in local state { [actionId]: result }
  │     └── "View" button appears on card (✓ indicator)
  │
  └── Report output appears in sticky right panel:
        ├── Success/fail indicator
        ├── Full summary text (scrollable, max-h-80)
        └── Evidence list (up to 5 items)
```

---

## Navigation Map

```
/               Dashboard (Home)
/actions        All 51 Actions (searchable + filterable)
/players        Player Management
/communications Communications Hub
/reports        Reports & Analytics
```

All routes share the same `CommandLayout` shell (sidebar + topbar). `CommandBar` is a floating overlay, available on every route via ⌘K.

---

## Error Handling Flow

```
API call fails (network error, server down, timeout)
  │
  ├── api/client.js safeFetch() catches the error
  ├── Falls back to MOCK data if mockKey provided
  │     → Dashboard loads with sample data
  │     → No blank screens shown to user
  │
  └── For action execution failures:
        ├── Component shows error state
        ├── Error message displayed to user
        └── "Retry" option appears
```

---

## State Reset on Route Change

All page-level state is local to each page component. Navigating away unmounts the page and clears:
- Running states (any in-flight requests are abandoned)
- Result panels
- Search filters / active category tabs

The only persistent state is the `CommandBar` overlay (global, survives navigation).
