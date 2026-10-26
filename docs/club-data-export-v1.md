# Club data export — `coacheasier.club-data-export.v1`

**Status:** Step 1 only. The pure mapper (`api/_clubDataExport.js`) and its tests
(`test/club-data-export.test.js`) exist. **There is no endpoint yet**, and the
Settings export button stays hidden until the endpoint and its authorisation
are implemented, tested and reviewed.

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

## Requirements on the future endpoint (Step 2, not implemented)

1. **Owner / club administrator only**, enforced server-side. `CLUB_EXPORTS`,
   `MANAGE_TEAMS` or covering every group are **not** sufficient on their own
   (the group-scoped Coach and Manager profiles hold `CLUB_EXPORTS`).
2. **The club is the session's** (`tenantTeamId`), never a request parameter.
3. **Read every section through the club's own readers**, so legacy merge and
   ownership rules apply, and pass `users` filtered to this club's members.
4. **Atomic:** any storage error fails the whole export (no partial file).
5. Audit the export and rate-limit it; `Cache-Control: no-store`; attachment
   download.

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
