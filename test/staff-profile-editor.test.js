/**
 * STAFF PROFILE EDITOR — staff rows open the authoritative member editor.
 *
 *  Staff-only members (managers, admins, medics) have no roster row, so the
 *  Members detail view (keyed by _playerDetailId → state.players) could
 *  never open them — a mis-granted role was uncorrectable from the UI.
 *  Staff rows are now clickable for club-wide admins: dual-role members
 *  route to the FULL existing player detail; staff-only members get a
 *  panel built from the same authoritative components (renderAccessSection
 *  + new role/staff-level selectors wired to the EXISTING set_member_access
 *  contract — no new endpoint).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.staff-editor.test';
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

const { default: identityHandler } = await import('../api/identity.js');
const { default: publishHandler } = await import('../api/publish.js');
const store = await import('../api/_identityStore.js');
const { effectiveAccessScope, operationalGroupsFor, resolvePlayerGroup, resolveEligibility } =
  await import('../api/_accessScope.js');

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const CLUB = 'boitsfort', SEN = 'grp_initial', U18 = 'grp_2b0aa7f9', WOM = 'grp_1b0fb56b';
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
const scope = gids => ({ clubWide: false, groups: gids.map(g => ({ groupId: g, status: 'active' })), teams: [] });

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-simon', email: 's@c.test', displayName: 'Simon' },
    { id: 'u-isa', email: 'i@c.test', displayName: 'Isabelle' },
    { id: 'u-dual', email: 'd@c.test', displayName: 'Dual Coach' },
    { id: 'u-scoped', email: 'sc@c.test', displayName: 'Scoped Coach' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'm-simon', teamId: CLUB, userId: 'u-simon', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
    // Isabelle's EXACT production shape: admin + null scope = derived club-wide.
    { id: 'm-isa', teamId: CLUB, userId: 'u-isa', role: 'admin', staffLevel: 'assistant', status: 'active' },
    { id: 'm-dual', teamId: CLUB, userId: 'u-dual', role: 'coach', staffLevel: 'assistant', status: 'active', playerGroupId: SEN, accessScope: scope([U18]) },
    { id: 'm-scoped', teamId: CLUB, userId: 'u-scoped', role: 'coach', staffLevel: 'assistant', status: 'active', accessProfile: 'coach', accessScope: scope([SEN]) },
  ]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
}
async function identity(body, token) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await identityHandler({ method: 'POST', url: '/api/identity', query: {},
    headers: { 'content-type': 'application/json', cookie: token ? `ce_session=${token}` : '', host: 'test.local' },
    body, on() {} }, res);
  return res;
}
const sessionFor = (userId, role = 'coach') => store.createSession({ userId, teamId: CLUB, role });
const memberNow = id => JSON.parse(kv.get('app:identity:team_members')).find(m => m.id === id);
async function staffAcc(token) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await publishHandler({ method: 'GET', query: { resource: 'structure' },
    headers: { cookie: `ce_session=${token}` }, body: null, on() {} }, res);
  return {
    clubWide: res.body.clubWideStaffIds || [],
    byGroup: Object.fromEntries(Object.entries(res.body.counts?.groups || {}).map(([g, x]) => [g, x.staffUserIds || []])),
  };
}

// ── 1-3 + 10: the UI wiring (source pins on the real render code) ─────────
test('staff rows are clickable for club-wide admins and open the SAME authoritative editor', () => {
  assert.match(src, /openStaffDetail\('\$\{esc\(String\(s\.id\)\)\}'\)/, 'staff rows wired');
  assert.match(src, /_staffRowsEditable = canI\('assign_access'\)/, 'gated on assign_access + club-wide standing');
  const open = src.slice(src.indexOf('function openStaffDetail'), src.indexOf('function openStaffDetail') + 800);
  assert.match(open, /playerOpenDetail\(rosterRow\.id\)/, 'dual-role members route to the FULL player detail');
  assert.match(open, /_staffDetailUserId = String\(userId\)/, 'staff-only members get the staff panel');
  const panel = src.slice(src.indexOf('if (_staffDetailUserId) {'), src.indexOf('if (_staffDetailUserId) {') + 1600);
  assert.match(panel, /renderAccessSection\(member, user\)/, 'the panel reuses the authoritative editor');
  assert.match(panel, /renderStaffRoleControls\(member, name\)/, 'plus role/staff-level controls');
  // 10: the player-row path is untouched.
  assert.match(src, /function playerOpenDetail\(id\) \{\s*\n\s*_playerDetailId = id;/, 'player detail unchanged');
  const roleFn = src.slice(src.indexOf('async function adminSetMemberRoleLevel'), src.indexOf('async function adminSetMemberRoleLevel') + 900);
  assert.match(roleFn, /action: 'set_member_access'/, 'role changes use the existing contract — no new endpoint');
});

// ── 4-6 + 11: the exact Isabelle transformation, end to end ───────────────
test('Admin → Coach/Manager → U18-only: the full correction persists and the rosters follow', async () => {
  seed();
  const admin = await sessionFor('u-simon');
  // BEFORE: derived club-wide — visible as staff in every group.
  let acc = await staffAcc(admin.token);
  assert.ok(acc.clubWide.includes('u-isa'), 'starts as accidental club-wide');

  // Step 1 — role change (the new selector's wire).
  const r1 = await identity({ action: 'set_member_access', memberId: 'm-isa', role: 'coach', staffLevel: 'manager' }, admin.token);
  assert.equal(r1.code, 200, JSON.stringify(r1.body));
  assert.equal(memberNow('m-isa').role, 'coach');
  assert.equal(memberNow('m-isa').staffLevel, 'manager');

  // Step 2 — tick U18 (existing scope toggle wire: derived Seniors + U18 materialise).
  const r2 = await identity({ action: 'set_member_access', memberId: 'm-isa',
    accessScope: { clubWide: false, groups: [{ groupId: SEN, status: 'active' }, { groupId: U18, status: 'active' }], teams: [] } }, admin.token);
  assert.equal(r2.code, 200);

  // Step 3 — untick Seniors (existing remove wire).
  const r3 = await identity({ action: 'remove_member_scope', memberId: 'm-isa', groupId: SEN }, admin.token);
  assert.equal(r3.code, 200);

  const m = memberNow('m-isa');
  const sc = effectiveAccessScope(m);
  assert.equal(sc.clubWide, false, 'club-wide standing removed');
  assert.deepEqual(sc.groups.filter(g => g.status === 'active').map(g => g.groupId), [U18], 'U18 only');
  assert.deepEqual(operationalGroupsFor(m, STRUCTURE, { as: 'staff' }).map(g => g.id), [U18]);

  // 11: the staff rosters reflect it immediately (same resolver output).
  acc = await staffAcc(admin.token);
  assert.ok(!acc.clubWide.includes('u-isa'), 'no longer club-wide');
  assert.ok(acc.byGroup[U18].includes('u-isa'), 'U18 staff');
  assert.ok(!acc.byGroup[SEN].includes('u-isa'), 'gone from Seniors');
  assert.ok(!acc.byGroup[WOM].includes('u-isa'), "gone from Women's");
});

// ── 7: dual-role player side survives staff edits ─────────────────────────
test('editing a dual-role member\'s staff level never touches their player side', async () => {
  seed();
  const admin = await sessionFor('u-simon');
  const before = resolveEligibility(memberNow('m-dual'), STRUCTURE).teamIds.sort();
  const r = await identity({ action: 'set_member_access', memberId: 'm-dual', role: 'coach', staffLevel: 'manager' }, admin.token);
  assert.equal(r.code, 200);
  const m = memberNow('m-dual');
  assert.equal(m.staffLevel, 'manager', 'staff level changed');
  assert.equal(m.playerGroupId, SEN, 'playerGroupId untouched');
  assert.equal(resolvePlayerGroup(m, STRUCTURE).groupId, SEN);
  assert.deepEqual(resolveEligibility(m, STRUCTURE).teamIds.sort(), before, 'eligibility untouched');
  assert.deepEqual(effectiveAccessScope(m).groups.filter(g => g.status === 'active').map(g => g.groupId), [U18],
    'stored coaching scope preserved through the role/level change');
});

// ── 8-9: authorization walls ──────────────────────────────────────────────
test('a group-scoped coach and a player are refused by the same server gate', async () => {
  seed();
  const scoped = await sessionFor('u-scoped');
  assert.equal((await identity({ action: 'set_member_access', memberId: 'm-isa', role: 'coach', staffLevel: 'manager' }, scoped.token)).code, 403);
  const player = await sessionFor('u-dual', 'player');
  // (a player-session holder — even a dual-role one acting as player — still
  // passes requireClubManage only via club-wide standing, which u-dual lacks)
  assert.equal((await identity({ action: 'set_member_access', memberId: 'm-isa', role: 'coach' }, player.token)).code, 403);
  assert.equal(memberNow('m-isa').role, 'admin', 'nothing changed');
  // And the UI never offers the rows: the gate is pinned in the render.
  assert.match(src, /_staffRowsEditable && \(_adminData\.members \|\| \[\]\)/, 'row clickability gated');
});

// ── owner protection through the new selector ─────────────────────────────
test('the owner\'s role cannot be changed through the editor', async () => {
  seed();
  const admin = await sessionFor('u-simon');
  const r = await identity({ action: 'set_member_access', memberId: 'm-simon', role: 'medical' }, admin.token);
  assert.equal(r.code, 400, JSON.stringify(r.body));
  assert.match(String(r.body.error || ''), /owner/i);
  assert.match(src, /\$\{member\.isOwner \? 'disabled' : ''\}/, 'the selector is disabled for the owner too');
});
