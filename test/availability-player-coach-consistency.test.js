/**
 * BUILD R — player and coach availability can never contradict each other.
 *
 * Real production incident: Colin's own account showed AVAILABLE for a
 * training session while the coach board placed him under UNAVAILABLE.
 *
 * Root cause: one person can be stored as SEVERAL records in one session's
 * availability store — an invite-era record (keyed inv-…) beside the
 * authenticated write (keyed user_…). The shared resolver picked a match by
 * INSERTION ORDER (`Object.values(store).find(...)`), so the older
 * contradictory record beat the newest answer for every server reader, while
 * the player's own device rendered its local field. Two fixes, both pinned:
 *
 *   · the resolver prefers the newest respondedAt (stamped beats unstamped);
 *   · an authenticated write REMOVES the writer's other alias records — one
 *     canonical answer per person per session, healing lazily on write.
 *
 * Everything runs the REAL handler + REAL store against a mocked Upstash.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.consistency.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET')  r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (c === 'EXPIRE' || c === 'LPUSH' || c === 'LTRIM') r = 1;
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_identityStore.js');
const { resolveAvailabilityForIdentity } = await import('../api/_availabilityStore.js');
const { default: availability } = await import('../api/availability.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-boitsfort';
const SEN = 'grp_initial', U18 = 'grp_u18';
const COLIN_UID = 'user_colin_77';
const COLIN_INV = 'inv-colin9';

const MEMBERS = [
  { id: 'm-owner', teamId: CLUB, userId: 'u-owner', role: 'admin', status: 'active', isOwner: true, accessProfile: 'full' },
  { id: 'm-coach', teamId: CLUB, userId: 'u-coach', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: SEN, status: 'active' }], teams: [] } },
  { id: 'm-u18-c', teamId: CLUB, userId: 'u-u18-c', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'active' }], teams: [] } },
  { id: 'm-colin', teamId: CLUB, userId: COLIN_UID, role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-u18-p', teamId: CLUB, userId: 'user_youth_1', role: 'player', status: 'active', playerGroupId: U18 },
];

// TWO teams inside Seniors: availability must stay ONE pool regardless.
const STRUCTURE = { version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18',     type: 'general', status: 'active' },
  ],
  teams: [
    { id: 'team_first',  groupId: SEN, name: 'First XV',  status: 'active' },
    { id: 'team_second', groupId: SEN, name: 'Second XV', status: 'active' },
    { id: 'team_u18',    groupId: U18, name: 'U18',       status: 'active' },
  ] };

const SKEY = sid => `app:availability:${CLUB}:group:${SEN}:${sid}`;

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(
    MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set('app:identity:player_profiles', JSON.stringify([
    { userId: COLIN_UID, teamId: CLUB, displayName: 'Colin', legacyPlayerId: COLIN_INV },
    { userId: 'user_youth_1', teamId: CLUB, displayName: 'Youth One', legacyPlayerId: '' },
  ]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Boitsfort', fixtures: [] }));
}
/** The pre-registration contradiction: an invite-era record saying UNAVAILABLE,
 *  inserted FIRST so insertion-order resolution would return it. */
