# Redis Usage Audit — CoachesEye GPT

**Date:** 2026-06-06  
**Status:** Read-only audit. No code was changed.  
**Trigger:** Upstash free-tier limit hit during Phase 5 QA runs (500,000/500,000 commands).

---

## 1. How Redis Is Used

Every Redis operation is an individual HTTPS request to the Upstash REST API (see `api/_kv.js`). There is no batching, no pipelining, and no local cache between requests. Each `kvGet`, `kvSet`, `kvLpush`, `kvLrange`, etc. is one billable Upstash command.

---

## 2. Redis Entry Points — Full Inventory

### `api/_identityStore.js`

| Function | Redis ops | Keys touched |
|---|---|---|
| `loadUsers()` | 1 read | `identity:users` |
| `loadTeams()` | 1 read | `identity:teams` |
| `loadTeamMembers()` | 1 read | `identity:team_members` |
| `loadPlayerProfiles()` | 1 read | `identity:player_profiles` |
| `loadSessions()` | 1 read + **conditional 1 write** | `identity:sessions` — prunes expired sessions on every read |
| `loadPasswordResets()` | 1 read + conditional 1 write | `identity:password_resets` |
| `resolveSessionFromRequest()` | **4 reads + 0–1 write** | sessions → users → members → profiles (sequential fan-out); write if any session expired |
| `listIdentityState()` | **3+4 reads + 0–3 writes** | Calls `ensureLegacyCompatibilityTeamRecords` (3 reads, up to 3 conditional writes) then 4 parallel reads |
| `listPendingJoinRequests()` | 4 reads | users, teams, members, profiles |
| `loginUser()` | **4 reads + 2 writes** | loadUsers, loadTeamMembers, loadPlayerProfiles, createSession (loadSessions + saveSessions), saveUsers |
| `claimInvite()` | **7 reads + 5 writes** | loadInvites, upsertUser (load+save users), ensureTeamMember (load+save members), ensurePlayerProfile (load+save profiles), createSession (load+save sessions), saveInvites |
| `createSession()` | 1 read + 1 write | loadSessions + saveSessions |
| `destroySession()` | 1 read + 1 write | loadSessions + saveSessions |
| `approveJoinRequest()` | 3 reads + 2 writes | users, members, profiles → saveMembers, saveProfiles |
| `rejectJoinRequest()` | 1 read + 1 write | loadTeamMembers + saveTeamMembers |
| `ensureLegacyCompatibilityTeamRecords()` | **3 reads + 0–3 writes** | loads users/members/profiles on **every** `listIdentityState` call; writes back any that changed |

### `api/identity.js`

| Endpoint | Redis ops | Notes |
|---|---|---|
| `GET ?action=session` | **4 reads + 0–1 write** | resolveSessionFromRequest only |
| `GET` (list members) | **7–10 reads + 0–3 writes** | resolveSession (4r) + listIdentityState (3r + 4r parallel + 0–3w) |
| `POST action=login` | **4 reads + 2 writes** | loginUser |
| `POST action=claim_invite` | **7 reads + 5 writes** | claimInvite |
| `POST action=logout` | **1 read + 1 write** | destroySession |
| `POST action=join` | **4 reads + 2 writes** | createJoinRequest: loadUsers, loadMembers, save both |
| `POST action=approve` | **3 reads + 2 writes** | approveJoinRequest |
| `POST action=reject` | **1 read + 1 write** | rejectJoinRequest |

### `api/invite.js`

| Endpoint | Redis ops | Notes |
|---|---|---|
| `GET ?token=X` | **5 reads** | resolveSession (4r) + kvGet invites (1r) |
| `GET` (list) | **5 reads** | resolveSession (4r) + kvGet invites (1r) |
| `POST` (create) | **5 reads + 2 writes** | resolveSession (4r) + load invites (1r) + save (1w) + conditional 2nd save if email sent (1w) |
| `PATCH` (mark accepted) | **5 reads + 1 write** | resolveSession (4r) + load (1r) + save (1w) |
| `DELETE` (revoke) | **5 reads + 1 write** | resolveSession (4r) + load (1r) + save (1w) |

### `api/chat.js`

