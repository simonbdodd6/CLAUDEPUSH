# QA Workflow 7 — Player Session Expiry Recovery (Messages)

**Generated:** 2026-06-08T13:16:54.594Z
**Commit:** `90e8125`
**Base URL:** https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app
**Player credentials from:** qa/results/workflow-4.json (auto-read from W4 pass)
**Player email:** `qa.w4+1780924420801@coachseye.test`
**ce_session cookie found after login:** ✅ yes
**Status:** PASSED

---

## Result

- **Overall:** ✅ PASS
- **First failure:** none



## Steps

| # | Step | Status | Duration | Screenshot | Notes |
|---|---|---|---|---|---|
| 1 | Open app | PASSED | 2373ms | [png](qa/artifacts/workflow7-2026-06-08T13-16-29-030Z/01-open-app.png) |  |
| 2 | Player login | PASSED | 3469ms | [png](qa/artifacts/workflow7-2026-06-08T13-16-29-030Z/02-player-login.png) |  |
| 3 | Navigate to Messages | PASSED | 1056ms | [png](qa/artifacts/workflow7-2026-06-08T13-16-29-030Z/03-navigate-to-messages.png) |  |
| 4 | Open Squad channel — verify message history | PASSED | 1658ms | [png](qa/artifacts/workflow7-2026-06-08T13-16-29-030Z/04-open-squad-channel-verify-message-history.png) | Squad channel open; chat feed visible |
| 5 | Force session expiry — corrupt ce_session cookie | PASSED | 581ms | [png](qa/artifacts/workflow7-2026-06-08T13-16-29-030Z/05-force-session-expiry-corrupt-ce-session-cookie.png) | ce_session overwritten with EXPIRED_QA_SESSION_... token |
| 6 | Verify session-expiry overlay appears | PASSED | 2600ms | [png](qa/artifacts/workflow7-2026-06-08T13-16-29-030Z/06-verify-session-expiry-overlay-appears.png) | 401 received; login form with red error banner confirmed |
| 7 | Verify anti-loop — 5s wait, login form stable | PASSED | 5848ms | [png](qa/artifacts/workflow7-2026-06-08T13-16-29-030Z/07-verify-anti-loop-5s-wait-login-form-stable.png) | 401 storm handled; login form shown once; no JS crash |
| 8 | Re-login as player | PASSED | 2944ms | [png](qa/artifacts/workflow7-2026-06-08T13-16-29-030Z/08-re-login-as-player.png) | Re-login successful; player nav visible |
| 9 | Verify overlay clears — session-expired message gone | PASSED | 905ms | [png](qa/artifacts/workflow7-2026-06-08T13-16-29-030Z/09-verify-overlay-clears-session-expired-message-gone.png) |  |
| 10 | Verify player nav — navigate to Availability | PASSED | 794ms | [png](qa/artifacts/workflow7-2026-06-08T13-16-29-030Z/10-verify-player-nav-navigate-to-availability.png) |  |
| 11 | Navigate back to Messages | PASSED | 1131ms | [png](qa/artifacts/workflow7-2026-06-08T13-16-29-030Z/11-navigate-back-to-messages.png) |  |
| 12 | Verify messages accessible — Squad history intact | PASSED | 688ms | [png](qa/artifacts/workflow7-2026-06-08T13-16-29-030Z/12-verify-messages-accessible-squad-history-intact.png) | Squad channel opens after recovery; chat history accessible |

## Session Expiry Events

