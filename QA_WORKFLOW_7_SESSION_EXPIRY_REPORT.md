# QA Workflow 7 — Player Session Expiry Recovery (Messages)

**Generated:** 2026-06-08T12:11:55.671Z
**Commit:** `30f697c`
**Base URL:** https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app
**Player credentials from:** qa/results/workflow-4.json (auto-read from W4 pass)
**Player email:** `qa.w4+1780909306779@coachseye.test`
**ce_session cookie found after login:** ✅ yes
**Status:** PASSED

---

## Result

- **Overall:** ✅ PASS
- **First failure:** none



## Steps

| # | Step | Status | Duration | Screenshot | Notes |
|---|---|---|---|---|---|
| 1 | Open app | PASSED | 5997ms | [png](qa/artifacts/workflow7-2026-06-08T12-11-11-101Z/01-open-app.png) |  |
| 2 | Player login | PASSED | 5446ms | [png](qa/artifacts/workflow7-2026-06-08T12-11-11-101Z/02-player-login.png) |  |
| 3 | Navigate to Messages | PASSED | 985ms | [png](qa/artifacts/workflow7-2026-06-08T12-11-11-101Z/03-navigate-to-messages.png) |  |
| 4 | Open Squad channel — verify message history | PASSED | 887ms | [png](qa/artifacts/workflow7-2026-06-08T12-11-11-101Z/04-open-squad-channel-verify-message-history.png) | Squad channel open; chat feed visible |
| 5 | Force session expiry — corrupt ce_session cookie | PASSED | 499ms | [png](qa/artifacts/workflow7-2026-06-08T12-11-11-101Z/05-force-session-expiry-corrupt-ce-session-cookie.png) | ce_session overwritten with EXPIRED_QA_SESSION_... token |
| 6 | Verify session-expiry overlay appears | PASSED | 3326ms | [png](qa/artifacts/workflow7-2026-06-08T12-11-11-101Z/06-verify-session-expiry-overlay-appears.png) | 401 received; login form with red error banner confirmed |
| 7 | Verify anti-loop — 5s wait, login form stable | PASSED | 6713ms | [png](qa/artifacts/workflow7-2026-06-08T12-11-11-101Z/07-verify-anti-loop-5s-wait-login-form-stable.png) | 401 storm handled; login form shown once; no JS crash |
| 8 | Re-login as player | PASSED | 6151ms | [png](qa/artifacts/workflow7-2026-06-08T12-11-11-101Z/08-re-login-as-player.png) | Re-login successful; player nav visible |
| 9 | Verify overlay clears — session-expired message gone | PASSED | 1780ms | [png](qa/artifacts/workflow7-2026-06-08T12-11-11-101Z/09-verify-overlay-clears-session-expired-message-gone.png) |  |
| 10 | Verify player nav — navigate to Availability | PASSED | 1587ms | [png](qa/artifacts/workflow7-2026-06-08T12-11-11-101Z/10-verify-player-nav-navigate-to-availability.png) |  |
| 11 | Navigate back to Messages | PASSED | 1788ms | [png](qa/artifacts/workflow7-2026-06-08T12-11-11-101Z/11-navigate-back-to-messages.png) |  |
| 12 | Verify messages accessible — Squad history intact | PASSED | 1294ms | [png](qa/artifacts/workflow7-2026-06-08T12-11-11-101Z/12-verify-messages-accessible-squad-history-intact.png) | Squad channel opens after recovery; chat history accessible |

## Session Expiry Events

