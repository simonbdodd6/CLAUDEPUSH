/**
 * SC8 — programme assignment: server store, authorisation and isolation.
 *
 * The security-critical half of SC8. Client-side hiding is presentation; these
 * pin the actual boundary: a coach reaches only their own group's athletes, a
 * player reaches only themselves, an unentitled club reaches nothing, and no
 * request body can smuggle a server-owned field into storage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.perfassign.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
const writes = [];
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { writes.push(args[0]); kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { writes.push(args[0]); kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_performanceStore.js');
const identity = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');

const CLUB = 'club-perf';
const OTHER_CLUB = 'club-other';
const SEN = 'grp-seniors';
const U18 = 'grp-u18';

const MEMBERS = [
  { id: 'm-sen-p', teamId: CLUB, userId: 'u-sen-player', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-u18-p', teamId: CLUB, userId: 'u-u18-player', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm-sen-c', teamId: CLUB, userId: 'u-sen-coach', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: SEN, role: 'coach', status: 'active' }], teams: [] } },
  { id: 'm-u18-c', teamId: CLUB, userId: 'u-u18-coach', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: U18, role: 'coach', status: 'active' }], teams: [] } },
  { id: 'm-admin',  teamId: CLUB, userId: 'u-admin', role: 'admin', status: 'active', isOwner: true },
  { id: 'm-out',    teamId: OTHER_CLUB, userId: 'u-out-player', role: 'player', status: 'active', playerGroupId: 'grp-x' },
];

function seed({ plan = 'pro' } = {}) {
  kv.clear(); writes.length = 0;
  kv.set('app:identity:teams', JSON.stringify([
    { id: CLUB, name: 'Perf Club', plan, planStatus: 'active' },
    { id: OTHER_CLUB, name: 'Other Club', plan: 'pro', planStatus: 'active' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({
    version: 1,
    groups: [
      { id: SEN, name: 'Seniors', type: 'general', developmentCategory: 'adult', status: 'active' },
      { id: U18, name: 'U18', type: 'general', developmentCategory: 'youth_u18', status: 'active' },
    ],
    teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' },
            { id: 't-u18a', groupId: U18, name: 'U18 A', status: 'active' }],
  }));
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: [
    { id: 'p-sen', userId: 'u-sen-player', name: 'Senior Player', position: 'PROP', medical: 'confidential', notes: 'coach note' },
    { id: 'p-u18', userId: 'u-u18-player', name: 'U18 Player', position: 'WING' },
  ] }));
}

const cookies = new Map();
async function login(userId) {
  const member = MEMBERS.find(m => m.userId === userId);
  const session = await identity.createSession({ userId, teamId: member.teamId, role: member.role });
  cookies.set(userId, `${identity.SESSION_COOKIE}=${encodeURIComponent(session.token)}`);
}
const req = (userId, { method = 'GET', body = null, query = {} } = {}) => ({
  method, body, query: { resource: 'performance', ...query },
  headers: { cookie: cookies.get(userId) || '' },
});
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
    end() { return this; }, setHeader() {}, get result() { return out; } };
}
const call = async (userId, opts) => { const r = res(); await publishHandler(req(userId, opts), r); return r.result; };

/** A minimal but structurally valid published programme + snapshot. */
const SNAPSHOT = {
  kind: 'programme_assignment_snapshot', programmeId: 'pg-1', programmeTitle: 'Test Programme',
  programmeVersionId: 'pg-1@v1', versionNumber: 1, exerciseSnapshots: {}, collectionIds: [],
  prescriptionTree: [{ kind: 'phase', id: 'ph1', weeks: [{ kind: 'week', id: 'w1', weekNumber: 1, days: [
    { kind: 'training_day', id: 'd1', day: 'Mon', sessions: [{ kind: 'session', id: 's1', title: 'Lower Strength', purpose: 'strength', estimatedMinutes: 45, blocks: [] }] },
  ] }] }],
  capturedAt: '2026-08-22T09:00:00.000Z',
};

