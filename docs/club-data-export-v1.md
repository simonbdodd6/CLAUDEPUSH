# Club data export — `coacheasier.club-data-export.v1`

**Status:** Steps 1–2. The pure mapper (`api/_clubDataExport.js`), the source
reader (`api/_clubDataExportSource.js`) and the endpoint
`GET /api/publish?resource=club-data-export` exist, with their tests
(`test/club-data-export.test.js`, `test/club-data-export-endpoint.test.js`).
**The Settings export button stays hidden** until Step 3 is reviewed.

## Purpose

One club's own administration data, as a single JSON document a club owner or
administrator can keep. It is not the AI CEO integration export
(`coacheasier.club-export.v1`, excluded from production); it shares that
export's design rules but none of its code.

## What the mapper does — and does not do

- **Pure.** No storage, network, filesystem, environment, clock or randomness.
  It maps an already-scoped snapshot of one club to the document. Identical
  input gives identical output; `exportedAt` and `exportedBy` are supplied by
  the caller.
- **Allow-list only.** Every field below is copied explicitly. A source record
  is never spread into the output.
- **Fails loudly.** A missing or wrongly shaped section, a field of the wrong
  type, or a record that names another club throws `ClubDataExportError`
  (`code: 'CLUB_EXPORT_INVALID_INPUT'`, `path` naming the value). Nothing is
  skipped or silently repaired.
- **No authorisation.** The mapper does not check, imply or record that its
  caller may export the club.

## The endpoint — `GET /api/publish?resource=club-data-export`

Served by the existing `publish` function (the deployment holds 12 of 12
functions). Any other method → **405**.

1. **Who.** An active session (**401** otherwise) whose membership is the
   **club owner** (`isClubOwner`) or a **club admin**: the `admin` role, which
   must also be club-wide in effect. Everyone else → **403**
   `club_export_not_allowed`, never an empty export. `CLUB_EXPORTS`,
   `MANAGE_TEAMS`, `DANGER_ZONE`, a Full-access profile, covering every group,
   and the Director of Rugby role are each **not** sufficient.
2. **Which club.** `tenantTeamId(session)`. `clubId` / `teamId` in the query
   are ignored.
