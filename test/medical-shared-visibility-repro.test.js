/**
 * PRODUCTION REPRO — a physio's logged injuries are invisible to everyone.
 *
 * Two halves combine:
 *
 *   WRITE  medicalHandler derives playerGroupId by finding the MEMBERSHIP whose
 *          userId matches the request. A roster row that was added by hand and
 *          never claimed an invite has no userId, so no membership is found and
 *          the case is stored with playerGroupId ''.
 *
 *   READ   the D1b group filter is `visibleGroupIds.has(String(gid || ''))`.
 *          '' is never a real group id, so every case stored that way is
 *          dropped — for the coach AND for the physio who created it.
 *
 * Neither half is wrong alone. Together they silently swallow the case.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.med-repro.test';
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

const store = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'boitsfort';
const SEN = 'grp_seniors';

const MEMBERS = [
  // The physio: staff with Medical access, scoped to Seniors.
  { id: 'm-physio', teamId: CLUB, userId: 'u-physio', role: 'medical', status: 'active',
    accessProfile: 'coach', medicalAccess: true,
    accessScope: { clubWide: false, groups: [{ groupId: SEN, status: 'active' }], teams: [] } },
  // The coach/admin reading the same club.
  { id: 'm-coach', teamId: CLUB, userId: 'u-coach', role: 'admin', status: 'active',
    isOwner: true, medicalAccess: true },
  // A player who DID claim an invite — has a membership and a player group.
  { id: 'm-linked', teamId: CLUB, userId: 'u-linked', role: 'player', status: 'active', playerGroupId: SEN },
];

/**
 * The production roster shape: some rows are linked to accounts, some were
 * added by hand and never claimed an invite — those carry no userId.
 */
const ROSTER = [
  { id: 'p-linked',   userId: 'u-linked', name: 'Linked Player',   position: 'PROP' },
  { id: 'p-manual-1',                     name: 'Manual Player 1', position: 'LOCK' },
  { id: 'p-manual-2',                     name: 'Manual Player 2', position: 'FLY'  },
];

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({
    version: 1,
    groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' }],
    teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' }],
  }));
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: ROSTER }));
}

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: CLUB, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
/** Exactly what the Add Injury form sends: userId from the roster row. */
async function logInjury(userId, rosterPlayer, condition) {
  const r = res();
  await publishHandler({ method: 'POST', query: { resource: 'medical' },
    headers: { cookie: cookies.get(userId) }, body: {
      action: 'upsert_case', playerId: rosterPlayer.id,
      userId: rosterPlayer.userId || '', condition, severity: 'moderate',
    } }, r);
  return r.result;
}
async function readMedical(userId) {
  const r = res();
  await publishHandler({ method: 'GET', query: { resource: 'medical' },
    headers: { cookie: cookies.get(userId) } }, r);
  return r.result;
}
const stored = () => JSON.parse(kv.get(`app:medical:${CLUB}`) || '{"cases":[]}').cases;

// ── THE REPRODUCTION ───────────────────────────────────────────────────────
test('REPAIRED — a physio logs three injuries and every Medical user sees them', async () => {
  seed(); await login('u-physio'); await login('u-coach');

  // Exactly the production shape: roster rows added by hand, never linked to
  // an account, so the request carries no userId and no membership matches.
  for (const [row, condition] of [[ROSTER[1], 'Hamstring'], [ROSTER[2], 'Ankle'], [ROSTER[0], 'Knee']]) {
    const r = await logInjury('u-physio', row, condition);
    assert.equal(r.code, 200, 'the write succeeds');
  }

  // WRITE HALF REPAIRED: with one active group the answer is not a guess.
  const cases = stored();
  assert.equal(cases.length, 3);
  assert.equal(cases.every(c => c.playerGroupId === SEN), true,
    'the sole active group is used instead of storing the case ungrouped');

  // READ HALF: the coach now sees all three — the reported bug.
  const coachView = await readMedical('u-coach');
  assert.equal(coachView.code, 200);
  assert.deepEqual(coachView.body.cases.map(c => c.condition).sort(),
    ['Ankle', 'Hamstring', 'Knee']);
  assert.equal(coachView.body.active.length, 3);

  // And so does the physio who created them.
  const physioView = await readMedical('u-physio');
  assert.deepEqual(physioView.body.cases.map(c => c.condition).sort(),
    ['Ankle', 'Hamstring', 'Knee']);
});

test('a client-supplied group cannot override the server resolution', async () => {
  seed(); await login('u-physio');
  const r = res();
  await publishHandler({ method: 'POST', query: { resource: 'medical' },
    headers: { cookie: cookies.get('u-physio') }, body: {
      action: 'upsert_case', playerId: 'p-manual-1', userId: '',
      playerGroupId: 'grp_hijack', condition: 'Forged',
    } }, r);
  assert.equal(r.result.code, 200);
  assert.equal(stored()[0].playerGroupId, SEN, 'the body value is ignored entirely');
});

