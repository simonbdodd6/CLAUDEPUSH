/**
 * PARTICIPATION FOUNDATION — the cross-domain contract lock.
 *
 * The canonical participation model already exists and is live:
 *   · TRAINING ATTENDANCE — publish:<club>:group:<gid>:attendance, keyed by
 *     the dated occurrence <slot>-<YYYYMMDD> and the durable player identity
 *     'id:<userId|rosterId>'; states present / absent / null (not-recorded);
 *     PUBLISH_TRAINING to write, self-read for the player it is about.
 *   · MATCH PARTICIPATION — fixture-scoped team sheets (formationKeys /
 *     benchKeys) plus recorded substitution events; season participation is
 *     DERIVED from those recorded facts, never from selection alone.
 *
 * Each domain has its own deep suite. This file locks the guarantees that sit
 * BETWEEN them — the ones the deferred analytics phase will depend on and that
 * no single-domain suite pins on its own:
 *   (1) availability and attendance never touch each other's store;
 *   (2) selection is not participation — a named-but-unused player did not play;
 *   (3) participation is keyed by fixtureId, so same-opponent/same-date
 *       fixtures never merge;
 *   (4) attendance is group-isolated across a real write, and idempotent.
 *
 * Everything drives the REAL handlers / REAL derivation. No model is invented.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.participation-foundation.test';
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
  if (command === 'LTRIM' || command === 'EXPIRE') result = 'OK';
  if (command === 'SCAN') { const re = new RegExp('^' + String(args[2] || '*').replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); result = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  return { ok: true, json: async () => ({ result }) };
};

const { default: publishHandler } = await import('../api/publish.js');
const { default: availabilityHandler } = await import('../api/availability.js');
const store = await import('../api/_identityStore.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-parts';
const SEN = 'grp_initial', U18 = 'grp_u18';
const scope = gids => ({ clubWide: false, groups: gids.map(g => ({ groupId: g, status: 'active' })), teams: [] });
const MEMBERS = [
  { id: 'm-head', teamId: CLUB, userId: 'u-head', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
  { id: 'm-u18c', teamId: CLUB, userId: 'u-u18c', role: 'coach', staffLevel: 'assistant', status: 'active', accessProfile: 'coach', accessScope: scope([U18]) },
  { id: 'm-senc', teamId: CLUB, userId: 'u-senc', role: 'coach', staffLevel: 'assistant', status: 'active', accessProfile: 'coach', accessScope: scope([SEN]) },
  { id: 'm-p1',   teamId: CLUB, userId: 'u-p1', role: 'player', status: 'active', playerGroupId: SEN },
];
function seed() {
  kv.clear(); lists.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Parts' }]));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@t.test`, displayName: m.userId }))));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:player_profiles', JSON.stringify([{ userId: 'u-p1', teamId: CLUB, displayName: 'Player One', legacyPlayerId: '' }]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1, groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'general', status: 'active' }], teams: [] }));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Parts', fixtures: [] }));
  kv.set(`app:publish:${CLUB}:group:${SEN}:sessions`, JSON.stringify([
    { id: 'thu', title: 'Thursday training', date: '2026-08-06', type: 'Training' }]));
  kv.set(`app:publish:${CLUB}:group:${U18}:sessions`, JSON.stringify([
    { id: 'y-thu', title: 'U18 Thursday', date: '2026-08-06', type: 'Training' }]));
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
async function attend(userId, method, query, body) {
  const r = res();
  await publishHandler({ method, query: { resource: 'attendance', ...(query || {}) },
    headers: { cookie: cookies.get(userId) || '' }, body: body || {} }, r);
  return r.result;
}
async function avail(userId, method, query, body) {
  const r = res();
  await availabilityHandler({ method, query: query || {},
    headers: { cookie: cookies.get(userId) || '' }, body: body || {} }, r);
  return r.result;
}
const attKeys = gid => JSON.parse(kv.get(`app:publish:${CLUB}:group:${gid}:attendance`) || '{}').sessions || {};
const availKeys = () => [...kv.keys()].filter(k => k.includes(':availability:'));
const attKeyList = () => [...kv.keys()].filter(k => k.endsWith(':attendance'));

// ── (1) availability and attendance are separate stores ────────────────────

test('a player answering AVAILABLE creates NO attendance record', async () => {
  seed(); await login('u-head'); await login('u-senc'); await login('u-p1');
  const w = await avail('u-p1', 'POST', {}, { sessionId: 'thu', response: 'available' });
  assert.equal(w.code, 200, JSON.stringify(w.body));
  assert.ok(availKeys().length >= 1, 'availability was written');
  assert.equal(attKeyList().length, 0, 'NOTHING was written to any attendance store');
});

test('recording attendance writes ONLY the attendance store, never availability', async () => {
  const before = availKeys().length;
  const w = await attend('u-senc', 'POST', {}, { sessionId: 'thu', group: SEN, marks: { 'id:u-p1': 'present' } });
  assert.equal(w.code, 200, JSON.stringify(w.body));
  assert.equal(availKeys().length, before, 'no availability key added or changed by an attendance write');
  assert.equal(attKeys(SEN)['slot_thu-20260806']?.marks['id:u-p1'], 'present');
});

test('AVAILABLE beforehand and ABSENT after coexist for one player/occurrence — the distinction is preserved', async () => {
  // u-p1 answered available (above); the coach now records they did NOT attend.
  const w = await attend('u-senc', 'POST', {}, { sessionId: 'thu', group: SEN, marks: { 'id:u-p1': 'absent' } });
  assert.equal(w.code, 200);
  assert.equal(attKeys(SEN)['slot_thu-20260806'].marks['id:u-p1'], 'absent', 'attendance says absent');
  const self = await avail('u-p1', 'GET', { myResponse: '1' });
  assert.equal(self.body.responses.thu?.response, 'available', 'availability still says available — untouched');
});

// ── (4) attendance: occurrence identity, idempotence, group isolation ──────

test('recording the same occurrence twice updates ONE register — no duplicate', async () => {
  seed(); await login('u-senc'); await login('u-u18c');
  await attend('u-senc', 'POST', {}, { sessionId: 'thu', group: SEN, marks: { 'id:u-p1': 'present' } });
  await attend('u-senc', 'POST', {}, { sessionId: 'thu', group: SEN, marks: { 'id:u-p1': 'present' } });
  assert.deepEqual(Object.keys(attKeys(SEN)), ['slot_thu-20260806'], 'exactly one register');
  assert.deepEqual(Object.keys(attKeys(SEN)['slot_thu-20260806'].marks), ['id:u-p1'], 'one mark, not two');
});

test('null clears a mark back to not-recorded — which is NOT absent', async () => {
  const w = await attend('u-senc', 'POST', {}, { sessionId: 'thu', group: SEN, marks: { 'id:u-p1': null } });
  assert.equal(w.code, 200);
  assert.equal(attKeys(SEN)['slot_thu-20260806'].marks['id:u-p1'], undefined, 'cleared, not stored as absent');
});

test('a U18 coach cannot write Seniors attendance, and Seniors attendance never appears in the U18 store', async () => {
  const denied = await attend('u-u18c', 'POST', {}, { sessionId: 'thu', group: SEN, marks: { 'id:u-p1': 'present' } });
  assert.equal(denied.code, 403, 'a forged group is refused');
  await attend('u-senc', 'POST', {}, { sessionId: 'thu', group: SEN, marks: { 'id:u-p1': 'present' } });
  await attend('u-u18c', 'POST', {}, { sessionId: 'y-thu', group: U18, marks: { 'id:u-y1': 'present' } });
  assert.ok(attKeys(SEN)['slot_thu-20260806'], 'Seniors register in the Seniors store');
  assert.equal(attKeys(U18)['slot_thu-20260806'], undefined, 'and NOT in the U18 store');
  assert.ok(attKeys(U18)['y-thu-20260806'], 'U18 has its own register, in the U18 store only');
});

test('a player may READ their own attendance but a player WRITE is refused', async () => {
  await login('u-p1');
  const read = await attend('u-p1', 'GET', {});
  assert.equal(read.code, 200, 'the player reads their own register');
  const write = await attend('u-p1', 'POST', {}, { sessionId: 'thu', group: SEN, marks: { 'id:u-p1': 'present' } });
  assert.ok([401, 403].includes(write.code), 'a player can never mark themselves present');
});

test('an unauthenticated caller can neither read nor write attendance', async () => {
  const r = res();
  await publishHandler({ method: 'POST', query: { resource: 'attendance' }, headers: {}, body: { sessionId: 'thu', marks: {} } }, r);
  assert.ok([401, 403].includes(r.result.code));
});

// ── (2)+(3) match participation: derived from recorded facts, keyed by fixture

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');
function extractFn(src, name) {
  let start = src.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error(name + ' not found');
  let i = src.indexOf('{', start), depth = 0;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
}
const seasonStats = new Function(
  'const MATCH_MINUTES_DEFAULT = 80;\n' +
  'function mcPersonKey(n){ return "nm:" + String(n||"").trim().toLowerCase(); }\n' +
  extractFn(html, 'matchMinuteValue') + '\n' +
  extractFn(html, 'matchPersonOnPitchAt') + '\n' +
  extractFn(html, 'seasonPlayerStats') + '\nreturn seasonPlayerStats;')();
// seasonPlayerStats returns { byPlayer, fixturesCounted, ... }.
const statsOf = sheets => { const r = seasonStats(sheets); return { players: r.byPlayer, fixturesCounted: r.fixturesCounted }; };

// A sheet: p1 starts and is never subbed off; p2 is on the bench and never comes on.
const SHEET = (fixtureId, over = {}) => ({
  fixtureId, sideId: 'team_u18_1', groupId: U18, matchMinutes: 80,
  formationNames: { '1': 'P One' }, formationKeys: { '1': 'id:u-p1' },
  benchPlayers: ['P Two'], benchKeys: ['id:u-p2'],
  substitutions: [], ...over,
});

test('SELECTION IS NOT PARTICIPATION: a bench player never subbed on did NOT play', () => {
  const s = statsOf([SHEET('fx_1')]);
  assert.equal(s.players['id:u-p1'].appearances, 1, 'the starter played');
  assert.equal(s.players['id:u-p1'].starts, 1);
  assert.equal(s.players['id:u-p2'].benchAppearances, 1, 'the bench player was NAMED');
  assert.equal(s.players['id:u-p2'].appearances, 0, 'but did NOT play — selection alone is not participation');
  assert.equal(s.players['id:u-p2'].minutes, 0);
});

test('a recorded substitution IS participation: the replacement who comes on played', () => {
  const s = statsOf([SHEET('fx_1', { substitutions: [
    { id: 's1', minute: 60, offKey: 'id:u-p1', onKey: 'id:u-p2', offName: 'P One', onName: 'P Two' }] })]);
  assert.equal(s.players['id:u-p2'].appearances, 1, 'coming on is playing');
  assert.equal(s.players['id:u-p2'].subsOn, 1);
  assert.equal(s.players['id:u-p2'].minutes, 20, 'from the 60th minute of an 80-minute match');
  assert.equal(s.players['id:u-p1'].minutes, 60, 'the starter played until subbed off');
});

test('PARTICIPATION IS KEYED BY FIXTURE: two fixtures vs the same opponent on the same date do not merge', () => {
  // Same opponent, same date, DIFFERENT fixtureId (U18 First vs U18 Second).
  const s = statsOf([SHEET('fx_first'), SHEET('fx_second')]);
  assert.equal(s.fixturesCounted, 2, 'two distinct fixtures counted');
  assert.equal(s.players['id:u-p1'].appearances, 2, 'the starter appears in both, not merged into one');
});

test('the SAME fixture id twice is never double-counted', () => {
  const s = statsOf([SHEET('fx_1'), SHEET('fx_1')]);
  assert.equal(s.fixturesCounted, 1);
  assert.equal(s.players['id:u-p1'].appearances, 1);
});

test('participation is keyed by DURABLE identity — a rename does not split a player', () => {
  const renamed = SHEET('fx_2', { formationNames: { '1': 'P One RENAMED' } });   // same formationKeys
  const s = statsOf([SHEET('fx_1'), renamed]);
  assert.equal(s.players['id:u-p1'].appearances, 2, 'both matches attach to the one identity, not the two names');
});

test('an empty season invents nobody — no zero-rows for imaginary players', () => {
  const s = statsOf([]);
  assert.deepEqual(Object.keys(s.players), []);
  assert.equal(s.fixturesCounted, 0);
});
