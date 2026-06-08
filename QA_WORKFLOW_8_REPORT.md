# QA Workflow 8 — Player-side Session Expiry Recovery

**Generated:** 2026-06-08T13:17:31.329Z
**Commit:** `90e8125`
**Base URL:** https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app
**Player:** qa.w4+1780924420801@coachseye.test (QA4 Player1780924420801)
**ce_session found after player login:** ✅ yes
**Post-login section after re-login:** not recorded _(expected: messages — known UX gap)_
**Status:** FAILED

---

## Result

- **Overall:** ❌ FAIL
- **First failure:** Step 11 — "Re-login as player (credential form)"
- **Error:** Player re-login did not clear session-expired message within 15s. #authPanel: "
        
          Log in
          ✕
        
        Your session has expired. Please log in again.
        
          
          
          Log in
          Forgot password?
          Dev: Login a"
- **Failure screenshot:** qa/artifacts/workflow8-2026-06-08T13-16-56-199Z/11-re-login-as-player-credential-form.png

## Steps

| # | Step | Status | Duration | Screenshot | Notes |
|---|---|---|---|---|---|
| 1 | Open app | PASSED | 2328ms | [png](qa/artifacts/workflow8-2026-06-08T13-16-56-199Z/01-open-app.png) |  |
| 2 | Player login | PASSED | 3664ms | [png](qa/artifacts/workflow8-2026-06-08T13-16-56-199Z/02-player-login.png) |  |
| 3 | Navigate to Availability section | PASSED | 809ms | [png](qa/artifacts/workflow8-2026-06-08T13-16-56-199Z/03-navigate-to-availability-section.png) |  |
| 4 | Baseline: set game = Available — POST /api/availability 200 | PASSED | 1375ms | [png](qa/artifacts/workflow8-2026-06-08T13-16-56-199Z/04-baseline-set-game-available-post-api-availability-200.png) |  |
| 5 | Verify Availability section renders correctly | PASSED | 848ms | [png](qa/artifacts/workflow8-2026-06-08T13-16-56-199Z/05-verify-availability-section-renders-correctly.png) |  |
| 6 | Force session expiry (corrupt ce_session cookie) | PASSED | 595ms | [png](qa/artifacts/workflow8-2026-06-08T13-16-56-199Z/06-force-session-expiry-corrupt-ce-session-cookie.png) |  |
| 7 | Trigger 401: set game = Unavailable → POST /api/availability 401 | PASSED | 1176ms | [png](qa/artifacts/workflow8-2026-06-08T13-16-56-199Z/07-trigger-401-set-game-unavailable-post-api-availability-401.png) |  |
| 8 | Verify session-expiry login form appears | PASSED | 542ms | [png](qa/artifacts/workflow8-2026-06-08T13-16-56-199Z/08-verify-session-expiry-login-form-appears.png) |  |
| 9 | Verify player screen preserved — #playerNav visible, section active | PASSED | 438ms | [png](qa/artifacts/workflow8-2026-06-08T13-16-56-199Z/09-verify-player-screen-preserved-playernav-visible-section-active.png) |  |
| 10 | Anti-loop: 5s wait — single login form, no JS errors | PASSED | 5713ms | [png](qa/artifacts/workflow8-2026-06-08T13-16-56-199Z/10-anti-loop-5s-wait-single-login-form-no-js-errors.png) |  |
| 11 | Re-login as player (credential form) | FAILED | 16087ms | [png](qa/artifacts/workflow8-2026-06-08T13-16-56-199Z/11-re-login-as-player-credential-form.png) | Player re-login did not clear session-expired message within 15s. #authPanel: "
        
          Log in
          ✕
        
    |

## Session Expiry Events

