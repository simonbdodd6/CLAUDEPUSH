/**
 * STAFF ROSTER SCOPING + DUAL-ROLE VISIBILITY.
 *
 *  Bug A — dual-role coaches (Seniors players granted U18 coaching) were
 *  missing from U18 → Members → Coaches & staff: their DATA was right and
 *  the server computed them into staffUserIds[U18] correctly, but the
 *  client staff directory only set a user's role `if (!existing.role)` —
 *  a cached role:'player' entry was never corrected after the upgrade, and
 *  the staff list's role pre-filter dropped them forever.
 *
 *  Bug B — Isabelle appeared as staff in every group: she claimed the
 *  REUSABLE staff link minted as role 'admin' with NO scope. Role admin +
 *  null scope derives CLUB-WIDE (the model: Club Admin is a whole-club
 *  role). Her record faithfully reflects that link — the roster read it
 *  correctly. The grant path is fixed: coach/medical reusable links now
 *  bind to the OPERATING group like player links, and the admin link says
 *  in plain words that it mints whole-club administrators.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.staff-roster.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', []];
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: publishHandler } = await import('../api/publish.js');
const { default: identityHandler } = await import('../api/identity.js');
const { default: inviteHandler } = await import('../api/invite.js');
const store = await import('../api/_identityStore.js');
const { effectiveAccessScope, operationalGroupsFor, resolvePlayerGroup } = await import('../api/_accessScope.js');

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const CLUB = 'boitsfort', SEN = 'grp_initial', U18 = 'grp_2b0aa7f9', WOM = 'grp_1b0fb56b';
const scope = gids => ({ clubWide: false, groups: gids.map(g => ({ groupId: g, status: 'active' })), teams: [] });
const STRUCTURE = { version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'general', status: 'active' },
    { id: WOM, name: "Women's", type: 'general', status: 'active' },
  ],
  teams: [
    { id: 'team_prem', groupId: SEN, name: 'Premier', status: 'active' },
    { id: 'team_u18a', groupId: U18, name: 'U18 Premier', status: 'active' },
  ] };

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-simon', email: 's@c.test', displayName: 'Simon' },
    { id: 'u-isabelle', email: 'i@c.test', displayName: 'Isabelle' },
    { id: 'u-ben', email: 'b@c.test', displayName: 'Benjamin' },
    { id: 'u-plain', email: 'p@c.test', displayName: 'Plain Player' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    // A: club-wide
    { id: 'm-simon', teamId: CLUB, userId: 'u-simon', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
    // B: U18-only manager (the CORRECT shape for a scoped manager)
    { id: 'm-isabelle', teamId: CLUB, userId: 'u-isabelle', role: 'coach', staffLevel: 'manager', status: 'active', accessScope: scope([U18]) },
    // C: dual-role — Seniors player + U18 coach (Benjamin/Louis/Victor shape)
    { id: 'm-ben', teamId: CLUB, userId: 'u-ben', role: 'coach', staffLevel: 'assistant', status: 'active', playerGroupId: SEN, accessScope: scope([U18]) },
    // D: plain Seniors player
    { id: 'm-plain', teamId: CLUB, userId: 'u-plain', role: 'player', status: 'active', playerGroupId: SEN },
  ]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set('ce:invites', JSON.stringify([]));
}
async function structureGet(token) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await publishHandler({ method: 'GET', query: { resource: 'structure' },
    headers: { cookie: `ce_session=${token}` }, body: null, on() {} }, res);
  return res.body;
}
// The client's exact inclusion rule, driven by the server-computed ids.
const inScope = (acc, gid, uid) =>
  (acc.clubWideStaffIds || []).includes(uid) || ((acc.groupStaffIds || {})[gid] || []).includes(uid);
const accFrom = d => ({
  clubWideStaffIds: d.clubWideStaffIds || [],
  groupStaffIds: Object.fromEntries(Object.entries(d.counts?.groups || {}).map(([g, x]) => [g, x.staffUserIds || []])),
});
const sessionFor = userId => store.createSession({ userId, teamId: CLUB, role: 'coach' });

// ── 1-5 + 12-13: the four shapes against the authoritative rule ───────────
test('club-wide everywhere; scoped manager U18-only; dual-role U18-only; plain player nowhere', async () => {
  seed();
  const { token } = await sessionFor('u-simon');
  const acc = accFrom(await structureGet(token));

  for (const gid of [SEN, U18, WOM]) {
    assert.equal(inScope(acc, gid, 'u-simon'), true, `club-wide staff visible in ${gid}`);
  }
  assert.equal(inScope(acc, U18, 'u-isabelle'), true, 'U18 manager in U18');
  assert.equal(inScope(acc, SEN, 'u-isabelle'), false, 'U18 manager NOT in Seniors');
  assert.equal(inScope(acc, WOM, 'u-isabelle'), false, "U18 manager NOT in Women's");
  assert.equal(inScope(acc, U18, 'u-ben'), true, 'dual-role coach in U18 staff');
  assert.equal(inScope(acc, SEN, 'u-ben'), false, 'dual-role coach not Seniors STAFF (plays there only)');
  assert.equal(inScope(acc, WOM, 'u-ben'), false, "dual-role coach not Women's staff");
  for (const gid of [SEN, U18, WOM]) {
    assert.equal(inScope(acc, gid, 'u-plain'), false, `plain player never staff in ${gid}`);
  }
  // 12-13: manager staffLevel with U18-only scope gains nothing global; the
  // staff ROLE alone never bypasses scope.
  const isa = JSON.parse(kv.get('app:identity:team_members')).find(m => m.id === 'm-isabelle');
  assert.equal(effectiveAccessScope(isa).clubWide, false);
  assert.deepEqual(operationalGroupsFor(isa, STRUCTURE, { as: 'staff' }).map(g => g.id), [U18]);
});

// ── 6-11: the real profile grant path end to end ──────────────────────────
test('granting U18 via set_member_access surfaces the member in U18 staff and nowhere else', async () => {
  seed();
  const { token } = await sessionFor('u-simon');
  const before = accFrom(await structureGet(token));
  assert.equal(inScope(before, U18, 'u-plain'), false, 'no grant yet — not U18 staff');

  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await identityHandler({ method: 'POST', url: '/api/identity', query: {},
    headers: { 'content-type': 'application/json', cookie: `ce_session=${token}`, host: 'test.local' },
    body: { action: 'set_member_access', memberId: 'm-plain', role: 'coach', staffLevel: 'assistant',
      accessScope: scope([U18]) }, on() {} }, res);
  assert.equal(res.code, 200, JSON.stringify(res.body));

  const after = accFrom(await structureGet(token));
  assert.equal(inScope(after, U18, 'u-plain'), true, 'appears in U18 staff immediately');
  assert.equal(inScope(after, SEN, 'u-plain'), false, 'not Seniors staff');
  assert.equal(inScope(after, WOM, 'u-plain'), false, "not Women's staff");
  const m = JSON.parse(kv.get('app:identity:team_members')).find(x => x.id === 'm-plain');
  assert.equal(m.playerGroupId, SEN, 'playerGroupId stays Seniors');
  assert.notEqual(resolvePlayerGroup(m, STRUCTURE).groupId, U18, 'not a U18 player');

  // 11: removing the grant removes them from U18 staff.
  const res2 = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await identityHandler({ method: 'POST', url: '/api/identity', query: {},
    headers: { 'content-type': 'application/json', cookie: `ce_session=${token}`, host: 'test.local' },
    body: { action: 'remove_member_scope', memberId: 'm-plain', groupId: U18 }, on() {} }, res2);
  const gone = accFrom(await structureGet(token));
  assert.equal(inScope(gone, U18, 'u-plain'), false, 'revoked — gone from U18 staff');
  assert.equal(JSON.parse(kv.get('app:identity:team_members')).find(x => x.id === 'm-plain').playerGroupId, SEN,
    'Seniors player membership untouched by the revocation');
});

// ── Bug A client pins: the directory can no longer fossilise a stale role ─
test('the staff directory treats the MEMBER row as authoritative for role', () => {
  const start = src.indexOf('async function loadStaffDirectory');
  const body = src.slice(start, start + 1800);
  assert.match(body, /if \(existing\.role !== m\.role\) existing\.role = m\.role;/,
    'stale player role is corrected on sync');
  assert.equal(/if \(!existing\.role\)\s+existing\.role/.test(body), false, 'the fossilising branch is gone');
  // And a grant/revoke refreshes the directory immediately.
  const aa = src.indexOf('async function adminAction');
  assert.match(src.slice(aa, aa + 900), /_staffDirLoadedAt = 0;/, 'admin actions bust the 30s throttle');
});

// ── 14 + 17-19: invite paths resolve like profile grants ──────────────────
test('a U18 manager INVITE (coach/manager + U18 scope) produces U18-only staff — never club-wide', async () => {
  seed();
  const { token } = await sessionFor('u-simon');
  const inv = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await inviteHandler({ method: 'POST', url: '/api/invite', query: {},
    headers: { 'content-type': 'application/json', cookie: `ce_session=${token}`, host: 'test.local' },
    body: { name: 'New Manager', email: 'mgr@c.test', role: 'coach', staffLevel: 'manager',
      scope: { level: 'group', groupId: U18 } }, on() {} }, inv);
  const claim = await store.claimInvite({ token: inv.body.invite?.token || inv.body.token,
    name: 'New Manager', email: 'mgr@c.test', password: 'freshPassword12' });
  const sc = effectiveAccessScope(claim.teamMember);
  assert.equal(sc.clubWide, false, 'no clubWide');
  assert.deepEqual(sc.groups.filter(g => g.status === 'active').map(g => g.groupId), [U18], 'U18 only');
  const acc = accFrom(await structureGet(token));
  assert.equal(inScope(acc, U18, claim.user.id), true, 'invite-created staff resolves like profile-granted');
  assert.equal(inScope(acc, SEN, claim.user.id), false);
  assert.equal(inScope(acc, WOM, claim.user.id), false);
});

test('the REUSABLE coach link now binds to the operating group (the Isabelle-class hole)', async () => {
  seed();
  const { token } = await sessionFor('u-simon');
  // Exactly what the fixed modal sends while operating U18 in a multi-group club.
  const link = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await inviteHandler({ method: 'POST', url: '/api/invite', query: {},
    headers: { 'content-type': 'application/json', cookie: `ce_session=${token}`, host: 'test.local' },
    body: { group: true, role: 'coach', staffLevel: 'assistant', scope: { groupId: U18 } }, on() {} }, link);
  assert.equal(link.code, 200, JSON.stringify(link.body));
  const claim = await store.claimInvite({ token: link.body.token, name: 'Link Coach',
    email: 'linkcoach@c.test', password: 'freshPassword12' });
  const sc = effectiveAccessScope(claim.teamMember);
  assert.equal(sc.clubWide, false);
  assert.deepEqual(sc.groups.filter(g => g.status === 'active').map(g => g.groupId), [U18],
    'link-claimed coach is U18-only, never legacy Seniors/club-wide');
  // Client pins: the modal sends the scope and says so; the admin link warns.
  const loader = src.indexOf('async function _loadCoachGroupInviteLink');
  const lbody = src.slice(loader, loader + 2200);
  assert.match(lbody, /staffScoped \? \{ scope: \{ groupId: staffGid \} \}/, 'coach/medical links carry the operating group');
  assert.match(src, /whole-club administrator<\/strong>\. For a single group/, 'the admin link states its blast radius');
});

// ── 15-16: classification never mutates; server and UI agree ──────────────
test('rendering/classification never grants clubWide, and the UI consumes the SAME resolver output', async () => {
  seed();
  const { token } = await sessionFor('u-simon');
  const snapshot = kv.get('app:identity:team_members');
  const d = await structureGet(token);
  assert.equal(kv.get('app:identity:team_members'), snapshot, 'the GET mutated nothing');
  const acc = accFrom(d);
  const isa = JSON.parse(snapshot).find(m => m.id === 'm-isabelle');
  assert.deepEqual(operationalGroupsFor(isa, STRUCTURE, { as: 'staff' }).map(g => g.id),
    Object.entries(acc.groupStaffIds).filter(([, ids]) => ids.includes('u-isabelle')).map(([g]) => g),
    'staff list ids ARE operationalGroupsFor — one resolver, one answer');
});
