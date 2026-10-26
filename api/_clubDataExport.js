// THE CLUB DATA EXPORT — coacheasier.club-data-export.v1 (Step 1: the mapper).
//
// One club's own administration data, as a single JSON document a club
// administrator can keep. Schema and policy: docs/club-data-export-v1.md.
//
// PURE. No storage, network, filesystem, environment, clock or randomness:
// the caller hands in an ALREADY-SCOPED snapshot of one club plus the export
// metadata, and gets the document back. Identical input gives identical
// output. Nothing here authorises anything — that the caller is allowed to
// export this club is the endpoint's job (owner / club admin, decided
// server-side from the session), and this module neither checks nor implies it.
//
// ALLOW-LIST ONLY. Every output record is built field by field from the stored
// shapes verified in the repository (api/publish.js sanitisers, the identity
// store, api/_rosterProjection.js, api/templates.js). A source record is never
// spread into the output, so a field nobody listed here — a credential, a
// token, a platform role, a medical note — cannot travel by accident.
//
// FAIL LOUDLY. A required section that is missing or has the wrong shape, a
// field of the wrong type, or a record that belongs to ANOTHER club throws a
// ClubDataExportError naming the exact path. A half-built export that silently
// lacks a section would read as a complete one.
//
// NEVER EXPORTED (by construction — there is no input or output for them):
// chat and private messages; medical cases, notes, clearance and timelines
// (and the roster's own `medical` text); drafts and unpublished sheets,
// squads or sessions; performance / S&C; invite tokens and links; password
// data, sessions, reset and verification tokens, push subscriptions; platform
// roles, `lastTeamId`, previous emails and login metadata; billing ids; error
// and audit logs.

export const CLUB_DATA_EXPORT_SCHEMA = 'coacheasier.club-data-export.v1';

export class ClubDataExportError extends Error {
  constructor(path, message) {
    super(`club data export: ${path}: ${message}`);
    this.name = 'ClubDataExportError';
    this.path = path;
    this.code = 'CLUB_EXPORT_INVALID_INPUT';
  }
}

// ── field readers: absent → the documented empty value; wrong type → throw ──

const fail = (path, message) => { throw new ClubDataExportError(path, message); };
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const absent = v => v === undefined || v === null;

