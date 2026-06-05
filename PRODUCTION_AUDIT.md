# Coach's Eye — Production Readiness Audit
Date: 2026-06-05
Auditor: Claude Code (claude-sonnet-4-6)

---

## Executive Summary

Coach's Eye is a monolithic rugby-team management SPA for Boitsfort RFC, hosted on Vercel Hobby. The frontend is a single ~8 000-line HTML file; the backend is eleven Vercel serverless functions backed exclusively by Upstash Redis (a single key-value store with no relational model).

**What works today.** The authentication and session system is genuinely solid. Passwords are hashed with scrypt (64-byte key), session tokens are cryptographically random (32 bytes, hashed before storage), invite tokens carry adequate entropy (24 random bytes), and there is a real password-reset flow using email. Rate limiting is wired on login and password-reset. Role-based access control (coach / admin / medical / player) is enforced server-side. The messaging API is functional, has conversation-level auth, enforces read-only restrictions on the announcements channel, and cleans up expired subscriptions. The PWA scaffolding — manifest, service worker, VAPID push — is present and structurally correct.

**What doesn't work.** Seven of the eleven API routes that accept writes have **no authentication at all**: `schedules`, `templates`, `push`, `availability`, `log`, `subscribe`, and `reminder`. Any person on the internet can enumerate all push schedules, add or delete templates, trigger push notifications to all subscribers, and read the message delivery log without any credentials. The `push` endpoint in particular is a **spam gun** — no auth, no rate limit, fires real Web Push to every subscriber. These are blockers for any public testing.

**State architecture is fragile.** The entire identity system (users, team members, player profiles, sessions, invites, password resets) is stored as monolithic JSON blobs in Redis with no atomic transactions. Every write is a read-then-write cycle with a race-condition window; on Vercel's edge the same serverless instance can handle multiple concurrent requests sharing that pattern. The `rebuildConvMsgs` function in `chat.js` (lines 389–416) is the worst case: it deletes a Redis list and re-inserts all messages one by one with no transaction, losing any messages written by concurrent requests during that window.

**Push notifications are partially functional** but will show as "blocked" in a fresh browser because `Notification.permission` is `denied` or `default`. iOS Safari (pre-iOS 16.4) does not support Web Push at all, and iOS 16.4+ requires the PWA to be installed to Home Screen. Android Chrome works once VAPID keys are set and the service worker registers — but VAPID contact defaults to `mailto:coach@example.com` if `VAPID_CONTACT` is not set.

**Technical debt is moderate.** The real coach email address, mobile phone number, and a 4-digit PIN (`"1111"`) are hardcoded in the frontend JavaScript as `testAccounts`. The PIN is the legacy password that the identity store still accepts on the `login` action. There are hard-coded Redis key constants for specific test players (`inv-YxnjxnQa`, `player-simon-test`) scattered through both `index.html` and `chat.js`. The `ensureLegacyStaffAccountForLogin` function in `_identityStore.js` still accepts the plaintext PIN `"1111"` as the legacy password for `simonbdodd@gmail.com`.

**For small-group live testing (10–20 players)** the blockers are: (1) auth on unauthenticated routes, (2) hardcoded real credentials in the frontend, (3) the `rebuildConvMsgs` race condition, and (4) verifying VAPID is actually configured. With those four items addressed the system is usable enough for a trial. For regular team use (30+ players year-round) the entire state storage model needs reconsideration — all identity and session data in a single JSON blob is O(N) for every read and write, and there is no concurrency control.

---

## Traffic Light Summary

| Area | Status | Key Finding |
|------|--------|-------------|
| Authentication | 🟡 Amber | Core auth (scrypt, sessions, invites) is solid; legacy PIN `1111` for real coach account is still active; hardcoded real email/phone in frontend JS |
| Push Notifications | 🟡 Amber | VAPID + service worker plumbing is correct; `/api/push` has zero auth — anyone can spam subscribers; iOS requires installed PWA |
| Messaging | 🟡 Amber | Functional with Redis; `rebuildConvMsgs` has a race-condition data-loss window; 500-message cap per conversation is undocumented |
| Membership Management | 🔴 Red | `/api/schedules` and `/api/templates` are fully unauthenticated — any anonymous user can create, edit, or delete push schedules |
| Data Architecture | 🟡 Amber | Read-then-write pattern on large blobs with no transactions; localStorage is authoritative for the coach's roster and can diverge from Redis silently |
| Production Deployment | 🟡 Amber | Vercel Hobby plan has 12 serverless functions limit and 10s max duration; currently at 11 API files (safe); 5 cron jobs require Pro for >1/day |
| Mobile / PWA | 🟡 Amber | Manifest and SW present; iOS push requires Home Screen install (iOS 16.4+); only SVG icon — no PNG fallback for iOS |
| Technical Debt | 🔴 Red | Real email + phone + PIN in `testAccounts` in frontend JS; hardcoded player IDs; `mission-control.js` reads source files in production |

