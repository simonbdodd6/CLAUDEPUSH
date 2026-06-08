# QA Workflow 5 — Player Sets Availability → Coach Sees Sync (No Manual Refresh)

**Generated:** 2026-06-08T13:15:07.768Z
**Commit:** `38d31ac`
**Base URL:** https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app
**Login method:** dev-login-evaluate
**Player setup skipped:** no — test player created in-run
**Status:** PASSED

---

## Result

- **Overall:** ✅ PASS
- **First failure:** none



## Steps

| # | Step | Status | Duration | Screenshot | Notes |
|---|---|---|---|---|---|
| 1 | Open app [coach] | PASSED | 2475ms | [png](qa/artifacts/workflow5-2026-06-08T13-14-11-374Z/01-open-app.png) |  |
| 2 | Coach login [coach] | PASSED | 3060ms | [png](qa/artifacts/workflow5-2026-06-08T13-14-11-374Z/02-coach-login.png) |  |
| 3 | Navigate to Members [coach] | PASSED | 1931ms | [png](qa/artifacts/workflow5-2026-06-08T13-14-11-374Z/03-navigate-to-members.png) |  |
| 4 | Generate group invite [coach] | PASSED | 1805ms | [png](qa/artifacts/workflow5-2026-06-08T13-14-11-374Z/04-generate-group-invite.png) |  |
| 5 | Player opens invite URL [player] | PASSED | 3567ms | [png](qa/artifacts/workflow5-2026-06-08T13-14-11-374Z/05-player-opens-invite-url.png) |  |
| 6 | Player fills & submits join request [player] | PASSED | 3222ms | [png](qa/artifacts/workflow5-2026-06-08T13-14-11-374Z/06-player-fills-submits-join-request.png) |  |
| 7 | Coach refreshes & approves player [coach] | PASSED | 4210ms | [png](qa/artifacts/workflow5-2026-06-08T13-14-11-374Z/07-coach-refreshes-approves-player.png) |  |
| 8 | Player logs in [player] | PASSED | 5442ms | [png](qa/artifacts/workflow5-2026-06-08T13-14-11-374Z/08-player-logs-in.png) |  |
| 9 | Player navigates to Availability [player] | PASSED | 1979ms | [png](qa/artifacts/workflow5-2026-06-08T13-14-11-374Z/09-player-navigates-to-availability.png) |  |
| 10 | Player sets game = Available [player] | PASSED | 1314ms | [png](qa/artifacts/workflow5-2026-06-08T13-14-11-374Z/10-player-sets-game-available.png) |  |
| 11 | Coach verifies game = Available (auto-refresh) [coach] | PASSED | 4124ms | [png](qa/artifacts/workflow5-2026-06-08T13-14-11-374Z/11-coach-verifies-game-available-auto-refresh.png) |  |
| 12 | Player sets game = Unavailable [player] | PASSED | 2920ms | [png](qa/artifacts/workflow5-2026-06-08T13-14-11-374Z/12-player-sets-game-unavailable.png) |  |
| 13 | Coach verifies game = Unavailable (auto-refresh) [coach] | PASSED | 4873ms | [png](qa/artifacts/workflow5-2026-06-08T13-14-11-374Z/13-coach-verifies-game-unavailable-auto-refresh.png) |  |
| 14 | Player sets game = Unsure (maybe) [player] | PASSED | 1801ms | [png](qa/artifacts/workflow5-2026-06-08T13-14-11-374Z/14-player-sets-game-unsure-maybe.png) |  |
| 15 | Coach verifies game = Maybe (auto-refresh) [coach] | PASSED | 3445ms | [png](qa/artifacts/workflow5-2026-06-08T13-14-11-374Z/15-coach-verifies-game-maybe-auto-refresh.png) |  |
| 16 | Player sets trainingTuesday = Available [player] | PASSED | 1316ms | [png](qa/artifacts/workflow5-2026-06-08T13-14-11-374Z/16-player-sets-trainingtuesday-available.png) |  |
| 17 | Coach verifies trainingTuesday = Available (auto-refresh) [coach] | PASSED | 3227ms | [png](qa/artifacts/workflow5-2026-06-08T13-14-11-374Z/17-coach-verifies-trainingtuesday-available-auto-refresh.png) |  |

## Availability Change Log

