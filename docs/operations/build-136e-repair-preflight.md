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
| `publish` | `publish:<club>:…` | `{ "<key>": <parsed record> }` — every publish record of the club |
| `medical` | `medical:<club>` | `{ "<key>": <record> }` (may be empty) |
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

Every write carries `precondition.sha256`: the hash (canonical JSON) of the
whole store value at snapshot time.

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