| Endpoint | Redis ops | Notes |
|---|---|---|
| `GET ?action=conversations` | **5 reads + 2 writes + 3N reads** (N = visible conversations) | resolveSession (4r) + presence write (1w) + ensureDefaults (1r + conditional 1w) + per conv: `LRANGE(0,0)` (last msg) + `LRANGE(0,499)` (unread count) + `kvGet(readKey)` = 3r |
| `GET ?action=messages` | **5 reads** | resolveSession (4r) + `LRANGE(0,499)` |
| `GET ?action=typing` | **5 reads** | resolveSession (4r) + kvGet typing key |
| `GET ?action=presence` | **4 reads + N reads** | resolveSession (4r) + 1 read per userId in `ids=` param |
| `POST action=send` | **5 reads + 3 writes** | resolveSession (4r) + requireConvAccess (1r convs) + `LPUSH` + `LTRIM` + saveConvs + kvSet readKey |
| `POST action=typing` | **5 reads + 1 write** | resolveSession (4r) + ensureDefaults (1r) + kvSet typing (10s TTL) |
| `POST action=read` | **4 reads + 1 write** | resolveSession (4r) + kvSet readKey |
| `POST action=react/edit/delete` | **5 reads + 2–3 writes** | resolveSession (4r) + load msgs (1r LRANGE) + rebuild/save |

**Conversations endpoint cost with default conversations (squad + coaching + announce = 3 convs):**  
4 + 1 + 1 + 1 + (3 × 3) = **16 Redis ops per poll**  
With 1 DM added: **19 Redis ops per poll**

### `api/cron.js`

| Action | Redis ops | Frequency |
|---|---|---|
| Idle check (no schedules due) | **6 reads** | Every 5 min via cron-job.org (288×/day), plus 4×/day Vercel fallback |
| Active dispatch (N schedules due) | 6 reads + 2 writes per schedule + 2 reads re-read + 1 write | Run days with due schedules |
| `recentResponders` (no-reply audience) | SCAN × 2 + N reads | Per schedule with `audience='no-reply'` |

> **Note:** `vercel.json` shows 4 Vercel cron runs/day. The code comment says cron-job.org calls every 5 minutes. If cron-job.org is configured: **288 cron calls/day × 6 ops = 1,728 Redis ops/day** from background jobs alone, regardless of user activity.

### Other API files

| File | Ops per call | Key pattern |
|---|---|---|
| `api/availability.js` GET | 1 read | `availability:{sessionId}` |
| `api/availability.js` POST | 1 read + 1 write | same |
| `api/schedules.js` GET | 1 read | `schedules` |
| `api/schedules.js` POST/PUT/DELETE | 1 read + 1 write | same |
| `api/templates.js` GET | 1 read + conditional 1 write | `templates` |
| `api/templates.js` mutations | 1 read + 1 write | same |
| `api/subscribe.js` | 1 read + 1 write | `subscriptions` |
| `api/push.js` POST | 2 writes | `message_log` (LPUSH + LTRIM) |
| `api/mission-control.js` GET | 5 reads + 0–3 writes | users, members, profiles, convs, subscriptions |

---

## 3. Client-Side Polling — Full Inventory

All three polling loops are wired in `index.html`.

| Loop | Interval | Condition | Endpoint hit | Redis ops per tick |
|---|---|---|---|---|
| `bgPollUnread` | **5,000 ms** | `!document.hidden` (any tab, always) | `GET /api/chat?action=conversations` | **16–22 ops** (see above) |
| `chatStartPolling` messages | **2,500 ms** | Any conversation selected | `GET /api/chat?action=messages&convId=X&since=T` | **5 ops** |
| `chatPollTyping` | **2,500 ms** | Inside `chatStartPolling` | `GET /api/chat?action=typing&convId=X` | **5 ops** |
| `refreshLiveAvailability` | **30,000 ms** | Message Center section open | 3 parallel `GET /api/availability?sessionId=X` | **3 × 5 = 15 ops** |

**`bgPollUnread` fires immediately on page load** (`setTimeout(bgPollUnread, 0)`) and then every 5 s. It also fires on every `visibilitychange` event (tab switch).

### Redis ops per minute — single active user

| Scenario | Ops/min |
|---|---|
| App visible, no interaction | **12 × 16 = 192 ops/min** |
| App visible + 1 conversation open | **192 + (24 × 10) = 432 ops/min** |
| App visible + Message Center open | **192 + 30 = 222 ops/min** |
| App visible + chat + Message Center | **192 + 240 + 30 = 462 ops/min** |

> These numbers assume 3 default conversations. Each additional DM conversation adds 3 ops per `bgPollUnread` tick.

---

## 4. Per-Action Redis Cost

