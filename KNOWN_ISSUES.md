# coacheseyeGPT Real MVP Known Issues

## Current Prototype Limits

1. Core push subscriptions, schedules, availability responses and send history now persist in Upstash Redis. Some wider app content still uses browser storage with a backup copy; moving all team data to a database is the next production step.
2. Authentication is still mock authentication. The role separation is enforced in the UI logic, but production must use Firebase Auth or another proper identity provider.
3. Multi-tab sync is local-browser only for non-message app data. Upstash-backed push availability replies are visible across devices after Message Center refresh.
4. Browser Web Push is implemented but only becomes live after VAPID keys and Upstash settings are added on Vercel and each player enables notifications on their device.
5. Conflict resolution is last-newer-revision-wins. In Firestore, this should become per-document saves with server timestamps to prevent one coach overwriting another coach's unrelated edits.
6. Push sends are logged with sent/failed counts. Full read receipts remain prototype fields because standard Web Push does not prove that a player read a notification.
7. `LOCAL_TZ_OFFSET` must be changed between Belgium summer (`2`) and winter (`1`) unless a future release adds automatic timezone handling.
8. Long-term storage for videos, PDFs and media is outside this single-file MVP and should be handled by cloud object storage.
9. The API routes follow the requested lightweight prototype model. Before accepting real club data, coach-only send/template endpoints should be protected by real authentication and club roles.

## Firebase Build Recommendation

Use separate Firestore documents for:

- `clubs/{clubId}`
- `clubs/{clubId}/players/{playerId}`
- `clubs/{clubId}/sessions/{sessionId}`
- `clubs/{clubId}/sessions/{sessionId}/responses/{playerId}`
- `clubs/{clubId}/messages/{messageId}`
- `clubs/{clubId}/messageThreads/{threadId}`

That structure avoids saving the entire app as one large object and reduces accidental overwrites.
