# Coach's Eye — Nightly QA Report

**Date:** 2026-06-08T12:17:50.996Z
**Commit:** `894a1ab`
**Base URL:** https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app
**Overall: ✅ PASS**

---

## Dashboard Summary

| # | Workflow | Status | Steps | Duration | ~Redis ops |
|---|---|---|---|---|---|
| W4 | Group Invite → Approval | ✅ PASS | 15/15 | 1m 15s | ~720 |
| W5 | Coach ↔ Player DM Messaging | ✅ PASS | 14/14 | 1m 4s | ~988 |
| W6 | Squad Broadcast → Receive → Permissions | ✅ PASS | 17/17 | 57s | ~1086 |
| W7 | Player Session Expiry Recovery | ✅ PASS | 12/12 | 37s | ~506 |
| **—** | **Total** | **✅ PASS** | **58/58** | **3m 53s** | **~3300** |

---

## Failures

_No failures — all workflows passed._

---

## Per-Workflow Step Detail

### W4 — Group Invite → Approval — ✅ PASS

**Login method:** dev-login-evaluate  |  **Base URL:** https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app

| # | Step | Status | Duration | Notes |
|---|---|---|---|---|
| 1 | Open app [coach] | ✅ | 7423ms |  |
| 2 | Coach login [coach] | ✅ | 4929ms |  |
| 3 | Navigate to Members [coach] | ✅ | 6145ms |  |
| 4 | Generate group invite [coach] | ✅ | 3362ms |  |
| 5 | Verify group invite URL [coach] | ✅ | 1735ms |  |
| 6 | Open group invite URL as player [player] | ✅ | 9195ms |  |
| 7 | Fill group registration form [player] | ✅ | 1755ms |  |
| 8 | Submit join request [player] | ✅ | 2309ms |  |
| 9 | Verify join request submitted [player] | ✅ | 744ms |  |
| 10 | Return to coach context [coach] | ✅ | 1786ms |  |
| 11 | Refresh pending requests [coach] | ✅ | 2041ms |  |
| 12 | Verify pending request visible [coach] | ✅ | 921ms |  |
| 13 | Coach approves player [coach] | ✅ | 1838ms |  |
| 14 | Verify player approved — pending cleared [coach] | ✅ | 942ms |  |
| 15 | Verify player in Active Members [coach] | ✅ | 1117ms |  |

### W5 — Coach ↔ Player DM Messaging — ✅ PASS

**Login method:** dev-login-evaluate  |  **Base URL:** https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app

| # | Step | Status | Duration | Notes |
|---|---|---|---|---|
| 1 | Open app [coach] | ✅ | 5284ms |  |
| 2 | Coach login [coach] | ✅ | 3460ms |  |
| 3 | Navigate to Members [coach] | ✅ | 3073ms |  |
| 4 | Verify player in roster [coach] | ✅ | 2319ms |  |
| 5 | Navigate to Messages [coach] | ✅ | 4557ms |  |
| 6 | Open player DM [coach] | ✅ | 8191ms |  |
| 7 | Send coach message [coach] | ✅ | 3769ms |  |
| 8 | Verify coach message in feed [coach] | ✅ | 2333ms |  |
| 9 | Player login [player] | ✅ | 5492ms |  |
| 10 | Player navigates to Messages [player] | ✅ | 729ms |  |
| 11 | Player opens Coach DM [player] | ✅ | 594ms |  |
| 12 | Player verifies coach message [player] | ✅ | 435ms |  |
| 13 | Player sends reply [player] | ✅ | 863ms |  |
| 14 | Coach verifies player reply [coach] | ✅ | 3633ms |  |

### W6 — Squad Broadcast → Receive → Permissions — ✅ PASS

**Login method:** dev-login-evaluate  |  **Base URL:** https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app

