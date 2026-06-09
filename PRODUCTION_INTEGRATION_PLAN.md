# Production Integration Plan

**Date:** June 2026  
**Rule:** Every change enhances an existing component. Nothing is replaced. Nothing is duplicated.

---

## What This Document Is

A file-by-file, component-by-component specification of exactly which production files need to change, what the change is, and which AI engine provides the data. No new pages. No new architecture. Eight backend endpoints and ten component updates.

---

## Current State (What Exists and What Is Wired)

| Component | Currently reads from | Problem |
|-----------|---------------------|---------|
| `TodayPriorities.jsx` | `DEMO_PRIORITIES` (hardcoded, line 6) | Never updates. Not real. |
| `AIRecommendations.jsx` | `/api/recommendations` → `club-intelligence` | No Accept/Snooze/Dismiss. Learning Engine never learns. |
| `ClubHealthCard.jsx` | `/api/club/health` → `club-intelligence` | Generic health score. Not phase-calibrated. |
| `ApprovalsQueue.jsx` | `/api/approvals` | Approve/Reject buttons fire nothing. |
| `DashboardPage.jsx` briefing text | Removed — not currently shown | Morning briefing from Autonomous Assistant absent. |
| `TodayPage.jsx` (mobile) | `briefing.summary` from `dashboard/index.js` | Briefing is disconnected from Autonomous Assistant. |
| `useMobileData.js` | No season phase fetch | Phase context absent from mobile entirely. |
| Sidebar nav | 5 fixed routes | No Fixtures page. Fixture Engine is connected to mobile but not desktop. |

---

## Part 1 — Backend Changes (`app/api-server.js`)

Eight endpoints. Four are replacements of existing calls. Four are new.

---

### 1A. Replace `/api/recommendations` — wire to Autonomous Assistant

**Current (line 144–150):**
```js
if (method === 'GET' && path === '/api/recommendations') {
  const { getRecommendations } = await import('../qa/club-intelligence/index.js')
  const recs = await getRecommendations().catch(() => [])
  json(res, { recommendations: recs.slice(0, 6) })
  return
}
```

**Replace with:**
```js
if (method === 'GET' && path === '/api/recommendations') {
  const { getActiveRecommendations } = await import('../autonomous-assistant/index.js')
  const recs = await getActiveRecommendations().catch(() => [])
  // Normalise to the shape AIRecommendations.jsx already consumes
  const out = recs.slice(0, 6).map(r => ({
    id:          r.id,
    action:      r.title ?? r.recommendation,
    why:         r.reason,
    effort:      r.urgency === 'CRITICAL' ? 'high' : r.urgency === 'HIGH' ? 'high' : r.urgency === 'MEDIUM' ? 'medium' : 'low',
    priority:    r.priority ?? 1,
    type:        r.type,
    confidence:  r.confidence,
    tier:        r.tier,           // AUTO / APPROVE / HUMAN
    actions:     r.actions ?? [],  // one-tap action ids
  }))
  json(res, { recommendations: out })
  return
}
```

**Why:** The current endpoint returns generic `club-intelligence` suggestions that never update. The Autonomous Assistant runs 8 detectors against live observations and ranks by urgency × impact × confidence. Every recommendation now has a `tier` (AUTO/APPROVE/HUMAN) and `confidence` score that the UI will display.

---

### 1B. Add three recommendation decision endpoints

**Add after the GET recommendations block:**
```js
// POST /api/recommendations/:id/accept
const acceptMatch = method === 'POST' && path.match(/^\/api\/recommendations\/([^/]+)\/accept$/)
if (acceptMatch) {
  const id   = acceptMatch[1]
  const body = await readBody(req)
  const { resolve }       = await import('../autonomous-assistant/index.js')
  const { recordOutcome } = await import('../learning-engine/index.js')
  const rec = await resolve(id).catch(() => null)
  if (rec) recordOutcome({
    recommendationId:   id,
    recommendationType: rec.type,
    coachDecision:      'ACCEPTED',
    confidenceAtTime:   rec.confidence,
    actionTaken:        body.actionTaken ?? null,
    predictionCorrect:  body.predictionCorrect ?? null,
  })
  json(res, { ok: true })
  return
}

// POST /api/recommendations/:id/snooze
const snoozeMatch = method === 'POST' && path.match(/^\/api\/recommendations\/([^/]+)\/snooze$/)
if (snoozeMatch) {
  const id   = snoozeMatch[1]
  const body = await readBody(req)
  const { snooze }        = await import('../autonomous-assistant/index.js')
  const { recordOutcome } = await import('../learning-engine/index.js')
  await snooze(id, body.hours ?? 24).catch(() => {})
  recordOutcome({ recommendationId: id, coachDecision: 'SNOOZED', confidenceAtTime: body.confidence })
  json(res, { ok: true })
  return
}

// POST /api/recommendations/:id/dismiss
const dismissMatch = method === 'POST' && path.match(/^\/api\/recommendations\/([^/]+)\/dismiss$/)
if (dismissMatch) {
  const id   = dismissMatch[1]
  const body = await readBody(req)
  const { dismiss }       = await import('../autonomous-assistant/index.js')
  const { recordOutcome } = await import('../learning-engine/index.js')
  await dismiss(id).catch(() => {})
  recordOutcome({ recommendationId: id, coachDecision: 'REJECTED', confidenceAtTime: body.confidence })
  json(res, { ok: true })
  return
}
```