---

## Detailed Findings

### 1. Authentication

**1.1 Password hashing — Green**
`hashPassword()` in `_identityStore.js:107` uses Node's `scryptSync` with a 64-byte key length and a 16-byte random salt. `verifyPassword()` at line 118 uses `timingSafeEqual` for constant-time comparison. Password hash fields are stripped before any API response via `publicUser()`. This is good.

**1.2 Legacy SHA-256 fallback — Amber**
`legacySha256PasswordHash()` at line 103 is still active. Users who registered before the scrypt upgrade still authenticate with `sha256(salt:password)`. On next login the hash is upgraded (line 719). The concern is that any user who last logged in before the migration still has a weak hash in Redis — and will remain on SHA-256 until they log in again. There is no force-migration or expiry mechanism.

**1.3 Legacy plaintext PIN — Red (blocker)**
`LEGACY_STAFF_ACCOUNTS` at line 28 of `_identityStore.js` contains:
```
email: 'simonbdodd@gmail.com',
password: '1111',
```
`ensureLegacyStaffAccountForLogin()` at line 574 accepts this plaintext PIN to log in as the coach. The `testAccounts` array in `index.html` at line 1793 also exposes this email, phone number (+32470380938), and pin (`"1111"`) in JavaScript visible to anyone who views page source. The PIN is a single 4-digit number — trivially brute-forceable. **This is the coach account; it grants access to all player data, messaging, and push notifications.**

**1.4 Session management — Green**
Sessions are 32-byte `base64url` tokens (256 bits of entropy), hashed with SHA-256 before storage. Session TTL is 30 days. Expiry is checked on every `loadSessions()` call and stale sessions are pruned. Cookies are `HttpOnly`, `SameSite=Lax`, `Secure` in production. Bearer token in `Authorization` header is also accepted (needed for the service worker). This is good.

**1.5 Rate limiting — Amber**
Rate limiting is applied to `login` (5/15 min) and `password_reset_request` (5/60 min) in `identity.js`. However, rate-limit state is stored in Redis with a key derived from `sha256(ip:email)`. On Vercel, `X-Forwarded-For` is used as the IP source — this is correct. The problem: rate limits are **per IP+email combination**, so an attacker can rotate email addresses and hit the same account from different angles. There is also no account lockout — after 5 failures the window resets and the attacker can try again. There is no rate limiting at all on the `/api/invite` validation endpoint (GET with `?token=`), on `/api/chat` (send), or on `/api/availability`.

**1.6 Invite flow — Green (with caveats)**
Tokens are `randomBytes(24).toString('base64url')` = 192 bits of entropy. TTL is 14 days. Revocation is soft (status change). The `claimInvite` function correctly checks status, expiry, and marks as accepted. Re-claiming an already-accepted invite is blocked unless `allowExisting: true` is passed — but `allowExisting` is never passed from the frontend. The invite token is stored **in plaintext** in Redis (unlike session and reset tokens which store only a hash). This means anyone with Redis access can enumerate all valid invite tokens. For a single-tenant club this is an acceptable trade-off, but it should be documented.

**1.7 Join request flow — Amber**
`createJoinRequest()` at line 267 creates a user account and sets the password **before** coach approval. A rejected player keeps a valid set of credentials. If they later attempt to join again (`member.status === 'rejected'`), their membership is reset to `pending` but their password is unchanged. There is no way to delete an account — only to reject the team member record.

**1.8 CSRF — Amber**
All mutation endpoints accept `application/json` with no CSRF token requirement. This is partially mitigated by SameSite=Lax cookies and the fact that JSON body POSTs from cross-origin forms are blocked by CORS preflight. However, the wildcard CORS header `Access-Control-Allow-Origin: *` in both `vercel.json` (line 29) and `_http.js` (line 3) means any origin can make credentialed fetch requests to the API. The wildcard specifically **prevents cookies from being sent** in cross-origin requests (since `withCredentials: true` is incompatible with `*`), so CSRF via stolen sessions is not possible. The real risk is that any website can use the unauthenticated APIs (schedules, push, etc.) freely.

