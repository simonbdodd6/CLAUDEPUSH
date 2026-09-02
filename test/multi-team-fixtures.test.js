/**
 * BUILD N — fixtures across multiple teams.
 *
 * A club can now run U18 First and U18 Second (or any set of teams inside a
 * group) with separate fixtures. The canonical team identity is the EXISTING
 * club-structure team — the same side identity the Match Centre's per-side
 * sheets already use — carried on the fixture as an optional `sideId`,
 * validated at the write boundary and adopted deterministically from an
 * exact-name match on the free-text `team` column that entry and import have
 * always had. Nothing is guessed, nothing is migrated: a legacy fixture with
 * no team stays exactly as it was.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.multi-team-fixtures.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

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

const CLUB = 'riverside';
const U18 = 'grp_u18', SEN = 'grp_initial';
const U18_1 = 'team_u18_first', U18_2 = 'team_u18_second', SEN_1 = 'team_seniors';
const MEMBERS = [
  { id: 'm-head', teamId: CLUB, userId: 'u-head', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
  { id: 'm-p1', teamId: CLUB, userId: 'u-p1', role: 'player', status: 'active', playerGroupId: U18 },
];
const cookies = new Map();
async function seed() {
  kv.clear(); cookies.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Riverside' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@t.test`, displayName: m.userId }))));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1,
    groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' },
             { id: U18, name: 'U18', type: 'general', status: 'active' }],
    teams:  [{ id: SEN_1, groupId: SEN, name: 'Seniors 1st XV', status: 'active' },
             { id: U18_1, groupId: U18, name: 'U18 First', status: 'active' },
             { id: U18_2, groupId: U18, name: 'U18 Second', status: 'active' },
             { id: 'team_old', groupId: U18, name: 'U18 Third', status: 'archived' }] }));
  for (const m of MEMBERS) {
    const s = await store.createSession({ userId: m.userId, teamId: m.teamId, role: m.role });
    cookies.set(m.userId, `${store.SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
  }
}
function response() {
  return { statusCode: null, body: null, headers: {},
    setHeader(n, v) { this.headers[n] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }, end() { return this; } };
}
async function call(userId, body, query = 'resource=fixtures') {
  const res = response();
  await publishHandler({ method: 'POST', url: '/api/publish?' + query,
    query: Object.fromEntries(new URLSearchParams(query)),
    headers: { cookie: cookies.get(userId) },
    body }, res);
  return res;
}
const create = (fixture, extra = {}) =>
  call('u-head', { action: 'create', groupId: U18, fixture, ...extra });
const storedFixtures = () => (JSON.parse(kv.get(`app:club:${CLUB}`) || '{}').fixtures) || [];

// ═══════════════ SERVER — the write boundary ═══════════════════════════════

test('1+2+3+4+5: both U18 teams hold same-date fixtures against different clubs', async () => {
  await seed();
  const a = await create({ team: 'U18 First', opposition: 'Club A', date: '2026-09-14' });
  assert.equal(a.statusCode, 201);
  assert.equal(a.body.fixture.sideId, U18_1, 'the exact team name adopts its canonical id');
  const b = await create({ team: 'U18 Second', opposition: 'Club B', date: '2026-09-14' });
  assert.equal(b.statusCode, 201, 'same date, different team: NOT a duplicate');
  assert.equal(b.body.fixture.sideId, U18_2);
  const fixtures = storedFixtures();
  assert.equal(fixtures.length, 2, 'both exist — neither overwrote the other');
  assert.notEqual(fixtures[0].id, fixtures[1].id, 'distinct canonical fixture ids');
  assert.deepEqual(fixtures.map(f => f.opposition).sort(), ['Club A', 'Club B']);
});

test('an EXPLICIT sideId is validated — the wrong group’s team is refused', async () => {
  await seed();
  const wrong = await create({ team: 'X', sideId: SEN_1, opposition: 'Club A', date: '2026-09-14' });
  assert.equal(wrong.statusCode, 400, 'a Seniors team cannot own a U18 fixture');
  assert.match(wrong.body.error, /does not play in this group/);
  assert.equal(storedFixtures().length, 0, 'nothing written');
  const archived = await create({ team: 'X', sideId: 'team_old', opposition: 'Club A', date: '2026-09-14' });
  assert.equal(archived.statusCode, 400, 'an archived team is not a valid owner');
  const fake = await create({ team: 'X', sideId: 'team_invented', opposition: 'Club A', date: '2026-09-14' });
  assert.equal(fake.statusCode, 400, 'an invented id is refused, never stored');
});

test('name adoption is DETERMINISTIC — ambiguity and no-match stay free text', async () => {
  await seed();
  // Case-insensitive, whitespace-normalised exact match adopts the id.
  const ci = await create({ team: '  u18   second ', opposition: 'Club C', date: '2026-09-20' });
  assert.equal(ci.body.fixture.sideId, U18_2);
  // A name matching NO team keeps the text and no id — never guessed.
  const none = await create({ team: 'U18 Barbarians', opposition: 'Club D', date: '2026-09-21' });
  assert.equal(none.statusCode, 201);
  assert.equal(none.body.fixture.sideId, '', 'no guess');
  assert.equal(none.body.fixture.team, 'U18 Barbarians', 'the text survives as display');
  // A legacy write with no team at all is untouched.
  const legacy = await create({ opposition: 'Club E', date: '2026-09-22' });
  assert.equal(legacy.statusCode, 201);
  assert.equal(legacy.body.fixture.sideId, '');
  assert.equal(legacy.body.fixture.team, '');
});

test('AMBIGUOUS names are never guessed between — two teams, one name, no id', async () => {
  await seed();
  // A club that (mis)configures two active teams with the SAME name: adopting
  // either would be a guess, so neither is adopted and the text stands alone.
  const st = JSON.parse(kv.get(`app:structure:${CLUB}`));
  st.teams.push({ id: 'team_u18_dup', groupId: U18, name: 'U18 Second', status: 'active' });
  kv.set(`app:structure:${CLUB}`, JSON.stringify(st));
  const r = await create({ team: 'U18 Second', opposition: 'Club Z', date: '2026-10-03' });
  assert.equal(r.statusCode, 201);
  assert.equal(r.body.fixture.sideId, '', 'ambiguity resolves to NO id, never a coin toss');
  assert.equal(r.body.fixture.team, 'U18 Second', 'the text is kept as display');
});

test('same team + same opponent + same date is still caught as a duplicate', async () => {
  await seed();
  await create({ team: 'U18 First', opposition: 'Club A', date: '2026-09-14' });
  const dupe = await create({ team: 'U18 First', opposition: 'Club A', date: '2026-09-14' });
  assert.equal(dupe.statusCode, 409, 'the duplicate guard still guards');
  const other = await create({ team: 'U18 Second', opposition: 'Club A', date: '2026-09-14' });
  assert.equal(other.statusCode, 201, 'but the OTHER team playing the same club is a real fixture');
});

test('12: import with a Team column lands both teams’ fixtures with canonical ids', async () => {
  await seed();
  const imp = await call('u-head', { action: 'import', groupId: U18, confirmed: true, fixtures: [
    { fixture: { team: 'U18 First',  opposition: 'Club A', date: '2026-09-14' }, decision: 'new' },
    { fixture: { team: 'U18 Second', opposition: 'Club B', date: '2026-09-14' }, decision: 'new' },
    { fixture: { team: 'U18 First',  sideId: SEN_1, opposition: 'Club X', date: '2026-09-28' }, decision: 'new' },
  ] });
  assert.equal(imp.statusCode, 200);
  assert.equal(imp.body.summary.imported, 2, 'both teams imported');
  assert.equal(imp.body.summary.errors, 1, 'the cross-group sideId row is an ERROR, not silently fixed');
  const stored = storedFixtures();
  assert.deepEqual(stored.map(f => f.sideId).sort(), [U18_1, U18_2].sort());
});

// ═══════════════ CLIENT — identity, labels, Match Centre ═══════════════════

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
const fn = n => extractFn(html, n);

test('normalizeFixture keeps the team identity it used to drop', () => {
  const norm = new Function(`${fn('normalizeFixture')} return normalizeFixture;`)();
  const out = norm({ id: 'fx1', opposition: 'Club B', team: 'U18 Second', sideId: U18_2 });
  assert.equal(out.team, 'U18 Second');
  assert.equal(out.sideId, U18_2);
  assert.equal(norm({ id: 'fx2' }).sideId, '', 'legacy records default to no side');
  assert.equal(norm({ id: 'fx2' }).team, '');
});

test('fixtureTeamLabel prefers the canonical side name and never invents one', () => {
  const label = new Function('cfg', `
    const _adminData = { structure: cfg.structure };
    function matchCentreSides() { return cfg.sides; }
    ${fn('fixtureTeamLabel')}
    return fixtureTeamLabel;
  `)({ sides: [{ id: U18_2, name: 'U18 Second' }], structure: null });
  assert.equal(label({ sideId: U18_2, team: 'old text' }), 'U18 Second', 'canonical name wins');
  assert.equal(label({ team: 'U18 Barbarians' }), 'U18 Barbarians', 'free text stands alone');
  assert.equal(label({}), '', 'no team, no claim');
  // An id the structure does not know (deleted team, other device's data)
  // falls through to the stored text — never to some OTHER side's name.
  assert.equal(label({ sideId: 'team_ghost', team: 'U18 Third' }), 'U18 Third');
  assert.equal(label({ sideId: 'team_ghost' }), '', 'and with no text, nothing is invented');
});

test('8+9+10: selecting a fixture adopts ITS team as the working side', () => {
  const world = new Function('cfg', `
    "use strict";
    const state = { fixtures: cfg.fixtures,
      matchCentre: { fixtureId: '', sideId: cfg.storedSide || '' },
      formationNames: {}, benchPlayers: [], fphotoIds: {} };
    let _mcSheetFixtureId = '';
    let _mcSheetSideId = '';
    function matchCentreFixtureId() { return String((state.matchCentre || {}).fixtureId || ''); }
    function matchCentreSelectedFixture() {
      return (state.fixtures || []).find(f => String(f.id) === matchCentreFixtureId()) || null; }
    function matchCentreSidesActive() { return cfg.sides; }
    function matchCentreSideId() {
      const stored = String((state.matchCentre || {}).sideId || '');
      return cfg.sides.some(t => String(t.id) === stored) ? stored : String((cfg.sides[0] || {}).id || ''); }
    function matchCentreHasSquadWork() { return false; }
    function mcFlushDraftNow() {}
    function mcApplyFixtureDisplay() {}
    function mcClearFixtureDisplay() {}
    function mcHydrateSelectedFixture() {}
    function mcRefreshPublishedForFixture() {}
    function saveState() {}
    function render() {}
    function showToast(m) { state._toast = m; }
    ${fn('setMatchCentreFixture')}
    return { state, setMatchCentreFixture };
  `);
  const sides = [{ id: U18_1, name: 'U18 First' }, { id: U18_2, name: 'U18 Second' }];
  const fixtures = [
    { id: 'fxA', opposition: 'Club A', sideId: U18_1 },
    { id: 'fxB', opposition: 'Club B', sideId: U18_2 },
    { id: 'fxL', opposition: 'Legacy', sideId: '' },
  ];
  const w = world({ fixtures, sides, storedSide: U18_1 });
  // Opening the SECOND team's fixture lands on the second team's sheet.
  w.setMatchCentreFixture('fxB');
  assert.equal(w.state.matchCentre.sideId, U18_2, 'the fixture brings its own team');
  // Opening the first team's fixture switches back.
  w.setMatchCentreFixture('fxA');
  assert.equal(w.state.matchCentre.sideId, U18_1);
  // A LEGACY fixture with no side leaves the coach’s side untouched.
  w.setMatchCentreFixture('fxL');
  assert.equal(w.state.matchCentre.sideId, U18_1, 'no side, no change — existing behaviour');
  // A fixture whose side this coach does not operate adopts nothing.
  const w2 = world({ fixtures: [{ id: 'fxF', sideId: 'team_foreign' }], sides, storedSide: U18_1 });
  w2.setMatchCentreFixture('fxF');
  assert.equal(w2.state.matchCentre.sideId, U18_1, 'never an id outside the operated sides');
});

test('the edit form keeps the canonical id only while the name still matches', () => {
  const save = html.slice(html.indexOf('function fixtureSaveForm'), html.indexOf('function fixtureDelete'));
  assert.match(save, /sameName \? keep : ''/,
    'a renamed team drops the stale id rather than mislabelling it');
  assert.ok(!/sideId: *matchCentreSides\(\)\.find[^}]*\.id/.test(save),
    'the device-local edit never INVENTS an id — only the server resolves names');
});

test('every fixture surface names the team — labels can no longer collide', () => {
  for (const anchor of ['fixtureTeamLabel(fx)', 'fixtureTeamLabel(current)', 'fixtureTeamLabel(f)']) {
    assert.ok(html.includes(anchor), anchor + ' wired');
  }
  assert.match(html, /teamTag\(f\)/, 'player fixture rows carry the tag');
});
