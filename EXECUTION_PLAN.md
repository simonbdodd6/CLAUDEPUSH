# Coach's Eye — Execution Plan

**Objective:** An external rugby coach can discover Coach's Eye, create a club, invite players, receive notifications, and pay.  
**Date:** 2026-06-08  
**Source documents reviewed:** LAUNCH_ROADMAP.md, PHASE_A_LAUNCH_PLAN.md, FIRST_CUSTOMER_PLAN.md

---

## 1. Current Launch Readiness Score: 3/10

The product works. The business does not exist yet.

| Dimension | Score | Why |
|-----------|-------|-----|
| Core product (availability + push + messaging) | 7/10 | These work. This is the reason to pay. |
| External onboarding (can a stranger sign up?) | 0/10 | Impossible without developer curl command |
| Billing (can anyone pay?) | 0/10 | Zero billing code exists anywhere |
| First impression / trust | 4/10 | Medical section + System Status undermine credibility |
| Onboarding funnel completion | 4/10 | Players join, hear nothing, don't return |
| Infrastructure stability | 6/10 | Upstash on free tier; hit limit once already |

**Score: 3/10.** A coach who discovered this today could not sign up, pay, or confidently onboard their squad.

---

## 2. Remaining Blockers Before First External Customer

### Hard Blockers — These make first customer *impossible*

| # | Blocker | Detail |
|---|---------|--------|
| **H1** | No self-service signup | Coaches cannot create a club. Only path is a developer curl command. |
| **H2** | No billing | No Stripe integration exists — not one line of code. Cannot charge anyone. |

### Soft Blockers — These make first customer *unlikely to stay*

| # | Blocker | Detail |
|---|---------|--------|
| **S1** | No player approval email | Player requests to join → hears nothing → doesn't return. Coach has empty squad. |
| **S2** | Medical + System Status visible to coaches | App looks unfinished. A paying coach seeing Redis health in their navigation loses confidence. |
| **S3** | "BOITSFORT" hardcoded in share copy | `index.html:5922` — share button generates "Join Boitsfort RFC on coacheseyeGPT!" for every club. |
| **S4** | No landing page | A stranger hitting the URL sees a dark app loading with no explanation of what it is or what it costs. |
| **S5** | Upstash on free tier | 500K command limit. One active club in season will hit it. Data throttling ends the relationship. |
| **S6** | No change-password UI | Coach receives signup credentials, tries to update password, no UI exists. Support call on day 1. |

---

## 3. Blockers Already Solved

These appeared in earlier planning documents as open issues. They are already resolved. Do not rebuild them.

| Item | Status | Evidence |
|------|--------|---------|
| `provisionClub()` backend | ✅ Complete | `api/_identityStore.js:1049` — validates all fields, creates team + coach atomically, hashes password, rejects duplicate team codes |
| Resend email infrastructure | ✅ Live | `api/_email.js` — invites and password reset already send. `RESEND_API_KEY` is configured. |
| Player invite flow (email + group link) | ✅ Working | W4 QA passes |
| Auth (session, roles, cookies) | ✅ Complete | 30-day session TTL, role-based access |
| Password reset (email token) | ✅ Working | `request_password_reset` + `reset_password` actions in `api/identity.js` |
| `/api/mission-control` auth | ✅ Done | `requireTenantRole(req, ['coach', 'admin'])` at `api/mission-control.js:258` |
| `LEGACY_STAFF_ACCOUNTS` plaintext | ✅ Done | Uses `passwordEnv: 'LEGACY_COACH_PASSWORD'` — env var, not hardcoded |
| KNOWN_ISSUES W1 (mission-control) | ✅ Resolved | See above |
| KNOWN_ISSUES W3 (plaintext password) | ✅ Resolved | See above |
| Core app features | ✅ Working | Availability requests, push notifications, squad messaging, matchday selection |

---

## 4. Ranked Implementation Order

Ranked by: (revenue unblock × onboarding unblock) ÷ effort.

