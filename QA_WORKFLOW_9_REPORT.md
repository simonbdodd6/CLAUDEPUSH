# QA Workflow 9 — Coach Approval Race Condition

**Generated:** 2026-06-08T13:18:33.386Z
**Commit:** `90e8125`
**Base URL:** https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app
**Race player:** qa.race+1780924663647@coachseye.test
**Member ID (pending):** tm_1780924691457_qozfmh
**Final member status:** rejected
**Duplicates found:** 1
**Phantom profile (rejected + profile):** ⚠️ YES — stale profile exists for rejected player
**Status:** FAILED

---

## Result

- **Overall:** ❌ FAIL
- **First failure:** Step 14 — "Coach context 1 — verify consistent Members UI"
- **Error:** Race player "QARace Tester1780924663647" appears in #coach-players but final status is 'rejected'
- **Failure screenshot:** qa/artifacts/workflow9-2026-06-08T13-17-43-595Z/14-coach-context-1-verify-consistent-members-ui.png

## Race Outcome

| Action | HTTP Status | Response | Timestamp |
|---|---|---|---|
| Approve (ctx 1) | 200 | ✅ ok:true | 2026-06-08T13:18:26.914Z |
| Reject (ctx 2)  | 200 | ✅ ok:true | 2026-06-08T13:18:26.914Z |

> ⚠️ **Both requests returned HTTP 200.** The server has no optimistic locking — both callers received a success response. The final roster state reflects whichever write arrived at Redis last (non-deterministic).

## Steps

| # | Step | Status | Duration | Screenshot | Notes |
|---|---|---|---|---|---|
| 1 | Open app (coach context 1) | PASSED | 4631ms | [png](qa/artifacts/workflow9-2026-06-08T13-17-43-595Z/01-open-app-coach-context-1.png) |  |
| 2 | Coach login (context 1) | PASSED | 3246ms | [png](qa/artifacts/workflow9-2026-06-08T13-17-43-595Z/02-coach-login-context-1.png) |  |
| 3 | Navigate to Members | PASSED | 2606ms | [png](qa/artifacts/workflow9-2026-06-08T13-17-43-595Z/03-navigate-to-members.png) |  |
| 4 | Generate group invite | PASSED | 1706ms | [png](qa/artifacts/workflow9-2026-06-08T13-17-43-595Z/04-generate-group-invite.png) |  |
| 5 | Open invite URL as race test player | PASSED | 5174ms | [png](qa/artifacts/workflow9-2026-06-08T13-17-43-595Z/05-open-invite-url-as-race-test-player.png) |  |
| 6 | Fill and submit registration form | PASSED | 3087ms | [png](qa/artifacts/workflow9-2026-06-08T13-17-43-595Z/06-fill-and-submit-registration-form.png) |  |
| 7 | Verify pending request + extract memberId | PASSED | 3138ms | [png](qa/artifacts/workflow9-2026-06-08T13-17-43-595Z/07-verify-pending-request-extract-memberid.png) |  |
| 8 | Coach login (context 2) | PASSED | 5088ms | [png](qa/artifacts/workflow9-2026-06-08T13-17-43-595Z/08-coach-login-context-2.png) |  |
| 9 | Both contexts confirm pending player visible | PASSED | 2292ms | [png](qa/artifacts/workflow9-2026-06-08T13-17-43-595Z/09-both-contexts-confirm-pending-player-visible.png) |  |
| 10 | Fire simultaneous race: ctx 1 approve + ctx 2 reject | PASSED | 1787ms | [png](qa/artifacts/workflow9-2026-06-08T13-17-43-595Z/10-fire-simultaneous-race-ctx-1-approve-ctx-2-reject.png) |  |
| 11 | Load final roster state via GET /api/identity | PASSED | 1456ms | [png](qa/artifacts/workflow9-2026-06-08T13-17-43-595Z/11-load-final-roster-state-via-get-api-identity.png) |  |
| 12 | Verify no duplicate team_member records | PASSED | 800ms | [png](qa/artifacts/workflow9-2026-06-08T13-17-43-595Z/12-verify-no-duplicate-team-member-records.png) |  |
| 13 | Verify status definitive + audit fields consistent | PASSED | 716ms | [png](qa/artifacts/workflow9-2026-06-08T13-17-43-595Z/13-verify-status-definitive-audit-fields-consistent.png) | Race winner: reject | status: rejected | phantom profile: YES |
| 14 | Coach context 1 — verify consistent Members UI | FAILED | 2339ms | [png](qa/artifacts/workflow9-2026-06-08T13-17-43-595Z/14-coach-context-1-verify-consistent-members-ui.png) | Race player "QARace Tester1780924663647" appears in #coach-players but final status is 'rejected' |