| Session key | Status set | Set at | Coach verified | Verified at |
|---|---|---|---|---|
| `game` | available | 2026-06-08T13:14:45.473Z | ✅ YES | 2026-06-08T13:14:48.883Z |
| `game` | unavailable | 2026-06-08T13:14:50.773Z | ✅ YES | 2026-06-08T13:14:56.661Z |
| `game` | maybe | 2026-06-08T13:14:58.729Z | ✅ YES | 2026-06-08T13:15:02.107Z |
| `trainingTuesday` | available | 2026-06-08T13:15:03.747Z | ✅ YES | 2026-06-08T13:15:06.739Z |

## Player & Invite Details

- **Player name:** `QA5 Sync1780924451374`
- **Player email:** `qa.w5+1780924451374@coachseye.test`
- **Group invite URL:** `https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/?inv=v3qtLD1cyY1TaS7u7a-9GKE9WBEE-Mfp`

## What This Workflow Catches

- `setPlayerAvailability()` mutating a copy instead of `state.players` directly (broke button state)
- `setSection("coach","players")` not calling `refreshLiveAvailability()` (broke coach view)
- `saveAvailabilityResponseToServer()` silently failing (wrong 200 assumed)
- Redis key mismatch between player POST and coach GET (would show stale data)
- Session cookie not sent with availability POST (unauthorized → silent fail)

## Redis Impact (API Calls — Both Contexts)

| Endpoint [context] | Method | Calls | Est. ops |
|---|---|---|---|
| `/api/message-config [coach]` | GET | 67 | ~134 |
| `/api/chat [coach]` | GET/POST | 60 | ~480 |
| `/api/chat [player]` | GET/POST | 42 | ~336 |
| `/api/identity [coach]` | GET/POST | 36 | ~220 |
| `/api/message-config [player]` | GET | 33 | ~66 |
| `/api/identity [player]` | GET/POST | 18 | ~112 |
| `/api/invite [coach]` | GET/POST | 17 | ~72 |
| `/api/availability [coach]` | GET | 15 | ~60 |
| `/api/invite [player]` | GET | 8 | ~32 |
| `/api/availability [player]` | POST | 4 | ~16 |
| `/api/fixtures [player]` | GET | 2 | ~4 |
| `/api/matchday [player]` | GET | 2 | ~4 |
| `/api/fixtures [coach]` | GET | 1 | ~2 |
| `/api/matchday [coach]` | GET | 1 | ~2 |
| **Total** | | **306** | **~1540** |

> Setup phase: ~42 ops (group invite + join request + approval).
> Core test: ~64 ops (4× POST /api/availability ≈ 4 ops each; 4× refreshLiveAvailability = 12 GETs ≈ 4 ops each).
> **Total core ops (no setup): ~64. With setup: ~106.**

## Estimated Manual Testing Time Saved

| Task | Manual | Automated |
|---|---|---|
| Open browser, log in as coach | 60s | — |
| Create / recall test player account | 60s | — |
| Log in as player in separate browser | 30s | — |
| Navigate to Availability | 10s | — |
| Set Available, verify coach sees it | 60s | — |
| Set Unavailable, verify coach sees it | 45s | — |
| Set Unsure, verify coach sees it | 45s | — |
| Set Tuesday training, verify | 45s | — |
| Screenshot both tabs each time | 120s | — |
| Record result | 30s | — |
| **Total per run** | **~8 min** | **~90s** |

- **Saved per run:** ~6.5 minutes
- **At 2 runs/day:** ~13 min/day = **~65 min/week**
- **This is the highest-frequency flow in the app — likely 2–3× daily during active season**

## Missing Selectors / Test Hooks Needed


**Known gaps:**
- Availability buttons selected by `onclick` attribute — if `setPlayerAvailability` is renamed, selector breaks.
- Coach row matched by player name text — duplicate names would cause false matches; `data-player-id` attribute on `<tr>` would be more robust.
- `refreshLiveAvailability()` called via `page.evaluate()` — tests the function directly, not the nav trigger; add `data-testid="members-nav-btn"` for click-based verification.
- `trainingThursday` not verified in this workflow — add as a fifth change cycle.

## Console Errors & Warnings

- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()

## Toast Messages

### Coach context
- 2026-06-08T13:14:16.917Z — Welcome Simon Coach
- 2026-06-08T13:14:34.053Z — Player approved and added to roster

### Player context
- 2026-06-08T13:14:28.954Z — Request sent, QA5! Your coach will approve your account shortly.
- 2026-06-08T13:14:41.152Z — Welcome QA5 Sync1780924451374
- 2026-06-08T13:14:44.942Z — Availability saved ✓
- 2026-06-08T13:14:50.237Z — Availability saved ✓
- 2026-06-08T13:14:58.208Z — Availability saved ✓
- 2026-06-08T13:15:03.365Z — Availability saved ✓

