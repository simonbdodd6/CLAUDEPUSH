# QA Workflow 4 — Group Invite → Join Request → Coach Approval → Active Member

**Generated:** 2026-06-08T09:02:19.593Z
**Commit:** `8db58c9`
**Base URL:** https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app
**Login method:** dev-login-evaluate
**Status:** PASSED

---

## Result

- **Overall:** ✅ PASS
- **First failure:** none



## Steps

| # | Step | Status | Duration | Screenshot | Notes |
|---|---|---|---|---|---|
| 1 | Open app [coach] | PASSED | 2999ms | [png](qa/artifacts/workflow4-2026-06-08T09-01-46-777Z/01-open-app.png) |  |
| 2 | Coach login [coach] | PASSED | 2905ms | [png](qa/artifacts/workflow4-2026-06-08T09-01-46-777Z/02-coach-login.png) |  |
| 3 | Navigate to Members [coach] | PASSED | 2300ms | [png](qa/artifacts/workflow4-2026-06-08T09-01-46-777Z/03-navigate-to-members.png) |  |
| 4 | Generate group invite [coach] | PASSED | 1578ms | [png](qa/artifacts/workflow4-2026-06-08T09-01-46-777Z/04-generate-group-invite.png) |  |
| 5 | Verify group invite URL [coach] | PASSED | 539ms | [png](qa/artifacts/workflow4-2026-06-08T09-01-46-777Z/05-verify-group-invite-url.png) |  |
| 6 | Open group invite URL as player [player] | PASSED | 2840ms | [png](qa/artifacts/workflow4-2026-06-08T09-01-46-777Z/06-open-group-invite-url-as-player.png) |  |
| 7 | Fill group registration form [player] | PASSED | 2088ms | [png](qa/artifacts/workflow4-2026-06-08T09-01-46-777Z/07-fill-group-registration-form.png) |  |
| 8 | Submit join request [player] | PASSED | 3049ms | [png](qa/artifacts/workflow4-2026-06-08T09-01-46-777Z/08-submit-join-request.png) |  |
| 9 | Verify join request submitted [player] | PASSED | 1054ms | [png](qa/artifacts/workflow4-2026-06-08T09-01-46-777Z/09-verify-join-request-submitted.png) |  |
| 10 | Return to coach context [coach] | PASSED | 1587ms | [png](qa/artifacts/workflow4-2026-06-08T09-01-46-777Z/10-return-to-coach-context.png) |  |
| 11 | Refresh pending requests [coach] | PASSED | 1719ms | [png](qa/artifacts/workflow4-2026-06-08T09-01-46-777Z/11-refresh-pending-requests.png) |  |
| 12 | Verify pending request visible [coach] | PASSED | 976ms | [png](qa/artifacts/workflow4-2026-06-08T09-01-46-777Z/12-verify-pending-request-visible.png) |  |
| 13 | Coach approves player [coach] | PASSED | 1807ms | [png](qa/artifacts/workflow4-2026-06-08T09-01-46-777Z/13-coach-approves-player.png) |  |
| 14 | Verify player approved — pending cleared [coach] | PASSED | 621ms | [png](qa/artifacts/workflow4-2026-06-08T09-01-46-777Z/14-verify-player-approved-pending-cleared.png) |  |
| 15 | Verify player in Active Members [coach] | PASSED | 1219ms | [png](qa/artifacts/workflow4-2026-06-08T09-01-46-777Z/15-verify-player-in-active-members.png) |  |

## Player & Invite Details

- **Player name:** `QA4 Player1780909306779`
- **Player email:** `qa.w4+1780909306779@coachseye.test`
- **Group invite URL:** `https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/?inv=T9PCXf92Jw_UX0ZARXoHPNN-3zy_SNPj`
- **Token:** `T9PCXf92Jw_UX0ZARXoHPNN-3zy_SNPj` (32 chars)

## Browser Contexts

- **Coach context:** standard Playwright `page` fixture — steps 1–5, 10–15
- **Player context:** fresh `browser.newContext()` — steps 6–9; isolated from coach session

## Redis Impact (API Calls — Both Contexts)

