# QA Workflow 5 — Coach ↔ Player Messaging

**Generated:** 2026-06-08T09:18:55.869Z
**Commit:** `290dc64`
**Base URL:** https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app
**Login method (coach):** dev-login-evaluate
**Player credentials from:** qa/results/workflow-4.json (auto-read from W4 pass)
**Status:** PASSED

---

## Result

- **Overall:** ✅ PASS
- **First failure:** none



## Steps

| # | Step | Status | Duration | Screenshot | Notes |
|---|---|---|---|---|---|
| 1 | Open app [coach] | PASSED | 3362ms | [png](qa/artifacts/workflow5-2026-06-08T09-18-22-717Z/01-open-app.png) |  |
| 2 | Coach login [coach] | PASSED | 2895ms | [png](qa/artifacts/workflow5-2026-06-08T09-18-22-717Z/02-coach-login.png) |  |
| 3 | Navigate to Members [coach] | PASSED | 1384ms | [png](qa/artifacts/workflow5-2026-06-08T09-18-22-717Z/03-navigate-to-members.png) |  |
| 4 | Verify player in roster [coach] | PASSED | 1275ms | [png](qa/artifacts/workflow5-2026-06-08T09-18-22-717Z/04-verify-player-in-roster.png) |  |
| 5 | Navigate to Messages [coach] | PASSED | 972ms | [png](qa/artifacts/workflow5-2026-06-08T09-18-22-717Z/05-navigate-to-messages.png) |  |
| 6 | Open player DM [coach] | PASSED | 3982ms | [png](qa/artifacts/workflow5-2026-06-08T09-18-22-717Z/06-open-player-dm.png) |  |
| 7 | Send coach message [coach] | PASSED | 861ms | [png](qa/artifacts/workflow5-2026-06-08T09-18-22-717Z/07-send-coach-message.png) |  |
| 8 | Verify coach message in feed [coach] | PASSED | 609ms | [png](qa/artifacts/workflow5-2026-06-08T09-18-22-717Z/08-verify-coach-message-in-feed.png) |  |
| 9 | Player login [player] | PASSED | 4507ms | [png](qa/artifacts/workflow5-2026-06-08T09-18-22-717Z/09-player-login.png) |  |
| 10 | Player navigates to Messages [player] | PASSED | 832ms | [png](qa/artifacts/workflow5-2026-06-08T09-18-22-717Z/10-player-navigates-to-messages.png) |  |
| 11 | Player opens Coach DM [player] | PASSED | 786ms | [png](qa/artifacts/workflow5-2026-06-08T09-18-22-717Z/11-player-opens-coach-dm.png) |  |
| 12 | Player verifies coach message [player] | PASSED | 1088ms | [png](qa/artifacts/workflow5-2026-06-08T09-18-22-717Z/12-player-verifies-coach-message.png) |  |
| 13 | Player sends reply [player] | PASSED | 1312ms | [png](qa/artifacts/workflow5-2026-06-08T09-18-22-717Z/13-player-sends-reply.png) |  |
| 14 | Coach verifies player reply [coach] | PASSED | 2413ms | [png](qa/artifacts/workflow5-2026-06-08T09-18-22-717Z/14-coach-verifies-player-reply.png) |  |

## Messaging Details

- **Player email:** `qa.w4+1780909306779@coachseye.test`
- **Player name:** `QA4 Player1780909306779`
- **Coach message:** `QA coach msg 1780910302720`
- **Player reply:** `QA player reply 1780910302720`

## Browser Contexts

- **Coach context:** standard Playwright `page` fixture — steps 1–7, 13
- **Player context:** fresh `browser.newContext()` — steps 8–12; isolated from coach session

## Chat Architecture Notes

- Messages are persisted via `POST /api/chat { action:"send" }` → stored in Redis list (`chat:msgs:{convId}`)
- Recipients receive messages via a 2500ms `setInterval` poll (`chatFetchMessages(convId, since)` → `GET /api/chat?action=messages&since=TS`)
- Sent messages render **optimistically** in the sender's feed immediately (before API ack)
- DM conversation ID: `dmConvId(coachId, participantId)` — sorts IDs alphabetically → `dm:a:b`
- Player always defaults to Coach DM via `canonicalizePlayerSelectedChat()` → `playerCoachDmId()`

## Redis Impact (API Calls — Both Contexts)

| Endpoint [context] | Method | Calls | Est. ops |
|---|---|---|---|
| `/api/chat [coach]` | GET/POST | 42 | ~336 |
| `/api/chat [player]` | GET/POST | 24 | ~192 |
| `/api/templates [coach]` | GET | 20 | ~40 |
| `/api/identity [coach]` | GET/POST | 18 | ~110 |
| `/api/schedules [coach]` | GET | 10 | ~20 |
| `/api/templates [player]` | GET | 10 | ~20 |
| `/api/identity [player]` | GET/POST | 9 | ~56 |
| `/api/availability [coach]` | GET | 6 | ~24 |
| `/api/invite [coach]` | GET | 5 | ~20 |
| `/api/schedules [player]` | GET | 5 | ~10 |
| `/api/invite [player]` | GET | 3 | ~12 |
| **Total** | | **152** | **~840** |