test('an ungrouped case is readable again, and is never rewritten', async () => {
  seed(); await login('u-coach');
  // The production shape: one properly grouped case, one orphan written before
  // the group could be resolved.
  kv.set(`app:medical:${CLUB}`, JSON.stringify({ version: 1, clubId: CLUB, cases: [
    { id: 'mc-anon', playerId: 'p-manual-1', playerGroupId: '', status: 'active', condition: 'Hamstring', timeline: [] },
    { id: 'mc-real', playerId: 'p-linked',   playerGroupId: SEN, status: 'active', condition: 'Knee',     timeline: [] },
  ] }));
  const before = kv.get(`app:medical:${CLUB}`);

  const view = await readMedical('u-coach');
  assert.deepEqual(view.body.cases.map(c => c.id).sort(), ['mc-anon', 'mc-real'],
    'the club-wide reader sees both — the orphan is no longer swallowed');
  assert.equal(kv.get(`app:medical:${CLUB}`), before,
    'and the READ rewrote nothing: the orphan keeps its empty group');
  assert.equal(JSON.parse(kv.get(`app:medical:${CLUB}`)).cases.find(c => c.id === 'mc-anon').playerGroupId, '',
    'no silent attribution to Seniors');
});

// ── WHAT WORKS TODAY, SO THE FIX IS TARGETED ───────────────────────────────
test('a player WITH a membership behaves correctly end to end', async () => {
  seed(); await login('u-physio'); await login('u-coach');

  const a = await logInjury('u-physio', ROSTER[0], 'Knee');
  assert.equal(a.code, 200);
  assert.equal(stored()[0].playerGroupId, SEN, 'membership found, real group stamped');

  const coachView = await readMedical('u-coach');
  assert.deepEqual(coachView.body.cases.map(c => c.condition), ['Knee'],
    'the coach sees it — the shared model works when the player is linked');

  // Update by the physio is visible to the coach on refetch.
  await logInjury('u-physio', ROSTER[0], 'Knee (grade 2)');
  const after = await readMedical('u-coach');
  assert.deepEqual(after.body.cases.map(c => c.condition), ['Knee (grade 2)'],
    'one shared case, updated — not duplicated');

  // And the coach resolving it removes it from the active list, keeping history.
  const rid = stored()[0].id;
  const resolve = res();
  await publishHandler({ method: 'POST', query: { resource: 'medical' },
    headers: { cookie: cookies.get('u-coach') },
    body: { action: 'resolve_case', caseId: rid } }, resolve);
  assert.equal(resolve.result.code, 200);

  const physioAfter = await readMedical('u-physio');
  assert.deepEqual(physioAfter.body.active, [], 'no active cases for the physio either');
  assert.equal(physioAfter.body.cases.length, 1, 'history retained and still shared');
});

test('both users resolve to the SAME group, so scope is not the problem', async () => {
  seed(); await login('u-physio'); await login('u-coach');
  const physio = await readMedical('u-physio');
  const coach = await readMedical('u-coach');
  assert.deepEqual(physio.body.groups.map(g => g.id), [SEN], 'physio: Seniors');
  assert.deepEqual(coach.body.groups.map(g => g.id), [SEN], 'coach: Seniors');
  assert.equal(physio.body.group.id, coach.body.group.id,
    'identical operational group — the failure is the case data, not the reader');
});

// ── U18 SAFETY: the fallback must stop the moment a second group exists ────
const U18 = 'grp_u18';
function seedTwoGroups() {
  seed();
  kv.set(`app:structure:${CLUB}`, JSON.stringify({
    version: 1,
    groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' },
             { id: U18, name: 'U18', type: 'age-grade', status: 'active' }],
    teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' },
            { id: 't-u18', groupId: U18, name: 'U18 Premier', status: 'active' }],
  }));
}

test('U18 SAFETY — an unlinked player in a MULTI-group club is refused, not guessed', async () => {
  seedTwoGroups(); await login('u-coach');
  const r = await logInjury('u-coach', ROSTER[1], 'Hamstring');
  assert.equal(r.code, 400, 'no silent assignment once there is a real choice');
  assert.match(r.body.error, /not linked to a squad/);
  assert.deepEqual(stored(), [], 'nothing was written');
});

test('a LINKED player still works fine in a multi-group club', async () => {
  seedTwoGroups(); await login('u-coach');
  const r = await logInjury('u-coach', ROSTER[0], 'Knee');
  assert.equal(r.code, 200);
  assert.equal(stored()[0].playerGroupId, SEN, 'the membership is authoritative');
});

// ── ORPHAN READ COMPATIBILITY ─────────────────────────────────────────────
const ORPHAN_STORE = () => JSON.stringify({ version: 1, clubId: CLUB, cases: [
  { id: 'mc-sen',    playerId: 'p-linked',   playerGroupId: SEN, status: 'active', condition: 'SeniorsCase', timeline: [] },
  { id: 'mc-u18',    playerId: 'p-u18',      playerGroupId: U18, status: 'active', condition: 'U18Case',     timeline: [] },
  { id: 'mc-orphan', playerId: 'p-manual-1', playerGroupId: '',  status: 'active', condition: 'OrphanCase',  timeline: [] },
] });

