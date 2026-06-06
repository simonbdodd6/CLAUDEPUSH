# Invite Registration Flow — Code Audit

**Date:** 2026-06-05  
**Branch:** feature/group-invites-registration  
**Commit:** 31a9efba  
**Auditor:** Static code trace — no production data touched

---

## Audit Method

Every code path was traced by reading source files directly:
- `api/invite.js` — invite creation and validation
- `api/identity.js` — action routing
- `api/_identityStore.js` — all identity, session, approval logic
- `api/chat.js` — conversation access and message delivery
- `api/_tenant.js` — auth middleware
- `index.html` — all frontend invite, login, approval, and messaging functions
- `src/chat-state.js` — DM ID resolution
- `vercel.json` — routing and deployment config

Results are reported by flow stage with PASS / FAIL / WARNING ratings.

---

## Stage 1: Coach Creates Group Invite

### 1A — Backend API: POST /api/invite with type: 'group'
**PASS**

`requireTenantRole(['coach', 'admin'])` is enforced before any logic. Group invite creation (`normType === 'group'`) validates that role is player only, sets `name: ''`, `status: 'active'`, `expiresAt: null`, `usageCount: 0`. The generated URL uses the request host, not a hardcoded domain. Token is `randomBytes(24).toString('base64url')` — cryptographically strong.

### 1B — Frontend UI: Coach invite panel
**FAIL**

`createInvite()` in `index.html:7960` always reads `inv-name` and explicitly rejects if it is empty (`if (!name) { showToast('Enter the person\'s name first'); return; }`). There is no `type: 'group'` option in the UI. The role tabs (Player / Coach / Admin / Medical) and name field at `index.html:5413–5437` provide no mechanism for a coach to create a group (nameless) invite.

**Consequence:** Group invites can only be created by calling `POST /api/invite` directly (e.g., via curl or the API). There is no way to create one from the coach dashboard.

### 1C — Invite list display of group invites
**FAIL**

`loadInviteList()` at `index.html:8011` determines button visibility with:
```js
const isPending  = inv.status === 'pending';
const isAccepted = inv.status === 'accepted';
```
Group invites have `status: 'active'` — neither `isPending` nor `isAccepted`. So:
- No "Copy link" button is shown
- No "Revoke" button is shown
- The name field is blank (group invites have `name: ''`)
- No usage count is displayed

**Consequence:** After a group invite is created (even via API), it is invisible/unusable in the coach invite list. The coach cannot copy or revoke it. The display shows a nameless row with no action buttons.

### 1D — Hardcoded production URL in invite list copy button
**WARNING**

At `index.html:8049`:
```js
onclick="navigator.clipboard.writeText('https://boitsfort-coachseye-gpt.vercel.app/?inv=${esc(inv.token)}')..."
```
The copy button for `isPending` invites hardcodes the production domain. On a preview deployment, coaches would copy a link pointing to production, not the preview URL. The `inviteUrl()` function in `api/invite.js` correctly uses `x-forwarded-host`, but the frontend ignores the URL returned by the API and reconstructs it manually.

---

## Stage 2: Player Opens Invite URL

### 2A — URL parameter detection
**PASS**

`checkInviteParam()` at `index.html:7689` correctly reads `?inv=`, fetches `GET /api/invite?token=...`, checks `data.valid`, and calls `showInviteModal(data)`. Called after `render()` at `index.html:8097` so modal overlays correctly.

### 2B — GET /api/invite?token validation (backend)
**PASS**

No auth required for token validation (correct — player has no account yet). Returns `type`, `name`, `role`, `status`, `expiresAt`, `usageCount`. Correctly returns 404 for unknown token, 410 for revoked or expired.

### 2C — showInviteModal rendering
**PASS**

Correctly detects `invite.type === 'group'` and conditionally renders separate first/last name fields vs. single pre-filled name field. Button text is "Request to join →" for group, "Join team →" for individual. Email and password fields are present in both cases.

### 2D — URL cleanup on cancel
**WARNING**

If the player dismisses the modal via "Not me — close", `window.history.replaceState({}, '', '/')` is called. But if they refresh before dismissing, `checkInviteParam()` re-runs and re-shows the modal. This is arguably correct behavior (the link should remain usable until the player completes registration), but it may confuse users who navigated away and came back.

