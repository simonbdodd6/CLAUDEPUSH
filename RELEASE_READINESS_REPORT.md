# Release Readiness Report

**Date:** 2026-06-08  
**Branch audited:** `feature/nightly-qa-agent`  
**Commits ahead of main:** 56  
**Files changed vs main:** 97 (46 added, 5 deleted, 46 modified)

---

## Executive Summary

The AI branch contains two completely different categories of work that have grown together over 56 commits: **product features** that belong in main, and **QA/AI infrastructure** that should stay isolated. Separating them cleanly is the only action needed before merging. There is one pre-existing conflict in `package.json` that must be resolved first.

**The self-service signup implementation is the single most important thing to ship. It is working, QA-verified (10/10), and currently sitting in an uncommitted state on the local working copy.**

---

## 1. What Should Be Merged Into Main Immediately

These changes are production-safe, tested, and required for the first paying customer.

### Group A — Self-Service Signup (Highest Priority)
**Status: Locally uncommitted — must be committed to the branch before merging**

| File | Change | Risk |
|------|--------|------|
| `api/_email.js` | Added `welcomeEmail()` — non-blocking, fire-and-forget | Low |
| `api/identity.js` | Added `signup` action (rate-limited, calls `provisionClub()`, sets session cookie) | Low |
| `index.html` | `handleCoachSignup()`, `signupSuggestCode()`, signup panel HTML, login panel link | Low |

These three files are all that's needed. The signup action is additive — it adds a new `if (action === 'signup')` block and does not touch any existing action. Verified: 10/10 QA tests pass, zero bugs found.

### Group B — API Consolidation (Must ship with Group A)

Five legacy API files were deleted; their logic was merged into existing files to stay within the Vercel Hobby 12-function limit. **This must be merged as a unit** — partial application would break active features.

| What changed | From → To |
|-------------|-----------|
| `api/config.js` (deleted) | Merged into `api/identity.js` as `GET /api/identity?action=config` |
| `api/log.js` (deleted) | Merged into `api/identity.js` as `GET /api/identity?action=log` |
| `api/reminder.js` (deleted) | Merged into `api/cron.js` as `?type=reminder` |
| `api/schedules.js` (deleted) | Removed (functionality unused or absorbed) |
| `api/templates.js` (deleted) | Removed (functionality unused or absorbed) |
| `vercel.json` | Cron path changed from `/api/reminder` → `/api/cron?type=reminder` |

**Risk: Medium if split. Low if merged as a unit.**  
`vercel.json` and `api/cron.js` must be deployed together. Deploying `vercel.json` (which removes the `/api/reminder` cron schedule) without also deploying the inlined reminder handler in `cron.js` would silently kill Monday availability reminders.

### Group C — Core Bug Fixes and UX Improvements
All verified through W1–W13 QA workflow passes.

| Commit | Change | Risk |
|--------|--------|------|
| `cf05cbc` | Graceful session expiry — 401 on any API call triggers re-login | Low |
| `84bf201` | Bind push subscriptions to teamId | Low |
| `136ce6b` | Push notification UX improvements for non-technical players | Low |
| `4276896` / `8d25cd9` | Guard `createInvite` against missing session | Low |
| `17e7acd` | Fix availability button state not updating | Low |
| `502180d` | Surface availability POST failures, refresh on Members navigation | Low |
| `2b744f8` | Stop `renderPlayers` re-fetching on every render | Low |
| `78786f3` | 5 Beta Week bugs (mobile layout, coach desktop history, invite display) | Low |
| `d080ff4` | 4 iPhone/mobile bugs before U18 week | Low |
| `449df91` | Normalize `selectedPlayerId` on player-view entry; fix invite-ID overwrite | Low |
| `9f23894` | Show actual error in join requests panel | Low |

### Group D — Group Invite Registration Flow
| File | Change | Risk |
|------|--------|------|
| `api/_identityStore.js` | Added `joinViaGroupInvite()`, multi-club login selection logic | Low |
| `api/identity.js` | Added `join_group_invite` action | Low |
| `api/invite.js` | Group invite creation and revocation | Low |
| `index.html` | Group invite UI, join-via-link flow | Low |

