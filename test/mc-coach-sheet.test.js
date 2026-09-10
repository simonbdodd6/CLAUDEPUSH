/**
 * MATCH CENTRE — "Publish to coaches" (coach publication snapshot).
 *
 * A NEW, explicit coach-facing snapshot, separate from the private per-coach
 * DRAFT and from the player-facing SQUAD. It shares the squad publish's exact
 * authorisation — PUBLISH_SQUADS plus the fixture/side/coherence/operational-
 * group quartet — and writes ONLY its own coachsheet key: the player pointer
 * and squad key are never touched, and publishing to coaches sends no player
 * notification. publishedBy comes from the session, never the body; re-publish
 * overwrites the single current publication; a partial/empty sheet is allowed.
 *
 * Drives the REAL publish handler over a seeded KV, with app:structure carrying
 * the fixtures' groups so real group authorisation runs (not a shortcut).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.mccoach.test';
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

const CLUB = 'club-mcc', CLUB2 = 'club-mcc2';
const SEN = INITIAL_GROUP_ID, U18 = 'grp-u18', SEN2 = 'grp-sen2';

const STRUCTURE = {
  version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
  ],
  teams: [
    { id: 't-prem', groupId: SEN, name: 'Premier',      status: 'active' },
    { id: 't-dev',  groupId: SEN, name: 'Premier Development', status: 'active' },
    { id: 't-u18a', groupId: U18, name: 'U18 Premier',  status: 'active' },
  ],
};
const STRUCTURE2 = {
  version: 1,
  groups: [{ id: SEN2, name: 'Seniors', type: 'general', status: 'active' }],
  teams: [{ id: 't2-prem', groupId: SEN2, name: 'Premier', status: 'active' }],
};

const scope = groupId => ({ clubWide: false, groups: [{ groupId, status: 'active' }], teams: [] });
const MEMBERS = [
  // PUBLISH_SQUADS holders
  { id: 'm-sen-coach', teamId: CLUB, userId: 'u-sen-coach', role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope(SEN) },
  { id: 'm-u18-coach', teamId: CLUB, userId: 'u-u18-coach', role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope(U18) },
  { id: 'm-admin',     teamId: CLUB, userId: 'u-admin',     role: 'admin', status: 'active', isOwner: true },   // club-wide
  // NON-holders (all placed IN the SEN group, so a refusal is about the PERMISSION, not scope)
  { id: 'm-manager',   teamId: CLUB, userId: 'u-manager',   role: 'coach',   status: 'active', accessProfile: 'manager', accessScope: scope(SEN) },
  { id: 'm-medical',   teamId: CLUB, userId: 'u-medical',   role: 'medical', status: 'active', accessScope: scope(SEN) },
  { id: 'm-snc',       teamId: CLUB, userId: 'u-snc',       role: 'snc',     status: 'active', accessScope: scope(SEN) },
  { id: 'm-analyst',   teamId: CLUB, userId: 'u-analyst',   role: 'analyst', status: 'active', accessScope: scope(SEN) },
  { id: 'm-player',    teamId: CLUB, userId: 'u-player',    role: 'player',  status: 'active', playerGroupId: SEN },
  // Second club
  { id: 'm2-coach',    teamId: CLUB2, userId: 'u2-coach',   role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope(SEN2) },
];

const FIXTURES = [
  { id: 'fx-sen', groupId: SEN, sideId: 't-prem', team: 'Premier', opposition: 'Mons',  date: '2026-08-20', status: 'scheduled' },
  { id: 'fx-u18', groupId: U18, sideId: 't-u18a', team: 'U18 Premier', opposition: 'Liège', date: '2026-08-22', status: 'scheduled' },
];
const FIXTURES2 = [{ id: 'fx2-sen', groupId: SEN2, sideId: 't2-prem', team: 'Premier', opposition: 'Away', date: '2026-08-20', status: 'scheduled' }];

const coachKey     = (fx, side) => `app:publish:${CLUB}:fixture:${fx}:side:${side}:coachsheet`;
const squadKey     = (fx, side) => `app:publish:${CLUB}:fixture:${fx}:side:${side}:squad`;
const draftKey     = (fx, side, uid) => `app:publish:${CLUB}:fixture:${fx}:side:${side}:draft:${encodeURIComponent(uid)}`;
const pointerKey   = `app:publish:${CLUB}:squad:current`;

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: m.teamId, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
async function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club MCC' }, { id: CLUB2, name: 'Club MCC2' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId.replace('u-', '') }))));
  kv.set(`app:structure:${CLUB}`,  JSON.stringify(STRUCTURE));
  kv.set(`app:structure:${CLUB2}`, JSON.stringify(STRUCTURE2));
  kv.set(`app:club:${CLUB}`,  JSON.stringify({ fixtures: FIXTURES }));
  kv.set(`app:club:${CLUB2}`, JSON.stringify({ fixtures: FIXTURES2 }));
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
const readKv = k => { try { return JSON.parse(kv.get(k)); } catch { return kv.get(k) ?? null; } };

// A publish body naming the Premier (SEN) side unless overridden.
const pubBody = (fx = 'fx-sen', side = 't-prem', extra = {}) => ({
  type: 'coach_sheet',
  data: { fixtureId: fx, sideId: side, formationNames: { 1: 'Prop A' }, benchPlayers: ['Bench A'], ...extra },
});

// ── 1. authorised in-group coach can publish ─────────────────────────────────
test('1: an in-group PUBLISH_SQUADS coach publishes → 200 and writes the coachsheet key', async () => {
  await seed();
  const r = await call('u-sen-coach', { method: 'POST', body: pubBody() });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const stored = readKv(coachKey('fx-sen', 't-prem'));
  assert.ok(stored, 'coachsheet stored');
  assert.equal(stored.formationNames['1'], 'Prop A');
});

// ── 2–6. non-PUBLISH_SQUADS staff are refused ────────────────────────────────
for (const [label, uid] of [['manager', 'u-manager'], ['medical', 'u-medical'], ['snc', 'u-snc'], ['analyst', 'u-analyst']]) {
  test(`${label === 'manager' ? '2' : label === 'medical' ? '3' : label === 'snc' ? '4' : '5'}: a ${label} cannot publish to coaches → 403, nothing written`, async () => {
    await seed();
    const r = await call(uid, { method: 'POST', body: pubBody() });
    assert.equal(r.code, 403, JSON.stringify(r.body));
    assert.equal(kv.get(coachKey('fx-sen', 't-prem')), undefined, 'no coachsheet written');
  });
}
test('6: a player cannot publish to coaches → 403', async () => {
  await seed();
  const r = await call('u-player', { method: 'POST', body: pubBody() });
  assert.equal(r.code, 403, JSON.stringify(r.body));
  assert.equal(kv.get(coachKey('fx-sen', 't-prem')), undefined);
});

// ── 7–9. read authorisation ──────────────────────────────────────────────────
test('7+8: the in-group coach AND a club-wide admin can read the publication', async () => {
  await seed();
  await call('u-sen-coach', { method: 'POST', body: pubBody() });
  const coach = await call('u-sen-coach', { query: { type: 'coach_sheet', fixture: 'fx-sen', side: 't-prem' } });
  assert.equal(coach.code, 200, JSON.stringify(coach.body));
  assert.equal(coach.body.coachSheet?.formationNames?.['1'], 'Prop A');
  assert.equal(coach.body.publishedByName, 'sen-coach', 'publishedBy joined to a display name');
  const admin = await call('u-admin', { query: { type: 'coach_sheet', fixture: 'fx-sen', side: 't-prem' } });
  assert.equal(admin.code, 200, JSON.stringify(admin.body));
  assert.ok(admin.body.coachSheet, 'admin reads across groups');
});

test('9: a coach of another group cannot READ the publication → 403, no content leaks', async () => {
  await seed();
  await call('u-sen-coach', { method: 'POST', body: pubBody() });
  const r = await call('u-u18-coach', { query: { type: 'coach_sheet', fixture: 'fx-sen', side: 't-prem' } });
  assert.equal(r.code, 403, JSON.stringify(r.body));
  assert.ok(!JSON.stringify(r.body).includes('Prop A'), 'refusal carries no sheet content');
});

test('10: a coach of another group cannot PUBLISH into it → 403, nothing written', async () => {
  await seed();
  const r = await call('u-u18-coach', { method: 'POST', body: pubBody('fx-sen', 't-prem') });
  assert.equal(r.code, 403, JSON.stringify(r.body));
  assert.equal(kv.get(coachKey('fx-sen', 't-prem')), undefined);
});

// ── 11–12. cross-club ────────────────────────────────────────────────────────
test('11+12: another club can neither publish nor read this club\'s fixture', async () => {
  await seed();
  await call('u-sen-coach', { method: 'POST', body: pubBody() });
  const pub = await call('u2-coach', { method: 'POST', body: pubBody('fx-sen', 't-prem') });
  assert.notEqual(pub.code, 200, 'cross-club publish refused: ' + JSON.stringify(pub.body));
  const read = await call('u2-coach', { query: { type: 'coach_sheet', fixture: 'fx-sen', side: 't-prem' } });
  assert.notEqual(read.code, 200, 'cross-club read refused: ' + JSON.stringify(read.body));
  assert.equal(readKv(coachKey('fx-sen', 't-prem')).formationNames['1'], 'Prop A', 'original untouched');
});

// ── 13. coherence ────────────────────────────────────────────────────────────
test('13: a fixture/side mismatch (U18 fixture, Seniors side) is rejected', async () => {
  await seed();
  const r = await call('u-sen-coach', { method: 'POST', body: pubBody('fx-u18', 't-prem') });
  assert.ok(r.code === 400 || r.code === 403, 'incoherent side refused: ' + JSON.stringify(r.body));
});

// ── 14–16. record fields ─────────────────────────────────────────────────────
test('14: publishedBy comes from the SESSION, never the request body', async () => {
  await seed();
  await call('u-sen-coach', { method: 'POST', body: pubBody('fx-sen', 't-prem', { publishedBy: 'u-admin', coachPublishedAt: '1999-01-01T00:00:00.000Z' }) });
  const stored = readKv(coachKey('fx-sen', 't-prem'));
  assert.equal(stored.publishedBy, 'u-sen-coach', 'session identity wins over the forged body value');
});
test('15: coachPublishedAt is server-generated (recent ISO), not the body value', async () => {
  await seed();
  const before = Date.now();
  await call('u-sen-coach', { method: 'POST', body: pubBody('fx-sen', 't-prem', { coachPublishedAt: '1999-01-01T00:00:00.000Z' }) });
  const stored = readKv(coachKey('fx-sen', 't-prem'));
  const t = Date.parse(stored.coachPublishedAt);
  assert.ok(t >= before && t <= Date.now() + 2000, 'timestamp is server "now", not 1999');
});
test('16: the snapshot carries the sanitised squad data', async () => {
  await seed();
  await call('u-sen-coach', { method: 'POST', body: pubBody('fx-sen', 't-prem', { opposition: 'Mons', benchPlayers: ['B1', 'B2'], evil: 'x', formationNames: { 1: 'A', bad: '' } }) });
  const s = readKv(coachKey('fx-sen', 't-prem'));
  assert.equal(s.opposition, 'Mons');
  assert.deepEqual(s.benchPlayers, ['B1', 'B2']);
  assert.equal(s.formationNames['1'], 'A');
  assert.ok(!('bad' in s.formationNames), 'blank formation entries dropped');
  assert.ok(!('evil' in s), 'unknown fields are not stored (sanitised)');
});

// ── 17–20. snapshot independence (the critical behaviour) ─────────────────────
test('17+18: re-publishing replaces the current publication with the new sheet', async () => {
  await seed();
  await call('u-sen-coach', { method: 'POST', body: pubBody('fx-sen', 't-prem', { formationNames: { 1: 'Sheet A' } }) });
  await call('u-sen-coach', { method: 'POST', body: pubBody('fx-sen', 't-prem', { formationNames: { 1: 'Sheet B' } }) });
  const s = readKv(coachKey('fx-sen', 't-prem'));
  assert.equal(s.formationNames['1'], 'Sheet B', 're-publish overwrote the current publication');
});
test('19+20: editing/saving the DRAFT after publishing does NOT mutate the published snapshot', async () => {
  await seed();
  await call('u-sen-coach', { method: 'POST', body: pubBody('fx-sen', 't-prem', { formationNames: { 1: 'Sheet A' } }) });
  // The coach keeps working — the draft moves to Sheet B.
  const draft = await call('u-sen-coach', { method: 'POST', body: { type: 'draft', data: { fixtureId: 'fx-sen', sideId: 't-prem', formationNames: { 1: 'Sheet B' } } } });
  assert.equal(draft.code, 200, JSON.stringify(draft.body));
  const snap = readKv(coachKey('fx-sen', 't-prem'));
  const draftRec = readKv(draftKey('fx-sen', 't-prem', 'u-sen-coach'));
  assert.equal(snap.formationNames['1'], 'Sheet A', 'the coach publication is still Sheet A');
  assert.equal(draftRec.formationNames['1'], 'Sheet B', 'the draft moved on to Sheet B');
  assert.notStrictEqual(snap, draftRec, 'snapshot and draft are separate records (no alias)');
});

// ── 21–22, 25. player-squad isolation ────────────────────────────────────────
test('21+22: publishing to coaches leaves the player squad key AND pointer untouched', async () => {
  await seed();
  // A player squad and pointer already exist for this fixture/side.
  kv.set(squadKey('fx-sen', 't-prem'), JSON.stringify({ published: true, formationNames: { 1: 'Player XV' } }));
  kv.set(pointerKey, JSON.stringify({ mode: 'fixture', fixtureId: 'fx-sen' }));
  const squadBefore = kv.get(squadKey('fx-sen', 't-prem'));
  const pointerBefore = kv.get(pointerKey);
  await call('u-sen-coach', { method: 'POST', body: pubBody('fx-sen', 't-prem', { formationNames: { 1: 'Coach XV' } }) });
  assert.equal(kv.get(squadKey('fx-sen', 't-prem')), squadBefore, 'player squad key unchanged');
  assert.equal(kv.get(pointerKey), pointerBefore, 'player-facing pointer unchanged');
});
test('25: publishing the player squad does NOT create a coachsheet record', async () => {
  await seed();
  const r = await call('u-sen-coach', { method: 'POST', body: { type: 'squad', data: { published: true, fixtureId: 'fx-sen', sideId: 't-prem', formationNames: { 1: 'Player XV' } } } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(kv.get(coachKey('fx-sen', 't-prem')), undefined, 'no coachsheet key created by a squad publish');
});

// ── 26. two sides isolated ───────────────────────────────────────────────────
test('26: the two sides of one fixture keep separate coach publications', async () => {
  await seed();
  await call('u-sen-coach', { method: 'POST', body: pubBody('fx-sen', 't-prem', { formationNames: { 1: 'Premier' } }) });
  await call('u-sen-coach', { method: 'POST', body: pubBody('fx-sen', 't-dev',  { formationNames: { 1: 'Development' } }) });
  assert.equal(readKv(coachKey('fx-sen', 't-prem')).formationNames['1'], 'Premier');
  assert.equal(readKv(coachKey('fx-sen', 't-dev')).formationNames['1'], 'Development');
});

// ── 27–28. empty / partial sheets allowed ────────────────────────────────────
test('27: an EMPTY sheet is allowed (no XV, no bench)', async () => {
  await seed();
  const r = await call('u-sen-coach', { method: 'POST', body: { type: 'coach_sheet', data: { fixtureId: 'fx-sen', sideId: 't-prem', formationNames: {}, benchPlayers: [] } } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.ok(readKv(coachKey('fx-sen', 't-prem')), 'empty publication stored');
});
test('28: a PARTIAL sheet is allowed (a few names, short bench)', async () => {
  await seed();
  const r = await call('u-sen-coach', { method: 'POST', body: { type: 'coach_sheet', data: { fixtureId: 'fx-sen', sideId: 't-prem', formationNames: { 1: 'A', 2: 'B' }, benchPlayers: ['X'] } } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const s = readKv(coachKey('fx-sen', 't-prem'));
  assert.equal(Object.keys(s.formationNames).length, 2);
});

// ── a coach publication needs its fixture ────────────────────────────────────
test('a coach publication with no fixture is refused (no club-wide coach slot)', async () => {
  await seed();
  const r = await call('u-sen-coach', { method: 'POST', body: { type: 'coach_sheet', data: { formationNames: { 1: 'A' } } } });
  assert.equal(r.code, 400, JSON.stringify(r.body));
});

// ── read of a fixture with no publication returns null (not an error) ─────────
test('reading a fixture with no coach publication returns null', async () => {
  await seed();
  const r = await call('u-sen-coach', { query: { type: 'coach_sheet', fixture: 'fx-sen', side: 't-prem' } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.coachSheet, null);
});
