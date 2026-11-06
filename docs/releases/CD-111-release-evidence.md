# CD-111 release evidence

Status: **UPDATED 2026-11-05 for the session-lineage integration (sections 10 onwards). Sections 1-9 are preserved exactly as recorded for the EARLIER candidate `4751dda1`, which was NOT APPROVED (section 8 blocker). The candidate is now `d4fbe1a3`; its status is in section 16. This file is uncommitted and nothing is deployed.**
Recorded: 2026-11-05, in the release worktree `CLAUDEPUSH-cd110-release`.

This record is evidence gathered for a human release decision. It is not the decision, and it does not itself approve the API change for the deployment gate (sections 5 and 11).

**Reading guide.** Sections 1-9 describe candidate `4751dda1` (one commit over production). Its section 8 blocker (a deliberate sign-out could leave a live session) was the reason the corrective build was made; it is kept here unedited so the history is visible. Sections 10-16 describe the integrated candidate `d4fbe1a3` (two commits over production), and every test or review result in them is from the integrated candidate unless it is labelled "source branch".

## 1. Release

| | |
|---|---|
| Name | CD-111 |
| Purpose | Security and reliability release: end only the session a logout names, never clear the cookie from a logout reply, and share the logout generation across tabs. Builds on the CD-110 hardening already live. |
| Production baseline | CD-110, commit `85be168a043ec7b49f1da14859f2cdc3d489846f` (live; rollback target remains CD-109) |
| Release branch | `release/cd-110`, HEAD `4751dda112a421223f80a6f1bd2fbb051b653c08` |
| Integration commit | `4751dda1` (`fix: end only the session a logout names, never clear the cookie for it, and share the logout generation across tabs`) |
| Source commit | `667288dcfb303f543d50f4d309d3ee9bb57e766e` on `fix/logout-cross-tab-security` |
| Candidate delta over production | exactly one commit: `4751dda1` is a direct child of `85be168a` (`rev-list --left-right --count 85be168a...release/cd-110` = `0 1`) |

## 2. Integrity of the cherry-pick (verified locally, 2026-11-05)

`git patch-id --stable` over `git show` of each commit:

```
7619703e5fa3ac5f5d2b434ec88d63d0d5696d52  667288dcfb303f543d50f4d309d3ee9bb57e766e   (source)
7619703e5fa3ac5f5d2b434ec88d63d0d5696d52  4751dda112a421223f80a6f1bd2fbb051b653c08   (integration)
```

Complete patch ID: **`7619703e5fa3ac5f5d2b434ec88d63d0d5696d52`**. Identical for both commits, and both list the same seven files. The integration commit carries the trailer `(cherry picked from commit 667288dcfb303f543d50f4d309d3ee9bb57e766e)`. The source commit's parent is `85be168a`, the same base. The integration is a faithful copy of the reviewed source commit.

Files in the commit (7): `api/_identityStore.js`, `api/identity.js`, `index.html`, `test/logout-cross-tab.test.js`, `test/logout-security-browser.test.js`, `test/logout-security.test.js`, `test/logout-session-identity-server.test.js`.

## 3. API files changed against production

`git diff --stat 85be168a HEAD -- api/` (nothing else under `api/` differs):

| File | Change |
|---|---|
| `api/_identityStore.js` | 18 lines changed (`createSession`, `destroySession`) |
| `api/identity.js` | 17 lines changed (the `logout` action) |

## 4. The three approved API behaviour changes, as they appear in the diff

1. **Session creation exposes the session id, never the token, to the client.**
   - `createSession` now returns `{ id: session.id, token, expiresAt, userId, teamId, role }`. The server-side return value still contains `token`, because the handler needs it to set the cookie; the `id` is the addition.
   - What the client receives is shaped by `publicAuthResult` (`api/identity.js:392`: `const { token, ...safeSession } = result.session`), which strips `token` and passes the rest through. So login, invite-claim and club-creation answers now include the id and still exclude the token. *Established by reading the code; not by executing it in this record.*
2. **Session destruction supports an only-if-this-session guard.**
   - `destroySession(token, { onlyIfSessionId = null } = {})` looks up the session by the hashed token. No match returns `{ ended: false, skipped: 'no-session' }`. A match whose id differs from `onlyIfSessionId` returns `{ ended: false, skipped: 'other-session' }` and ends nothing. Otherwise it ends the session and returns `{ ended: true }`.
   - It never throws for a missing or unknown token. It previously returned nothing.
   - It is re-bound at the end of the module through `lockedIdentityWriter`, which forwards arguments and the return value inside the identity lock, so the look-up, the comparison and the delete are not interleaved with another writer.
   - The only other caller, `switchTeam`, calls `destroySession(token)` and ignores the result, so it is unaffected.
3. **Logout names the session it intends to end and no longer unconditionally clears the cookie.**
   - The `logout` action reads `authSessionId` from the request body (string, trimmed, capped at 80 characters), passes it as `onlyIfSessionId`, and replies `{ ok: true, ended, skipped? }`.
   - The `Set-Cookie` header with `Max-Age=0` is removed from the reply. A reply landing after a newer login can therefore no longer make the browser drop the new session's cookie; destroying the server record is what ends a session, and a dead token in the jar is refused like an expired one.
   - A request that names nothing ends the cookie's session as before (older clients, a remembered-logout marker written by CD-110).

Consequences worth a reviewer's attention:

- After a normal logout the browser keeps a cookie holding a dead token until it expires. It is refused like an expired one; this is the intended trade, but it is a change in behaviour.
- The logout reply body changed from `{ ok: true }` to `{ ok: true, ended, skipped? }`. Additive; existing clients that read only `ok` are unaffected.
- Older clients keep working because naming a session is optional.

## 5. Gate and policy facts

Read from `config/production-exclusions.json` and `scripts/deploy-lib.mjs` (`evaluateProtections`) in the main checkout, and measured on `release/cd-110` against `85be168a`:

| Policy | Result on this candidate |
|---|---|
| `api/mission-control.js` zero diff | zero diff |
| `performance/` byte-identical to baseline | zero diff |
| `apiFunctionCap` (max 12 non-underscore `api/*.js`) | 12 files: at the cap, not over it. No file added |
| club-export exclusion (no `api/_clubExport*`, no club-export branch in `api/availability.js`) | no `_clubExport*` files; 0 matches for `club-export` in `api/availability.js` |
| Core/Intelligence boundary terms in added `api/` lines | none |
| Secret patterns in added lines (whole diff) | none |
| Working tree clean | clean |

**API change approval.** The gate's `api-changed` rule is a warning only: "`N file(s) under api/ differ from the production baseline — confirm this API change is an approved part of this release`". The `clubExport` policy text says `api/` must be byte-identical to the previous production branch "unless an API change was explicitly approved for this release", but **the configuration has no field that records such an approval**; only `performance.approvedChange` has one, and it is pinned to a release branch. So the approval cannot be machine-recorded today. This document is where it is written down. The release brief that set up CD-111 lists exactly the two files and three behaviours above as the approved API change. The person running the release still has to confirm that approval when the gate prints `api-changed` for 2 files. That is expected, and is a warning, not a block.

Not changed by this record: `config/production-exclusions.json` and the gate scripts were left untouched. Its `lastVerifiedAgainst` block still reads `core-deploy-103` / `e00b82a` (2026-10-11); the baseline selection uses the live SHA, so this is housekeeping rather than a blocker.

## 6. Preparation state at the time of writing

