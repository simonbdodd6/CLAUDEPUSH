# Production Roadmap

**Coach's Eye — Version 1 → Version 2 → Enterprise**  
**Date:** June 2026  
**Status:** Integration Phase

---

## Capability Ranking Matrix

Every capability already built, ranked across five dimensions (1=low, 5=high):

| Capability | Ease | User Impact | Revenue Impact | Risk | Dev Time | **Score** |
|-----------|------|------------|----------------|------|----------|-----------|
| Season phase + prescription in dashboard | 5 | 5 | 4 | 1 | 5 | **4.0** |
| Autonomous recommendations in UI | 4 | 5 | 5 | 2 | 4 | **4.0** |
| Morning briefing (auto-generated) | 5 | 5 | 4 | 1 | 5 | **4.0** |
| Fixture preparation timeline | 4 | 5 | 4 | 1 | 4 | **3.6** |
| Communications send from UI | 3 | 5 | 5 | 3 | 3 | **3.8** |
| Availability poll for fixtures | 4 | 5 | 4 | 2 | 4 | **3.8** |
| Match pack generation | 4 | 4 | 3 | 1 | 5 | **3.4** |
| Club health score (full 8-dim) | 4 | 4 | 4 | 1 | 4 | **3.4** |
| Season simulation in reports | 3 | 4 | 3 | 1 | 4 | **3.0** |
| AI timeline (14-day) | 4 | 4 | 3 | 1 | 4 | **3.2** |
| Knowledge engine Q&A | 3 | 4 | 3 | 2 | 3 | **3.0** |
| Learning engine feedback loop | 2 | 3 | 4 | 1 | 2 | **2.4** |
| Club Intelligence Score | 2 | 3 | 4 | 1 | 2 | **2.4** |
| Player development tracking | 3 | 4 | 3 | 2 | 3 | **3.0** |
| Coaching programme generator | 2 | 4 | 3 | 2 | 2 | **2.6** |
| Sponsor communications | 3 | 2 | 4 | 1 | 4 | **2.8** |
| Automated scheduled comms | 2 | 4 | 3 | 3 | 2 | **2.8** |
| Season simulation (board) | 2 | 3 | 4 | 1 | 3 | **2.6** |
| Multi-tenant data isolation | 1 | 1 | 5 | 5 | 1 | **2.6** |
| Real email/SMS delivery | 1 | 5 | 5 | 4 | 1 | **3.2** |

---

## Version 1 — What Ships First

**Theme: The Coaching Dashboard That Thinks**

Everything a Director of Rugby needs on one screen. No setup required. Smart from day one.

### V1 Core Features (All Integration Work)

---

#### 1. Season Phase Header
**Priority: Must-have**

Display the current season phase, week, and phase prescription targets on every screen.

| Level | Implementation | Dev Time |
|-------|---------------|---------|
| Smallest | `GET /api/season/phase` added to Command Centre API. Phase name + week shown as header chip in Dashboard. | 2 hours |
| Medium | Phase card with current phase, prescription targets (intensity, attendance target, training focus), days until next phase. | 1 day |
| Full | Phase progression bar, prescription vs actual comparison, phase-aware colour theming of the entire dashboard. | 3 days |

**Wire:** `app/api-server.js` → `season-intelligence/index.js` → `detectCurrentPhase()` + `getPrescription()`

---

#### 2. Morning Briefing (Auto-Generated)
**Priority: Must-have**

Every morning, the coach opens the app and sees a 5-line summary of what matters today. No searching, no aggregating.

| Level | Implementation | Dev Time |
|-------|---------------|---------|
| Smallest | Command Centre API `/api/dashboard/briefing` already exists — wire it to `autonomous-assistant/decision-support.js generateCoachBriefing()` instead of mock data. | 4 hours |
| Medium | Briefing includes: phase, next fixture (days), top 3 recommendations, injury count, attendance trend. | 1 day |
| Full | Briefing is personalized by role (Head Coach vs DoR vs Chairperson), includes week-in-review on Mondays, includes fixture pack reminder on Fridays. | 3 days |

**Wire:** `app/api-server.js` → `autonomous-assistant/assistant-core.js` → `runMorningBriefing()` using real observation data (not mock)

---

#### 3. AI Recommendations Panel
**Priority: Must-have**

Show the 3–5 highest-priority recommendations in the dashboard. Each one has an Accept / Snooze / Dismiss button.

| Level | Implementation | Dev Time |
|-------|---------------|---------|
| Smallest | `/api/recommendations` already proxies autonomous assistant. Add decision buttons (POST `/api/recommendations/:id/accept`) that call `resolve()`. | 4 hours |
| Medium | Each recommendation shows: type, urgency badge, confidence %, suggested action, one-tap actions. Snooze shows a time picker (4h, 24h, 3 days). | 2 days |
| Full | Decision recorded to Learning Engine. Coach can add outcome notes. Recommendation history visible in Reports. Calibration improvement displayed as "Platform accuracy: 87%". | 4 days |

