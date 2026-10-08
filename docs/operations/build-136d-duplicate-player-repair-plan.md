# Build 136D — Duplicate Player Repair Plan

Documentation only. Nothing in this file has been executed. Every production
read behind it was made with the read-only audit tooling (GET/SCAN only, write
tripwire armed). Emails are masked; no contact, medical or reason text is
reproduced.

## Production state

- Production version: **core-deploy-101 / 05d5f16** (deployed 2026-10-08T15:37Z, verified on all three hostnames).
- Audit date: **2026-10-08** (`scripts/audit-duplicate-players.mjs`, re-run twice; both runs identical).
- Build 101 is live, so no new duplicate can be minted; the five pairs below are all **pre-existing** (created 16 Aug – 27 Sep 2026). Zero accounts, memberships or invite claims were created since the deployment.
- Club: Boitsfort (`boitsfort`), group U18 (`grp_2b0aa7f9`) for all five pairs. None of the ten accounts holds a membership in any other club.
- Shape of every pair: two login accounts (different emails), two active player memberships, two player profiles, two roster rows, availability answers stored under both user ids. Nothing is keyed by a shared id: the two halves of a pair share **only the name**.

### The five duplicate pairs

| # | Person | Account A (older) | Account B (newer) |
|---|---|---|---|
| 1 | James Mehu | `user_1786881101891_pfondk` (16 Aug, j\*\*\*@icloud.com) | `user_1790166726989_5do4nx` (23 Sep, j\*\*\*@**ocloud**.com) |
| 2 | Gaétan Van Aken | `user_1787227461353_tgqbch` (20 Aug, g\*\*\*@gmail.com #2cfb34) | `user_1790490575377_geoa34` (27 Sep, g\*\*\*@gmail.com #7497db) |
| 3 | Manoah Tshimanga | `user_1787488931449_vtlly5` (23 Aug, m\*\*\*@icloud.com) | `user_1790102880046_tozzg2` (22 Sep, k\*\*\*@gmail.com) |
| 4 | Thomas Huwaert | `user_1787687502721_de7rdu` (25 Aug, h\*\*\*@student.eursc.eu) | `user_1788204358618_c8ipk4` (31 Aug, t\*\*\*@outlook.com) |
| 5 | Felix Olbrechts | `user_1789804363699_ljxwzc` (19 Sep, f\*\*\*@gmail.com) | `user_1790136545503_a4mfrn` (23 Sep, f\*\*\*@icloud.com) |

## Confirmation table

| Person | KEEP (proposed) | DUPLICATE (proposed) | Confidence same person / which account | Reason | Human confirmation required |
|---|---|---|---|---|---|
| James Mehu | A `…pfondk` (icloud) | B `…5do4nx` (ocloud) | HIGH / MEDIUM | B's email domain "ocloud.com" is almost certainly a typo of icloud.com, so B can never receive a password reset. Both accounts were last used on 23 Sep (A answered 06:51, B was created 12:32 and answered the same 7 sessions identically by 13:13). A holds 27 answers, B 7. | Which address is James's. If the family insists on B, the email must be corrected first (an account edit, out of scope here). |
| Gaétan Van Aken | B `…geoa34` (#7497db) | A `…tgqbch` (#2cfb34) | HIGH / HIGH | B is the account in use: logged in 27 Sep, 2 live sessions, answers through 4 Oct, the only push subscription. A never logged in after the claim and last answered 13 Sep. A was selected (slot 13) in the published squad of 19 Sep v MECH U18 1. | Which gmail address is Gaétan's. |
| Manoah Tshimanga | B `…tozzg2` (k\*\*\*@gmail) | A `…vtlly5` (icloud) | HIGH / MEDIUM | B is in use (2 live sessions, last seen 6 Oct, answers through 6 Oct). A last answered 16 Sep; A is on the bench of the unpublished coach sheet for 26 Sep v ASUB. B's email local part is not Manoah's name — it may be a parent's/guardian's. | Whether k\*\*\*@gmail.com belongs to Manoah or to a parent/guardian, and which address he should use. |
| Thomas Huwaert | A `…de7rdu` (school) | B `…c8ipk4` (outlook) | MEDIUM-HIGH / HIGH | A is the only account that logs in (4 Oct) and the most recently used (answered 8 Oct 13:39); A is in the published squad of 19 Sep (slot 14). B holds more history (17 answers, 31 Aug – 28 Sep) and the device push subscription. The two accounts were used in overlapping weeks, which is unusual for one person. | A/B/C: same Thomas with two accounts, two different people with the same name, or unknown. If same: which address. |
| Felix Olbrechts | B `…a4mfrn` (icloud) | A `…ljxwzc` (gmail) | HIGH / HIGH | A was used once, on 19 Sep (3 answers); B has been used since 23 Sep through 7 Oct (14 answers). | Which address is Felix's. |

The KEEP proposals rest on which account the person actually uses (logins, live sessions, latest answers, push subscription, deliverable email) — not on which holds more answers. In two pairs (James, Thomas) the account with *more* history is the proposed duplicate.

## Per-player analysis

Counts are live-record counts (availability entries stored under that user id across the club's records); "latest" is the newest `respondedAt`.

### 1. James Mehu
| | Account A `…pfondk` | Account B `…5do4nx` |
|---|---|---|
| Membership | `tm_1786881102252_4cie0c`, player, active, U18, by invite | `tm_1790166727355_e6n2zk`, player, active, U18, by invite |
| Profile | `profile_1786881102450_morjhw`, position TBC, legacyPlayerId = own id | `profile_1790166727555_mqlzri`, position "4 — Lock" |
| Roster row | id = user id, position TBC | id = user id, position "4 — Lock" |
| Created / last login / live sessions | 16 Aug / never / 0 | 23 Sep / never / 1 (last seen 23 Sep) |
| Availability | 27 (26 available, 1 unavailable), latest 23 Sep 06:51 | 7 (all available), latest 23 Sep 13:13 |
| Squad / coach-sheet / medical / messages / subscriptions | none | none |

### 2. Gaétan Van Aken
| | Account A `…tgqbch` | Account B `…geoa34` |
|---|---|---|
| Membership | `tm_1787227461703_dy2izv` | `tm_1790490575936_z6ny7y` |
| Profile | `profile_1787227461902_o877qs`, "11/13/14/15" | `profile_1790490576133_e5m5pa`, "11 — Left wing" |
| Created / last login / live sessions | 20 Aug / never / 0 | 27 Sep / 27 Sep / 2 |
| Availability | 15 (14 available, 1 unavailable), latest 13 Sep | 13 (11 available, 2 unavailable), latest 4 Oct |
| Published squad | **yes** — `fx_tv8kog3` (19 Sep v MECH U18 1, published 17 Sep) `formationKeys.13 = id:user_1787227461353_tgqbch` | none |
| Coach sheet / medical / messages | none | none |
| Push subscriptions | 0 | 1 |

### 3. Manoah Tshimanga
| | Account A `…vtlly5` | Account B `…tozzg2` |
|---|---|---|
| Membership | `tm_1787488931807_qfya52` | `tm_1790102880586_5nz32o` |
| Profile | `profile_1787488932006_mb10yk`, "Pilier" (row position "SUB", row registrationStatus "unregistered") | `profile_1790102880790_0eo6ua`, "3 — Tighthead prop" |
| Created / last login / live sessions | 23 Aug / never / 0 | 22 Sep / never / 2 (last seen 6 Oct) |
| Availability | 8 (7 available, 1 unavailable), latest 16 Sep | 5 (all available), latest 6 Oct |
| Coach sheet | **yes** — `fx_l3he85h` (26 Sep v ASUB, unpublished coach sheet) `benchKeys[1] = id:user_1787488931449_vtlly5` | none |
| Squad / medical / messages / subscriptions | none | none |

### 4. Thomas Huwaert
| | Account A `…de7rdu` | Account B `…c8ipk4` |
|---|---|---|
| Membership | `tm_1787687503159_v0np35` | `tm_1788204358983_e21ot1` |
| Profile | `profile_1787687503353_c57s9a`, "Winger" | `profile_1788204359180_j4hd43`, "Winger" |
| Created / last login / live sessions | 25 Aug / 4 Oct / 1 | 31 Aug / never / 0 |
| Availability | 8 (all unavailable), latest 8 Oct 13:39 | 17 (9 available, 8 unavailable), latest 28 Sep |
| Published squad | **yes** — `fx_tv8kog3` `formationKeys.14 = id:user_1787687502721_de7rdu` (the KEEP account — no action) | none |
| Push subscriptions | 0 | 1 |
| Coach sheet / medical / messages | none | none |

### 5. Felix Olbrechts
| | Account A `…ljxwzc` | Account B `…a4mfrn` |
|---|---|---|
| Membership | `tm_1789804364248_42z3qo` | `tm_1790136546051_73l8v7` |
| Profile | `profile_1789804364452_i7gzq5`, "Second row" (row position "SUB", "unregistered") | `profile_1790136546253_3zql6p`, "4 — Lock" |
| Created / last login / live sessions | 19 Sep / never / 1 (19 Sep) | 23 Sep / never / 1 (23 Sep) |
| Availability | 3 (2 available, 1 unavailable), latest 19 Sep | 14 (11 available, 3 unavailable), latest 7 Oct |
| Squad / coach sheet / medical / messages / subscriptions | none | none |

## Staff/player analysis

**Isabelle Verbist** (`user_1786888549894_957efs`, membership `tm_1786888550251_ucx7oe`) — re-confirmed 2026-10-08: role **admin / assistant**; `playerGroupId` **U18** (stamped `accessChangedBy: invite` on 1 Sep — the player-link artefact Build 101 now prevents); **no player profile**; **0** availability answers; roster row present (position "TBC"); 0 subscriptions; her only publish reference is a draft she authored (`…:draft:user_1786888549894_957efs`, as author, not as a player). The deployed roster rule evaluated on the live records classifies her row `staff` and **withholds it** (159 stored rows → 158 returned; hers is the only withheld row), so she no longer appears in Available Players. Classification **B — staff-only, incorrectly stamped**. Proposed (not executed): an admin clears "Plays for" (`set_player_group` with no group); the TBC row then stays withheld and drops on the next club-wide roster save.

Questions for the head coach (no change made):

- **Benjamin Rossignol** (assistant coach, Seniors "Plays for" set 16 Aug; 2 answers, both on 16 Aug; appears in many coach drafts as author): "Does Benjamin actually play for the Seniors and therefore need to remain marked as *Plays for*?"
- **Nick Marshall** (assistant coach, "Plays for" set 17 Sep; 6 answers, all on 6 Aug under legacy keys; none since): "Does Nick actually play for the Seniors and therefore need to remain marked as *Plays for*?"
- **Douglas Vanderlinden** (medical, "Plays for" set 4 Sep; 1 answer, unavailable, 8 Sep; position TBC): "Does Douglas actually play for the Seniors and therefore need to remain marked as *Plays for*?"

(Louis Wuestenberghs, Vincent Jouvenne and Victor Peeters are genuine player-coaches on the evidence — 43/25/47 answers through October, squad selections, medical cases — and need no question.)

## Proposed repair mechanics

### What the code actually reads (traced on core-deploy-101)

| Reader | Matches a person by |
|---|---|
| Coach availability board (`/api/availability?resolveRoster=1` → `resolveAvailabilityForIdentities`) | identity built from each **player profile**: `userId`, `playerId`, **`legacyPlayerId`**; an entry matches if any of the three equals; several matches → **newest `respondedAt` wins**; the result map is indexed by both `userId` and `legacyPlayerId` |
| Player self-read and the answer write (`availabilityIdentityFromSession`, `sameIdentity`) | session user id + **profile `legacyPlayerId`**; a write deletes every sibling entry of the same identity in that session record |
| No-reply reminders (`push.js`, `cron.js`) | entry ids vs subscription ids (`userId`/`playerId`/`legacyPlayerId`) |
| Match history / attendance (`attendanceOwnedKeys`, `legacyPlayerIdsForUser`, `rosterRowBelongsToUser`) | the account's user id **plus every `legacyPlayerId` on its profiles** plus roster rows owned through them |
| Roster projection (`rowMatchesMember`) | hard guard first: a row whose `userId` is a *different* account is never this member's, whatever the soft bridges say |
| Client roster dedupe (`dedupeRosterPlayers`) | never merges two different permanent `user_` ids |
| Client season statistics (`byPlayer[key]`) | the **exact** stored sheet key `id:<userId>` — it does **not** follow `legacyPlayerId` |
| `healSharedLegacyPlayerIds` (runs in memory on every identity read) | resets any `legacyPlayerId` that two profiles with different user ids share |

### Conclusion: the safe mechanism is "alias + retire", not an answer rewrite

Setting the kept profile's `legacyPlayerId` to the duplicate's user id makes every server reader above treat the duplicate's answers, selections and attendance as the kept person's, with **zero writes to availability records** (the kept identity still matches its own entries by `userId`; shared sessions resolve by recency, and the kept account's next answer lazily removes the duplicate's sibling entry). Rewriting the duplicate's answers under the kept id ("Option B") would touch up to ~27 availability records per person for no reader that needs it, and is rejected.

Two conditions make the alias safe, and both are therefore part of the repair:

1. The duplicate's **player profile must be retired in the same write** — otherwise the healer sees the id shared by two profiles and silently resets the alias on the next read.
2. The two sheet keys that name a duplicate id must be **re-pointed** to the kept id (`fx_tv8kog3` squad `formationKeys.13` for Gaétan; `fx_l3he85h` coach sheet `benchKeys[1]` for Manoah — only if the KEEP choices above are confirmed), because the client's season statistics look a key up exactly. Names on the sheets are untouched.

### Writes per confirmed pair (all under the identity lock; roster re-read immediately before its write)

| Store | Write |
|---|---|
| `app:identity:player_profiles` | kept profile: `legacyPlayerId := <duplicate userId>` (its current value is the redundant own id, so nothing is lost); **delete** the duplicate's profile |
| `app:identity:team_members` | duplicate membership: `status := 'removed'`, `removedAt`, `removedBy := 'build-136e-merge'`, plus a marker `mergedInto: <kept userId>` |
| `app:identity:sessions` | drop the duplicate's sessions for `boitsfort` (what `removeTeamMember` does) |
| `app:roster:boitsfort` | kept row: `legacyPlayerId := <duplicate userId>`; fill the kept row's blank fields / placeholder position from the duplicate row (James: TBC → "4 — Lock"); **delete** the duplicate row (its `avail_*` mirror fields are derived from the availability records and are not authoritative) |
| `app:subscriptions` | remove push subscriptions whose ids are the duplicate's (Thomas #2 holds 1; Gaétan's 1 is on the KEEP account and stays) |
| publish records | the two key rewrites above |
| `app:identity:users` | **nothing** — both login accounts are preserved |
| availability records, medical, messages | **nothing** |

### CURRENT → PROPOSED

| Person | CURRENT | PROPOSED |
|---|---|---|
| James Mehu | membership A active + B active; profile A + B; availability A 27 + B 7 (7 shared) | retain A; B → removed (`mergedInto` A); profile B retired, A aliases B; history 27 + 7 answers resolve to A (34 entries, 27 sessions); both logins kept |
| Gaétan Van Aken | A active + B active; A 15 + B 13 | retain B; A → removed; A's 15 answers + 19 Sep appearance resolve to B; squad key re-pointed; both logins kept |
| Manoah Tshimanga | A active + B active; A 8 + B 5 | retain B; A → removed; A's 8 answers + coach-sheet bench resolve to B; bench key re-pointed; both logins kept |
| Thomas Huwaert | A active + B active; A 8 + B 17 (3 shared) | retain A; B → removed; B's 17 answers resolve to A; B's push subscription removed; both logins kept |
| Felix Olbrechts | A active + B active; A 3 + B 14 | retain B; A → removed; A's 3 answers resolve to B; both logins kept |

## Conflicts

A conflict is the two accounts holding **different** answers for the same session.

| Person | Shared sessions | Conflicts | Non-conflicting duplicate answers | Eligible |
|---|---|---|---|---|
| James Mehu | 7 (`fx_hvs403h`, `fx_l3he85h`, `fx_qs2k74p`, two Tuesday slots, two Thursday slots) | **0** | 7 — all "available" on both, B's 5–7 hours after A's | yes |
| Gaétan Van Aken | 0 | 0 | 0 | yes |
| Manoah Tshimanga | 0 | 0 | 0 | yes |
| Thomas Huwaert | 3 (`fx_qs2k74p`, Tue 29 Sep, Thu 1 Oct) | **0** | 3 — all "unavailable" on both, A's (keep) newer | yes |
| Felix Olbrechts | 0 | 0 | 0 | yes |

No pair is blocked today. Because both accounts of every pair are still active, a conflict can still appear before Build 136E runs; the conflict check is therefore the first step of the execution checklist, and any pair with a conflict is skipped, never resolved by "newest wins".

## Risks

1. **Resurrection by re-claim.** `ensureTeamMember` sets an existing membership back to `active` when the same account claims the squad link again, and the duplicate-name guard only fires for *new* accounts. If the retired account's owner opens the join link and signs in with that email, the duplicate returns. Build 136E must add a small guard: a membership carrying `mergedInto` is refused reactivation with a message naming the kept account. This is a code change (tested, deployed before or with the repair).
2. **Unlocked roster write.** The roster record has no write lock (a Build 135 known gap); a coach device saving at the same moment could lose the repair's roster edit. Mitigation: run when coaches are idle, re-read immediately before writing, verify afterwards, and the post-run audit would show any regression.
3. **Devices.** The retired account's sessions are revoked; the person must sign in with the kept account on their phone (the app's local state still names the old account until they do).
4. **Season statistics** show two rows for Gaétan/Manoah until the sheet keys are re-pointed (included above).
5. **Roster mirror loss.** The duplicate row's `avail_*` copies disappear with the row; the authoritative answers remain in the availability records and resolve to the kept identity.
6. **Wrong KEEP choice.** The alias is reversible (swap the alias and statuses back) as long as no permanent delete runs; snapshots of every touched key are taken first.
7. **Healer dependency.** If the duplicate profile were ever re-created (e.g. by a reactivated membership, risk 1), the healer would reset the alias; the guard in risk 1 prevents it.

## Required confirmations

Not sent. For the head coach / players:

**JAMES MEHU** — "Which email address should James use to access CoachEasier: j\*\*\*@icloud.com (used since 16 August) or j\*\*\*@ocloud.com (created 23 September — note this one looks like a typo and cannot receive emails)?"

**GAÉTAN VAN AKEN** — "Which email address should Gaétan use to access CoachEasier: g\*\*\*@gmail.com (#2cfb34, joined 20 August) or g\*\*\*@gmail.com (#7497db, joined 27 September, the one he has been answering from since)?"

**MANOAH TSHIMANGA** — "Manoah has two accounts: m\*\*\*@icloud.com (joined 23 August) and k\*\*\*@gmail.com (joined 22 September, used most recently). Does the second address belong to Manoah himself or to a parent/guardian, and which one should he use to access CoachEasier?"

**THOMAS HUWAERT** — "There are two accounts named Thomas Huwaert: h\*\*\*@student.eursc.eu (joined 25 August, signs in and answers most recently) and t\*\*\*@outlook.com (joined 31 August, answered through September). Are these A) two accounts belonging to the same Thomas, B) two different people with the same name, or C) unknown? If A, which email should Thomas use?"

**FELIX OLBRECHTS** — "Which email address should Felix use to access CoachEasier: f\*\*\*@gmail.com (used once, 19 September) or f\*\*\*@icloud.com (used since 23 September)?"

**ISABELLE VERBIST** — "Isabelle is club staff but is marked as playing for the U18. Is she staff only (so the *Plays for* mark should be cleared)?"

**BENJAMIN ROSSIGNOL / NICK MARSHALL / DOUGLAS VANDERLINDEN** — "Does this staff member actually play for the Seniors and therefore need to remain marked as *Plays for*?" (one answer each).

## Execution checklist for Build 136E

Preconditions: every confirmation above recorded (person, answer, who confirmed, date); production still core-deploy-101 or later; the `mergedInto` reactivation guard implemented, tested and deployed.

1. Re-run `scripts/audit-duplicate-players.mjs` and the shared-session probe; **stop a pair** on any conflict or on any new account/membership since this plan.
2. Snapshot, to a local file with `umask 077`: `app:identity:users`, `team_members`, `player_profiles`, `sessions`, `app:roster:boitsfort`, `app:subscriptions`, and the two publish records. Keep the file until post-release verification is signed off.
3. Dry-run script: compute and print the exact before/after JSON for every write (no network writes; tripwire still armed) and have the diff reviewed.
4. Execute one pair at a time under `withIdentityLock`, roster re-read immediately before its write; log every key written.
5. Verify per pair (read-only): one active membership; the kept profile aliases the duplicate; the duplicate profile and roster row gone; the coach-board resolver returns A + B − shared answers for the kept identity; the duplicate's sessions and subscriptions gone; sheet keys re-pointed; both user records intact.
6. Isabelle: clear "Plays for" through the admin action; verify her membership has no `playerGroupId`.
7. Staff decisions for Benjamin / Nick / Douglas applied through the same admin action only where the coach said "no".
8. Re-run the full audit: expect 0 duplicate candidates, 0 staff in the pool; then the post-release verification probes.
9. Tell each confirmed player which account to sign in with; rollback = restore the snapshots (no permanent delete is ever part of this plan).
