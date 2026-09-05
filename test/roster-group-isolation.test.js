/**
 * ROSTER GROUP ISOLATION — read projection and write merge.
 *
 * The roster blob is the richest personal record in the product: phone,
 * email, date of birth, guardian and emergency contacts, medical notes. The
 * contract these tests pin:
 *
 *   READ  — a caller whose operational scope covers EVERY active group gets
 *           the whole club (Club Administration, and every one-group club,
 *           exactly as before). A group-scoped caller gets only the rows
 *           whose MEMBERSHIP playerGroupId falls inside their scope — other
 *           groups' rows are absent from the response, not hidden in it, and
 *           unassigned rows stay a club-administration surface.
 *   WRITE — a covering caller replaces the record (existing semantics). A
 *           scoped caller's save is MERGED server-side: rows outside their
 *           scope are kept verbatim (a submitted copy of them is stale data,
 *           never an edit), rows inside their scope are replaced/added/
 *           removed by the submission, and a new row cannot hijack an
 *           out-of-scope row's id.
 *
 * Group identity comes from membership playerGroupId — never a query
 * parameter, body field, team name or age label.
 *
 * All personal values below are fabricated sentinels, never real data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.rgi.test';
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

const CLUB = 'club-rgi';
const SEN = INITIAL_GROUP_ID, U18 = 'grp-u18', WOM = 'grp-wom', U16 = 'grp-u16';

const STRUCTURE = {
  version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
    { id: WOM, name: "Women's", type: 'general', status: 'active' },
    { id: U16, name: 'U16', type: 'age-grade', status: 'active' },
  ],
  teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' }],
};
const ONE_GROUP = {
  version: 1,
  groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' }],
  teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' }],
};

const scope = (...groupIds) =>
  ({ clubWide: false, groups: groupIds.map(groupId => ({ groupId, status: 'active' })), teams: [] });

const MEMBERS = [
  { id: 'm-sen-a', teamId: CLUB, userId: 'u-sen-a', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-sen-b', teamId: CLUB, userId: 'u-sen-b', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-u18-a', teamId: CLUB, userId: 'u-u18-a', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm-u18-b', teamId: CLUB, userId: 'u-u18-b', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm-wom-a', teamId: CLUB, userId: 'u-wom-a', role: 'player', status: 'active', playerGroupId: WOM },
  { id: 'm-sen-coach', teamId: CLUB, userId: 'u-sen-coach', role: 'coach', status: 'active',
    accessProfile: 'coach', accessScope: scope(SEN) },
  { id: 'm-u18-coach', teamId: CLUB, userId: 'u-u18-coach', role: 'coach', status: 'active',
    accessProfile: 'coach', accessScope: scope(U18) },
  { id: 'm-two-coach', teamId: CLUB, userId: 'u-two-coach', role: 'coach', status: 'active',
    accessProfile: 'coach', accessScope: scope(SEN, U18) },
  { id: 'm-admin', teamId: CLUB, userId: 'u-admin', role: 'admin', status: 'active', isOwner: true },
];

// Fabricated sentinels — the strings below exist nowhere but this file.
const ROSTER = [
  { id: 'p-sen-a', userId: 'u-sen-a', name: 'Senior A', phone: 'SEN-PHONE-SENTINEL-1',
    dateOfBirth: '1999-01-01', parentGuardianName: 'SEN-GUARDIAN-SENTINEL', medical: 'SEN-MEDICAL-SENTINEL' },
  { id: 'p-sen-b', userId: 'u-sen-b', name: 'Senior B', emergencyContact: 'SEN-EMERGENCY-SENTINEL' },
  { id: 'p-u18-a', userId: 'u-u18-a', name: 'U18 A', phone: 'U18-PHONE-SENTINEL-1',
    parentGuardianEmail: 'U18-GUARDIAN-EMAIL-SENTINEL' },
  { id: 'p-u18-b', userId: 'u-u18-b', name: 'U18 B' },
  { id: 'p-wom-a', userId: 'u-wom-a', name: 'Woman A', phone: 'WOM-PHONE-SENTINEL-1' },
  { id: 'p-orphan', name: 'Unlinked Player', phone: 'ORPHAN-PHONE-SENTINEL' },
];

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: CLUB, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
async function seed(structure = STRUCTURE) {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club RGI' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(structure));
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: ROSTER, updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: 'u-admin' }));
  for (const m of MEMBERS) await login(m.userId);
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
async function roster(userId, { method = 'GET', query = {}, body = null } = {}) {
  const r = res();
  await publishHandler({ method, query: { resource: 'roster', ...query }, body,
    headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}
const names = r => (r.body.players || []).map(p => p.name).sort();
const storedRoster = () => JSON.parse(kv.get(`app:roster:${CLUB}`)).players;
const storedByName = name => storedRoster().find(p => p.name === name);

// ── READ ────────────────────────────────────────────────────────────────────

test('READ — a scoped coach with no ?group= receives ONLY their groups\' rows, sentinels absent', async () => {
  await seed();
  const r = await roster('u-u18-coach');
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.deepEqual(names(r), ['U18 A', 'U18 B']);
  const raw = JSON.stringify(r.body);
  assert.ok(raw.includes('U18-PHONE-SENTINEL-1'), 'own group\'s contact data still serves its staff');
  for (const leaked of ['SEN-PHONE-SENTINEL-1', 'SEN-GUARDIAN-SENTINEL', 'SEN-MEDICAL-SENTINEL',
                        'SEN-EMERGENCY-SENTINEL', 'WOM-PHONE-SENTINEL-1', 'ORPHAN-PHONE-SENTINEL']) {
    assert.ok(!raw.includes(leaked), `${leaked} must be absent from the response`);
  }
});

test('READ — the Seniors coach gets Seniors only; unassigned rows stay club administration', async () => {
  await seed();
  const r = await roster('u-sen-coach');
  assert.equal(r.code, 200);
  assert.deepEqual(names(r), ['Senior A', 'Senior B']);
  assert.ok(!JSON.stringify(r.body).includes('ORPHAN-PHONE-SENTINEL'), 'unlinked row absent');
});

test('READ — a coach scoped to two groups receives their union and nothing more', async () => {
  await seed();
  const r = await roster('u-two-coach');
  assert.equal(r.code, 200);
  assert.deepEqual(names(r), ['Senior A', 'Senior B', 'U18 A', 'U18 B']);
  assert.ok(!JSON.stringify(r.body).includes('WOM-PHONE-SENTINEL-1'));
});

test('READ — the club-wide admin keeps the whole-club read, unlinked row included', async () => {
  await seed();
  const r = await roster('u-admin');
  assert.equal(r.code, 200);
  assert.deepEqual(names(r), ['Senior A', 'Senior B', 'U18 A', 'U18 B', 'Unlinked Player', 'Woman A']);
  assert.equal(r.body.updatedAt, '2026-01-01T00:00:00.000Z', 'metadata unchanged');
});

test('READ — forged group parameters cannot widen a scoped read', async () => {
  await seed();
  const forgedQuery = await roster('u-u18-coach', { query: { group: SEN } });
  assert.equal(forgedQuery.code, 403, JSON.stringify(forgedQuery.body));
  // The GET group is a query concern; a body groupId means nothing — prove it.
  const forgedBody = await roster('u-u18-coach', { body: { groupId: SEN, selectedGroup: SEN, group: SEN } });
  assert.equal(forgedBody.code, 200);
  assert.deepEqual(names(forgedBody), ['U18 A', 'U18 B']);
  const own = await roster('u-u18-coach', { query: { group: U18 } });
  assert.equal(own.code, 200);
  assert.deepEqual(names(own), ['U18 A', 'U18 B']);
});

test('READ — a one-group club is untouched: its scoped coach still reads everything', async () => {
  await seed(ONE_GROUP);
  const r = await roster('u-sen-coach');
  assert.equal(r.code, 200);
  assert.equal(r.body.players.length, ROSTER.length, 'covers-the-club rule preserves legacy behaviour');
});

// ── WRITE ───────────────────────────────────────────────────────────────────

test('WRITE — the full-club payload attack: cross-group edits and deletions never land', async () => {
  await seed();
  // A U18 coach submits the WHOLE club: Senior A's phone "changed", Senior B
  // and Woman A and the unlinked row deleted, their own U18 A edited, U18 B
  // dropped, and a new U18 player added.
  const attack = [
    { id: 'p-sen-a', userId: 'u-sen-a', name: 'Senior A', phone: 'ATTACKER-CHANGED-PHONE' },
    { id: 'p-u18-a', userId: 'u-u18-a', name: 'U18 A', phone: 'U18-PHONE-UPDATED', position: 'FLY' },
    { id: 'p-u18-new', userId: 'u-u18-b', name: 'U18 New Row' },
  ];
  const r = await roster('u-u18-coach', { method: 'POST', body: { players: attack } });
  assert.equal(r.code, 200, JSON.stringify(r.body));

  const after = storedRoster();
  assert.equal(storedByName('Senior A').phone, 'SEN-PHONE-SENTINEL-1', 'Seniors phone untouched');
  assert.equal(storedByName('Senior A').medical, 'SEN-MEDICAL-SENTINEL', 'Seniors medical untouched');
  assert.ok(storedByName('Senior B'), 'Senior B survives the deletion attempt');
  assert.ok(storedByName('Woman A'), 'Woman A survives');
  assert.ok(storedByName('Unlinked Player'), 'unassigned row survives');
  assert.equal(storedByName('U18 A').phone, 'U18-PHONE-UPDATED', 'own-group edit applied');
  assert.ok(!storedByName('U18 B'), 'own-group omission removes the row (existing replace semantics, scoped)');
  assert.ok(storedByName('U18 New Row'), 'own-group addition applied');
  assert.equal(after.length, ROSTER.length,
    'exactly the in-scope changes: U18 B out, U18 New Row in — nothing else moved');
});

test('WRITE — the scoped client\'s normal save (own rows only) preserves everyone else', async () => {
  await seed();
  const mine = ROSTER.filter(p => ['p-u18-a', 'p-u18-b'].includes(p.id));
  const r = await roster('u-u18-coach', { method: 'POST', body: { players: mine } });
  assert.equal(r.code, 200);
  assert.deepEqual(storedRoster().map(p => p.name).sort(),
    ['Senior A', 'Senior B', 'U18 A', 'U18 B', 'Unlinked Player', 'Woman A'],
    'nothing outside U18 changed');
});

test('WRITE — an empty scoped save clears only the caller\'s own groups', async () => {
  await seed();
  const r = await roster('u-u18-coach', { method: 'POST', body: { players: [] } });
  assert.equal(r.code, 200);
  assert.deepEqual(storedRoster().map(p => p.name).sort(),
    ['Senior A', 'Senior B', 'Unlinked Player', 'Woman A']);
});

test('WRITE — a scoped coach cannot create rows for another group or for no group', async () => {
  await seed();
  const r = await roster('u-u18-coach', { method: 'POST', body: { players: [
    ...ROSTER.filter(p => ['p-u18-a', 'p-u18-b'].includes(p.id)),
    { id: 'p-smuggle-1', userId: 'u-wom-a', name: 'Smuggled Woman Row' },
    { id: 'p-smuggle-2', name: 'Smuggled Unassigned Row' },
  ] } });
  assert.equal(r.code, 200);
  assert.ok(!storedByName('Smuggled Woman Row'), 'cross-group creation refused');
  assert.ok(!storedByName('Smuggled Unassigned Row'), 'unassigned creation is club administration');
});

test('WRITE — a new in-scope row cannot hijack an out-of-scope row\'s id', async () => {
  await seed();
  const r = await roster('u-u18-coach', { method: 'POST', body: { players: [
    ...ROSTER.filter(p => ['p-u18-a', 'p-u18-b'].includes(p.id)),
    { id: 'p-sen-a', userId: 'u-u18-a', name: 'Id Hijack Row' },
  ] } });
  assert.equal(r.code, 200);
  const rows = storedRoster().filter(p => p.id === 'p-sen-a');
  assert.equal(rows.length, 1, 'one row for that id');
  assert.equal(rows[0].name, 'Senior A', 'and it is the original');
});

test('WRITE — the Seniors coach cannot modify U18 rows either', async () => {
  await seed();
  const r = await roster('u-sen-coach', { method: 'POST', body: { players: [
    ...ROSTER.filter(p => ['p-sen-a', 'p-sen-b'].includes(p.id)),
    { id: 'p-u18-a', userId: 'u-u18-a', name: 'U18 A', phone: 'SEN-COACH-TAMPERED' },
  ] } });
  assert.equal(r.code, 200);
  assert.equal(storedByName('U18 A').phone, 'U18-PHONE-SENTINEL-1', 'U18 row untouched');
});

test('WRITE — the club-wide admin keeps the full replace workflow', async () => {
  await seed();
  const replaced = [
    { id: 'p-sen-a', userId: 'u-sen-a', name: 'Senior A', phone: 'ADMIN-UPDATED-PHONE' },
    { id: 'p-u18-a', userId: 'u-u18-a', name: 'U18 A' },
    { id: 'p-orphan', name: 'Unlinked Player' },
  ];
  const r = await roster('u-admin', { method: 'POST', body: { players: replaced } });
  assert.equal(r.code, 200);
  assert.equal(r.body.count, 3);
  assert.deepEqual(storedRoster().map(p => p.name).sort(), ['Senior A', 'U18 A', 'Unlinked Player']);
  assert.equal(storedByName('Senior A').phone, 'ADMIN-UPDATED-PHONE');
});

test('WRITE — a one-group club\'s scoped coach keeps the full replace (legacy behaviour)', async () => {
  await seed(ONE_GROUP);
  const r = await roster('u-sen-coach', { method: 'POST', body: { players: [
    { id: 'p-only', userId: 'u-sen-a', name: 'Only Row' },
  ] } });
  assert.equal(r.code, 200);
  assert.deepEqual(storedRoster().map(p => p.name), ['Only Row']);
});