**Wire:** UI buttons → Command Centre API → `autonomous-assistant/assistant-state.js` + `learning-engine/outcome-tracker.js`

---

#### 4. Fixture Preparation Timeline
**Priority: Must-have**

When a fixture exists within 7 days, a countdown card with prep tasks appears. Coach taps tasks to mark complete.

| Level | Implementation | Dev Time |
|-------|---------------|---------|
| Smallest | `GET /api/fixtures/next` returns next fixture. Countdown shown in Command Centre Dashboard card. | 3 hours |
| Medium | Timeline shows all prep tasks (availability check, team selection, kit, venue confirm) with completion status. | 1 day |
| Full | Prep task completion sends automated reminders via Communications Engine. Overdue tasks trigger Autonomous Assistant alert. Match pack generates 48h before kickoff. | 3 days |

**Wire:** `app/api-server.js` → `fixture-engine/index.js` → `getNextFixture()` + `generateTimeline()`

---

#### 5. Club Health Score Card
**Priority: Must-have**

Single number (0–100) with grade and 3 weak dimensions highlighted. Updated daily.

| Level | Implementation | Dev Time |
|-------|---------------|---------|
| Smallest | `/api/club/health` already exists but calls `club-intelligence` directly. Wire to `season-intelligence.buildClubHealthScore()` for phase-calibrated score. | 3 hours |
| Medium | 8-dimension breakdown shown as a bar chart. Weak dimensions highlighted in amber/red with one-tap fix action. | 1 day |
| Full | Week-over-week trend (+2 pts, "improving"). Actions taken shown in history panel. Health score drives dashboard colour scheme. | 2 days |

**Wire:** `app/api-server.js` → `season-intelligence/club-health-score.js` → `buildClubHealthScore()`

---

#### 6. Send Communications from UI
**Priority: High**

The most-requested user action after checking health. Coach selects audience + template + send.

| Level | Implementation | Dev Time |
|-------|---------------|---------|
| Smallest | `/api/comms/preview` and `/api/comms/send` added to Command Centre API. Calls `communications-engine.sendCommunication()`. Returns preview HTML. | 1 day |
| Medium | Communications page in Command Centre shows: template picker (newsletter/reminder/volunteer request/match preview), audience selector, preview, schedule. | 3 days |
| Full | Real email delivery via SendGrid/Mailgun. Delivery status tracking. Analytics panel (open rate, click rate). Scheduled recurring sends (weekly newsletter). | 2 weeks |

**Wire:** New `POST /api/comms/send` → `communications-engine/delivery-manager.js` → `executeDelivery()` (initially simulated; swap to real provider)

---

#### 7. Availability Poll (Fixture-Linked)
**Priority: High**

One tap to send "Are you available for Saturday?" to all squad members. Responses populate the team selection screen.

| Level | Implementation | Dev Time |
|-------|---------------|---------|
| Smallest | Fixture page "Send Availability Poll" button → POST to `/api/fixtures/:id/availability-poll` → `buildAvailabilityPoll()` + `sendCommunication()`. Returns rendered message. | 4 hours |
| Medium | Response tracking: players reply via link. Dashboard shows "14/22 confirmed". | 3 days |
| Full | Unresponsive players get an automated chase 24h before cutoff. Team selection screen auto-populates confirmed players. | 1 week |

**Wire:** `fixture-engine.buildAvailabilityPoll()` → `communications-engine.sendCommunication()` → delivery

---

#### 8. AI Timeline (Today + Next 7 Days)
**Priority: Medium**

Today page shows a timeline of predicted events, fixtures, recommended actions, and deadlines.

| Level | Implementation | Dev Time |
|-------|---------------|---------|
| Smallest | `GET /api/timeline` proxies `autonomous-assistant.generateTimeline()`. Returns flat list of events. | 3 hours |
| Medium | Timeline groups by day, colour-coded by type (fixture/recommendation/deadline/opportunity). Automatable events show "Auto" button. | 1 day |
| Full | Timeline integrates with season intelligence predictions (holiday dip warning 3 weeks out, membership renewal 10 days before expiry). | 2 days |

**Wire:** `app/api-server.js` → `autonomous-assistant/ai-timeline.js` → `generateTimeline()`

---

### V1 Must-Not-Have (defer to V2)

- Real email delivery (use simulated delivery for V1 beta; validate UX first)
- Multi-tenant architecture (V1 is single-club; billing and isolation comes in V2)
- Player portal / parent-facing interface (separate product)
- Stripe billing (implement at V2 launch)
- Push notifications to multiple devices (Web push exists; multi-device targeting is V2)

---

## Version 2 — What Comes Next

**Theme: The Platform That Learns and Scales**