| Rank | Task | Hours | Type | Unblocks |
|------|------|-------|------|---------|
| **1** | Self-service signup form + API endpoint | 7–9h | Build | H1 — makes external signup possible |
| **2** | Remove Medical + System Status from coach nav | 2h | Remove | S2 — trust/credibility |
| **3** | Fix BOITSFORT hardcode in share copy | 0.5h | Fix | S3 — correctness |
| **4** | Player approval email | 2h | Fix | S1 — onboarding funnel |
| **5** | Upstash → Pay-As-You-Go | 0.5h | Ops | S5 — stability |
| **6** | Welcome email on signup | 1h | Build | Coach knows their team code on day 1 |
| **7** | Coach change-password UI | 3h | Build | S6 — support cost |
| **8** | Minimal landing/discovery copy | 2h | Build | S4 — discovery |
| **9** | Stripe billing (Checkout + webhook + trial) | 10–12h | Build | H2 — revenue |

**Total to H1 gone:** 7–9h  
**Total to all hard + soft blockers resolved:** ~32–34h

---

## 5. Estimated Hours Per Task

| Task | Low | High | Notes |
|------|-----|------|-------|
| Signup form (API + frontend) | 7h | 9h | `provisionClub()` is done; this is wrapper + UI |
| Remove Medical + System Status | 1.5h | 2h | HTML + CSS + state cleanup |
| Fix BOITSFORT hardcode | 0.25h | 0.5h | One line → `state.teamName` |
| Player approval email | 1.5h | 2h | Resend wired up; template + one call |
| Upstash upgrade | 0.25h | 0.5h | Dashboard click, not code |
| Welcome email on signup | 0.75h | 1h | Template + call after `provisionClub()` |
| Coach change-password UI | 2.5h | 3h | New endpoint + settings form |
| Landing / discovery copy | 1.5h | 2h | New splash state before auth |
| Stripe billing (full) | 10h | 12h | Checkout + webhook + trial + cancel |
| **Total** | **25.25h** | **32h** | |

---

## 6. Build Next: Self-Service Signup

Without a signup form, the objective sentence is not achievable. Full stop.

Everything else on the list assumes the coach is already in the system. The signup form is the prerequisite to all of it.

---

## 7. Build After That: Remove Medical + System Status + Fix BOITSFORT (2.5h combined)

These three are done as one session:
- Remove Medical nav item from `coachSections` (line 1823)
- Remove System Status nav item from `coachSections` (line 1825) and the filter at line 4007–4009
- Fix BOITSFORT hardcode in share copy (line 5922 → use `state.teamName`)

The first thing a newly-signed-up coach does is explore the nav. If they see "Medical" and "⚙ System Status", they question whether the product knows what it is. Fix this before the first external coach onboards.

---

## 8. Highest Revenue Impact Task

**Stripe billing.** Nothing generates revenue without it. However, at the single-first-customer stage, this can be bridged with a manual Stripe payment link (dashboard, no code) for 1–2 weeks. It is not the *next* task but is the *most important* task for revenue at scale.

---

## 9. Highest Adoption Impact Task

**Self-service signup.** Adoption requires coaches to be able to onboard themselves. A product that requires developer intervention to sign up is not adoptable — it is a demo. This task converts the product from demo to product.

---

## 10. Highest Risk Reduction Task

**Player approval email.** The approval email is the smallest effort / highest risk-reduction item on the list. Without it, the onboarding funnel has a silent drop-off point that the coach never sees: player requests to join, hears nothing for 24 hours, gives up. The coach then wonders why their players haven't onboarded. This is the most common reason a SaaS coach would abandon a product in the first week — not a missing feature, but a broken workflow that silently loses their players.

---

## Recommended Next Task: Self-Service Signup

### Why This Task

It is the single thing that makes the goal sentence true. Every other task on the list requires the coach to already be in the system. The signup form is the prerequisite.

Current state: `provisionClub()` exists and is complete. A developer with a terminal and `CRON_SECRET` can provision a club. A coach in another country cannot. The signup form closes that gap.

**Decision logic:**
- Remove Medical/Tactics (2h) → coach nav looks cleaner, but coach still can't sign up → objective not met
- Approval email (2h) → onboarding funnel improved, but no new coaches enter the funnel → objective not met
- Stripe billing (10h) → coaches could pay, but they still can't sign up first → objective not met
- **Signup form (7–9h) → objective becomes achievable for the first time**

---

### Files Involved

| File | Change |
|------|--------|
| `api/identity.js` | New `action: 'signup'` branch — unauthenticated POST, calls `provisionClub()`, rate-limited by IP, auto-creates session on success |
| `api/_identityStore.js` | No changes needed — `provisionClub()` is already complete |
| `api/_email.js` | New `welcomeEmail()` template function — club name, team code, app URL |
| `index.html` | New `#signupPanel` section in auth panel; "Create club" tab on auth screen; auto-login redirect to coach dashboard |

