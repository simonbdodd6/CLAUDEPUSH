/**
 * SENIORS SHARED PLAYER POOL — eligibility IS group membership.
 *
 * Production showed Premier with 0 eligible players and Premier Development
 * with the entire Seniors squad. Cause: the structure counts endpoint used the
 * legacy effectiveEligibility(), whose no-stored-value default is the
 * hardcoded [team_initial] — so every unassigned player counted only for the
 * club's original team record (renamed "Premier Development"), and a stored
 * legacy list naming that same team locked the split in.
 *
 * The rule now pinned everywhere: an ACTIVE player is eligible for EVERY
 * active team in their player group (playerGroupId — where they PLAY), and
 * for nothing outside it. No per-player team checkboxes, no duplicate
 * records. Stored playerEligibility remains readable but can no longer
 * restrict the team set (it may only prefer a primary within the group).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.eligibility.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { resolveEligibility } = await import('../api/_accessScope.js');
const store = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-boitsfort';
const SENIORS = 'grp_seniors', U18 = 'grp_u18', WOMENS = 'grp_womens';
const PREMIER = 'team_premier', DEV = 'team_initial';       // Dev IS the renamed original record
const U18P = 'team_u18_premier', U18D = 'team_u18_dev', WTEAM = 'team_womens';

const STRUCTURE = {
  version: 1,
  groups: [
    { id: SENIORS, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18,     name: 'U18',     type: 'general', status: 'active' },
    { id: WOMENS,  name: "Women's", type: 'general', status: 'active' },
  ],
  teams: [
    { id: PREMIER, groupId: SENIORS, name: 'Premier',             status: 'active' },
    { id: DEV,     groupId: SENIORS, name: 'Premier Development', status: 'active' },
    { id: 'team_archived', groupId: SENIORS, name: 'Old Thirds',  status: 'archived' },
    { id: U18P,    groupId: U18,     name: 'U18 Premier',         status: 'active' },
    { id: U18D,    groupId: U18,     name: 'U18 Development',     status: 'active' },
    { id: WTEAM,   groupId: WOMENS,  name: "Women's XV",          status: 'active' },
  ],
};

const seniorPlayer = (n, extra = {}) => ({
  id: `m-${n}`, teamId: CLUB, userId: `u-${n}`, role: 'player', status: 'active',
  playerGroupId: SENIORS, ...extra,
});

// ── THE RULE, DIRECTLY ─────────────────────────────────────────────────────
test('a Seniors player is eligible for Premier AND Premier Development', () => {
  const e = resolveEligibility(seniorPlayer(1), STRUCTURE);
  assert.deepEqual([...e.teamIds].sort(), [DEV, PREMIER].sort());
});

test('an archived team is never part of derived eligibility', () => {
  const e = resolveEligibility(seniorPlayer(1), STRUCTURE);
  assert.equal(e.teamIds.includes('team_archived'), false);
});

test('an inactive member has no eligibility at all', () => {
  assert.deepEqual(resolveEligibility(seniorPlayer(1, { status: 'inactive' }), STRUCTURE).teamIds, []);
});

test('a U18 player is eligible for U18 teams only — never Seniors teams', () => {
  const e = resolveEligibility(seniorPlayer(2, { playerGroupId: U18 }), STRUCTURE);
  assert.deepEqual([...e.teamIds].sort(), [U18D, U18P].sort());
  assert.equal(e.teamIds.includes(PREMIER), false);
  assert.equal(e.teamIds.includes(DEV), false);
});

test("a Women's player is eligible for Women's teams only", () => {
  const e = resolveEligibility(seniorPlayer(3, { playerGroupId: WOMENS }), STRUCTURE);
  assert.deepEqual(e.teamIds, [WTEAM]);
});

test('THE PRODUCTION BUG: legacy stored eligibility cannot restrict the set', () => {
  // The exact stored shape production players carry: the old default naming
  // only the original team record. It used to be authoritative — Premier 0.
  const e = resolveEligibility(seniorPlayer(4, {
    playerEligibility: { teamIds: [DEV], primaryTeamId: DEV },
  }), STRUCTURE);
  assert.deepEqual([...e.teamIds].sort(), [DEV, PREMIER].sort(),
    'the group rule wins — stored lists no longer narrow eligibility');
});

test('stored eligibility may still prefer a PRIMARY team within the group', () => {
  const e = resolveEligibility(seniorPlayer(5, {
    playerEligibility: { teamIds: [DEV], primaryTeamId: DEV },
  }), STRUCTURE);
  assert.equal(e.primaryTeamId, DEV, 'an in-group primary preference is kept');
  const f = resolveEligibility(seniorPlayer(6, {
    playerEligibility: { teamIds: [U18P], primaryTeamId: U18P },
  }), STRUCTURE);
  assert.equal(f.teamIds.includes(U18P), false, 'a cross-group primary never leaks a team in');
  assert.equal(f.primaryTeamId, f.teamIds[0], 'and falls back within the group');
});

test('staff-only members derive no player eligibility from their access', () => {
  const coach = { id: 'm-c', teamId: CLUB, userId: 'u-c', role: 'coach', status: 'active',
    accessScope: { clubWide: true, groups: [], teams: [] } };
  assert.deepEqual(resolveEligibility(coach, STRUCTURE).teamIds, [],
    'where a person coaches is not where they play');
});

test('a DUAL-ROLE member (coach who also plays) keeps full group eligibility', () => {
  const playingCoach = { id: 'm-pc', teamId: CLUB, userId: 'u-pc', role: 'coach',
    status: 'active', playerGroupId: SENIORS };
  assert.deepEqual([...resolveEligibility(playingCoach, STRUCTURE).teamIds].sort(),
    [DEV, PREMIER].sort());
});

test('an unknown or archived playerGroupId refuses to guess', () => {
  assert.deepEqual(resolveEligibility(seniorPlayer(7, { playerGroupId: 'grp_gone' }), STRUCTURE).teamIds, []);
});

test('a pre-structure player with NO group resolves only when unambiguous', () => {
  const oneGroup = { ...STRUCTURE,
    groups: [{ id: SENIORS, name: 'Seniors', type: 'general', status: 'active' }],
    teams: STRUCTURE.teams.filter(t => t.groupId === SENIORS) };
  const legacy = { id: 'm-l', teamId: CLUB, userId: 'u-l', role: 'player', status: 'active' };
  assert.deepEqual([...resolveEligibility(legacy, oneGroup).teamIds].sort(), [DEV, PREMIER].sort(),
    'one active group: unambiguous');
  assert.deepEqual(resolveEligibility(legacy, STRUCTURE).teamIds, [],
    'several groups: never guessed');
});

test('a NEW member invited into Seniors is eligible for both teams immediately', () => {
  // The invite flow stamps playerGroupId — that stamp alone is the whole rule.
  const invited = { id: 'm-new', teamId: CLUB, userId: 'u-new', role: 'player',
    status: 'active', playerGroupId: SENIORS };
  assert.deepEqual([...resolveEligibility(invited, STRUCTURE).teamIds].sort(), [DEV, PREMIER].sort());
});

test('leaving Seniors removes eligibility for BOTH teams at once', () => {
  const left = seniorPlayer(8, { playerGroupId: WOMENS });   // moved group
  const e = resolveEligibility(left, STRUCTURE);
  assert.equal(e.teamIds.includes(PREMIER), false);
  assert.equal(e.teamIds.includes(DEV), false);
});

// ── THE COUNTS ENDPOINT, END TO END ───────────────────────────────────────
const MEMBERS = [
  { id: 'm-admin', teamId: CLUB, userId: 'u-admin', role: 'admin', status: 'active', accessProfile: 'full' },
  seniorPlayer('p1'), seniorPlayer('p2'), seniorPlayer('p3'),
  seniorPlayer('p4', { playerEligibility: { teamIds: [DEV], primaryTeamId: DEV } }),  // legacy stored
  seniorPlayer('px', { status: 'inactive' }),
  seniorPlayer('u18a', { playerGroupId: U18 }),
  seniorPlayer('wa',   { playerGroupId: WOMENS }),
];

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(
    MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Boitsfort', fixtures: [] }));
}

const cookies = new Map();
async function login(userId) {
  const s = await createSession({ userId, teamId: CLUB, role: 'admin' });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}

test('the structure endpoint reports the SAME eligible count for both teams', async () => {
  seed(); await login('u-admin');
  const r = res();
  await publishHandler({ method: 'GET', query: { resource: 'structure' },
    headers: { cookie: cookies.get('u-admin') || '' } }, r);
  assert.equal(r.result.code, 200);
  const teams = r.result.body.counts.teams;
  // 4 active Seniors players (p1-p3 + p4-with-legacy-stored). Not the
  // inactive one, not U18, not Women's, not the admin.
  assert.equal(teams[PREMIER].members, 4, 'Premier counts the whole Seniors pool');
  assert.equal(teams[DEV].members, 4, 'Premier Development counts the SAME pool');
  assert.equal(teams[U18P].members, 1, 'U18 counts only its own player');
  assert.equal(teams[WTEAM].members, 1, "Women's counts only its own player");
});

test('one player leaving Seniors reduces BOTH team counts together', async () => {
  seed(); await login('u-admin');
  const members = MEMBERS.map(m => m.id === 'm-p3' ? { ...m, status: 'inactive' } : m);
  kv.set('app:identity:team_members', JSON.stringify(members));
  const r = res();
  await publishHandler({ method: 'GET', query: { resource: 'structure' },
    headers: { cookie: cookies.get('u-admin') || '' } }, r);
  const teams = r.result.body.counts.teams;
  assert.equal(teams[PREMIER].members, 3);
  assert.equal(teams[DEV].members, 3, 'no per-team maintenance — both move together');
});

// ── THE CLIENT MIRROR ─────────────────────────────────────────────────────
const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
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

function clientElig(member, structure = STRUCTURE) {
  return new Function(`
    const _adminData = { structure: arguments[1] };
    ${fn('memberEligibility')}
    return memberEligibility(arguments[0]);
  `)(member, structure);
}

test('the client card derives the same rule from playerGroupId', () => {
  const e = clientElig({ role: 'player', playerGroupId: SENIORS });
  assert.deepEqual([...e.teamIds].sort(), [DEV, PREMIER].sort());
});

test('client: stored legacy list cannot restrict; cross-group never leaks', () => {
  const e = clientElig({ role: 'player', playerGroupId: SENIORS,
    playerEligibility: { teamIds: [DEV], primaryTeamId: DEV } });
  assert.deepEqual([...e.teamIds].sort(), [DEV, PREMIER].sort());
  assert.equal(e.primaryTeamId, DEV);
  const u = clientElig({ role: 'player', playerGroupId: U18 });
  assert.equal(u.teamIds.includes(PREMIER), false);
});

test('client: staff access grants never manufacture player eligibility', () => {
  const e = clientElig({ role: 'coach',
    accessScope: { clubWide: true, groups: [], teams: [] } });
  assert.deepEqual(e.teamIds, [], 'coaching everywhere ≠ playing anywhere');
});

test('client: the eligibility picker stays withdrawn from Core Beta', () => {
  assert.match(src, /const ELIGIBILITY_PICKER_ENABLED = false/,
    'no per-player team checkboxes in the shared-squad model');
});
