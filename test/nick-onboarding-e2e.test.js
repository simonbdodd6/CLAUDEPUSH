/**
 * NICK ONBOARDS A CLUB ALONE — the whole journey, end to end, no database.
 *
 *   provision → see the founder invitation → copy its link → reissue it →
 *   the old link is dead → the founder claims the new one → owns the club →
 *   reads the real team code → a player joins with it → the founder approves
 *   (placed in the club's one group) → the player answers availability and the
 *   coach's board shows it → the player sees the training week → a second club
 *   is provisioned and stays entirely separate.
 *
 * Real handlers over an in-memory store from an EMPTY world with one platform
 * administrator who holds no club membership — exactly production's shape.
 * Every step uses only what the product exposes to its users.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.nick-onboarding.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
delete process.env.PUBLIC_CLUB_SIGNUP;
delete process.env.APP_URL;

const kv = new Map();
globalThis.fetch = async (url, options = {}) => {
  if (String(url).startsWith('https://api.resend.com')) return { ok: true, status: 200, json: async () => ({ id: 'em_1' }) };
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') {
    if (String(args[2] || '').toUpperCase() === 'NX' && kv.has(args[0])) result = null;
    else { kv.set(args[0], args[1]); result = 'OK'; }
  }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const pat = at >= 0 ? String(args[at + 1]) : '*';
    const re = new RegExp(`^${pat.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    result = ['0', [...kv.keys()].filter(k => re.test(k))];
  }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM' || command === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: identityHandler } = await import('../api/identity.js');
const { default: publishHandler } = await import('../api/publish.js');
const { default: inviteHandler } = await import('../api/invite.js');
const { default: availabilityHandler } = await import('../api/availability.js');
const store = await import('../api/_identityStore.js');
const { isClubOwner, accessProfileOf, permissionsFor, PERM } = await import('../api/_permissions.js');
const { INITIAL_GROUP_ID } = await import('../api/_structureStore.js');

function emptyWorld() {
  kv.clear();
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-platform', email: 'platform@coacheasier.com', displayName: 'Platform Admin', platformRole: 'platform_admin' },
  ]));
  kv.set('app:identity:teams', JSON.stringify([]));
  kv.set('app:identity:team_members', JSON.stringify([]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set('ce:invites', JSON.stringify([]));
}
function makeRes() {
  return { code: 0, body: null, headers: {},
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end(b) { this.body = this.body ?? b ?? null; return this; } };
}
let ipSeq = 0;
async function call(handler, { method = 'GET', query = {}, body = null, token = '' } = {}) {
  const res = makeRes();
  await handler({ method, url: '/api', query, body, on() {},
    headers: { 'content-type': 'application/json', host: 'app.test',
               'x-forwarded-for': `10.6.${Math.floor(ipSeq / 250)}.${ipSeq++ % 250}`,
               cookie: token ? `ce_session=${token}` : '' } }, res);
  return res;
}
const identity = (body, token) => call(identityHandler, { method: 'POST', body, token });
const identityGet = (query, token) => call(identityHandler, { method: 'GET', query, token });
const publish = (method, query, body, token) => call(publishHandler, { method, query, body, token });
const validate = token => call(inviteHandler, { method: 'GET', query: { token } });
const tokenOf = res => String(res.headers['Set-Cookie'] || '').split(';')[0].split('=')[1];
const tokenFromUrl = url => decodeURIComponent(String(url).split('inv=')[1] || '');
const members = () => JSON.parse(kv.get('app:identity:team_members') || '[]');
const teamRecord = clubId => JSON.parse(kv.get('app:identity:teams') || '[]').find(t => t.id === clubId) || null;
const claim = (token, email, name) => identity({ action: 'claim_invite', token, email, name, password: 'longEnough123', position: '2 — Hooker' });

test('Nick provisions a club, recovers the founder link, the founder sets up players — and nothing touches the database or another club', async () => {
  emptyWorld();
  const nick = (await store.createSession({ userId: 'u-platform', teamId: 'none', role: 'coach' })).token;

  // 1. Provision. The founder link is shown once; no email is sent.
  const prov = await identity({ action: 'provision_club', clubName: 'Alpha RFC', adminEmail: 'founder@alpha.test', adminName: 'Fran Founder' }, nick);
  assert.equal(prov.code, 201, JSON.stringify(prov.body));
  const alpha = prov.body.team.id;
  const originalToken = tokenFromUrl(prov.body.inviteUrl);
  assert.ok(prov.body.team.teamCode, 'the club has a team code from birth');

  // 2. Nick can see where the founder stands, and copy the current link, later.
  let founders = await identityGet({ action: 'platform_founder_invites' }, nick);
  assert.equal(founders.code, 200, JSON.stringify(founders.body));
  let row = founders.body.founders.find(f => f.teamId === alpha);
  assert.equal(row.status, 'pending');
  assert.equal(row.email, 'founder@alpha.test');
  const copied = await identity({ action: 'founder_invite_link', teamId: alpha }, nick);
  assert.equal(copied.code, 200, JSON.stringify(copied.body));
  assert.equal(tokenFromUrl(copied.body.inviteUrl), originalToken, 'the same link Nick lost');

  // 3. The founder's address was mistyped: Nick reissues to the right one.
  const reissued = await identity({ action: 'reissue_founder_invite', teamId: alpha, adminEmail: 'fran@alpha.test' }, nick);
  assert.equal(reissued.code, 200, JSON.stringify(reissued.body));
  const newToken = tokenFromUrl(reissued.body.inviteUrl);
  assert.notEqual(newToken, originalToken);
  assert.equal(reissued.body.email, 'fran@alpha.test');
  assert.equal((await validate(originalToken)).code, 410, 'the old link is dead on the claim screen');
  assert.equal((await claim(originalToken, 'fran@alpha.test', 'Fran Founder')).code, 410, 'and cannot claim');
  assert.equal(members().length, 0, 'nobody joined through the dead link');

  // 4. The founder claims the new link and OWNS the club.
  const claimed = await claim(newToken, 'fran@alpha.test', 'Fran Founder');
  assert.equal(claimed.code, 201, JSON.stringify(claimed.body));
  const fran = tokenOf(claimed);
  const founderMember = members().find(m => m.teamId === alpha && m.userId === claimed.body.user.id);
  assert.equal(isClubOwner(founderMember), true);
  assert.equal(accessProfileOf(founderMember), 'full');
  for (const p of [PERM.MANAGE_TEAMS, PERM.MANAGE_PLAYERS, PERM.MANAGE_COACHES, PERM.ASSIGN_ACCESS]) {
    assert.ok(new Set(permissionsFor(founderMember)).has(p), `founder holds ${p}`);
  }
  assert.equal(store.isPlatformAdmin(claimed.body.user), false, 'the founder is not a platform administrator');

  // 5. Nick sees CLAIMED; the link is no longer handed out; a reissue is refused.
  founders = await identityGet({ action: 'platform_founder_invites' }, nick);
  row = founders.body.founders.find(f => f.teamId === alpha);
  assert.equal(row.status, 'claimed');
  assert.equal(row.email, 'fran@alpha.test');
  assert.equal((await identity({ action: 'founder_invite_link', teamId: alpha }, nick)).code, 409);
  assert.equal((await identity({ action: 'reissue_founder_invite', teamId: alpha }, nick)).body.code, 'owner_exists');

  // 6. The founder's session carries the REAL team code — the one the store holds.
  const founderSession = await identityGet({ action: 'session' }, fran);
  assert.equal(founderSession.code, 200);
  const code = teamRecord(alpha).teamCode;
  assert.equal(founderSession.body.teamCode, code, 'what Members will show');
  assert.equal(prov.body.team.teamCode, code, 'and what provisioning reported');

  // 7. A player joins with that code (typed in lower case) and waits in the inbox.
  const join = await identity({ action: 'join', teamCode: code.toLowerCase(), firstName: 'Pat', lastName: 'Player',
    email: 'pat@alpha.test', password: 'longEnough123' });
  assert.equal(join.code, 201, JSON.stringify(join.body));
  assert.equal(join.body.teamMember.teamId, alpha);
  assert.equal(join.body.teamMember.status, 'pending');
  const inbox = await identityGet({}, fran);
  assert.equal(inbox.code, 200, JSON.stringify(inbox.body));
  assert.ok((inbox.body.pending || []).some(p => p.id === join.body.teamMember.id), 'the request is in the founder\'s inbox');
  assert.equal((await identity({ action: 'login', email: 'pat@alpha.test', password: 'longEnough123' })).code >= 400, true,
    'no player access before approval');

  // 8. The founder approves. One group → the server places the player in it.
  const approved = await identity({ action: 'approve', memberId: join.body.teamMember.id }, fran);
  assert.equal(approved.code, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.teamMember.playerGroupId, INITIAL_GROUP_ID, 'placed, not left for later');
  assert.equal(approved.body.teamMember.status, 'active');

  // 9. The player signs in (no team code for them), answers availability, and the coach's board shows it.
  const login = await identity({ action: 'login', email: 'pat@alpha.test', password: 'longEnough123' });
  assert.equal(login.code, 200, JSON.stringify(login.body));
  const pat = tokenOf(login);
  const patSession = await identityGet({ action: 'session' }, pat);
  assert.equal('teamCode' in patSession.body, false, 'staff-only data stays staff-only');
  const answered = await call(availabilityHandler, { method: 'POST', token: pat,
    body: { sessionId: 'slot_tue', response: 'available', reason: '' } });
  assert.equal(answered.code, 200, JSON.stringify(answered.body));
  const board = await call(availabilityHandler, { method: 'GET', token: fran, query: { resolveRoster: '1', group: INITIAL_GROUP_ID } });
  assert.equal(board.code, 200, JSON.stringify(board.body));
  const mine = board.body.resolved[String(join.body.user.id).toLowerCase()];
  assert.ok(mine, 'the approved player is on the coach\'s board');
  assert.equal(mine.slot_tue.response, 'available');

  // 10. Training is visible to both.
  const coachWeek = await publish('GET', { resource: 'training-schedule' }, null, fran);
  assert.equal(coachWeek.code, 200, JSON.stringify(coachWeek.body));
  assert.ok((coachWeek.body.slots || []).length >= 1, 'the club has a training week');
  const playerWeek = await publish('GET', { resource: 'training-schedule' }, null, pat);
  assert.equal(playerWeek.code, 200, JSON.stringify(playerWeek.body));
  assert.deepEqual((playerWeek.body.slots || []).map(s => s.id), (coachWeek.body.slots || []).map(s => s.id),
    'the player sees the same week the coach set');

  // 11. A second club is provisioned and stays entirely separate.
  const prov2 = await identity({ action: 'provision_club', clubName: 'Bravo RFC', adminEmail: 'founder@bravo.test' }, nick);
  assert.equal(prov2.code, 201, JSON.stringify(prov2.body));
  const bravo = prov2.body.team.id;
  const claimedB = await claim(tokenFromUrl(prov2.body.inviteUrl), 'founder@bravo.test', 'Bo Bravo');
  assert.equal(claimedB.code, 201, JSON.stringify(claimedB.body));
  const bo = tokenOf(claimedB);
  const boSession = await identityGet({ action: 'session' }, bo);
  assert.equal(boSession.body.teamCode, teamRecord(bravo).teamCode);
  assert.notEqual(boSession.body.teamCode, code, 'Bravo has its own code');
  const bravoState = await identityGet({}, bo);
  assert.equal(bravoState.code, 200);
  assert.equal((bravoState.body.team_members || []).some(m => m.teamId === alpha), false, "Bravo's founder sees none of Alpha's members");
  assert.equal(JSON.stringify(bravoState.body).includes('pat@alpha.test'), false);
  assert.equal((await identity({ action: 'approve', memberId: join.body.teamMember.id }, bo)).code, 403, "Bravo cannot decide Alpha's requests");
  assert.equal((await identity({ action: 'join', teamCode: code, firstName: 'X', lastName: 'Y', email: 'x@bravo.test', password: 'longEnough123' })).body.teamMember.teamId, alpha,
    "Alpha's code still joins Alpha, whatever else exists");
  founders = await identityGet({ action: 'platform_founder_invites' }, nick);
  assert.deepEqual(founders.body.founders.map(f => [f.clubName, f.status]), [['Alpha RFC', 'claimed'], ['Bravo RFC', 'claimed']]);

  // 12. Nothing leaned on a database hand: no membership for Nick, no legacy tenant, no club record edited by hand.
  assert.equal(members().some(m => m.userId === 'u-platform'), false, 'the platform administrator joined nothing');
  assert.equal([...kv.keys()].some(k => k.includes('boitsfort')), false, 'no legacy tenant was created or required');
  assert.equal(JSON.parse(kv.get('app:identity:teams')).length, 2, 'two clubs, no duplicates');
});