function str(rec, field, path) {
  const v = rec[field];
  if (absent(v)) return '';
  if (typeof v !== 'string') fail(`${path}.${field}`, `expected a string, got ${typeof v}`);
  return v;
}
function nstr(rec, field, path) {             // string or null (timestamps)
  const v = rec[field];
  if (absent(v) || v === '') return null;
  if (typeof v !== 'string') fail(`${path}.${field}`, `expected a string or null, got ${typeof v}`);
  return v;
}
function bool(rec, field, path) {
  const v = rec[field];
  if (absent(v)) return false;
  if (typeof v !== 'boolean') fail(`${path}.${field}`, `expected a boolean, got ${typeof v}`);
  return v;
}
function strOrNum(rec, field, path) {         // jersey numbers are typed either way
  const v = rec[field];
  if (absent(v) || v === '') return null;
  if (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) return v;
  return fail(`${path}.${field}`, `expected a string or number, got ${typeof v}`);
}
function strList(rec, field, path) {
  const v = rec[field];
  if (absent(v)) return [];
  if (!Array.isArray(v)) fail(`${path}.${field}`, 'expected an array');
  return v.map((x, i) => (typeof x === 'string' ? x : fail(`${path}.${field}[${i}]`, 'expected a string')));
}
function reqStr(rec, field, path) {
  const v = str(rec, field, path);
  if (!v) fail(`${path}.${field}`, 'is required');
  return v;
}
function list(input, field) {
  const v = input[field];
  if (!Array.isArray(v)) fail(field, 'is required and must be an array');
  v.forEach((x, i) => { if (!isObj(x)) fail(`${field}[${i}]`, 'expected an object'); });
  return v;
}
function obj(input, field) {
  const v = input[field];
  if (!isObj(v)) fail(field, 'is required and must be an object');
  return v;
}
const byKey = (...keys) => (a, b) => {
  for (const k of keys) {
    const x = String(a[k] ?? ''), y = String(b[k] ?? '');
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
};
/** A record that names a club must name THIS club. */
function ownClub(rec, path, clubId) {
  if (absent(rec.teamId)) return;
  if (rec.teamId !== clubId) fail(`${path}.teamId`, 'belongs to another club');
}

// ── section mappers ─────────────────────────────────────────────────────────

function mapClub(raw) {
  if (raw === null) return null;            // a club that has never saved its settings
  if (!isObj(raw)) fail('club', 'must be an object or null');
  const colours = absent(raw.colours) ? {} : raw.colours;
  if (!isObj(colours)) fail('club.colours', 'expected an object');
  const days = absent(raw.trainingDays) ? [] : raw.trainingDays;
  if (!Array.isArray(days)) fail('club.trainingDays', 'expected an array');
  return {
    clubName:   str(raw, 'clubName', 'club'),
    teamName:   str(raw, 'teamName', 'club'),
    sport:      str(raw, 'sport', 'club'),
    seasonName: str(raw, 'seasonName', 'club'),
    seasonStart: str(raw, 'seasonStart', 'club'),
    seasonEnd:   str(raw, 'seasonEnd', 'club'),
    matchDay:   str(raw, 'matchDay', 'club'),
    colours: { primary: str(colours, 'primary', 'club.colours'), secondary: str(colours, 'secondary', 'club.colours') },
    logoDataUrl: str(raw, 'logoDataUrl', 'club'),
    trainingDays: days.map((d, i) => {
      const p = `club.trainingDays[${i}]`;
      if (!isObj(d)) fail(p, 'expected an object');
      return { day: str(d, 'day', p), time: str(d, 'time', p) };
    }),
    setupCompletedAt: nstr(raw, 'setupCompletedAt', 'club'),
    updatedAt: nstr(raw, 'updatedAt', 'club'),
  };
}

function mapStructure(raw) {
  const groups = Array.isArray(raw.groups) ? raw.groups : fail('structure.groups', 'is required and must be an array');
  const teams = Array.isArray(raw.teams) ? raw.teams : fail('structure.teams', 'is required and must be an array');
  return {
    groups: groups.map((g, i) => {
      const p = `structure.groups[${i}]`;
      if (!isObj(g)) fail(p, 'expected an object');
      return { id: reqStr(g, 'id', p), name: str(g, 'name', p), type: str(g, 'type', p),
        developmentCategory: str(g, 'developmentCategory', p), status: str(g, 'status', p) };
    }).sort(byKey('id')),
    teams: teams.map((t, i) => {
      const p = `structure.teams[${i}]`;
      if (!isObj(t)) fail(p, 'expected an object');
      return { id: reqStr(t, 'id', p), groupId: reqStr(t, 'groupId', p), name: str(t, 'name', p),
        ageGrade: str(t, 'ageGrade', p), genderCategory: str(t, 'genderCategory', p), status: str(t, 'status', p) };
    }).sort(byKey('id')),
  };
}

function mapGrantList(raw, idField, path) {
  if (absent(raw)) return [];
  if (!Array.isArray(raw)) fail(path, 'expected an array');
  return raw.map((g, i) => {
    const p = `${path}[${i}]`;
    if (!isObj(g)) fail(p, 'expected an object');
    return { [idField]: reqStr(g, idField, p), status: str(g, 'status', p) };
  }).sort(byKey(idField));
}

function mapMember(m, i, clubId) {
  const p = `members[${i}]`;
  ownClub(m, p, clubId);
  let accessScope = null;
  if (!absent(m.accessScope)) {
    if (!isObj(m.accessScope)) fail(`${p}.accessScope`, 'expected an object');
    accessScope = {
      clubWide: bool(m.accessScope, 'clubWide', `${p}.accessScope`),
      groups: mapGrantList(m.accessScope.groups, 'groupId', `${p}.accessScope.groups`),
      teams: mapGrantList(m.accessScope.teams, 'teamId', `${p}.accessScope.teams`),
    };
  }
  let eligibility = null;
  if (!absent(m.eligibility)) {
    if (!isObj(m.eligibility)) fail(`${p}.eligibility`, 'expected an object');
    eligibility = { teamIds: strList(m.eligibility, 'teamIds', `${p}.eligibility`).slice().sort(),
      primaryTeamId: nstr(m.eligibility, 'primaryTeamId', `${p}.eligibility`) };
  }
  return {
    id: reqStr(m, 'id', p), userId: reqStr(m, 'userId', p),
    role: str(m, 'role', p), staffLevel: str(m, 'staffLevel', p), status: str(m, 'status', p),
    isOwner: bool(m, 'isOwner', p), accessProfile: str(m, 'accessProfile', p), accessScope,
    medicalAccess: bool(m, 'medicalAccess', p),
    playerGroupId: str(m, 'playerGroupId', p), eligibility,
    joinedAt: nstr(m, 'joinedAt', p), approvedAt: nstr(m, 'approvedAt', p),
    removedAt: nstr(m, 'removedAt', p), mergedInto: str(m, 'mergedInto', p),
  };
}

function mapPerson(u, i) {
  const p = `users[${i}]`;
  return { id: reqStr(u, 'id', p), displayName: str(u, 'displayName', p),
    firstName: str(u, 'firstName', p), lastName: str(u, 'lastName', p),
    email: str(u, 'email', p), emailVerified: bool(u, 'emailVerified', p) };
}

function mapProfile(pr, i, clubId) {
  const p = `playerProfiles[${i}]`;
  ownClub(pr, p, clubId);
  return { id: reqStr(pr, 'id', p), teamMemberId: str(pr, 'teamMemberId', p), userId: str(pr, 'userId', p),
    displayName: str(pr, 'displayName', p), position: str(pr, 'position', p),
    phone: str(pr, 'phone', p), email: str(pr, 'email', p), createdAt: nstr(pr, 'createdAt', p) };
}

function mapInviteScope(raw, path) {
  if (absent(raw)) return null;
  if (!isObj(raw)) fail(path, 'expected an object');
  const ids = absent(raw.groupIds) ? (str(raw, 'groupId', path) ? [raw.groupId] : []) : strList(raw, 'groupIds', path);
  return { clubWide: bool(raw, 'clubWide', path), groupIds: ids.slice().sort(), teamId: str(raw, 'teamId', path) };
}

function mapInvite(inv, i, clubId) {
  const p = `invites[${i}]`;
  ownClub(inv, p, clubId);
  // The invitation's id IS its claimable token, so an exported invite has no
  // id at all — nothing that could be pasted into a join link.
  return {
    kind: str(inv, 'kind', p) || 'personal', name: str(inv, 'name', p), email: str(inv, 'email', p),
    role: str(inv, 'role', p), staffLevel: str(inv, 'staffLevel', p), playerGroupId: str(inv, 'playerGroupId', p),
    scope: mapInviteScope(inv.scope, `${p}.scope`), status: str(inv, 'status', p),
    createdAt: nstr(inv, 'createdAt', p), expiresAt: nstr(inv, 'expiresAt', p),
    acceptedAt: nstr(inv, 'acceptedAt', p), revokedAt: nstr(inv, 'revokedAt', p), createdBy: str(inv, 'createdBy', p),
  };
}

// Coach-maintained roster detail, by the field names the app writes. The row's
// own `medical` text, media consent (device-local by contract), free-text
// notes, legacy ids and the legacy availability columns are not exported.
function mapRosterRow(r, i) {
  const p = `roster[${i}]`;
  return {
    id: reqStr(r, 'id', p), userId: str(r, 'userId', p), name: str(r, 'name', p),
    firstName: str(r, 'firstName', p), lastName: str(r, 'lastName', p),
    position: str(r, 'position', p), secondaryPositions: strList(r, 'secondaryPositions', p),
    jerseyNumber: strOrNum(r, 'jerseyNumber', p),
    email: str(r, 'email', p), phone: str(r, 'phone', p), dateOfBirth: str(r, 'dateOfBirth', p),
    address: str(r, 'address', p),
    parentGuardianName: str(r, 'parentGuardianName', p), parentGuardianEmail: str(r, 'parentGuardianEmail', p),
    emergencyContact: str(r, 'emergencyContact', p), emergencyPhone: str(r, 'emergencyPhone', p),
    registrationStatus: str(r, 'registrationStatus', p), contractStatus: str(r, 'contractStatus', p),
    joinedDate: str(r, 'joinedDate', p),
  };
}

function mapFixture(f, i) {
  const p = `fixtures[${i}]`;
  return {
    id: reqStr(f, 'id', p), groupId: str(f, 'groupId', p), sideId: str(f, 'sideId', p), team: str(f, 'team', p),
    opposition: str(f, 'opposition', p), competition: str(f, 'competition', p),
    date: str(f, 'date', p), time: str(f, 'time', p), arrivalTime: str(f, 'arrivalTime', p),
    venue: str(f, 'venue', p), homeAway: str(f, 'homeAway', p), status: str(f, 'status', p),
    meetingPoint: str(f, 'meetingPoint', p), transportNotes: str(f, 'transportNotes', p),
    referee: str(f, 'referee', p), notes: str(f, 'notes', p), externalId: str(f, 'externalId', p),
    createdAt: nstr(f, 'createdAt', p), updatedAt: nstr(f, 'updatedAt', p),
  };
}

function mapSlot(s, p) {
  return { id: reqStr(s, 'id', p), day: str(s, 'day', p), startTime: str(s, 'startTime', p), endTime: str(s, 'endTime', p),
    venue: str(s, 'venue', p), arrivalTime: str(s, 'arrivalTime', p),
    effectiveFrom: str(s, 'effectiveFrom', p), effectiveTo: str(s, 'effectiveTo', p),
    active: absent(s.active) ? true : bool(s, 'active', p), sessionId: str(s, 'sessionId', p) };
}

function mapSession(s, p) {
  const blocks = absent(s.blocks) ? [] : s.blocks;
  if (!Array.isArray(blocks)) fail(`${p}.blocks`, 'expected an array');
  return { id: reqStr(s, 'id', p), title: str(s, 'title', p), type: str(s, 'type', p), date: str(s, 'date', p),
    startTime: str(s, 'startTime', p), endTime: str(s, 'endTime', p), location: str(s, 'location', p),
    coachName: str(s, 'coachName', p), focus: str(s, 'focus', p), deadline: str(s, 'deadline', p),
    blocks: blocks.map((b, j) => {
      if (!isObj(b)) fail(`${p}.blocks[${j}]`, 'expected an object');
      return { time: str(b, 'time', `${p}.blocks[${j}]`), activity: str(b, 'activity', `${p}.blocks[${j}]`) };
    }),
    publishedAt: nstr(s, 'publishedAt', p) };
}

function mapAttendance(sessions, p) {
  if (!isObj(sessions)) fail(p, 'expected an object of sessions');
  return Object.keys(sessions).sort().map(sid => {
    const a = sessions[sid], q = `${p}.${sid}`;
    if (!isObj(a)) fail(q, 'expected an object');
    const marks = absent(a.marks) ? {} : a.marks;
    if (!isObj(marks)) fail(`${q}.marks`, 'expected an object');
    return { sessionId: sid, date: str(a, 'date', q), title: str(a, 'title', q),
      sourceSessionId: str(a, 'sourceSessionId', q),
      marks: Object.keys(marks).sort().map(k => {
        if (typeof marks[k] !== 'string') fail(`${q}.marks.${k}`, 'expected a string');
        return { player: k, status: marks[k] };
      }),
      updatedAt: nstr(a, 'updatedAt', q) };
  });
}

/** training: { [groupId]: { schedule: slot[], sessions: session[], attendance: {sessions:{…}} } } */
function mapTraining(raw) {
  return Object.keys(raw).sort().map(groupId => {
    const g = raw[groupId], p = `training.${groupId}`;
    if (!isObj(g)) fail(p, 'expected an object');
    if (!Array.isArray(g.schedule)) fail(`${p}.schedule`, 'is required and must be an array');
    if (!Array.isArray(g.sessions)) fail(`${p}.sessions`, 'is required and must be an array');
    if (!isObj(g.attendance)) fail(`${p}.attendance`, 'is required and must be an object');
    return {
      groupId,
      schedule: g.schedule.map((s, i) => (isObj(s) ? mapSlot(s, `${p}.schedule[${i}]`) : fail(`${p}.schedule[${i}]`, 'expected an object'))).sort(byKey('id')),
      // Published sessions only: an unpublished session is a draft.
      sessions: g.sessions.map((s, i) => (isObj(s) ? s : fail(`${p}.sessions[${i}]`, 'expected an object')))
        .map((s, i) => ({ s, i })).filter(({ s, i }) => bool(s, 'published', `${p}.sessions[${i}]`))
        .map(({ s, i }) => mapSession(s, `${p}.sessions[${i}]`)).sort(byKey('date', 'id')),
      attendance: mapAttendance(absent(g.attendance.sessions) ? {} : g.attendance.sessions, `${p}.attendance.sessions`),
    };
  });
}

function mapSquadRecord(rec, i) {
  const p = `squads[${i}]`;
  const q = isObj(rec.squad) ? rec.squad : fail(`${p}.squad`, 'is required and must be an object');
  const names = absent(q.formationNames) ? {} : q.formationNames;
  const keys = absent(q.formationKeys) ? {} : q.formationKeys;
  if (!isObj(names)) fail(`${p}.squad.formationNames`, 'expected an object');
  if (!isObj(keys)) fail(`${p}.squad.formationKeys`, 'expected an object');
  const subs = absent(q.substitutions) ? [] : q.substitutions;
  if (!Array.isArray(subs)) fail(`${p}.squad.substitutions`, 'expected an array');
  const slotMap = (o, path) => Object.keys(o).sort().map(slot =>
    ({ slot, value: typeof o[slot] === 'string' ? o[slot] : fail(`${path}.${slot}`, 'expected a string') }));
  return {
    fixtureId: str(q, 'fixtureId', `${p}.squad`) || str(rec, 'fixtureId', p),
    sideId: str(q, 'sideId', `${p}.squad`) || str(rec, 'sideId', p),
    publishedAt: nstr(q, 'publishedAt', `${p}.squad`),
    opposition: str(q, 'opposition', `${p}.squad`), competition: str(q, 'competition', `${p}.squad`),
    kickoffDate: str(q, 'kickoffDate', `${p}.squad`), kickoffTime: str(q, 'kickoffTime', `${p}.squad`),
    arrivalTime: str(q, 'arrivalTime', `${p}.squad`), venue: str(q, 'venue', `${p}.squad`),
    kit: str(q, 'kit', `${p}.squad`), announcement: str(q, 'announcement', `${p}.squad`),
    gamePlan: str(q, 'gamePlan', `${p}.squad`),
    starters: slotMap(names, `${p}.squad.formationNames`),
    starterKeys: slotMap(keys, `${p}.squad.formationKeys`),
    bench: strList(q, 'benchPlayers', `${p}.squad`),
    benchKeys: strList(q, 'benchKeys', `${p}.squad`),
    matchMinutes: absent(q.matchMinutes) ? null
      : (typeof q.matchMinutes === 'number' ? q.matchMinutes : fail(`${p}.squad.matchMinutes`, 'expected a number')),
    substitutions: subs.map((s, j) => {
      const r = `${p}.squad.substitutions[${j}]`;
      if (!isObj(s)) fail(r, 'expected an object');
      if (typeof s.minute !== 'number') fail(`${r}.minute`, 'expected a number');
      return { id: str(s, 'id', r), minute: s.minute, offKey: str(s, 'offKey', r), onKey: str(s, 'onKey', r),
        offName: str(s, 'offName', r), onName: str(s, 'onName', r) };
    }),
  };
}

/** availability: { [groupId]: { [sessionId]: { [answerKey]: answer } } } */
function mapAvailability(raw) {
  const out = [];
  for (const groupId of Object.keys(raw).sort()) {
    const sessions = raw[groupId], p = `availability.${groupId}`;
    if (!isObj(sessions)) fail(p, 'expected an object of sessions');
    for (const sessionId of Object.keys(sessions).sort()) {
      const answers = sessions[sessionId], q = `${p}.${sessionId}`;
      if (!isObj(answers)) fail(q, 'expected an object of answers');
      out.push({ groupId, sessionId, answers: Object.keys(answers).sort().map(k => {
        const a = answers[k], r = `${q}.${k}`;
        if (!isObj(a)) fail(r, 'expected an object');
        return { key: k, userId: str(a, 'userId', r), playerId: str(a, 'playerId', r),
          response: str(a, 'response', r), reason: str(a, 'reason', r), respondedAt: nstr(a, 'respondedAt', r) };
      }) });
    }
  }
  return out;
}

function mapTemplate(t, i) {
  const p = `templates[${i}]`;
  return { id: reqStr(t, 'id', p), name: str(t, 'name', p), category: str(t, 'category', p),
    title: str(t, 'title', p), body: str(t, 'body', p), createdAt: nstr(t, 'createdAt', p), updatedAt: nstr(t, 'updatedAt', p) };
}

// ── the document ────────────────────────────────────────────────────────────

/**
 * Build the export document for ONE club from an already-scoped snapshot.
 *
 * input = {
 *   clubId,                       the authenticated session's club (never a request parameter)
 *   exportedAt, exportedBy,       metadata, supplied by the caller
 *   club,                         the club config record, or null
 *   structure,                    { groups[], teams[] }
 *   members, users, playerProfiles, invites, roster, fixtures, squads, templates   (arrays)
 *   training,                     { [groupId]: { schedule[], sessions[], attendance{} } }
 *   availability,                 { [groupId]: { [sessionId]: { [answerKey]: answer } } }
 * }
 *
 * Every key is required (an empty club passes empty arrays/objects), so a
 * caller cannot drop a section by forgetting it.
 */
export function buildClubDataExport(input) {
  if (!isObj(input)) fail('input', 'must be an object');
  const clubId = reqStr(input, 'clubId', 'input');
  const exportedAt = reqStr(input, 'exportedAt', 'input');
  const exportedBy = reqStr(input, 'exportedBy', 'input');
  if (!('club' in input)) fail('club', 'is required (null for a club with no saved settings)');

  const club = mapClub(input.club);
  const structure = mapStructure(obj(input, 'structure'));
  const members = list(input, 'members').map((m, i) => mapMember(m, i, clubId)).sort(byKey('id'));

  // People: exactly the accounts behind this club's memberships. An account no
  // member of this club refers to is another club's person — refused.
  const memberUserIds = new Set(members.map(m => m.userId));
  const people = list(input, 'users').map((u, i) => {
    const person = mapPerson(u, i);
    if (!memberUserIds.has(person.id)) fail(`users[${i}].id`, 'is not a member of this club');
    return person;
  }).sort(byKey('id'));

  const playerProfiles = list(input, 'playerProfiles').map((pr, i) => mapProfile(pr, i, clubId)).sort(byKey('id'));
  const pendingRequests = members.filter(m => m.status === 'pending')
    .map(m => ({ memberId: m.id, userId: m.userId, role: m.role, playerGroupId: m.playerGroupId, requestedAt: m.joinedAt }));
  const invites = list(input, 'invites').map((inv, i) => mapInvite(inv, i, clubId))
    .sort(byKey('createdAt', 'email', 'name', 'role', 'status'));
  const roster = list(input, 'roster').map(mapRosterRow).sort(byKey('id'));
  const fixtures = list(input, 'fixtures').map(mapFixture).sort(byKey('date', 'id'));
  const training = mapTraining(obj(input, 'training'));
  // Published squads only: an unpublished sheet is a draft.
  const squads = list(input, 'squads').map((rec, i) => ({ rec, i }))
    .filter(({ rec, i }) => (isObj(rec.squad) ? bool(rec.squad, 'published', `squads[${i}].squad`)
      : fail(`squads[${i}].squad`, 'is required and must be an object')))
    .map(({ rec, i }) => mapSquadRecord(rec, i))
    .sort(byKey('fixtureId', 'sideId', 'kickoffDate'));
  const availability = mapAvailability(obj(input, 'availability'));
  const templates = list(input, 'templates').map(mapTemplate).sort(byKey('id'));

  const sum = (rows, f) => rows.reduce((n, r) => n + f(r), 0);
  return {
    schema: CLUB_DATA_EXPORT_SCHEMA,
    exportedAt,
    exportedBy,
    clubId,
    club,
    structure,
    members,
    people,
    playerProfiles,
    pendingRequests,
    invites,
    roster,
    fixtures,
    training,
    squads,
    availability,
    templates,
    medical: { included: false, reason: 'Medical records are not part of the club data export.' },
    counts: {
      groups: structure.groups.length, teams: structure.teams.length,
      members: members.length, people: people.length, playerProfiles: playerProfiles.length,
      pendingRequests: pendingRequests.length, invites: invites.length, roster: roster.length,
      fixtures: fixtures.length,
      trainingSlots: sum(training, g => g.schedule.length), trainingSessions: sum(training, g => g.sessions.length),
      attendanceRegisters: sum(training, g => g.attendance.length),
      squads: squads.length, availabilitySessions: availability.length,
      availabilityAnswers: sum(availability, s => s.answers.length), templates: templates.length,
    },
  };
}
