/**
 * OVERVIEW & CHASE ALL INTEGRITY (Build 104).
 *
 * CONFIRMED DEFECTS (Build 103 audit, real handlers, 2026-09-27):
 *
 *  1. NO OCCURRENCE, WHOLE SQUAD. availabilityNonResponders([]) returned every
 *     player, so a week with nothing scheduled — or one whose training
 *     schedule had simply not loaded yet — read "6 players haven't replied ·
 *     Chase all" on the Overview while the Availability board, at the same
 *     moment, said "6 / 6 replied to all sessions · All replied".
 *  2. ANY REQUEST, EVER. The item's gate was "some request on this device was
 *     once marked sent": last week's request, or another group's, raised this
 *     week's claim.
 *  3. THE TOAST REPORTED AN INTENTION. Chase all announced "Reminder sent to
 *     4 players ✓" whatever the server did — it had targeted one.
 *  4. THE SERVER ASKED A DIFFERENT QUESTION. audience:'no-reply' skipped
 *     anyone with ANY answer in the last seven days, in any session, in ANY
 *     CLUB, matched by DISPLAY NAME as well as id: a same-named player
 *     answering elsewhere silenced this club's reminder.
 *  5. THE REQUEST LOG WAS NOT SAVED by the act of sending a request.
 *
 * THE CONTRACT NOW. One identity: club + group + occurrence + player id.
 *   · No occurrence (empty week, schedule or answers unresolved, group
 *     unresolved, read failed) → no non-responder claim and no Chase all, on
 *     the Overview AND the board.
 *   · The gate is a request for one of THIS week's occurrences, in THIS group.
 *   · The non-responder rule is unchanged — a player who has answered NONE of
 *     the week's occurrences (answering any session is answering) — and it is
 *     now the one set the Overview counts, the board counts and Chase all sends.
 *   · The server decides recipients from the named occurrences, in the
 *     caller's club and group, by durable id. The client reports what the
 *     server says it sent.
 *
 * SERVER tests drive the REAL push and availability handlers over an in-memory
 * KV; the only double is the external push service (web-push's network send).
 * BROWSER tests drive the real client in Chromium against those handlers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
function fn(name) {
  const m = src.match(new RegExp(`\\n(\\s*)(?:async )?function ${name}\\s*\\(`));
  assert.ok(m, `function ${name} not found`);
  const start = m.index + 1;
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}
const has = name => new RegExp(`\\n\\s*(?:async )?function ${name}\\s*\\(`).test(src);
const stripComments = s => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

// ── The application's own week (the Build 102 approach): nothing here restates week arithmetic ──
const APP = new Function(`
  ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
  ${fn('availWeekStart')} ${fn('availAddDays')} ${fn('availSlotDateInWeek')} ${fn('availTrainingEventId')}
  ${fn('availabilityEventsForWeek')} ${fn('availToday')}
  return { availWeekStart, availAddDays, availSlotDateInWeek, availTrainingEventId, availabilityEventsForWeek, availToday };
`)();
const TODAY = APP.availToday();
const WEEK = APP.availWeekStart(TODAY);
const inWeek = (d, today) => { const w = APP.availWeekStart(today); return APP.availabilityEventsForWeek(w, { fixtures: [{ id: 'p', opposition: 'P', date: d }], slots: [], currentWeekStart: w }).some(e => e.id === 'p'); };
const MATCH_DAY = (() => { let day = TODAY; for (let i = 0; i < 14; i++) { const n = APP.availAddDays(day, 1); if (!inWeek(n, TODAY)) break; day = n; } return day; })();
const LAST_MATCH = APP.availAddDays(WEEK, -1);      // the last day of the PREVIOUS week
const NEXT_MATCH = APP.availAddDays(MATCH_DAY, 6);  // inside the FOLLOWING week
const TUE_THIS = 'slot_tue-' + APP.availAddDays(WEEK, 1).replace(/-/g, '');
const THU_THIS = 'slot_thu-' + APP.availAddDays(WEEK, 3).replace(/-/g, '');
const TUE_LAST = 'slot_tue-' + APP.availAddDays(WEEK, -6).replace(/-/g, '');

test('the dates these tests use are placed by the application\'s own week generator', () => {
  assert.ok(inWeek(MATCH_DAY, TODAY) && MATCH_DAY >= TODAY, 'this week\'s match is in the displayed week and has not passed');
  assert.ok(!inWeek(LAST_MATCH, TODAY) && LAST_MATCH < WEEK, 'last week\'s match is before it');
  assert.ok(!inWeek(NEXT_MATCH, TODAY) && NEXT_MATCH > MATCH_DAY, 'next week\'s match is after it');
});

// ═══════════════════════════════════════════════════════════════════════════
// REAL HANDLERS
// ═══════════════════════════════════════════════════════════════════════════
process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.chase-integrity.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.PUBLIC_CLUB_SIGNUP       = 'true';
delete process.env.VERCEL; delete process.env.NODE_ENV; delete process.env.DEV_LOGIN;

const kv = new Map(), lists = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [cmd, ...a] = JSON.parse(options.body || '[]');
  let result = null;
  if (cmd === 'GET') result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (cmd === 'SET') { if (a.includes('NX') && kv.has(a[0])) result = null; else { kv.set(a[0], a[1]); result = 'OK'; } }
  if (cmd === 'DEL') { result = kv.delete(a[0]) ? 1 : 0; }
  if (cmd === 'SCAN' || cmd === 'KEYS') {
    const glob = cmd === 'SCAN' ? String(a[a.indexOf('MATCH') + 1] ?? '*') : String(a[0] ?? '*');
    const re = new RegExp('^' + glob.split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    const matching = [...kv.keys()].filter(k => re.test(k));
    result = cmd === 'SCAN' ? ['0', matching] : matching;
  }
  if (cmd === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); result = l.length; }
  if (cmd === 'LRANGE') result = (lists.get(a[0]) || []).slice(Number(a[1]), Number(a[2]) + 1);
  if (cmd === 'LTRIM' || cmd === 'EXPIRE') result = 1;
  if (cmd === 'INCR') { const v = Number(kv.get(a[0]) || 0) + 1; kv.set(a[0], v); result = v; }
  return { ok: true, json: async () => ({ result }) };
};

// The ONE double: the external push service. Everything a test asserts about who was
// targeted comes from the real handler's own response and from what it handed to this.
const webpush = (await import('web-push')).default;
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey; process.env.VAPID_PRIVATE_KEY = vapid.privateKey; process.env.VAPID_SUBJECT = 'mailto:chase@integrity.test';
const PUSH = { delivered: [], failWith: null };
webpush.sendNotification = async (subscription, payload) => {
  if (PUSH.failWith) { const e = new Error('push service refused'); e.statusCode = PUSH.failWith; throw e; }
  PUSH.delivered.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
  return { statusCode: 201 };
};

const S  = await import('../api/_identityStore.js');
const ST = await import('../api/_structureStore.js');
const AV = await import('../api/_availabilityStore.js');
const handlers = {};
for (const name of ['identity', 'invite', 'config', 'publish', 'availability', 'chat', 'push', 'schedules', 'templates', 'subscribe']) handlers[name] = (await import(`../api/${name}.js`)).default;
const { SESSION_COOKIE } = S;
const PW = 'password123';
let kseq = 0; const kkey = () => String(kseq++).padStart(2, '0').repeat(10);
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;

async function run(name, method, query, body, cookie, res) {
  const vreq = { method, headers: { ...(cookie ? { cookie } : {}), host: 'test.local', 'x-forwarded-proto': 'http' }, query: query || {}, body: body || {}, url: '/api/' + name, on() {} };
  let captured = null;
  const vres = { statusCode: 200, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { res?.setHeader(k, v); }, getHeader(k) { return res?.getHeader(k); },
    writeHead(c, h) { res?.writeHead(c, h); return this; }, write(d) { res?.write(d); },
    json(d) { captured = d; if (res) { res.statusCode = this.statusCode; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(d)); } return this; },
    end(d) { if (res) { res.statusCode = this.statusCode; res.end(d); } return this; }, send(d) { this.end(typeof d === 'string' ? d : JSON.stringify(d)); } };
  await handlers[name](vreq, vres);
  return { status: vres.statusCode, body: captured };
}

/** A club built through the real store: founder coach, the initial (Seniors) group, a U18 group, players in each. */
async function makeClub(label, { seniors = [], u18 = [] } = {}) {
  const club = await S.createClub({ clubName: `${label} RFC`, teamName: 'First XV', sport: 'Rugby', name: `${label} Coach`, email: `coach.${label.toLowerCase()}@ci.test`, password: PW, idempotencyKey: kkey() });
  const U18 = (await ST.createGroup(club.team.id, { name: 'U18', developmentCategory: 'youth_u18' })).group.id;
  const SEN = ST.INITIAL_GROUP_ID;
  const code = (await S.loadStoredTeams()).find(t => t.id === club.team.id).teamCode;
  const people = {};
  for (const [gid, names] of [[SEN, seniors], [U18, u18]]) for (const n of names) {
    const [f, l] = n.split(' ');
    const p = await S.createJoinRequest({ teamCode: code, firstName: f, lastName: l, email: `${f.toLowerCase()}.${label.toLowerCase()}@ci.test`, password: PW });
    await S.approveJoinRequest(p.teamMember.id, club.user.id, club.team.id);
    people[f] = { ...p, name: n, gid };
  }
  const members = await S.loadTeamMembers();
  for (const m of members) { const who = Object.values(people).find(p => p.user.id === m.userId); if (who && m.teamId === club.team.id) m.playerGroupId = who.gid; }
  await S.saveTeamMembers(members);
  for (const p of Object.values(people)) p.session = await S.createSession({ userId: p.user.id, teamId: club.team.id, role: 'player' });
  const coach = await S.createSession({ userId: club.user.id, teamId: club.team.id, role: 'coach' });
  return { club, teamId: club.team.id, SEN, U18, people, coach, label };
}
const answer = async (player, sessionId, response = 'available', reason = '') => {
  const out = await run('availability', 'POST', {}, { sessionId, response, reason, intentAt: new Date().toISOString(), intentSeq: 0 }, ck(player.session));
  assert.equal(out.status, 200, `answer ${player.name} ${sessionId}: ${JSON.stringify(out.body)}`);
};
const subscribe = async (player, device = '') => {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const out = await run('subscribe', 'POST', {}, { label: player.name, subscription: { endpoint: `https://push.invalid/${player.user.id}${device}`, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } } }, ck(player.session));
  assert.ok(out.status < 300, `subscribe ${player.name}: ${out.status}`);
};
const chase = (c, body, cookie = ck(c.coach)) => run('push', 'POST', {}, { title: 'Availability reminder', body: 'Please confirm your availability.', type: 'availability', audience: 'no-reply', url: '/?to=availability', ...body }, cookie);
const recipients = out => (out.body?.results || []).map(r => r.userId).sort();
const ids = (c, ...names) => names.map(n => c.people[n].user.id).sort();
const stored = async (c, gid, sessionId) => Object.values(await AV.loadGroupAvailability(c.teamId, gid, sessionId)).filter(v => v && typeof v === 'object').map(v => v.userId).sort();

