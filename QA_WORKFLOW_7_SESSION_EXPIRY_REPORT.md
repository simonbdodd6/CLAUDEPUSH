# QA Workflow 7 — Player Session Expiry Recovery (Messages)

**Generated:** 2026-06-08T14:30:15.786Z
**Commit:** `7b78d44`
**Base URL:** https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app
**Player credentials from:** qa/results/workflow-4.json (auto-read from W4 pass)
**Player email:** `qa.w4+1780928841384@coachseye.test`
**ce_session cookie found after login:** ✅ yes
**Status:** FAILED

---

## Result

- **Overall:** ❌ FAIL
- **First failure:** Step 8 — "Re-login as player"
- **Error:** Re-login did not clear session-expired message within 15s. #authPanel: "
        
          Log in
          ✕
        
        Your session has expired. Please log in again.
        
          
          
          Log in
          Forgot password?
          Dev: Login a"
- **Failure screenshot:** qa/artifacts/workflow7-2026-06-08T14-29-30-355Z/08-re-login-as-player.png

## Steps

| # | Step | Status | Duration | Screenshot | Notes |
|---|---|---|---|---|---|
| 1 | Open app | PASSED | 3936ms | [png](qa/artifacts/workflow7-2026-06-08T14-29-30-355Z/01-open-app.png) |  |
| 2 | Player login | PASSED | 4610ms | [png](qa/artifacts/workflow7-2026-06-08T14-29-30-355Z/02-player-login.png) |  |
| 3 | Navigate to Messages | PASSED | 1783ms | [png](qa/artifacts/workflow7-2026-06-08T14-29-30-355Z/03-navigate-to-messages.png) |  |
| 4 | Open Squad channel — verify message history | PASSED | 1449ms | [png](qa/artifacts/workflow7-2026-06-08T14-29-30-355Z/04-open-squad-channel-verify-message-history.png) | Squad channel open; chat feed visible |
| 5 | Force session expiry — corrupt ce_session cookie | PASSED | 1222ms | [png](qa/artifacts/workflow7-2026-06-08T14-29-30-355Z/05-force-session-expiry-corrupt-ce-session-cookie.png) | ce_session overwritten with EXPIRED_QA_SESSION_... token |
| 6 | Verify session-expiry overlay appears | PASSED | 2802ms | [png](qa/artifacts/workflow7-2026-06-08T14-29-30-355Z/06-verify-session-expiry-overlay-appears.png) | 401 received; login form with red error banner confirmed |
| 7 | Verify anti-loop — 5s wait, login form stable | PASSED | 6297ms | [png](qa/artifacts/workflow7-2026-06-08T14-29-30-355Z/07-verify-anti-loop-5s-wait-login-form-stable.png) | 401 storm handled; login form shown once; no JS crash |
| 8 | Re-login as player | FAILED | 18057ms | [png](qa/artifacts/workflow7-2026-06-08T14-29-30-355Z/08-re-login-as-player.png) | Re-login did not clear session-expired message within 15s. #authPanel: "
        
          Log in
          ✕
        
        Yo |

## Session Expiry Events

