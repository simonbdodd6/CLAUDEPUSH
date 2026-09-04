/**
 * BUILD F — A PLAYER SEES THEIR OWN ATTENDANCE.
 *
 * Attendance is the coach's record OF a player. The player it is about may read
 * it; nobody else's, and never the group's register.
 *
 * The rule this file exists to protect: EVERY input to a self read comes from
 * the SESSION. The club, the group and the identity are resolved server-side,
 * so there is no ?group=, no player id and no key in the request that could be
 * swapped for somebody else's. Hiding a button is not a boundary; this is.
 *
 * And the second rule: availability is not attendance. A player who said they
 * could not come is not "absent" — absent is something a coach recorded.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.player-attendance.test';
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
const SEN = 'grp_sen', U18 = 'grp_u18';
const scope = gids => ({ clubWide: false, groups: gids.map(g => ({ groupId: g, status: 'active' })), teams: [] });

const MEMBERS = [
  { id: 'm-head', teamId: CLUB, userId: 'u-head', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
  // Two Seniors players, DELIBERATELY sharing a display name.
  { id: 'm-amy',  teamId: CLUB, userId: 'user_amy',  role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-amy2', teamId: CLUB, userId: 'user_amy2', role: 'player', status: 'active', playerGroupId: SEN },
  // A U18 player — another group in the same club.
  { id: 'm-kid',  teamId: CLUB, userId: 'user_kid',  role: 'player', status: 'active', playerGroupId: U18 },
  // A player whose group was never set: identity cannot be placed.
  { id: 'm-lost', teamId: CLUB, userId: 'user_lost', role: 'player', status: 'active' },
  // A player in a DIFFERENT club.
  { id: 'm-far',  teamId: OTHER, userId: 'user_far', role: 'player', status: 'active', playerGroupId: SEN },
  // Staff who do not play: a manager (holds `reports`, not `publish_training`).
  { id: 'm-mgr',  teamId: CLUB, userId: 'u-mgr', role: 'coach', staffLevel: 'manager', status: 'active', accessProfile: 'manager', accessScope: scope([SEN]) },
];

function seed() {
  kv.clear(); lists.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Riverside' }, { id: OTHER, name: 'Other' }]));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({
    id: m.userId, email: `${m.userId}@t.test`,
    displayName: m.userId.startsWith('user_amy') ? 'Amy Stone' : m.userId }))));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  const groups = [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' },
                  { id: U18, name: 'U18', type: 'general', status: 'active' }];
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1, groups, teams: [] }));
  kv.set(`app:structure:${OTHER}`, JSON.stringify({ version: 1, groups: [groups[0]], teams: [] }));
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
const read = (user, q = '') => call(user, 'GET', 'resource=attendance' + q);

/** The Seniors register: Amy present, her namesake absent, a third player present. */
async function seedRegister() {
  seed();
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: {
    'id:user_amy': 'present', 'id:user_amy2': 'absent', 'id:user_kid': 'present' } });
}

// ═══════════════ THE PLAYER READS THEIR OWN ═══════════════════════════════

test('a player reads their own attendance, and only their own', async () => {
  await seedRegister();
  const res = await read('user_amy');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.scope, 'self');
  assert.equal(res.body.selfKey, 'id:user_amy');
  assert.deepEqual(res.body.sessions['tue-20260804'].marks, { 'id:user_amy': 'present' },
    'their own mark, and no other name in the payload');
  // Nothing anywhere in the response mentions the other two players.
  const wire = JSON.stringify(res.body);
  assert.ok(!wire.includes('user_amy2'), 'a squad-mate’s identity must not travel');
  assert.ok(!wire.includes('user_kid'));
});

test('the two Amy Stones cannot see each other — a shared NAME is not an identity', async () => {
  await seedRegister();
  const a = await read('user_amy'), b = await read('user_amy2');
  assert.deepEqual(a.body.sessions['tue-20260804'].marks, { 'id:user_amy': 'present' });
  assert.deepEqual(b.body.sessions['tue-20260804'].marks, { 'id:user_amy2': 'absent' });
  assert.notEqual(a.body.selfKey, b.body.selfKey, 'one name, two identities, two registers');
});

