# Coach's Eye — Launch Roadmap

**Prepared:** 2026-06-08  
**Perspective:** First paying customer · Rugby coach · Club administrator  
**Mandate:** Paying teams as fast as possible. Ruthless simplicity.

---

## What Coach's Eye Actually Is

A rugby club management app that does two things well:

1. **Structured availability** — coach asks "who's available Saturday?", players reply from a push notification, coach sees a dashboard not a chat thread.
2. **Team comms** — squad broadcast, coach ↔ player DM, announcements. Replaces WhatsApp groups with something searchable and role-aware.

Every other feature should be judged against whether it helps or hinders those two things.

---

## The Three Perspectives

### First Paying Customer
Needs: sign up without calling anyone, add a squad in one session, know their data is safe, pay with a card, cancel anytime.

**Current state:** Cannot sign up without a curl command from the builder. Team code is hardcoded to `BOITSFORT`. No payment flow exists. This is a demo, not a product.

### Rugby Coach
Needs: "who's available Saturday?" answered before Friday, matchday 15 picked in under 5 minutes, players actually use it.

**What they use today:** A WhatsApp group. They pay for it by wasting 20 minutes every week reading through a chat thread counting thumbs-up emojis.

**The hook:** The availability dashboard. Not a list of messages — a count. "18 available. 4 injured. 3 no reply." That's what they pay for.

**What they don't need:** A tactics canvas, a treatment log, a coaching team group chat.

### Club Administrator
Needs: add multiple teams (seniors, U18s, ladies), manage multiple coaches, billing in one place, data they can export.

**Current state:** Multi-tenant provisioning exists but is API-only. One coach per club. No billing. No export. Not ready.

---

## The 10 Highest-Value Features

Ranked by: revenue impact × coaching value × player adoption rate.

| # | Feature | Why it matters |
|---|---|---|
| 1 | **Availability request → push notification → structured reply** | The only reason to switch from WhatsApp. This is the product. |
| 2 | **Player onboarding via group invite link** | Coach shares a link. Players join. Without this, coach does data entry. |
| 3 | **Availability dashboard** | "18 available, 4 out" — one view, before the coach opens their laptop. |
| 4 | **Squad messaging** (broadcast + DM) | Replaces WhatsApp group. Structured, role-aware, searchable. |
| 5 | **Self-service club signup + billing** | Without this there is no business. |
| 6 | **Matchday selection** | The output. Coach picks 15. Players see the team. Everyone knows. |
| 7 | **Fixture calendar** | The anchor of the whole week's communication cycle. |
| 8 | **Player approval notification** | Player submits form, hears nothing, doesn't come back. Fix this now. |
| 9 | **Mobile-first, installable PWA** | Rugby players are on their phones. App-quality experience is table stakes. |
| 10 | **Training session planner** (basic) | Session time + blocks. Coaches plan training on their commute. |

---

## What Is Missing Before Launch

These block the first paying customer. Every one of them is a door that won't open.

### Critical — Cannot Launch Without

**1. Self-service club creation**  
The team code is hardcoded to `BOITSFORT`. A new club cannot sign up without developer intervention. This must become a form: club name → team code (auto-generated or chosen) → coach email/password → go.  
_Fix: `provision_club` API already exists. Build a signup page that calls it._

**2. Billing integration (Stripe)**  
No payment = no business. Minimum viable: Stripe Checkout link, fixed monthly price, webhook to mark club as `active`. Admin can see who's paid. Coach can cancel.  
_This is the most important missing feature in the entire product._

**3. Player approval notification (email)**  
Player submits invite form → hears nothing → tries to log in → gets "Waiting for coach approval" → leaves. Fix: send a transactional email on approval. The hook is already there: `approveJoinRequest` in `_identityStore.js`.  
_One API call. This is blocking the onboarding funnel._

**4. Security: remove demo credentials from source**  
`LEGACY_STAFF_ACCOUNTS` with `password: '1111'` is in the source. Before any coach pays, this must be behind `process.env.LEGACY_COACH_PASSWORD` or removed entirely. If the repo goes public or a customer reads the source, the coach demo account is compromised.