- Main checkout `/Users/simondodd/Developer/active/CLAUDEPUSH`: branch `core-deploy-110`, HEAD `85be168a043ec7b49f1da14859f2cdc3d489846f`, clean.
- Release worktree: branch `release/cd-110`, HEAD `4751dda112a4…`, clean apart from this uncommitted file.
- No cherry-pick, merge, rebase or revert in progress in either. Two stashes preserved (`stash@{0}` on `feature/core-beta-memory`, `stash@{1}` on `feature/core-beta-simplification`). 23 worktrees listed, two of them `prunable` under `/private/tmp`; none pruned.
- Remotes: `origin` = Coach-Easier org, `personal` = backup. Nothing fetched, pulled or pushed.
- Playwright server PID 9294 (VS Code extension, started 09:02, owned by VS Code `Code Helper (Plugin)` PID 9199, holds an established connection to it from that process) was left running.

## 7. Test and gate results (produced in this session, 2026-11-05, from the release worktree at `4751dda1`)

Candidate branch `core-deploy-111` was created as a local ref at exactly `4751dda1` (no commit made). Runs used `caffeinate -i` (the Mac was on battery for the first part, so `-s` was unavailable). `pmset -g log` shows no system sleep entries during the run windows.

| Run | Result |
|---|---|
| Focused set (19 files: `logout-*`, `build134-session-revocation`, `build135-identity-concurrency`, `identity-*`, `club-switcher-ui`, `team-switcher-interaction`, `session-check-server-unavailable`, `club-data-isolation-browser`, `invite-claim-landing-browser`, `login-form-redraw`) | 221 tests, 221 pass, 0 fail, 0 cancelled, 0 skipped |
| `test/logout-security-browser.test.js`, three consecutive runs | 3 tests each: 3/3, 3/3, 3/3 pass |
| Full suite, first attempt | **INVALID, discarded.** It hung: two test workers (`invite-autofocus-guard`, `login-form-redraw`, one holding a headless Chromium) sat idle at 0% CPU for about 2 hours. No count was produced. I stopped only that run's own processes (the script, `npm test`, the two workers and the one headless-shell child); the VS Code Playwright server PID 9294 was not touched. The same two files passed in the focused run. Cause not established |
| Full suite, second attempt (`npm test`) | **7170 tests, 7170 pass, 0 fail, 0 cancelled, 0 skipped**, 101.9 s. No orphaned workers afterwards |

Deviations from the brief's expectations, stated plainly: the brief expected a focused fast set of 2,520 and browser journeys of 4/4. The sets I ran were different (221 and 3 tests). I did not reproduce those two figures; the full-suite figure of 7,170 was reproduced.

`npm run deploy:check -- core-deploy-111`, complete output inspected, exit 0:

- Live production serves `85be168` → baseline `core-deploy-110`.
- Exclusion integrity: all four exclusions resolved (tactics-mount, club-export, stamp-cd84-superseded, b106-performance-test-resolution); all four **absent** from the candidate.
- Protections: tactics files 0, club-export files 0, API functions **12/12**, `performance/` changed **0**, `api/` changed **2**, files changed vs core-deploy-110: 7.
- Warnings, both expected: `api-changed` (2 files) and `unexpected-files` (`api/_identityStore.js`, `api/identity.js`). No blocking violation.
- Environments: both resolve 9 required dependencies.
- Tests: baseline core-deploy-110 **7156/7156**, 0 failing; candidate core-deploy-111 **7170/7170**, 0 failing; no new failures; no known or fixed failures listed.
- Verdict printed: `PASSED — core-deploy-111 satisfies every production protection`.

Gate side effects, for the record: one read-only HTTPS GET to `www.coacheasier.com/api/config` (to read the live version); a temporary detached baseline worktree created and removed by the gate (none left). To avoid the gate's `clean-tree` block, this evidence file was moved to the scratchpad for the duration of the run and restored afterwards. The gate, policy config and exclusions were not modified, and no `api.approvedChange` field was added.

The gate PASSED does not mean the API change is approved: `api-changed` is only a warning and its text asks a person to confirm the approval (section 5).

## 8. Independent review (reviewer agent, read-only, 2026-11-05)

**Overall verdict: BLOCKERS FOUND.** The release is **not** marked approved.

Reviewer did not run tests; its claims come from reading the code at `4751dda1`. Areas reviewed and verdicts:

| Area | Verdict |
|---|---|
| Session ID exposure | OK. The id is `makeId('sess')`, independent of the token and its hash; every HTTP path that returns a session goes through `publicAuthResult`, which strips `token`; no id or token in audit entries. An id alone cannot end anyone's session |
| Conditional destruction | OK. Missing token, empty/non-string id (falls back to unconditional), and wrong id (`other-session`, nothing written) behave as described; no useful oracle |
| Locking and races | OK. The wrapper forwards the options and the result inside the identity lock; lock-busy gives 503 and the client leaves its marker armed |
| Authorization | OK. No auth check changed; no caller can end a session whose token they do not present |
| Cookie behaviour | **BLOCKER** (below) |
| Cross-tab generation, marker, id learning | OK, apart from the blocker |
| Interaction with 27a8cf66 / 72e1e10f / 85be168a | OK. Neither earlier commit touched `api/`; this is the first `api/` change in the series |
| `switchTeam` compatibility | OK. It ignores `destroySession`'s result |
| Scope | OK. `git diff 85be168a 4751dda1 -- api/` contains exactly the three approved changes |
| Tests | OK with gaps (see below) |

**BLOCKER: a deliberate sign-out can report success and leave a live session on the device.**

- `switch_team` replies only `{ ok, teamId }` (`api/identity.js:807-810`), so the client learns the new session id only through a follow-up session check.
- The `storage` listener never updates `_authSessionId` (`index.html:47672-47700`), so a tab that did not perform the club switch keeps the old id.
- A sign-out from that tab names the old session. The server answers `200 { ok:true, ended:false, skipped:'other-session' }` (`api/identity.js:826`). The client treats any `res.ok` as delivered, clears the marker (`index.html:45443`) and has already shown "Signed out" (`:27380`). A reload then logs the device back in. On the CD-110 baseline the same click ended the live session.
- Single-tab variant: club switch succeeds, the follow-up session check fails (offline or 5xx), `_authSessionId` stays stale, and sign-out behaves the same way.
- The commit's own test `test/logout-cross-tab.test.js:134-137` (X2) documents this outcome as an accepted trade-off ("A deliberate sign-out from a stale tab therefore leaves the DEVICE signed in as the newer login").
- I independently read the same lines in the committed code and the reading matches the reviewer's. **It has not been reproduced in a running browser.**

Remediation options named by the reviewer (none applied; each needs a new commit, which has not been authorised): (1) name the session only on marker-driven retries, never on a deliberate click; (2) on `skipped:'other-session'` from a deliberate click, re-send once unnamed; (3) in `switchTeamTo`, blank `_authSessionId` before `checkServerSession()`, or return `session.id` from `switch_team` and adopt it. (3) is a complement to (1) or (2), not a substitute.

Non-blocking notes from the reviewer: `action=session` returns the stored `tokenHash` to the session owner (pre-existing, `api/identity.js:800-804`); session ids use `Math.random` (fine, as an id grants nothing); the `delete_account` wipe removes `coach-eye-logout-gen` (harmless); garbage or unauthenticated logout POSTs now answer 200 without a write (improvement).

Test gaps named by the reviewer: the blocker scenarios as a safety property (X2 pins the unsafe outcome); `switch_team` followed by id refresh; expired-token logout; non-string `authSessionId`; the lock-busy 503 path.

Reviewer could not verify: tests (it ran none); the full `sessionCookie()` flags; every client-side 401 handler beyond the session check.

## 9. State at the end of verification and outstanding checks

- `core-deploy-111` is a local branch at exactly `4751dda112a421223f80a6f1bd2fbb051b653c08`. The release worktree is still on `release/cd-110` at the same commit, clean apart from this file.
- Main checkout: `core-deploy-110` at `85be168a`, clean. Two stashes preserved. 23 worktrees listed, none pruned or removed.
- Nothing committed, fetched, pulled, pushed, merged or deployed. The only network access was the gate's read-only GET. Production remains CD-110 (`85be168a`), as the gate's live-version line confirmed.
- **Outstanding:** the blocker in section 8 is unresolved; the API-change approval is still a human confirmation; the first full-suite hang has no established cause (the rerun was clean); the 2,520/4 expected counts were not reproduced; `lastVerifiedAgainst` is stale (housekeeping, unchanged).