async function publishedProgrammeFor(athleteUserId, coach = 'u-sen-coach') {
  const saved = await call(coach, { method: 'POST', body: {
    op: 'save_draft', title: 'Test Programme', athleteUserId, goal: 'strength', phase: 'pre_season',
    programme: { id: 'pg-1', title: 'Test Programme', versions: [{ versionNumber: 1, versionStatus: 'draft' }] },
  } });
  const programmeId = saved.body.programme.programmeId;
  await call(coach, { method: 'POST', body: {
    op: 'publish_programme', programmeId, versionNumber: 1,
    programme: { id: 'pg-1', title: 'Test Programme', versions: [{ versionNumber: 1, versionStatus: 'published' }] },
  } });
  return programmeId;
}

// ── Entitlement ─────────────────────────────────────────────────────────────

test('1. an unentitled club is refused with 402, not an empty list', async () => {
  seed({ plan: 'core' }); await login('u-sen-coach');
  const r = await call('u-sen-coach');
  assert.equal(r.code, 402);
  assert.equal(r.body.code, 'performance_not_entitled');
});

test('2. a trial club is not silently entitled to a premium module', async () => {
  seed({ plan: 'trial' }); await login('u-sen-coach');
  assert.equal((await call('u-sen-coach')).code, 402);
});

// ── Coach scope: enumeration ────────────────────────────────────────────────

test('3. a Seniors coach cannot even ENUMERATE U18 athletes', async () => {
  seed(); await login('u-sen-coach');
  const r = await call('u-sen-coach');
  assert.equal(r.code, 200);
  const ids = r.body.athletes.map(a => a.userId);
  assert.deepEqual(ids, ['u-sen-player']);
  assert.ok(!ids.includes('u-u18-player'), 'U18 athlete must not appear in a Seniors coach list');
});

test('4. a U18 coach sees only U18 athletes', async () => {
  seed(); await login('u-u18-coach');
  const ids = (await call('u-u18-coach')).body.athletes.map(a => a.userId);
  assert.deepEqual(ids, ['u-u18-player']);
});

test('5. a club-wide admin sees both groups', async () => {
  seed(); await login('u-admin');
  const ids = (await call('u-admin')).body.athletes.map(a => a.userId).sort();
  assert.deepEqual(ids, ['u-sen-player', 'u-u18-player']);
});

test('6. the athlete projection carries squad classification, never health data', async () => {
  seed(); await login('u-sen-coach');
  const a = (await call('u-sen-coach')).body.athletes[0];
  assert.equal(a.developmentCategory, 'adult');
  const serialized = JSON.stringify(a);
  for (const leak of ['confidential', 'coach note', 'medical', 'notes']) {
    assert.ok(!serialized.includes(leak), `athlete projection must not carry ${leak}`);
  }
});

// ── Coach scope: direct id attack ───────────────────────────────────────────

test('7. DIRECT ID ATTACK — a Seniors coach cannot assign to a U18 athlete', async () => {
  seed(); await login('u-sen-coach');
  const programmeId = await publishedProgrammeFor('u-sen-player');
  const r = await call('u-sen-coach', { method: 'POST', body: {
    op: 'create_assignment', programmeId, athleteUserId: 'u-u18-player',
    programmeVersionId: 'pg-1@v1', versionNumber: 1, startDate: '2026-09-01', snapshot: SNAPSHOT,
  } });
  assert.equal(r.code, 403);
  assert.match(r.body.error, /outside your coaching scope/);
  const record = await store.loadPerformanceRecord(CLUB);
  assert.equal(record.assignments.length, 0, 'nothing was written');
});

test('8. DIRECT ID ATTACK — a U18 coach cannot assign to a Senior athlete', async () => {
  seed(); await login('u-u18-coach');
  const programmeId = await publishedProgrammeFor('u-u18-player', 'u-u18-coach');
  const r = await call('u-u18-coach', { method: 'POST', body: {
    op: 'create_assignment', programmeId, athleteUserId: 'u-sen-player',
    programmeVersionId: 'pg-1@v1', versionNumber: 1, startDate: '2026-09-01', snapshot: SNAPSHOT,
  } });
  assert.equal(r.code, 403);
});

