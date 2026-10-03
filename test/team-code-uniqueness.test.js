/**
 * Team join codes — one code, one club.
 *
 * A team code is the only thing a joining player types. It was minted as the
 * first six letters of the club name plus a random 10–99 with no uniqueness
 * check, and findTeamByCode() returned the FIRST stored match — so two clubs
 * sharing a six-letter prefix (Eligible RFC / Eligible2 RFC) had a 1-in-90
 * chance of one code, and a player typing it joined whichever club was stored
 * first.
 *
 *  1. createClub (with and without a signup reference) and provisionClub never
 *     mint a code another stored club holds — even when the random draw lands
 *     on it — and keep the PREFIX + two-digit shape
 *  2. A code reserved by a signup record but taken by another club since is
 *     not written as a duplicate
 *  3. All ninety two-digit codes taken → a unique three-digit code, never a hang
 *  4. Existing codes are never rewritten, duplicates included (no auto-repair)
 *  5. A code two stored clubs share is refused exactly like an unknown code:
 *     same 404, nothing filed, neither club named
 *  6. A unique code still joins, case/whitespace-normalised; approve and
 *     decline work and stay tenant-scoped
 *  7. An unknown code is unchanged (404 'Team code not found', nothing written)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.team-code.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';
process.env.PUBLIC_CLUB_SIGNUP      = 'true';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  let parsed;
  try { parsed = JSON.parse(options.body || '[]'); } catch { parsed = null; }
  if (!Array.isArray(parsed)) return { ok: true, json: async () => ({ id: 'email_mock' }) };
  const [command, ...args] = parsed;
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const pat = at >= 0 ? String(args[at + 1]) : '*';
    const re = new RegExp('^' + pat.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    result = ['0', [...kv.keys()].filter(k => re.test(k))];
  }
  if (command === 'SET') {
    if (args.includes('NX') && kv.has(args[0])) result = null;
    else { kv.set(args[0], args[1]); result = 'OK'; }
  }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'EXPIRE' || command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: identityHandler } = await import('../api/identity.js');
const S = await import('../api/_identityStore.js');

const PW = 'correct-horse-9';
let seq = 0;
const ref = () => `teamcodetest_${String(++seq).padStart(6, '0')}`;
const storedCode = async teamId => (await S.loadStoredTeams()).find(t => t.id === teamId).teamCode;
const suffix = code => Number(String(code).replace(/^[A-Z]+/, ''));

/**
 * Run `fn` with Math.random pinned so the code generator's first draw is
 * `draw` (10–99). Successive calls creep upward by 1e-9 — far below one code
 * step, but enough that makeId()'s base-36 suffixes stay distinct.
 */
async function withDraw(draw, fn) {
  const real = Math.random;
  let n = 0;
  Math.random = () => (draw - 10 + 0.5) / 90 + (n++) * 1e-9;
  try { return await fn(); } finally { Math.random = real; }
}

async function makeClub(label, { idempotent = true } = {}) {
  return S.createClub({ clubName: `${label} RFC`, teamName: 'First XV', sport: 'Rugby', name: `${label} Coach`,
    email: `coach.${label.toLowerCase()}@tc.test`, password: PW, ...(idempotent ? { idempotencyKey: ref() } : {}) });
}

function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    json(data)   { this.body = data; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end() { return this; },
  };
}
async function joinOverHttp(body) {
  const res = buildRes();
  await identityHandler({ method: 'POST', headers: {}, query: {}, body: { action: 'join', ...body } }, res);
  return res;
}

const snapshot = async () => JSON.stringify([await S.loadUsers(), await S.loadTeamMembers(), await S.loadStoredTeams()]);

test('createClub with a signup reference never mints a code another club holds', async () => {
  const a = await makeClub('Eligible');
  const codeA = await storedCode(a.team.id);
  assert.match(codeA, /^ELIGIB\d{2}$/);
  const b = await withDraw(suffix(codeA), () => makeClub('Eligible2'));
  const codeB = await storedCode(b.team.id);
  assert.match(codeB, /^ELIGIB\d{2}$/, 'same shape as before');
  assert.notEqual(S.normalizeTeamCode(codeB), S.normalizeTeamCode(codeA), 'the colliding draw was skipped');
  assert.equal(await storedCode(a.team.id), codeA, 'the first club keeps its code');
  assert.equal((await S.findTeamByCode(codeA)).id, a.team.id);
  assert.equal((await S.findTeamByCode(codeB)).id, b.team.id);
});

test('createClub without a signup reference never mints a code another club holds', async () => {
  const a = await makeClub('Boundary', { idempotent: false });
  const codeA = await storedCode(a.team.id);
  const b = await withDraw(suffix(codeA), () => makeClub('Boundary2', { idempotent: false }));
  const codeB = await storedCode(b.team.id);
  assert.match(codeB, /^BOUNDA\d{2}$/);
  assert.notEqual(codeB, codeA);
});

test('provisionClub never mints a code another club holds', async () => {
  const a = await makeClub('Provisional');
  const codeA = await storedCode(a.team.id);
  const p = await withDraw(suffix(codeA), () => S.provisionClub({ clubName: 'Provisional Two RFC', adminEmail: 'admin.prov2@tc.test' }));
  const codeP = await storedCode(p.team?.id || (await S.loadStoredTeams()).find(t => t.name === 'Provisional Two RFC').id);
  assert.match(codeP, /^PROVIS\d{2}$/);
  assert.notEqual(codeP, codeA);
});

