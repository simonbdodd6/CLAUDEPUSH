# Coach's Eye Real MVP Known Issues

## Current Prototype Limits

1. Firebase is not wired into this single-file MVP yet. The app uses browser storage with a backup copy and revision checks. This is now safer for demos, but real team use needs Firestore.
2. Authentication is still mock authentication. The role separation is enforced in the UI logic, but production must use Firebase Auth or another proper identity provider.
3. Multi-tab sync is local-browser only. It detects newer saved revisions across tabs on the same browser, but it does not sync between different devices yet.
4. Player notifications are in-app mock notifications. No push notification service, WhatsApp, SMS or email is connected.
5. Conflict resolution is last-newer-revision-wins. In Firestore, this should become per-document saves with server timestamps to prevent one coach overwriting another coach's unrelated edits.
6. Message delivery/read receipts are prototype fields. They persist locally, but they are not backed by device-level delivery events.
7. Long-term storage for videos, PDFs and media is outside this single-file MVP and should be handled by cloud object storage.

## Firebase Build Recommendation

Use separate Firestore documents for:

- `clubs/{clubId}`
- `clubs/{clubId}/players/{playerId}`
- `clubs/{clubId}/sessions/{sessionId}`
- `clubs/{clubId}/sessions/{sessionId}/responses/{playerId}`
- `clubs/{clubId}/messages/{messageId}`
- `clubs/{clubId}/messageThreads/{threadId}`

That structure avoids saving the entire app as one large object and reduces accidental overwrites.

