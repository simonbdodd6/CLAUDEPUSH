/**
 * Match Day — SUBSTITUTIONS, the playing-time foundation.
 *
 * A match sheet identifies its players by NAME (state.formationNames /
 * state.benchPlayers), which is not an identity. Match Day already solves that
 * with mcPersonKey(), which resolves a sheet name to "id:<userId or roster id>",
 * preferring the durable MEMBERSHIP userId, and falls back to "nm:<name>" only
 * for a name matching no roster player. A substitution event stores that
 * existing key — no second identity system — plus the display name as a
 * snapshot, so a historical sheet still reads correctly after a rename.
 *
 * Events live on the match record, which the server already keys per fixture
 * AND side and validates with assertFixtureBelongsToClub /
 * assertSideBelongsToClub / assertFixtureSideCoherence, under PUBLISH_SQUADS.
 * That is why they go there rather than into a new store: a separate one would
 * have had to re-earn tenant isolation, fixture identity, side identity and
 * permission gating, all of which this record already has.
 *
 * NOT to be confused with state.subPlan — a pre-match planning scratchpad with
 * free-typed names, a minute that may literally be "?", no fixture, no group
 * and no server. It is hidden in the commercial Beta and untouched by this
 * build.
 *
 * The fixture model carries NO duration, so full time is stored with the match
 * record and defaults to 80. Minutes are never inferred from anything else.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.subs.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

// ── Client harness: the real functions, over a real sheet ────────────────────

function extractFn(source, name) {
  let start = source.indexOf('    function ' + name + '(');
  if (start === -1) start = source.indexOf('    async function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found in index.html');
  let i = source.indexOf('(', start), paren = 0;
  for (; i < source.length; i++) {
    if (source[i] === '(') paren++;
    else if (source[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = source.indexOf('{', i), depth = 0;
  for (let k = brace; k < source.length; k++) {
    if (source[k] === '{') depth++;
    else if (source[k] === '}') { depth--; if (!depth) return source.slice(start, k + 1); }
  }
  throw new Error('function ' + name + ' — no closing brace');
}
function extractConst(source, name) {
  const i = source.indexOf('    const ' + name + ' ');
  if (i === -1) throw new Error('const ' + name + ' not found');
  return source.slice(i, source.indexOf(';', i) + 1);
}

/** A club, a sheet, and the real match functions over them. */
function buildMatch({ starters = 15, bench = 3, players = null, matchCentre = {} } = {}) {
  const roster = players || Array.from({ length: starters + bench }, (_, i) =>
    ({ id: 'p' + (i + 1), name: 'Player ' + (i + 1), userId: 'u' + (i + 1) }));
  const formation = {};
  for (let i = 0; i < starters; i++) formation[String(i + 1)] = roster[i] ? roster[i].name : '';
  const benchNames = Array(8).fill('');
  for (let i = 0; i < bench; i++) benchNames[i] = roster[starters + i] ? roster[starters + i].name : '';

  return new Function(`
    "use strict";
    const state = { players: ${JSON.stringify(roster)}, users: [],
                    matchCentre: ${JSON.stringify(matchCentre)},
                    formationNames: ${JSON.stringify(formation)},
                    benchPlayers: ${JSON.stringify(benchNames)} };
    ${extractConst(html, 'MATCH_MINUTES_DEFAULT')}
    ${extractConst(html, 'MATCH_MINUTES_MAX')}
    ${extractConst(html, 'rugbySlots')}
    function findPlayerByName(n) {
      const want = String(n || '').trim().toLowerCase();
      return state.players.find(p => String(p.name || '').trim().toLowerCase() === want) || null;
    }
    ${extractFn(html, 'mcPersonKey')}
    ${extractFn(html, 'matchFullTimeMinutes')}
    ${extractFn(html, 'matchSubstitutions')}
    ${extractFn(html, 'matchSquadPeople')}
    ${extractFn(html, 'matchMinuteValue')}
    ${extractFn(html, 'matchPersonOnPitchAt')}
    ${extractFn(html, 'substitutionProblem')}
    ${extractFn(html, 'matchMinutesByPerson')}
    return { state, mcPersonKey, matchFullTimeMinutes, matchSubstitutions, matchSquadPeople,
             matchPersonOnPitchAt, substitutionProblem, matchMinutesByPerson };
  `)();
}