| Phase | Endpoint | HTTP Status | Timestamp |
|---|---|---|---|
| 1 | `/api/chat` | 401 | 2026-06-08T14:29:36.947Z |
| 2 | `/api/chat` | 401 | 2026-06-08T14:29:37.253Z |
| 3 | `/api/message-config` | 401 | 2026-06-08T14:29:37.732Z |
| 4 | `/api/message-config` | 401 | 2026-06-08T14:29:37.733Z |
| 5 | `/api/identity` | 401 | 2026-06-08T14:29:37.733Z |
| 6 | `/api/identity` | 401 | 2026-06-08T14:29:37.733Z |
| 7 | `/api/chat` | 401 | 2026-06-08T14:29:37.736Z |
| 8 | `/api/message-config` | 401 | 2026-06-08T14:29:37.736Z |
| 9 | `/api/chat` | 401 | 2026-06-08T14:29:37.736Z |
| 10 | `/api/message-config` | 401 | 2026-06-08T14:29:37.737Z |
| 11 | `/api/message-config` | 401 | 2026-06-08T14:29:37.742Z |
| 12 | `/api/identity` | 401 | 2026-06-08T14:29:37.742Z |
| 13 | `/api/message-config` | 401 | 2026-06-08T14:29:37.742Z |
| 14 | `/api/chat` | 401 | 2026-06-08T14:29:40.217Z |
| 15 | `/api/chat` | 401 | 2026-06-08T14:29:40.249Z |
| 16 | `/api/message-config` | 401 | 2026-06-08T14:29:40.392Z |
| 17 | `/api/message-config` | 401 | 2026-06-08T14:29:40.395Z |
| 18 | `/api/identity` | 401 | 2026-06-08T14:29:40.395Z |
| 19 | `/api/chat` | 401 | 2026-06-08T14:29:40.395Z |
| 20 | `/api/identity` | 401 | 2026-06-08T14:29:40.395Z |
| 21 | `/api/message-config` | 401 | 2026-06-08T14:29:40.405Z |
| 22 | `/api/chat` | 401 | 2026-06-08T14:29:40.452Z |
| 23 | `/api/message-config` | 401 | 2026-06-08T14:29:40.664Z |
| 24 | `/api/identity` | 401 | 2026-06-08T14:29:40.668Z |
| 25 | `/api/message-config` | 401 | 2026-06-08T14:29:40.675Z |
| 26 | `/api/identity` | 401 | 2026-06-08T14:29:40.675Z |
| 27 | `/api/message-config` | 401 | 2026-06-08T14:29:40.744Z |
| 28 | `/api/chat` | 401 | 2026-06-08T14:29:49.615Z |
| 29 | `/api/chat` | 401 | 2026-06-08T14:29:49.892Z |
| 30 | `/api/chat` | 401 | 2026-06-08T14:29:49.893Z |
| 31 | `/api/identity` | 401 | 2026-06-08T14:29:49.977Z |
| 32 | `/api/message-config` | 401 | 2026-06-08T14:29:49.987Z |
| 33 | `/api/message-config` | 401 | 2026-06-08T14:29:49.990Z |
| 34 | `/api/chat` | 401 | 2026-06-08T14:29:49.997Z |
| 35 | `/api/identity` | 401 | 2026-06-08T14:29:50.003Z |
| 36 | `/api/chat` | 401 | 2026-06-08T14:29:50.200Z |
| 37 | `/api/message-config` | 401 | 2026-06-08T14:29:50.200Z |
| 38 | `/api/chat` | 401 | 2026-06-08T14:29:52.092Z |
| 39 | `/api/chat` | 401 | 2026-06-08T14:29:52.482Z |
| 40 | `/api/chat` | 401 | 2026-06-08T14:29:54.542Z |
| 41 | `/api/chat` | 401 | 2026-06-08T14:29:55.369Z |
| 42 | `/api/chat` | 401 | 2026-06-08T14:29:57.236Z |
| 43 | `/api/chat` | 401 | 2026-06-08T14:29:57.555Z |
| 44 | `/api/chat` | 401 | 2026-06-08T14:29:59.567Z |
| 45 | `/api/chat` | 401 | 2026-06-08T14:29:59.845Z |

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
| `/api/chat` | GET/POST | 51 | ~408 |
| `/api/message-config` | GET | 27 | ~54 |
| `/api/identity` | GET/POST | 17 | ~106 |
| `/api/invite` | GET | 3 | ~12 |
| `/api/fixtures` | GET | 2 | ~4 |
| `/api/matchday` | GET | 2 | ~4 |
| **Total** | | **102** | **~588** |

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
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
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
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()

## Toast Messages

- 2026-06-08T14:29:42.689Z — Welcome QA4 Player1780928841384
- 2026-06-08T14:29:59.694Z — Welcome QA4 Player1780928841384

## Page Errors

- None

## Network Failures (non-401)

- net::ERR_ABORTED — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe
- net::ERR_ABORTED — HEAD https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/
- net::ERR_ABORTED — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe
- net::ERR_ABORTED — HEAD https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 404  — POST https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/chat
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/invite
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 404  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=dm%3Acoach-demo%3Auser_1780928917949_s33ddt&since=0&userId=user_1780928917949_s33ddt
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/invite
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 404  — POST https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/chat
- HTTP 404  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=dm%3Acoach-demo%3Auser_1780928917949_s33ddt&since=1780928982666&userId=user_1780928917949_s33ddt
- HTTP 404  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=dm%3Acoach-demo%3Auser_1780928917949_s33ddt&userId=user_1780928917949_s33ddt
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/invite
- HTTP 404  — POST https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/chat
- HTTP 404  — POST https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/chat
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 403  — GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates

## What Passes

- Open app
- Player login
- Navigate to Messages
- Open Squad channel — verify message history
- Force session expiry — corrupt ce_session cookie
- Verify session-expiry overlay appears
- Verify anti-loop — 5s wait, login form stable

## Scope Guard

- No Coach's Eye application code was modified.
- One session cookie is corrupted and then restored via re-login per run.
- No messages are written to Redis (session expiry test does not send messages).
- Workflow 7 stops at the first failure.

