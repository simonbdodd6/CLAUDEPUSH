# Security Fixes — Coach's Eye

**Date:** 2026-06-05  
**Branch:** feature/mission-control-dashboard  
**Status:** All RED blockers resolved. 142/142 tests passing.

---

## Fixed (RED → GREEN)

### 1. Unauthenticated API routes secured

All API routes that previously returned data without any authentication check are now protected with `requireTenantRole(req, ['coach', 'admin'])`.

| File | Before | After |
|------|--------|-------|
| `api/push.js` | Open POST — anyone could send push notifications to all players | Requires coach/admin session |
| `api/schedules.js` | Open GET/POST/PUT/DELETE — full schedule CRUD exposed | Requires coach/admin session |
| `api/templates.js` | Open GET/POST/DELETE — message template CRUD exposed | Requires coach/admin session |
| `api/log.js` | Open GET — full message delivery log exposed | Requires coach/admin session |
| `api/availability.js` (GET) | Open GET — all player availability records exposed | Requires coach/admin session |
| `api/availability.js` (POST) | Intentionally semi-public (push notification quick-reply) | Unchanged — requires endpoint or session |

### 2. Chat messaging access checks enforced

**`api/chat.js` — `requireConversationAccess`**

Previously: if no session existed, the function returned `true` (access granted). Any anonymous caller could read or write any conversation.

Fixed: if no session exists, the function now returns 401 `Authentication required` and denies access.

**`api/chat.js` — `create_conv` action**

Previously: the auth check only fired when a session existed but wasn't staff — unauthenticated callers could create conversations freely.

Fixed: authentication is required first; then the staff role check.

### 3. Hardcoded credentials removed from frontend

**`index.html` — `testAccounts` constant**

Previously: the frontend JavaScript shipped with real coach email, phone, and PIN:
```js
{ id: "coach-demo", role: "coach", name: "Simon Coach", email: "simonbdodd@gmail.com", phone: "+32470380938", pin: "1111" }
```

Fixed: only the display name is kept — no PII or credentials:
```js
{ id: "coach-demo", role: "coach", name: "Simon Coach" }
```

**`index.html` — `ensureServerSessionForCurrentUser`**

Previously: the function auto-logged in the coach by reading `user.pin` from in-memory state and POSTing it to `/api/identity`. This means the PIN was being submitted programmatically without the coach explicitly logging in.

Fixed: the auto-PIN-login branch is removed. The function returns `false` if no server session exists — the user must log in via the login form.

---

## Remaining Amber Items

These are lower-risk issues that do not block initial player testing.

| Area | Issue | Risk | Notes |
|------|-------|------|-------|
| Push subscription (`api/subscribe.js`) | POST has no auth — any device can register for push | Low | Subscriptions are keyed by device endpoint; no player data returned |
| Invite validation (`api/invite.js` GET) | Token validation is public by design | None | Required for the invite registration flow to work |
| Rate limiting | No rate limiting on login, invite claim | Medium | Will matter before public release; acceptable for closed player testing |
| Session cookie flags | Need `Secure; HttpOnly; SameSite=Strict` audit | Medium | Vercel sets Secure automatically; HttpOnly should be verified |
| VAPID key exposure | `/api/config` returns VAPID public key | None | Public key is safe to expose by design |
| Availability POST | Endpoint lookup allows spoofing a push endpoint | Low | Bound by registered device endpoint — cannot invent a player identity |

---

## Test Coverage

All 142 tests pass including:

- **Chat auth tests**: `authenticated role authorization allows coach conversation creation and blocks players` — verifies players get 403, unauthenticated callers get 401
- **Tenant isolation tests**: `tenant isolation blocks players and coaches from reading another team messages`
- **Invite + DM tests**: `coach can open a DM conversation channel with an invited player`, `invited player can reply to coach DM` — both now require proper sessions
- **Onboarding flow**: full invite → claim → availability → chat flow with authenticated requests throughout
- **Schedule API**: schedule CRUD requires coach session

---

## Files Changed

| File | Change |
|------|--------|
| `api/push.js` | Added `requireTenantRole(['coach', 'admin'])` guard |
| `api/schedules.js` | Added `requireTenantRole(['coach', 'admin'])` guard |
| `api/templates.js` | Added `requireTenantRole(['coach', 'admin'])` guard |
| `api/log.js` | Added `requireTenantRole(['coach', 'admin'])` guard |
| `api/availability.js` | Added `requireTenantRole(['coach', 'admin'])` to GET only |
| `api/chat.js` | Fixed `requireConversationAccess` (deny unauthenticated); fixed `create_conv` (require auth before role check) |
| `index.html` | Removed `email`, `phone`, `pin` from `testAccounts`; removed auto-PIN-login from `ensureServerSessionForCurrentUser` |
| `test/chat-api-unread.test.js` | Added `coachSetup()` helper; added auth headers to 4 tests |
| `test/push-system.test.js` | Added coach session to schedule API test |
| `test/account-onboarding-flow.test.js` | Added coach cookie to availability GET call |
| `test/invite-registration.test.js` | Added `seedCoachSession()` and player session headers to 2 DM tests |