After V1 is live and clubs have used it for a full season, V2 closes the feedback loop and opens to multiple clubs.

### V2 Features

---

#### 1. Multi-Tenancy
- Database migration from JSONL to PostgreSQL or PlanetScale
- Per-club data isolation (row-level security)
- User accounts (club admin, head coach, committee member, player roles)
- Subscription billing via Stripe (monthly per-club pricing)

**Est. effort: 6–8 weeks**

---

#### 2. Learning Engine Full Integration
- Autonomous Assistant automatically sends outcomes to Learning Engine
- Monthly calibration runs automatically (cron)
- Club Intelligence Score shown in dashboard ("Platform accuracy for Ballymena RFC: 89%")
- Calibration deltas automatically applied to recommendations
- "How am I doing?" report available in Reports tab

**Est. effort: 2 weeks**

---

#### 3. Season Intelligence Full Integration
- Season simulation in Reports (Current vs Expected vs Ideal chart)
- Predictive models surfaced as dismissable alerts ("Attendance dip predicted in 3 weeks")
- Phase progress bar in top nav
- Year-over-year comparison (requires second season of data)

**Est. effort: 1 week**

---

#### 4. Real Communications Delivery
- SendGrid/Mailgun for email
- Twilio for SMS (optional, GDPR-gated)
- WhatsApp Business API (optional)
- Delivery status tracking in Communications history
- Unsubscribe flow

**Est. effort: 2–3 weeks**

---

#### 5. Player Portal (Limited)
- Players can confirm availability for fixtures via a link (no login required)
- Players can view their own session history and injury status
- No full player dashboard in V2 (that's V3/enterprise)

**Est. effort: 3–4 weeks**

---

#### 6. Scheduled Workflows
- Background cron processes `getDueSchedules()` from workflow engine
- Weekly newsletter auto-sends if no human newsletter was sent
- Membership expiry reminders auto-send 14 days before expiry
- Morning briefing auto-generates at 07:00 and sends to coach's email

**Est. effort: 1 week**

---

#### 7. Reports & Board Pack
- Exportable PDF/HTML club health report
- Season simulation chart (8-week outlook)
- Prediction accuracy report (CIS score + F1 trend)
- Suitable for committee meetings

**Est. effort: 2 weeks**

---

## Enterprise Features — What Stays Premium

Features that are technically built but should be gated to higher-tier plans:

### Enterprise Tier

| Feature | Why Enterprise |
|---------|---------------|
| Club Digital Twin full model | Requires significant compute; valuable to federations |
| Season simulation with custom inputs | Complex, high-trust decision support |
| Prediction accuracy reporting | Meta-feature — only valuable after 6+ months of data |
| Board/governance reports | Federation and chairperson audience |
| Multi-team management | Large clubs with 10+ teams |
| IRFU/federation data integration | Requires governance and data sharing agreements |
| White-label / custom branding | Reseller / federation use case |
| API access (for integrations) | Developer ecosystem |
| SLA + dedicated support | Paid tier requirement |

### Free / Entry Tier (to drive acquisition)

| Feature | Why Free |
|---------|---------|
| Morning briefing | Immediate value, daily habit forming |
| Season phase + prescription | Simple, high-impression value |
| Basic club health score (1 team) | Shows the platform's core intelligence |
| Fixture countdown | Obvious utility |
| Basic communications (send to team) | Must work for free to drive adoption |

### Mid Tier

| Feature | Why Mid |
|---------|--------|
| Autonomous recommendations (full) | Core value prop — justify ongoing subscription |
| Communications (full templates + scheduling) | Club-wide operations benefit |
| Availability polls + response tracking | Fixture operations |
| AI timeline (7-day) | Daily use case |
| Knowledge engine Q&A | Differentiator |
| Learning Engine (Club Intelligence Score) | Retention driver — lock-in through data |

---

## V1 → V2 Milestone Definition

### V1 shipped when:
- [ ] Season phase shows in dashboard
- [ ] Morning briefing generated from real data (not mock)
- [ ] Recommendations panel with Accept/Snooze/Dismiss
- [ ] Fixture countdown with timeline
- [ ] Club health score (phase-calibrated)
- [ ] Send newsletter / training reminder from UI (simulated delivery)
- [ ] Availability poll sends (simulated delivery)

### V2 shipped when:
- [ ] Real email delivery (SendGrid)
- [ ] Multi-tenancy (PostgreSQL, user accounts, billing)
- [ ] Learning Engine fully wired (outcomes → calibration)
- [ ] Communications scheduling (weekly newsletter cron)
- [ ] Player availability confirmation (no-login link)
- [ ] Season Intelligence reports page

---

*See MVP_INTEGRATION_PLAN.md for implementation sprint breakdown.*  
*See ENTERPRISE_FEATURES.md for feature gate decisions.*
