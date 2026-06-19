# Identity / Active-Team Investigation

> Investigation phase complete. **Phase 1** (login team-resolution order) is being
> implemented on `main`. Phase 2 (config) and Phase 3 (data) remain. Do not touch
> the availability API, `COACH_DEMO_EMAIL`/production config, or production data
> outside the agreed phases; no deployment without the owner's say-so.

## Symptom
A coach logging in with `simonbdodd@gmail.com` lands on **Boitsfort RFC
(`boitsfort-rfc`)** and sees seeded test players (Simon Test Player, etc.), even
when intending to manage "Coach's Eye Trial Club 4". A newly-invited player
("Final Test") joins a different team than the coach's active session, so the
coach board shows them as "No Reply".

## Root cause (proven)
Login resolves `simonbdodd@gmail.com` to the seeded **`coach-demo`** account on
`boitsfort-rfc` (the DEFAULT_TEAM) — not to the intended club. Two distinct
causes:

1. **Configuration (immediate cause).** `COACH_DEMO_EMAIL = simonbdodd@gmail.com`
   — a real person's email is used as the demo identity.
   - `coach-demo` is seeded into the user store with `email = COACH_DEMO_EMAIL`
     and a `boitsfort-rfc` membership (`api/_identityStore.js` LEGACY_STAFF seed).
   - `loginUser` resolves the submitted email via `users.find(email)` → returns
     the stored `coach-demo` record.
   - The stored `coach-demo.email` is **persisted in Redis**; the env var does
     **not** rewrite it (`ensureLegacyCompatibilityTeamRecords` finds by id and
     never updates email; coach-demo is not in `OBSOLETE_LEGACY_ACCOUNT_IDS`). So
     changing the env alone does **not** free the email.
   - `createClub` forbids duplicate emails, so no separate real account exists
     under `simonbdodd@gmail.com`.

2. **Architecture (latent weakness — addressed by Phase 1).** `loginUser` resolves
   the active team as `input.teamId || DEFAULT_TEAM.id`, then the first active
   membership. It **prefers DEFAULT_TEAM** and has no "last active" / "owned" team
   preference — so any coach who is also a member of `boitsfort-rfc` is snapped
   there on login. (For `coach-demo` this is moot: its only membership IS
   `boitsfort-rfc`.)

## Why availability was a red herring
The availability read path / shared resolver (commit `cb36292c`) is correct. The
"No Reply" / `myResponse = {}` symptoms came from the **coach session being on the
wrong team** (`boitsfort-rfc`), not from availability code.

## Live evidence
- Production `GET /api/identity?action=session` → `teamId=boitsfort-rfc`,
  `userId=coach-demo`, `memberships=[boitsfort-rfc]`.
- Logical proof: the live session resolving to `coach-demo` + (code)
  `coach-demo.email = COACH_DEMO_EMAIL` ⇒ `COACH_DEMO_EMAIL = simonbdodd@gmail.com`.

## Phased fix
- **Phase 1 — login team resolution** (`api/_identityStore.js` `loginUser`,
  `switchTeam`): prefer `input.teamId` → `lastActiveTeam` → owned team
  (`staffLevel === 'head'`) → any active membership → `DEFAULT_TEAM`. Add
  `user.lastActiveTeamId`, written incrementally on login/switch (no migration).
  Note: does **not** by itself fix the `simonbdodd@gmail.com` case (coach-demo is
  `boitsfort-rfc`-only) — it removes the latent fragility for every other coach.
- **Phase 2 — demo identity email**: set `COACH_DEMO_EMAIL` to a dedicated,
  non-human address (config). Do not migrate data.
- **Phase 3 — data**: decide whether the existing `coach-demo` record / ownership
  needs a migration. (Owner has **not** authorized any data write.)

## Production / deploy state
- Canonical production project = `boitsfort-coachseye-gpt` (Vercel) — holds the
  Upstash DB + secrets. `boitsfort-coachseye.vercel.app` aliased to its
  `cb36292c` deployment. `COACH_DEMO_EMAIL` still `simonbdodd@gmail.com` (Phase 2).