---

## Stage 3: Player Submits Registration

### 3A — acceptInvite() group path (frontend)
**PASS**

Correctly detects `isGroup`, reads first/last name from separate fields, validates all four fields with specific error messages, disables button, POSTs `{ action: 'join_group_invite', token, firstName, lastName, email, password }` to `/api/identity`. On success: removes modal, clears URL, clears `_inviteToken`/`_inviteData`, shows toast with player's first name. Does NOT call `applyApprovedIdentityLocally` and does NOT set session state — correct for a pending player.

### 3B — join_group_invite backend action (identity.js)
**PASS**

Routes to `joinViaGroupInvite`, returns `{ ok: true, user, teamMember }` with HTTP 201. No session cookie is set — correct. Error propagation via `sendError` returns structured JSON with `.status`.

### 3C — joinViaGroupInvite logic (_identityStore.js)
**PASS (with caveat — see 3D)**

Validates all five inputs with 400 errors. Checks invite exists (404), is type group (400), not revoked (410), not expired (410). Calls `upsertUserAccount` to create/find user. Creates pending team member with `status: 'pending'`, `inviteToken: token`. Increments `usageCount` and sets `lastUsedAt`. Does NOT mark invite as accepted — invite remains `status: 'active'` and reusable. Returns `{ user: publicUser(user), teamMember: member }` — no session, no profile.

### 3D — Security: password overwrite via group invite
**FAIL**

`joinViaGroupInvite` calls `upsertUserAccount` before checking team membership status. In `upsertUserAccount` (`_identityStore.js:490`), if the email already belongs to an existing user (including the coach), the function calls `ensurePassword(user, password)`, which replaces `passwordAlgo`, `passwordSalt`, and `passwordHash` with the attacker-supplied password. The function then saves the updated user to Redis.

Only after this save does the code check whether the user has `status: 'active'` on the team and throw a 409. The 409 prevents the attacker from being registered, but the coach's password has already been overwritten in Redis.

**Attack vector:** Submit `POST /api/identity { action: 'join_group_invite', token: <valid_group_token>, email: 'simonbdodd@gmail.com', firstName: 'x', lastName: 'x', password: 'attacker_pw' }`. Coach's Redis password hash is replaced. Coach cannot log in with real password.

### 3E — Rate limiting on join_group_invite
**WARNING**

The `login` action enforces `enforceRateLimit('login', ...)` with 5 attempts per 15 minutes. The `join_group_invite` action has no rate limiting. An attacker with a valid group invite token can submit unlimited registration attempts (e.g., dictionary-filling email/password storage, or denial of service against the invite usageCount tracking).

### 3F — Duplicate pending registration handling
**PASS**

If the same email submits again while still pending: `upsertUserAccount` returns the existing user (password updated), team member lookup finds `status: 'pending'`, which falls through all three branches (not `!member`, not `rejected`, not `active`) — the pending member is returned unchanged. No error is thrown. The invite usageCount increments again. This is slightly inconsistent (usageCount overstates unique registrations) but not harmful.

---

## Stage 4: Pending State / Coach Approval

### 4A — Pending player cannot log in
**PASS**

`loginUser` at `_identityStore.js:711` checks `member.status !== 'active'` and throws: `'Waiting for coach approval'` with status 403. The frontend `loginIdentityAccount` catches this and shows the error as a toast. Correct behavior.

### 4B — Pending player appears in coach identity panel
**PASS**

`listIdentityState` calls `listPendingJoinRequests`, which filters `members` for `status === 'pending'` and returns them with user and team data. `GET /api/identity` returns these in `data.pending`. `loadIdentityRequests()` in the frontend populates `_identityPendingRequests` and renders the Pending Requests panel.

### 4C — loadIdentityRequests session handling
**WARNING**

`loadIdentityRequests()` calls `ensureServerSessionForCurrentUser()`, which only checks if an existing session cookie is valid — it does not refresh or prompt for re-login. If the coach's session has expired (30-day TTL, but possible after a long break), the function silently fails and shows: "Could not load join requests. Try Login, then Refresh." This message requires the coach to know to log in first. No redirect, no modal.

### 4D — approveIdentityRequest (frontend)
**PASS**