test('a rename changes nothing — attendance is keyed to the account, never the name', async () => {
  await seedRegister();
  const before = await read('user_amy');
  const users = JSON.parse(kv.get('app:identity:users'));
  users.find(u => u.id === 'user_amy').displayName = 'Amy Marchand';
  kv.set('app:identity:users', JSON.stringify(users));
  const after = await read('user_amy');
  assert.deepEqual(after.body.sessions, before.body.sessions, 'same register after the rename');
});

test('the invite-era roster id is honoured — a claimed row is still this person’s row', async () => {
  // A row created from an invite carries legacyPlayerId, and the coach's client
  // filed the mark under THAT id. The account that later claimed it must still
  // be able to read it — the server proves the link from its own records.
  seed();
  kv.set('app:identity:player_profiles', JSON.stringify([
    { id: 'pp1', userId: 'user_amy', legacyPlayerId: 'inv-Yxnjxn' }]));
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: [
    { id: 'inv-Yxnjxn', name: 'Amy Stone', legacyPlayerId: 'inv-Yxnjxn' }] }));
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:inv-Yxnjxn': 'present' } });
  const res = await read('user_amy');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.sessions['tue-20260804'].marks['id:user_amy'], 'present',
    'read back under the caller’s own key — one person, one answer');
});

test('two owned keys that disagree are REPORTED, never resolved by guessing', async () => {
  seed();
  kv.set('app:identity:player_profiles', JSON.stringify([
    { id: 'pp1', userId: 'user_amy', legacyPlayerId: 'inv-Yxnjxn' }]));
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: {
    'id:user_amy': 'present', 'id:inv-Yxnjxn': 'absent' } });
  const res = await read('user_amy');
  assert.deepEqual(res.body.sessions, {}, 'an ambiguous session is not reported as a fact');
  assert.deepEqual(res.body.ambiguous, ['tue-20260804'], 'it is named instead');
});

// ═══════════════ AND NOBODY ELSE'S ════════════════════════════════════════

test('a session this player was never marked on does not travel at all', async () => {
  // The register also holds sessions where somebody ELSE was marked. Filtering
  // the marks is not enough — the session itself must not be handed over, or
  // the payload leaks who trained and when for people it is not about.
  seed();
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:user_amy2': 'present' } });
  const res = await read('user_amy');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.sessions, {}, 'not a session, not a title, not a date');
  assert.ok(!JSON.stringify(res.body).includes('Tuesday training'));
  assert.ok(!JSON.stringify(res.body).includes('user_amy2'));
});

test('one marked session travels, its unmarked neighbours do not', async () => {
  seed();
  kv.set(`app:publish:${CLUB}:group:${SEN}:sessions`, JSON.stringify([
    { id: 'tue', title: 'Tuesday training', date: '2026-08-04', type: 'Training' },
    { id: 'thu', title: 'Thursday training', date: '2026-08-06', type: 'Training' }]));
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:user_amy': 'present' } });
  await mark('u-head', { group: SEN, sessionId: 'thu', marks: { 'id:user_amy2': 'absent' } });
  const res = await read('user_amy');
  assert.deepEqual(Object.keys(res.body.sessions), ['tue-20260804']);
  assert.ok(!JSON.stringify(res.body).includes('Thursday'));
});

test('a forged ?group= is not even read — a player gets their OWN group', async () => {
  await seedRegister();
  await mark('u-head', { group: U18, sessionId: 'y-thu', marks: { 'id:user_kid': 'present' } });
  const forged = await read('user_amy', `&group=${U18}`);
  assert.equal(forged.body.groupId, SEN, 'their membership decides, not the query');
  assert.ok(!JSON.stringify(forged.body).includes('user_kid'), 'no U18 register reached them');
  // And the U18 player naming Seniors gets U18.
  const other = await read('user_kid', `&group=${SEN}`);
  assert.equal(other.body.groupId, U18);
  assert.deepEqual(other.body.sessions['y-thu-20260806'].marks, { 'id:user_kid': 'present' });
});

