# Travel App API — Deployment Guide (M23.4)

This is the thin, deterministic HTTP API the iPhone app points at. It has **no
third-party dependencies** (pure Node.js stdlib) and stores data as durable JSON
files. This guide covers configuration, running locally, deploying to a server,
and what Simon must set up in Apple before real device / TestFlight sign-in.

> Scope: single traveller, single process (MVP). Horizontal scale / multi-user
> is a later milestone — see *Postgres seam* below.

---

## 1. Configuration

All configuration is environment variables, validated by [`config.js`](./config.js).
There are **no secrets in the repo**. Copy the template and edit:

```bash
cp travel-app/api/.env.example travel-app/api/.env
```

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `production` hardens defaults (apple→jwks, `fake` refused) |
| `PORT` | `8787` | HTTP listen port |
| `TRAVEL_BASE_URL` | `http://localhost:<PORT>` | Public URL (logs / future links) |
| `TRAVEL_STORE_DIR` | `./.travel-data` | Durable store directory (use an absolute path on a persistent volume in prod) |
| `SESSION_TTL_HOURS` | `720` (30 days) | Session lifetime |
| `APPLE_VERIFIER_MODE` | `disabled` (dev) / `jwks` (prod) | `disabled` \| `fake` \| `jwks` |
| `APPLE_CLIENT_ID` | — | Required for `jwks`. Your bundle id / Services ID (the token `aud`). Public. |
| `APPLE_ISSUER` | `https://appleid.apple.com` | Override for testing only |

Apple verifier modes:
- **`disabled`** — no verifier; sign-in fails closed with `AUTH_NOT_CONFIGURED`. Safe default.
- **`fake`** — deterministic `apple:<sub>:<email>` verifier for local/dev only. **Refused when `NODE_ENV=production`.**
- **`jwks`** — real verification against Apple's public keys. Needs `APPLE_CLIENT_ID`.

---

## 2. Run locally

```bash
# dev, no Apple needed (sign-in disabled), data under ./.travel-data
node travel-app/api/server.js

# dev with the fake verifier (lets the app sign in end-to-end)
APPLE_VERIFIER_MODE=fake PORT=8787 node travel-app/api/server.js

# then, in another terminal:
curl -s localhost:8787/health | jq
curl -s -XPOST localhost:8787/auth/apple -H 'content-type: application/json' \
  -d '{"identityToken":"apple:simon:simon@example.com","displayName":"Simon"}'
```

Run the test suite (config, verifier, health, persistence, journey, restart):

```bash
node --test travel-app/api/test/*.test.js
```

---

## 3. Deploy to a server

The host (`server.js`) is a plain `node:http` server. Any platform that runs a
long-lived Node process with a **persistent disk** works (a small VPS, Fly.io,
Render, a container with a mounted volume). It is *not* a good fit for purely
ephemeral serverless until the Postgres seam lands (the file store needs durable
disk).

1. **Provision** a host with Node 18+ and a persistent volume.
2. **Set environment** (production):
   ```bash
   NODE_ENV=production
   PORT=8787
   TRAVEL_BASE_URL=https://your-domain
   TRAVEL_STORE_DIR=/var/lib/travel-app/data    # on the persistent volume
   APPLE_VERIFIER_MODE=jwks
   APPLE_CLIENT_ID=com.simondodd.travel         # your real bundle id
   ```
3. **Start** under a process manager (systemd / pm2 / container restart policy):
   ```bash
   node travel-app/api/server.js
   ```
4. **Terminate TLS** in front of it (reverse proxy / platform router). The app
   speaks plain HTTP; HTTPS is required for Sign in with Apple on device.
5. **Probe readiness**: point your platform's health check at `GET /health`
   (also `/healthz`). It returns `200` when ready, `503` when the store is
   unavailable, and a JSON body with per-check detail:
   ```json
   { "status": "ok", "checks": { "api": {"ok":true}, "store": {"ok":true,"driver":"file"},
     "apple": {"ok":true,"mode":"jwks"} } }
   ```
   `status` is `degraded` (still `200`) when the store is fine but Apple is
   `disabled` or config is missing — useful as a config canary.

### Backups
The entire traveller state is the JSON files under `TRAVEL_STORE_DIR`. Snapshot
that directory (volume snapshot or `cp -a`) to back up; restore by putting the
files back. Writes are atomic (tmp + rename) so a snapshot is always consistent.

---

## 4. Apple Sign In — what Simon must set up (later)

Verification needs only **public** values; **no Apple private key** is stored by
this API. To enable `APPLE_VERIFIER_MODE=jwks` you need, in the Apple Developer
portal:

1. An **App ID** (bundle id, e.g. `com.simondodd.travel`) with **Sign in with
   Apple** capability enabled.
2. That bundle id set as **`APPLE_CLIENT_ID`** (it is the token `aud` this API
   checks). For a web/Services ID flow, use the Services ID instead.
3. In Xcode: enable the **Sign in with Apple** capability on the app target so
   the device produces a real identity token.

That is all the *server* needs — it fetches Apple's public signing keys from
`https://appleid.apple.com/auth/keys` at runtime and verifies the token
signature, issuer, audience, and expiry. The private signing key never leaves
Apple; we only consume the public half.

> A client-secret / token-revocation flow (for refresh tokens or
> server-to-server notifications) is **not** required for this MVP — the app
> signs in and receives a session. If that flow is added later, the Apple
> private key would live only in the deployment secret store, never in the repo.

---

## 5. Persistence layout & the Postgres seam (future, documented not built)

Current durable layout (one JSON document per collection) under `TRAVEL_STORE_DIR`:

```
<TRAVEL_STORE_DIR>/
  identities.json        traveller / person records
  trips.json             the trip
  itineraries.json       itinerary + version history
  timeline.json          timeline events (journal, photos, trip/itinerary)
  events.json            event-platform log
  relationships.json     relationship graph edges
  memories.json          travel memories
  approvals.json         approval requests + decision history
  apple_links.json       apple sub -> traveller id
  sessions.json          session tokens
  _health.json           health-probe scratch
```

**Seam for a server-grade datastore (e.g. Postgres):** the platform modules
never touch disk — each takes a *repository* injected at composition in
[`index.js`](./index.js), and the file-backed repositories in
[`persistence/durable-repositories.js`](./persistence/durable-repositories.js)
sit behind those frozen repository interfaces. To move to Postgres:

1. Implement `Pg*Repository` classes mirroring the same interface methods the
   `File*Repository` classes already implement (one table per collection above).
2. Swap the `repo(store, File*Repository)` calls in `index.js` for the Postgres
   repositories (a one-line change per module; the platform code is untouched).
3. Replace the `FileStore` read/write the session/auth/health probes use with a
   Postgres-backed equivalent (same tiny `read/write(collection, items)` shape).

No platform contract changes, no business-logic duplication — only new adapter
classes. This is **documented, not implemented**, per M23.4 scope.
