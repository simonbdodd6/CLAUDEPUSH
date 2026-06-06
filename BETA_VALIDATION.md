# Beta Validation Report

**Date:** 2026-06-06
**Branch:** feature/nightly-qa-agent
**Latest commit:** a8f28d7
**Test suite:** 168/168 passing (node --test)
**Vercel preview:** https://boitsfort-coachseye-3627ec83r-simonbdodd-9233s-projects.vercel.app

---

## Summary

| # | Workflow | Status |
|---|----------|--------|
| 1 | New player onboarding (team code) | Partially Proven |
| 2 | Group invite creation | Partially Proven |
| 3 | Group invite registration | Partially Proven |
| 4 | Coach approval workflow | Partially Proven |
| 5 | Coach-to-player messaging | Proven (unit level) |
| 6 | Player-to-coach reply | Proven (unit level) |
| 7 | Team isolation | Proven (unit level) |
| 8 | Multi-team scenarios | Requires Real-User Testing |

**Proven (unit level)** = all server logic verified with in-process Redis mock, full API integration tested, no real browser or real Redis tested.

**Partially proven** = unit tests pass + some browser evidence exists, but browser test against live Vercel+Redis has not completed successfully.

**Requires real-user testing** = architectural support exists but no test coverage at any level.

---

## Production Redis Blocker

Phase 5 QA (Vercel preview + real Upstash, 2026-06-06) failed at login with:

> `Upstash HTTP 400: ERR max requests limit exceeded. Limit: 500,000, Usage: 500,000`

This is the Upstash free tier monthly limit. It was exhausted during development/QA testing. Until the Upstash account is upgraded or the usage resets, no workflow that requires a live Redis call (login, messaging, invite, approval) can be validated against the Vercel preview. This is the **single highest-priority blocker** for real-world validation.

---

## 1. New Player Onboarding (Team Code)

**Status: Partially Proven**

The "Join squad" flow lets a player self-register by entering a team code (currently hardcoded as `BOITSFORT` in the UI), their name, email, and password. The result is a `pending` team member who must wait for coach approval.

### What is proven

Unit tests (`test/identity-system.test.js`):
- `createJoinRequest` creates a pending member with the correct teamId — PASS
- Pending player cannot log in before approval — PASS
- Approved player can log in and resolves the correct userId profile — PASS
- Coach approval creates active membership and player profile linked to permanent userId — PASS
- Rate limiting on login (5/15 min) is tested and audited — PASS

### What is partially proven

Browser test (Phase 4, static server, 2026-06-06):
- App loads, coach can log in, Members tab is navigable — PASS
- This used a static Python server, not Vercel, so no Redis calls were made; login used client-side fallback credentials.

### Gaps requiring real-user testing

- Self-registration form end-to-end on Vercel+Redis (blocked by Upstash rate limit)
- Email validation feedback in the browser (wrong team code, duplicate email)
- Password field mobile UX (16px font-size has been set to prevent iOS auto-zoom — not browser-verified)
- The team code is hardcoded as `BOITSFORT` in the UI default value. A new team cannot self-register with a different code without a UI change.

---

## 2. Group Invite Creation

**Status: Partially Proven**

A coach can create a reusable group invite link via `POST /api/invite` with `type: 'group'`. The link contains a token and has no expiry. The coach can also revoke it.

### What is proven

Unit tests (`test/group-invite.test.js`, 22 tests):
- Coach creates group invite with no name — PASS
- Non-player roles are rejected at creation — PASS
- Token validates and returns `type: 'group'` — PASS
- Revoked invite returns 410 — PASS
- `POST /api/invite` with `type: group` creates correct shape — PASS

### What is partially proven

Browser test (Phase 4):
- Coach can log in and reach the Members/Invites panel — PASS
- Actual invite creation button press was not tested

### Gaps requiring real-user testing

- Clicking "Create invite link" in the browser and copying the URL
- Verifying the invite URL resolves correctly on Vercel (correct host, HTTPS)
- Coach UI for listing and revoking existing group invites
- QA report notes: "Group invite creation is attempted through the real invite API because the current UI only exposes personal invite links" — there is a UI path but it was not exercised in browser QA

---

## 3. Group Invite Registration

**Status: Partially Proven**

A player opens the group invite URL (`/?inv=<token>`), fills in their details, and submits. They are created as a `pending` team member. No session is issued until a coach approves them.

### What is proven

