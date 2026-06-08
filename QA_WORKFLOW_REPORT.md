# QA Workflow 1 — Coach Login → Members

**Generated:** 2026-06-08T14:19:43.311Z
**Commit:** `7b78d44`
**Base URL:** https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app
**Login method:** dev-login-btn
**Status:** FAILED

---

## Result

- **Overall:** ❌ FAIL
- **First failure:** Step 2 — "Coach login"
- **Error:** Cannot log in: devLoginBtn not visible and QA_COACH_PASSWORD is not set
- **Failure screenshot:** qa/artifacts/workflow1-2026-06-08T14-19-35-537Z/02-coach-login.png

## Steps

| # | Step | Status | Duration | Screenshot | Notes |
|---|---|---|---|---|---|
| 1 | Open app | PASSED | 3189ms | [png](qa/artifacts/workflow1-2026-06-08T14-19-35-537Z/01-open-app.png) |  |
| 2 | Coach login | FAILED | 773ms | [png](qa/artifacts/workflow1-2026-06-08T14-19-35-537Z/02-coach-login.png) | Cannot log in: devLoginBtn not visible and QA_COACH_PASSWORD is not set |

## Members Verification

- **Members rendered:** not reached or count not found
- **Filter pills visible:** no
- **Verification selector used:** `#coach-players .filter-pill` (first filter pill appearing signals data load)
- **Member count selector:** `#coach-players` text matching `/\d+ members/`

## Redis Impact (API Calls During Workflow)

| Endpoint | Calls | Est. Redis ops |
|---|---|---|
| `/api/identity` | 5 | ~30 |
| `/api/message-config` | 6 | ~12 |
| `/api/chat` | 4 | ~32 |
| `/api/matchday` | 1 | ~2 |
| `/api/fixtures` | 1 | ~2 |
| **Total** | **17** | **~78** |

> Estimates use post-optimisation baselines: `/api/identity` session=0–4 ops (cached), members=~10; `/api/chat` conversations=~8; others=~4.

## Missing Selectors / Test Hooks Needed

- devLoginBtn not visible and QA_COACH_PASSWORD not set — cannot log in; set QA_COACH_PASSWORD or run against a preview deployment.

These are gaps to address before higher-confidence automation:
- **No `data-testid` on individual player rows** — member-loaded signal currently uses `.filter-pill` appearing inside `#coach-players`; a `data-testid="player-card"` on each row would enable count assertions.
- **No stable member count element** — count is inside inline `<p class="muted">` with dynamic text; a `data-testid="members-count"` would remove regex fragility.
- **`devLoginBtn` is config-gated** — `devLoginAvailable` must be `true` in the app config; not available on production. Credential fallback (`QA_COACH_PASSWORD`) required for production runs.
- **No explicit "loading" state indicator** — members panel has no skeleton/spinner with a stable ID; the test must poll for rendered content.

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
- `error`: Failed to load resource: the server responded with a status of 404 ()

## Toast Messages

- None

## Network Failures

- GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10 — {"errorText":"HTTP 401 "}
- GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates — {"errorText":"HTTP 401 "}
- GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules — {"errorText":"HTTP 401 "}
- GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/identity?action=session — {"errorText":"HTTP 401 "}
- GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=0&userId=coach-demo — {"errorText":"HTTP 401 "}
- GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo — {"errorText":"HTTP 401 "}
- GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates — {"errorText":"HTTP 401 "}
- GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo — {"errorText":"HTTP 401 "}
- GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo — {"errorText":"HTTP 401 "}
- GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates — {"errorText":"HTTP 401 "}
- GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules — {"errorText":"HTTP 401 "}
- GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10 — {"errorText":"HTTP 401 "}
- GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/identity?action=session — {"errorText":"HTTP 401 "}
- GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates — {"errorText":"HTTP 401 "}
- GET https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- HEAD https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app/ — {"errorText":"net::ERR_ABORTED"}

## Page Errors

- None

## Scope Guard

- No Coach's Eye application code was modified.
- Workflow 1 stops at the first failure.

