# Known Issues

**Last updated:** 2026-06-06
**Branch:** feature/nightly-qa-agent

This file tracks known issues, limitations, and deferred work. Items are classified as **Blocker**, **Warning**, or **UX**. All blockers must be resolved before production launch.

---

## Blockers

None currently open.

---

## Warnings

### W1 — `/api/mission-control` is unauthenticated
**File:** `api/mission-control.js`
**Detail:** The endpoint returns git commit history, branch list, file tree, and live Redis counts with no auth check. Anyone with the URL can read this data.
**Risk:** Medium — repository is currently private; payload is metadata, not user data.
**Fix:** Add `readSecret(req) !== process.env.CRON_SECRET` guard (same pattern as `cron.js`).
**Constraint:** `DO NOT TOUCH Mission Control` — deferred until constraint is lifted.

---

### W2 — `DELETE /api/subscribe` has no auth
**File:** `api/subscribe.js:56`
**Detail:** Anyone who knows a push subscription endpoint URL can delete it. No session required.
**Risk:** Low — push endpoint URLs are opaque 256-bit base64url strings not guessable by brute force. The worst outcome is a player loses push notifications until they re-subscribe.
**Fix:** Resolve session and validate that the deleting user owns the subscription, OR require Bearer token. Must verify service worker unsubscribe path still works.

---

### W3 — Coach demo account has plaintext password in source
**File:** `api/_identityStore.js:36`
**Detail:** `LEGACY_STAFF_ACCOUNTS` contains `password: '1111'` in plaintext. Used to bootstrap the coach login on first run.
**Risk:** Medium — anyone who reads the source can log in as coach. Acceptable for a private demo, unacceptable for production.
**Fix:** Move to `process.env.LEGACY_COACH_PASSWORD` with a strong default, or remove the bootstrap mechanism entirely and rely on self-service password reset.

---

### W4 — No rate limiting on group invite registration per token
**File:** `api/identity.js` (partially fixed — IP-based limit added 2026-06-06)
**Detail:** Rate limiting is now enforced per IP (10/hour). A distributed attacker with many IPs could still spam a group invite token.
**Risk:** Low — the group invite token must be known (not guessable), so this requires the attacker to already have the link.
**Fix:** Add per-token rate limit in addition to per-IP limit.

---

### W5 — `INVITES_KEY` not prefixed with `APP_KEY_PREFIX`
**File:** `api/_identityStore.js:11`, `api/invite.js:26`
**Detail:** `const INVITES_KEY = 'ce:invites'` — unlike all other keys, this one does not use `key()` to prepend `APP_KEY_PREFIX`. In a multi-environment setup with the same Redis instance, dev and prod invites would be in the same key.
**Risk:** Low — in practice, Vercel preview and production use separate Upstash databases.
**Fix:** Change to `const INVITES_KEY = key('invites')`. Requires a one-time Redis key migration if invites already exist.

---

### W6 — No player approval notification
**File:** `api/identity.js` (approve action), `api/_identityStore.js:approveJoinRequest`
**Detail:** When a coach approves a pending player, no email or push notification is sent. The player must attempt login to discover their account is active.
**Risk:** Low — the flow still works, but players may be confused about when they can log in.
**Fix:** Call `sendTransactionalEmail` with an "approved" template in the `approveJoinRequest` flow.

---

### W7 — `ensureServerSessionForCurrentUser` fails silently on session expiry
**File:** `index.html` (coach approval panel)
**Detail:** If the coach's session expires mid-session, the approval panel shows "Try Login, then Refresh" instead of automatically prompting re-login.
**Risk:** Low — sessions last 30 days.
**Fix:** Detect 401 responses and redirect to the login panel.

---

### W8 — Multiple password reset tokens could coexist before this fix
**File:** `api/_identityStore.js:resetPasswordWithToken`
**Status:** FIXED in `45705dc` — sibling reset tokens are now invalidated immediately on successful reset.

---

## UX

### U1 — Player sees no DM with coach until coach initiates
**Detail:** After first login, the Messages section shows Squad and Announcements but no DM. The conversation doesn't exist until the coach sends the first message.
**Status:** By design.
**Possible fix:** Create the DM stub in `approveJoinRequest`.

---

### U2 — `syncCurrentPlayerIdentityFromInvites` makes a wasted 403 on player sessions
**File:** `index.html`
**Detail:** On every player session load, the app GETs `/api/invite` which returns 403. The error is silently ignored.
**Fix:** Skip the invite list fetch for non-coach sessions.

---

## Fixed Issues (Closed)

| ID | Description | Fixed In |
|----|-------------|----------|
| FAIL-1 | No UI to create group invites | `cbb198b` |
| FAIL-2 | Group invite list display broken | `cbb198b` |
| FAIL-3 | Password overwrite security bug in `joinViaGroupInvite` | `cbb198b` |
| FAIL-4 | No Vercel deployment | `cbb198b` |
| FAIL-5 | `createInvite()` never sent `type` field | `cbb198b` |
| SEC-1 | Secrets exposed via `?secret` query param in `readSecret()` | `45705dc` |
| SEC-2 | No rate limit on `join_group_invite` | `45705dc` |
| SEC-3 | Multiple password reset tokens could be replayed after successful reset | `45705dc` |
| SEC-4 | Anonymous GET `/api/chat` returned all conversation metadata including private DMs | linter patch on `45705dc` |
| MOB-1 | Invite and password reset modal inputs at 14px triggered iOS auto-zoom | `45705dc` |
| URL-1 | Hardcoded production URL in team code share section | `45705dc` |
