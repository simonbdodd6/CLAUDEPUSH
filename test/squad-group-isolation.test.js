/**
 * TEAM SHEET GROUP ISOLATION — the caller-side boundary.
 *
 * assertFixtureSideCoherence pins a sheet to its fixture's group (resource
 * coherence). These tests pin the OPERATOR to that same group: a coach scoped
 * to Group A must not read, publish or withdraw Group B's team sheet, and a
 * season of sheets must answer only for the groups the caller operates.
 *
 * Ownership is canonical and server-side: fixtureGroupOf(fixture) — the stored
 * groupId, with the documented legacy rule that a record with no groupId
 * belongs to the club's INITIAL group. Nothing is inferred from display text,
 * query strings or client state.
 *
 * The unlinked (no-fixture) publish/withdraw writes the CLUB-WIDE player-facing
 * slot, so its blast radius is every group at once: it requires authority over
 * every active group. In a one-group club a coach scoped to that one group
 * still qualifies — documented legacy behaviour is preserved.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.sqi.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...a] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (command === 'SET') { kv.set(a[0], a[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(a[0]); result = 1; }
  if (command === 'SCAN') { const re = globToRe(a[2] || '*'); result = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM' || command === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { INITIAL_GROUP_ID } = await import('../api/_structureStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-sqi';
const SEN = INITIAL_GROUP_ID;          // honest legacy modelling: Seniors IS the initial group
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
const ONE_GROUP = {
  version: 1,
  groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' }],
  teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' }],
};

const scope = groupId => ({ clubWide: false, groups: [{ groupId, status: 'active' }], teams: [] });
const MEMBERS = [
  { id: 'm-sen-coach', teamId: CLUB, userId: 'u-sen-coach', role: 'coach', status: 'active',
    accessProfile: 'coach', accessScope: scope(SEN) },
  { id: 'm-u18-coach', teamId: CLUB, userId: 'u-u18-coach', role: 'coach', status: 'active',
    accessProfile: 'coach', accessScope: scope(U18) },
  { id: 'm-admin', teamId: CLUB, userId: 'u-admin', role: 'admin', status: 'active', isOwner: true },
  // A Seniors player ("Samuel") and a U18 player ("Alpha") — the two capacities
  // the group-scoped player read must keep apart.
  { id: 'm-player', teamId: CLUB, userId: 'u-player', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-u18-player', teamId: CLUB, userId: 'u-u18-player', role: 'player', status: 'active', playerGroupId: U18 },
];

const FIXTURES = [
  { id: 'fx-sen',    groupId: SEN, sideId: 't-prem', team: 'Premier', opposition: 'Mons',   date: '2026-08-20', status: 'scheduled' },
  { id: 'fx-u18',    groupId: U18, sideId: 't-u18a', team: 'U18 Premier', opposition: 'Liège', date: '2026-08-22', status: 'scheduled' },
  // No groupId: by the documented rule this record belongs to the INITIAL group.
  { id: 'fx-legacy', opposition: 'Old Boys', date: '2026-08-15', status: 'scheduled' },
];

const SEN_SHEET = { published: true, publishedAt: '2026-08-19T10:00:00.000Z',
  formationNames: { 1: 'Sen Prop Sentinel' }, benchPlayers: ['Sen Bench Sentinel'] };
const U18_SHEET = { published: true, publishedAt: '2026-08-21T10:00:00.000Z',
  formationNames: { 1: 'U18 Prop Sentinel' }, benchPlayers: ['U18 Bench Sentinel'] };
const LEGACY_SHEET = { published: true, publishedAt: '2026-08-14T10:00:00.000Z',
  formationNames: { 1: 'Legacy Prop Sentinel' }, benchPlayers: [] };

const senSheetKey    = `app:publish:${CLUB}:fixture:fx-sen:side:t-prem:squad`;
const u18SheetKey    = `app:publish:${CLUB}:fixture:fx-u18:side:t-u18a:squad`;
const legacySheetKey = `app:publish:${CLUB}:fixture:fx-legacy:squad`;
const pointerKey     = `app:publish:${CLUB}:squad:current`;               // pre-fix, group-less
const senPointerKey  = `app:publish:${CLUB}:squad:current:${SEN}`;        // Seniors (= INITIAL)
const u18PointerKey  = `app:publish:${CLUB}:squad:current:${U18}`;        // U18
const legacySquadKey = `app:publish:${CLUB}:squad`;

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: CLUB, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}

async function seed(structure = STRUCTURE) {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club SQI' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(structure));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ fixtures: FIXTURES }));
  kv.set(senSheetKey, JSON.stringify(SEN_SHEET));
  kv.set(u18SheetKey, JSON.stringify(U18_SHEET));
  kv.set(legacySheetKey, JSON.stringify(LEGACY_SHEET));
  // Sessions live in the same store, so they are re-minted after every clear.
  for (const m of MEMBERS) await login(m.userId);
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
async function call(userId, { method = 'GET', query = {}, body = null } = {}) {
  const r = res();
  await publishHandler({ method, query, body, headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}
const readSheet = k => { try { return JSON.parse(kv.get(k)); } catch { return kv.get(k) ?? null; } };

// ── READ ────────────────────────────────────────────────────────────────────

test('READ — a coach reads their own group\'s sheet; another group\'s is refused', async () => {
  await seed();
  const own = await call('u-u18-coach', { query: { type: 'squad', fixture: 'fx-u18', side: 't-u18a' } });
  assert.equal(own.code, 200, JSON.stringify(own.body));
  assert.equal(own.body.squad?.formationNames?.[1], 'U18 Prop Sentinel');

  const cross = await call('u-u18-coach', { query: { type: 'squad', fixture: 'fx-sen', side: 't-prem' } });
  assert.equal(cross.code, 403, JSON.stringify(cross.body));
  assert.ok(!JSON.stringify(cross.body).includes('Sentinel'), 'refusal carries no sheet content');

  const senCross = await call('u-sen-coach', { query: { type: 'squad', fixture: 'fx-u18', side: 't-u18a' } });
  assert.equal(senCross.code, 403, JSON.stringify(senCross.body));
});

test('READ — the legacy no-group fixture belongs to the INITIAL group, never to a newer one', async () => {
  await seed();
  const sen = await call('u-sen-coach', { query: { type: 'squad', fixture: 'fx-legacy' } });
  assert.equal(sen.code, 200, JSON.stringify(sen.body));
  const u18 = await call('u-u18-coach', { query: { type: 'squad', fixture: 'fx-legacy' } });
  assert.equal(u18.code, 403, JSON.stringify(u18.body));
});

test('READ — a club-wide admin reads every group\'s sheet', async () => {
  await seed();
  for (const q of [{ fixture: 'fx-sen', side: 't-prem' }, { fixture: 'fx-u18', side: 't-u18a' }]) {
    const r = await call('u-admin', { query: { type: 'squad', ...q } });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.ok(r.body.squad, 'sheet returned');
  }
});

test('READ — the player-facing pointer read is scoped to the reader\'s group', async () => {
  await seed();
  // The pointer is now per-group: a Seniors player reads the Seniors pointer.
  kv.set(senPointerKey, JSON.stringify({ mode: 'fixture', fixtureId: 'fx-sen', groupId: SEN }));
  const r = await call('u-player', { query: { type: 'squad' } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.publishedSheets?.length, 1);
  assert.equal(r.body.publishedSheets[0].fixtureId, 'fx-sen');
});

// ── PUBLISH ─────────────────────────────────────────────────────────────────

const publishBody = (fixtureId, sideId) => ({ type: 'squad',
  data: { published: true, fixtureId, sideId, formationNames: { 1: 'New Name' }, benchPlayers: [] } });

test('PUBLISH — own group allowed; another group\'s fixture refused and nothing written', async () => {
  await seed();
  kv.delete(u18SheetKey);
  const own = await call('u-u18-coach', { method: 'POST', body: publishBody('fx-u18', 't-u18a') });
  assert.equal(own.code, 200, JSON.stringify(own.body));
  assert.ok(readSheet(u18SheetKey), 'own-group sheet stored');

  const before = kv.get(senSheetKey);
  const pointerBefore = kv.get(pointerKey);
  const cross = await call('u-u18-coach', { method: 'POST', body: publishBody('fx-sen', 't-prem') });
  assert.equal(cross.code, 403, JSON.stringify(cross.body));
  assert.equal(kv.get(senSheetKey), before, 'Seniors sheet untouched');
  assert.equal(kv.get(pointerKey), pointerBefore, 'player-facing pointer untouched');

  const senCross = await call('u-sen-coach', { method: 'POST', body: publishBody('fx-u18', 't-u18a') });
  assert.equal(senCross.code, 403, JSON.stringify(senCross.body));
});

test('PUBLISH — a club-wide admin publishes across groups', async () => {
  await seed();
  const r = await call('u-admin', { method: 'POST', body: publishBody('fx-u18', 't-u18a') });
  assert.equal(r.code, 200, JSON.stringify(r.body));
});

test('PUBLISH — a forged own-group parameter cannot smuggle a foreign fixture through', async () => {
  await seed();
  // The caller names their OWN group in every channel a group can travel in —
  // the fixture's stored group must still decide, and it says Seniors.
  const r = await call('u-u18-coach', {
    method: 'POST',
    query: { group: U18 },
    body: { ...publishBody('fx-sen', 't-prem'), group: U18, groupId: U18 },
  });
  assert.equal(r.code, 403, JSON.stringify(r.body));
});

test('PUBLISH — fixture/side group coherence still refuses a mismatched side', async () => {
  await seed();
  const r = await call('u-u18-coach', { method: 'POST', body: publishBody('fx-u18', 't-prem') });
  assert.equal(r.code, 400, JSON.stringify(r.body));
});

// ── WITHDRAW ────────────────────────────────────────────────────────────────

const withdrawBody = (fixtureId, sideId) => ({ type: 'squad', data: { published: false, fixtureId, sideId } });

test('WITHDRAW — own group allowed; another group\'s sheet survives the attempt', async () => {
  await seed();
  const own = await call('u-u18-coach', { method: 'POST', body: withdrawBody('fx-u18', 't-u18a') });
  assert.equal(own.code, 200, JSON.stringify(own.body));
  assert.equal(kv.get(u18SheetKey), undefined, 'own sheet withdrawn');

  const cross = await call('u-u18-coach', { method: 'POST', body: withdrawBody('fx-sen', 't-prem') });
  assert.equal(cross.code, 403, JSON.stringify(cross.body));
  assert.ok(kv.get(senSheetKey), 'Seniors sheet still published');

  const viaDelete = await call('u-sen-coach', { method: 'DELETE', query: {}, body: { type: 'squad', fixtureId: 'fx-u18', sideId: 't-u18a' } });
  assert.equal(viaDelete.code, 403, JSON.stringify(viaDelete.body));

  const admin = await call('u-admin', { method: 'DELETE', body: { type: 'squad', fixtureId: 'fx-sen', sideId: 't-prem' } });
  assert.equal(admin.code, 200, JSON.stringify(admin.body));
  assert.equal(kv.get(senSheetKey), undefined, 'admin withdrawal works');
});

// ── THE UNLINKED (LEGACY) CLUB-WIDE SLOT ────────────────────────────────────

test('UNLINKED — in a multi-group club only all-group authority may touch the club-wide slot', async () => {
  await seed();
  // The unlinked/legacy slot is the INITIAL group's pointer (only initial-group
  // players ever saw it), so all-group authority is still what governs it.
  kv.set(legacySquadKey, JSON.stringify({ published: true, formationNames: { 1: 'Legacy Slot Sentinel' } }));
  kv.set(senPointerKey, JSON.stringify({ mode: 'legacy', fixtureId: '', groupId: SEN }));

  // A scoped coach can neither hijack the slot with an unlinked publish…
  const hijack = await call('u-u18-coach', { method: 'POST',
    body: { type: 'squad', data: { published: true, formationNames: { 1: 'Hijack' } } } });
  assert.equal(hijack.code, 403, JSON.stringify(hijack.body));

  // …nor blank the initial group's view with an unlinked withdraw.
  const blank = await call('u-u18-coach', { method: 'DELETE', body: { type: 'squad' } });
  assert.equal(blank.code, 403, JSON.stringify(blank.body));
  assert.ok(kv.get(legacySquadKey), 'club-wide squad survives');
  assert.equal(JSON.parse(kv.get(senPointerKey)).mode, 'legacy', 'pointer untouched');

  // The club-wide admin retains both.
  const adminBlank = await call('u-admin', { method: 'DELETE', body: { type: 'squad' } });
  assert.equal(adminBlank.code, 200, JSON.stringify(adminBlank.body));
  assert.equal(JSON.parse(kv.get(senPointerKey)).mode, 'none');
});

test('UNLINKED — a one-group club keeps its documented legacy behaviour for a scoped coach', async () => {
  await seed(ONE_GROUP);
  kv.set(`app:club:${CLUB}`, JSON.stringify({ fixtures: [] }));
  const r = await call('u-sen-coach', { method: 'POST',
    body: { type: 'squad', data: { published: true, formationNames: { 1: 'Only Group' } } } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const w = await call('u-sen-coach', { method: 'DELETE', body: { type: 'squad' } });
  assert.equal(w.code, 200, JSON.stringify(w.body));
});

// ── DRAFTS (fixture-named working copies live inside the same boundary) ─────

test('DRAFT — working copies for another group\'s fixture are refused, own group works', async () => {
  await seed();
  const cross = await call('u-u18-coach', { method: 'POST',
    body: { type: 'draft', data: { fixtureId: 'fx-sen', sideId: 't-prem', formationNames: { 1: 'X' } } } });
  assert.equal(cross.code, 403, JSON.stringify(cross.body));

  const crossRead = await call('u-u18-coach', { query: { type: 'draft', fixture: 'fx-sen', side: 't-prem' } });
  assert.equal(crossRead.code, 403, JSON.stringify(crossRead.body));

  const own = await call('u-u18-coach', { method: 'POST',
    body: { type: 'draft', data: { fixtureId: 'fx-u18', sideId: 't-u18a', formationNames: { 1: 'Mine' } } } });
  assert.equal(own.code, 200, JSON.stringify(own.body));
  const ownRead = await call('u-u18-coach', { query: { type: 'draft', fixture: 'fx-u18', side: 't-u18a' } });
  assert.equal(ownRead.code, 200, JSON.stringify(ownRead.body));
  assert.equal(ownRead.body.draft?.formationNames?.[1], 'Mine');
});

// ── SEASON SHEETS ───────────────────────────────────────────────────────────

test('SEASON — without ?group= the response holds ONLY the caller\'s groups', async () => {
  await seed();
  const r = await call('u-u18-coach', { query: { resource: 'season-sheets' } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const raw = JSON.stringify(r.body);
  assert.ok(raw.includes('U18 Prop Sentinel'), 'own group\'s sheet present');
  assert.ok(!raw.includes('Sen Prop Sentinel'), 'Seniors sheet content absent');
  assert.ok(!raw.includes('Legacy Prop Sentinel'), 'initial-group legacy sheet absent');
  assert.deepEqual(r.body.sheets.map(s => s.fixtureId), ['fx-u18']);
  assert.equal(r.body.playedFixtures, 1, 'played count is scoped too');
});

test('SEASON — the Seniors coach sees Seniors and the legacy fixture, nothing else', async () => {
  await seed();
  const r = await call('u-sen-coach', { query: { resource: 'season-sheets' } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.sheets.map(s => s.fixtureId).sort(), ['fx-legacy', 'fx-sen']);
  assert.ok(!JSON.stringify(r.body).includes('U18 Prop Sentinel'), 'no U18 content');
});

test('SEASON — a forged ?group= is refused; the own group works; the admin sees all', async () => {
  await seed();
  const forged = await call('u-u18-coach', { query: { resource: 'season-sheets', group: SEN } });
  assert.equal(forged.code, 403, JSON.stringify(forged.body));

  const own = await call('u-u18-coach', { query: { resource: 'season-sheets', group: U18 } });
  assert.equal(own.code, 200, JSON.stringify(own.body));
  assert.deepEqual(own.body.sheets.map(s => s.fixtureId), ['fx-u18']);

  const admin = await call('u-admin', { query: { resource: 'season-sheets' } });
  assert.equal(admin.code, 200, JSON.stringify(admin.body));
  assert.deepEqual(admin.body.sheets.map(s => s.fixtureId).sort(), ['fx-legacy', 'fx-sen', 'fx-u18']);
});

// ── PLAYER GROUP ISOLATION (PUBLISHED-SQUAD-GROUP-SCOPE-FIX-1, P0) ────────────
// The pointer is per-group, so publishing one group's squad moves ONLY that
// group's players' view. A player is never shown another group's publication —
// the intra-club cross-group leak this fix closes.
//
// These drive REAL publishes through the handler and read as REAL players.
// Fresh empty pointers each seed(): no group sees anything until its coach
// publishes (no fallback to the pre-fix club-wide key).

const pub = k => { try { return JSON.parse(kv.get(k)); } catch { return kv.get(k) ?? null; } };
const playerSheets = async userId => {
  const r = await call(userId, { query: { type: 'squad' } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  return (r.body.publishedSheets || []).map(s => ({ fixtureId: s.fixtureId, side: s.sideId }));
};

test('P0 — group A publishes; A player sees it, B player does NOT', async () => {
  await seed();
  const p = await call('u-u18-coach', { method: 'POST', body: publishBody('fx-u18', 't-u18a') });
  assert.equal(p.code, 200, JSON.stringify(p.body));

  assert.deepEqual(await playerSheets('u-u18-player'), [{ fixtureId: 'fx-u18', side: 't-u18a' }], 'U18 player sees U18');
  assert.deepEqual(await playerSheets('u-player'), [], 'Seniors player sees NOTHING of the U18 publish');
  assert.equal(pub(u18PointerKey)?.mode, 'fixture', 'only the U18 pointer moved');
  assert.equal(kv.get(senPointerKey), undefined, 'the Seniors pointer was never written');
  assert.equal(kv.get(pointerKey), undefined, 'the pre-fix club-wide pointer is never written');
});

test('P0 — B then publishes; A keeps A, B sees B; neither pointer replaces the other', async () => {
  await seed();
  await call('u-u18-coach', { method: 'POST', body: publishBody('fx-u18', 't-u18a') });
  await call('u-sen-coach', { method: 'POST', body: publishBody('fx-sen', 't-prem') });

  assert.deepEqual(await playerSheets('u-player'), [{ fixtureId: 'fx-sen', side: 't-prem' }], 'Seniors sees Seniors');
  assert.deepEqual(await playerSheets('u-u18-player'), [{ fixtureId: 'fx-u18', side: 't-u18a' }], 'U18 still sees U18');
  assert.equal(pub(senPointerKey)?.fixtureId, 'fx-sen');
  assert.equal(pub(u18PointerKey)?.fixtureId, 'fx-u18', 'publishing Seniors did not touch the U18 pointer');
});

test('P0 — SAMUEL regression: U18 publish never shows a Seniors player a U18 card', async () => {
  await seed();
  // U18 Premier is published. "Samuel" (Seniors, not on any U18 sheet) must see nothing.
  await call('u-u18-coach', { method: 'POST', body: publishBody('fx-u18', 't-u18a') });
  const samuelAfterU18 = await playerSheets('u-player');
  assert.deepEqual(samuelAfterU18, [], 'Samuel sees NO "not selected for U18 Premier" card');
  assert.equal(JSON.stringify(samuelAfterU18).includes('u18'), false);
  // A U18 player DOES see the U18 publication.
  assert.deepEqual(await playerSheets('u-u18-player'), [{ fixtureId: 'fx-u18', side: 't-u18a' }]);

  // Then Seniors publishes: Samuel sees Seniors; U18 players still see U18.
  await call('u-sen-coach', { method: 'POST', body: publishBody('fx-sen', 't-prem') });
  assert.deepEqual(await playerSheets('u-player'), [{ fixtureId: 'fx-sen', side: 't-prem' }], 'Samuel now sees Seniors');
  assert.deepEqual(await playerSheets('u-u18-player'), [{ fixtureId: 'fx-u18', side: 't-u18a' }], 'U18 unchanged');
});

test('P0 — ALPHA regression: a player sees his own group\'s publication card', async () => {
  await seed();
  // Alpha is the U18 player; when U18 is the published group he sees the U18 card.
  await call('u-u18-coach', { method: 'POST', body: publishBody('fx-u18', 't-u18a') });
  const alpha = await playerSheets('u-u18-player');
  assert.deepEqual(alpha, [{ fixtureId: 'fx-u18', side: 't-u18a' }], 'Alpha sees the correct U18 card');
});

test('P0 — an arbitrary ?group= cannot expose another group\'s publication', async () => {
  await seed();
  await call('u-u18-coach', { method: 'POST', body: publishBody('fx-u18', 't-u18a') });
  // A Seniors player supplies ?group=U18. A group is only honoured for a caller
  // who OPERATES it (staff); a player operates none, so the forged group is
  // REFUSED — never served — and U18's publication stays invisible.
  const r = await call('u-player', { query: { type: 'squad', group: U18 } });
  assert.equal(r.code, 403, JSON.stringify(r.body));
  assert.equal(JSON.stringify(r.body).includes('Sentinel'), false, 'refusal carries no sheet content');
  // Without the forged parameter the same player sees their own (empty) group.
  const plain = await call('u-player', { query: { type: 'squad' } });
  assert.equal(plain.code, 200, JSON.stringify(plain.body));
  assert.deepEqual(plain.body.publishedSheets || [], []);
});

test('P0 — a known group with no pointer does NOT fall back to the club-wide legacy squad', async () => {
  await seed();
  // A pre-fix club-wide legacy squad exists, naming a U18 fixture. A U18 player
  // whose group pointer is absent must NOT inherit it.
  kv.set(legacySquadKey, JSON.stringify({ published: true, fixtureId: 'fx-u18',
    formationNames: { 1: 'Leaked Name' }, benchPlayers: [] }));
  assert.deepEqual(await playerSheets('u-u18-player'), [], 'no club-wide fallback for a non-initial group');
  assert.equal(JSON.stringify(await call('u-u18-player', { query: { type: 'squad' } })).includes('Leaked'), false);
});

test('P0 — the legacy sideless publish is the INITIAL group only, never a newer group', async () => {
  await seed();
  kv.delete(senSheetKey); kv.delete(u18SheetKey); kv.delete(legacySheetKey);
  // An admin (whole-club authority) publishes an unlinked, sideless squad.
  const r = await call('u-admin', { method: 'POST', body: { type: 'squad',
    data: { published: true, formationNames: { 1: 'Legacy Only' }, benchPlayers: [] } } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(pub(senPointerKey)?.mode, 'legacy', 'the legacy pointer is the INITIAL group\'s');
  assert.equal(kv.get(u18PointerKey), undefined, 'no U18 legacy pointer');
  // Seniors (initial) sees it; U18 does not.
  assert.equal((await playerSheets('u-player')).length, 1, 'initial-group player sees the sideless squad');
  assert.deepEqual(await playerSheets('u-u18-player'), [], 'U18 player never sees the legacy sideless squad');
});

test('P0 — withdraw settles ONLY the withdrawing group\'s pointer', async () => {
  await seed();
  await call('u-u18-coach', { method: 'POST', body: publishBody('fx-u18', 't-u18a') });
  await call('u-sen-coach', { method: 'POST', body: publishBody('fx-sen', 't-prem') });
  // Withdraw the U18 side sheet.
  const w = await call('u-u18-coach', { method: 'POST',
    body: { type: 'squad', data: { published: false, fixtureId: 'fx-u18', sideId: 't-u18a' } } });
  assert.equal(w.code, 200, JSON.stringify(w.body));
  assert.equal(pub(u18PointerKey)?.mode, 'none', 'U18 pointer settled to none');
  assert.equal(pub(senPointerKey)?.fixtureId, 'fx-sen', 'Seniors pointer untouched by the U18 withdrawal');
  assert.deepEqual(await playerSheets('u-u18-player'), [], 'U18 player now sees nothing');
  assert.deepEqual(await playerSheets('u-player'), [{ fixtureId: 'fx-sen', side: 't-prem' }], 'Seniors still sees Seniors');
});

test('P0 — four groups: a publish in one is invisible to the other three', async () => {
  // Extend the structure to four groups with an admin publishing each fixture.
  const FOUR = {
    version: 1,
    groups: [
      { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
      { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
      { id: 'grp-w', name: 'Women', type: 'general', status: 'active' },
      { id: 'grp-u16', name: 'U16', type: 'age-grade', status: 'active' },
    ],
    teams: [
      { id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' },
      { id: 't-u18a', groupId: U18, name: 'U18 Premier', status: 'active' },
      { id: 't-w', groupId: 'grp-w', name: 'Women 1', status: 'active' },
      { id: 't-u16', groupId: 'grp-u16', name: 'U16 A', status: 'active' },
    ],
  };
  await seed(FOUR);
  // Only U18 publishes.
  await call('u-admin', { method: 'POST', body: publishBody('fx-u18', 't-u18a') });
  // The Seniors player (u-player) and any non-U18 player see nothing.
  assert.deepEqual(await playerSheets('u-player'), [], 'Seniors sees nothing of the U18 publish');
  assert.deepEqual(await playerSheets('u-u18-player'), [{ fixtureId: 'fx-u18', side: 't-u18a' }], 'only U18 sees it');
  assert.equal(kv.get(senPointerKey), undefined);
  assert.equal(kv.get(`app:publish:${CLUB}:squad:current:grp-w`), undefined);
  assert.equal(kv.get(`app:publish:${CLUB}:squad:current:grp-u16`), undefined);
});

test('P0 — a crossed pointer (group A naming a group B fixture) leaks nothing', async () => {
  await seed();
  // Force the pathological state the write path can never produce: the U18
  // group pointer naming a SENIORS fixture. The read's defence-in-depth guard
  // must still refuse to serve another group's sheets.
  kv.set(u18PointerKey, JSON.stringify({ mode: 'fixture', fixtureId: 'fx-sen', groupId: U18 }));
  const sheets = await playerSheets('u-u18-player');
  assert.deepEqual(sheets, [], 'the U18 player never receives the Seniors fixture\'s sheets');
  const raw = await call('u-u18-player', { query: { type: 'squad' } });
  assert.equal(JSON.stringify(raw.body).includes('Sen Prop Sentinel'), false, 'no Seniors content leaks');
});
