/**
 * MEDICAL ACCESS MUST NOT COST SOMEONE THEIR PLAYER CAPACITY.
 *
 * A player was given medical access and lost their Player Profile. The server
 * is not at fault: `setMedicalAccess` writes one boolean, `setMemberRole`
 * writes one string, and both leave playerGroupId, eligibility and roster
 * place exactly where they were. Part A pins that.
 *
 * The loss is entirely CLIENT-SIDE, and it is one mistake repeated: the
 * browser answers "is this person a player?" with "is their club role NOT one
 * of coach/admin/medical?". Medical sits in that list, so the strongest form
 * of the grant — the club role Medical — makes every client check conclude
 * "staff, therefore not a player":
 *
 *   • loginIdentityAccount / devLogin skip applyApprovedIdentityLocally, so
 *     the person's OWN roster record is never created on their device;
 *   • hydrateSessionPlayerRecord refuses to synthesise it on reload;
 *   • syncIdentityStateToLocalRoster discards their player_profile as staff;
 *   • getPlayer() therefore resolves to EMPTY_PLAYER — the blank profile;
 *   • isCoach() turns true, so they are landed in the coach shell and pick up
 *     coach sections — a medical grant handing out coaching access.
 *
 * The server already models this correctly (api/_accessScope.js
 * isPlayingMember): where a person PLAYS is playerGroupId, or a club role of
 * 'player'. Part B pins the client adopting the same answer. Medical is a
 * PERMISSION — one extra page — never a capacity.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.medical-capacity.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const store  = await import('../api/_identityStore.js');
const scope  = await import('../api/_accessScope.js');
const { permissionsFor, canonicalRole, PERM } = await import('../api/_permissions.js');

const CLUB = 'club-a', OTHER = 'club-b', SEN = 'grp-sen', U18 = 'grp-u18';
const STRUCTURE = {
  version: 1,
  groups: [{ id: SEN, name: 'Seniors', status: 'active' },
           { id: U18, name: 'U18', status: 'active' }],
  teams:  [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' },
           { id: 't-u18',  groupId: U18, name: 'U18',     status: 'active' }],
};

/** A club whose memberships are exactly the ones a case needs. */
function seed(members) {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([
    { id: CLUB, name: 'Club A', teamCode: 'AAA111' },
    { id: OTHER, name: 'Club B', teamCode: 'BBB222' },
  ]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:structure:${OTHER}`, JSON.stringify(STRUCTURE));
  kv.set('app:identity:users', JSON.stringify(
    members.map(m => ({ id: m.userId, email: `${m.userId}@x.test`, displayName: m.userId }))));
  kv.set('app:identity:team_members', JSON.stringify(members));
}
const memberById = async id =>
  JSON.parse(kv.get('app:identity:team_members')).find(m => m.id === id);

const PLAYER = { id: 'tm-play', teamId: CLUB, userId: 'u-play', role: 'player',
                 status: 'active', playerGroupId: SEN };
const ADMIN  = { id: 'tm-admin', teamId: CLUB, userId: 'u-admin', role: 'admin',
                 status: 'active', isOwner: true };
const COACH  = { id: 'tm-coach', teamId: CLUB, userId: 'u-coach', role: 'coach',
                 status: 'active', staffLevel: 'head' };
/** A dual-role member: plays for U18, coaches Seniors — one membership. */
const DUAL   = { id: 'tm-dual', teamId: CLUB, userId: 'u-dual', role: 'coach',
                 status: 'active', staffLevel: 'assistant', playerGroupId: U18,
                 accessScope: { clubWide: false, groups: [{ groupId: SEN, status: 'active' }], teams: [] } };

// ── client extraction ───────────────────────────────────────────────────────

/** Strip comments so an assertion can never match explanatory prose. */
function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function fn(name) {
  const m = src.match(new RegExp(`(?:async\\s+)?function ${name}\\s*\\(`));
  assert.ok(m, `client function ${name} exists`);
  const start = src.indexOf(m[0]);
  // Skip the PARAMETER list first: a destructured default ({ plays = false })
  // otherwise captures the brace matcher instead of the body.
  let depth = 0, parenEnd = start;
  for (let b = src.indexOf('(', start); b < src.length; b++) {
    if (src[b] === '(') depth++;
    else if (src[b] === ')') { depth--; if (depth === 0) { parenEnd = b; break; } }
  }
  let end = src.indexOf('{', parenEnd);
  depth = 0;
  for (let b = end; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1);
}
const literal = re => { const m = src.match(re); assert.ok(m, `literal ${re}`); return m[0]; };

/**
 * A miniature app shell running the REAL capacity functions from index.html,
 * with only the DOM and the network stubbed out.
 */
function shell({ role, permissions = [], membership = null, players = [], users = null,
                 entitled = false } = {}) {
  const me = { id: 'user_play_1', role, name: 'Pat Player', email: 'user_play_1@x.test' };
  const state = {
    features: {}, activeView: 'player', currentUserId: 'user_play_1',
    players: structuredClone(players), users: users || [me],
    selectedPlayerId: '', selectedPlayerOwnerId: '',
  };
  const body = `
    ${literal(/const SECTION_PERM_MAP = \{[^\n]*\}/)};
    ${literal(/const SECTION_FEATURE_MAP = \{[^\n]*\}/)};
    const BETA_HIDE_COMMERCIAL = true;
    const playerSections = [["home","Home"],["messages","Messages"],
                            ["availability","Availability"],["week","Training"]];
    const EMPTY_PLAYER = { id: '', name: '', _empty: true };
    function canUseFeature() { return ENTITLED; }
    function _isLocalDemoHost() { return false; }
    function canonicalVisiblePlayers() { return state.players; }
    ${fn('canonicalPlayerIdForUser')}
    ${fn('canonicalIdentityNameKey')}
    ${fn('identityNameKey')}
    ${fn('identityCompactKey')}
    ${fn('isPermanentPlayerUserId')}
    function resolveRosterMessagingId(p) { return String(p.userId || p.id || ''); }
    function identityEmailKey(v) { return String(v || '').trim().toLowerCase(); }
    ${fn('ensureCanonicalPlayerRecord')}
    ${fn('membershipPlays')}
    ${fn('landingViewFor')}
    ${fn('canI')}
    ${fn('isCoach')}
    ${fn('playerSectionsFor')}
    ${fn('allowedCoachSections')}
    ${fn('ownPlayerRecordForUser')}
    ${fn('staffPreviewPlayerId')}
    ${fn('getPlayer')}
    ${fn('hydrateSessionPlayerRecord')}
    return { state, membershipPlays, landingViewFor, isCoach, playerSectionsFor,
             allowedCoachSections, getPlayer, ownPlayerRecordForUser,
             hydrateSessionPlayerRecord, me: currentUser() };
  `;
  const build = new Function('state', 'currentUser', '_myPermissions', '_myMembership', 'ENTITLED', body);
  return build(state, () => me, permissions, membership, entitled);
}

const COACH_SECTIONS = [
  ['overview', 'Overview'], ['players', 'Members'], ['availability', 'Availability'],
  ['training', 'Training'], ['selection', 'Selection'], ['matchday', 'Match Centre'],
  ['medical', 'Medical'], ['messages', 'Messages'], ['club', 'Club'],
  ['admin', 'Admin'], ['performance', 'Performance'], ['message', 'Reports'],
];

// ════ PART A — THE SERVER PRESERVES EVERYTHING (merge, never replace) ═══════

test('1: a normal player holds player capacity and a player group', async () => {
  seed([PLAYER, ADMIN]);
  const m = await memberById('tm-play');
  assert.equal(canonicalRole(m), 'player');
  assert.equal(scope.isPlayingMember(m), true);
  assert.equal(scope.playerGroupIdOf(m), SEN);
  assert.deepEqual(scope.operationalGroupsFor(m, STRUCTURE, { as: 'player' }).map(g => g.id), [SEN]);
});

test('2: Medical access is ADDITIVE — every player field survives it', async () => {
  seed([PLAYER, ADMIN]);
  const before = await memberById('tm-play');
  await store.setMedicalAccess('tm-play', true, 'u-admin', CLUB);
  const after = await memberById('tm-play');

  assert.equal(after.medicalAccess, true, 'the grant is recorded');
  assert.equal(after.role, before.role, 'role preserved');
  assert.equal(after.playerGroupId, before.playerGroupId, 'playerGroupId preserved');
  assert.equal(scope.isPlayingMember(after), true, 'still a playing member');
  assert.deepEqual(scope.operationalGroupsFor(after, STRUCTURE, { as: 'player' }).map(g => g.id), [SEN]);
  // Nothing else on the record was rewritten.
  const { medicalAccess, accessChangedAt, accessChangedBy, ...rest } = after;
  assert.deepEqual(rest, before, 'no other field was touched');
});

test('3: the club role Medical also preserves the player group and eligibility', async () => {
  seed([PLAYER, ADMIN]);
  await store.setMedicalAccess('tm-play', true, 'u-admin', CLUB);
  await store.setMemberRole('tm-play', { role: 'medical' }, 'u-admin', CLUB);
  const after = await memberById('tm-play');

  assert.equal(after.role, 'medical');
  assert.equal(after.medicalAccess, true, 'the medical permission is preserved');
  assert.equal(after.playerGroupId, SEN, 'playerGroupId is NOT dropped by the role change');
  assert.equal(scope.isPlayingMember(after), true,
    'the server still knows this person plays — the capacity is intact');
  assert.deepEqual(scope.operationalGroupsFor(after, STRUCTURE, { as: 'player' }).map(g => g.id), [SEN],
    'and they still operate as a player in their own group');
  assert.deepEqual(scope.eligibleTeams(after, STRUCTURE).map(t => t.id), ['t-prem'],
    'they remain selectable for their group');
});

test('4: revoking Medical access leaves the player exactly as they were', async () => {
  seed([PLAYER, ADMIN]);
  const before = await memberById('tm-play');
  await store.setMedicalAccess('tm-play', true, 'u-admin', CLUB);
  await store.setMedicalAccess('tm-play', false, 'u-admin', CLUB);
  const after = await memberById('tm-play');
  assert.equal(after.medicalAccess, false);
  assert.equal(after.role, before.role);
  assert.equal(after.playerGroupId, before.playerGroupId);
  assert.equal(scope.isPlayingMember(after), true);
});

// ════ PART B — THE CLIENT MUST ASK THE CAPACITY, NOT THE ROLE NAME ═════════

test('5: membershipPlays reads the PLAYER capacity, never the staff role list', () => {
  const { membershipPlays } = shell({ role: 'player' });
  assert.equal(membershipPlays({ role: 'player' }), true, 'a plain player plays');
  assert.equal(membershipPlays({ role: 'medical', playerGroupId: SEN }), true,
    'medical + a player group: still a player');
  assert.equal(membershipPlays({ role: 'coach', playerGroupId: U18 }), true,
    'dual-role coach who plays: still a player');
  assert.equal(membershipPlays({ role: 'medical' }), false, 'a physio who does not play');
  assert.equal(membershipPlays({ role: 'coach' }), false, 'a coach who does not play');
  assert.equal(membershipPlays({}), false, 'unknown membership fails CLOSED');
  assert.equal(membershipPlays(null, 'player'), true, 'the session role is the fallback');
  assert.equal(membershipPlays({ playerGroupId: '   ' }), false, 'whitespace is not a group');
});

test('6: a player who is ALSO medical staff keeps the player shell', () => {
  const { isCoach, landingViewFor } = shell({
    role: 'medical', permissions: ['medical_access', 'messaging', 'reports'],
    membership: { role: 'medical', playerGroupId: SEN },
  });
  assert.equal(isCoach(), false, 'medical is a permission, not a coaching capacity');
  assert.equal(landingViewFor('medical', { role: 'medical', playerGroupId: SEN }), 'player',
    'they land in their own portal, where Medical already appears');
});

test('7: a physio who does NOT play keeps todays coach shell — no regression', () => {
  const { isCoach, landingViewFor } = shell({
    role: 'medical', permissions: ['medical_access', 'messaging', 'reports'],
    membership: { role: 'medical' },
  });
  assert.equal(isCoach(), true, 'staff-only medical is unchanged');
  assert.equal(landingViewFor('medical', { role: 'medical' }), 'coach');
});

test('8: coaches and admins are unaffected, including when they also play', () => {
  for (const [role, member] of [['coach', { role: 'coach' }], ['admin', { role: 'admin' }],
                                ['coach', { role: 'coach', playerGroupId: U18 }]]) {
    const { isCoach, landingViewFor } = shell({ role, membership: member, permissions: ['manage_players'] });
    assert.equal(isCoach(), true, `${role} is still staff`);
    assert.equal(landingViewFor(role, member), 'coach', `${role} still lands in the coach shell`);
  }
  // A plain player is untouched at both ends.
  const plain = shell({ role: 'player', membership: { role: 'player', playerGroupId: SEN } });
  assert.equal(plain.isCoach(), false);
  assert.equal(plain.landingViewFor('player', { role: 'player', playerGroupId: SEN }), 'player');
});

test('9: THE DEFECT — their own player record is synthesised on reload', () => {
  const app = shell({ role: 'medical', membership: { role: 'medical', playerGroupId: SEN } });
  // Fresh device: nothing in the local roster yet.
  assert.equal(app.state.players.length, 0);
  const created = app.hydrateSessionPlayerRecord(app.state, app.me,
    app.membershipPlays({ role: 'medical', playerGroupId: SEN }));
  assert.equal(created, true, 'a playing member gets their own record back');
  assert.equal(app.state.players.length, 1);
  assert.equal(app.state.players[0].id, 'user_play_1', 'keyed by their permanent identity');
});

test('10: a NON-playing physio is still not given a roster record', () => {
  const app = shell({ role: 'medical', membership: { role: 'medical' } });
  const created = app.hydrateSessionPlayerRecord(app.state, app.me,
    app.membershipPlays({ role: 'medical' }));
  assert.equal(created, false, 'medical staff are not players');
  assert.equal(app.state.players.length, 0);
});

test('11: THE SYMPTOM — the Player Profile resolves to their real record', () => {
  const roster = [{ id: 'user_play_1', userId: 'user_play_1', name: 'Pat Player', email: 'user_play_1@x.test' }];
  const app = shell({ role: 'medical', players: roster,
                      membership: { role: 'medical', playerGroupId: SEN } });
  const resolved = app.getPlayer();
  assert.equal(resolved._empty, undefined, 'NOT the empty player');
  assert.equal(resolved.id, 'user_play_1', 'their own profile, not a blank one and not somebody else\'s');
  assert.equal(app.ownPlayerRecordForUser(app.me)?.id, 'user_play_1');
});

test('12: the local roster keeps a playing member, whatever their club role', () => {
  // Drive the REAL reconciliation. Its staff-exclusion set decides whether a
  // person's player_profile is projected into the local roster at all — this
  // is the function that actively strips the record from every device.
  const state = { players: [], users: [] };
  const build = new Function('state', `
    ${fn('membershipPlays')}
    ${fn('canonicalIdentityDisplayName')}
    ${fn('canonicalIdentityNameKey')}
    ${fn('identityNameKey')}
    ${fn('identityCompactKey')}
    ${fn('isPermanentPlayerUserId')}
    function canonicalizeStatePlayers() { return false; }
    function ensurePlayerUsersForRoster(players, users) { return users; }
    ${fn('syncIdentityStateToLocalRoster')}
    return syncIdentityStateToLocalRoster;
  `);
  const sync = build(state);

  const identity = {
    team_members: [
      { userId: 'u-play',  role: 'medical', status: 'active', playerGroupId: SEN },
      { userId: 'u-phys',  role: 'medical', status: 'active' },
      { userId: 'u-coach', role: 'coach',   status: 'active' },
    ],
    users: [
      { id: 'u-play',  displayName: 'Pat Player',  email: 'pat@x.test' },
      { id: 'u-phys',  displayName: 'Phil Physio', email: 'phil@x.test' },
      { id: 'u-coach', displayName: 'Cal Coach',   email: 'cal@x.test' },
    ],
    player_profiles: [
      { userId: 'u-play',  displayName: 'Pat Player',  email: 'pat@x.test', position: 'Lock' },
      { userId: 'u-phys',  displayName: 'Phil Physio', email: 'phil@x.test' },
      { userId: 'u-coach', displayName: 'Cal Coach',   email: 'cal@x.test' },
    ],
  };
  sync(identity);
  const ids = state.players.map(p => String(p.userId || p.id));
  assert.ok(ids.includes('u-play'),
    'the player-physio keeps their own roster record — this is the lost profile');
  assert.equal(ids.includes('u-phys'), false, 'a physio who does not play is still not a player');
  assert.equal(ids.includes('u-coach'), false, 'nor is a coach who does not play');
});

test('13: every login entry point adopts the players OWN record when they play', () => {
  // The guard in front of applyApprovedIdentityLocally must consult the PLAYER
  // capacity, not only the staff role list.
  for (const name of ['loginIdentityAccount', 'devLogin']) {
    const body = stripComments(fn(name));
    const guard = body.match(/if \(([^)]*)\)\s*\{\s*applyApprovedIdentityLocally/);
    assert.ok(guard, `${name} still guards the adoption`);
    assert.match(guard[1], /plays/i,
      `${name} must adopt the own-record for a member who PLAYS`);
  }
  // And the landing shell is chosen by capacity in all three entry points.
  for (const name of ['loginIdentityAccount', 'devLogin', 'switchToUser']) {
    const body = stripComments(fn(name));
    assert.match(body, /state\.activeView = landingViewFor\(/,
      `${name} must choose the shell by capacity`);
    assert.doesNotMatch(body, /state\.activeView = isStaff(Login)? \? 'coach' : 'player'/,
      `${name} must not decide the shell from the staff role list alone`);
  }
});

test('13b: the adopted membership keeps the field the capacity is read from', () => {
  // isCoach() reads playerGroupId off _myMembership. If adoption stored a
  // trimmed copy, the capacity question would silently answer "staff" again.
  const state = {};
  const build = new Function('state', `
    let _myPermissions = null, _myOperational = null, _myMemberships = [],
        _myPlatformRole = '', _verifyNotice = null, _myMembership = null;
    function resolveOperationalGroup() {}
    function renderVerifyEmailBanner() {}
    ${fn('adoptIdentityPayload')}
    return d => { adoptIdentityPayload(d); return _myMembership; };
  `);
  const adopt = build(state);
  const member = { id: 'tm-play', role: 'medical', playerGroupId: SEN, medicalAccess: true };
  const stored = adopt({ teamMember: member, permissions: ['medical_access'] });
  assert.equal(stored?.playerGroupId, SEN, 'the player group survives adoption');
  assert.deepEqual(stored, member, 'the membership is adopted whole, not reconstructed');
  // A payload without a membership must not wipe a good one.
  assert.deepEqual(adopt({ permissions: [] }), member, 'absence leaves the stored membership alone');
  assert.equal(adopt({ teamMember: null }), null, 'an explicit null clears it');
});

// ════ PART C — THE GRANT CONFERS NOTHING ELSE ══════════════════════════════

test('14: Medical access grants MEDICAL_ACCESS and nothing else', async () => {
  seed([PLAYER, ADMIN]);
  await store.setMedicalAccess('tm-play', true, 'u-admin', CLUB);
  const granted = permissionsFor(await memberById('tm-play'));
  assert.equal(granted.has(PERM.MEDICAL_ACCESS), true);
  for (const p of [PERM.MANAGE_PLAYERS, PERM.MANAGE_TEAMS, PERM.MANAGE_COACHES,
                   PERM.ASSIGN_ACCESS, PERM.PUBLISH_SQUADS, PERM.PUBLISH_TRAINING,
                   PERM.DANGER_ZONE, PERM.MANAGE_FIXTURES, PERM.FINANCIAL,
                   PERM.MANAGE_SUBSCRIPTIONS, PERM.PLAYER_DELETE]) {
    assert.equal(granted.has(p), false, `must not gain ${p}`);
  }
});

test('15: no medical grant opens a TEAM-RUNNING surface', () => {
  // The additive grant (set_medical_access) is exact: one page.
  const granted = shell({
    role: 'player', permissions: ['medical_access'],
    membership: { role: 'player', playerGroupId: SEN, medicalAccess: true },
  });
  assert.deepEqual(granted.allowedCoachSections(COACH_SECTIONS).map(([id]) => id), ['medical'],
    'a player granted Medical access reaches the Medical page and NOTHING else');

  // The club ROLE Medical is a staff role and has always carried MESSAGING and
  // REPORTS (api/_permissions.js ROLE_PERMISSIONS.medical) — that predates this
  // defect and every physio relies on it, so it is asserted, not removed. What
  // must never appear is a surface that RUNS A TEAM.
  const staffRole = shell({
    role: 'medical', permissions: ['medical_access', 'messaging', 'reports'],
    membership: { role: 'medical', playerGroupId: SEN },
  });
  const reachable = staffRole.allowedCoachSections(COACH_SECTIONS).map(([id]) => id);
  assert.deepEqual(reachable.slice().sort(), ['medical', 'message', 'messages'],
    'exactly the legacy Medical role permissions, nothing added by playing');
  for (const forbidden of ['overview', 'players', 'training', 'selection',
                           'matchday', 'club', 'admin', 'performance']) {
    assert.equal(reachable.includes(forbidden), false, `must not reach ${forbidden}`);
  }
  // 'overview' is the tell: it is UNGATED, so it appears for anyone the client
  // considers staff. Its absence is what proves medical is no longer a coach
  // shell for someone who plays.
  assert.equal(staffRole.isCoach(), false, 'not staff, so no ungated coach section');

  // And their VISIBLE navigation is the player portal — no coaching entry.
  const nav = staffRole.playerSectionsFor().map(([id]) => id);
  assert.deepEqual(nav, ['home', 'messages', 'availability', 'week', 'medical'],
    'the player nav plus Medical — the coach shell is not offered at all');
});

test('16: no medical grant opens Performance, entitled club or not', () => {
  for (const entitled of [false, true]) {
    const app = shell({
      role: 'medical', permissions: ['medical_access', 'messaging', 'reports'],
      membership: { role: 'medical', playerGroupId: SEN }, entitled,
    });
    assert.equal(app.allowedCoachSections(COACH_SECTIONS).map(([id]) => id).includes('performance'),
      false, 'the COACH Performance section stays shut');
  }
  // And the permission the coach section is gated on is never granted.
  assert.equal(permissionsFor({ status: 'active', role: 'medical', medicalAccess: true })
    .has(PERM.PUBLISH_TRAINING), false, 'medical never gains publish_training');
});

test('17: the Medical page stays in the players OWN navigation', () => {
  const plain = shell({ role: 'player', membership: { role: 'player', playerGroupId: SEN } });
  assert.equal(plain.playerSectionsFor().some(([id]) => id === 'medical'), false,
    'no grant, no Medical entry');
  const medic = shell({ role: 'player', permissions: ['medical_access'],
                        membership: { role: 'player', playerGroupId: SEN, medicalAccess: true } });
  const nav = medic.playerSectionsFor().map(([id]) => id);
  assert.equal(nav.includes('medical'), true, 'the grant adds Medical to the PLAYER nav');
  for (const id of ['home', 'messages', 'availability', 'week']) {
    assert.equal(nav.includes(id), true, `and ${id} is still there — nothing is displaced`);
  }
});

// ════ PART D — CAPACITIES, TENANTS AND GROUPS STAY SEPARATE ════════════════

test('18: a coach given Medical access remains a coach', async () => {
  seed([COACH, ADMIN]);
  await store.setMedicalAccess('tm-coach', true, 'u-admin', CLUB);
  const after = await memberById('tm-coach');
  assert.equal(after.role, 'coach');
  assert.equal(canonicalRole(after), 'head_coach');
  assert.equal(after.staffLevel, 'head', 'staff level preserved');
  assert.equal(permissionsFor(after).has(PERM.MANAGE_PLAYERS), true, 'still runs a team');
  assert.equal(permissionsFor(after).has(PERM.MEDICAL_ACCESS), true);
  assert.equal(scope.isPlayingMember(after), false, 'and it did NOT make them a player');
});

test('19: a dual-role player/coach given Medical access keeps BOTH capacities', async () => {
  seed([DUAL, ADMIN]);
  await store.setMedicalAccess('tm-dual', true, 'u-admin', CLUB);
  const after = await memberById('tm-dual');

  assert.equal(scope.isPlayingMember(after), true, 'still plays');
  assert.equal(scope.playerGroupIdOf(after), U18, 'still plays for U18');
  assert.deepEqual(scope.operationalGroupsFor(after, STRUCTURE, { as: 'player' }).map(g => g.id), [U18],
    'player capacity: U18 only');
  assert.deepEqual(scope.operationalGroupsFor(after, STRUCTURE, { as: 'staff' }).map(g => g.id), [SEN],
    'staff capacity: Seniors only — the two are never merged');
  assert.equal(permissionsFor(after).has(PERM.MEDICAL_ACCESS), true);
  assert.equal(permissionsFor(after).has(PERM.MANAGE_PLAYERS), true, 'still coaches');

  const app = shell({ role: 'coach', permissions: ['manage_players', 'medical_access'],
                      membership: after });
  assert.equal(app.isCoach(), true, 'the coach shell is still theirs');
  assert.equal(app.membershipPlays(after), true, 'and so is the player capacity');
});

test('20: medical access never crosses a tenant boundary', async () => {
  seed([PLAYER, ADMIN, { ...PLAYER, id: 'tm-b', teamId: OTHER, userId: 'u-b' }]);
  await store.setMedicalAccess('tm-play', true, 'u-admin', CLUB);
  // The same member id cannot be reached while scoped to the other club.
  await assert.rejects(() => store.setMedicalAccess('tm-play', true, 'u-admin', OTHER),
    /Not authorized for this team/i, 'a foreign club cannot grant medical access here');
  const foreign = await memberById('tm-b');
  assert.equal(foreign.medicalAccess ?? false, false, 'the other club is untouched');
});

test('21: medical access never widens the group a person operates in', async () => {
  seed([PLAYER, ADMIN]);
  await store.setMedicalAccess('tm-play', true, 'u-admin', CLUB);
  await store.setMemberRole('tm-play', { role: 'medical' }, 'u-admin', CLUB);
  const after = await memberById('tm-play');
  assert.deepEqual(scope.operationalGroupsFor(after, STRUCTURE, { as: 'player' }).map(g => g.id), [SEN],
    'still exactly their own group');
  assert.deepEqual(scope.operationalGroupsFor(after, STRUCTURE, { as: 'staff' }).map(g => g.id), [],
    'and medical grants no staff group at all');
  assert.throws(() => scope.assertOperationalGroup(
    { user: { id: 'u-play' }, teamMember: after }, STRUCTURE, U18, { as: 'player' }),
    /Not authorized/, 'another group is refused at the boundary');
});

test('22: the existing medical restrictions still hold', async () => {
  seed([PLAYER, ADMIN]);
  // A player cannot grant themselves medical access: the route requires
  // ASSIGN_ACCESS, which no player holds.
  const player = await memberById('tm-play');
  assert.equal(permissionsFor(player).has(PERM.ASSIGN_ACCESS), false);
  // Medical is not implied by Coach or Manager access profiles.
  for (const accessProfile of ['coach', 'manager']) {
    assert.equal(permissionsFor({ status: 'active', role: 'coach', accessProfile })
      .has(PERM.MEDICAL_ACCESS), false, `${accessProfile} access never implies medical`);
  }
  // And the medical endpoint is still gated on MEDICAL_ACCESS itself.
  const api = fs.readFileSync(new URL('../api/publish.js', import.meta.url), 'utf8');
  assert.match(api, /requireTenantPermission\(req, PERM\.MEDICAL_ACCESS\)/,
    'the shared caseload is still gated on the permission');
});
