# QA Workflow 3 — Invite Claim → Registration → Verify Player

**Generated:** 2026-06-08T13:13:39.409Z
**Commit:** `38d31ac`
**Base URL:** https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app
**Login method:** dev-login-evaluate
**Generation skipped:** no — invite generated during run
**Status:** PASSED

---

## Result

- **Overall:** ✅ PASS
- **First failure:** none



## Steps

| # | Step | Status | Duration | Screenshot | Notes |
|---|---|---|---|---|---|
| 1 | Open app [coach] | PASSED | 4604ms | [png](qa/artifacts/workflow3-2026-06-08T13-13-12-272Z/01-open-app.png) |  |
| 2 | Coach login [coach] | PASSED | 3033ms | [png](qa/artifacts/workflow3-2026-06-08T13-13-12-272Z/02-coach-login.png) |  |
| 3 | Navigate to Members [coach] | PASSED | 1549ms | [png](qa/artifacts/workflow3-2026-06-08T13-13-12-272Z/03-navigate-to-members.png) |  |
| 4 | Open invite panel [coach] | PASSED | 780ms | [png](qa/artifacts/workflow3-2026-06-08T13-13-12-272Z/04-open-invite-panel.png) |  |
| 5 | Generate invite [coach] | PASSED | 2512ms | [png](qa/artifacts/workflow3-2026-06-08T13-13-12-272Z/05-generate-invite.png) |  |
| 6 | Verify invite link [coach] | PASSED | 1032ms | [png](qa/artifacts/workflow3-2026-06-08T13-13-12-272Z/06-verify-invite-link.png) |  |
| 7 | Open invite URL as player [player] | PASSED | 2910ms | [png](qa/artifacts/workflow3-2026-06-08T13-13-12-272Z/07-open-invite-url-as-player.png) |  |
| 8 | Fill registration form [player] | PASSED | 1291ms | [png](qa/artifacts/workflow3-2026-06-08T13-13-12-272Z/08-fill-registration-form.png) |  |
| 9 | Submit registration [player] | PASSED | 2516ms | [png](qa/artifacts/workflow3-2026-06-08T13-13-12-272Z/09-submit-registration.png) |  |
| 10 | Return to coach context [coach] | PASSED | 1321ms | [png](qa/artifacts/workflow3-2026-06-08T13-13-12-272Z/10-return-to-coach-context.png) |  |
| 11 | Verify player in Members [coach] | PASSED | 2847ms | [png](qa/artifacts/workflow3-2026-06-08T13-13-12-272Z/11-verify-player-in-members.png) |  |

## Invite & Registration Details

- **Invite name:** `QA W3 Player 1780924392272`
- **Invite email:** `qa.w3+1780924392272@coachseye.test`
- **Invite URL:** `https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/?inv=Z5RwduDjLRggp4Y9wEO6mqpesS6UvW94`
- **Invite token:** `Z5RwduDjLRggp4Y9wEO6mqpesS6UvW94` (32 chars)
- **Registration email:** `qa.w3+1780924392272@coachseye.test`
- **Player name to verify:** `QA W3 Player 1780924392272`

## Browser Contexts

- **Coach context:** standard Playwright `page` fixture — steps 1–3, 10–11
- **Player context:** fresh `browser.newContext()` — steps 7–9; isolated from coach session

## Redis Impact (API Calls — Both Contexts)

| Endpoint [context] | Method | Calls | Est. ops |
|---|---|---|---|
| `/api/message-config [coach]` | GET | 26 | ~52 |
| `/api/chat [coach]` | GET | 21 | ~168 |
| `/api/identity [coach]` | GET/POST | 17 | ~104 |
| `/api/chat [player]` | GET/POST | 12 | ~96 |
| `/api/message-config [player]` | GET | 9 | ~18 |
| `/api/invite [coach]` | GET/POST | 7 | ~32 |
| `/api/identity [player]` | GET/POST | 7 | ~44 |
| `/api/availability [coach]` | GET | 6 | ~24 |
| `/api/invite [player]` | GET | 3 | ~12 |
| `/api/fixtures [coach]` | GET | 1 | ~2 |
| `/api/matchday [coach]` | GET | 1 | ~2 |
| `/api/matchday [player]` | GET | 1 | ~2 |
| `/api/fixtures [player]` | GET | 1 | ~2 |
| **Total** | | **112** | **~558** |

> Estimates per `REDIS_OPTIMIZATION_SUMMARY.md`. POST /api/identity (claim_invite) ≈ 15 ops
> (session resolve + load invite + validate + write user + write member + create session).

## Estimated Manual Testing Time Saved

| Task | Manual | Automated |
|---|---|---|
| Open browser, navigate to app | 30s | — |
| Log in as coach | 30s | — |
| Click Members, wait for load | 20s | — |
| Open invite panel, fill form, generate | 45s | — |
| Copy invite link | 10s | — |
| Open incognito / new browser | 15s | — |
| Paste invite URL, navigate | 10s | — |
| Fill registration form | 45s | — |
| Submit, wait for completion | 20s | — |
| Switch back to coach tab | 10s | — |
| Click Members, verify player | 30s | — |
| Screenshot both tabs + record result | 90s | — |
| **Total per run** | **~6 min** | **~60s** |

- **Saved per run:** ~5 minutes
- **At 2 runs/day (pre-push + post-merge):** ~10 min/day = **~50 min/week**
- **Workflows 1 + 2 + 3 combined:** ~11.5 min saved per full run → **~2 hrs/week** at 2 full passes/day

## Missing Selectors / Test Hooks Needed


**Known gaps:**
- No `data-testid` on player rows in `#coach-players` — verification uses `.toContainText()` which matches any text node; add `data-testid="player-row"` for count assertions.
- `#invite-name-input` is pre-filled but not verified before form submit — add assertion that it contains expected name.
- No explicit "registration success" DOM state besides modal removal — a `data-testid="registration-success"` element would give a positive signal.
- Player may be in pending state after registration (group invites require approval) — individual invite flow auto-approves, but this is not explicitly verified.

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
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()

## Toast Messages

### Coach context
- 2026-06-08T13:13:19.929Z — Welcome Simon Coach

### Player context
- 2026-06-08T13:13:34.453Z — Welcome QA! Your account is ready.

## Network Failures

- [coach] GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- [coach] HEAD https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/ — {"errorText":"net::ERR_ABORTED"}
- [player] GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- [player] HEAD https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/?inv=Z5RwduDjLRggp4Y9wEO6mqpesS6UvW94 — {"errorText":"net::ERR_ABORTED"}

## HTTP 4xx / 5xx Responses

- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=0&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924394544&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924394544&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924394544&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=0&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924394544&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924394544&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924409063&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924394544&userId=coach-demo
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 404  — POST https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=dm%3Acoach-demo%3Auser_1780924413183_peohn1&since=0&userId=user_1780924413183_peohn1
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924394544&userId=coach-demo
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=dm%3Acoach-demo%3Auser_1780924413183_peohn1&since=1780924414341&userId=user_1780924413183_peohn1
- [player] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=dm%3Acoach-demo%3Auser_1780924413183_peohn1&userId=user_1780924413183_peohn1
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo

## Page Errors

### Coach context
- None

### Player context
- None

## What Passes

- Open app
- Coach login
- Navigate to Members
- Open invite panel
- Generate invite
- Verify invite link
- Open invite URL as player
- Fill registration form
- Submit registration
- Return to coach context
- Verify player in Members

## Scope Guard

- No Coach's Eye application code was modified.
- Player registration was exercised against the live API (claim_invite POST) — one QA invite record will exist in Redis.
- Workflow 3 stops at the first failure.

