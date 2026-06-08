# Self-Service Signup — Implementation Plan

**Date:** 2026-06-08  
**Status:** Awaiting approval — no code changed yet  
**Estimated effort:** 4–5 hours

---

## What Already Exists

Before writing a line of code, this is already done:

| Component | Location | Status |
|-----------|----------|--------|
| `provisionClub()` | `api/_identityStore.js:1049` | Complete. Validates all fields, creates team + coach atomically, hashes password, rejects duplicate team codes and emails. |
| `createSession()` | `api/_identityStore.js:953` | Complete. Creates 30-day session token. |
| `sessionCookie()` | `api/_identityStore.js:165` | Complete. Sets cookie with correct flags. |
| `sendTransactionalEmail()` | `api/_email.js:12` | Complete. Resend is wired and working. |
| `enforceRateLimit()` | `api/_security.js` | Complete. Already used for login, password reset. |
| `auditLog()` | `api/_security.js` | Complete. Already used throughout identity flow. |
| Auth panel state machine | `index.html:3829` | Complete. `authTab` drives `login`, `join`, `switch`, `closed` states. |
| Post-login coach state wiring | `index.html:3883–3899` | Complete. Sets `state.currentUserId`, `state.activeView`, calls `saveState`, `render`, `refreshMembersData`. |

**This implementation adds a thin layer on top of all of the above.** Nothing gets rebuilt.

---

## Files to Modify (3 files only)

### 1. `api/identity.js`
Add one import (`createSession`) and one new `action: 'signup'` block — 20 lines total.

### 2. `api/_email.js`
Add `welcomeEmail()` template function — 25 lines total.

### 3. `index.html`
- Add `handleCoachSignup()` function — ~50 lines
- Add signup panel HTML to the auth tab chain — ~30 lines
- Add "Create club" button to the closed/default auth state — 1 line
- Fix `state.teamCode` post-signup so "BOITSFORT" doesn't persist

---

## Exact Implementation

### Step 1 — `api/identity.js`: Add `createSession` import and `signup` action

**Import change** (line 1–17):  
Add `createSession` to the imports from `_identityStore.js`:

```javascript
// Before:
import {
  approveJoinRequest,
  claimInvite,
  clearSessionCookie,
  createPasswordResetRequest,
  destroySession,
  createJoinRequest,
  joinViaGroupInvite,
  listIdentityState,
  loginUser,
  provisionClub,
  rejectJoinRequest,
  resetPasswordWithToken,
  resolveSessionFromRequest,
  sessionCookie,
  sessionTokenFromRequest,
} from './_identityStore.js';

// After: add createSession
import {
  approveJoinRequest,
  claimInvite,
  clearSessionCookie,
  createPasswordResetRequest,
  createSession,                // ← add this
  destroySession,
  createJoinRequest,
  joinViaGroupInvite,
  listIdentityState,
  loginUser,
  provisionClub,
  rejectJoinRequest,
  resetPasswordWithToken,
  resolveSessionFromRequest,
  sessionCookie,
  sessionTokenFromRequest,
} from './_identityStore.js';
```

Also add `welcomeEmail` to the email imports (line 18):

```javascript
// Before:
import { appBaseUrl, passwordResetEmail, sendTransactionalEmail } from './_email.js';

// After:
import { appBaseUrl, passwordResetEmail, welcomeEmail, sendTransactionalEmail } from './_email.js';
```

**New `signup` action block** — insert after line 203 (after the `provision_club` block), before line 205 (`return res.status(400)...`):

