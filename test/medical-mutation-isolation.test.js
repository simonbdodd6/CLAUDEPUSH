/**
 * MEDICAL MUTATION ISOLATION — the write side of the medical boundary.
 *
 * Reads are already group-scoped (D1b). These tests pin the same rule onto
 * the two mutation paths:
 *
 *   upsert_case — the caller must OPERATE the group the case belongs to:
 *     the stored case group for an existing case, the group resolved from the
 *     target's MEMBERSHIP for a new one (client group fields are never
 *     authorisation). When the named roster row exists, the account it is
 *     linked to must match the request's userId — so a forged userId cannot
 *     attribute one player's case to another player's group.
 *   resolve_case — the caller must operate the CASE's stored group; a case
 *     with no group (orphan) is whole-club surface, exactly as it reads.
 *
 * A caller operating EVERY active group (Club Administration, one-group
 * clubs) keeps whole-club behaviour. A player with the Medical grant writes
 * in the group they PLAY — the same capacity their read uses.
 *
 * All clinical/personal values are fabricated sentinels.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.mmi.test';
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

const CLUB = 'club-mmi';
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
  { id: 'm-u18-b', teamId: CLUB, userId: 'u-u18-b', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm-wom-a', teamId: CLUB, userId: 'u-wom-a', role: 'player', status: 'active', playerGroupId: WOM },
  { id: 'm-sen-medic', teamId: CLUB, userId: 'u-sen-medic', role: 'medical', status: 'active', accessScope: scope(SEN) },
  { id: 'm-u18-medic', teamId: CLUB, userId: 'u-u18-medic', role: 'medical', status: 'active', accessScope: scope(U18) },
  // A PLAYER holding the Medical grant — writes where they play (Seniors).
  { id: 'm-playerphysio', teamId: CLUB, userId: 'u-playerphysio', role: 'player', status: 'active',
    playerGroupId: SEN, medicalAccess: true },
  { id: 'm-admin', teamId: CLUB, userId: 'u-admin', role: 'admin', status: 'active', isOwner: true },
];

const ROSTER = [
  { id: 'u-sen-a', userId: 'u-sen-a', name: 'Senior A' },
  { id: 'u-u18-a', userId: 'u-u18-a', name: 'U18 A' },
  { id: 'u-u18-b', userId: 'u-u18-b', name: 'U18 B' },
  { id: 'u-wom-a', userId: 'u-wom-a', name: 'Woman A' },
  { id: 'p-unlinked', name: 'No Account' },
];

const CASES = [
  { id: 'mc-sen', playerId: 'u-sen-a', playerGroupId: SEN, status: 'active',
    condition: 'SEN-CONDITION-SENTINEL', timeline: [] },
  { id: 'mc-u18', playerId: 'u-u18-a', playerGroupId: U18, status: 'active',
    condition: 'U18-CONDITION-SENTINEL', timeline: [] },
  { id: 'mc-orphan', playerId: 'u-wom-a', playerGroupId: '', status: 'active',
    condition: 'ORPHAN-CONDITION-SENTINEL', timeline: [] },
];

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: CLUB, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
async function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club MMI' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: ROSTER }));
  kv.set(`app:medical:${CLUB}`, JSON.stringify({ version: 1, clubId: CLUB, cases: CASES, updatedAt: '2026-01-01T00:00:00.000Z' }));
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
const caseById = id => record().cases.find(c => c.id === id);

// ── UPSERT ──────────────────────────────────────────────────────────────────

test('UPSERT — a medic updates their own group\'s case; another group\'s is refused untouched', async () => {
  await seed();
  const own = await medical('u-u18-medic', {
    action: 'upsert_case', playerId: 'u-u18-a', userId: 'u-u18-a', severity: 'moderate' });
  assert.equal(own.code, 200, JSON.stringify(own.body));
  assert.equal(caseById('mc-u18').severity, 'moderate', 'own-group update applied');

  const before = kv.get(`app:medical:${CLUB}`);
  const cross = await medical('u-u18-medic', {
    action: 'upsert_case', playerId: 'u-sen-a', userId: 'u-sen-a', severity: 'severe' });
  assert.equal(cross.code, 403, JSON.stringify(cross.body));
  assert.equal(kv.get(`app:medical:${CLUB}`), before, 'refused write changed nothing');
});

test('UPSERT — a cross-group CREATE is refused: no case appears for the other group\'s player', async () => {
  await seed();
  const r = await medical('u-sen-medic', {
    action: 'upsert_case', playerId: 'u-u18-b', userId: 'u-u18-b', condition: 'Planted' });
  assert.equal(r.code, 403, JSON.stringify(r.body));
  assert.ok(!record().cases.some(c => c.playerId === 'u-u18-b'), 'nothing created');
});

test('UPSERT — forged group fields never broaden authorisation or direct attribution', async () => {
  await seed();
  const forged = await medical('u-sen-medic', {
    action: 'upsert_case', playerId: 'u-u18-b', userId: 'u-u18-b',
    condition: 'Planted', playerGroupId: SEN, groupId: SEN, group: SEN });
  assert.equal(forged.code, 403, 'the membership decides, not the body');

  const legit = await medical('u-sen-medic', {
    action: 'upsert_case', playerId: 'u-sen-a', userId: 'u-sen-a',
    severity: 'minor', playerGroupId: 'grp-hijack' });
  assert.equal(legit.code, 200);
  assert.equal(caseById('mc-sen').playerGroupId, SEN, 'stored group is the membership\'s');
});

test('UPSERT — a forged userId cannot attribute another group\'s player to the caller\'s group', async () => {
  await seed();
  // Seniors medic names a U18 roster row but a Seniors ACCOUNT: without the
  // coherence rule this filed U18 B's case under Seniors, inside the
  // caller's own visibility.
  const before = kv.get(`app:medical:${CLUB}`);
  const r = await medical('u-sen-medic', {
    action: 'upsert_case', playerId: 'u-u18-b', userId: 'u-sen-a', condition: 'Misfiled' });
  assert.ok(r.code === 400 || r.code === 403, `refused (${r.code})`);
  assert.equal(kv.get(`app:medical:${CLUB}`), before, 'nothing written');
});

test('UPSERT — an unlinked player in a multi-group club stays refused for everyone', async () => {
  await seed();
  for (const who of ['u-sen-medic', 'u-admin']) {
    const r = await medical(who, {
      action: 'upsert_case', playerId: 'p-unlinked', userId: '', condition: 'Guess' });
    assert.equal(r.code, 400, `${who}: ${JSON.stringify(r.body)}`);
  }
});

test('UPSERT — the club-wide admin operates every group', async () => {
  await seed();
  const r = await medical('u-admin', {
    action: 'upsert_case', playerId: 'u-u18-a', userId: 'u-u18-a', severity: 'severe' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(caseById('mc-u18').severity, 'severe');
});

test('UPSERT — a player with the Medical grant writes where they PLAY, and nowhere else', async () => {
  await seed();
  const own = await medical('u-playerphysio', {
    action: 'upsert_case', playerId: 'u-sen-a', userId: 'u-sen-a', severity: 'minor' });
  assert.equal(own.code, 200, JSON.stringify(own.body));
  const cross = await medical('u-playerphysio', {
    action: 'upsert_case', playerId: 'u-u18-a', userId: 'u-u18-a', severity: 'minor' });
  assert.equal(cross.code, 403, JSON.stringify(cross.body));
});

test('UPSERT — a scoped medic can still HEAL their own player\'s orphan case', async () => {
  await seed();
  // The Women's orphan belongs, by membership, to Women's — reattach the
  // orphan to a Seniors player instead so the Seniors medic is its owner.
  const cases = CASES.map(c => c.id === 'mc-orphan' ? { ...c, playerId: 'u-sen-a' } : c)
    .filter(c => c.id !== 'mc-sen');   // one active case per player
  kv.set(`app:medical:${CLUB}`, JSON.stringify({ version: 1, clubId: CLUB, cases }));
  const r = await medical('u-sen-medic', {
    action: 'upsert_case', playerId: 'u-sen-a', userId: 'u-sen-a', severity: 'moderate' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(caseById('mc-orphan').playerGroupId, SEN, 'healed into the membership group');
});

test('UPSERT — a moved player\'s open case answers to its STORED group, mirroring the read', async () => {
  await seed();
  // U18 A has since moved to Women's: membership says WOM, the open case still
  // says U18 — and the read shows it to U18 medics. The U18 medic (who can
  // SEE the case) may update it; the change never rewrites the stored group.
  const moved = MEMBERS.map(m => m.id === 'm-u18-a' ? { ...m, playerGroupId: WOM } : m);
  kv.set('app:identity:team_members', JSON.stringify(moved));

  const keeper = await medical('u-u18-medic', {
    action: 'upsert_case', playerId: 'u-u18-a', userId: 'u-u18-a', severity: 'moderate' });
  assert.equal(keeper.code, 200, JSON.stringify(keeper.body));
  assert.equal(caseById('mc-u18').playerGroupId, U18, 'stored group never rewritten');

  const senMedic = await medical('u-sen-medic', {
    action: 'upsert_case', playerId: 'u-u18-a', userId: 'u-u18-a', severity: 'severe' });
  assert.equal(senMedic.code, 403, 'a medic who cannot see the case cannot change it');
});

// ── RESOLVE ─────────────────────────────────────────────────────────────────

test('RESOLVE — own group works; another group\'s case survives the attempt', async () => {
  await seed();
  const cross = await medical('u-u18-medic', { action: 'resolve_case', caseId: 'mc-sen' });
  assert.equal(cross.code, 403, JSON.stringify(cross.body));
  assert.equal(caseById('mc-sen').status, 'active', 'Seniors case still active');

  const own = await medical('u-u18-medic', { action: 'resolve_case', caseId: 'mc-u18' });
  assert.equal(own.code, 200, JSON.stringify(own.body));
  assert.equal(caseById('mc-u18').status, 'resolved');
});

test('RESOLVE — an orphan case is whole-club surface: scoped medics are refused, the admin is not', async () => {
  await seed();
  const scoped = await medical('u-sen-medic', { action: 'resolve_case', caseId: 'mc-orphan' });
  assert.equal(scoped.code, 403, JSON.stringify(scoped.body));
  assert.equal(caseById('mc-orphan').status, 'active');

  const admin = await medical('u-admin', { action: 'resolve_case', caseId: 'mc-orphan' });
  assert.equal(admin.code, 200, JSON.stringify(admin.body));
  assert.equal(caseById('mc-orphan').status, 'resolved');
});

test('RESOLVE — the player-physio resolves only in the group they play', async () => {
  await seed();
  const cross = await medical('u-playerphysio', { action: 'resolve_case', caseId: 'mc-u18' });
  assert.equal(cross.code, 403, JSON.stringify(cross.body));
  const own = await medical('u-playerphysio', { action: 'resolve_case', caseId: 'mc-sen' });
  assert.equal(own.code, 200, JSON.stringify(own.body));
});