| Phase | Endpoint | HTTP Status | Timestamp |
|---|---|---|---|
| 1 | `/api/chat` | 401 | 2026-06-08T12:11:20.937Z |
| 2 | `/api/chat` | 401 | 2026-06-08T12:11:22.065Z |
| 3 | `/api/chat` | 401 | 2026-06-08T12:11:22.141Z |
| 4 | `/api/chat` | 401 | 2026-06-08T12:11:22.159Z |
| 5 | `/api/identity` | 401 | 2026-06-08T12:11:22.556Z |
| 6 | `/api/templates` | 401 | 2026-06-08T12:11:22.559Z |
| 7 | `/api/identity` | 401 | 2026-06-08T12:11:22.562Z |
| 8 | `/api/schedules` | 401 | 2026-06-08T12:11:22.562Z |
| 9 | `/api/templates` | 401 | 2026-06-08T12:11:22.563Z |
| 10 | `/api/schedules` | 401 | 2026-06-08T12:11:22.992Z |
| 11 | `/api/templates` | 401 | 2026-06-08T12:11:23.009Z |
| 12 | `/api/identity` | 401 | 2026-06-08T12:11:23.009Z |
| 13 | `/api/templates` | 401 | 2026-06-08T12:11:23.028Z |
| 14 | `/api/chat` | 401 | 2026-06-08T12:11:23.620Z |
| 15 | `/api/chat` | 401 | 2026-06-08T12:11:23.854Z |
| 16 | `/api/chat` | 401 | 2026-06-08T12:11:26.054Z |
| 17 | `/api/chat` | 401 | 2026-06-08T12:11:26.449Z |
| 18 | `/api/identity` | 401 | 2026-06-08T12:11:26.488Z |
| 19 | `/api/schedules` | 401 | 2026-06-08T12:11:26.489Z |
| 20 | `/api/templates` | 401 | 2026-06-08T12:11:26.492Z |
| 21 | `/api/chat` | 401 | 2026-06-08T12:11:26.493Z |
| 22 | `/api/identity` | 401 | 2026-06-08T12:11:26.497Z |
| 23 | `/api/templates` | 401 | 2026-06-08T12:11:26.526Z |
| 24 | `/api/chat` | 401 | 2026-06-08T12:11:26.528Z |
| 25 | `/api/identity` | 401 | 2026-06-08T12:11:26.720Z |
| 26 | `/api/schedules` | 401 | 2026-06-08T12:11:26.720Z |
| 27 | `/api/templates` | 401 | 2026-06-08T12:11:26.722Z |
| 28 | `/api/templates` | 401 | 2026-06-08T12:11:26.873Z |
| 29 | `/api/chat` | 401 | 2026-06-08T12:11:28.779Z |
| 30 | `/api/chat` | 401 | 2026-06-08T12:11:29.379Z |
| 31 | `/api/chat` | 401 | 2026-06-08T12:11:35.366Z |
| 32 | `/api/chat` | 401 | 2026-06-08T12:11:35.924Z |
| 33 | `/api/chat` | 401 | 2026-06-08T12:11:35.926Z |
| 34 | `/api/templates` | 401 | 2026-06-08T12:11:35.931Z |
| 35 | `/api/schedules` | 401 | 2026-06-08T12:11:35.933Z |
| 36 | `/api/identity` | 401 | 2026-06-08T12:11:35.934Z |
| 37 | `/api/identity` | 401 | 2026-06-08T12:11:35.940Z |
| 38 | `/api/chat` | 401 | 2026-06-08T12:11:35.941Z |
| 39 | `/api/templates` | 401 | 2026-06-08T12:11:36.417Z |
| 40 | `/api/chat` | 401 | 2026-06-08T12:11:36.417Z |
| 41 | `/api/chat` | 401 | 2026-06-08T12:11:37.698Z |
| 42 | `/api/chat` | 401 | 2026-06-08T12:11:38.536Z |
| 43 | `/api/chat` | 401 | 2026-06-08T12:11:40.608Z |
| 44 | `/api/chat` | 401 | 2026-06-08T12:11:41.134Z |
| 45 | `/api/chat` | 401 | 2026-06-08T12:11:43.266Z |
| 46 | `/api/chat` | 401 | 2026-06-08T12:11:43.907Z |
| 47 | `/api/chat` | 401 | 2026-06-08T12:11:45.339Z |
| 48 | `/api/chat` | 401 | 2026-06-08T12:11:46.080Z |

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
| `/api/chat` | GET/POST | 57 | ~456 |
| `/api/templates` | GET | 24 | ~48 |
| `/api/identity` | GET/POST | 21 | ~130 |
| `/api/schedules` | GET | 12 | ~24 |
| `/api/invite` | GET | 5 | ~20 |
| **Total** | | **119** | **~678** |

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
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()

## Toast Messages

- 2026-06-08T12:11:29.321Z — Welcome QA4 Player1780909306779
- 2026-06-08T12:11:45.744Z — Welcome QA4 Player1780909306779

## Page Errors

- None

## Network Failures (non-401)

- net::ERR_ABORTED — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe
- net::ERR_ABORTED — HEAD https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/
- net::ERR_ABORTED — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe
- net::ERR_ABORTED — HEAD https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/schedules
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/invite
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/schedules
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/invite
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/schedules
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/invite
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/schedules
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/schedules
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/schedules
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/invite
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/schedules
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/invite
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates

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

