# coacheseyeGPT Finished MVP

This is the current coacheseyeGPT coach/player availability MVP, with scheduled browser push notifications for player messaging.

## Main App File

Open or upload:

```text
index.html
```

That file contains the complete single-file prototype.

## What Is Included

- `index.html` - the working coacheseyeGPT MVP app.
- `api/` - Vercel serverless push, scheduling and availability routes backed by Upstash Redis.
- `sw.js` - browser push notification worker and availability response actions.
- `PUSH_NOTIFICATIONS.md` - deployment and test setup instructions.
- `TESTING.md` - demo and workflow checks.
- `KNOWN_ISSUES.md` - current limits and production risks.
- `CHANGELOG.md` - changes made so far.
- `AUTH_NOTES.md` - test accounts and authentication notes.
- `FIREBASE_COLLECTIONS.md` - recommended future Firebase structure.

## Test Accounts

- Coach: configure `LEGACY_COACH_PASSWORD` for temporary legacy coach login; no shared coach PIN is stored in source.
- Simon player: `simon@coachseye.test`, PIN `2222`
- Alexis player: `alexis@coachseye.test`, PIN `3333`

## Notes

The app is linked to Vercel. Add the VAPID, Upstash and cron environment variables described in `PUSH_NOTIFICATIONS.md` before testing live push delivery.

## AI Brain Documentation (dormant intelligence layer)

The **Coach's Eye Intelligence / AI Brain** is a separate, optional, **dormant** layer that sits beside
the Core MVP above. It is not imported by the app, changes no Core behaviour, and runs no AI in
production — it is proven only by the test suite. Start here:

- [`docs/BRAIN_ARCHITECTURE_ATLAS.md`](docs/BRAIN_ARCHITECTURE_ATLAS.md) — repo-level architecture map (the single source of truth for how the Brain is organised internally).
- [`packages/coach-core-adapter/README.md`](packages/coach-core-adapter/README.md) — Core adapter and pipeline-bridge package guide.
- [`packages/brain-decision-planner/README.md`](packages/brain-decision-planner/README.md) — read-only boundary package guide.