// ── J. cross-club, by identity ─────────────────────────────────────────────
test('SERVER J. a same-named player answering in ANOTHER club cannot suppress this club\'s reminder', async () => {
  const home = await makeClub('Home', { seniors: ['Stu Four', 'Sam One'] });
  const away = await makeClub('Away', { seniors: ['Stu Four'] });
  assert.notEqual(home.people.Stu.user.id, away.people.Stu.user.id, 'two different people who share a display name');
  for (const p of Object.values(home.people)) await subscribe(p);
  await answer(away.people.Stu, TUE_THIS, 'available');                      // the OTHER club's Stu answers THERE, under the same occurrence id
  await answer(home.people.Sam, TUE_THIS, 'available');
  const out = await chase(home, { group: home.SEN, sessionIds: [TUE_THIS, THU_THIS] });
  assert.equal(out.status, 200);
  assert.deepEqual(recipients(out), ids(home, 'Stu'), 'our Stu is chased; our Sam, who answered, is not');
  assert.deepEqual(await stored(home, home.SEN, TUE_THIS), ids(home, 'Sam'), 'and the other club\'s answer never entered our record');
  // the pre-Build-104 request shape (an older cached client names no occurrences): still tenant-safe
  const legacy = await chase(home, { group: home.SEN });
  assert.deepEqual(recipients(legacy), ids(home, 'Stu'), 'the fallback window reads THIS club only, by id only');
});

