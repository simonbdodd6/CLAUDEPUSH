# Coach's Eye Real Workflow MVP Changelog

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