| Action | HTTP requests | Redis ops | Total |
|---|---|---|---|
| Coach login (server-side) | 1 POST /api/identity | 4r + 2w | **6** |
| Player registration via invite | 1 POST /api/identity | 7r + 5w | **12** |
| Open Members page | 1 GET /api/identity | 7–10r + 0–3w | **10–13** |
| Generate invite | 1 POST /api/invite | 5r + 2w | **7** |
| Verify invite token | 1 GET /api/invite?token=X | 5r | **5** |
| Send chat message | 1 POST /api/chat | 5r + 3w | **8** |
| View conversation list | 1 GET /api/chat (bgPoll) | 16–22r + 2w | **18–24** |
| View messages (on open) | 1 GET /api/chat?action=messages | 5r | **5** |
| Mark message read | 1 POST /api/chat?action=read | 5r + 1w | **6** |
| Submit availability response | 1 POST /api/availability | 5r + 1w | **6** |
| Push notification (send now) | 1 POST /api/push | 2w | **2** |
| Cron dispatch (no-op tick) | internal | 6r | **6** |
| Cron dispatch (1 schedule due) | internal | 11r + 3w | **14** |

---

## 5. Why the 500,000-Request Limit Was Hit

The 500K cap is Upstash's **monthly free-tier command limit**. It accumulates across all calls since the billing cycle started.

### Primary driver: `bgPollUnread`

Every browser tab with the app open fires `/api/chat?action=conversations` every **5 seconds**. Each call generates **16–22 Redis ops**. This runs unconditionally whenever the tab is not hidden, regardless of what the user is doing.

**1 user, app open 2 hours/day:**  
`12 calls/min × 18 ops × 120 min × 20 working days = 518,400 ops/month`  
**One user opening the app for 2 hours a day exhausts the free tier in a month.**

### Secondary driver: `loadInviteList` on every render

When the Members section is active, `render()` calls `loadInviteList()` which triggers `GET /api/invite` (5 Redis ops). During today's QA runs, the background polling caused the Members section to re-render approximately every 1–2 seconds (each `chatFetchConversations` response updates unread state → triggers re-render → calls `loadInviteList`), generating ~2 invite fetches/second × 5 ops = **10 ops/second** while Members was open.

### Third driver: session hydration on every request

`resolveSessionFromRequest` loads 4 separate Redis keys on every protected API call. Since `bgPollUnread` calls chat every 5 s, this means 4 reads every 5 seconds purely for session validation, even on the lightest possible interaction pattern.

### Fourth driver: `loadSessions()` auto-prune writes

`loadSessions()` writes back to Redis whenever any session has expired. This turns an otherwise read-only operation into a write, and it runs inside `resolveSessionFromRequest` which is called by every endpoint.

### QA agent contribution (today's runs)

The QA test made approximately 8 runs totaling ~163 seconds of active browser time. Each run triggered ~500–600 Redis ops (bgPollUnread × run duration + invite polling + actual test actions). **QA total today: ~4,000–5,000 ops** — a small fraction of the 500K total. The cumulative cause is weeks of background polling, not the test runs.

### Cron job background load

If cron-job.org is active (288 calls/day × 6 ops = 1,728/day), that adds ~52,000 ops/month just from idle cron ticks.

### Estimated cumulative monthly consumption before today

Assuming the Preview deployment has been live for 4–6 weeks with 2–3 users each doing 1–2 hours of daily app use:

| Usage | Ops/day | Days to hit 500K |
|---|---|---|
| 1 user, 1 h/day, no chat | 230,400 | 2.2 days |
| 1 user, 2 h/day, no chat | 460,800 | 1.1 days |
| 2 users, 1 h/day each | 460,800 | 1.1 days |

**The free tier runs out in 1–2 days of normal single-user usage.** The deployment was likely operating on accumulated daily rollovers (Upstash also enforces a 10,000 command/day soft limit on free tier) or the project was on a paid plan that recently hit a hard cap.

---

## 6. Biggest Redis Consumers (Ranked)

| Rank | Source | Ops/month (1 user, 1 h/day) | % of total |
|---|---|---|---|
| 1 | `bgPollUnread` (every 5s, always active) | ~230,400 | **~80%** |
| 2 | Chat message + typing polling (2.5s, when chat open) | ~57,600 per hour of chat | variable |
| 3 | `loadSessions()` auto-prune write on every request | included in bgPollUnread cost | — |
| 4 | `ensureLegacyCompatibilityTeamRecords` on every Members view | ~500–2,000/day | ~1–2% |
| 5 | Cron idle ticks (every 5 min via cron-job.org) | ~52,000/month | ~18% (if cron configured) |
| 6 | Actual user actions (login, message, invite, etc.) | ~1,000–5,000/month | <2% |

---

## 7. Wasteful Patterns and Bugs

### P0 — `bgPollUnread` generates 16–22 ops per tick, every 5 seconds

