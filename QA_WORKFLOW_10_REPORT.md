# QA Workflow 10 — Password Reset End-to-End

**Generated:** 2026-06-08T14:20:24.091Z
**Commit:** `7b78d44`
**Base URL:** https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app
**Test email:** `qa.reset+1780928385942@coachseye.test`
**devResetUrl captured:** ✅ yes
**Status:** PASSED

---

## Result

- **Overall:** ✅ PASS
- **First failure:** none



## Steps

| # | Step | Status | Duration | Screenshot | Notes |
|---|---|---|---|---|---|
| 1 | Open app | PASSED | 4256ms | [png](qa/artifacts/workflow10-2026-06-08T14-19-45-940Z/01-open-app.png) |  |
| 2 | Coach login | PASSED | 3535ms | [png](qa/artifacts/workflow10-2026-06-08T14-19-45-940Z/02-coach-login.png) |  |
| 3 | Create and approve test player via API | PASSED | 2557ms | [png](qa/artifacts/workflow10-2026-06-08T14-19-45-940Z/03-create-and-approve-test-player-via-api.png) |  |
| 4 | Open player context — navigate to login form | PASSED | 2854ms | [png](qa/artifacts/workflow10-2026-06-08T14-19-45-940Z/04-open-player-context-navigate-to-login-form.png) |  |
| 5 | Request password reset — capture devResetUrl | PASSED | 1951ms | [png](qa/artifacts/workflow10-2026-06-08T14-19-45-940Z/05-request-password-reset-capture-devreseturl.png) |  |
| 6 | Verify reset-request toast | PASSED | 517ms | [png](qa/artifacts/workflow10-2026-06-08T14-19-45-940Z/06-verify-reset-request-toast.png) |  |
| 7 | Navigate to reset URL → verify #reset-modal | PASSED | 2594ms | [png](qa/artifacts/workflow10-2026-06-08T14-19-45-940Z/07-navigate-to-reset-url-verify-reset-modal.png) |  |
| 8 | Fill new password + submit → verify success | PASSED | 2147ms | [png](qa/artifacts/workflow10-2026-06-08T14-19-45-940Z/08-fill-new-password-submit-verify-success.png) |  |
| 9 | Login with new password → verify player nav | PASSED | 2422ms | [png](qa/artifacts/workflow10-2026-06-08T14-19-45-940Z/09-login-with-new-password-verify-player-nav.png) |  |
| 10 | Verify old password rejected (direct API call) | PASSED | 1862ms | [png](qa/artifacts/workflow10-2026-06-08T14-19-45-940Z/10-verify-old-password-rejected-direct-api-call.png) | Old password login returned HTTP 401 — correctly rejected |
| 11 | Verify reset token replay rejected (410) | PASSED | 3574ms | [png](qa/artifacts/workflow10-2026-06-08T14-19-45-940Z/11-verify-reset-token-replay-rejected-410.png) | Replay correctly returned 410: Reset link is invalid or expired |
| 12 | Verify no duplicate identities (coach context) | PASSED | 5643ms | [png](qa/artifacts/workflow10-2026-06-08T14-19-45-940Z/12-verify-no-duplicate-identities-coach-context.png) | No duplicates — players=0, members=0, totalPlayers=0 |

## What This Workflow Catches

- Password reset token not stored as hash — raw token in Redis is a security bug
- Reset link not navigating to #reset-modal — checkResetParam() broken
- completePasswordReset() calling wrong API action or not cleaning up modal/URL
- Old password still working after reset — password update not persisted to Redis
- Reset token accepted more than once — replay protection (usedAt check) broken
- Login with new password failing — password hash update or session creation broken
- Duplicate user or team_member records created during reset flow

## Coverage vs Requirements

| Requirement | Verified | How |
|---|---|---|
| 1. Player requests password reset | ✅ | Step 5 — "Forgot password?" button + POST /api/identity |
| 2. Reset email generated (dev: devResetUrl) | ✅ | Step 5 — devResetUrl in API response |
| 3. Follow reset link | ✅ | Step 7 — navigate to devResetUrl, #reset-modal appears |
| 4. Set new password | ✅ | Step 8 — #reset-password-input + Save button |
| 5. Login with new password succeeds | ✅ | Step 9 — credential login, #playerNav visible |
| 6. Old password no longer works | ✅ | Step 10 — direct API login → 401 |
| 7. Token replay rejected | ✅ | Step 11 — direct API reset → 410 |
| 8. No duplicate identities | ✅ | Step 12 — state.players + state.teamMembers count |

## Redis Impact (API Calls)

| Endpoint | Method | Calls | Est. ops |
|---|---|---|---|
| `/api/chat` | GET/POST | 54 | ~432 |
| `/api/message-config` | GET | 36 | ~72 |
| `/api/identity` | GET/POST | 32 | ~208 |
| `/api/invite` | GET | 5 | ~20 |
| `/api/fixtures` | GET | 3 | ~6 |
| `/api/matchday` | GET | 3 | ~6 |
| `/api/availability` | GET | 3 | ~12 |
| **Total** | | **136** | **~756** |

> action:join ~8 ops, action:approve ~8 ops, request_password_reset ~8 ops,
> reset_password ~8 ops (+ session invalidation), login ~8 ops.
> Estimated total: ~40–50 ops per run.

## Estimated Manual Testing Time Saved

| Task | Manual | Automated |
|---|---|---|
| Register test player, approve via coach | 3 min | — |
| Trigger password reset, receive email | 2 min | — |
| Follow reset link, enter new password | 1 min | — |
| Verify login with new password | 1 min | — |
| Verify old password rejected | 1 min | — |
| Verify token replay rejected | 1 min | — |
| Check for duplicate records | 2 min | — |
| **Total per run** | **~11 min** | **~60s** |

- **Saved per run:** ~10 minutes
- **Workflows 1–10 combined:** ~49 min saved per nightly run

## Missing Selectors / Gaps

- None

**Known gaps:**
- Actual email delivery not tested — devResetUrl substitutes for link-in-email.
- Password reset expiry (1-hour TTL) not tested — would require time manipulation.
- Multiple reset requests from same account not tested here — only one token per run.

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
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
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
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
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
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 410 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()

## Toast Messages (coach context)

- 2026-06-08T14:19:56.393Z — Welcome Simon Coach

## Toast Messages (player context)

- 2026-06-08T14:20:04.645Z — If that email has an account, a reset link has been sent.
- 2026-06-08T14:20:09.939Z — Password updated. You can log in now.
- 2026-06-08T14:20:12.305Z — Welcome Reset Player

## Page Errors

- None

## What Passes

- Open app
- Coach login
- Create and approve test player via API
- Open player context — navigate to login form
- Request password reset — capture devResetUrl
- Verify reset-request toast
- Navigate to reset URL → verify #reset-modal
- Fill new password + submit → verify success
- Login with new password → verify player nav
- Verify old password rejected (direct API call)
- Verify reset token replay rejected (410)
- Verify no duplicate identities (coach context)

## Scope Guard

- Test player email is unique per run (qa.reset+{timestamp}@coachseye.test).
- No existing player records are modified.
- Workflow 10 stops at the first failure.

