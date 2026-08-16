/**
 * RC4.7 Phase C — scoped invites.
 *
 * An invite carries the scope it will grant on claim (whole club / group /
 * team). The creator must hold manage rights over that scope; claiming applies
 * ONLY the stored scope — nothing in the claim request can widen it. Legacy
 * unscoped invites keep their exact pre-Phase-C behaviour.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.scoped-invites.test';
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

const { default: inviteHandler } = await import('../api/invite.js');
const store = await import('../api/_identityStore.js');
const { effectiveAccessScope, effectiveEligibility } = await import('../api/_accessScope.js');

const CLUB = 'boitsfort-rugby-club';

const STRUCTURE = {
  version: 1,
  groups: [
    { id: 'grp-senior-men', name: 'Senior Men', type: 'general', status: 'active' },
    { id: 'grp-u18', name: 'U18', type: 'age-grade', status: 'active' },
    { id: 'grp-old', name: 'Veterans', type: 'general', status: 'archived' },
  ],
  teams: [
    { id: 'team-senior-1', groupId: 'grp-senior-men', name: 'Senior 1', status: 'active' },
    { id: 'team-senior-2', groupId: 'grp-senior-men', name: 'Senior 2', status: 'active' },
    { id: 'team-u18', groupId: 'grp-u18', name: 'U18', status: 'active' },
  ],
};

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort Rugby Club', teamName: 'Seniors' }]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-owner', email: 'owner@club.test', displayName: 'Owner' },
    { id: 'u-u18', email: 'u18@club.test', displayName: 'U18 Coach' },
    { id: 'u-multi', email: 'multi@club.test', displayName: 'Multi Group Coach' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'tm-owner', teamId: CLUB, userId: 'u-owner', role: 'coach', staffLevel: 'head',
      status: 'active', isOwner: true, accessProfile: 'full' },
    { id: 'tm-u18', teamId: CLUB, userId: 'u-u18', role: 'coach', staffLevel: 'head', status: 'active',
      accessScope: { clubWide: false, groups: [{ groupId: 'grp-u18', status: 'active' }], teams: [] } },
    { id: 'tm-multi', teamId: CLUB, userId: 'u-multi', role: 'coach', staffLevel: 'head', status: 'active',
      accessScope: { clubWide: false,
        groups: [{ groupId: 'grp-u18', status: 'active' }, { groupId: 'grp-senior-men', status: 'active' }], teams: [] } },
  ]));
  kv.set('ce:invites', JSON.stringify([]));
}

async function sessionFor(userId) {
  const { token } = await store.createSession({ userId, teamId: CLUB, role: 'coach' });
  return token;
}

function buildReq(method, body = null, token = '', query = {}) {
  return {
    method, url: '/api/invite', query,
    headers: { 'content-type': 'application/json', cookie: `ce_session=${token}`, host: 'test.local' },
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

const create = async (token, body) => {
  const res = buildRes();
  await inviteHandler(buildReq('POST', body, token), res);
  return res;
};

let ownerToken, u18Token, multiToken;
test.beforeEach(async () => {
  seed();
  ownerToken = await sessionFor('u-owner');
  u18Token = await sessionFor('u-u18');
  multiToken = await sessionFor('u-multi');
});

// ── Creation + validation ───────────────────────────────────────────────────
test('invite a scoped group coach and a team-scoped manager', async () => {
  const coach = await create(ownerToken, { name: 'New U18 Coach', role: 'coach',
    scope: { level: 'group', groupId: 'grp-u18' }, sendEmail: false });
  assert.equal(coach.statusCode, 201, JSON.stringify(coach.body));
  assert.deepEqual(coach.body.invite.scope, { groupId: 'grp-u18' });

  const manager = await create(ownerToken, { name: 'S2 Manager', role: 'coach', staffLevel: 'manager',
    scope: { level: 'team', teamId: 'team-senior-2' }, sendEmail: false });
  assert.equal(manager.statusCode, 201);
  assert.deepEqual(manager.body.invite.scope, { teamId: 'team-senior-2' });
});

test('invite a scoped player; club admin invite must be whole-club', async () => {
  const player = await create(ownerToken, { name: 'New Player', role: 'player',
    playerGroupId: 'grp-senior-men',
    scope: { level: 'team', teamId: 'team-senior-1' }, sendEmail: false });
  assert.equal(player.statusCode, 201);

  const badAdmin = await create(ownerToken, { name: 'Scoped Admin', role: 'admin',
    scope: { level: 'group', groupId: 'grp-u18' }, sendEmail: false });
  assert.equal(badAdmin.statusCode, 400);
  assert.match(badAdmin.body.error, /whole-club/);

  const admin = await create(ownerToken, { name: 'Real Admin', role: 'admin',
    scope: { level: 'club' }, sendEmail: false });
  assert.equal(admin.statusCode, 201);
  assert.deepEqual(admin.body.invite.scope, { clubWide: true });
});

test('scope validation: unknown and archived targets are rejected', async () => {
  const unknown = await create(ownerToken, { name: 'X', role: 'player',
    playerGroupId: 'grp-senior-men', scope: { level: 'group', groupId: 'grp-nope' }, sendEmail: false });
  assert.equal(unknown.statusCode, 404);

  const archived = await create(ownerToken, { name: 'X', role: 'player',
    playerGroupId: 'grp-senior-men', scope: { level: 'group', groupId: 'grp-old' }, sendEmail: false });
  assert.equal(archived.statusCode, 400);
  assert.match(archived.body.error, /archived/);

  const unknownTeam = await create(ownerToken, { name: 'X', role: 'player',
    playerGroupId: 'grp-senior-men', scope: { level: 'team', teamId: 'team-nope' }, sendEmail: false });
  assert.equal(unknownTeam.statusCode, 404);
});

test('a scoped coach cannot invite beyond their own scope', async () => {
  const outside = await create(u18Token, { name: 'X', role: 'player',
    playerGroupId: 'grp-u18', scope: { level: 'group', groupId: 'grp-senior-men' }, sendEmail: false });
  assert.equal(outside.statusCode, 403);

  const club = await create(u18Token, { name: 'X', role: 'player',
    playerGroupId: 'grp-u18', scope: { level: 'club' }, sendEmail: false });
  assert.equal(club.statusCode, 403);
  assert.match(club.body.error, /club-wide administrators/);

  const inside = await create(u18Token, { name: 'New U18 Player', role: 'player',
    playerGroupId: 'grp-u18',
    scope: { level: 'group', groupId: 'grp-u18' }, sendEmail: false });
  assert.equal(inside.statusCode, 201, 'their own group is fine');
});

test('unscoped invite: auto-scoped for a single-group coach, must choose for multi-group', async () => {
  const auto = await create(u18Token, { name: 'Auto Scoped', role: 'player',
    playerGroupId: 'grp-u18', sendEmail: false });
  assert.equal(auto.statusCode, 201, JSON.stringify(auto.body));
  assert.deepEqual(auto.body.invite.scope, { groupId: 'grp-u18' }, 'defaulted to their only group');

  // Multi-group inviter with no group named: must choose, never guess.
  const ambiguous = await create(multiToken, { name: 'Ambiguous', role: 'player', sendEmail: false });
  assert.equal(ambiguous.statusCode, 400);
  assert.match(ambiguous.body.error, /Choose which group/);

  // D1a — a player invite must still name the GROUP even when the staff scope
  // is left unset; only the staff-scope field is optional for a club-wide admin.
  const legacy = await create(ownerToken, { name: 'Legacy Unscoped', role: 'player',
    playerGroupId: 'grp-senior-men', sendEmail: false });
  assert.equal(legacy.statusCode, 201);
  assert.equal(legacy.body.invite.scope, undefined, 'club-wide admins keep the legacy unscoped staff scope');
  assert.equal(legacy.body.invite.playerGroupId, 'grp-senior-men', 'but the player group is explicit');
});

// ── Claim behaviour ─────────────────────────────────────────────────────────
test('claiming a scoped coach invite stamps exactly the stored group grant', async () => {
  const created = await create(ownerToken, { name: 'Ladies Coach', role: 'coach',
    scope: { level: 'group', groupId: 'grp-senior-men' }, sendEmail: false });
  const result = await store.claimInvite({
    token: created.body.token, email: 'sen.coach@club.test', password: 'Claim-2026-Pass!',
    // Elevation attempt: the request asks for club-wide — it must be IGNORED.
    scope: { level: 'club' }, accessScope: { clubWide: true },
  });
  const scope = effectiveAccessScope(result.teamMember);
  assert.equal(scope.clubWide, false, 'claim request cannot elevate');
  assert.deepEqual(scope.groups.filter(g => g.status === 'active').map(g => g.groupId), ['grp-senior-men']);
});

test('claiming a team-scoped player invite grants the team + eligibility with primary', async () => {
  const created = await create(ownerToken, { name: 'S2 Player', role: 'player',
    playerGroupId: 'grp-senior-men',
    scope: { level: 'team', teamId: 'team-senior-2' }, sendEmail: false });
  const result = await store.claimInvite({
    token: created.body.token, email: 's2.player@club.test', password: 'Claim-2026-Pass!',
  });
  // A PLAYER invite's scope drives ELIGIBILITY only — it never stamps
  // coaching accessScope (that stamped scope later seeded staff over-grants
  // on player→coach upgrades).
  const raw = JSON.parse(kv.get('app:identity:team_members')).find(m => m.id === result.teamMember.id);
  assert.equal(raw.accessScope, undefined, 'no coaching scope stored on a player');
  const elig = effectiveEligibility(result.teamMember);
  assert.deepEqual(elig.teamIds, ['team-senior-2']);
  assert.equal(elig.primaryTeamId, 'team-senior-2');
});

test('claiming a group-scoped player invite defaults eligibility to the group\'s active teams', async () => {
  const created = await create(ownerToken, { name: 'Senior Pool Player', role: 'player',
    playerGroupId: 'grp-senior-men',
    scope: { level: 'group', groupId: 'grp-senior-men' }, sendEmail: false });
  const result = await store.claimInvite({
    token: created.body.token, email: 'pool.player@club.test', password: 'Claim-2026-Pass!',
  });
  const raw = JSON.parse(kv.get('app:identity:team_members')).find(m => m.id === result.teamMember.id);
  assert.equal(raw.accessScope, undefined, 'no coaching scope stored on a player');
  const elig = effectiveEligibility(result.teamMember);
  assert.deepEqual(elig.teamIds.sort(), ['team-senior-1', 'team-senior-2'],
    'eligible for the group\'s active teams by default');
  // ONE user, ONE membership — nothing duplicated by dual eligibility.
  const members = JSON.parse(kv.get('app:identity:team_members'));
  assert.equal(members.filter(m => m.userId === result.user.id).length, 1);
});

test('a legacy unscoped invite claims exactly as before — no scope stamped', async () => {
  const created = await create(ownerToken, { name: 'Legacy Player', role: 'player',
    playerGroupId: 'grp-senior-men', sendEmail: false });
  const result = await store.claimInvite({
    token: created.body.token, email: 'legacy.player@club.test', password: 'Claim-2026-Pass!',
  });
  const raw = JSON.parse(kv.get('app:identity:team_members')).find(m => m.id === result.teamMember.id);
  assert.equal(raw.accessScope, undefined, 'no stored scope — legacy derivation applies');
  assert.equal(raw.playerEligibility, undefined, 'no stored eligibility');
});

test('a reusable scoped group link exists per role+scope and claims for many users', async () => {
  const link = await create(ownerToken, { group: true, role: 'player',
    scope: { level: 'group', groupId: 'grp-u18' } });
  assert.equal(link.statusCode, 200, JSON.stringify(link.body));

  const again = await create(ownerToken, { group: true, role: 'player',
    scope: { level: 'group', groupId: 'grp-u18' } });
  assert.equal(again.body.token, link.body.token, 'same scope+role → same permanent link');

  const other = await create(ownerToken, { group: true, role: 'player',
    scope: { level: 'group', groupId: 'grp-senior-men' } });
  assert.notEqual(other.body.token, link.body.token, 'different scope → different link');

  for (const n of [1, 2]) {
    const result = await store.claimInvite({
      token: link.body.token, name: `U18 Player ${n}`,
      email: `u18.player${n}@club.test`, password: 'Claim-2026-Pass!',
    });
    assert.equal(result.teamMember.playerGroupId, 'grp-u18', 'plays in the link\'s group');
    const raw = JSON.parse(kv.get('app:identity:team_members')).find(m => m.id === result.teamMember.id);
    assert.equal(raw.accessScope, undefined, 'no coaching scope stored on a player');
  }
});

test('the invite list carries plain-language scope labels', async () => {
  await create(ownerToken, { name: 'S2 Manager', role: 'coach', staffLevel: 'manager',
    scope: { level: 'team', teamId: 'team-senior-2' }, sendEmail: false });
  const res = buildRes();
  await inviteHandler(buildReq('GET', null, ownerToken), res);
  assert.equal(res.statusCode, 200);
  const scoped = res.body.invites.find(i => i.scope?.teamId === 'team-senior-2');
  assert.equal(scoped.scopeLabel, 'Senior Men · Senior 2', 'label, not raw ids');
});