POSTs `{ action: 'approve', memberId, approvedBy: currentUser()?.id || 'coach-demo' }`. Relies on SameSite=Lax browser behavior to include the session cookie on same-origin requests. No explicit `credentials: 'include'` is set, but same-origin fetches include cookies by default in all modern browsers.

### 4E — approveJoinRequest backend logic
**PASS**

`requireTenantRole(['coach', 'admin'])` is enforced. `assertSameTenant` checks the member belongs to the coach's team. Creates player profile on approval with `legacyPlayerId: user.id`. Saves updated team member and new profile atomically (via `Promise.all`). Returns `{ user, teamMember, playerProfile }`.

### 4F — applyApprovedIdentityLocally (frontend, post-approval)
**PASS**

After approval, `applyApprovedIdentityLocally(data)` correctly:
- Adds user to `state.users` with `role: 'player'`
- Adds player to `state.players` with `userId: user.id`
- Adds `user.id` to `_allowedDmParticipantIds`
- Adds `profile.legacyPlayerId` (which equals `user.id` for group invite approvals) to `_allowedDmParticipantIds`

Correct — approved player's DM conversations will pass the allowlist filter.

### 4G — No notification to player on approval
**WARNING**

There is no email, push notification, or in-app mechanism to notify the player that their account has been approved. The player must poll by attempting to log in. This is a UX gap — a player who registered and was approved may not know to try logging in again.

---

## Stage 5: Approved Player Logs In

### 5A — loginUser succeeds for approved player
**PASS**

After approval, `member.status === 'active'`. `loginUser` verifies password, finds active team member, loads player profile, sets `lastLoginAt`, creates a 30-day session, returns `{ user, teamMember, playerProfile, session }`. Session cookie is set via `Set-Cookie` response header.

### 5B — Frontend login state after login
**PASS**

`loginIdentityAccount()` calls `applyApprovedIdentityLocally(data)`, sets `state.currentUserId = data.user.id`, `state.activeView = 'player'`, `state.activePlayerSection = 'messages'`, `state.selectedChatId = 'coach'`. The `'coach'` sentinel is resolved to the canonical DM ID by `canonicalizePlayerSelectedChat()`. `_serverSessionReadyFor = data.user.id` prevents redundant session checks.

### 5C — syncCurrentPlayerIdentityFromInvites wasted 403 call
**WARNING**

After login, `syncCurrentPlayerIdentityFromInvites()` at `index.html:6044` calls `GET /api/invite` (all invites, no token). This requires `requireTenantRole(['coach', 'admin'])` — a player session returns 403. The function swallows the error silently. For group invite players, even if it received data, the lookup for `inv.status === 'accepted'` would fail because group invites stay `'active'`. This call is a no-op for all group invite players. It runs once per session.

---

## Stage 6: Coach ↔ Player Messaging

### 6A — DM conversation ID consistency
**PASS**

For a group invite player with `user.id = 'user_1234_abc'`:
- Coach side: `createCoachDmConversationRequest` → `resolveMessagingParticipantId(player)` returns `player.id = 'user_1234_abc'` → `dmConvId('coach-demo', 'user_1234_abc')` = `'dm:coach-demo:user_1234_abc'`
- Player side: `playerCoachDmId()` → `dmConvId('coach-demo', me.id)` → `me.id = canonicalPlayerIdForUser(u)` which resolves to `u.playerId = user.id = 'user_1234_abc'` → `'dm:coach-demo:user_1234_abc'`

Both sides produce the same Redis key. ✓

### 6B — DM conversation must be created before player can message
**WARNING**

If the coach has not yet clicked to start a DM with the player, the conversation does not exist in Redis. `requireConversationAccess` returns 404 for the player's first message attempt. From the player's perspective, the Messages screen loads but the DM conversation is missing. They can see Squad and Announcements, but no DM thread until the coach initiates it. No instructional message is shown.

### 6C — Chat API auth checks for player messaging
**PASS**

`requireConversationAccess` checks:
1. Session must exist (`sessionContext?.user?.id`) — enforced since security fixes
2. Conversation must exist (404 if not)
3. `sessionCanWriteConversation` for `send` — player can write to DM if they are a participant

