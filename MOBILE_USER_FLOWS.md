# Mobile Command Layer — User Flows

**Version:** 1.0

---

## Flow 1: Morning Briefing

**Trigger:** Coach opens app first thing in the morning

1. App loads → `useMobileData` fires parallel requests to `/twin/health`, `/api/dashboard/briefing`, `/fixtures/upcoming`, `/twin/status`, `/api/recommendations`
2. Home screen renders with 6 metric cards while loading (skeleton state)
3. Cards populate: Club Health 78/100, next match in 3 days vs Rathcoole, 2 alerts
4. Coach taps **Today** tab
5. AI briefing summary shown: "Club health 78/100. U16 Red attendance down. Volunteer gap Saturday."
6. Health dimension bars render (Attendance 72, Availability 88, Membership 80, Coach Activity 65)
7. Coach notes upcoming fixtures strip — Saturday match highlighted
8. Coach taps BottomNav **Alerts** → sees 2 HIGH alerts
9. Coach taps the First Aider alert → (future: links to volunteer management)

**Outcome:** Coach is fully briefed in under 60 seconds.

---

## Flow 2: Match Preparation

**Trigger:** Match is 3 days away

1. Coach taps **Match** tab in bottom nav
2. Countdown ring shows "3 DAYS" in accent purple
3. Preparation bar shows 45% — some timeline tasks not done
4. Coach taps **Timeline** tab — sees 13 tasks, 5 complete, 2 overdue (⚠️)
5. Coach taps **Squad** tab — sees player list with availability status
6. Coach taps **Pack** tab → "Match pack not generated yet"
7. Coach taps **Generate Match Pack** → spinner → pack loads
8. Pack sections render: fixture summary, squad, opposition analysis, volunteers, transport, medical alerts, player milestones
9. Coach screenshots pack / shares it with assistants

**Outcome:** Match pack generated and distributed in 2 minutes.

---

## Flow 3: Quick Action — Take Attendance

**Trigger:** Training session begins

1. Coach taps **Actions** tab
2. Sees 3×4 grid of 12 actions. "Take Attendance" is highlighted with accent colour (top left)
3. Coach taps — spinner overlay appears on button
4. Call to `/api/actions/run` with `actionId: RECORD_ATTENDANCE`
5. Result toast appears: ✅ "Attendance recorded — 14/18 present"
6. Coach taps home → Attendance card updates (next refresh cycle)

**Outcome:** Attendance logged in one tap.

---

## Flow 4: AI Natural Language Query

**Trigger:** Coach has a question mid-session

1. Coach sees frosted-glass pill at top: "Ask the AI anything…"
2. Coach taps it → full-screen overlay animates up (`cmdOpen` animation)
3. Keyboard appears, suggestions shown: "Who is injured this week?", "What is our attendance trend?", etc.
4. Coach taps "Who hasn't attended in 3 weeks?"
5. Query fires to `/twin/ask` → response renders: "James Murphy (U14), Sarah O'Brien (U16 Red) have not attended in 3+ weeks"
6. Coach taps **Done** → overlay dismisses
7. Previous answer stored in history (last 20 queries)

**Outcome:** AI answered in plain English, no navigation required.

---

## Flow 5: Alert Response

**Trigger:** Red badge appears on Alerts tab

1. Coach sees "🔔 2" badge in bottom nav
2. Taps **Alerts** → sorted list: CRITICAL first, then HIGH, then MEDIUM
3. Top item: "First Aider needed Saturday" (HIGH)
4. Filter chips visible: ALL (4) / HIGH (1) / MEDIUM (3)
5. Coach taps HIGH filter → only critical alerts shown
6. Coach taps alert (future: deep link to volunteer management flow)

**Outcome:** Critical issues surfaced instantly, no hunting.

---

## Flow 6: Post-Match Review

**Trigger:** Match completed

1. Coach opens Match tab → fixture status is IN_PROGRESS
2. After final whistle: Coach taps **Actions** → "Complete Match" action
3. Enters result: 3-1 win
4. System calls `/fixtures/{id}/complete` → status becomes COMPLETED
5. Post-match review generated automatically
6. Digital Twin updated with result
7. Season standings recalculated
8. AI briefing tomorrow morning will include match summary

**Outcome:** Match result recorded, Twin updated, review ready — all in one session.

---

## Flow 7: Offline Mode

**Trigger:** Coach is at a training pitch with no signal

1. App loads — all API calls time out (10s AbortController)
2. `useMobileData` falls back to `MOCK` data for all endpoints
3. Mock data shows: health 78/100, 2 sample alerts, no upcoming fixtures
4. Home screen renders fully — coach can still read last cached data (60s cache)
5. AI command bar shows — but answers return `null` (no graceful error yet)
6. Coach can still view previously loaded fixture details (component-local state)
7. When signal returns — coach taps BottomNav tab to re-mount and refresh

**Outcome:** App never crashes offline; mock data keeps it usable.

---

## Flow 8: PWA Install (iOS)

1. Coach opens `http://[server-ip]:5174` in Safari
2. Sees "Coach's Eye" in status bar area (black-translucent style)
3. Taps Share → "Add to Home Screen"
4. App installs with Coach's Eye name and icon
5. Opens from home screen in standalone mode (no browser chrome)
6. `viewport-fit=cover` ensures content sits inside safe areas on all notch/Dynamic Island models

**Outcome:** Native-feeling app experience from a web URL.

---

## Flow 9: Multi-Team Management

**Trigger:** Club has 5 active teams with fixtures this weekend

1. Coach opens **Match** tab
2. Team selector chips appear at top: U10, U12, U14, U16 Red, U16 Blue
3. Coach taps U16 Red — countdown ring updates to 1 day
4. Coach switches to U14 — countdown shows 4 days
5. Each fixture has its own independent timeline and prep %
6. Coach can generate separate match packs per team

**Outcome:** Multi-team coaching staff can track all fixtures from one screen.
