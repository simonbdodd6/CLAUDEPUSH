/**
 * TRAINING ATTENDANCE — the server contract.
 *
 * Attendance rides on api/publish.js as ?resource=attendance rather than a new
 * serverless function: the deployment ceiling is 12 and all 12 are in use, so a
 * new file could not ship. The sub-resource pattern is the one season-sheets and
 * appearance-adjustments already use.
 *
 * The club comes from the authenticated session. The group is asserted against
 * the caller's own staff scope. The SESSION must be one that group actually has
 * — which is both the anti-forgery check and where the stored date comes from,
 * because the client must not be able to date its own history.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.attendance-api.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map(), lists = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'LPUSH') { const l = lists.get(args[0]) || []; l.unshift(args[1]); lists.set(args[0], l); result = l.length; }
  if (command === 'LRANGE') result = (lists.get(args[0]) || []).slice(0);
  if (command === 'LTRIM') result = 'OK';
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  return { ok: true, json: async () => ({ result }) };
};

const { default: publishHandler } = await import('../api/publish.js');
const store = await import('../api/_identityStore.js');

const CLUB = 'riverside', OTHER = 'other-club';
const SEN = 'grp_sen', U18 = 'grp_u18', ARCHIVED = 'grp_old';
const scope = gids => ({ clubWide: false, groups: gids.map(g => ({ groupId: g, status: 'active' })), teams: [] });
const MEMBERS = [
  { id: 'm-head', teamId: CLUB, userId: 'u-head', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
  { id: 'm-u18c', teamId: CLUB, userId: 'u-u18c', role: 'coach', staffLevel: 'assistant', status: 'active', accessProfile: 'coach', accessScope: scope([U18]) },
  { id: 'm-med',  teamId: CLUB, userId: 'u-med',  role: 'medical', status: 'active', accessProfile: 'medical' },
  // A team MANAGER holds `reports` but NOT `publish_training` — the role that
  // tells the two permissions apart, and a real case: managers handle logistics,
  // they do not run the session or record who came to it.
  // Scoped to Seniors on purpose: without a scope the GROUP assertion would
  // refuse them and the test would prove nothing about the permission.
  { id: 'm-mgr',  teamId: CLUB, userId: 'u-mgr',  role: 'coach', staffLevel: 'manager', status: 'active', accessProfile: 'manager', accessScope: scope([SEN]) },
  { id: 'm-p1',   teamId: CLUB, userId: 'u1', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-out',  teamId: OTHER, userId: 'u-out', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
];

function seed() {
  kv.clear(); lists.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Riverside' }, { id: OTHER, name: 'Other' }]));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@t.test`, displayName: m.userId }))));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1, groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'general', status: 'active' },
    { id: ARCHIVED, name: 'Old', type: 'general', status: 'archived' }], teams: [] }));
  kv.set(`app:structure:${OTHER}`, JSON.stringify({ version: 1, groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' }], teams: [] }));
  // Each group's own current-week sessions — the only sessions attendance may name.
  kv.set(`app:publish:${CLUB}:group:${SEN}:sessions`, JSON.stringify([
    { id: 'tue', title: 'Tuesday training', date: '2026-08-04', type: 'Training' }]));
  kv.set(`app:publish:${CLUB}:group:${U18}:sessions`, JSON.stringify([
    { id: 'y-thu', title: 'U18 Thursday', date: '2026-08-06', type: 'Training' }]));
}

function response() {
  return { statusCode: null, body: null, headers: {},
    setHeader(n, v) { this.headers[n] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }, end() { return this; } };
}

async function call(userId, method, query, body) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await store.createSession({ userId, teamId: m.teamId, role: m.role });
  const res = response();
  await publishHandler({ method, url: '/api/publish?' + query,
    query: Object.fromEntries(new URLSearchParams(query)),
    headers: { cookie: `${store.SESSION_COOKIE}=${encodeURIComponent(s.token)}` },
    body }, res);
  return res;
}
const mark = (user, body) => call(user, 'POST', 'resource=attendance', body);
const read = (user, group) => call(user, 'GET', 'resource=attendance' + (group ? '&group=' + group : ''));

// ───────────────────────── it works ─────────────────────────────────────────

test('a head coach records attendance, and the DATE comes from the stored session', async () => {
  seed();
  const res = await mark('u-head', { group: SEN, sessionId: 'tue',
    marks: { 'id:u1': 'present', 'id:u2': 'absent' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.session.marks, { 'id:u1': 'present', 'id:u2': 'absent' });
  assert.equal(res.body.session.date, '2026-08-04', 'from the session record, not the caller');
  assert.equal(res.body.session.title, 'Tuesday training');
  // The register belongs to the slot PLUS the day, so next Tuesday gets its own.
  assert.equal(res.body.occurrenceId, 'tue-20260804');
  const back = await read('u-head', SEN);
  assert.deepEqual(back.body.sessions['tue-20260804'].marks, { 'id:u1': 'present', 'id:u2': 'absent' });
});

test('a client cannot date its own history', async () => {
  seed();
  const res = await mark('u-head', { group: SEN, sessionId: 'tue', date: '1999-01-01',
    title: 'Forged', marks: { 'id:u1': 'present' } });
  assert.equal(res.body.session.date, '2026-08-04', 'the supplied date is ignored');
  assert.equal(res.body.session.title, 'Tuesday training');
});

test('null clears a mark back to not-recorded, and does not mean absent', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:u1': 'present', 'id:u2': 'present' } });
  const res = await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:u1': null } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.session.marks, { 'id:u2': 'present' }, 'u1 is gone, not "absent"');
});

test('a second write merges rather than replacing the register', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:u1': 'present' } });
  const res = await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:u2': 'absent' } });
  assert.deepEqual(res.body.session.marks, { 'id:u1': 'present', 'id:u2': 'absent' });
});

// ───────────────────────── isolation ────────────────────────────────────────

test('TWO TUESDAYS: the same recurring id on different dates stays two registers', async () => {
  seed();
  // Week 1 — the schedule sync stores this week's sessions; the current week's
  // id is the slot's legacy one, `tue`.
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:ana': 'present', 'id:ben': 'absent' } });
  // Week 2 — the next sync REPLACES the list. Same id, new date.
  kv.set(`app:publish:${CLUB}:group:${SEN}:sessions`, JSON.stringify([
    { id: 'tue', title: 'Tuesday training', date: '2026-08-11', type: 'Training' }]));
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:ana': 'absent', 'id:ben': 'present' } });

  const all = (await read('u-head', SEN)).body.sessions;
  assert.deepEqual(Object.keys(all).sort(), ['tue-20260804', 'tue-20260811'], 'two registers, one per Tuesday');
  assert.deepEqual(all['tue-20260804'].marks, { 'id:ana': 'present', 'id:ben': 'absent' }, '4 Aug is intact');
  assert.deepEqual(all['tue-20260811'].marks, { 'id:ana': 'absent', 'id:ben': 'present' }, '11 Aug is its own');
  assert.equal(all['tue-20260804'].date, '2026-08-04', 'and its date was not overwritten');
  assert.equal(all['tue-20260804'].sourceSessionId, 'tue', 'traceable to the slot it came from');
});

test('clearing a mark on one Tuesday leaves the other untouched', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:ana': 'present' } });
  kv.set(`app:publish:${CLUB}:group:${SEN}:sessions`, JSON.stringify([
    { id: 'tue', title: 'Tuesday training', date: '2026-08-11', type: 'Training' }]));
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:ana': 'present' } });
  // clear the SECOND Tuesday only
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:ana': null } });
  const all = (await read('u-head', SEN)).body.sessions;
  assert.deepEqual(all['tue-20260804'].marks, { 'id:ana': 'present' }, 'the first Tuesday is untouched');
  assert.deepEqual(all['tue-20260811'].marks, {}, 'and the second is cleared');
});

test('a legacy register is lifted onto its own date, once, on read', async () => {
  seed();
  // A document written before the occurrence identity existed.
  kv.set(`app:publish:${CLUB}:group:${SEN}:attendance`, JSON.stringify({ sessions: {
    tue: { date: '2026-08-04', title: 'Tuesday training', marks: { 'id:ana': 'present' } } } }));
  const first = (await read('u-head', SEN)).body.sessions;
  assert.deepEqual(Object.keys(first), ['tue-20260804']);
  assert.deepEqual(first['tue-20260804'].marks, { 'id:ana': 'present' });
  const again = (await read('u-head', SEN)).body.sessions;
  assert.deepEqual(again, first, 'reading twice changes nothing');
});

test('a legacy register with no date is preserved and reported, never guessed', async () => {
  seed();
  kv.set(`app:publish:${CLUB}:group:${SEN}:attendance`, JSON.stringify({ sessions: {
    tue: { date: '', title: 'Undated', marks: { 'id:ana': 'present' } } } }));
  const res = await read('u-head', SEN);
  assert.deepEqual(Object.keys(res.body.sessions), ['tue'], 'left exactly where it was');
  assert.deepEqual(res.body.unmigrated, ['tue'], 'and reported rather than silently dropped');
  assert.deepEqual(res.body.sessions.tue.marks, { 'id:ana': 'present' }, 'losslessly');
});

test('an undated session cannot have attendance recorded against it', async () => {
  seed();
  kv.set(`app:publish:${CLUB}:group:${SEN}:sessions`, JSON.stringify([
    { id: 'floating', title: 'Ad-hoc', date: '', type: 'Training' }]));
  const res = await mark('u-head', { group: SEN, sessionId: 'floating', marks: { 'id:ana': 'present' } });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /no date/);
});

test('writing does not disturb a preserved un-migratable record', async () => {
  seed();
  kv.set(`app:publish:${CLUB}:group:${SEN}:attendance`, JSON.stringify({ sessions: {
    orphan: { date: '', title: 'Undated', marks: { 'id:zz': 'present' } } } }));
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:ana': 'present' } });
  const all = (await read('u-head', SEN)).body.sessions;
  assert.deepEqual(all.orphan.marks, { 'id:zz': 'present' }, 'still there after an unrelated write');
  assert.deepEqual(all['tue-20260804'].marks, { 'id:ana': 'present' });
});

test('a forged SESSION id is refused — attendance must belong to a real session', async () => {
  seed();
  const res = await mark('u-head', { group: SEN, sessionId: 'not-a-session', marks: { 'id:u1': 'present' } });
  assert.equal(res.statusCode, 404);
  assert.match(res.body.error, /does not exist in this group/);
});

test('another GROUP’s session cannot be marked from this group', async () => {
  seed();
  // 'y-thu' is U18's session; naming it under Seniors must fail.
  const res = await mark('u-head', { group: SEN, sessionId: 'y-thu', marks: { 'id:u1': 'present' } });
  assert.equal(res.statusCode, 404);
});

test('a coach cannot reach a group they do not operate', async () => {
  seed();
  const write = await mark('u-u18c', { group: SEN, sessionId: 'tue', marks: { 'id:u1': 'present' } });
  assert.equal(write.statusCode, 403);
  const readRes = await read('u-u18c', SEN);
  assert.equal(readRes.statusCode, 403);
});

test('a U18 coach CAN record their own group, and sees only it', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:u1': 'present' } });
  const res = await mark('u-u18c', { group: U18, sessionId: 'y-thu', marks: { 'id:u9': 'present' } });
  assert.equal(res.statusCode, 200);
  const mine = await read('u-u18c', U18);
  assert.deepEqual(Object.keys(mine.body.sessions), ['y-thu-20260806'], 'no Seniors session appears');
});

test('attendance is stored per group — one group’s register is not the other’s', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: 'tue',   marks: { 'id:u1': 'present' } });
  await mark('u-head', { group: U18, sessionId: 'y-thu', marks: { 'id:u9': 'absent'  } });
  const sen = await read('u-head', SEN), u18 = await read('u-head', U18);
  assert.deepEqual(Object.keys(sen.body.sessions), ['tue-20260804']);
  assert.deepEqual(Object.keys(u18.body.sessions), ['y-thu-20260806']);
  assert.ok(!JSON.stringify(sen.body).includes('id:u9'));
});

test('an archived group is refused', async () => {
  seed();
  const res = await mark('u-head', { group: ARCHIVED, sessionId: 'tue', marks: { 'id:u1': 'present' } });
  assert.ok([400, 403, 404].includes(res.statusCode), 'refused, got ' + res.statusCode);
});

test('another CLUB cannot read or write this club’s attendance', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:u1': 'present' } });
  // The outsider's session names their own club; the same group id resolves to
  // THEIR structure, and their club has no such training session.
  const write = await mark('u-out', { group: SEN, sessionId: 'tue', marks: { 'id:u1': 'absent' } });
  assert.notEqual(write.statusCode, 200, 'must not write into another club');
  const readRes = await read('u-out', SEN);
  assert.notDeepEqual(readRes.body?.sessions?.['tue-20260804']?.marks, { 'id:u1': 'present' },
    'and must never see this club’s register');
  // this club's record is untouched
  const ours = await read('u-head', SEN);
  assert.deepEqual(ours.body.sessions['tue-20260804'].marks, { 'id:u1': 'present' });
});

test('a forged teamId in the query changes nothing', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:u1': 'present' } });
  const res = await call('u-head', 'GET', `resource=attendance&group=${SEN}&teamId=${OTHER}&team=${OTHER}`);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.sessions['tue-20260804'].marks, { 'id:u1': 'present' }, 'still OUR club');
});

// ───────────────────────── permissions ──────────────────────────────────────

test('a PLAYER cannot mark attendance — not for themselves, not for anyone', async () => {
  seed();
  const res = await mark('u1', { group: SEN, sessionId: 'tue', marks: { 'id:u1': 'present' } });
  assert.equal(res.statusCode, 403);
  const readRes = await read('u1', SEN);
  assert.equal(readRes.statusCode, 403, 'and cannot read the register either');
});

test('a medic, who manages no training, is refused', async () => {
  seed();
  assert.equal((await mark('u-med', { group: SEN, sessionId: 'tue', marks: { 'id:u1': 'present' } })).statusCode, 403);
});

test('a team MANAGER is refused — reports is not permission to run training', async () => {
  seed();
  // This is the assertion that pins WHICH permission guards attendance. A
  // manager can read availability boards and reports; recording who turned up
  // to training belongs to the people who run training.
  // They genuinely operate Seniors, so only the PERMISSION can refuse them —
  // otherwise the group assertion would refuse them first and prove nothing.
  assert.equal((await mark('u-mgr', { group: SEN, sessionId: 'tue', marks: { 'id:u1': 'present' } })).statusCode, 403);
  assert.equal((await read('u-mgr', SEN)).statusCode, 403);
});

test('the stored register is capped, however many sessions arrive', async () => {
  seed();
  // A hand-written or runaway document must not grow without bound. The cap is
  // applied on the way IN as well as on the way out.
  const huge = { sessions: {} };
  for (let i = 0; i < 500; i++) huge.sessions['s' + i] = { date: '2026-08-04', title: 't', marks: { 'id:u1': 'present' } };
  kv.set(`app:publish:${CLUB}:group:${SEN}:attendance`, JSON.stringify(huge));
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:u1': 'present' } });
  const stored = JSON.parse(kv.get(`app:publish:${CLUB}:group:${SEN}:attendance`));
  assert.ok(Object.keys(stored.sessions).length <= 400,
    `stored ${Object.keys(stored.sessions).length} sessions; the cap is 400`);
});

test('an unauthenticated request is refused', async () => {
  seed();
  const res = response();
  await publishHandler({ method: 'POST', url: '/api/publish?resource=attendance',
    query: { resource: 'attendance' }, headers: {},
    body: { group: SEN, sessionId: 'tue', marks: { 'id:u1': 'present' } } }, res);
  assert.equal(res.statusCode, 401);
});

// ───────────────────────── input validation ─────────────────────────────────

test('marks must be keyed by durable identity — never a name', async () => {
  seed();
  for (const bad of [{ 'Ana Silva': 'present' }, { 'nm:ana silva': 'present' }, { 'u1': 'present' }, { '': 'present' }]) {
    const res = await mark('u-head', { group: SEN, sessionId: 'tue', marks: bad });
    assert.equal(res.statusCode, 400, JSON.stringify(bad));
    assert.match(res.body.error, /durable player identity/);
  }
});

test('only present, absent or null are accepted', async () => {
  seed();
  for (const bad of ['maybe', 'late', '', 'PRESENT', 1, true]) {
    const res = await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:u1': bad } });
    assert.equal(res.statusCode, 400, JSON.stringify(bad));
  }
});

test('a missing sessionId or malformed marks is refused', async () => {
  seed();
  assert.equal((await mark('u-head', { group: SEN, marks: { 'id:u1': 'present' } })).statusCode, 400);
  assert.equal((await mark('u-head', { group: SEN, sessionId: 'tue' })).statusCode, 400);
  assert.equal((await mark('u-head', { group: SEN, sessionId: 'tue', marks: [] })).statusCode, 400);
});

test('nothing unknown survives a round trip', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:u1': 'present' } });
  const res = await read('u-head', SEN);
  assert.deepEqual(Object.keys(res.body.sessions['tue-20260804']).sort(),
    ['date', 'marks', 'sourceSessionId', 'title', 'updatedAt', 'updatedBy']);
});

test('attendance never touches availability records', async () => {
  seed();
  kv.set(`app:availability:${CLUB}:tue`, JSON.stringify({ 'Ana': { response: 'unavailable', userId: 'u1' } }));
  const before = kv.get(`app:availability:${CLUB}:tue`);
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:u1': 'present' } });
  assert.equal(kv.get(`app:availability:${CLUB}:tue`), before,
    'an unavailable player marked present leaves their answer exactly as it was');
});

test('the deployment ceiling is respected — no new serverless function', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(new URL('../api/', import.meta.url)))
    .filter(f => f.endsWith('.js') && !f.startsWith('_'));
  assert.ok(files.length <= 12, `api/ holds ${files.length} functions; the ceiling is 12`);
  assert.ok(!files.includes('attendance.js'), 'attendance rides on publish.js as a sub-resource');
});