**1.9 XSS — Amber**
The frontend uses an `esc()` helper function (`index.html:7656`) for HTML escaping in templates. It appears to be applied consistently in rendered HTML. However, the codebase is 8 000 lines of inline JavaScript with many `innerHTML` assignments — a full XSS audit would be needed to confirm every injection point is covered. The `showMsgContextMenu()` function at line 6534 inlines `JSON.stringify(msg?.text||'')` directly into an `onclick` attribute without escaping for the JS string context — this is a potential stored XSS vector if a message contains `'` or `\` characters that break out of the JSON context.

**1.10 Multi-tenant isolation — Amber**
`assertSameTenant()` is applied on coach-only operations (approve/reject, list identity, create invite). However, `DEFAULT_TEAM.id` is hardcoded as `'boitsfort-rfc'` throughout the system. If a second club is added later, any user can find the `boitsfort-rfc` team by guessing the team code `BOITSFORT` — there is no per-tenant isolation at the data level. All Redis keys use `APP_KEY_PREFIX` (defaulting to `'app'`) as namespace, not the team ID.

**1.11 Account recovery — Green**
Password reset is implemented: `createPasswordResetRequest()` generates a 32-byte base64url token, stores only its SHA-256 hash, expires in 1 hour, and is single-use. The reset email is sent via Resend. The token is not returned in the API response (only delivered by email). The implementation is correct.

---

### 2. Push Notifications

**2.1 VAPID implementation — Amber**
`web-push` library is used. VAPID keys are loaded from `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` env vars. The public key is served to browsers via `/api/config`. The service worker (`sw.js`) handles `push` events and `notificationclick` events correctly. The availability quick-reply flow (tap "Available" on the notification) posts to `/api/availability` using the endpoint URL as identity — this is the correct Web Push pattern.

**2.2 /api/push has no authentication — Red (blocker)**
`push.js` has no `requireSession`, `requireRole`, or secret check of any kind. Any anonymous HTTP POST to `https://boitsfort-coachseye-gpt.vercel.app/api/push` with a JSON body can send a push notification to every subscriber. This is a spam/abuse vector that must be closed before any real players subscribe.

**2.3 VAPID_CONTACT default — Amber**
`_http.js:17` defaults `VAPID_CONTACT` to `'mailto:coach@example.com'`. If `VAPID_CONTACT` is not set in the Vercel environment, push notifications sent via `web-push` will use this fake address as the sender identity. Push services may reject or throttle messages from unverified senders.

**2.4 iOS Safari support — Amber**
iOS 16.4+ Safari supports Web Push only for PWAs installed to the Home Screen. The manifest is present with `display: standalone`. There are no PNG icons — only an SVG (`/icon.svg`). iOS requires PNG icons (ideally 192×192 and 512×512) for the "Add to Home Screen" flow to work correctly. Without these, the install prompt may not appear or may show a broken icon.

**2.5 Android Chrome support — Green**
Web Push (VAPID) works on Android Chrome once VAPID keys are configured. The service worker registers at the root scope, which is correct.

**2.6 Notifications show as "blocked" — Amber**
If a user previously dismissed or blocked the notification permission prompt, `Notification.permission === 'denied'`, the sidebar correctly shows "Notifications blocked — Allow in browser settings". This is expected browser behaviour, not a bug. The "blocked" state reported in the audit brief is likely from a development browser where the user dismissed the prompt. The fix is to instruct users to clear site permissions in browser settings.

**2.7 Push subscription stored in plaintext — Amber**
`_lib.js` stores push subscriptions as a flat JSON array in the key `app:subscriptions`. The subscription object includes the push endpoint URL and auth keys. Any code with Redis read access (including the `debug` action on `/api/cron`) can retrieve all subscription endpoints. For a team of 30 players this is a low practical risk, but it should be noted.

**2.8 Cron scheduling requires Vercel Pro — Amber**
`vercel.json` defines 5 cron jobs. Vercel Hobby only allows **1 cron per deployment**. The current setup (5 crons) likely silently fires only the first or causes deployment errors. Scheduled push notifications will not work reliably on Hobby. This needs Vercel Pro ($20/month) or an external scheduler like cron-job.org (already referenced in `cron.js:3`).

---

### 3. Messaging

**3.1 Redis key structure — documented**
- `app:chat:convs` — JSON array of all conversation metadata
- `app:chat:conv:{id}:msgs` — Redis list (newest first, LPUSH), max 500 messages
- `app:chat:conv:{id}:typing` — JSON array with 10s TTL
- `app:chat:presence:{userId}` — JSON object with 60s TTL
- `app:chat:read:{convId}:{userId}` — timestamp (integer)
- `app:chat:msg:{msgId}` — individual message (used by react, potentially stale)

**3.2 rebuildConvMsgs race condition — Red (blocker)**
`api/chat.js:389–416`: The `react`, `edit`, and `delete` actions read the entire message list (up to 500), mutate it in memory, then delete the Redis list key and re-insert all messages one by one with sequential `kvLpush` calls. During the delete+re-insert window (which involves multiple HTTP round-trips to Upstash), any concurrent message send to the same conversation will either be lost (if it LPUSHes before the rebuild) or duplicated (if it LPUSHes after). For a 30-player team this is an infrequent but real risk. The workaround is to use Redis transactions (MULTI/EXEC) or a different data structure, but neither is available in the current REST-only Upstash client.

