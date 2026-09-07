/**
 * MEDICAL SAVE — the physio's own device (production incident, 7 Sep 2026).
 *
 * "Add injury → Save injury" returned "Could not save — try again" for every
 * medical-role user in the multi-group club, and no case had been stored since
 * the club gained a second group.
 *
 * WHY: the client sends `userId` from `state.players.find(id === playerId)?.userId`.
 * A medical-role user never loads the roster (that read needs coach permission),
 * and the medical player projection (PROJECTED_PLAYER_FIELDS) deliberately omits
 * userId — so the physio's device can only ever send `userId: ''`. The upsert
 * handler resolved the group from the request's userId; with '' it found no
 * membership and, in a club with more than one active group, refused with 400
 * "not linked to a squad" — even though the ROSTER ROW it had just fetched
 * carries the canonical account linkage.
 *
 * The contract these tests pin: an omitted userId is resolved through the
 * server's own roster→membership linkage (never the client's word), so a
 * scoped medic can open a case for a player IN THEIR GROUP without the client
 * knowing the account id — while group isolation, userId/playerId coherence
 * and orphan handling are all unchanged.
 *
 * All clinical values are fabricated sentinels.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.physio-save.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...a] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (command === 'SET') { kv.set(a[0], a[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(a[0]); result = 1; }
  if (command === 'SCAN') { const re = globToRe(a[2] || '*'); result = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM' || command === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { INITIAL_GROUP_ID } = await import('../api/_structureStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-physio';
const SEN = INITIAL_GROUP_ID, U18 = 'grp-u18', WOM = 'grp-wom';

const STRUCTURE = {
  version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
    { id: WOM, name: "Women's", type: 'general', status: 'active' },
  ],
  teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' }],
};

const scope = groupId => ({ clubWide: false, groups: [{ groupId, status: 'active' }], teams: [] });
const MEMBERS = [
  { id: 'm-sen-a', teamId: CLUB, userId: 'u-sen-a', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-u18-a', teamId: CLUB, userId: 'u-u18-a', role: 'player', status: 'active', playerGroupId: U18 },
  // A genuine physio: role medical, scoped to Seniors, no roster access.
  { id: 'm-sen-medic', teamId: CLUB, userId: 'u-sen-medic', role: 'medical', status: 'active', accessScope: scope(SEN) },
  { id: 'm-u18-medic', teamId: CLUB, userId: 'u-u18-medic', role: 'medical', status: 'active', accessScope: scope(U18) },
  { id: 'm-admin', teamId: CLUB, userId: 'u-admin', role: 'admin', status: 'active', isOwner: true },
  // DUAL-CAPACITY (production reproduction, "test medical", 7 Sep 2026): a
  // PLAYER who also holds the additive medicalAccess grant. canonicalRole is
  // 'player', so the write authorises with PLAYER capacity (the group they
  // play), not staff scope — and they may open a case for a player in their
  // own group, including themselves.
  { id: 'm-dual', teamId: CLUB, userId: 'u-dual', role: 'player', status: 'active',
    playerGroupId: SEN, medicalAccess: true },
];

// The roster rows carry the canonical account linkage (id === userId, as in prod).
const ROSTER = [
  { id: 'u-sen-a', userId: 'u-sen-a', name: 'Senior A' },
  { id: 'u-u18-a', userId: 'u-u18-a', name: 'U18 A' },
  { id: 'u-dual', userId: 'u-dual', name: 'Dual Cap' },
  { id: 'p-unlinked', name: 'No Account' },
];

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: CLUB, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
async function seed(cases = []) {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club Physio' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: ROSTER }));
  kv.set(`app:medical:${CLUB}`, JSON.stringify({ version: 1, clubId: CLUB, cases, updatedAt: '2026-01-01T00:00:00.000Z' }));
  for (const m of MEMBERS) await login(m.userId);
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
async function medical(userId, body) {
  const r = res();
  await publishHandler({ method: 'POST', query: { resource: 'medical' }, body,
    headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}
const record = () => JSON.parse(kv.get(`app:medical:${CLUB}`));

// ── THE EXACT PRODUCTION REPRODUCTION ──────────────────────────────────────

test('a scoped physio opens a case for their own player WITHOUT sending userId (the real client payload)', async () => {
  await seed();
  // Precisely what saveNewInjury() posts from a medical-role device: a real
  // playerId, and userId '' because the projection has no account id to send.
  const r = await medical('u-sen-medic', {
    action: 'upsert_case',
    playerId: 'u-sen-a',
    userId: '',
    condition: 'PHYSIO-SAVE-SENTINEL',
    severity: 'moderate',
    dateInjured: '2026-09-07',
    timelineNote: 'Injury logged',
  });
  assert.equal(r.code, 200, `the save must succeed, got ${JSON.stringify(r.body)}`);
  const created = record().cases.find(c => c.condition === 'PHYSIO-SAVE-SENTINEL');
  assert.ok(created, 'the case is stored');
  assert.equal(created.playerId, 'u-sen-a');
  assert.equal(created.playerGroupId, SEN, 'group resolved from the roster→membership linkage, not the client');
  assert.equal(created.status, 'active');
});

test('the case the physio just saved is then visible to their group read', async () => {
  await seed();
  await medical('u-sen-medic', {
    action: 'upsert_case', playerId: 'u-sen-a', userId: '', condition: 'VISIBLE-SENTINEL' });
  const g = res();
  await publishHandler({ method: 'GET', query: { resource: 'medical' },
    headers: { cookie: cookies.get('u-sen-medic') } }, g);
  assert.equal(g.result.code, 200);
  assert.ok(g.result.body.active.some(c => c.condition === 'VISIBLE-SENTINEL'),
    'the physio can read back the case they saved');
});

// ── DUAL-CAPACITY: a PLAYER holding the medicalAccess grant (prod repro) ─────

test('a player WITH the medical grant opens a case for themselves (userId omitted, exact prod payload)', async () => {
  await seed();
  // Exactly what saveNewInjury() posts on the "test medical" device: the
  // selected player is the caller's own roster row id, and userId '' because a
  // player device never loads the coach roster to know the account id.
  const r = await medical('u-dual', {
    action: 'upsert_case',
    playerId: 'u-dual',
    userId: '',
    condition: 'DUAL-CAP-SENTINEL',
    severity: 'minor',
    returnTarget: '2026-10-10',
    dateInjured: '2026-09-07',
    timelineNote: 'Injury logged',
  });
  assert.equal(r.code, 200, `the dual-capacity save must succeed, got ${JSON.stringify(r.body)}`);
  const created = record().cases.find(c => c.condition === 'DUAL-CAP-SENTINEL');
  assert.ok(created, 'the case is stored');
  assert.equal(created.playerId, 'u-dual');
  assert.equal(created.playerGroupId, SEN, 'group resolved from the caller\'s own membership via the roster row');
  assert.equal(created.status, 'active');
});

test('the dual-capacity player still cannot open a case for another group\'s player', async () => {
  await seed();
  const before = kv.get(`app:medical:${CLUB}`);
  const r = await medical('u-dual', {
    action: 'upsert_case', playerId: 'u-u18-a', userId: '', condition: 'DUAL-CROSS-SENTINEL' });
  assert.equal(r.code, 403, `player-capacity write stays in the caller's group, got ${JSON.stringify(r.body)}`);
  assert.equal(kv.get(`app:medical:${CLUB}`), before, 'nothing written');
});

// ── GROUP ISOLATION IS UNCHANGED (an omitted userId does not widen anything) ─

test('a scoped physio still CANNOT open a case for another group\'s player, userId omitted', async () => {
  await seed();
  const before = kv.get(`app:medical:${CLUB}`);
  const r = await medical('u-u18-medic', {
    action: 'upsert_case', playerId: 'u-sen-a', userId: '', condition: 'CROSS-GROUP-SENTINEL' });
  assert.equal(r.code, 403, `cross-group create refused, got ${JSON.stringify(r.body)}`);
  assert.equal(kv.get(`app:medical:${CLUB}`), before, 'nothing written');
});

test('the resolved group is the roster row\'s membership — a client-supplied group is ignored', async () => {
  await seed();
  const r = await medical('u-sen-medic', {
    action: 'upsert_case', playerId: 'u-sen-a', userId: '',
    condition: 'FORGED-GROUP-SENTINEL', playerGroupId: U18, groupId: U18, group: U18 });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const created = record().cases.find(c => c.condition === 'FORGED-GROUP-SENTINEL');
  assert.equal(created.playerGroupId, SEN, 'stored under the membership group, never the forged one');
});

// ── COHERENCE STILL ENFORCED WHEN A userId IS NAMED ────────────────────────

test('a NAMED userId that disagrees with the roster row is still refused (coherence intact)', async () => {
  await seed();
  const before = kv.get(`app:medical:${CLUB}`);
  const r = await medical('u-sen-medic', {
    action: 'upsert_case', playerId: 'u-sen-a', userId: 'u-u18-a', condition: 'MISFILE-SENTINEL' });
  assert.equal(r.code, 400, `mismatched userId refused, got ${JSON.stringify(r.body)}`);
  assert.equal(kv.get(`app:medical:${CLUB}`), before, 'nothing written');
});

// ── A GENUINELY UNLINKED ROSTER ROW STILL REFUSES IN A MULTI-GROUP CLUB ─────

test('an unlinked roster row (no account anywhere) still refuses honestly in a multi-group club', async () => {
  await seed();
  const r = await medical('u-admin', {
    action: 'upsert_case', playerId: 'p-unlinked', userId: '', condition: 'UNLINKED-SENTINEL' });
  assert.equal(r.code, 400, `still refused, got ${JSON.stringify(r.body)}`);
  assert.match(String(r.body.error), /not linked to a squad/);
});

// ── UPDATE OF AN EXISTING CASE NEEDS NO ROSTER LINKAGE AT ALL ───────────────

test('a physio updates an existing open case even when the row cannot be linked (userId omitted)', async () => {
  // The case already carries its group, so authorisation reads THAT — the
  // physio must not be refused because the roster linkage is beyond their sight.
  await seed([{ id: 'mc-existing', playerId: 'u-sen-a', playerGroupId: SEN, status: 'active',
    condition: 'ORIGINAL', timeline: [] }]);
  const r = await medical('u-sen-medic', {
    action: 'upsert_case', playerId: 'u-sen-a', userId: '', severity: 'severe' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const c = record().cases.find(x => x.id === 'mc-existing');
  assert.equal(c.severity, 'severe', 'update applied');
  assert.equal(c.playerGroupId, SEN, 'stored group untouched');
});

// ── SINGLE-GROUP CLUBS WERE NEVER BROKEN — prove they still work ────────────

test('the same omitted-userId save works in a one-group club (never regressed)', async () => {
  const ONE = { version: 1, groups: [{ id: SEN, name: 'Seniors', status: 'active' }], teams: [] };
  await seed();
  kv.set(`app:structure:${CLUB}`, JSON.stringify(ONE));
  const r = await medical('u-sen-medic', {
    action: 'upsert_case', playerId: 'u-sen-a', userId: '', condition: 'ONEGROUP-SENTINEL' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(record().cases.find(c => c.condition === 'ONEGROUP-SENTINEL').playerGroupId, SEN);
});