| # | Step | Status | Duration | Notes |
|---|---|---|---|---|
| 1 | Open app [coach] | ✅ | 3335ms |  |
| 2 | Coach login [coach] | ✅ | 2659ms |  |
| 3 | Navigate to Members [coach] | ✅ | 1382ms |  |
| 4 | Verify player in roster [coach] | ✅ | 1238ms |  |
| 5 | Navigate to Messages [coach] | ✅ | 948ms |  |
| 6 | Open Squad channel — verify member count [coach] | ✅ | 924ms |  |
| 7 | Coach sends squad broadcast [coach] | ✅ | 1393ms |  |
| 8 | Verify squad broadcast in coach feed [coach] | ✅ | 523ms |  |
| 9 | Player login [player] | ✅ | 5151ms |  |
| 10 | Player navigates to Messages [player] | ✅ | 840ms |  |
| 11 | Player opens Squad channel [player] | ✅ | 807ms |  |
| 12 | Player verifies squad broadcast received [player] | ✅ | 755ms |  |
| 13 | Player replies in Squad channel [player] | ✅ | 1269ms |  |
| 14 | Coach verifies player reply received [coach] | ✅ | 2520ms |  |
| 15 | Squad messages survive page navigation [coach] | ✅ | 3631ms |  |
| 16 | Player opens Announcements — verify read-only [player] | ✅ | 1487ms |  |
| 17 | Coach sends to Announcements channel [coach] | ✅ | 6454ms |  |

### W7 — Player Session Expiry Recovery — ✅ PASS

**Login method:** —  |  **Base URL:** https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app

| # | Step | Status | Duration | Notes |
|---|---|---|---|---|
| 1 | Open app | ✅ | 2926ms |  |
| 2 | Player login | ✅ | 3776ms |  |
| 3 | Navigate to Messages | ✅ | 805ms |  |
| 4 | Open Squad channel — verify message history | ✅ | 1293ms | Squad channel open; chat feed visible |
| 5 | Force session expiry — corrupt ce_session cookie | ✅ | 398ms | ce_session overwritten with EXPIRED_QA_SESSION_... token |
| 6 | Verify session-expiry overlay appears | ✅ | 1033ms | 401 received; login form with red error banner confirmed |
| 7 | Verify anti-loop — 5s wait, login form stable | ✅ | 5811ms | 401 storm handled; login form shown once; no JS crash |
| 8 | Re-login as player | ✅ | 2305ms | Re-login successful; player nav visible |
| 9 | Verify overlay clears — session-expired message gone | ✅ | 525ms |  |
| 10 | Verify player nav — navigate to Availability | ✅ | 730ms |  |
| 11 | Navigate back to Messages | ✅ | 741ms |  |
| 12 | Verify messages accessible — Squad history intact | ✅ | 653ms | Squad channel opens after recovery; chat history accessible |

---

## Redis Impact

| Workflow | Description | API calls | ~Redis ops |
|---|---|---|---|
| W4 | Group Invite → Approval | 123 | ~720 |
| W5 | Coach ↔ Player DM Messaging | 171 | ~988 |
| W6 | Squad Broadcast → Receive → Permissions | 193 | ~1086 |
| W7 | Player Session Expiry Recovery | 93 | ~506 |
| **—** | **Total** | **580** | **~3300** |

> Estimate: `GET /api/identity` ~6 ops · `POST /api/identity` ~8 ops · `/api/chat` ~8 ops · `/api/invite` ~4–8 ops

---

## Per-Workflow Reports

- W4: [QA_WORKFLOW_4_REPORT.md](QA_WORKFLOW_4_REPORT.md)
- W5: [QA_WORKFLOW_5_MESSAGING_REPORT.md](QA_WORKFLOW_5_MESSAGING_REPORT.md)
- W6: [QA_WORKFLOW_6_REPORT.md](QA_WORKFLOW_6_REPORT.md)
- W7: [QA_WORKFLOW_7_SESSION_EXPIRY_REPORT.md](QA_WORKFLOW_7_SESSION_EXPIRY_REPORT.md)

## Artifacts

- W4: `qa/artifacts/workflow4-2026-06-08T12-17-59-720Z/` (workflow4-2026-06-08T12-17-59-720Z)
- W5: `qa/artifacts/workflow5-2026-06-08T12-19-13-400Z/` (workflow5-2026-06-08T12-19-13-400Z)
- W6: `qa/artifacts/workflow6-2026-06-08T12-20-16-378Z/` (workflow6-2026-06-08T12-20-16-378Z)
- W7: `qa/artifacts/workflow7-2026-06-08T12-21-14-484Z/` (workflow7-2026-06-08T12-21-14-484Z)

## Console Errors (non-4xx)

- None

## Scope Guard

- No Coach's Eye application code was modified.
- Each workflow run writes its own result JSON and report file.
- All workflows run even when earlier ones fail.
- NIGHTLY_QA_REPORT.md is overwritten on each run.