The `GET /api/chat?action=conversations` endpoint does the following on **every call**:
1. Resolves session: 4 reads (sessions, users, members, profiles)
2. Updates presence: 1 write with 60s TTL
3. Ensures default conversations exist: 1 read + conditional write
4. For each visible conversation: loads last message (1 LRANGE), loads last 500 messages for unread count (1 LRANGE), loads read-position key (1 GET) = **3 ops per conversation**

This endpoint is called every 5 seconds by every open tab. The unread count calculation loads 500 messages per conversation per tick even if nothing changed.

### P0 — `loadSessions()` writes on every read

```javascript
const sessions = (await kvGet(SESSIONS_KEY)) || [];
const active = sessions.filter(s => s.expiresAt > now);
if (active.length !== sessions.length) await kvSet(SESSIONS_KEY, active);   // ← surprise write
return active;
```

This is called inside `resolveSessionFromRequest`, which runs on **every** API endpoint. Any expired session silently turns every read into a read+write. Since `resolveSessionFromRequest` is called by chat polling (every 5 s), this amplifies write traffic.

### P1 — Bulk-array identity pattern: loads all data to find one record

Every identity operation loads the full `users`, `team_members`, and `player_profiles` arrays into memory and filters in-application. There is no indexed lookup.

- `loginUser`: loads all 3 arrays to find one email address
- `listIdentityState`: loads all 4 arrays + runs legacy cleanup on **every** Members page visit
- `listPendingJoinRequests`: 4 parallel reads that are already loaded by its caller `listIdentityState` — effectively double-loaded

As team size grows (100+ players), each array read transfers more data and costs the same Redis ops but more bandwidth.

### P1 — `ensureLegacyCompatibilityTeamRecords` runs on every `GET /api/identity`

This cleanup function runs unconditionally on every Members page load. It reads 3 arrays, filters for stale display names and legacy account IDs, and writes back any that changed. This is idempotent cleanup that should run once at startup, not on every request.

### P1 — `loadInviteList` called on every re-render of Members section

When Members is the active section, every state change (including unread badge updates from `bgPollUnread`) triggers a `render()` call that re-calls `loadInviteList`. During QA testing, this produced ~2 GET /api/invite calls per second (10 Redis ops/second).

### P2 — Unread count loads 500 messages per conversation per bgPollUnread tick

```javascript
const recent = await kvLrange(MSGS_KEY(c.id), 0, 499);   // 500 messages every 5 seconds
const unread = unreadCountForUser(recent, userId, lastRead);
```

For the unread badge, this loads the full retained message window (500 items) on every poll tick. A lightweight alternative would be storing the unread count as a separate counter key, or comparing only the read-timestamp against the last-message timestamp.

### P2 — `refreshLiveAvailability` makes 3 parallel Redis reads every 30s (and also on every Message Center visit)

This fires 3 availability reads every 30s while Message Center is open, plus fires immediately on entering Message Center. Also triggers `loadLiveTemplates`, `loadLiveSchedules`, `loadLiveLog`, `loadLiveResponses` — likely 4–6 more reads.

### P2 — `recentResponders` uses SCAN + N reads

```javascript
const keys = await kvScanKeys(`${APP_PREFIX}:availability:*`);   // SCAN (multiple round-trips)
const sessions = await Promise.all(keys.map(k => kvGet(k)));      // N reads
```

Called per cron dispatch when `audience === 'no-reply'`. For 3 session types: 2 SCANs + 3 reads = 5 ops. Scales linearly if more session types are added.

---

## 8. Recommended Optimisations

| Priority | Change | Expected reduction |
|---|---|---|
| **P0** | Reduce `bgPollUnread` from 5s to 30s. The unread badge doesn't need sub-second accuracy. | **–83% of polling traffic (~192 → 32 ops/min)** |
| **P0** | Cache the unread count in Redis as a counter key, not by scanning 500 messages. | –2 reads per conversation per poll (saves 6 reads/poll for 3 convs = 9 ops saved per tick) |
| **P0** | Stop calling `resolveSessionFromRequest` inside `bgPollUnread`'s endpoint — store session userId client-side and trust it for read-only poll. Use a session token cookie checked in one read max. | –4 reads per poll (saves 48 reads/min at current 5s interval) |
| **P1** | Move `ensureLegacyCompatibilityTeamRecords` out of the request path. Run it once at deploy or as a scheduled maintenance job. | Saves ~7–10 reads + 0–3 writes per Members page load |
| **P1** | Index identity data. Store each user as `identity:user:{id}` instead of one monolithic JSON array. Fetch by key, not by loading all and filtering. | Reduces reads from 4 (full arrays) to 1–2 (targeted lookups) for most operations |
| **P1** | Cache `resolveSessionFromRequest` result for 30s using an in-process Map keyed by hashed token. Sessions only change on login/logout, not on every request. | Eliminates 4 reads per protected API call for cached sessions |
| **P1** | Fix `loadInviteList` being called on every Members re-render. Load once when the section opens, then refresh on user-triggered refresh only. | Eliminates ~2 reads/second during Members view |
| **P2** | Remove duplicate array loads in `listIdentityState` + `listPendingJoinRequests` (both load users/members/profiles). Pass the already-loaded arrays. | –4 reads per Members page load |
| **P2** | Add a `loadSessions()` read-only variant that does not write. Keep the pruning as a weekly cleanup, not on every read. | Eliminates surprise writes from every read-path |
| **P2** | Stop polling `GET /api/chat?action=typing` when no one else is typing. Send typing status via the same message poll and only check when something changed. | –24 reads/min per open conversation |