| Phase | Endpoint | HTTP Status | Timestamp |
|---|---|---|---|
| 1 | `/api/chat` | 401 | 2026-06-08T13:16:31.338Z |
| 2 | `/api/message-config` | 401 | 2026-06-08T13:16:31.875Z |
| 3 | `/api/chat` | 401 | 2026-06-08T13:16:31.875Z |
| 4 | `/api/identity` | 401 | 2026-06-08T13:16:31.877Z |
| 5 | `/api/identity` | 401 | 2026-06-08T13:16:31.927Z |
| 6 | `/api/message-config` | 401 | 2026-06-08T13:16:31.931Z |
| 7 | `/api/chat` | 401 | 2026-06-08T13:16:31.958Z |
| 8 | `/api/message-config` | 401 | 2026-06-08T13:16:31.962Z |
| 9 | `/api/chat` | 401 | 2026-06-08T13:16:31.965Z |
| 10 | `/api/message-config` | 401 | 2026-06-08T13:16:32.157Z |
| 11 | `/api/identity` | 401 | 2026-06-08T13:16:32.158Z |
| 12 | `/api/identity` | 401 | 2026-06-08T13:16:32.160Z |
| 13 | `/api/message-config` | 401 | 2026-06-08T13:16:32.161Z |
| 14 | `/api/message-config` | 401 | 2026-06-08T13:16:32.265Z |
| 15 | `/api/chat` | 401 | 2026-06-08T13:16:33.387Z |
| 16 | `/api/chat` | 401 | 2026-06-08T13:16:33.393Z |
| 17 | `/api/message-config` | 401 | 2026-06-08T13:16:33.393Z |
| 18 | `/api/message-config` | 401 | 2026-06-08T13:16:33.393Z |
| 19 | `/api/identity` | 401 | 2026-06-08T13:16:33.394Z |
| 20 | `/api/identity` | 401 | 2026-06-08T13:16:33.513Z |
| 21 | `/api/chat` | 401 | 2026-06-08T13:16:33.516Z |
| 22 | `/api/message-config` | 401 | 2026-06-08T13:16:33.517Z |
| 23 | `/api/chat` | 401 | 2026-06-08T13:16:33.569Z |
| 24 | `/api/message-config` | 401 | 2026-06-08T13:16:33.681Z |
| 25 | `/api/message-config` | 401 | 2026-06-08T13:16:33.687Z |
| 26 | `/api/identity` | 401 | 2026-06-08T13:16:33.694Z |
| 27 | `/api/identity` | 401 | 2026-06-08T13:16:33.695Z |
| 28 | `/api/message-config` | 401 | 2026-06-08T13:16:33.792Z |
| 29 | `/api/chat` | 401 | 2026-06-08T13:16:41.074Z |
| 30 | `/api/chat` | 401 | 2026-06-08T13:16:41.444Z |
| 31 | `/api/message-config` | 401 | 2026-06-08T13:16:41.601Z |
| 32 | `/api/identity` | 401 | 2026-06-08T13:16:41.601Z |
| 33 | `/api/message-config` | 401 | 2026-06-08T13:16:41.601Z |
| 34 | `/api/identity` | 401 | 2026-06-08T13:16:41.602Z |
| 35 | `/api/chat` | 401 | 2026-06-08T13:16:41.604Z |
| 36 | `/api/chat` | 401 | 2026-06-08T13:16:41.611Z |
| 37 | `/api/message-config` | 401 | 2026-06-08T13:16:41.940Z |
| 38 | `/api/chat` | 401 | 2026-06-08T13:16:41.941Z |
| 39 | `/api/chat` | 401 | 2026-06-08T13:16:43.535Z |
| 40 | `/api/chat` | 401 | 2026-06-08T13:16:43.821Z |
| 41 | `/api/chat` | 401 | 2026-06-08T13:16:46.026Z |
| 42 | `/api/chat` | 401 | 2026-06-08T13:16:46.251Z |
| 43 | `/api/chat` | 401 | 2026-06-08T13:16:48.628Z |
| 44 | `/api/chat` | 401 | 2026-06-08T13:16:49.047Z |

## Coverage vs Requirements

| Requirement | Verified | How |
|---|---|---|
| 1. Player logs in | ✅ | Step 2 — shared playerLogin() helper with W4 credentials |
| 2. Open Messages | ✅ | Steps 3–4 — #chatContactList visible; Squad channel open |
| 3. Force session expiry | ✅ | Step 5 — ce_session overwritten with garbage token |
| 4. Verify overlay appears | ✅ | Step 6 — 2.5s chat poll returns 401; login form + red error banner |
| 5. Re-login as same player | ✅ | Step 8 — credential form in overlay; same email/password |
| 6. Verify overlay clears | ✅ | Step 9 — "session has expired" message gone from #authPanel |
| 7. Verify player nav works | ✅ | Step 10 — navigate to Availability; section loads |
| 8. Verify messages accessible | ✅ | Steps 11–12 — #chatContactList visible; Squad history intact |
| 9. Anti-loop guard | ✅ | Step 7 — 5s wait; login form shown once; no JS crashes |

