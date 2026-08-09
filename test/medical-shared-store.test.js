/**
 * RC4.7 — the club's SHARED medical caseload.
 *
 * Medical records used to live in each coach's private draft, so two coaches
 * saw two different caseloads and a player granted Medical had no readable
 * source at all. These pin the shared store, its authorisation, the
 * medical-scoped projection, and the write allow-list that stops a medical
 * update reaching anything else.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.medical.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
const writes = [];
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { writes.push(args[0]); kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { writes.push(args[0]); kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_medicalStore.js');
const store2 = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const { permissionsFor, PERM } = await import('../api/_permissions.js');

const CLUB = 'club-med';
const SEN = 'grp-seniors';

const MEMBERS = [
  { id: 'm-plain', teamId: CLUB, userId: 'u-plain', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-medic', teamId: CLUB, userId: 'u-medic', role: 'player', status: 'active', playerGroupId: SEN, medicalAccess: true },
  { id: 'm-physio', teamId: CLUB, userId: 'u-physio', role: 'medical', status: 'active' },
  { id: 'm-coach', teamId: CLUB, userId: 'u-coach', role: 'coach', status: 'active', accessProfile: 'coach' },
];

function seed() {
  kv.clear(); writes.length = 0;
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club Med' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({
    version: 1,
    groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' }],
    teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' }],
  }));
  // Roster rows deliberately carry contact data, so the projection has
  // something real to exclude.
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: [
    { id: 'p1', userId: 'u-plain', name: 'Player One', position: 'HOOKER',
      phone: '+32470000000', email: 'p1@c.test', emergencyContact: 'Mum',
      emergencyPhone: '+32470000001', guardianName: 'Guardian', address: '1 Road',
      dateOfBirth: '2001-01-01', medical: '', notes: 'private coach note' },
  ] }));
}

const { createSession, SESSION_COOKIE } = store2;

/** A real server-minted session, exactly as the product issues one. */
const cookies = new Map();
async function login(userId) {
  const member = MEMBERS.find(m => m.userId === userId);
  const session = await createSession({ userId, teamId: CLUB, role: member.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(session.token)}`);
}
const sess = userId => ({ headers: { cookie: cookies.get(userId) || '' } });

function res() {
  const out = { code: 0, body: null };
  return {
    status(c) { out.code = c; return this; },
    json(b) { out.body = b; return this; },
    end() { return this; },
    setHeader() {},
    get result() { return out; },
  };
}

// ── SHARED STORE ───────────────────────────────────────────────────────────
test('the caseload is club-scoped and independent of who created it', async () => {
  seed();
  const opened = await store.upsertCase(CLUB, { playerId: 'p1', condition: 'Hamstring', severity: 'moderate', playerGroupId: SEN }, { userId: 'u-physio' });
  assert.equal(opened.status, 'active');
  assert.equal(opened.createdBy, 'u-physio');

  // A DIFFERENT authorised user reads the very same case.
  const seenByOther = await store.loadMedicalRecord(CLUB);
  assert.equal(seenByOther.cases.length, 1);
  assert.equal(seenByOther.cases[0].condition, 'Hamstring');

  // ...and their update is visible to the first.
  await store.upsertCase(CLUB, { playerId: 'p1', severity: 'severe' }, { userId: 'u-medic' });
  const after = await store.loadMedicalRecord(CLUB);
  assert.equal(after.cases.length, 1, 'updates the existing case, never duplicates');
  assert.equal(after.cases[0].severity, 'severe');
  assert.equal(after.cases[0].condition, 'Hamstring', 'untouched fields survive the merge');
  assert.equal(after.cases[0].updatedBy, 'u-medic');
});

test('only the medical key is ever written', async () => {
  seed();
  writes.length = 0;
  await store.upsertCase(CLUB, { playerId: 'p1', condition: 'Ankle' }, { userId: 'u-physio' });
  assert.deepEqual([...new Set(writes)], [`app:medical:${CLUB}`],
    'a medical write cannot reach roster, drafts, identity, fixtures or selections');
});

test('resolving clears the active caseload but keeps the history', async () => {
  seed();
  const opened = await store.upsertCase(CLUB, { playerId: 'p1', condition: 'Concussion' }, { userId: 'u-physio' });
  let record = await store.loadMedicalRecord(CLUB);
  assert.equal(store.activeCases(record).length, 1, 'an injury opens a case');

  await store.resolveCase(CLUB, opened.id, { userId: 'u-physio' });
  record = await store.loadMedicalRecord(CLUB);
  assert.equal(store.activeCases(record).length, 0, 'cleared cases leave the active list');
  assert.equal(record.cases.length, 1, 'but the record is retained');
  assert.equal(store.caseHistoryFor(record, 'p1').length, 1, 'history is queryable');
  assert.equal(record.cases[0].status, 'resolved');
  assert.ok(record.cases[0].resolvedAt, 'resolution is stamped');
  assert.deepEqual(record.cases[0].timeline.map(t => t.action), ['opened', 'resolved'],
    'the timeline is append-only');
});

test('a healthy player has no case, so the caseload is empty', async () => {
  seed();
  const record = await store.loadMedicalRecord(CLUB);
  assert.deepEqual(record.cases, [], 'reading a club with no record writes nothing');
  assert.deepEqual(writes, [], 'and persists nothing');
});

// ── AUTHORIZATION ──────────────────────────────────────────────────────────
test('MEDICAL_ACCESS is the gate — not MANAGE_PLAYERS or PUBLISH_SQUADS', async () => {
  const plain = permissionsFor(MEMBERS[0]);
  const medic = permissionsFor(MEMBERS[1]);
  assert.equal(plain.has(PERM.MEDICAL_ACCESS), false);
  assert.equal(medic.has(PERM.MEDICAL_ACCESS), true);
  assert.equal(medic.has(PERM.MANAGE_PLAYERS), false, 'not granted as a substitute');
  assert.equal(medic.has(PERM.PUBLISH_SQUADS), false);
});

test('a plain player is refused, a player+Medical is allowed', async () => {
  seed(); await login('u-plain'); await login('u-medic');

  const denied = res();
  await publishHandler({ method: 'GET', query: { resource: 'medical' }, ...sess('u-plain') }, denied);
  assert.equal(denied.result.code, 403, 'plain player refused');

  const allowed = res();
  await publishHandler({ method: 'GET', query: { resource: 'medical' }, ...sess('u-medic') }, allowed);
  assert.equal(allowed.result.code, 200, 'player + Medical allowed');
  assert.ok(Array.isArray(allowed.result.body.players));
});

test('a plain player cannot mutate the caseload', async () => {
  seed(); await login('u-plain');
  const r = res();
  await publishHandler({ method: 'POST', query: { resource: 'medical' },
    body: { action: 'upsert_case', playerId: 'p1', condition: 'Fake' }, ...sess('u-plain') }, r);
  assert.equal(r.result.code, 403);
  const record = await store.loadMedicalRecord(CLUB);
  assert.equal(record.cases.length, 0, 'nothing was written');
});

// ── DATA MINIMISATION ──────────────────────────────────────────────────────
test('the projection carries what Medical needs and no contact details', async () => {
  seed(); await login('u-medic');
  const r = res();
  await publishHandler({ method: 'GET', query: { resource: 'medical' }, ...sess('u-medic') }, r);

  const [player] = r.result.body.players;
  assert.deepEqual(Object.keys(player).sort(),
    ['groupName', 'id', 'name', 'playerGroupId', 'position'].sort(),
    'an allow-list: a new roster field is excluded by default, not leaked');
  assert.equal(player.name, 'Player One');
  assert.equal(player.groupName, 'Seniors', 'group is projected for D1b readiness');

  const serialised = JSON.stringify(r.result.body);
  for (const leak of ['+32470000000', 'p1@c.test', 'Mum', '+32470000001',
                      'Guardian', '1 Road', '2001-01-01', 'private coach note']) {
    assert.equal(serialised.includes(leak), false, `must not expose ${leak}`);
  }
});

// ── WRITE SAFETY ───────────────────────────────────────────────────────────
test('a medical write cannot alter group, eligibility, access or identity', async () => {
  seed(); await login('u-medic');
  const before = kv.get('app:identity:team_members');

  const r = res();
  await publishHandler({ method: 'POST', query: { resource: 'medical' }, ...sess('u-medic'), body: {
    action: 'upsert_case', playerId: 'p1', condition: 'Knee',
    // Every one of these must be ignored.
    playerGroupId: 'grp-hijack', playerEligibility: { teamIds: ['t-x'] },
    accessScope: { clubWide: true }, role: 'admin', medicalAccess: true,
    name: 'Renamed', userId: 'u-plain', id: 'forged', status: 'resolved',
  } }, r);
  assert.equal(r.result.code, 200);

  const saved = r.result.body.case;
  assert.equal(saved.condition, 'Knee', 'the medical field IS written');
  assert.equal(saved.status, 'active', 'status is server-owned, not client-set');
  assert.notEqual(saved.id, 'forged', 'ids are server-generated');
  assert.equal(saved.playerGroupId, SEN, 'group comes from the MEMBERSHIP, not the body');

  assert.equal(kv.get('app:identity:team_members'), before, 'memberships byte-identical');
  const members = JSON.parse(kv.get('app:identity:team_members'));
  assert.equal(members.find(m => m.id === 'm-plain').playerGroupId, SEN);
  assert.equal(members.find(m => m.id === 'm-plain').role, 'player');
  assert.equal(members.find(m => m.id === 'm-medic').accessScope, undefined);
});

test('unrelated club data is untouched by a medical write', async () => {
  seed(); await login('u-medic');
  const roster = kv.get(`app:roster:${CLUB}`);
  const structure = kv.get(`app:structure:${CLUB}`);
  kv.set(`app:publish:${CLUB}:draft:u-coach`, JSON.stringify({ fixtures: ['keep'], training: ['keep'] }));
  const draft = kv.get(`app:publish:${CLUB}:draft:u-coach`);

  const r = res();
  await publishHandler({ method: 'POST', query: { resource: 'medical' }, ...sess('u-medic'),
    body: { action: 'upsert_case', playerId: 'p1', condition: 'Shoulder' } }, r);
  assert.equal(r.result.code, 200);

  assert.equal(kv.get(`app:roster:${CLUB}`), roster, 'roster untouched');
  assert.equal(kv.get(`app:structure:${CLUB}`), structure, 'structure untouched');
  assert.equal(kv.get(`app:publish:${CLUB}:draft:u-coach`), draft, 'fixtures/training draft untouched');
});

test('the write allow-list drops every unknown field', () => {
  const picked = store.pickWritable({
    condition: 'Calf', severity: 'mild', notes: 'ok',
    playerGroupId: 'x', accessScope: {}, role: 'admin', phone: '123', id: 'forged',
  });
  assert.deepEqual(Object.keys(picked).sort(), ['condition', 'notes', 'severity']);
});

// ── GROUP READINESS (D1b) ──────────────────────────────────────────────────
test('a case is attributable to the group, so D1b can filter without migrating', async () => {
  seed();
  const opened = await store.upsertCase(CLUB, { playerId: 'p1', condition: 'Rib', playerGroupId: SEN }, { userId: 'u-physio' });
  assert.equal(opened.playerGroupId, SEN);
  const record = await store.loadMedicalRecord(CLUB);
  assert.equal(record.cases.filter(c => c.playerGroupId === SEN).length, 1,
    'filtering by group is already possible');
});
