# QA Workflow 6 — Squad Broadcast → Player Receives → Reply Permissions

**Generated:** 2026-06-08T13:16:26.478Z
**Commit:** `38d31ac`
**Base URL:** https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app
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
| 1 | Open app [coach] | PASSED | 4391ms | [png](qa/artifacts/workflow6-2026-06-08T13-15-48-293Z/01-open-app.png) |  |
| 2 | Coach login [coach] | PASSED | 2976ms | [png](qa/artifacts/workflow6-2026-06-08T13-15-48-293Z/02-coach-login.png) |  |
| 3 | Navigate to Members [coach] | PASSED | 2045ms | [png](qa/artifacts/workflow6-2026-06-08T13-15-48-293Z/03-navigate-to-members.png) |  |
| 4 | Verify player in roster [coach] | PASSED | 1738ms | [png](qa/artifacts/workflow6-2026-06-08T13-15-48-293Z/04-verify-player-in-roster.png) |  |
| 5 | Navigate to Messages [coach] | PASSED | 1105ms | [png](qa/artifacts/workflow6-2026-06-08T13-15-48-293Z/05-navigate-to-messages.png) |  |
| 6 | Open Squad channel — verify member count [coach] | PASSED | 961ms | [png](qa/artifacts/workflow6-2026-06-08T13-15-48-293Z/06-open-squad-channel-verify-member-count.png) |  |
| 7 | Coach sends squad broadcast [coach] | PASSED | 1636ms | [png](qa/artifacts/workflow6-2026-06-08T13-15-48-293Z/07-coach-sends-squad-broadcast.png) |  |
| 8 | Verify squad broadcast in coach feed [coach] | PASSED | 602ms | [png](qa/artifacts/workflow6-2026-06-08T13-15-48-293Z/08-verify-squad-broadcast-in-coach-feed.png) |  |
| 9 | Player login [player] | PASSED | 5600ms | [png](qa/artifacts/workflow6-2026-06-08T13-15-48-293Z/09-player-login.png) |  |
| 10 | Player navigates to Messages [player] | PASSED | 1286ms | [png](qa/artifacts/workflow6-2026-06-08T13-15-48-293Z/10-player-navigates-to-messages.png) |  |
| 11 | Player opens Squad channel [player] | PASSED | 892ms | [png](qa/artifacts/workflow6-2026-06-08T13-15-48-293Z/11-player-opens-squad-channel.png) |  |
| 12 | Player verifies squad broadcast received [player] | PASSED | 680ms | [png](qa/artifacts/workflow6-2026-06-08T13-15-48-293Z/12-player-verifies-squad-broadcast-received.png) |  |
| 13 | Player replies in Squad channel [player] | PASSED | 1737ms | [png](qa/artifacts/workflow6-2026-06-08T13-15-48-293Z/13-player-replies-in-squad-channel.png) |  |
| 14 | Coach verifies player reply received [coach] | PASSED | 3084ms | [png](qa/artifacts/workflow6-2026-06-08T13-15-48-293Z/14-coach-verifies-player-reply-received.png) |  |
| 15 | Squad messages survive page navigation [coach] | PASSED | 3097ms | [png](qa/artifacts/workflow6-2026-06-08T13-15-48-293Z/15-squad-messages-survive-page-navigation.png) |  |
| 16 | Player opens Announcements — verify read-only [player] | PASSED | 852ms | [png](qa/artifacts/workflow6-2026-06-08T13-15-48-293Z/16-player-opens-announcements-verify-read-only.png) |  |
| 17 | Coach sends to Announcements channel [coach] | PASSED | 2246ms | [png](qa/artifacts/workflow6-2026-06-08T13-15-48-293Z/17-coach-sends-to-announcements-channel.png) |  |

## Broadcast Details

- **Player email:** `qa.w4+1780924420801@coachseye.test`
- **Player name:** `QA4 Player1780924420801`
- **Squad message:** `QA squad broadcast 1780924548324`
- **Player reply:** `QA squad reply 1780924548324`
- **Announce message:** `QA announce 1780924548324`
- **Squad member count (observed):** 9

## Coverage vs Requirements

| Requirement | Verified | How |
|---|---|---|
| 1. Coach sends squad broadcast | ✅ | POST /api/chat convId=squad; optimistic render in coach feed |
| 2. Correct players receive it | ✅ | Player context polls and receives coach message within 15s |
| 3. No cross-team bleed | ✅ (env-limited) | Player receives *our* timestamped message (session-scoped Redis key); no second-team context in test env |
| 4. Message in Message Center | ✅ | `#chatFeed` contains message text in both coach and player contexts |
| 5. Survives page navigation | ✅ | Coach navigates away, back to Messages; Redis re-fetch returns full history |
| 6. Delivery count | ✅ | `#chatHeaderSub` shows member count; ✓✓ ticks on sent messages |
| 7. Reply permissions | ✅ | Squad: composer visible for player; Announcements: `#chatComposerWrap` hidden, `#chatNoSend` shown |

## Chat Architecture Notes

