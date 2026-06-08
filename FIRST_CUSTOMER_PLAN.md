# First Paying Customer — 30-Day Plan

**Target:** One rugby club paying €20/month within 30 days.  
**Date written:** 2026-06-08  
**Constraint:** Do not build anything that doesn't directly help acquire or retain the first paying club.

---

## Current State (Brutal)

The app works. The business doesn't exist yet.

| Gap | Impact |
|-----|--------|
| No signup UI — coaches can't create a club | Door is closed |
| No billing — no way to charge anyone | No revenue possible |
| App URL shows a dark SPA with no explanation | Strangers leave immediately |
| Player approved → hears nothing → doesn't come back | Onboarding funnel broken |
| Medical, Tactics, System Status visible to coaches | App looks unfocused |
| "BOITSFORT" appears in player join form | Looks like someone else's club |

**Two items from KNOWN_ISSUES.md are already resolved:**
- W1: `/api/mission-control` already has `requireTenantRole` auth ✅
- W3: `LEGACY_STAFF_ACCOUNTS` already uses `passwordEnv` env var, not hardcoded ✅

---

## The Two Paths

### Path A — Manual First Customer (fastest €20)
Provision one specific coach manually. No signup form needed. Takes 1 day.  
*Use when you have a target coach ready to try it.*

### Path B — Self-Service First Customer (scalable €20)
Build signup + billing. Anyone can sign up. Takes ~3 weeks.  
*Use when you don't have a specific target coach, or want repeatability.*

**Recommendation: Run Path A in Week 1 while building Path B in Weeks 2–3.**  
First €20 comes from Path A. First €100 comes from Path B.

---

## 30-Day Build Order

### Week 1 — First €20 (Path A, manual)
*Goal: one coach is paying by Day 7. No self-service yet.*

**Day 1–2: Clean the app (3–4h total)**

Remove features that make the app look unfinished to a new coach:

1. **Remove Medical section** — delete `#medicalSection` + nav link from `index.html`. GDPR liability and cognitive noise.
2. **Remove Tactics canvas** — delete `#tacticsSection` + nav link. Nobody uses it. It signals the product doesn't know what it is.
3. **Remove System Status from coach nav** — a paying coach seeing "⚙ System Status" with Redis connection indicators loses confidence. Remove the nav link. Endpoint stays, nav entry goes.
4. **Delete V1 Message Center dead code** — `renderMessageCenter()` immediately delegates to V2. Delete the ~260 lines below it.
5. **Fix "BOITSFORT" default in player join form** — `index.html:4051` hardcodes `|| 'BOITSFORT'`. Change to an empty string so it shows a placeholder instead.

After these: coach sees Overview, Availability, Messages, Training, Matchday, Players. Clean.

**Day 3: Add player approval email (2h)**

`approveJoinRequest()` in `api/_identityStore.js:646` saves the member but sends no email.  
Resend is already wired up in `api/_email.js`. This is a 2-hour fix.

Add to `_email.js`:
```javascript
export function approvalEmail({ firstName, teamName, teamCode, appUrl } = {}) {
  return {
    subject: `You're now a member of ${teamName}`,
    text: `Hi ${firstName},\n\nYour coach has approved your request to join ${teamName}.\n\nOpen the app: ${appUrl}\n\nYour squad code is: ${teamCode}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2>You're in, ${firstName}.</h2>
      <p>Your coach has approved your request to join <strong>${teamName}</strong>.</p>
      <p><a href="${appUrl}" style="display:inline-block;background:#10b981;color:white;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Open Coach's Eye</a></p>
      <p style="color:#64748b;font-size:13px">Squad code: <strong>${teamCode}</strong></p>
    </div>`,
  };
}
```
Call it in `approveJoinRequest()` after `saveTeamMembers()`. Wrap in try/catch — email failure must not break approval.

**Day 4: Provision the first coach manually (2h)**

The `provision_club` API already works. Use it:

```bash
curl -X POST https://your-app.vercel.app/api/identity \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "provision_club",
    "teamId": "ballymena-rfc",
    "teamName": "Ballymena RFC",
    "teamCode": "BALLYMENA",
    "coachEmail": "coach@ballymenarfc.com",
    "coachFirstName": "Paddy",
    "coachLastName": "McCoach",
    "coachPassword": "temporary-password-123"
  }'