test('a forged player id, key or teamId changes nothing', async () => {
  await seedRegister();
  for (const q of ['&playerKey=id:user_amy2', '&selfKey=id:user_amy2', '&player=user_amy2',
                   '&userId=user_amy2', `&teamId=${OTHER}`, '&scope=group', '&scope=all']) {
    const res = await read('user_amy2' === 'x' ? 'user_amy' : 'user_amy', q);
    assert.equal(res.body.selfKey, 'id:user_amy', q);
    assert.deepEqual(res.body.sessions['tue-20260804'].marks, { 'id:user_amy': 'present' }, q);
  }
});

test('a player of another CLUB reaches nothing of ours', async () => {
  await seedRegister();
  const res = await read('user_far', `&group=${SEN}`);
  const wire = JSON.stringify(res.body || {});
  assert.ok(!wire.includes('user_amy'), 'another club’s register is unreachable');
  assert.ok(!wire.includes('Tuesday training'));
});

test('a player still cannot WRITE attendance — not even their own', async () => {
  await seedRegister();
  for (const body of [{ group: SEN, sessionId: 'tue', marks: { 'id:user_amy': 'present' } },
                      { sessionId: 'tue', marks: { 'id:user_amy': 'present' } }]) {
    assert.equal((await mark('user_amy', body)).statusCode, 403, 'marking oneself present is not a player action');
  }
  const back = await read('user_amy');
  assert.equal(back.body.sessions['tue-20260804'].marks['id:user_amy'], 'present', 'unchanged by the attempt');
});

test('a DELETE is refused with the staff answer, not silently self-scoped', async () => {
  await seedRegister();
  const res = await call('user_amy', 'DELETE', 'resource=attendance', { group: SEN });
  assert.notEqual(res.statusCode, 200);
});

test('staff who do not play get the staff refusal — self-read is for people who play', async () => {
  await seedRegister();
  const res = await read('u-mgr', `&group=${SEN}`);
  assert.equal(res.statusCode, 403, 'a manager holds `reports`, which is not attendance');
  assert.ok(!JSON.stringify(res.body).includes('user_amy'));
});

test('a player with no group set is told so, and is NOT shown an empty register', async () => {
  await seedRegister();
  const res = await read('user_lost');
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.ok, false);
  assert.match(String(res.body.error), /group has not been set/i);
  assert.ok(!('sessions' in res.body), 'no register at all — never an empty one, which would read as zero');
});

test('a bare "id:" can never be stored, so it can never be claimed', async () => {
  // A roster row with no id would contribute the key "id:" to the owned set.
  // It can match nothing: the register sanitiser refuses that key on the way in
  // and on the way out, so a hand-edited document cannot hand anyone a mark.
  seed();
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: [
    { id: '', name: 'Broken row', userId: 'user_amy' }] }));
  kv.set(`app:publish:${CLUB}:group:${SEN}:attendance`, JSON.stringify({ sessions: {
    'tue-20260804': { date: '2026-08-04', title: 'Tuesday training',
      marks: { 'id:': 'present', 'id:user_amy2': 'present' } } } }));
  const res = await read('user_amy');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.sessions, {}, 'a malformed key is nobody’s attendance');
  // And the write path refuses it outright.
  const w = await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:': 'present' } });
  assert.equal(w.statusCode, 400);
});

test('an unauthenticated caller is refused, and no session means no keys', async () => {
  await seedRegister();
  const res = response();
  await publishHandler({ method: 'GET', url: '/api/publish?resource=attendance',
    query: { resource: 'attendance' }, headers: {} }, res);
  assert.ok(res.statusCode >= 400, 'no session, no attendance');
  assert.ok(!JSON.stringify(res.body || {}).includes('user_amy'));
});

test('a coach keeps the whole group register, exactly as before', async () => {
  await seedRegister();
  const res = await read('u-head', `&group=${SEN}`);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.scope, undefined, 'the staff read is not the self read');
  assert.deepEqual(res.body.sessions['tue-20260804'].marks,
    { 'id:user_amy': 'present', 'id:user_amy2': 'absent', 'id:user_kid': 'present' });
});

// ═══════════════ AVAILABILITY IS NOT ATTENDANCE ═══════════════════════════

