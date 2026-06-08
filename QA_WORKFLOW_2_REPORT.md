# QA Workflow 2 — Coach Login → Invite Generation

**Generated:** 2026-06-08T13:13:11.745Z
**Commit:** `38d31ac`
**Base URL:** https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app
**Login method:** dev-login-evaluate
**Status:** PASSED

---

## Result

- **Overall:** ✅ PASS
- **First failure:** none



## Steps

| # | Step | Status | Duration | Screenshot | Notes |
|---|---|---|---|---|---|
| 1 | Open app | PASSED | 2953ms | [png](qa/artifacts/workflow2-2026-06-08T13-12-58-957Z/01-open-app.png) |  |
| 2 | Coach login | PASSED | 2732ms | [png](qa/artifacts/workflow2-2026-06-08T13-12-58-957Z/02-coach-login.png) |  |
| 3 | Navigate to Members | PASSED | 1675ms | [png](qa/artifacts/workflow2-2026-06-08T13-12-58-957Z/03-navigate-to-members.png) |  |
| 4 | Open invite panel | PASSED | 998ms | [png](qa/artifacts/workflow2-2026-06-08T13-12-58-957Z/04-open-invite-panel.png) |  |
| 5 | Generate invite | PASSED | 2088ms | [png](qa/artifacts/workflow2-2026-06-08T13-12-58-957Z/05-generate-invite.png) |  |
| 6 | Verify invite link | PASSED | 790ms | [png](qa/artifacts/workflow2-2026-06-08T13-12-58-957Z/06-verify-invite-link.png) |  |

## Invite Verification

- **Invite URL generated:** `https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/?inv=TUjQKAxNc34gTjuvEzoimO96-_NU8Jfc`
- **Token extracted:** `TUjQKAxNc34gTjuvEzoimO96-_NU8Jfc`
- **URL format check:** ✅ contains `/?inv=`
- **Invite name used:** `QA Workflow2 Test`
- **Invite email used:** `qa.wf2+1780924378957@coachseye.test`

## Redis Impact (API Calls During Workflow)

| Endpoint | Method | Calls | Est. Redis ops |
|---|---|---|---|
| `/api/message-config` | GET | 18 | ~36 |
| `/api/identity` | GET/POST | 13 | ~80 |
| `/api/chat` | GET | 10 | ~80 |
| `/api/invite` | GET/POST | 5 | ~24 |
| `/api/availability` | GET | 3 | ~12 |
| `/api/fixtures` | GET | 1 | ~2 |
| `/api/matchday` | GET | 1 | ~2 |
| **Total** | | **51** | **~236** |

> Estimates based on post-optimisation baselines from `REDIS_OPTIMIZATION_SUMMARY.md`:
> `/api/identity` GET ≈ 6 ops (session + members, warm Lambda); POST ≈ 8.
> `/api/invite` POST ≈ 8 ops (session + write + reload); GET ≈ 4.
> `/api/chat` ≈ 8 ops per conversations poll.

## Estimated Manual Testing Time Saved

| Task | Manual | Automated |
|---|---|---|
| Open browser + navigate to app | 30s | — |
| Log in as coach | 30s | — |
| Click Members + wait for load | 20s | — |
| Scroll to / open invite panel | 20s | — |
| Fill name, email, click Generate | 30s | — |
| Wait for link + verify format | 20s | — |
| Take screenshot + record result | 60s | — |
| **Total per run** | **~3.5 min** | **~35s** |

- **Saved per run:** ~3 minutes
- **At 2 runs/day (pre-push + post-merge):** ~6 min/day = **~30 min/week**
- **At 5 runs/day (active feature work):** ~15 min/day = **~75 min/week**

## Missing Selectors / Test Hooks Needed


**Gaps identified during this workflow:**
- No `data-testid` on the invite panel `<details>` — currently selected via `details.srv-panel summary` text match; brittle if text changes.
- No `data-testid` on `#inv-link-field` — the element has a stable `id` (good), but the surrounding success card is fully dynamic HTML.
- No explicit "invite created" event or DOM marker outside the card — success is inferred from `#inv-link-field` appearing.
- `loadInviteList()` polling races with form input — atomic `page.evaluate` fill+click is required; standard Playwright `.fill()` is unreliable here.

## Console Errors & Warnings

- `error`: Failed to load resource: the server responded with a status of 401 ()
- `error`: Failed to load resource: the server responded with a status of 401 ()
- `error`: Failed to load resource: the server responded with a status of 401 ()
- `error`: Failed to load resource: the server responded with a status of 401 ()
- `error`: Failed to load resource: the server responded with a status of 401 ()
- `error`: Failed to load resource: the server responded with a status of 401 ()
- `error`: Failed to load resource: the server responded with a status of 401 ()
- `error`: Failed to load resource: the server responded with a status of 401 ()
- `error`: Failed to load resource: the server responded with a status of 401 ()
- `error`: Failed to load resource: the server responded with a status of 401 ()
- `error`: Failed to load resource: the server responded with a status of 401 ()
- `error`: Failed to load resource: the server responded with a status of 401 ()
- `error`: Failed to load resource: the server responded with a status of 401 ()
- `error`: Failed to load resource: the server responded with a status of 401 ()
- `error`: Failed to load resource: the server responded with a status of 401 ()
- `error`: Failed to load resource: the server responded with a status of 401 ()
- `error`: Failed to load resource: the server responded with a status of 404 ()
- `error`: Failed to load resource: the server responded with a status of 404 ()

## Toast Messages

- 2026-06-08T13:13:05.109Z — Welcome Simon Coach

## Network Failures

- GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- HEAD https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/ — {"errorText":"net::ERR_ABORTED"}

## HTTP 4xx / 5xx Responses

- HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=0&userId=coach-demo
- HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924381288&userId=coach-demo
- HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924381288&userId=coach-demo
- HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo

## Page Errors

- None

## What Passes

- Open app
- Coach login
- Navigate to Members
- Open invite panel
- Generate invite
- Verify invite link

## Scope Guard

- No Coach's Eye application code was modified.
- Player registration was not triggered (Workflow 2 stops before navigating to the invite URL).
- Workflow 2 stops at the first failure.