## Architecture Note — Why Both Calls Return 200

`approveJoinRequest` and `rejectJoinRequest` use a **read-modify-write** pattern with no
version check or atomic swap. Sequence on simultaneous requests:

```
T=0   ctx1: loadTeamMembers()  →  member.status = "pending"
T=0   ctx2: loadTeamMembers()  →  member.status = "pending"
T=1   ctx1: status = "active"  →  saveTeamMembers()  →  ok:true
T=1   ctx2: status = "rejected"→  saveTeamMembers()  →  ok:true  (clobbers ctx1)
```

If approve wins the write race, `player_profiles` will also contain a stale
profile entry for the rejected player (approve writes profiles; reject does not).

## Coverage vs Requirements

| Requirement | Verified | How |
|---|---|---|
| 1. Two coach browser contexts | ✅ | Steps 2, 8 — two browser.newContext() instances |
| 2. One pending player request | ✅ | Steps 4–7 — fresh invite + registration |
| 3. Both attempt approve/reject simultaneously | ✅ | Step 10 — Promise.all fires both fetches |
| 4. Only one write succeeds | ⚠️ | Both return 200; last write wins; see Race Outcome |
| 5. No duplicate player records | ✅ | Step 12 — team_members count for this userId === 1 |
| 6. Roster state remains consistent | ✅ | Step 13 — status is active or rejected, not pending |
| 7. Audit fields consistent | ✅ | Step 13 — approvedBy/rejectedBy set, no mixed state |

## What This Workflow Catches

- `approveJoinRequest` silently overwriting a concurrent rejection (or vice versa)
- Player appearing as both active and rejected simultaneously (not currently possible — last write wins for status, but phantom profiles can persist)
- Duplicate team_member records (not currently triggered — the whole array is replaced, not appended)
- Stale player_profile after rejection race (approve writes profile, then reject clobbers status but not profiles)
- UI showing different states on two open coach tabs after a race

## Redis Impact (API Calls)

| Endpoint | Method | Calls | Est. ops |
|---|---|---|---|
| `/api/chat` | GET | 73 | ~584 |
| `/api/message-config` | GET | 58 | ~116 |
| `/api/identity` | GET/POST | 41 | ~256 |
| `/api/invite` | GET/POST | 12 | ~52 |
| `/api/availability` | GET | 12 | ~48 |
| `/api/fixtures` | GET | 3 | ~6 |
| `/api/matchday` | GET | 3 | ~6 |
| **Total** | | **202** | **~1068** |

> Registration: ~12 ops (invite + join request). Race: 2 × approve/reject ≈ 16 ops.
> Verification: 2 × GET /api/identity ≈ 12 ops. Total per run: ~40–50 ops.

## Estimated Manual Testing Time Saved

| Task | Manual | Automated |
|---|---|---|
| Open two browser tabs, log in as coach | 60s | — |
| Create invite, register test player | 90s | — |
| Manually coordinate near-simultaneous approve/reject | 120s | — |
| Check Redis state for duplicates (requires direct Redis access) | 180s | — |
| Verify both tabs see consistent state | 30s | — |
| Screenshot + record | 30s | — |
| **Total per run** | **~8.5 min** | **~90s** |

