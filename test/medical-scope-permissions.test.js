/**
 * BUILD 99 — MEDICAL SCOPE + PERMISSION MODEL (server).
 *
 * Medical visibility is REACH × PERMISSION:
 *   · the Medical permission (medicalAccess, the Medical role, Full access)
 *     opens the Medical page and nothing else;
 *   · WHICH players and cases it shows is the member's explicit group access
 *     (accessScope) — or whole-club access;
 *   · what they may DO there comes from their access level. A medic on
 *     Limited access holds Medical, messages and reports: no coaching, no
 *     management, whatever groups they reach.
 *
 * And a medic's reach is never derived: a medical membership with no stored
 * scope reaches NO group (it used to derive Seniors). Manager access is a
 * separate grant that Medical never needs, and "Limited access" returns a
 * member to their role's own tools.
 *
 * Real handlers, seeded in-memory KV. All clinical/personal values are
 * fabricated sentinels.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.b99.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
delete process.env.DEV_LOGIN;

const kv = new Map();
const lists = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...a] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET') result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (command === 'SET') { if (String(a[2] || '').toUpperCase() === 'NX' && kv.has(a[0])) result = null; else { kv.set(a[0], a[1]); result = 'OK'; } }
  if (command === 'DEL') { kv.delete(a[0]); result = 1; }
  if (command === 'SCAN') { const re = globToRe(a[a.indexOf('MATCH') + 1] || '*'); result = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (command === 'INCR') { const v = Number(kv.get(a[0]) || 0) + 1; kv.set(a[0], String(v)); result = v; }
  if (command === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); result = l.length; }
  if (command === 'LRANGE') result = (lists.get(a[0]) || []).slice(Number(a[1]), Number(a[2]) + 1);
  if (['LTRIM', 'EXPIRE'].includes(command)) result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { INITIAL_GROUP_ID } = await import('../api/_structureStore.js');
const scopeMod = await import('../api/_accessScope.js');
const { permissionsFor, PERM, LIMITED_ACCESS } = await import('../api/_permissions.js');
const { default: publishHandler } = await import('../api/publish.js');
const { default: identityHandler } = await import('../api/identity.js');
const { default: availabilityHandler } = await import('../api/availability.js');
const { default: chatHandler } = await import('../api/chat.js');
const { default: inviteHandler } = await import('../api/invite.js');
const { SESSION_COOKIE, createSession } = store;
const { effectiveAccessScope, operationalGroupsFor, canManageGroup } = scopeMod;

const CLUB = 'club-b99', OTHER = 'club-other', SOLO = 'club-solo';
const SEN = INITIAL_GROUP_ID, U18 = 'grp-u18', WOM = 'grp-wom';
const STRUCTURE = { version: 1, groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
    { id: WOM, name: "Women's", type: 'general', status: 'active' }],
  teams: [
    { id: 't-sen', groupId: SEN, name: 'Premier', status: 'active' },
    { id: 't-u18p', groupId: U18, name: 'U18 Premier', status: 'active' },
    { id: 't-u18d', groupId: U18, name: 'U18 Premier Development', status: 'active' }] };
const ONE_GROUP = { version: 1, groups: [{ id: SEN, name: 'Firsts', type: 'general', status: 'active' }], teams: [] };
const scope = gids => ({ clubWide: false, groups: gids.map(groupId => ({ groupId, status: 'active' })), teams: [] });

const M = (id, extra) => ({ id: 'm-' + id, teamId: CLUB, userId: 'u-' + id, status: 'active', ...extra });
const MEMBERS = [
  M('owner',     { role: 'admin', isOwner: true }),
  // A co-owner flagged on a role with no default level: only the owner guard stands
  // between them and Limited access (the role-default check does not apply).
  M('co-owner',  { role: 'medical', isOwner: true }),
  M('sen-a',     { role: 'player', playerGroupId: SEN }),
  M('sen-b',     { role: 'player', playerGroupId: SEN }),
  M('u18-a',     { role: 'player', playerGroupId: U18 }),
  M('u18-b',     { role: 'player', playerGroupId: U18 }),
  // A — medical-only U18 physio (Limited access: no profile)
  M('med-u18',   { role: 'medical', medicalAccess: true, accessScope: scope([U18]) }),
  // B — medical-only Seniors physio
  M('med-sen',   { role: 'medical', medicalAccess: true, accessScope: scope([SEN]) }),
  // C — covers both groups explicitly
  M('med-both',  { role: 'medical', accessScope: scope([U18, SEN]) }),
  // D — explicit club-wide medical
  M('med-club',  { role: 'medical', accessScope: { clubWide: true, groups: [], teams: [] } }),
  // E — no medical scope, four shapes
  M('med-null',  { role: 'medical' }),
  M('med-empty', { role: 'medical', accessScope: { clubWide: false, groups: [], teams: [] } }),
  M('med-teams', { role: 'medical', accessScope: { clubWide: false, groups: [],
                   teams: [{ teamId: 't-u18p', status: 'active' }, { teamId: 't-u18d', status: 'active' }] } }),
  // The reported production membership, exactly: Manager access, Medical on, U18 grant removed.
  M('cor',       { role: 'medical', accessProfile: 'manager', medicalAccess: true,
                   accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'removed' }], teams: [] } }),
  // F — a U18 coach who also holds Medical
  M('coach-u18', { role: 'coach', staffLevel: 'assistant', accessProfile: 'coach', medicalAccess: true, accessScope: scope([U18]) }),
  // G — a U18 manager (Manager access by role) without Medical
  M('mgr-u18',   { role: 'coach', staffLevel: 'manager', accessScope: scope([U18]) }),
  // Legacy coaching staff and a player-physio: unchanged behaviour
  M('legacy-coach', { role: 'coach', staffLevel: 'assistant' }),
  M('player-physio', { role: 'player', playerGroupId: U18, medicalAccess: true }),
  // Another club
  { id: 'm-o-med', teamId: OTHER, userId: 'u-o-med', status: 'active', role: 'medical', accessScope: { clubWide: true, groups: [], teams: [] } },
  { id: 'm-o-p',   teamId: OTHER, userId: 'u-o-p',   status: 'active', role: 'player', playerGroupId: SEN },
  // A one-group club
  { id: 'm-s-med',   teamId: SOLO, userId: 'u-s-med',   status: 'active', role: 'medical' },
  { id: 'm-s-coach', teamId: SOLO, userId: 'u-s-coach', status: 'active', role: 'coach', staffLevel: 'assistant' },
  { id: 'm-s-p',     teamId: SOLO, userId: 'u-s-p',     status: 'active', role: 'player', playerGroupId: SEN },
];
const ROSTER = ['sen-a', 'sen-b', 'u18-a', 'u18-b', 'player-physio'].map(k => ({ id: 'u-' + k, userId: 'u-' + k, name: 'P ' + k }));
const CASES = [
  { id: 'mc-sen', playerId: 'u-sen-a', playerGroupId: SEN, status: 'active', condition: 'SEN-SENTINEL', timeline: [] },
  { id: 'mc-u18', playerId: 'u-u18-a', playerGroupId: U18, status: 'active', condition: 'U18-SENTINEL', timeline: [] },
];

const cookies = new Map();
async function seed() {
  kv.clear(); lists.clear(); cookies.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'B99' }, { id: OTHER, name: 'Other' }, { id: SOLO, name: 'Solo' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@b99.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:structure:${OTHER}`, JSON.stringify(ONE_GROUP));
  kv.set(`app:structure:${SOLO}`, JSON.stringify(ONE_GROUP));
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: ROSTER }));
  kv.set(`app:roster:${OTHER}`, JSON.stringify({ players: [{ id: 'u-o-p', userId: 'u-o-p', name: 'Other P' }] }));
  kv.set(`app:roster:${SOLO}`, JSON.stringify({ players: [{ id: 'u-s-p', userId: 'u-s-p', name: 'Solo P' }] }));
  kv.set(`app:medical:${CLUB}`, JSON.stringify({ version: 1, clubId: CLUB, cases: CASES, updatedAt: '2026-01-01T00:00:00.000Z' }));
  kv.set(`app:medical:${OTHER}`, JSON.stringify({ version: 1, clubId: OTHER, cases: [
    { id: 'mc-other', playerId: 'u-o-p', playerGroupId: SEN, status: 'active', condition: 'OTHER-CLUB-SENTINEL', timeline: [] }] }));
  kv.set(`app:medical:${SOLO}`, JSON.stringify({ version: 1, clubId: SOLO, cases: [
    { id: 'mc-solo', playerId: 'u-s-p', playerGroupId: SEN, status: 'active', condition: 'SOLO-SENTINEL', timeline: [] }] }));
  for (const m of MEMBERS) {
    const s = await createSession({ userId: m.userId, teamId: m.teamId, role: m.role });
    cookies.set(m.userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
  }
}
const member = userId => JSON.parse(kv.get('app:identity:team_members')).find(m => m.userId === userId);
function res() {
  const out = { code: 200, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           writeHead(c) { out.code = c; return this; },                         // the chat handler writes raw JSON
           end(d) { if (d) { try { out.body = JSON.parse(d); } catch { out.body = d; } } return this; },
           setHeader() {}, getHeader() {}, get result() { return out; } };
}
async function call(handler, user, { method = 'GET', query = {}, body = {} } = {}) {
  const r = res();
  const qs = new URLSearchParams(query).toString();
  await handler({ method, query, body, url: '/api/x' + (qs ? '?' + qs : ''), headers: { cookie: cookies.get(user) || '' } }, r);
  return r.result;
}
const medical = (u, query = {}) => call(publishHandler, u, { query: { resource: 'medical', ...query } });
const medicalPost = (u, body) => call(publishHandler, u, { method: 'POST', query: { resource: 'medical' }, body });
const identityPost = (u, body) => call(identityHandler, u, { method: 'POST', body });
const names = r => (r.body?.players || []).map(p => p.id).sort();
const caseIds = r => (r.body?.cases || []).map(c => c.id).sort();
const COACHING = [PERM.MANAGE_PLAYERS, PERM.PLAYER_DELETE, PERM.PUBLISH_TRAINING, PERM.PUBLISH_SQUADS,
                  PERM.MANAGE_FIXTURES, PERM.MANAGE_TEAMS, PERM.ASSIGN_ACCESS, PERM.MANAGE_COACHES, PERM.CLUB_EXPORTS];

// ── A. medical-only U18 ─────────────────────────────────────────────────────
test('A. a medical-only U18 physio reads U18 Medical and nothing else', async () => {
  await seed();
  const r = await medical('u-med-u18');
  assert.equal(r.code, 200);
  assert.deepEqual(names(r), ['u-player-physio', 'u-u18-a', 'u-u18-b'], 'U18 players only');
  assert.deepEqual(caseIds(r), ['mc-u18'], 'U18 cases only');
  assert.deepEqual(r.body.groups.map(g => g.id), [U18], 'the server says which groups it reached');
  assert.equal(JSON.stringify(r.body).includes('SEN-SENTINEL'), false, 'no Seniors medical content');
  assert.equal((await medical('u-med-u18', { group: SEN })).code, 403, 'naming Seniors is refused');
  assert.equal((await medical('u-med-u18', { group: WOM })).code, 403);
  assert.equal((await medical('u-med-u18', { group: U18 })).code, 200);
});

test('A. a medical-only U18 physio gains no coaching or management anywhere', async () => {
  await seed();
  const m = member('u-med-u18');
  const perms = permissionsFor(m);
  assert.equal(perms.has(PERM.MEDICAL_ACCESS), true);
  for (const p of COACHING) assert.equal(perms.has(p), false, `must not hold ${p}`);
  const ctx = { user: { id: m.userId }, teamMember: m };
  for (const p of [PERM.MANAGE_PLAYERS, PERM.PUBLISH_TRAINING, PERM.PUBLISH_SQUADS, PERM.MANAGE_FIXTURES]) {
    assert.equal(canManageGroup(ctx, STRUCTURE, U18, p), false, `no ${p} even in U18`);
  }
  // …and every coaching / club surface refuses them.
  const refused = [
    ['roster read',        await call(publishHandler, 'u-med-u18', { query: { resource: 'roster', group: U18 } })],
    ['roster write',       await call(publishHandler, 'u-med-u18', { method: 'POST', query: { resource: 'roster' }, body: { players: [] } })],
    ['structure read',     await call(publishHandler, 'u-med-u18', { query: { resource: 'structure' } })],
    ['match-day teams',    await call(publishHandler, 'u-med-u18', { query: { resource: 'matchday-teams' } })],
    ['access assignment',  await identityPost('u-med-u18', { action: 'set_member_access', memberId: 'm-sen-a', accessScope: scope([U18]) })],
    ['profile assignment', await identityPost('u-med-u18', { action: 'set_access_profile', memberId: 'm-med-u18', accessProfile: 'coach' })],
    ['clear the week',     await call(availabilityHandler, 'u-med-u18', { method: 'POST', body: { action: 'clear_week', group: U18, sessions: ['s-1'] } })],
    ['create an invite',   await call(inviteHandler, 'u-med-u18', { method: 'POST', body: { role: 'player' } })],
  ];
  for (const [what, out] of refused) assert.equal(out.code, 403, `${what} is refused (${out.code})`);
  assert.equal(member('u-med-u18').accessProfile, undefined, 'their own profile was not changed');
});

test('A. the U18 physio writes U18 cases, and cannot write Seniors ones', async () => {
  await seed();
  const own = await medicalPost('u-med-u18', { action: 'upsert_case', playerId: 'u-u18-b', userId: 'u-u18-b', condition: 'U18-NEW' });
  assert.equal(own.code, 200);
  const before = kv.get(`app:medical:${CLUB}`);
  assert.equal((await medicalPost('u-med-u18', { action: 'upsert_case', playerId: 'u-sen-b', userId: 'u-sen-b', condition: 'X' })).code, 403);
  assert.equal((await medicalPost('u-med-u18', { action: 'resolve_case', caseId: 'mc-sen' })).code, 403);
  assert.equal(kv.get(`app:medical:${CLUB}`), before, 'refused writes change nothing');
});

// ── B. medical-only Seniors ─────────────────────────────────────────────────
test('B. a medical-only Seniors physio reads Seniors and not U18', async () => {
  await seed();
  const r = await medical('u-med-sen');
  assert.deepEqual(names(r), ['u-sen-a', 'u-sen-b']);
  assert.deepEqual(caseIds(r), ['mc-sen']);
  assert.equal(JSON.stringify(r.body).includes('U18-SENTINEL'), false);
  assert.equal((await medical('u-med-sen', { group: U18 })).code, 403);
});

// ── C. explicit U18 + Seniors ───────────────────────────────────────────────
test('C. a physio granted U18 and Seniors reads both — one group at a time, or both', async () => {
  await seed();
  assert.deepEqual(caseIds(await medical('u-med-both', { group: U18 })), ['mc-u18']);
  assert.deepEqual(caseIds(await medical('u-med-both', { group: SEN })), ['mc-sen']);
  assert.deepEqual(caseIds(await medical('u-med-both')), ['mc-sen', 'mc-u18'], 'no group named: both granted groups');
  assert.equal((await medical('u-med-both', { group: WOM })).code, 403, "Women's was never granted");
});

// ── D. club-wide medical ────────────────────────────────────────────────────
test('D. club-wide medical reads every group and still gains no coaching', async () => {
  await seed();
  for (const g of [SEN, U18, WOM]) assert.equal((await medical('u-med-club', { group: g })).code, 200, g);
  assert.deepEqual(caseIds(await medical('u-med-club')), ['mc-sen', 'mc-u18']);
  const perms = permissionsFor(member('u-med-club'));
  for (const p of COACHING) assert.equal(perms.has(p), false, `club-wide reach does not add ${p}`);
  assert.equal((await call(publishHandler, 'u-med-club', { query: { resource: 'roster' } })).code, 403);
  assert.equal((await identityPost('u-med-club', { action: 'set_member_access', memberId: 'm-sen-a', accessScope: scope([U18]) })).code, 403);
});

// ── E. no medical scope ─────────────────────────────────────────────────────
test('E. Medical with no scope fails closed — every shape, including the reported membership', async () => {
  await seed();
  for (const u of ['u-med-null', 'u-med-empty', 'u-med-teams', 'u-cor']) {
    const m = member(u);
    assert.deepEqual(operationalGroupsFor(m, STRUCTURE, { as: 'staff' }), [], `${u} reaches no group`);
    const r = await medical(u);
    assert.equal(r.code, 200, `${u} may open Medical`);
    assert.deepEqual(r.body.players, [], `${u}: no players`);
    assert.deepEqual(r.body.cases, [], `${u}: no cases`);
    assert.deepEqual(r.body.groups, [], `${u}: and the server says so`);
    for (const g of [SEN, U18, WOM]) assert.equal((await medical(u, { group: g })).code, 403, `${u} cannot name ${g}`);
    const forged = await medical(u, { teamId: OTHER, clubId: OTHER, playerGroupId: U18 });
    assert.deepEqual(forged.body.players, [], `${u}: forged ids widen nothing`);
    for (const target of [['u-u18-b', 'u-u18-b'], ['u-sen-b', 'u-sen-b']]) {
      const w = await medicalPost(u, { action: 'upsert_case', playerId: target[0], userId: target[1], condition: 'NOPE' });
      assert.equal(w.code, 403, `${u} cannot write for ${target[0]}`);
    }
  }
  assert.equal(JSON.parse(kv.get(`app:medical:${CLUB}`)).cases.some(c => c.condition === 'NOPE'), false);
});

test('E. no Seniors fallback: an unscoped medic reaches nothing, even in a one-group club', async () => {
  await seed();
  assert.deepEqual(effectiveAccessScope(member('u-med-null')), { clubWide: false, groups: [], teams: [] });
  assert.deepEqual(operationalGroupsFor(member('u-s-med'), ONE_GROUP, { as: 'staff' }), [], 'no single-group guess for Medical');
  const solo = await medical('u-s-med');
  assert.deepEqual(solo.body.cases, [], 'the only group is still not granted');
  assert.equal(JSON.stringify(solo.body).includes('SOLO-SENTINEL'), false);
  // Legacy COACHING staff keep today's derivation — this build changes Medical only.
  assert.deepEqual(operationalGroupsFor(member('u-legacy-coach'), STRUCTURE, { as: 'staff' }).map(g => g.id), [SEN]);
  assert.deepEqual(operationalGroupsFor(member('u-s-coach'), ONE_GROUP, { as: 'staff' }).map(g => g.id), [SEN]);
  // …and a player holding the Medical grant still reads where they play.
  assert.deepEqual(names(await medical('u-player-physio')), ['u-player-physio', 'u-u18-a', 'u-u18-b']);
});

test('E. an unscoped medic is offered to no player as a message contact; a scoped one is', async () => {
  await seed();
  const dm = async u => (await call(chatHandler, u, { query: { action: 'dm_candidates' } })).body.candidates.map(c => c.userId);
  const u18Player = await dm('u-u18-a');
  assert.ok(u18Player.includes('u-med-u18'), 'the U18 physio is reachable by U18 players');
  assert.ok(!u18Player.includes('u-med-null'), 'an unscoped medic reaches no group');
  assert.ok(!u18Player.includes('u-med-sen'), 'a Seniors physio is not a U18 contact');
});

// ── F. U18 coach + Medical ──────────────────────────────────────────────────
test('F. a U18 coach who holds Medical keeps U18 coaching and U18 Medical', async () => {
  await seed();
  const m = member('u-coach-u18');
  assert.equal(canManageGroup({ user: { id: m.userId }, teamMember: m }, STRUCTURE, U18, PERM.MANAGE_PLAYERS), true);
  assert.equal((await call(publishHandler, 'u-coach-u18', { query: { resource: 'roster', group: U18 } })).code, 200);
  assert.equal((await call(publishHandler, 'u-coach-u18', { query: { resource: 'roster', group: SEN } })).code, 403);
  assert.deepEqual(caseIds(await medical('u-coach-u18')), ['mc-u18']);
  assert.equal((await medical('u-coach-u18', { group: SEN })).code, 403);
});

// ── G. Manager, and Limited access ──────────────────────────────────────────
test('G. Manager access never implies Medical, and Medical never needs Manager', async () => {
  await seed();
  assert.equal(permissionsFor(member('u-mgr-u18')).has(PERM.MEDICAL_ACCESS), false);
  assert.equal((await medical('u-mgr-u18')).code, 403, 'a manager without Medical cannot read it');
  assert.equal(permissionsFor(member('u-med-u18')).has(PERM.MANAGE_PLAYERS), false, 'the U18 physio holds no Manager permission…');
  assert.equal((await medical('u-med-u18')).code, 200, '…and reads Medical anyway');
});

test('G. Limited access removes Manager access; granting U18 then gives Medical without coaching', async () => {
  await seed();
  assert.equal(permissionsFor(member('u-cor')).has(PERM.MANAGE_PLAYERS), true, 'starts with Manager permissions');
  assert.equal((await call(publishHandler, 'u-cor', { query: { resource: 'roster' } })).code, 200);

  const out = await identityPost('u-owner', { action: 'set_access_profile', memberId: 'm-cor', accessProfile: LIMITED_ACCESS });
  assert.equal(out.code, 200, JSON.stringify(out.body));
  assert.equal(out.body.newProfile, 'limited');
  const after = member('u-cor');
  assert.equal('accessProfile' in after, false, 'the stored profile is cleared, not re-labelled');
  assert.equal(after.medicalAccess, true, 'the Medical setting is untouched');
  assert.deepEqual(after.accessScope, { clubWide: false, groups: [{ groupId: U18, status: 'removed' }], teams: [] }, 'scope untouched');
  assert.equal(after.role, 'medical', 'role untouched');
  assert.deepEqual([...permissionsFor(after)].sort(), [PERM.MEDICAL_ACCESS, PERM.MESSAGING, PERM.REPORTS].sort(),
    'exactly the Medical role\'s own tools');
  assert.equal((await call(publishHandler, 'u-cor', { query: { resource: 'roster' } })).code, 403, 'no stale Manager permission server-side');
  const audit = JSON.parse(kv.get('app:identity:audit_log') || '[]');
  assert.ok(audit.some(e => e.event === 'access_profile_changed' && e.memberId === 'm-cor' && e.newProfile === 'limited'),
    'the change is audited');

  // Now give him U18 — the same group tick the Members editor sends.
  const grant = await identityPost('u-owner', { action: 'set_member_access', memberId: 'm-cor', accessScope: scope([U18]) });
  assert.equal(grant.code, 200);
  const r = await medical('u-cor');
  assert.deepEqual(names(r), ['u-player-physio', 'u-u18-a', 'u-u18-b'], 'U18 players appear');
  assert.deepEqual(caseIds(r), ['mc-u18']);
  const m = member('u-cor');
  for (const p of [PERM.MANAGE_PLAYERS, PERM.PUBLISH_TRAINING, PERM.MANAGE_FIXTURES]) {
    assert.equal(canManageGroup({ user: { id: m.userId }, teamMember: m }, STRUCTURE, U18, p), false, `still no ${p} in U18`);
  }
  assert.equal((await medical('u-cor', { group: SEN })).code, 403, 'Seniors stays closed');
});

test('G. Limited access is validated: only for roles without a default level, never for the owner, only by Full access', async () => {
  await seed();
  const coachBefore = member('u-coach-u18').accessProfile;
  const onCoach = await identityPost('u-owner', { action: 'set_access_profile', memberId: 'm-coach-u18', accessProfile: 'limited' });
  assert.equal(onCoach.code, 400, 'a coaching role would silently take its role default instead');
  assert.equal(member('u-coach-u18').accessProfile, coachBefore, 'unchanged');
  assert.equal((await identityPost('u-owner', { action: 'set_access_profile', memberId: 'm-owner', accessProfile: 'limited' })).code, 400,
    'the owner cannot be reduced');
  assert.equal((await identityPost('u-owner', { action: 'set_access_profile', memberId: 'm-co-owner', accessProfile: 'limited' })).code, 400,
    'an owner on a role without a default level cannot be reduced either');
  assert.equal((await identityPost('u-coach-u18', { action: 'set_access_profile', memberId: 'm-cor', accessProfile: 'limited' })).code, 403,
    'only the owner or Full access may change access levels');
  assert.equal((await identityPost('u-cor', { action: 'set_access_profile', memberId: 'm-cor', accessProfile: 'limited' })).code, 403,
    'nobody edits their own level without Full access');
  const bad = await identityPost('u-owner', { action: 'set_access_profile', memberId: 'm-cor', accessProfile: 'banana' });
  assert.equal(bad.code, 400);
  assert.equal(member('u-cor').accessProfile, 'manager', 'nothing refused changed anything');
});

// ── H. forged identifiers ───────────────────────────────────────────────────
test('H. forged group, team, club, player and user ids never widen Medical', async () => {
  await seed();
  assert.equal((await medical('u-med-u18', { group: 'grp-forged' })).code, 404, 'unknown group');
  const q = await medical('u-med-u18', { teamId: OTHER, clubId: OTHER });
  assert.deepEqual(caseIds(q), ['mc-u18'], 'club/team query fields are ignored');
  assert.equal(JSON.stringify(q.body).includes('OTHER-CLUB-SENTINEL'), false);
  const before = kv.get(`app:medical:${CLUB}`);
  const attempts = [
    { action: 'upsert_case', playerId: 'u-sen-a', userId: 'u-u18-a', severity: 'X' },                     // forged own-group userId
    { action: 'upsert_case', playerId: 'u-sen-a', userId: 'u-sen-a', playerGroupId: U18, groupId: U18,
      teamId: OTHER, clubId: OTHER, severity: 'X' },                                                         // forged group/team/club fields
    { action: 'upsert_case', playerId: 'u-sen-a', severity: 'X' },                                           // no userId
    { action: 'upsert_case', playerId: 'u-o-p', userId: 'u-o-p', condition: 'X' },                           // another club's player
    { action: 'resolve_case', caseId: 'mc-sen' },
    { action: 'resolve_case', caseId: 'mc-other' },                                                          // another club's case
  ];
  for (const body of attempts) {
    const out = await medicalPost('u-med-u18', body);
    assert.ok([400, 403, 404].includes(out.code), `${JSON.stringify(body)} refused (${out.code})`);
  }
  assert.equal(kv.get(`app:medical:${CLUB}`), before, 'this club\'s store unchanged');
  assert.equal(JSON.parse(kv.get(`app:medical:${OTHER}`)).cases.length, 1, 'the other club\'s store unchanged');
});

// ── I. tenant isolation ─────────────────────────────────────────────────────
test('I. another club stays out of reach — both ways', async () => {
  await seed();
  const other = await medical('u-o-med');
  assert.deepEqual(caseIds(other), ['mc-other'], 'a club-wide medic reads their own club only');
  assert.equal(JSON.stringify(other.body).match(/SEN-SENTINEL|U18-SENTINEL/), null);
  assert.equal((await medical('u-o-med', { group: U18 })).code, 404, 'this club\'s group id means nothing there');
  for (const u of ['u-med-club', 'u-med-both', 'u-med-u18']) {
    assert.equal(JSON.stringify((await medical(u)).body).includes('OTHER-CLUB-SENTINEL'), false, `${u} never sees the other club`);
  }
});
