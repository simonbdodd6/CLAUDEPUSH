/**
 * CLUB DATA EXPORT — the pure mapper (coacheasier.club-data-export.v1, Step 1).
 *
 * A realistic two-group club is built with every FORBIDDEN value planted as a
 * unique sentinel string — invite tokens and links, password data, session /
 * reset / verification tokens, push credentials, platform roles, cross-club
 * ids, billing ids, login metadata, medical notes, chat, drafts and S&C data —
 * stored exactly where the real records keep them. The serialised export must
 * carry none of them, every section must be an explicit allow-list, and a
 * malformed or another club's record must fail the whole export rather than
 * be skipped. No storage, no clock: the mapper is pure.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildClubDataExport, CLUB_DATA_EXPORT_SCHEMA, ClubDataExportError } from '../api/_clubDataExport.js';

const CLUB = 'club_alpha', OTHER = 'club_bravo';
const SEN = 'grp_initial', U18 = 'grp_u18';
const S = name => `SENTINEL_${name}_x9`;          // every forbidden value contains "SENTINEL_"

function fixture() {
  return {
    clubId: CLUB,
    exportedAt: '2026-10-24T09:00:00.000Z',
    exportedBy: 'user_owner',
    club: {
      clubName: 'Alpha RFC', teamName: 'Seniors', sport: 'rugby', seasonName: '2026/27',
      seasonStart: '2026-09-01', seasonEnd: '2027-05-31', matchDay: 'Sat',
      colours: { primary: '#112233', secondary: '#445566', [S('colourExtra')]: 'x' },
      logoDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      trainingDays: [{ day: 'Tue', time: '19:00', note: S('trainingDayExtra') }],
      fixtures: [{ id: S('clubEmbeddedFixture') }],                 // the club record's own copy is NOT exported
      weeklyAvailability: { debug: S('cronDebug'), lastAutoSentAt: S('cronSent') },
      firstFixture: { opposition: S('firstFixture') },
      stripeCustomerId: S('stripeCustomer'), stripeSubscriptionId: S('stripeSub'),
      setupCompletedAt: '2026-08-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z', updatedBy: S('updatedBy'),
    },
    structure: {
      version: 1, clubId: CLUB, synthesized: false,
      groups: [
        { id: U18, name: 'U18', type: 'general', developmentCategory: 'youth_u18', status: 'active', secret: S('groupExtra') },
        { id: SEN, name: 'Seniors', type: 'general', developmentCategory: 'adult', status: 'active' },
      ],
      teams: [
        { id: 't-u18a', groupId: U18, name: 'U18 Premier', ageGrade: 'U18', genderCategory: 'male', status: 'active' },
        { id: 't-sen', groupId: SEN, name: 'Premier', ageGrade: '', genderCategory: '', status: 'active' },
      ],
    },
    members: [
      { id: 'tm_owner', teamId: CLUB, userId: 'user_owner', role: 'admin', status: 'active', isOwner: true, accessProfile: 'full',
        joinedAt: '2026-08-01T10:00:00Z', approvedBy: S('approvedBy'), rejectedAt: null, rejectedBy: null },
      { id: 'tm_coach', teamId: CLUB, userId: 'user_coach', role: 'coach', staffLevel: 'head', status: 'active',
        accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'active', note: S('grantExtra') }], teams: [] },
        medicalAccess: true, joinedAt: '2026-08-02T10:00:00Z' },
      { id: 'tm_player', teamId: CLUB, userId: 'user_player', role: 'player', status: 'active', playerGroupId: U18,
        eligibility: { teamIds: ['t-u18a'], primaryTeamId: 't-u18a' }, joinedAt: '2026-08-03T10:00:00Z' },
      { id: 'tm_pending', teamId: CLUB, userId: 'user_pending', role: 'player', status: 'pending', playerGroupId: SEN,
        joinedAt: '2026-10-20T10:00:00Z' },
    ],
    users: [
      { id: 'user_owner', email: 'owner@alpha.test', displayName: 'Olive Owner', firstName: 'Olive', lastName: 'Owner',
        emailVerified: true, passwordHash: S('passwordHash'), passwordSalt: S('passwordSalt'), passwordAlgo: S('passwordAlgo'),
        platformRole: S('platformRole'), platformRoleGrantedBy: S('platformGrant'), lastTeamId: OTHER,
        previousEmail: S('previousEmail'), lastLoginAt: S('lastLogin'), emailChangedAt: S('emailChanged'),
        preferences: { pushEnabled: S('prefs') }, stripeCustomerId: S('userStripe') },
      { id: 'user_coach', email: 'coach@alpha.test', displayName: 'Cal Coach', firstName: 'Cal', lastName: 'Coach', emailVerified: false },
      { id: 'user_player', email: 'pat@alpha.test', displayName: 'Pat Player', firstName: 'Pat', lastName: 'Player' },
      { id: 'user_pending', email: 'penny@alpha.test', displayName: 'Penny Pending' },
    ],
    playerProfiles: [
      { id: 'profile_pat', teamMemberId: 'tm_player', teamId: CLUB, userId: 'user_player', displayName: 'Pat Player',
        position: 'Prop', phone: '+32 470 00 00 00', email: 'pat@alpha.test', legacyPlayerId: S('legacyPlayerIdFromToken'),
        createdAt: '2026-08-03T10:00:00Z' },
    ],
    invites: [
      { token: S('inviteToken1'), name: 'Nina New', email: 'nina@alpha.test', role: 'player', playerGroupId: U18,
        status: 'pending', teamId: CLUB, createdAt: '2026-10-10T10:00:00Z', expiresAt: '2026-10-24T10:00:00Z',
        createdBy: 'user_coach', acceptedAt: null, url: S('inviteUrl'), link: `https://www.coacheasier.com/?inv=${S('inviteToken1')}` },
      { token: S('inviteToken2'), kind: 'group', name: 'U18 link', email: '', role: 'player', status: 'pending', teamId: CLUB,
        scope: { clubWide: false, groupIds: [U18], token: S('scopeToken') }, createdAt: '2026-10-11T10:00:00Z' },
    ],
    roster: [
      { id: 'p_pat', userId: 'user_player', name: 'Pat Player', firstName: 'Pat', lastName: 'Player', position: 'Prop',
        secondaryPositions: ['Hooker'], jerseyNumber: 1, email: 'pat@alpha.test', phone: '+32 470 00 00 00',
        dateOfBirth: '2008-05-01', address: '1 Rue Test', parentGuardianName: 'Gina Guardian',
        parentGuardianEmail: 'gina@alpha.test', emergencyContact: 'Gina Guardian', emergencyPhone: '+32 470 11 11 11',
        registrationStatus: 'registered', contractStatus: 'active', joinedDate: '2026-08-03',
        medical: S('rosterMedical'), mediaConsent: S('mediaConsent'), notes: S('rosterNotes'),
        legacyPlayerId: S('rosterLegacyId'), history: [S('rosterHistory')], game: S('legacyGame'), photo: S('photo') },
    ],
    fixtures: [
      { id: 'fx_2', groupId: U18, sideId: 't-u18a', team: 'U18 Premier', opposition: 'Kituro', competition: 'U18 League',
        date: '2026-10-31', time: '14:00', arrivalTime: '13:00', venue: 'Home', homeAway: 'home', status: 'scheduled',
        meetingPoint: 'Clubhouse', transportNotes: 'Minibus', referee: 'R. Ref', notes: 'Bring both kits',
        externalId: 'ext-1', createdAt: '2026-09-01T10:00:00Z', updatedAt: null, coachPrivate: S('fixtureExtra') },
      { id: 'fx_1', groupId: SEN, opposition: 'Frameries', date: '2026-10-25', status: 'scheduled' },
    ],
    training: {
      [U18]: {
        schedule: [{ id: 'slot_wed', day: 'Wed', startTime: '18:30', endTime: '20:00', venue: 'Pitch 2', active: true, extra: S('slotExtra') }],
        sessions: [
          { id: 'sess_pub', title: 'Contact', type: 'Training', date: '2026-10-22', startTime: '18:30', endTime: '20:00',
            location: 'Pitch 2', coachName: 'Cal Coach', focus: 'Rucks', deadline: '', published: true,
            publishedAt: '2026-10-20T10:00:00Z', blocks: [{ time: '18:30', activity: 'Warm-up', private: S('blockExtra') }] },
          { id: 'sess_draft', title: S('draftSessionTitle'), date: '2026-10-29', published: false, blocks: [{ activity: S('draftBlock') }] },
        ],
        attendance: { sessions: { 'slot_wed-20261022': { date: '2026-10-22', title: 'Contact', sourceSessionId: 'sess_pub',
          marks: { 'id:user_player': 'present' }, updatedAt: '2026-10-22T21:00:00Z', updatedBy: S('attendanceBy') } } },
      },
      [SEN]: { schedule: [], sessions: [], attendance: { sessions: {} } },
    },
    squads: [
      { fixtureId: 'fx_2', sideId: 't-u18a', squad: { published: true, publishedAt: '2026-10-29T10:00:00Z', opposition: 'Kituro',
        competition: 'U18 League', kickoffDate: '2026-10-31', kickoffTime: '14:00', venue: 'Home', kit: 'Home',
        announcement: 'Good luck', gamePlan: 'Kick to corners', formationNames: { 1: 'Pat Player' },
        formationKeys: { 1: 'id:user_player' }, benchPlayers: [], benchKeys: [], matchMinutes: 70, fixtureId: 'fx_2', sideId: 't-u18a',
        substitutions: [{ id: 'sub_1', minute: 50, offKey: 'id:user_player', onKey: 'id:x', offName: 'Pat Player', onName: 'X', at: S('subAt') }],
        coachNotes: S('squadExtra') } },
      { fixtureId: 'fx_1', squad: { published: false, opposition: S('draftSquad'), formationNames: { 1: S('draftPick') } } },
    ],
    availability: {
      [U18]: { sess_pub: { user_player: { userId: 'user_player', playerId: 'user_player', response: 'available', reason: '',
        respondedAt: '2026-10-21T08:00:00Z', label: 'Pat Player', legacyPlayerId: S('availLegacyId'), intentSeq: S('intent') } } },
    },
    templates: [
      { id: 'tpl-custom', name: 'Match week', category: 'availability', title: 'Availability', body: 'Please answer',
        createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-02T10:00:00Z', ownerSecret: S('templateExtra') },
    ],
  };
}

const clone = o => JSON.parse(JSON.stringify(o));
const build = (mutate = () => {}) => { const f = fixture(); mutate(f); return buildClubDataExport(f); };
const json = doc => JSON.stringify(doc);

// ── 1. shape ────────────────────────────────────────────────────────────────

const SECTIONS = ['schema', 'exportedAt', 'exportedBy', 'clubId', 'club', 'structure', 'members', 'people', 'playerProfiles',
  'pendingRequests', 'invites', 'roster', 'fixtures', 'training', 'squads', 'availability', 'templates', 'medical', 'counts'];

test('1. the schema identifier and exactly the documented top-level sections', () => {
  const doc = build();
  assert.equal(doc.schema, CLUB_DATA_EXPORT_SCHEMA);
  assert.equal(doc.schema, 'coacheasier.club-data-export.v1');
  assert.deepEqual(Object.keys(doc), SECTIONS);
  for (const banned of ['chat', 'messages', 'drafts', 'performance', 'auditLog', 'errorLog', 'subscriptions', 'sessions'])
    assert.equal(banned in doc, false, `no ${banned} section`);
  assert.equal(doc.exportedAt, '2026-10-24T09:00:00.000Z', 'metadata is the caller\'s, not a clock');
  assert.equal(doc.exportedBy, 'user_owner');
  assert.equal(doc.clubId, CLUB);
});

// ── 2. every section is an explicit allow-list ──────────────────────────────

const KEYS = {
  club: ['clubName', 'teamName', 'sport', 'seasonName', 'seasonStart', 'seasonEnd', 'matchDay', 'colours', 'logoDataUrl',
    'trainingDays', 'setupCompletedAt', 'updatedAt'],
  group: ['id', 'name', 'type', 'developmentCategory', 'status'],
  team: ['id', 'groupId', 'name', 'ageGrade', 'genderCategory', 'status'],
  member: ['id', 'userId', 'role', 'staffLevel', 'status', 'isOwner', 'accessProfile', 'accessScope', 'medicalAccess',
    'playerGroupId', 'eligibility', 'joinedAt', 'approvedAt', 'removedAt', 'mergedInto'],
  person: ['id', 'displayName', 'firstName', 'lastName', 'email', 'emailVerified'],
  profile: ['id', 'teamMemberId', 'userId', 'displayName', 'position', 'phone', 'email', 'createdAt'],
  pending: ['memberId', 'userId', 'role', 'playerGroupId', 'requestedAt'],
  invite: ['kind', 'name', 'email', 'role', 'staffLevel', 'playerGroupId', 'scope', 'status', 'createdAt', 'expiresAt',
    'acceptedAt', 'revokedAt', 'createdBy'],
  roster: ['id', 'userId', 'name', 'firstName', 'lastName', 'position', 'secondaryPositions', 'jerseyNumber', 'email', 'phone',
    'dateOfBirth', 'address', 'parentGuardianName', 'parentGuardianEmail', 'emergencyContact', 'emergencyPhone',
    'registrationStatus', 'contractStatus', 'joinedDate'],
  fixture: ['id', 'groupId', 'sideId', 'team', 'opposition', 'competition', 'date', 'time', 'arrivalTime', 'venue', 'homeAway',
    'status', 'meetingPoint', 'transportNotes', 'referee', 'notes', 'externalId', 'createdAt', 'updatedAt'],
  trainingGroup: ['groupId', 'schedule', 'sessions', 'attendance'],
  slot: ['id', 'day', 'startTime', 'endTime', 'venue', 'arrivalTime', 'effectiveFrom', 'effectiveTo', 'active', 'sessionId'],
  session: ['id', 'title', 'type', 'date', 'startTime', 'endTime', 'location', 'coachName', 'focus', 'deadline', 'blocks', 'publishedAt'],
  register: ['sessionId', 'date', 'title', 'sourceSessionId', 'marks', 'updatedAt'],
  squad: ['fixtureId', 'sideId', 'publishedAt', 'opposition', 'competition', 'kickoffDate', 'kickoffTime', 'arrivalTime', 'venue',
    'kit', 'announcement', 'gamePlan', 'starters', 'starterKeys', 'bench', 'benchKeys', 'matchMinutes', 'substitutions'],
  substitution: ['id', 'minute', 'offKey', 'onKey', 'offName', 'onName'],
  availability: ['groupId', 'sessionId', 'answers'],
  answer: ['key', 'userId', 'playerId', 'response', 'reason', 'respondedAt'],
  template: ['id', 'name', 'category', 'title', 'body', 'createdAt', 'updatedAt'],
};
const keysOf = o => Object.keys(o);

test('2. every record in every section carries exactly its allow-listed fields', () => {
  const d = build();
  assert.deepEqual(keysOf(d.club), KEYS.club);
  assert.deepEqual(keysOf(d.club.colours), ['primary', 'secondary']);
  assert.deepEqual(keysOf(d.club.trainingDays[0]), ['day', 'time']);
  d.structure.groups.forEach(g => assert.deepEqual(keysOf(g), KEYS.group));
  d.structure.teams.forEach(t => assert.deepEqual(keysOf(t), KEYS.team));
  assert.deepEqual(keysOf(d.structure), ['groups', 'teams']);
  d.members.forEach(m => assert.deepEqual(keysOf(m), KEYS.member));
  assert.deepEqual(keysOf(d.members.find(m => m.id === 'tm_coach').accessScope), ['clubWide', 'groups', 'teams']);
  assert.deepEqual(keysOf(d.members.find(m => m.id === 'tm_coach').accessScope.groups[0]), ['groupId', 'status']);
  d.people.forEach(p => assert.deepEqual(keysOf(p), KEYS.person));
  d.playerProfiles.forEach(p => assert.deepEqual(keysOf(p), KEYS.profile));
  d.pendingRequests.forEach(p => assert.deepEqual(keysOf(p), KEYS.pending));
  d.invites.forEach(i => assert.deepEqual(keysOf(i), KEYS.invite));
  assert.deepEqual(keysOf(d.invites.find(i => i.kind === 'group').scope), ['clubWide', 'groupIds', 'teamId']);
  d.roster.forEach(r => assert.deepEqual(keysOf(r), KEYS.roster));
  d.fixtures.forEach(f => assert.deepEqual(keysOf(f), KEYS.fixture));
  d.training.forEach(g => {
    assert.deepEqual(keysOf(g), KEYS.trainingGroup);
    g.schedule.forEach(s => assert.deepEqual(keysOf(s), KEYS.slot));
    g.sessions.forEach(s => { assert.deepEqual(keysOf(s), KEYS.session); s.blocks.forEach(b => assert.deepEqual(keysOf(b), ['time', 'activity'])); });
    g.attendance.forEach(a => { assert.deepEqual(keysOf(a), KEYS.register); a.marks.forEach(m => assert.deepEqual(keysOf(m), ['player', 'status'])); });
  });
  d.squads.forEach(q => { assert.deepEqual(keysOf(q), KEYS.squad); q.substitutions.forEach(s => assert.deepEqual(keysOf(s), KEYS.substitution)); });
  d.availability.forEach(a => { assert.deepEqual(keysOf(a), KEYS.availability); a.answers.forEach(x => assert.deepEqual(keysOf(x), KEYS.answer)); });
  d.templates.forEach(t => assert.deepEqual(keysOf(t), KEYS.template));
  assert.deepEqual(d.medical, { included: false, reason: 'Medical records are not part of the club data export.' });
});

test('2b. the values that should travel do travel', () => {
  const d = build();
  assert.equal(d.club.clubName, 'Alpha RFC');
  assert.equal(d.roster[0].dateOfBirth, '2008-05-01');
  assert.equal(d.roster[0].jerseyNumber, 1);
  assert.equal(d.fixtures.find(f => f.id === 'fx_2').notes, 'Bring both kits');
  assert.equal(d.training.find(g => g.groupId === U18).attendance[0].marks[0].status, 'present');
  assert.equal(d.availability[0].answers[0].response, 'available');
  assert.equal(d.squads[0].starters[0].value, 'Pat Player');
  assert.equal(d.members.find(m => m.id === 'tm_coach').medicalAccess, true, 'an access GRANT, not medical data');
});

// ── 3. determinism ──────────────────────────────────────────────────────────

test('3. identical input gives identical output; source order does not matter', () => {
  assert.equal(json(build()), json(build()));
  const reversed = build(f => {
    for (const k of ['members', 'users', 'playerProfiles', 'invites', 'roster', 'fixtures', 'templates']) f[k].reverse();
    f.structure.groups.reverse(); f.structure.teams.reverse();
    f.training = Object.fromEntries(Object.entries(f.training).reverse());
  });
  assert.equal(json(reversed), json(build()));
});

// ── 4. absent optional data ─────────────────────────────────────────────────

test('4. an empty club exports cleanly; absent optional fields take their documented empty values', () => {
  const doc = buildClubDataExport({ clubId: CLUB, exportedAt: 't', exportedBy: 'u', club: null,
    structure: { groups: [], teams: [] }, members: [], users: [], playerProfiles: [], invites: [], roster: [],
    fixtures: [], training: {}, squads: [], availability: {}, templates: [] });
  assert.equal(doc.club, null, 'a club that never saved settings is null, not invented');
  assert.ok(Object.values(doc.counts).every(n => n === 0));
  const d = build();
  const sparse = d.fixtures.find(f => f.id === 'fx_1');
  assert.equal(sparse.venue, '', 'absent string → ""');
  assert.equal(sparse.createdAt, null, 'absent timestamp → null');
  const owner = d.members.find(m => m.id === 'tm_owner');
  assert.equal(owner.accessScope, null, 'no stored scope → null (never a derived guess)');
  assert.equal(owner.eligibility, null);
  assert.equal(d.people.find(p => p.id === 'user_pending').emailVerified, false);
});

// ── 5. malformed input fails, naming the path ───────────────────────────────

test('5. malformed required input fails clearly — a section is never silently skipped', () => {
  const cases = [
    [f => { delete f.members; }, /members: is required/],
    [f => { f.roster = {}; }, /roster: is required and must be an array/],
    [f => { delete f.club; }, /club: is required/],
    [f => { f.clubId = ''; }, /input\.clubId: is required/],
    [f => { delete f.exportedAt; }, /input\.exportedAt: is required/],
    [f => { f.structure = { groups: [] }; }, /structure\.teams: is required/],
    [f => { f.training[U18].sessions = null; }, /training\.grp_u18\.sessions: is required/],
    [f => { f.fixtures[0].date = 20261031; }, /fixtures\[0\]\.date: expected a string/],
    [f => { f.members.push(null); }, /members\[4\]: expected an object/],
    [f => { f.roster[0].jerseyNumber = { n: 1 }; }, /roster\[0\]\.jerseyNumber/],
    [f => { f.availability[U18].sess_pub.user_player = 'yes'; }, /availability\.grp_u18\.sess_pub\.user_player: expected an object/],
    [f => { f.squads[0].squad.substitutions[0].minute = '50'; }, /minute: expected a number/],
    [f => { delete f.fixtures[0].id; }, /fixtures\[0\]\.id: is required/],
  ];
  for (const [mutate, pattern] of cases) {
    assert.throws(() => build(mutate), err => err instanceof ClubDataExportError && pattern.test(err.message), String(pattern));
  }
});

test('5b. a record belonging to ANOTHER club fails the export instead of being exported or dropped', () => {
  for (const [mutate, pattern] of [
    [f => { f.members[1].teamId = OTHER; }, /members\[1\]\.teamId: belongs to another club/],
    [f => { f.playerProfiles[0].teamId = OTHER; }, /playerProfiles\[0\]\.teamId: belongs to another club/],
    [f => { f.invites[0].teamId = OTHER; }, /invites\[0\]\.teamId: belongs to another club/],
    [f => { f.users.push({ id: 'user_bravo', email: 'b@bravo.test' }); }, /users\[4\]\.id: is not a member of this club/],
  ]) assert.throws(() => build(mutate), err => err instanceof ClubDataExportError && pattern.test(err.message), String(pattern));
});

// ── 6–9. nothing forbidden travels ──────────────────────────────────────────

test('6. no source property outside the allow-lists reaches the output', () => {
  const out = json(build());
  for (const extra of ['colourExtra', 'trainingDayExtra', 'groupExtra', 'grantExtra', 'fixtureExtra', 'slotExtra', 'blockExtra',
    'squadExtra', 'templateExtra', 'updatedBy', 'approvedBy', 'attendanceBy', 'subAt', 'intent'])
    assert.equal(out.includes(S(extra)), false, `${extra} leaked`);
});

test('7. no credential, token, platform, cross-club, billing or login value appears anywhere in the serialised export', () => {
  const out = json(build());
  assert.equal(out.includes('SENTINEL_'), false, `a forbidden value leaked: ${(out.match(/SENTINEL_[A-Za-z0-9]+/g) || []).join(', ')}`);
  for (const k of ['token', 'url', 'link', 'passwordHash', 'passwordSalt', 'passwordAlgo', 'platformRole', 'lastTeamId',
    'previousEmail', 'lastLoginAt', 'stripeCustomerId', 'stripeSubscriptionId', 'legacyPlayerId', 'preferences', 'tokenHash'])
    assert.equal(new RegExp(`"${k}"`).test(out), false, `no "${k}" key`);
  assert.equal(out.includes(OTHER), false, 'no other club\'s id (the owner\'s lastTeamId)');
  assert.equal(out.includes('?inv='), false, 'no join link');
});

test('8. no medical content: the roster\'s medical text is dropped and the marker carries no values', () => {
  const d = build(f => { f.roster[0].medical = 'Concussion 12/10, cleared 20/10 — physio notes'; });
  const out = json(d);
  assert.equal(/Concussion|physio notes|cleared 20\/10/.test(out), false);
  assert.deepEqual(Object.keys(d.medical), ['included', 'reason']);
  assert.equal(d.medical.included, false);
  for (const k of ['cases', 'clearanceStatus', 'timeline', 'diagnosis', 'returnTarget']) assert.equal(new RegExp(`"${k}"`).test(out), false, k);
});

test('9. no chat, drafts, unpublished sessions or squads, coach sheets or S&C data appear', () => {
  const f = fixture();
  f.chat = [{ convId: 'dm:user_coach:user_player', text: S('privateMessage') }];
  f.performance = { programmes: [{ name: S('scProgramme') }] };
  f.drafts = [{ body: S('coachSheet') }];
  const out = json(buildClubDataExport(f));
  for (const s of ['privateMessage', 'scProgramme', 'coachSheet', 'draftSessionTitle', 'draftBlock', 'draftSquad', 'draftPick'])
    assert.equal(out.includes(S(s)), false, `${s} leaked`);
  const d = buildClubDataExport(f);
  assert.deepEqual(d.training.find(g => g.groupId === U18).sessions.map(s => s.id), ['sess_pub'], 'published sessions only');
  assert.deepEqual(d.squads.map(q => q.fixtureId), ['fx_2'], 'published squads only');
});

// ── 10. invites ─────────────────────────────────────────────────────────────

test('10. an invite travels only through its safe allow-list: no token, no link, no id derived from either', () => {
  const d = build();
  assert.equal(d.invites.length, 2);
  const personal = d.invites.find(i => i.email === 'nina@alpha.test');
  assert.deepEqual(personal, { kind: 'personal', name: 'Nina New', email: 'nina@alpha.test', role: 'player', staffLevel: '',
    playerGroupId: U18, scope: null, status: 'pending', createdAt: '2026-10-10T10:00:00Z', expiresAt: '2026-10-24T10:00:00Z',
    acceptedAt: null, revokedAt: null, createdBy: 'user_coach' });
  const group = d.invites.find(i => i.kind === 'group');
  assert.deepEqual(group.scope, { clubWide: false, groupIds: [U18], teamId: '' });
  assert.equal(json(d.invites).includes('SENTINEL_'), false);
});

// ── 11. counts ──────────────────────────────────────────────────────────────

test('11. counts match the exported sections and never count what was excluded', () => {
  const d = build();
  assert.deepEqual(d.counts, {
    groups: 2, teams: 2, members: 4, people: 4, playerProfiles: 1, pendingRequests: 1, invites: 2, roster: 1, fixtures: 2,
    trainingSlots: 1, trainingSessions: 1, attendanceRegisters: 1, squads: 1, availabilitySessions: 1,
    availabilityAnswers: 1, templates: 1,
  });
  assert.equal(d.counts.trainingSessions, d.training.reduce((n, g) => n + g.sessions.length, 0), 'the draft session is not counted');
  assert.equal(d.counts.squads, d.squads.length, 'the draft squad is not counted');
  assert.deepEqual(d.pendingRequests, [{ memberId: 'tm_pending', userId: 'user_pending', role: 'player', playerGroupId: SEN,
    requestedAt: '2026-10-20T10:00:00Z' }]);
});

// ── 12. purity ──────────────────────────────────────────────────────────────

test('12. the mapper never mutates its input', () => {
  const f = fixture();
  const before = clone(f);
  buildClubDataExport(f);
  assert.deepEqual(f, before);
});

test('the module is pure: no storage, network, filesystem, environment, clock or randomness', () => {
  const src = fs.readFileSync(new URL('../api/_clubDataExport.js', import.meta.url), 'utf8')
    .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/\bimport\b/.test(src), false, 'imports nothing');
  for (const banned of [/\bfetch\(/, /\bprocess\./, /\bDate\.now\(|new Date\(/, /Math\.random/, /\bkv[A-Z]\w*\(/, /\brequire\(/])
    assert.equal(banned.test(src), false, String(banned));
  for (const excluded of ['_clubExport.js', '_clubExportSource.js'])
    assert.equal(src.includes(excluded), false, `does not touch the excluded ${excluded}`);
});