**5. Security: protect `/api/mission-control`**  
Currently unauthenticated. Returns git commit history, branch list, and Redis key counts. One line fix: add `CRON_SECRET` bearer check. This is a non-negotiable before charging anyone.

**6. Coach: change password UI**  
If a coach forgets their password, what happens? The password reset flow exists but it's unclear if there's a "change password while logged in" option. A coach who can't recover their account calls you. That call costs more than building the UI.

**7. Upstash → Pay-As-You-Go**  
The free tier hit 500,000 commands in beta. A single real rugby club in active season will hit it within a month. This is an ops ticket, not a feature — but it blocks production.

---

## What Can Wait Until After Launch

These are real features. Build them after the first paying club tells you they need them.

| Feature | Why it can wait |
|---|---|
| Multi-team per club (U18s, Ladies) | Get one team working perfectly first. |
| Automation builder (scheduled notifications) | Manual "send availability request" is enough for v1. |
| Typing indicators / message editing / reactions | Nice to have. WhatsApp has trained users to expect them but they won't churn without them. |
| Player "This Week" section | Fixtures + Availability covers 90% of what players need. |
| Coach analytics dashboard (response rates, engagement) | Valuable at 10+ clubs. Noise at 1-3. |
| Self-serve billing portal (Stripe Customer Portal) | Manual invoice is fine for the first 5 clubs. |
| Calendar export (Google Calendar / iCal) | Coaches will ask for this. It's a v2 feature. |
| Admin / club secretary role | Single coach per club is fine until v2. |
| Notification scheduling (automated chase-ups) | Build this once a coach complains that manual follow-up is too much work. |
| Group conversations > 2 (Coaching Team channel) | Nobody uses this before they use the app. |

---

## What Should Be Removed Entirely

These features add surface area, cognitive load, and maintenance cost without increasing revenue or retention. Remove them before the first paying customer onboards — they signal that the product doesn't know what it is.

### 1. Medical Section
**Remove it.**  
Treatment logs, rehab progress sliders, injury recovery percentages. This is a liability trap. The moment a coach uses this to track a serious injury and makes the wrong call, you are in the liability chain. Medical records require GDPR Article 9 treatment (special category data). No rugby club app needs to own this. Clubs that care about medical tracking use proper physiotherapy software.

If coaches ask: "Track injured/available in the availability section." That's enough.

### 2. Tactics Canvas / Rugby Pitch Drawing Board
**Remove it.**  
15 rugby positions on a canvas where the coach can drag circles around. It demos well. Coaches do not use it for real planning — they use whiteboards, video, or specialist tactics software. It does not create retention, it does not differentiate the product, and it requires canvas state management that adds complexity to the codebase. The training planner (timed blocks, activities) is sufficient.

### 3. "Coaching Team" Group Conversation
**Remove it.**  
Coaching staff already communicate. They have phones. They don't need a separate in-app group that exists before they've used any other feature. Remove it from the default conversation setup. Let coaches create it manually if they want it.

### 4. System Status Page in Coach Navigation
**Remove it from the coach nav.**  
Coaches see "⚙ System Status" in their navigation. This is an internal debug panel. It shows Redis connection status, cron schedules, push notification diagnostics. A paying rugby coach does not need this. Move it behind a secret URL or an admin-only account. Showing it to coaches signals that the product is unfinished.

### 5. V1 Message Center (dead code)
**Delete it.**  
`renderMessageCenter()` immediately calls `renderMessageCenterV2()`. The V1 implementation below it is never executed. Delete it — it's ~260 lines of dead code that makes the codebase harder to read and maintain.

---

## Phase A — Must Have
*Goal: one stranger can sign up, add their squad, and pay. Nothing else.*

