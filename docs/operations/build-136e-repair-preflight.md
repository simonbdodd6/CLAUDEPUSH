# Build 136E — Duplicate-player repair preflight (read-only tooling)

Companion to [build-136d-duplicate-player-repair-plan.md](build-136d-duplicate-player-repair-plan.md).
The plan says what the repair is; this tool decides, from data and recorded
answers alone, whether a pair may proceed and what exactly would change. It
applies nothing and contains no write path.

## What it is

- `scripts/duplicate-repair-lib.mjs` — pure functions (no I/O, no network, no
  credentials). Tested by `test/duplicate-repair-preflight.test.js`.
- `scripts/duplicate-repair-preflight.mjs` — a thin CLI over the library:

```
node scripts/duplicate-repair-preflight.mjs --snapshot snapshot.json --confirmations confirmations.json [--out manifest.json]
```

Exit 0 means the manifest has no blockers. Exit 1 means at least one blocker;
the manifest still prints so the blocker can be read. Exit 2 is a usage error.
`--now <iso>` and `--max-age-hours <n>` exist for reproducible runs and tests.

## Inputs — both supplied explicitly, never fetched

**Snapshot** (`schema: coacheasier-duplicate-repair-snapshot/1`): a sanitised
copy of the records the read-only audit already reads, taken with the same
GET/SCAN/LRANGE-only tripwire. Required fields, with the store key each mirrors:

| field | store key | shape |
|---|---|---|
| `takenAt`, `club`, `keyPrefix`, `source` | — | ISO time of the read; club id; key prefix (`app`); how it was taken |
| `users` | `identity:users` | `{ id, email, displayName, createdAt, lastLoginAt }` |
| `team_members` | `identity:team_members` | `{ id, teamId, userId, role, staffLevel, status, playerGroupId, mergedInto, accessChangedBy, accessChangedAt }` |
| `player_profiles` | `identity:player_profiles` | `{ id, teamId, userId, displayName, legacyPlayerId }` |
| `sessions` | `identity:sessions` | `{ id, userId, teamId, lastSeenAt }` (no token hashes) |
| `roster.players` | `roster:<club>` | `{ id, userId, legacyPlayerId, name, position, … }` |
| `subscriptions` | `subscriptions` | `{ userId, playerId, legacyPlayerId, subscription: { endpoint } }` |
| `availability` | `availability:<club>:…` | `{ "<key>": { "<entryKey>": { userId, playerId, legacyPlayerId, response, respondedAt } } }` |
| `publish` | `publish:<club>:…` | `{ "<key>": { reduced, formationKeys?, benchKeys?, referencedIds } }` — every publish record of the club, REDUCED to its sheet positions and the known ids it names elsewhere (`reducePublishRecord`); a raw record is refused |
| `medical` | `medical:<club>` | `{ "<key>": { redacted: true, referencedIds } }` — the known ids the record names, nothing clinical (may be empty) |
| `messages` | `chat:conv:dm:*:msgs` | array of DM key names (may be empty) |

Omitting `medical` or `messages` is a blocker: the preflight cannot prove the
duplicate is unreferenced without them.

**Confirmations** (`schema: coacheasier-duplicate-repair-confirmations/1`):
one record per required slot, each with `person`, `confirmedBy` (the human who
gave the answer), `confirmedAt` (ISO, not in the future, not before 2026-10-08):

```json
{ "schema": "coacheasier-duplicate-repair-confirmations/1",
  "records": [
    { "slot": "pair:<folded name>", "kind": "pair", "person": "…",
      "relationship": "same", "keepUserId": "user_…", "duplicateUserId": "user_…",
      "confirmedBy": "Head coach (name)", "confirmedAt": "2026-10-12T18:00:00Z", "channel": "in person" },
    { "slot": "staff:<userId>", "kind": "staff", "person": "…",
      "decision": "clear_plays_for", "confirmedBy": "…", "confirmedAt": "…" }
  ] }
```

`relationship` is `same`, `different` or `unknown`; only `same` (with both
account ids named) produces writes — `different` and `unknown` are recorded and
leave the pair untouched. `decision` for staff is `clear_plays_for` or
`keep_plays_for`. Keep these files outside the repository with `umask 077`.

## What is required, derived from the snapshot — never from a list of names