```javascript
if (action === 'signup') {
  await enforceRateLimit('signup', requestIp(req), { limit: 3, windowMs: 60 * 60 * 1000 });
  const rawCode = String(req.body?.teamCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!rawCode) return res.status(400).json({ ok: false, error: 'Team code is required' });
  const teamId = rawCode.toLowerCase();
  const result = await provisionClub({ ...req.body, teamId });
  const session = await createSession({ userId: result.user.id, teamId: result.team.id, role: 'coach' });
  res.setHeader('Set-Cookie', sessionCookie(session.token));
  await auditLog('signup', { email: result.user.email, teamId: result.team.id, ip: requestIp(req) });
  sendTransactionalEmail({
    to: result.user.email,
    ...welcomeEmail({ firstName: result.user.firstName, teamName: result.team.name, teamCode: result.team.teamCode, appUrl: appBaseUrl(req) }),
  }).catch(err => console.error('[signup] welcome email failed:', err.message));
  return res.status(201).json({ ok: true, user: { ...result.user, role: 'coach' }, team: result.team, teamMember: result.teamMember });
}
```

**Why `teamId = rawCode.toLowerCase()`:**  
`provisionClub()` already enforces uniqueness on both `teamId` and `teamCode`. Using the normalised team code as the ID gives human-readable Redis keys (`ballymena`, `munsterrfc`) and means a duplicate signup attempt fails correctly with a 409 on the first check.

---

### Step 2 — `api/_email.js`: Add `welcomeEmail()` template

Append after `passwordResetEmail()` (currently the last export, line 57–71):

```javascript
export function welcomeEmail({ firstName, teamName, teamCode, appUrl } = {}) {
  const name = String(firstName || 'Coach');
  const code = String(teamCode || '').toUpperCase();
  const team = String(teamName || 'your club');
  return {
    subject: `Your Coach's Eye club is ready — ${team}`,
    text: `Hi ${name},\n\nYour club "${team}" is set up on Coach's Eye.\n\nShare this join code with your players:\n\n  ${code}\n\nPlayers open the app, tap "Join squad", and enter this code. You approve each request before they get access.\n\nOpen the app: ${appUrl}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;max-width:480px">
        <h2 style="color:#0f172a">Your club is ready, ${name}.</h2>
        <p>Share this join code with your players:</p>
        <div style="font-size:28px;font-weight:900;letter-spacing:5px;color:#10b981;background:#f0fdf4;padding:14px 20px;border-radius:8px;display:inline-block;margin-bottom:16px">${code}</div>
        <p>Players open the app, tap <strong>Join squad</strong>, and enter this code. You approve each request before they get access.</p>
        <p><a href="${appUrl}" style="display:inline-block;background:#10b981;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">Open Coach's Eye →</a></p>
        <p style="color:#64748b;font-size:12px;margin-top:24px">Coach's Eye · noreply@coachseye.app</p>
      </div>`,
  };
}
```

---

### Step 3 — `index.html`: Frontend signup

Three surgical edits to a single file.

---

#### 3a. Add `handleCoachSignup()` function

This goes near the other auth functions (`loginIdentityAccount`, `joinSquad`, `devCoachLogin`) — around line 3907 (after `devCoachLogin` ends):

```javascript
async function handleCoachSignup(e) {
  e.preventDefault();
  const clubName  = (document.getElementById('signupClubName')?.value  || '').trim();
  const teamCode  = (document.getElementById('signupTeamCode')?.value  || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const firstName = (document.getElementById('signupFirstName')?.value || '').trim();
  const lastName  = (document.getElementById('signupLastName')?.value  || '').trim();
  const email     = (document.getElementById('signupEmail')?.value     || '').trim();
  const password  = document.getElementById('signupPassword')?.value   || '';

  const errEl = document.getElementById('signupErrMsg');
  const btn   = document.getElementById('signupSubmitBtn');

  const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };
  errEl.style.display = 'none';

  if (!clubName)            return showErr('Club name is required');
  if (!teamCode)            return showErr('Team code is required');
  if (!firstName)           return showErr('First name is required');
  if (!lastName)            return showErr('Last name is required');
  if (!email)               return showErr('Email is required');
  if (password.length < 8)  return showErr('Password must be at least 8 characters');

  btn.disabled = true;
  btn.textContent = 'Creating club…';
  try {
    const res = await fetch('/api/identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'signup',
        teamName:       clubName,
        teamCode:       teamCode,
        coachFirstName: firstName,
        coachLastName:  lastName,
        coachEmail:     email,
        coachPassword:  password,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) return showErr(data.error || 'Signup failed — please try again');

    // Hydrate local state for the new coach so currentUser() works immediately
    const userId = data.user.id;
    const displayN = [data.user.firstName, data.user.lastName].filter(Boolean).join(' ') || data.user.email;
    if (!state.users.some(u => u.id === userId)) {
      state.users.push({ id: userId, role: 'coach', name: displayN, email: data.user.email, phone: '', pin: '' });
    }
    state.currentUserId        = userId;
    state.teamCode             = data.team.teamCode;
    state.activeView           = 'coach';
    state.activeCoachSection   = 'overview';
    _serverSessionReadyFor     = userId;
    _sessionExpiredMessage     = '';
    authTab = 'closed';
    saveState('Signed up');
    render();
    refreshMembersData();
    showToast(`Welcome to Coach\'s Eye, ${data.user.firstName || 'Coach'}! Your squad code is ${data.team.teamCode}.`);
  } catch (err) {
    showErr('Network error — please try again');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create club';
  }
}

