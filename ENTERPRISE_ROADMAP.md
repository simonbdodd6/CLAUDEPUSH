# Coach's Eye — Enterprise Platform Roadmap

## Where We Are

The platform has been built bottom-up, layer by layer, entirely on the `feature/nightly-qa-agent` branch. Nothing touches production until validated here.

```
BUILT ✓  Platform Integration Layer    — 10 engines unified behind one orchestrator
BUILT ✓  Action Library               — 51 production-ready actions, 6 categories
BUILT ✓  Coach's Eye Command Centre   — React SPA visual operating system (51 actions)
BUILT ✓  Club Digital Twin            — Central model, 8-dimension health, risk register
```

---

## Platform Architecture (Current)

```
┌────────────────────────────────────────────────────────────────┐
│  CLIENT LAYER                                                   │
│  Command Centre (React SPA, port 5173)                         │
│  Future: Mobile App  ·  Committee Portal  ·  Parent Portal     │
└──────────────────────────────┬─────────────────────────────────┘
                               │
┌──────────────────────────────▼─────────────────────────────────┐
│  DIGITAL TWIN LAYER  (port 3002)                                │
│  Club Model  ·  Health Score  ·  Risk Register                  │
│  Trends  ·  Predictions  ·  Summaries                          │
└──────────────────────────────┬─────────────────────────────────┘
                               │
┌──────────────────────────────▼─────────────────────────────────┐
│  API BRIDGE  (port 3001)                                        │
│  app/api-server.js — 14 endpoints                               │
└──────────────────────────────┬─────────────────────────────────┘
                               │
┌──────────────────────────────▼─────────────────────────────────┐
│  PLATFORM INTEGRATION LAYER                                     │
│  Memory · Coaching · Player Dev · Knowledge · Communications    │
│  Workflow · Club Intelligence · Executive Dashboard             │
│  AI Copilot · Data Integration                                  │
└────────────────────────────────────────────────────────────────┘
```

---

## Milestone Roadmap

Each milestone is self-contained, testable, and can ship independently.

---

### MILESTONE 5 — Fixture & Results Engine

**What:** Add live fixture management to the Digital Twin.

**Why now:** Teams, health scores, and risk detection all have empty `fixtures` and `results` arrays. This is the most visible data gap. The DoR and head coaches ask about upcoming fixtures constantly.

**Scope:**
- `fixture-engine/` — CRUD for fixtures, results, league tables
- Fixture data feeds into team health score
- `SQUAD_DEPTH` risk becomes matchday-aware
- Command Centre: fixtures widget on Dashboard
- Digital Twin: `teams[].fixtures[]` and `leaguePosition` populated

**Outcome:** Club health score incorporates match performance. Risk engine can warn "3 days to next match, only 9 fit players."

---

### MILESTONE 6 — Mobile Shortcut Layer

**What:** PWA / React Native companion for on-pitch use.

**Why now:** The Command Centre is a desktop tool. Coaches are on pitches, not at desks. The 12 most-used quick actions, injury reports, attendance marks, and the ⌘K command bar need to work on a phone in a muddy field.

**Scope:**
- React Native or PWA wrapper of Command Centre core flows
- Offline-tolerant API calls (service worker / local queue)
- Home screen: 6 large quick-action buttons
- Quick injury logging
- Quick attendance marking
- Digital Twin health widget

**Outcome:** Platform becomes genuinely usable on match day. Replaces WhatsApp groups for real-time squad management.

---

### MILESTONE 7 — Finance Engine

**What:** Replace the `_placeholder: true` Finance block in the Digital Twin.

**Why now:** The committee cares about three things: health of the club, health of the players, and health of the bank account. The Digital Twin has two of three.

**Scope:**
- `finance-engine/` — membership fees, sponsorship income, venue costs, equipment
- Monthly P&L snapshot
- Finance dimension added to Club Health Score (weight: 10%, redistributed from others)
- Committee Portal: Finance tab
- Board report includes financial summary
- Risk: `LOW_CASH_RESERVE`, `SPONSORSHIP_CLIFF`