test('9. an athlete from ANOTHER CLUB is unknown, not merely out of scope', async () => {
  seed(); await login('u-admin');
  const programmeId = await publishedProgrammeFor('u-sen-player', 'u-admin');
  const r = await call('u-admin', { method: 'POST', body: {
    op: 'create_assignment', programmeId, athleteUserId: 'u-out-player',
    programmeVersionId: 'pg-1@v1', versionNumber: 1, startDate: '2026-09-01', snapshot: SNAPSHOT,
  } });
  assert.equal(r.code, 404);
});

// ── Player self-access ──────────────────────────────────────────────────────

test('10. a player reads ONLY their own assignments', async () => {
  seed(); await login('u-sen-coach'); await login('u-sen-player'); await login('u-u18-player');
  const programmeId = await publishedProgrammeFor('u-sen-player');
  await call('u-sen-coach', { method: 'POST', body: {
    op: 'create_assignment', programmeId, athleteUserId: 'u-sen-player',
    programmeVersionId: 'pg-1@v1', versionNumber: 1, startDate: '2026-09-01', snapshot: SNAPSHOT,
  } });
  const mine = await call('u-sen-player');
  assert.equal(mine.code, 200);
  assert.equal(mine.body.capacity, 'player');
  assert.equal(mine.body.assignments.length, 1);
  // The OTHER player has none, and cannot see the first player's.
  const theirs = await call('u-u18-player');
  assert.deepEqual(theirs.body.assignments, []);
});

test('11. a player cannot request another athlete by changing an id', async () => {
  seed(); await login('u-sen-coach'); await login('u-u18-player');
  const programmeId = await publishedProgrammeFor('u-sen-player');
  await call('u-sen-coach', { method: 'POST', body: {
    op: 'create_assignment', programmeId, athleteUserId: 'u-sen-player',
    programmeVersionId: 'pg-1@v1', versionNumber: 1, startDate: '2026-09-01', snapshot: SNAPSHOT,
  } });
  // The athlete id comes from the SESSION; a forged query changes nothing.
  const r = await call('u-u18-player', { query: { athleteUserId: 'u-sen-player', userId: 'u-sen-player' } });
  assert.deepEqual(r.body.assignments, []);
});

test('12. a player cannot author, publish or assign', async () => {
  seed(); await login('u-sen-player');
  for (const op of ['save_draft', 'publish_programme', 'create_assignment', 'pause']) {
    const r = await call('u-sen-player', { method: 'POST', body: { op } });
    assert.equal(r.code, 403, op + ' must be refused');
  }
});

test('13. the player projection excludes coach-facing fields', async () => {
  seed(); await login('u-sen-coach'); await login('u-sen-player');
  const programmeId = await publishedProgrammeFor('u-sen-player');
  await call('u-sen-coach', { method: 'POST', body: {
    op: 'create_assignment', programmeId, athleteUserId: 'u-sen-player', notes: 'internal coach note',
    programmeVersionId: 'pg-1@v1', versionNumber: 1, startDate: '2026-09-01', snapshot: SNAPSHOT,
  } });
  const a = (await call('u-sen-player')).body.assignments[0];
  assert.ok(a.snapshot, 'the athlete gets the training content');
  assert.equal(a.notes, undefined, 'coach notes are not projected to the athlete');
  assert.equal(a.reviewFlags, undefined);
  assert.equal(a.audit, undefined);
});

// ── Assignment lifecycle ────────────────────────────────────────────────────

test('14. only a PUBLISHED programme can be assigned', async () => {
  seed(); await login('u-sen-coach');
  const saved = await call('u-sen-coach', { method: 'POST', body: {
    op: 'save_draft', title: 'Draft only', athleteUserId: 'u-sen-player',
    programme: { id: 'pg-d', versions: [] },
  } });
  const r = await call('u-sen-coach', { method: 'POST', body: {
    op: 'create_assignment', programmeId: saved.body.programme.programmeId, athleteUserId: 'u-sen-player',
    programmeVersionId: 'pg-d@v1', versionNumber: 1, startDate: '2026-09-01', snapshot: SNAPSHOT,
  } });
  assert.equal(r.code, 400);
  assert.match(r.body.error, /published/);
});