function signupSuggestCode() {
  const name = (document.getElementById('signupClubName')?.value || '');
  const el   = document.getElementById('signupTeamCode');
  if (!el || el.dataset.edited) return;
  el.value = name.toUpperCase().replace(/\b(RFC|FC|CC|RUGBY|CLUB)\b/g, '').replace(/[^A-Z0-9]+/g, '').slice(0, 12);
}
```

---

#### 3b. Add signup panel to the auth tab chain

The auth panel ternary at line 4031 currently reads:

```javascript
document.getElementById("authPanel").innerHTML = authTab === 'login' ? `
  ...login html...
` : authTab === 'join' ? `
  ...join html...
` : authTab === 'switch' ? `
  ...switch html...
` : `
  ...default/closed html...
`;
```

Insert a new case **before the final `: \`` default case**:

```javascript
` : authTab === 'signup' ? `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <strong style="font-size:13px">Create your club</strong>
    <button class="auth-tab" type="button" onclick="setAuthTab('closed')" style="padding:4px 8px;font-size:11px">✕</button>
  </div>
  <form onsubmit="handleCoachSignup(event)" style="display:grid;gap:7px">
    <input id="signupClubName" type="text" placeholder="Club name (e.g. Ballymena RFC)"
      style="font-size:12px;padding:7px 9px" oninput="signupSuggestCode()" required>
    <input id="signupTeamCode" type="text" placeholder="Team join code (e.g. BALLYMENA)"
      style="font-size:12px;padding:7px 9px;font-family:monospace;letter-spacing:1px;text-transform:uppercase"
      maxlength="12" oninput="this.dataset.edited=1;this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'')" required>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
      <input id="signupFirstName" type="text" placeholder="Your first name" style="font-size:12px;padding:7px 9px" required>
      <input id="signupLastName"  type="text" placeholder="Last name"       style="font-size:12px;padding:7px 9px" required>
    </div>
    <input id="signupEmail"    type="email"    placeholder="Your email"        style="font-size:12px;padding:7px 9px" required>
    <input id="signupPassword" type="password" placeholder="Password (8+ chars)" style="font-size:12px;padding:7px 9px" minlength="8" required>
    <div id="signupErrMsg" style="color:#f87171;font-size:11px;display:none"></div>
    <button id="signupSubmitBtn" class="btn primary" type="submit" style="width:100%;font-size:12px">Create club</button>
  </form>
  <button class="btn ghost" type="button" onclick="setAuthTab('login')"
    style="width:100%;margin-top:6px;font-size:11px">Already have an account? Log in</button>
`
```

---

#### 3c. Add "Create club" button to closed/default auth state

In the default closed state (around line 4083–4085), the buttons are:

```javascript
<button class="auth-tab" type="button" onclick="setAuthTab('login')"  ...>Login</button>
<button class="auth-tab" type="button" onclick="setAuthTab('join')"   ...>Join</button>
<button class="auth-tab" type="button" onclick="setAuthTab('switch')" ...>Switch ↓</button>
```

Add one button after "Join":

```javascript
<button class="auth-tab" type="button" onclick="setAuthTab('signup')" style="padding:4px 8px;font-size:11px;white-space:nowrap">Create club</button>
```

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Template literal nesting in auth panel | Medium | The edit is inserting a new `authTab === 'signup' ? \`...\`` case before the final default backtick. Must be exact — mismatched backticks break the entire nav render. Read the surrounding lines carefully before editing. |
| `state.users` doesn't contain the new coach after signup | Medium | Handled in `handleCoachSignup()` — we push the user into `state.users` before calling `render()`. `refreshMembersData()` then syncs the full server state. |
| `state.teamCode` still "BOITSFORT" on first render | Low | Handled — `state.teamCode = data.team.teamCode` is set before `render()`. |
| `teamId` collision (e.g. two clubs both pick "BALLYMENA") | Low | `provisionClub()` already throws 409 on duplicate teamId or teamCode. The error surfaces in `signupErrMsg` as "Team code '...' is already in use". |
| Welcome email fails (Resend domain not verified for prod) | Low | Wrapped in `.catch()` — email failure does not block signup. Coach still gets in. |
| `enforceRateLimit` called with `requestIp(req)` directly (not `rateIdentity`) | Low | Intentional — signup is per-IP, not per-email. `rateIdentity` would split the limit across email+IP combos, which is too permissive for a public signup endpoint. |
| `index.html` line numbers shift — subsequent edits need re-reads | Low | Not a risk for this task, but flagged for whoever edits next. |

