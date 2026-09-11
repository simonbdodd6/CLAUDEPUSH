/**
 * CE-EXPORT-001 — scoped club export for AI CEO.
 *
 * The export is produced through this product's OWN authorisation gates:
 * requireSession → tenantTeamId → canViewClub/canViewGroup/canViewTeam. The
 * club is the caller's session and nothing else; there is no request parameter
 * that can name another one.
 *
 * Drives the REAL handler and the REAL stores against an in-memory KV, so a
 * later change that bypasses the gates fails here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Sessions are stored as a hash of the token, exactly as the product does.
const hashToken = t => createHash('sha256').update(String(t)).digest('hex');

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.club-export.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

// In-memory store. Every WRITE is recorded so the test can prove the export
// performed none.
const kv = new Map();
const writes = [];
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { writes.push(args[0]); kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { writes.push(args[0]); kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  return { ok: true, json: async () => ({ result }) };
};

// The export is served by the EXISTING availability function — the deployment
// ceiling is twelve, so it earns no function of its own.
const handler = (await import('../api/availability.js')).default;
const { buildClubExport, EXPORT_CONTRACT } = await import('../api/_clubExport.js');

const CLUB = 'club-under-test';
const OTHER = 'club-somebody-else';
const GROUP = 'grp-u18';
const TEAM = 'team-u18';

const structure = {
  version: 1, clubId: CLUB, synthesized: false,
  groups: [
    { id: GROUP, name: 'U18', type: 'age-grade', status: 'active' },
    { id: 'grp-senior', name: 'Senior', type: 'general', status: 'active' },
  ],
  teams: [
    { id: TEAM, groupId: GROUP, name: 'U18 Premier', ageGrade: 'U18', genderCategory: '', status: 'active' },
    { id: 'team-senior', groupId: 'grp-senior', name: '1st XV', ageGrade: '', genderCategory: '', status: 'active' },
  ],
};

// 24 U18 players: 17 available, 4 unavailable, 1 injured, 1 maybe, 1 silent.
const SQUAD = Array.from({ length: 24 }, (_, i) => `u${i + 1}`);
const responseFor = (i) =>
  i < 17 ? 'available' : i < 21 ? 'unavailable' : i === 21 ? 'injured' : i === 22 ? 'maybe' : null;

function seed() {
  kv.clear(); writes.length = 0;
  const k = n => `app:${n}`;

  kv.set(k(`structure:${CLUB}`), structure);
  kv.set(k(`club:${CLUB}`), {
    name: 'Test RFC',
    fixtures: [{
      id: 'fx-1', team: 'U18 Premier', opposition: 'Rivermead RFC', date: '2026-09-12',
      venue: 'Home', groupId: GROUP, sideId: TEAM, status: 'scheduled',
    }],
  });

  // Users, memberships and profiles for both clubs.
  const users = [], members = [], profiles = [];
  SQUAD.forEach((id, i) => {
    users.push({ id, email: `${id}@example.test`, passwordHash: 'SECRET-HASH' });
    members.push({
      userId: id, teamId: CLUB, role: 'player', status: 'active',
      displayName: `Player ${i + 1}`, playerGroupId: GROUP,
      accessScope: { clubWide: false, groups: [{ groupId: GROUP, role: null, status: 'active' }], teams: [] },
    });
    profiles.push({ userId: id, teamId: CLUB, position: i < 8 ? 'Forward' : 'Back', medicalNotes: 'CONFIDENTIAL', phone: '+3200000' });
  });
  // Another club's player, in the same shared stores.
  users.push({ id: 'other-1', email: 'other@example.test' });
  members.push({ userId: 'other-1', teamId: OTHER, role: 'player', status: 'active', displayName: 'Rival Player', playerGroupId: 'grp-x' });

  // Coaches: club-wide, U18-scoped, and one belonging to the other club.
  members.push({ userId: 'coach-club', teamId: CLUB, role: 'head_coach', status: 'active', displayName: 'Club Coach', accessScope: { clubWide: true, groups: [], teams: [] } });
  members.push({ userId: 'coach-u18', teamId: CLUB, role: 'coach', status: 'active', displayName: 'U18 Coach', accessScope: { clubWide: false, groups: [{ groupId: GROUP, role: null, status: 'active' }], teams: [] } });
  members.push({ userId: 'coach-other', teamId: OTHER, role: 'head_coach', status: 'active', displayName: 'Rival Coach', accessScope: { clubWide: true, groups: [], teams: [] } });
  users.push({ id: 'coach-club' }, { id: 'coach-u18' }, { id: 'coach-other' });

  kv.set(k('identity:users'), users);
  kv.set(k('identity:team_members'), members);
  kv.set(k('identity:player_profiles'), profiles);

  // Availability for the fixture.
  const store = {};
  SQUAD.forEach((id, i) => {
    const response = responseFor(i);
    if (response) store[`u:${id}`] = { userId: id, playerId: id, response, respondedAt: '2026-09-08T18:00:00.000Z' };
  });
  kv.set(k(`availability:${CLUB}:group:${GROUP}:fx-1`), store);

  // Four training registers, attendance falling 22 → 20 → 16 → 14.
  const registers = {};
  [['slot_tue-20260818', '2026-08-18', 22], ['slot_tue-20260825', '2026-08-25', 20],
   ['slot_tue-20260901', '2026-09-01', 16], ['slot_tue-20260908', '2026-09-08', 14]]
    .forEach(([id, date, present]) => {
      const marks = {};
      SQUAD.forEach((p, i) => { marks[`id:${p}`] = i < present ? 'present' : 'absent'; });
      registers[id] = { date, title: 'Tuesday training', marks };
    });
  kv.set(k(`publish:${CLUB}:group:${GROUP}:attendance`), registers);

  // The other club has data too — none of it may appear.
  kv.set(k(`structure:${OTHER}`), { version: 1, clubId: OTHER, groups: [{ id: 'grp-x', name: 'Rivals', status: 'active' }], teams: [{ id: 'team-x', groupId: 'grp-x', name: 'Rival XV', status: 'active' }] });
  kv.set(k(`club:${OTHER}`), { name: 'Rival RFC', fixtures: [{ id: 'fx-rival', opposition: 'SECRET OPPONENT', date: '2026-09-12', groupId: 'grp-x' }] });

  // Sessions: one per actor.
  kv.set(k('identity:sessions'), [
    { tokenHash: hashToken('t-club'), userId: 'coach-club', teamId: CLUB, expiresAt: '2099-01-01T00:00:00.000Z' },
    { tokenHash: hashToken('t-u18'), userId: 'coach-u18', teamId: CLUB, expiresAt: '2099-01-01T00:00:00.000Z' },
    { tokenHash: hashToken('t-other'), userId: 'coach-other', teamId: OTHER, expiresAt: '2099-01-01T00:00:00.000Z' },
  ]);
}

function res() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

async function call({ token = null, method = 'GET', query = {}, body = {} } = {}) {
  seed();
  const req = {
    method,
    query: { view: 'club-export', ...query },
    body,
    headers: token ? { authorization: `Bearer ${token}`, cookie: `ce_session=${token}` } : {},
  };
  const r = res();
  await handler(req, r);
  return r;
}

// --- Authorised export ---------------------------------------------------------

test('an authorised club-wide coach exports their own club', async () => {
  const r = await call({ token: 't-club' });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.contract, EXPORT_CONTRACT);
  assert.equal(r.body.club.clubId, CLUB);
  assert.equal(r.body.club.name, 'Test RFC');
  assert.equal(r.body.teams.length, 2, 'both teams are in scope for a club-wide coach');
});

test('the export carries the squad, fixture, availability and attendance', async () => {
  const { body } = await call({ token: 't-club' });

  const squad = body.players.filter(p => p.teamId === TEAM);
  assert.equal(squad.length, 24);

  const match = body.sessions.find(s => s.kind === 'match' && s.teamId === TEAM);
  assert.equal(match.date, '2026-09-12');
  assert.equal(match.opponent, 'Rivermead RFC');

  const available = body.availability.filter(a => a.sessionId === 'fx-1' && a.response === 'available');
  assert.equal(available.length, 17);

  const training = body.sessions.filter(s => s.kind === 'training' && s.teamId === TEAM);
  assert.equal(training.length, 4);
  assert.equal(body.attendance.filter(a => a.mark === 'present').length, 22 + 20 + 16 + 14);
});

// --- Tenant isolation ------------------------------------------------------------

test('a caller cannot name another club', async () => {
  // The query is offered and simply has no authority: the session decides.
  const r = await call({ token: 't-club', query: { clubId: OTHER, teamId: 'team-x' } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.club.clubId, CLUB, 'the session club, not the requested one');
  const text = JSON.stringify(r.body);
  assert.ok(!text.includes(OTHER));
  assert.ok(!text.includes('Rival'), 'no other-club record appears');
  assert.ok(!text.includes('SECRET OPPONENT'));
});

test("another club's coach gets their own club, never this one", async () => {
  const r = await call({ token: 't-other' });
  // They are authorised — for THEIR club. Nothing of ours is returned.
  const text = JSON.stringify(r.body ?? {});
  assert.ok(!text.includes(CLUB), 'this club must not appear');
  assert.ok(!text.includes('Player 1'), 'this club\'s players must not appear');
  assert.ok(!text.includes('Rivermead'), 'this club\'s fixture must not appear');
});

test('an unauthenticated caller is refused and given nothing', async () => {
  const r = await call({ token: null });
  assert.ok(r.statusCode === 401 || r.statusCode === 403, `got ${r.statusCode}`);
  assert.equal(r.body.ok, false);
  assert.ok(!('players' in (r.body || {})), 'no data-shaped response');
});

test('a group-scoped coach exports only their own group', async () => {
  const r = await call({ token: 't-u18' });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.groups.map(g => g.id), [GROUP]);
  assert.deepEqual(r.body.teams.map(t => t.id), [TEAM]);
  assert.ok(!JSON.stringify(r.body).includes('1st XV'), 'the senior team is out of scope');
});

test('the refusal is never an empty-looking success', async () => {
  const r = await call({ token: null });
  assert.notEqual(r.statusCode, 200);
  assert.ok(!r.body?.contract, 'a refusal must not look like an export');
});

// --- Read-only -------------------------------------------------------------------

test('the export performs no writes', async () => {
  await call({ token: 't-club' });
  assert.deepEqual(writes, [], `the export wrote: ${writes.join(', ')}`);
});

test('every write method is refused', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const r = await call({ token: 't-club', method });
    assert.equal(r.statusCode, 405, method);
    assert.match(r.body.error, /read-only/);
    assert.deepEqual(writes, [], `${method} must not write`);
  }
});

test('the handler contains no write path at all', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../api/_clubExportSource.js', import.meta.url), 'utf8');
  for (const forbidden of ['kvSet', 'kvDel', 'saveAvailability', 'persistClubStructure', 'saveClubStructure']) {
    assert.ok(!source.includes(forbidden), `the export source must not call ${forbidden}`);
  }
});

// --- Privacy -----------------------------------------------------------------------

test('a player is four fields, and nothing sensitive escapes', async () => {
  const { body } = await call({ token: 't-club' });
  for (const player of body.players) {
    assert.deepEqual(Object.keys(player).sort(), ['id', 'name', 'position', 'status', 'teamId']);
  }
  const text = JSON.stringify(body);
  for (const secret of ['@example.test', 'SECRET-HASH', 'CONFIDENTIAL', '+3200000', 'passwordHash', 'medicalNotes', 't-club', 'token']) {
    assert.ok(!text.includes(secret), `export leaked ${secret}`);
  }
});

test('the consumer would refuse anything this producer emits', async () => {
  // The far end rejects a player carrying a forbidden field. Proving the
  // producer emits none of them is the same guarantee, made at source.
  const { body } = await call({ token: 't-club' });
  const forbidden = ['email', 'phone', 'dob', 'medical', 'password', 'token', 'notes', 'address'];
  for (const player of body.players) {
    for (const field of forbidden) {
      assert.ok(!(field in player), `player carries ${field}`);
    }
  }
});

// --- Determinism ---------------------------------------------------------------------

test('the same club state produces the same document', async () => {
  const a = await call({ token: 't-club' });
  const b = await call({ token: 't-club' });
  // exportedAt describes the read, not the club, and is the only difference.
  delete a.body.club.exportedAt; delete b.body.club.exportedAt;
  assert.deepEqual(a.body, b.body);
});

test('collections are ordered stably regardless of input order', () => {
  const base = {
    club: { clubId: CLUB, name: 'X' },
    groups: [{ id: 'g2', name: 'B', status: 'active' }, { id: 'g1', name: 'A', status: 'active' }],
    teams: [{ id: 't2', groupId: 'g2', name: 'B' }, { id: 't1', groupId: 'g1', name: 'A' }],
    players: [{ id: 'p2', teamId: 't1', name: 'B' }, { id: 'p1', teamId: 't1', name: 'A' }],
    exportedAt: '2026-09-09T07:00:00.000Z',
  };
  const one = buildClubExport(base);
  const two = buildClubExport({
    ...base,
    groups: [...base.groups].reverse(),
    teams: [...base.teams].reverse(),
    players: [...base.players].reverse(),
  });
  assert.deepEqual(one, two);
  assert.deepEqual(one.groups.map(g => g.id), ['g1', 'g2']);
  assert.deepEqual(one.players.map(p => p.id), ['p1', 'p2']);
});

// --- The authorisation path is really used ---------------------------------------------

test('REGRESSION: the export uses the session gates, not a raw club read', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../api/_clubExportSource.js', import.meta.url), 'utf8');

  const host = readFileSync(new URL('../api/availability.js', import.meta.url), 'utf8');
  // The gates live across the host (authentication) and the read layer
  // (scope). If someone later swaps either for a direct read, this fails.
  assert.ok(host.includes('requireSession'), 'the export must authenticate through requireSession');
  for (const gate of ['tenantTeamId', 'canViewClub', 'canViewGroup', 'canViewTeam']) {
    assert.ok(source.includes(gate), `the export must go through ${gate}`);
  }
  // And it must never take its scope from the caller.
  assert.ok(!/req\.query\.\s*clubId|req\.body\.\s*clubId|query\.clubId/.test(source),
    'clubId must never be read from the request');
});

test('the builder cannot widen what the handler authorised', () => {
  // Given only the U18 group, no senior data can appear however much is passed.
  const doc = buildClubExport({
    club: { clubId: CLUB, name: 'X' },
    groups: [{ id: GROUP, name: 'U18', status: 'active' }],
    teams: [
      { id: TEAM, groupId: GROUP, name: 'U18 Premier', status: 'active' },
      { id: 'team-senior', groupId: 'grp-senior', name: '1st XV', status: 'active' },
    ],
    players: [
      { id: 'u1', teamId: TEAM, name: 'A' },
      { id: 's1', teamId: 'team-senior', name: 'Senior Player' },
    ],
    exportedAt: '2026-09-09T07:00:00.000Z',
  });
  assert.deepEqual(doc.teams.map(t => t.id), [TEAM], 'a team outside the given groups is dropped');
  assert.deepEqual(doc.players.map(p => p.id), ['u1'], 'a player outside the given teams is dropped');
});

test('unknown availability answers and marks are dropped, never guessed', () => {
  const doc = buildClubExport({
    club: { clubId: CLUB },
    groups: [{ id: GROUP, name: 'U18', status: 'active' }],
    teams: [{ id: TEAM, groupId: GROUP, name: 'U18', status: 'active' }],
    players: [{ id: 'u1', teamId: TEAM, name: 'A' }],
    attendanceByGroup: { [GROUP]: { 'occ-1': { date: '2026-09-01', marks: { 'id:u1': 'maybe-ish' } } } },
    availabilityByGroup: { [GROUP]: { 'occ-1': { a: { playerId: 'u1', response: 'probably' } } } },
    exportedAt: '2026-09-09T07:00:00.000Z',
  });
  assert.deepEqual(doc.attendance, [], 'an unrecognised mark is not a fact');
  assert.deepEqual(doc.availability, [], 'an unrecognised answer is not a fact');
});

test('legacy yes/no answers map to the shared vocabulary', () => {
  const doc = buildClubExport({
    club: { clubId: CLUB },
    groups: [{ id: GROUP, name: 'U18', status: 'active' }],
    teams: [{ id: TEAM, groupId: GROUP, name: 'U18', status: 'active' }],
    players: [{ id: 'u1', teamId: TEAM, name: 'A' }, { id: 'u2', teamId: TEAM, name: 'B' }],
    attendanceByGroup: { [GROUP]: { 'occ-1': { date: '2026-09-01', marks: {} } } },
    availabilityByGroup: { [GROUP]: { 'occ-1': {
      a: { playerId: 'u1', response: 'yes' }, b: { playerId: 'u2', response: 'no' },
    } } },
    exportedAt: '2026-09-09T07:00:00.000Z',
  });
  assert.deepEqual(doc.availability.map(a => a.response), ['available', 'unavailable']);
});