| Endpoint [context] | Method | Calls | Est. ops |
|---|---|---|---|
| `/api/chat [coach]` | GET | 24 | ~192 |
| `/api/identity [coach]` | GET/POST | 19 | ~118 |
| `/api/templates [coach]` | GET | 16 | ~32 |
| `/api/chat [player]` | GET | 16 | ~128 |
| `/api/schedules [coach]` | GET | 9 | ~18 |
| `/api/invite [coach]` | GET/POST | 9 | ~40 |
| `/api/availability [coach]` | GET | 6 | ~24 |
| `/api/identity [player]` | GET/POST | 5 | ~32 |
| `/api/templates [player]` | GET | 4 | ~8 |
| `/api/schedules [player]` | GET | 2 | ~4 |
| `/api/invite [player]` | GET | 1 | ~4 |
| **Total** | | **111** | **~600** |

> Group invite join_group_invite POST ≈ 10 ops (token resolve + create user + create pending member + session).
> approve POST ≈ 8 ops (session + load member + status update + notify).

## Estimated Manual Testing Time Saved

| Task | Manual | Automated |
|---|---|---|
| Open browser, navigate to app | 30s | — |
| Log in as coach | 30s | — |
| Navigate to Members | 15s | — |
| Generate group invite link | 30s | — |
| Open incognito / new browser | 15s | — |
| Paste invite URL, navigate | 10s | — |
| Fill first name, last name, email, password | 50s | — |
| Submit join request, verify toast | 20s | — |
| Switch back to coach, refresh pending | 20s | — |
| Verify player in pending requests | 15s | — |
| Click Approve, verify toast | 15s | — |
| Re-navigate to Members, find player | 30s | — |
| Screenshot both tabs + record result | 90s | — |
| **Total per run** | **~6.5 min** | **~70s** |

- **Saved per run:** ~5.5 minutes
- **At 2 runs/day:** ~11 min/day = **~55 min/week**
- **Workflows 1–4 combined:** ~18 min saved per full nightly run

## Missing Selectors / Test Hooks Needed


**Known gaps:**
- No `data-testid` on the Pending Requests Refresh button — selected by text, brittle if label changes.
- Approve button matched as first `.btn.primary` in `#identity-requests-panel` — safe only when one request pending; add `data-member-id` attribute for precise targeting.
- No explicit "approved" DOM marker — success is inferred from toast + panel text removal.
- After approval, player verified in #coach-players by name — may be in pending state in other contexts.

## High-Risk Flows Not Yet Automated

- Player login after approval (Workflow 3 covers individual invite → auto-approved; group invite → pending flow now covered here, but player login post-approval is not verified)
- Coach sends availability request → player receives push notification → player responds
- Push notification delivery end-to-end (requires live VAPID + real device)
- Password reset flow
- Player direct message (DM) flow (partially in nightly-qa-agent.spec.js)
- Multi-team coach login and team switching

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
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
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

## Toast Messages

### Coach context
- 2026-06-08T09:01:55.536Z — Welcome Simon Coach
- 2026-06-08T09:02:16.713Z — Player approved and added to roster

### Player context
- 2026-06-08T09:02:09.392Z — Request sent, QA4! Your coach will approve your account shortly.

## Network Failures

- [coach] GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- [coach] HEAD https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/ — {"errorText":"net::ERR_ABORTED"}
- [player] GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- [player] HEAD https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/?inv=T9PCXf92Jw_UX0ZARXoHPNN-3zy_SNPj — {"errorText":"net::ERR_ABORTED"}

## HTTP 4xx / 5xx Responses

- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=0&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/schedules
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/schedules
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780909311277&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780909311277&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780909311277&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=0&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/schedules
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/schedules
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [coach] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780909311277&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780909323240&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780909311277&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780909323240&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780909311277&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780909323240&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780909311277&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780909323240&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780909311277&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780909323240&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780909323240&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo

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
- Verify group invite URL
- Open group invite URL as player
- Fill group registration form
- Submit join request
- Verify join request submitted
- Return to coach context
- Refresh pending requests
- Verify pending request visible
- Coach approves player
- Verify player approved — pending cleared
- Verify player in Active Members

## Scope Guard

- No Coach's Eye application code was modified.
- One QA join request record will exist in Redis per run (cleaned up if player is approved by this workflow).
- Workflow 4 stops at the first failure.