---

# Session-lineage integration (candidate `d4fbe1a3`)

## 10. Integration

| | |
|---|---|
| Corrective source commit | `d4fbe1a3c5394e9da474ecec6fb24059d640767d` (`fix: harden cross-tab logout with session lineage`) on `fix/cd111-session-identity-logout`, worktree `CLAUDEPUSH-cd111-session-fix`; parent exactly `4751dda1`; source worktree clean |
| Integrated candidate commit | **`d4fbe1a3c5394e9da474ecec6fb24059d640767d`**, the same commit: `release/cd-110` was **fast-forwarded** (`git merge --ff-only`), not cherry-picked or merged, so the SHA is unchanged |
| `release/cd-110` | `d4fbe1a3c5394e9da474ecec6fb24059d640767d` |
| `core-deploy-111` | moved from `4751dda1` to the same SHA (`git branch -f`), local ref only |
| `core-deploy-110` | unchanged, `85be168a043ec7b49f1da14859f2cdc3d489846f` |
| Production baseline | CD-110 `85be168a`; the live `/api/config` read (read-only GET) answered `85be168` before integration |
| Candidate delta over production | exactly two commits: `4751dda1` then `d4fbe1a3` (`rev-list --left-right --count 85be168a...HEAD` = `0 2`) |
| Source patch ID (`git patch-id --stable`) | `ad0824b5148012ce4ab779583f829cfacdf57ba9` (for `d4fbe1a3`) |
| Preflight before the fast-forward | release worktree on `release/cd-110` at `4751dda1`, only this evidence file untracked (16,241 bytes); `d4fbe1a3` a direct descendant (behind 0, ahead 1); the commit does not touch this file's path; nothing else in either worktree or the main checkout differed |

### The eight integrated files

| File | Purpose |
|---|---|
| `api/_identityStore.js` | Session lineage: `createSession` accepts a bounded `lineage`; `switchTeam` records the ids it replaced; `destroySession` accepts the cookie's own id or an id in its lineage |
| `api/identity.js` | `switch_team` answers with the new session's id (never the token); `publicSessionRead` strips `lineage` from both `action=session` reads |
| `index.html` | `deliverLogout` sends one named request and no unnamed retry; the switching tab adopts the id from the switch answer; ordered cross-tab id sharing (`coach-eye-auth-session`); a session read made before another adoption cannot replace a newer id; claim and club creation adopt the id; `clearDeviceState` keeps the shared sequence |
| `test/logout-session-identity-server.test.js` | Server contract (T7-T20): switch reply, lineage through 1 / 2 / 4 switches, new-login boundary, sibling logins, cross-device and cross-person rejection, corrupt / expired / oversize lineage, the 32 cap, concurrent switch-vs-logout and login-vs-logout, no lineage in any reply, request-supplied lineage ignored |
| `test/logout-cross-tab.test.js` | Client behaviour over the real handler and real client functions (X1-X14): the replaced unsafe X2, offline marker after a switch, the earlier-login boundary, ordered id adoption, the response-shape table |
| `test/logout-session-rotation-browser.test.js` | New: five real-browser journeys (switch learned through storage; stale tab; offline boot retry; club creation; the earlier-login boundary) |
| `test/invite-claim-landing-browser.test.js` | A claim adopts the id its answer carries |
| `test/identity-consistency.test.js` | One pinned regex now accepts the new `{ authSeq }` argument to `adoptIdentityPayload` (the property it pins, purge-before-adopt, is unchanged) |

## 11. What the correction does (as written in the committed code)

