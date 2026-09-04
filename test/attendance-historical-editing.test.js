/**
 * BUILD C — a past session's register can be opened and corrected.
 *
 * The blocker was that the server validated a session against the stored list,
 * which holds only the CURRENT WEEK. A past session is not in it, so editing was
 * refused.
 *
 * Nothing is invented to fix that. A past occurrence is accepted only when the
 * server can already PROVE it happened:
 *   1. a register exists for it — written server-side at the time, with the date
 *      taken from the session record then in force; or
 *   2. the group's schedule holds the slot the occurrence is rooted in, the date
 *      falls on that slot's WEEKDAY, inside its effective range, and is past.
 * A Wednesday claimed for a Tuesday slot, a future date, or an ad-hoc session
 * nobody recorded are all refused.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.histatt.test';
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
// 2026-08-04 and 2026-08-11 are Tuesdays; 2026-08-05 is a Wednesday.
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
  kv.set(`app:publish:${CLUB}:group:${U18}:training_schedule`, JSON.stringify({
    slots: [{ id: 'slot_thu', day: 'Thu', startTime: '19:00', sessionId: 'thu', active: true }] }));
  // The CURRENT week's stored list — a past session is deliberately absent.
  kv.set(`app:publish:${CLUB}:group:${SEN}:sessions`, JSON.stringify([
    { id: 'tue', title: 'Tuesday training', date: '2026-08-25', type: 'Training' }]));
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
const mark = (u, b) => call(u, 'POST', 'resource=attendance', b);
const read = (u, g) => call(u, 'GET', 'resource=attendance&group=' + g);
const PAST = 'slot_tue-20260804';

// ───────────────────────── opening and editing the past ─────────────────────

test('a past session PROVEN by the schedule can be opened and recorded', async () => {
  seed();
  const r = await mark('u-head', { group: SEN, sessionId: PAST, marks: { 'id:u1': 'present' } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.occurrenceId, PAST);
  assert.equal(r.body.session.date, '2026-08-04', 'the date comes from the occurrence, not the clock');
  assert.equal(r.body.session.title, 'Tuesday Training');
});

test('Present → Absent, and Absent → Present, on a past session', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: PAST, marks: { 'id:u1': 'present', 'id:u2': 'absent' } });
  const flip = await mark('u-head', { group: SEN, sessionId: PAST, marks: { 'id:u1': 'absent', 'id:u2': 'present' } });
  assert.deepEqual(flip.body.session.marks, { 'id:u1': 'absent', 'id:u2': 'present' });
});

test('a past mark can be cleared back to NOT RECORDED, which is not Absent', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: PAST, marks: { 'id:u1': 'present', 'id:u2': 'present' } });
  const r = await mark('u-head', { group: SEN, sessionId: PAST, marks: { 'id:u1': null } });
  assert.deepEqual(r.body.session.marks, { 'id:u2': 'present' }, 'gone, not "absent"');
});

test('a past edit persists across a fresh read', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: PAST, marks: { 'id:u1': 'present' } });
  const back = (await read('u-head', SEN)).body.sessions;
  assert.deepEqual(back[PAST].marks, { 'id:u1': 'present' });
  assert.equal(back[PAST].date, '2026-08-04');
});

test('an existing register is itself proof, even with no slot left in the schedule', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: PAST, marks: { 'id:u1': 'present' } });
  // The club reorganises and the slot disappears. The register still stands.
  kv.set(`app:publish:${CLUB}:group:${SEN}:training_schedule`, JSON.stringify({ slots: [] }));
  const r = await mark('u-head', { group: SEN, sessionId: PAST, marks: { 'id:u1': 'absent' } });
  assert.equal(r.statusCode, 200, 'a session we already recorded demonstrably happened');
  assert.deepEqual(r.body.session.marks, { 'id:u1': 'absent' });
});

test('the current week still behaves exactly as before', async () => {
  seed();
  const r = await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:u1': 'present' } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.occurrenceId, 'slot_tue-20260825', 'canonicalised through the slot table');
});

test('both weeks coexist as separate registers', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: PAST,  marks: { 'id:u1': 'present' } });
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:u1': 'absent' } });
  const all = (await read('u-head', SEN)).body.sessions;
  assert.deepEqual(Object.keys(all).sort(), ['slot_tue-20260804', 'slot_tue-20260825']);
});

// ───────────────────────── what is REFUSED ──────────────────────────────────

test('a Build A shaped historical id is canonicalised by the server', async () => {
  seed();
  // `tue-20260804` is the shape Build A wrote. It must land in the SAME register
  // as `slot_tue-20260804`, not a second one.
  const r = await mark('u-head', { group: SEN, sessionId: 'tue-20260804', marks: { 'id:u1': 'present' } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.occurrenceId, PAST, 'canonicalised through the slot table');
  await mark('u-head', { group: SEN, sessionId: PAST, marks: { 'id:u2': 'absent' } });
  const all = (await read('u-head', SEN)).body.sessions;
  assert.deepEqual(Object.keys(all), [PAST], 'one register, not two');
  assert.deepEqual(all[PAST].marks, { 'id:u1': 'present', 'id:u2': 'absent' });
});

test('a weekday the slot never ran on is refused', async () => {
  seed();
  // 2026-08-05 is a Wednesday; slot_tue runs on Tuesdays.
  const r = await mark('u-head', { group: SEN, sessionId: 'slot_tue-20260805', marks: { 'id:u1': 'present' } });
  assert.equal(r.statusCode, 404);
});

test('a FUTURE occurrence is refused — planning is not history', async () => {
  seed();
  const r = await mark('u-head', { group: SEN, sessionId: 'slot_tue-20991201', marks: { 'id:u1': 'present' } });
  assert.equal(r.statusCode, 404);
});

test('an ad-hoc session nobody recorded cannot be invented', async () => {
  seed();
  const r = await mark('u-head', { group: SEN, sessionId: 'adhoc_x-20260804', marks: { 'id:u1': 'present' } });
  assert.equal(r.statusCode, 404);
});

test('a date before the slot existed is refused', async () => {
  seed();
  kv.set(`app:publish:${CLUB}:group:${SEN}:training_schedule`, JSON.stringify({
    slots: [{ id: 'slot_tue', day: 'Tue', startTime: '19:00', sessionId: 'tue', active: true,
              effectiveFrom: '2026-08-10' }] }));
  assert.equal((await mark('u-head', { group: SEN, sessionId: PAST, marks: { 'id:u1': 'present' } })).statusCode, 404);
  // …but a Tuesday inside the range is fine
  assert.equal((await mark('u-head', { group: SEN, sessionId: 'slot_tue-20260811', marks: { 'id:u1': 'present' } })).statusCode, 200);
});

test('a date after the slot ended is refused', async () => {
  seed();
  kv.set(`app:publish:${CLUB}:group:${SEN}:training_schedule`, JSON.stringify({
    slots: [{ id: 'slot_tue', day: 'Tue', startTime: '19:00', sessionId: 'tue', active: true,
              effectiveTo: '2026-08-05' }] }));
  assert.equal((await mark('u-head', { group: SEN, sessionId: 'slot_tue-20260811', marks: { 'id:u1': 'present' } })).statusCode, 404);
});

// ───────────────────────── isolation and permissions ────────────────────────

test('another GROUP cannot edit a past session', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: PAST, marks: { 'id:u1': 'present' } });
  const w = await mark('u-u18c', { group: SEN, sessionId: PAST, marks: { 'id:u1': 'absent' } });
  assert.equal(w.statusCode, 403);
  assert.equal((await read('u-u18c', SEN)).statusCode, 403);
  // and the Seniors slot is not in U18's schedule, so the occurrence is unprovable there
  assert.equal((await mark('u-u18c', { group: U18, sessionId: PAST, marks: { 'id:u1': 'absent' } })).statusCode, 404);
});

test('another CLUB cannot reach a past session', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: PAST, marks: { 'id:u1': 'present' } });
  await mark('u-out', { group: SEN, sessionId: PAST, marks: { 'id:u1': 'absent' } });
  const ours = (await read('u-head', SEN)).body.sessions;
  assert.deepEqual(ours[PAST].marks, { 'id:u1': 'present' }, 'our register is untouched');
});

test('a reports-only manager still cannot edit history', async () => {
  seed();
  assert.equal((await mark('u-mgr', { group: SEN, sessionId: PAST, marks: { 'id:u1': 'present' } })).statusCode, 403);
  assert.equal((await read('u-mgr', SEN)).statusCode, 403);
});

test('a player still cannot edit history', async () => {
  seed();
  assert.equal((await mark('u1', { group: SEN, sessionId: PAST, marks: { 'id:u1': 'present' } })).statusCode, 403);
});

test('marks are still keyed by durable identity, never a name', async () => {
  seed();
  for (const bad of [{ 'Ana Silva': 'present' }, { 'nm:ana': 'present' }, { u1: 'present' }]) {
    assert.equal((await mark('u-head', { group: SEN, sessionId: PAST, marks: bad })).statusCode, 400);
  }
});

test('a forged teamId in the query changes nothing', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: PAST, marks: { 'id:u1': 'present' } });
  const r = await call('u-head', 'GET', `resource=attendance&group=${SEN}&teamId=${OTHER}`);
  assert.deepEqual(r.body.sessions[PAST].marks, { 'id:u1': 'present' }, 'still OUR club');
});

// ───────────────────────── date safety ──────────────────────────────────────

test('the weekday check is timezone-proof', () => {
  const src = extractFn(api, 'attendanceHistoricalOccurrence', '');
  assert.match(src, /Date\.UTC\(/, 'built in UTC');
  assert.match(src, /getUTCDay\(\)/, 'and read in UTC');
  assert.ok(!/getDay\(\)|getMonth\(\)|getDate\(\)/.test(src), 'no local-time reads');
  // Proven in both directions from UTC.
  for (const tz of ['America/Los_Angeles', 'Pacific/Auckland']) {
    const out = execFileSync(process.execPath, ['-e',
      `const DAY=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];` +
      `process.stdout.write(DAY[new Date(Date.UTC(2026,7,4)).getUTCDay()]);`],
      { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(out, 'Tue', `4 Aug 2026 must read as Tuesday in ${tz}`);
  }
});

test('a past occurrence never consults the clock for its date', () => {
  const src = strip(extractFn(api, 'attendanceHistoricalOccurrence', ''));
  // `todayIso` is passed IN so the caller owns the boundary; the function never
  // reaches for the clock to decide which day a record belongs to.
  assert.ok(!/new Date\(\)/.test(src), 'no implicit now');
  assert.match(src, /todayIso/);
});

// ───────────────────────── the client: one register, two surfaces ───────────

/** Actually RUN the register, so its behaviour is tested rather than its text. */
function panelScope({ sessions = {}, group = [], club = [], slots = [{ id: 'slot_tue', sessionId: 'tue', day: 'Tue' }] } = {}) {
  return new Function('cfg', `
    "use strict";
    const state = { operationalGroupId: 'g1' };
    let _trainingSchedule = { slots: cfg.slots };
    let _attendance = { sessions: cfg.sessions };
    let _attendanceGroup = 'g1';
    let _attendanceFailed = null;
    function loadAttendance() {}
    function canI() { return true; }
    function esc(v) { return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function playerIsArchived(p) { return (p && p.lifecycleStatus) === 'archived'; }
    function operationalPlayers() { return cfg.group; }
    function canonicalVisiblePlayers() { return cfg.club; }
    ${extractFn(html, 'playerMatchKey')}
    ${extractFn(html, 'attendanceOccurrenceId')}
    ${extractFn(html, 'currentAttendance')}
    ${extractFn(html, 'attendanceFailed')}
    ${extractFn(html, 'attendancePanelHtml')}
    return attendancePanelHtml;
  `)({ sessions, group, club, slots });
}
const ANA = { id: 'p1', name: 'Ana Silva', userId: 'u1' };
const BEN = { id: 'p2', name: 'Ben Okafor', userId: 'u2' };
const GONE = { id: 'p9', name: 'Old Player', userId: 'u9' };