const sub = (id, minute, offKey, onKey, extra = {}) =>
  ({ id, minute, offKey, onKey, offName: '', onName: '', at: '2026-01-01T00:00:0' + (id.length % 10) + 'Z', ...extra });

// ── 1. Identity ──────────────────────────────────────────────────────────────

test('a substitution names people by the DURABLE membership identity', () => {
  const m = buildMatch();
  const people = m.matchSquadPeople();
  assert.equal(people.length, 18, '15 starters + 3 bench');
  assert.equal(people[0].key, 'id:u1', 'the membership userId, not the roster row id');
  assert.equal(people[0].name, 'Player 1', 'with the displayed name kept alongside');
  assert.equal(people[15].role, 'bench');
});

test('the roster row id is used only when there is no membership behind the name', () => {
  const m = buildMatch({ starters: 2, bench: 0,
    players: [{ id: 'p1', name: 'Has Account', userId: 'u1' }, { id: 'p2', name: 'No Account' }] });
  const people = m.matchSquadPeople();
  assert.equal(people.find(p => p.name === 'Has Account').key, 'id:u1');
  assert.equal(people.find(p => p.name === 'No Account').key, 'id:p2',
    'falls back to the roster id — never to nothing');
});

test('the squad is exactly this sheet — a club-mate not named on it is not in it', () => {
  const m = buildMatch({ starters: 2, bench: 0 });
  m.state.players.push({ id: 'p99', name: 'Not Selected', userId: 'u99' });
  const keys = m.matchSquadPeople().map(p => p.key);
  assert.deepEqual(keys, ['id:u1', 'id:u2']);
  assert.ok(!keys.includes('id:u99'), 'the roster is not the squad');
});

test('an empty slot and a duplicate name never become squad members', () => {
  const m = buildMatch({ starters: 3, bench: 0 });
  m.state.formationNames['2'] = '';                       // blank slot
  m.state.formationNames['3'] = m.state.formationNames['1']; // same person twice
  const people = m.matchSquadPeople();
  assert.equal(people.length, 1, 'one person, once');
  assert.equal(people[0].key, 'id:u1');
});

// ── 2. Validation ────────────────────────────────────────────────────────────

const K = n => 'id:u' + n;

test('a substitution needs both players', () => {
  const m = buildMatch(); const people = m.matchSquadPeople();
  assert.match(m.substitutionProblem({ offKey: '', onKey: K(16), minute: 55 }, [], people, 80), /coming off/);
  assert.match(m.substitutionProblem({ offKey: K(1), onKey: '', minute: 55 }, [], people, 80), /coming on/);
});

test('a player cannot replace themselves', () => {
  const m = buildMatch(); const people = m.matchSquadPeople();
  assert.match(m.substitutionProblem({ offKey: K(1), onKey: K(1), minute: 55 }, [], people, 80),
    /cannot replace themselves/);
});

test('the minute must be a whole number inside the match', () => {
  const m = buildMatch(); const people = m.matchSquadPeople();
  const p = minute => m.substitutionProblem({ offKey: K(1), onKey: K(16), minute }, [], people, 80);
  for (const bad of [-1, 81, 999, 'x', null, undefined, 55.5, NaN]) {
    assert.match(String(p(bad)), /Minute must be between 0 and 80/, `rejected: ${bad}`);
  }
  assert.equal(p(0), null, 'a 0th-minute change is legitimate');
  assert.equal(p(80), null, 'and so is one on the whistle');
  // The trap: minute 0 is real, so an EMPTY field must not coerce into it.
  assert.equal(p('0'), null, 'a typed "0" is a real answer');
  assert.match(String(p('')), /Minute must be/, 'an empty field is not minute 0');
  assert.match(String(p(null)), /Minute must be/, 'and neither is a missing one');
});

test('neither player may be someone outside this team sheet', () => {
  const m = buildMatch(); const people = m.matchSquadPeople();
  assert.match(m.substitutionProblem({ offKey: 'id:uSENIOR', onKey: K(16), minute: 55 }, [], people, 80),
    /not on this team sheet/);
  assert.match(m.substitutionProblem({ offKey: K(1), onKey: 'id:uSENIOR', minute: 55 }, [], people, 80),
    /not on this team sheet/);
});

