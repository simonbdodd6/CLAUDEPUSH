// THE CLUB DATA EXPORT — Step 2: gathering one club's source records.
//
// Produces the INPUT that buildClubDataExport (api/_clubDataExport.js) maps
// into coacheasier.club-data-export.v1. Schema and policy:
// docs/club-data-export-v1.md. This module neither authorises nor maps: the
// endpoint has already decided the caller may export `clubId` (owner / club
// admin, from the session), and the mapper's allow-lists decide what leaves.
//
// THE CLUB IS THE CALLER'S. `clubId` is the session's club and nothing else;
// every read below is that club's own record, through the reader the product
// already uses for it, so the legacy-ownership rules (default-club flat keys,
// the initial group's club-level fallbacks, pre-namespace invites) are the
// product's, not re-invented here.
//
// READS ONLY. The readers are handed in by api/publish.js, several being
// private to it. Readers that can repair records as a side effect
// (listIdentityState heals and persists) are deliberately not used: the
// identity arrays are read raw and filtered to this club.
//
// ATOMIC. Any read that fails throws (a storage outage is STORAGE_UNAVAILABLE,
// 503), and so does a record that cannot be shown to be this club's — the
// caller then returns no export at all, never a partial one.

export class ClubDataExportScopeError extends Error {
  constructor(section, message) {
    super(`club data export: ${section}: ${message}`);
    this.name = 'ClubDataExportScopeError';
    this.section = section;
    this.code = 'CLUB_EXPORT_SCOPE';
  }
}
const scopeFail = (section, message) => { throw new ClubDataExportScopeError(section, message); };
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The established reading of a legacy availability answer: a bare string IS
 * the response, with no reason and no time (api/availability.js, the board's
 * status view). Objects pass through for the mapper's allow-list; anything
 * else is left as it is, so the mapper refuses it rather than this guessing.
 */
export function normalizeAvailabilityAnswers(store) {
  const out = {};
  for (const [answerKey, value] of Object.entries(store)) {
    out[answerKey] = typeof value === 'string' ? { response: value, reason: '', respondedAt: null } : value;
  }
  return out;
}

/**
 * A training session as PUBLISHED TO PLAYERS — the player audience's frozen
 * snapshot (api/publish.js playerSessionSnapshot). The coach audience carries
 * staff-only planning (block leaders, cues, staff notes) and is not exported;
 * a session never published to players is a draft and is not exported.
 */
export function playerPublishedSessions(store, section) {
  if (!isObj(store)) scopeFail(section, 'the training publication store is not an object');
  const out = [];
  for (const [id, record] of Object.entries(store)) {
    if (!isObj(record)) scopeFail(`${section}.${id}`, 'expected an object');
    const entry = record.player;
    if (!isObj(entry) || !entry.publishedAt) continue;
    const snap = isObj(entry.snapshot) ? entry.snapshot : scopeFail(`${section}.${id}`, 'published without a snapshot');
    out.push({
      id, published: true, publishedAt: entry.publishedAt,
      title: snap.title, type: snap.type, date: snap.date, startTime: snap.startTime, endTime: snap.endTime,
      location: snap.location, focus: snap.theme, blocks: snap.blocks,
    });
  }
  return out;
}

/**
 * Everything one club holds that the v1 export carries.
 *
 * readers = {
 *   assertStructureRecord(clubId), assertClubRecord(clubId), assertClubLists(clubId), assertGroupRecords(clubId, groupId)
 *     — raw-shape checks: throw when a stored record is present but malformed,
 *   loadStructure(clubId), readClubFixtures(clubId) → { club, fixtures },
 *   loadUsers(), loadTeamMembers(), loadPlayerProfiles(), listClubInvites(clubId),
 *   readRoster(clubId) → { players } | null, withholdNonPlayerRows(args),
 *   readTrainingSchedule(clubId, groupId) → { record, seeded }, readGroupTrainingStore(clubId, groupId),
 *   readAttendance(clubId, groupId) → { sessions }, listPublishedSquads(clubId),
 *   loadAllGroupAvailability(clubId, groupId), storedTemplates(clubId),
 * }
 */