test('the register counts NOT RECORDED as its own state, never absent', () => {
  const panel = panelScope({ group: [ANA, BEN],
    sessions: { 'slot_tue-20260804': { date: '2026-08-04', marks: { 'id:u1': 'present' } } } })
    ('slot_tue-20260804', '2026-08-04');
  assert.match(panel, /1 present · 0 absent · 1 not recorded/,
    'Ben was never marked — that is not an absence');
});

test('the register is keyed by durable identity, not the roster id', () => {
  // Marks are stored under id:u1; a register keyed by the ROSTER id (p1) would
  // find nothing and silently show an empty session.
  const panel = panelScope({ group: [ANA],
    sessions: { 'slot_tue-20260804': { date: '2026-08-04', marks: { 'id:u1': 'present' } } } })
    ('slot_tue-20260804', '2026-08-04');
  assert.match(panel, /1 present/, 'the mark is found through playerMatchKey');
  assert.match(panel, /aria-pressed="true"/, 'and the button reflects it');
});

test('two players sharing a name keep their own marks in the register', () => {
  const twinA = { id: 'pA', name: 'Sam Jones', userId: 'uA' };
  const twinB = { id: 'pB', name: 'Sam Jones', userId: 'uB' };
  const panel = panelScope({ group: [twinA, twinB],
    sessions: { 'slot_tue-20260804': { date: '2026-08-04', marks: { 'id:uA': 'present' } } } })
    ('slot_tue-20260804', '2026-08-04');
  assert.match(panel, /1 present · 0 absent · 1 not recorded/, 'one of them, not both');
});