## Network Failures

- [coach] GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- [coach] HEAD https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/ — {"errorText":"net::ERR_ABORTED"}
- [player] GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- [player] HEAD https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/?inv=v3qtLD1cyY1TaS7u7a-9GKE9WBEE-Mfp — {"errorText":"net::ERR_ABORTED"}
- [player] GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- [player] HEAD https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/ — {"errorText":"net::ERR_ABORTED"}

## HTTP 4xx / 5xx Responses

- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=0&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924453411&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924453411&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924453411&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=0&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924453411&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924463999&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924453411&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924463999&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924453411&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924453411&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924453411&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=0&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924453411&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924477917&userId=coach-demo
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 404  — POST https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat
- [player] HTTP 404  — POST https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=user_1780924468491_wmlbsg
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924453411&userId=coach-demo
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=dm%3Acoach-demo%3Auser_1780924468491_wmlbsg&since=0&userId=user_1780924468491_wmlbsg
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924453411&userId=coach-demo
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 404  — POST https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924453411&userId=coach-demo
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=dm%3Acoach-demo%3Auser_1780924468491_wmlbsg&since=1780924481053&userId=user_1780924468491_wmlbsg
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=dm%3Acoach-demo%3Auser_1780924468491_wmlbsg&userId=user_1780924468491_wmlbsg
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924453411&userId=coach-demo
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=dm%3Acoach-demo%3Auser_1780924468491_wmlbsg&since=1780924481053&userId=user_1780924468491_wmlbsg
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=dm%3Acoach-demo%3Auser_1780924468491_wmlbsg&userId=user_1780924468491_wmlbsg
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924453411&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=dm%3Acoach-demo%3Auser_1780924468491_wmlbsg&since=1780924481053&userId=user_1780924468491_wmlbsg
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=dm%3Acoach-demo%3Auser_1780924468491_wmlbsg&userId=user_1780924468491_wmlbsg
- [coach] HTTP 404  — POST https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924453411&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=dm%3Acoach-demo%3Auser_1780924468491_wmlbsg&since=1780924481053&userId=user_1780924468491_wmlbsg
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=dm%3Acoach-demo%3Auser_1780924468491_wmlbsg&userId=user_1780924468491_wmlbsg
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924453411&userId=coach-demo
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=dm%3Acoach-demo%3Auser_1780924468491_wmlbsg&since=1780924481053&userId=user_1780924468491_wmlbsg
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=dm%3Acoach-demo%3Auser_1780924468491_wmlbsg&userId=user_1780924468491_wmlbsg
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 404  — POST https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924453411&userId=coach-demo
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=dm%3Acoach-demo%3Auser_1780924468491_wmlbsg&since=1780924481053&userId=user_1780924468491_wmlbsg
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=dm%3Acoach-demo%3Auser_1780924468491_wmlbsg&userId=user_1780924468491_wmlbsg
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=dm%3Acoach-demo%3Auser_1780924468491_wmlbsg&since=1780924481053&userId=user_1780924468491_wmlbsg
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924453411&userId=coach-demo
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=dm%3Acoach-demo%3Auser_1780924468491_wmlbsg&userId=user_1780924468491_wmlbsg
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — POST https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=dm%3Acoach-demo%3Auser_1780924468491_wmlbsg&since=1780924481053&userId=user_1780924468491_wmlbsg
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=dm%3Acoach-demo%3Auser_1780924468491_wmlbsg&userId=user_1780924468491_wmlbsg

## Page Errors

### Coach context
- None

### Player context
- None

## What Passes

- Open app
- Coach login
- Navigate to Members
- Generate group invite
- Player opens invite URL
- Player fills & submits join request
- Coach refreshes & approves player
- Player logs in
- Player navigates to Availability
- Player sets game = Available
- Coach verifies game = Available (auto-refresh)
- Player sets game = Unavailable
- Coach verifies game = Unavailable (auto-refresh)
- Player sets game = Unsure (maybe)
- Coach verifies game = Maybe (auto-refresh)
- Player sets trainingTuesday = Available
- Coach verifies trainingTuesday = Available (auto-refresh)

## Scope Guard

- No Coach's Eye application code was modified.
- Availability records for one QA player will exist in Redis per run.
- Workflow 5 stops at the first failure.

