# Firebase Collections Explanation

Recommended Firestore shape for the next real backend step.

## `clubs/{clubId}`

Stores club settings, name, branding and enabled package.

## `clubs/{clubId}/teams/{teamId}`

Stores team details, sport, season and coach access.

## `clubs/{clubId}/players/{playerId}`

Stores player profile, position, attendance percentage, medical flags and linked Firebase Auth user id.

## `clubs/{clubId}/sessions/{sessionId}`

Stores training sessions and games. Example types: `training`, `match`, `medical-check`.

## `clubs/{clubId}/availabilityRequests/{requestId}`

Stores coach-created requests for a session, including sent time, audience and template.

## `clubs/{clubId}/availabilityResponses/{responseId}`

Stores one player response to one request/session. This is what powers coach summary cards.

## `clubs/{clubId}/messageThreads/{threadId}`

Stores coach/player message threads, read states and timestamps.

## `clubs/{clubId}/messageThreads/{threadId}/messages/{messageId}`

Stores each individual message in the thread.

## Push Notifications

The current prototype only records messages in the app. Production should add:

- `users/{uid}/devices/{deviceId}` for push tokens.
- Cloud Function triggered on message creation.
- Firebase Cloud Messaging for web/Android.
- Apple Push Notification service for iOS if shipped as a native app.