Unit tests (`test/group-invite.test.js`):
- Player registers and gets `pending` status — PASS
- Pending player cannot log in — PASS
- Group invite remains active after use, `usageCount` incremented — PASS
- Second player can register via same invite — PASS
- Duplicate registration for active member returns 409 — PASS
- Security: coach email via group invite does not overwrite existing password — PASS
- Security: new email with no team membership can still register — PASS
- Security: pending player can re-register (password update allowed) — PASS

Full E2E test (`test/group-invite.test.js` line 867):
- Coach creates invite → player validates token → player registers → coach approves → player logs in → coach opens DM → player replies → both messages visible — **all steps PASS**

### What is partially proven

- Phase 5 browser QA was blocked by Upstash rate limit before reaching the invite flow

### Gaps requiring real-user testing

- Opening the invite URL in a real browser (URL format, redirect, token parsing in `index.html`)
- Mobile registration form UX (16px inputs set, not browser-verified)
- No approval notification is sent to the player after registration (W6 — by design for now)

---

## 4. Coach Approval Workflow

**Status: Partially Proven**

A coach navigates to the Members section, sees pending players, and clicks Approve or Reject. Approval creates an active membership with a permanent `user_XXXX` userId and a player profile.

### What is proven

Unit tests:
- `approveJoinRequest` creates active member and player profile — PASS (`identity-system.test.js:159`)
- `rejectJoinRequest` does not create active profile — PASS (`identity-system.test.js:501`)
- Approval creates the correct `legacyPlayerId` for DM key stability — PASS
- Cross-team approval is blocked (403) — PASS (`identity-system.test.js:642`)
- Approved player can log in immediately after approval — PASS

