# Travel App API (M23.0 Phase 3)

The thin HTTP API a future iPhone app points at. Every endpoint delegates to a
frozen Platform V2 module through `createTravelApi` — no platform changes, no
duplicated logic. Auth is a bearer session token (`Authorization: Bearer <token>`)
issued by `POST /auth/apple`.

Run locally: `PORT=8787 TRAVEL_STORE_DIR=./.travel-data node travel-app/api/server.js`

Configuration + deployment (env vars, Apple Sign In setup, Postgres seam): see
[DEPLOYMENT.md](./DEPLOYMENT.md) and [.env.example](./.env.example).

## Endpoints

| Method | Path | Body | Returns | Platform module(s) |
|---|---|---|---|---|
| GET | `/health` (`/healthz`) | — | `{ status, env, time, checks }` (200 ready / 503 store down) | composition — liveness + readiness probe, unauthenticated |
| POST | `/auth/apple` | `{ identityToken, displayName? }` | `{ token, traveller, expiresAt }` | auth → identity-platform + traveller-identity port + session |
| GET | `/today` | — | `{ traveller, currentTrip, recentTimeline }` | identity port, trip-platform, timeline |
| GET | `/trip` | — | `{ trip }` | trip-platform |
| PUT | `/trip` | trip fields (`tripName, country, destination, area, startDate, endDate`) | `{ trip }` | trip-platform (publishes timeline + graph) |
| GET | `/itinerary` | — | `{ itinerary }` | itinerary-platform |
| PUT | `/itinerary` | `{ days?, day?, section?, block? }` | `{ itinerary }` | itinerary-platform (publishes timeline + graph) |
| POST | `/capture` | `{ note?, photoRef?, day?, timestamp? }` (note **or** photoRef required) | `{ capture: Entry }` | timeline (journal_entry / photo_imported) |
| GET | `/timeline` | — | `{ days: [Day] }` | timeline-platform |

### Consumer DTOs (M23.3)

The app never sees raw platform records. `/timeline` and `/capture` return
clean, app-facing shapes (no `sourceEntityId` / `sourcePlatform` /
`idempotencyKey` / `eventName` / `sequence` / `metadata` / `eventType`):

```
Day   = { date: "2026-07-11", title: "Saturday, 11 July 2026", entries: [Entry] }
Entry = { id, kind, title, detail, time: "09:30", timestamp, photoRef|null }
```

- `kind` ∈ `trip | itinerary | activity | photo | journal | memory | destination | other`.
- `title` is human ("Trip created"; for journal/photo the note becomes the title).
- `days` are newest-first; `entries` within a day are chronological.
- Photos are **references only** (`photoRef`) — the binary stays on device; EXIF
  GPS must be stripped client-side.
| GET | `/trip-readiness` | — | `{ candidates, approvalRequests }` | context → insight → action → orchestrator → approval |
| GET | `/approvals` | — | `{ pending }` | approval-platform |
| POST | `/approvals/:id` | `{ decision: 'approve'\|'reject', reason? }` | `{ request }` | approval-platform |

## End-to-end journey (validated by `test/journey.test.js`)

```
POST /auth/apple        → token + traveller (PERSON+TRAVELLER created/resolved)
PUT  /trip              → create Indonesia trip   (→ timeline trip_created, graph owns/visited)
PUT  /itinerary         → build days + add activity (→ timeline + graph edges)
POST /capture           → journal/photo            (→ timeline photo_imported, photoRef only)
GET  /timeline          → grouped feed of what happened
GET  /trip-readiness    → deterministic gap candidates; high-impact routed to approval
GET  /approvals         → pending decisions
POST /approvals/:id     → approve  (human decision; nothing auto-executes)
```

## Notes & follow-ups
- **Photos:** only a reference id is stored (`photoRef`); binaries stay on device; EXIF GPS must be stripped client-side (platform forbids exact location).
- **Durable today:** trips, timeline, events, sessions, Apple links. **Follow-up:** durable identity / itinerary / memory / graph / approval repositories (in-memory within a running process for now — reads survive restart for the durable set; `createTrip` after restart needs the durable identity repo).
- **Apple verifier is injected and now real** — `apple-verifier.js` validates the identity token against Apple's public JWKS (signature + iss/aud/exp); selected by `APPLE_VERIFIER_MODE` (`disabled`/`fake`/`jwks`). No Apple secrets in the repo (verification uses only public keys + the public client id).
- **No platform module was modified.** The API is pure composition over the frozen V2 contracts.