**3.3 Message cap and retention — Amber**
`kvLtrim(MSGS_KEY(convId), 500)` at line 275 keeps the last 500 messages per conversation. There is no configurable TTL on message lists — they persist indefinitely. At ~500 bytes/message, 500 messages per conversation is ~250 KB, well within Redis limits for a small team. However, the `rebuildConvMsgs` function only reads `msgs = await kvLrange(MSGS_KEY(convId), 0, 499)`, so reactions/edits/deletes on messages older than position 499 are silently ignored.

**3.4 Unread count — Amber**
Unread counts are computed per-user per-conversation by comparing message timestamps against the `app:chat:read:{convId}:{userId}` key. The `conversations` action at line 181 reads the last 500 messages from every visible conversation to compute unread counts — this is O(conversations × messages) per request and will become expensive as conversation count grows. A separate Redis counter per conversation per user would be more efficient.

**3.5 Real-time updates — Amber**
There is no WebSocket or SSE. The frontend polls `/api/chat?action=conversations` every 5 seconds when the document is visible (`index.html:8071`). Active conversation message refresh happens via `chatFetchMessages` on open (no polling interval is shown for the message thread itself — only when a conversation is opened or a message is sent). Typing indicators are polled separately. At 100 users × 5s interval = 20 req/s sustained, well within Vercel Hobby limits.

**3.6 Announcement channel write restriction — Green**
`sessionCanWriteConversation()` at `chat.js:113` correctly blocks `player` role from writing to `announce` or `coaching` conversations. This is enforced server-side.

**3.7 Unauthenticated message reading — Amber**
`requireConversationAccess()` at line 131 contains: `if (!sessionContext?.user?.id) return true;` — if there is no session at all (unauthenticated request), access is **granted** by default. This means anyone who knows a conversation ID can read its messages and see presence data without logging in. This is almost certainly unintentional. Coach-to-player DM conversations contain sensitive personal messaging.

**3.8 Chat send uses client-supplied sender identity — Amber**
In the `send` action at line 253: `if (sessionUser?.id) { senderId = sessionUser.id; ... }`. If there is no session, the `senderId` comes from the request body (client-supplied). An unauthenticated user can claim any sender ID and impersonate any player. Combined with finding 3.7, an unauthenticated caller can read and write messages in any conversation.

---

### 4. Membership Management

**4.1 /api/schedules — unauthenticated — Red (blocker)**
`schedules.js` has no authentication on any method (GET, POST, PUT, DELETE). Any anonymous user can list all scheduled notifications, create new ones (including arbitrary message content), toggle them on/off, or delete them. This is a direct abuse vector.

**4.2 /api/templates — unauthenticated — Red (blocker)**
`templates.js` has no authentication. Any anonymous user can create, edit, or delete push notification templates, including the default availability templates. An attacker could replace the availability check template with arbitrary content.

**4.3 /api/push — unauthenticated — Red (blocker)**
Covered above in §2.2. Repeating for completeness: any anonymous POST can trigger real push notifications to all subscribers.

**4.4 /api/availability — unauthenticated write — Amber**
`availability.js:63` accepts POST without a session if a valid `endpoint` is provided. This is intentional (enables quick-reply from notification actions in the service worker, where no session cookie is available). The endpoint lookup verifies the subscription exists in Redis before accepting the response, which prevents fabrication. However, the GET endpoint returns all availability data for a session ID with no authentication — player availability status is visible to anyone who guesses the session ID (which is `'game'` by default).

**4.5 Invite tokens stored in plaintext — Amber**
Covered in §1.6. Coach-created invite tokens are in the `ce:invites` key without hashing.

**4.6 Role escalation — Green**
`hasRole()` in `_identityStore.js:451` checks both `teamMember.role` and `teamMember.status === 'active'`. Players cannot call `approve` or `reject` — these require `requireTenantRole(req, ['coach', 'admin'])`. Players cannot change their own role. No escalation path found.

**4.7 Player offboarding — Red (gap)**
There is no endpoint to remove a player. `rejectJoinRequest()` sets `member.status = 'rejected'` but does not revoke sessions, delete the user account, or remove the player profile. A rejected player's active sessions remain valid. There is no "kick player" function.

**4.8 Invite group links — not implemented**
All invites are individual (name-scoped). There is no "group invite link" that multiple people can use. The `claimInvite` function blocks re-claiming an accepted invite unless `allowExisting: true` is passed. Group invite link support would require a different invite type.

**4.9 /api/log — unauthenticated read — Amber**
`log.js` returns the last N message delivery log entries (which function was called, when, to how many subscribers, and the message body snippet) with no authentication. This leaks metadata about internal coach activity.

---

### 5. Data Architecture