test('availability and attendance do not touch each other, in either direction', async () => {
  await seedRegister();
  const availKey = `app:availability:${CLUB}:group:${SEN}:tue`;

  // 1–4. Every combination of what was SAID and what was RECORDED survives.
  kv.set(availKey, JSON.stringify({ responses: {
    'user_amy':  { response: 'available' },      // available + present
    'user_amy2': { response: 'available' } } })); // available + absent
  let res = await read('user_amy');
  assert.equal(res.body.sessions['tue-20260804'].marks['id:user_amy'], 'present');
  res = await read('user_amy2');
  assert.equal(res.body.sessions['tue-20260804'].marks['id:user_amy2'], 'absent');

  kv.set(availKey, JSON.stringify({ responses: {
    'user_amy':  { response: 'unavailable' },     // unavailable + present
    'user_amy2': { response: 'unavailable' } } }));// unavailable + absent
  res = await read('user_amy');
  assert.equal(res.body.sessions['tue-20260804'].marks['id:user_amy'], 'present',
    'saying no and turning up is PRESENT');
  res = await read('user_amy2');
  assert.equal(res.body.sessions['tue-20260804'].marks['id:user_amy2'], 'absent');

  // 5. Availability alone produces no attendance at all.
  seed();
  kv.set(availKey, JSON.stringify({ responses: { 'user_amy': { response: 'unavailable' } } }));
  res = await read('user_amy');
  assert.deepEqual(res.body.sessions, {}, 'an availability answer is not a register entry');
});

test('recording attendance writes nothing into availability', async () => {
  seed();
  const availKey = `app:availability:${CLUB}:group:${SEN}:tue`;
  kv.set(availKey, JSON.stringify({ responses: { 'user_amy': { response: 'unavailable' } } }));
  const before = kv.get(availKey);
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:user_amy': 'present' } });
  assert.equal(kv.get(availKey), before, 'the answer they gave is untouched');
});

// ═══════════════ THE IDENTITY PREDICATE ═══════════════════════════════════

test('an empty user id owns no roster row — the predicate fails closed', () => {
  const { rosterRowBelongsToUser, legacyPlayerIdsForUser } = store;
  for (const uid of ['', null, undefined, '   ']) {
    assert.equal(rosterRowBelongsToUser({ id: 'p1' }, uid, new Set()), false, String(uid));
    assert.equal(rosterRowBelongsToUser({ userId: '' }, uid, new Set()), false, String(uid));
    assert.equal(legacyPlayerIdsForUser([{ userId: '', legacyPlayerId: 'x' }], uid).size, 0);
  }
});

test('the predicate matches only what the server itself recorded', () => {
  const { rosterRowBelongsToUser, legacyPlayerIdsForUser } = store;
  const legacy = legacyPlayerIdsForUser([
    { userId: 'user_amy', legacyPlayerId: 'inv-A' },
    { userId: 'user_bob', legacyPlayerId: 'inv-B' }], 'user_amy');
  assert.deepEqual([...legacy], ['inv-A'], 'only this account’s own legacy id');
  assert.equal(rosterRowBelongsToUser({ userId: 'user_amy' }, 'user_amy', legacy), true);
  assert.equal(rosterRowBelongsToUser({ id: 'user_amy' }, 'user_amy', legacy), true);
  assert.equal(rosterRowBelongsToUser({ id: 'inv-A' }, 'user_amy', legacy), true);
  assert.equal(rosterRowBelongsToUser({ legacyPlayerId: 'inv-A' }, 'user_amy', legacy), true);
  // and never somebody else's
  assert.equal(rosterRowBelongsToUser({ id: 'inv-B', legacyPlayerId: 'inv-B' }, 'user_amy', legacy), false);
  assert.equal(rosterRowBelongsToUser({ userId: 'user_bob' }, 'user_amy', legacy), false);
  // a NAME is never an identifier
  assert.equal(rosterRowBelongsToUser({ name: 'Amy Stone' }, 'user_amy', legacy), false);
});

// ═══════════════ THE PLAYER'S CARD ════════════════════════════════════════

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
const stripComments = s => s.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n');

const SEASON = ['2026-07-01', '2027-06-30'];
const sess = (date, marks, title) => ({ date, title: title || 'Tuesday training', marks });

