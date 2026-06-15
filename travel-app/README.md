# Travel App — Indonesia (Product on Platform V2)

The first **product** built on the frozen Platform V2. This is product work, not
platform work: it consumes the frozen platform modules through their public
APIs/ports and adds the bridge to a real iPhone app. **No platform module is
modified; no platform logic is duplicated.**

Success criterion: *"Would Simon genuinely use this app every day while
travelling in Indonesia (from 11 July)?"* — not architectural elegance.

## Layout

```
travel-app/
  api/
    persistence/   durable storage behind the frozen repository interfaces
      file-store.js              zero-dep, atomic, durable JSON store
      durable-repositories.js    File{Trip,Event,Timeline}Repository (frozen surface)
    session.js     (next) session tokens
    auth.js        (next) Sign in with Apple -> identity-platform
    index.js       (next) thin API composing platform + adapters
    server.js      (next) minimal HTTP host
    test/          node --test suites (green)
  ios/             (next) SwiftUI app shell — finished in Xcode with Apple creds
```

## Persistence adapter (M23.0 — done, green)

The platform repositories were always designed as a swappable boundary
("a production adapter can implement the same async surface"). `FileStore` +
`durable-repositories.js` are exactly that: durable, file-backed implementations
of `InMemoryTripRepository` / `InMemoryEventRepository` /
`InMemoryTravelTimelineRepository`, injected into the frozen
`create*Platform({ repository })` factories.

Proven by `api/test/persistence.test.js` (4/4): the real frozen platforms run
against the durable repos, and **state survives a fresh instance from disk** —
trips (CRUD + audit), events (append-only + sequence + dedupe), and timeline
(append-only + idempotency). Append-only + idempotency keys make this the same
mechanism offline sync will rely on.

Why file-backed JSON for MVP: zero-dependency, durable, single-traveller scope.
A server deployment swaps `FileStore` for Postgres behind the **same** adapter
surface — no platform or app change.

## Bridge roadmap (M23.0, remaining)

1. **Session management** — issue/verify/revoke session tokens (file-backed).
2. **Sign in with Apple** — verify Apple identity token (injectable verifier),
   map to an identity-platform `PERSON` + `TRAVELLER` role via the M10 port.
3. **Thin API** — `createTravelApi({ ...platforms })` exposing handler functions
   (signIn, today, itinerary, capture, timeline, readiness, approvals, approve)
   composing the frozen platforms; minimal `node:http` host.
4. **SwiftUI shell** — tab nav + screens (Today, Itinerary, Day, Capture,
   Timeline, Trip Readiness, Approvals), offline-first local cache, consuming
   the API. Compiled/signed in Xcode with Simon's Apple Developer credentials
   (not available in this environment).
5. **Offline sync** — local store + queued mutations replayed as append-only
   events on reconnect (idempotency keys dedupe).

## Boundaries

- Reuses platform modules; never edits them.
- UI is fully separate from platform.
- Every screen consumes platform APIs via the thin API.
- Offline-first, deterministic.
- Not in scope (V2): AI, companions, booking, payments, maps, recommendations
  UI, notifications, multi-user, social, web, dashboards, digital-twin UI.
