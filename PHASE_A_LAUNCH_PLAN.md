# Phase A Launch Plan — Coach's Eye

**Goal:** A rugby coach in another country can create a club, invite players, pay, and use the app without speaking to Simon.

**Date:** 2026-06-08  
**Total estimated hours:** 27–32h  
**Current state:** Demo with one hardcoded club. No billing. No self-service. Not a product.

---

## Current Code State (honest audit)

| Item | Status | Location |
|------|--------|----------|
| `provision_club` API | ✅ Exists, but requires `CRON_SECRET` Bearer token | `api/identity.js:198` |
| Stripe billing | ❌ Zero lines exist anywhere | — |
| Coach signup UI | ❌ No page, no form | — |
| Player join team code | ⚠ Defaults to `'BOITSFORT'` if `state.teamCode` not set | `index.html:4051` |
| Player approval email | ❌ Not sent — hook exists but unused | `api/_identityStore.js:646` |
| `/api/mission-control` auth | ✅ Already protected (`requireTenantRole`) | `api/mission-control.js:258` |
| `LEGACY_STAFF_ACCOUNTS` password | ✅ Already uses `passwordEnv` env var | `api/_identityStore.js:36` |
| Coach change-password UI | ❌ No endpoint, no UI | — |
| Medical / Tactics / System Status | ❌ Still visible to coaches | `index.html` |
| V1 Message Center | ❌ Dead code still in tree | `index.html` |
| Upstash plan | ⚠ On free tier — hit limit in beta | — |

---

## Launch Blockers

These are hard stops. Nothing moves until they are resolved.

| # | Blocker | Why it blocks |
|---|---------|---------------|
| **B1** | Self-service signup form | No stranger can create a club |
| **B2** | Stripe billing | No way to charge anyone |
| **B3** | Player approval email | Players approve → hear nothing → don't come back |
| **B4** | Upstash on free tier | One real club in season will hit the command limit |

---

## Build Order

Ranked strictly by: (revenue impact × onboarding impact) ÷ development effort.

---

### Step 1 — Upstash: Upgrade to Pay-As-You-Go
**Estimated:** 0.5h | **Type:** Ops | **Blocks:** Everything else  
**Dependency:** None

**Why first:** The free tier has already hit 500,000 commands in beta. A live club generating push notifications + availability requests will blow past it within a month. If data is being throttled or dropped, no other work matters.

