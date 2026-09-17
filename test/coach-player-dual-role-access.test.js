/**
 * COACH-PLAYER-DUAL-ROLE-ACCESS-1.
 *
 * A member can hold BOTH capacities on one membership: staff (accessScope —
 * where they coach) and player (playerGroupId — where they play). Production
 * shape: an assistant coach scoped to U18 whose playerGroupId is Seniors.
 *
 * The trap: the player portal renders the account's OWN roster record, and a
 * coach's device roster is the roster of the group they COACH (server-scoped).
 * The record hydrated at boot was dropped by the first roster load, so the
 * portal said "no player profile is linked" and sent them back to coach view.
 * setView also never re-resolved the group in force, so the portal kept the
 * coaching group.
 *
 * Everything below runs the REAL functions extracted from index.html, plus
 * the real server-side capacity rules from api/_accessScope.js. No network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { operationalGroupsFor, assertOperationalGroup, resolvePlayerGroup, isPlayingMember } from '../api/_accessScope.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = html.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = html.indexOf(m[0]);
  let i = html.indexOf('{', html.indexOf(')', start)), d = 0;
  for (let b = i; b < html.length; b++) { if (html[b] === '{') d++; else if (html[b] === '}') { d--; if (!d) { i = b; break; } } }
  return html.slice(start, i + 1);
}

// ── Fixtures: the production shape, with invented ids ─────────────────────
const SENIORS = 'grp_initial', U18 = 'grp_u18';
const STRUCTURE = { groups: [
  { id: SENIORS, name: 'Seniors', status: 'active' }, { id: U18, name: 'U18', status: 'active' }, { id: 'grp_w', name: "Women's", status: 'active' }] };
const dualMember = (userId, name) => ({ id: 'mem_' + userId, teamId: 'club', userId, role: 'coach', staffLevel: 'assistant', status: 'active',
  playerGroupId: SENIORS, accessScope: { clubWide: false, groups: [{ groupId: U18, role: null, status: 'active' }], teams: [] }, displayName: name });
const coachOnly = userId => ({ id: 'mem_' + userId, teamId: 'club', userId, role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: '',
  accessScope: { clubWide: false, groups: [{ groupId: U18, role: null, status: 'active' }], teams: [] } });
const playerOnly = userId => ({ id: 'mem_' + userId, teamId: 'club', userId, role: 'player', status: 'active', playerGroupId: SENIORS, accessScope: null });
const adminMember = userId => ({ id: 'mem_' + userId, teamId: 'club', userId, role: 'admin', status: 'active', playerGroupId: '', accessScope: { clubWide: true, groups: [], teams: [] } });
const OPERATIONAL = { player: { groups: [{ id: SENIORS, name: 'Seniors' }], defaultGroupId: SENIORS, mustChoose: false },
                      staff:  { groups: [{ id: U18, name: 'U18' }], defaultGroupId: U18, mustChoose: false } };
const U18_ROSTER = [{ id: 'user_u18a', userId: 'user_u18a', name: 'Youth A', position: 'Prop', email: 'a@x.test' },
                    { id: 'user_u18b', userId: 'user_u18b', name: 'Youth B', position: 'Hooker', email: 'b@x.test' }];

/** One client sandbox: identity, capacity, own-record, view switching. */
function client({ user, member, operational = OPERATIONAL, players = [], adminMembers = null } = {}) {
  const body = '"use strict";\nconst CFG = arguments[0];\n' +
    'let state = { users: [CFG.user], currentUserId: CFG.user.id, activeView: "coach", activeCoachSection: "overview", activePlayerSection: "home", players: CFG.players, operationalGroupId: null, trainingStateGroupId: null, trainingByGroup: {}, schedule: [], trainingBlocks: {}, selectedPlayerId: "", selectedPlayerOwnerId: "", features: {} };\n' +
    'let _myMembership = null, _myOperational = null, _myPermissions = null, _myMemberships = [], _myPlatformRole = "", _verifyNotice = null;\n' +
    'let saves = 0, renders = 0, toasts = [], swaps = 0, rosterPosts = [];\n' +
    'function saveState(){ saves++; } function render(){ renders++; } function showToast(t){ toasts.push(t); }\n' +
    'function renderVerifyEmailBanner(){} function contextResolved(){ return _myOperational !== null; }\n' +
    'function mcDetachFixture(){} function hydrateMedicalFromShared(){} function loadMedicalFromServer(){ return Promise.resolve(); }\n' +
    'let _trainingSchedule = null, _trainingScheduleAttempted = false, _trainingScheduleGroupId = "", _trainingPubState = {}, _trainingPubLoadedAt = 0, _publishedStateLoadedAt = 0, _fxAvailBoardId = null, _sharedMedical = {}, _trainingWeekNavIn = "";\n' +
    'const CE_INITIAL_GROUP_ID = "grp_initial"; const TRAINING_UNOWNED_KEY = "_unowned"; const defaultState = { schedule: [], trainingBlocks: {}, tacticsDrawings: {} };\n' +
    'function canonicalAccountForUserId(id){ return state.users.find(u => u.id === id) || null; }\n' +
    'function identityEmailKey(v){ return String(v || "").trim().toLowerCase(); }\n' +
    'function canonicalVisiblePlayers(){ return state.players; }\n' +
    'function resolveRosterMessagingId(p){ return p.userId || p.id; }\n' +
    'function canonicalIdentityNameKey(v){ return String(v||"").toLowerCase().replace(/[^a-z]/g,""); }\n' +
    'function ensurePlayerUsersForRoster(players, users){ return users; }\n' +
    'let _rosterSyncPending = false, _rosterLastSyncedFp = ""; function queueRosterSync(){ rosterPosts.push(rosterFingerprint()); }\n' +
    'const window = {}; const document = { getElementById: () => null, querySelector: () => null };\n' +
    'function fetch(){ return Promise.resolve({ ok: true, json: async () => ({ players: CFG.serverRoster || [] }) }); }\n' +
    ['sessionSignedOut','membershipPlays','landingViewFor','isCoach','currentUser','isPermanentPlayerUserId','canonicalPlayerIdForUser','ensureCanonicalPlayerRecord','hydrateSessionPlayerRecord','ensureOwnPlayerRecord',
     'ownPlayerRecordForUser','staffPreviewPlayerId','getPlayer','operationalCapacity','operationalGroups','resolveOperationalGroup','captureTrainingState','trainingStateOwner','stashTrainingState','adoptTrainingState','syncTrainingStateToGroup',
     'setView','adoptIdentityPayload','rosterFingerprint','loadRosterFromServer'].map(fn).join('\n') + '\n' +
    'const EMPTY_PLAYER = { id: "", name: "\\u2014" };\n' +
    'function apply(){ _myMembership = CFG.member || null; }\n' +
    'return { get state(){ return state; }, adopt: d => adoptIdentityPayload(d), setView, getPlayer, own: () => ownPlayerRecordForUser(currentUser()), isCoach, landing: landingViewFor, plays: () => membershipPlays(_myMembership, currentUser()?.role), groups: operationalGroups, capacity: operationalCapacity, loadRoster: loadRosterFromServer, ensureOwn: ensureOwnPlayerRecord, counts: () => ({ saves, renders, rosterPosts: rosterPosts.length }), toasts: () => toasts, membership: () => _myMembership, syncedFp: () => _rosterLastSyncedFp, fp: rosterFingerprint };';
  return new Function(body)({ user, member, operational, players, serverRoster: U18_ROSTER });
}
const louis  = { id: 'user_louis',  role: 'coach',  name: 'Louis W.',  email: 'louis@x.test' };
const victor = { id: 'user_victor', role: 'coach',  name: 'Victor P.', email: 'victor@x.test' };
const head   = { id: 'user_head',   role: 'coach',  name: 'Head Coach', email: 'head@x.test' };
const pl     = { id: 'user_pl',     role: 'player', name: 'Plain Player', email: 'pl@x.test' };
const adm    = { id: 'user_adm',    role: 'admin',  name: 'Club Admin', email: 'adm@x.test' };
const payload = (user, member, operational = OPERATIONAL) => ({ user: { id: user.id, role: member.role }, teamMember: member, permissions: ['publish_training'], operational });

