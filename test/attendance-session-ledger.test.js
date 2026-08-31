/**
 * BUILD D — an ad-hoc session survives the week it was created in.
 *
 * An ad-hoc session already reached the server at creation, with its own durable
 * id and its date. What it did not survive was the weekly rollover: the group's
 * session list is REPLACED on the next sync, so a week later nothing remembered
 * it existed and its attendance could never be recorded.
 *
 * Nothing is invented and no second store is introduced. A register with no
 * marks already means "this session happened; nobody recorded who came" — the
 * product's existing third state. Each session the server accepts is noted as
 * one, the first time it is seen. It is then proof in its own right, which is
 * the rule the retrospective path already used.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.ledger.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');
const api  = await readFile(join(__dirname, '..', 'api', 'publish.js'), 'utf8');

function extractFn(src, name, indent = '    ') {
  let start = src.indexOf(indent + 'function ' + name + '(');
  if (start === -1) start = src.indexOf(indent + 'async function ' + name + '(');
  if (start === -1) throw new Error(name + ' not found');
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = src.indexOf('{', i), depth = 0;
  for (let k = brace; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
}
const strip = s => s.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

const kv = new Map();
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET')  r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') r = ['0', [...kv.keys()]];
  if (c === 'LPUSH') r = 1; if (c === 'LTRIM') r = 'OK'; if (c === 'LRANGE') r = [];
  return { ok: true, json: async () => ({ result: r }) };
};
const { default: handler } = await import('../api/publish.js');
const store = await import('../api/_identityStore.js');

const CLUB = 'riverside', OTHER = 'other-club', SEN = 'grp_sen', U18 = 'grp_u18';
const scope = g => ({ clubWide: false, groups: g.map(x => ({ groupId: x, status: 'active' })), teams: [] });
const MEMBERS = [
  { id: 'm1', teamId: CLUB, userId: 'u-head', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
  { id: 'm2', teamId: CLUB, userId: 'u-u18c', role: 'coach', staffLevel: 'assistant', status: 'active', accessProfile: 'coach', accessScope: scope([U18]) },
  { id: 'm3', teamId: CLUB, userId: 'u-mgr', role: 'coach', staffLevel: 'manager', status: 'active', accessProfile: 'manager', accessScope: scope([SEN]) },
  { id: 'm4', teamId: CLUB, userId: 'u1', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm5', teamId: OTHER, userId: 'u-out', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
];
function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'R' }, { id: OTHER, name: 'O' }]));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: m.userId + '@t.test', displayName: m.userId }))));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  for (const club of [CLUB, OTHER]) {
    kv.set(`app:structure:${club}`, JSON.stringify({ version: 1, groups: [
      { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
      { id: U18, name: 'U18', type: 'general', status: 'active' }], teams: [] }));
    kv.set(`app:publish:${club}:group:${SEN}:training_schedule`, JSON.stringify({
      slots: [{ id: 'slot_tue', day: 'Tue', startTime: '19:00', sessionId: 'tue', active: true }] }));
  }
}
const res = () => ({ statusCode: null, body: null, setHeader() {},
  status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } });
async function call(user, method, qs, body) {
  const m = MEMBERS.find(x => x.userId === user);
  const s = await store.createSession({ userId: user, teamId: m.teamId, role: m.role });
  const r = res();
  await handler({ method, url: '/api/publish?' + qs, query: Object.fromEntries(new URLSearchParams(qs)),
    headers: { cookie: `${store.SESSION_COOKIE}=${encodeURIComponent(s.token)}` }, body }, r);
  return r;
}
const writeSessions = (u, g, list) => call(u, 'POST', '', { type: 'sessions', group: g, data: list });
const mark  = (u, b) => call(u, 'POST', 'resource=attendance', b);
const read  = (u, g) => call(u, 'GET', 'resource=attendance&group=' + g);
const rollover = (list) => kv.set(`app:publish:${CLUB}:group:${SEN}:sessions`, JSON.stringify(list));

const ADHOC = { id: 'sess_1756000000000', type: 'Training', title: 'Extra skills night', date: '2026-08-06' };
const ADHOC_OCC = 'sess_1756000000000-20260806';

// ───────────────────────── the gap, closed ──────────────────────────────────

test('an ad-hoc session is noted the moment it is created', async () => {
  seed();
  await writeSessions('u-head', SEN, [ADHOC]);
  const all = (await read('u-head', SEN)).body.sessions;
  assert.deepEqual(Object.keys(all), [ADHOC_OCC]);
  assert.equal(all[ADHOC_OCC].date, '2026-08-06');
  assert.equal(all[ADHOC_OCC].title, 'Extra skills night');
  assert.deepEqual(all[ADHOC_OCC].marks, {}, 'it happened; nobody was marked');
  assert.equal(all[ADHOC_OCC].sourceSessionId, 'sess_1756000000000');
});

test('it survives the weekly rollover and stays editable', async () => {
  seed();
  await writeSessions('u-head', SEN, [ADHOC]);
  // The next sync REPLACES the list — the ad-hoc session is gone from it.
  await writeSessions('u-head', SEN, [{ id: 'tue', type: 'Training', title: 'Tuesday training', date: '2026-08-25' }]);
  rollover([{ id: 'tue', title: 'Tuesday training', date: '2026-08-25', type: 'Training' }]);
  const r = await mark('u-head', { group: SEN, sessionId: ADHOC_OCC, marks: { 'id:u1': 'present' } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.occurrenceId, ADHOC_OCC);
  assert.deepEqual(r.body.session.marks, { 'id:u1': 'present' });
  assert.equal(r.body.session.title, 'Extra skills night', 'its own title, kept');
  assert.equal(r.body.session.date, '2026-08-06', 'and its own date');
});

test('noting a session is idempotent — no duplicate however often it syncs', async () => {
  seed();
  for (let i = 0; i < 4; i++) await writeSessions('u-head', SEN, [ADHOC]);
  assert.deepEqual(Object.keys((await read('u-head', SEN)).body.sessions), [ADHOC_OCC]);
});

test('a re-sync never overwrites attendance already recorded', async () => {
  seed();
  await writeSessions('u-head', SEN, [ADHOC]);
  await mark('u-head', { group: SEN, sessionId: ADHOC_OCC, marks: { 'id:u1': 'present' } });
  await writeSessions('u-head', SEN, [ADHOC]);        // the schedule syncs again
  const all = (await read('u-head', SEN)).body.sessions;
  assert.deepEqual(all[ADHOC_OCC].marks, { 'id:u1': 'present' }, 'the register is untouched');
});

test('a recurring session is noted the same way, on its canonical occurrence', async () => {
  seed();
  await writeSessions('u-head', SEN, [{ id: 'tue', type: 'Training', title: 'Tuesday training', date: '2026-08-04' }]);
  assert.deepEqual(Object.keys((await read('u-head', SEN)).body.sessions), ['slot_tue-20260804'],
    'canonicalised through the slot table, not stored under the bare id');
});

test('an undated session is not noted — there is no occurrence to note', async () => {
  seed();
  await writeSessions('u-head', SEN, [{ id: 'sess_x', type: 'Training', title: 'Someday', date: '' }]);
  assert.deepEqual(Object.keys((await read('u-head', SEN)).body.sessions), []);
});

test('a MATCH is not a training session and is not noted', async () => {
  seed();
  await writeSessions('u-head', SEN, [{ id: 'game', type: 'Match', title: 'vs Kituro', date: '2026-08-08' }]);
  assert.deepEqual(Object.keys((await read('u-head', SEN)).body.sessions), []);
});

// ───────────────────────── the future is not history ────────────────────────

test('a FUTURE session is noted but does NOT become retrospectively editable', async () => {
  seed();
  const future = { id: 'sess_future', type: 'Training', title: 'Next month', date: '2099-01-05' };
  await writeSessions('u-head', SEN, [future]);
  assert.ok((await read('u-head', SEN)).body.sessions['sess_future-20990105'], 'noted, so it survives');
  // …but it has not happened, so the historical path refuses it.
  rollover([]);
  const r = await mark('u-head', { group: SEN, sessionId: 'sess_future-20990105', marks: { 'id:u1': 'present' } });
  assert.equal(r.statusCode, 404, 'a client cannot make the future into history by supplying a date');
});

test('a future session IS markable while it is in the current week, as before', async () => {
  seed();
  const soon = { id: 'sess_soon', type: 'Training', title: 'Friday', date: '2099-01-05' };
  rollover([soon]);
  const r = await mark('u-head', { group: SEN, sessionId: 'sess_soon', marks: { 'id:u1': 'present' } });
  assert.equal(r.statusCode, 200, 'existing current-week behaviour is unchanged');
});

// ───────────────────────── nothing is fabricated ────────────────────────────

test('a session that was never noted stays unrepresented', async () => {
  seed();
  rollover([]);
  // No ledger entry, no slot for this root: nothing can prove it happened.
  const r = await mark('u-head', { group: SEN, sessionId: 'sess_never_seen-20260806', marks: { 'id:u1': 'present' } });
  assert.equal(r.statusCode, 404);
});

test('the ledger records only what the SERVER was told, never a client-supplied date', async () => {
  seed();
  await writeSessions('u-head', SEN, [ADHOC]);
  // A later attendance write cannot re-date the session.
  const r = await mark('u-head', { group: SEN, sessionId: ADHOC_OCC, date: '1999-01-01', title: 'Forged',
    marks: { 'id:u1': 'present' } });
  assert.equal(r.body.session.date, '2026-08-06');
  assert.equal(r.body.session.title, 'Extra skills night');
});

// ───────────────────────── isolation and permissions ────────────────────────

test('the ledger is group-scoped', async () => {
  seed();
  await writeSessions('u-head', SEN, [ADHOC]);
  await writeSessions('u-head', U18, [{ id: 'sess_y', type: 'Training', title: 'U18 extra', date: '2026-08-07' }]);
  assert.deepEqual(Object.keys((await read('u-head', SEN)).body.sessions), [ADHOC_OCC]);
  assert.deepEqual(Object.keys((await read('u-head', U18)).body.sessions), ['sess_y-20260807']);
});

test('a coach cannot note a session into a group they do not operate', async () => {
  seed();
  assert.equal((await writeSessions('u-u18c', SEN, [ADHOC])).statusCode, 403);
});

test('a U18 coach cannot edit a Seniors ad-hoc session', async () => {
  seed();
  await writeSessions('u-head', SEN, [ADHOC]);
  rollover([]);
  assert.equal((await mark('u-u18c', { group: SEN, sessionId: ADHOC_OCC, marks: { 'id:u1': 'present' } })).statusCode, 403);
  assert.equal((await mark('u-u18c', { group: U18, sessionId: ADHOC_OCC, marks: { 'id:u1': 'present' } })).statusCode, 404,
    'and it is unprovable in their own group');
});

test('another club cannot reach it', async () => {
  seed();
  await writeSessions('u-head', SEN, [ADHOC]);
  rollover([]);
  await mark('u-out', { group: SEN, sessionId: ADHOC_OCC, marks: { 'id:u1': 'absent' } });
  assert.deepEqual((await read('u-head', SEN)).body.sessions[ADHOC_OCC].marks, {}, 'ours is untouched');
});

test('a reports-only manager and a player still cannot write', async () => {
  seed();
  assert.equal((await writeSessions('u-mgr', SEN, [ADHOC])).statusCode, 403);
  assert.equal((await writeSessions('u1', SEN, [ADHOC])).statusCode, 403);
  await writeSessions('u-head', SEN, [ADHOC]); rollover([]);
  assert.equal((await mark('u-mgr', { group: SEN, sessionId: ADHOC_OCC, marks: { 'id:u1': 'present' } })).statusCode, 403);
  assert.equal((await mark('u1',    { group: SEN, sessionId: ADHOC_OCC, marks: { 'id:u1': 'present' } })).statusCode, 403);
});

test('nothing unknown survives into the ledger', async () => {
  seed();
  await writeSessions('u-head', SEN, [{ ...ADHOC, evil: 'x', marks: { 'id:u1': 'present' } }]);
  const rec = (await read('u-head', SEN)).body.sessions[ADHOC_OCC];
  assert.deepEqual(Object.keys(rec).sort(), ['date', 'marks', 'sourceSessionId', 'title', 'updatedAt', 'updatedBy']);
  assert.deepEqual(rec.marks, {}, 'a client cannot smuggle attendance in through the schedule');
});

test('the schedule sanitiser is the barrier — a session carries no marks or dates of its own', async () => {
  seed();
  // The ledger reads sess.date/title/id. It can only ever see what
  // sanitiseSessions allowed through, which is an exact allow-list — so a
  // client cannot reach the ledger with marks, a forged ledger date, or
  // anything else. This pins the barrier where it actually lives.
  const r = await writeSessions('u-head', SEN, [{ ...ADHOC,
    marks: { 'id:u1': 'present' }, ledgerDate: '1999-01-01', updatedBy: 'someone-else' }]);
  const returned = r.body.sessions[0];
  assert.deepEqual(Object.keys(returned).sort(),
    ['blocks','coachName','date','deadline','endTime','focus','id','location','published','publishedAt','startTime','title','type'],
    'the session shape is an exact allow-list');
  assert.equal(returned.marks, undefined);
  assert.equal(returned.ledgerDate, undefined);
  const rec = (await read('u-head', SEN)).body.sessions[ADHOC_OCC];
  assert.deepEqual(rec.marks, {});
  assert.equal(rec.date, '2026-08-06');
  assert.equal(rec.updatedBy, '');
});

// ───────────────────────── the cap keeps what matters ───────────────────────

test('when the cap bites it drops the OLDEST, never the newest', async () => {
  seed();
  const many = { sessions: {} };
  for (let i = 0; i < 405; i++) {
    const d = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
    many.sessions['s' + i + '-' + d.replace(/-/g, '')] = { date: d, title: 't', marks: {} };
  }
  kv.set(`app:publish:${CLUB}:group:${SEN}:attendance`, JSON.stringify(many));
  await writeSessions('u-head', SEN, [ADHOC]);
  const all = (await read('u-head', SEN)).body.sessions;
  assert.ok(Object.keys(all).length <= 400);
  assert.ok(all[ADHOC_OCC], 'the session just written is still there');
  const dates = Object.values(all).map(v => v.date).sort();
  assert.ok(dates[0] > '2020-01-01', 'the oldest were dropped, not the newest');
});

// ───────────────────────── identity and dates ───────────────────────────────

test('the ledger identity is the canonical occurrence — clock-free', () => {
  const src = strip(extractFn(api, 'attendanceLedgerAdditions', ''));
  assert.match(src, /attendanceOccurrenceId\(sess\.id, sess\.date, slots\)/);
  for (const bad of [/new Date/, /Date\.now/, /toISOString/]) {
    assert.ok(!bad.test(src), `must not touch the clock: ${bad}`);
  }
});

test('an ad-hoc occurrence is stable in every timezone', () => {
  const run = tz => execFileSync(process.execPath, ['-e',
    `const ATT_DATED_RE=/-(\\\\d{8})$/;\n${extractFn(api, 'attendanceOccurrenceRoot', '')}\n${extractFn(api, 'attendanceOccurrenceId', '')}\n` +
    `process.stdout.write(attendanceOccurrenceId('sess_1756000000000','2026-08-06',[]));`],
    { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
  for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Auckland']) {
    assert.equal(run(tz), ADHOC_OCC, `stable in ${tz}`);
  }
});

// ───────────────────────── History shows it honestly ────────────────────────

test('a noted session with no marks appears in History rather than being hidden', () => {
  const fn = strip(extractFn(html, 'trainingHistorySessions'));
  assert.ok(!/if \(!Object\.keys\(\(rec && rec\.marks\) \|\| \{\}\)\.length\) return;/.test(fn),
    'hiding an unmarked register is what made an unrecorded session unreachable');
  const has = strip(extractFn(html, 'trainingSessionHasData'));
  assert.match(has, /const known = !!rec;/, 'the register existing is the fact');
});

test('History still reads only the server, never the legacy local store', () => {
  for (const fn of ['trainingHistorySessions', 'trainingSessionHasData', 'attendancePanelHtml']) {
    assert.ok(!/state\.trainingAttendance/.test(strip(extractFn(html, fn))), fn);
  }
});

test('no second store, no second aggregation, no thirteenth function', async () => {
  assert.equal(api.split('function attendanceKey(').length - 1, 1, 'one attendance key');
  assert.equal(html.split('function attendanceStats(').length - 1, 1, 'one aggregation');
  assert.equal(html.split('function attendancePanelHtml(').length - 1, 1, 'one register');
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(new URL('../api/', import.meta.url))).filter(f => f.endsWith('.js') && !f.startsWith('_'));
  assert.ok(files.length <= 12, `api/ holds ${files.length}; the ceiling is 12`);
});