test('15. a second assignment is REFUSED, never silently overwritten', async () => {
  seed(); await login('u-sen-coach');
  const programmeId = await publishedProgrammeFor('u-sen-player');
  const base = { op: 'create_assignment', programmeId, athleteUserId: 'u-sen-player',
    programmeVersionId: 'pg-1@v1', versionNumber: 1, snapshot: SNAPSHOT };
  const first = await call('u-sen-coach', { method: 'POST', body: { ...base, startDate: '2026-09-01' } });
  assert.equal(first.code, 200);
  const second = await call('u-sen-coach', { method: 'POST', body: { ...base, startDate: '2026-10-01' } });
  assert.equal(second.code, 409);
  assert.equal(second.body.code, 'active_assignment_exists');
  const record = await store.loadPerformanceRecord(CLUB);
  assert.equal(record.assignments.length, 1, 'the original assignment is untouched');
});

test('16. an EXPLICIT replace closes the old assignment and preserves it', async () => {
  seed(); await login('u-sen-coach');
  const programmeId = await publishedProgrammeFor('u-sen-player');
  const base = { op: 'create_assignment', programmeId, athleteUserId: 'u-sen-player',
    programmeVersionId: 'pg-1@v1', versionNumber: 1, snapshot: SNAPSHOT };
  const first = await call('u-sen-coach', { method: 'POST', body: { ...base, startDate: '2026-09-01' } });
  const replaced = await call('u-sen-coach', { method: 'POST', body: { ...base, startDate: '2026-10-01', intent: 'replace' } });
  assert.equal(replaced.code, 200);
  const record = await store.loadPerformanceRecord(CLUB);
  assert.equal(record.assignments.length, 2, 'history is preserved, not deleted');
  const old = record.assignments.find(a => a.assignmentId === first.body.assignment.assignmentId);
  assert.equal(old.status, 'replaced');
  assert.equal(old.replacedByAssignmentId, replaced.body.assignment.assignmentId);
});

test('17. pause / resume / end are explicit and audited; terminal states never reopen', async () => {
  seed(); await login('u-sen-coach');
  const programmeId = await publishedProgrammeFor('u-sen-player');
  const created = await call('u-sen-coach', { method: 'POST', body: {
    op: 'create_assignment', programmeId, athleteUserId: 'u-sen-player',
    programmeVersionId: 'pg-1@v1', versionNumber: 1, startDate: '2026-09-01', snapshot: SNAPSHOT } });
  const id = created.body.assignment.assignmentId;

  const paused = await call('u-sen-coach', { method: 'POST', body: { op: 'pause', assignmentId: id, reason: 'injury break' } });
  assert.equal(paused.body.assignment.status, 'paused');
  assert.ok(paused.body.assignment.pausedAt);
  const resumed = await call('u-sen-coach', { method: 'POST', body: { op: 'resume', assignmentId: id } });
  assert.equal(resumed.body.assignment.status, 'active');
  const ended = await call('u-sen-coach', { method: 'POST', body: { op: 'end', assignmentId: id } });
  assert.equal(ended.body.assignment.status, 'completed');
  // Terminal: cannot be resumed back to life.
  const reopen = await call('u-sen-coach', { method: 'POST', body: { op: 'resume', assignmentId: id } });
  assert.equal(reopen.code, 400);
  const actions = ended.body.assignment.audit.map(e => e.action);
  assert.deepEqual(actions, ['assignment_created', 'assignment_paused', 'assignment_resumed', 'assignment_completed']);
});

test('18. a scoped coach cannot pause another group\'s assignment', async () => {
  seed(); await login('u-admin'); await login('u-u18-coach');
  const programmeId = await publishedProgrammeFor('u-sen-player', 'u-admin');
  const created = await call('u-admin', { method: 'POST', body: {
    op: 'create_assignment', programmeId, athleteUserId: 'u-sen-player',
    programmeVersionId: 'pg-1@v1', versionNumber: 1, startDate: '2026-09-01', snapshot: SNAPSHOT } });
  const r = await call('u-u18-coach', { method: 'POST', body: { op: 'pause', assignmentId: created.body.assignment.assignmentId } });
  assert.equal(r.code, 403);
});

// ── Storage safety ──────────────────────────────────────────────────────────