**Outcome:** Club health score becomes truly comprehensive. Board reports are complete.

---

### MILESTONE 8 — Multi-Club Platform (Enterprise)

**What:** The platform manages multiple clubs from a single interface.

**Why now:** Single-club operation is the proof of concept. The entire architecture (Digital Twin as primary object, platform as read-only aggregation layer) was designed to be multi-tenant from day one.

**Scope:**
- Club selector in Command Centre sidebar
- Per-club Digital Twin instances
- Cross-club benchmarking (anonymised health score comparison)
- Shared knowledge base (with club-private partition)
- Admin portal: club onboarding, billing, user management
- Role isolation: coach at Club A cannot see Club B

**Outcome:** Platform becomes a SaaS product. Revenue model unlocked.

---

### MILESTONE 9 — Parent & Player Portal

**What:** A simplified view for players and parents.

**Why now:** Coaches spend significant time answering "is training on?" questions. A self-service portal reduces noise and increases engagement.

**Scope:**
- Player: see own development score, attendance, upcoming fixtures, injury status
- Parent: child's profile, training schedule, club announcements, RSVP to events
- Read-only access to Digital Twin data relevant to their child/team
- Push notifications for training reminders and score updates

**Outcome:** Communication workload for coaches drops. Engagement increases. Membership retention improves.

---

### MILESTONE 10 — Predictive Transfer Market & Recruitment

**What:** The AI Copilot identifies players to recruit or lose.

**Why now:** The Player Development Engine already tracks development trends, retention risk, and injury risk. Adding recruitment intelligence closes the player acquisition loop.

**Scope:**
- `recruitment-engine/` — build player profiles from public data (with permission)
- Digital Twin: `players.recruitmentTargets[]`
- Action: `players.identify_recruits` — AI surfaces suitable players for age groups with gaps
- Action: `players.retain_at_risk` — prioritised contact list for coaches
- Risk: `SQUAD_DEPTH_LONG_TERM` — projects squad gaps 6 months ahead

**Outcome:** Club proactively manages squad composition rather than reacting to departures.

---

## Recommended Single Highest-Value Milestone

**MILESTONE 5 — Fixture & Results Engine**

Every other feature in this roadmap would benefit from live fixture data. The health score, risk engine, squad depth detection, and morning briefing all currently have blank `fixtures` fields. Adding fixtures:

1. **Completes the Digital Twin model** — teams go from abstract objects to match-playing entities
2. **Makes the health score tactically actionable** — "3 days to next match" changes the urgency of every injury and availability risk
3. **Unblocks the mobile shortcut layer** — the most valuable mobile feature is "who's available for Saturday"
4. **Demonstrates tangible real-world value** — every club administrator's first question is "when do we play and who's available?"

The fixture engine can be built in a single session using the same architecture patterns already established.

---

## Technology Evolution Path

```
Phase 1 (Now)     — Node.js + ESM + file-based persistence (no database)
Phase 2 (Scale)   — Migrate to PostgreSQL, keep same API contracts
Phase 3 (Cloud)   — Deploy to Railway / Render, add auth (Clerk or Supabase)
Phase 4 (Growth)  — Multi-region, real-time subscriptions (WebSocket layer over Digital Twin)
```

The Digital Twin's append-only JSONL snapshot model is already compatible with Phase 2 migration — replace file I/O with DB writes, keep all consumers unchanged.

---

## Guiding Principles for All Future Milestones

1. **Club is always the primary object.** Every new feature enriches the Digital Twin; it does not bypass it.
2. **No logic duplication.** New engines expose APIs; the Digital Twin reads them.
3. **Graceful degradation.** The platform works at 10% data. Missing engines mean lower completeness score, not crashes.
4. **AI-augmented, not AI-dependent.** Every output has a deterministic fallback. AI adds narrative and insight; it does not own the data path.
5. **Branch discipline.** All development on `feature/nightly-qa-agent` until production-ready.