test('SERVER identity. a display name is never an identity: two same-named players in ONE club are told apart', async () => {
  const c = await makeClub('Twins', { seniors: ['Alex Smith'] });
  // a second Alex Smith, different account
  const code = (await S.loadStoredTeams()).find(t => t.id === c.teamId).teamCode;
  const twin = await S.createJoinRequest({ teamCode: code, firstName: 'Alex', lastName: 'Smith', email: 'alex2.twins@ci.test', password: PW });
  await S.approveJoinRequest(twin.teamMember.id, c.club.user.id, c.teamId);
  const members = await S.loadTeamMembers();
  for (const m of members) if (m.teamId === c.teamId && m.userId === twin.user.id) m.playerGroupId = c.SEN;
  await S.saveTeamMembers(members);
  c.people.Alex2 = { ...twin, name: 'Alex Smith', gid: c.SEN, session: await S.createSession({ userId: twin.user.id, teamId: c.teamId, role: 'player' }) };
  await subscribe(c.people.Alex); await subscribe(c.people.Alex2);
  await answer(c.people.Alex, TUE_THIS, 'unavailable', 'work');
  const out = await chase(c, { group: c.SEN, sessionIds: [TUE_THIS] });
  assert.deepEqual(recipients(out), ids(c, 'Alex2'), 'only the Alex who has NOT answered is chased');
  const src2 = fs.readFileSync(path.join(ROOT, 'api/push.js'), 'utf8');
  const block = src2.slice(src2.indexOf("if (audience === 'no-reply') {"), src2.indexOf("if (audience === 'no-reply') {") + 1600);
  assert.doesNotMatch(block, /item\.label/, 'the chase filter reads no display name');
  assert.doesNotMatch(block, /recentResponders\(/, 'and no cross-club responder union');
});

// ── D / occurrence scope ───────────────────────────────────────────────────
test('SERVER D. last week\'s answers — given within the last seven days — do not excuse anyone from THIS week\'s occurrence', async () => {
  const c = await makeClub('Weeks', { seniors: ['Sam One', 'Sid Two', 'Sol Three', 'Stu Four'] });
  for (const p of Object.values(c.people)) await subscribe(p);
  for (const n of ['Sam', 'Sid', 'Sol']) await answer(c.people[n], TUE_LAST, 'available');   // stamped NOW: inside any 7-day window
  const out = await chase(c, { group: c.SEN, sessionIds: [TUE_THIS, THU_THIS] });
  assert.deepEqual(recipients(out), ids(c, 'Sam', 'Sid', 'Sol', 'Stu'), 'all four owe an answer for this week');
  assert.equal(out.body.total, 4);
  // …and answering ANY of this week's occurrences is answering (the unchanged rule)
  await answer(c.people.Sam, TUE_THIS, 'available'); await answer(c.people.Sid, THU_THIS, 'maybe');
  assert.deepEqual(recipients(await chase(c, { group: c.SEN, sessionIds: [TUE_THIS, THU_THIS] })), ids(c, 'Sol', 'Stu'));
  // one named occurrence (the per-session Remind contract): who has not answered THAT session
  assert.deepEqual(recipients(await chase(c, { group: c.SEN, sessionId: THU_THIS })), ids(c, 'Sam', 'Sol', 'Stu'), 'Sam answered Tuesday, not Thursday');
  // a stored record that is NOT an answer (a seeded or legacy 'no-reply' row) excuses nobody
  const record = await AV.loadGroupAvailability(c.teamId, c.SEN, THU_THIS);
  record['seed-' + c.people.Sol.user.id] = { response: 'no-reply', reason: '', respondedAt: new Date().toISOString(), label: 'Sol Three', userId: c.people.Sol.user.id, playerId: c.people.Sol.user.id };
  await AV.saveGroupAvailability(c.teamId, c.SEN, THU_THIS, record);
  assert.deepEqual(recipients(await chase(c, { group: c.SEN, sessionIds: [TUE_THIS, THU_THIS] })), ids(c, 'Sol', 'Stu'), 'a no-reply row is not a reply');
  delete record['seed-' + c.people.Sol.user.id];
  await AV.saveGroupAvailability(c.teamId, c.SEN, THU_THIS, record);
  // all replied → nobody
  await answer(c.people.Sol, TUE_THIS, 'unavailable', 'injury'); await answer(c.people.Stu, THU_THIS, 'available');
  const none = await chase(c, { group: c.SEN, sessionIds: [TUE_THIS, THU_THIS] });
  assert.deepEqual(recipients(none), [], 'everyone has answered something this week');
  assert.equal(none.body.total, 0); assert.equal(none.body.sent, 0);
});

test('SERVER group. another GROUP\'s answers under the same occurrence id excuse nobody here, and a forged group is refused', async () => {
  const c = await makeClub('Groups', { seniors: ['Sam One', 'Stu Four'], u18: ['Ugo Uno', 'Dua Dos'] });
  for (const p of Object.values(c.people)) await subscribe(p);
  await answer(c.people.Ugo, TUE_THIS, 'available');                 // stored in the U18 keyspace, same occurrence id
  const sen = await chase(c, { group: c.SEN, sessionIds: [TUE_THIS] });
  assert.deepEqual(recipients(sen), ids(c, 'Sam', 'Stu'), 'Seniors: both chased; no U18 player is reached');
  const u18 = await chase(c, { group: c.U18, sessionIds: [TUE_THIS] });
  assert.deepEqual(recipients(u18), ids(c, 'Dua'), 'U18: only the one who has not answered');
  // Dua answers as a U18 player, then moves up to the Seniors: the answer stays in U18's record, and is U18's.
  await answer(c.people.Dua, TUE_THIS, 'maybe');
  const members = await S.loadTeamMembers();
  for (const m of members) if (m.teamId === c.teamId && m.userId === c.people.Dua.user.id) m.playerGroupId = c.SEN;
  await S.saveTeamMembers(members);
  assert.deepEqual(await stored(c, c.SEN, TUE_THIS), [], 'the Seniors record holds no answer of his');
  assert.deepEqual(recipients(await chase(c, { group: c.SEN, sessionIds: [TUE_THIS] })), ids(c, 'Dua', 'Sam', 'Stu'),
    'so in the Seniors he still owes one — another group\'s record excuses nobody here');
  const other = await makeClub('Forger', { seniors: ['Fay Forge'] });
  const forged = await chase(other, { group: c.U18, sessionIds: [TUE_THIS] });
  assert.ok([403, 404].includes(forged.status), 'a coach cannot chase a group of another club: ' + forged.status);
});

// ── K. the server's answer ─────────────────────────────────────────────────
test('SERVER K. the response states what was actually sent — people reached, not an intention', async () => {
  const c = await makeClub('Counts', { seniors: ['Sam One', 'Sid Two', 'Sol Three', 'Stu Four'] });
  for (const n of ['Sam', 'Sid', 'Stu']) await subscribe(c.people[n]);         // Sol has notifications off
  await subscribe(c.people.Stu, '-tablet');                                       // Stu has two devices: still one person
  PUSH.delivered.length = 0;
  const out = await chase(c, { group: c.SEN, sessionIds: [TUE_THIS] });
  assert.equal(out.status, 200);
  assert.deepEqual([...new Set(recipients(out))], ids(c, 'Sam', 'Sid', 'Stu'), 'Sol has no device, so he is not among the targeted');
  assert.equal(out.body.reached, 3, 'three PEOPLE were reached');
  assert.equal(out.body.targeted, 3);
  assert.equal(out.body.total, 4, 'four devices');
  assert.equal(out.body.sent, out.body.total - out.body.failed);
  assert.equal(PUSH.delivered.length, out.body.sent, 'and that is exactly what was handed to the push service');
  // the push service refuses everything: zero is zero
  PUSH.failWith = 500;
  try {
    const zero = await chase(c, { group: c.SEN, sessionIds: [TUE_THIS] });
    assert.equal(zero.status, 200);
    assert.equal(zero.body.sent, 0); assert.equal(zero.body.reached, 0, 'nobody was reached');
    assert.equal(zero.body.targeted, 3, 'though three were targeted');
  } finally { PUSH.failWith = null; }
});

test('SERVER auth. the chase keeps its authentication and permission gates', async () => {
  const c = await makeClub('Gates', { seniors: ['Sam One', 'Stu Four'] });
  const anon = await run('push', 'POST', {}, { title: 't', body: 'b', type: 'availability', audience: 'no-reply', group: c.SEN, sessionIds: [TUE_THIS] }, null);
  assert.equal(anon.status, 401, 'no session');
  const player = await chase(c, { group: c.SEN, sessionIds: [TUE_THIS] }, ck(c.people.Sam.session));
  assert.equal(player.status, 403, 'a player cannot chase');
  // hostile occurrence ids are ignored, never evaluated
  const hostile = await chase(c, { group: c.SEN, sessionIds: ['../../etc', 'x'.repeat(200), { a: 1 }, TUE_THIS] });
  assert.equal(hostile.status, 200);
});

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT — the real functions, extracted
// ═══════════════════════════════════════════════════════════════════════════
const P = (id, extra = {}) => ({ id, userId: id, name: 'Player ' + id, ...extra });
const ANS = (sid, response = 'available') => ({ [sid]: { response, reason: '', respondedAt: new Date().toISOString() } });
/**
 * One coach device. `sync` = an availability read has landed; `schedule` = the
 * training schedule has loaded for the group in force (null = still loading).
 */
function coach({ players = [], resolved = {}, sync = true, readFailed = false, group = 'grp_sen', groups = ['grp_sen', 'grp_u18'],
                 schedule = { slots: [{ id: 'slot_tue', day: 'Tue', active: true }, { id: 'slot_thu', day: 'Thu', active: true }] }, scheduleGroup,
                 fixtures = [], requests = [], club = 'team_home', fetchReply = null } = {}) {
  if (!has('availabilityChaseContext')) assert.fail('availabilityChaseContext is not implemented');
  const body = `
    "use strict";
    const CFG = arguments[0];
    let _clubContextId = CFG.club;                       // the club the server has named this session
    let state = { operationalGroupId: CFG.group, players: CFG.players, fixtures: CFG.fixtures, schedule: [], messages: [],
                  availabilityRequests: CFG.requests, matchCentre: {}, trainingBlocks: {}, formationNames: {}, activeView: 'coach', activeCoachSection: 'overview' };
    let _resolvedAvailability = CFG.resolved, _resolvedAvailabilityGroup = CFG.group;
    let _availLastSync = CFG.sync ? new Date().toISOString() : null;
    let _availReadFailed = CFG.readFailed;
    let _trainingSchedule = CFG.schedule, _trainingScheduleGroupId = CFG.scheduleGroup === undefined ? CFG.group : CFG.scheduleGroup, _trainingScheduleAttempted = false;
    let _availTodayOverride = '';
    let _chatNavUnread = 0, _identityPendingRequests = [];
    let toasts = [], saves = [], posts = [];
    function showToast(t) { toasts.push(t); } function saveState(l) { saves.push({ label: l, log: JSON.parse(JSON.stringify(state.availabilityRequests)) }); } function render() {}
    function isCoach() { return true; }
    function operationalPlayers() { return state.players; }
    function operationalGroups() { return CFG.groups.map(id => ({ id })); }
    function trainingGroupParam() { return state.operationalGroupId && operationalGroups().length ? state.operationalGroupId : ''; }
    function ensureTrainingSchedule() {}
    function playerIsArchived(p) { return (p.lifecycleStatus || 'active') === 'archived'; }
    function contextFixtures() { return state.fixtures; } function normalizeFixture(f) { return f; }
    function availabilityPendingFor() { return null; }
    function getTonightSessionId() { return null; } function overviewAvailableCount() { return 0; } function getInjuredNoReturnDate() { return []; }
    function chatUnreadTotal() { return 0; } function matchCentrePhase() { return { msLeft: 0 }; }
    function overviewRoster() { return operationalPlayers().filter(p => p && p.id && !playerIsArchived(p)); }
    async function fetch(url, opts) { posts.push({ url, body: JSON.parse(opts.body) }); const r = CFG.fetchReply || { status: 200, body: { ok: true, sent: 0, failed: 0, total: 0 } }; return { ok: r.status < 400, status: r.status, json: async () => r.body }; }
    ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
    ${fn('availWeekStart')} ${fn('availAddDays')} ${fn('availToday')} ${fn('availSlotDateInWeek')} ${fn('availTrainingEventId')} ${fn('availabilityEventsForWeek')}
    ${fn('sessionKey')} ${fn('sessionReasonKey')} ${fn('normalizeSessionId')} ${fn('liveAvailabilityPlayerKeys')}
    ${fn('currentResolvedAvailability')} ${fn('availabilityLastReadFailed')} ${fn('availabilityReadUnknown')} ${fn('resolvedAnswerFor')} ${fn('sessionRows')}
    ${fn('_tlIdTs')}
    ${fn('availabilityNonResponders')} ${fn('availabilityWeekSessions')}
    ${fn('availabilityRequestMatches')} ${fn('availabilityRequestedSessions')} ${fn('availabilityChaseContext')}
    ${fn('availabilityLogRequest')}
    ${fn('getNeedsAttentionItems')} ${fn('chaseAllNonResponders')}
    return { state, context: availabilityChaseContext, nonResponders: availabilityNonResponders, weekSessions: availabilityWeekSessions,
             items: () => getNeedsAttentionItems().filter(i => /repl|vailab/i.test(i.text)), chase: chaseAllNonResponders, log: availabilityLogRequest,
             matches: availabilityRequestMatches, toasts: () => toasts, saves: () => saves, posts: () => posts };
  `;
  return new Function(body)({ players, resolved, sync, readFailed, group, groups, schedule, scheduleGroup, fixtures, requests, club, fetchReply });
}
const SQUAD = () => [P('a'), P('b'), P('c'), P('d')];
const REQ = (sessionId, extra = {}) => ({ id: 'req-' + Date.now(), sessionId, status: 'sent', groupId: 'grp_sen', clubId: 'team_home', sentWeek: WEEK, ...extra });
const texts = c => c.items().map(i => i.text);
// A group that enters its fixtures has no generic match card: its week is its two training occurrences.
const FIXTURED = [{ id: 'fx_next', opposition: 'Gamma', date: NEXT_MATCH }];

test('A. EMPTY WEEK: no occurrence, no claim — on any request log', () => {
  // a group with fixture records (so no generic match card), none this week, and no training slots
  const empty = { schedule: { slots: [] }, fixtures: [{ id: 'fx_last', opposition: 'Alpha', date: LAST_MATCH }, { id: 'fx_next', opposition: 'Gamma', date: NEXT_MATCH }] };
  const c = coach({ players: SQUAD(), ...empty, requests: [REQ('fx_last'), { id: 'r1', sessionId: 'tue', status: 'sent' }] });
  assert.deepEqual(c.weekSessions(), [], 'the app generates no occurrence for this week');
  assert.equal(c.context().status, 'empty');
  assert.deepEqual(c.nonResponders([]), [], 'NO occurrence means NOBODY is a non-responder (it used to mean everybody)');
  assert.deepEqual(texts(c), [], 'the Overview claims nothing: not "haven\'t replied", not "not requested"');
  const fresh = coach({ players: SQUAD(), ...empty, requests: [] });
  assert.deepEqual(texts(fresh), [], 'and a device that never sent a request is not told to ask about a week with nothing in it');
});

test('I. LOADING: while the schedule, the answers or the group are unresolved, nothing is claimed', () => {
  const requests = [REQ(TUE_THIS)];
  const schedLoading = coach({ players: SQUAD(), schedule: null, requests, fixtures: [{ id: 'fx_next', opposition: 'Gamma', date: NEXT_MATCH }] });
  assert.equal(schedLoading.context().status, 'loading'); assert.deepEqual(texts(schedLoading), [], 'schedule not loaded');
  const wrongGroupSchedule = coach({ players: SQUAD(), scheduleGroup: 'grp_u18', requests });
  assert.equal(wrongGroupSchedule.context().status, 'loading', 'a schedule loaded for ANOTHER group resolves nothing for this one');
  const answersLoading = coach({ players: SQUAD(), sync: false, requests });
  assert.equal(answersLoading.context().status, 'loading'); assert.deepEqual(texts(answersLoading), [], 'answers not read yet');
  const noGroup = coach({ players: SQUAD(), group: '', requests });
  assert.equal(noGroup.context().status, 'unresolved'); assert.deepEqual(texts(noGroup), [], 'multi-group club, no group chosen');
  // and the same device, once everything has landed, says what is true
  const ready = coach({ players: SQUAD(), requests });
  assert.equal(ready.context().status, 'ready'); assert.deepEqual(texts(ready), ["4 players haven't replied"]);
});

test('F. FAILED READ: fails closed — the established failure item, no count, no chase', () => {
  const c = coach({ players: SQUAD(), sync: false, readFailed: true, requests: [REQ(TUE_THIS)] });
  assert.equal(c.context().status, 'unknown');
  assert.deepEqual(texts(c), ['Availability could not be loaded']);
  assert.equal(c.items()[0].cta, 'Try again');
});

test('G. EMPTY CLUB: no players, no claim', () => {
  const c = coach({ players: [], requests: [REQ(TUE_THIS)] });
  assert.equal(c.context().status, 'ready'); assert.deepEqual(c.context().nonResponders, []);
  assert.deepEqual(texts(c), [], 'nobody to chase and nobody to ask');
});

test('B + H. THE SET: all replied, none replied, partial replies, several occurrences — players who have answered NONE of the week\'s occurrences', () => {
  const requests = [REQ(TUE_THIS)];
  const none = coach({ players: SQUAD(), requests, fixtures: FIXTURED });
  assert.deepEqual(none.context().nonResponders.map(p => p.id), ['a', 'b', 'c', 'd'], 'none replied');
  assert.deepEqual(texts(none), ["4 players haven't replied"]);
  const all = coach({ players: SQUAD(), requests, fixtures: FIXTURED, resolved: { a: ANS(TUE_THIS), b: ANS(THU_THIS, 'maybe'), c: ANS(TUE_THIS, 'unavailable'), d: ANS(THU_THIS) } });
  assert.deepEqual(all.context().nonResponders, [], 'all replied'); assert.deepEqual(texts(all), [], 'and nothing is raised');
  const partial = coach({ players: SQUAD(), requests, fixtures: FIXTURED, resolved: { a: { ...ANS(TUE_THIS), ...ANS(THU_THIS) }, b: ANS(TUE_THIS), c: ANS(THU_THIS, 'maybe') } });
  assert.deepEqual(partial.context().nonResponders.map(p => p.id), ['d'], 'answering any session is answering: only the silent player');
  assert.deepEqual(texts(partial), ["1 player hasn't replied"]);
  assert.equal(partial.context().sessions.length, 2, 'two occurrences this week');
  // an answer to ANOTHER week's occurrence is not an answer to this week
  const lastWeek = coach({ players: SQUAD(), requests, fixtures: FIXTURED, resolved: { a: ANS(TUE_LAST), b: ANS(TUE_LAST) } });
  assert.deepEqual(lastWeek.context().nonResponders.map(p => p.id), ['a', 'b', 'c', 'd'], 'last week excuses nobody');
  // the Overview's number IS the context's set
  assert.equal(partial.items()[0].detail, 'Player', 'one name previewed, the player who is silent');
});

test('C + D. THE GATE: only a request for one of THIS week\'s occurrences, in THIS group, raises the item', () => {
  const expectNotRequested = (requests, why) => assert.deepEqual(texts(coach({ players: SQUAD(), requests })), ['Availability not requested this week'], why);
  expectNotRequested([], 'no request at all');
  expectNotRequested([{ id: 'r1', sessionId: 'tue', status: 'sent' }], 'a bare legacy id names no occurrence of this week');
  expectNotRequested([REQ(TUE_LAST, { sentWeek: APP.availAddDays(WEEK, -7) })], 'last week\'s occurrence');
  expectNotRequested([REQ('fx_last')], 'last week\'s fixture');
  expectNotRequested([REQ(TUE_THIS, { groupId: 'grp_u18' })], 'ANOTHER group\'s request for the same occurrence id');
  expectNotRequested([REQ(TUE_THIS, { clubId: 'team_other' })], 'another club\'s');
  assert.deepEqual(texts(coach({ players: SQUAD(), club: '', requests: [REQ(TUE_THIS)] })), ['Availability not requested this week'],
    'and until the server has named the club in force, a club-stamped request is nobody\'s');
  expectNotRequested([REQ(TUE_THIS, { status: 'draft' })], 'not sent');
  expectNotRequested([{ id: 'req-' + Date.now(), sessionId: TUE_THIS, status: 'sent' }], 'an UNSTAMPED entry in a multi-group club cannot be attributed to a group');
  assert.deepEqual(texts(coach({ players: SQUAD(), requests: [REQ(TUE_THIS)] })), ["4 players haven't replied"], 'this week, this group, this occurrence');
  assert.deepEqual(texts(coach({ players: SQUAD(), requests: [REQ(TUE_THIS, { sentWeek: APP.availAddDays(WEEK, -7) })] })), ["4 players haven't replied"],
    'a request sent LAST week about THIS week\'s dated occurrence is a request for this week');
  // an unstamped entry is attributable where there is only one group — or where the id is a fixture's own
  assert.deepEqual(texts(coach({ players: SQUAD(), groups: ['grp_sen'], requests: [{ id: 'req-' + Date.now(), sessionId: TUE_THIS, status: 'sent' }] })), ["4 players haven't replied"]);
  const fx = [{ id: 'fx_now', opposition: 'Delta', date: MATCH_DAY }];
  assert.deepEqual(texts(coach({ players: SQUAD(), fixtures: fx, requests: [{ id: 'req-' + Date.now(), sessionId: 'fx_now', status: 'sent' }] })), ["4 players haven't replied"]);
  // the undated generic match card belongs to the week the request was SENT in
  const generic = { schedule: { slots: [] }, fixtures: [] };
  assert.deepEqual(texts(coach({ players: SQUAD(), ...generic, requests: [REQ('game')] })), ["4 players haven't replied"]);
  assert.deepEqual(texts(coach({ players: SQUAD(), ...generic, requests: [REQ('game', { sentWeek: APP.availAddDays(WEEK, -7) })] })), ['Availability not requested this week'], 'last week\'s generic request');
  assert.deepEqual(texts(coach({ players: SQUAD(), ...generic, requests: [{ id: 'req-' + (Date.now() - 8 * 86400000), sessionId: 'game', status: 'sent', groupId: 'grp_sen' }] })), ['Availability not requested this week'],
    'with no stamp, the week comes from the id\'s own timestamp');
});

test('K. CHASE ALL reports what the SERVER sent — and sends the occurrence ids of the set it counted', async () => {
  const requests = [REQ(TUE_THIS)];
  const resolved = { a: ANS(TUE_THIS) };
  const go = async reply => { const c = coach({ players: SQUAD(), requests, resolved, fixtures: FIXTURED, fetchReply: reply }); await c.chase(); return c; };
  const full = await go({ status: 200, body: { ok: true, sent: 3, failed: 0, total: 3, reached: 3, targeted: 3 } });
  assert.deepEqual(full.toasts(), ['Reminder sent to 3 players ✓']);
  assert.deepEqual(full.posts()[0].body.sessionIds, [TUE_THIS, THU_THIS], 'the occurrences the count was made over');
  assert.equal(full.posts()[0].body.audience, 'no-reply'); assert.equal(full.posts()[0].body.group, 'grp_sen');
  assert.equal(full.posts()[0].body.targetUserId, undefined, 'the group chase names nobody: the server decides, from fresh answers');
  const partial = await go({ status: 200, body: { ok: true, sent: 1, failed: 1, total: 2, reached: 1, targeted: 2 } });
  assert.deepEqual(partial.toasts(), ['Reminder sent to 1 of 3 players — 2 could not be reached'], 'never the intended three');
  const zero = await go({ status: 200, body: { ok: true, sent: 0, failed: 0, total: 0, reached: 0, targeted: 0, note: 'No subscribers yet' } });
  assert.deepEqual(zero.toasts(), ['No reminders delivered — players may not have notifications enabled'], 'zero sent is reported as zero');
  assert.equal(zero.toasts().some(t => /✓/.test(t)), false);
  // two devices for one player are one player reached
  const devices = await go({ status: 200, body: { ok: true, sent: 4, failed: 0, total: 4, reached: 3, targeted: 3 } });
  assert.deepEqual(devices.toasts(), ['Reminder sent to 3 players ✓'], 'people, not devices');
  // an older server (no `reached`): distinct fulfilled people from its results, else its sent count
  const older = await go({ status: 200, body: { ok: true, sent: 2, failed: 1, total: 3, results: [{ userId: 'b', status: 'fulfilled' }, { userId: 'b', status: 'fulfilled' }, { userId: 'c', status: 'rejected' }] } });
  assert.deepEqual(older.toasts(), ['Reminder sent to 1 of 3 players — 2 could not be reached']);
  const refused = await go({ status: 403, body: { ok: false, error: 'You do not operate that group' } });
  assert.deepEqual(refused.toasts(), ['Chase failed: You do not operate that group']);
});

test('A + I. CHASE ALL fails closed without an occurrence: nothing is sent and the coach is told why', async () => {
  const empty = coach({ players: SQUAD(), schedule: { slots: [] }, fixtures: [{ id: 'fx_next', opposition: 'Gamma', date: NEXT_MATCH }], requests: [REQ('fx_next')] });
  await empty.chase();
  assert.equal(empty.posts().length, 0); assert.deepEqual(empty.toasts(), ['Nothing is scheduled this week — there is nobody to chase']);
  const loading = coach({ players: SQUAD(), schedule: null, requests: [REQ(TUE_THIS)] });
  await loading.chase();
  assert.equal(loading.posts().length, 0); assert.deepEqual(loading.toasts(), ['Availability is still loading — try again in a moment']);
  const failed = coach({ players: SQUAD(), sync: false, readFailed: true });
  await failed.chase();
  assert.equal(failed.posts().length, 0); assert.match(failed.toasts()[0], /Availability could not be loaded/);
  const everyone = coach({ players: [P('a')], requests: [REQ(TUE_THIS)], resolved: { a: ANS(TUE_THIS) } });
  await everyone.chase();
  assert.equal(everyone.posts().length, 0); assert.deepEqual(everyone.toasts(), ['Everyone has replied ✓']);
});

test('L. THE REQUEST LOG is written through by the act of logging — stamped with its club, group and week', () => {
  const c = coach({ players: SQUAD() });
  const entry = c.log({ id: TUE_THIS, title: 'Training' }, ['m1']);
  assert.equal(c.saves().length, 1, 'saved at once, by the log itself');
  assert.equal(c.saves()[0].log[0].sessionId, TUE_THIS, 'and what was saved holds the entry');
  assert.deepEqual([entry.status, entry.groupId, entry.clubId, entry.sentWeek, entry.sessionId], ['sent', 'grp_sen', 'team_home', WEEK, TUE_THIS]);
  assert.match(entry.id, /^req-.*\d{13}$/, 'the id still carries its creation time');
  assert.deepEqual(entry.messageIds, ['m1']);
  assert.deepEqual(texts(c), ["4 players haven't replied"], 'and it satisfies the gate it was written for');
  for (const sender of ['sendAvailabilityRequest', 'sendAllAvailabilityRequests']) {
    const body = stripComments(fn(sender));
    assert.match(body, /availabilityLogRequest\(/, `${sender} logs through the one helper`);
    assert.doesNotMatch(body, /state\.availabilityRequests\.unshift\(/, `${sender} keeps no unsaved log of its own`);
    assert.ok(body.indexOf('availabilityLogRequest(') < body.indexOf("fetch('/api/chat'") || !/fetch\('\/api\/chat'/.test(body), `${sender} logs BEFORE anything is awaited`);
  }
});

test('H. THE BOARD counts the same set, and offers Chase all only where that set is what the button sends', () => {
  const board = fn('renderMessageCenterV2');
  assert.match(board, /availabilityChaseContext\(weekStart\)/, 'the board asks the same question, about the week it is showing');
  assert.match(board, /const weekReady = !!\(weekChase && weekChase\.status === 'ready'\);/, 'and shows the strip only when that answer is "ready"');
  assert.match(board, /const chaseAny\s*=\s*weekReady \? weekChase\.nonResponders\.length : 0;/, '"N to chase" is the canonical set');
  assert.doesNotMatch(board, /const chaseAny\s*=\s*opPlayers\.filter/, 'and no second opinion is kept');
  const strip = board.slice(board.indexOf('${opPlayers.length > 0 && !availUnknown ? `'), board.indexOf('${opPlayers.length > 0 && !availUnknown ? `') + 2200);
  assert.match(strip, /\$\{weekReady \? `/, 'no occurrence, no strip: an empty week no longer reads "All replied"');
  assert.match(strip, /chaseAny > 0 && isNowWeek \? `<button type="button" onclick="chaseAllNonResponders\(\)"/,
    'Chase all acts on the CURRENT week, so it is offered only where the count beside it is that week\'s');
  assert.match(strip, /repliedAll === opPlayers\.length \? `<span class="msg-chip available">All replied<\/span>`/, '"All replied" means all replied');
  const refresh = fn('refreshLiveAvailability');
  assert.match(refresh, /renderCoachOverview\(\)/, 'the Overview repaints when the first read for a group lands, so a withheld item appears without a tap');
});

// ═══════════════════════════════════════════════════════════════════════════
// BROWSER — the real client in Chromium against the real handlers
// ═══════════════════════════════════════════════════════════════════════════
let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* not installed: the browser tests skip */ }
const REWRITES = { roster: { handler: 'publish', query: { resource: 'roster' } } };
const NET = { rules: [], push: [], answers: 0 };
const mime = f => f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream';
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    let name = url.pathname.slice(5).split('/')[0];
    const query = Object.fromEntries(url.searchParams);
    if (REWRITES[name]) { Object.assign(query, REWRITES[name].query); name = REWRITES[name].handler; }
    let raw = ''; for await (const c of req) raw += c;
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    for (const rule of NET.rules) {
      if (rule.times <= 0 || (rule.method && rule.method !== req.method) || (rule.path && !url.pathname.includes(rule.path)) || (rule.query && !url.search.includes(rule.query))) continue;
      rule.times--;
      if (rule.hold) await rule.hold;
      if (rule.fail) { res.statusCode = rule.fail; res.setHeader('content-type', 'application/json'); return res.end('{"ok":false,"error":"injected"}'); }
    }
    if (!handlers[name]) { res.setHeader('content-type', 'application/json'); return res.end('{"ok":true}'); }
    try {
      const out = await run(name, req.method, query, body, req.headers.cookie, res);
      if (name === 'push' && req.method === 'POST') NET.push.push({ request: body, status: out.status, response: out.body });
      if (name === 'availability' && req.method === 'POST' && !body.action) NET.answers++;
    } catch { res.statusCode = 500; res.end('{}'); }
    return;
  }
  const f = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  try { res.setHeader('content-type', mime(f)); res.end(fs.readFileSync(f)); } catch { res.statusCode = 404; res.end(); }
});
const waitFor = async (fnc, ms, every = 60) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await fnc(); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await new Promise(r => setTimeout(r, every)); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const INIT = ms => {
  if (ms) { const R = Date; class Sh extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + ms); } static now() { return R.now() + ms; } } window.Date = Sh; }
  try { sessionStorage.setItem('ce-setup-skipped', '1'); } catch {}
  window.__toasts = [];
  const hook = () => { const el = document.getElementById('toast'); if (!el) return setTimeout(hook, 20);
    new MutationObserver(() => { const t = el.textContent.trim(); if (t) window.__toasts.push(t); }).observe(el, { childList: true, characterData: true, subtree: true }); };
  document.addEventListener('DOMContentLoaded', hook);
};