// ── Single-role users: unchanged ────────────────────────────────────────────
test('1. coach-only: lands in coach, has no player record, player view stays the honest staff view', async () => {
  const c = client({ user: head, member: coachOnly(head.id) });
  c.adopt(payload(head, coachOnly(head.id), { player: { groups: [], defaultGroupId: null, mustChoose: false }, staff: OPERATIONAL.staff }));
  assert.equal(c.landing('coach', coachOnly(head.id)), 'coach');
  assert.equal(c.plays(), false);
  assert.equal(c.own(), null, 'no own player record is ever invented for staff who do not play');
  await c.loadRoster();
  assert.equal(c.state.players.length, 2, 'the roster is exactly the server roster');
  c.setView('player');
  assert.equal(c.getPlayer().id, '', 'honest empty player — never somebody else\'s profile');
  assert.equal(c.state.operationalGroupId, null, 'no player capacity → no group');
});
test('2. player-only: player experience unchanged (own record, Seniors group, no coach view)', () => {
  const c = client({ user: pl, member: playerOnly(pl.id) });
  c.adopt(payload(pl, playerOnly(pl.id), { player: OPERATIONAL.player, staff: { groups: [], defaultGroupId: null, mustChoose: false } }));
  assert.equal(c.landing('player', playerOnly(pl.id)), 'player');
  assert.equal(c.isCoach(), false);
  assert.equal(c.getPlayer().id, 'user_pl'); assert.equal(c.getPlayer().name, 'Plain Player');
  c.setView('player'); assert.equal(c.state.operationalGroupId, SENIORS);
  c.setView('coach'); assert.match(c.toasts().at(-1), /Player accounts cannot open coach tools/);
  assert.equal(c.state.activeView, 'player');
});
test('3. admin / other staff: unchanged — coach landing, no player record, club-wide staff capacity', () => {
  const c = client({ user: adm, member: adminMember(adm.id) });
  c.adopt(payload(adm, adminMember(adm.id), { player: { groups: [], defaultGroupId: null, mustChoose: false }, staff: { groups: [{ id: SENIORS }, { id: U18 }], defaultGroupId: null, mustChoose: true } }));
  assert.equal(c.landing('admin', adminMember(adm.id)), 'coach');
  assert.equal(c.own(), null);
  assert.equal(c.state.operationalGroupId, null, 'multi-group staff: the switcher asks, nothing is guessed');
});