> `POST /api/chat action:send` = ~8 ops (session auth + Redis RPUSH + LTRIM + mark-read)
> `GET /api/chat action:messages` = ~8 ops per poll tick (session + LRANGE + unread)
> Full W5 run: ~4 polls each context × 8 ops + 2 sends × 8 ops = ~80 ops estimated

## Estimated Manual Testing Time Saved

| Task | Manual | Automated |
|---|---|---|
| Open app, coach login | 60s | — |
| Navigate to Members, verify player in roster | 20s | — |
| Navigate to Messages | 10s | — |
| Find player in contact list, open DM | 15s | — |
| Type + send timestamped message | 20s | — |
| Open incognito / second browser | 15s | — |
| Player login | 30s | — |
| Player navigate to Messages | 10s | — |
| Player verify coach message visible | 15s | — |
| Player type + send reply | 20s | — |
| Switch to coach tab, verify reply | 20s | — |
| Screenshot both tabs + record result | 90s | — |
| **Total per run** | **~5.5 min** | **~90s** |

- **Saved per run:** ~4 minutes
- **At 2 runs/day:** ~8 min/day = **~40 min/week**
- **Workflows 1–5 combined:** ~23 min saved per full nightly run

## Missing Selectors / Test Hooks Needed

- None

**Known gaps:**
- No `data-msgid` on `.chat-bubble-wrap` rows — already present on `.chat-bubble` via `data-msgid="${m.id}"` but not verified here.
- Push notification delivery not tested — covered by Workflow 6 (API-layer only).
- Coach message-read receipts not verified — `chatMarkRead()` is called but read state not asserted.
- Group chat messaging not tested (squad, coaching, announcements) — only coach–player DM.
- Message edit + delete flows not tested.
- File/media attachments not tested (`mediaUrl`, `mediaType` in send payload).

## Remaining Manual Messaging Tests

- **Group chat (Squad):** coach sends broadcast → multiple players receive it
- **Announcements:** coach posts to announcements channel → players see it (player cannot reply)
- **Message reactions:** player reacts with emoji → coach sees reaction count
- **Message edit:** coach edits sent message → player sees updated text
- **Message delete:** player deletes their own message → coach sees deletion
- **Read receipts:** coach sees when player has read the message
- **File attachments:** coach sends image → player receives and can view
- **Reply quoting:** player replies to a specific message (reply-quote UI)
- **Typing indicators:** one side sees "typing…" while other types

## Console Errors & Warnings

- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [coach] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 404 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()

## Toast Messages

### Coach context
- 2026-06-08T09:18:33.268Z — Welcome Simon Coach

### Player context
- 2026-06-08T09:18:48.462Z — Welcome QA4 Player1780909306779

## Network Failures

- [coach] GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- [coach] HEAD https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/ — {"errorText":"net::ERR_ABORTED"}
- [player] GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- [player] HEAD https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/ — {"errorText":"net::ERR_ABORTED"}

## HTTP 4xx / 5xx Responses

- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=0&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/schedules
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/schedules
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780910308905&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — POST https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat
- [coach] HTTP 404  — POST https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat
- [coach] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=dm%3Acoach-demo%3Auser_1780909328552_phxcyz&since=0&userId=coach-demo
- [coach] HTTP 404  — POST https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat
- [coach] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780910308905&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=dm%3Acoach-demo%3Auser_1780909328552_phxcyz&since=0&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=0&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/schedules
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/schedules
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780910325597&userId=coach-demo
- [player] HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/invite
- [player] HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [player] HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/schedules
- [player] HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/invite
- [player] HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [player] HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/schedules
- [player] HTTP 404  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=user_1780909328552_phxcyz
- [player] HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [player] HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/schedules
- [player] HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [player] HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates
- [player] HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/invite
- [player] HTTP 403  — GET https://boitsfort-coachseye-ovqxxne9r-simonbdodd-9233s-projects.vercel.app/api/templates

## Page Errors

### Coach context
- None

### Player context
- None

## What Passes

- Open app
- Coach login
- Navigate to Members
- Verify player in roster
- Navigate to Messages
- Open player DM
- Send coach message
- Verify coach message in feed
- Player login
- Player navigates to Messages
- Player opens Coach DM
- Player verifies coach message
- Player sends reply
- Coach verifies player reply

## Scope Guard

- No Coach's Eye application code was modified.
- Two chat messages are written to Redis per run (one coach, one player reply).
- Workflow 5 stops at the first failure.