**Why:** These three endpoints close the Learning Engine feedback loop. Every coach decision now flows to `learning-engine/outcome-tracker.js`. The platform starts improving immediately.

---

### 1C. Replace `/api/dashboard/briefing` — wire to Autonomous Assistant

**Current (line 170–175):**
```js
if (method === 'GET' && path === '/api/dashboard/briefing') {
  const role = url.searchParams.get('role') ?? 'coach'
  const { buildMorningBriefing } = await import('../dashboard/index.js')
  const briefing = await buildMorningBriefing(role).catch(() => ({ isMock: true, headline: 'Briefing unavailable' }))
  json(res, briefing)
  return
}
```

**Replace with:**
```js
if (method === 'GET' && path === '/api/dashboard/briefing') {
  const { runMorningBriefing } = await import('../autonomous-assistant/index.js')
  const briefing = await runMorningBriefing().catch(() => null)
  if (!briefing) {
    // Graceful fallback — old dashboard engine if assistant fails
    const { buildMorningBriefing } = await import('../dashboard/index.js')
    const fallback = await buildMorningBriefing('coach').catch(() => ({ isMock: true, headline: 'Briefing unavailable' }))
    json(res, fallback)
    return
  }
  // Normalise to shape TodayPage.jsx and TodayPriorities.jsx already consume
  json(res, {
    summary:    briefing.headline,
    priorities: briefing.recommendations?.slice(0, 5).map(r => ({
      text:     r.title ?? r.recommendation,
      urgency:  (r.urgency ?? 'MEDIUM').toLowerCase(),
      tag:      r.type?.replace(/_/g,' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
      id:       r.id,
      tier:     r.tier,
    })) ?? [],
    stats: {
      nextFixture:       briefing.nextFixture,
      injuryCount:       briefing.injuryCount ?? 0,
      attendanceTrend:   briefing.attendanceTrend,
      recommendationCount: briefing.recommendations?.length ?? 0,
      criticalCount:     briefing.recommendations?.filter(r => r.urgency === 'CRITICAL').length ?? 0,
    },
  })
  return
}
```

**Why:** `TodayPriorities.jsx` has `DEMO_PRIORITIES` hardcoded. This replacement feeds it real data through the existing `/api/dashboard/briefing` call that `useMobileData` already makes. No component import changes needed — just the data shape changes.

---

### 1D. Replace `/api/club/health` — wire to Season Intelligence

**Current (line 110–118):**
```js
if (method === 'GET' && path === '/api/club/health') {
  const { getClubHealth, getInsights } = await import('../qa/club-intelligence/index.js')
  ...
}
```

**Replace with:**
```js
if (method === 'GET' && path === '/api/club/health') {
  const { buildClubHealthScore, detectCurrentPhase } = await import('../season-intelligence/index.js')
  const phase = detectCurrentPhase()
  const score = await buildClubHealthScore(
    [{ id: 'seniors', name: 'Senior Squad' }],
    {},        // observations — will use MOCK until memory-engine wired
    new Date()
  ).catch(() => null)

  if (!score) {
    // Fallback to old engine
    const { getClubHealth, getInsights } = await import('../qa/club-intelligence/index.js')
    const [health, insights] = await Promise.all([
      getClubHealth().catch(() => ({ overallScore: 52, trend: 'stable', isMock: true })),
      getInsights().catch(() => []),
    ])
    json(res, { health, insights, phase: { label: phase.label, id: phase.id } })
    return
  }

  // Normalise to the shape ClubHealthCard.jsx already consumes
  json(res, {
    health: {
      overallScore: score.overall,
      trend:        score.trend ?? 'stable',
      grade:        score.grade,
      domains: {
        players:        score.dimensions?.availability?.score    ?? 75,
        attendance:     score.dimensions?.attendance?.score      ?? 68,
        injuries:       score.dimensions?.injuryBurden?.score    ?? 70,
        communications: score.dimensions?.communicationHealth?.score ?? 60,
        volunteers:     score.dimensions?.volunteerSupport?.score ?? 65,
        coaches:        score.dimensions?.squadContinuity?.score ?? 72,
        finance:        score.clubDimensions?.finance?.score     ?? 70,
        sponsors:       80,
      },
      phase:       { label: phase.label, id: phase.id, week: phase.week },
      weakDimensions: score.weakDimensions ?? [],
    },
    insights: score.notes ?? [],
  })
  return
}
```

