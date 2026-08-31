/**
 * SEASON PLAYER STATISTICS — the season-wide source, and the arithmetic on it.
 *
 * THE SOURCE. Season playing time is computed from the PUBLISHED Match Centre
 * team sheets a club has actually stored — one per fixture (and per side) under
 * `publish:<teamId>:fixture:<fx>[:side:<s>]:squad`. The client never decides
 * which matches happened and never reconstructs a season from device state.
 *
 * WHAT COUNTS AS PLAYED — and why it is not the stored `status`. The fixtures
 * resource accepts only 'create' and 'import': nothing ever writes 'completed'
 * to the server, so the coach's "Mark complete" button updates their own device
 * and is overwritten by the next fixtures sync. The product already had ONE
 * definition, in fixtureDisplayStatus — a fixture reads as Completed when its
 * status says so OR its date has passed. That rule is now shared by the badge,
 * the aggregation and the server, rather than each keeping its own opinion.
 * Cancelled and postponed are excluded whatever the date says.
 *
 * IDENTITY. Every player is resolved through mcPersonKey → playerMatchKey, the
 * canonical identity the substitution build established, so appearances,
 * minutes and substitutions describe the same people. Nothing is merged by
 * name; a sheet name matching no roster record keeps its own key and is
 * reported as unresolved.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.season.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

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
const extractConst = (src, n) => { const i = src.indexOf('    const ' + n + ' '); return src.slice(i, src.indexOf(';', i) + 1); };

const ROSTER = [
  { id: 'p1', name: 'Starter Finish', userId: 'u1' },
  { id: 'p2', name: 'Starter Off',    userId: 'u2' },
  { id: 'p3', name: 'Bench Unused',   userId: 'u3' },
  { id: 'p4', name: 'Bench On',       userId: 'u4' },
  { id: 'p5', name: 'On Then Off',    userId: 'u5' },
  { id: 'p6', name: 'No Account'                   },
  { id: 'p7', name: 'Starter Finish', userId: 'u7' },   // SAME NAME, different person
];

function scope(players = ROSTER) {
  return new Function(`
    "use strict";
    const state = { players: ${JSON.stringify(players)} };
    function findPlayerByName(n) { const w = String(n || '').trim().toLowerCase();
      return state.players.find(p => String(p.name || '').trim().toLowerCase() === w) || null; }
    ${extractConst(html, 'MATCH_MINUTES_DEFAULT')}
    ${extractFn(html, 'playerMatchKey')}
    ${extractFn(html, 'mcPersonKey')}
    ${extractFn(html, 'matchMinuteValue')}
    ${extractFn(html, 'fixtureHasBeenPlayed')}
    ${extractFn(html, 'seasonPlayerStats')}
    return { state, playerMatchKey, mcPersonKey, fixtureHasBeenPlayed, seasonPlayerStats };
  `)();
}

const K = n => 'id:u' + n;
const sheet = (fixtureId, extra = {}) => ({
  fixtureId, matchMinutes: 80,
  formationNames: { '1': 'Starter Finish', '2': 'Starter Off' },
  benchPlayers: ['Bench Unused', 'Bench On', 'On Then Off'],
  substitutions: [], ...extra,
});
const ev = (minute, offKey, onKey, at = 'z') => ({ id: 'e' + minute, minute, offKey, onKey, at });

// ── 1. What counts as played ─────────────────────────────────────────────────

const TODAY = '2026-08-29';

test('a match counts as played when its date has passed', () => {
  const s = scope();
  assert.equal(s.fixtureHasBeenPlayed({ date: '2026-08-01' }, TODAY), true);
  assert.equal(s.fixtureHasBeenPlayed({ date: '2026-09-30' }, TODAY), false, 'the future has not happened');
  assert.equal(s.fixtureHasBeenPlayed({ date: TODAY }, TODAY), false, 'today is not over');
  assert.equal(s.fixtureHasBeenPlayed({}, TODAY), false, 'a fixture with no date says nothing');
});

test('an explicit completed status counts even before the date', () => {
  const s = scope();
  assert.equal(s.fixtureHasBeenPlayed({ date: '2026-09-30', status: 'completed' }, TODAY), true);
});

test('cancelled and postponed never count, whatever the date says', () => {
  const s = scope();
  assert.equal(s.fixtureHasBeenPlayed({ date: '2026-08-01', status: 'cancelled' }, TODAY), false);
  assert.equal(s.fixtureHasBeenPlayed({ date: '2026-08-01', status: 'postponed' }, TODAY), false);
});

test('the badge and the statistics share ONE definition of played', () => {
  const badge = extractFn(html, 'fixtureDisplayStatus');
  assert.match(badge, /fixtureHasBeenPlayed\(fx, today\)/,
    'the fixture badge asks the shared predicate');
  assert.ok(!/fx\.date < today/.test(badge), 'and no longer carries its own copy of the rule');
});

// ── 2. Every role in one match ───────────────────────────────────────────────

test('a starter who finishes: one appearance, one start, the full match', () => {
  const r = scope().seasonPlayerStats([sheet('fx1')]);
  const p = r.byPlayer[K(1)];
  assert.deepEqual(
    { a: p.appearances, s: p.starts, b: p.benchAppearances, on: p.subsOn, off: p.subsOff, m: p.minutes, pct: p.playingTimePct },
    { a: 1, s: 1, b: 0, on: 0, off: 0, m: 80, pct: 100 });
});

test('a bench player who never enters: a bench appearance, no appearance, no minutes', () => {
  const r = scope().seasonPlayerStats([sheet('fx1')]);
  const p = r.byPlayer[K(3)];
  assert.deepEqual(
    { a: p.appearances, s: p.starts, b: p.benchAppearances, m: p.minutes, pct: p.playingTimePct },
    { a: 0, s: 0, b: 1, m: 0, pct: 0 },
    'being named is not the same as playing');
});

test('a starter substituted off plays to that minute', () => {
  const r = scope().seasonPlayerStats([sheet('fx1', { substitutions: [ev(55, K(1), K(4))] })]);
  const p = r.byPlayer[K(1)];
  assert.equal(p.minutes, 55);
  assert.equal(p.subsOff, 1);
  assert.equal(p.starts, 1);
  assert.equal(p.playingTimePct, 69, '55 of 80');
});

test('a replacement who comes on plays from that minute, and it is an appearance', () => {
  const r = scope().seasonPlayerStats([sheet('fx1', { substitutions: [ev(55, K(1), K(4))] })]);
  const p = r.byPlayer[K(4)];
  assert.deepEqual(
    { a: p.appearances, s: p.starts, b: p.benchAppearances, on: p.subsOn, m: p.minutes },
    { a: 1, s: 0, b: 1, on: 1, m: 25 });
});

test('a replacement who comes on and goes off again is credited only for the interval', () => {
  const r = scope().seasonPlayerStats([sheet('fx1', {
    substitutions: [ev(20, K(1), K(5), 'a'), ev(50, K(5), K(4), 'b')] })]);
  const p = r.byPlayer[K(5)];
  assert.equal(p.minutes, 30, '20 → 50');
  assert.equal(p.subsOn, 1);
  assert.equal(p.subsOff, 1);
  assert.equal(p.appearances, 1);
});

test('a player who comes on, goes off and returns has their intervals summed', () => {
  // Permitted by the recorder (front row, blood, HIA), so the arithmetic must
  // handle it rather than the model pretending it cannot happen.
  const r = scope().seasonPlayerStats([sheet('fx1', {
    substitutions: [ev(20, K(1), K(4), 'a'), ev(40, K(4), K(5), 'b'), ev(60, K(5), K(4), 'c')] })]);
  const p = r.byPlayer[K(4)];
  assert.equal(p.minutes, 40, '20→40 plus 60→80');
  assert.equal(p.subsOn, 2);
  assert.equal(p.subsOff, 1);
  assert.equal(p.appearances, 1, 'still ONE appearance in one match');
});

// ── 3. Match length ──────────────────────────────────────────────────────────

test('a 70-minute match is measured against 70, not 80', () => {
  const r = scope().seasonPlayerStats([sheet('fx1', { matchMinutes: 70,
    substitutions: [ev(40, K(1), K(4))] })]);
  assert.equal(r.byPlayer[K(2)].minutes, 70, 'an unchanged starter played the whole 70');
  assert.equal(r.byPlayer[K(2)].playingTimePct, 100);
  assert.equal(r.byPlayer[K(1)].minutes, 40);
  assert.equal(r.byPlayer[K(4)].minutes, 30, '70 − 40, never 80 − 40');
});

test('a missing or nonsense match length falls back to the established default', () => {
  const s = scope();
  for (const bad of [undefined, null, 0, -5, 'x', 12.5]) {
    const r = s.seasonPlayerStats([sheet('fx1', { matchMinutes: bad })]);
    assert.equal(r.byPlayer[K(1)].minutes, 80, `matchMinutes ${bad} → the 80-minute default`);
  }
});

test('playing time is measured against the matches a player was NAMED in', () => {
  // Not against the whole season — that would punish a player for matches they
  // were never selected for.
  const r = scope().seasonPlayerStats([
    sheet('fx1'),
    { fixtureId: 'fx2', matchMinutes: 70, formationNames: { '1': 'Bench On' }, benchPlayers: [], substitutions: [] },
  ]);
  assert.equal(r.byPlayer[K(4)].possibleMinutes, 150, 'named in both: 80 + 70');
  assert.equal(r.byPlayer[K(4)].minutes, 70, 'bench in fx1 (unused), started fx2');
  assert.equal(r.byPlayer[K(4)].playingTimePct, 47);
});

// ── 4. Across a season ───────────────────────────────────────────────────────

test('the same player accumulates across several matches', () => {
  const r = scope().seasonPlayerStats([
    sheet('fx1', { substitutions: [ev(55, K(1), K(4))] }),
    sheet('fx2'),
    sheet('fx3', { matchMinutes: 70 }),
  ]);
  const p = r.byPlayer[K(1)];
  assert.equal(p.appearances, 3);
  assert.equal(p.starts, 3);
  assert.equal(p.minutes, 55 + 80 + 70);
  assert.equal(r.fixturesCounted, 3);
});

test('a fixture is never counted twice, however many sheets name it', () => {
  const r = scope().seasonPlayerStats([sheet('fx1'), sheet('fx1'), sheet('fx1')]);
  assert.equal(r.fixturesCounted, 1);
  assert.equal(r.byPlayer[K(1)].appearances, 1);
  assert.equal(r.byPlayer[K(1)].minutes, 80);
});

test('an empty season produces nothing, not zeros for imaginary players', () => {
  const r = scope().seasonPlayerStats([]);
  assert.deepEqual(r.byPlayer, {});
  assert.equal(r.fixturesCounted, 0);
  assert.deepEqual(r.unresolved, []);
});

// ── 5. Identity ──────────────────────────────────────────────────────────────

test('a player is keyed by the durable identity, so a rename does not split them', () => {
  const before = scope().seasonPlayerStats([sheet('fx1')]);
  const renamed = scope(ROSTER.map(p => p.id === 'p1' ? { ...p, name: 'Renamed Entirely' } : p));
  const after = renamed.seasonPlayerStats([{ ...sheet('fx2'), formationNames: { '1': 'Renamed Entirely', '2': 'Starter Off' } }]);
  assert.ok(before.byPlayer[K(1)], 'counted under id:u1 before');
  assert.ok(after.byPlayer[K(1)],  'and still under id:u1 after the rename');
});

test('a recreated roster row keeps the identity where an account exists', () => {
  const rebuilt = scope(ROSTER.map(p => p.id === 'p1' ? { ...p, id: 'p999999' } : p));
  const r = rebuilt.seasonPlayerStats([sheet('fx1')]);
  assert.ok(r.byPlayer[K(1)], 'the membership userId carried the history, not the roster row');
});

test('a player with no account is counted under their roster row, honestly', () => {
  const r = scope().seasonPlayerStats([{ fixtureId: 'fx1', matchMinutes: 80,
    formationNames: { '1': 'No Account' }, benchPlayers: [], substitutions: [] }]);
  assert.equal(r.byPlayer['id:p6'].appearances, 1);
  assert.deepEqual(r.unresolved, [], 'a roster row IS an identity');
});

test('a sheet name matching no roster record is reported, never absorbed', () => {
  const r = scope().seasonPlayerStats([{ fixtureId: 'fx1', matchMinutes: 80,
    formationNames: { '1': 'Ghost Player' }, benchPlayers: [], substitutions: [] }]);
  assert.deepEqual(r.unresolved, ['Ghost Player']);
  assert.equal(r.byPlayer['nm:ghost player'].appearances, 1, 'counted under its own honest key');
  assert.equal(r.byPlayer[K(1)], undefined, 'and never folded into a real player');
});

test('two players sharing a name are never merged', () => {
  const s = scope();
  assert.notEqual(s.playerMatchKey(ROSTER[0]), s.playerMatchKey(ROSTER[6]));
  // The sheet names one of them; only that one is credited.
  const r = s.seasonPlayerStats([sheet('fx1')]);
  assert.ok(r.byPlayer[K(1)], 'the resolved player is counted');
  assert.equal(r.byPlayer[K(7)], undefined, 'the namesake gets nothing they did not earn');
});

// ── 6. Malformed input ───────────────────────────────────────────────────────

test('malformed substitution events are ignored, never crashed on', () => {
  const r = scope().seasonPlayerStats([sheet('fx1', { substitutions: [
    null, 'nonsense', 42, {},
    { minute: 'x', offKey: K(1), onKey: K(4) },
    { minute: null, offKey: K(1), onKey: K(4) },
    ev(60, K(1), K(4)),                                     // the only valid one
  ] })]);
  assert.equal(r.byPlayer[K(1)].minutes, 60);
  assert.equal(r.byPlayer[K(4)].minutes, 20);
});

test('an event naming somebody not on this sheet cannot affect it', () => {
  const r = scope().seasonPlayerStats([sheet('fx1', {
    substitutions: [ev(55, 'id:uSTRANGER', K(4)), ev(60, K(1), 'id:uGHOST')] })]);
  assert.equal(r.byPlayer[K(1)].minutes, 80, 'the starter was never actually replaced');
  assert.equal(r.byPlayer[K(4)].minutes, 0,  'and the bench player never came on');
});

test('malformed sheets are skipped without taking the season with them', () => {
  const r = scope().seasonPlayerStats([null, 'nonsense', {}, { fixtureId: '' }, sheet('fx1')]);
  assert.equal(r.fixturesCounted, 1);
  assert.equal(r.byPlayer[K(1)].appearances, 1);
});

// ── 7. The server contract ───────────────────────────────────────────────────

const kv = new Map();
const globToRe = p => new RegExp(`^${p.split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET') result = kv.has(args[0]) ? kv.get(args[0]) : null;
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

const CLUB = 'club-season', OTHER = 'club-rival';
const SEN = 'grp_sen', U18 = 'grp_u18';
const PAST = '2026-08-01', FUTURE = '2027-06-01';

const MEMBERS = [
  { id: 'm-coach',  teamId: CLUB,  userId: 'u-coach',  role: 'coach', status: 'active', accessProfile: 'full' },
  // The scope shape the access layer actually reads (see _accessScope.js).
  { id: 'm-u18',    teamId: CLUB,  userId: 'u-u18c',   role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'active' }], teams: [] } },
  { id: 'm-player', teamId: CLUB,  userId: 'u-player', role: 'player', status: 'active' },
  { id: 'm-rival',  teamId: OTHER, userId: 'u-rival',  role: 'coach', status: 'active', accessProfile: 'full' },
];

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club' }, { id: OTHER, name: 'Rival' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1, clubId: CLUB,
    groups: [{ id: SEN, name: 'Seniors', status: 'active' }, { id: U18, name: 'U18', status: 'active' }],
    teams: [] }));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Club',
    seasonStart: '2026-07-01', seasonEnd: '2027-06-30',
    fixtures: [
      { id: 'fx_sen_past',   opposition: 'Mons',   date: PAST,   groupId: SEN, status: 'scheduled' },
      { id: 'fx_sen_future', opposition: 'Later',  date: FUTURE, groupId: SEN, status: 'scheduled' },
      { id: 'fx_sen_canc',   opposition: 'Off',    date: PAST,   groupId: SEN, status: 'cancelled' },
      { id: 'fx_u18_past',   opposition: 'Kituro', date: PAST,   groupId: U18, status: 'scheduled' },
      { id: 'fx_sen_nosheet',opposition: 'NoSheet',date: PAST,   groupId: SEN, status: 'scheduled' },
    ] }));
  kv.set(`app:club:${OTHER}`, JSON.stringify({ clubName: 'Rival', fixtures: [] }));
  // Published sheets: one Seniors, one U18.
  kv.set(`app:publish:${CLUB}:fixture:fx_sen_past:squad`, JSON.stringify({
    published: true, fixtureId: 'fx_sen_past', formationNames: { '1': 'Starter Finish' },
    benchPlayers: ['Bench On'], substitutions: [], matchMinutes: 80,
    gamePlan: 'SECRET TACTICS', announcement: 'private note', venue: 'Home' }));
  kv.set(`app:publish:${CLUB}:fixture:fx_u18_past:squad`, JSON.stringify({
    published: true, fixtureId: 'fx_u18_past', formationNames: { '1': 'U18 Player' },
    benchPlayers: [], substitutions: [], matchMinutes: 70 }));
  // A future fixture with a sheet — must NOT be returned.
  kv.set(`app:publish:${CLUB}:fixture:fx_sen_future:squad`, JSON.stringify({
    published: true, fixtureId: 'fx_sen_future', formationNames: { '1': 'Starter Finish' },
    benchPlayers: [], substitutions: [], matchMinutes: 80 }));
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
async function seasonRead(userId, query = {}) {
  const r = res();
  await publishHandler({ method: 'GET', query: { resource: 'season-sheets', ...query },
    headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}

test('SERVER: returns only PLAYED fixtures with a published sheet', async () => {
  seed(); await login('u-coach');
  const r = await seasonRead('u-coach', { group: SEN });
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.sheets.map(s => s.fixtureId), ['fx_sen_past'],
    'the future fixture and the cancelled one are excluded even though one has a sheet');
  assert.equal(r.body.playedFixtures, 2, 'two Seniors matches were played');
  assert.equal(r.body.fixturesWithoutSheet, 1, 'one of them had no sheet published — reported honestly');
});

test('SERVER: a group only ever sees its own season', async () => {
  seed(); await login('u-coach');
  const sen = await seasonRead('u-coach', { group: SEN });
  const u18 = await seasonRead('u-coach', { group: U18 });
  assert.deepEqual(sen.body.sheets.map(s => s.fixtureId), ['fx_sen_past']);
  assert.deepEqual(u18.body.sheets.map(s => s.fixtureId), ['fx_u18_past']);
  assert.ok(!JSON.stringify(sen.body).includes('U18 Player'), 'no U18 player in the Seniors read');
  assert.ok(!JSON.stringify(u18.body).includes('Starter Finish'), 'and no senior in the U18 read');
});

test('SERVER: a coach cannot read a group they do not hold', async () => {
  seed(); await login('u-u18c');
  const own = await seasonRead('u-u18c', { group: U18 });
  assert.equal(own.code, 200, 'their own group is fine');
  const forged = await seasonRead('u-u18c', { group: SEN });
  assert.equal(forged.code, 403, 'and Seniors is refused');
});

test('SERVER: an unknown or foreign group is refused, not answered', async () => {
  seed(); await login('u-coach');
  assert.equal((await seasonRead('u-coach', { group: 'grp_forged' })).code, 404);
});

test('SERVER: another club can never reach this club\'s season', async () => {
  seed(); await login('u-rival');
  const r = await seasonRead('u-rival', { group: SEN });
  assert.ok(r.code >= 400, 'the rival cannot name our group');
  assert.ok(!JSON.stringify(r.body || {}).includes('Starter Finish'));
});

test('SERVER: a player cannot read team sheets', async () => {
  seed(); await login('u-player');
  const r = await seasonRead('u-player', { group: SEN });
  // A specific AUTHORISATION refusal — not merely "some error". `code >= 400`
  // would also pass for a crash, which is not the same guarantee.
  assert.ok(r.code === 401 || r.code === 403, `expected an auth refusal, got ${r.code}`);
  assert.equal(r.body?.sheets, undefined, 'and no team-sheet data at all');
  // Pinned at the source too: the gate must be the squad-publishing permission,
  // deliberately not the broader REPORTS that managers, medical, S&C and
  // analysts also hold.
  const src = await readFile(join(__dirname, '..', 'api', 'publish.js'), 'utf8');
  const handler = src.slice(src.indexOf('async function seasonSheetsHandler'),
                            src.indexOf('// ── Appearance adjustments sub-resource'));
  assert.match(handler, /requireTenantPermission\(req, PERM\.PUBLISH_SQUADS\)/);
  assert.ok(!/requireTenantSession/.test(handler), 'a bare session is not enough');
});

test('SERVER: tactical notes never leave the club', async () => {
  seed(); await login('u-coach');
  const body = JSON.stringify((await seasonRead('u-coach', { group: SEN })).body);
  assert.ok(!body.includes('SECRET TACTICS'), 'gamePlan is not projected');
  assert.ok(!body.includes('private note'), 'nor the announcement');
  const sheet0 = (await seasonRead('u-coach', { group: SEN })).body.sheets[0];
  assert.deepEqual(Object.keys(sheet0).sort(),
    // benchKeys/formationKeys are the identity pass: WHO each name meant,
    // resolved at publish time. They are part of the minimum precisely because
    // without them a rename orphans the history they describe.
    ['benchKeys', 'benchPlayers', 'date', 'fixtureId', 'formationKeys', 'formationNames',
     'matchMinutes', 'opposition', 'sideId', 'substitutions', 'teamName'],
    'exactly the minimum a season statistic needs');
});

test('SERVER: it is read-only', async () => {
  seed(); await login('u-coach');
  const r = res();
  await publishHandler({ method: 'POST', query: { resource: 'season-sheets' },
    headers: { cookie: cookies.get('u-coach') }, body: { anything: true } }, r);
  assert.equal(r.result.code, 405, 'no write path exists');
  const src = await readFile(join(__dirname, '..', 'api', 'publish.js'), 'utf8');
  const handler = src.slice(src.indexOf('async function seasonSheetsHandler'), src.indexOf('// ── Appearance adjustments sub-resource'));
  assert.ok(!/kvSet|kvDel|writeClub|auditLog/.test(handler), 'and it writes nothing at all');
});

test('SERVER: the club id always comes from the session, never the query', async () => {
  seed(); await login('u-rival');
  const r = await seasonRead('u-rival', { teamId: CLUB, group: SEN });
  assert.ok(r.code >= 400, 'a forged teamId buys nothing');
});

test('SERVER: the season window bounds what is returned', async () => {
  seed();
  const club = JSON.parse(kv.get(`app:club:${CLUB}`));
  club.seasonStart = '2026-09-01'; club.seasonEnd = '2027-06-30';   // PAST now falls outside
  kv.set(`app:club:${CLUB}`, JSON.stringify(club));
  await login('u-coach');
  const r = await seasonRead('u-coach', { group: SEN });
  assert.deepEqual(r.body.sheets, [], 'a match before the season is not this season');
});

// ── 8. The client loader ─────────────────────────────────────────────────────

test('an unlanded read is never treated as an empty season', () => {
  const src = extractFn(html, 'loadSeasonSheets');
  // Still null on failure — unknown is never empty. It now also records which
  // group failed, so "still loading" and "came back an error" can be told apart.
  assert.match(src, /if \(!res\.ok\) \{ _seasonSheets = null; _seasonSheetsFailed = gid; return; \}/,
    'a failed read stays unknown');
  assert.match(src, /catch \{ _seasonSheets = null; _seasonSheetsFailed = gid; \}/,
    'and so does a thrown one');
  // The invariant behind both: a failure yields UNKNOWN, never an empty season.
  assert.ok(!/(?:!res\.ok|catch)[^}]*sheets: \[\]/.test(src),
    'a failed read must never be turned into a season with no matches');
  assert.match(src, /canI\('publish_squads'\)/, 'the client asks only when it may');
});

test('the season cache is dropped when the group changes', () => {
  const idx = html.indexOf('_appearanceAdjustments = null; // adjustments are per-club');
  assert.ok(idx > 0);
  assert.match(html.slice(idx, idx + 400), /_seasonSheets = null; _seasonSheetsGroup = null;/,
    'a Seniors season must never be shown under U18');
});

test('appearancesCalculated shares the played rule, and does not keep its own', () => {
  // It used to test `fx.status === 'completed'` alone. Nothing ever writes that
  // status to the server, so the strict test answered "no match was ever
  // played" for every club — the same sourceless-zero defect twice over.
  const s = scope();
  const played = { id: 'fx_past', opposition: 'Mons', date: '2020-01-01', status: 'scheduled' };
  const future = { id: 'fx_soon', opposition: 'Later', date: '2099-01-01', status: 'scheduled' };
  const sheets = [
    { fixtureId: 'fx_past', formationNames: { '1': 'Starter Finish' }, benchPlayers: [], substitutions: [], matchMinutes: 80 },
    { fixtureId: 'fx_soon', formationNames: { '1': 'Starter Finish' }, benchPlayers: [], substitutions: [], matchMinutes: 80 },
  ];
  const src = extractFn(html, 'appearancesCalculated');
  assert.match(src, /fixtureHasBeenPlayed\(fx, today\)/, 'it asks the shared predicate');
  assert.ok(!/fx\.status !== 'completed'/.test(src), 'and no longer carries its own rule');

  const calc = new Function(`
    "use strict";
    const state = { players: ${JSON.stringify(ROSTER)} };
    function findPlayerByName(n) { const w = String(n || '').trim().toLowerCase();
      return state.players.find(p => String(p.name || '').trim().toLowerCase() === w) || null; }
    ${extractConst(html, 'MATCH_MINUTES_DEFAULT')}
    ${extractFn(html, 'playerMatchKey')}
    ${extractFn(html, 'mcPersonKey')}
    ${extractFn(html, 'matchMinuteValue')}
    ${extractFn(html, 'fixtureHasBeenPlayed')}
    ${extractFn(html, 'appearanceSeasonId')}
    ${extractFn(html, 'seasonPlayerStats')}
    ${extractFn(html, 'appearancesCalculated')}
    return appearancesCalculated;
  `)();
  const out = calc([played, future], sheets, '2019-08-01', '2100-05-31');
  assert.equal(out.byPlayer['id:u1'], 1, 'the past-dated match counted even though nothing marked it completed');
  assert.equal(out.matches.length, 1, 'and the future one did not');
});

test('nothing protected moved', () => {
  for (const name of ['matchMinutesByPerson', 'substitutionAdd', 'mcPersonKey', 'playerMatchKey',
                      'operationalPlayers', 'playerGroupIdOf', 'appearanceAdjustmentsFor',
                      'overviewRoster', 'setAppearance', 'unassignedRosterPlayers']) {
    assert.ok(html.includes(`function ${name}(`), `${name} must still exist`);
  }
  const stats = extractFn(html, 'seasonPlayerStats');
  assert.ok(!/state\.players|squadSelections|fetch\(/.test(stats),
    'the aggregation is pure — no device state, no dead model, no network');
});