/** The player's Training page, given what the server said. */
function card({ att = { scope: 'self', sessions: {} }, selfKey = 'id:user_amy',
                failed = false, reason = '' } = {}) {
  return new Function('cfg', `
    "use strict";
    const state = { seasonStart: '${SEASON[0]}', seasonEnd: '${SEASON[1]}', operationalGroupId: '' };
    let _attendance = cfg.att, _attendanceSelfKey = cfg.selfKey, _attendanceReason = cfg.reason;
    let _trainingSchedule = { slots: [] };
    const currentAttendance = () => cfg.att;
    const attendanceFailed = () => cfg.failed;
    const availToday = () => '2026-09-04';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    ${extractFn(html, 'attendanceOccurrenceId')}
    ${extractFn(html, 'attendanceHeldSessions')}
    ${extractFn(html, 'attendanceStats')}
    ${extractFn(html, 'matchDateLabel')}
    ${extractFn(html, 'myAttendanceCardHtml')}
    return myAttendanceCardHtml();
  `)({ att, selfKey, failed, reason });
}

test('zero attendance is never rendered as 0%', () => {
  const out = card({ att: { scope: 'self', sessions: {} } });
  assert.match(out, /No attendance recorded yet/);
  assert.ok(!/0%/.test(out), 'nothing recorded is not nought per cent');
  assert.ok(!/>0</.test(out), 'and no fabricated counters either');
});

test('loading, failure and genuinely empty are three different things', () => {
  const loading = card({ att: null, failed: false });
  assert.match(loading, /Loading…/);
  assert.ok(!/No attendance recorded/.test(loading));
  assert.ok(!/%/.test(loading));

  const broken = card({ att: null, failed: true });
  assert.match(broken, /Attendance unavailable — this is not a record of no attendance/);
  assert.ok(!/Loading/.test(broken));
  assert.ok(!/%/.test(broken), 'a failed read states no figure at all');

  const empty = card({ att: { scope: 'self', sessions: {} } });
  assert.match(empty, /No attendance recorded yet/);
  // (the word "unavailable" also appears in the card's permanent footnote about
  // availability answers, so the failure STATE is what is asserted here)
  assert.ok(!/Loading/.test(empty));
  assert.ok(!/Attendance unavailable/.test(empty));
});

test('the server’s own words explain a failure it can explain', () => {
  const out = card({ att: null, failed: true, reason: 'Your training group has not been set.' });
  assert.match(out, /Your training group has not been set\./);
});

test('no server-issued key means unavailable — never an empty register', () => {
  // Identity unresolved must fail CLOSED. Showing "nothing recorded" would be a
  // claim about attendance; the truth is that we do not know whose it is.
  const out = card({ att: { scope: 'self', sessions: { s1: sess('2026-08-04', { 'id:user_amy': 'present' }) } }, selfKey: '' });
  assert.match(out, /Attendance unavailable/);
  assert.ok(!/No attendance recorded yet/.test(out));
  assert.ok(!/%/.test(out));
});

test('a real register shows the coach’s four figures and the last day attended', () => {
  // Build AD: the server sends the held count beside the projection — here 3,
  // matching her three marked sessions, so the rate is 2 of 3 held.
  const out = card({ att: { scope: 'self', held: 3, sessions: {
    'tue-20260804': sess('2026-08-04', { 'id:user_amy': 'present' }),
    'thu-20260806': sess('2026-08-06', { 'id:user_amy': 'absent' }, 'Thursday training'),
    'tue-20260811': sess('2026-08-11', { 'id:user_amy': 'present' }) } } });
  assert.match(out, />67%</);
  assert.match(out, />2<[\s\S]*?Present/);
  assert.match(out, />1<[\s\S]*?Absent/);
  assert.match(out, />3<[\s\S]*?Recorded/);
  assert.match(out, /Of 3 training sessions held/, 'the denominator is named, and it is sessions held');
  assert.match(out, /Last training attended/);
  assert.match(out, /11 Aug · Tuesday training/, 'last PRESENT, not last recorded');
});

test('the rate divides by the sessions HELD, not by the player’s own marks', () => {
  // Eight held, marked present at five: the projection alone would say 100%.
  // The card must say 63% — the same number the coach's canonical table shows.
  const sessions = {};
  ['2026-07-07', '2026-07-14', '2026-07-21', '2026-07-28', '2026-08-04'].forEach(d => {
    sessions['tue-' + d.replace(/-/g, '')] = sess(d, { 'id:user_amy': 'present' });
  });
  const out = card({ att: { scope: 'self', held: 8, sessions } });
  assert.match(out, />63%</, 'attended ÷ held');
  assert.ok(!/>100%</.test(out), 'the decisions-recorded rate is dead');
  assert.match(out, /Of 8 training sessions held/);
});

