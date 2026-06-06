# Security Audit — Coach's Eye

**Date:** 2026-06-06  
**Branch:** `feature/nightly-qa-agent`  
**Auditor:** Static code review (no runtime tests)  
**Scope:** All files under `api/`, `api/_*.js` helpers, `index.html` client code

---

## Executive Summary

The codebase has **one unauthenticated admin-level information disclosure endpoint** that must be locked down before any public exposure, and **one unauthenticated chat read path** that leaks all conversation content. Several medium-severity issues (plaintext invite tokens, unauthenticated subscription manipulation, CORS wildcard, missing rate limits on registration paths) follow. Password storage and session token handling are implemented correctly with modern primitives.

---

## Findings

### CRITICAL

---

#### SEC-001 — `GET /api/mission-control` has no authentication

**File:** [api/mission-control.js](api/mission-control.js)  
**Severity:** Critical  
**Category:** Broken Access Control / Information Disclosure

Any HTTP client that knows (or guesses) the URL receives a JSON document containing:

- Full git history: branch names, commit SHAs, commit messages, author names
- All API route paths and their HTTP methods (full attack-surface map)
- Filesystem structure of the deployment: paths and file sizes
- Live Redis statistics: user count, team member count, all conversation IDs and names, message counts per conversation
- GitHub PR list (output of `gh pr list`)
- Contents of `package.json` and the first portion of `index.html`

The endpoint calls `execFileSync('git', [...])` and `execFileSync('gh', [...])` with array arguments, so there is no shell injection vulnerability — but the output is returned to any unauthenticated caller.

**Impact:** An attacker learns the complete internal structure of the application, all Redis key statistics, all conversation names, and the number of users — without any credentials.

**Fix:** Add `requireTenantRole(['coach', 'admin'])` at the top of the handler, or restrict access to `CRON_SECRET` / a separate `MISSION_CONTROL_SECRET`. At minimum, this endpoint must not be reachable from the public internet without authentication.

---

#### SEC-002 — `GET /api/chat?action=conversations` accessible without authentication

**File:** [api/chat.js:99-111](api/chat.js)  
**Severity:** Critical  
**Category:** Broken Access Control / Information Disclosure

`sessionCanReadConversation` line 100:
```javascript
if (!sessionContext?.user?.id) return true;
```

When no session is present, this function returns `true` for every conversation, so the conversations list is filtered by `if (sessionContext?.user?.id) ? convs.filter(...) : convs` — the unauthenticated path returns all conversations.

Additionally at line 173:
```javascript
const userId = sessionContext?.user?.id || url.searchParams.get('userId') || 'anon';
```

An unauthenticated caller can inject an arbitrary `userId` via query parameter. This value is used to look up the `lastRead` cursor and to write the presence record.

**Impact:**
- Any unauthenticated HTTP client can enumerate all conversations (squad chat, coaching thread, announcements, all DMs) and see the last message text, sender name, and timestamp for each.
- Presence (`kvSet`) is written for attacker-supplied user IDs.

**Note:** `action=messages` and `action=typing` correctly call `requireConversationAccess`, which enforces authentication. The leak is limited to the conversations list endpoint.

**Fix:** Add an authentication guard before the `action === 'conversations'` branch: if `!sessionContext?.user?.id`, return `401`. Remove the `url.searchParams.get('userId')` fallback — the user ID must come from the authenticated session only.

---

### HIGH

---

#### SEC-003 — `CRON_SECRET` accepted as URL query parameter

**Files:** [api/_http.js](api/_http.js), [api/cron.js](api/cron.js), [api/reminder.js](api/reminder.js)  
**Severity:** High  
**Category:** Credentials in Logs

`readSecret` accepts the secret as `Authorization: Bearer <secret>` **or** as `?secret=<secret>` query parameter. The query-parameter form is recorded in:

- Vercel access logs
- CDN / load-balancer request logs
- Browser history and referrer headers when navigating to the URL
- Any third-party monitoring or analytics that captures full URLs

**Impact:** The `CRON_SECRET` can be silently leaked in log infrastructure without any breach of the application itself. The `cron.js` `debug` action (see SEC-004) exposes all user data behind only this secret.