const scoped = groupId => ({ clubWide: false, groups: [{ groupId, status: 'active' }], teams: [] });

async function loginAs(member) {
  const all = JSON.parse(kv.get('app:identity:team_members'));
  kv.set('app:identity:team_members', JSON.stringify([...all.filter(m => m.id !== member.id), member]));
  const users = JSON.parse(kv.get('app:identity:users'));
  if (!users.some(u => u.id === member.userId)) {
    users.push({ id: member.userId, email: `${member.userId}@c.test`, displayName: member.userId });
    kv.set('app:identity:users', JSON.stringify(users));
  }
  const s = await createSession({ userId: member.userId, teamId: CLUB, role: member.role });
  cookies.set(member.userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}

test('ONE-GROUP CLUB — a Seniors Medical user sees the Seniors case AND the orphan', async () => {
  seed(); kv.set(`app:medical:${CLUB}`, ORPHAN_STORE());
  await loginAs({ id: 'm-s', teamId: CLUB, userId: 'u-s', role: 'medical', status: 'active',
    accessProfile: 'coach', medicalAccess: true, accessScope: scoped(SEN) });
  const before = kv.get(`app:medical:${CLUB}`);

  const view = await readMedical('u-s');
  assert.deepEqual(view.body.cases.map(c => c.id).sort(), ['mc-orphan', 'mc-sen'],
    'their scope covers every active group, so the orphan is safe to show');
  assert.equal(view.body.cases.some(c => c.id === 'mc-u18'), false, 'U18 group is not active here');
  assert.equal(kv.get(`app:medical:${CLUB}`), before, 'the READ rewrote nothing');
});

test('TWO-GROUP CLUB — a Seniors-only user must NOT see the orphan', async () => {
  seedTwoGroups(); kv.set(`app:medical:${CLUB}`, ORPHAN_STORE());
  await loginAs({ id: 'm-s', teamId: CLUB, userId: 'u-s', role: 'medical', status: 'active',
    accessProfile: 'coach', medicalAccess: true, accessScope: scoped(SEN) });
  const before = kv.get(`app:medical:${CLUB}`);

  const view = await readMedical('u-s');
  assert.deepEqual(view.body.cases.map(c => c.id), ['mc-sen'],
    'no longer covers the whole club, so the orphan is withheld');
  assert.equal(kv.get(`app:medical:${CLUB}`), before, 'still no rewrite');
});

test('TWO-GROUP CLUB — a U18-only user must NOT see the orphan either', async () => {
  seedTwoGroups(); kv.set(`app:medical:${CLUB}`, ORPHAN_STORE());
  await loginAs({ id: 'm-u', teamId: CLUB, userId: 'u-u', role: 'medical', status: 'active',
    accessProfile: 'coach', medicalAccess: true, accessScope: scoped(U18) });
  const view = await readMedical('u-u');
  assert.deepEqual(view.body.cases.map(c => c.id), ['mc-u18']);
});

test('TWO-GROUP CLUB — a user covering BOTH groups may see the orphan', async () => {
  seedTwoGroups(); kv.set(`app:medical:${CLUB}`, ORPHAN_STORE());
  await loginAs({ id: 'm-b', teamId: CLUB, userId: 'u-b', role: 'medical', status: 'active',
    accessProfile: 'coach', medicalAccess: true,
    accessScope: { clubWide: false, groups: [{ groupId: SEN, status: 'active' }, { groupId: U18, status: 'active' }], teams: [] } });
  const view = await readMedical('u-b');
  assert.deepEqual(view.body.cases.map(c => c.id).sort(), ['mc-orphan', 'mc-sen', 'mc-u18'],
    'nothing is left unseen, so there is no squad it could be wrongly disclosed to');
});

test('asking for ONE group explicitly never returns the orphan', async () => {
  seed(); kv.set(`app:medical:${CLUB}`, ORPHAN_STORE());
  await login('u-coach');
  const r = res();
  await publishHandler({ method: 'GET', query: { resource: 'medical', group: SEN },
    headers: { cookie: cookies.get('u-coach') } }, r);
  assert.deepEqual(r.result.body.cases.map(c => c.id), ['mc-sen'],
    'a named group is a narrower question than whole-club coverage');
});

test('an unauthorised user is still refused outright', async () => {
  seed(); kv.set(`app:medical:${CLUB}`, ORPHAN_STORE());
  await loginAs({ id: 'm-p', teamId: CLUB, userId: 'u-p', role: 'player', status: 'active', playerGroupId: SEN });
  const view = await readMedical('u-p');
  assert.equal(view.code, 403);
});
