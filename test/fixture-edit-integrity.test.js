/**
 * BUILD V — fixture EDITING goes through the canonical server model.
 *
 * Before: the Fixtures-screen edit wrote state.fixtures + saveState() only;
 * persistence depended on an unrelated club-settings save shipping the whole
 * device-local array into club.fixtures (which also let a STALE device
 * clobber every fixture). Now: edit/delete/status are fixtures-resource
 * actions — validated, group-asserted, side-revalidated — and the club-config
 * channel can neither write nor wipe fixtures once a club record exists.
 *
 * Server half drives the REAL publish handler over in-memory kv; client half
 * runs the REAL extracted handlers with a captured fetch.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.fxedit.test';
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
const { default: publishHandler } = await import('../api/publish.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-boitsfort';
const SEN = 'grp_initial', U18 = 'grp_u18';
const MEMBERS = [
  { id: 'm-owner', teamId: CLUB, userId: 'u-owner', role: 'admin', status: 'active', isOwner: true, accessProfile: 'full' },
  { id: 'm-u18',   teamId: CLUB, userId: 'u-u18-c', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'active' }], teams: [] } },
  { id: 'm-sen',   teamId: CLUB, userId: 'u-sen-c', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: SEN, status: 'active' }], teams: [] } },
  { id: 'm-player', teamId: CLUB, userId: 'u-player', role: 'player', status: 'active', playerGroupId: SEN },
];
const STRUCTURE = { version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18',     type: 'general', status: 'active' },
  ],
  teams: [
    { id: 'team_sen_1',  groupId: SEN, name: 'Premier',    status: 'active' },
    { id: 'team_u18_1',  groupId: U18, name: 'U18 First',  status: 'active' },
    { id: 'team_u18_2',  groupId: U18, name: 'U18 Second', status: 'active' },
  ] };

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Boitsfort', fixtures: [
    { id: 'fx_sen',  opposition: 'Soignies', date: '2026-09-12', groupId: SEN, sideId: 'team_sen_1', team: 'Premier',    venue: 'Stade', competition: 'Division 1', createdAt: '2026-08-01T00:00:00.000Z' },
    { id: 'fx_u18a', opposition: 'La Hulpe', date: '2026-09-12', groupId: U18, sideId: 'team_u18_1', team: 'U18 First',  venue: 'Home',  competition: 'U18 League A' },
    { id: 'fx_u18b', opposition: 'Waterloo', date: '2026-09-12', groupId: U18, sideId: 'team_u18_2', team: 'U18 Second', venue: '',      competition: 'U18 League B' },
    { id: 'fx_legacy', opposition: 'Old Boys', date: '2026-09-26' },
  ] }));
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
async function call(userId, body, query = 'resource=fixtures') {
  const r = res();
  await publishHandler({ method: 'POST', url: '/api/publish?' + query,
    query: Object.fromEntries(new URLSearchParams(query)),
    headers: { cookie: cookies.get(userId) || '' }, body }, r);
  return r.result;
}
const stored = () => JSON.parse(kv.get(`app:club:${CLUB}`)).fixtures;
const storedById = id => stored().find(f => f.id === id);

// ── The core contract: edit persists server-side ───────────────────────────

test('1+2: an edit persists server-side and survives a fresh read', async () => {
  seed(); await login('u-owner'); await login('u-u18-c'); await login('u-sen-c'); await login('u-player');
  const r = await call('u-u18-c', { action: 'update', fixture: { id: 'fx_u18b', venue: 'La Hulpe RFC' } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.fixture.venue, 'La Hulpe RFC');
  assert.equal(storedById('fx_u18b').venue, 'La Hulpe RFC', 'the STORE holds it — not a device');
});

test('3+4+11: groupId and sideId are preserved through an ordinary edit — U18 Second stays U18 Second', async () => {
  const fx = storedById('fx_u18b');
  assert.equal(fx.groupId, U18, 'group untouched');
  assert.equal(fx.sideId, 'team_u18_2', 'side untouched');
  assert.equal(fx.team, 'U18 Second');
});

test('9+10: a Seniors edit stays Seniors; a U18 First edit stays U18 First', async () => {
  await call('u-sen-c', { action: 'update', fixture: { id: 'fx_sen', competition: 'Division 1 — Pool B' } });
  const sen = storedById('fx_sen');
  assert.equal(sen.groupId, SEN); assert.equal(sen.sideId, 'team_sen_1');
  assert.equal(sen.competition, 'Division 1 — Pool B');
  assert.equal(sen.createdAt, '2026-08-01T00:00:00.000Z', 'an edit never rewrites the creation stamp');
  await call('u-u18-c', { action: 'update', fixture: { id: 'fx_u18a', time: '11:30' } });
  const a = storedById('fx_u18a');
  assert.equal(a.groupId, U18); assert.equal(a.sideId, 'team_u18_1');
  assert.equal(a.time, '11:30');
});

test('same team TEXT keeps the same canonical side — no explicit sideId needed', async () => {
  const r = await call('u-u18-c', { action: 'update', fixture: { id: 'fx_u18a', team: 'U18 First', venue: 'Pitch 2' } });
  assert.equal(r.code, 200);
  assert.equal(storedById('fx_u18a').sideId, 'team_u18_1', 'unchanged name, unchanged id');
});

test('5: an INTENTIONAL side change U18 First → U18 Second succeeds, group intact', async () => {
  const r = await call('u-u18-c', { action: 'update', fixture: { id: 'fx_u18a', team: 'U18 Second' } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const fx = storedById('fx_u18a');
  assert.equal(fx.sideId, 'team_u18_2', 'the new side was resolved and adopted');
  assert.equal(fx.groupId, U18, 'group unchanged');
  // put it back for later tests
  await call('u-u18-c', { action: 'update', fixture: { id: 'fx_u18a', team: 'U18 First' } });
  assert.equal(storedById('fx_u18a').sideId, 'team_u18_1');
});

test('6: a WRONG-GROUP side is rejected and nothing is corrupted', async () => {
  const r = await call('u-u18-c', { action: 'update', fixture: { id: 'fx_u18a', sideId: 'team_sen_1', team: 'Premier' } });
  assert.equal(r.code, 400, 'the Seniors side cannot be stitched onto a U18 fixture');
  const fx = storedById('fx_u18a');
  assert.equal(fx.sideId, 'team_u18_1', 'stored side untouched');
  assert.equal(fx.groupId, U18, 'stored group untouched');
});

test('a fixture cannot change GROUP through an edit', async () => {
  const r = await call('u-owner', { action: 'update', fixture: { id: 'fx_u18a', groupId: SEN } });
  assert.equal(r.code, 400);
  assert.match(r.body.error, /cannot change group/i);
  assert.equal(storedById('fx_u18a').groupId, U18);
});

test('7: authorization — a player cannot update; a group-scoped coach cannot touch another group', async () => {
  const p = await call('u-player', { action: 'update', fixture: { id: 'fx_sen', venue: 'Hacked' } });
  assert.ok([401, 403].includes(p.code), 'player refused');
  const x = await call('u-u18-c', { action: 'update', fixture: { id: 'fx_sen', venue: 'Hacked' } });
  assert.equal(x.code, 403, 'U18 coach cannot edit a Seniors fixture');
  assert.equal(storedById('fx_sen').venue, 'Stade', 'untouched');
  const d = await call('u-u18-c', { action: 'delete', id: 'fx_sen' });
  assert.equal(d.code, 403, 'nor delete it');
  assert.ok(storedById('fx_sen'), 'still there');
});

test('12: a LEGACY fixture (no groupId) is editable by an initial-group operator and is NOT migrated', async () => {
  const r = await call('u-sen-c', { action: 'update', fixture: { id: 'fx_legacy', venue: 'Memorial Ground' } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const fx = storedById('fx_legacy');
  assert.equal(fx.venue, 'Memorial Ground');
  assert.equal(fx.groupId, '', 'legacy stays legacy — no groupId stamped by an edit');
  const u = await call('u-u18-c', { action: 'update', fixture: { id: 'fx_legacy', venue: 'X' } });
  assert.equal(u.code, 403, 'a U18-scoped coach does not operate the initial group');
});

test('THE PRODUCTION REPAIR: a U18 fixture stamped team="Seniors" (pre-Build-P import) is corrected by one edit', async () => {
  // The real incident: fx_3laifwx-style records — groupId=U18, sideId='',
  // team='Seniors' from the old club-wide import default. The user's repair
  // is an ordinary edit setting Team to the group's real first team.
  kv.set(`app:club:${CLUB}`, JSON.stringify({ ...JSON.parse(kv.get(`app:club:${CLUB}`)), fixtures: [
    ...stored(),
    { id: 'fx_stale', opposition: 'ANDE', date: '2026-09-05', groupId: U18, sideId: '', team: 'Seniors', homeAway: 'home' },
  ] }));
  const r = await call('u-u18-c', { action: 'update', fixture: { id: 'fx_stale', team: 'U18 First' } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const fx = storedById('fx_stale');
  assert.equal(fx.team, 'U18 First', 'the label is corrected');
  assert.equal(fx.sideId, 'team_u18_1', 'the canonical side is ADOPTED from the name');
  assert.equal(fx.groupId, U18, 'the group never moved');
  assert.equal(fx.opposition, 'ANDE', 'nothing else changed');
  // An untouched save (same stale text) is harmless: text kept, no side invented.
  kv.set(`app:club:${CLUB}`, JSON.stringify({ ...JSON.parse(kv.get(`app:club:${CLUB}`)), fixtures: [
    ...stored().filter(f => f.id !== 'fx_stale'),
    { id: 'fx_stale2', opposition: 'DEND', date: '2026-09-12', groupId: U18, sideId: '', team: 'Seniors', homeAway: 'away' },
  ] }));
  const same = await call('u-u18-c', { action: 'update', fixture: { id: 'fx_stale2', team: 'Seniors', venue: 'Away ground' } });
  assert.equal(same.code, 200);
  const fx2 = storedById('fx_stale2');
  assert.equal(fx2.team, 'Seniors', 'unchanged text stays (honest storage)');
  assert.equal(fx2.sideId, '', 'and no side is ever guessed from it');
  assert.equal(fx2.groupId, U18, 'the display text NEVER affects grouping');
});

test('a team text matching NO side in the group keeps the text, adopts nothing, moves nothing', async () => {
  const r = await call('u-u18-c', { action: 'update', fixture: { id: 'fx_u18a', team: 'U18 2' } });
  assert.equal(r.code, 200);
  const fx = storedById('fx_u18a');
  assert.equal(fx.team, 'U18 2', 'free text kept');
  assert.equal(fx.sideId, '', 'no exact-unique match, no id');
  assert.equal(fx.groupId, U18);
  await call('u-u18-c', { action: 'update', fixture: { id: 'fx_u18a', team: 'U18 First' } });   // restore
  assert.equal(storedById('fx_u18a').sideId, 'team_u18_1');
});

test('status marks persist as ordinary edits', async () => {
  const r = await call('u-u18-c', { action: 'update', fixture: { id: 'fx_u18b', status: 'cancelled' } });
  assert.equal(r.code, 200);
  assert.equal(storedById('fx_u18b').status, 'cancelled');
  await call('u-u18-c', { action: 'update', fixture: { id: 'fx_u18b', status: 'scheduled' } });
});

test('delete removes exactly one fixture; unknown ids are 404', async () => {
  const before = stored().length;
  const r = await call('u-u18-c', { action: 'delete', id: 'fx_u18b' });
  assert.equal(r.code, 200);
  assert.equal(stored().length, before - 1);
  assert.ok(!storedById('fx_u18b'));
  const miss = await call('u-u18-c', { action: 'update', fixture: { id: 'fx_ghost', venue: 'X' } });
  assert.equal(miss.code, 404);
});

test('validation: emptied opponent and malformed date/time are refused', async () => {
  assert.equal((await call('u-u18-c', { action: 'update', fixture: { id: 'fx_u18a', opposition: '' } })).code, 400);
  assert.equal((await call('u-u18-c', { action: 'update', fixture: { id: 'fx_u18a', date: '12/09/2026' } })).code, 400);
  assert.equal((await call('u-u18-c', { action: 'update', fixture: { id: 'fx_u18a', time: '25:99' } })).code, 400);
});

// ── The clobber channel is closed ──────────────────────────────────────────

test('13: a club-settings save can no longer CLOBBER or WIPE fixtures', async () => {
  const before = stored();
  const r = await call('u-owner', { club: { clubName: 'Boitsfort', fixtures: [] } }, 'resource=club');
  assert.equal(r.code, 200);
  assert.deepEqual(stored(), before, 'an empty stale fixtures array changed NOTHING');
  const r2 = await call('u-owner', { club: { clubName: 'Boitsfort',
    fixtures: [{ id: 'fx_evil', opposition: 'Evil FC', date: '2026-01-01' }] } }, 'resource=club');
  assert.equal(r2.code, 200);
  assert.ok(!storedById('fx_evil'), 'nor can it inject fixtures');
});

test('a BRAND-NEW club record may still seed fixtures from the payload (legacy first-run)', async () => {
  kv.delete(`app:club:${CLUB}`);
  const r = await call('u-owner', { club: { clubName: 'Boitsfort',
    fixtures: [{ id: 'fx_seed', opposition: 'First Opp', date: '2026-10-01' }] } }, 'resource=club');
  assert.equal(r.code, 200);
  assert.equal(storedById('fx_seed')?.opposition, 'First Opp', 'first-run seeding preserved');
  seed(); await login('u-u18-c');   // restore the world
});

// ── Client half: the real handlers, honest failure ─────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');
function extractFn(src, name) {
  let start = src.indexOf('    function ' + name + '(');
  if (start === -1) start = src.indexOf('    async function ' + name + '(');
  if (start === -1) throw new Error(name + ' not found');
  let i = src.indexOf('{', start), depth = 0;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
}

function clientScope({ status = 200, body = { ok: true } } = {}) {
  const src =
    '"use strict";\n' +
    'const state = { fixtures: [{ id: "fx1", opposition: "Kituro", venue: "Old", groupId: "grp_u18", sideId: "team_u18_2", team: "U18 Second" }] };\n' +
    'const FROZEN = JSON.stringify(state.fixtures);\n' +
    'let _fixtureEditId = "fx1", _fixtureDraft = { sideId: "team_u18_2" }, _fixtureSaveBusy = false;\n' +
    'let toasts = []; function showToast(t) { toasts.push(t); }\n' +
    'let saved = 0; function saveState() { saved++; }\n' +
    'let reloaded = 0; function loadFixturesFromServer() { reloaded++; return Promise.resolve(); }\n' +
    'function renderCoachFixtures() {}\n' +
    'function renderClubAdmin() {}\n' +
    'function ceConfirm() { return Promise.resolve(true); }\n' +
    'function normalizeFixture(f) { return f; }\n' +
    'function matchCentreSides() { return [{ id: "team_u18_2", name: "U18 Second" }]; }\n' +
    'const vals = { "fx-opposition": "Kituro", "fx-team": "U18 Second", "fx-competition": "U18 League B",\n' +
    '  "fx-homeaway": "home", "fx-date": "2026-10-03", "fx-kickofftime": "11:00", "fx-venue": "New Venue", "fx-notes": "" };\n' +
    'const document = { getElementById: id => id in vals ? { value: vals[id] } : null };\n' +
    'let posted = [];\n' +
    'function fetch(url, init) { posted.push({ url, body: JSON.parse(init.body) });\n' +
    '  return Promise.resolve({ ok: ' + (status === 200) + ', status: ' + status + ', json: async () => (' + JSON.stringify(body) + ') }); }\n' +
    extractFn(html, 'fixtureSaveForm') + '\n' +
    extractFn(html, 'fixtureServerDelete') + '\n' +
    extractFn(html, 'fixtureDelete') + '\n' +
    extractFn(html, 'fixtureMarkStatus') + '\n' +
    'return { save: fixtureSaveForm, del: fixtureDelete, mark: fixtureMarkStatus,\n' +
    '  state, posted: () => posted, toasts: () => toasts,\n' +
    '  edited: () => _fixtureEditId, savedCalls: () => saved, reloads: () => reloaded,\n' +
    '  unchanged: () => JSON.stringify(state.fixtures) === FROZEN };\n';
  return new Function(src)();
}

test('CLIENT: the save posts the canonical update — id, fields, kept sideId — and reloads from the server', async () => {
  const sc = clientScope();
  await sc.save();
  const p = sc.posted()[0];
  assert.ok(p.url.includes('resource=fixtures'));
  assert.equal(p.body.action, 'update');
  assert.equal(p.body.fixture.id, 'fx1');
  assert.equal(p.body.fixture.venue, 'New Venue');
  assert.equal(p.body.fixture.sideId, 'team_u18_2', 'same name keeps the canonical side');
  assert.equal(sc.reloads(), 1, 'what renders is what the server holds');
  assert.equal(sc.edited(), null, 'form closed on success');
  assert.equal(sc.savedCalls(), 0, 'NO device-local persistence anywhere in the path');
});

test('CLIENT: a refused save changes NOTHING locally and keeps the form open', async () => {
  const sc = clientScope({ status: 400, body: { error: 'A valid date is required' } });
  await sc.save();
  assert.ok(sc.unchanged(), 'state.fixtures untouched');
  assert.equal(sc.edited(), 'fx1', 'the coach keeps their form and values');
  assert.equal(sc.reloads(), 0);
  assert.ok(sc.toasts().some(t => /valid date/i.test(t)), 'the server\'s reason is shown');
  assert.equal(sc.savedCalls(), 0);
});

test('CLIENT: a refused delete removes nothing AND claims nothing', async () => {
  const sc = clientScope({ status: 403, body: { error: 'You do not operate that group' } });
  await sc.del('fx1');
  assert.ok(sc.unchanged(), 'fixture still present after refused delete');
  assert.equal(sc.reloads(), 0, 'a refused delete performs NO refresh — it did nothing');
  assert.ok(!sc.toasts().some(t => /deleted/i.test(t)), 'no success message for a refused delete');
  assert.ok(sc.toasts().some(t => /do not operate/i.test(t)), 'the refusal reason is shown');
  await sc.mark('fx1', 'cancelled');
  assert.ok(sc.unchanged(), 'status untouched after refused mark');
  assert.equal(sc.savedCalls(), 0, 'no device-local writes on any path');
});
