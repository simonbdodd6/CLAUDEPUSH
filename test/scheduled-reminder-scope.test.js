/**
 * SCHEDULED AVAILABILITY REMINDER SCOPE (Build 105).
 *
 * Build 104 scoped the coach's own chase (api/push.js). The two SCHEDULED
 * no-reply paths in api/cron.js still asked the old question:
 *
 *   · the weekly reminder  (/api/cron?job=reminder, a Vercel cron)
 *   · a saved schedule whose audience is 'no-reply'
 *
 * Both dropped a recipient when their DISPLAY NAME appeared in
 * recentResponders(7) — a seven-day union of every answer in EVERY club. So a
 * "John Smith" answering in another club silenced this club's John Smith, two
 * John Smiths in one club were one person, and an answer given last week
 * excused a player from this week.
 *
 * THE QUESTION NOW, for every scheduled no-reply reminder:
 *
 *   which players in THIS club, in THIS group, have not answered THIS week's
 *   occurrences for that group — by player id.
 *
 * The occurrences come from a server-side generator that is held to the
 * client's own (availabilityEventsForWeek) by a parity test below; who has
 * answered comes from the same respondersByIdentity Build 104 introduced.
 * When the group or its occurrences cannot be established — no group, nothing
 * scheduled, a failed read — nobody is reminded: FAIL CLOSED.
 *
 * Also here: the Overview's "Request availability" action now records what it
 * sent through availabilityLogRequest, once the server has confirmed it.
 *
 * SERVER tests drive the REAL cron, schedules, publish, availability and push
 * handlers over an in-memory KV; the only double is the external push service.
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
const cronSrc = fs.readFileSync(path.join(ROOT, 'api/cron.js'), 'utf8');
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
const stripComments = s => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

// ── The application's own week: nothing here restates week arithmetic ──
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
const LAST_MATCH = APP.availAddDays(WEEK, -1);
const NEXT_MATCH = APP.availAddDays(MATCH_DAY, 6);
const dated = (slot, offset, week = WEEK) => slot + '-' + APP.availAddDays(week, offset).replace(/-/g, '');
const TUE_THIS = dated('slot_tue', 1), THU_THIS = dated('slot_thu', 3), TUE_LAST = dated('slot_tue', 1, APP.availAddDays(WEEK, -7));

// ═══════════════════════════════════════════════════════════════════════════
// REAL HANDLERS
// ═══════════════════════════════════════════════════════════════════════════
process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.reminder-scope.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.PUBLIC_CLUB_SIGNUP       = 'true';
process.env.CRON_SECRET              = 'cron-secret-105';
process.env.LOCAL_TIMEZONE           = 'UTC';   // Build 134: the zone replaces the retired fixed LOCAL_TZ_OFFSET (was '0')
delete process.env.VERCEL; delete process.env.NODE_ENV; delete process.env.DEV_LOGIN;

const kv = new Map(), lists = new Map();
const KV = { failFor: null };            // a substring: every command naming a key that contains it fails
globalThis.fetch = async (_url, options = {}) => {
  const [cmd, ...a] = JSON.parse(options.body || '[]');
  if (KV.failFor && a.some(x => typeof x === 'string' && x.includes(KV.failFor))) return { ok: false, status: 500, json: async () => ({}) };
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

// The ONE double: the external push service.
const webpush = (await import('web-push')).default;
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey; process.env.VAPID_PRIVATE_KEY = vapid.privateKey; process.env.VAPID_SUBJECT = 'mailto:reminders@scope.test';
const PUSH = { delivered: [], owner: new Map() };
webpush.sendNotification = async (subscription, payload) => {
  PUSH.delivered.push({ endpoint: subscription.endpoint, userId: PUSH.owner.get(subscription.endpoint), payload: JSON.parse(payload) });
  return { statusCode: 201 };
};

const S  = await import('../api/_identityStore.js');
const ST = await import('../api/_structureStore.js');
const AV = await import('../api/_availabilityStore.js');
const handlers = {};
for (const name of ['identity', 'invite', 'config', 'publish', 'availability', 'chat', 'push', 'schedules', 'templates', 'subscribe', 'cron']) handlers[name] = (await import(`../api/${name}.js`)).default;
const { SESSION_COOKIE } = S;
const PW = 'password123';
let kseq = 0; const kkey = () => String(kseq++).padStart(2, '0').repeat(10);
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;

async function run(name, method, query, body, cookie, res, extraHeaders) {
  const vreq = { method, headers: { ...(cookie ? { cookie } : {}), host: 'test.local', 'x-forwarded-proto': 'http', ...(extraHeaders || {}) }, query: query || {}, body: body || {}, url: '/api/' + name, on() {} };
  let captured = null;
  const vres = { statusCode: 200, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { res?.setHeader(k, v); }, getHeader(k) { return res?.getHeader(k); },
    writeHead(c, h) { res?.writeHead(c, h); return this; }, write(d) { res?.write(d); },
    json(d) { captured = d; if (res) { res.statusCode = this.statusCode; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(d)); } return this; },
    end(d) { if (res) { res.statusCode = this.statusCode; res.end(d); } return this; }, send(d) { this.end(typeof d === 'string' ? d : JSON.stringify(d)); } };
  await handlers[name](vreq, vres);
  return { status: vres.statusCode, body: captured };
}

/** A club through the real store. `seniors`/`u18` are display names; two entries may share one. */
async function makeClub(label, { seniors = [], u18 = [] } = {}) {
  const club = await S.createClub({ clubName: `${label} RFC`, teamName: 'First XV', sport: 'Rugby', name: `${label} Coach`, email: `coach.${label.toLowerCase()}@rs.test`, password: PW, idempotencyKey: kkey() });
  const U18 = (await ST.createGroup(club.team.id, { name: 'U18', developmentCategory: 'youth_u18' })).group.id;
  const SEN = ST.INITIAL_GROUP_ID;
  const code = (await S.loadStoredTeams()).find(t => t.id === club.team.id).teamCode;
  const c = { club, teamId: club.team.id, SEN, U18, people: {}, label, code };
  let n = 0;
  for (const [gid, names] of [[SEN, seniors], [U18, u18]]) for (const entry of names) {
    const [key_, name] = entry.includes('=') ? entry.split('=') : [entry.split(' ')[0], entry];
    const [f, l] = name.split(' ');
    const p = await S.createJoinRequest({ teamCode: code, firstName: f, lastName: l, email: `p${n++}.${label.toLowerCase()}@rs.test`, password: PW });
    await S.approveJoinRequest(p.teamMember.id, club.user.id, club.team.id);
    c.people[key_] = { ...p, name, gid };
  }
  const members = await S.loadTeamMembers();
  for (const m of members) { const who = Object.values(c.people).find(p => p.user.id === m.userId); if (who && m.teamId === c.teamId) m.playerGroupId = who.gid; }
  await S.withIdentityLock(() => S.saveTeamMembers(members));
  for (const p of Object.values(c.people)) { p.session = await S.createSession({ userId: p.user.id, teamId: c.teamId, role: 'player' }); await subscribe(p); }
  c.coach = await S.createSession({ userId: club.user.id, teamId: c.teamId, role: 'coach' });
  return c;
}
async function subscribe(player, device = '') {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const endpoint = `https://push.invalid/${player.user.id}${device}`;
  PUSH.owner.set(endpoint, player.user.id);
  const out = await run('subscribe', 'POST', {}, { label: player.name, subscription: { endpoint, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } } }, ck(player.session));
  assert.ok(out.status < 300, `subscribe ${player.name}: ${out.status}`);
}
const answer = async (player, sessionId, response = 'available', reason = '') => {
  const out = await run('availability', 'POST', {}, { sessionId, response, reason, intentAt: new Date().toISOString(), intentSeq: 0 }, ck(player.session));
  assert.equal(out.status, 200, `answer ${player.name} ${sessionId}: ${JSON.stringify(out.body)}`);
};
const addFixture = async (c, groupId, opposition, date) => {
  const out = await run('publish', 'POST', { resource: 'fixtures' }, { action: 'create', groupId, fixture: { opposition, date, time: '14:00', homeAway: 'home' } }, ck(c.coach));
  assert.ok(out.status < 300, `fixture ${opposition}: ${out.status} ${JSON.stringify(out.body)}`);
  const list = await run('publish', 'GET', { resource: 'fixtures' }, null, ck(c.coach));
  return (list.body.fixtures || []).find(f => f.opposition === opposition && f.date === date).id;
};
const addSlot = async (c, group, day) => {
  const out = await run('publish', 'POST', { resource: 'training-schedule' }, { action: 'add', group, slot: { day, startTime: '19:00', venue: 'Pitch', active: true } }, ck(c.coach));
  assert.ok(out.status < 300, `slot ${day}: ${out.status} ${JSON.stringify(out.body)}`);
};
const CRON = { authorization: 'Bearer cron-secret-105' };
const who = (c, ...keys) => keys.map(k => c.people[k].user.id).sort();
/** Everyone in club `c` a run delivered to. */
const reminded = c => { const mine = new Set(Object.values(c.people).map(p => p.user.id)); return [...new Set(PUSH.delivered.map(d => d.userId).filter(id => mine.has(id)))].sort(); };
/** The weekly no-reply reminder, exactly as the Vercel cron calls it. */
async function weeklyReminder() {
  PUSH.delivered.length = 0;
  const out = await run('cron', 'GET', { job: 'reminder' }, {}, null, null, CRON);
  assert.equal(out.status, 200, JSON.stringify(out.body));
  return out;
}
/** A coach's saved schedule, made due now, then the cron run that fires it. */
let schedSeq = 0;
async function scheduledReminder(c, { audience = 'no-reply', sessionId, body = {}, failDuringRun = null } = {}) {
  const now = new Date();
  const id = `sch-t${++schedSeq}`;
  const saved = await run('schedules', 'POST', {}, { id, name: 'Chase up ' + id, templateId: 'tpl-availability', audience, active: true, coachName: 'Coach',
    days: [['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getUTCDay()]], time: `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`,
    ...(sessionId ? { sessionId } : {}), ...body }, ck(c.coach));
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  PUSH.delivered.length = 0;
  KV.failFor = failDuringRun;                       // the schedule is saved; only the RUN meets the outage
  let out;
  try { out = await run('cron', 'GET', {}, {}, null, null, CRON); } finally { KV.failFor = null; }
  assert.equal(out.status, 200, JSON.stringify(out.body));
  const mine = (out.body.results || []).find(r => r.scheduleId === id);
  assert.ok(mine, 'the schedule fired: ' + JSON.stringify(out.body.results));
  const mineIds = new Set(Object.values(c.people).map(p => p.user.id));
  const recipients = [...new Set(PUSH.delivered.filter(d => /^sched-/.test(d.payload.tag) && d.payload.tag.includes(id) && mineIds.has(d.userId)).map(d => d.userId))].sort();
  const foreign = PUSH.delivered.filter(d => d.payload.tag.includes(id) && !mineIds.has(d.userId)).map(d => d.userId);
  return { result: mine, recipients, foreign, stored: saved.body.schedule };
}
const weeklyRecipients = async c => { await weeklyReminder(); return reminded(c); };

// ═══════════════════════════════════════════════════════════════════════════
// PARITY — the server's occurrences ARE the client's
// ═══════════════════════════════════════════════════════════════════════════
test('PARITY. the server generates exactly the occurrences the client\'s own generator does', async () => {
  const W = await import('../api/_availabilityWeek.js');
  const slots = [
    { id: 'slot_tue', day: 'Tue', active: true, sessionId: 'tue' }, { id: 'slot_thu', day: 'Thu', active: true },
    { id: 'slot_off', day: 'Wed', active: false }, { id: 'slot_bad', day: 'Xyz', active: true },
    { id: 'slot_future', day: 'Fri', active: true, effectiveFrom: APP.availAddDays(WEEK, 30) },
    { id: 'slot_ended', day: 'Mon', active: true, effectiveTo: APP.availAddDays(WEEK, -30) },
  ];
  const fixtures = [
    { id: 'fx_now', opposition: 'A', date: MATCH_DAY, time: '14:00' }, { id: 'fx_last', opposition: 'B', date: LAST_MATCH },
    { id: 'fx_next', opposition: 'C', date: NEXT_MATCH }, { id: 'fx_off', opposition: 'D', date: MATCH_DAY, status: 'cancelled' },
    { id: 'fx_undated', opposition: 'E', date: '' }, { id: 'fx_start', opposition: 'F', date: WEEK }, { id: 'fx_iso', opposition: 'G', date: MATCH_DAY + 'T15:00:00Z' },
  ];
  const shape = list => list.map(e => [e.id, e.type, e.date, Boolean(e.legacy)]);
  const cases = [];
  for (const dayOffset of [-8, -1, 0, 1, 2, 3, 4, 5, 6, 7, 13]) {
    const today = APP.availAddDays(WEEK, dayOffset);
    assert.equal(W.weekStartOf(today), APP.availWeekStart(today), `week start for ${today}`);
    for (const weekShift of [-7, 0, 7]) for (const [f, s] of [[fixtures, slots], [[], slots], [fixtures, []], [[], []], [[{ id: 'fx_only_next', opposition: 'Z', date: NEXT_MATCH }], []]]) {
      const week = APP.availAddDays(APP.availWeekStart(today), weekShift);
      const args = { fixtures: f, slots: s, currentWeekStart: APP.availWeekStart(today) };
      assert.deepEqual(shape(W.occurrencesForWeek(week, args)), shape(APP.availabilityEventsForWeek(week, args)), `week ${week} as seen on ${today}`);
      cases.push(week);
    }
  }
  assert.ok(cases.length >= 150, 'a real spread of weeks, days and sources: ' + cases.length);
  assert.equal(W.todayIso(new Date(TODAY + 'T23:59:59Z')), TODAY, 'today is the UTC date, as the client\'s availToday() is');
  assert.equal(W.addDays(WEEK, 6), APP.availAddDays(WEEK, 6));
});

// ═══════════════════════════════════════════════════════════════════════════
// THE WEEKLY REMINDER — /api/cron?job=reminder
// ═══════════════════════════════════════════════════════════════════════════
test('A. SAME NAME, DIFFERENT CLUB: club B\'s John Smith answering does not silence club A\'s John Smith', async () => {
  const a = await makeClub('Alpha', { seniors: ['John Smith', 'Sam One'] });
  const b = await makeClub('Bravo', { seniors: ['John Smith'] });
  assert.notEqual(a.people.John.user.id, b.people.John.user.id);
  await answer(b.people.John, TUE_THIS, 'available');               // club B's John answers THIS week, in club B
  await answer(a.people.Sam, THU_THIS, 'maybe');
  await weeklyReminder();
  assert.deepEqual(reminded(a), who(a, 'John'), 'club A: John Smith is reminded; Sam, who answered, is not');
  assert.deepEqual(reminded(b), [], 'club B: its John Smith answered');
});

test('B. LAST WEEK: an answer to last week\'s session — given within the last seven days — does not excuse this week', async () => {
  const c = await makeClub('Weeks', { seniors: ['Sam One', 'Stu Four'] });
  await answer(c.people.Sam, TUE_LAST, 'available');                // stamped now: inside any 7-day window
  assert.deepEqual(await weeklyRecipients(c), who(c, 'Sam', 'Stu'), 'both owe an answer for THIS week');
});

test('C. SAME NAME, SAME CLUB: two John Smiths are two people', async () => {
  const c = await makeClub('Twins', { seniors: ['J1=John Smith', 'J2=John Smith', 'Sam One'] });
  await answer(c.people.J1, TUE_THIS, 'unavailable', 'work');
  await answer(c.people.Sam, TUE_THIS, 'available');
  assert.deepEqual(await weeklyRecipients(c), who(c, 'J2'), 'only the John Smith who has NOT answered');
});

test('D. CURRENT OCCURRENCE: an answer to any of this week\'s occurrences excuses exactly that player', async () => {
  const c = await makeClub('Current', { seniors: ['Sam One', 'Sid Two', 'Sol Three', 'Stu Four'] });
  const fx = await addFixture(c, c.SEN, 'Delta', MATCH_DAY);
  await answer(c.people.Sam, TUE_THIS, 'available');
  await answer(c.people.Sid, THU_THIS, 'maybe');
  await answer(c.people.Sol, fx, 'unavailable', 'injury');
  assert.deepEqual(await weeklyRecipients(c), who(c, 'Stu'), 'several occurrences: answering any one is answering');
  await answer(c.people.Stu, fx, 'available');
  assert.deepEqual(await weeklyRecipients(c), [], 'all answered: nobody');
});

test('GROUP. another group\'s answer under the same occurrence id excuses nobody here; each player is judged in their own group', async () => {
  const c = await makeClub('Groups', { seniors: ['Sam One', 'Stu Four'], u18: ['Ugo Uno', 'Dua Dos'] });
  await addSlot(c, c.U18, 'Tue');                                    // U18 trains on Tuesday too
  const u18Occurrences = APP.availabilityEventsForWeek(WEEK, { fixtures: [], currentWeekStart: WEEK,
    slots: (await run('publish', 'GET', { resource: 'training-schedule', group: c.U18 }, null, ck(c.coach))).body.slots });
  const u18Tue = u18Occurrences.find(e => e.type === 'training').id;
  await answer(c.people.Ugo, u18Tue, 'available');
  assert.deepEqual(await weeklyRecipients(c), who(c, 'Dua', 'Sam', 'Stu'), 'Ugo alone is excused');
  // a player who answered in U18 and then moved up: the answer stays U18's.
  // Neither group enters fixtures, so BOTH have the generic match card under the
  // same id — the one case where only the group's keyspace tells the answers apart.
  await answer(c.people.Dua, u18Tue, 'maybe');
  await answer(c.people.Dua, 'game', 'available');
  assert.deepEqual(Object.values(await AV.loadGroupAvailability(c.teamId, c.U18, 'game')).map(v => v.userId), [c.people.Dua.user.id]);
  assert.deepEqual(await AV.loadGroupAvailability(c.teamId, c.SEN, 'game'), {}, 'the Seniors\' record of the same id holds nothing');
  const members = await S.loadTeamMembers();
  for (const m of members) if (m.teamId === c.teamId && m.userId === c.people.Dua.user.id) m.playerGroupId = c.SEN;
  await S.withIdentityLock(() => S.saveTeamMembers(members));
  assert.deepEqual(await weeklyRecipients(c), who(c, 'Dua', 'Sam', 'Stu'), 'in the Seniors he still owes one');
});

test('OCCURRENCE. an answer to ANOTHER occurrence — next week\'s match — does not excuse this week', async () => {
  const c = await makeClub('Ahead', { seniors: ['Sam One', 'Stu Four'] });
  const next = await addFixture(c, c.SEN, 'Gamma', NEXT_MATCH);
  await answer(c.people.Sam, next, 'available');
  assert.deepEqual(await weeklyRecipients(c), who(c, 'Sam', 'Stu'), 'next week\'s answer is next week\'s');
});

test('CLEARED. after clear_week the players are owed a reminder again', async () => {
  const c = await makeClub('Cleared', { seniors: ['Sam One', 'Stu Four'] });
  await addFixture(c, c.SEN, 'Later', NEXT_MATCH);                   // a group that enters fixtures: no generic card
  await answer(c.people.Sam, TUE_THIS, 'available');
  assert.deepEqual(await weeklyRecipients(c), who(c, 'Stu'));
  const cleared = await run('availability', 'POST', {}, { action: 'clear_week', group: c.SEN, sessions: [TUE_THIS, THU_THIS] }, ck(c.coach));
  assert.equal(cleared.status, 200);
  assert.deepEqual(await weeklyRecipients(c), who(c, 'Sam', 'Stu'), 'a cleared answer is no answer');
});

test('FAIL CLOSED. no occurrence, no group, or an unreadable store: nobody is reminded — and nobody else is affected', async () => {
  // EMPTY WEEK: U18 enters fixtures, has none this week and no training night
  const empty = await makeClub('Empty', { u18: ['Ugo Uno', 'Dua Dos'] });
  await addFixture(empty, empty.U18, 'Alpha', LAST_MATCH); await addFixture(empty, empty.U18, 'Gamma', NEXT_MATCH);
  // MISSING SCHEDULE but a match this week: the match is the occurrence
  const noSchedule = await makeClub('NoSched', { u18: ['Ugo Uno'] });
  await addFixture(noSchedule, noSchedule.U18, 'Delta', MATCH_DAY);
  // UNRESOLVED GROUP: a player in a multi-group club who has not been assigned one
  const unresolved = await makeClub('Unresolved', { seniors: ['Sam One', 'Nia None'] });
  const members = await S.loadTeamMembers();
  for (const m of members) if (m.teamId === unresolved.teamId && m.userId === unresolved.people.Nia.user.id) delete m.playerGroupId;
  await S.withIdentityLock(() => S.saveTeamMembers(members));
  // FAILED READ: this club's records cannot be read
  const broken = await makeClub('Broken', { seniors: ['Sam One', 'Stu Four'] });
  const healthy = await makeClub('Healthy', { seniors: ['Sam One'] });

  KV.failFor = `:${broken.teamId}`;
  let out;
  try { out = await weeklyReminder(); } finally { KV.failFor = null; }
  assert.equal(out.status, 200, 'one club\'s outage does not fail the run');
  assert.deepEqual(reminded(broken), [], 'FAILED READ: nobody in that club is reminded');
  assert.deepEqual(reminded(healthy), who(healthy, 'Sam'), 'and the next club is reminded as normal');
  assert.deepEqual(reminded(empty), [], 'EMPTY WEEK: nothing scheduled, nobody reminded');
  assert.deepEqual(reminded(noSchedule), who(noSchedule, 'Ugo'), 'NO TRAINING SCHEDULE: this week\'s match is still an occurrence');
  assert.deepEqual(reminded(unresolved), who(unresolved, 'Sam'), 'UNRESOLVED GROUP: the unassigned player is not guessed into one');
  // once it can be read again, the broken club is served
  assert.deepEqual(await weeklyRecipients(broken), who(broken, 'Sam', 'Stu'));
});

test('ELIGIBILITY. staff are not players; notification preferences still apply; one device, one reminder', async () => {
  const c = await makeClub('Eligible', { seniors: ['Sam One', 'Stu Four'] });
  // the coach has a device too
  const coachPerson = { user: c.club.user, name: 'Eligible Coach', session: c.coach };
  await subscribe(coachPerson);
  await subscribe(c.people.Stu, '-tablet');
  // Sam has switched push off
  await S.updateNotificationPreferences(c.people.Sam.user.id, { pushEnabled: false });
  await weeklyReminder();
  const mine = PUSH.delivered.filter(d => [c.club.user.id, ...Object.values(c.people).map(p => p.user.id)].includes(d.userId));
  assert.equal(mine.some(d => d.userId === c.club.user.id), false, 'a coach owes no availability answer');
  assert.equal(mine.some(d => d.userId === c.people.Sam.user.id), false, 'a player who switched push off is left alone');
  // a saved schedule honours the same preference
  const sched = await scheduledReminder(c);
  assert.deepEqual(sched.recipients, who(c, 'Stu'), 'and so does a saved no-reply schedule');
  await S.updateNotificationPreferences(c.people.Sam.user.id, { pushEnabled: true });
  await weeklyReminder();
  assert.ok(PUSH.delivered.some(d => d.userId === c.people.Sam.user.id), 'switched back on, he is reminded again');
  PUSH.delivered.length = 0; await weeklyReminder();
  const again = PUSH.delivered.filter(d => [c.club.user.id, ...Object.values(c.people).map(p => p.user.id)].includes(d.userId));
  assert.equal(again.filter(d => d.userId === c.people.Stu.user.id).length, 2);
  mine.length = 0; mine.push(...again);
  assert.equal(mine.filter(d => d.userId === c.people.Stu.user.id).length, 2, 'both of Stu\'s devices, once each');
  assert.equal(new Set(mine.map(d => d.endpoint)).size, mine.length, 'no endpoint twice');
  for (const d of mine) { assert.equal(d.payload.type, 'availability'); assert.equal(d.payload.actions, undefined, 'a week-wide reminder carries no answer buttons'); }
  // ONE PERSON IN TWO CLUBS owes an answer in both: their device is reminded once
  const second = await makeClub('Eligible2', { seniors: ['Una Other'] });
  const both = await S.createJoinRequest({ teamCode: second.code, firstName: 'Stu', lastName: 'Four', email: 'p1.eligible@rs.test', password: PW });
  assert.equal(both.user.id, c.people.Stu.user.id, 'the same account');
  await S.approveJoinRequest(both.teamMember.id, second.club.user.id, second.teamId);
  const roll = await S.loadTeamMembers();
  for (const m of roll) if (m.teamId === second.teamId && m.userId === both.user.id) m.playerGroupId = second.SEN;
  await S.withIdentityLock(() => S.saveTeamMembers(roll));
  await weeklyReminder();
  const stu = PUSH.delivered.filter(d => d.userId === c.people.Stu.user.id);
  assert.equal(stu.length, 2, 'two devices, two reminders — not four');
  assert.equal(new Set(stu.map(d => d.endpoint)).size, 2);
});

// ═══════════════════════════════════════════════════════════════════════════
// A SAVED SCHEDULE — audience 'no-reply'
// ═══════════════════════════════════════════════════════════════════════════
test('SCHEDULE A–D. a no-reply schedule asks the same question: this club, this group, this week, by id', async () => {
  const a = await makeClub('SchedA', { seniors: ['J1=John Smith', 'J2=John Smith', 'Sam One', 'Stu Four'] });
  const b = await makeClub('SchedB', { seniors: ['John Smith', 'Stu Four'] });
  await answer(b.people.John, TUE_THIS, 'available'); await answer(b.people.Stu, TUE_THIS, 'available');   // another club: same names
  await answer(a.people.J1, THU_THIS, 'available');                                                        // same club: one John answered
  await answer(a.people.Sam, TUE_LAST, 'available');                                                       // last week only
  const run1 = await scheduledReminder(a);
  assert.deepEqual(run1.recipients, who(a, 'J2', 'Sam', 'Stu'), 'J1 alone is excused');
  assert.deepEqual(run1.foreign, [], 'and nobody outside the club is reached');
  assert.equal(run1.result.total, 3);
  // everyone answers this week → nobody
  for (const k of ['J2', 'Sam', 'Stu']) await answer(a.people[k], TUE_THIS, 'available');
  const run2 = await scheduledReminder(a);
  assert.deepEqual(run2.recipients, []); assert.equal(run2.result.total, 0);
});

test('SCHEDULE scope. one occurrence, several, another group, a named occurrence, and an empty week', async () => {
  const c = await makeClub('SchedScope', { seniors: ['Sam One', 'Stu Four'], u18: ['Ugo Uno', 'Dua Dos'] });
  const u18Match = await addFixture(c, c.U18, 'Delta', MATCH_DAY);            // U18: ONE occurrence this week
  const senMatch = await addFixture(c, c.SEN, 'Echo', MATCH_DAY);             // Seniors: training twice + a match
  await answer(c.people.Ugo, u18Match, 'available');
  await answer(c.people.Sam, THU_THIS, 'maybe');
  await answer(c.people.Stu, u18Match, 'available').catch(() => {});           // (a Seniors player cannot answer U18's match into U18's record)
  let out = await scheduledReminder(c);
  assert.deepEqual(out.recipients, who(c, 'Dua', 'Stu'), 'each player judged against their OWN group\'s occurrences');
  // a schedule that names one occurrence: only the group that has it, only who has not answered IT
  out = await scheduledReminder(c, { sessionId: senMatch });
  assert.deepEqual(out.recipients, who(c, 'Sam', 'Stu'), 'Sam answered Thursday, not the match; U18 do not have this match');
  assert.ok((out.recipients.length && PUSH.delivered.find(d => d.payload.tag.includes(out.stored.id)).payload.actions || []).length === 3, 'a named, dated occurrence keeps its answer buttons');
  // …an occurrence that is not this week's for anyone
  const stale = await scheduledReminder(c, { sessionId: TUE_LAST });
  assert.deepEqual(stale.recipients, [], 'last week\'s occurrence: fail closed');
  // audience "all" is untouched by any of this
  const all = await scheduledReminder(c, { audience: 'all' });
  assert.ok(who(c, 'Sam', 'Stu', 'Ugo', 'Dua').every(id => all.recipients.includes(id)), 'everyone, answered or not');
});

test('SCHEDULE forged. a schedule cannot be pointed at another club, its group or its occurrences', async () => {
  const victim = await makeClub('Victim', { seniors: ['Vic One', 'Val Two'] });
  const victimMatch = await addFixture(victim, victim.SEN, 'Target', MATCH_DAY);
  const attacker = await makeClub('Attacker', { seniors: ['Att One'] });
  const out = await scheduledReminder(attacker, { sessionId: victimMatch, body: { teamId: victim.teamId, groupId: victim.SEN, targetUserId: victim.people.Vic.user.id, players: [victim.people.Vic.user.id] } });
  assert.equal(out.stored.teamId, attacker.teamId, 'the schedule belongs to the club whose coach saved it');
  assert.deepEqual(reminded(victim), [], 'no player of the other club is reached');
  assert.deepEqual(out.foreign, []);
  assert.deepEqual(out.recipients, [], 'and an occurrence that is not the attacker\'s own scopes to nobody');
  // the cron itself stays behind its secret
  assert.equal((await run('cron', 'GET', { job: 'reminder' }, {}, null, null, { authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await run('cron', 'GET', { job: 'reminder' }, {}, ck(attacker.coach), null, {})).status, 401, 'a coach session is not the cron secret');
});

test('SCOPE. the one scope function: its club is its own, the caller\'s member set is final, and a schedule fails closed on an unreadable club', async () => {
  const { subscriptionsOwingAnAnswer } = await import('../api/cron.js');
  const { load } = await import('../api/_lib.js');
  const a = await makeClub('ScopeA', { seniors: ['Sam One', 'Stu Four'] });
  const b = await makeClub('ScopeB', { seniors: ['Bea Other'] });
  const members = await S.loadTeamMembers();
  const subscribers = await load();
  const idsOf = scope => [...new Set(scope.targets.map(t => t.userId))].sort();
  // every member of every club is handed in, no member set: only THIS club's players come back
  let scope = await subscriptionsOwingAnAnswer(a.teamId, { members, subscribers });
  assert.deepEqual(idsOf(scope), who(a, 'Sam', 'Stu'), 'club A\'s players, and nobody from club B');
  assert.equal(scope.week, WEEK, 'judged against the application\'s current week');
  assert.ok(scope.groups.every(g => g.occurrences > 0));
  // the caller's set of active members is authoritative: a player left out of it is not considered
  scope = await subscriptionsOwingAnAnswer(a.teamId, { members, subscribers, memberIds: new Set([a.people.Stu.user.id]) });
  assert.deepEqual(idsOf(scope), who(a, 'Stu'));
  // a member record that CLAIMS another club's player for this club reaches nobody it should not
  const forged = [...members, { id: 'forged', teamId: a.teamId, userId: b.people.Bea.user.id, role: 'player', status: 'active', playerGroupId: a.SEN }];
  scope = await subscriptionsOwingAnAnswer(a.teamId, { members: forged, subscribers, memberIds: new Set(who(a, 'Sam', 'Stu')) });
  assert.deepEqual(idsOf(scope), who(a, 'Sam', 'Stu'), 'the member set decides who belongs');
  // inactive and removed memberships are never reminded
  const lapsed = members.map(m => m.userId === a.people.Sam.user.id ? { ...m, status: 'removed' } : m);
  assert.deepEqual(idsOf(await subscriptionsOwingAnAnswer(a.teamId, { members: lapsed, subscribers })), who(a, 'Stu'));
  // a SAVED SCHEDULE whose club cannot be read reminds nobody, and says why
  const out = await scheduledReminder(a, { failDuringRun: `structure:${a.teamId}` });
  assert.deepEqual(out.recipients, [], 'fail closed');
  assert.equal(out.result.total, 0);
  const logged = (lists.get('app:message_log') || []).map(x => typeof x === 'string' ? JSON.parse(x) : x).find(e => e.scheduleId === out.stored.id);
  assert.match(String(logged?.note || ''), /could not be read; nobody reminded/, 'and the message log records the reason');
  assert.deepEqual((await scheduledReminder(a)).recipients, who(a, 'Sam', 'Stu'), 'readable again: served');
});

test('OLD FILTER. the cross-club, display-name filter is gone and nothing calls it', async () => {
  assert.doesNotMatch(cronSrc, /recentResponders/, 'api/cron.js no longer uses it');
  assert.doesNotMatch(stripComments(cronSrc), /responded\.has\(item\.label\)/, 'no recipient is dropped by display name');
  assert.equal(typeof AV.recentResponders, 'undefined', 'and it is retired from the store');
  const live = fs.readdirSync(path.join(ROOT, 'api')).filter(f => f.endsWith('.js')).filter(f => /recentResponders\(/.test(stripComments(fs.readFileSync(path.join(ROOT, 'api', f), 'utf8'))));
  assert.deepEqual(live, [], 'no production caller remains');
  assert.match(cronSrc, /respondersByIdentity\(/, 'the scheduled paths use the Build 104 filter');
});

// ═══════════════════════════════════════════════════════════════════════════
// THE OVERVIEW'S "Request availability" — logged through the shared helper
// ═══════════════════════════════════════════════════════════════════════════
const P = (id, extra = {}) => ({ id, userId: id, name: 'Player ' + id, ...extra });
const FIXTURED = [{ id: 'fx_next', opposition: 'Gamma', date: NEXT_MATCH }];
function coach({ players = [P('a'), P('b'), P('c')], resolved = {}, sync = true, readFailed = false, group = 'grp_sen', groups = ['grp_sen', 'grp_u18'],
                 schedule = { slots: [{ id: 'slot_tue', day: 'Tue', active: true }, { id: 'slot_thu', day: 'Thu', active: true }] },
                 fixtures = FIXTURED, requests = [], club = 'team_home', reply = { status: 200, body: { ok: true, sent: 3, failed: 0, total: 3, reached: 3, targeted: 3 } }, hold = false } = {}) {
  const body = `
    "use strict";
    const CFG = arguments[0];
    let _clubContextId = CFG.club;
    let state = { operationalGroupId: CFG.group, players: CFG.players, fixtures: CFG.fixtures, schedule: [], messages: [], clubName: 'Home RFC', availabilityTemplate: '',
                  availabilityRequests: CFG.requests, matchCentre: {}, trainingBlocks: {}, formationNames: {}, activeView: 'coach', activeCoachSection: 'overview', weeklyAvailability: {} };
    let _resolvedAvailability = CFG.resolved, _resolvedAvailabilityGroup = CFG.group;
    let _availLastSync = CFG.sync ? new Date().toISOString() : null, _availReadFailed = CFG.readFailed;
    let _trainingSchedule = CFG.schedule, _trainingScheduleGroupId = CFG.group, _trainingScheduleAttempted = false;
    let _chatNavUnread = 0, _identityPendingRequests = [];
    let toasts = [], saves = [], posts = [], renders = 0, releases = [];
    function showToast(t) { toasts.push(t); } function saveState(l) { saves.push({ label: l, log: JSON.parse(JSON.stringify(state.availabilityRequests)) }); } function render() { renders++; }
    function isCoach() { return true; } function currentUser() { return { id: 'coach1', name: 'Head Coach' }; }
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
    function normalizeWeeklyAvailability(w) { return { ...(w || {}) }; } function _persistWeeklyAvailability() {}
    async function ceConfirm() { return true; }
    async function fetch(url, opts) {
      const n = posts.length; posts.push({ url, body: JSON.parse(opts.body) });
      if (CFG.hold) await new Promise(r => { releases[n] = r; });
      if (CFG.reply === 'offline') throw new TypeError('Load failed');
      return { ok: CFG.reply.status < 400, status: CFG.reply.status, json: async () => CFG.reply.body };
    }
    ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
    ${fn('availWeekStart')} ${fn('availAddDays')} ${fn('availToday')} ${fn('availSlotDateInWeek')} ${fn('availTrainingEventId')} ${fn('availabilityEventsForWeek')}
    ${fn('sessionKey')} ${fn('sessionReasonKey')} ${fn('normalizeSessionId')} ${fn('liveAvailabilityPlayerKeys')}
    ${fn('currentResolvedAvailability')} ${fn('availabilityLastReadFailed')} ${fn('availabilityReadUnknown')} ${fn('resolvedAnswerFor')} ${fn('sessionRows')}
    ${fn('_tlIdTs')} ${fn('availabilityNonResponders')} ${fn('availabilityWeekSessions')}
    ${fn('availabilityRequestMatches')} ${fn('availabilityRequestedSessions')} ${fn('availabilityChaseContext')} ${fn('availabilityLogRequest')}
    ${fn('createCoachMessage')} ${fn('getNeedsAttentionItems')}
    ${src.match(/let _availRequestNowInFlight = false;[^\n]*/)[0]}
    ${fn('sendAvailabilityNow')} ${fn('sendWeeklyAvailabilityNow')}
    return { state, ask: sendAvailabilityNow, askWeekly: sendWeeklyAvailabilityNow, items: () => getNeedsAttentionItems().filter(i => /repl|vailab/i.test(i.text)).map(i => i.text),
             toasts: () => toasts, saves: () => saves, posts: () => posts, renders: () => renders, release: n => releases[n] && releases[n](), context: availabilityChaseContext };
  `;
  return new Function(body)({ players, resolved, sync, readFailed, group, groups, schedule, fixtures, requests, club, reply, hold });
}

test('REQUEST. the Overview action records what it asked — once the server says it was sent', async () => {
  const c = coach();
  assert.deepEqual(c.items(), ['Availability not requested this week'], 'before');
  const out = await c.ask();
  assert.equal(c.posts().length, 1, 'one request');
  assert.deepEqual([c.posts()[0].body.type, c.posts()[0].body.group], ['availability', 'grp_sen']);
  const log = c.state.availabilityRequests;
  assert.deepEqual(log.map(r => r.sessionId).sort(), [TUE_THIS, THU_THIS].sort(), 'one entry per occurrence of this week');
  for (const r of log) assert.deepEqual([r.status, r.groupId, r.clubId, r.sentWeek], ['sent', 'grp_sen', 'team_home', WEEK], 'the shared format: club, group, week, occurrence');
  assert.ok(log.every(r => Array.isArray(r.messageIds) && r.messageIds.length === 3), 'and the message rows it created, by id');
  assert.ok(c.saves().some(s => s.log.length === 2), 'persisted: what was saved holds both entries');
  assert.deepEqual(c.toasts(), ['Availability request sent to 3 players ✓']);
  assert.deepEqual(c.items(), ["3 players haven't replied"], 'and the SAME scoped gate recognises it');
  assert.equal(out.sent, 3);
  // it is an ACTION: painting the Overview again records nothing
  for (let i = 0; i < 5; i++) c.items();
  assert.equal(c.state.availabilityRequests.length, 2, 'no log from a re-render');
  const body = stripComments(fn('sendAvailabilityNow'));
  assert.match(body, /availabilityLogRequest\(/, 'through the one helper');
  assert.doesNotMatch(body, /availabilityRequests\.(unshift|push)\(/, 'and no second log format');
});

test('REQUEST. nothing is recorded, and no success is claimed, unless the request actually went', async () => {
  const cases = [
    [{ status: 200, body: { ok: true, sent: 0, failed: 0, total: 0, reached: 0 } }, /No subscribers yet/],
    [{ status: 200, body: { ok: true, sent: 0, failed: 3, total: 3, reached: 0 } }, /could not be delivered/],
    [{ status: 403, body: { ok: false, error: 'You do not operate that group' } }, /Could not send: You do not operate that group/],
    [{ status: 500, body: { error: 'VAPID keys not configured' } }, /Could not send/],
    ['offline', /offline/i],
  ];
  for (const [reply, toast] of cases) {
    const c = coach({ reply });
    const out = await c.ask();
    assert.equal(c.state.availabilityRequests.length, 0, 'nothing logged: ' + JSON.stringify(reply));
    assert.equal(c.state.messages.length, 0, 'and no message rows claimed');
    assert.match(c.toasts().join(' | '), toast);
    assert.equal(c.toasts().some(t => /✓/.test(t)), false, 'no tick');
    assert.deepEqual(c.items(), ['Availability not requested this week'], 'the Overview still says so');
    assert.ok(!out || !out.sent);
  }
  // people, not devices; and a part delivery is said as one
  const part = coach({ reply: { status: 200, body: { ok: true, sent: 3, failed: 1, total: 4, reached: 2, targeted: 3 } } });
  await part.ask();
  assert.deepEqual(part.toasts(), ['Availability request sent to 2 of 3 players — 1 could not be reached']);
  assert.equal(part.state.availabilityRequests.length, 2, 'it went: it is recorded');
});

test('REQUEST. it fails closed without an occurrence, and one tap is one request', async () => {
  const empty = coach({ schedule: { slots: [] }, fixtures: [{ id: 'fx_next', opposition: 'Gamma', date: NEXT_MATCH }] });
  await empty.ask();
  assert.equal(empty.posts().length, 0); assert.deepEqual(empty.toasts(), ['Nothing is scheduled this week — there is nothing to ask about']);
  const loading = coach({ schedule: null });
  await loading.ask();
  assert.equal(loading.posts().length, 0); assert.deepEqual(loading.toasts(), ['Availability is still loading — try again in a moment']);
  const failed = coach({ sync: false, readFailed: true });
  await failed.ask();
  assert.equal(failed.posts().length, 0); assert.match(failed.toasts()[0], /could not be loaded/);
  for (const c of [empty, loading, failed]) assert.equal(c.state.availabilityRequests.length, 0);
  // a double tap while the first is in flight
  const held = coach({ hold: true });
  const first = held.ask(); const second = held.ask(); const third = held.ask();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(held.posts().length, 1, 'only one request left the device');
  held.release(0); await Promise.all([first, second, third]);
  assert.equal(held.state.availabilityRequests.length, 2, 'and it was recorded once');
  // the weekly "send now" button stamps "sent" only when it was
  const refused = coach({ reply: { status: 200, body: { ok: true, sent: 0, failed: 0, total: 0, reached: 0 } } });
  await refused.askWeekly({});
  assert.equal(refused.state.weeklyAvailability.lastSentAt, undefined, 'nothing sent, nothing stamped');
  const sent = coach();
  await sent.askWeekly({});
  assert.ok(sent.state.weeklyAvailability.lastSentAt, 'sent: stamped');
});

test('REQUEST LOG is tenant-scoped: another club\'s, another group\'s or another week\'s entry satisfies nothing', () => {
  const REQ = (sessionId, extra = {}) => ({ id: 'req-' + sessionId + '-' + Date.now(), sessionId, status: 'sent', groupId: 'grp_sen', clubId: 'team_home', sentWeek: WEEK, ...extra });
  const says = requests => coach({ requests }).items();
  assert.deepEqual(says([REQ(TUE_THIS)]), ["3 players haven't replied"]);
  assert.deepEqual(says([REQ(TUE_THIS, { clubId: 'team_other' })]), ['Availability not requested this week'], 'another club');
  assert.deepEqual(says([REQ(TUE_THIS, { groupId: 'grp_u18' })]), ['Availability not requested this week'], 'another group');
  assert.deepEqual(says([REQ(TUE_LAST)]), ['Availability not requested this week'], 'another week');
  assert.match(fn('resetTeamScopedState'), /state\.availabilityRequests = \[\];/, 'and the log itself is wiped when the club changes');
});

// ═══════════════════════════════════════════════════════════════════════════
// BROWSER — the real client in Chromium against the real handlers
// ═══════════════════════════════════════════════════════════════════════════
let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* not installed: the browser test skips */ }
const REWRITES = { roster: { handler: 'publish', query: { resource: 'roster' } } };
const NET = { push: [] };
const mime = f => f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream';
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    let name = url.pathname.slice(5).split('/')[0];
    const query = Object.fromEntries(url.searchParams);
    if (REWRITES[name]) { Object.assign(query, REWRITES[name].query); name = REWRITES[name].handler; }
    let raw = ''; for await (const c of req) raw += c;
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    if (!handlers[name] || name === 'cron') { res.setHeader('content-type', 'application/json'); return res.end('{"ok":true}'); }
    try {
      const out = await run(name, req.method, query, body, req.headers.cookie, res);
      if (name === 'push' && req.method === 'POST') NET.push.push({ request: body, status: out.status, response: out.body });
    } catch { res.statusCode = 500; res.end('{}'); }
    return;
  }
  const f = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  try { res.setHeader('content-type', mime(f)); res.end(fs.readFileSync(f)); } catch { res.statusCode = 404; res.end(); }
});
const waitFor = async (fnc, ms, every = 60) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await fnc(); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await new Promise(r => setTimeout(r, every)); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const INIT = () => {
  try { sessionStorage.setItem('ce-setup-skipped', '1'); } catch {}
  window.__toasts = [];
  const hook = () => { const el = document.getElementById('toast'); if (!el) return setTimeout(hook, 20);
    new MutationObserver(() => { const t = el.textContent.trim(); if (t) window.__toasts.push(t); }).observe(el, { childList: true, characterData: true, subtree: true }); };
  document.addEventListener('DOMContentLoaded', hook);
};

test('browser: Request availability is logged and survives a reload; the gate follows it; same-name players are told apart; an empty week asks nothing; Overview, board, Remind and Chase all agree', { timeout: 300000 }, async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  const errors = [], consoleErrors = [];
  let ctx;
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${server.address().port}`;
    const c = await makeClub('Journey', { seniors: ['J1=John Smith', 'J2=John Smith', 'Sam One', 'Stu Four'], u18: ['Ugo Uno', 'Dua Dos'] });
    const match = await addFixture(c, c.SEN, 'Delta', MATCH_DAY);
    await addFixture(c, c.U18, 'Alpha', LAST_MATCH); await addFixture(c, c.U18, 'Gamma', NEXT_MATCH);   // U18: nothing this week
    ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept().catch(() => {}));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#ce-welcome', { timeout: 20000 });
    await page.click('#ce-welcome button:has-text("Log in")');
    await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
    await page.fill('#identityLoginEmail', 'coach.journey@rs.test'); await page.fill('#identityLoginPassword', PW); await page.click('#identityLoginBtn');
    await page.waitForFunction(() => typeof state !== 'undefined' && !!state.stateTeamId && !!state.currentUserId && !sessionSignedOut(), null, { timeout: 20000 });
    assert.equal(await page.evaluate(async () => (await fetch('/api/roster', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ players: [] }) })).status), 200);

    const operate = async gid => {
      await page.evaluate(g => { setOperationalGroup(g); setSection('coach', 'overview'); }, gid);
      await page.waitForFunction(g => state.operationalGroupId === g && state.activeCoachSection === 'overview', gid, { timeout: 20000 });
      await page.evaluate(() => loadFixturesFromServer(true).then(() => render()).catch(() => {}));
      assert.ok(await waitFor(() => page.evaluate(g => _trainingScheduleGroupId === g && !!_trainingSchedule && currentResolvedAvailability() !== null, gid), 20000), 'schedule and answers landed for ' + gid);
      await sleep(300);
    };
    const refresh = async () => { await page.evaluate(() => refreshLiveAvailability({ boardOnly: true }).then(() => render())); await sleep(250); };
    const overview = () => page.evaluate(() => {
      const ov = document.getElementById('coach-overview'); const vis = el => !!el && el.offsetParent !== null;
      const leaves = [...ov.querySelectorAll('*')].filter(e => e.children.length === 0 && vis(e)).map(e => (e.innerText || '').trim().replace(/\s+/g, ' ')).filter(Boolean);
      return { claims: leaves.filter(x => /haven't replied|hasn't replied|^Chase all$|not requested this week|could not be loaded/i.test(x)),
               week: availabilityWeekSessions().map(e => e.id), log: (state.availabilityRequests || []).map(r => ({ s: r.sessionId, g: r.groupId, c: r.clubId, w: r.sentWeek, st: r.status })) };
    });
    const boardChase = async () => {
      await page.evaluate(() => setSection('coach', 'message')); await sleep(400);
      const out = await page.evaluate(() => { const text = (document.getElementById('coach-message').innerText || '').replace(/\s+/g, ' '); return (text.match(/\d+ to chase/) || [null])[0]; });
      return out;
    };
    const toasts = () => page.evaluate(() => (window.__toasts || []).slice());
    const press = async action => {
      await page.evaluate(() => { window.__toasts = []; }); const before = NET.push.length;
      await action(); await sleep(1300);
      const calls = NET.push.slice(before);
      return { toasts: await toasts(), calls, recipients: [...new Set(calls.flatMap(x => (x.response?.results || []).map(r => r.userId)))].sort() };
    };
    const clickQuickAction = () => page.evaluate(() => { const b = [...document.querySelectorAll('#coach-overview [onclick="sendAvailabilityNow()"]')].find(x => x.offsetParent !== null); if (b) b.click(); return !!b; });

    // D. EMPTY WEEK (U18): nothing is claimed, and the action asks nothing
    await operate(c.U18);
    let ov = await overview();
    assert.deepEqual(ov.week, []); assert.deepEqual(ov.claims, [], 'D: no misleading count in an empty week: ' + JSON.stringify(ov.claims));
    let out = await press(async () => assert.ok(await clickQuickAction(), 'the quick action is on the Overview'));
    assert.deepEqual(out.calls, [], 'D: nothing was sent'); assert.deepEqual(out.toasts, ['Nothing is scheduled this week — there is nothing to ask about']);
    assert.deepEqual((await overview()).log, [], 'D: and nothing was logged');

    // C. THE GATE, before: Seniors have training and a match this week; nobody has asked
    await operate(c.SEN);
    ov = await overview();
    assert.ok(ov.week.includes(match) && ov.week.length >= 3);
    assert.deepEqual(ov.claims, ['Availability not requested this week'], 'C (before): ' + JSON.stringify(ov.claims));

    // A. REQUEST AVAILABILITY from the Overview
    out = await press(async () => assert.ok(await clickQuickAction()));
    assert.equal(out.calls.length, 1, 'A: one request');
    assert.deepEqual(out.recipients, who(c, 'J1', 'J2', 'Sam', 'Stu'), 'A: the Seniors, and only them');
    assert.deepEqual(out.toasts, ['Availability request sent to 4 players ✓']);
    ov = await overview();
    assert.deepEqual(ov.log.map(r => r.s).sort(), [...ov.week].sort(), 'A: one log entry per occurrence of this week');
    assert.ok(ov.log.every(r => r.g === c.SEN && r.c === c.teamId && r.w === WEEK && r.st === 'sent'), 'A: each stamped with its club, group and week: ' + JSON.stringify(ov.log));
    assert.deepEqual(ov.claims, ["4 players haven't replied", 'Chase all'], 'C (after): the gate follows the request: ' + JSON.stringify(ov.claims));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof state !== 'undefined' && !!state.currentUserId && !sessionSignedOut(), null, { timeout: 20000 });
    await page.evaluate(g => { setOperationalGroup(g); setSection('coach', 'overview'); }, c.SEN);
    assert.ok(await waitFor(async () => (await overview()).claims.includes("4 players haven't replied"), 20000), 'A: after a reload the state remains: ' + JSON.stringify((await overview()).claims));
    assert.deepEqual((await overview()).log.map(r => r.s).sort(), [...ov.week].sort(), 'A: and so does the log');
    // the other group is not told it has been asked
    await operate(c.U18);
    assert.deepEqual((await overview()).claims, [], 'the Seniors\' request is not the U18s\'');
    await operate(c.SEN);

    // B. SAME-NAME PLAYERS: one John Smith answers the match
    await answer(c.people.J1, match, 'available');
    await answer(c.people.Sam, ov.week.find(id => /^slot_tue-/.test(id)), 'maybe');
    await refresh();
    ov = await overview();
    // E. BUILD 104: the Overview, the board, Remind and Chase all
    assert.deepEqual(ov.claims, ["2 players haven't replied", 'Chase all'], 'E: Overview count (J2 and Stu have answered nothing): ' + JSON.stringify(ov.claims));
    assert.equal(await boardChase(), '2 to chase', 'E: the board counts the same two');
    out = await press(() => page.evaluate(id => remindNonResponders(id), match));
    assert.deepEqual(out.recipients, who(c, 'J2', 'Sam', 'Stu'), 'B + E: per-session Remind — everyone who has not answered THE MATCH, the right John Smith among them');
    assert.equal(out.recipients.includes(c.people.J1.user.id), false, 'B: the John Smith who answered is left alone');
    out = await press(() => page.evaluate(() => chaseAllNonResponders()));
    assert.deepEqual(out.recipients, who(c, 'J2', 'Stu'), 'B + E: Chase all — the two who have answered nothing');
    assert.deepEqual(out.toasts, ['Reminder sent to 2 players ✓']);

    assert.deepEqual(errors, [], 'no page errors');
    assert.deepEqual(consoleErrors, [], 'no console errors');
  } finally {
    try { await ctx?.close(); } catch {}
    await browser.close(); await new Promise(r => server.close(r));
  }
});