---

## What Is Not Changed

- `provisionClub()` — untouched
- `provision_club` action (CRON_SECRET path) — untouched, still works for cron/manual use
- Login flow — untouched
- Player join flow — untouched
- All QA workflows and agents — untouched
- Stripe, billing, Medical section, Tactics canvas — out of scope

---

## Estimated Hours

| Task | Hours |
|------|-------|
| `api/identity.js` — import + signup action | 0.75h |
| `api/_email.js` — welcomeEmail template | 0.5h |
| `index.html` — `handleCoachSignup()` + `signupSuggestCode()` | 1.5h |
| `index.html` — signup panel HTML + auth chain edit | 1h |
| `index.html` — "Create club" button in closed state | 0.25h |
| Manual verification (new browser, full signup → dashboard) | 0.5h |
| **Total** | **4.5h** |

---

## Manual Verification Checklist (post-implementation)

Run these by hand — not QA automation:

1. Open app in a private browser window (no session)
2. Auth panel shows "Login / Join / Create club" buttons
3. Click "Create club" → signup form appears
4. Type club name → team code auto-fills (stripped of RFC/FC/CC)
5. Edit team code manually → auto-suggest stops
6. Submit complete form → redirected to coach Overview
7. Toast shows "Welcome to Coach's Eye, [name]! Your squad code is [CODE]"
8. Coach Overview nav shows correct sections (no Medical after the cleanup task, but that's separate)
9. Check welcome email received at the signup email address
10. Welcome email contains the team code prominently
11. Open second private window → Join squad → enter the new team code → request sent
12. Back in coach window: approve the player
13. Duplicate email → "Email '...' is already registered" error in form
14. Duplicate team code → "Team code '...' is already in use" error in form
15. Password < 8 chars → form-level error (browser native or our errMsg div)

---

## Implementation Sequence

1. `api/_email.js` — add `welcomeEmail()` *(lowest risk, no dependencies)*
2. `api/identity.js` — add import + `signup` action *(depends on welcomeEmail existing)*
3. `index.html` — add `handleCoachSignup()` + `signupSuggestCode()` functions *(JS only, no HTML yet)*
4. `index.html` — add signup panel HTML to auth chain *(most surgical edit)*
5. `index.html` — add "Create club" button to closed state *(one-liner)*
6. Manual verification

---

## Ready to implement on approval.
