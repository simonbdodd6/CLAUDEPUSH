# RC4.4 — Email Verification Foundation

Status: **Foundation / decision document (Path B).** No live authentication behaviour is
changed by this milestone (RC4.4A). This document is the concrete basis for the
RC4.4B implementation.

## Why Path B (not Path A)

The verification **primitives already exist and are sound** (hashed, TTL'd, single-use,
rate-limited, anti-enumeration). But making verification *real* — i.e. enforcing it —
cannot be done safely right now without two decisions that must not be improvised:

1. **Legacy migration policy.** Every existing account is `emailVerified: false`
   ([`api/_identityStore.js:362,472,535,642,749`](../api/_identityStore.js)). There is no
   field distinguishing a *grandfathered legacy* account from a *new unverified* one.
   Enforcing verification at login would lock out 100% of current users. The brief
   forbids this ("legacy accounts must not be accidentally locked out unless the data
   model already marks their verification status safely" — it does not).
2. **Provider/delivery confirmation.** Email delivery is Resend, gated on
   `RESEND_API_KEY` ([`api/_email.js:15-16`](../api/_email.js)); if unset it **silently
   skips** (`reason: 'email_not_configured'`). Whether the key is set in production is a
   runtime fact that cannot be read from source. If unset, enforcing verification bricks
   all new onboarding (no email ever arrives → account can never be verified).

Both are migration/provider decisions. Hence Path B: capture the design, guard the
current invariants with tests, and hand RC4.4B a precise, safe sequence.

---

## 1. Current authentication architecture (exact files)

- **`api/_identityStore.js`** — the system of record. Whole-array JSON blobs in Upstash
  Redis (`app:identity:users`, `:team_members`, `:player_profiles`), read/written via
  `api/_kv.js`. All account logic lives here: `createClub`, `createJoinRequest`,
  `loginUser`, `claimInvite`, `upsertUserAccount`, `ensureTeamMember`, `ensurePlayerProfile`,
  password hashing (`scrypt`, legacy `sha256` upgrade-on-login), sessions
  (`createSession`/`resolveSession`, 30-day TTL, cookie `ce_session`), password reset,
  email verification, and email normalization (`normalizeEmail`, trim+lowercase).
- **`api/identity.js`** — the HTTP surface (`/api/identity`). Actions: `join`, `login`,
  `create_club`, `claim_invite`, `request_password_reset`, `reset_password`, `switch_team`,
  `logout`, `approve`/`reject`/`set_staff_level`/`remove_member`/`restore_member`,
  `change_password`, `change_email`, `send_verification_email`, `verify_email`, plus
  Stripe. Rate limiting via `enforceRateLimit` (`api/_security.js`).
- **`api/invite.js`** — invite tokens (`ce:invites`): personal single-use (14-day) and
  reusable group (permanent). GET withholds invitee PII.
- **`api/_email.js`** — Resend transactional email. Helpers `inviteEmail`,
  `passwordResetEmail`, `emailVerificationEmail`, `sendTransactionalEmail`.
- **`index.html`** — the client: auth panel (`renderNav`/`authPanel`), `loginIdentityAccount`,
  `joinSquad`, `startClubWizard`/`clubWizFinish`, `checkInviteParam`/`acceptInvite`,
  `requestPasswordReset`/`checkResetParam`, `checkVerifyParam`. Canonical thresholds/UX only.

## 2. Current account creation / login / reset / invite flows

- **Coach signup (`create_club`):** validates, **enforces email uniqueness** (409 "log in
  instead", [`:1281`](../api/_identityStore.js)), creates `user` (`emailVerified:false`,
  `passwordSet:true`) + active head-coach membership, **issues a session** (auto-login).
  Frontend fires `send_verification_email` fire-and-forget after creation
  ([`index.html:13623`](../index.html)) → toast "check your email".
- **Player self-join (`join`):** team-code gated; creates a `pending` player membership;
  **no session, no profile** until coach approval; **no rate limit**; reuses an existing
  user by email (no uniqueness rejection). No verification email.
- **Player join approval (`approve`):** coach action; flips membership to active, creates
  a profile. No password/user change.
- **Invite claim (`claim_invite`):** token → invite; binds by normalized email via
  `upsertUserAccount`; **account-takeover guard** (must prove existing password, else 403
  [`:986`](../api/_identityStore.js)); **password never overwritten for an established
  account** ([`:656`](../api/_identityStore.js) `password && !user.passwordSet`); staff
  invites `forceRole`; **issues a session**. No verification email.
- **Login (`login`):** 5/15min rate limit; matches by normalized email, prefers the record
  whose password verifies (tolerates duplicate-email shadows); **does not check
  `emailVerified`**; enumeration-safe credential error ("Invalid email or password").
- **Password reset:** `request_password_reset` (5/hr) is **anti-enumeration** (null user,
  no error); token hashed, 1h TTL, single-use; `reset_password` (5/hr) stamps
  `passwordChangedAt`. Does not revoke other sessions.

## 3. Current email-delivery capability

Resend via `sendTransactionalEmail` ([`api/_email.js`](../api/_email.js)), `Authorization:
Bearer ${RESEND_API_KEY}`, from `EMAIL_FROM` or `noreply@coachseye.app`. **If
`RESEND_API_KEY` is unset it returns `{ok:true, sent:false, skipped:true,
reason:'email_not_configured'}` — no throw, no user-visible error.** All three helpers
(invite, reset, verification) are wired. **Production key status is unknown from source
and must be confirmed externally (Vercel env) before any enforcement.**

## 4. Current uniqueness guarantees

Email is normalized consistently. Uniqueness is **enforced** in `create_club` (409),
`change_email` (409, [`:1381`](../api/_identityStore.js)), and the invite claim takeover
guard. It is **not** enforced in `join`/`upsertUserAccount` (reuse-on-find), and legacy
compatibility shadows can share an email; `loginUser` tolerates this at read time. No
Redis-level unique index (whole-array writes are non-atomic).

## 5. Required data-model changes (RC4.4B)

Additive only — no renumbering, no deletion:

- `users.emailVerified: boolean` — **exists**, keep.
- `users.emailVerifiedAt: string|null` — **exists**, keep.
- **NEW `users.verificationExempt: boolean`** (or `legacyGrandfatheredAt`) — marks accounts
  that must **never** be blocked by enforcement. Backfilled `true` for every account that
  exists at the migration cutoff. This is the field that makes enforcement legacy-safe.
- No change to team_members / player_profiles / invites.

## 6. Required endpoints / provider calls (all already exist — reuse, don't invent)

- `send_verification_email` (session-gated, 5/hr) — resend for the logged-in user.
- `verify_email` (10/hr) — completes verification from the emailed link.
- Trigger points to ADD server-side in RC4.4B: fire the verification token+email inside
  `create_club` **and** `claim_invite` (best-effort, non-blocking), so both onboarding
  paths verify — not just coach creation. No new endpoints required.

## 7. Token storage & expiry design (already correct — preserve)

Verification tokens are stored **hashed** (`tokenHash: hashToken(token)` = sha256), never
plaintext ([`:1119`](../api/_identityStore.js)); 24h TTL (`EMAIL_VERIFICATION_TTL_MS`);
single-use (matched by hash, cleared on use); `createEmailVerificationToken` no-ops if the
user is already verified. Reset tokens follow the same hashed/TTL/single-use pattern. **Do
not change this.**

## 8. Anti-enumeration behaviour (preserve, extend)

- `request_password_reset` returns the same shape for known/unknown emails.
- `send_verification_email` is **session-gated** → it only ever targets the caller's own
  account, so it cannot be used to probe arbitrary emails. Keep it session-only; do **not**
  add an unauthenticated "resend by email" endpoint (that would be an enumeration oracle).
- Unverified-login copy (RC4.4B) must be generic and must not confirm an email exists.

## 9. Legacy-account migration policy (the crux)

1. Ship the `verificationExempt` field.
2. **One-off, reversible backfill (dry-run first):** set `verificationExempt = true` for
   every account whose `createdAt < CUTOFF` (or simply every account existing at migration
   time). Snapshot the `users` array before writing; idempotent re-run.
3. New accounts created after the cutoff get `verificationExempt = false`.
4. Enforcement (if/when enabled) checks `emailVerified || verificationExempt` — so no
   existing user is ever locked out; only genuinely-new unverified accounts are gated.
5. Never delete or silently mutate accounts beyond adding the boolean.

## 10. Resend throttling

Reuse the existing `enforceRateLimit('send_verification_email', ip, {limit:5, windowMs:1h})`.
Frontend: disable the resend button with a short cooldown + "Sent — check your inbox"
copy; never expose the rate-limit internals.

## 11. Verification completion flow

`checkVerifyParam` (client) already strips the token from the URL and calls `verify_email`,
showing a success/failure modal. RC4.4B: after success, if the user is logged in, refresh
`emailVerified` in local state and remove any "verify your email" banner. No session is
created by verification alone.

## 12. Rollback strategy

- All RC4.4B changes are additive and flag-guarded (`VERIFICATION_ENFORCED` off by default).
- The backfill keeps a pre-migration snapshot; re-runnable/idempotent; revert = restore
  snapshot + drop the field reads.
- Because enforcement is a single gate `emailVerified || verificationExempt` behind a flag,
  disabling the flag instantly restores today's behaviour with zero data change.

## 13. Recommended RC4.4B implementation sequence

1. **Confirm `RESEND_API_KEY` is set in production** (external check). If not, stop —
   configure it first. Nothing else ships until delivery is real.
2. Add `verificationExempt` + the reversible backfill (dry-run → apply). No behaviour change.
3. Fire `send_verification_email` server-side inside `create_club` and `claim_invite`
   (best-effort, non-blocking). Still no enforcement.
4. Frontend: persistent "Check your email" state after signup/claim; a non-blocking
   "Verify your email" banner + "Resend" for logged-in unverified users.
5. **Only after 1–4 are verified in production:** introduce the enforcement flag
   (`emailVerified || verificationExempt`) — first as a soft warning, then, if desired, as
   a block for new accounts. Enforcement is the *last*, separately-approved step.

## 14. Security risks & required tests (RC4.4B)

Risks: mass legacy lockout (mitigated by `verificationExempt`); onboarding brick if email
unconfigured (mitigated by step 1 gate); enumeration via a resend oracle (mitigated by
session-gating); token leakage (mitigated — hashed at rest, never logged).

Tests RC4.4B must add: backfill is idempotent & lossless; enforcement gate passes
`verificationExempt` and verified users, blocks only new unverified; resend is session-only
+ throttled + neutral copy; `create_club`/`claim_invite` trigger the token via the existing
mechanism; unverified state never grants a session on its own; invite takeover guard and
password-reset anti-enumeration unchanged; no raw backend error reaches the user.

---

## RC4.4A deliverable

This document + `test/rc44-identity-invariants.test.js`, which pins the **current** identity
invariants (token hashing, TTL, verification-not-enforced, anti-enumeration, takeover guard)
so RC4.4B changes them only deliberately. **No live authentication behaviour changed.**
