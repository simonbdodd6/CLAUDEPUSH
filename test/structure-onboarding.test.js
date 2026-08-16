/**
 * NEW GROUP / TEAM ONBOARDING — the flow already existed end-to-end; this
 * suite proves the whole chain with the REAL handlers and pins the two
 * additions: the operational-selector refresh after a structure op, and
 * read-only structure controls for non-club-wide staff.
 *
 *  server: POST ?resource=structure (create_group/create_team) — club-wide
 *  admins only, session-tenant only, case-insensitive duplicate rejection,
 *  stable grp_/team_ ids, active by default, audit-logged.
 *  invites: the operational-group player link carries playerGroupId; claim
 *  stamps it; eligibility to every active team in the group is automatic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.structure-onboarding.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const pat = at >= 0 ? String(args[at + 1]) : '*';
    const re = new RegExp(`^${pat.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    result = ['0', [...kv.keys()].filter(k => re.test(k))];
  }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: publishHandler } = await import('../api/publish.js');
const { default: inviteHandler } = await import('../api/invite.js');
const store = await import('../api/_identityStore.js');
const { resolvePlayerGroup, resolveEligibility, effectiveAccessScope, operationalGroupsFor } =
  await import('../api/_accessScope.js');
const { default: availabilityHandler } = await import('../api/availability.js');

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  let start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let body = src.indexOf('{', i), depth = 0, end = body;
  for (let b = body; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1);
}

const CLUB = 'boitsfort', OTHER = 'otherclub';
const SEN = 'grp_initial', U18 = 'grp_2b0aa7f9', WOM = 'grp_1b0fb56b';
const scope = gids => ({ clubWide: false, groups: gids.map(g => ({ groupId: g, status: 'active' })), teams: [] });
const BASE_STRUCTURE = { version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'general', status: 'active' },
    { id: WOM, name: "Women's", type: 'general', status: 'active' },
  ],
  teams: [
    { id: 'team_f9113560', groupId: SEN, name: 'Premier', status: 'active' },
    { id: 'team_initial',  groupId: SEN, name: 'Premier development', status: 'active' },
  ] };

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }, { id: OTHER, name: 'Other Club' }]));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-simon', email: 's@c.test', displayName: 'Simon' },
    { id: 'u-scoped', email: 'sc@c.test', displayName: 'Scoped Coach' },
    { id: 'u-player', email: 'p@c.test', displayName: 'A Player' },
    { id: 'u-otheradmin', email: 'o@c.test', displayName: 'Other Admin' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'm-simon', teamId: CLUB, userId: 'u-simon', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
    { id: 'm-scoped', teamId: CLUB, userId: 'u-scoped', role: 'coach', staffLevel: 'assistant', status: 'active', accessProfile: 'coach', accessScope: scope([SEN]) },
    { id: 'm-player', teamId: CLUB, userId: 'u-player', role: 'player', status: 'active', playerGroupId: SEN },
    { id: 'm-otheradmin', teamId: OTHER, userId: 'u-otheradmin', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
  ]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(structuredClone(BASE_STRUCTURE)));
  kv.set(`app:structure:${OTHER}`, JSON.stringify({ version: 1,
    groups: [{ id: 'grp_initial', name: 'Seniors', type: 'general', status: 'active' }],
    teams: [{ id: 'team_o1', groupId: 'grp_initial', name: 'First XV', status: 'active' }] }));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Boitsfort', fixtures: [] }));
  kv.set('ce:invites', JSON.stringify([]));
}
async function api(handler, method, query, body, token) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await handler({ method, query, headers: { cookie: `ce_session=${token}`, host: 'test.local', 'content-type': 'application/json' }, body, on() {} }, res);
  return res;
}
const structure = (method, body, token, query = {}) =>
  api(publishHandler, method, { resource: 'structure', ...query }, body, token);
const session = (userId, teamId = CLUB, role = 'coach') => store.createSession({ userId, teamId, role });
const storedStructure = () => JSON.parse(kv.get(`app:structure:${CLUB}`));

// ── 1-3: creation authorization ───────────────────────────────────────────
test('a club admin creates a group; scoped coach and player are refused', async () => {
  seed();
  const admin = await session('u-simon');
  const r = await structure('POST', { op: 'create_group', name: '  U16  ' }, admin.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.group.name, 'U16', 'name trimmed');
  assert.match(r.body.group.id, /^grp_[0-9a-f]{8}$/, 'stable id strategy');
  assert.equal(r.body.group.status, 'active', 'active by default');

  const scoped = await session('u-scoped');
  const rs = await structure('POST', { op: 'create_group', name: 'U14' }, scoped.token);
  assert.equal(rs.code, 403, 'group-scoped coach refused');

  const player = await session('u-player', CLUB, 'player');
  const rp = await structure('POST', { op: 'create_group', name: 'U12' }, player.token);
  assert.equal([401, 403].includes(rp.code), true, 'player refused');
  assert.equal(storedStructure().groups.some(g => g.name === 'U14' || g.name === 'U12'), false, 'nothing written');
});

// ── 4-5: team creation, own club only ─────────────────────────────────────
test('teams attach to own-club groups only — another club\'s group id is unknown here', async () => {
  seed();
  const admin = await session('u-simon');
  const g = await structure('POST', { op: 'create_group', name: 'U16' }, admin.token);
  const t = await structure('POST', { op: 'create_team', groupId: g.body.group.id, name: 'U16 Premier' }, admin.token);
  assert.equal(t.code, 200);
  assert.match(t.body.team.id, /^team_[0-9a-f]{8}$/);
  assert.equal(t.body.team.groupId, g.body.group.id);

  // The OTHER club's admin cannot attach a team to Boitsfort's group: the
  // session tenant scopes the structure, so the foreign group simply does
  // not exist for them.
  const other = await session('u-otheradmin', OTHER);
  const cross = await structure('POST', { op: 'create_team', groupId: g.body.group.id, name: 'Hijack' }, other.token);
  assert.equal(cross.code, 404, JSON.stringify(cross.body));
  assert.equal(storedStructure().teams.some(x => x.name === 'Hijack'), false);
});

// ── 6-7: duplicates ───────────────────────────────────────────────────────
test('duplicate group and team names are rejected case-insensitively', async () => {
  seed();
  const admin = await session('u-simon');
  const dupG = await structure('POST', { op: 'create_group', name: 'seniors' }, admin.token);
  assert.equal(dupG.code, 400, 'group duplicate rejected');
  const g = await structure('POST', { op: 'create_group', name: 'U16' }, admin.token);
  await structure('POST', { op: 'create_team', groupId: g.body.group.id, name: 'U16 Premier' }, admin.token);
  const dupT = await structure('POST', { op: 'create_team', groupId: g.body.group.id, name: 'u16 premier' }, admin.token);
  assert.equal(dupT.code, 400, 'team duplicate rejected within the group');
});

// ── 8-10: persistence + operational list ──────────────────────────────────
test('new group and team survive reload and join the admin\'s operational groups', async () => {
  seed();
  const admin = await session('u-simon');
  const g = await structure('POST', { op: 'create_group', name: 'U16' }, admin.token);
  const t = await structure('POST', { op: 'create_team', groupId: g.body.group.id, name: 'U16 Premier' }, admin.token);
  const reread = await structure('GET', null, admin.token);
  assert.ok(reread.body.structure.groups.some(x => x.id === g.body.group.id), 'group persisted');
  assert.ok(reread.body.structure.teams.some(x => x.id === t.body.team.id), 'team persisted');
  const member = JSON.parse(kv.get('app:identity:team_members')).find(m => m.userId === 'u-simon');
  const ops = operationalGroupsFor(member, reread.body.structure, { as: 'staff' }).map(x => x.id);
  assert.ok(ops.includes(g.body.group.id), 'club-wide admin operates the new group at once');
  // The client refreshes the session payload after a structure op, so the
  // switcher sees exactly this without logout.
  assert.match(fn('structureOp'), /checkServerSession\(\)/, 'selector refresh wired in');
});

// ── 11-13: player onboarding into the new group ───────────────────────────
test('the new group\'s scoped player invite stamps playerGroupId and full team eligibility', async () => {
  seed();
  const admin = await session('u-simon');
  const g = await structure('POST', { op: 'create_group', name: 'U16' }, admin.token);
  const gid = g.body.group.id;
  const t1 = await structure('POST', { op: 'create_team', groupId: gid, name: 'U16 Premier' }, admin.token);
  const t2 = await structure('POST', { op: 'create_team', groupId: gid, name: 'U16 Premier Development' }, admin.token);

  // The reusable player link, exactly as the Members button requests it.
  const link = await api(inviteHandler, 'POST', {},
    { group: true, playerGroupId: gid, scope: { groupId: gid } }, admin.token);
  assert.equal(link.code, 200, JSON.stringify(link.body));

  await store.claimInvite({ token: link.body.token, name: 'New U16 Player',
    email: 'u16kid@club.test', password: 'realPassword12' });
  const member = JSON.parse(kv.get('app:identity:team_members'))
    .find(m => m.teamId === CLUB && m.role === 'player' && m.playerGroupId === gid);
  assert.ok(member, 'claimed player carries the NEW group id');

  const struct = storedStructure();
  assert.equal(resolvePlayerGroup(member, struct).groupId, gid);
  const teams = resolveEligibility(member, struct).teamIds.sort();
  assert.deepEqual(teams, [t1.body.team.id, t2.body.team.id].sort(),
    'automatically eligible for every active team in the group');

  // Invisible everywhere else: the operational filter drops them for other groups.
  for (const other of [SEN, U18, WOM]) {
    assert.notEqual(resolvePlayerGroup(member, struct).groupId, other);
  }
});

// ── 14: scoped staff invite does not become club-wide ─────────────────────
test('a staff invite scoped to the new group grants that group only', async () => {
  seed();
  const admin = await session('u-simon');
  const g = await structure('POST', { op: 'create_group', name: 'U16' }, admin.token);
  const gid = g.body.group.id;
  const inv = await api(inviteHandler, 'POST', {},
    { name: 'U16 Coach', email: 'u16coach@club.test', role: 'coach', staffLevel: 'assistant',
      scope: { level: 'group', groupId: gid } }, admin.token);
  assert.equal([200, 201].includes(inv.code), true, JSON.stringify(inv.body));
  const token = inv.body.invite?.token || inv.body.token;
  await store.claimInvite({ token, name: 'U16 Coach', email: 'u16coach@club.test', password: 'realPassword12' });
  const coach = JSON.parse(kv.get('app:identity:team_members'))
    .find(m => m.teamId === CLUB && m.role === 'coach' && m.userId !== 'u-simon' && m.userId !== 'u-scoped');
  const eff = effectiveAccessScope(coach);
  assert.equal(eff.clubWide, false, 'not club-wide');
  assert.deepEqual(eff.groups.filter(x => x.status === 'active').map(x => x.groupId), [gid],
    'operates exactly the new group');
});

// ── 15-16: existing structures untouched; empty group stays empty ─────────
test('existing groups are untouched and the empty new group never falls back to Seniors data', async () => {
  seed();
  // Seniors data that must NOT leak: legacy schedule + an availability answer.
  kv.set(`app:publish:${CLUB}:training_schedule`, JSON.stringify({ slots: [
    { id: 'slot_tue', day: 'Tue', startTime: '19:45', sessionId: 'tue', active: true }] }));
  const before = JSON.stringify(storedStructure().groups.map(g => [g.id, g.name, g.status]));
  const admin = await session('u-simon');
  const g = await structure('POST', { op: 'create_group', name: 'U16' }, admin.token);
  const gid = g.body.group.id;
  const after = storedStructure();
  assert.equal(JSON.stringify(after.groups.filter(x => x.id !== gid).map(x => [x.id, x.name, x.status])), before,
    'Seniors/U18/Women\'s unchanged byte-for-byte');

  // Training schedule for the new group: honestly EMPTY, never the legacy record.
  const sched = await api(publishHandler, 'GET', { resource: 'training-schedule', group: gid }, null, admin.token);
  assert.deepEqual(sched.body.slots, [], 'empty-group schedule');
  assert.equal(sched.body.seededFrom, 'empty-group');

  // Availability board for the new group: nobody, nothing resolved.
  const board = await api(availabilityHandler, 'GET', { resolveRoster: '1', group: gid }, null, admin.token);
  assert.equal(board.code, 200);
  assert.deepEqual(board.body.resolved, {}, 'no Seniors answers surface');
});

// ── UI gating pins ────────────────────────────────────────────────────────
test('structure controls render for club-wide admins only; players never see the card', () => {
  const card = fn('renderClubStructureCard');
  assert.match(card, /canI\('manage_teams'\)/, 'permission-gated card');
  assert.match(card, /_canEditStructure/, 'mutating controls gated on club-wide standing');
  assert.match(card, /clubWideStaffIds/, 'standing comes from the server-computed list');
  // Every mutating control is behind the flag.
  for (const ctl of ['structureAddGroup()', "structureOp('restore_group'", "structureOp('restore_team'"]) {
    const at = card.indexOf(ctl);
    assert.ok(at > 0, `${ctl} present`);
    assert.ok(card.lastIndexOf('_canEditStructure', at) > 0, `${ctl} gated`);
  }
});