1. **Lineage is created only by `switchTeam`.** `createSession` is called in the store from `loginUser`, `claimInvite`, `createClub`, `devLoginUser` and `switchTeam`; only `switchTeam` passes `lineage`. Login, invite claim, club creation and dev login create fresh sessions with **no inherited lineage**, so a new login breaks any earlier lineage.
2. **Lineage derives from the authenticated session record under the existing identity lock.** `switchTeam` is bound through `lockedIdentityWriter`; it resolves the cookie's session, ends it, and creates the replacement, whose lineage is `[replaced id, ...the replaced session's own lineage]`, in one lock hold. No request field is read.
3. **The cap is 32.** `sessionLineage` keeps only non-empty strings of at most 80 characters and slices to 32, at write and at read. Older ancestors fall off the end.
4. **`destroySession` destroys only the session represented by the current request cookie.** It finds the record by the hash of the presented token and removes only that record. The named `authSessionId` is used only to decide eligibility: the cookie's session id, or an id in that session's lineage. Otherwise it answers `{ ended: false, skipped: 'other-session' }`; no session at all answers `skipped: 'no-session'`.
5. **`switch_team` returns the new session id** (`sessionId`, never the token) and the client propagates it across tabs through an ordered shared key (`coach-eye-auth-session` holding `{ id, seq }`; `seq` only advances).
6. **Logout sends one request.** The earlier correction's unnamed deliberate retry was **removed**: with lineage it is unnecessary for club switches, and it could end a login the request was never about (shown in a real browser on the previous correction).
7. **`action=session` reads use `publicSessionRead`,** which strips `lineage` from the client-facing session. Both the GET and POST reads.
8. **Request-supplied lineage is ignored.** The handler never reads a lineage from the request (`T19` source check, `T20` behavioural check).
9. **The client treats `other-session` as a completed logout attempt and clears its marker.** It means the cookie's session is a different login, so nothing of this logout's is left to end; keeping the marker would stop every boot asking for a session until the next login.

### API change against production, as it now stands

`git diff --stat 85be168a HEAD -- api/` = `api/_identityStore.js` 54 lines, `api/identity.js` 38 lines (2 files, 82 insertions, 10 deletions); `api/mission-control.js` and `performance/` have zero diff; non-underscore `api/*.js` count is 12 (at the cap, no file added). Compared with section 4, the approved set in this record is now: (a) session creation exposes the session id, never the token; (b) `destroySession` with `onlyIfSessionId`; (c) logout names its session and never clears the cookie; **(d) `switch_team` answers with `sessionId`; (e) the session lineage; (f) `publicSessionRead` on the two session reads.** Items (d)-(f) were added by the corrective build. **This record does not approve them:** the gate has no field that records an API approval, so a person still has to confirm that (a)-(f) are an approved part of this release when the gate prints `api-changed`.

## 12. Source-branch test evidence (historical; NOT integrated-candidate results)

Produced earlier in this session from the corrective worktree `CLAUDEPUSH-cd111-session-fix` at the code that became `d4fbe1a3` (no file changed after that run began):

| Run (source branch) | Result |
|---|---|
| Focused set (24 files) | 316/316 |
| `logout-security-browser` + `logout-session-rotation-browser`, three consecutive runs | 8/8, 8/8, 8/8 |
| Existing browser suites (37 files that import Playwright) | 477/477 |
| Full suite | 7,202/7,202 |
| Failures / cancellations / skips | 0 / 0 / 0 in every run |

Also recorded then: against an unmodified `4751dda1` extract, 25 of the 46 tests in the four logout/session test files failed; against the previous (unnamed-retry) correction 14 of 46 failed, including journey 5, where the stale tab's unnamed second request ended a later login (the session read afterwards returned 401). The source correction's independent review verdict was **APPROVED WITH NON-BLOCKING NOTES** (reviewer read-only, ran no tests). The integrated-candidate results are in section 14.

## 13. Outstanding risks (existing entries retained; new ones added)

Carried forward from sections 5-9 and still true unless a later section says otherwise:
- The API-change approval is a human confirmation; the gate cannot record it (section 5).
- `config/production-exclusions.json` `lastVerifiedAgainst` is stale (`core-deploy-103` / `e00b82a`); housekeeping, unchanged.
- The first full-suite hang during the earlier verification (section 7) had no established cause; the rerun was clean.
- The pre-existing `tokenHash` exposure: `action=session` returns the stored session record, including `tokenHash` (sha256 of the cookie token), to the session's owner. Present at `4751dda1` and earlier; not made worse; not fixed here.
- Session ids use `makeId('sess')` (`Math.random` based); an id grants nothing and cannot select a record.
- The section 8 blocker is **resolved in the integrated candidate** (see section 12 and the fresh review), not by editing section 8.

Accepted residuals of the lineage design, documented so they are not re-reported as new defects:
- **The `no-session` race (present at `4751dda1`; DIFFERENT from production).** A logout request dispatched with the OLD cookie that reaches the server after a club switch took the lock finds no record for that token and is answered `no-session`; the replacement session stays alive and the client treats the answer as finished, so a reload can sign the device back in. Lineage cannot fix it without letting a named id select which record is destroyed, which would break "only the cookie's session". It needs two deliberate actions on one device inside one lock hold.
  **Correction to an earlier statement of mine** (corrected after the fresh review, section 15): this race is *not* identical to production. At production `85be168a` the late logout reply carried `Set-Cookie: ...; Max-Age=0` unconditionally, so in this same window the browser dropped the replacement cookie and the device ended signed out (the replacement session was orphaned on the server, unreachable). The candidate no longer clears the cookie from a logout reply (that is the point of the release: it stops a late reply signing out a newer login), so in this one window the device stays signed in. Security-equivalent (the orphaned session was unreachable), but a narrow user-visible regression against production for that window. The same cookie-clearing removal is also what fixes production's worse case, a stale logout reply signing out a newer login.
- **The 32-rotation cap.** An id more than 32 switches old no longer identifies the login (`other-session`, nothing ended, marker cleared). Reachable only if a logout is owed while another tab on the same device switches clubs more than 32 times.
- Older clients that send no `authSessionId` still end the cookie's session unconditionally (the legacy path); a device that holds no session id (before its first session read, or a CD-110 `1` marker) sends the same legacy request.
- A deploy-window mismatch (new client against a server without lineage) reproduces the original defect only for the length of the window.
- **A first logout request can still name nothing** (fresh-review note 1). "No unnamed fallback" means no *second* request. A tab that holds no session id sends the legacy unnamed request, which ends the cookie's session unconditionally, as at production: after a boot session read that was superseded (the id adoption is skipped and nothing re-reads), after another tab's *Clear device* wrote an empty id into the shared key, or against a pre-CD-111 server. Not a regression against production; the earlier phrase "always names the session" should be read with this exception.
- **A present but non-string `authSessionId`** is treated as naming nothing (`api/identity.js`, `named || null`), i.e. an unconditional end of the cookie's *own* session. Boundary 4 still holds (it is still the cookie's own session); a stricter "present but malformed -> other-session" would be marginally safer (fresh-review note 3).
- **The delete-account wipe** (`index.html`, `settingsDeleteAccountExecute`) removes `coach-eye-logout-gen` and `coach-eye-auth-session`, unlike *Clear device*, which keeps both. A still-open tab keeps a higher in-memory sequence and ignores a later login's low-sequence adoption, so its Sign out would name a dead id (`other-session`) until a proper sign-out. UX only: every old session was revoked server-side. Candidate for the same key filter in a follow-up (note 4).
- **Source-pattern tests** (`T19`, `X12`, `X13`, `identity-consistency`) are brittle guard-rails, and `T16` depends on scheduling order of the in-memory lock in the fixture; accepted (notes 3 and 7).
- **Every fresh tab boot bumps the shared sequence** even when the id is unchanged (note 8): harmless churn.

## 14. Integrated-candidate test results (run from THIS worktree at `d4fbe1a3`, 2026-11-05)

These are results for the integrated candidate, produced after the fast-forward, from `/Users/simondodd/Developer/active/CLAUDEPUSH-cd110-release` on `release/cd-110` at `d4fbe1a3c5394e9da474ecec6fb24059d640767d`. They are separate from the source-branch results in section 12. All runs used `caffeinate -i`.

Commands:

```
node --test <24 files: logout-*, build134-session-revocation, build135-identity-concurrency, identity-*, club-switcher-ui,
  team-switcher-interaction, session-check-server-unavailable, club-data-isolation-{browser,caches,server}, club-state-isolation,
  invite-claim-landing-browser, login-form-redraw, multi-club-context>
node --test test/logout-security-browser.test.js test/logout-session-rotation-browser.test.js        (three consecutive runs)
node --test <the 37 test files that import Playwright>                                              (existing browser suites)
npm test                                                                                             (node --test test/*.test.js)
git diff --check HEAD~1 HEAD ;  git diff --check 85be168a HEAD
```

**Clean run (machine quiet: load average about 4-6, no competing jobs), 21:32-21:40. This is the result of record.**

| Run | Tests | Pass | Fail | Cancelled | Skipped |
|---|---|---|---|---|---|
| Focused (24 files) | 316 | 316 | 0 | 0 | 0 |
| Logout + rotation journeys, run 1 | 8 | 8 | 0 | 0 | 0 |
| ... run 2 | 8 | 8 | 0 | 0 | 0 |
| ... run 3 | 8 | 8 | 0 | 0 | 0 |
| Existing browser suites (37 files) | 477 | 477 | 0 | 0 | 0 |
| Full suite (`npm test`) | 7,202 | 7,202 | 0 | 0 | 0 |
| `git diff --check` (`HEAD~1..HEAD` and `85be168a..HEAD`) | clean | | | | |

No orphaned test workers or headless browsers remained after any run.

**An earlier integrated attempt (19:39-19:47) is recorded here too, because it differed.** Focused 316/316, journeys 8/8 x3, browser suites 477/477, **full suite 7,201/7,202**. The one failure was `test/build133-roster-integrity.test.js`, "CLIENT (phone): repeated switching Alpha -> Bravo -> Alpha -> Bravo ...", a `page.goto` 30 s timeout. During that run an unrelated ffmpeg job (a user's video processing, PID 31625, ~400-850% CPU) pushed the machine load average to 200-430, and the full run took 222 s instead of about 105 s. The same test had passed (4.9 s) in the browser-suite run of the same candidate a few minutes earlier. Isolated re-runs of that file while the machine was still saturated gave run 1: 20/20 pass; runs 2 and 3: failures with individual tests taking 8 to 17 minutes, which is the machine thrashing and says nothing about the code, so **those re-runs are not treated as evidence either way**. I did not touch the competing job and did not change any test or timeout. After it finished I re-ran everything on the quiet machine (the table above). The one-off failure has therefore been explained by an environmental cause and not reproduced, but it was not isolated to a cause by a controlled experiment; a reader who wants more assurance should re-run that file on a quiet machine.

Source-branch results (section 12) matched the integrated results exactly on counts (316 / 8x3 / 477 / 7,202), as expected for a fast-forward to the same commit, but the integrated figures above were produced independently.

## 15. Release gate (`npm run deploy:check -- core-deploy-111`, from this worktree, 21:36-21:40)

Complete output inspected, exit 0. The evidence file was moved to the scratchpad for the run (the gate blocks on a dirty tree) and restored automatically afterwards (29,473 bytes at the time). The gate, `config/production-exclusions.json` and the policy configuration were not changed, and no `api.approvedChange` field was added.

- **Baseline:** live production served `85be168`, so the baseline is `core-deploy-110` (`85be168a`). The gate read the live version with one read-only HTTPS GET; production is still CD-110.
- **Candidate:** `core-deploy-111` = `d4fbe1a3` (the current checkout).
- **Exclusions:** all four resolved and **absent** from the candidate (tactics-mount, club-export, stamp-cd84-superseded, b106-performance-test-resolution).
- **Protections:** tactics files 0, club-export files 0, API functions **12/12**, `performance/` changed **0**, `api/` changed **2**, files changed vs `core-deploy-110`: **10**.
- **Warnings (both expected, both warn-only):**
  - `api-changed`: 2 files under `api/` differ from production (`api/_identityStore.js`, `api/identity.js`). Explanation: this is the session change described in section 11. The warning asks a person to confirm the API change is an approved part of the release; the gate has no field to record that, so it is **still a human confirmation** (see section 11, which lists the six behaviours that confirmation must cover).
  - `unexpected-files`: the same two files are outside the gate's "expected release surface" (`index.html`, `test/`, `src/`, `config/`, `scripts/`, `DEPLOY.md`, `package.json`). Explanation: any change under `api/` triggers it.
  - No other warning.
- **Environments:** both resolve 9 required dependencies.
- **Tests:** baseline `core-deploy-110` **7,156/7,156**, 0 failing; candidate `core-deploy-111` **7,202/7,202**, 0 failing; **no new failures**; no known or fixed failures listed. The candidate has 46 more tests than production, all in the logout/session files.
- **Performance comparison:** `performance/` has zero changes against the baseline (the gate's performance-drift check passes); `api/mission-control.js` has zero diff.
- **Verdict printed:** `PASSED - core-deploy-111 satisfies every production protection`.
- Side effects: one read-only HTTPS GET to `www.coacheasier.com/api/config`; a temporary detached baseline worktree created and removed by the gate (none left: 24 worktrees listed, as before).

A PASSED gate is not an approval of the API change, and not a deployment decision.

## 16. Fresh independent review of the integrated candidate, and status

**Reviewer verdict: APPROVED WITH NON-BLOCKING NOTES. No blockers.** A new read-only reviewer inspected the actual integrated diff against production (`git diff 85be168a HEAD`: 10 files, +1,547 / -39) and did not run tests. It was told not to rely on any earlier approval. It confirmed, with line references in the working tree:

- every `createSession` caller (`loginUser`, `claimInvite`, `createClub`, `devLoginUser`) except `switchTeam` passes no lineage; `switchTeam` builds it only from the resolved cookie record; the handler never reads a lineage from a request;
- `destroySession` locates the record by the hash of the presented token, compares the named id only with that record's own id and its lineage, and removes only that record; a named id can veto but never select;
- `switchTeam`, `destroySession` and `createSession` all run through the identity lock, re-entrantly, so resolve, destroy, create and remember-last-team are one lock hold;
- lineage is sanitised and capped at 32 at write and at read; expired records are pruned before lookup; a lineage never leaves the server (`publicSessionRead` on both session reads; absent from the switch, logout, login, claim, club-creation and admin replies);
- the cross-tab id sharing is ordered and cannot go backwards for a live tab; claim and club creation adopt the new id and clear any owed logout;
- every `deliverLogout` answer shape matches the documented table; the reviewer **accepts** treating `other-session` as settled;
- no secrets, no debug leftovers, nothing outside scope; zero diff under `api/mission-control.js` and `performance/`.

Against production, the reviewer judged the candidate better on "a stale logout must not end a newer login" and "an earlier login's id must not authorise destruction", and equal on cookie-scoped destruction, locking and token exposure. It found production **better in exactly one narrow window**, the `no-session` race described in section 13 (which this record's first draft had wrongly called identical to production; corrected there), and it noted that a dead cookie now lingers in the browser jar by design.

Non-blocking notes (all recorded in section 13): a first logout request can still name nothing when a tab holds no id; a present-but-malformed `authSessionId` is treated as naming nothing; the delete-account wipe removes both shared keys, unlike Clear device; source-pattern tests are brittle and `T16` depends on lock scheduling order; every tab boot bumps the shared sequence; `session.tokenHash` is still returned by `action=session` (pre-existing). Nothing was fixed in response; no issue was found that required a code change.

The reviewer could not verify: any test or the gate (it ran none); bearer-token (native) clients beyond reasoning; every client 401 handler beyond the session check.

**Status of candidate `d4fbe1a3`:** integrated tests pass (section 14), the release gate **PASSED** with the two expected warnings (section 15), and the fresh independent review found **no blockers** (this section). **This record does not approve the release or the API change.** What remains for a person to decide: confirm the six API behaviours in section 11 are an approved part of CD-111; accept or reject the residuals in section 13, in particular the `no-session` window against production; and authorise any push or deployment. Nothing has been pushed, fetched or deployed. Production is still CD-110 (`85be168a`). This file is untracked and uncommitted.

# Approval record

## 17. User approval of the API changes and the late-logout trade-off (recorded 2026-11-06)

**Source of the approval:** a message from the user in this Claude Code conversation on 2026-11-06 (the session date), titled "CD-111 — Record Approval and Complete Final Release Verification". It is user-provided approval relayed in the conversation. It carries no signature and no separate timestamp, and none has been invented here; this section records what the user said, as an agent recorded it.

**What the user approved:**

1. **All six API behaviour changes listed in section 11** ("API change against production, as it now stands"):
   (a) session creation exposes the session id, never the token;
   (b) `destroySession` with `onlyIfSessionId`;
   (c) logout names its session and never clears the cookie;
   (d) `switch_team` answers with `sessionId`;
   (e) the session lineage (created only by `switchTeam`, derived from the authenticated session record under the identity lock, capped at 32);
   (f) `publicSessionRead` on the two `action=session` reads.
   This answers the human confirmation that the `api-changed` gate warning asks for (sections 11 and 15). The gate itself still has no field that records it, and none was added; this section is the record.
2. **The documented late-logout trade-off** (section 13, "The `no-session` race"): a logout request dispatched with the old cookie that reaches the server after a club switch is answered `no-session`, the replacement session stays alive, and the device may stay signed in on that replacement session.
   **Rationale given:** this is accepted rather than risk a stale logout response signing out a newer authenticated session. Production `85be168a` did the opposite in that window (its late logout reply cleared the cookie unconditionally, so the device ended signed out), and the same cookie-clearing is what allowed a stale logout reply to sign out a newer login. The release removes that second, worse failure.

**What this approval does not change (everything below is as recorded in sections 13-16 and is unchanged):**

- The narrow regression against production remains documented: in that one window the candidate keeps the device signed in where production signed it out. It needs two deliberate actions on one device inside one identity-lock hold. It is accepted, not removed.
- The fresh independent review verdict remains **APPROVED WITH NON-BLOCKING NOTES**, with no blockers (section 16). The approval above does not alter or replace it.
- The release gate **PASSED** (section 15): baseline `core-deploy-110` 7,156/7,156, candidate `core-deploy-111` 7,202/7,202, no new failures, four exclusions absent, `performance/` unchanged, API functions 12/12; warnings `api-changed` and `unexpected-files` only.
- The integrated test results are recorded as supplied in section 14 and were **not re-run** for this approval (no application source changed): focused 316/316; logout and rotation journeys 8/8 in three consecutive runs; existing browser suites 477/477; full suite 7,202/7,202.
- The earlier integrated full-suite attempt of **7,201/7,202** (one `page.goto` timeout in `test/build133-roster-integrity.test.js` while an unrelated ffmpeg job drove the load average above 200) remains documented in section 14 with its explanation: environmental cause, not reproduced on a quiet machine, but **not isolated by a controlled experiment**. That explanation is only partly established and is not upgraded here.
- The other residuals in section 13 are not accepted or rejected by this approval except where item 2 above says so: the 32-rotation cap, a first logout request that can name nothing, a non-string `authSessionId` treated as naming nothing, the delete-account wipe, brittle source-pattern tests, shared-sequence churn, the pre-existing `tokenHash` exposure in `action=session`, and the stale `lastVerifiedAgainst`. They remain open, non-blocking notes.

**Scope of the approval: release preparation only.** It does **not** authorise a push, a fetch, a deployment, a rollback, an alias change or any production or infrastructure change. Each of those needs a separate explicit authorisation from the user.

**State when this section was written:** candidate `d4fbe1a3c5394e9da474ecec6fb24059d640767d` on `release/cd-110` (and `core-deploy-111`), exactly two commits ahead of production `85be168a043ec7b49f1da14859f2cdc3d489846f` (`4751dda1`, `d4fbe1a3`). Production is still CD-110. Nothing has been pushed, fetched or deployed. This file is untracked and uncommitted.

# Production deployment record

## 18. Production deployment of CD-111 (2026-11-06)

**Provenance of this section.** Everything in the tables below is the **supplied deployment report**: the output and summary of the deployment step (`caffeinate -i -s npm run deploy:release`, run on explicit user authorisation) as passed to the agent that wrote this section. **The agent that wrote this section made no production request, ran no gate and no test, and did not repeat any deployment check.** The only checks it performed for this section were local Git and file checks (section 18.3). Nothing here is presented as independently re-verified.

### 18.1 Deployment (as reported)

| | |
|---|---|
| Result | Deployed; the release script exited 0 |
| Deployment ID | `dpl_BuC8Dxi39to9QRPwrfSaKSZ1AcYq` |
| Status / target | Ready, production |
| Deployment URL | `boitsfort-coachseye-o8vif7qv0-simonbdodd-9233s-projects.vercel.app` |
| Production build stamp | `d4fbe1a (core-deploy-111)` |
| Candidate SHA | `d4fbe1a3c5394e9da474ecec6fb24059d640767d` |
| Previous production SHA | `85be168` (CD-110, `dpl_7aCpHL4We6jZi8TMrGW1W2232b1E`) |
| Deployed from | main checkout, branch `core-deploy-111` |
| Script run window | 08:53:51Z to 08:59:23Z on 2026-11-06 |
| Aliases reported | `www.coacheasier.com`, `coacheasier.com`, `boitsfort-coachseye.vercel.app`, `boitsfort-coachseye-gpt.vercel.app` (the last re-pointed by the script) |

### 18.2 Checks reported by the deployment step

- **Gate:** the standalone gate (`npm run deploy:check -- core-deploy-111`) **passed**, and the gate that `deploy:release` runs before deploying **passed** too. Reported counts: baseline `core-deploy-110` 7,156/7,156, candidate 7,202/7,202, no new failures; the two known warn-only warnings (`api-changed`, `unexpected-files`, both from `api/_identityStore.js` and `api/identity.js`) and no others.
- **Hosts:** all three production hosts served `d4fbe1a`.
- **Home page:** HTTP 200.
- **`devLogin`:** false.
- **Tactics asset:** HTTP 404 (correctly excluded).
- **Invite and chat endpoints:** returned 401 when unauthenticated.
- **Storage health:** OK.
- **Unauthenticated session read** (`/api/identity?action=session`): 401 "No active session".
- **Client:** the served page contained the `coach-eye-auth-session` key.
- **Data:** the release script reported that no production data was written.
- **Rollback:** none occurred; the rollback target remains CD-110 `dpl_7aCpHL4We6jZi8TMrGW1W2232b1E` (`vercel rollback <its URL> --yes`, then `vercel alias set <url> boitsfort-coachseye-gpt.vercel.app`, expect `85be168`).
- **Git push:** none occurred. `core-deploy-111`, `release/cd-110` and `fix/cd111-session-identity-logout` exist locally only.
- **Application source:** unchanged between the approved candidate and the deployment.

**What this record does not establish:** it does not show the new session behaviour working for a signed-in user. Every check above is unauthenticated or structural. The authenticated checks are listed, **not performed**, in section 19.

### 18.3 Local checks made when this section was written

Local Git and file checks only, made after the deployment: main checkout clean on `core-deploy-111` at `d4fbe1a3c5394e9da474ecec6fb24059d640767d`; release worktree on `release/cd-110` at the same commit with this file as its only (untracked) change; `core-deploy-110` still `85be168a043ec7b49f1da14859f2cdc3d489846f`; `git rev-list --left-right --count 85be168a...HEAD` and `git diff --name-only 85be168a HEAD` unchanged from section 10 (`0 2`; the same 10 files); 24 worktrees and 2 stashes preserved; no remote ref exists for `core-deploy-111` or `release/cd-110`. This file remains untracked and uncommitted.

## 19. Outstanding manual verification (NOT PERFORMED; corrected 2026-11-06)

**Status: none of these checks has been performed.** Section 18 contains no authenticated check. Every row below is **NOT PERFORMED** until the person running it fills in the Result column.

**Basis and its limits.** This section replaces the first draft of section 19. It follows a read-only audit of the deployed code at `d4fbe1a3` and of the existing automated tests (2026-11-06). That audit **ran no tests and did no browser verification**; its findings are readings of code, and anything it calls an inference is an inference here too. The first draft had four faults the audit found: it signed out in the wrong tab for the original defect, it described a late-logout race that ordinary throttling cannot force, it asserted that a passive tab follows a club switch (nothing implements or tests that), and it compared a "stored id" that two tabs always share. They are corrected below.

### 19.1 Prerequisites (all of them, before step 1)

- **One browser profile, one account.** The account must belong to **at least two clubs**. Use your own account. Another device, another profile or a private window has its own cookie jar and its own session, so it tests something else: a sign-out ends only the session of the cookie it carries.
- **Sign in once, in Tab A.** Then open **Tab B in the same profile**, on the same URL. Tab B restores from the shared cookie. **Do not sign in separately in Tab B**: that would create a second, unrelated session and change what is being tested.
- **Run the CD-111 client in both tabs.** Reload both tabs, then run `typeof authSessionAdopt` in each tab's console. It must print `"function"`. A tab loaded before the deploy, or served from a cached service worker, may still run the CD-110 client, which has none of this and would make the results meaningless. If either tab prints anything else, reload it (close and reopen it if need be) and check again.
- **Record `_authSessionId` and `_authSessionSeq`** in each tab's console (top-level bindings of the page). The id must start with `sess_`. Record them again after each step marked "record". Both tabs read one `localStorage`, so comparing the stored value between tabs proves nothing; the per-tab variables are what to compare.
- **Load Tab B fully before Tab A switches**, and leave Tab B on **Messages** (step 4 needs it). A Tab B opened or reloaded after the switch learns the new session by itself and makes the test vacuous.
- **Open DevTools > Network in Tab B** with "Preserve log" on, before step 5.
- **No real writes.** Do not send a message, post, or save anything in any step. Do not paste a cookie or token anywhere; session ids (`sess_…`) are not secrets but are redacted when reporting.

### 19.2 Test sequence

Types: **Expected** = the behaviour the code and automated tests establish; a different result is a defect to report. **Exploratory** = no automated test establishes it; record what happens, with no pass/fail implied unless a row says so.

| # | Type | Check | Expected / what to record | Automated coverage | Result |
|---|---|---|---|---|---|
| 1 | Expected | Establish the shared session: Tab A signed in, Tab B opened on the same cookie, prerequisites met. | Both tabs show the signed-in app; `_authSessionId` is the same `sess_…` value in both. | Journey 1 setup (`twoTabs()`). | NOT PERFORMED |
| 2 | Expected | In Tab A, switch to the other club (club switcher). | Tab A shows the other club. Tab A's `_authSessionId` **changes** to a new `sess_…`, and `_authSessionSeq` rises (by one or more). | Journey 1; T7; X9. | NOT PERFORMED |
| 3 | Exploratory | **Observe Tab B without reloading or interacting.** Record: its club name, its club switcher (which club is marked current), its Messages screen, and its `_authSessionId` / `_authSessionSeq`. | Only the **session identity** is expected to change in Tab B: `_authSessionId` equals Tab A's new id and `_authSessionSeq` has risen, with no request of its own. **Do not expect, or mark as a failure, that Tab B's club context follows the switch.** The audit found no implementation or test evidence that it does. Record what is shown. | Journey 1 and X9 assert the id and `seq` only. **No test asserts anything about Tab B's club context.** | NOT PERFORMED |
| 4 | Exploratory | Tab B is still on Messages. Look at its conversation list and any open thread for content that belongs to the club Tab A just left. Make Tab B visible and leave it for about 30 seconds, recording whether it changes. Open nothing new and write nothing. | Record what is shown and whether it changes. **Any previous-club content that can be read or acted on is a security defect** (see 19.4). Staleness that is only on screen is an observation to record, not a CD-111 failure. | Single-tab switch only: the Messages test in `logout-security-browser.test.js`. **The passive-tab case is not covered.** | NOT PERFORMED |
| 5 | **Expected (essential)** | **Sign out in Tab B, the tab that did not switch.** Network panel open. Confirm "Sign out". | Exactly **one** `POST /api/identity` is sent. The page also shows the signed-out screen. | Journey 1 (signs out in the non-switching tab); X9; X2. | NOT PERFORMED |
| 6 | **Expected (essential)** | In that request and its response (Network > the `identity` POST): | Request body: `{"action":"logout","authSessionId":"sess_…"}` where the id is the **current** session, i.e. the value Tab A showed after step 2. Response: `{"ok":true,"ended":true}`. The response carries no `Set-Cookie` that clears the cookie. **`"skipped":"other-session"` is a failure**: it is the original defect, where a stale tab's sign-out left the device signed in. | Journey 1 (`named` and `answer.ended`); T1; T8; T10. | NOT PERFORMED |
| 7 | Expected | Look at Tab A, then **reload both tabs**. | Tab A shows the signed-out state (it follows through the shared state, immediately or at the latest on reload or its next server call). After reloading, **neither tab restores the ended account.** "Signed out" means the login screen; the club's data stays saved locally by design, so a local roster in storage is not a finding. Afterwards `coach-eye-logout-pending` is absent. | Journeys 1–3 (`expectSignedOutAfterReload`). The immediate flip of the passive tab is not asserted. | NOT PERFORMED |
| 8 | Expected (secondary) | **Repeat with the other order.** Sign in once more in Tab A and reopen Tab B (prerequisites again). Switch clubs in Tab A, then **sign out in Tab A, the tab that switched.** Inspect the request and response as in step 6, then reload both tabs. | Same as steps 5–7: one request naming Tab A's current session, response `{"ok":true,"ended":true}`, signed out after reload. This order worked before CD-111 too; it is a secondary check. | Journey 1 setup; X9; the two-tab test in `logout-security-browser.test.js` (sign-out in A, B observes). | NOT PERFORMED |
| 9 | Exploratory | **Offline sign-out, then reconnect.** Sign in once; in DevTools > Network choose **Offline**; sign out. Check `localStorage` key `coach-eye-logout-pending`. Set the network back to **Online**. Record whether a logout request is sent without any reload and whether the marker is cleared. Reload and check the state. | While offline: the marker holds a `sess_…` id (the session owed). After going online: record whether the logout is delivered and the marker cleared by itself. **Not confirmed by the audit: whether the DevTools Offline toggle fires the browser `online` event that triggers delivery.** If it does not, the next reload delivers it at boot instead; record which happened. After a reload with the network online: signed out and not restored, marker gone. | Boot delivery of an owed logout: journey 3; X3; X6b. The `online` listener itself has no browser test here. | NOT PERFORMED |
| 10 | Exploratory | **Back/Forward after sign-out.** Sign out, navigate to another page, press Back (a page restored from the back/forward cache). Record whether the signed-in app comes back. | Expected by the code: the restored page re-checks the session and shows signed-out; the ended account is **not** restored. Record what is shown. | **No test found in these suites** for this restore path. | NOT PERFORMED |
| 11 | Exploratory (optional) | **Clear this device from a stale tab.** Sign in once, open Tab B, switch in Tab A, then in Tab B choose "Clear this device". | Expected by the code: one named logout request (same shape as step 6), the device ends signed out and local data is cleared. Record the request, the response and the state after a reload. | A failed logout is covered (`logout-security-browser.test.js`); **the stale-tab variant is not.** | NOT PERFORMED |

### 19.3 The late logout response (not a manual check)

A stale logout reply landing after a newer login cannot be produced reliably by hand. Ordinary network throttling delays the logout and a later login equally, so the logout request and its reply always finish first. The ordering needs a held reply. It is therefore **not** part of the manual sequence, and nothing in the table claims to test it.

It is covered by the automated tests, which hold the reply on purpose:

- `test/logout-security-browser.test.js`: the two-tab test in which Tab A's sign-out reply lands after Tab B logged in.
- `test/logout-session-rotation-browser.test.js`: journeys 1-5, including journey 5 (a tab from an earlier login cannot end a later login).
- `test/logout-cross-tab.test.js`: X1, X8, X8b, X6c, X14.
- `test/logout-session-identity-server.test.js`: T1, T2, T8, T11, T17.

Those were reported passing in section 14 and were not re-run for this section.

### 19.4 Interpreting results

- **Security defect (stop and report at once):** any read or write that succeeds against a club other than the one the cookie's session currently names. Examples: a previous-club conversation opens and loads its messages in Tab B; an action in a previous-club thread is accepted. The server derives the club from the cookie and is expected to refuse these. Because writes are forbidden here, the evidence is a **read** that succeeds, or a request that is accepted when it should be refused. If a screen merely **names** one club while its requests go to another, record it and perform no write.
- **Failure of the CD-111 fix:** step 6 shows `"skipped":"other-session"`, or the account is restored after the reload in step 7, or the request in step 5 or 8 names an id other than the current session.
- **Passive-tab stale club context (steps 3 and 4) is not proven to be a CD-111 regression.** The audit's reading of the code is that a passive tab learns the new session id but is not reset to the new club: the shared state may reach it while its in-memory memberships, permissions and caches stay as they were, so it may show a mixture. That is an inference from reading the code, not an observation, and the code involved is not part of this release's change. Record what you see; do not treat it as a CD-111 failure, and do treat anything in the previous bullet as a defect.
- **Known limitation, accepted in section 17 (do not report as a new defect).** In one narrow, documented race, a logout request dispatched with the old cookie that reaches the server after a club switch is answered `no-session`; the replacement session stays alive and **the device may remain signed in on the replacement session** (production `85be168` would have ended signed out in that window). It needs two deliberate actions on one device inside one server lock hold. If a device stays signed in only after a sign-out and a club switch were issued almost together, that is this trade-off. If it stays signed in after an ordinary sign-out with no club switch, it is **not** this trade-off: report it.
- Report any failure with: the step number, the tab, what each tab showed, the Network request and response (ids redacted), and the time.

Rollback, if a critical regression is found, is the procedure in section 18.2 and is a separate decision for the user.

# Automated Verification — CD-111

## 20. Automated Verification — CD-111 (2026-11-06)

**What this section is.** Results of automated tests written after the deployment to cover the behaviour behind the section 19 manual checks. They ran in an isolated harness (real handlers, an in-memory store, a local server, headless Chromium with service workers blocked). **No production host, production data or credential was involved.** The tests were written against, and run on, the unmodified candidate `d4fbe1a3c5394e9da474ecec6fb24059d640767d`; no application source was changed.

**What this section is not.** It is **not manual verification**. All 11 rows of section 19 remain **NOT PERFORMED** and are unchanged. Nothing here marks a manual row passed, and an automated pass must not be read as a manual pass. It is also not an approval or a release decision.

**Status of this file.** From the commit that adds this section, this file and the test file are tracked on the local branch `release/cd-110` (not pushed). Earlier statements in this record that the file is untracked and uncommitted were true when written and are left as history. The deployed branch `core-deploy-111` stays at `d4fbe1a3`; the commit changes only a test file and this document, not deployed content.

### 20.1 The tests

New file: `test/cd111-manual-check-automation-browser.test.js` (452 lines, 9 tests). It carries a copy of the harness of `test/logout-session-rotation-browser.test.js`, with one addition: it records each logout reply's `Set-Cookie` header.

| Test | Section 19 row it automates | What it asserts |
|---|---|---|
| R3 passive tab after a switch | 3 | Tab 2 adopts the new session id and the shared sequence advances; its own session read is answered for the new club; every club value it shows is one of the two clubs. The rest is **recorded as diagnostics, not asserted** (see 20.4). |
| R4a passive tab on Messages | 4 | After tab 2's next conversations refresh, club A's group is absent from its list and from the raw reply. |
| R4b SECURITY: read | 4 | After the switch, club A's conversation cannot be read (`messages`, mark-read) through the shared cookie: 403/404, no message text in the reply. |
| R4c SECURITY: write | 4 | After the switch, club A's conversation cannot be written (`send`, `react`, `delete`): 403/404, and club A's thread read back as club A is unchanged. |
| R5-7 non-switching tab | 5, 6, 7 | One logout request naming the current session, answered `ended:true`, no cookie-clearing `Set-Cookie`; both tabs signed out after a reload; nothing left owed. |
| R8 switching tab | 8 | The same, signing out in the tab that switched. |
| R9 offline, then reconnect | 9 | While offline the marker names the session and nothing reaches the server; on reconnect the named logout is delivered by itself and the marker cleared; a reload stays signed out. |
| R10 pageshow | 10 | A persisted `pageshow` in a frozen tab whose session ended meanwhile re-asks the server and becomes signed out; a non-persisted one does nothing. |
| R11 Clear this device, stale tab | 11 | One named logout, ended through the lineage, the device ends signed out in both tabs. |

### 20.2 Results (executed)

All from `/Users/simondodd/Developer/active/CLAUDEPUSH-cd110-release`, branch `release/cd-110`, HEAD `d4fbe1a3`. Times are UTC from the shell clock.

| Run | Result |
|---|---|
| Each new test run individually, first run | 8 passed, **R9 failed** (explained below) |
| R9 after correcting the test | passed |
| Whole new file, three consecutive runs | 9/9, 9/9, 9/9 |
| Existing logout / session set (the 24 files of section 14) | 316/316, 0 failures, cancellations or skips |
| Full suite (`caffeinate -i -s npm test`), 10:21:54Z to 10:23:18Z | **7,211/7,211**, 0 failures, 0 cancellations, 0 skips |
| Full-suite runtime and machine load | 83.5 s; sampled one-minute load peaked at 5.1 |

7,211 is the earlier 7,202 plus the 9 new tests.

**The R9 initial failure was an incorrect expectation in the test, not a product defect.** The first version expected exactly one logout request on reconnect. With two tabs open, **both tabs deliver the pending logout** (the owed-logout marker is shared storage and every open tab runs the `online` listener): the first request ended the session (`ended:true`) and the second, naming the same session, was answered `skipped:'no-session'`. Both are settled. The corrected test asserts that: one to two requests (at most one per open tab), all naming the owed session, exactly one ends it, the others are `no-session`, none is `other-session`, none clears the cookie. The security property the test guards is unchanged.

### 20.3 An invalid high-load full-suite attempt (discarded; not counted)

A first full-suite run, started 10:08:37Z, ran while the machine was heavily loaded (sampled one-minute load about 17 at 10:18:43Z). It was far slower than the usual two minutes, many browser tests timed out on `page.goto` (30 s), including unrelated suites (`build133` roster integrity, `login-form-redraw`, the existing `logout-security-browser` test and journey 1) and R9 itself, and it was **stopped by me before completing**. **It is discarded and is not counted as a result of any kind:** it proves nothing about the code. Its output was kept in the scratchpad. The cause of the load was **not determined** (an ffmpeg job was suspected at first, but that reading was wrong: the process search had matched its own command line, and no ffmpeg process was found afterwards). The run of record is the quiet re-run in 20.2, made after the load settled below 3.

### 20.4 Observation to review: the passive-tab mixed state (R3)

R3 recorded what a tab that did **not** switch shows after another tab switches clubs (tab 2 untouched, no reload). In the isolated harness, with the first club Alpha and the second Bravo:

| Value in tab 2 | After the switch |
|---|---|
| `state.stateTeamId` | **Bravo** (it followed the shared state) |
| `_clubContextId` | **Alpha** (unchanged) |
| current membership (`_myMemberships`) | **Alpha** (unchanged) |
| club switcher value | **Alpha** (unchanged) |
| `_authSessionId` / `_authSessionSeq` | the new session id; sequence advanced (as designed) |

Tab 2's **own requests act on Bravo**: its session read is answered for Bravo, because the server takes the club from the shared cookie. So the tab can name one club in part of its state and be talking to the other.

**This is flagged for separate review. It is not a confirmed security vulnerability, and it is not shown to be a regression introduced by CD-111:** the tab-following code is not part of this release's change, and the tests R4b and R4c show that club A's conversation is **not** readable or writable through the shared cookie after the switch. The exposure the mixed state could cause (for example a write that lands in a club other than the one a tab displays) was **not tested** and remains an open question for the review. R3 is a characterisation: it records the behaviour and asserts none of it except the points CD-111 establishes.

### 20.5 Mutation check and baseline runs

- **Mutation check (R4b and R4c only).** In a scratch copy of the candidate outside the repository, the chat access refusal in `requireConversationAccess` was disabled (`if (!allowed)` replaced by `if (false && !allowed)`). Result: **R4b and R4c failed; the other seven passed.** Only these two tests received a mutation check.
- **Baseline runs are not regression proof.** Run in scratch copies of `85be168a` (production before) and `4751dda1`, the new file failed **during setup** on both and must **not** be presented as independent proof that each of the nine tests catches the original defect. On `85be168a`: 0 of 9 passed, every test stopping at `_authSessionId is not defined`. On `4751dda1`: 2 passed (R9, R10) and 7 failed, stopping on the 10 s wait for tab 2 to adopt the new session id, which is that candidate's known defect.

### 20.6 Limitations

- **Not covered:** a real back/forward-cache restore (headless Chromium here did not perform one: `persisted` stayed false in a probe); Safari, iOS and installed-PWA storage; the real service worker (blocked in all these suites); the DevTools Offline button (Playwright's offline switch was used, which fires the page's real `offline` and `online` events); production cookie flags and Vercel behaviour.
- **R10** uses a **synthetic** `pageshow` event with `persisted: true`. It tests the handler, not the browser's restore.
- **R11** assigns the replaced session id **by hand** in the tab (as journey 2 does) so the tab is stale; that assignment is the test's, not the app's.
- **R4a** does not assert the conversation list shown *before* the tab refreshes; it records it as a diagnostic.
- **R3** asserts only what CD-111 establishes (see 20.1 and 20.4).
- **Only R4b and R4c** received mutation testing.
- The nine tests ran on one machine, against an in-memory store, on one Chromium version (Playwright 1.61.1).

### 20.7 Section 19 is unchanged

All 11 rows of section 19 are still **NOT PERFORMED**. Automated coverage per row is summarised in 20.1; it does not replace the manual rows, in particular the rows that need a real browser restore (10), the DevTools toggle (9), or the owner's own devices.