test('a self document with no server count states no rate at all', () => {
  const out = card({ att: { scope: 'self', sessions: {
    'tue-20260804': sess('2026-08-04', { 'id:user_amy': 'present' }) } } });
  assert.ok(!/\d+%/.test(out), 'an unknown denominator is an unknown rate');
  assert.match(out, /No attendance recorded yet/);
});

test('the card says, in the player’s own portal, that this is not their availability', () => {
  const out = card({ att: { scope: 'self', sessions: {
    'tue-20260804': sess('2026-08-04', { 'id:user_amy': 'present' }) } } });
  assert.match(out, /not your availability answers/i);
  assert.match(out, /unavailable is not the same as being marked absent/i);
});

test('a caller with no attendance of their own renders nothing at all', () => {
  assert.equal(card({ att: { denied: true, sessions: {} } }), '', 'no card, and certainly no zero');
});

// ═══════════════ ONE SOURCE OF TRUTH ══════════════════════════════════════

test('there is still exactly ONE attendance aggregation, and the card uses it', () => {
  assert.equal(html.split('function attendanceStats(').length - 1, 1, 'one aggregation, not two');
  // CONTRACT CHANGE (Build G). playerAttendancePct() was on this list as a name
  // a SECOND aggregation might take. It now exists — but it is not one: it is a
  // thin per-player accessor that calls attendanceStats() and returns its
  // attendancePct, replacing a stale roster field that fabricated 0%. The rule
  // this list protects is "one aggregation", and it is asserted directly below.
  for (const forbidden of ['function playerAttendanceStats(', 'function myAttendanceStats(',
                           'function attendancePercent(']) {
    assert.ok(!html.includes(forbidden), forbidden + ' must not exist');
  }
  const pct = stripComments(extractFn(html, 'playerAttendancePct'));
  assert.match(pct, /return attendanceStats\(/, 'the accessor defers to the one aggregation');
  assert.ok(!/present|absent|recorded|Math\.round/.test(pct), 'it counts nothing of its own');
  const src = stripComments(extractFn(html, 'myAttendanceCardHtml'));
  assert.match(src, /attendanceStats\(att\.sessions, key, state\.seasonStart, state\.seasonEnd,/,
    'the player card reads the same aggregation the coach profile does');
  assert.match(src, /att\.scope === 'self' \? Number\(att\.held\)/,
    'and hands it the server’s held count — the projection cannot know the denominator');
  assert.ok(!/state\.trainingAttendance/.test(src), 'never the device-local store');
  assert.ok(!/state\.players/.test(src), 'and never the club-wide roster');
  assert.ok(!/player\.attendance|\.attendance\b/.test(src.replace(/attendanceStats|attendanceFailed|_attendance\w*|myAttendanceCardHtml/g, '')),
    'never the stale roster field, which is written 0 and never computed');
});

test('the player and the coach cannot disagree — same sessions, same figures', () => {
  // The coach aggregates the GROUP register under the player's key; the player
  // aggregates the SELF register the server cut for them. Same function, same
  // answer — that is what "one source of truth" has to mean here.
  const agg = new Function(`"use strict";
    let _trainingSchedule = { slots: [] };
    ${extractFn(html, 'attendanceOccurrenceId')}
    ${extractFn(html, 'attendanceHeldSessions')}
    ${extractFn(html, 'attendanceStats')} return attendanceStats;`)();
  const group = {
    'tue-20260804': sess('2026-08-04', { 'id:user_amy': 'present', 'id:user_amy2': 'absent' }),
    'thu-20260806': sess('2026-08-06', { 'id:user_amy': 'absent', 'id:user_amy2': 'present' }),
    'tue-20260811': sess('2026-08-11', { 'id:user_amy2': 'present' }) };
  const self = {
    'tue-20260804': sess('2026-08-04', { 'id:user_amy': 'present' }),
    'thu-20260806': sess('2026-08-06', { 'id:user_amy': 'absent' }) };
  const TODAY = '2026-09-04';
  const coachView = agg(group, 'id:user_amy', ...SEASON, TODAY);
  // Build AD: the self projection is deliberately partial (unmarked sessions
  // do not travel), so the player's reader passes the held count the SERVER
  // computed over the full document — and the two views become identical,
  // three-session denominator included.
  const playerView = agg(self, 'id:user_amy', ...SEASON, TODAY, coachView.held);
  assert.equal(coachView.held, 3, 'the denominator counts the unmarked session too');
  assert.equal(coachView.attendancePct, 33, '1 of 3 held — not 1 of 2 decisions');
  assert.deepEqual(playerView, coachView);
});

test('the device can never override the server’s attendance', () => {
  const src = stripComments(extractFn(html, 'loadAttendance'));
  assert.match(src, /_attendanceSelfKey = String\(data\?\.selfKey \|\| ''\)/,
    'the aggregation key is the SERVER’s answer');
  assert.match(src, /scope === 'self' && !_attendanceSelfKey/, 'and without one, it fails closed');
  assert.ok(!/localStorage|state\.trainingAttendance/.test(src), 'nothing local feeds the result');
  // A self read must not name a group: there is no parameter to tamper with.
  assert.match(src, /scope === 'group' && gid \? '&group='/);
});

test('who may ask for what is decided in ONE place, and a non-player asks for nothing', () => {
  const src = stripComments(extractFn(html, 'attendanceReadScope'));
  assert.match(src, /canI\('publish_training'\)/);
  assert.match(src, /membershipPlays\(/, 'playing is a membership fact, not a guess from the view');
  assert.match(src, /return 'none'/);
});

test('a server answer with no key is not cached — the client stays able to retry', async () => {
  // Belt: the card refuses to draw figures without a server-issued key.
  // Braces: loadAttendance must not FILE that answer as this group's document,
  // or currentAttendance() would stop asking and the player would be stuck on a
  // permanent failure that a later good read could never clear.
  const src = extractFn(html, 'loadAttendance');
  const run = new Function('cfg', `
    "use strict";
    const state = { operationalGroupId: 'g1' };
    let _attendance = null, _attendanceGroup = null, _attendanceLoading = false;
    let _attendanceFailed = null, _attendanceReason = '', _attendanceSelfKey = 'stale:device-key';
    const canI = () => false;
    const membershipPlays = () => true;
    const currentUser = () => ({ role: 'player' });
    const _myMembership = { playerGroupId: 'g1' };
    const render = () => {};
    const fetch = async () => ({ ok: true, json: async () => cfg.payload });
    ${extractFn(html, 'attendanceReadScope')}
    ${src}
    return loadAttendance().then(() => ({ _attendance, _attendanceGroup, _attendanceFailed, _attendanceSelfKey }));
  `);

  const bad = await run({ payload: { ok: true, scope: 'self', sessions: { s1: { marks: {} } } } });
  assert.equal(bad._attendance, null, 'no document filed');
  assert.equal(bad._attendanceGroup, null, 'and no group stamped, so the next render asks again');
  assert.equal(bad._attendanceFailed, 'g1');
  assert.equal(bad._attendanceSelfKey, '', 'the stale device key is cleared, never reused');

  const good = await run({ payload: { ok: true, scope: 'self', selfKey: 'id:user_amy', sessions: {} } });
  assert.equal(good._attendanceGroup, 'g1');
  assert.equal(good._attendanceFailed, null);
  assert.equal(good._attendanceSelfKey, 'id:user_amy');
});

// ═══════════════ BUILD AD — THE HELD COUNT TRAVELS, THE SESSIONS DO NOT ════
// A player's rate divides by sessions HELD (the canonical denominator), but
// their projection deliberately omits sessions they were never marked on. The
// server therefore sends the held COUNT — a number, never dates, titles or
// anybody's marks — mirroring the client's attendanceHeldSessions the same way
// attendanceOccurrenceId is already mirrored and pinned client/server.

test('the self read carries the group\'s held count — a number, not the sessions', async () => {
  seed();
  kv.set(`app:publish:${CLUB}:group:${SEN}:sessions`, JSON.stringify([
    { id: 'tue', title: 'Tuesday training', date: '2026-08-04', type: 'Training' },
    { id: 'thu', title: 'Thursday training', date: '2026-08-06', type: 'Training' }]));
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:user_amy': 'present' } });
  await mark('u-head', { group: SEN, sessionId: 'thu', marks: { 'id:user_amy2': 'absent' } });
  const res = await read('user_amy');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.held, 2, 'two sessions were held');
  assert.deepEqual(Object.keys(res.body.sessions), ['tue-20260804'],
    'the unmarked session STILL does not travel');
  assert.ok(!JSON.stringify(res.body).includes('Thursday'), 'the privacy contract stands');
});

test('a future-dated register is ledgered, not held', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:user_amy': 'present' } });
  const doc = JSON.parse(kv.get(`app:${'publish'}:${CLUB}:group:${SEN}:attendance`));
  doc.sessions['adhoc_camp-20990101'] = { date: '2099-01-01', title: 'Future camp', marks: {} };
  kv.set(`app:publish:${CLUB}:group:${SEN}:attendance`, JSON.stringify(doc));
  const res = await read('user_amy');
  assert.equal(res.body.held, 1, 'the future is planning, not history');
});

test('a bare legacy record and its dated twin are counted once', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:user_amy': 'present' } });
  const key = `app:publish:${CLUB}:group:${SEN}:attendance`;
  const doc = JSON.parse(kv.get(key));
  // the pre-migration shape: the same Tuesday under its bare legacy name
  doc.sessions['tue'] = { date: '2026-08-04', title: 'Tuesday training',
    marks: { 'id:user_amy2': 'absent' } };
  kv.set(key, JSON.stringify(doc));
  const res = await read('user_amy');
  assert.equal(res.body.held, 1, 'one Tuesday however many names it answers to');
});