3. **Reads** (`api/_clubDataExportSource.js`), all through the product's own
   club-aware readers, read-only:
   - identity arrays read raw and filtered to this club (the healing
     `listIdentityState` is not used, so an export never writes);
   - invites via `listClubInvites` (own list + pre-namespace records naming
     the club);
   - roster via the club's own record, with the rows the roster read
     withholds (a staff member's row, a row tied to another club's account)
     withheld here too;
   - training per structure group: the **stored** schedule only (a derived
     default is not club data), sessions **published to players** (the player
     audience's snapshot; coach-audience plans and unpublished sessions are not
     exported; `focus` is the snapshot's `theme`), attendance as the product
     reads it (`migrateAttendanceDoc`);
   - squads: every sheet under the club's `publish:<club>:fixture:*:squad`
     keys (with or without a side) plus the legacy unlinked slot; a sheet whose
     own fixture/side differs from its key is refused;
   - availability per group via `loadAllGroupAvailability`; a legacy bare
     string answer reads as `{ response: <string>, reason: '', respondedAt:
     null }` (the established rule); any other non-object answer is refused;
   - templates the club has **stored** (`storedTemplatesForClub`), never the
     built-in defaults.
4. **Atomic.** Storage unavailable → **503** `storage_unavailable`; a record
   that is malformed or cannot be shown to be this club's → **500**
   `club_export_data_invalid` with a generic message (which record failed is
   logged server-side only); nothing partial is sent. Because the product
   readers treat a present-but-malformed record as absent, the export first
   reads the same keys raw, and reads availability in the reader's opt-in
   `strict` mode. A missing record keeps the readers' normal behaviour; a
   present record of the wrong shape refuses the export:
   - structure — both `groups` and `teams` present, as lists of records;
   - club record — `fixtures`, when present, a list of records (the reader
     would otherwise read "no fixtures", or invent a fixture with a random id
     for a non-object entry);
   - the club and legacy invite lists, and the stored template lists — lists;
   - per group: the training store (and the initial group's legacy store) — a
     record; the attendance register — a record whose `sessions` is a record
     of records; the schedule, by the reader's precedence (the group's record,
     else for the initial group the legacy club-wide record) — a record with a
     `slots` list.
5. **Size.** Serialised exports over **4,000,000 bytes** → **413**
   `club_export_too_large`, never truncated (Vercel Functions cap responses at
   4.5 MB — vercel.com/docs/functions/limitations).
6. **Rate and audit.** 5 exports per user per club per hour (**429**
   `club_export_rate_limited`, with an export-specific message and
   `Retry-After`; a storage outage in the limiter is **503**
   `storage_unavailable`). Each export is audited (`club_data_export`: club,
   user, IP, bytes, counts — no club data) **before** it is sent, with
   `auditLog(..., { required: true })`: a busy audit log is **503**
   `audit_unavailable` and nothing is sent.
7. **Response.** `Content-Type: application/json; charset=utf-8`,
   `Content-Disposition: attachment; filename="coacheasier-club-data-<club>-<date>.json"`,
   `Cache-Control: no-store`.

## Input (all keys required; an empty club passes empty arrays/objects)

| Key | Type |
|---|---|
| `clubId`, `exportedAt`, `exportedBy` | non-empty string |
| `club` | club config record, or `null` |
| `structure` | `{ groups: [], teams: [] }` |
| `members`, `users`, `playerProfiles`, `invites`, `roster`, `fixtures`, `squads`, `templates` | arrays of objects |
| `training` | `{ [groupId]: { schedule: [], sessions: [], attendance: { sessions: {} } } }` |
| `availability` | `{ [groupId]: { [sessionId]: { [answerKey]: answer } } }` |
| `squads[]` | `{ fixtureId?, sideId?, squad: { published, … } }` |

Records carrying a `teamId` (members, player profiles, invites) must carry
`clubId`. Every entry in `users` must be referenced by a member.

## Output

Absent optional strings export as `""`, absent timestamps as `null`, absent
lists as `[]`, absent booleans as `false`. Arrays are sorted (keys in
brackets) so the document is stable.

| Section | Fields |
|---|---|
| `schema` | `"coacheasier.club-data-export.v1"` |
| `exportedAt`, `exportedBy`, `clubId` | string |
| `club` | `null`, or `clubName, teamName, sport, seasonName, seasonStart, seasonEnd, matchDay`: string; `colours: { primary, secondary }`; `logoDataUrl`: string; `trainingDays: [{ day, time }]`; `setupCompletedAt, updatedAt`: string \| null |
| `structure.groups[]` [id] | `id, name, type, developmentCategory, status` |
| `structure.teams[]` [id] | `id, groupId, name, ageGrade, genderCategory, status` |
| `members[]` [id] | `id, userId, role, staffLevel, status`: string; `isOwner, medicalAccess`: boolean (an access grant, not medical data); `accessProfile`: string; `accessScope`: `null` (not stored) or `{ clubWide, groups: [{ groupId, status }], teams: [{ teamId, status }] }`; `playerGroupId`: string; `eligibility`: `null` or `{ teamIds: string[], primaryTeamId }`; `joinedAt, approvedAt, removedAt`: string \| null; `mergedInto`: string |
| `people[]` [id] | `id, displayName, firstName, lastName, email`: string; `emailVerified`: boolean |
| `playerProfiles[]` [id] | `id, teamMemberId, userId, displayName, position, phone, email`: string; `createdAt`: string \| null |
| `pendingRequests[]` | derived from members with `status: "pending"`: `memberId, userId, role, playerGroupId, requestedAt` |
| `invites[]` [createdAt, email, name, role, status] | `kind` (`personal` \| `group`), `name, email, role, staffLevel, playerGroupId`; `scope`: `null` or `{ clubWide, groupIds: string[], teamId }`; `status`; `createdAt, expiresAt, acceptedAt, revokedAt`: string \| null; `createdBy`. **No id** — an invitation's id is its token. |
| `roster[]` [id] | `id, userId, name, firstName, lastName, position`; `secondaryPositions`: string[]; `jerseyNumber`: string \| number \| null; `email, phone, dateOfBirth, address, parentGuardianName, parentGuardianEmail, emergencyContact, emergencyPhone, registrationStatus, contractStatus, joinedDate` |
| `fixtures[]` [date, id] | `id, groupId, sideId, team, opposition, competition, date, time, arrivalTime, venue, homeAway, status, meetingPoint, transportNotes, referee, notes, externalId`; `createdAt, updatedAt`: string \| null |
| `training[]` [groupId] | `groupId`; `schedule[]` [id]: `id, day, startTime, endTime, venue, arrivalTime, effectiveFrom, effectiveTo, active` (boolean, default true)`, sessionId`; `sessions[]` [date, id] (**published only**): `id, title, type, date, startTime, endTime, location, coachName, focus, deadline, blocks: [{ time, activity }], publishedAt`; `attendance[]` [sessionId]: `sessionId, date, title, sourceSessionId, marks: [{ player, status }], updatedAt` |
| `squads[]` [fixtureId, sideId, kickoffDate] (**published only**) | `fixtureId, sideId, publishedAt, opposition, competition, kickoffDate, kickoffTime, arrivalTime, venue, kit, announcement, gamePlan`; `starters, starterKeys: [{ slot, value }]`; `bench, benchKeys`: string[]; `matchMinutes`: number \| null; `substitutions: [{ id, minute, offKey, onKey, offName, onName }]` |
| `availability[]` [groupId, sessionId] | `groupId, sessionId, answers: [{ key, userId, playerId, response, reason, respondedAt }]` |
| `templates[]` [id] | `id, name, category, title, body`; `createdAt, updatedAt`: string \| null |
| `medical` | always `{ included: false, reason }` — no medical values |
| `counts` | `groups, teams, members, people, playerProfiles, pendingRequests, invites, roster, fixtures, trainingSlots, trainingSessions, attendanceRegisters, squads, availabilitySessions, availabilityAnswers, templates` — counts of the exported records only |

## Never exported

- **Chat** of any kind, including private messages.
- **Medical:** cases, diagnoses, notes, clearance, timelines, and the roster
  row's own `medical` text.
- **Drafts:** unpublished sessions and squads, coach sheets, Match Centre drafts.
- **Performance / S&C** programmes and assignments.
- **Invite tokens, links and URLs**, and `legacyPlayerId` (it can be derived
  from a personal invite's token).
- **Credentials:** password hash, salt and algorithm; sessions; reset and
  verification tokens; push subscriptions.
- **Platform and cross-club data:** platform roles and grants, `lastTeamId`,
  previous emails, login metadata, notification preferences, billing ids
  (`stripe*`), the error log and the cross-club audit log.
- **Roster:** `mediaConsent` (device-local by contract), free-text `notes`,
  photos, and the legacy availability columns.
- **Club record:** its embedded `fixtures` copy and `firstFixture` (the
  fixtures section is the source), weekly-automation runtime/debug fields,
  `updatedBy`.
- Any field not listed in the Output table.
