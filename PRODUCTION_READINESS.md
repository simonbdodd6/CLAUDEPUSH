# Production Readiness Report

**Date:** 2026-06-05  
**Branch:** feature/group-invites-registration  
**Commit:** 31a9efba  
**Scope:** Invite registration → pending approval → player login → coach ↔ player messaging

---

## Executive Summary

The individual invite flow (coach creates named link → player claims → instant active account) is production-ready and fully tested. The group invite flow (reusable link → pending approval → coach approval → player login) has a complete and tested backend, but has **three blocking issues** that prevent real player testing:

1. No Vercel deployment exists for this branch.
2. The coach UI cannot create group invites.
3. A security vulnerability allows a valid group invite token to be used to overwrite any user's password.

The messaging system between coach and approved player is architecturally sound and passes all server-side access checks.

---

## Deployment Status

| Item | Status |
|------|--------|
| GitHub branch | PUSHED — `feature/group-invites-registration` |
| Latest commit | `31a9efba` |
| Vercel deployment | **MISSING** — branch has never been deployed |
| Most recent READY deployment | `boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app` (different branch, older code) |
| Production (main) deployment | Last built from main at `81d3f62` — does not contain group invite feature |

**Action required:** Trigger a manual Vercel deployment from `feature/group-invites-registration` or confirm auto-deploy branch settings.

---

## Test Coverage

| Suite | Tests | Status |
|-------|-------|--------|
| invite-registration.test.js | 10 | PASS |
| group-invite.test.js | 17 | PASS |
| chat-api-unread.test.js | (included in total) | PASS |
| push-system.test.js | (included in total) | PASS |
| account-onboarding-flow.test.js | (included in total) | PASS |
| **Total** | **159/159** | **ALL PASS** |

Tests cover the full backend flow end-to-end. They do not cover frontend UI rendering.

---

## Flow Readiness by Stage

### Stage 1 — Create Group Invite

| Check | Status | Notes |
|-------|--------|-------|
| Backend API creates group invite | READY | Auth-protected, player-only enforced |
| Coach UI to create group invite | **BLOCKED** | No UI mechanism exists. `createInvite()` requires a name. |
| Invite list displays group invite | **BROKEN** | No copy/revoke buttons. Blank name. No usage count. |
| Copy button URL is environment-aware | **BROKEN** | Hardcoded to `boitsfort-coachseye-gpt.vercel.app` — wrong on preview |

---

### Stage 2 — Player Opens Invite Link

| Check | Status | Notes |
|-------|--------|-------|
| `?inv=` parameter detection | READY | Fires after page render |
| Token validated by server | READY | Returns type, role, name correctly |
| Group invite modal renders correctly | READY | Separate first/last name fields |
| Expired or revoked token | READY | 410 with clear error |

---

### Stage 3 — Player Registers

| Check | Status | Notes |
|-------|--------|-------|
| Form validation (all 4 fields) | READY | Clear per-field error messages |
| POST to /api/identity join_group_invite | READY | Correct action routing |
| Pending team member created | READY | `status: 'pending'`, no session |
| Success UX (toast, no redirect) | READY | Correct — player is not logged in |
| Error UX (button re-enabled) | READY | Handles all API errors |
| **Password overwrite vulnerability** | **SECURITY FAIL** | Coach email + group token = coach password replaced |
| Rate limiting | MISSING | No limit on registration attempts |

---

### Stage 4 — Coach Approves Player

| Check | Status | Notes |
|-------|--------|-------|
| Pending player blocked from login | READY | 403 "Waiting for coach approval" |
| Pending requests visible in coach panel | READY | `data.pending` populated correctly |
| Coach can click Approve | READY | POSTs correct memberId |
| Approval requires coach session | READY | requireTenantRole enforced |
| Player profile created on approval | READY | legacyPlayerId = user.id |
| Approved player added to roster locally | READY | applyApprovedIdentityLocally works |
| Player notified of approval | MISSING | No email, push, or in-app notification |

---

### Stage 5 — Player Logs In