**Why:** `ClubHealthCard.jsx` already renders `health.domains` as bars. This change adds real phase-calibrated scoring without touching the component. The `phase` object in the response enables the new phase chip (see Part 2B).

---

### 1E. Add `/api/season/phase` — new endpoint

```js
if (method === 'GET' && path === '/api/season/phase') {
  const { detectCurrentPhase, getPrescription, getSeasonLabel, getSeasonWeek, getPhaseProgress } = await import('../season-intelligence/index.js')
  const phase       = detectCurrentPhase()
  const prescription = getPrescription(phase.id)
  json(res, {
    phase: {
      id:           phase.id,
      label:        phase.label,
      description:  phase.description,
      season:       getSeasonLabel(),
      week:         getSeasonWeek(),
      progress:     getPhaseProgress(),
      daysUntilNext: phase.daysUntilNext,
    },
    targets: {
      attendanceTarget:    prescription.attendanceExpectation.target,
      intensityTarget:     prescription.intensity.target,
      sessionsPerWeek:     prescription.workload.sessionsPerWeek.target,
      trainingEmphasis:    prescription.trainingEmphasis.slice(0, 3),
    },
  })
  return
}
```

**Why:** This feeds the new phase chip in `ClubHealthCard` and `TodayPriorities` without changing any existing data flows.

---

### 1F. Add `/api/fixtures/upcoming` proxy

The mobile app calls `fixtures.upcoming()` at port 3003 directly. The Command Centre has no fixture awareness. Add a proxy:

```js
if (method === 'GET' && path === '/api/fixtures/upcoming') {
  const limit = parseInt(url.searchParams.get('limit') ?? '5', 10)
  const { listUpcomingFixtures } = await import('../fixture-engine/index.js')
  const upcoming = await listUpcomingFixtures(limit).catch(() => [])
  json(res, upcoming)
  return
}

if (method === 'GET' && path.startsWith('/api/fixtures/') && !path.includes('/pack') && !path.includes('/timeline')) {
  const id = path.replace('/api/fixtures/', '')
  const { getFixture } = await import('../fixture-engine/index.js')
  const fixture = await getFixture(id).catch(() => null)
  if (!fixture) { err(res, 'Fixture not found', 404); return }
  json(res, fixture)
  return
}
```

**Why:** `DashboardPage` currently shows no fixture data. `TodayPriorities` has a hardcoded "U14 match report from Saturday outstanding" item. With this proxy, both pages can show real upcoming fixtures through the existing port 3001.

---

### 1G. Add `/api/comms/send` — Communications Engine entry point

```js
if (method === 'POST' && path === '/api/comms/send') {
  const body = await readBody(req)
  const { sendCommunication, previewCommunication } = await import('../communications-engine/index.js')
  const preview = body.preview === true
  const result = preview
    ? await previewCommunication(body).catch(e => ({ success: false, error: e.message }))
    : await sendCommunication(body).catch(e => ({ success: false, error: e.message }))
  json(res, result)
  return
}
```

**Why:** `CommunicationsPage.jsx` currently calls `api.runAction(action.id)` for every communication type. That routes through the action runner which adds latency and abstraction. A direct `/api/comms/send` call lets the Communications page eventually show real preview HTML, scheduled send times, and recipient counts — without changing the existing action runner for the rest of the app.

---

## Part 2 — Command Centre UI Changes

Ten component updates. Every one touches an existing component. No new files except one small hook addition.

---

### 2A. `TodayPriorities.jsx` — replace DEMO_PRIORITIES with live briefing

**Current problem:** Line 6 is `const DEMO_PRIORITIES = [...]` — hardcoded, never updates.

**File:** `app/command-centre/src/components/dashboard/TodayPriorities.jsx`

**Change:**