Tested by W4 (passes). This enables the "share a link" player onboarding path.

### Group E — Fixture Manager + Matchday Selection
Standalone features. `api/fixtures.js` and `api/matchday.js` are new files but the branch is already at the 12-function Vercel limit — these two exist within that budget by virtue of the 5 deletions in Group B.

| File | Risk |
|------|------|
| `api/fixtures.js` | Low — new endpoint, no existing dependencies |
| `api/matchday.js` | Low — new endpoint, no existing dependencies |
| `index.html` additions | Low — additive UI |

---

## 2. What Should Stay On The AI Branch

These files are QA and AI infrastructure, planning documents, and build artifacts. They do not belong in main.

### QA Infrastructure (never merge to main)
```
qa/                          (~30 files: Playwright specs, nightly runner, analyst,
                              repair agent, GitHub agent, helpers, history, mission-control dashboard generator)
playwright.config.js         (QA test runner config)
.github/workflows/nightly-qa.yml  (GitHub Actions nightly schedule)
```
These are development tools, not product code. They contain hardcoded test credentials, Claude API calls, and QA-specific orchestration logic that would be confusing and noisy in main's git history.

### Planning and Strategy Documents (never merge to main)
```
LAUNCH_ROADMAP.md
PHASE_A_LAUNCH_PLAN.md
FIRST_CUSTOMER_PLAN.md
EXECUTION_PLAN.md
IMPLEMENT_SIGNUP_PLAN.md
MULTI_CLUB.md
INVITE_FLOW_AUDIT.md
```
These are decision artifacts from the planning session. They belong in Notion or a private docs repo, not in the app repository.

### QA Reports (never merge to main)
```
QA_REPORT.md
QA_WORKFLOW_REPORT.md
SIGNUP_QA_REPORT.md            (generated this session)
SIGNUP_IMPLEMENTATION_REPORT.md
QA_WORKFLOW_2_REPORT.md through QA_WORKFLOW_10_REPORT.md
QA_PHASE3/4/5 reports
NIGHTLY_QA_REPORT.md
```
Historical test run output. No value in main's working tree.

### Mission Control Dashboard (conditional — see below)
```
mission-control/               (app.js, index.html, manifest.json, styles.css, sw.js)
api/mission-control.js
```
This is an authenticated coach-only admin dashboard (protected by `requireTenantRole`). It has value as a product feature but is not needed for the first paying customer. Keep on the AI branch until it's needed, or merge to a dedicated `feature/mission-control` branch.

---

## 3. Exact Merge Order and Risk Levels

Merge in this exact order. Each step depends on the previous.

### Step 1 — Fix package.json conflict (prerequisite)
**Risk: Low. Blocker if skipped.**

The local `package.json` has an unresolved merge conflict (`<<<<<<< HEAD` markers) caused by a branch divergence. The pre-commit hook on this repo reverts changes to it automatically, which is why the conflict keeps re-appearing. This must be resolved manually before any merge proceeds. Resolution: take the branch version (includes all `qa:*` npm scripts).

### Step 2 — Merge Groups B + C (API consolidation + bug fixes)
**Risk: Medium. Must be a single atomic merge.**

```
api/cron.js          (reminder inlined)
api/identity.js      (config + log inlined; dev_coach_login; group invite; signup)
api/invite.js        (group invite)
api/_identityStore.js (multi-club login, joinViaGroupInvite)
api/_http.js         (readSecret helper)
api/_kv.js           (kvLpush, kvLtrim additions)
vercel.json          (cron path, mission-control rewrite header)
```
Delete: `api/config.js`, `api/log.js`, `api/reminder.js`, `api/schedules.js`, `api/templates.js`

**Verify after deploy:** Monday reminder cron still fires (`/api/cron?type=reminder`), `/api/identity?action=config` returns VAPID key, `/api/identity?action=log` returns audit log.

### Step 3 — Merge Group A (Signup) + Group D (Group Invite UI)
**Risk: Low.**