```

Then send the coach an email (manually):
> "Your club is set up. Go to [URL] and log in with [email] — you'll be prompted to change your password. Your squad join code is BALLYMENA. Share it with your players."

**Day 5–6: Send first invoice (1h)**

Create a Stripe payment link in the Stripe dashboard (no code needed):
- Product: "Coach's Eye — Monthly Club Subscription"
- Price: €20/month recurring
- Copy the payment link URL
- Email it to the coach: "If you're happy to continue after your first week, here's the link to start your subscription."

**Day 7 target: €20/month in.** Coach is live, players are joining, first invoice sent.

---

### Week 2 — Fix the Onboarding Funnel (before more coaches join)
*Goal: a new coach can get their first player to respond in under 10 minutes.*

**Upstash → Pay-As-You-Go (0.5h ops)**  
Free tier hit 500K commands in beta. Do this before any real traffic. Log in to console.upstash.com, switch plan. Takes 30 minutes.

**Coach: change password UI (3h)**  
No `change_password` endpoint exists. First thing a coach does after receiving a temp password is try to change it. If they can't, they call you.

Backend (1.5h): add `action: 'change_password'` to `api/identity.js`. Verify old password hash, update, return `{ ok: true }`.  
Frontend (1.5h): password change form in coach settings. Current password → New password → Confirm.

**Onboarding: "what do I do first?" (2h)**  
New coach logs in and sees an empty dashboard. They don't know what to do. Add a one-time onboarding banner to the coach overview:

> "Welcome to Coach's Eye. Start by sharing your squad join code: **BALLYMENA**. Players open the app and enter this code to request to join."

Show it until the coach has at least 3 active players. Dismiss button. No tutorial, no popover, no guided tour — just the one sentence they need.

---

### Week 3 — Self-Service Signup
*Goal: a coach who finds the product can sign up without Simon.*

**Landing page / signup entry point (3h)**  
Right now: a stranger goes to the URL and sees a dark SPA loading. They have no idea what it is.

Build a minimal splash screen that shows before the app loads (or as an `#signupPanel` at the auth state). Must contain:
- One sentence: what the product is ("Structured availability and squad comms for rugby clubs")
- One number: the price ("€20/month per club")
- One button: "Create your club →"
- One link: "Already have an account? Log in"

No hero images, no testimonials, no feature grid. Just enough for a coach to understand what they're buying.

**Self-service signup form (6–8h)**  

`provisionClub()` in `api/_identityStore.js:1049` is already complete — it validates all fields, creates team + coach atomically, hashes password, rejects duplicate team codes.

What to build:
- New `action: 'signup'` in `api/identity.js` (unauthenticated POST, no CRON_SECRET — add IP rate limiting: max 5 signups/hour/IP instead)
- Frontend `#signupPanel` in `index.html`: Club Name, Team Code (auto-suggested from club name, editable), First Name, Last Name, Email, Password
- Auto-login after successful signup (call `loginUser()`, set session cookie, redirect to coach dashboard)
- After signup: show the onboarding banner with team code front and centre

Auto-generate team code suggestion: `CLUBNAME` → `CLUBNAME` (uppercase, trim spaces, max 12 chars). Let the coach edit it. Validate uniqueness on submit.

**Welcome email on signup (1h)**  
Add `welcomeEmail()` template to `_email.js`. Send after `provisionClub()` succeeds. Content:
- Club name, team code (big and bold)
- Link to the app
- "Share this code with your players to get them onboarded"

---

### Week 4 — Stripe Billing
*Goal: coaches pay without Simon sending manual invoices.*