// ── Dual-role users ─────────────────────────────────────────────────────────
for (const [who, user] of [['Louis', louis], ['Victor', victor]]) {
  test(`4/5/6. ${who}: both experiences available — Coach → Player resolves their own identity, Player → Coach restores staff`, async () => {
    const c = client({ user, member: dualMember(user.id, user.name) });
    c.adopt(payload(user, dualMember(user.id, user.name)));
    assert.equal(c.landing('coach', dualMember(user.id, user.name)), 'coach', 'a coaching role lands in the coach shell');
    assert.equal(c.isCoach(), true); assert.equal(c.plays(), true);
    await c.loadRoster();                                     // the U18-scoped roster arrives
    assert.equal(c.state.players.some(p => p.id === user.id), true, 'own record survives the scoped roster load');
    c.setView('player');
    assert.equal(c.state.activeView, 'player');
    const me = c.getPlayer();
    assert.equal(me.id, user.id, 'the player portal renders THEIR canonical identity');
    assert.equal(me.name, user.name);
    assert.equal(c.state.selectedPlayerId, user.id); assert.equal(c.state.selectedPlayerOwnerId, user.id);
    c.setView('coach');
    assert.equal(c.state.activeView, 'coach'); assert.equal(c.isCoach(), true);
    assert.equal(c.membership().role, 'coach', 'staff membership untouched');
  });
  test(`7/8/9/10. ${who}: player group is Seniors, coach group is U18 — re-resolved on every switch`, () => {
    const c = client({ user, member: dualMember(user.id, user.name) });
    c.adopt(payload(user, dualMember(user.id, user.name)));
    assert.equal(c.state.operationalGroupId, U18, 'coach shell operates U18');
    c.setView('player');
    assert.equal(c.capacity(), 'player'); assert.equal(c.state.operationalGroupId, SENIORS, 'player portal is Seniors');
    assert.deepEqual(c.groups().map(g => g.id), [SENIORS]);
    c.setView('coach');
    assert.equal(c.capacity(), 'staff'); assert.equal(c.state.operationalGroupId, U18, 'back to U18');
    assert.deepEqual(c.groups().map(g => g.id), [U18]);
  });
}