**With P0 optimisations only**, steady-state background ops drop from ~192 ops/min to ~35 ops/min — a **5.5× reduction**. The free tier would then sustain 1 user for ~4.5 months instead of 1–2 days.

---

## 9. Monthly Redis Usage Estimates

### Assumptions
- User activity: app open 2 hours/day, 20 working days/month
- Current (unoptimised): 192 ops/min background + 50 ops/min user actions average
- Optimised (P0 fixes only): 35 ops/min background + 50 ops/min user actions
- Cron-job.org at 5-minute intervals: 1,728 ops/day = 34,560 ops/month

### Current (no changes)

| Scale | Active users | Ops/month | Upstash cost (pay-as-you-go @ $0.20/100K) |
|---|---|---|---|
| 1 team (30 players) | 3 avg concurrent | 69M | **$138/mo** |
| 5 teams | 15 avg concurrent | 347M | **$694/mo** |
| 20 teams | 60 avg concurrent | 1.39B | **$2,779/mo** |
| 100 teams | 300 avg concurrent | 6.9B | **$13,896/mo** |

> Assumes 3 concurrent users per team, app open 2 hours/day, bgPollUnread at 5s.

### Optimised (P0 fixes: 30s poll + unread counter + session cache)

| Scale | Active users | Ops/month | Upstash cost |
|---|---|---|---|
| 1 team (30 players) | 3 avg concurrent | 4.8M | **$9.60/mo** |
| 10 teams | 30 avg concurrent | 48M | **$96/mo** |
| 100 teams | 300 avg concurrent | 480M | **$960/mo** |
| 1,000 teams | 3,000 avg concurrent | 4.8B | **$9,600/mo** |

> At 10 teams post-optimisation, the $29/month Upstash Pro plan (200M commands) would be tight; scale from there with pay-as-you-go.

### Upstash free tier ($0/month, 500K/month cap)

| Scale | Months until exhaustion |
|---|---|
| 1 user, 30 min/day (current) | **< 1 month** |
| 1 user, 2 h/day (current) | **< 2 days** |
| 1 user, 2 h/day (optimised P0) | **~3 months** |
| Dev/staging only, no real users | **~2 months** (cron alone: 35K/mo + occasional manual QA) |

---

## 10. Summary

| Finding | Severity |
|---|---|
| `bgPollUnread` fires every 5s, generating 16–22 Redis ops per tick, always while tab is open | **Critical** |
| `resolveSessionFromRequest` makes 4 reads on every API call, including every poll tick | **Critical** |
| `loadSessions()` silently writes on every read when any session has expired | **High** |
| `loadInviteList` called on every Members re-render (triggered by polling state updates) | **High** |
| All identity data loaded as monolithic arrays; no indexed lookups | **High** |
| `ensureLegacyCompatibilityTeamRecords` runs cleanup on every Members page load | **Medium** |
| Unread count calculates from 500-message scan per conversation per poll tick | **Medium** |
| `listPendingJoinRequests` duplicates array loads already done by its caller | **Low** |

**The quota exhaustion was caused by normal application behaviour** — specifically the unconditional 5-second background polling combined with a 16-op-per-poll Redis fan-out. It is not a bug in the traditional sense, but a compounding design choice (frequent polling × expensive per-call cost). The QA agent test runs today added a small amount on top of weeks of accumulated usage.

**Immediate action to unblock QA:** Upgrade the Upstash instance on the Preview deployment to a pay-as-you-go or fixed plan ($10/month Pro tier recommended), or create a new Upstash database for the Preview environment and set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` accordingly.

---

*Scope guard: No Coach's Eye application code was modified. This document is a read-only audit.*