test('19. only the performance key is ever written', async () => {
  seed(); await login('u-sen-coach');
  const programmeId = await publishedProgrammeFor('u-sen-player');
  await call('u-sen-coach', { method: 'POST', body: {
    op: 'create_assignment', programmeId, athleteUserId: 'u-sen-player',
    programmeVersionId: 'pg-1@v1', versionNumber: 1, startDate: '2026-09-01', snapshot: SNAPSHOT } });
  const touched = [...new Set(writes)].filter(k => !k.includes('session') && !k.includes('audit'));
  assert.deepEqual(touched, [`app:performance:${CLUB}`],
    'a Performance write must be structurally incapable of touching roster/identity/medical');
});

test('20. server-owned fields cannot be smuggled in through a request body', async () => {
  seed(); await login('u-sen-coach');
  const programmeId = await publishedProgrammeFor('u-sen-player');
  const r = await call('u-sen-coach', { method: 'POST', body: {
    op: 'create_assignment', programmeId, athleteUserId: 'u-sen-player',
    programmeVersionId: 'pg-1@v1', versionNumber: 1, startDate: '2026-09-01', snapshot: SNAPSHOT,
    // hostile extras
    status: 'active', assignedBy: 'someone-else', groupId: U18, groupName: 'U18',
    clubId: OTHER_CLUB, audit: [{ action: 'forged' }], athleteMemberId: 'm-u18-p',
  } });
  assert.equal(r.code, 200);
  const a = r.body.assignment;
  assert.equal(a.status, 'scheduled', 'status is server-owned');
  assert.equal(a.assignedBy, 'u-sen-coach', 'actor comes from the session');
  assert.equal(a.groupId, SEN, 'group context is resolved server-side, not accepted');
  assert.equal(a.clubId, CLUB, 'club comes from the tenant');
  assert.deepEqual(a.audit.map(e => e.action), ['assignment_created'], 'forged audit is dropped');
});

test('21. reads never write', async () => {
  seed(); await login('u-sen-coach');
  writes.length = 0;
  await call('u-sen-coach');
  assert.deepEqual(writes.filter(k => k.includes('performance')), [], 'a read must not create a record');
});

test('22. a club with no record reads as empty, not an error', async () => {
  seed(); await login('u-sen-coach');
  const r = await call('u-sen-coach');
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.programmes, []);
  assert.deepEqual(r.body.assignments, []);
});

// ── Progression ─────────────────────────────────────────────────────────────

test('23. a progression suggestion is reviewed, never auto-applied', async () => {
  seed(); await login('u-sen-coach');
  const programmeId = await publishedProgrammeFor('u-sen-player');
  const created = await call('u-sen-coach', { method: 'POST', body: {
    op: 'create_assignment', programmeId, athleteUserId: 'u-sen-player',
    programmeVersionId: 'pg-1@v1', versionNumber: 1, startDate: '2026-09-01', snapshot: SNAPSHOT } });
  const id = created.body.assignment.assignmentId;
  // No suggestion pending → review is refused rather than inventing one.
  const none = await call('u-sen-coach', { method: 'POST', body: { op: 'review_progression', assignmentId: id, outcome: 'accepted' } });
  assert.equal(none.code, 400);

  // Attach one directly (SC6 seam), then review it.
  const record = await store.loadPerformanceRecord(CLUB);
  const target = record.assignments.find(a => a.assignmentId === id);
  target.progressionReview = { status: 'pending', suggestedAt: '2026-09-08T09:00:00.000Z', suggestion: { kind: 'progression_plan' } };
  await store.savePerformanceRecord(CLUB, record);

  const reviewed = await call('u-sen-coach', { method: 'POST', body: { op: 'review_progression', assignmentId: id, outcome: 'rejected', note: 'hold' } });
  assert.equal(reviewed.code, 200);
  assert.equal(reviewed.body.assignment.progressionReview.status, 'rejected');
  // The assignment's pinned version is untouched by a progression decision.
  assert.equal(reviewed.body.assignment.programmeVersionId, 'pg-1@v1');
  assert.equal(reviewed.body.assignment.status, 'scheduled');
});