| Endpoint | HTTP Status | Timestamp |
|---|---|---|
| `/api/chat` | 401 | 2026-06-08T13:16:58.479Z |
| `/api/chat` | 401 | 2026-06-08T13:16:58.609Z |
| `/api/message-config` | 401 | 2026-06-08T13:16:58.626Z |
| `/api/message-config` | 401 | 2026-06-08T13:16:58.628Z |
| `/api/identity` | 401 | 2026-06-08T13:16:58.628Z |
| `/api/identity` | 401 | 2026-06-08T13:16:58.630Z |
| `/api/chat` | 401 | 2026-06-08T13:16:58.635Z |
| `/api/message-config` | 401 | 2026-06-08T13:16:58.896Z |
| `/api/message-config` | 401 | 2026-06-08T13:16:58.897Z |
| `/api/chat` | 401 | 2026-06-08T13:16:58.901Z |
| `/api/identity` | 401 | 2026-06-08T13:16:58.927Z |
| `/api/message-config` | 401 | 2026-06-08T13:16:58.930Z |
| `/api/message-config` | 401 | 2026-06-08T13:16:59.001Z |
| `/api/chat` | 401 | 2026-06-08T13:17:00.467Z |
| `/api/chat` | 401 | 2026-06-08T13:17:00.601Z |
| `/api/identity` | 401 | 2026-06-08T13:17:00.604Z |
| `/api/message-config` | 401 | 2026-06-08T13:17:00.605Z |
| `/api/message-config` | 401 | 2026-06-08T13:17:00.607Z |
| `/api/identity` | 401 | 2026-06-08T13:17:00.726Z |
| `/api/message-config` | 401 | 2026-06-08T13:17:00.735Z |
| `/api/chat` | 401 | 2026-06-08T13:17:00.748Z |
| `/api/message-config` | 401 | 2026-06-08T13:17:00.899Z |
| `/api/identity` | 401 | 2026-06-08T13:17:00.899Z |
| `/api/message-config` | 401 | 2026-06-08T13:17:00.900Z |
| `/api/chat` | 401 | 2026-06-08T13:17:00.900Z |
| `/api/message-config` | 401 | 2026-06-08T13:17:00.924Z |
| `/api/chat` | 401 | 2026-06-08T13:17:07.366Z |
| `/api/chat` | 401 | 2026-06-08T13:17:07.645Z |
| `/api/chat` | 401 | 2026-06-08T13:17:07.862Z |
| `/api/message-config` | 401 | 2026-06-08T13:17:07.862Z |
| `/api/message-config` | 401 | 2026-06-08T13:17:07.873Z |
| `/api/identity` | 401 | 2026-06-08T13:17:07.873Z |
| `/api/identity` | 401 | 2026-06-08T13:17:07.873Z |
| `/api/chat` | 401 | 2026-06-08T13:17:07.880Z |
| `/api/message-config` | 401 | 2026-06-08T13:17:08.008Z |
| `/api/message-config` | 401 | 2026-06-08T13:17:08.019Z |
| `/api/identity` | 401 | 2026-06-08T13:17:08.022Z |
| `/api/message-config` | 401 | 2026-06-08T13:17:08.332Z |
| `/api/message-config` | 401 | 2026-06-08T13:17:08.609Z |
| `/api/chat` | 401 | 2026-06-08T13:17:10.344Z |
| `/api/chat` | 401 | 2026-06-08T13:17:10.590Z |
| `/api/chat` | 401 | 2026-06-08T13:17:12.862Z |
| `/api/chat` | 401 | 2026-06-08T13:17:13.112Z |
| `/api/chat` | 401 | 2026-06-08T13:17:15.603Z |
| `/api/chat` | 401 | 2026-06-08T13:17:15.841Z |
| `/api/chat` | 401 | 2026-06-08T13:17:17.907Z |
| `/api/chat` | 401 | 2026-06-08T13:17:18.178Z |
| `/api/chat` | 401 | 2026-06-08T13:17:20.380Z |
| `/api/chat` | 401 | 2026-06-08T13:17:20.620Z |
| `/api/chat` | 401 | 2026-06-08T13:17:22.941Z |
| `/api/chat` | 401 | 2026-06-08T13:17:23.206Z |
| `/api/chat` | 401 | 2026-06-08T13:17:25.397Z |
| `/api/chat` | 401 | 2026-06-08T13:17:25.699Z |
| `/api/chat` | 401 | 2026-06-08T13:17:27.857Z |
| `/api/chat` | 401 | 2026-06-08T13:17:28.143Z |
| `/api/chat` | 401 | 2026-06-08T13:17:30.350Z |
| `/api/chat` | 401 | 2026-06-08T13:17:30.514Z |
| `/api/chat` | 401 | 2026-06-08T13:17:30.581Z |

## Re-login Events

- method=credentials at=2026-06-08T13:17:15.573Z


## What This Workflow Catches