**5.1 All Redis key patterns**
```
app:identity:users                    — JSON array of all user accounts
app:identity:teams                    — JSON array of teams
app:identity:team_members             — JSON array of team memberships
app:identity:player_profiles          — JSON array of player profiles
app:identity:sessions                 — JSON array of active sessions
app:identity:password_resets          — JSON array of pending resets
app:identity:audit_log                — JSON array of audit log entries (max 500)
app:rate:{scope}:{sha256_hash}        — rate limit counters with TTL
ce:invites                            — JSON array of all invites (legacy key, NOT app: prefix)
app:subscriptions                     — JSON array of push subscriptions
ce:subscriptions                      — legacy push subscription fallback
app:schedules                         — JSON array of push schedules
ce:schedules                          — legacy fallback
app:templates                         — JSON array of notification templates
ce:templates                          — legacy fallback
app:availability:{sessionId}          — JSON object of player responses
ce:availability:{sessionId}           — legacy fallback
app:chat:convs                        — JSON array of conversation metadata
app:chat:conv:{id}:msgs               — Redis list (max 500 items)
app:chat:conv:{id}:typing             — JSON array (TTL 10s)
app:chat:presence:{userId}            — JSON object (TTL 60s)
app:chat:read:{convId}:{userId}       — integer timestamp
app:chat:msg:{msgId}                  — individual message copy (from react action)
app:message_log                       — Redis list of delivery log entries (max 500)
ce:message_log                        — legacy fallback
```

**Key anomaly:** `ce:invites` uses the `ce:` legacy prefix, not `app:`. This is inconsistent with all other identity data which uses `app:identity:*`. It means invites are not namespaced per `APP_KEY_PREFIX` and would be shared between clubs in a multi-tenant scenario.

**5.2 localStorage vs Redis**
The frontend stores the entire application state (players, availability, training blocks, messages, users, settings) as a single JSON blob in `localStorage` under the key `coach-eye-real-workflow-mvp-state-v1`. Redis holds canonical identity, sessions, chat messages, and push subscriptions. The **roster** (player list with positions, availability history, training attendance) lives **only in localStorage**. If a coach changes device or clears browser storage, all local roster data is gone. Redis has no copy of `state.players`, `state.trainingBlocks`, `state.schedule`, `state.fixtures`, or `state.tacticsDrawings`.

**5.3 State synchronisation — Amber**
`syncIdentityStateToLocalRoster()` at `index.html:3791` merges server-side player profiles into localStorage on load and on session refresh. Profiles are server-authoritative only for `userId`, `displayName`, `position`, `phone`, `email`. Availability data and training history are localStorage-only. If the server returns a player profile that doesn't match any local player (by email, name, or ID), a new local player record is created and saved. The server-side prune at line 3866 removes localStorage players whose `userId` or `id` doesn't appear in the server profile list — this means a coach who added a player locally before they registered will lose that player on the next sync if the player's server-side ID doesn't match the local ID.

**5.4 Duplicate user risk — High**
The identity system has multiple merge strategies (by email, by name, by userId, by legacyPlayerId) in both `_identityStore.js` and `index.html`. A player who registers via join-request, then also claims an invite, will have two different user IDs in Redis if the email lookup doesn't match. The deduplication logic in `dedupeRosterMembers()` uses a multi-key matching approach but depends on consistent capitalisation and email format. No uniqueness constraint exists in Redis.

**5.5 No schema migration framework**
There is no versioning for Redis data schemas. Changes are handled by in-line checks (e.g., `if (b.coach === undefined) b.coach = ""`). The `filterObsoleteLegacyAccounts` function runs on every `listIdentityState` call, mutating production data as a side-effect of a read operation. There is no migration log.

**5.6 Sessions stored as array — scalability concern**
`loadSessions()` reads the entire sessions array, filters expired sessions, writes it back. At 100 users with 30-day sessions, this array will have up to 100 entries. At 1 000 users this becomes 1 000 entries read and written on every authenticated API call. The same pattern applies to users, members, profiles, and invites. This will not scale beyond a few hundred active users without refactoring.

---

### 6. Production Deployment

**6.1 Vercel plan**
The project is deployed on Vercel Hobby. Limits relevant to this application:
- **Serverless functions**: 12 per deployment. Current count: 11 API files (`availability.js`, `chat.js`, `config.js`, `cron.js`, `identity.js`, `invite.js`, `log.js`, `mission-control.js`, `push.js`, `reminder.js`, `schedules.js`, `subscribe.js`, `templates.js`) = **13 routes** before considering `_*.js` internal files. The Hobby limit is **12 serverless functions** per deployment. This may already be exceeded or close to the limit.
- **Cron jobs**: Hobby plan allows **1 cron invocation per day**. `vercel.json` defines 5 cron jobs. Only one will fire reliably; the rest are silently ignored or cause an error on deployment.
- **Function execution timeout**: 10 seconds on Hobby. The `collectRedis()` in `mission-control.js` makes 5 parallel Redis calls plus up to 40 `kvLrange` calls — this may time out on a large dataset.
- **Bandwidth**: 100 GB/month on Hobby. Not a concern for a 30-player team.