test('browser: Overview and Chase all — empty week, previous-week data, the scoped gate, mixed answers, honest counts, cross-club, clear week, failed and unresolved reads, reload', { timeout: 300000 }, async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  const ctxs = [], errors = [], consoleErrors = [];
  const device = async ({ storageState, shiftMs = 0 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', ...(storageState ? { storageState } : {}) }); ctxs.push(ctx);
    await ctx.addInitScript(INIT, shiftMs);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept().catch(() => {}));
    // The browser's own report of an HTTP failure this test injected on purpose (the 500s of journey 5) is not an application error.
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
    return { ctx, page };
  };
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${server.address().port}`;
    const login = async (page, email) => {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#ce-welcome', { timeout: 20000 });
      await page.click('#ce-welcome button:has-text("Log in")');
      await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
      await page.fill('#identityLoginEmail', email); await page.fill('#identityLoginPassword', PW); await page.click('#identityLoginBtn');
      await page.waitForFunction(() => typeof state !== 'undefined' && !!state.stateTeamId && !!state.currentUserId && !sessionSignedOut(), null, { timeout: 20000 });
    };
    const reopen = async page => {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof state !== 'undefined' && !!state.stateTeamId && !!state.currentUserId && !sessionSignedOut(), null, { timeout: 20000 });
    };
    /** Operate a group on the Overview and let its fixtures, schedule and answers land. Nothing is repainted by hand. */
    const operate = async (page, gid) => {
      await page.evaluate(g => { setOperationalGroup(g); setSection('coach', 'overview'); }, gid);
      await page.waitForFunction(g => state.operationalGroupId === g && state.activeCoachSection === 'overview', gid, { timeout: 20000 });
      await page.evaluate(() => loadFixturesFromServer(true).then(() => render()).catch(() => {}));
      assert.ok(await waitFor(() => page.evaluate(g => _trainingScheduleGroupId === g && !!_trainingSchedule && currentResolvedAvailability() !== null, gid), 20000), 'schedule and answers landed for ' + gid);
      await sleep(300);
    };
    const refresh = async page => { await page.evaluate(() => refreshLiveAvailability({ boardOnly: true }).then(() => render())); await sleep(250); };
    const overview = page => page.evaluate(() => {
      const ov = document.getElementById('coach-overview'); const vis = el => !!el && el.offsetParent !== null;
      const leaves = [...ov.querySelectorAll('*')].filter(e => e.children.length === 0 && vis(e)).map(e => (e.innerText || '').trim().replace(/\s+/g, ' ')).filter(Boolean);
      return { claims: leaves.filter(x => /haven't replied|hasn't replied|^Chase all$|not requested this week|could not be loaded/i.test(x)),
               chase: [...ov.querySelectorAll('[onclick*="chaseAllNonResponders"]')].filter(vis).length,
               week: availabilityWeekSessions().map(e => e.id), log: (state.availabilityRequests || []).map(r => r.sessionId) };
    });
    const board = async page => {
      await page.evaluate(() => setSection('coach', 'message')); await sleep(400);
      const out = await page.evaluate(() => { const root = document.getElementById('coach-message'); const vis = el => !!el && el.offsetParent !== null;
        const text = (root.innerText || '').replace(/\s+/g, ' ');
        return { repliedAll: (text.match(/\d+ \/ \d+ replied to all sessions/) || [null])[0], toChase: (text.match(/\d+ to chase/) || [null])[0], allReplied: /All replied/.test(text),
                 nothing: /Nothing scheduled this week/.test(text), chase: [...root.querySelectorAll('[onclick*="chaseAllNonResponders"]')].filter(vis).length,
                 cards: root.querySelectorAll('.msg-session-card').length }; });
      await page.evaluate(() => setSection('coach', 'overview')); await sleep(250);
      return out;
    };
    const toasts = page => page.evaluate(() => (window.__toasts || []).slice());
    const pressChase = async (page, where = '#coach-overview') => {
      await page.evaluate(() => { window.__toasts = []; }); const before = NET.push.length;
      const clicked = await page.evaluate(sel => { const b = [...document.querySelectorAll(sel + ' [onclick*="chaseAllNonResponders"]')].find(x => x.offsetParent !== null); if (b) b.click(); return !!b; }, where);
      await sleep(1200);
      const calls = NET.push.slice(before).filter(p => p.request.audience === 'no-reply');
      return { clicked, toasts: await toasts(page), calls, recipients: calls.flatMap(c => (c.response?.results || []).map(r => r.userId)).sort() };
    };
    const sendRequest = async (page, sessionId) => {
      await page.evaluate(() => setSection('coach', 'message'));
      await page.waitForFunction(id => coachAvailEvents().some(e => e.id === id), sessionId, { timeout: 20000 });
      await page.evaluate(id => { sendAvailabilityRequest(id); }, sessionId);
      await page.waitForSelector('#ce-modal-ok', { state: 'attached', timeout: 10000 });
      await page.evaluate(() => document.getElementById('ce-modal-ok').click());
      assert.ok(await waitFor(() => page.evaluate(id => (state.availabilityRequests || []).some(r => r.sessionId === id && r.status === 'sent'), sessionId), 10000), 'request logged in memory');
    };

    // ── the club ──
    const c = await makeClub('Browser', { seniors: ['Sam One', 'Sid Two', 'Sol Three', 'Stu Four'], u18: ['Ugo Uno', 'Dua Dos', 'Tre Tres'] });
    const elsewhere = await makeClub('Elsewhere', { seniors: ['Stu Four'] });
    for (const n of ['Sam', 'Sid', 'Stu', 'Ugo', 'Dua', 'Tre']) await subscribe(c.people[n]);      // Sol has notifications off
    const COACH = 'coach.browser@ci.test';

    // LAST WEEK, on the coach's own device: fixtures are entered and last Sunday's matches are asked about.
    let A = await device({ shiftMs: -7 * 86400000 });
    await login(A.page, COACH);
    const made = await A.page.evaluate(async ({ SEN, U18, LAST_MATCH, MATCH_DAY, NEXT_MATCH }) => {
      const j = async (u, b) => (await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).status;
      const fx = (groupId, opposition, date) => j('/api/publish?resource=fixtures', { action: 'create', groupId, fixture: { opposition, date, time: '14:00', homeAway: 'home' } });
      return [await j('/api/roster', { players: [] }), await fx(U18, 'Alpha', LAST_MATCH), await fx(U18, 'Gamma', NEXT_MATCH), await fx(SEN, 'Beta', LAST_MATCH), await fx(SEN, 'Delta', MATCH_DAY)];
    }, { SEN: c.SEN, U18: c.U18, LAST_MATCH, MATCH_DAY, NEXT_MATCH });
    assert.deepEqual(made, [200, 201, 201, 201, 201], 'roster projected, four fixtures created');
    await A.page.evaluate(() => loadFixturesFromServer(true));
    const FX = Object.fromEntries((await A.page.evaluate(() => (state.fixtures || []).map(f => [f.opposition, f.id]))));
    await A.page.evaluate(g => { setOperationalGroup(g); }, c.U18); await sendRequest(A.page, FX.Alpha);
    await A.page.evaluate(g => { setOperationalGroup(g); }, c.SEN); await sendRequest(A.page, FX.Beta);
    await A.page.evaluate(() => saveState('setup'));                       // setup only: last week's log must exist whatever the build
    await sleep(300);
    const lastWeek = await A.ctx.storageState();
    await A.ctx.close();
    // last week's matches were answered — recently, so inside any seven-day window
    for (const n of ['Sam', 'Sid', 'Sol']) await answer(c.people[n], FX.Beta, 'available');
    for (const n of ['Ugo', 'Dua']) await answer(c.people[n], FX.Alpha, 'available');

    // ── THIS WEEK ──
    A = await device({ storageState: lastWeek });
    await reopen(A.page);

    // 1 + 4. EMPTY CURRENT WEEK, previous-week data only (A, C)
    await operate(A.page, c.U18);
    let ov = await overview(A.page);
    assert.deepEqual(ov.week, [], 'U18 has nothing this week');
    assert.ok(ov.log.includes(FX.Alpha), 'and last week\'s request is still in the log');
    assert.deepEqual(ov.claims, [], 'JOURNEY 1/4: the Overview makes no availability claim in an empty week: ' + JSON.stringify(ov.claims));
    assert.equal(ov.chase, 0, 'and offers no Chase all');
    let bd = await board(A.page);
    assert.deepEqual([bd.repliedAll, bd.toChase, bd.allReplied, bd.chase, bd.nothing], [null, null, false, 0, true], 'the board agrees: nothing scheduled, nothing claimed: ' + JSON.stringify(bd));

    // D. a different group, sessions this week, only LAST week's requests on the device
    await operate(A.page, c.SEN);
    ov = await overview(A.page);
    assert.ok(ov.week.length >= 2 && ov.week.includes(FX.Delta), 'Seniors have training and a match this week');
    assert.deepEqual(ov.claims, ['Availability not requested this week'], 'JOURNEY 4: last week\'s requests raise no claim about this week: ' + JSON.stringify(ov.claims));
    assert.equal(ov.chase, 0);

    // 9. RELOAD AFTER SENDING A REQUEST (L)
    await sendRequest(A.page, FX.Delta);
    await A.page.waitForFunction(() => (window.__toasts || []).some(x => /request sent to/.test(x)), null, { timeout: 15000 });
    await A.page.reload({ waitUntil: 'domcontentloaded' });
    await A.page.waitForFunction(() => typeof state !== 'undefined' && !!state.currentUserId && !sessionSignedOut(), null, { timeout: 20000 });
    assert.ok(await A.page.evaluate(id => (state.availabilityRequests || []).some(r => r.sessionId === id && r.status === 'sent'), FX.Delta), 'JOURNEY 9: the request log survived the reload');
    await A.page.evaluate(g => { setOperationalGroup(g); setSection('coach', 'overview'); }, c.SEN);
    // nothing is repainted by hand: the item must appear by itself once the schedule and the answers land
    assert.ok(await waitFor(async () => (await overview(A.page)).claims.includes("4 players haven't replied"), 20000), 'and the item it gates appears unprompted: ' + JSON.stringify((await overview(A.page)).claims));

    // 2. ONE REQUESTED OCCURRENCE, nobody has answered this week (B)
    ov = await overview(A.page);
    assert.deepEqual(ov.claims, ["4 players haven't replied", 'Chase all'], 'JOURNEY 2');
    bd = await board(A.page);
    assert.equal(bd.toChase, '4 to chase', 'the board counts the same four: ' + JSON.stringify(bd)); assert.equal(bd.chase, 1);

    // 7. CHASE ALL, honestly (K) — three answered LAST week within seven days; one of the four has no device
    let press = await pressChase(A.page);
    assert.deepEqual(press.recipients, ids(c, 'Sam', 'Sid', 'Stu'), 'JOURNEY 7: everyone who owes an answer and can be reached — last week excuses nobody');
    assert.deepEqual(press.toasts, ['Reminder sent to 3 of 4 players — 1 could not be reached'], 'and the toast is the server\'s result');
    assert.deepEqual(press.calls[0].request.sessionIds, ov.week, 'the chase names the occurrences the count was made over');

    // 8. CROSS-CLUB SAME-NAME (J)
    await answer(elsewhere.people.Stu, TUE_THIS, 'available');
    press = await pressChase(A.page);
    assert.ok(press.recipients.includes(c.people.Stu.user.id), 'JOURNEY 8: our Stu Four is still reminded after his namesake answered elsewhere');
    assert.deepEqual(press.recipients, ids(c, 'Sam', 'Sid', 'Stu'));

    // 3. MIXED RESPONSES (H)
    const tue = ov.week.find(id => /^slot_tue-/.test(id)), thu = ov.week.find(id => /^slot_thu-/.test(id));
    await answer(c.people.Sam, tue, 'available'); await answer(c.people.Sam, FX.Delta, 'available');
    await answer(c.people.Sid, thu, 'unavailable', 'work');
    await answer(c.people.Sol, FX.Delta, 'maybe');
    await refresh(A.page);
    ov = await overview(A.page);
    assert.deepEqual(ov.claims, ["1 player hasn't replied", 'Chase all'], 'JOURNEY 3: only the player who has answered nothing: ' + JSON.stringify(ov.claims));
    bd = await board(A.page);
    assert.equal(bd.toChase, '1 to chase', 'the Availability board agrees: ' + JSON.stringify(bd));
    assert.equal(bd.allReplied, false);
    press = await pressChase(A.page);
    assert.deepEqual(press.recipients, ids(c, 'Stu'), 'Chase all reaches exactly that set');
    assert.deepEqual(press.toasts, ['Reminder sent to 1 player ✓']);
    await A.page.evaluate(() => setSection('coach', 'message')); await sleep(400);
    press = await pressChase(A.page, '#coach-message');
    assert.deepEqual(press.recipients, ids(c, 'Stu'), 'and so does the board\'s own button');
    await A.page.evaluate(() => setSection('coach', 'overview')); await sleep(250);
    // the push service delivers nothing: zero is reported as zero
    PUSH.failWith = 500;
    try {
      press = await pressChase(A.page);
      assert.deepEqual(press.toasts, ['No reminders delivered — players may not have notifications enabled'], 'zero sent is zero');
    } finally { PUSH.failWith = null; }

    // 6. CLEAR WEEK (E) — training answers are cleared; the match's stand
    await A.page.evaluate(() => setSection('coach', 'message')); await sleep(300);
    const answersBefore = NET.answers;
    await A.page.evaluate(() => { clearWeekAvailability(); });
    await A.page.waitForSelector('#ce-modal-ok', { state: 'attached', timeout: 10000 });
    await A.page.evaluate(() => document.getElementById('ce-modal-ok').click());
    assert.ok(await waitFor(async () => (await stored(c, c.SEN, tue)).length === 0 && (await stored(c, c.SEN, thu)).length === 0, 10000), 'training answers cleared on the server');
    await A.page.reload({ waitUntil: 'domcontentloaded' });
    await A.page.waitForFunction(() => typeof state !== 'undefined' && !!state.currentUserId && !sessionSignedOut(), null, { timeout: 20000 });
    await operate(A.page, c.SEN);
    ov = await overview(A.page);
    assert.deepEqual(await stored(c, c.SEN, tue), [], 'JOURNEY 6: nothing was resurrected by reopening');
    assert.deepEqual(await stored(c, c.SEN, thu), []);
    assert.equal(NET.answers, answersBefore, 'and no answer was re-sent');
    assert.deepEqual(await stored(c, c.SEN, FX.Delta), ids(c, 'Sam', 'Sol'), 'the match\'s answers stand, as clear_week has always left them');
    assert.deepEqual(ov.claims, ["2 players haven't replied", 'Chase all'], 'the prompt is accurate: Sid\'s only answer was cleared, Stu never answered: ' + JSON.stringify(ov.claims));

    // 5. FAILED READ (F) and UNRESOLVED SCHEDULE (I)
    const thisWeek = await A.ctx.storageState();
    NET.rules.push({ method: 'GET', path: '/api/availability', query: 'resolveRoster', fail: 500, times: Infinity });
    const F = await device({ storageState: thisWeek });
    await reopen(F.page);
    await F.page.evaluate(g => { setOperationalGroup(g); setSection('coach', 'overview'); }, c.SEN);
    assert.ok(await waitFor(() => F.page.evaluate(() => availabilityReadUnknown()), 20000), 'the read failed with nothing known');
    await sleep(400);
    ov = await overview(F.page);
    assert.deepEqual(ov.claims, ['Availability could not be loaded'], 'JOURNEY 5: fails closed: ' + JSON.stringify(ov.claims));
    assert.equal(ov.chase, 0);
    NET.rules.length = 0;
    await F.ctx.close();
    let release; const hold = new Promise(r => { release = r; });
    NET.rules.push({ method: 'GET', path: '/api/publish', query: 'resource=training-schedule', hold, times: Infinity });
    const L = await device({ storageState: thisWeek });
    await reopen(L.page);
    await L.page.evaluate(g => { setOperationalGroup(g); setSection('coach', 'overview'); }, c.SEN);
    assert.ok(await waitFor(() => L.page.evaluate(g => state.operationalGroupId === g && currentResolvedAvailability() !== null && overviewRoster().length === 4, c.SEN), 20000), 'answers landed; the schedule has not');
    await sleep(600); await L.page.evaluate(() => render()); await sleep(200);
    ov = await overview(L.page);
    assert.deepEqual(ov.claims.filter(x => /replied|Chase all|not requested/.test(x)), [], 'JOURNEY 5 (loading): nothing is claimed while the schedule is unresolved: ' + JSON.stringify(ov.claims));
    assert.equal(ov.chase, 0);
    release(); NET.rules.length = 0;
    assert.ok(await waitFor(async () => (await overview(L.page)).claims.includes("2 players haven't replied"), 20000), 'and the true figure appears by itself once it lands: ' + JSON.stringify((await overview(L.page)).claims));
    await L.ctx.close();
    // …and the other way round: everything else has landed and painted, the ANSWERS land last
    let releaseAnswers; const holdAnswers = new Promise(r => { releaseAnswers = r; });
    NET.rules.push({ method: 'GET', path: '/api/availability', query: 'resolveRoster', hold: holdAnswers, times: Infinity });
    const W = await device({ storageState: thisWeek });
    await reopen(W.page);
    await W.page.evaluate(g => { setOperationalGroup(g); setSection('coach', 'overview'); }, c.SEN);
    assert.ok(await waitFor(() => W.page.evaluate(g => state.operationalGroupId === g && _trainingScheduleGroupId === g && !!_trainingSchedule && overviewRoster().length === 4 && currentResolvedAvailability() === null, c.SEN), 20000), 'the schedule landed; the answers have not');
    await sleep(1500);                                                   // every other load has settled and painted
    ov = await overview(W.page);
    assert.deepEqual(ov.claims.filter(x => /replied|Chase all|not requested/.test(x)), [], 'JOURNEY 5 (answers in flight): nothing is claimed: ' + JSON.stringify(ov.claims));
    releaseAnswers(); NET.rules.length = 0;
    assert.ok(await waitFor(async () => (await overview(W.page)).claims.includes("2 players haven't replied"), 8000), 'and their arrival alone puts the item on screen: ' + JSON.stringify((await overview(W.page)).claims));
    await W.ctx.close();

    // G. EMPTY CLUB
    const hollow = await S.createClub({ clubName: 'Hollow RFC', teamName: 'First XV', sport: 'Rugby', name: 'Eve Empty', email: 'empty@ci.test', password: PW, idempotencyKey: kkey() });
    assert.ok(hollow.team.id);
    const E = await device();
    await login(E.page, 'empty@ci.test');
    await E.page.evaluate(() => setSection('coach', 'overview')); await sleep(1500); await E.page.evaluate(() => render()); await sleep(200);
    ov = await overview(E.page);
    assert.deepEqual(ov.claims.filter(x => /replied|Chase all|not requested/.test(x)), [], 'an empty club is told nothing about replies: ' + JSON.stringify(ov.claims));
    assert.equal(ov.chase, 0);

    assert.deepEqual(errors, [], 'no page errors');
    assert.deepEqual(consoleErrors, [], 'no console errors');
  } finally {
    for (const ctx of ctxs) { try { await ctx.close(); } catch {} }
    await browser.close(); await new Promise(r => server.close(r));
  }
});