test('a player already off cannot come off again', () => {
  const m = buildMatch(); const people = m.matchSquadPeople();
  const first = [sub('a', 55, K(1), K(16))];
  assert.match(m.substitutionProblem({ offKey: K(1), onKey: K(17), minute: 60 }, first, people, 80),
    /not on the pitch at 60/);
});

test('a player already on cannot come on again', () => {
  const m = buildMatch(); const people = m.matchSquadPeople();
  const first = [sub('a', 55, K(1), K(16))];
  assert.match(m.substitutionProblem({ offKey: K(2), onKey: K(16), minute: 60 }, first, people, 80),
    /already on the pitch at 60/);
});

test('a replacement CAN be replaced later — that is a real match, not an edge case', () => {
  const m = buildMatch(); const people = m.matchSquadPeople();
  const first = [sub('a', 55, K(1), K(16))];
  assert.equal(m.substitutionProblem({ offKey: K(16), onKey: K(17), minute: 70 }, first, people, 80), null);
});

test('a bench player cannot come off before coming on', () => {
  const m = buildMatch(); const people = m.matchSquadPeople();
  assert.match(m.substitutionProblem({ offKey: K(16), onKey: K(17), minute: 20 }, [], people, 80),
    /not on the pitch at 20/);
});

// ── 3. Ordering ──────────────────────────────────────────────────────────────

test('substitutions read in chronological order however they were entered', () => {
  const m = buildMatch({ matchCentre: { substitutions: [
    sub('c', 70, K(2), K(17)), sub('a', 20, K(3), K(18)), sub('b', 55, K(1), K(16)),
  ] } });
  assert.deepEqual(m.matchSubstitutions().map(s => s.minute), [20, 55, 70]);
});

test('two changes in the same minute keep the order they were recorded in', () => {
  const m = buildMatch({ matchCentre: { substitutions: [
    { id: 'second', minute: 55, offKey: K(2), onKey: K(17), at: '2026-01-01T00:02:00Z' },
    { id: 'first',  minute: 55, offKey: K(1), onKey: K(16), at: '2026-01-01T00:01:00Z' },
  ] } });
  assert.deepEqual(m.matchSubstitutions().map(s => s.id), ['first', 'second']);
});

// ── 4. Minutes ───────────────────────────────────────────────────────────────

test('a starter never replaced plays the whole match', () => {
  const m = buildMatch();
  const mins = m.matchMinutesByPerson(m.matchSquadPeople(), [], 80);
  assert.equal(mins[K(2)], 80);
});

test('a starter replaced at 55 has played 55', () => {
  const m = buildMatch();
  const mins = m.matchMinutesByPerson(m.matchSquadPeople(), [sub('a', 55, K(1), K(16))], 80);
  assert.equal(mins[K(1)], 55);
});

test('a replacement plays from the minute they came on', () => {
  const m = buildMatch();
  const mins = m.matchMinutesByPerson(m.matchSquadPeople(), [sub('a', 55, K(1), K(16))], 80);
  assert.equal(mins[K(16)], 25, '80 − 55');
});

test('an unused replacement has played nothing', () => {
  const m = buildMatch();
  const mins = m.matchMinutesByPerson(m.matchSquadPeople(), [sub('a', 55, K(1), K(16))], 80);
  assert.equal(mins[K(18)], 0);
});

test('a player on, off and on again has their intervals added up', () => {
  const m = buildMatch();
  const subs = [
    sub('a', 20, K(1),  K(16)),   // 16 on at 20
    sub('b', 40, K(16), K(17)),   // 16 off at 40  → 20 minutes
    sub('c', 60, K(17), K(16)),   // 16 on again at 60 → +20 to the whistle
  ];
  const mins = m.matchMinutesByPerson(m.matchSquadPeople(), subs, 80);
  assert.equal(mins[K(16)], 40, '20 + 20');
  assert.equal(mins[K(17)], 20, '40 → 60');
  assert.equal(mins[K(1)], 20);
});

test('the minutes always balance: fifteen players on the pitch for the whole match', () => {
  // The strongest single check on the arithmetic — it can only hold if every
  // interval is opened and closed exactly once.
  const m = buildMatch();
  const subs = [sub('a', 55, K(1), K(16)), sub('b', 60, K(2), K(17)), sub('c', 70, K(16), K(18))];
  const total = Object.values(m.matchMinutesByPerson(m.matchSquadPeople(), subs, 80))
    .reduce((a, b) => a + b, 0);
  assert.equal(total, 15 * 80);
});