export async function collectClubDataExportInput(clubId, readers) {
  const id = String(clubId || '');
  if (!id) scopeFail('clubId', 'is required');

  // A present-but-malformed record would be read as absent (a corrupted
  // structure becomes a synthesised one-group club): refuse instead. These
  // run before the readers whose fallbacks they guard.
  await readers.assertStructureRecord(id);
  await readers.assertClubRecord(id);
  await readers.assertClubLists(id);

  const structure = await readers.loadStructure(id);
  if (!isObj(structure) || !Array.isArray(structure.groups) || !Array.isArray(structure.teams)) {
    scopeFail('structure', 'could not be read');
  }
  if (String(structure.clubId || '') !== id) scopeFail('structure', 'belongs to another club');

  const { club, fixtures } = await readers.readClubFixtures(id);
  if (!isObj(club)) scopeFail('club', 'could not be read');
  if (!Array.isArray(fixtures)) scopeFail('fixtures', 'could not be read');

  // Identity: raw arrays, filtered to THIS club. People are only the accounts
  // behind this club's memberships, so a person in two clubs travels once,
  // with no sight of their other club.
  const [allUsers, allMembers, allProfiles] = await Promise.all([
    readers.loadUsers(), readers.loadTeamMembers(), readers.loadPlayerProfiles(),
  ]);
  for (const [section, rows] of [['users', allUsers], ['members', allMembers], ['playerProfiles', allProfiles]]) {
    if (!Array.isArray(rows)) scopeFail(section, 'could not be read');
  }
  const members = allMembers.filter(m => isObj(m) && String(m.teamId) === id);
  const memberUserIds = new Set(members.map(m => String(m.userId || '')));
  const users = allUsers.filter(u => isObj(u) && memberUserIds.has(String(u.id || '')));
  const playerProfiles = allProfiles.filter(p => isObj(p) && String(p.teamId) === id);

  // Invites: the club's own list plus pre-namespace records that name it — the
  // product's own ownership rule (listClubInvites). The mapper drops the token.
  const invites = await readers.listClubInvites(id);
  if (!Array.isArray(invites)) scopeFail('invites', 'could not be read');

  // Roster: the club's own record. Rows the roster read already withholds —
  // a staff member's row, or a row tied to ANOTHER club's account — are
  // withheld here too, by the same rule (withholdNonPlayerRows).
  const rosterRecord = await readers.readRoster(id);
  const storedRows = rosterRecord === null || rosterRecord === undefined ? [] : rosterRecord.players;
  if (!Array.isArray(storedRows)) scopeFail('roster', 'the stored roster is not a list of rows');
  const roster = readers.withholdNonPlayerRows({
    rows: storedRows, members, users: allUsers, profiles: allProfiles, teamId: id,
  }).rows;

  // Training, per group of the club's structure (archived groups included —
  // their history is still the club's).
  const training = {};
  for (const group of structure.groups) {
    const gid = String(group.id);
    await readers.assertGroupRecords(id, gid);
    // Only a STORED schedule is club data. With nothing stored the reader
    // derives one (from club.trainingDays, else Tue/Thu 19:00 defaults) — the
    // club's own trainingDays already travel in `club`, and product defaults
    // are not the club's records.
    const { record, seeded } = await readers.readTrainingSchedule(id, gid);
    if (!Array.isArray(record?.slots)) scopeFail(`training.${gid}.schedule`, 'could not be read');
    const schedule = seeded ? [] : record.slots;
    const store = await readers.readGroupTrainingStore(id, gid);
    const attendance = await readers.readAttendance(id, gid);
    if (!isObj(attendance)) scopeFail(`training.${gid}.attendance`, 'could not be read');
    training[gid] = {
      schedule,
      sessions: playerPublishedSessions(store, `training.${gid}.sessions`),
      attendance,
    };
  }

  // Squads: every sheet stored under this club's own fixture keys, plus the
  // legacy unlinked slot. A record that names a different fixture or side
  // from the key it was read under is inconsistent — refused, not guessed.
  const squads = await readers.listPublishedSquads(id);
  if (!Array.isArray(squads)) scopeFail('squads', 'could not be read');
  squads.forEach((rec, i) => {
    if (!isObj(rec) || !isObj(rec.squad)) scopeFail(`squads[${i}]`, 'expected { squad }');
    const { squad } = rec;
    if (rec.fixtureId && squad.fixtureId && String(squad.fixtureId) !== String(rec.fixtureId)) {
      scopeFail(`squads[${i}]`, 'the sheet names a different fixture from the key it is stored under');
    }
    if (rec.sideId && squad.sideId && String(squad.sideId) !== String(rec.sideId)) {
      scopeFail(`squads[${i}]`, 'the sheet names a different side from the key it is stored under');
    }
  });

  // Availability, per group: the group's own records (and, for the initial
  // group, the club-level and default-club legacy records the product reads).
  const availability = {};
  for (const group of structure.groups) {
    const gid = String(group.id);
    const bySession = await readers.loadAllGroupAvailability(id, gid);
    if (!isObj(bySession)) scopeFail(`availability.${gid}`, 'could not be read');
    const sessions = {};
    for (const [sessionId, store] of Object.entries(bySession)) {
      if (!isObj(store)) scopeFail(`availability.${gid}.${sessionId}`, 'expected an object of answers');
      sessions[sessionId] = normalizeAvailabilityAnswers(store);
    }
    availability[gid] = sessions;
  }

  const templates = await readers.storedTemplates(id);
  if (!Array.isArray(templates)) scopeFail('templates', 'could not be read');

  return {
    // A club that never saved its settings reads back as an empty object.
    club: Object.keys(club).length ? club : null,
    structure, members, users, playerProfiles, invites, roster,
    fixtures, training, squads, availability, templates,
  };
}