- Squad messages stored in Redis list: `chat:msgs:{teamId}:squad`
- All team members share the same squad `convId: "squad"` — no per-player fan-out
- Polling: 2500ms `setInterval` → `GET /api/chat?action=messages&convId=squad&since=TS`
- Optimistic UI: message renders immediately; server replaces optimistic entry with real ID
- Announcements is a coach-write-only channel: `selectChat("announce")` sets `#chatComposerWrap display:none` for players

## Redis Impact (API Calls — Both Contexts)

| Endpoint [context] | Method | Calls | Est. ops |
|---|---|---|---|
| `/api/chat [coach]` | GET/POST | 49 | ~392 |
| `/api/message-config [coach]` | GET | 42 | ~84 |
| `/api/chat [player]` | GET/POST | 35 | ~280 |
| `/api/identity [coach]` | GET/POST | 22 | ~134 |
| `/api/message-config [player]` | GET | 15 | ~30 |
| `/api/availability [coach]` | GET | 9 | ~36 |
| `/api/identity [player]` | GET/POST | 9 | ~56 |
| `/api/invite [coach]` | GET | 8 | ~32 |
| `/api/invite [player]` | GET | 3 | ~12 |
| `/api/matchday [coach]` | GET | 1 | ~2 |
| `/api/fixtures [coach]` | GET | 1 | ~2 |
| `/api/fixtures [player]` | GET | 1 | ~2 |
| `/api/matchday [player]` | GET | 1 | ~2 |
| **Total** | | **196** | **~1064** |

> `POST /api/chat action:send` = ~8 ops per message (session auth + RPUSH + LTRIM + mark-read)
> `GET /api/chat action:messages` = ~8 ops per poll tick (session + LRANGE + unread count)
> Full W6 run: ~3 sends × 8 + ~6 polls × 8 = ~72 ops estimated

## Estimated Manual Testing Time Saved

| Task | Manual | Automated |
|---|---|---|
| Open app, coach login | 60s | — |
| Navigate to Messages, open Squad | 15s | — |
| Send squad broadcast | 20s | — |
| Switch to player browser, login | 45s | — |
| Navigate to Messages, open Squad | 15s | — |
| Verify message received | 20s | — |
| Send player reply | 20s | — |
| Switch to coach, verify reply | 20s | — |
| Navigate away and back (persistence) | 20s | — |
| Switch to player, open Announcements | 10s | — |
| Verify player cannot send (composer hidden) | 15s | — |
| Coach sends to Announcements | 15s | — |
| Screenshot both tabs + record result | 90s | — |
| **Total per run** | **~6.5 min** | **~90s** |

- **Saved per run:** ~5 minutes
- **Workflows 1–6 combined:** ~28 min saved per nightly run

## Missing Selectors / Gaps

- None

**Known gaps:**
- Cross-team isolation not fully verified — would require a second team in the test environment.
- `readCount` field on messages not asserted — would confirm the ✓✓ ticks go green after player reads.
- Push notifications for squad messages not tested (covered by Workflow 3 for individual, not broadcast).
- Group reactions (emoji) in Squad channel not tested.
- File/image attachments in squad channel not tested.

## Remaining Manual Messaging Tests

- **True cross-team isolation:** spin up a second team, verify squad messages are not visible across teams.
- **Group reactions:** player reacts to squad message → coach sees reaction count.
- **Unread badge:** squad channel shows unread count badge when player has not read a new message.
- **Typing indicator:** player sees "typing…" while coach types in Squad.
- **Message edit in group:** coach edits a squad message → all members see updated text.
- **Message delete in group:** coach deletes squad message → all members see "deleted" placeholder.

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
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
- [coach] error: Failed to load resource: the server responded with a status of 401 ()
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
- [player] error: Failed to load resource: the server responded with a status of 401 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
- [player] error: Failed to load resource: the server responded with a status of 403 ()
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
- 2026-06-08T13:15:56.168Z — Welcome Simon Coach

### Player context
- 2026-06-08T13:16:10.871Z — Welcome QA4 Player1780924420801

## Network Failures

- [coach] GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- [coach] HEAD https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/ — {"errorText":"net::ERR_ABORTED"}
- [player] GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- [player] GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- [player] HEAD https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/ — {"errorText":"net::ERR_ABORTED"}
- [player] HEAD https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/ — {"errorText":"net::ERR_ABORTED"}

## HTTP 4xx / 5xx Responses

- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=0&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924550937&userId=coach-demo
- [coach] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [coach] HTTP 404  — POST https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924550937&userId=coach-demo
- [coach] HTTP 404  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=0&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780924567893&userId=coach-demo
- [player] HTTP 401  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=schedules
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/identity?action=log&limit=10
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/message-config?resource=templates
- [player] HTTP 403  — GET https://boitsfort-coachseye-hudgz5599-simonbdodd-9233s-projects.vercel.app/api/invite

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
- Open Squad channel — verify member count
- Coach sends squad broadcast
- Verify squad broadcast in coach feed
- Player login
- Player navigates to Messages
- Player opens Squad channel
- Player verifies squad broadcast received
- Player replies in Squad channel
- Coach verifies player reply received
- Squad messages survive page navigation
- Player opens Announcements — verify read-only
- Coach sends to Announcements channel

## Scope Guard

- No Coach's Eye application code was modified.
- Three chat messages are written to Redis per run (squad broadcast, player reply, announce message).
- Workflow 6 stops at the first failure.