test('a code reserved by a signup record but taken since is not written as a duplicate', async () => {
  const a = await makeClub('Reserve');
  const codeA = await storedCode(a.team.id);
  // A signup attempt that reserved its ids (incl. this code) BEFORE club A
  // was created — the resume must not write the now-taken code.
  const idem = ref();
  kv.set(`app:signup:${idem}`, JSON.stringify({
    emailNorm: 'coach.reserve2@tc.test', clubNorm: 'reserve2 rfc', teamId: 'reserve2-rfc',
    userId: 'user_reserved_1', memberId: 'tm_reserved_1', teamCode: codeA,
    createdAt: new Date().toISOString(), status: 'pending',
  }));
  const b = await S.createClub({ clubName: 'Reserve2 RFC', teamName: 'First XV', sport: 'Rugby', name: 'Reserve2 Coach',
    email: 'coach.reserve2@tc.test', password: PW, idempotencyKey: idem });
  assert.equal(b.team.id, 'reserve2-rfc', 'the reserved ids were resumed');
  const codeB = await storedCode(b.team.id);
  assert.match(codeB, /^RESERV\d{2}$/);
  assert.notEqual(codeB, codeA);
  assert.equal((await S.findTeamByCode(codeA)).id, a.team.id);
});

test('every two-digit code taken → a unique three-digit code (never a hang)', async () => {
  const teams = await S.loadStoredTeams();
  for (let n = 10; n <= 99; n++) teams.push({ id: `crowded-${n}`, name: `Crowded ${n}`, teamCode: `CROWDE${n}`, createdAt: new Date().toISOString() });
  await S.saveTeams(teams);
  const c = await makeClub('Crowded');
  const code = await storedCode(c.team.id);
  assert.match(code, /^CROWDE\d{3}$/);
  assert.equal((await S.loadStoredTeams()).filter(t => S.normalizeTeamCode(t.teamCode) === code).length, 1);
});

test('a code two stored clubs share is refused like an unknown code — nothing filed, no club named', async () => {
  const a = await makeClub('Twinned');
  const b = await makeClub('Twinned2');
  const codeA = await storedCode(a.team.id);
  // Legacy data: codes minted before uniqueness — B holds A's code too.
  const teams = await S.loadStoredTeams();
  teams.find(t => t.id === b.team.id).teamCode = codeA;
  await S.saveTeams(teams);

  assert.equal(await S.findTeamByCode(codeA), null, 'an ambiguous code names no club');
  assert.equal(await S.findTeamByCode(`  ${codeA.toLowerCase()} `), null, 'normalised spellings too');

  const before = await snapshot();
  await assert.rejects(
    S.createJoinRequest({ teamCode: codeA, firstName: 'Amb', lastName: 'Iguous', email: 'amb@tc.test', password: PW }),
    err => err.status === 404 && err.message === 'Team code not found',
  );
  const res = await joinOverHttp({ teamCode: codeA.toLowerCase(), firstName: 'Amb', lastName: 'Iguous', email: 'amb@tc.test', password: PW });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { ok: false, error: 'Team code not found' }, 'same response as an unknown code');
  const said = JSON.stringify(res.body);
  for (const t of [a.team, b.team]) {
    assert.ok(!said.includes(t.id) && !said.includes(t.name), 'neither club is disclosed');
  }
  assert.equal(await snapshot(), before, 'no user, no membership, no team change — nothing repaired');
  assert.equal(await storedCode(a.team.id), codeA);
  assert.equal(await storedCode(b.team.id), codeA);
});

test('new clubs never rewrite existing codes — duplicates included', async () => {
  const before = (await S.loadStoredTeams()).map(t => [t.id, t.teamCode]);
  await makeClub('Bystander');
  const after = new Map((await S.loadStoredTeams()).map(t => [t.id, t.teamCode]));
  for (const [id, code] of before) assert.equal(after.get(id), code, `${id} keeps its code`);
});

test('a unique code joins its own club; approve and decline stay tenant-scoped', async () => {
  const a = await makeClub('Joinable');
  const other = await makeClub('Joinable2');
  const code = await storedCode(a.team.id);

  const res = await joinOverHttp({ teamCode: `  ${code.toLowerCase()} `, firstName: 'Jo', lastName: 'Inner', email: 'jo@tc.test', password: PW });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.team.id, a.team.id);
  assert.equal(res.body.teamMember.status, 'pending');
  const joId = res.body.teamMember.id;

  await assert.rejects(S.approveJoinRequest(joId, other.user.id, other.team.id), err => err.status === 403, 'another club cannot approve');
  await assert.rejects(S.rejectJoinRequest(joId, other.user.id, other.team.id), err => err.status === 403, 'another club cannot decline');
  const approved = await S.approveJoinRequest(joId, a.user.id, a.team.id);
  assert.equal(approved.teamMember.status, 'active');
  assert.equal(approved.teamMember.teamId, a.team.id);

  const d = await S.createJoinRequest({ teamCode: code, firstName: 'De', lastName: 'Clined', email: 'de@tc.test', password: PW });
  assert.equal(d.team.id, a.team.id);
  const declined = await S.rejectJoinRequest(d.teamMember.id, a.user.id, a.team.id);
  assert.equal(declined.teamMember.status, 'rejected');

  const theirs = (await S.loadTeamMembers()).filter(m => m.teamId === other.team.id).map(m => m.userId);
  assert.deepEqual(theirs, [other.user.id], 'nothing landed in the other club');
});

test('an unknown code is unchanged: 404, nothing written', async () => {
  const before = await snapshot();
  const res = await joinOverHttp({ teamCode: 'NOSUCH42', firstName: 'No', lastName: 'Body', email: 'nobody@tc.test', password: PW });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { ok: false, error: 'Team code not found' });
  assert.equal(await snapshot(), before);
});
