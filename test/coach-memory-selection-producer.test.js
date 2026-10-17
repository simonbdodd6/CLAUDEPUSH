/**
 * Core Memory M7 — selection (squad-publish) producer.
 *
 * Unit-level: the producer's fixed memory shape, its count-only input boundary, the shared kill-switch
 * and its neutral/invalid outcomes. End-to-end: the REAL POST /api/publish type=squad path in a
 * two-group club (Seniors = INITIAL group, U18) with real sessions and a mocked Upstash — the same
 * harness family as squad-group-isolation.test.js. Verifies one aggregate memory per successful
 * publish, the correct club + playing-group links, no player names/ids/sheet content anywhere in the
 * memory, kill-switch on/off/unset, a failing memory write never failing the publish, empty sheets and
 * withdrawals producing nothing, and publish behaviour identical with the producer on or off.
 * All data is synthetic — no personal data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.coach-memory-selection.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
let failMemoryWrites = false;
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...a] = JSON.parse(options.body || '[]');
  if (command === 'SET' && failMemoryWrites && String(a[0]).includes('coach_memory:')) {
    return { ok: false, status: 500, text: async () => 'boom', json: async () => ({}) };
  }
  let result = null;
  if (command === 'GET')  result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (command === 'SET') { kv.set(a[0], a[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(a[0]); result = 1; }
  if (command === 'SCAN') { const re = globToRe(a[2] || '*'); result = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM' || command === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const identity = await import('../api/_identityStore.js');
const memStore = await import('../api/_coachMemoryStore.js');
const { INITIAL_GROUP_ID } = await import('../api/_structureStore.js');
const { produceSquadPublishMemory, squadSelectionCounts, COACH_MEMORY_PRODUCERS_FLAG, PRODUCERS_DISABLED } =
  await import('../api/_coachMemoryProducers.js');
const { default: publishHandler } = await import('../api/publish.js');
const { SESSION_COOKIE, createSession } = identity;

const FLAG = COACH_MEMORY_PRODUCERS_FLAG;
const setFlag = v => { if (v === undefined) delete process.env[FLAG]; else process.env[FLAG] = v; };

// ── A two-group club ────────────────────────────────────────────────────────
const CLUB = 'club-m7';
const SEN = INITIAL_GROUP_ID;
const U18 = 'grp-u18';
const STRUCTURE = {
  version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
  ],
  teams: [
    { id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' },
    { id: 't-u18a', groupId: U18, name: 'U18 Premier', status: 'active' },
  ],
};
const scope = groupId => ({ clubWide: false, groups: [{ groupId, status: 'active' }], teams: [] });
const MEMBERS = [
  { id: 'm-sen-coach', teamId: CLUB, userId: 'u-sen-coach', role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope(SEN) },
  { id: 'm-u18-coach', teamId: CLUB, userId: 'u-u18-coach', role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope(U18) },
  { id: 'm-admin',     teamId: CLUB, userId: 'u-admin',     role: 'admin', status: 'active', isOwner: true },
  { id: 'm-player',    teamId: CLUB, userId: 'u-player',    role: 'player', status: 'active', playerGroupId: U18 },
];
const FIXTURES = [
  { id: 'fx-sen', groupId: SEN, sideId: 't-prem', team: 'Premier',     opposition: 'Mons',   date: '2026-08-20', status: 'scheduled' },
  { id: 'fx-u18', groupId: U18, sideId: 't-u18a', team: 'U18 Premier', opposition: 'Liège',  date: '2026-08-22', status: 'scheduled' },
  { id: 'fx-u18-nosides', groupId: U18,                                  opposition: 'Namur',  date: '2026-08-29', status: 'scheduled' },
];
const u18SheetKey = `app:publish:${CLUB}:fixture:fx-u18:side:t-u18a:squad`;

const cookies = new Map();
async function seed() {
  kv.clear(); failMemoryWrites = false;
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club M7' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ fixtures: FIXTURES }));
  for (const m of MEMBERS) {
    const s = await createSession({ userId: m.userId, teamId: CLUB, role: m.role });
    cookies.set(m.userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
  }
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
async function post(userId, body) {
  const r = res();
  await publishHandler({ method: 'POST', query: {}, body, headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}
const memoriesOf = userId => memStore.listCoachMemories({ teamId: CLUB, coachId: userId });
const memoryKeys = () => [...kv.keys()].filter(k => k.includes('coach_memory:'));

// A full rugby sheet: 15 starters, 8 named replacements + 2 unfilled bench places. Every name and id
// is a SENTINEL so the privacy tests can prove none of it leaks into a memory.
const STARTER_NAMES = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [String(i + 1), `Starter Sentinel ${i + 1}`]));
const STARTER_KEYS  = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [String(i + 1), `id:pid-starter-${i + 1}`]));
const BENCH_NAMES   = [...Array.from({ length: 8 }, (_, i) => `Bench Sentinel ${i + 1}`), '', '   '];
const BENCH_KEYS    = Array.from({ length: 8 }, (_, i) => `id:pid-bench-${i + 1}`);
const fullSheet = (fixtureId, sideId, extra = {}) => ({ type: 'squad', data: {
  published: true, publishedAt: '2026-08-21T10:00:00.000Z', fixtureId, sideId,
  opposition: 'Liège Opposition Sentinel', venue: 'Venue Sentinel', announcement: 'Announcement Sentinel',
  gamePlan: 'Game Plan Sentinel', formationNames: STARTER_NAMES, formationKeys: STARTER_KEYS,
  benchPlayers: BENCH_NAMES, benchKeys: BENCH_KEYS, ...extra,
} });

test.beforeEach(async () => { await seed(); setFlag(undefined); });
test.after(() => setFlag(undefined));

// ── Unit: the count-only boundary ───────────────────────────────────────────

test('squadSelectionCounts reduces a sheet to two numbers — filled starters and filled bench places', () => {
  assert.deepEqual(squadSelectionCounts({ formationNames: STARTER_NAMES, benchPlayers: BENCH_NAMES }), { starterCount: 15, replacementCount: 8 });
  assert.deepEqual(squadSelectionCounts({ formationNames: { 1: 'A', 2: '  ' }, benchPlayers: ['B', '', null] }), { starterCount: 1, replacementCount: 1 });
  assert.deepEqual(squadSelectionCounts({}), { starterCount: 0, replacementCount: 0 });
  assert.deepEqual(squadSelectionCounts(null), { starterCount: 0, replacementCount: 0 });
  assert.deepEqual(squadSelectionCounts({ formationNames: ['x'], benchPlayers: 'not-an-array' }), { starterCount: 0, replacementCount: 0 });
});

test('the producer writes the fixed selection-preference shape with documented rules', async () => {
  setFlag('true');
  const seam = { idFactory: () => 'cmem-sel', clock: () => '2026-08-21T10:00:00.000Z' };
  const r = await produceSquadPublishMemory({ teamId: CLUB, coachId: 'u-x', groupId: U18, starterCount: 15, replacementCount: 8 }, seam);
  assert.equal(r.ok, true);
  const m = r.memory;
  assert.equal(m.type, 'selection-preference');
  assert.equal(m.statement, 'Published a squad with 15 starters and 8 replacements.');
  assert.equal(m.confidence, 0.9);
  assert.equal(m.weight, 0.3);
  assert.equal(m.source, 'selection-decision');
  assert.deepEqual(m.tags, ['selection', 'squad', 'published']);
  assert.deepEqual(m.evidenceRefs, ['publish:squad']);
  assert.deepEqual(m.ontologyLinks, [{ kind: 'club', id: CLUB }, { kind: 'team', id: U18 }]);
  assert.equal(m.id, 'cmem-sel');
  assert.equal(m.createdAt, '2026-08-21T10:00:00.000Z');
});

test('statement grammar is singular for one, plural otherwise; zero replacements is stated plainly', async () => {
  setFlag('true');
  let n = 0; const seam = () => ({ idFactory: () => `c${++n}` });
  const one = await produceSquadPublishMemory({ teamId: CLUB, coachId: 'u-x', starterCount: 1, replacementCount: 1 }, seam());
  const none = await produceSquadPublishMemory({ teamId: CLUB, coachId: 'u-x', starterCount: 7, replacementCount: 0 }, seam());
  assert.equal(one.memory.statement, 'Published a squad with 1 starter and 1 replacement.');
  assert.equal(none.memory.statement, 'Published a squad with 7 starters and 0 replacements.');
  // no group supplied → club link only, never an empty team link
  assert.deepEqual(one.memory.ontologyLinks, [{ kind: 'club', id: CLUB }]);
});

test('7. empty and invalid selections write nothing (neutral skip / reported, never thrown)', async () => {
  setFlag('true');
  const base = { teamId: CLUB, coachId: 'u-x' };
  assert.deepEqual(await produceSquadPublishMemory({ ...base, starterCount: 0, replacementCount: 0 }), { ok: true, skipped: true, reason: 'empty-selection' });
  for (const bad of [{}, { starterCount: -1, replacementCount: 0 }, { starterCount: 1.5, replacementCount: 0 }, { starterCount: '15', replacementCount: 8 }, { starterCount: NaN, replacementCount: 1 }]) {
    assert.deepEqual(await produceSquadPublishMemory({ ...base, ...bad }), { ok: false, error: 'invalid selection' }, JSON.stringify(bad));
  }
  assert.deepEqual(await produceSquadPublishMemory({ teamId: '', coachId: 'u-x', starterCount: 3, replacementCount: 0 }), { ok: false, error: 'invalid scope' });
  assert.deepEqual(memoryKeys(), []);
});

// ── Kill-switch ─────────────────────────────────────────────────────────────

test('4. kill-switch unset or "false" → the shared disabled skip, nothing written', async () => {
  for (const v of [undefined, 'false', 'TRUE', '1']) {
    setFlag(v);
    const r = await produceSquadPublishMemory({ teamId: CLUB, coachId: 'u-x', groupId: U18, starterCount: 15, replacementCount: 8 });
    assert.equal(r, PRODUCERS_DISABLED, `flag=${String(v)}`);
  }
  assert.deepEqual(memoryKeys(), []);
});

test('5. kill-switch "true" → the real squad publish produces a memory', async () => {
  setFlag('true');
  const r = await post('u-u18-coach', fullSheet('fx-u18', 't-u18a'));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal((await memoriesOf('u-u18-coach')).length, 1);
});

// ── End-to-end through POST /api/publish type=squad ─────────────────────────

test('1. a successful publish creates the expected aggregate memory under the publishing coach', async () => {
  setFlag('true');
  const r = await post('u-u18-coach', fullSheet('fx-u18', 't-u18a'));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const [m] = await memoriesOf('u-u18-coach');
  assert.equal(m.type, 'selection-preference');
  assert.equal(m.source, 'selection-decision');
  assert.equal(m.statement, 'Published a squad with 15 starters and 8 replacements.');
  assert.deepEqual(m.tags, ['selection', 'squad', 'published']);
  assert.deepEqual(m.evidenceRefs, ['publish:squad']);
  assert.match(m.id, /^cmem_\d+_[a-z0-9]{1,8}$/);
  // tenant isolation: the memory lives only in this coach's own collection
  assert.equal((await memoriesOf('u-sen-coach')).length, 0);
  assert.equal((await memoriesOf('u-admin')).length, 0);
});

test('2. the memory contains no player names, player ids or any other sheet content', async () => {
  setFlag('true');
  await post('u-u18-coach', fullSheet('fx-u18', 't-u18a'));
  const [m] = await memoriesOf('u-u18-coach');
  const serialised = JSON.stringify(m);
  for (const needle of ['Sentinel', 'pid-', 'id:', 'Liège', 'Venue', 'Announcement', 'Game Plan', 'fx-u18', 't-u18a']) {
    assert.ok(!serialised.includes(needle), `memory must not contain "${needle}": ${serialised}`);
  }
  for (const name of [...Object.values(STARTER_NAMES), ...BENCH_NAMES.filter(n => n.trim())]) {
    assert.ok(!serialised.includes(name), `player name leaked: ${name}`);
  }
  // the only identifiers present are the tenant and the playing group
  assert.deepEqual(m.ontologyLinks.map(l => l.id), [CLUB, U18]);
});

test('3. club + playing-group links follow the sheet\'s server-resolved group', async () => {
  setFlag('true');
  // U18 fixture with a side → U18
  await post('u-u18-coach', fullSheet('fx-u18', 't-u18a'));
  // U18 fixture without a side → still U18 (group comes from the fixture, not the side)
  await post('u-u18-coach', fullSheet('fx-u18-nosides', ''));
  // Seniors fixture → the INITIAL group
  await post('u-sen-coach', fullSheet('fx-sen', 't-prem'));
  // unlinked (no fixture) publish by the owner → the legacy slot, which belongs to the INITIAL group
  const legacy = await post('u-admin', fullSheet('', ''));
  assert.equal(legacy.code, 200, JSON.stringify(legacy.body));

  const u18 = await memoriesOf('u-u18-coach');
  assert.equal(u18.length, 2);
  for (const m of u18) assert.deepEqual(m.ontologyLinks, [{ kind: 'club', id: CLUB }, { kind: 'team', id: U18 }]);
  assert.deepEqual((await memoriesOf('u-sen-coach'))[0].ontologyLinks, [{ kind: 'club', id: CLUB }, { kind: 'team', id: SEN }]);
  assert.deepEqual((await memoriesOf('u-admin'))[0].ontologyLinks, [{ kind: 'club', id: CLUB }, { kind: 'team', id: SEN }]);
});

test('6. a failing memory write never fails the squad publish', async () => {
  setFlag('true');
  failMemoryWrites = true;
  const r = await post('u-u18-coach', fullSheet('fx-u18', 't-u18a'));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  assert.equal(r.body.squad.formationNames['1'], 'Starter Sentinel 1');      // response unchanged
  assert.equal(JSON.parse(kv.get(u18SheetKey)).benchPlayers.length, 10);     // the sheet is stored
  assert.deepEqual(memoryKeys(), []);                                         // and no memory
});

test('7. an empty sheet publishes normally and writes no memory', async () => {
  setFlag('true');
  const r = await post('u-u18-coach', fullSheet('fx-u18', 't-u18a', { formationNames: {}, formationKeys: {}, benchPlayers: ['', ''], benchKeys: [] }));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.ok(kv.get(u18SheetKey), 'the (empty) sheet is still published');
  assert.deepEqual(memoryKeys(), []);
});

test('8. squad publish behaviour is identical with the producer on, off or unset', async () => {
  const outcomes = [];
  for (const v of ['true', 'false', undefined]) {
    await seed(); setFlag(v);
    const r = await post('u-u18-coach', fullSheet('fx-u18', 't-u18a'));
    const pointer = JSON.parse(kv.get(`app:publish:${CLUB}:squad:current:${U18}`));
    outcomes.push({ code: r.code, body: r.body, sheet: kv.get(u18SheetKey), pointerMode: pointer.mode, pointerFixture: pointer.fixtureId });
    assert.equal(memoryKeys().length, v === 'true' ? 1 : 0, `flag=${String(v)}`);
  }
  assert.equal(outcomes[0].code, 200);
  assert.deepEqual(outcomes[1], outcomes[0], 'off == on');
  assert.deepEqual(outcomes[2], outcomes[0], 'unset == on');
  assert.equal(outcomes[0].pointerMode, 'fixture');
  assert.equal(outcomes[0].pointerFixture, 'fx-u18');
});

test('9. exactly one memory per successful publish; withdrawals, refusals and staff-only sheets add none', async () => {
  setFlag('true');
  await post('u-u18-coach', fullSheet('fx-u18', 't-u18a'));
  assert.equal((await memoriesOf('u-u18-coach')).length, 1);
  await post('u-u18-coach', fullSheet('fx-u18', 't-u18a'));            // republish = a second decision
  assert.equal((await memoriesOf('u-u18-coach')).length, 2);

  // withdrawal is not a selection
  const withdraw = await post('u-u18-coach', { type: 'squad', data: { published: false, fixtureId: 'fx-u18', sideId: 't-u18a' } });
  assert.equal(withdraw.code, 200);
  // a refused publish (another group's fixture) writes nothing
  const refused = await post('u-u18-coach', fullSheet('fx-sen', 't-prem'));
  assert.notEqual(refused.code, 200);
  // a player cannot publish at all
  const player = await post('u-player', fullSheet('fx-u18', 't-u18a'));
  assert.notEqual(player.code, 200);
  // "Publish to coaches" is a staff-only sheet, not a selection made public — accepted, but no memory
  const coachSheet = await post('u-u18-coach', { type: 'coach_sheet', data: { fixtureId: 'fx-u18', sideId: 't-u18a', formationNames: STARTER_NAMES, benchPlayers: BENCH_NAMES } });
  assert.equal(coachSheet.code, 200, JSON.stringify(coachSheet.body));

  assert.equal((await memoriesOf('u-u18-coach')).length, 2, 'still exactly the two publishes');
  assert.equal((await memoriesOf('u-player')).length, 0);
  assert.equal(memoryKeys().length, 1, 'one collection — the publishing coach only');
});