**Fix:** Accept the secret via `Authorization: Bearer` header only. Remove the `url.searchParams.get('secret')` path from `readSecret`. Update `cron-job.org` configuration to send the header.

---

#### SEC-004 — `cron.js` `debug` action exposes all user PII

**File:** [api/cron.js](api/cron.js) line ~82  
**Severity:** High  
**Category:** Excessive Data Exposure

The `?action=debug` path returns: all user IDs, all user emails, all display names, team member counts for each user, and all conversation IDs. It is protected only by `CRON_SECRET`.

Combined with SEC-003 (secret exposed in URL query param), this means the `CRON_SECRET` captured in any log gives an attacker a full user directory.

**Fix:** Remove the `debug` action entirely, or restrict it to a separate secret with no URL-param fallback. If retained for diagnostics, strip email addresses from the response — return only IDs and counts.

---

#### SEC-005 — Hardcoded password `1111` for legacy staff account

**File:** [api/_identityStore.js](api/_identityStore.js) — `LEGACY_STAFF_ACCOUNTS` constant  
**Severity:** High  
**Category:** Hardcoded Credentials

The source code contains:
```javascript
const LEGACY_STAFF_ACCOUNTS = [
  { email: 'simonbdodd@gmail.com', password: '1111', ... }
];
```

This password is stored in plaintext in the source file, which is committed to a GitHub repository. `ensureLegacyStaffAccountForLogin` performs a direct string comparison `String(password || '') !== legacy.password` on login, bypassing the `scrypt` hash path.

**Impact:** Anyone with read access to the repository (including GitHub forks, CI logs, or any code search tool) knows the coach account password. The account is then elevated to a real hashed-password account on first login — but until first login occurs, the plaintext credential is active.

**Fix:**
1. Change the `coach-demo` password immediately via the application's normal password flow to create a hashed credential record.
2. Remove `LEGACY_STAFF_ACCOUNTS` from source code.
3. If a demo account is needed, provision it through the normal invite + registration flow and document the credential in a secrets manager, not source code.

---

#### SEC-006 — `POST /api/subscribe` — no authentication

**File:** [api/subscribe.js](api/subscribe.js)  
**Severity:** High  
**Category:** Broken Access Control

The `POST` handler accepts `userId`, `playerId`, and `label` from the request body with no authentication:
```javascript
const session = await resolveSessionFromRequest(req).catch(() => null);
// session is optional — no 401 if absent
const { endpoint, keys, userId, playerId, label } = body;
```

Any unauthenticated caller can register a Web Push subscription under any `userId` or `playerId`, with any `label`. These subscriptions receive push notifications intended for real players.

**Fix:** Require a valid session. At minimum, verify that the `userId` in the request body matches the authenticated session's user ID.

---

#### SEC-007 — `DELETE /api/subscribe` — no authentication

**File:** [api/subscribe.js](api/subscribe.js)  
**Severity:** High  
**Category:** Broken Access Control

The `DELETE` handler removes a subscription by `endpoint` URL with no authentication check. Any caller that knows (or can guess) a push endpoint URL can silently unsubscribe any player.

Push endpoint URLs are not secret — they appear in browser developer tools and in any push notification payload.

**Fix:** Require a valid session and verify that the subscription belongs to the requesting user before deleting.

---

### MEDIUM

---

#### SEC-008 — Invite tokens stored and compared in plaintext

**Files:** [api/_identityStore.js](api/_identityStore.js), [api/invite.js](api/invite.js)  
**Severity:** Medium  
**Category:** Sensitive Data Exposure

Session tokens are correctly stored as SHA-256 hashes (`tokenHash`) and compared by hashing the incoming value. Invite tokens are stored as-is in the Redis `ce:invites` list and compared directly with `invite.token === token`.

If the Redis instance is compromised (key dump, backup leak, or the Upstash dashboard), all active invite tokens are immediately available and usable.

**Fix:** Store invite tokens as `SHA-256(token)` and compare `SHA-256(incoming) === storedHash`, matching the pattern used for session tokens.

---

#### SEC-009 — `GET /api/invite?token=X` leaks recipient email to unauthenticated callers

**File:** [api/invite.js](api/invite.js)  
**Severity:** Medium  
**Category:** Information Disclosure / PII Exposure

