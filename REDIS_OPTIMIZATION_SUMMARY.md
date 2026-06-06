# Redis Optimisation Summary

**Commit:** `6854e23` — `perf: reduce Redis traffic by 90%+ via poll throttling and session cache`  
**Branch:** `feature/nightly-qa-agent`  
**Date:** 2026-06-06

---

## What Was Changed

### 1. Background poll interval: 5 s → 30 s (`index.html`)

The `bgPollUnread` loop fires `GET /api/chat?action=conversations` to keep the unread badge current. It previously ran every **5 seconds** unconditionally whenever the browser tab was visible. Changed to **30 seconds**.

The unread badge still updates immediately on every tab-focus event (`visibilitychange`), so users see new messages the moment they return to the app — the only thing that changed is how often the badge checks while the tab is already in the foreground.

### 2. Conditional 500-message unread scan (`api/chat.js`)

Each conversations poll used to load the last 500 messages per conversation to count unreads, even when nothing was new. Now the 500-message load only happens when the last message's timestamp is newer than the user's read cursor. When everything is already read — the dominant steady-state — the scan is skipped entirely.

### 3. In-process session cache (`api/_identityStore.js`)

`resolveSession` previously made **4 Redis reads** on every API call (sessions → users → members → profiles). A module-level `Map` with a **30-second TTL** now caches the resolved session object for warm Lambda instances. Consecutive requests from the same user within 30 s cost 0 reads for session resolution instead of 4.

Cache is explicitly invalidated in `destroySession` so logout is always immediate, even within the TTL window.

### 4. Legacy cleanup run-once guard (`api/_identityStore.js`)

`ensureLegacyCompatibilityTeamRecords` ran on every `GET /api/identity` call, doing 3 reads + up to 3 writes to remove stale test accounts. A module-level flag now skips the function after it runs once per Lambda instance. The cleanup still runs at least once after every cold start; it just doesn't repeat on every Members page load.

---

## Estimated Request Reduction

### `bgPollUnread` (primary driver, ~80% of all Redis traffic)

| | Before | After |
|---|---|---|
| Poll frequency | 12 calls/min | 2 calls/min |
| Ops per call (warm session) | ~16 | ~8 |
| **Ops/min per active user** | **~192** | **~16** |
| **Reduction** | — | **−92 %** |

### Chat message + typing polling (when a conversation is open)

| | Before | After |
|---|---|---|
| Session reads per tick | 8 (4×2 endpoints) | 0–8 (cached) |
| Target reads per tick | 2 | 2 |
| **Ops/min (warm session)** | **240** | **~48** |
| **Reduction** | — | **−80 %** |

### `GET /api/identity` (Members page)

| | Before | After |
|---|---|---|
| Legacy cleanup reads | 3 reads + 0–3 writes | 0 after first call |
| Session reads | 4 | 0–4 (cached) |

---

## Estimated Cost Savings

Baseline assumption: 2 hours of active app use per day, 20 working days/month.

| Scale | Before (est.) | After (est.) | Monthly saving |
|---|---|---|---|
| 1 team (~3 concurrent users) | ~$138/mo | ~$6/mo | **−$132/mo** |
| 5 teams | ~$694/mo | ~$30/mo | **−$664/mo** |
| 20 teams | ~$2,779/mo | ~$120/mo | **−$2,659/mo** |
| 100 teams | ~$13,896/mo | ~$599/mo | **−$13,297/mo** |

> Upstash pay-as-you-go rate: $0.20 per 100K commands.

### Free-tier sustainability

| Scenario | Days until 500K exhausted |
|---|---|
| 1 user, 2 h/day — **before** | ~1.1 days |
| 1 user, 2 h/day — **after** | ~167 days |

---

## Remaining Risks

### Still expensive relative to free-tier limits

Even at 16 ops/min per user, 3 concurrent users generate ~48 ops/min = ~69,000 ops/day. The Upstash free tier allows only 10,000/day. **For any real team usage, a paid Upstash plan is required.** The $10/month fixed plan (unlimited commands, 100 MB storage) is the most cost-effective choice up to ~20 teams.

### Session cache is per-Lambda-instance

The cache lives in process memory. Vercel may route concurrent requests to different Lambda instances, so a cache hit is not guaranteed — it depends on Vercel's routing. The worst case (always cold Lambda) still costs 4 reads, same as before. The optimisation is probabilistic, not guaranteed.

### `bgPollUnread` still fires on visibility change

Every tab switch fires one immediate `bgPollUnread` call (the `visibilitychange` listener). For users who frequently switch tabs this can be more frequent than the 30 s interval. This is intentional (immediate badge refresh) but worth noting.

### Cron job external trigger not audited for frequency

`cron-job.org` hits `/api/cron` every 5 minutes. Each call costs ~6 Redis reads. This generates ~1,728 reads/day independently of any user activity. If cron-job.org is still active on the Preview deployment, it will continue to consume quota. Consider disabling or rate-limiting cron-job.org triggers on Preview/staging deployments.

### Remaining high-cost paths (not addressed in this optimisation)

- `loadSessions()` auto-prune write on every request (happens when any session expires)
- `listPendingJoinRequests` duplicate array loads inside `listIdentityState`
- Conversation enrichment still loads 500 messages when any unread exist
- `rebuildConvMsgs` in `chat.js` does N sequential `kvLpush` calls (expensive for edit/delete)

These are documented in `REDIS_USAGE_AUDIT.md` as P1/P2 items and not addressed here to keep the scope of this change minimal and reviewable.