```
api/_email.js        (welcomeEmail)
api/identity.js      (signup action — additive only, already merged in step 2)
index.html           (signup form, handleCoachSignup, signupSuggestCode, login panel link)
```
Note: `api/identity.js` changes in this group are purely additive. The signup action block does not touch any other action handler.

**Verify after deploy:** New coach can sign up end-to-end on production. Existing BOITSFORT login still works.

### Step 4 — Merge Groups E (Fixtures + Matchday)
**Risk: Low.**

```
api/fixtures.js      (new file)
api/matchday.js      (new file)
index.html           (fixtures and matchday UI additions)
```
These are self-contained. No cross-dependencies with signup.

### Step 5 — Merge Mission Control (optional, when needed)
**Risk: Low-Medium.**

```
mission-control/     (sub-app)
api/mission-control.js
vercel.json          (already merged in step 2)
```
Protected by `requireTenantRole`. No risk to public users. Risk is the additional Vercel function slot — need to confirm the 12-function count is not exceeded.

---

## 4. Files That Could Break Production If Merged Incorrectly

| File | Risk | Failure Mode |
|------|------|--------------|
| `vercel.json` | **HIGH if merged alone** | Removes `/api/reminder` cron schedule. Monday reminders stop silently. Always merge with `api/cron.js`. |
| `api/cron.js` | **HIGH if merged without `vercel.json`** | Reminder handler exists in code but cron never fires (old schedule pointed to deleted endpoint). |
| `api/identity.js` | **Medium if merge conflict** | This file changed in many commits. A bad merge could break login, session resolution, or password reset. Must do a line-by-line review of the diff before merging. |
| `package.json` | **Medium** | Active merge conflict markers. If committed as-is (with `<<<<<<<` in the file), `npm install` fails and the Vercel build breaks. |
| `api/mission-control.js` | **Low** | Reads source files from disk via `readdirSync`. On a Vercel serverless function, the filesystem is read-only and scoped — the file list may differ from dev. Needs a production smoke test before relying on it. |
| `index.html` | **Low** | Very large file (main app). Any merge conflict here could silently break the auth flow or a specific panel. Always test the full auth cycle (login, join, signup, logout) after merging. |

---

## 5. Pre-Merge Checklist

Before initiating any merge to main:

- [ ] Resolve `package.json` merge conflict (take branch version)
- [ ] Commit locally uncommitted signup changes to `feature/nightly-qa-agent` (`api/_email.js`, `api/identity.js`, `index.html`)
- [ ] Confirm Vercel function count after merge: should remain at 12 or fewer
- [ ] Confirm `noreply@coachseye.app` domain is verified in Resend (or welcome email silently fails — not a blocker but degrades onboarding)
- [ ] Confirm Upstash plan supports the expected load (free tier caps at 10,000 commands/day — upgrade to Pay-As-You-Go before first external users)

---

## 6. Recommended Next Task on the Main Coach's Eye Build

**Player approval email — 2 hours.**

When a player submits a join request, they hear nothing until the coach approves them. There is no email, no push notification, no in-app confirmation. For an external rugby club (strangers to the app), this is a silent black hole that will cause players to abandon the signup flow and ask the coach what happened.

Resend is already wired. The `sendTransactionalEmail()` pattern is already established (used by password reset and now welcome email). This is a two-hour task: one new email template in `api/_email.js`, one `sendTransactionalEmail()` call in `approveJoinRequest()` in `api/_identityStore.js`.

It directly unblocks the first real club onboarding: coach signs up → shares group invite link → players join → players get approved → players get email confirmation → players actually start using the app.

**After that, the only remaining hard blocker to a paying customer is Stripe (10–12h).**

---

## State Summary

| Category | Count | Destination |
|----------|-------|-------------|
| Product features to merge | ~50 commits across Groups A–D | main (in order) |
| QA infrastructure files | ~30 files | stays on `feature/nightly-qa-agent` |
| Planning documents | 7 files | stays on branch / move to Notion |
| QA reports | ~15 files | stays on branch |
| Files requiring conflict resolution | 1 (`package.json`) | resolve before any merge |
| Locally uncommitted product changes | 3 files (signup) | commit to branch first |
| Vercel function count after merge | 12 | exactly at Hobby limit — no new API files without upgrading |
