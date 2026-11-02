// CD-110 LOOP 1 — SERVER-SIDE club isolation for the surfaces the client fix
// touches: the two seeding targets (roster, club config) and the two caches that
// collide on a shared group id (attendance register, Match Centre teams).
//
// Drives the REAL api/publish handler with TWO independent clubs against a
// mocked Upstash. Every tenant is derived from the SESSION (requireTenant*);
// a teamId in the request body is never a way to reach another club.

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.cd110-isolation.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.PUBLIC_CLUB_SIGNUP       = 'true';
delete process.env.VERCEL; delete process.env.NODE_ENV;

const kv = new Map(), lists = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (url, options = {}) => {
  const u = String(url || '');
  if (!u.startsWith(process.env.UPSTASH_REDIS_REST_URL)) throw new Error('unexpected fetch ' + u);
  let p; try { p = JSON.parse(options.body || '[]'); } catch { p = null; }
  if (!Array.isArray(p)) return { ok: true, json: async () => ({ result: null }) };
  const [cmd, ...a] = p; let result = null;
  if (cmd === 'GET') result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (cmd === 'SET') { if (String(a[2] || '').toUpperCase() === 'NX' && kv.has(a[0])) result = null; else { kv.set(a[0], a[1]); result = 'OK'; } }
  if (cmd === 'DEL') { kv.delete(a[0]); result = 1; }
  if (cmd === 'SCAN') { const re = globToRe(a[2] || '*'); result = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (cmd === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); result = l.length; }
  if (cmd === 'LRANGE') result = (lists.get(a[0]) || []).slice(Number(a[1]), Number(a[2]) + 1);
  if (cmd === 'LTRIM' || cmd === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { default: publish } = await import('../api/publish.js');
const { saveClubStructure } = await import('../api/_structureStore.js');
const { SESSION_COOKIE } = store;

function res() { return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader() {}, end() { return this; } }; }
async function call(method, query, body, cookie) {
  const r = res();
  await publish({ method, query: query || {}, headers: cookie ? { cookie } : {}, body: body || {} }, r);
  return r;
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
const put = (k, v) => kv.set(k, JSON.stringify(v));
const get = k => (kv.has(k) ? JSON.parse(kv.get(k)) : null);
let _t = 0;
const makeClub = label => store.createClub({ clubName: `${label} RFC`, teamName: 'Seniors', sport: 'rugby', name: `${label} Coach`, email: `c${++_t}@cd110.test`, password: 'password123' });
async function regPlayer(teamId, name) {
  const token = 'TK' + String(++_t).padStart(8, '0');
  const invites = JSON.parse(kv.get('ce:invites') || '[]');
  invites.push({ token, email: `p${_t}@cd110.test`, name, role: 'player', teamId, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() });
  kv.set('ce:invites', JSON.stringify(invites));
  return store.claimInvite({ position: '2 — Hooker', token, email: `p${_t}@cd110.test`, name, password: 'password123' });
}
const structureFor = (names) => ({
  version: 1,
  groups: [{ id: 'grp_initial', name: 'Seniors', type: 'general', status: 'active' }],
  teams: names.map((name, i) => ({ id: i === 0 ? 'team_initial' : `team_${name.toLowerCase().replace(/\W+/g, '_')}`, groupId: 'grp_initial', name, status: 'active' })),
});
const attendanceDoc = playerKey => ({ sessions: { 'slot_tue-20260915': { date: '2026-09-15', title: 'Tuesday', marks: { [playerKey]: 'present' } } } });

async function twoClubs() {
  kv.clear(); lists.clear(); _t = 0;
  const A = await makeClub('Alpha');
  const B = await makeClub('Bravo');
  put(`app:roster:${A.team.id}`, { players: [{ id: 'pa1', name: 'Alpha One', position: 'Prop' }] });
  put(`app:roster:${B.team.id}`, { players: [{ id: 'pb1', name: 'Bravo One', position: 'Hooker' }] });
  put(`app:club:${A.team.id}`, { clubName: 'Alpha RFC', teamName: 'Seniors' });
  put(`app:club:${B.team.id}`, { clubName: 'Bravo RFC', teamName: 'Seniors' });
  // The SAME group id in both clubs — every club's first group is grp_initial.
  await saveClubStructure(A.team.id, structureFor(['Alpha Premier', 'Alpha Development']));
  await saveClubStructure(B.team.id, structureFor(['Bravo First XV', 'Bravo Seconds']));
  put(`app:publish:${A.team.id}:group:grp_initial:attendance`, attendanceDoc('id:user_pa1'));
  put(`app:publish:${B.team.id}:group:grp_initial:attendance`, attendanceDoc('id:user_pb1'));
  return { A, B };
}
const names = r => (r.body?.players || []).map(p => p.name);

test('roster read: each club\'s coach reads their own roster and only that (requirement 6 + 7)', async () => {
  const { A, B } = await twoClubs();
  const a = await call('GET', { resource: 'roster' }, null, ck(A.session));
  const b = await call('GET', { resource: 'roster' }, null, ck(B.session));
  assert.equal(a.statusCode, 200); assert.equal(b.statusCode, 200);
  assert.deepEqual(names(a), ['Alpha One'], 'Club A sees Club A');
  assert.deepEqual(names(b), ['Bravo One'], 'Club B sees Club B — legitimate access intact');
});

test('roster write: a forged teamId in the body cannot redirect the write into another club', async () => {
  const { A, B } = await twoClubs();
  const bBefore = kv.get(`app:roster:${B.team.id}`);
  const r = await call('POST', { resource: 'roster' }, { players: [{ id: 'pa2', name: 'Alpha Two', position: 'Lock' }], teamId: B.team.id }, ck(A.session));
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(kv.get(`app:roster:${B.team.id}`), bBefore, 'Club B\'s roster is byte-identical');
  const aNames = get(`app:roster:${A.team.id}`).players.map(p => p.name);
  assert.ok(aNames.includes('Alpha Two'), 'the write landed on the SESSION\'s club');
  assert.ok(!aNames.some(n => /Bravo/.test(n)), 'and carried nothing of Club B');
});

test('club config write: lands on the session\'s club only; a forged teamId is not honoured', async () => {
  const { A, B } = await twoClubs();
  const bBefore = kv.get(`app:club:${B.team.id}`);
  const r = await call('POST', { resource: 'club' }, { club: { clubName: 'Alpha Renamed RFC', teamName: 'Seniors' }, teamId: B.team.id }, ck(A.session));
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(get(`app:club:${A.team.id}`).clubName, 'Alpha Renamed RFC');
  assert.equal(kv.get(`app:club:${B.team.id}`), bBefore, 'Club B\'s record is untouched');
  assert.equal(get(`app:club:${B.team.id}`).clubName, 'Bravo RFC');
});

test('attendance register: the shared group id grp_initial still reads each club\'s own register', async () => {
  const { A, B } = await twoClubs();
  const a = await call('GET', { resource: 'attendance', group: 'grp_initial' }, null, ck(A.session));
  const b = await call('GET', { resource: 'attendance', group: 'grp_initial' }, null, ck(B.session));
  assert.equal(a.statusCode, 200, JSON.stringify(a.body)); assert.equal(b.statusCode, 200, JSON.stringify(b.body));
  const marksA = JSON.stringify(a.body.sessions), marksB = JSON.stringify(b.body.sessions);
  assert.ok(marksA.includes('id:user_pa1') && !marksA.includes('id:user_pb1'), 'Club A reads Club A\'s marks only');
  assert.ok(marksB.includes('id:user_pb1') && !marksB.includes('id:user_pa1'), 'Club B reads Club B\'s marks only');
  const forged = await call('GET', { resource: 'attendance', group: 'grp_initial', teamId: B.team.id }, null, ck(A.session));
  const marksF = JSON.stringify(forged.body?.sessions || {});
  assert.ok(marksF.includes('id:user_pa1') && !marksF.includes('id:user_pb1'), 'a forged teamId on the query changes nothing');
});

test('Match Centre teams: each club\'s coach is offered their own club\'s sides for grp_initial', async () => {
  const { A, B } = await twoClubs();
  const a = await call('GET', { resource: 'matchday-teams' }, null, ck(A.session));
  const b = await call('GET', { resource: 'matchday-teams' }, null, ck(B.session));
  assert.equal(a.statusCode, 200); assert.equal(b.statusCode, 200);
  assert.deepEqual(a.body.teams.map(t => t.name).sort(), ['Alpha Development', 'Alpha Premier']);
  assert.deepEqual(b.body.teams.map(t => t.name).sort(), ['Bravo First XV', 'Bravo Seconds']);
});

test('no session: roster, club config, attendance and teams all refuse with 401', async () => {
  await twoClubs();
  assert.equal((await call('GET', { resource: 'roster' })).statusCode, 401);
  assert.equal((await call('POST', { resource: 'roster' }, { players: [{ id: 'x', name: 'Nobody' }] })).statusCode, 401);
  assert.equal((await call('POST', { resource: 'club' }, { club: { clubName: 'Nobody RFC' } })).statusCode, 401);
  assert.equal((await call('GET', { resource: 'matchday-teams' })).statusCode, 401);
});

test('a player session cannot read or write the roster, write the club config, or read the group register (403)', async () => {
  const { A } = await twoClubs();
  const player = await regPlayer(A.team.id, 'Alpha Player');
  assert.equal((await call('GET', { resource: 'roster' }, null, ck(player.session))).statusCode, 403, 'roster read');
  assert.equal((await call('POST', { resource: 'roster' }, { players: [{ id: 'x', name: 'Smuggled' }] }, ck(player.session))).statusCode, 403, 'roster write');
  assert.equal((await call('POST', { resource: 'club' }, { club: { clubName: 'Taken Over RFC' } }, ck(player.session))).statusCode, 403, 'club config write');
  assert.equal(get(`app:club:${A.team.id}`).clubName, 'Alpha RFC', 'nothing was written');
  const register = await call('GET', { resource: 'attendance', group: 'grp_initial' }, null, ck(player.session));
  assert.ok(!JSON.stringify(register.body || {}).includes('id:user_pa1'), 'a player never receives the group register (self scope or refusal only)');
});