**Pre-requisites before writing code:**
- Stripe account created, email verified
- One product created in Stripe dashboard: "Coach's Eye Club" at €20/month
- Set Vercel env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`

**Trial on signup (0.5h)**  
When `provisionClub()` creates a team, add `billingStatus: 'trial'`, `trialEndsAt: now + 14 days`. Check on coach login — if trial expired: block dashboard, show billing screen.

**Stripe Checkout session (2h)**  
`POST /api/billing` with `action: 'create_checkout'` — auth required (coach session).  
Returns `{ url }` — frontend redirects to Stripe-hosted checkout page.

**Stripe webhook handler (3h)**  
`POST /api/billing` with raw body + `stripe-signature` header.  
Handle:
- `checkout.session.completed` → set `billingStatus: 'active'`, save `stripeCustomerId` + `stripeSubscriptionId`
- `customer.subscription.deleted` → set `billingStatus: 'cancelled'`
- `invoice.payment_failed` → send coach email ("payment failed, update card")

**Billing UI (2h)**  
Simple panel in coach settings: current status, trial days remaining, "Subscribe now" button.  
After Stripe redirect back: "You're all set — your subscription is active."

**Cancel flow (1h)**  
"Cancel subscription" button → `cancel_at_period_end: true` in Stripe. Show "Cancellation scheduled for [date]". Do not delete the club immediately.

**Total Week 4:** ~9h

---

## Mandatory Before First Customer

These are doors. Without them, the first customer can't get in, won't stay, or represents legal risk.

| # | Item | Hours | Why mandatory |
|---|------|-------|---------------|
| 1 | Remove Medical, Tactics, System Status, dead code | 3h | First impression. Coach sees noise, coach leaves. |
| 2 | Fix BOITSFORT default in player join form | 0.5h | Players see the wrong club name. |
| 3 | Player approval email | 2h | Without it: player joins, hears nothing, doesn't return. Coach has empty squad. |
| 4 | Manual provision + Stripe payment link | 1h | First €20. No code needed. |
| 5 | Upstash → Pay-As-You-Go | 0.5h | Free tier will be hit within weeks. Data loss ends the relationship. |
| 6 | Coach change password UI | 3h | Temp password + no change-password = support call on day 1. |

**Total mandatory: ~10h.** First customer possible within 1 week.

---

## Can Wait Until After First Customer

These are real features. Build them after the first paying coach tells you they need them — not before.

| Item | Reason to defer |
|------|-----------------|
| Self-service signup | First coach can be manually provisioned |
| Stripe Checkout + webhooks | First invoice can be a manual Stripe payment link |
| Landing page | First coach is someone you know — they don't need to discover the product |
| GDPR data export | Required before EU scale, not before 1 paying coach |
| Multi-team per club | One team working perfectly is the product |
| Stripe Customer Portal | Cancel flow fine manually for first 1–5 clubs |
| Analytics dashboard | Noise at 1–3 clubs |
| Admin / secretary role | Single coach per club is the product |
| Automation / scheduled push | Manual "send availability request" is enough |
| Calendar export | Coaches will ask for this. It's a v2 feature. |
| Matchday selection polish | Already works. Don't improve what's not blocking revenue. |
| W2 (push delete auth) | Opaque endpoint URL, low risk, not user-facing |
| W4 (group invite rate limiting) | Attacker needs the link. Low risk. |

---

## Fastest Path to €20

**Day 1:**
1. Clean the app (remove Medical, Tactics, System Status, dead code) — 3h
2. Fix BOITSFORT default — 0.5h
3. Add player approval email — 2h

**Day 2:**
4. Manually provision a club for your first target coach (curl command) — 30 min
5. Send them login credentials and their squad join code — 30 min

**Day 3–5:**
6. Let them onboard their squad. Answer questions. Watch for friction.

**Day 5–7:**
7. Create a Stripe payment link in the Stripe dashboard (no code) — 30 min
8. Send it to the coach with: "If this is working for you, here's the subscription link."

**Total dev work: ~6h.** First €20 by Day 7.  
**Requirement:** You have one specific target coach who's willing to try it.

---

## Fastest Path to €100

**Option A — 5 coaches × €20 (manual, Weeks 1–2)**  
Manually provision 5 clubs. Send 5 Stripe payment links. Requires 5 willing coaches.  
Total dev work: same 6h + 2.5h per additional coach (provision + onboard call).

**Option B — 5 coaches via self-service (Weeks 3–4)**  
Build signup form + Stripe billing. Any coach who finds the product can pay.  
Total dev work: ~22h additional (signup form + Stripe Checkout + webhook).

**Option C — 1 larger club × €100**  
Some clubs have 60+ players across seniors + U18s. They'll pay more for a working product.  
Same manual path, higher price point. Offer €50 "founding club" price to the first 5.

**Recommendation:** Use Option A to reach €100 by Day 14. Build Option B in parallel to reach self-service by Day 30.

---

## Risks That Stop a Coach Adopting

These are not hypothetical. Each one is a specific point where a real coach abandons the product.

### Risk 1 — Push notifications don't work on their iPhone
**Probability:** High  
**Impact:** Catastrophic — the entire value proposition depends on players responding to push notifications. If an iPhone user sees no notification, the product doesn't work.  
**What happens:** Coach sends availability request. Half the squad never gets it. Coach waits. Players reply via WhatsApp instead. Coach goes back to WhatsApp.  
**Fix:** Before onboarding any real coach, test push delivery on an actual iPhone 14+ running iOS 16+. Not a simulator. A real device, on a real mobile network.  
**Owner:** Must be verified in Week 1 before manual provisioning.

### Risk 2 — Coach doesn't know what to do after login
**Probability:** High  
**Impact:** High — coaches churn in the first session, not the first month.  
**What happens:** Coach logs in. Sees an empty dashboard. Looks for "invite players" button. Can't find it. Closes the tab.  
**Fix:** The one-sentence onboarding banner (Week 2). Surface the squad join code prominently on first login.  
**Immediate fix (no code):** Include the squad join code in the welcome email.

### Risk 3 — Players join but don't come back after waiting for approval
**Probability:** High  
**Impact:** High — this is the first thing a coach will see. Empty squad after their players "tried to join."  
**What happens:** Player enters team code. Sees "waiting for approval". Gets no email. Tries to log in next day. Still waiting (coach didn't notice the request). Player gives up.  
**Fix:** Player approval email (Week 1, Day 3). Already the highest-priority fix.

### Risk 4 — The app looks like a demo, not a product
**Probability:** Medium  
**Impact:** Medium — coaches are pattern-matching for "is this real?" in the first 30 seconds.  
**What happens:** Coach sees "System Status" with Redis health indicators in their nav. Sees "Medical" section they don't need. Feels like they're using a developer's prototype.  
**Fix:** Clean the app (Week 1, Day 1). Non-negotiable.

### Risk 5 — Coach can't recover their account
**Probability:** Low  
**Impact:** High — one locked-out coach is one call to Simon, one bad word-of-mouth.  
**What happens:** Coach forgets their manually-assigned temporary password. Password reset email works, but they're confused by the flow. They email Simon.  
**Fix:** Change password UI (Week 2). The current password reset flow (email token) works but is disorienting for coaches expecting a settings panel.

### Risk 6 — The team code is confusing to players
**Probability:** Medium  
**Impact:** Medium — one confused player means one message to the coach, who loses confidence.  
**What happens:** Player tries to join. The join form shows "BOITSFORT" as the default team code. They type over it with a wrong code. They can't join.  
**Fix:** Fix the BOITSFORT default (Week 1, Day 1). Show a placeholder: "Enter your team's join code".

### Risk 7 — The subscription price point is wrong
**Probability:** Unknown  
**Impact:** High if true  
**What happens:** Coach likes the product. Goes to pay. Sees the price. Closes the tab.  
**Mitigation:** Before building billing, validate the price with the first manual customer. Ask them directly: "What would you pay per month for this?" €20 is a hypothesis. Validate it in Week 1.

---

## What Not to Build (30-Day Scope)

If it's not on the mandatory list or the 30-day build order, it does not get built.

| Feature | Classification |
|---------|---------------|
| Multi-team per club | Later — Phase C |
| Analytics dashboard | Later — Phase C |
| Admin / secretary role | Later — Phase C |
| Stripe Customer Portal | Later — Phase C |
| Calendar export | Later — Phase B |
| Automated availability reminders | Later — Phase B |
| Group conversations (Coaching Team) | Later — remove entirely |
| Medical section | Delete — now |
| Tactics canvas | Delete — now |
| System Status in coach nav | Delete — now |
| V1 Message Center | Delete — now |
| Player "This Week" view improvements | Later |
| Notification scheduling | Later |
| GDPR data export | Later (before EU scale) |

---

## 30-Day Checkpoint

If at Day 30 the following are true, the plan worked:

- [ ] One club is paying €20+/month
- [ ] At least 5 players are active in that club
- [ ] Coach sent at least one availability request and received responses
- [ ] Push notifications confirmed working on iOS
- [ ] No features in coach nav that shouldn't be there
- [ ] No active support escalations from the first coach
- [ ] Self-service signup is live (strangers can create a club)
- [ ] Stripe is live (strangers can pay)
- [ ] Player approval email is sent on every approval