test('the configured season bounds the held count', async () => {
  seed();
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Riverside',
    seasonStart: '2026-07-01', seasonEnd: '2027-06-30', fixtures: [] }));
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:user_amy': 'present' } });
  const key = `app:publish:${CLUB}:group:${SEN}:attendance`;
  const doc = JSON.parse(kv.get(key));
  doc.sessions['slot_old-20260505'] = { date: '2026-05-05', title: 'Last season', marks: {} };
  kv.set(key, JSON.stringify(doc));
  const res = await read('user_amy');
  assert.equal(res.body.held, 1, 'another season is another season\'s business');
});

test('the client and the server agree on the held count over one document', async () => {
  seed();
  kv.set(`app:publish:${CLUB}:group:${SEN}:sessions`, JSON.stringify([
    { id: 'tue', title: 'Tuesday training', date: '2026-08-04', type: 'Training' },
    { id: 'thu', title: 'Thursday training', date: '2026-08-06', type: 'Training' }]));
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:user_amy': 'present' } });
  await mark('u-head', { group: SEN, sessionId: 'thu', marks: { 'id:user_amy2': 'present' } });
  // the COACH read returns the full migrated document — the client enumerates it
  const coach = await read('u-head', '&group=' + SEN);
  const CLIENT = new Function('cfg', `
    "use strict";
    let _trainingSchedule = { slots: [] };
    ${extractFn(html, 'attendanceOccurrenceId')}
    ${extractFn(html, 'attendanceHeldSessions')}
    return attendanceHeldSessions(cfg.sessions, cfg.today, '', '').length;
  `)({ sessions: coach.body.sessions, today: new Date().toISOString().slice(0, 10) });
  const self = await read('user_amy');
  assert.equal(self.body.held, CLIENT,
    'one enumeration rule, mirrored — the twins must never drift');
});

test('an unplaceable legacy record is in nobody\'s denominator', async () => {
  seed();
  await mark('u-head', { group: SEN, sessionId: 'tue', marks: { 'id:user_amy': 'present' } });
  const key = `app:publish:${CLUB}:group:${SEN}:attendance`;
  const doc = JSON.parse(kv.get(key));
  doc.sessions['mystery'] = { date: '', title: 'Undated', marks: { 'id:user_amy': 'present' } };
  kv.set(key, JSON.stringify(doc));
  const res = await read('user_amy');
  assert.equal(res.body.held, 1, 'no provable date, no place in the denominator');
});
