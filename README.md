# Coach's Eye Finished MVP

This is the current Coach's Eye coach/player availability MVP, with scheduled browser push notifications for player messaging.

## Main App File

Open or upload:

```text
index.html
```

That file contains the complete single-file prototype.

## What Is Included

- `index.html` - the working Coach's Eye MVP app.
- `api/` - Vercel serverless push, scheduling and availability routes backed by Upstash Redis.
- `sw.js` - browser push notification worker and availability response actions.
- `PUSH_NOTIFICATIONS.md` - deployment and test setup instructions.
- `TESTING.md` - demo and workflow checks.
- `KNOWN_ISSUES.md` - current limits and production risks.
- `CHANGELOG.md` - changes made so far.
- `AUTH_NOTES.md` - test accounts and authentication notes.
- `FIREBASE_COLLECTIONS.md` - recommended future Firebase structure.

## Test Accounts

- Coach: `coach@coachseye.test`, PIN `1111`
- Simon player: `simon@coachseye.test`, PIN `2222`
- Alexis player: `alexis@coachseye.test`, PIN `3333`

## Notes

The app is linked to Vercel. Add the VAPID, Upstash and cron environment variables described in `PUSH_NOTIFICATIONS.md` before testing live push delivery.