```jsx
// Remove DEMO_PRIORITIES array (lines 6-11) entirely.
// Change prop signature from { data } to { briefing }

export default function TodayPriorities({ briefing }) {
  // Use briefing.priorities from /api/dashboard/briefing
  // Fallback to empty array if briefing not loaded
  const priorities = briefing?.priorities ?? []

  return (
    <Card className="p-4">
      <CardHeader
        title="Today's Priorities"
        action={<span className="text-xs text-ink-3">
          {briefing?.stats?.criticalCount > 0
            ? <span className="text-danger font-medium">{briefing.stats.criticalCount} critical</span>
            : new Date().toLocaleDateString('en-IE', { weekday:'long', day:'numeric', month:'short' })
          }
        </span>}
      />
      {priorities.length === 0
        ? <EmptyState icon="✅" title="All clear" description="No priority items today" />
        : (
          <div className="space-y-2">
            {priorities.map((p, i) => (
              <div key={p.id ?? i} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-surface-3 transition-colors cursor-pointer group">
                <div className={`${URGENCY_DOT[p.urgency]} mt-1.5 flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-1 leading-tight">{p.text}</p>
                  <Badge variant="neutral" className="mt-1 text-[10px]">{p.tag}</Badge>
                </div>
                <Badge variant={URGENCY_BADGE[p.urgency ?? 'low']} className="flex-shrink-0 text-[10px] capitalize">
                  {p.urgency}
                </Badge>
              </div>
            ))}
          </div>
        )
      }
    </Card>
  )
}
```

**In `DashboardPage.jsx`:** Change line 49 from:
```jsx
<TodayPriorities data={health.data} />
```
to:
```jsx
<TodayPriorities briefing={briefing.data} />
```

Add `useBriefing` hook (alongside existing hooks at line 12):
```js
// In useClubData.js — add one line:
export function useBriefing(role = 'coach') { return useData(() => api.briefing(role), null) }
```

In `DashboardPage.jsx` line 17: `const briefing = useBriefing()`

**Impact:** Today's Priorities now shows the morning briefing from the Autonomous Assistant. 5 real priorities, ranked by urgency, updated every time the page loads.

---

### 2B. `ClubHealthCard.jsx` — add season phase chip

**File:** `app/command-centre/src/components/dashboard/ClubHealthCard.jsx`

**Add a `usePhaseBadge` inside the component.** No new hook file needed — add a `useEffect` that fetches `/api/season/phase`:

```jsx
// Add import at top:
import { useEffect, useState } from 'react'