test('a player who has LEFT the group but has a mark still appears, and only then', () => {
  const withMark = panelScope({ group: [ANA], club: [ANA, GONE],
    sessions: { 'slot_tue-20260804': { date: '2026-08-04', marks: { 'id:u1': 'present', 'id:u9': 'absent' } } } })
    ('slot_tue-20260804', '2026-08-04');
  assert.match(withMark, /Old Player/, 'their real record stays visible and correctable');
  assert.match(withMark, /1 present · 1 absent · 0 not recorded/);

  const without = panelScope({ group: [ANA], club: [ANA, GONE],
    sessions: { 'slot_tue-20260804': { date: '2026-08-04', marks: { 'id:u1': 'present' } } } })
    ('slot_tue-20260804', '2026-08-04');
  assert.ok(!/Old Player/.test(without), 'but an unmarked ex-player is NOT added to the squad');
});

test('a NON-canonical historical id still resolves to the one register', () => {
  // A Build A record's shape, handed to the register.
  const panel = panelScope({ group: [ANA],
    sessions: { 'slot_tue-20260804': { date: '2026-08-04', marks: { 'id:u1': 'present' } } } })
    ('tue-20260804', '');
  assert.match(panel, /1 present/, 'canonicalised through the slot table before lookup');
});

test('History and the Planner render the SAME register function', () => {
  assert.equal(html.split('function attendancePanelHtml(').length - 1, 1, 'one implementation');
  // Build AG: the Planner resolves the row through trainingAttendanceOccurrence
  // first (stored current-week rows can carry junk dates), then hands the SAME
  // panel the resolved identity; an unresolvable row falls through unchanged.
  const planner = extractFn(html, 'renderTraining');
  assert.match(planner, /trainingAttendanceOccurrence\(sessId, sessObj && sessObj\.date\)/);
  assert.match(planner, /attendancePanelHtml\(_r \? _r\.id : sessId, _r \? _r\.date : \(sessObj && sessObj\.date\)\)/);
  const hist = extractFn(html, '_renderTrainingHistory');
  assert.match(hist, /attendancePanelHtml\(s\.id, s\.date\)/, 'History derives nothing');
});

test('the write names the OCCURRENCE, so a past session can be placed', () => {
  const save = strip(extractFn(html, 'saveAttendance'));
  assert.match(save, /sessionId: attendanceOccurrenceId\(sessionId, sessionDate\) \|\| sessionId/);
});

test('the register includes an already-marked player who has left the group', () => {
  const fn = strip(extractFn(html, 'attendancePanelHtml'));
  assert.match(fn, /canonicalVisiblePlayers\(\)\.filter/);
  assert.match(fn, /recs\[k\] && !seen\.has\(k\)/, 'only if they actually have a mark');
  // and never the whole club by default
  assert.match(fn, /const group = operationalPlayers\(\)/);
});

test('History still never reads the device-local store', () => {
  for (const fn of ['attendancePanelHtml', '_renderTrainingHistory', 'trainingHistorySessions']) {
    assert.ok(!/state\.trainingAttendance/.test(strip(extractFn(html, fn))), fn);
  }
});

test('attendance still cannot see availability', () => {
  const fn = strip(extractFn(html, 'attendancePanelHtml'));
  for (const bad of [/sessionRows\(/, /resolvedAnswerFor\(/, /trainingTuesday/, /no-reply/]) {
    assert.ok(!bad.test(fn), String(bad));
  }
});
