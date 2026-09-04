/**
 * Orphan medical cases heal on the next normal save.
 *
 * Cases written before the group was resolvable carry playerGroupId '' and are
 * visible only to a caller whose access covers every active group. The upsert
 * handler has always resolved the correct group from the MEMBERSHIP — but the
 * store's update branch discarded it, so re-saving an orphan case through the
 * product never repaired it. These pin the heal-on-write contract:
 *
 *   - an update ADOPTS the handler-resolved group when the stored case has none
 *   - a stored group is NEVER overwritten (a case belongs to the group the
 *     player was in when it was opened)
 *   - nothing is fabricated: no resolvable group → the case stays orphaned,
 *     and ambiguity is still refused with 400, never guessed
 *   - healing changes attribution only — id, clinical content and any resolved
 *     sibling case stay byte-identical
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.medical-heal.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

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

const store = await import('../api/_medicalStore.js');
const { createSession, SESSION_COOKIE } = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');

const CLUB = 'club-heal';
const SEN  = 'grp-sen';
const U18  = 'grp-u18';

// Production shape: the roster row id IS the userId for account-created players.
const MEMBERS = [
  { id: 'm-admin', teamId: CLUB, userId: 'u-admin', role: 'admin', status: 'active' },
  { id: 'm-senmedic', teamId: CLUB, userId: 'u-senmedic', role: 'medical', status: 'active',
    accessScope: { clubWide: false, groups: [{ groupId: SEN, status: 'active' }], teams: [] } },
  { id: 'm-u18medic', teamId: CLUB, userId: 'u-u18medic', role: 'medical', status: 'active',
    accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'active' }], teams: [] } },
  { id: 'm-boaz', teamId: CLUB, userId: 'u-boaz', role: 'player', status: 'active', playerGroupId: SEN },
];

const ORPHAN = {
  id: 'mc_orphan1', playerId: 'u-boaz', playerGroupId: '', status: 'active',
  condition: 'Ankle sprain', severity: 'moderate', dateInjured: '2026-08-12',
  notes: 'original clinical notes',
  createdAt: '2026-08-12T21:34:33.890Z', createdBy: 'u-medic-legacy',
  updatedAt: '2026-08-12T21:34:33.890Z', updatedBy: 'u-medic-legacy',
  timeline: [{ at: '2026-08-12T21:34:33.890Z', by: 'u-medic-legacy', action: 'opened', note: '' }],
};

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club Heal' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({
    version: 1,
    // TWO active groups: orphan visibility and ambiguity-refusal only mean
    // something when covering the club is more than covering one group.
    groups: [
      { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
      { id: U18, name: 'U18', type: 'age', status: 'active' },
    ],
    teams: [{ id: 't-sen', groupId: SEN, name: 'Seniors 1', status: 'active' }],
  }));
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: [
    { id: 'u-boaz', userId: 'u-boaz', name: 'Boaz V', position: 'TBC' },
    { id: 'p-unlinked', name: 'No Account', position: 'TBC' },
  ] }));
  kv.set(`app:medical:${CLUB}`, JSON.stringify({
    version: 1, clubId: CLUB, cases: [ORPHAN], updatedAt: ORPHAN.updatedAt,
  }));
}

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

const CLINICAL = ['condition', 'severity', 'dateInjured', 'notes', 'status',
  'createdAt', 'createdBy', 'trainingStatus', 'gameAvailability',
  'clearanceStatus', 'returnTarget', 'bodyLocation', 'rehabProgress', 'concussionCount'];
const clinicalOf = c => JSON.stringify(CLINICAL.map(f => [f, c[f]]));

// ── STORE: the heal contract ───────────────────────────────────────────────

test('an update adopts the resolved group when the stored case has none', async () => {
  seed();
  const saved = await store.upsertCase(CLUB, {
    playerId: 'u-boaz', severity: 'moderate',      // unchanged value — a pure re-save
    playerGroupId: SEN, timelineNote: 'Record updated',
  }, { userId: 'u-admin' });

  assert.equal(saved.id, 'mc_orphan1', 'the SAME case — no duplicate opened');
  assert.equal(saved.playerGroupId, SEN, 'the orphan is healed');
  assert.equal(clinicalOf(saved), clinicalOf(store.normalizeCase(ORPHAN)), 'clinical content untouched');

  const record = await store.loadMedicalRecord(CLUB);
  assert.equal(record.cases.length, 1, 'still exactly one case');
  assert.equal(record.cases[0].playerGroupId, SEN, 'the heal is persisted');
});

test('a stored group is never overwritten by a later save', async () => {
  seed();
  kv.set(`app:medical:${CLUB}`, JSON.stringify({
    version: 1, clubId: CLUB, cases: [{ ...ORPHAN, playerGroupId: U18 }],
  }));
  // The player has since moved to Seniors; the case keeps its opening group.
  const saved = await store.upsertCase(CLUB, {
    playerId: 'u-boaz', severity: 'moderate', playerGroupId: SEN,
  }, { userId: 'u-admin' });
  assert.equal(saved.playerGroupId, U18,
    'a case belongs to the group the player was in when it was opened');
});

test('no resolvable group → the case stays orphaned, nothing is fabricated', async () => {
  seed();
  const saved = await store.upsertCase(CLUB, {
    playerId: 'u-boaz', severity: 'moderate', playerGroupId: '',
  }, { userId: 'u-admin' });
  assert.equal(saved.playerGroupId, '', 'an empty resolution never invents a group');
});

test('healing leaves a resolved sibling case byte-identical', async () => {
  seed();
  const resolvedSibling = {
    ...ORPHAN, id: 'mc_resolved0', status: 'resolved', playerGroupId: U18,
    resolvedAt: '2026-08-13T10:00:00.000Z', resolvedBy: 'u-medic-legacy',
    clearanceStatus: 'cleared',
  };
  kv.set(`app:medical:${CLUB}`, JSON.stringify({
    version: 1, clubId: CLUB, cases: [resolvedSibling, ORPHAN],
  }));
  await store.upsertCase(CLUB, { playerId: 'u-boaz', severity: 'moderate', playerGroupId: SEN }, { userId: 'u-admin' });

  const record = await store.loadMedicalRecord(CLUB);
  assert.equal(record.cases.length, 2, 'no case appeared or vanished');
  const untouched = record.cases.find(c => c.id === 'mc_resolved0');
  assert.deepEqual(untouched, store.normalizeCase(resolvedSibling),
    'the resolved case is not rewritten by healing the active one');
  assert.equal(record.cases.find(c => c.id === 'mc_orphan1').playerGroupId, SEN);
});

// ── HANDLER: the normal product save repairs the record ────────────────────

test('a normal re-save through the route heals the orphan from the membership', async () => {
  seed(); await login('u-admin');
  const r = res();
  await publishHandler({ method: 'POST', query: { resource: 'medical' }, ...sess('u-admin'), body: {
    action: 'upsert_case', playerId: 'u-boaz', userId: 'u-boaz',
    severity: 'moderate', timelineNote: 'Record updated',
  } }, r);
  assert.equal(r.result.code, 200);
  assert.equal(r.result.body.case.id, 'mc_orphan1', 'updated, not duplicated');
  assert.equal(r.result.body.case.playerGroupId, SEN, 'group came from the membership');

  const record = await store.loadMedicalRecord(CLUB);
  assert.equal(record.cases.length, 1);
  assert.equal(record.cases[0].condition, 'Ankle sprain', 'clinical content preserved');
});

test('a body-supplied group cannot direct the heal — the membership wins', async () => {
  seed(); await login('u-admin');
  const r = res();
  await publishHandler({ method: 'POST', query: { resource: 'medical' }, ...sess('u-admin'), body: {
    action: 'upsert_case', playerId: 'u-boaz', userId: 'u-boaz',
    severity: 'moderate', playerGroupId: 'grp-hijack',
  } }, r);
  assert.equal(r.result.code, 200);
  assert.equal(r.result.body.case.playerGroupId, SEN, 'never the client value');
});

test('an unlinked player in a multi-group club is still refused, never guessed', async () => {
  seed(); await login('u-admin');
  kv.set(`app:medical:${CLUB}`, JSON.stringify({
    version: 1, clubId: CLUB, cases: [{ ...ORPHAN, id: 'mc_orphan2', playerId: 'p-unlinked' }],
  }));
  const before = kv.get(`app:medical:${CLUB}`);

  const r = res();
  await publishHandler({ method: 'POST', query: { resource: 'medical' }, ...sess('u-admin'), body: {
    action: 'upsert_case', playerId: 'p-unlinked', userId: '',
    severity: 'moderate',
  } }, r);
  assert.equal(r.result.code, 400, 'two active groups → a guess would file it wrongly');
  assert.match(String(r.result.body.error || ''), /not linked to a squad/);
  assert.equal(kv.get(`app:medical:${CLUB}`), before, 'the refused save wrote nothing');
});

// ── VISIBILITY: the heal is exactly what makes group medics see the case ───

test('before the heal only whole-club coverage sees the case; after, the right group medic does', async () => {
  seed(); await login('u-admin'); await login('u-senmedic'); await login('u-u18medic');

  const seesCase = body => (body.cases || []).some(c => c.id === 'mc_orphan1');

  const senBefore = res();
  await publishHandler({ method: 'GET', query: { resource: 'medical' }, ...sess('u-senmedic') }, senBefore);
  assert.equal(senBefore.result.code, 200);
  assert.equal(seesCase(senBefore.result.body), false, 'orphan hidden from a group-scoped medic');

  const adminBefore = res();
  await publishHandler({ method: 'GET', query: { resource: 'medical' }, ...sess('u-admin') }, adminBefore);
  assert.equal(seesCase(adminBefore.result.body), true, 'whole-club coverage sees the orphan');

  const heal = res();
  await publishHandler({ method: 'POST', query: { resource: 'medical' }, ...sess('u-admin'), body: {
    action: 'upsert_case', playerId: 'u-boaz', userId: 'u-boaz', severity: 'moderate',
  } }, heal);
  assert.equal(heal.result.code, 200);

  const senAfter = res();
  await publishHandler({ method: 'GET', query: { resource: 'medical' }, ...sess('u-senmedic') }, senAfter);
  assert.equal(seesCase(senAfter.result.body), true, 'the Seniors medic now sees their player\'s case');

  const u18After = res();
  await publishHandler({ method: 'GET', query: { resource: 'medical' }, ...sess('u-u18medic') }, u18After);
  assert.equal(u18After.result.code, 200);
  assert.equal(seesCase(u18After.result.body), false, 'a medic for another group still cannot');
});