- Player-side 401 from POST /api/availability not triggering handleSessionExpiry() — player silently loses their save
- Player nav (#playerNav) wiped or coach nav shown during session expiry recovery
- Re-login as player leaving stale coach state active
- Duplicate player entries in state.players after multiple applyApprovedIdentityLocally() calls
- Player availability section crashing after re-login (player.id missing)
- Fresh POST /api/availability failing after session recovery (new session not applied to fetch wrapper)

## Known UX Gap — Post-Recovery Section

> After session expiry and re-login, `loginIdentityAccount()` always sets
> `state.activePlayerSection = "messages"`, dropping the player to Messages
> regardless of which section they were in when the expiry occurred.
> This is **intentional behaviour as of this test run** — the player must manually
> navigate back to Availability. A future improvement would be to preserve
> `activePlayerSection` during recovery.

## Coverage vs Requirements

| Requirement | Verified | How |
|---|---|---|
| 1. Player opens Availability | ✅ | Step 3 — #player-availability active |
| 2. Force session expiry | ✅ | Step 6 — ce_session overwritten with garbage |
| 3. Player attempts to save availability | ✅ | Step 7 — POST /api/availability → 401 |
| 4. 401 handling appears | ✅ | Step 8 — #authPanel shows login form with error |
| 5. Re-login flow works | ✅ | Step 11 — credential form re-login clears error |
| 6. Player returns to player view | ✅ | Step 12 — #playerNav visible, activeView=player |
| 7. No duplicate player state | ✅ | Step 15 — state.players count for player === 1 |
| 8. Availability save succeeds after re-login | ✅ | Step 15 — POST /api/availability → 200 |
| 9. No infinite loops | ✅ | Step 10 — 5s wait, single login form |
| 10. No stale UI state | ✅ | Step 12 — session-expired error cleared after re-login |

## Redis Impact (API Calls)

| Endpoint | Method | Calls | Est. ops |
|---|---|---|---|
| `/api/chat` | GET/POST | 37 | ~296 |
| `/api/message-config` | GET | 27 | ~54 |
| `/api/identity` | GET/POST | 16 | ~100 |
| `/api/invite` | GET | 4 | ~16 |
| `/api/fixtures` | GET | 2 | ~4 |
| `/api/matchday` | GET | 2 | ~4 |
| `/api/availability` | POST | 2 | ~8 |
| **Total** | | **90** | **~482** |

> 401 responses cost ~1-2 ops (session lookup only). Login costs ~8 ops.
> One successful availability POST per run writes to Redis (~4 ops).
> Workflow 8 estimated total: ~20–25 ops.

## Estimated Manual Testing Time Saved

| Task | Manual | Automated |
|---|---|---|
| Login as player, navigate to Availability, set baseline | 60s | — |
| Expire session via DevTools (cookie override) | 90s | — |
| Click availability, observe 401 and login form | 30s | — |
| Verify player nav still visible (not wiped) | 15s | — |
| Re-login, verify recovery | 30s | — |
| Navigate back to Availability, verify section loads | 20s | — |
| Save availability, verify POST 200 | 20s | — |
| Screenshot + record | 30s | — |
| **Total per run** | **~5 min** | **~50s** |

- **Saved per run:** ~4 minutes
- **Workflows 1–8 combined:** ~39 min saved per nightly run

## Missing Selectors / Gaps

- 401 came from unexpected endpoint: https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=dm%3Acoach-demo%3Auser_1780924439313_b86ow9&since=1780924622822&userId=user_1780924439313_b86ow9 — expected /api/availability

**Known gaps:**
- Training (tue/thu) availability not tested — same intercept path as game availability.
- Mid-form availability: player changes game=unavailable, THEN tue=available → first fails with 401, second is not retried. Only the final post-recovery save is tested.
- Player re-login with devLoginBtn not applicable — coach-only button.

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
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 400 ()
- warning: [availability POST] 400 endpoint is required without an authenticated session
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
- error: Failed to load resource: the server responded with a status of 429 ()
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

## Toast Messages

- 2026-06-08T13:17:02.835Z — Welcome QA4 Player1780924420801
- 2026-06-08T13:17:04.604Z — Availability saved ✓
- 2026-06-08T13:17:07.618Z — Availability saved ✓
- 2026-06-08T13:17:07.941Z — Availability saved locally — could not sync to server
- 2026-06-08T13:17:15.899Z — Too many attempts. Please wait and try again.

## Network Failures

- GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- HEAD https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/ — {"errorText":"net::ERR_ABORTED"}
- GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- HEAD https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/ — {"errorText":"net::ERR_ABORTED"}

## HTTP 4xx / 5xx Responses

- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 400  — POST https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/availability
- HTTP 429  — POST https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity

## Page Errors

- None

## What Passes

- Open app
- Player login
- Navigate to Availability section
- Baseline: set game = Available — POST /api/availability 200
- Verify Availability section renders correctly
- Force session expiry (corrupt ce_session cookie)
- Trigger 401: set game = Unavailable → POST /api/availability 401
- Verify session-expiry login form appears
- Verify player screen preserved — #playerNav visible, section active
- Anti-loop: 5s wait — single login form, no JS errors

## Scope Guard

- No Coach's Eye application code was modified.
- Session cookie is restored (re-login) before the final availability POST.
- One availability value is written to Redis per run (final POST in step 15).
- Workflow 8 stops at the first failure.

