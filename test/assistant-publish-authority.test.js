/**
 * ASSISTANT-COACH SQUAD PUBLISHING AUTHORITY (FIX-B-1).
 *
 * An assistant coach (role 'coach' + staffLevel 'assistant') HOLDS PUBLISH_SQUADS
 * (STAFF_CORE), and the server gates a publish on operating the fixture's group
 * (assertFixtureOperationalGroup). So an assistant with a stored accessScope
 * covering the fixture's group publishes; one without that scope is refused —
 * NOT because the code mis-resolves authority, but because their group was never
 * stamped (a data gap, repaired via Club Admin set_member_access). These pin the
 * authority model so FIX-B's client-honesty change surfaces the real result and
 * no future change quietly widens or narrows it.
 *
 * Isolation is never weakened here: the fix is client honesty + data repair, and
 * medical/snc/analyst never gain publishing authority.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.asst.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_url, options = {}) => {
  const [c, ...a] = JSON.parse(options.body || '[]'); let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (c === 'LRANGE') r = []; if (c === 'LPUSH' || c === 'LTRIM' || c === 'EXPIRE') r = 1;
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_identityStore.js');
const { INITIAL_GROUP_ID } = await import('../api/_structureStore.js');
const { default: handler } = await import('../api/publish.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-asst', OTHER = 'club-other';
const SEN = INITIAL_GROUP_ID, U18 = 'grp-u18';
const scope = gid => ({ clubWide: false, groups: [{ groupId: gid, status: 'active' }], teams: [] });

const STRUCTURE = { version: 1,
  groups: [{ id: SEN, name: 'Seniors', status: 'active' }, { id: U18, name: 'U18', status: 'active' }],
  teams: [{ id: 't-sen', groupId: SEN, name: 'Premier', status: 'active' },
          { id: 't-u18', groupId: U18, name: 'U18 Premier', status: 'active' }] };
const FIXTURES = [
  { id: 'fx-sen', groupId: SEN, opposition: 'Mons', date: '2026-08-20', status: 'scheduled' },
  { id: 'fx-u18', groupId: U18, opposition: 'Liege', date: '2026-08-21', status: 'scheduled' },
];
const asst = gid => ({ role: 'coach', staffLevel: 'assistant', status: 'active', ...(gid ? { accessScope: scope(gid) } : {}) });
const MEMBERS = [
  { id: 'm-headsen', teamId: CLUB, userId: 'u-headsen', role: 'coach', accessProfile: 'coach', status: 'active', accessScope: scope(SEN) },
  { id: 'm-admin', teamId: CLUB, userId: 'u-admin', role: 'admin', status: 'active', isOwner: true },
  { id: 'm-asst-u18', teamId: CLUB, userId: 'u-asst-u18', ...asst(U18) },
  { id: 'm-asst-sen', teamId: CLUB, userId: 'u-asst-sen', ...asst(SEN) },
  { id: 'm-asst-none', teamId: CLUB, userId: 'u-asst-none', ...asst(null) },
  { id: 'm-medical', teamId: CLUB, userId: 'u-medical', role: 'medical', status: 'active' },
  { id: 'm-snc', teamId: CLUB, userId: 'u-snc', role: 'snc', status: 'active' },
  { id: 'm-analyst', teamId: CLUB, userId: 'u-analyst', role: 'analyst', status: 'active' },
  { id: 'm-other', teamId: OTHER, userId: 'u-other', role: 'coach', accessProfile: 'full', status: 'active' },
];
const cookies = new Map();
async function login(uid) { const m = MEMBERS.find(x => x.userId === uid); const s = await createSession({ userId: uid, teamId: m.teamId, role: m.role }); cookies.set(uid, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`); }
async function seed() { kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Asst' }, { id: OTHER, name: 'Other' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ fixtures: FIXTURES }));
  kv.set(`app:club:${OTHER}`, JSON.stringify({ fixtures: [] }));
  for (const m of MEMBERS) await login(m.userId);
}
function res() { const o = { code: 0, body: null }; return { status(c){o.code=c;return this;}, json(b){o.body=b;return this;}, end(){return this;}, setHeader(){}, get result(){return o;} }; }
async function publish(uid, fixtureId, sideId, extra = {}) {
  const r = res();
  await handler({ method: 'POST', query: {}, headers: { cookie: cookies.get(uid) || '' },
    body: { type: 'squad', data: { published: true, fixtureId, sideId, formationNames: { 1: 'X' }, benchPlayers: [], ...extra } } }, r);
  return r.result;
}

test('MATRIX — role/scope → publish authority', async () => {
  await seed();
  // coach + correct group → succeeds
  assert.equal((await publish('u-headsen', 'fx-sen', 't-sen')).code, 200, 'Seniors coach publishes Seniors');
  // admin (club-wide) → succeeds for any group
  assert.equal((await publish('u-admin', 'fx-u18', 't-u18')).code, 200, 'admin publishes U18');
  // assistant WITH correct group authority → succeeds
  assert.equal((await publish('u-asst-u18', 'fx-u18', 't-u18')).code, 200, 'U18 assistant publishes U18');
  assert.equal((await publish('u-asst-sen', 'fx-sen', 't-sen')).code, 200, 'Seniors assistant publishes Seniors');
  // assistant + WRONG group → 403
  assert.equal((await publish('u-asst-u18', 'fx-sen', 't-sen')).code, 403, 'U18 assistant cannot publish Seniors');
  assert.equal((await publish('u-asst-sen', 'fx-u18', 't-u18')).code, 403, 'Seniors assistant cannot publish U18');
});

test('MATRIX — assistant with NO stored scope: reaches only the INITIAL group (data gap, not a code widening)', async () => {
  await seed();
  // A scopeless assistant defaults (derivedScopeFor) to the INITIAL group only.
  assert.equal((await publish('u-asst-none', 'fx-sen', 't-sen')).code, 200, 'scopeless assistant can publish the INITIAL (Seniors) group');
  // ...but CANNOT reach a newer group without its scope — this is the reported
  // "assistant cannot publish" case for a U18 assistant whose group was never
  // stamped. The fix is Club Admin data repair (set_member_access), NOT a code
  // widening: isolation to U18 is correctly preserved.
  const r = await publish('u-asst-none', 'fx-u18', 't-u18');
  assert.equal(r.code, 403, 'scopeless assistant is refused U18 (needs its group stamped)');
  assert.ok(!JSON.stringify(r.body).includes('X'), 'refusal writes nothing');
});

test('MATRIX — medical / snc / analyst never gain publishing authority', async () => {
  await seed();
  for (const uid of ['u-medical', 'u-snc', 'u-analyst']) {
    assert.equal((await publish(uid, 'fx-sen', 't-sen')).code, 403, `${uid} is refused (no PUBLISH_SQUADS)`);
  }
});

test('MATRIX — cross-club, missing session, forged group', async () => {
  await seed();
  // A coach of another club cannot publish this club's fixture.
  assert.equal((await publish('u-other', 'fx-sen', 't-sen')).code, 404, 'foreign club fixture unknown');
  // Missing/blank session → refused.
  const r = res();
  await handler({ method: 'POST', query: {}, headers: { cookie: '' },
    body: { type: 'squad', data: { published: true, fixtureId: 'fx-sen', sideId: 't-sen' } } }, r);
  assert.ok(r.result.code === 401 || r.result.code === 403, 'no session → refused');
  // Forged group in body cannot smuggle a U18 assistant into Seniors: the
  // fixture's stored group decides, so a U18 assistant naming Seniors is still 403.
  assert.equal((await publish('u-asst-u18', 'fx-sen', 't-sen', { group: U18, groupId: U18 })).code, 403,
    'forged group in the body is ignored — the fixture group governs');
});

test('MATRIX — two legitimate groups stay independent (no cross-group publish)', async () => {
  await seed();
  await publish('u-asst-u18', 'fx-u18', 't-u18');
  await publish('u-asst-sen', 'fx-sen', 't-sen');
  // Each wrote only its own group's pointer (FIX-A group scope preserved).
  assert.equal(JSON.parse(kv.get(`app:publish:${CLUB}:squad:current:${U18}`)).fixtureId, 'fx-u18');
  assert.equal(JSON.parse(kv.get(`app:publish:${CLUB}:squad:current:${SEN}`)).fixtureId, 'fx-sen');
  assert.equal(kv.get(`app:publish:${CLUB}:squad:current`), undefined, 'no group-less club-wide pointer written');
});