**6.2 Required environment variables**
```
UPSTASH_REDIS_REST_URL        — required; all API routes fail without it
UPSTASH_REDIS_REST_TOKEN      — required
VAPID_PUBLIC_KEY              — required for push
VAPID_PRIVATE_KEY             — required for push
VAPID_CONTACT                 — optional; defaults to mailto:coach@example.com
CRON_SECRET                   — required; cron/reminder endpoints return 500 without it
RESEND_API_KEY                — optional; email delivery silently skipped without it
EMAIL_FROM                    — optional; defaults to "Coach's Eye <noreply@coachseye.app>"
APP_URL                       — optional; defaults to boitsfort-coachseye-gpt.vercel.app
APP_KEY_PREFIX                — optional; defaults to 'app'
LOCAL_TZ_OFFSET               — optional; defaults to 1 (UTC+1)
```

**6.3 Cost model estimates**
Assumptions: 30-player team (1 coach, 29 players). Polling interval: 5s when app is open. Assuming 2 hours/day average active time per player.

| Metric | 30 players | 100 players | 500 players |
|--------|-----------|-------------|-------------|
| Req/day (poll) | ~43 000 | ~144 000 | ~720 000 |
| Upstash ops/day | ~500 000 | ~1.7M | ~8.5M |
| Vercel invocations/day | ~43 000 | ~144 000 | ~720 000 |

Upstash free tier: 10 000 commands/day. Even 30 active players will exhaust the free tier on a session day. **Upstash paid plan ($0.20/100K commands) is required for any live use.** Vercel Hobby: 100 GB bandwidth, unlimited invocations (with 10s timeout). Function invocations are not hard-limited on Hobby but are subject to fair use.

**6.4 Moving to Vercel Pro**
Required changes: upgrade plan ($20/month), no code changes needed. This unlocks 12+ serverless functions and up to 50 cron jobs.

**6.5 Cold-start latency**
Each Vercel serverless function cold-starts in ~200–400ms. The `resolveSession()` call chain makes 4 parallel Redis reads (users, sessions, members, profiles) taking ~100–200ms combined on Upstash. Total per-request latency on cold start: ~500–800ms. For a chat app polling at 5s intervals, this is acceptable.

---

### 7. Mobile / PWA

**7.1 Service worker — Green**
`/sw.js` is registered in `initServiceWorker()` at `index.html:2381`. It handles `push`, `notificationclick`, and quick-reply actions. `vercel.json` serves it with `Service-Worker-Allowed: /` and `Cache-Control: no-store` — correct.

**7.2 Web app manifest — Amber**
`manifest.json` is present and linked in `<head>`. `display: standalone` is set. `start_url: /` is correct. Icons: only one SVG icon (`/icon.svg`) with `purpose: "any maskable"`. iOS requires PNG icons; SVG-only manifests result in a generic icon on the Home Screen and may prevent the install prompt on some iOS versions.

**7.3 Offline support — Amber**
The main SPA (`index.html`) is NOT cached in the service worker — the SW at `/sw.js` has no fetch handler for the main page. If the user is offline after first load, the page will load from browser cache (HTTP cache, not SW cache), but any API calls will fail silently (caught with `/* offline */` or `catch(() => {})`). Roster data, training plans, and fixtures survive offline because they are in localStorage. Messages will be stale until connectivity resumes.

**7.4 iOS Safari (iOS 16.4+) — Amber**
Web Push on iOS requires:
1. PWA installed to Home Screen (the `display: standalone` manifest entry triggers this)
2. iOS 16.4 or later
3. User explicitly grants notification permission within the installed PWA

The current flow shows a "Turn on notifications" button in the sidebar, which calls `subscribePush()`. This triggers `Notification.requestPermission()` — but on iOS this must happen in direct response to a user gesture. The button click satisfies this requirement. The missing piece is the PNG icon for clean Home Screen install.

**7.5 Android Chrome — Green (once VAPID configured)**
Android Chrome Web Push works with the current VAPID + service worker setup. No issues found.

**7.6 Viewport and touch targets — Green**
`<meta name="viewport" content="width=device-width, initial-scale=1">` is present. The CSS includes a `@media (max-width: 980px)` breakpoint that collapses the two-column layout to single column. Buttons use `min-height: 38px` — adequate touch targets. The sidebar collapses to static flow on mobile. No obvious mobile layout blockers found.

---

### 8. Technical Debt

**8.1 Hardcoded real credentials — Red**
`index.html:1793`:
```javascript
const testAccounts = [
  { id: "coach-demo", role: "coach", name: "Simon Coach",
    email: "simonbdodd@gmail.com", phone: "+32470380938", pin: "1111" }
];
```
The coach's real email, mobile phone number, and PIN are in client-side JavaScript, readable by anyone who views page source. The PIN is used as the legacy password in `_identityStore.js:37`.