// Add inside ClubHealthCard component, after const score line:
const [phase, setPhase] = useState(null)
useEffect(() => {
  fetch('/api/season/phase').then(r => r.json()).then(setPhase).catch(() => {})
}, [])
```

**Then in the render, replace the `CardHeader` block (line 88):**
```jsx
<CardHeader title="Club Health" action={
  <div className="flex items-center gap-2">
    {phase && (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium">
        {phase.phase.label}
      </span>
    )}
    <span className="text-[10px] text-ink-3">{health.trend === 'improving' ? '↑' : health.trend === 'declining' ? '↓' : '→'} {health.trend}</span>
    <Badge variant={label.variant}>{label.text}</Badge>
  </div>
} />
```

**Also add below the HealthRing, before the domain bars:**
```jsx
{phase && (
  <div className="mt-2 mb-3 text-[10px] text-ink-3 flex items-center gap-3">
    <span>Target attendance: <strong className="text-ink-2">{phase.targets.attendanceTarget}%</strong></span>
    <span>·</span>
    <span>Week <strong className="text-ink-2">{phase.phase.week}</strong> of season</span>
  </div>
)}
```

**Impact:** The health card now shows the current phase ("Off-Season", "Playoffs") and the phase-appropriate target. A coach seeing "Attendance: 68 / target 75%" knows exactly where they stand *for this phase*, not against a generic annual average.

---

### 2C. `AIRecommendations.jsx` — add Accept / Snooze / Dismiss

**File:** `app/command-centre/src/components/dashboard/AIRecommendations.jsx`

**Current problem:** The only interaction is "Run" (line 69) which fires `api.runNL(rec.action)` — a text command with no outcome tracking.

**Replace the component body** to support the three decision actions:

```jsx
// Replace the act() function (lines 16-26) with:
async function decide(rec, decision) {
  setRunning(i => ({ ...i, [rec.id ?? i]: decision }))
  try {
    const endpoint = decision === 'accept' ? 'accept' : decision === 'snooze' ? 'snooze' : 'dismiss'
    await api.post(`/api/recommendations/${rec.id}/${endpoint}`, {
      confidence: rec.confidence,
      hours: 24,  // default snooze
    })
    setDecided(prev => ({ ...prev, [rec.id]: decision }))
  } catch (e) {
    console.warn('Decision failed:', e.message)
  } finally {
    setRunning(i => ({ ...i, [rec.id]: null }))
  }
}
```

Add `const [decided, setDecided] = useState({})` alongside `running` and `results`.

Add `api.post` helper to `app/command-centre/src/api/client.js`:
```js
// Add to api object (line 52):
post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
```

**Replace the action row footer** in the recommendation card (lines 66-72):
```jsx
{decided[rec.id]
  ? (
    <span className={`text-xs flex-shrink-0 ${
      decided[rec.id] === 'accept' ? 'text-success' : 'text-ink-3'
    }`}>
      {decided[rec.id] === 'accept' ? '✓ Accepted' : decided[rec.id] === 'snooze' ? '⏱ Snoozed' : '✕ Dismissed'}
    </span>
  )
  : (
    <div className="flex gap-1 flex-shrink-0">
      {rec.tier !== 'AUTO' && (
        <Button variant="primary" size="sm" onClick={() => decide(rec, 'accept')}
          disabled={running[rec.id] != null} className="text-xs">
          {running[rec.id] === 'accept' ? <Spinner size={12} /> : 'Accept'}
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => decide(rec, 'snooze')}
        disabled={running[rec.id] != null} className="text-xs text-ink-3">
        Snooze
      </Button>
      <Button variant="ghost" size="sm" onClick={() => decide(rec, 'dismiss')}
        disabled={running[rec.id] != null} className="text-xs text-danger/70 hover:text-danger">
        ✕
      </Button>
    </div>
  )
}
```

**Also add a confidence/tier chip** before the effort badge (line 59, after `rec.action`):
```jsx
{rec.confidence != null && (
  <span className="text-[10px] text-ink-3">{rec.confidence}% confident</span>
)}
{rec.tier === 'AUTO' && (
  <Badge variant="success" className="text-[10px]">Auto</Badge>
)}
{rec.tier === 'HUMAN' && (
  <Badge variant="danger" className="text-[10px]">Review</Badge>
)}
```

**Impact:** Every coach decision now feeds the Learning Engine. Recommendations show confidence percentages. AUTO-tier items are marked green. The platform starts calibrating.

---

### 2D. `ApprovalsQueue.jsx` — wire the Approve / Reject buttons

**File:** `app/command-centre/src/components/dashboard/ApprovalsQueue.jsx`

**Current problem:** Lines 41-42 have Reject/Approve buttons that fire nothing.

**Add to component:**
```jsx
const [deciding, setDeciding] = useState(null)
const [resolved, setResolved] = useState(new Set())

async function decide(item, approved) {
  setDeciding(item.id ?? item.title)
  try {
    await api.post('/api/approvals/decide', { id: item.id, approved, type: item.type })
    setResolved(prev => new Set([...prev, item.id ?? item.title]))
  } catch (e) {
    console.warn('Approval failed:', e.message)
  } finally {
    setDeciding(null)
  }
}
```

**Replace buttons (lines 41-42):**
```jsx
{resolved.has(item.id ?? item.title)
  ? <span className="text-xs text-success">✓ Done</span>
  : (
    <>
      <Button variant="ghost" size="sm" onClick={() => decide(item, false)}
        disabled={deciding != null} className="text-xs text-danger hover:text-danger">
        {deciding === (item.id ?? item.title) ? <Spinner size={12} /> : 'Reject'}
      </Button>
      <Button variant="primary" size="sm" onClick={() => decide(item, true)}
        disabled={deciding != null} className="text-xs">
        Approve
      </Button>
    </>
  )
}
```

**Add to `api-server.js`:**
```js
if (method === 'POST' && path === '/api/approvals/decide') {
  const { id, approved, type } = await readBody(req)
  const { resolveRecommendation } = await import('../autonomous-assistant/index.js')
  await resolveRecommendation(id, { approved, type }).catch(() => {})
  json(res, { ok: true })
  return
}
```

**Impact:** The Approvals Queue stops being a display-only widget. Committee approvals route to the Autonomous Assistant's state store.

---

### 2E. `DashboardPage.jsx` — add fixture awareness to the header

**File:** `app/command-centre/src/pages/DashboardPage.jsx`

**Add a `useNextFixture` hook** to `useClubData.js`:
```js
export function useNextFixture() {
  return useData(() => api.get('/fixtures/upcoming?limit=1').then(r => Array.isArray(r) ? r[0] : null), null)
}
```

Add `const get = (path) => request(path)` to `client.js` api object.

**In `DashboardPage.jsx`, add after `const platform = usePlatformStatus()` (line 18):**
```jsx
const nextFixture = useNextFixture()
```

**Replace the page header block (lines 28-32) with:**
```jsx
<div className="mb-6 flex items-start justify-between gap-4">
  <div>
    <h1 className="text-2xl font-semibold text-ink-1">{greeting}</h1>
    <p className="text-sm text-ink-3 mt-0.5">{dateStr} · Coach's Eye Command Centre</p>
  </div>
  {nextFixture.data && (
    <div className="flex-shrink-0 text-right">
      <p className="text-xs text-ink-3">Next match</p>
      <p className="text-sm font-semibold text-ink-1">
        vs {nextFixture.data.opponent ?? 'TBD'}
      </p>
      <p className="text-xs text-accent">
        {nextFixture.data.daysToKickoff === 0 ? 'Today' :
         nextFixture.data.daysToKickoff === 1 ? 'Tomorrow' :
         `In ${nextFixture.data.daysToKickoff} days`}
      </p>
    </div>
  )}
</div>
```

**Impact:** Fixture context visible from the first second the dashboard loads. Coaches see "vs Clondalkin RFC — In 3 days" without navigating anywhere.

---

### 2F. `ReportsPage.jsx` — add Season Intelligence reports

**File:** `app/command-centre/src/pages/ReportsPage.jsx`

**Add two entries to `REPORT_ACTIONS` array (after line 20):**
```js
{ id: 'season.health_report',   label: 'Season Health',     icon: '📅', desc: 'Phase-calibrated club health',  cat: 'DIRECTOR_OF_RUGBY' },
{ id: 'season.simulation',      label: 'Season Forecast',   icon: '🔮', desc: '8-week current vs ideal',       cat: 'DIRECTOR_OF_RUGBY' },
```

**Add handler in `api-server.js`** (these become action IDs the action runner handles):
```js
// In action-registry.js — these would be registered as new actions
// For now, handle directly in api-server as a shortcut:
if (method === 'POST' && path === '/api/actions/run') {
  const body = await readBody(req)
  if (body.actionId === 'season.health_report') {
    const { buildClubHealthScore, detectCurrentPhase } = await import('../season-intelligence/index.js')
    const phase  = detectCurrentPhase()
    const health = await buildClubHealthScore([{id:'seniors',name:'Senior Squad'}], {}, new Date())
    json(res, {
      success: true,
      summary: `${phase.label} — Club Health ${health.overall}/100 (${health.grade})\n\nWeak dimensions: ${(health.weakDimensions ?? []).map(d=>d.dimension).join(', ') || 'None'}\n\n${(health.notes ?? []).join('\n')}`,
    })
    return
  }
  if (body.actionId === 'season.simulation') {
    const { runSimulation, getGapSummary } = await import('../season-intelligence/index.js')
    const sim  = await runSimulation({}, {}, new Date())
    const gaps = getGapSummary(sim)
    json(res, {
      success: true,
      summary: `Status: ${sim.overallStatus}\n\n${gaps.map(g=>`${g.label}: ${g.current}% now → ${g.expected}% expected (${g.trend})`).join('\n')}\n\nRecommendations:\n${(sim.interventions ?? []).slice(0,3).map(i=>`• ${i}`).join('\n')}`,
    })
    return
  }
  // ... rest of existing handler
}
```

**Impact:** Two new season-aware reports appear in the Reports page with no new routing, no new page, no new component. They use the existing report card and result viewer.

---

### 2G. `CommunicationsPage.jsx` — show draft preview with recipient count

**File:** `app/command-centre/src/pages/CommunicationsPage.jsx`

**Current problem:** `runAction()` returns a text summary. No preview of the actual message. No recipient count.

**In `runAction()` (line 26-36), add preview step:**
```js
async function runAction(action) {
  setRunning(action.id)
  try {
    // First get a preview (new endpoint)
    const preview = await api.post('/api/comms/send', {
      type: action.id.replace('comms.', ''),
      preview: true,
    }).catch(() => null)

    // Fall back to existing action runner
    const res = await api.runAction(action.id, {}, { role: 'admin' })

    setResults(prev => [{
      ...res,
      label: action.label,
      ts: new Date().toLocaleTimeString('en-IE'),
      preview: preview?.preview ?? null,
      recipientCount: preview?.recipientCount ?? null,
    }, ...prev].slice(0, 10))
  } catch (e) {
    setResults(prev => [{ success: false, summary: e.message, label: action.label, ts: new Date().toLocaleTimeString('en-IE') }, ...prev].slice(0, 10))
  } finally {
    setRunning(null)
  }
}
```

**In the draft card, add recipient count** (after the summary text, around line 92):
```jsx
{r.recipientCount != null && (
  <p className="text-[10px] text-ink-3 mt-1">
    {r.recipientCount} recipient{r.recipientCount !== 1 ? 's' : ''}
  </p>
)}
```

**Impact:** Communication drafts now show how many people will receive the message before the coach approves. No architecture change — one extra fetch per action.

---

### 2H. `PlayersPage.jsx` — surface Season Intelligence workload warnings

**File:** `app/command-centre/src/pages/PlayersPage.jsx`

**Add after the `InjuryAlerts` and `AttendanceAlerts` grid (line 70-72):**
```jsx
<WorkloadWarnings />
```

**New component (add to `PlayerAlerts.jsx` to avoid new files):**
```jsx
export function WorkloadWarnings() {
  const [warnings, setWarnings] = useState([])

  useEffect(() => {
    fetch('/api/season/workload-warnings')
      .then(r => r.json())
      .then(d => setWarnings(d.warnings ?? []))
      .catch(() => {})
  }, [])

  if (warnings.length === 0) return null

  return (
    <Card className="p-4">
      <CardHeader title="Workload Warnings" action={<span className="text-[10px] text-warning">Season Intelligence</span>} />
      <div className="space-y-2">
        {warnings.map((w, i) => (
          <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-warning/5 border border-warning/20">
            <span className="text-warning text-sm flex-shrink-0">⚠</span>
            <div>
              <p className="text-sm text-ink-1">{w.playerName}</p>
              <p className="text-xs text-ink-3">{w.reason}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
```

**Add to `api-server.js`:**
```js
if (method === 'GET' && path === '/api/season/workload-warnings') {
  const { playerWorkloadForecast } = await import('../season-intelligence/index.js')
  const forecast = await playerWorkloadForecast({}, {}).catch(() => ({ predictions: [] }))
  const warnings = forecast.predictions?.filter(p => p.type === 'WORKLOAD' || p.confidence > 60) ?? []
  json(res, { warnings: warnings.slice(0, 5).map(p => ({ playerName: p.title, reason: p.prediction })) })
  return
}
```

---

## Part 3 — Mobile UI Changes

Three updates. All in existing files.

---

### 3A. `useMobileData.js` — add season phase to parallel load

**File:** `app/mobile/src/hooks/useMobileData.js`

**In the `load()` function (line 31), add `phase` to the `Promise.all`:**
```js
const [health, brief, upcoming, status, recs, phase] = await Promise.all([
  cached('health',    () => twin.health()),
  cached('briefing',  () => api.briefing('coach')),
  cached('fixtures',  () => fixtures.upcoming(5)),
  cached('status',    () => twin.status()),
  cached('recs',      () => api.recommendations()),
  cached('phase',     () => fetch('/api/season/phase').then(r => r.json()).catch(() => null)),
])
setState(s => ({
  ...s,
  health,
  briefing:         brief ?? MOCK.briefing,
  upcomingFixtures: Array.isArray(upcoming) ? upcoming : [],
  twinStatus:       status ?? MOCK.twinStatus,
  recommendations:  Array.isArray(recs) ? recs : MOCK.recommendations,
  phase:            phase ?? null,           // ← new
  loading:          false,
  lastRefreshed:    Date.now(),
}))
```

Add `phase: null` to the initial state (line 22).

---

### 3B. `HomePage.jsx` (mobile) — replace "AI Assistant" card with Phase card

**File:** `app/mobile/src/pages/HomePage.jsx`

**The "AI Assistant" card (line 62-66) currently shows `recCount`.**

**Replace its `sub` line:**
```js
{
  icon: '📅', label: 'Season Phase', accent: '#6366F1',
  value: loading ? null : data.phase?.phase?.label?.split(' ')[0] ?? 'Season',
  sub: data.phase?.phase?.label ?? 'Loading phase…',
  badge: data.phase ? `Wk ${data.phase.phase.week}` : null,
  to: '/today',
},
```

**Why:** The "AI Assistant" card had placeholder text ("Ask me" / "Tap to start") that was not actionable. Season phase is immediately useful to a coach scanning their home screen. The AI command bar at the top already handles the "ask me" function.

---

### 3C. `TodayPage.jsx` (mobile) — surface Today's Priorities from briefing

**File:** `app/mobile/src/pages/TodayPage.jsx`

**The briefing section (lines 36-46) already shows `briefing.summary`.**

**After the briefing card, add a priorities list:**
```jsx
{briefing?.priorities?.length > 0 && (
  <Section title="Priorities">
    <div className="m-card divide-y divide-border-subtle">
      {briefing.priorities.slice(0, 4).map((p, i) => (
        <div key={p.id ?? i} className="px-4 py-3 flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            p.urgency === 'critical' || p.urgency === 'high' ? 'bg-danger' :
            p.urgency === 'medium' ? 'bg-warning' : 'bg-ink-3/30'
          }`} />
          <p className="text-sm text-ink-2 flex-1">{p.text}</p>
          <span className="text-[10px] text-ink-3 flex-shrink-0">{p.tag}</span>
        </div>
      ))}
    </div>
  </Section>
)}
```

**Why:** `TodayPage` already receives the `briefing` prop (line 14). This change adds 12 lines after the existing briefing card. No new fetch. No new prop.

---

## Part 4 — What NOT to Touch

These work. Leave them alone.

| Thing | Why to leave it |
|-------|----------------|
| `ActionsPage.jsx` | Fully functional. Action Library, search, categories all work. No AI integration needed here — actions already call the right engines. |
| `CommandBar.jsx` (both desktop and mobile) | NL command routing already wired through `/api/nl`. Adding more capabilities here means adding Orchestrator adapters (separate task). |
| `ActionHistoryFeed.jsx` | Shows history of executed actions. Wired correctly. No change needed. |
| `MatchPage.jsx` (mobile) | Match countdown, fixture selector, pack generation already wired to port 3003. Works. |
| `AlertsPage.jsx` (mobile) | Alert aggregation from injuries + risks. Works with mock fallback. |
| Mobile `BottomNav.jsx` | Navigation correct. |
| Mobile `MobileLayout.jsx` | Layout + safe area correct. |
| `Badge.jsx`, `Button.jsx`, `Card.jsx`, `Spinner.jsx` | UI primitives. Perfect. Don't touch. |
| All of `app/mobile/src/api/client.js` from line 104 onwards | Twin and fixture API calls correct. |

---

## Part 5 — MVP vs Enterprise

### Included in MVP (everything in Parts 1-3 above)

All 8 backend endpoints and 10 component updates above are MVP. None require auth, billing, or a database. They connect existing engines to existing components. Total estimate: **3–4 working days** for one developer.

### Enterprise-Only (do not build until V2)

| Feature | Why Enterprise | What it needs |
|---------|---------------|---------------|
| Recommendation outcome tracking with notes | Requires coach to enter what happened after accepting. Needs UX thought, not just a button. | A follow-up modal with free text — post-MVP UX work |
| Club Intelligence Score in dashboard | Only meaningful after 3+ months of outcome data. Showing "CIS: 20/100 (Cold Start)" to a new user is discouraging. | Time — gate behind "You've been using Coach's Eye for 90+ days" |
| Season simulation chart | Requires a charting library (Chart.js / Recharts) — adds bundle weight. Desktop-first feature. | Chart library + data visualisation work |
| Predictive model alerts ("Attendance dip predicted in 3 weeks") | Fine to include eventually but needs a notification infrastructure | Push notification system + user preferences |
| Multi-team health comparison | Needs real multi-team data. Currently one club = one mock team. | Real data layer |
| Communications delivery (real email/SMS) | SendGrid/Twilio integration. GDPR consent flows. Unsubscribe. | Provider setup, compliance work |
| Automated recurring sends | Needs background scheduler with persistence | `node-cron` + database for schedule state |
| Board/AGM pack export (PDF) | Needs a PDF renderer (Puppeteer / wkhtmltopdf) | Headless browser or cloud PDF service |
| Player portal (availability confirmation) | Separate product surface. Players need their own login. | Auth system, player-facing UI |

---

## Execution Order

If one developer does this in sequence:

| Day | Tasks |
|-----|-------|
| **Day 1 AM** | 1A (replace recommendations endpoint) + 1C (replace briefing endpoint) |
| **Day 1 PM** | 2A (TodayPriorities live data) + 2C (Recommendations Accept/Snooze/Dismiss buttons) |
| **Day 2 AM** | 1B (three decision endpoints) — this closes the Learning Engine loop |
| **Day 2 PM** | 1D (club health → Season Intelligence) + 2B (phase chip in ClubHealthCard) |
| **Day 3 AM** | 1E (season/phase endpoint) + 2E (fixture in dashboard header) + 1F (fixture proxy) |
| **Day 3 PM** | 3A-3C (three mobile changes — all in existing files, 30 lines total) |
| **Day 4 AM** | 2D (ApprovalsQueue wire) + 1G (comms/send) + 2G (preview in Communications) |
| **Day 4 PM** | 2F (season reports) + 2H (workload warnings in Players) + testing |

After Day 4, the platform has:
- Real morning briefing from Autonomous Assistant
- Real, ranked recommendations with decisions that feed the Learning Engine  
- Phase-calibrated club health score with phase chip
- Fixture awareness on desktop dashboard
- Season phase context in mobile
- A complete feedback loop that makes recommendations more accurate over time

Everything else in this codebase — the action runner, the 51 actions, the knowledge engine Q&A, the digital twin, the fixture match packs — already works. This plan doesn't touch any of it.