The unauthenticated GET path for invite validation returns the invite's `email`, `name`, `role`, `status`, and `teamName` fields. This is the endpoint a player visits to see their invite details before registering.

An attacker with a valid invite token can read the recipient's email address. An attacker who can enumerate tokens (no rate limit on this endpoint) can harvest email addresses at scale.

**Fix:**
1. Add rate limiting to `GET /api/invite?token=X` (e.g., 20 requests per 15 min per IP).
2. Consider returning only `name`, `role`, `teamName`, `status` — omit `email` from the unauthenticated response (the user already knows their own email).

---

#### SEC-010 — `legacyPlayerId` derived from invite token suffix

**File:** [api/_identityStore.js](api/_identityStore.js) — `ensurePlayerProfile`  
**Severity:** Medium (Low in isolation)  
**Category:** Information Leakage

`legacyPlayerId` is set to the last 8 characters of the invite token:
```javascript
legacyPlayerId: `p-${token.slice(-8)}`
```

This value is stored on the player profile and may appear in Redis keys, API responses, and DM conversation IDs (e.g., `dm:user-123:p-abc12345`). A leaked conversation ID or player profile thus reveals 8 characters of the invite token.

Combined with SEC-008 (plaintext invite token storage), this reduces the effective search space for reconstructing tokens.

**Fix:** Generate `legacyPlayerId` from `randomBytes(4).toString('hex')` or the user ID at claim time, not from the token value.

---

#### SEC-011 — `claimInvite` bypass via `allowExisting: true`

**File:** [api/_identityStore.js](api/_identityStore.js) line ~750  
**Severity:** Medium  
**Category:** Business Logic Bypass

```javascript
if (invite.status === 'accepted' && !input.allowExisting) {
  throw new Error('Invite already accepted');
}
```

If a caller passes `allowExisting: true` in the request body, a previously accepted invite can be claimed again, creating a duplicate account or overwriting an existing player's membership record.

Examine all callers of `claimInvite` to confirm whether any public-facing path forwards `allowExisting` from the request body without validation.

**Fix:** Remove `allowExisting` from any user-supplied input path. If re-claiming is needed for internal flows, require it to come only from server-side code with an explicit comment explaining the intent.

---

#### SEC-012 — `joinViaGroupInvite` not rate-limited

**File:** [api/identity.js](api/identity.js), [api/_identityStore.js](api/_identityStore.js)  
**Severity:** Medium  
**Category:** Missing Rate Limiting

The `join_group_invite` action in `identity.js` has no rate limiting. A group invite token (once obtained) can be used to create an unlimited number of player accounts programmatically. This allows:

- Roster flooding (hundreds of phantom player accounts)
- Redis data growth
- Notification spam to coaches

Login attempts are correctly rate-limited (5 per 15 min per IP+email). Individual invite claims have rate limiting on creation, but not on redemption.

**Fix:** Apply `enforceRateLimit` to the `join_group_invite` path — e.g., 10 attempts per hour per IP.

---

#### SEC-013 — `CORS: Access-Control-Allow-Origin: *`

**File:** [api/_http.js](api/_http.js) — `CORS` constant  
**Severity:** Medium  
**Category:** Overly Permissive CORS

All API endpoints respond with `Access-Control-Allow-Origin: *`. This allows any website to make cross-origin requests to the API and read the responses. For a private team application, this means:

- A malicious page visited by an authenticated user can make requests to the Coach's Eye API using the user's session cookie/token and read the results.
- Combined with the unauthenticated endpoints (SEC-001, SEC-002), any website can harvest data from Coach's Eye.

**Fix:** Restrict the `Access-Control-Allow-Origin` header to the known production and preview origins (e.g., `https://boitsfort-coachseye.vercel.app`). Allow `localhost:*` only in development.

---

#### SEC-014 — `assertSameTenant` silently passes when `targetTeamId` is null/empty

**File:** [api/_tenant.js](api/_tenant.js)  
**Severity:** Medium  
**Category:** Tenant Isolation

```javascript
const normalizedTarget = targetTeamId || sessionTeamId;
```

If a caller passes an empty or null `targetTeamId`, `normalizedTarget` falls back to the session's own `teamId`, so the assertion always passes. Callers that derive `targetTeamId` from user-supplied input without validating that it is non-empty will silently bypass tenant isolation.