test('a shorter match is respected — 80 is a default, not an assumption', () => {
  const m = buildMatch();
  const mins = m.matchMinutesByPerson(m.matchSquadPeople(), [sub('a', 40, K(1), K(16))], 70);
  assert.equal(mins[K(2)],  70, 'a full age-grade match, not 80');
  assert.equal(mins[K(1)],  40);
  assert.equal(mins[K(16)], 30, '70 − 40, not 80 − 40');
});

test('full time comes from the match record, and falls back to 80 only when absent', () => {
  assert.equal(buildMatch().matchFullTimeMinutes(), 80, 'absent → the rugby default');
  assert.equal(buildMatch({ matchCentre: { matchMinutes: 70 } }).matchFullTimeMinutes(), 70);
  assert.equal(buildMatch({ matchCentre: { matchMinutes: 100 } }).matchFullTimeMinutes(), 100, 'extra time');
  for (const bad of [0, -5, 'x', null, 1000, 12.5]) {
    assert.equal(buildMatch({ matchCentre: { matchMinutes: bad } }).matchFullTimeMinutes(), 80,
      `a nonsense length (${bad}) falls back rather than corrupting every total`);
  }
});

test('nobody can be credited with more than the match itself', () => {
  const m = buildMatch();
  const mins = m.matchMinutesByPerson(m.matchSquadPeople(), [], 80);
  Object.values(mins).forEach(v => assert.ok(v >= 0 && v <= 80));
});

// ── 5. The write path guards ─────────────────────────────────────────────────

