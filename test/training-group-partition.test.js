/**
 * TRAINING GROUP PARTITION — Seniors / U18 / Women's each own their Training.
 *
 * Training identity = club + player group + session (or dated occurrence).
 * The same nominal session id ("tue", "slot_tue1-20260818") may exist in every
 * group without collision, because each group has its OWN stores:
 *
 *   publish:<club>:group:<gid>:training_schedule   recurring nights
 *   publish:<club>:group:<gid>:training            published plans
 *   publish:<club>:group:<gid>:sessions            session definitions
 *
 * Legacy club-wide records stay readable ONLY through the INITIAL group
 * ('grp_initial' — production's Seniors), exactly the availability rule.
 * U18 and Women's start EMPTY — never seeded from club config, never
 * inheriting Seniors nights. Player reads derive the group from THEIR
 * membership; staff writes assert the named group. Writes always land on the
 * group key; the legacy keys are never mutated.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.training-partition.test';
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
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-boitsfort';
const SEN = 'grp_initial', U18 = 'grp_u18', WOM = 'grp_womens';

const MEMBERS = [
  { id: 'm-owner', teamId: CLUB, userId: 'u-owner', role: 'admin', status: 'active', isOwner: true, accessProfile: 'full' },
  { id: 'm-sen-c', teamId: CLUB, userId: 'u-sen-c', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: SEN, status: 'active' }], teams: [] } },
  { id: 'm-u18-c', teamId: CLUB, userId: 'u-u18-c', role: 'coach', status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'active' }], teams: [] } },
  // Alex: Seniors PLAYER who also coaches U18 — one login, two capacities.
  { id: 'm-alex', teamId: CLUB, userId: 'u-alex', role: 'coach', status: 'active', accessProfile: 'coach',
    playerGroupId: SEN,
    accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'active' }], teams: [] } },
  { id: 'm-sen-p', teamId: CLUB, userId: 'u-sen-p', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-u18-p', teamId: CLUB, userId: 'u-u18-p', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm-wom-p', teamId: CLUB, userId: 'u-wom-p', role: 'player', status: 'active', playerGroupId: WOM },
];

const STRUCTURE = { version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18',     type: 'general', status: 'active' },
    { id: WOM, name: "Women's", type: 'general', status: 'active' },
  ],
  teams: [
    { id: 'team_premier', groupId: SEN, name: 'Premier', status: 'active' },
    { id: 'team_u18_prem', groupId: U18, name: 'U18 Premier', status: 'active' },
    { id: 'team_wom_prem', groupId: WOM, name: "Women's Premier", status: 'active' },
  ] };

const SCHED = gid => `app:publish:${CLUB}:group:${gid}:training_schedule`;
const TRAIN = gid => `app:publish:${CLUB}:group:${gid}:training`;
const SESS  = gid => `app:publish:${CLUB}:group:${gid}:sessions`;
const LEGACY_SCHED = `app:publish:${CLUB}:training_schedule`;
const LEGACY_TRAIN = `app:publish:${CLUB}:training`;
const LEGACY_SESS  = `app:publish:${CLUB}:sessions`;

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(
    MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Boitsfort',
    trainingDays: [{ day: 'Tue', time: '19:00' }, { day: 'Thu', time: '19:30' }], fixtures: [] }));
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
async function pub(userId, method, query, body) {
  const r = res();
  await publishHandler({ method, query: query || {}, body: body || {},
    headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}

// ── RECURRING SCHEDULE — per-group storage ────────────────────────────────
test('a schedule write lands in the NAMED group\'s keyspace and nowhere else', async () => {
  seed(); await login('u-owner');
  const r = await pub('u-owner', 'POST', { resource: 'training-schedule' },
    { action: 'add', group: U18, slot: { day: 'Wed', startTime: '18:00' } });
  assert.equal(r.code, 200);
  assert.equal(r.body.groupId, U18);
  const u18 = JSON.parse(kv.get(SCHED(U18)));
  assert.equal(u18.slots.some(s => s.day === 'Wed'), true, 'U18 got its Wednesday');
  assert.equal(kv.has(SCHED(SEN)), false, 'Seniors keyspace untouched');
  assert.equal(kv.has(LEGACY_SCHED), false, 'the legacy club-wide key is never written');
});

test('the legacy schedule is readable through Seniors ONLY; other groups start EMPTY', async () => {
  seed(); await login('u-owner');
  kv.set(LEGACY_SCHED, JSON.stringify({ slots: [
    { id: 'slot_tue', day: 'Tue', startTime: '19:00', active: true, sessionId: 'tue' }] }));
  const sen = await pub('u-owner', 'GET', { resource: 'training-schedule', group: SEN });
  assert.equal(sen.body.slots.length, 1, 'Seniors inherit the production schedule');
  const u18 = await pub('u-owner', 'GET', { resource: 'training-schedule', group: U18 });
  assert.deepEqual(u18.body.slots, [], 'U18 starts with NO nights');
  assert.equal(u18.body.seeded, true);
  const wom = await pub('u-owner', 'GET', { resource: 'training-schedule', group: WOM });
  assert.deepEqual(wom.body.slots, [], "Women's too");
});

test('club-config seeding applies to the INITIAL group only — U18 is never seeded Seniors nights', async () => {
  seed(); await login('u-owner');
  // No stored schedule anywhere: the club's trainingDays exist, but they are
  // SENIORS history — only the INITIAL group may derive from them.
  const sen = await pub('u-owner', 'GET', { resource: 'training-schedule', group: SEN });
  assert.equal(sen.body.slots.length, 2, 'Seniors seeded from club config (tue + thu)');
  const u18 = await pub('u-owner', 'GET', { resource: 'training-schedule', group: U18 });
  assert.deepEqual(u18.body.slots, [], 'U18 gets nothing from club config');
});

test('the first Seniors write copy-forwards the legacy schedule; the legacy key stays byte-identical', async () => {
  seed(); await login('u-owner');
  const legacyPayload = JSON.stringify({ slots: [
    { id: 'slot_tue', day: 'Tue', startTime: '19:00', active: true, sessionId: 'tue' }] });
  kv.set(LEGACY_SCHED, legacyPayload);
  const r = await pub('u-owner', 'POST', { resource: 'training-schedule' },
    { action: 'add', group: SEN, slot: { day: 'Fri', startTime: '18:30' } });
  assert.equal(r.code, 200);
  const scoped = JSON.parse(kv.get(SCHED(SEN)));
  assert.equal(scoped.slots.length, 2, 'legacy Tuesday + the new Friday, in the GROUP store');
  assert.equal(kv.get(LEGACY_SCHED), legacyPayload, 'legacy record untouched underneath');
});

test('players read the schedule of the group they PLAY in — never another group\'s', async () => {
  seed(); await login('u-owner'); await login('u-u18-p'); await login('u-sen-p');
  await pub('u-owner', 'POST', { resource: 'training-schedule' },
    { action: 'add', group: U18, slot: { day: 'Mon', startTime: '17:30' } });
  await pub('u-owner', 'POST', { resource: 'training-schedule' },
    { action: 'add', group: SEN, slot: { day: 'Tue', startTime: '19:00' } });

  const u18 = await pub('u-u18-p', 'GET', { resource: 'training-schedule' });
  assert.equal(u18.body.groupId, U18);
  assert.deepEqual(u18.body.slots.map(s => s.day), ['Mon'], 'U18 player sees U18 Monday only');
  const sen = await pub('u-sen-p', 'GET', { resource: 'training-schedule' });
  assert.equal(sen.body.groupId, SEN);
  // Seniors carry their club-config seed (Tue + Thu) forward plus the new night.
  assert.equal(sen.body.slots.some(s => s.day === 'Mon'), false, 'U18 Monday never reaches Seniors');
  assert.equal(sen.body.slots.some(s => s.day === 'Tue'), true);
});

test('dual-role Alex: player view resolves to SENIORS (plays), an asserted U18 read works (coaches)', async () => {
  seed(); await login('u-owner'); await login('u-alex');
  await pub('u-owner', 'POST', { resource: 'training-schedule' },
    { action: 'add', group: U18, slot: { day: 'Mon', startTime: '17:30' } });
  await pub('u-owner', 'POST', { resource: 'training-schedule' },
    { action: 'add', group: SEN, slot: { day: 'Tue', startTime: '19:00' } });

  const asPlayer = await pub('u-alex', 'GET', { resource: 'training-schedule' });
  assert.equal(asPlayer.body.groupId, SEN, 'no ?group → where he PLAYS');
  assert.equal(asPlayer.body.slots.some(s => s.day === 'Mon'), false, 'no U18 night in the player view');
  const asCoach = await pub('u-alex', 'GET', { resource: 'training-schedule', group: U18 });
  assert.equal(asCoach.body.groupId, U18, '?group=U18 → where he COACHES');
  assert.deepEqual(asCoach.body.slots.map(s => s.day), ['Mon']);
});

test('forged schedule writes are refused; a multi-group owner must name the group', async () => {
  seed(); await login('u-owner'); await login('u-u18-c'); await login('u-sen-p');
  const forged = await pub('u-u18-c', 'POST', { resource: 'training-schedule' },
    { action: 'add', group: SEN, slot: { day: 'Wed', startTime: '18:00' } });
  assert.equal(forged.code, 403, 'a U18 coach cannot write the Seniors schedule');
  const unknown = await pub('u-u18-c', 'POST', { resource: 'training-schedule' },
    { action: 'add', group: 'grp_forged', slot: { day: 'Wed', startTime: '18:00' } });
  assert.equal(unknown.code, 404, 'an unknown group does not exist for anyone');
  const vague = await pub('u-owner', 'POST', { resource: 'training-schedule' },
    { action: 'add', slot: { day: 'Wed', startTime: '18:00' } });
  assert.equal(vague.code, 400, 'three operable groups: the write must say which');
  assert.match(vague.body.error, /choose which group/i);
  const playerForged = await pub('u-sen-p', 'GET', { resource: 'training-schedule', group: U18 });
  assert.equal(playerForged.code, 403, 'a player cannot browse another group\'s schedule');
  assert.equal(kv.has(SCHED(SEN)), false, 'nothing was written by any refused call');
});

test('a single-group coach\'s write defaults to THEIR group — no group named, nothing leaks', async () => {
  seed(); await login('u-u18-c');
  const r = await pub('u-u18-c', 'POST', { resource: 'training-schedule' },
    { action: 'add', slot: { day: 'Mon', startTime: '17:30' } });
  assert.equal(r.code, 200);
  assert.equal(r.body.groupId, U18);
  assert.equal(kv.has(SCHED(U18)), true);
  assert.equal(kv.has(SCHED(SEN)), false);
  assert.equal(kv.has(LEGACY_SCHED), false);
});

// ── PUBLISHED TRAINING — the same session id in two groups, isolated ──────
const publishTo = (user, gid, audience, id, title) =>
  pub(user, 'POST', { resource: 'training', audience },
    { group: gid, session: { id, title, date: '2026-08-18', blocks: [{ time: '19:00', activity: title }] } });

test('the same session id publishes independently per group — snapshots never mix', async () => {
  seed(); await login('u-owner');
  assert.equal((await publishTo('u-owner', SEN, 'player', 'slot_tue1-20260818', 'Seniors lineout drills')).code, 200);
  assert.equal((await publishTo('u-owner', U18, 'player', 'slot_tue1-20260818', 'U18 handling skills')).code, 200);

  const sen = JSON.parse(kv.get(TRAIN(SEN)));
  const u18 = JSON.parse(kv.get(TRAIN(U18)));
  assert.match(sen['slot_tue1-20260818'].player.snapshot.blocks[0].activity, /lineout/i);
  assert.match(u18['slot_tue1-20260818'].player.snapshot.blocks[0].activity, /handling/i);
  assert.equal(kv.has(LEGACY_TRAIN), false, 'legacy published-training key never written');
});

test('players receive their OWN group\'s published training only', async () => {
  seed(); await login('u-owner'); await login('u-u18-p'); await login('u-sen-p');
  await publishTo('u-owner', SEN, 'player', 'tue', 'Seniors plan');
  await publishTo('u-owner', U18, 'player', 'tue', 'U18 plan');

  const u18 = await pub('u-u18-p', 'GET', { resource: 'training', audience: 'player' });
  assert.equal(u18.body.groupId, U18);
  assert.deepEqual(u18.body.sessions.map(s => s.title), ['U18 plan']);
  const sen = await pub('u-sen-p', 'GET', { resource: 'training', audience: 'player' });
  assert.deepEqual(sen.body.sessions.map(s => s.title), ['Seniors plan']);
});

test('legacy published training belongs to Seniors; the first Seniors publish copy-forwards ALL of it', async () => {
  seed(); await login('u-owner'); await login('u-sen-p'); await login('u-u18-p');
  const legacy = {
    tue: { currentRevision: 'r1', player: { snapshot: { title: 'Old Tuesday' }, revision: 'r1', publishedAt: '2026-06-01T00:00:00Z', publishedBy: 'u-owner' } },
    thu: { currentRevision: 'r2', player: { snapshot: { title: 'Old Thursday' }, revision: 'r2', publishedAt: '2026-06-01T00:00:00Z', publishedBy: 'u-owner' } },
  };
  const legacyPayload = JSON.stringify(legacy);
  kv.set(LEGACY_TRAIN, legacyPayload);

  const senRead = await pub('u-sen-p', 'GET', { resource: 'training', audience: 'player' });
  assert.deepEqual(senRead.body.sessions.map(s => s.title).sort(), ['Old Thursday', 'Old Tuesday']);
  const u18Read = await pub('u-u18-p', 'GET', { resource: 'training', audience: 'player' });
  assert.deepEqual(u18Read.body.sessions, [], 'U18 inherits NONE of the legacy publications');

  await publishTo('u-owner', SEN, 'player', 'game', 'Matchday walkthrough');
  const scoped = JSON.parse(kv.get(TRAIN(SEN)));
  assert.deepEqual(Object.keys(scoped).sort(), ['game', 'thu', 'tue'],
    'the whole legacy store came forward with the new publish — nothing shadowed');
  assert.equal(kv.get(LEGACY_TRAIN), legacyPayload, 'legacy record untouched underneath');
});

test('withdrawing a publication touches ONE group\'s record only', async () => {
  seed(); await login('u-owner');
  await publishTo('u-owner', SEN, 'player', 'tue', 'Seniors plan');
  await publishTo('u-owner', U18, 'player', 'tue', 'U18 plan');
  const r = await pub('u-owner', 'DELETE', { resource: 'training', audience: 'player' },
    { sessionId: 'tue', group: U18 });
  assert.equal(r.code, 200);
  assert.equal(JSON.parse(kv.get(TRAIN(U18))).tue.player, undefined, 'U18 withdrawn');
  assert.ok(JSON.parse(kv.get(TRAIN(SEN))).tue.player, 'Seniors still published');
});

test('the revision touch (PUT) marks ONE group stale, not its namesakes', async () => {
  seed(); await login('u-owner');
  await publishTo('u-owner', SEN, 'player', 'tue', 'Seniors plan');
  await publishTo('u-owner', U18, 'player', 'tue', 'U18 plan');
  const r = await pub('u-owner', 'PUT', { resource: 'training' },
    { group: U18, session: { id: 'tue', title: 'U18 plan EDITED', blocks: [] } });
  assert.equal(r.code, 200);
  assert.equal(r.body.player.status, 'stale', 'U18 shows changes-not-republished');
  const senStatus = await pub('u-owner', 'GET', { resource: 'training', audience: 'player', group: SEN });
  assert.equal(senStatus.body.sessions[0].status, 'published', 'Seniors unchanged');
});

test('a forged publish is refused and writes nothing', async () => {
  seed(); await login('u-u18-c');
  const r = await publishTo('u-u18-c', SEN, 'player', 'tue', 'Sneaky plan');
  assert.equal(r.code, 403);
  assert.equal(kv.has(TRAIN(SEN)), false);
  assert.equal(kv.has(LEGACY_TRAIN), false);
});

// ── SESSION DEFINITIONS — per-group lists ─────────────────────────────────
test('session lists are group-owned: each write lands in its group, reads follow the viewer', async () => {
  seed(); await login('u-owner'); await login('u-u18-c'); await login('u-u18-p'); await login('u-sen-p');
  const w = await pub('u-u18-c', 'POST', {}, { type: 'sessions',
    data: [{ id: 'tue', title: 'U18 Tuesday', type: 'Training' }] });
  assert.equal(w.code, 200);
  assert.equal(w.body.groupId, U18, 'single-group coach defaults to their group');
  assert.ok(kv.has(SESS(U18)));
  assert.equal(kv.has(LEGACY_SESS), false, 'legacy list never written');

  const u18 = await pub('u-u18-p', 'GET', { type: 'sessions' });
  assert.deepEqual(u18.body.sessions.map(s => s.title), ['U18 Tuesday']);
  assert.equal(u18.body.trainingGroupId, U18);
  const sen = await pub('u-sen-p', 'GET', { type: 'sessions' });
  assert.deepEqual(sen.body.sessions, [], 'Seniors see nothing of U18\'s list');
});

test('the legacy sessions list surfaces through Seniors only, and clearing Seniors does NOT resurrect it', async () => {
  seed(); await login('u-owner'); await login('u-sen-p'); await login('u-u18-p');
  kv.set(LEGACY_SESS, JSON.stringify([{ id: 'tue', title: 'Legacy Tuesday', type: 'Training' }]));

  const sen = await pub('u-sen-p', 'GET', { type: 'sessions' });
  assert.deepEqual(sen.body.sessions.map(s => s.title), ['Legacy Tuesday']);
  const u18 = await pub('u-u18-p', 'GET', { type: 'sessions' });
  assert.deepEqual(u18.body.sessions, [], 'U18 starts empty');

  const del = await pub('u-owner', 'DELETE', { type: 'sessions' }, { group: SEN });
  assert.equal(del.code, 200);
  const after = await pub('u-sen-p', 'GET', { type: 'sessions' });
  assert.deepEqual(after.body.sessions, [], 'cleared means cleared — no legacy fallback resurrection');
  assert.equal(kv.get(LEGACY_SESS) !== undefined, true, 'the legacy key itself was not deleted');
});

test('a multi-group owner\'s sessions write without a group is refused, not guessed', async () => {
  seed(); await login('u-owner');
  const r = await pub('u-owner', 'POST', {}, { type: 'sessions', data: [{ id: 'tue', title: 'X' }] });
  assert.equal(r.code, 400);
  assert.match(r.body.error, /choose which group/i);
  assert.equal(kv.has(LEGACY_SESS), false);
  assert.equal(kv.has(SESS(SEN)), false);
});

// ── CLEANUP — wipes and test-data sweeps cover the group stores ───────────
test('the club wipe deletes every group\'s training stores', async () => {
  seed(); await login('u-owner');
  await pub('u-owner', 'POST', { resource: 'training-schedule' },
    { action: 'add', group: U18, slot: { day: 'Mon', startTime: '17:30' } });
  await publishTo('u-owner', WOM, 'player', 'tue', "Women's plan");
  await pub('u-owner', 'POST', {}, { type: 'sessions', group: SEN, data: [{ id: 'tue', title: 'S' }] });

  const r = await pub('u-owner', 'POST', { resource: 'club' },
    { action: 'delete_club_data', confirmName: 'Boitsfort' });
  assert.equal(r.code, 200);
  assert.ok(r.body.deleted.some(d => String(d).startsWith('group-scoped:')), 'wipe reports the group keys');
  assert.equal(kv.has(SCHED(U18)), false);
  assert.equal(kv.has(TRAIN(WOM)), false);
  assert.equal(kv.has(SESS(SEN)), false);
});

test('delete_test_data sweeps TEST sessions out of every group\'s list', async () => {
  seed(); await login('u-owner');
  kv.set(SESS(U18), JSON.stringify([
    { id: 'tue', title: 'U18 Tuesday' }, { id: 'x', title: 'TEST dummy session' }]));
  const r = await pub('u-owner', 'POST', { resource: 'club' },
    { action: 'delete_test_data', confirmPhrase: 'DELETE TEST DATA' });
  assert.equal(r.code, 200);
  assert.deepEqual(JSON.parse(kv.get(SESS(U18))).map(s => s.title), ['U18 Tuesday']);
});

// ── CLIENT — the per-group training swap ──────────────────────────────────
const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  let start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let body = src.indexOf('{', i), depth = 0, end = body;
  for (let b = body; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1);
}

function switchHarness(initialState, targetGid) {
  return new Function(`
    const state = arguments[0];
    let _trainingSchedule = { slots: [{ id: 'old' }] }, _trainingScheduleAttempted = true,
        _trainingPubState = { tue: {} }, _trainingPubLoadedAt = 99, _publishedStateLoadedAt = 99;
    const defaultState = {
      schedule: [{ id: 'tue', title: 'Training session 1' }, { id: 'thu', title: 'Training session 2' }, { id: 'game', title: 'Match' }],
      trainingBlocks: { tue: [], thu: [], game: [] },
      tacticsDrawings: { tue: null, thu: null, game: null },
    };
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    function operationalGroups() { return [
      { id: 'grp_initial', name: 'Seniors' }, { id: 'grp_u18', name: 'U18' }, { id: 'grp_womens', name: "Women's" }]; }
    function showToast() {} function saveState() {} function render() {}
    // Match Centre detach machinery (fixture/draft identity fix): inert stubs —
    // this suite exercises the TRAINING partition only.
    let _mcSheetFixtureId = '';
    function matchCentreFixtureId() { return ''; }
    function mcFlushDraftNow() {}
    function mcDetachFixture() {}
    // Performance detach machinery (selected-group isolation fix): the switch
    // invalidates the scoped athlete payload and drops any in-flight authoring.
    // Inert here — this suite exercises the TRAINING partition only.
    let _perfAssign = { loaded: true, athletes: [] };
    let _perfAuthor = { step: null };
    ${fn('captureTrainingState')}
    ${fn('stashTrainingState')}
    ${fn('adoptTrainingState')}
    ${fn('syncTrainingStateToGroup')}
    ${fn('trainingGroupParam')}
    ${fn('setOperationalGroup')}
    setOperationalGroup(arguments[1]);
    return { state, sched: _trainingSchedule, attempted: _trainingScheduleAttempted,
             pub: _trainingPubState, pubAt: _trainingPubLoadedAt, pubStateAt: _publishedStateLoadedAt };
  `)(structuredClone(initialState), targetGid);
}

const LIVE_SENIORS = {
  activeView: 'coach',
  operationalGroupId: 'grp_initial',
  schedule: [{ id: 'tue', title: 'Seniors Tuesday' }],
  trainingBlocks: { 'slot_tue1-20260818': [{ id: 'b1', activity: 'Lineout drills' }] },
  trainingAttendance: { 'slot_tue1-20260818': { p1: 'present' } },
  sessionNotes: { 'slot_tue1-20260818': { note: 'Windy' } },
  tacticsDrawings: { tue: 'drawing' },
  trainingWeekStart: '2026-08-17',
  trainingActiveSession: 'slot_tue1-20260818',
  lastWeekTrainingBlocks: { tue: [{ id: 'lb' }] },
};

test('switching group stashes the outgoing training state and adopts a FRESH slate', () => {
  const r = switchHarness(LIVE_SENIORS, 'grp_u18');
  assert.equal(r.state.operationalGroupId, 'grp_u18');
  const stash = r.state.trainingByGroup.grp_initial;
  assert.equal(stash.schedule[0].title, 'Seniors Tuesday', 'Seniors schedule stashed');
  assert.equal(stash.trainingBlocks['slot_tue1-20260818'][0].activity, 'Lineout drills');
  assert.equal(stash.trainingAttendance['slot_tue1-20260818'].p1, 'present');
  // The adopted U18 slate is the app's blank scaffold — never Seniors data.
  assert.equal(r.state.schedule.some(s => s.title === 'Seniors Tuesday'), false);
  assert.deepEqual(r.state.trainingBlocks, { tue: [], thu: [], game: [] });
  assert.deepEqual(r.state.trainingAttendance, {});
  assert.deepEqual(r.state.sessionNotes, {});
  assert.equal(r.state.trainingWeekStart, null);
});

test('switching group drops every server-cached training answer so refetch happens under the new group', () => {
  const r = switchHarness(LIVE_SENIORS, 'grp_womens');
  assert.equal(r.sched, null, '_trainingSchedule cleared');
  assert.equal(r.attempted, false, 'ensureTrainingSchedule may retry');
  assert.deepEqual(r.pub, {}, 'publication badges cleared');
  assert.equal(r.pubAt, 0, 'publication throttle reset');
  assert.equal(r.pubStateAt, 0, 'published-state throttle reset');
});

test('switching BACK restores the stashed group state — the same session id stays distinct per group', () => {
  const first = switchHarness(LIVE_SENIORS, 'grp_u18');
  // Work happens in U18 under the SAME dated session id.
  first.state.trainingBlocks['slot_tue1-20260818'] = [{ id: 'u1', activity: 'U18 handling' }];
  const back = switchHarness(first.state, 'grp_initial');
  assert.equal(back.state.trainingBlocks['slot_tue1-20260818'][0].activity, 'Lineout drills',
    'Seniors blocks return exactly as stashed');
  assert.equal(back.state.trainingByGroup.grp_u18.trainingBlocks['slot_tue1-20260818'][0].activity,
    'U18 handling', 'U18 work is stashed under U18');
  assert.equal(back.state.trainingWeekStart, '2026-08-17', 'viewed week restored per group');
});

test('the FIRST partition attributes live data to the INITIAL group even when leaving another group', () => {
  const odd = structuredClone(LIVE_SENIORS);
  odd.operationalGroupId = 'grp_u18';       // split engages while U18 is selected
  delete odd.trainingByGroup;               // never partitioned before
  const r = switchHarness(odd, 'grp_womens');
  assert.ok(r.state.trainingByGroup.grp_initial, 'legacy local data filed under grp_initial');
  assert.equal(r.state.trainingByGroup.grp_u18, undefined, 'NOT under the group that happened to be open');
  assert.equal(r.state.trainingByGroup.grp_initial.schedule[0].title, 'Seniors Tuesday');
});

test('an unauthorised switch changes nothing at all', () => {
  const r = switchHarness(LIVE_SENIORS, 'grp_forged');
  assert.equal(r.state.operationalGroupId, 'grp_initial', 'group unchanged');
  assert.equal(r.state.trainingByGroup, undefined, 'nothing stashed');
  assert.equal(r.state.schedule[0].title, 'Seniors Tuesday', 'training state untouched');
});

test('dual-role capacity switch swaps training state too — coach work never enters the player view', () => {
  // Alex: plays Seniors, coaches U18 + Women's. Capacity changes re-resolve
  // the group through resolveOperationalGroup, NOT setOperationalGroup — the
  // transition must still stash/adopt.
  const r = new Function(`
    const state = arguments[0];
    let _trainingSchedule = { slots: [1] }, _trainingScheduleAttempted = true,
        _trainingPubState = { x: 1 }, _trainingPubLoadedAt = 9, _publishedStateLoadedAt = 9;
    const defaultState = {
      schedule: [{ id: 'tue', title: 'Training session 1' }],
      trainingBlocks: { tue: [] }, tacticsDrawings: { tue: null },
    };
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    let _myOperational = {
      player: { groups: [{ id: 'grp_initial', name: 'Seniors' }], defaultGroupId: 'grp_initial', mustChoose: false },
      staff:  { groups: [{ id: 'grp_u18', name: 'U18' }, { id: 'grp_womens', name: "Women's" }], defaultGroupId: null, mustChoose: true },
    };
    function showToast() {} function saveState() {} function render() {}
    // Inert Match Centre detach stubs (fixture/draft identity fix).
    let _mcSheetFixtureId = '';
    function matchCentreFixtureId() { return ''; }
    function mcFlushDraftNow() {}
    function mcDetachFixture() {}
    // Performance detach machinery (selected-group isolation fix): the switch
    // invalidates the scoped athlete payload and drops any in-flight authoring.
    // Inert here — this suite exercises the TRAINING partition only.
    let _perfAssign = { loaded: true, athletes: [] };
    let _perfAuthor = { step: null };
    ${fn('operationalCapacity')}
    ${fn('operationalGroups')}
    ${fn('captureTrainingState')}
    ${fn('stashTrainingState')}
    ${fn('adoptTrainingState')}
    ${fn('syncTrainingStateToGroup')}
    ${fn('resolveOperationalGroup')}
    ${fn('setOperationalGroup')}
    // Player view: Seniors training on show.
    resolveOperationalGroup();
    const playerGroup = state.operationalGroupId;
    // Enter the coach shell: two coachable groups, nothing guessed.
    state.activeView = 'coach'; resolveOperationalGroup();
    const coachInitial = state.operationalGroupId;
    const liveAfterEntry = state.schedule[0].title;
    // Choose U18 and do some coach work.
    setOperationalGroup('grp_u18');
    state.trainingBlocks['slot_tue1-20260818'] = [{ id: 'u1', activity: 'U18 handling' }];
    // Back to the player view.
    state.activeView = 'player'; resolveOperationalGroup();
    return { playerGroup, coachInitial, liveAfterEntry,
             backGroup: state.operationalGroupId,
             backTitle: state.schedule[0].title,
             backDated: (state.trainingBlocks['slot_tue1-20260818'] || []).map(b => b.activity),
             u18Stash: state.trainingByGroup.grp_u18?.trainingBlocks?.['slot_tue1-20260818']?.[0]?.activity };
  `)(structuredClone({ ...LIVE_SENIORS, activeView: 'player' }));
  assert.equal(r.playerGroup, 'grp_initial', 'plays Seniors');
  assert.equal(r.coachInitial, null, 'two coachable groups: the switcher must ask');
  assert.equal(r.liveAfterEntry, 'Seniors Tuesday', 'no group chosen yet — live state keeps its owner');
  assert.equal(r.backGroup, 'grp_initial', 'player view resolves back to Seniors');
  assert.equal(r.backTitle, 'Seniors Tuesday', 'Seniors training restored exactly');
  assert.deepEqual(r.backDated, ['Lineout drills'],
    'the SAME dated id shows the Seniors plan — never the U18 coach work');
  assert.equal(r.u18Stash, 'U18 handling', 'the coach work is stashed under U18');
});

test('trainingGroupParam: staff requests name the operating group; player requests never do', () => {
  // Direct extraction keeps this honest against the real implementation.
  const tgp = (view, gid, groups) => new Function(`
    const state = { activeView: arguments[0], operationalGroupId: arguments[1] };
    function operationalGroups() { return arguments[2] || []; }
    const _g = arguments[2];
    ${fn('trainingGroupParam').replace('operationalGroups()', '_g')}
    return trainingGroupParam();
  `)(view, gid, groups);
  assert.equal(tgp('coach', 'grp_u18', [{ id: 'grp_u18' }]), 'grp_u18', 'staff: the operating group');
  assert.equal(tgp('player', 'grp_u18', [{ id: 'grp_u18' }]), '', 'player view: SERVER derives the group');
  assert.equal(tgp('coach', null, [{ id: 'grp_u18' }]), '', 'no group in force: nothing asserted');
});

// ── CLIENT — pinned wiring ────────────────────────────────────────────────
test('every training fetch carries the group; every async adopt guards against a stale group', () => {
  const sched = fn('loadTrainingSchedule');
  assert.match(sched, /trainingGroupParam\(\)/, 'schedule read is group-stamped');
  assert.match(sched, /[Ss]tale reply/, 'and discards replies for a group no longer in force');
  const save = fn('trainingScheduleSave');
  assert.match(save, /group: gid/, 'schedule writes name the group');
  const pubState = fn('loadTrainingPublicationState');
  assert.match(pubState, /&group=/, 'publication state read is group-stamped');
  assert.match(pubState, /stale reply/);
  assert.match(fn('trainingPublishTo'), /group: trainingGroupParam\(\)/, 'publishes name the group');
  assert.match(fn('trainingMarkEdited'), /group: trainingGroupParam\(\)/, 'revision touches name the group');
  // type=all merges server sessions into the WORKING schedule — un-stamped, a
  // multi-group coach would adopt another group's sessions into the one they
  // are operating.
  const pubAll = fn('loadPublishedStateForPlayer');
  assert.match(pubAll, /trainingGroupParam\(\)/, 'the type=all read is group-stamped for staff');
  assert.match(pubAll, /stale reply/, 'and discards replies for a group no longer in force');
});

test('the sessions sync names the group and HOLDS rather than guess for a multi-group operator', () => {
  const sync = fn('syncSessionsToServer');
  assert.match(sync, /trainingGroupParam\(\)/);
  assert.match(sync, /operationalGroups\(\)\.length > 1\) return/, 'no group in force → no write');
  assert.match(sync, /group: gid/);
});

test('training counts and the attendance register read the OPERATING group\'s players', () => {
  assert.match(fn('renderTraining'), /operationalPlayers\(\)\.filter\(p => \(p\[sKey\]/,
    'session-card confirmed counts');
  const att = fn('_renderTrainingAttendance');
  assert.match(att, /operationalPlayers\(\)/, 'register roster');
  assert.equal(/activeRosterPlayers\(state\.players\)/.test(att), false,
    'the whole-club register list is gone');
});

test('the per-group stash survives normalisation and dies with a club switch', () => {
  assert.match(fn('normalizeState'), /trainingByGroup/, 'normalizeState preserves the stash');
  assert.match(fn('resetTeamScopedState'), /trainingByGroup = \{\}/, 'club switch clears it');
});

// ── CLIENT — a failed schedule fetch must not latch the card on "Loading…" ──
// renderTrainingScheduleCard() shows "Loading…" while _trainingSchedule is
// null, and ensureTrainingSchedule() refuses to retry once
// _trainingScheduleAttempted is set. A single dropped request therefore used
// to pin the Settings card on "Loading…" for the whole session; the fetch must
// release the latch on every failure path so the next render tries again.
function latchHarness({ ok = true, throws = false } = {}) {
  return new Function(`
    const outcome = arguments[0];
    let _trainingSchedule = null, _trainingScheduleAttempted = true, _trainingScheduleGroupId = '';
    let rendered = 0;
    function render() { rendered++; }
    function trainingGroupParam() { return 'grp_initial'; }
    async function fetch() {
      if (outcome.throws) throw new Error('offline');
      if (!outcome.ok) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ slots: [{ id: 'slot_tue', day: 'Tue' }] }) };
    }
    ${fn('loadTrainingSchedule')}
    return loadTrainingSchedule().then(result => ({
      result, attempted: _trainingScheduleAttempted, sched: _trainingSchedule, rendered }));
  `)({ ok, throws });
}

test('a failed training-schedule fetch releases the retry latch; success is unchanged', async () => {
  const failed = await latchHarness({ ok: false });
  assert.equal(failed.result, null, 'a failed read returns null, as before');
  assert.equal(failed.sched, null, 'and stores nothing');
  assert.equal(failed.attempted, false, 'the latch is RELEASED so the next render retries');

  const offline = await latchHarness({ throws: true });
  assert.equal(offline.result, null);
  assert.equal(offline.attempted, false, 'a thrown fetch releases the latch too');

  const ok = await latchHarness({ ok: true });
  assert.deepEqual(ok.sched, { slots: [{ id: 'slot_tue', day: 'Tue' }] }, 'success still adopts the schedule');
  assert.equal(ok.attempted, true, 'a successful read leaves the latch set — no refetch loop');
  assert.equal(ok.rendered, 1, 'and re-renders exactly once');
});

test('ensureTrainingSchedule retries after a released latch, and never double-fetches', () => {
  const ensure = fn('ensureTrainingSchedule');
  assert.match(ensure, /if \(_trainingSchedule \|\| _trainingScheduleAttempted\) return;/,
    'one in-flight attempt at a time');
  const load = fn('loadTrainingSchedule');
  assert.match(load, /if \(!res\.ok\) \{ _trainingScheduleAttempted = false; return null; \}/,
    'HTTP failure releases the latch');
  assert.match(load, /catch \{ _trainingScheduleAttempted = false; return null; \}/,
    'network failure releases the latch');
});