// ── Permissions / isolation (server-side rules, the authority) ─────────────
test('11. player capacity cannot reach U18: assertOperationalGroup as player refuses the coaching group', () => {
  const m = dualMember('user_louis', 'Louis W.');
  assert.deepEqual(operationalGroupsFor(m, STRUCTURE, { as: 'player' }).map(g => g.id), [SENIORS]);
  assert.throws(() => assertOperationalGroup({ teamMember: m, permissions: ['view_club'] , user: { id: 'user_louis' } }, STRUCTURE, U18, { as: 'player' }), /Not authorized/);
});
test('12. coach capacity keeps U18 and cannot reach Seniors as staff (no widening from the player side)', () => {
  const m = dualMember('user_victor', 'Victor P.');
  assert.deepEqual(operationalGroupsFor(m, STRUCTURE, { as: 'staff' }).map(g => g.id), [U18]);
  assert.throws(() => assertOperationalGroup({ teamMember: m, permissions: ['view_club'], user: { id: 'user_victor' } }, STRUCTURE, SENIORS, { as: 'staff' }), /Not authorized/);
});
test('13. player mode renders the account\'s own record, never another player\'s (no first-roster fallback, stale preview ignored)', async () => {
  const c = client({ user: louis, member: dualMember(louis.id, louis.name) });
  c.adopt(payload(louis, dualMember(louis.id, louis.name)));
  await c.loadRoster();
  c.state.selectedPlayerId = 'user_u18a'; c.state.selectedPlayerOwnerId = 'someone_else';   // residue from another account
  c.setView('player');
  assert.equal(c.getPlayer().id, louis.id);
});
test('14/15. group + club isolation: an archived or foreign group is refused for both capacities; an unknown club group is 404', () => {
  const m = dualMember('user_louis', 'Louis W.');
  const archived = { groups: [...STRUCTURE.groups, { id: 'grp_old', name: 'Old', status: 'archived' }] };
  assert.throws(() => assertOperationalGroup({ teamMember: m, permissions: ['view_club'], user: { id: 'x' } }, archived, 'grp_old', { as: 'staff' }), /archived/);
  assert.throws(() => assertOperationalGroup({ teamMember: m, permissions: ['view_club'], user: { id: 'x' } }, STRUCTURE, 'grp_other_club', { as: 'player' }), /Unknown group/);
  assert.equal(isPlayingMember(m), true); assert.equal(resolvePlayerGroup(m, STRUCTURE).groupId, SENIORS);
});