| # | Item | Type | Effort |
|---|---|---|---|
| A1 | Self-service club signup form → `provision_club` | Build | Medium |
| A2 | Stripe Checkout integration (monthly plan, webhook) | Build | Medium |
| A3 | Player approval email via `approveJoinRequest` | Fix | Small |
| A4 | Remove `LEGACY_STAFF_ACCOUNTS` plaintext password | Fix | Small |
| A5 | Add `CRON_SECRET` auth to `/api/mission-control` | Fix | Trivial |
| A6 | Coach "change password" UI | Build | Small |
| A7 | Remove Medical section | Remove | Small |
| A8 | Remove Tactics canvas | Remove | Small |
| A9 | Remove System Status from coach nav | Remove | Trivial |
| A10 | Delete V1 Message Center dead code | Remove | Trivial |
| A11 | Upstash → Pay-As-You-Go | Ops | Trivial |

**Phase A is complete when:** a rugby coach in a different country can find the product, sign up, invite their squad, and pay — without any help from the builder.

---

## Phase B — First Paying Customers
*Goal: 3–5 clubs paying. Low churn. Word of mouth starts.*

| # | Item | Type | Why now |
|---|---|---|---|
| B1 | Matchday selection: coach picks 15, players see the team | Build | Most-requested feature after availability tracking |
| B2 | Push notification reliability audit (iOS Safari) | Fix | iOS is where rugby players are. If push doesn't work on iPhone, nothing works. |
| B3 | Player can update their own name/email/password | Build | Coaches shouldn't manage player profile data manually |
| B4 | "No DM yet" state: auto-create DM stub on player approval | Fix | Current UX: player logs in, sees no coach conversation. Confusing. |
| B5 | Availability request: coach can resend / chase no-replies | Build | This is the weekly workflow. Manual follow-up is the first pain coaches mention. |
| B6 | Fixture: link availability request to specific fixture | Build | "Who's available for Saturday vs. Richmond?" not just "this week's session" |
| B7 | Basic onboarding email sequence (welcome → how to invite squad) | Build | First 7 days are when clubs abandon new tools |
| B8 | Add/remove player from coach Members view | Fix/Polish | Currently works but UX is rough; coaches need confidence here |
| B9 | Anonymous chat endpoint: restrict to authenticated only | Fix | W4 of KNOWN_ISSUES.md — must be closed before growing user base |
| B10 | GDPR: basic data export and account deletion flow | Build | Required before charging EU customers |

**Phase B is complete when:** coaches recommend it to other coaches without being asked.

---

## Phase C — Scale
*Goal: 20+ clubs. Reduce manual ops. Increase ARPU.*

| # | Item | Type | Why then |
|---|---|---|---|
| C1 | Multi-team per club (seniors + U18s + ladies) | Build | Every club asks. Wait until onboarding is smooth. |
| C2 | Stripe Customer Portal (self-serve billing) | Build | Manual invoicing doesn't scale past 10 clubs |
| C3 | Club admin / secretary role | Build | Clubs have non-coaching admins who manage memberships |
| C4 | Availability automation (scheduled chase-ups, rules) | Build | Build when coaches complain that manual follow-up takes too much time |
| C5 | Fixture calendar export (Google Calendar / iCal) | Build | Coaches will ask. Low effort, high perceived value. |
| C6 | Analytics: response rates, engagement by session | Build | Useful at scale for coaches to see patterns |
| C7 | Multiple coaches per team | Build | Co-coaching is common; wait until clubs ask for it |
| C8 | Webhook / API for external integrations | Build | Only when a club with existing software asks |

**Phase C is complete when:** the product runs without the builder's operational involvement.

---

## The Single Most Important Sentence

**The gap between "impressive demo" and "paid product" is one feature: self-service signup with billing.**

Everything else in Phase A is risk reduction. But nothing moves until a stranger can discover the product, create a club, invite their squad, and pay — without a developer involved.

---

## What the Product Is Not

- Not a fitness tracker (no GPS, no heart rate, no performance data)
- Not a tactics analyser (no video, no drawing tools worth keeping)
- Not a medical record system (remove it)
- Not a scheduling app (it doesn't own the calendar, it just references fixtures)
- Not a general sports platform (stay rugby, stay club-level, stay coach+player)

The product is: **structured availability + team comms + matchday selection, for a rugby club, on mobile.**

That is worth paying for. Everything outside that definition costs more than it earns.