**Exact steps:**
1. Log into [console.upstash.com](https://console.upstash.com)
2. Switch billing plan to Pay-As-You-Go (~$0.20 per 100K commands, effectively free at low volume)
3. Confirm pricing cap is set (prevent surprise bills)
4. Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set in Vercel env

**Verification:** Run one QA workflow after upgrade. Confirm it completes without Redis errors.

---

### Step 2 — Self-Service Club Signup
**Estimated:** 7–9h | **Type:** Build | **Blocks:** All acquisition

**Why second:** Nothing else matters if coaches can't sign themselves up. This is the front door.

**What exists:**
- `provisionClub()` function in `api/_identityStore.js:1049` — already validates all inputs, creates team + coach atomically, hashes password, rejects duplicate team codes
- `POST /api/identity` with `action: 'provision_club'` at `api/identity.js:198` — exists but requires `CRON_SECRET` Bearer token (correct for cron jobs, wrong for public signup)

**What to build:**

**Backend (2h):**
- Add a new public action `'signup'` in `api/identity.js` (no CRON_SECRET check — rate-limit by IP instead)
- OR: move `provision_club` to accept a different auth path (e.g. unauthenticated POST to `/api/signup`)
- Reuse `provisionClub()` directly — the function itself is ready
- Add simple rate limiting: max 3 signups per IP per hour (prevent abuse)
- Auto-generate `teamId` from `teamCode` (strip to uppercase, replace spaces with dashes)

**Frontend (4h):**
- New `#signupPanel` section in `index.html`, shown from the auth panel login screen
- Fields: Club Name, Team Code (editable, auto-suggested from club name), First Name, Last Name, Email, Password (min 8 chars), Confirm Password
- On submit: `POST /api/signup`, then auto-login the coach (reuse `loginUser()`)
- Inline error handling: "Team code already taken", "Email already registered"
- After signup: navigate directly to coach dashboard (not the join/login flow)

**Team code UX (1h):**
- Auto-fill team code from club name (uppercase, spaces→hyphens, max 12 chars)
- Allow editing
- Add "Check availability" button or real-time validation
- Display on success screen: "Your team join code is **BALLYMENA**. Share this with your players."

**Dependencies:** None (provisionClub function is ready)

**Verification:** A brand-new browser session can sign up and see the coach dashboard with an empty squad.

---

### Step 3 — Player Approval Email
**Estimated:** 2–3h | **Type:** Fix | **Blocks:** Onboarding funnel

**Why third:** This is the cheapest fix with the highest onboarding impact. A player who submits an approval request and hears nothing for 24 hours does not come back.

**What exists:**
- `approveJoinRequest()` in `api/_identityStore.js:646` — fully implemented, no email sent
- Password reset email presumably works already (implies an email service is configured)

**Check first:** Identify what email service is configured. Search for:
```bash
grep -r "sendEmail\|Resend\|Sendgrid\|postmark\|nodemailer\|smtp\|RESEND\|SENDGRID" api/
```
If no email service exists, add [Resend](https://resend.com) (free tier covers 3,000 emails/month — enough for a rugby club).

**What to build:**

**Backend (1.5h):**
- In `approveJoinRequest()`, after `await saveTeamMembers(members)` (line ~693), add:
  ```javascript
  await sendApprovalEmail({ email: user.email, firstName: user.firstName, teamName: team.name, teamCode: team.teamCode });
  ```
- Email body: "Welcome to [Club Name]. You're now an active member. Open the app here: [URL]. Your join code is [TEAMCODE]."
- Send async with try/catch — email failure must not break the approve flow

**Frontend (0.5h):**
- Confirm the coach-side "approve" button shows confirmation after the API call

**Verification:** W4 QA workflow — player receives email after coach approval.

---

### Step 4 — Remove Dead/Dangerous Surface Area
**Estimated:** 3–4h | **Type:** Remove | **Blocks:** Credibility with paying coaches

**Why fourth:** These ship before billing because a paying coach who sees "System Status" in their navigation, or discovers a Medical treatment log, will question whether the product knows what it is.

**4a — Remove Medical Section (1.5h):**
- Delete all `#medicalSection` / `renderMedical()` / `renderInjuryLog()` related HTML, CSS, and JS from `index.html`
- Remove corresponding API handlers (if any in `api/`)
- Remove "⚕ Medical" from coach navigation
- GDPR reason: medical data = Article 9 special category. Remove before onboarding strangers.

**4b — Remove Tactics Canvas (1h):**
- Delete `#tacticsSection` / `renderTactics()` / canvas drag code from `index.html`
- Remove "📋 Tactics" from coach navigation

**4c — Remove System Status from Coach Nav (0.5h):**
- Remove "⚙ System Status" nav item from coach navigation rendering
- The `/api/mission-control` endpoint can stay (it's already auth-protected) — just remove it from the nav

**4d — Delete V1 Message Center dead code (0.5h):**
- In `index.html`, find `renderMessageCenter()` — it immediately calls `renderMessageCenterV2()`
- Delete the ~260 lines of V1 implementation that follow (they are never reached)

**Verification:** Coach logs in and sees only: Overview, Availability, Messages, Training, Matchday, Players. Nothing else.

---

### Step 5 — Stripe Billing Integration
**Estimated:** 10–12h | **Type:** Build | **Blocks:** Revenue

**Why fifth:** Must exist before launch, but you can sign up 1–2 test coaches manually on a trial basis while this is being built. Do not delay the signup form waiting for Stripe.

**Pre-requisites:**
- Stripe account (stripe.com → create account → get test keys)
- Create one Product in Stripe: "Coach's Eye Club" at £25/month (or equivalent)
- Set Vercel env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`

**What to build:**

**Club status model (0.5h):**
- Add `billingStatus: 'trial' | 'active' | 'cancelled'` and `trialEndsAt` to the team record
- Set `billingStatus: 'trial'`, `trialEndsAt: +14 days` in `provisionClub()`

**Stripe Checkout endpoint (2h):**
- `POST /api/billing` with `action: 'create_checkout'` — authenticated (coach only)
- Creates a Stripe Checkout Session with `mode: 'subscription'`, `price: STRIPE_PRICE_ID`
- Returns `{ url }` — frontend redirects to Stripe hosted checkout page
- On success, Stripe redirects to `/success?session_id=...`; on cancel, back to the app

**Stripe webhook handler (3h):**
- `POST /api/billing` with `action: 'webhook'` — verified with `stripe.webhooks.constructEvent()`
- Listen for:
  - `checkout.session.completed` → set `billingStatus: 'active'`, save `stripeCustomerId` + `stripeSubscriptionId` to team record
  - `invoice.payment_failed` → send coach an email ("your payment failed, update card")
  - `customer.subscription.deleted` → set `billingStatus: 'cancelled'`
- Verify Stripe signature on every webhook call

**Trial enforcement (2h):**
- In the coach auth flow, after login, check team `billingStatus` and `trialEndsAt`
- If `billingStatus === 'trial'` and `trialEndsAt < now`: redirect to billing screen, block dashboard
- If `billingStatus === 'trial'` and `trialEndsAt > now`: show a subtle banner "Trial expires in X days"
- If `billingStatus === 'active'`: no restriction

**Billing UI (2.5h):**
- Simple billing page in coach dashboard: current status, next billing date, "Upgrade now" button
- "Upgrade now" → calls `/api/billing` → redirects to Stripe Checkout
- After Stripe redirects back with `?session_id=...`: show "Payment successful — your club is now active"

**Cancel flow (1h):**
- Coach can cancel from billing page (POST to `/api/billing` with `action: 'cancel'`)
- Cancel at period end (not immediate) — set Stripe subscription `cancel_at_period_end: true`
- Show "Cancellation scheduled for [date]"

**Dependencies:** Step 1 (Upstash), Stripe account set up

**Verification:** Create a test club → enter Stripe test card → webhook fires → `billingStatus` becomes `'active'` → coach dashboard accessible.

---

### Step 6 — Coach: Change Password UI
**Estimated:** 3–4h | **Type:** Build | **Blocks:** Support calls

**Why sixth:** A coach who can't change their password calls you. This is support overhead, not a nice-to-have.

**What exists:**
- Password reset via email token (`request_password_reset` + `reset_password` actions in `api/identity.js`) — works
- No `change_password` action exists

**What to build:**

**Backend (1.5h):**
- Add `action: 'change_password'` to `api/identity.js` (requires auth session)
- Verify `currentPassword` against stored hash before setting new password
- Reject if new password < 8 chars
- Return `{ ok: true }` on success

**Frontend (2h):**
- "Change Password" option in coach profile/settings
- Form: Current Password, New Password (min 8 chars), Confirm New Password
- On success: "Password updated"
- On error: "Current password is incorrect"

**Verification:** Coach logs in, changes password, logs out, logs back in with new password.

---

## Hour Summary

| Step | Task | Hours |
|------|------|-------|
| 1 | Upstash upgrade | 0.5h |
| 2 | Self-service signup | 7–9h |
| 3 | Player approval email | 2–3h |
| 4 | Remove dead/dangerous code | 3–4h |
| 5 | Stripe billing | 10–12h |
| 6 | Change password UI | 3–4h |
| **Total** | | **26–32h** |

At a focused pace (4–6h/day), this is 5–7 days of work.

---

## Dependency Graph

```
[1 Upstash upgrade]
       │
       ▼
[2 Self-service signup] ──────► [3 Approval email]
       │
       ▼
[4 Remove dead code]
       │
       ▼
[5 Stripe billing] ──────────► [6 Change password]
       │
       ▼
  LAUNCH READY
```

Steps 3 and 6 are independent and can be done in parallel with their upstream steps.

---

## MVP Launch Checklist

*Complete before any club pays:*

- [ ] Upstash on Pay-As-You-Go (no command limit risk)
- [ ] Coach can sign up at a URL without any developer involvement
- [ ] Team code is auto-generated, unique, and shown to coach on signup
- [ ] Coach can invite players via team join code (this already works)
- [ ] Player joins → coach approves → player receives confirmation email
- [ ] Medical section removed from UI
- [ ] Tactics canvas removed from UI
- [ ] System Status removed from coach navigation
- [ ] V1 Message Center dead code deleted
- [ ] Coach can change their password from within the app
- [ ] Stripe billing flow works end-to-end in test mode
- [ ] Stripe webhook handler deployed and verified with `stripe listen`
- [ ] Trial period of 14 days enforced — expired trial blocks dashboard, not the app permanently
- [ ] Availability request → push notification → structured reply confirmed working (existing W3 QA)
- [ ] Nightly QA passing all workflows (no regressions on the above changes)

---

## First Paying Customer Checklist

*Complete before first invoice is paid:*

- [ ] Stripe live mode keys deployed to Vercel (`STRIPE_SECRET_KEY` live, not test)
- [ ] Stripe webhook endpoint registered at production URL in Stripe dashboard
- [ ] Test Stripe live mode with real £1 charge (use Stripe's `£0.50` minimum product)
- [ ] Club created in live environment, payment confirmed, `billingStatus: 'active'`
- [ ] Coach receives no 500 errors during onboarding flow
- [ ] Player can join via team code without coach's help
- [ ] Push notifications working on iOS Safari (PWA install prompt visible)
- [ ] Availability request received as push notification on physical iPhone
- [ ] Privacy policy page exists and is linked from signup page (GDPR minimum)
- [ ] Terms of service page exists and is linked from signup page
- [ ] Contact email address is published somewhere on the site (GDPR requirement)
- [ ] Coach can recover account via "Forgot password" without calling Simon
- [ ] Billing confirmation email sent by Stripe on successful payment
- [ ] Cancellation flow tested: coach cancels → subscription ends at period end → club marked cancelled

---

## What Is Out of Scope for Phase A

These have been requested or discussed but must not be built until after first paying customer:

| Item | Reason to defer |
|------|-----------------|
| Multi-team per club | Complexity > value at 1 club |
| Admin / secretary role | One coach per club is sufficient |
| Stripe Customer Portal | Manual cancellation flow is fine for first 5 clubs |
| Analytics dashboard | Not useful until 3+ clubs |
| Calendar export | No fixture integration yet |
| Group conversations | Nobody uses before they onboard |
| Matchday selection polish | Works well enough already |
| Notification scheduling | Manual "send request" is fine |
| GDPR data export | Phase B — needed before EU scale, not before first signup |

---

## The Single Most Important Sentence

**Nothing in Phase A matters more than Step 2 (signup) + Step 5 (billing) — the front door and the checkout.**  
Everything else is noise until a stranger can discover the product, create a club, and pay without a developer being involved.