test('recording refuses unless the sheet is bound to its fixture', () => {
  const src = extractFn(html, 'substitutionAdd');
  assert.match(src, /if \(!fixtureId\) return showToast/, 'a fixture must be chosen');
  assert.match(src, /String\(_mcSheetFixtureId \?\? '\\u0000'\) !== fixtureId/,
    'and the sheet must already belong to it — the same guard saveCoachDraft uses');
  assert.match(src, /if \(!isCoach\(\)\) return showToast/, 'coach only');
  assert.match(src, /substitutionProblem\(/, 'every event goes through validation');
});

test('an event stores the durable key AND the name it was displayed under', () => {
  const src = extractFn(html, 'substitutionAdd');
  assert.match(src, /offKey, onKey,/);
  assert.match(src, /offName: off\.name, onName: on\.name/);
  assert.match(src, /minute,/);
  assert.match(src, /at: new Date\(\)\.toISOString\(\)/);
});

test('removing an event asks first, and recalculates', () => {
  const src = extractFn(html, 'substitutionRemove');
  assert.match(src, /ceConfirm\(/);
  assert.match(src, /filter\(s => s\.id !== id\)/);
  assert.match(src, /substitutionsPersist/);
});

test('full time cannot be set below a substitution already recorded', () => {
  const src = extractFn(html, 'substitutionsSetFullTime');
  assert.match(src, /Number\(s\.minute\) > n/, 'that would strand an event outside the match');
});

test('every change is persisted through the fixture-scoped match record', () => {
  const src = extractFn(html, 'substitutionsPersist');
  assert.match(src, /saveState\(/);
  assert.match(src, /syncSquadToServer\(\)/, 'the same fixture+side scoped write Publish uses');
  const sync = extractFn(html, 'syncSquadToServer');
  assert.match(sync, /fixtureId: matchCentreFixtureId\(\)/);
  assert.match(sync, /sideId: matchCentreSideId\(\)/);
});

test('selecting another fixture never carries the previous match\'s events across', () => {
  const hydrate = extractFn(html, 'mcHydrateSelectedFixture');
  assert.match(hydrate, /substitutions: \[\], matchMinutes: MATCH_MINUTES_DEFAULT/,
    'the sheet is cleared the moment it binds to a new fixture');
  assert.match(hydrate, /Array\.isArray\(squad && squad\.substitutions\) \? squad\.substitutions : \[\]/,
    'and refilled only from THAT fixture\'s own stored record');
});

test('the hidden pre-match sub-plan scratchpad is left exactly as it was', () => {
  // Free-typed names, a minute that may be "?", no fixture, no group, no server.
  // It is a different feature and this build must not have touched it.
  assert.match(extractFn(html, 'addSubPlan'), /minute:min\|\|"\?"/);
  assert.ok(html.includes('function removeSubPlan('));
  const add = extractFn(html, 'addSubPlan');
  assert.ok(!/mcPersonKey|substitutionProblem|matchCentre\.substitutions/.test(add),
    'the two must not have become entangled');
});

// ── 6. Server: persistence, scoping, isolation ───────────────────────────────

const kv = new Map();
const globToRe = pattern =>
  new RegExp(`^${pattern.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const re = at >= 0 ? globToRe(String(args[at + 1])) : null;
    result = ['0', [...kv.keys()].filter(k => !re || re.test(k))];
  }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-subs', OTHER = 'club-rival';
const SENIORS_FX = 'fx_sen', U18_FX = 'fx_u18', FOREIGN_FX = 'fx_rival';

const MEMBERS = [
  { id: 'm-coach',  teamId: CLUB,  userId: 'u-coach',  role: 'coach',  status: 'active', accessProfile: 'full' },
  { id: 'm-player', teamId: CLUB,  userId: 'u-player', role: 'player', status: 'active' },
  { id: 'm-rival',  teamId: OTHER, userId: 'u-rival',  role: 'coach',  status: 'active', accessProfile: 'full' },
];

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club' }, { id: OTHER, name: 'Rival' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(
    MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Club', fixtures: [
    { id: SENIORS_FX, opposition: 'Mons',  date: '2026-08-22', status: 'scheduled', groupId: 'grp_sen' },
    { id: U18_FX,     opposition: 'Kituro', date: '2026-08-22', status: 'scheduled', groupId: 'grp_u18' },
  ] }));
  kv.set(`app:club:${OTHER}`, JSON.stringify({ clubName: 'Rival', fixtures: [
    { id: FOREIGN_FX, opposition: 'Elsewhere', date: '2026-08-22', status: 'scheduled' },
  ] }));
}
const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: m.teamId, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
async function post(userId, body) {
  const r = res();
  await publishHandler({ method: 'POST', query: {}, headers: { cookie: cookies.get(userId) || '' }, body }, r);
  return r.result;
}
async function getSquad(userId, fixture) {
  const r = res();
  await publishHandler({ method: 'GET', query: { type: 'squad', fixture },
    headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}
const sheet = (fixtureId, extra = {}) => ({
  published: true, opposition: 'Mons', fixtureId,
  formationNames: { '1': 'Player 1' }, benchPlayers: ['Player 16'],
  ...extra,
});
const SUBS = [{ id: 'sub_1', minute: 55, offKey: 'id:u1', onKey: 'id:u16',
                offName: 'Player 1', onName: 'Player 16', at: '2026-08-22T15:55:00.000Z' }];

test('SERVER: substitutions are stored with the match and read back', async () => {
  seed(); await login('u-coach');
  const w = await post('u-coach', { type: 'squad', data: sheet(SENIORS_FX, { substitutions: SUBS, matchMinutes: 80 }) });
  assert.equal(w.code, 200);
  const back = await getSquad('u-coach', SENIORS_FX);
  assert.equal(back.body.squad.substitutions.length, 1);
  assert.equal(back.body.squad.substitutions[0].offKey, 'id:u1');
  assert.equal(back.body.squad.substitutions[0].onName, 'Player 16');
  assert.equal(back.body.squad.matchMinutes, 80);
});

test('SERVER: a fixture\'s substitutions belong to that fixture alone', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: sheet(SENIORS_FX, { substitutions: SUBS }) });
  await post('u-coach', { type: 'squad', data: sheet(U18_FX, { opposition: 'Kituro', substitutions: [] }) });

  const seniors = await getSquad('u-coach', SENIORS_FX);
  const u18     = await getSquad('u-coach', U18_FX);
  assert.equal(seniors.body.squad.substitutions.length, 1, 'the Seniors match kept its event');
  assert.equal(u18.body.squad.substitutions.length, 0, 'and the U18 match has none of its own');
});

test('SERVER: another club can never read or write these events', async () => {
  seed(); await login('u-coach'); await login('u-rival');
  await post('u-coach', { type: 'squad', data: sheet(SENIORS_FX, { substitutions: SUBS }) });

  const stolen = await getSquad('u-rival', SENIORS_FX);
  assert.ok(stolen.code >= 400, 'a rival naming our fixture is refused, not answered');

  const forged = await post('u-rival', { type: 'squad', data: sheet(SENIORS_FX, { substitutions: SUBS }) });
  assert.ok(forged.code >= 400, 'and cannot write to it either');

  const ours = await getSquad('u-coach', SENIORS_FX);
  assert.equal(ours.body.squad.substitutions.length, 1, 'our record is untouched');
});

test('SERVER: a player cannot record substitutions', async () => {
  seed(); await login('u-coach'); await login('u-player');
  const attempt = await post('u-player', { type: 'squad', data: sheet(SENIORS_FX, { substitutions: SUBS }) });
  assert.ok(attempt.code >= 400, 'recording needs PUBLISH_SQUADS');
});

test('SERVER: nonsense events are dropped, never stored', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: sheet(SENIORS_FX, { matchMinutes: 80, substitutions: [
    { id: 'ok',      minute: 55,  offKey: 'id:u1', onKey: 'id:u16' },
    { id: 'later',   minute: 999, offKey: 'id:u2', onKey: 'id:u17' },   // outside the match
    { id: 'negative',minute: -1,  offKey: 'id:u3', onKey: 'id:u18' },
    { id: 'same',    minute: 60,  offKey: 'id:u4', onKey: 'id:u4'  },   // self-substitution
    { id: 'nokey',   minute: 60,  offKey: '',      onKey: 'id:u19' },
    { id: 'float',   minute: 60.5,offKey: 'id:u5', onKey: 'id:u20' },
    { id: 'nullmin', minute: null, offKey: 'id:u6', onKey: 'id:u21' },   // must NOT become minute 0
    { id: 'blankmin',minute: '',   offKey: 'id:u7', onKey: 'id:u22' },
    'not an object', null,
  ] }) });
  const back = await getSquad('u-coach', SENIORS_FX);
  assert.deepEqual(back.body.squad.substitutions.map(s => s.id), ['ok'],
    'only the valid event survives the boundary');
});

test('SERVER: a nonsense match length falls back rather than corrupting the record', async () => {
  seed(); await login('u-coach');
  for (const [given, expected] of [[70, 70], [100, 100], [0, 80], [-5, 80], [9999, 80], ['x', 80], [undefined, 80]]) {
    await post('u-coach', { type: 'squad', data: sheet(SENIORS_FX, { matchMinutes: given }) });
    const back = await getSquad('u-coach', SENIORS_FX);
    assert.equal(back.body.squad.matchMinutes, expected, `matchMinutes ${given} → ${expected}`);
  }
});

test('SERVER: the number of events a match can carry is bounded', async () => {
  seed(); await login('u-coach');
  const many = Array.from({ length: 200 }, (_, i) =>
    ({ id: 's' + i, minute: i % 80, offKey: 'id:a' + i, onKey: 'id:b' + i }));
  await post('u-coach', { type: 'squad', data: sheet(SENIORS_FX, { substitutions: many }) });
  const back = await getSquad('u-coach', SENIORS_FX);
  assert.ok(back.body.squad.substitutions.length <= 40, 'capped, never unbounded');
});

test('SERVER: stored events come back chronological whatever order they arrived in', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: sheet(SENIORS_FX, { substitutions: [
    { id: 'c', minute: 70, offKey: 'id:u2', onKey: 'id:u17', at: '2026-01-01T00:03:00Z' },
    { id: 'a', minute: 20, offKey: 'id:u3', onKey: 'id:u18', at: '2026-01-01T00:01:00Z' },
    { id: 'b', minute: 55, offKey: 'id:u1', onKey: 'id:u16', at: '2026-01-01T00:02:00Z' },
  ] }) });
  const back = await getSquad('u-coach', SENIORS_FX);
  assert.deepEqual(back.body.squad.substitutions.map(s => s.minute), [20, 55, 70]);
});

test('SERVER: an existing squad record without substitutions still loads', async () => {
  // Every record written before this build. Absent must read as "none", never
  // as an error and never as somebody else's events.
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: sheet(SENIORS_FX) });
  const back = await getSquad('u-coach', SENIORS_FX);
  assert.deepEqual(back.body.squad.substitutions, []);
  assert.equal(back.body.squad.matchMinutes, 80);
});

test('SERVER: publishing the sheet again keeps the events already recorded on it', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: sheet(SENIORS_FX, { substitutions: SUBS }) });
  await post('u-coach', { type: 'squad', data: sheet(SENIORS_FX, { substitutions: SUBS, gamePlan: 'Kick long' }) });
  const back = await getSquad('u-coach', SENIORS_FX);
  assert.equal(back.body.squad.substitutions.length, 1);
  assert.equal(back.body.squad.gamePlan, 'Kick long');
});

// ── 7. Nothing else moved ────────────────────────────────────────────────────

test('squad selection and the sheet itself are untouched', () => {
  for (const name of ['normalizeSquadSelection', 'selectionFindForFixture', 'appearancesCalculated',
                      'mcPersonKey', 'saveCoachDraft', 'syncSquadToServer', 'publishSquad']) {
    assert.ok(html.includes(`function ${name}(`), `${name} must still exist`);
  }
  const sanitise = html.slice(0, 0); // server assertions are above
  assert.match(extractFn(html, 'matchSquadPeople'), /state\.formationNames|state\.benchPlayers/,
    'the squad is read from the sheet, never from the club-wide roster');
  assert.ok(!/state\.players/.test(extractFn(html, 'matchSquadPeople')),
    'club-wide state.players must not decide who is in this match');
});

test('previous Core builds remain intact', () => {
  for (const name of ['overviewRoster', 'availabilityNonResponders', 'setAppearance',
                      'clubUsesPlayerGroups', 'unassignedRosterPlayers', 'playerGroupIdOf']) {
    assert.ok(html.includes(`function ${name}(`), `${name} must still exist`);
  }
});

// ── 8. An unread match record is not an empty one ────────────────────────────

test('no substitution can be written before this match\'s record has been read', () => {
  // The real danger, found in the browser: binding to a fixture clears the
  // previous match's events for display, and if the read then fails the panel
  // is empty while the server still holds them. Recording into that blank would
  // push a record containing only the new event and destroy the stored ones.
  for (const name of ['substitutionAdd', 'substitutionRemove', 'substitutionsSetFullTime']) {
    assert.match(extractFn(html, name), /_mcMatchRecordLoadedFor !== /,
      `${name} must wait for the match record`);
    assert.match(extractFn(html, name), /Still loading this match/,
      `${name} must say why it refused`);
  }
});

test('the flag is cleared on binding and set only by a landed read', () => {
  const hydrate = extractFn(html, 'mcHydrateSelectedFixture');
  const bindAt = hydrate.indexOf('_mcMatchRecordLoadedFor = null');
  const setAt  = hydrate.indexOf('_mcMatchRecordLoadedFor = String(id)');
  assert.ok(bindAt > 0, 'cleared when the sheet binds to a fixture');
  assert.ok(setAt > bindAt, 'and set afterwards, by the response');
  // It must be set inside the squad-response branch, never unconditionally.
  const squadBranch = hydrate.slice(hydrate.indexOf('if (sRes.ok) {'));
  assert.match(squadBranch, /_mcMatchRecordLoadedFor = String\(id\)/,
    'only a successful squad read counts as having read the record');
});

test('the panel says it is loading rather than showing an empty list', () => {
  const panel = extractFn(html, 'renderSubstitutionsPanel');
  assert.match(panel, /_mcMatchRecordLoadedFor !== fixtureId/);
  assert.match(panel, /Loading this match/);
  // …and the loading check comes before anything that would render events.
  assert.ok(panel.indexOf('Loading this match') < panel.indexOf('No substitutions recorded yet'),
    'the placeholder must not be reachable while unread');
});

test('the recorded events are distinguished from the pre-match plan panel', () => {
  // "Substitute plan" renders in Match Centre today, immediately above this
  // card. Two similarly-named panels beside each other is a real hazard, so
  // this one says what it is for.
  const panel = extractFn(html, 'renderSubstitutionsPanel');
  assert.match(panel, /What actually happened/);
  assert.match(panel, /match minutes are counted from/);
});