function seedStaleInviteRecord(sid = 'thu', respondedAt = '2026-08-20T10:00:00.000Z') {
  kv.set(SKEY(sid), JSON.stringify({
    [COLIN_INV]: { response: 'unavailable', reason: 'injury', respondedAt,
                   label: 'Colin', userId: '', playerId: COLIN_INV, legacyPlayerId: COLIN_INV },
  }));
}

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: CLUB, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
function res() {
  const out = { code: 200, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
async function call(userId, method, query, body) {
  const r = res();
  await availability({ method, query: query || {},
    headers: { cookie: cookies.get(userId) || '' }, body: body || {} }, r);
  return r.result;
}
const colinPost = (response, sid = 'thu', reason = '') =>
  call(COLIN_UID, 'POST', {}, { sessionId: sid, response, reason });
const coachBoard = async (who = 'u-coach', group = SEN) => {
  const r = await call(who, 'GET', { resolveRoster: '1', group });
  return r;
};
const colinOnBoard = board =>
  (board.body.resolved[COLIN_UID.toLowerCase()] || board.body.resolved[COLIN_INV.toLowerCase()] || {});

// ── THE REAL COLIN REGRESSION ───────────────────────────────────────────────

test('COLIN: submits Available over a stale contradictory invite record — a fresh coach read shows AVAILABLE', async () => {
  seed(); seedStaleInviteRecord('thu');
  await login(COLIN_UID); await login('u-coach'); await login('u-u18-c'); await login('user_youth_1');
  const w = await colinPost('available');
  assert.equal(w.code, 200, JSON.stringify(w.body));
  const board = await coachBoard();
  assert.equal(board.code, 200);
  assert.equal(colinOnBoard(board).thu?.response, 'available',
    'the coach must see the answer Colin actually gave — never the stale Unavailable');
});

test('COLIN: his own fresh-session self-read agrees with the coach', async () => {
  const r = await call(COLIN_UID, 'GET', { myResponse: '1' });
  assert.equal(r.body.responses.thu?.response, 'available', 'self-read resolves the same canonical answer');
});

test('the write REPLACED the alias record — one canonical answer per person per session', async () => {
  const stored = JSON.parse(kv.get(SKEY('thu')));
  const keys = Object.keys(stored);
  assert.deepEqual(keys, [COLIN_UID], 'the invite-era sibling was removed by the authenticated write');
  assert.equal(stored[COLIN_UID].response, 'available');
  // The write must carry its recency stamp — it is the resolver's ONLY way to
  // rank duplicate records, and the chase-up suppressor's only proof the
  // answer is recent. An unstamped write would lose to any stale stamped one.
  const stamp = String(stored[COLIN_UID].respondedAt || '');
  assert.match(stamp, /^\d{4}-\d{2}-\d{2}T/, 'stored answer is ISO-stamped');
  assert.ok(Date.now() - new Date(stamp).getTime() < 60000, 'and stamped NOW, not copied from the past');
});

test('resolver contract: the newest stamped answer wins even when the stale record is inserted first', () => {
  const bySession = { thu: {
    [COLIN_INV]: { response: 'unavailable', legacyPlayerId: COLIN_INV, userId: '', playerId: COLIN_INV,
                   respondedAt: '2026-08-20T10:00:00.000Z' },
    [COLIN_UID]: { response: 'available', userId: COLIN_UID, playerId: COLIN_UID, legacyPlayerId: COLIN_INV,
                   respondedAt: '2026-09-02T10:00:00.000Z' },
  } };
  const out = resolveAvailabilityForIdentity(bySession, { userId: COLIN_UID, playerId: COLIN_UID, legacyPlayerId: COLIN_INV });
  assert.equal(out.thu.response, 'available', 'recency, not insertion order');
});

test('resolver contract: a stamped answer beats an unstamped one, in either order', () => {
  const identity = { userId: COLIN_UID, playerId: COLIN_UID, legacyPlayerId: COLIN_INV };
  const stamped   = { response: 'available', userId: COLIN_UID, respondedAt: '2026-09-01T09:00:00.000Z' };
  const unstamped = { response: 'unavailable', legacyPlayerId: COLIN_INV };
  const a = resolveAvailabilityForIdentity({ thu: { x: unstamped, y: stamped } }, identity);
  const b = resolveAvailabilityForIdentity({ thu: { y: stamped, x: unstamped } }, identity);
  assert.equal(a.thu.response, 'available');
  assert.equal(b.thu.response, 'available');
});

test('resolver contract: with NO stamps anywhere, the first match stands (unchanged legacy behaviour)', () => {
  const identity = { userId: COLIN_UID };
  const out = resolveAvailabilityForIdentity({ thu: {
    a: { response: 'maybe', userId: COLIN_UID },
    b: { response: 'available', userId: COLIN_UID },
  } }, identity);
  assert.equal(out.thu.response, 'maybe');
});

// ── Transitions — every flip updates the same canonical record ─────────────

test('Available → Maybe → Unavailable → Available: coach follows every transition', async () => {
  for (const [resp, reason] of [['maybe', 'work'], ['unavailable', 'injury'], ['available', '']]) {
    const w = await colinPost(resp, 'thu', reason);
    assert.equal(w.code, 200);
    const board = await coachBoard();
    assert.equal(colinOnBoard(board).thu?.response, resp, `coach sees ${resp}`);
    const self = await call(COLIN_UID, 'GET', { myResponse: '1' });
    assert.equal(self.body.responses.thu?.response, resp, `Colin sees ${resp}`);
  }
});

test('repeated identical submissions are idempotent — one record, same answer', async () => {
  await colinPost('available'); await colinPost('available'); await colinPost('available');
  const stored = JSON.parse(kv.get(SKEY('thu')));
  assert.deepEqual(Object.keys(stored), [COLIN_UID]);
  assert.equal(stored[COLIN_UID].response, 'available');
  assert.equal(colinOnBoard(await coachBoard()).thu?.response, 'available');
});

test('an unanswered session stays no-reply — nothing is invented', async () => {
  const board = await coachBoard();
  assert.equal(colinOnBoard(board).tue, undefined, 'no answer for tue — the resolver returns none');
});

test('a different session id is a different canonical event — thu cannot answer tue', async () => {
  await colinPost('unavailable', 'tue', 'work');
  const board = await coachBoard();
  assert.equal(colinOnBoard(board).tue?.response, 'unavailable');
  assert.equal(colinOnBoard(board).thu?.response, 'available', 'thu untouched by the tue write');
});

// ── Group isolation, both directions ───────────────────────────────────────

test("a U18 coach cannot read the Seniors board", async () => {
  const r = await call('u-u18-c', 'GET', { resolveRoster: '1', group: SEN });
  assert.equal(r.code, 403);
});

test("Colin's Seniors answers never appear on the U18 board; a U18 answer never reaches Seniors", async () => {
  const u18Board = await coachBoard('u-u18-c', U18);
  assert.equal(u18Board.code, 200);
  assert.equal(Object.keys(u18Board.body.resolved).filter(k => k.includes('colin')).length, 0,
    'Colin (Seniors) absent from U18');
  await call('user_youth_1', 'POST', {}, { sessionId: 'thu', response: 'maybe' });
  const senBoard = await coachBoard('u-coach', SEN);
  assert.equal(Object.keys(senBoard.body.resolved).filter(k => k.includes('youth')).length, 0,
    'the U18 answer stays out of the Seniors board');
  assert.equal(colinOnBoard(await coachBoard('u-u18-c', U18)).thu, undefined, 'and Colin stays out of U18');
});

test('the group write lands on the GROUP key — playerGroupId decides, never the request body', async () => {
  const w = await call(COLIN_UID, 'POST', {}, { sessionId: 'thu', response: 'available', group: U18, teamId: 'evil' });
  assert.equal(w.code, 200);
  assert.ok(kv.has(SKEY('thu')), 'written into the SENIORS keyspace (his playing group)');
  // The U18 store may legitimately exist (the youth player answered above) —
  // what must be true is that COLIN's write never landed there.
  const u18Store = JSON.parse(kv.get(`app:availability:${CLUB}:group:${U18}:thu`) || '{}');
  assert.equal(Object.keys(u18Store).filter(k => k.includes('colin')).length, 0,
    "Colin's write never lands in U18, whatever the request body claims");
});

// ── Teams do not partition availability ────────────────────────────────────

test('U18-style multi-team group: First XV and Second XV share ONE pool — no side-scoped keys exist', async () => {
  const sideKeys = [...kv.keys()].filter(k => k.includes('availability') && /team_|side/.test(k));
  assert.equal(sideKeys.length, 0, 'availability is keyed by group + session only — sideId never partitions it');
  // The one Seniors pool serves both teams: the board read for the group
  // returns Colin's answer once, addressed to no side.
  const board = await coachBoard();
  assert.equal(colinOnBoard(board).thu?.response, 'available');
  assert.equal(board.body.resolved[COLIN_UID.toLowerCase()].sideId, undefined, 'no side in the resolved shape');
});

// ── Client half: honest failure ────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');
function extractFn(source, name) {
  let start = source.indexOf('    function ' + name + '(');
  if (start === -1) start = source.indexOf('    async function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found');
  let i = start;
  while (i < source.length && source[i] !== '{') i++;
  let depth = 0;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    i++;
  }
  throw new Error('function ' + name + ' — no closing brace');
}

function clientScope({ status: httpStatus }) {
  const body =
    '"use strict";\n' +
    'let toasts = []; function showToast(t) { toasts.push(t); }\n' +
    'let renders = 0; function render() { renders++; }\n' +
    'let saves = []; function saveState(l) { saves.push(l); }\n' +
    'function checkServerSession() { return Promise.resolve(); }\n' +
    'function setAuthTab() {}\n' +
    'let _lastBody = null;\n' +
    'let _availAuthPromptedAt = 0;\n' +
    'function fetch(url, init) { _lastBody = JSON.parse(init.body); return Promise.resolve({ status: ' + httpStatus + ', ok: ' + (httpStatus === 200) + ' }); }\n' +
    extractFn(html, 'captureAvailabilityFields') + '\n' +
    extractFn(html, 'saveAvailabilityResponseToServer') + '\n' +
    'return { save: saveAvailabilityResponseToServer, capture: captureAvailabilityFields,\n' +
    '         toasts: () => toasts, get lastBody() { return _lastBody; } };\n';
  return new Function(body)();
}

test('FAILED WRITE: a 401 reverts the just-written local answer — the UI cannot claim a save that did not happen', async () => {
  const sc = clientScope({ status: 401 });
  const rec = { trainingThursday: 'unavailable', trainingThursdayReason: 'injury',
                trainingThursdayRespondedAt: '2026-08-20T10:00:00.000Z' };
  const revert = sc.capture([rec], 'trainingThursday');
  // the tap applies optimistically…
  rec.trainingThursday = 'available'; rec.trainingThursdayReason = '';
  rec.trainingThursdayRespondedAt = new Date().toISOString();
  await sc.save('thu', 'available', '', revert);
  assert.equal(rec.trainingThursday, 'unavailable', 'refused write → prior answer restored');
  assert.equal(rec.trainingThursdayReason, 'injury', 'prior reason restored');
  assert.equal(rec.trainingThursdayRespondedAt, '2026-08-20T10:00:00.000Z', 'prior stamp restored');
  assert.ok(sc.toasts().some(t => /not saved/i.test(t)), 'the player is told honestly');
});

test('FAILED WRITE: a field that did not exist before the tap is removed again on revert', async () => {
  const sc = clientScope({ status: 403 });
  const rec = {};
  const revert = sc.capture([rec], 'trainingThursday');
  rec.trainingThursday = 'available'; rec.trainingThursdayRespondedAt = new Date().toISOString();
  await sc.save('thu', 'available', '', revert);
  assert.ok(!('trainingThursday' in rec), 'no phantom answer left behind');
});

test('SUCCESSFUL WRITE: nothing reverts, and the payload carries the canonical session id', async () => {
  const sc = clientScope({ status: 200 });
  const rec = { trainingThursday: 'unavailable' };
  const revert = sc.capture([rec], 'trainingThursday');
  rec.trainingThursday = 'available';
  await sc.save('thu', 'available', '', revert);
  assert.equal(rec.trainingThursday, 'available', 'accepted write keeps the new answer');
  assert.deepEqual(sc.lastBody, { response: 'available', reason: '', sessionId: 'thu' });
});

test("legacy 'injured' still maps to unavailable + injury reason on the wire", async () => {
  const sc = clientScope({ status: 200 });
  await sc.save('thu', 'injured', '');
  assert.deepEqual(sc.lastBody, { response: 'unavailable', reason: 'injury', sessionId: 'thu' });
});

test('the client wiring passes the revert from the tap through to the save', () => {
  const spa = extractFn(html, 'setPlayerAvailability');
  assert.ok(spa.includes('captureAvailabilityFields'), 'the tap captures prior state');
  assert.ok(spa.includes('saveAvailabilityResponseToServer(sessionId, status, reason, _revert)'),
    'and hands the revert to the save');
  const saa = extractFn(html, 'setAllAvailable');
  assert.ok(saa.includes("saveAvailabilityResponseToServer(session.id, 'available', '', _revert)"),
    'the all-available shortcut does the same per session');
});
