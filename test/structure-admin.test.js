/**
 * RC4.7 Phase C — club structure administration (?resource=structure).
 *
 * Create / rename / archive / restore for groups and teams, duplicate
 * prevention within the same parent, last-active-group guard, counts in the
 * GET payload, and the authorization boundary: club-wide administrators only —
 * a group-scoped head coach is rejected even though they hold MANAGE_TEAMS
 * inside their own group.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.structure-admin.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';

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

const { default: publishHandler } = await import('../api/publish.js');
const store = await import('../api/_identityStore.js');

const CLUB = 'boitsfort-rugby-club';

function seedIdentity() {
  kv.set('app:identity:teams', JSON.stringify([
    { id: CLUB, name: 'Boitsfort Rugby Club', teamName: 'Seniors', teamCode: 'BOITSF42' },
  ]));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-owner', email: 'owner@club.test', displayName: 'Club Owner' },
    { id: 'u-u18', email: 'u18@club.test', displayName: 'U18 Coach' },
    { id: 'u-player', email: 'p@club.test', displayName: 'Player One' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'tm-owner', teamId: CLUB, userId: 'u-owner', role: 'coach', staffLevel: 'head',
      status: 'active', isOwner: true, accessProfile: 'full' },
    { id: 'tm-u18', teamId: CLUB, userId: 'u-u18', role: 'coach', staffLevel: 'head', status: 'active',
      accessScope: { clubWide: false, groups: [{ groupId: 'grp-u18', status: 'active' }], teams: [] } },
    { id: 'tm-player', teamId: CLUB, userId: 'u-player', role: 'player', status: 'active',
      accessScope: { clubWide: false, groups: [{ groupId: 'grp-u18', status: 'active' }], teams: [] },
      playerEligibility: { teamIds: ['team-u18'], primaryTeamId: 'team-u18' } },
  ]));
}

async function sessionFor(userId, role = 'coach') {
  const { token } = await store.createSession({ userId, teamId: CLUB, role });
  return token;
}

function buildReq(method, body = null, token = '', query = {}) {
  return {
    method, url: '/api/publish?resource=structure',
    query: { resource: 'structure', ...query },
    headers: { 'content-type': 'application/json', cookie: `ce_session=${token}` },
    body, on() {},
  };
}

function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code)    { this.statusCode = code; return this; },
    json(data)      { this.body = data; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end()           { return this; },
  };
}

async function op(token, body) {
  const res = buildRes();
  await publishHandler(buildReq('POST', body, token), res);
  return res;
}

let ownerToken, u18Token;
test.before(async () => {
  kv.clear();
  seedIdentity();
  ownerToken = await sessionFor('u-owner');
  u18Token = await sessionFor('u-u18');
});

// Shared ids captured as the structure is built up test-by-test.
const ids = {};

test('create group', async () => {
  const res = await op(ownerToken, { op: 'create_group', name: 'Senior Men' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  ids.seniorMen = res.body.group.id;
  assert.equal(res.body.group.name, 'Senior Men');
  // The synthesized initial structure was materialised alongside it.
  assert.ok(res.body.structure.groups.some(g => g.id === 'grp_initial'), 'initial group persisted');
});

test('duplicate group name rejected (case-insensitive)', async () => {
  const res = await op(ownerToken, { op: 'create_group', name: 'senior men' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /already exists/);
});

test('create teams inside a group', async () => {
  const s1 = await op(ownerToken, { op: 'create_team', groupId: ids.seniorMen, name: 'Senior 1' });
  const s2 = await op(ownerToken, { op: 'create_team', groupId: ids.seniorMen, name: 'Senior 2' });
  assert.equal(s1.statusCode, 200, JSON.stringify(s1.body));
  assert.equal(s2.statusCode, 200);
  ids.senior1 = s1.body.team.id;
  ids.senior2 = s2.body.team.id;
  assert.equal(s1.body.team.groupId, ids.seniorMen);
});

test('duplicate team name within the same group rejected; same name in ANOTHER group allowed', async () => {
  const dup = await op(ownerToken, { op: 'create_team', groupId: ids.seniorMen, name: 'senior 1' });
  assert.equal(dup.statusCode, 400);
  assert.match(dup.body.error, /already exists in this group/);

  const g2 = await op(ownerToken, { op: 'create_group', name: 'U18' });
  ids.u18Group = g2.body.group.id;
  const ok = await op(ownerToken, { op: 'create_team', groupId: ids.u18Group, name: 'Senior 1' });
  assert.equal(ok.statusCode, 200, 'same team name in a different group is fine');
  ids.u18StrayTeam = ok.body.team.id;
});

test('rename group and team, with duplicate protection', async () => {
  const r1 = await op(ownerToken, { op: 'rename_team', teamId: ids.u18StrayTeam, name: 'U18' });
  assert.equal(r1.statusCode, 200);
  assert.equal(r1.body.team.name, 'U18');

  const r2 = await op(ownerToken, { op: 'rename_group', groupId: ids.u18Group, name: 'Under 18' });
  assert.equal(r2.statusCode, 200);
  assert.equal(r2.body.group.name, 'Under 18');

  const clash = await op(ownerToken, { op: 'rename_group', groupId: ids.u18Group, name: 'Senior Men' });
  assert.equal(clash.statusCode, 400);

  const teamClash = await op(ownerToken, { op: 'rename_team', teamId: ids.senior2, name: 'Senior 1' });
  assert.equal(teamClash.statusCode, 400);
});

test('archive and restore a team', async () => {
  const arch = await op(ownerToken, { op: 'archive_team', teamId: ids.senior2 });
  assert.equal(arch.statusCode, 200);
  assert.equal(arch.body.team.status, 'archived');

  const back = await op(ownerToken, { op: 'restore_team', teamId: ids.senior2 });
  assert.equal(back.statusCode, 200);
  assert.equal(back.body.team.status, 'active');
});

test('archive and restore a group; teams inside an archived group cannot be restored', async () => {
  const arch = await op(ownerToken, { op: 'archive_group', groupId: ids.u18Group });
  assert.equal(arch.statusCode, 200);
  assert.equal(arch.body.group.status, 'archived');

  const teamInArchived = await op(ownerToken, { op: 'archive_team', teamId: ids.u18StrayTeam });
  assert.equal(teamInArchived.statusCode, 200, 'archiving a team inside an archived group is allowed');
  const restoreBlocked = await op(ownerToken, { op: 'restore_team', teamId: ids.u18StrayTeam });
  assert.equal(restoreBlocked.statusCode, 400);
  assert.match(restoreBlocked.body.error, /Restore the group/);

  const back = await op(ownerToken, { op: 'restore_group', groupId: ids.u18Group });
  assert.equal(back.statusCode, 200);
  assert.equal(back.body.group.status, 'active');
});

test('creating a team inside an archived group is rejected', async () => {
  await op(ownerToken, { op: 'archive_group', groupId: ids.u18Group });
  const res = await op(ownerToken, { op: 'create_team', groupId: ids.u18Group, name: 'Ghost XV' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /archived/);
  await op(ownerToken, { op: 'restore_group', groupId: ids.u18Group });
});

test('the last active group cannot be archived', async () => {
  // Archive everything except one, then try to archive the survivor.
  await op(ownerToken, { op: 'archive_group', groupId: ids.u18Group });
  await op(ownerToken, { op: 'archive_group', groupId: ids.seniorMen });
  const structRes = buildRes();
  await publishHandler(buildReq('GET', null, ownerToken), structRes);
  const stillActive = structRes.body.structure.groups.filter(g => g.status === 'active');
  assert.equal(stillActive.length, 1, 'exactly one active group remains');

  const blocked = await op(ownerToken, { op: 'archive_group', groupId: stillActive[0].id });
  assert.equal(blocked.statusCode, 400);
  assert.match(blocked.body.error, /at least one active group/);

  await op(ownerToken, { op: 'restore_group', groupId: ids.seniorMen });
  await op(ownerToken, { op: 'restore_group', groupId: ids.u18Group });
});

test('unknown ids are rejected with 404', async () => {
  for (const body of [
    { op: 'rename_group', groupId: 'grp-nope', name: 'X' },
    { op: 'rename_team', teamId: 'team-nope', name: 'X' },
    { op: 'archive_group', groupId: 'grp-nope' },
    { op: 'create_team', groupId: 'grp-nope', name: 'X' },
  ]) {
    const res = await op(ownerToken, body);
    assert.equal(res.statusCode, 404, `${body.op}: ${JSON.stringify(res.body)}`);
  }
});

test('a group-scoped coach cannot administer the structure at all', async () => {
  for (const body of [
    { op: 'create_group', name: 'Rogue Group' },
    { op: 'rename_group', groupId: ids.seniorMen, name: 'Hijacked' },
    { op: 'archive_group', groupId: ids.seniorMen },
  ]) {
    const res = await op(u18Token, body);
    assert.equal(res.statusCode, 403, `${body.op} must be denied`);
    assert.match(res.body.error, /club-wide administrators/i);
  }
});

test('GET returns hierarchy with member counts and staff names', async () => {
  const res = buildRes();
  await publishHandler(buildReq('GET', null, ownerToken), res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.structure.groups.length >= 3);
  // The U18 coach + player hold grants on 'grp-u18' (seeded), which is not a
  // stored structure group here — counts only cover real structure entries.
  assert.ok(res.body.counts.groups[ids.seniorMen], 'counts keyed by group');
  assert.deepEqual(res.body.clubWideStaff, ['Club Owner'], 'club-wide staff listed once');
});

test('a player cannot read the structure admin payload', async () => {
  const playerToken = await sessionFor('u-player', 'player');
  const res = buildRes();
  await publishHandler(buildReq('GET', null, playerToken), res);
  assert.equal(res.statusCode, 403);
});