## Architecture Notes

- `intercept401` wraps `window.fetch` globally — fires for ALL endpoints, not just chat
- Guard: `if (_sessionExpiredMessage) return` prevents re-entry if multiple polls 401 simultaneously
- Player re-login uses the credential form (same as initial login) — no devLoginBtn for players
- After recovery, `_sessionExpiredMessage` is cleared by `loginIdentityAccount()` success handler
- The 2.5s chat poll is the trigger: next poll after cookie corruption returns 401

## Known Issues / Gaps

- **False-positive expiry on player login:** 403s on coach-only endpoints (`/api/invite`, `/api/schedules`) during initial data load incorrectly trigger `handleSessionExpiry()`. Fixed in shared-steps.js `playerLogin` via `setAuthTab('closed')` after nav appears.
- **Player nav context after recovery:** After re-login, player lands on Messages (default section). Previous section context is not preserved — this is a known UX gap documented in W8.
- **devLoginBtn for coach only:** Players cannot use devLoginBtn — credential form is the only recovery path.

## Redis Impact (API Calls)

| Endpoint | Method | Calls | Est. ops |
|---|---|---|---|
| `/api/chat` | GET/POST | 40 | ~320 |
| `/api/message-config` | GET | 30 | ~60 |
| `/api/identity` | GET/POST | 19 | ~118 |
| `/api/invite` | GET | 6 | ~24 |
| `/api/matchday` | GET | 2 | ~4 |
| `/api/fixtures` | GET | 2 | ~4 |
| **Total** | | **99** | **~530** |

> API calls during session expiry period return 401 with ~1-2 ops (session lookup only).
> Full W7 run: ~2 logins × 8 ops + ~10 chat polls × 8 ops = ~96 ops estimated.

## Estimated Manual Testing Time Saved

| Task | Manual | Automated |
|---|---|---|
| Open app, player login, navigate to Messages | 60s | — |
| Open Squad channel, verify messages | 15s | — |
| Manually corrupt session (DevTools → Application → Cookies) | 30s | — |
| Observe overlay appear (wait for poll) | 15s | — |
| Verify "session has expired" banner, login form | 15s | — |
| Re-login as player, verify overlay clears | 20s | — |
| Navigate to Availability, verify it loads | 15s | — |
| Navigate back to Messages, verify Squad history | 15s | — |
| Screenshot both states + record result | 60s | — |
| **Total per run** | **~4 min** | **~45s** |

- **Saved per run:** ~3.5 minutes
- **Workflows 1–7 combined:** ~38 min saved per nightly run

## Remaining Manual Tests

- **Player availability expiry** (W8): player saves availability with expired session; verify 401 handling.
- **Cross-browser:** test expiry recovery in Safari/Firefox — cookie handling may differ.
- **Concurrent expiry:** two players logged in, one expires, other continues normally.
- **Expiry during page navigation:** session expires while loading a new section.

## Console Errors & Warnings

- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()

## Toast Messages

- 2026-06-08T13:16:35.499Z — Welcome QA4 Player1780924420801
- 2026-06-08T13:16:49.917Z — Welcome QA4 Player1780924420801

## Page Errors

- None

## Network Failures (non-401)

- net::ERR_ABORTED — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe
- net::ERR_ABORTED — HEAD https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/
- net::ERR_ABORTED — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe
- net::ERR_ABORTED — HEAD https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates

## What Passes

- Open app
- Player login
- Navigate to Messages
- Open Squad channel — verify message history
- Force session expiry — corrupt ce_session cookie
- Verify session-expiry overlay appears
- Verify anti-loop — 5s wait, login form stable
- Re-login as player
- Verify overlay clears — session-expired message gone
- Verify player nav — navigate to Availability
- Navigate back to Messages
- Verify messages accessible — Squad history intact

## Scope Guard

- No Coach's Eye application code was modified.
- One session cookie is corrupted and then restored via re-login per run.
- No messages are written to Redis (session expiry test does not send messages).
- Workflow 7 stops at the first failure.

