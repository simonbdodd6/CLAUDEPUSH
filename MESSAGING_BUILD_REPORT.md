# WhatsApp Messaging System — Build Report

## What Was Built

A complete WhatsApp-style real-time messaging system integrated into the existing Coachs Eye single-file PWA.

## Files Created

- **`api/chat.js`** — Unified chat REST API. Handles: list conversations, fetch paginated messages, send message, emoji reactions, typing indicators, read receipts, edit message, delete message, create conversation. Backed by Upstash Redis.

- **`MESSAGING_BUILD_REPORT.md`** — This file.

## Files Modified

- **`index.html`** — ~900 lines of new/replaced code:
  - **CSS**: Replaced old basic chat styles with full WhatsApp-quality layout. New classes: `.chat-shell`, `.chat-list`, `.chat-contact`, `.chat-avatar` (with online dot), `.chat-bubble-wrap` (mine/theirs), `.chat-bubble` (with tails, reactions, reply quote), `.chat-composer` (rounded input bar), `.chat-typing-bar`, `.chat-ctx-menu`, `.emoji-quick-picker`, `.chat-scroll-btn`, `.chat-unread-divider`
  - **JS**: Replaced `renderChatSurface()` and all associated functions with the new WhatsApp system (see function list below)

## New JavaScript Functions

| Function | Purpose |
|---|---|
| `chatAvatarEl()` | Renders avatar with optional online green dot |
| `chatFormatTime()` | Smart time: "now", "5m", "10:42", "Yesterday", "28 May" |
| `chatFormatMsgTime()` | HH:MM for bubble footer |
| `chatDateLabel()` | "Today" / "Yesterday" / full date for dividers |
| `chatBuildContacts()` | Builds conversation list for coach or player mode |
| `chatFetchMessages()` | GET /api/chat?action=messages — loads from Redis |
| `chatFetchConversations()` | GET /api/chat?action=conversations — enriches list |
| `chatPollTyping()` | Polls typing indicators every 2.5s |
| `chatOnKeyInput()` | Handles typing events + Enter-to-send + auto-resize |
| `chatSendMessage()` | Optimistic UI send + Redis persist |
| `chatReact()` | Toggle emoji reaction via API |
| `chatSetReply()` | Sets reply-to quote in composer |
| `chatDeleteMsg()` | Soft-delete message for everyone |
| `showMsgContextMenu()` | Right-click / long-press context menu |
| `showEmojiQuickPick()` | 8-emoji quick reaction picker |
| `chatMarkRead()` | Marks conversation as read in Redis |
| `selectChat()` | Opens a conversation, loads messages, starts polling |
| `chatGoBack()` | Mobile: return to contact list |
| `chatStartPolling()` | 2.5s interval poll for new messages + typing |
| `chatStopPolling()` | Stops poll timer when leaving Messages section |
| `chatScrollToBottom()` | Smooth or instant scroll to latest message |
| `chatOnFeedScroll()` | Shows/hides "scroll to bottom" button |
| `chatRenderContactList()` | Re-renders left panel only (no full re-render) |
| `chatRenderMessages()` | Re-renders message feed only |
| `chatBubbleHtml()` | Generates a single bubble: reply quote, reactions, ticks, metadata |
| `renderCoachMessages()` | Coach Messages section entry point |
| `renderPlayerMessages()` | Player Messages section entry point |
| `renderChatShell()` | Builds the full two-panel HTML |

## Redis Key Scheme

```
{APP_PREFIX}:chat:convs                    — JSON array of all conversations
{APP_PREFIX}:chat:conv:{id}                — conversation metadata
{APP_PREFIX}:chat:conv:{id}:msgs           — Redis list (LPUSH, newest first, max 500)
{APP_PREFIX}:chat:conv:{id}:typing         — [{ userId, userName, ts }] with 10s TTL
{APP_PREFIX}:chat:read:{convId}:{userId}   — last-read timestamp
{APP_PREFIX}:chat:presence:{userId}        — { userId, ts } with 60s TTL
```

## Default Conversations (auto-created on first use)

| ID | Name | Type |
|---|---|---|
| `squad` | Squad | GROUP |
| `coaching` | Coaching Team | GROUP |
| `announce` | Announcements | ANNOUNCEMENT (coaches send, players react) |
| `dm:{playerId}` | Direct messages | DIRECT (built from player list) |

## Architecture Decision: Polling vs WebSockets

The app runs on **Vercel Serverless Functions** which are stateless and do not support persistent WebSocket connections. Socket.io requires a persistent server. Instead:

- Messages are persisted in **Upstash Redis** (already in use)
- Clients **poll `/api/chat`** every 2.5 seconds when a conversation is open
- Typing indicators poll the same interval
- For a rugby club of 20–100 users this is invisible — messages appear within 2-3 seconds

To upgrade to true WebSockets in future: deploy a Socket.io server on Railway/Render and replace the polling loop with `socket.on('new_message', ...)`.

## How Automated Messages Flow

1. Coach schedules message in Message Centre
2. Cron fires → `api/reminder.js` or `api/cron.js` runs
3. To deliver to chat: call `POST /api/chat` with `{ action:'send', isAutomated:true, convId:'squad', ... }`
4. Message appears in Squad chat with 🤖 badge
5. Players see it next poll cycle (≤2.5s)

## Environment Variables Needed

Already configured (same as rest of app):
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `APP_KEY_PREFIX` (optional, defaults to `app`)

## How to Test

1. Open app as Simon (Coach) → go to Messages → open Squad chat → send a message
2. Open incognito tab → accept player invite → go to Messages → should see message within 3s
3. Reply from player → coach sees it within 3s
4. Right-click a message → context menu with Reply / React / Copy / Delete
5. React with emoji → appears below bubble for both users
6. Mobile: open Messages → tap a conversation → full screen chat → back button returns to list

## Known Limitations

- No voice notes (future)
- No video/file upload (images via URL paste work in text)
- No link preview cards (future)
- No end-to-end encryption (plain text in Redis)
- Reactions require a full API round-trip (no optimistic UI for reactions)
- Message history limited to 500 messages per conversation

## Next Steps to Production

1. Add media upload: `POST /api/upload` → Cloudinary/S3, return URL, embed in message
2. Add push notification on new message (infrastructure already exists in `api/push.js`)
3. Migrate automated Message Centre deliveries to also write to `squad` conv in Redis
4. Add conversation search (GET `/api/chat?action=search&q=...`)
5. Optional: migrate to WebSockets by adding a Socket.io server on Railway