**8.2 Hardcoded test player IDs — Amber**
`index.html:1985`: `if (nameKey === 'simontestplayer') return 'inv-YxnjxnQa';`
`index.html:6315`: `_allowedDmParticipantIds = new Set(['coach-demo', 'player-simon-test', 'inv-YxnjxnQa']);`
`chat.js:40–45`: `OBSOLETE_DM_PARTICIPANT_IDS` contains references to removed legacy test accounts.
These IDs are acceptable in dead-code cleanup filters, but `inv-YxnjxnQa` is still hardcoded as the initial DM allowlist entry for an active test account. When real players join, this will cause their DMs to not appear until the allowlist is updated.

**8.3 Hardcoded app URLs — Amber**
`invite.js:27`: `const APP_URL = process.env.APP_URL || 'https://boitsfort-coachseye-gpt.vercel.app';`
`_email.js:9`: `return process.env.APP_URL || 'https://boitsfort-coachseye-gpt.vercel.app';`
`index.html:5458`: `boitsfort-coachseye-gpt.vercel.app` is hardcoded in the join-code banner.
`index.html:8013`: `'https://boitsfort-coachseye-gpt.vercel.app/?inv=${esc(inv.token)}'` is hardcoded in the invite list copy button — this bypasses the dynamic `inviteUrl()` function and will generate wrong URLs if the app is served from a different domain.

**8.4 mission-control.js reads source files in production — Amber**
`mission-control.js:62`: `function readText(path) { return readFileSync(join(ROOT, path), 'utf8'); }` — this reads local source files from the filesystem during a serverless invocation. On Vercel, the deployment bundle includes source files, so this works, but it exposes the project structure and reads `index.html` and `package.json` in a production function. The `buildGraph` function includes all file names and sizes.

**8.5 rebuildConvMsgs re-reads env vars — Amber**
`chat.js:401–403`: Inside `rebuildConvMsgs`, the function re-reads `process.env.UPSTASH_REDIS_REST_URL` and `process.env.UPSTASH_REDIS_REST_TOKEN` instead of using the already-imported `redis` function. This is redundant but not harmful.

**8.6 console.log of player names — Amber**
`index.html:3879`: `console.log('visiblePlayers =', JSON.stringify(state.players.map(p => p.name)));` — this logs the full roster of player names to the browser console on every identity sync. With real players, this is a privacy leak visible to anyone with browser dev tools open.

**8.7 console.log of invite tokens — Amber**
`invite.js:158`: `console.log('[invite] Created ... — ${token}')` — invite tokens are logged to Vercel function logs. This means any Vercel dashboard viewer can see raw invite tokens. This partially undermines the 192-bit entropy of the token if log access is not restricted.

**8.8 chat.js lines 400–415: inline Redis credential re-use**
The `rebuildConvMsgs` function duplicates the Redis URL/token extraction from environment variables rather than calling the shared `redis()` function from `_kv.js`. This is a maintenance hazard.

**8.9 Vercel Hobby cron limit mismatch**
`vercel.json` defines 5 cron schedules. Vercel Hobby allows 1. Four of the five will not run. This silently breaks scheduled push notification delivery for anything beyond the first schedule.

**8.10 Swallowed errors in chat send**
`index.html:6465`: `} catch(e) { /* optimistic stays */ }` — if the Redis send fails, the message appears in the UI but is never actually stored. There is no error feedback to the user and no retry mechanism.

**8.11 invite.js PATCH endpoint relies on role auth for a player action**
The `PATCH /api/invite` endpoint (mark accepted) requires `requireTenantRole(req, ['coach', 'admin'])`. But from the frontend at `index.html:7908`, non-player (staff) invite claims call this endpoint after locally saving. Player claims go through `/api/identity` with `action: 'claim_invite'` which correctly marks the invite as accepted server-side. The PATCH is actually dead code for the normal invite flow and could create confusion.

**8.12 _security.js auditLog is O(N) on every write**
`auditLog()` in `_security.js:39` reads the entire 500-entry audit log, prepends a new entry, and writes the entire array back. At 500 entries with concurrent API calls, this has race conditions and is inefficient.

**8.13 Availability session ID validation is regex-only**
`availability.js:11`: `return /^[a-z0-9_-]{1,80}$/i.test(String(sessionId || ''));` — the session ID is user-controlled and validated only by regex. There is no enumeration protection; a client can probe any session ID. Default is `'game'` (hardcoded in multiple places). Multiple overlapping sessions (e.g., Tuesday training vs. Saturday match) share the same `game` session ID, conflating responses.

---

## Top 10: Before First Live Team Testing