- One **pair** confirmation for every folded name carried by two or more
  active memberships in the club (the audit's own duplicate rule).
- One **staff** confirmation for every active non-player membership that
  carries a player-group mark, unless the person is a player on the evidence:
  at least 10 answers with the latest inside 45 days of the snapshot (the plan's
  criterion for the three player-coaches). The thresholds are printed in the
  manifest; a recorded answer for an evidenced person is honoured if given.

On the production records of October 2026 this yields the plan's nine
confirmations: five pairs and four staff marks.

## Fail-closed rules (each is a blocker; one blocker blocks the manifest)

- snapshot malformed, in the future, or older than the window (default 6 h)
- a required slot without a record; a record for an unknown slot; two records
  for one slot; missing person / confirmedBy / confirmedAt; a date in the future
  or before the plan; an unknown relationship or decision
- `same` without both ids, with the same id twice, with an id that is not one
  of the pair's accounts, or for a name with more than two active accounts
- either account: no user record, not exactly one active player membership in
  the club, `mergedInto` already set, a membership in another club, not exactly
  one profile, a profile that already aliases another id, not exactly one
  roster row, a session for another club; the two accounts sharing an id; a
  third roster row aliasing the duplicate
- an **availability conflict**: the two accounts hold different answers for the
  same record (identical answers are duplicates and allowed, as the plan says)
- any medical record or message thread naming the duplicate
- any publish reference to the duplicate other than `id:<dup>` inside
  `formationKeys` / `benchKeys` (those are re-pointed; anything else is unknown
  territory and blocks)

## What the manifest proposes (per `same` pair, in store order)

`identity:player_profiles` (kept profile aliases the duplicate; duplicate
profile deleted) → `identity:team_members` (duplicate membership `removed`,
`removedBy: build-136e-merge`, `mergedInto: <kept userId>`) →
`identity:sessions` (duplicate's club sessions dropped) → `roster:<club>`
(kept row aliases the duplicate, blank fields filled from the duplicate row,
duplicate row deleted) → `subscriptions` (duplicate's devices removed) →
publish sheet keys re-pointed. Staff `clear_plays_for` proposes the admin
`set_player_group` action with an empty group. Users, availability records,
medical and messages are never in the manifest.

Every write carries `precondition.sha256`: the hash (canonical JSON, record
arrays order-insensitive) of the whole store value at snapshot time. For a
publish record the hash is of its REDUCED form: the write step re-reads the
live record, reduces it with the same shared function and the snapshot's known
ids, and compares. The hash therefore guards exactly the sheet positions and
references the repair depends on; a coach's unrelated edit to the same record
meanwhile neither blocks the pair nor is lost, because the write is a
read-modify-write of the live record at the one named path.

## Taking the snapshot (read-only)

```
UPSTASH_REDIS_REST_URL=… UPSTASH_REDIS_REST_TOKEN=… [APP_KEY_PREFIX=app] \
node scripts/duplicate-repair-snapshot.mjs --club <clubId> --out snapshot.json [--prefix <p>]
```

The key prefix is `--prefix` when given, else `APP_KEY_PREFIX` exactly as the
app and the audit read it, else `app`. A wrong prefix is refused (the users
store is then "missing"), never guessed.

- `scripts/duplicate-repair-snapshot-lib.mjs` builds the document from an
  injected command function; `scripts/duplicate-repair-snapshot.mjs` is the
  CLI. Tested by `test/duplicate-repair-snapshot.test.js` against synthetic
  records for two clubs and a loopback stub — never against production.
- **Credentials come from the environment only.** There is deliberately no
  `.env.local` fallback: a live snapshot is an explicit, approved act, run with
  the two variables exported for that one command.
- **Two read-only guards.** Every command passes `guardReadOnly()` in the
  library (GET / SCAN / LRANGE, nothing else, before any client is called), and
  the CLI wraps `fetch` with the production audit's tripwire so a non-read
  command aborts the process before it is sent.
- **Data minimisation.** Records are reduced to whitelisted fields: no password
  hashes, session tokens, push keys, phone numbers, dates of birth or notes.
  Only the target club's people are included, plus their other-club memberships
  and sessions so the preflight can refuse a cross-club merge. Medical records
  are reduced to the ids they reference (`{ redacted: true, referencedIds }`),
  which is all the reference scan needs. **Publish records are reduced** by the
  shared `reducePublishRecord` to `formationKeys` / `benchKeys` (kept
  positionally — these are what gets re-pointed) and `referencedIds` (the known
  ids the record names anywhere else, as `"<id>"` or `"id:<id>"`); coaching
  and transport notes, attendance details, logos and every other field never
  leave the store. Direct-message threads are key names only, and only those
  naming a club member. Availability entries keep ids, response and time;
  roster rows keep ids, name, position and the `avail_*` mirrors;
  subscriptions keep ids and endpoint (no device label).
- **Refusals.** A missing or non-JSON users / memberships store, a roster that
  is not `{ players: [] }`, an availability record that is not an object, a
  SCAN reply of the wrong shape, or a SCAN that does not terminate all abort
  with nothing written. Records without an id are dropped and listed in
  `notes`. The output file is created with mode 600 and never overwritten.
- **Not captured:** the flat pre-scoping availability keys
  (`availability:<sessionId>` without a club) — inert legacy history that no
  club-scoped reader consults.

**Authorisation required before any live snapshot:** the owner's explicit
approval for a read-only production read (the environment variables are the
owner's to export), run on the owner's machine, output kept under `umask 077`
and deleted after post-release verification.

## The write protocol this tool enforces by contract — and does not implement

1. Take a fresh snapshot with the read-only audit and recompute the manifest;
   require it to match the reviewed one (bar `generatedAt`).
2. Immediately before each write, under `withIdentityLock`, re-read the key and
   compare its hash with the precondition; abort the pair on any mismatch.
3. The roster key has no lock: re-read immediately before writing and run while
   coaches are idle.
4. One pair at a time; verify read-only before the next.
5. No permanent delete; keep snapshots until post-release verification.

Nothing in this repository executes those steps yet. That is a later,
separately authorised build.
