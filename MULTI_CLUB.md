# Multi-Club Provisioning Guide

**Date:** 2026-06-06
**Branch:** feature/nightly-qa-agent

This document explains exactly what is required to provision a second club from scratch, how isolation works, and what is still missing.

---

## 1. How a Second Club Is Created

Clubs are stored as records in Redis under `app:identity:teams`. The list is managed by `loadTeams` / `saveTeams` in `api/_identityStore.js`. A club has:

```json
{
  "id":        "unique-club-slug",
  "name":      "My Rugby Club",
  "teamCode":  "MYCLUB",
  "createdAt": "ISO timestamp"
}
```

The `teamCode` is what players type in the "Join squad" form. It is case-insensitive and must be unique across all clubs.

### Provisioning via API

`POST /api/identity` with `action: provision_club`, authenticated by the `CRON_SECRET` environment variable:

```sh
curl -X POST https://<your-vercel-url>/api/identity \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "action":         "provision_club",
    "teamId":         "my-rugby-club",
    "teamName":       "My Rugby Club",
    "teamCode":       "MYCLUB",
    "coachEmail":     "coach@myclub.com",
    "coachFirstName": "Jane",
    "coachLastName":  "Coach",
    "coachPassword":  "a-strong-password"
  }'
```

The response is `201` with the created team, coach user, and coach team member. The team record is persisted to Redis immediately.

**Constraints:**
- `CRON_SECRET` must be set in Vercel environment variables (it already exists if the cron job is configured)
- `teamId` and `teamCode` must be globally unique across all clubs
- `coachEmail` must not be already registered
- `coachPassword` must be at least 8 characters

**Idempotency:** The call is NOT idempotent. Calling it twice with the same `teamId` returns `409`. If you need to re-run (e.g., after a typo), change the `teamId` and use a new email, or delete the stale records from Redis directly.

---

## 2. How Coaches Are Assigned

### First coach (provisioned via API)

The `provision_club` action creates the first coach account atomically with the team. The coach is immediately `active` with `role: 'coach'`.

### Additional coaches

A provisioned coach can create individual invite links with `role: 'coach'`:

```sh
POST /api/invite
Authorization: Bearer <coach-session-token>
{ "type": "individual", "name": "Second Coach", "role": "coach", "email": "second@myclub.com" }
```

The invited person claims the link via `POST /api/identity` with `action: claim_invite`. They are immediately `active` with `role: 'coach'` and scoped to the inviting coach's team.

### No self-service coach registration

`createJoinRequest` (the "Join squad" flow) always creates `role: 'player'`. There is no self-service path to become a coach. Coaches must be invited or provisioned.

---

## 3. How Players Are Isolated

Player isolation is enforced at three layers:

### Session layer
Every session carries a `teamId`. `api/_tenant.js` extracts the `teamId` from each session and all API handlers call `requireTenantRole(req, roles)` before doing anything. A coach from Club A cannot read or approve Club B's data — this returns `403`.

### Data layer
`team_members`, `player_profiles`, chat conversations, and all identity state are filtered by `teamId` before being returned. `listIdentityState(teamId)` only returns users who are members of that specific team.

### Chat layer
`api/chat.js` sets `teamId` on every conversation at creation time. Reads check `tenantTeamId(session) === conversation.teamId`. A player or coach cannot read messages from another team's conversation.

### Login
After login, the session carries `teamId: member.teamId`. All subsequent requests are scoped to that team. There is no way to "switch teams" without logging out and in again with a different credential.

### Self-registration (`createJoinRequest`)
Players who enter a team code self-register using `findTeamByCode`, which searches all clubs. Entering `MYCLUB` creates a pending member in My Rugby Club, not in Boitsfort RFC. The coach who approves them must be a coach of that specific team.

---

## 4. How Invites Work Across Clubs

### Shared invite list (known limitation — W5)

All clubs share the Redis key `ce:invites`. This is a known issue documented in KNOWN_ISSUES.md (W5). The key does not use `APP_KEY_PREFIX`.

**Why this is safe in practice:**
- Every invite record stores `teamId`
- `GET /api/invite` (coach list view) filters invites by `session.teamId`
- `POST /api/invite` tags the new invite with `teamId: session.teamId`
- `PATCH /api/invite` (mark accepted) and `DELETE /api/invite` (revoke) both call `assertSameTenant(session, invite.teamId)` — a Club A coach cannot touch Club B's invite
- `claimInvite` and `joinViaGroupInvite` use `invite.teamId` to place the user in the correct team

