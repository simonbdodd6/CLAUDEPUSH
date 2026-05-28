# coacheseyeGPT Real Workflow MVP Changelog

## 2026-05-28 - Rename to coacheseyeGPT

- Renamed the visible product branding to `coacheseyeGPT` across the app shell, browser title, PWA manifest, notification fallbacks and project docs.
- Kept the existing Vercel project URL and backend storage keys stable so deployed invites, push subscriptions and Redis data continue working.

## 2026-05-28 - Messaging Command Centre v2

- Added a new coacheseyeGPT messaging command centre as a cleaner alternative to the earlier WhatsApp-style flow.
- Kept the existing push notification backend, Redis schedules, templates, delivery log and availability reply system.
- Reworked the Message Center into a scalable coach workflow: session audience, live response board, send-now panel, device status, automation builder and delivery history.
- Added colour-coded player availability groups: available, unavailable/maybe and no reply.
- Fixed no-reply targeting so the coach chases players based on the currently selected session instead of only the matchday status.
- Preserved typed automation drafts when switching schedule days or audience segments.
- Refreshed async notification panels after live availability sync so replies, schedules, templates and logs stay visible after a refresh.

## 2026-05-27 - Push Messaging Build

- Replaced the remaining Matchday WhatsApp action with a coacheseyeGPT notification action.
- Completed Vercel serverless API routes for subscriptions, templates, schedules, availability replies, logs, manual push sends and cron delivery.
- Added Upstash Redis storage under configurable `app:` keys with read fallback for earlier `ce:` pilot data.
- Fixed scheduled chase-up messages so `No-reply only` is saved and respected at delivery time.
- Added personalized Web Push messages, notification response actions and service-worker response saving.
- Removed the hard-coded browser push key; the public VAPID key is now supplied safely from `/api/config`.
- Added expired-device cleanup, send logs, cron authentication and safer `lastSentAt` schedule updates.
- Added `PUSH_NOTIFICATIONS.md`, `.env.example`, app icon, and automated backend tests.

## 2026-05-21

- Created a safe new build file: `coach-eye-real-mvp.html`.
- Added lightweight mock authentication with coach and player roles.
- Added persistent test accounts for coach and player demo flows.
- Locked player accounts to their own player profile and Player View.
- Kept Coach View available only to coach accounts.
- Added persistent availability request records.
- Added coach action buttons to send availability requests for each session.
- Added player availability responses that persist after browser refresh.
- Added player response messages back to the coach inbox.
- Added unread player response count to the coach dashboard.
- Preserved existing sections: Overview, Message Center, Training, Matchday Center, Medical, Players and player-facing pages.
- Added comments where Firebase Auth, Firestore, and push notification logic should replace the local prototype layer.

## 2026-05-22

- Audited the coach/player availability workflow for stale state, duplicate responses, failed saves and refresh persistence.
- Added safer local save/load recovery: corrupt primary browser state now falls back to the backup copy instead of resetting the app.
- Added save revision metadata so each save records who saved, when it saved and which revision is current.
- Added multi-tab sync protection so an older browser tab does not silently overwrite a newer tab's saved state.
- Changed availability responses to update one existing coach inbox message per player/session instead of creating duplicates.
- Added coach-only guards to medical check-in requests and coach inbox mark-read actions.
- Added player reply ownership checks so a player can only reply to their own messages or squad messages.
- Added blank message protection for coach-sent in-app messages.
- Added `TESTING.md` and `KNOWN_ISSUES.md` for demo verification and remaining production risks.