---

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `index.html` is a 483KB inline SPA — inserting a new panel incorrectly breaks rendering | High | Add the panel adjacent to the existing `#loginPanel` pattern; test auth panel state machine carefully |
| Public endpoint can be abused to create spam clubs | Medium | IP rate limit: max 3 signups per IP per hour (same pattern as `enforceRateLimit` already used in `api/identity.js`) |
| Team code collision UX — user submits, gets 409, doesn't know why | Medium | Suggest auto-generated code from club name; validate uniqueness on form submit with clear inline error |
| `provision_club` CRON_SECRET path must not be broken | Low | New `'signup'` action is a separate branch; `'provision_club'` action at line 198 is untouched |
| Auto-login after signup reuses session creation — must handle cookie setting correctly | Low | `createSession()` already used in login flow; same pattern applies |
| Welcome email sends to unverified email address | Low | Acceptable for v1 — email verification adds friction. Add later once churn from fake emails is observed. |

---

### Exact Implementation Plan

**Step 1 — New `signup` action in `api/identity.js` (2h)**

Add after line 204 (the `provision_club` block), before the `'Unknown identity action'` return:

```javascript
if (action === 'signup') {
  // Public endpoint — no session required, no CRON_SECRET
  // Rate limit: max 3 per IP per hour
  await enforceRateLimit('signup', rateIdentity(req, null), { limit: 3, windowMs: 60 * 60 * 1000 });

  const { teamName, teamCode, coachEmail, coachFirstName, coachLastName, coachPassword } = req.body || {};

  // Auto-generate teamId from teamCode
  const teamId = String(teamCode || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const result = await provisionClub({
    teamId,
    teamName,
    teamCode,
    coachEmail,
    coachFirstName,
    coachLastName,
    coachPassword,
  });

  // Auto-login: create session for the new coach
  const session = await createSession(result.user.id);
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader('Set-Cookie', sessionCookie(session.token, maxAge));

  // Send welcome email (non-blocking)
  sendTransactionalEmail({
    to: result.user.email,
    ...welcomeEmail({
      firstName: result.user.firstName,
      teamName: result.team.name,
      teamCode: result.team.teamCode,
      appUrl: appBaseUrl(req),
    }),
  }).catch(err => console.error('[signup] welcome email failed:', err.message));

  return res.status(201).json({ ok: true, user: result.user, team: result.team, teamMember: result.teamMember });
}
```

**Step 2 — `welcomeEmail()` template in `api/_email.js` (0.5h)**

Add after `passwordResetEmail()`:

```javascript
export function welcomeEmail({ firstName, teamName, teamCode, appUrl } = {}) {
  const safeName = String(firstName || 'Coach');
  const safeCode = String(teamCode || '').toUpperCase();
  return {
    subject: `Your Coach's Eye club is ready — ${teamName}`,
    text: `Hi ${safeName},\n\nYour club "${teamName}" is set up on Coach's Eye.\n\nShare this code with your players so they can join:\n\n  ${safeCode}\n\nOpen the app: ${appUrl}\n\nPlayers open the app, tap Join, and enter your code. You'll approve each request before they get access.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2>Your club is ready, ${safeName}.</h2>
      <p>Share this join code with your players:</p>
      <p style="font-size:32px;font-weight:900;letter-spacing:4px;color:#10b981;background:#f0fdf4;padding:16px 24px;border-radius:8px;display:inline-block">${safeCode}</p>
      <p>Players open the app, tap <strong>Join squad</strong>, and enter this code. You approve each request before they get access.</p>
      <p><a href="${appUrl}" style="display:inline-block;background:#10b981;color:white;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Open Coach's Eye</a></p>
    </div>`,
  };
}
```

**Step 3 — `#signupPanel` in `index.html` (4–5h)**

The auth panel currently has three states: `login`, `join` (player), `switch`. Add a fourth: `signup` (coach).

*3a. Add "Create club" tab to auth panel header (alongside Login / Join):*

In `renderAuthPanel()`, add a "Create club" button to the auth tab row that calls `setAuthTab('signup')`.

*3b. Add the signup panel HTML (rendered when `authTab === 'signup'`):*