**The only shared surface:**
- `GET /api/invite?token=xxx` (public token validation) returns invite metadata without filtering by team. The token is a cryptographically random 24-byte value — not guessable.
- The 200-invite list cap is shared across all clubs.

### Invite emails now use the correct club name

`invite.js` now looks up the team record from Redis (`loadTeams()`) and uses the actual `team.name` in the email subject and body. The hardcoded `'Boitsfort RFC'` has been removed.

---

## 5. What Is Still Missing

### 5.1 No club self-service (blocked — by design)

There is no public signup path for a new club. Provisioning requires `CRON_SECRET`. This is intentional — uncontrolled club creation would exhaust the Upstash free tier rapidly.

### 5.2 UI is Boitsfort-branded

`index.html` contains Boitsfort-specific copy in multiple places:
- `<title>coacheseyeGPT · Boitsfort RFC</title>`
- Sidebar text (`Boitsfort RFC · Prototype`)
- Hardcoded fixture data (`Boitsfort Premier vs Kituro`)
- Push notification templates ("Training sheet — Boitsfort RFC")
- Team code share copy ("Join Boitsfort RFC on coacheseyeGPT!")

Club B coaches will see Boitsfort branding until the frontend is parameterised. This requires loading `team.name` from the session and substituting it in the UI. **Not implemented — separate task.**

### 5.3 No team selector on login for multi-team users

A user who holds active memberships in two clubs (e.g., a coach who coaches two teams) will always be logged into `boitsfort-rfc` when no `teamId` is specified in the login request. The login API accepts an explicit `teamId` body field but the frontend never sends one.

**Workaround:** The coach logs in, gets a session for Boitsfort RFC, logs out, and there is currently no UI to switch to Club B. This needs a "which team?" prompt on login — not implemented.

### 5.4 `INVITES_KEY` not namespaced (W5 — unchanged)

Migrating `ce:invites` to `key('invites')` would orphan any existing invite records. Deferred until there are real multi-club deployments that make the migration worth the risk.

### 5.5 Push subscriptions are global

Push subscription records in `api/subscribe.js` do not carry a `teamId`. If the same device subscribes as a player in Club A and then in Club B, subscriptions are not cleanly separated. The risk is low (subscriptions are per-endpoint and managed by the browser), but a formal audit is needed before multi-club push is considered reliable.

### 5.6 Upstash free tier (immediate blocker)

Phase 5 QA was blocked by `ERR max requests limit exceeded` (500,000/500,000 requests). Until the Upstash account is upgraded or the monthly usage resets, no live Club B provisioning or testing is possible. Upgrade to Upstash Pay-As-You-Go before the next real-world test.

### 5.7 No coach password reset path for provisioned coaches

Provisioned coaches can use `POST /api/identity` with `action: request_password_reset` — this triggers an email if `RESEND_API_KEY` is configured. However, the reset email currently uses the hardcoded `appBaseUrl` which may point to the Boitsfort deployment URL. If Club B is on a separate Vercel deployment, the reset link will go to the wrong domain. **Requires APP_URL per-deployment config.**

---

## Provisioning Checklist for a New Club

Before provisioning, verify:
- [ ] Upstash account has sufficient request quota
- [ ] `CRON_SECRET` is set in Vercel environment variables
- [ ] `RESEND_API_KEY` is set (for invite/reset emails) — optional but needed for email
- [ ] Chosen `teamId` slug is unique and URL-safe (lowercase, hyphens)
- [ ] Chosen `teamCode` is unique (uppercase letters/numbers only, coach shares it with players)
- [ ] Coach email is not already registered in this Upstash database

Run the `provision_club` curl command from section 1. Verify the `201` response contains the expected team and user records.

After provisioning:
- [ ] Coach logs in at `<vercel-url>` with their provisioned email/password
- [ ] Coach navigates to the Invites section and creates a group invite link
- [ ] Coach shares the invite link (or the team code) with players
- [ ] Players self-register and appear in the coach's Members section as pending
- [ ] Coach approves each player

---

## What Was Changed in This Session

| File | Change |
|------|--------|
| `api/_identityStore.js` | Added `provisionClub()` export |
| `api/_identityStore.js` | Fixed `loginUser()` — auto-selects team for single-membership users; surfaces "Waiting for coach approval" for pending Club B members |
| `api/identity.js` | Added `provision_club` POST action (CRON_SECRET-protected) |
| `api/invite.js` | Replaced hardcoded `'Boitsfort RFC'` with actual team name from Redis |
| `test/identity-system.test.js` | Added 6 tests: `provision_club` (create, wrong secret, duplicate teamId, duplicate code), login auto-detection (Club B player, multi-team fallback) |