- **Saved per run:** ~7 minutes
- **Workflows 1–9 combined:** ~46 min saved per nightly run

## Missing Selectors / Gaps

- Race condition confirmed: both approve and reject returned HTTP 200. No optimistic locking in approveJoinRequest / rejectJoinRequest. Last writer wins — final state is non-deterministic. Mitigation: add a status pre-check + Redis WATCH or conditional write.
- Phantom player_profile detected: status is 'rejected' but a player_profile entry exists. This occurs when approve writes the profile before reject clobbers team_members. The profile will not be shown to coaches (filtered by active member status) but represents stale data.

**Known gaps:**
- True concurrent execution requires Vercel's multi-instance deployment. On a local dev server (single-process), requests are queued — approximate but not truly simultaneous.
- `rejectJoinRequest` does not clear `player_profiles` — phantom profiles after rejection race are documented but not auto-remediated.
- Approve + approve race not tested here (idempotent for status, but profile IDs differ between simultaneous calls).
- No session-level locking tested — a Redis WATCH/MULTI/EXEC pattern would prevent this race class entirely.

## Console Errors & Warnings

### Coach context 1
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
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()

### Player context
- None

## Toast Messages

### Coach context 1
- 2026-06-08T13:17:57.342Z — Welcome Simon Coach

### Coach context 2
- 2026-06-08T13:18:22.926Z — Welcome Simon Coach

## Network Failures

- [coach-1] GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- [coach-1] HEAD https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/ — {"errorText":"net::ERR_ABORTED"}
- [player] GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- [player] HEAD https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/?inv=rvpRY0ZTZuqP04Hg0I7gyB_g_CArAz15 — {"errorText":"net::ERR_ABORTED"}
- [coach-2] GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- [coach-2] HEAD https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/ — {"errorText":"net::ERR_ABORTED"}

## HTTP 4xx / 5xx Responses

- [coach-1] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=0&userId=coach-demo
- [coach-1] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach-1] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach-1] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach-1] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [coach-1] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- [coach-1] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [coach-1] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach-1] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach-1] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [coach-1] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [coach-1] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach-1] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach-1] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924672282&userId=coach-demo
- [coach-1] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924672282&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924672282&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=0&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924672282&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924685314&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924672282&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924685314&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924672282&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924685314&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924685314&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924672282&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924672282&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924685314&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach-2] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=0&userId=coach-demo
- [coach-2] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach-2] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- [coach-2] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [coach-2] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach-2] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [coach-2] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach-2] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach-2] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [coach-2] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [coach-2] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach-2] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach-2] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924685314&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924672282&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach-2] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924699680&userId=coach-demo
- [coach-2] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924685314&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924672282&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924685314&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924672282&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach-2] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924699680&userId=coach-demo
- [coach-2] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924685314&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924672282&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach-2] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924699680&userId=coach-demo
- [coach-2] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924685314&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924672282&userId=coach-demo
- [coach-1] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach-2] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924699680&userId=coach-demo
- [coach-2] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo

## Page Errors

- None

## What Passes

- Open app (coach context 1)
- Coach login (context 1)
- Navigate to Members
- Generate group invite
- Open invite URL as race test player
- Fill and submit registration form
- Verify pending request + extract memberId
- Coach login (context 2)
- Both contexts confirm pending player visible
- Fire simultaneous race: ctx 1 approve + ctx 2 reject
- Load final roster state via GET /api/identity
- Verify no duplicate team_member records
- Verify status definitive + audit fields consistent

## Scope Guard

- No Coach's Eye application code was modified.
- One QA player registration (team_member) persists in Redis per run.
- No cleanup performed — the race test player remains in the roster (active or rejected).
- Workflow 9 stops at the first failure.