Browser test (Phase 4):
- Coach login and Members tab navigation — PASS
- Members list renders correctly (h1#pageTitle visible after click) — PASS

### Gaps requiring real-user testing

- Clicking the Approve / Reject buttons against live Vercel+Redis (blocked by rate limit)
- Verifying the Members list updates in real-time after approval
- No push notification or email is sent to the approved player (W6)
- Session expiry during long approval session silently fails (W7 — sessions last 30 days, low priority)

---

## 5. Coach-to-Player Messaging

**Status: Proven (unit level)**

A coach creates a DM conversation with a player and sends a message. The player's unread count increments. The player sees the message in their Messages tab.

### What is proven

Unit tests (`test/invite-registration.test.js`):
- `coach can open a DM conversation channel with an invited player` — PASS
- `coach send creates unread count for player but not the sender` — PASS
- Conversation list shows unread badge/count before player opens it — PASS
- Player portal notification badge displays total unread count — PASS

Unit tests (`test/chat-api-unread.test.js`):
- `chat conversations require authentication` — PASS
- Anonymous GET `/api/chat` does not leak conversation metadata (SEC-4, fixed) — PASS
- Tenant isolation blocks messages between teams — PASS

Group invite E2E (`test/group-invite.test.js:923`):
- Coach creates DM, sends message, player replies, both messages visible — PASS

### Gaps requiring real-user testing

- Push notification delivery on real devices (push system tested in unit tests but not on real device)
- Message polling interval behavior in a real browser (currently 4-second poll for coaches)
- Read receipts and unread badge clearing in real browser
- Squad/Announcements broadcast messaging (unit tested for structure, not browser-verified)

---

## 6. Player-to-Coach Reply

**Status: Proven (unit level)**

After a coach opens a DM, the player can reply. The player must be authenticated. The message appears in the coach's conversation view.

### What is proven

Unit tests (`test/invite-registration.test.js:377`):
- `invited player can reply to coach DM` — PASS
- Player session is authenticated before reply — PASS
- Player cannot spoof senderId (chat API trusts session identity over browser-supplied ids) — PASS

Group invite E2E (`test/group-invite.test.js:937`):
- Player replies "Thanks coach!", message is visible in coach view — PASS

### Gaps requiring real-user testing

- Player message input and send UX in a real browser
- Typing indicator (`chat?action=typing`) — implemented but not explicitly unit-tested
- Player DM visibility before coach initiates (U1: player sees no DM stub until coach sends first)

---

## 7. Team Isolation

**Status: Proven (unit level)**

Each team's data is scoped by `teamId`. A coach cannot read or approve players from another team. A player cannot read messages from a different team's conversation.

### What is proven

Unit tests (`test/identity-system.test.js:642`):
- Coach reading another team's identity data → 403 — PASS
- Coach approving a member from another team → 403 — PASS
- Coach list only shows own team's users and members — PASS

Unit tests (`test/identity-system.test.js:774`):
- Invite management is scoped to the coach session's team — PASS

Unit tests (`test/chat-api-unread.test.js:479`):
- Player reading another team's conversation → 403 — PASS
- Coach reading another team's conversation → 403 — PASS

### What is partially proven

- Tenant isolation is enforced at the API boundary (`requireTenantRole` + `assertSameTenant`)
- `_tenant.js` falls back to `DEFAULT_TEAM.id` ('boitsfort-rfc') when no team is in the session — this is the production fallback for legacy sessions
- Tests set up two teams in Redis and verify the boundary; real Redis has only one team in production

### Gaps requiring real-user testing

- Isolation with two live production teams in the same Upstash instance has not been tested
- The `INVITES_KEY = 'ce:invites'` is not prefixed with `APP_KEY_PREFIX` (W5) — in a shared Redis instance, group invites would be visible across tenant environments

---

## 8. Multi-Team Scenarios

**Status: Requires Real-User Testing**

Multiple teams can coexist in the same Redis instance if they each have a unique `id` and `teamCode`. Team isolation is enforced at the API level. However, **no UI or API exists to create a second team**, and no production test has ever been run with two live teams.

### Architecture state

- `DEFAULT_TEAM` is hardcoded as `{ id: 'boitsfort-rfc', name: 'Boitsfort RFC', teamCode: 'BOITSFORT' }` in `_identityStore.js`
- `loadTeams()` always merges in `DEFAULT_TEAM` even if Redis has additional teams
- `ensureLegacyCompatibilityTeamRecords()` only runs for `DEFAULT_TEAM.id`
- `_tenant.js` falls back to `DEFAULT_TEAM.id` on any session without an explicit teamId
- No `createTeam` API exists; a second team can only be added by writing directly to Redis
- The `teamCode` used in the join flow (`BOITSFORT`) is hardcoded as the default in the UI

### What unit tests show

- Isolation tests create a second team (`other-club`) directly in the mock Redis store and verify cross-team reads/writes return 403 — this proves the isolation logic is correct
- Tests do not simulate a second team onboarding coach, creating invites, approving players, or messaging

### Gaps requiring real-user testing

- Creating a second team end-to-end (requires manual Redis write or new provisioning API)
- Second team coach onboarding (no coach registration flow; currently requires environment variable `LEGACY_COACH_PASSWORD` or manual Redis seeding)
- Group invites being scoped to the correct team (`inviteList` is shared in `ce:invites` without prefix — W5)
- Message conversations between two teams on the same Vercel deployment do not cross-leak (isolation tested in unit tests but not in production)

---

## Evidence Sources

| Source | Type | Scope | Result |
|--------|------|-------|--------|
| `test/identity-system.test.js` (22 tests) | Unit / API | Join, approval, session, isolation, rate limit | 22/22 PASS |
| `test/group-invite.test.js` (22 tests) | Unit / API | Group invite create, register, approve, DM, security | 22/22 PASS |
| `test/invite-registration.test.js` (11 tests) | Unit / API | Individual invite, claim, login, DM, reply | 11/11 PASS |
| `test/chat-api-unread.test.js` | Unit / API | Unread, isolation, session enforcement | All PASS |
| `test/account-onboarding-flow.test.js` (1 test) | E2E API | Full invite + claim + chat + availability | 1/1 PASS |
| QA Phase 4 (browser, static server) | Browser | Coach login + Members nav (no Redis) | PASS |
| QA Phase 5 (browser, Vercel+Redis) | Browser | Login → blocked at login | FAIL (Upstash rate limit) |

---

## Blockers Before Real-World Validation

1. **Upstash free tier exhausted** — 500,000/500,000 requests used (as of 2026-06-06). Login and all subsequent workflows are blocked on the Vercel preview. Upgrade to Upstash Pay-As-You-Go or wait for monthly reset.
2. **No second team provisioning** — multi-team scenarios cannot be validated without a `createTeam` API or manual Redis seed.

## Known Issues (from KNOWN_ISSUES.md) Relevant to Beta

| ID | Workflow affected | Impact |
|----|-------------------|--------|
| W3 | Coach login | Coach password is `LEGACY_COACH_PASSWORD` env var; plaintext `'1111'` fallback in source |
| W5 | Group invites | `ce:invites` key has no `APP_KEY_PREFIX`; shared across environments on same Redis |
| W6 | Approval workflow | Player receives no notification when approved |
| W7 | Coach session | Expired session shows error rather than re-login prompt |
| U1 | Player messaging | Player sees no DM stub until coach sends first message |

All other blockers (SEC-1 through SEC-4, MOB-1, URL-1, FAIL-1 through FAIL-5) are fixed.