| Check | Status | Notes |
|-------|--------|-------|
| Approved player can log in | READY | Active team member, password verified |
| Pending player cannot log in | READY | Blocked at loginUser |
| Player state set correctly after login | READY | activeView, selectedChatId, allowedDmIds |
| Session cookie set | READY | 30-day HttpOnly Secure SameSite=Lax |

---

### Stage 6 — Coach ↔ Player Messaging

| Check | Status | Notes |
|-------|--------|-------|
| DM conversation ID consistent both sides | READY | Both resolve dm:coach-demo:user_XXXX |
| Chat API auth enforced for player | READY | requireConversationAccess blocks unauth |
| Coach can send first message | READY | create_conv + send both work |
| Player can reply | READY | Session-verified, participant check passes |
| Player sees Squad + Announcements | READY | ensureDefaults creates them |
| Player sees DM before coach initiates | NOT AVAILABLE | DM doesn't exist until coach creates it |

---

## Security Assessment

| Issue | Severity | Status |
|-------|----------|--------|
| Group invite allows password overwrite of existing accounts | **Critical** | **NOT FIXED** |
| Unauthenticated routes (push, schedules, templates, log, availability, chat) | Fixed | Fixed in security baseline (main) |
| Auto-PIN login removed | Fixed | Fixed in security baseline (main) |
| Credentials in frontend source | Fixed | Fixed in security baseline (main) |
| Session tokens hashed in Redis | Done | SHA-256 hash stored, never raw token |
| Password hashing | Done | scrypt 64-byte key, timing-safe compare |
| Rate limiting on login | Done | 5 attempts per 15 min |
| Rate limiting on group invite registration | **Missing** | No limit — any group token can be spammed |
| INVITES_KEY uses no APP_KEY_PREFIX | Amber | `ce:invites` is not prefixed — doesn't isolate between environments |

---

## Known Assumptions Requiring Manual Testing

These items pass in automated tests but cannot be verified without a live deployment:

1. **Browser cookie behaviour** — Session cookie sent on same-origin fetch from invite modal (SameSite=Lax). Verified in theory, untested in a real browser.
2. **Mobile modal layout** — Invite modal uses fixed positioning and viewport assumptions. Not tested on iPhone/Android.
3. **Pending toast UX** — Toast fires after modal closes. On slow connections, the user may see a blank page before the toast appears. Acceptable but worth checking.
4. **Coach session expiry during approval** — `ensureServerSessionForCurrentUser` may return false silently. The error message "Try Login, then Refresh" appears. Whether coaches understand this requires testing.
5. **Player DM before coach initiates** — Player lands on Messages section after login. If no DM exists yet, the section is likely blank or shows only squad/announcements. The UX impact requires testing.
6. **Push notification subscription** — `refreshPushSubscriptionMetadata` is NOT called after group invite registration (correct — player is not logged in). Called after login. Whether the subscription is correctly created after first login requires browser testing.

---

## Highest-Priority Task for Tomorrow Morning

### FIX the password overwrite vulnerability in `joinViaGroupInvite`

**File:** `api/_identityStore.js:800–835`

**Why this is #1:** A group invite token is a semi-public link that may be shared widely. The current code allows anyone with a valid token to overwrite the password of any existing user (including the coach) simply by knowing their email address. The fix is small: check whether the email matches an existing user with `status: 'active'` on the team before calling `upsertUserAccount`, or move the team member status check before the password update. This must be fixed before any real player testing begins.

**Secondary tasks (in order):**
1. Add a UI toggle in the coach invite panel to create group invites (type: 'group', no name required)
2. Fix group invite list rendering to show copy button, revoke button, and usage count for `status: 'active'` invites
3. Trigger a Vercel deployment from `feature/group-invites-registration`
4. Add rate limiting to the `join_group_invite` action
5. Fix hardcoded production URL in the invite list copy button

---

## Files Changed in This Feature Branch (vs main at 81d3f62)

| File | Changes |
|------|---------|
| `api/_identityStore.js` | Added `joinViaGroupInvite` export |
| `api/invite.js` | POST accepts `type: 'group'`; GET returns `type` and `usageCount` |
| `api/identity.js` | Added `join_group_invite` action handler |
| `index.html` | `showInviteModal` group variant; `acceptInvite` group path |
| `test/group-invite.test.js` | 17 new tests (new file) |