// ── State ───────────────────────────────────────────────────────────────────
test('16/17. reload in either mode → a valid role: landing is coach for a coaching role, and the own record re-hydrates from the session', () => {
  const c = client({ user: louis, member: dualMember(louis.id, louis.name), players: U18_ROSTER });
  assert.equal(c.own(), null, 'fresh device: no own record yet');
  c.adopt(payload(louis, dualMember(louis.id, louis.name)));
  assert.equal(c.own()?.id, louis.id, 'the identity payload alone hydrates it');
  assert.equal(c.landing('coach', dualMember(louis.id, louis.name)), 'coach');
});
test('18/19/20. repeated switching never corrupts identity or leaks a group between capacities', async () => {
  const c = client({ user: victor, member: dualMember(victor.id, victor.name) });
  c.adopt(payload(victor, dualMember(victor.id, victor.name)));
  await c.loadRoster();
  for (let i = 0; i < 6; i++) {
    c.setView('player'); assert.equal(c.state.operationalGroupId, SENIORS); assert.equal(c.getPlayer().id, victor.id);
    c.setView('coach');  assert.equal(c.state.operationalGroupId, U18);
    assert.equal(c.state.currentUserId, victor.id); assert.equal(c.membership().playerGroupId, SENIORS);
  }
  assert.equal(c.state.players.filter(p => p.id === victor.id).length, 1, 'never duplicated');
});
test('18b. the own record is the synced baseline — restoring it never queues a roster push, and a second load adds nothing', async () => {
  const c = client({ user: louis, member: dualMember(louis.id, louis.name) });
  c.adopt(payload(louis, dualMember(louis.id, louis.name)));
  await c.loadRoster();
  assert.equal(c.syncedFp(), c.fp(), 'fingerprint taken AFTER the own record is restored');
  assert.equal(c.counts().rosterPosts, 0);
  await c.loadRoster();
  assert.equal(c.state.players.length, 3); assert.equal(c.counts().rosterPosts, 0);
});

test('18c. the own record is only ever the ACCOUNT IN FORCE\'s: with another id as currentUserId nothing is hydrated', () => {
  const c = client({ user: louis, member: dualMember(louis.id, louis.name) });
  c.state.currentUserId = 'user_somebody_else';                 // login race: payload lands before the id switch
  c.adopt(payload(louis, dualMember(louis.id, louis.name)));    // membership says "plays", but for user_louis
  assert.equal(c.ensureOwn(), false);
  assert.equal(c.state.players.length, 0, 'no record invented while another account is in force');
  c.state.currentUserId = louis.id;                             // the switch completes
  assert.equal(c.ensureOwn(), true); assert.equal(c.state.players[0].id, louis.id);
});
test('13b. a roster row with the SAME NAME but another identity is never taken as the account\'s own record', async () => {
  const c = client({ user: louis, member: dualMember(louis.id, louis.name),
    players: [{ id: 'user_namesake', userId: 'user_namesake', name: 'Louis W.', email: 'other@x.test' }] });
  assert.equal(c.own(), null, 'identity keys only — never display-name similarity');
  c.adopt(payload(louis, dualMember(louis.id, louis.name)));
  assert.equal(c.own()?.id, louis.id);
  assert.equal(c.state.players.find(p => p.id === 'user_namesake').email, 'other@x.test', 'the namesake is untouched');
});

// ── Navigation ──────────────────────────────────────────────────────────────
test('21/22/23. routes both ways exist for staff only: sidebar Coach|Player switch, player account menu "Switch to coach view"; players never see either', () => {
  const nav = fn('renderNav'), menu = fn('openPlayerAccountMenu');
  assert.match(nav, /viewSwitch\.style\.display = isCoach\(\) \? '' : 'none'/, 'the Coach|Player switch is a staff control, visible in BOTH views');
  assert.match(menu, /isCoach\(\) \? `<button[^`]*setView\('coach'\)[^`]*Switch to coach view/, 'dual-role route back from the player portal');
  assert.match(fn('setView'), /if \(view !== state\.activeView\) \{ state\.activeView = view; resolveOperationalGroup\(\); \}/, 'setView re-resolves the group');
  assert.match(fn('loadRosterFromServer'), /ensureOwnPlayerRecord\(\);\s*\n\s*_rosterLastSyncedFp = rosterFingerprint\(\);/, 'own record restored before the synced fingerprint');
  assert.match(fn('adoptIdentityPayload'), /ensureOwnPlayerRecord\(\)/, 'identity adoption hydrates the own record');
});