`participantIdsForSession` returns `[user.id, playerProfile.userId, playerProfile.legacyPlayerId]`. For a group invite player, `user.id === playerProfile.userId === playerProfile.legacyPlayerId`. All three resolve to the same ID. The `participants` array in the DM contains `['coach-demo', user.id]`. `actorIds.includes(user.id)` is TRUE. ✓

### 6D — Coach can send first message
**PASS**

Coach creates the DM via `create_conv` (requires `isStaffSession` — enforced). Sends message via `send` action. Message stored in Redis list `app:chat:conv:dm:coach-demo:user_1234_abc:msgs`. Player's `requireConversationAccess` check then succeeds on subsequent access.

---

## Stage 7: Deployment

### 7A — Branch pushed to GitHub
**PASS**

`feature/group-invites-registration` at commit `31a9efba` is pushed to `origin`.

### 7B — Vercel auto-deployment
**FAIL**

No Vercel deployment exists for `feature/group-invites-registration`. The deployment list shows 20 recent deployments, all from `main` or `feature/mission-control-dashboard`. Vercel is not auto-deploying this branch. The most recent READY deployment is `boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app` from `feature/mission-control-dashboard`, which does **not** contain the group invite or security fix changes.

---

## Summary Table

| Stage | Check | Result |
|-------|-------|--------|
| 1A | Backend: POST /api/invite group type | PASS |
| 1B | Frontend: UI to create group invite | **FAIL** |
| 1C | Frontend: Group invite list display | **FAIL** |
| 1D | Frontend: Hardcoded prod URL in copy button | WARNING |
| 2A | URL parameter detection | PASS |
| 2B | GET /api/invite?token validation | PASS |
| 2C | showInviteModal rendering | PASS |
| 2D | URL cleanup on cancel | WARNING |
| 3A | acceptInvite() group path | PASS |
| 3B | join_group_invite action routing | PASS |
| 3C | joinViaGroupInvite logic | PASS |
| 3D | **Security: password overwrite via group invite** | **FAIL** |
| 3E | Rate limiting on join_group_invite | WARNING |
| 3F | Duplicate pending registration | PASS |
| 4A | Pending player blocked from login | PASS |
| 4B | Pending player visible to coach | PASS |
| 4C | Session handling for loadIdentityRequests | WARNING |
| 4D | approveIdentityRequest cookie handling | PASS |
| 4E | approveJoinRequest backend | PASS |
| 4F | applyApprovedIdentityLocally | PASS |
| 4G | No approval notification to player | WARNING |
| 5A | loginUser succeeds for approved player | PASS |
| 5B | Frontend login state after login | PASS |
| 5C | syncCurrentPlayerIdentityFromInvites 403 | WARNING |
| 6A | DM conversation ID consistency | PASS |
| 6B | DM requires coach to initiate first | WARNING |
| 6C | Chat API auth for player messaging | PASS |
| 6D | Coach first message | PASS |
| 7A | Branch pushed to GitHub | PASS |
| 7B | Vercel auto-deployment | **FAIL** |

**PASS: 19 | FAIL: 5 | WARNING: 8**

---

## FAIL Items (Priority Order)

### FAIL-1: No UI to create group invites
The `createInvite()` function blocks on empty name. No type selector exists. Group invites can only be created via direct API call. The entire group invite feature is inaccessible to coaches through the UI.

**File:** `index.html:7960–8010` and `index.html:5413–5437`

### FAIL-2: Group invite list display broken
Active-status group invites show no copy button, no revoke button, blank name, no usage count. Once created, a group invite cannot be managed from the UI at all.

**File:** `index.html:8031–8057`

### FAIL-3: Password overwrite security vulnerability
`joinViaGroupInvite` updates an existing user's password hash before checking team membership. An attacker with a valid group invite token can overwrite the coach's password by submitting the coach's email address.

**File:** `api/_identityStore.js:800–835`

### FAIL-4: No Vercel deployment
`feature/group-invites-registration` exists on GitHub but has never been deployed to Vercel. All code changes are untestable without a deployment.

### FAIL-5: createInvite() sends no type field
Even if a UI toggle were added, `createInvite()` does not pass `type` to the API body. The API defaults to `type: 'individual'` when `type` is absent.

**File:** `index.html:7973–7978`