**Audit action required:** Grep all callers of `assertSameTenant` and verify that `targetTeamId` is always sourced from a validated, non-null record (not from unvalidated request body fields).

---

#### SEC-015 — All teams share one Redis namespace

**File:** [api/_keys.js](api/_keys.js)  
**Severity:** Medium  
**Category:** Tenant Isolation

All Redis keys use a single `APP_KEY_PREFIX` (default: `app`). There is no per-team prefix. If multiple teams are provisioned on the same Upstash instance, their data lives under identical key structures, differentiated only by the `teamId` field stored inside the JSON values.

`ce:invites` in `_identityStore.js` uses the legacy prefix directly and is not namespaced by team at all — all teams' invites are stored in one list and filtered in application code.

If a bug in any filter path omits the `teamId` check (see SEC-014), data from one team can leak to another.

**Fix for multi-tenant use:** Namespace Redis keys by team: `${APP_KEY_PREFIX}:${teamId}:${resource}`. For a single-team deployment this is not urgent, but it becomes critical before adding a second tenant.

---

### LOW / INFORMATIONAL

---

#### SEC-016 — Rate limit failure mode blocks all protected endpoints

**File:** [api/_security.js](api/_security.js)  
**Severity:** Low  
**Category:** Availability / Denial of Service

`enforceRateLimit` reads from Redis. If the Upstash quota is exhausted (as happened during this project's testing), `kvGet` throws a 400 HTTP error which propagates and causes all rate-limited endpoints — including login — to return 500. Users are locked out not because of too many failed attempts, but because Redis is unavailable.

**Fix:** Wrap the Redis call in a try/catch. On Redis failure, either fail-open (allow the request) or fail with a clear `503 Service Unavailable` rather than 500. Document the choice.

---

#### SEC-017 — `auditLog` consumes Redis quota on every audited action

**File:** [api/_security.js](api/_security.js)  
**Severity:** Low / Informational  
**Category:** Resource Exhaustion

Every call to `auditLog` writes to Redis. This is the intended behaviour but compounds the quota exhaustion issue described in `REDIS_USAGE_AUDIT.md`. Under a failed-login storm, each rate-limited attempt both reads (rate limit check) and writes (audit log) to Redis.

**Recommendation:** Consider batching audit writes or moving them to a dedicated low-cost store (e.g., Vercel Log Drains) separate from the operational Redis instance.

---

#### SEC-018 — `x-forwarded-for` IP is trust-based and spoofable

**File:** [api/_security.js](api/_security.js)  
**Severity:** Low  
**Category:** Rate Limit Bypass

Rate limiting keys on `x-forwarded-for`. Vercel sets this header reliably, but on any non-Vercel deployment (local dev, alternative hosting, reverse-proxy misconfiguration), a caller can spoof this header and bypass per-IP rate limits.

**Informational:** Not actionable on Vercel, but worth noting if the hosting platform ever changes.

---

#### SEC-019 — Session cache may serve stale role/approval data for up to 30 s

**File:** [api/_identityStore.js](api/_identityStore.js) — `_SESSION_CACHE_TTL_MS`  
**Severity:** Low  
**Category:** Stale Session State (introduced by Redis optimisation)

The 30-second in-process session cache means that if a coach approves a pending player, or an admin changes a user's role, the affected user may continue to see their old role (and old access permissions) for up to 30 seconds until their cache entry expires.

**Accepted trade-off:** 30 seconds of stale role data is acceptable for a low-traffic sports team app. Document this in code with an inline comment near `_SESSION_CACHE_TTL_MS`.

---

#### SEC-020 — `loadSessions()` issues an implicit write on every read when sessions expire

**File:** [api/_identityStore.js](api/_identityStore.js) — `loadSessions`  
**Severity:** Low / Informational  
**Category:** Unexpected Write Side-Effect

`loadSessions` prunes expired sessions and writes back the cleaned list when the pruned list differs from the stored list. The read path (`resolveSession`) therefore silently becomes a read+write on any request where at least one session has expired. This is unexpected from a caller's perspective and consumes Redis write quota.

**Fix:** Separate session loading from pruning. Prune on logout or as a periodic cron task, not as a side effect of every read.

---

## Summary Table

| ID | File | Severity | Category | Status |
|---|---|---|---|---|
| SEC-001 | `api/mission-control.js` | **Critical** | Broken Access Control | Open |
| SEC-002 | `api/chat.js` | **Critical** | Broken Access Control | Open |
| SEC-003 | `api/_http.js`, `cron.js`, `reminder.js` | **High** | Credentials in Logs | Open |
| SEC-004 | `api/cron.js` | **High** | Excessive Data Exposure | Open |
| SEC-005 | `api/_identityStore.js` | **High** | Hardcoded Credentials | Open |
| SEC-006 | `api/subscribe.js` | **High** | Broken Access Control | Open |
| SEC-007 | `api/subscribe.js` | **High** | Broken Access Control | Open |
| SEC-008 | `api/_identityStore.js`, `invite.js` | Medium | Sensitive Data Exposure | Open |
| SEC-009 | `api/invite.js` | Medium | PII Disclosure | Open |
| SEC-010 | `api/_identityStore.js` | Medium | Information Leakage | Open |
| SEC-011 | `api/_identityStore.js` | Medium | Business Logic Bypass | Open |
| SEC-012 | `api/identity.js` | Medium | Missing Rate Limit | Open |
| SEC-013 | `api/_http.js` | Medium | Overly Permissive CORS | Open |
| SEC-014 | `api/_tenant.js` | Medium | Tenant Isolation | Open |
| SEC-015 | `api/_keys.js` | Medium | Tenant Isolation | Open |
| SEC-016 | `api/_security.js` | Low | Availability | Open |
| SEC-017 | `api/_security.js` | Low | Resource Exhaustion | Open |
| SEC-018 | `api/_security.js` | Low | Rate Limit Bypass | Open |
| SEC-019 | `api/_identityStore.js` | Low | Stale Session State | Open |
| SEC-020 | `api/_identityStore.js` | Low | Unexpected Write | Open |

---

## What Is Implemented Correctly

- **Password hashing:** `scrypt` with 64-byte output — appropriate for 2026 standards.
- **Legacy password migration:** SHA-256 legacy passwords are automatically upgraded to `scrypt` on first login.
- **Session tokens:** `randomBytes(32).toString('base64url')` — 256 bits, cryptographically random, stored as SHA-256 hash.
- **Password reset tokens:** `randomBytes(32).toString('base64url')` — invalidated on use via `usedAt` field.
- **Invite token entropy:** `randomBytes(24).toString('base64url')` — 192 bits, sufficient against brute-force.
- **Login rate limiting:** 5 attempts per 15 min per IP+email via `enforceRateLimit`.
- **Invite creation rate limiting:** 20 per hour per user+IP.
- **Tenant role checks on mutations:** `requireTenantRole` + `assertSameTenant` are applied on all state-changing endpoints (approve, reject, roster mutations, push notifications, availability writes).
- **`publicUser` stripping:** password hash, token, and internal fields are removed before any user object is returned to clients.
- **Invite creation/deletion authz:** All `PATCH`/`DELETE` on invites require `requireTenantRole` + `assertSameTenant`.
- **Coach role required for admin endpoints:** `GET /api/identity`, `GET /api/log`, `GET /api/push`, `GET /api/availability` all require `['coach', 'admin']` role.

---

## Recommended Remediation Priority

1. **Immediate (before any public URL sharing):**
   - SEC-001: Lock down `/api/mission-control`
   - SEC-002: Require authentication for `GET /api/chat?action=conversations`
   - SEC-005: Rotate / remove the hardcoded `1111` password from source

2. **Short term (next sprint):**
   - SEC-003: Remove `?secret=` query-param support from `readSecret`
   - SEC-006 / SEC-007: Add authentication to subscribe POST and DELETE
   - SEC-004: Remove or lock down the `cron.js` debug action

3. **Medium term:**
   - SEC-008: Hash invite tokens at rest
   - SEC-009: Rate-limit invite token validation; remove email from unauthenticated response
   - SEC-012: Rate-limit `join_group_invite`
   - SEC-013: Restrict CORS to known origins
   - SEC-014 / SEC-015: Audit `assertSameTenant` call sites; namespace Redis keys per-team

---

*Audit performed by static code review only. No runtime tests were executed. No Redis quota was consumed.*