1. **Remove real credentials from `index.html:1793`** — delete `email`, `phone`, and `pin` from `testAccounts`. Migrate coach login to use only the server-side password.
2. **Add authentication to `/api/push`** — require an active `coach` or `admin` session before sending push notifications.
3. **Add authentication to `/api/schedules`** — all CRUD methods must require `coach` or `admin` role.
4. **Add authentication to `/api/templates`** — same as above.
5. **Fix unauthenticated chat access** — `requireConversationAccess` must return `false` (not `true`) when there is no session, or restrict access to only public conversations.
6. **Confirm VAPID keys are configured in Vercel environment** — check that `pushConfigured: true` is returned by `/api/config` in production.
7. **Add PNG icons (192×192 and 512×512) to the manifest** — required for iOS Home Screen install and the notification flow.
8. **Fix the hardcoded invite URL in `loadInviteList()`** (`index.html:8013`) — use the dynamic `inviteUrl()` pattern from `invite.js` instead.
9. **Upgrade Upstash to a paid tier** — the 10 000 command/day free limit will be hit by 30 active players within the first session.
10. **Verify cron job count vs Vercel plan** — either upgrade to Pro or reduce to 1 cron, or move to an external cron service (cron-job.org is already referenced in code comments).

---

## Top 10: Before Public Release

1. **Refactor session storage from array-in-JSON to indexed Redis keys** — current O(N) read/write on every API call will not scale to 100+ users.
2. **Add atomic transactions to `rebuildConvMsgs`** — or replace the list-rebuild pattern with a single-message-update approach using `LSET` (available in Upstash REST via pipeline) to eliminate the race condition.
3. **Remove `legacy PIN` auth path** — `ensureLegacyStaffAccountForLogin` and the `password: '1111'` in `LEGACY_STAFF_ACCOUNTS` must be deleted. All staff must use scrypt-hashed passwords.
4. **Add authentication to `/api/log`** — delivery log metadata should not be public.
5. **Add authentication to `/api/availability` GET** — player availability is personal data; it should not be publicly readable.
6. **Add rate limiting to `/api/chat` send** — no limit currently; a single user can flood a conversation.
7. **Implement player removal / offboarding** — need an endpoint to invalidate sessions, set status to `removed`, and prevent re-login without a new invite.
8. **Store the coach's permanent password in Redis** (not rely on the `LEGACY_STAFF_ACCOUNTS` constant) — issue the coach an invite link to claim their own account through the standard flow.
9. **Move roster persistence to Redis** — training history, attendance, and tactics drawings are stored only in localStorage. A device change loses all of this.
10. **Fix `ce:invites` key namespace** — change to `app:invites` to be consistent with all other identity keys and support `APP_KEY_PREFIX` namespacing.

---

## Prioritized Roadmap

### Phase 1 — Blockers (must fix before any live test)

- Remove real credentials (email, phone, PIN) from `index.html` `testAccounts`
- Add `requireTenantRole` auth to `/api/push`, `/api/schedules`, `/api/templates`
- Fix `requireConversationAccess` to deny unauthenticated callers
- Fix hardcoded invite URL in `loadInviteList()`
- Add PNG icons to web app manifest for iOS install
- Verify VAPID keys and `RESEND_API_KEY` are set in Vercel environment
- Upgrade Upstash to a paid tier for live use
- Confirm cron job count matches the Vercel plan (upgrade to Pro or externalise crons)

### Phase 2 — Core gaps (must fix before regular team use)

- Retire `legacy PIN` auth path entirely (delete `LEGACY_STAFF_ACCOUNTS`, issue coach a standard invite)
- Add authentication to `/api/log` and `/api/availability` (GET)
- Add rate limiting to `/api/chat` send
- Fix `rebuildConvMsgs` race condition (use pipeline or replace rebuild with LSET)
- Implement player removal / session revocation endpoint
- Remove `console.log('visiblePlayers ...')` from `index.html:3879`
- Remove invite token logging from `invite.js:158`
- Fix `ce:invites` key to use `app:` prefix

### Phase 3 — Production hardening (must fix before public release)

- Refactor identity/session storage from monolithic JSON arrays to indexed Redis keys
- Move roster persistence (players, training history, attendance) to Redis
- Implement atomic session invalidation on player removal
- Add a CSRF token or move to SameSite=Strict cookies with explicit origin checks
- Full XSS audit of all `innerHTML` assignments, specifically `showMsgContextMenu` inline JS
- Add account deduplication enforcement at the point of user creation
- Implement session token rotation on privilege change

### Phase 4 — Scale and polish

- Replace 5s polling with SSE or WebSocket for chat
- Index availability responses by `sessionId` + `userId` rather than scanning all availability keys
- Add a data export / backup mechanism for the coach (roster, training history)
- Implement proper schema versioning and migration tooling for Redis data
- Move `mission-control.js` away from reading source files in production
- Consider moving from Vercel Hobby to a self-hosted or Vercel Pro deployment for the cron scheduling system
- Multi-club support: replace hardcoded `DEFAULT_TEAM.id = 'boitsfort-rfc'` with a dynamic tenant registry
