/**
 * TRAINING SESSION PERSISTENCE — the Xavier Bossert investigation.
 *
 * Root cause pinned here: the Training planner's "Create session"
 * (trainingCreateSession) and its delete wrote ONLY local state +
 * localStorage and claimed success instantly — no server call at all (the
 * Availability-screen session form always synced; the planner path never
 * did). The session therefore existed on one device only: invisible on
 * every other device, gone with evicted phone storage, and deletions
 * resurrected from the next server merge. A second display gap: non-current
 * planner weeks rendered schedule OCCURRENCES only, so a dated session
 * created for a future week disappeared from view the moment that week was
 * opened.
 *
 * Contract: create/delete persist through syncSessionsToServer (group-owned
 * sessions list), success is claimed only on a server OK, failures speak the
 * truth, retained local state re-syncs on the next successful save, dated
 * ad-hoc sessions render in their own week, and cross-group authorization
 * is unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.training-persist.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (c === 'EXPIRE' || c === 'LPUSH' || c === 'LTRIM') r = 1;
  return { ok: true, json: async () => ({ result: r }) };
};

const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}

// ─── Client: create claims success ONLY after the server OK ────────────────
function createHarness({ syncOk }) {
  return new Function(`
    "use strict";
    const state = { schedule: [{ id: 'tue', title: 'TUESDAY' }] };
    const calls = { toasts: [], saves: 0, renders: 0, syncs: 0 };
    let _trainingNewSessionOpen = true;
    const document = { getElementById: id => ({ value: ({ 'ts-title': 'Contact Skills', 'ts-date': '2026-08-27', 'ts-start': '19:00' })[id] || '' }) };
    function notify(t) { calls.toasts.push(t); }
    function saveState() { calls.saves++; }
    function render() { calls.renders++; }
    async function syncSessionsToServer() { calls.syncs++; return ${JSON.stringify(syncOk)}; }
    ${fn('trainingCreateSession')}
    trainingCreateSession();
    return new Promise(r => setTimeout(() => r({ calls, schedule: state.schedule.map(s => s.title) }), 5));
  `)();
}

test('create persists through the sessions sync and reports success only on server OK', async () => {
  const { calls, schedule } = await createHarness({ syncOk: true });
  assert.equal(calls.syncs, 1, 'THE server write happens (this was the whole bug)');
  assert.ok(schedule.includes('Contact Skills'), 'local schedule updated');
  assert.ok(calls.toasts.some(t => /Contact Skills created/.test(t)), 'success claimed');
  assert.ok(!calls.toasts.some(t => /device only/i.test(t)));
});

test('a failed server write NEVER claims a clean save — the truth is told', async () => {
  const { calls, schedule } = await createHarness({ syncOk: false });
  assert.equal(calls.syncs, 1);
  assert.ok(schedule.includes('Contact Skills'), 'work is kept locally (nothing lost)');
  assert.ok(!calls.toasts.some(t => t === 'Contact Skills created'), 'no false success');
  assert.ok(calls.toasts.some(t => /device only|could not reach the server/i.test(t)), 'honest copy');
});

test('delete persists too — a local-only delete would resurrect from the next merge', () => {
  const del = fn('trainingDeleteSession');
  assert.match(del, /syncSessionsToServer\(\)/, 'deletion syncs the group sessions list');
  assert.match(del, /Deleted on this device only/, 'failure copy is honest');
});

// ─── Client: the LIVE beta path (Manage Sessions form) is truthful too ─────
function formHarness({ syncOk }) {
  return new Function(`
    "use strict";
    const state = { schedule: [{ id: 'tue', title: 'TUESDAY' }] };
    const calls = { toasts: [], syncs: 0 };
    let _sessionFormMode = 'add', _sessionFormId = null;
    const document = { getElementById: id => ({ value: ({ 'sf-title': 'Contact Skills', 'sf-date': '2026-08-27' })[id] || '' }) };
    function showToast(t) { calls.toasts.push(t); }
    function saveState() {}
    function render() {}
    async function syncSessionsToServer() { calls.syncs++; return ${JSON.stringify(syncOk)}; }
    ${fn('saveSessionForm')}
    saveSessionForm();
    return new Promise(r => setTimeout(() => r({ calls, schedule: state.schedule.map(x => x.title) }), 5));
  `)();
}

test('LIVE path (Manage Sessions): save syncs and claims success only on server OK', async () => {
  const { calls, schedule } = await formHarness({ syncOk: true });
  assert.equal(calls.syncs, 1);
  assert.ok(schedule.includes('Contact Skills'));
  assert.deepEqual(calls.toasts, ['Session saved']);
});

test('LIVE path: a failed sync tells the truth instead of "Session saved"', async () => {
  const { calls } = await formHarness({ syncOk: false });
  assert.ok(!calls.toasts.includes('Session saved'), 'no false success');
  assert.ok(calls.toasts.some(t => /device only/i.test(t)), 'honest copy');
});

// ─── Client: syncSessionsToServer reports the truth ────────────────────────
function syncHarness(response) {
  return new Function(`
    "use strict";
    const state = { activeView: 'coach', operationalGroupId: 'grp_initial',
      schedule: [{ id: 'sess_1', title: 'Contact Skills', date: '2026-08-27', blocks: [1,2] }] };
    const posted = [];
    function isCoach() { return true; }
    function operationalGroups() { return [{ id: 'grp_initial' }]; }
    ${fn('trainingGroupParam')}
    const fetch = async (url, opts) => {
      posted.push(JSON.parse(opts.body));
      if (${JSON.stringify(response)} === 'network') throw new TypeError('offline');
      return { ok: ${JSON.stringify(response)} === 'ok' };
    };
    ${fn('syncSessionsToServer')}
    return syncSessionsToServer().then(ok => ({ ok, posted }));
  `)();
}

test('sync returns true only on res.ok; 403 and network failures return false', async () => {
  assert.equal((await syncHarness('ok')).ok, true);
  assert.equal((await syncHarness('denied')).ok, false, 'a refused write is not success');
  assert.equal((await syncHarness('network')).ok, false, 'offline is not success');
});

test('sync posts the FULL group-stamped schedule — a later successful save re-syncs a previously failed session', async () => {
  const { posted } = await syncHarness('ok');
  assert.equal(posted.length, 1);
  assert.equal(posted[0].type, 'sessions');
  assert.equal(posted[0].group, 'grp_initial', 'group-owned write');
  assert.equal(posted[0].data[0].title, 'Contact Skills', 'retained local session rides every sync');
  assert.deepEqual(posted[0].data[0].blocks, [], 'block content never leaks through this path');
});

// ─── Client: dated ad-hoc sessions render in their own week ────────────────
test('a dated coach-created session appears when its (non-current) week is viewed', () => {
  const start = src.indexOf('const schedSessions = twCurrent ?');
  const block = src.slice(start, src.indexOf(';', src.indexOf('availWeekStart', start)) + 1);
  assert.match(block, /concat\(\(state\.schedule \|\| \[\]\)\.filter/, 'ad-hoc sessions merged into week views');
  assert.match(block, /availWeekStart\(String\(sess\.date\)\.slice\(0, 10\)\) === twWeek/, 'matched by the session\'s own week');
  // Functional: the same filter with the REAL availWeekStart.
  const pick = new Function(`
    "use strict";
    ${fn('availWeekStart')}
    const twWeek = availWeekStart('2026-08-27');
    const schedule = [
      { id: 'a', title: 'In week', date: '2026-08-27' },
      { id: 'b', title: 'Other week', date: '2026-09-10' },
      { id: 'c', title: 'Dateless legacy', date: '19.45' },
    ];
    return schedule.filter(sess => sess && sess.date && /^\\d{4}-\\d{2}-\\d{2}/.test(String(sess.date)) &&
      availWeekStart(String(sess.date).slice(0, 10)) === twWeek).map(s => s.id);
  `)();
  assert.deepEqual(pick, ['a'], 'exactly the viewed week\'s dated session; legacy dateless rows never mis-file');
});

// ─── Server: the write lands in the right group key, reads return it ───────
const { default: publishHandler } = await import('../api/publish.js');
const store = await import('../api/_identityStore.js');
const { SESSION_COOKIE } = store;
const CLUB = 'boitsfort';
const SEN = 'grp_initial', U18 = 'grp_2b0aa7f9';
function res() { return { statusCode: 200, body: null, status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; }, setHeader(){}, end(){ return this; } }; }
async function callPublish(query, body, session, method = 'GET') {
  const r = res();
  await publishHandler({ method, query, headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` }, body: body || {} }, r);
  return r;
}
async function seedXavierShape() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'm-x', teamId: CLUB, userId: 'u-xavier', role: 'coach', staffLevel: 'assistant', status: 'active',
      accessScope: { clubWide: false, groups: [{ groupId: SEN, status: 'active' }], teams: [] } }]));
  kv.set('app:identity:users', JSON.stringify([{ id: 'u-xavier', email: 'x@b.test', displayName: 'Xavier' }]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1,
    groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' }, { id: U18, name: 'U18', type: 'age-grade', status: 'active' }],
    teams: [{ id: 't-sen', groupId: SEN, name: 'Premier', status: 'active' }, { id: 't-u18', groupId: U18, name: 'U18', status: 'active' }] }));
  // Production shape: legacy club-wide sessions exist; NO Seniors group key yet.
  kv.set(`app:publish:${CLUB}:sessions`, JSON.stringify([{ id: 'tue', title: 'TUESDAY', date: '19.45' }]));
  return store.createSession({ userId: 'u-xavier', teamId: CLUB, role: 'coach' });
}

test('Xavier-shape: the synced session lands in the Seniors group key ONLY and reads back after "reload"', async () => {
  const xavier = await seedXavierShape();
  const sessions = [{ id: 'tue', title: 'TUESDAY', date: '19.45' }, { id: 'sess_9', title: 'Contact Skills', date: '2026-08-27', type: 'Training' }];
  const w = await callPublish({}, { type: 'sessions', group: SEN, data: sessions }, xavier, 'POST');
  assert.equal(w.statusCode, 200);
  assert.equal(w.body.groupId, SEN);
  const stored = JSON.parse(kv.get(`app:publish:${CLUB}:group:${SEN}:sessions`) || '[]');
  assert.ok(stored.some(s => s.title === 'Contact Skills'), 'persisted in the Seniors group key');
  assert.equal(kv.has(`app:publish:${CLUB}:group:${U18}:sessions`), false, 'no other group touched');

  // "Reload": the sessions read returns it — this is what every device sees.
  const r = await callPublish({ type: 'sessions', group: SEN }, null, xavier);
  assert.equal(r.statusCode, 200);
  assert.ok((r.body.sessions || []).some(s => s.title === 'Contact Skills'), 'reload/other-device read returns the session');
});

test('cross-group authorization unchanged: Xavier cannot write U18 sessions; refusal mutates nothing', async () => {
  const xavier = await seedXavierShape();
  const before = JSON.stringify([...kv.entries()].sort());
  const w = await callPublish({}, { type: 'sessions', group: U18, data: [{ id: 'x', title: 'Nope' }] }, xavier, 'POST');
  assert.equal(w.statusCode, 403);
  assert.equal(JSON.stringify([...kv.entries()].sort()), before, 'zero mutation');
});

test('legacy sessions stay readable until the first group write, which then owns the list', async () => {
  const xavier = await seedXavierShape();
  const beforeWrite = await callPublish({ type: 'sessions', group: SEN }, null, xavier);
  assert.ok(beforeWrite.body.sessions.some(s => s.id === 'tue'), 'legacy fallback intact pre-write');
  await callPublish({}, { type: 'sessions', group: SEN, data: [{ id: 'tue', title: 'TUESDAY' }, { id: 'sess_9', title: 'Contact Skills', date: '2026-08-27' }] }, xavier, 'POST');
  const after = await callPublish({ type: 'sessions', group: SEN }, null, xavier);
  assert.deepEqual(after.body.sessions.map(s => s.id).sort(), ['sess_9', 'tue'], 'group key now authoritative, legacy carried forward by the client list');
});