```html
<div id="signupPanel" class="auth-panel" style="${authTab==='signup' ? '' : 'display:none'}">
  <strong>Create your club</strong>
  <small>Free 14-day trial · No card required to start</small>
  <form onsubmit="handleSignup(event)">
    <label>Club name</label>
    <input id="signupClubName" type="text" placeholder="Ballymena RFC" required
           oninput="suggestTeamCode(this.value)">
    <label>Team join code
      <span style="color:#64748b;font-weight:400;font-size:11px"> — players use this to join</span>
    </label>
    <input id="signupTeamCode" type="text" placeholder="BALLYMENA" maxlength="12"
           style="font-family:monospace;letter-spacing:2px;text-transform:uppercase" required>
    <label>Your first name</label>
    <input id="signupFirstName" type="text" placeholder="Paddy" required>
    <label>Your last name</label>
    <input id="signupLastName" type="text" placeholder="McCoach" required>
    <label>Email</label>
    <input id="signupEmail" type="email" placeholder="coach@ballymenarfc.com" required>
    <label>Password <span style="color:#64748b;font-weight:400;font-size:11px">(min 8 characters)</span></label>
    <input id="signupPassword" type="password" minlength="8" required>
    <div id="signupError" style="color:#ef4444;font-size:12px;display:none"></div>
    <button class="btn primary" type="submit" id="signupBtn">Create club</button>
  </form>
  <button class="btn ghost" type="button" onclick="setAuthTab('login')" style="margin-top:8px">
    Already have an account? Log in
  </button>
</div>
```

*3c. Add `suggestTeamCode()` and `handleSignup()` functions:*

```javascript
function suggestTeamCode(clubName) {
  const code = clubName.trim().toUpperCase()
    .replace(/\bRFC\b|\bFC\b|\bCC\b|\bRUGBY\b/g, '')
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 12);
  const el = document.getElementById('signupTeamCode');
  if (el && !el.dataset.edited) el.value = code;
}

async function handleSignup(e) {
  e.preventDefault();
  const btn = document.getElementById('signupBtn');
  const errEl = document.getElementById('signupError');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Creating…';

  try {
    const res = await fetch('/api/identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'signup',
        teamName:      document.getElementById('signupClubName').value.trim(),
        teamCode:      document.getElementById('signupTeamCode').value.trim().toUpperCase(),
        coachFirstName: document.getElementById('signupFirstName').value.trim(),
        coachLastName:  document.getElementById('signupLastName').value.trim(),
        coachEmail:    document.getElementById('signupEmail').value.trim(),
        coachPassword: document.getElementById('signupPassword').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Signup failed. Please try again.';
      errEl.style.display = 'block';
      return;
    }
    // Auto-login: server set the session cookie, now hydrate client state
    state.currentUserId = data.user.id;
    // Reload identity from server to get full team/member context
    await reloadIdentity();
    setAuthTab('closed');
    setSection('coach', 'overview');
    showToast(`Welcome to Coach's Eye, ${data.user.firstName}! Your team code is ${data.team.teamCode}.`);
  } catch (err) {
    errEl.textContent = 'Network error. Please try again.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create club';
  }
}
```

*3d. Mark team code as manually edited to stop auto-suggest overwriting it:*

Add `data-edited` attribute on user input to the team code field:
```javascript
document.getElementById('signupTeamCode').addEventListener('input', function() {
  this.dataset.edited = '1';
});
```

**Step 4 — Verify after implementation**

Manual test checklist (not QA automation — that is out of scope):
1. Open app in private browser window (no session)
2. Click "Create club" tab
3. Type club name — verify team code auto-suggests
4. Edit team code — verify auto-suggest stops
5. Submit form — verify redirect to coach dashboard
6. Check welcome email received at signup address
7. Verify team code shown in coach overview / share button
8. Open second private window, enter team code, request to join
9. Approve in coach window — verify player gets approval email
10. Try signing up with the same email again — verify "Email already registered" error
11. Try signing up with the same team code — verify "Team code already in use" error

---

### What This Task Does Not Include

- Stripe billing — not part of this task
- Email verification — deferred (adds friction before value is clear)
- Team code real-time availability check — 409 error on submit is sufficient for v1
- Medical / System Status removal — different task, different session
- Landing page — different task

These are the next tasks after signup ships.
