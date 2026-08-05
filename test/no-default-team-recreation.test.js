/**
 * Stage 1 — production must never recreate boitsfort-rfc.
 *
 * The hard-coded DEFAULT_TEAM was being synthesised AND persisted on read:
 * loadTeams() wrote it back whenever it was absent, listIdentityState() rebuilt
 * the legacy coach/player scaffolding on every call, and createClub() persisted
 * whatever loadTeams() had just synthesised. An empty production store could
 * therefore never stay empty.
 *
 * These tests pin the fix: in production the store is returned exactly as
 * stored, reads issue no writes at all, and the dev/test fallback survives only
 * outside production.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.no-recreate.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
/** Every command the store layer issues, so a write-on-read is impossible to miss. */
let issued = [];
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  issued.push({ command, key: args[0] });
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { DEFAULT_TEAM, loadTeams, listIdentityState, createClub, legacySeedEnabled } = store;

const TEAMS_KEY = 'app:identity:teams';
const writes = () => issued.filter(c => c.command === 'SET' || c.command === 'DEL');

/** Run fn as production (Vercel runtime), restoring the previous env after. */
async function asProduction(fn) {
  const prev = process.env.VERCEL;
  process.env.VERCEL = '1';
  try { return await fn(); } finally {
    if (prev === undefined) delete process.env.VERCEL; else process.env.VERCEL = prev;
  }
}
async function asDev(fn) {
  const prev = process.env.VERCEL;
  delete process.env.VERCEL;
  try { return await fn(); } finally {
    if (prev !== undefined) process.env.VERCEL = prev;
  }
}

function reset(seed = {}) {
  kv.clear();
  issued = [];
  for (const [k, v] of Object.entries(seed)) kv.set(k, JSON.stringify(v));
  issued = [];
}

// ── The gate itself ─────────────────────────────────────────────────────────
test('legacy seeding is off in production and on in dev/test', async () => {
  await asProduction(() => assert.equal(legacySeedEnabled(), false, 'must be OFF under Vercel'));
  await asDev(() => assert.equal(legacySeedEnabled(), true, 'stays ON for tests and local dev'));

  const prevNode = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  await asDev(() => assert.equal(legacySeedEnabled(), false, 'NODE_ENV=production also disables it'));
  if (prevNode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prevNode;
});

// ── No recreation ───────────────────────────────────────────────────────────
test('an empty production store returns no clubs and stays empty', async () => {
  reset();
  await asProduction(async () => {
    const teams = await loadTeams();
    assert.deepEqual(teams, [], 'no club is synthesised');
    assert.equal(writes().length, 0, 'reading issued no write');
    assert.equal(kv.has(TEAMS_KEY), false, 'nothing was persisted');
  });
});

test('boitsfort-rfc is never recreated, however many times production reads', async () => {
  reset();
  await asProduction(async () => {
    for (let i = 0; i < 5; i++) await loadTeams();
    assert.equal(writes().length, 0, 'repeated reads never write');
    const teams = await loadTeams();
    assert.equal(teams.some(t => t.id === DEFAULT_TEAM.id), false, 'boitsfort-rfc absent');
    assert.equal(kv.size, 0, 'store still completely empty');
  });
});

test('the full identity read path writes nothing on an empty production store', async () => {
  reset();
  await asProduction(async () => {
    const state = await listIdentityState('some-real-club');
    assert.equal(writes().length, 0, `listIdentityState wrote: ${JSON.stringify(writes())}`);
    assert.deepEqual(state.teams, []);
    assert.deepEqual(state.team_members, []);
    assert.deepEqual(state.users, []);
    assert.deepEqual(state.player_profiles, []);
    assert.equal(kv.size, 0, 'store untouched');
  });
});

test('the legacy coach/player scaffolding is not rebuilt in production', async () => {
  reset();
  await asProduction(async () => {
    await listIdentityState(DEFAULT_TEAM.id);
    assert.equal(writes().length, 0, 'no legacy records written');
    assert.equal(kv.has('app:identity:users'), false, 'no coach-demo / test player user created');
    assert.equal(kv.has('app:identity:team_members'), false, 'no legacy membership created');
    assert.equal(kv.has('app:identity:player_profiles'), false, 'no legacy profile created');
  });
});

// ── Real tenants are unaffected ─────────────────────────────────────────────
test('existing real tenants still load, unchanged and without a write', async () => {
  const real = [
    { id: 'real-club-a', name: 'Real Club A', teamCode: 'RCA11' },
    { id: 'real-club-b', name: 'Real Club B', teamCode: 'RCB22' },
  ];
  reset({ [TEAMS_KEY]: real });
  await asProduction(async () => {
    const teams = await loadTeams();
    assert.deepEqual(teams, real, 'returned exactly what was stored');
    assert.equal(teams.some(t => t.id === DEFAULT_TEAM.id), false, 'no phantom club added');
    assert.equal(writes().length, 0, 'reading real tenants issued no write');
  });
});

test('a stored boitsfort-rfc is still returned — this change deletes nothing', async () => {
  reset({ [TEAMS_KEY]: [{ id: DEFAULT_TEAM.id, name: 'Boitsfort RFC' }] });
  await asProduction(async () => {
    const teams = await loadTeams();
    assert.equal(teams.length, 1);
    assert.equal(teams[0].id, DEFAULT_TEAM.id, 'stored data is never removed by a read');
    assert.equal(writes().length, 0);
  });
});

// ── Onboarding ──────────────────────────────────────────────────────────────
test('first-user onboarding creates a club, and only that club', async () => {
  reset();
  await asProduction(async () => {
    const result = await createClub({
      clubName: 'Boitsfort Rugby Club', teamName: '1st XV', sport: 'Rugby',
      name: 'Simon Dodd', email: 'first.owner@example.com', password: 'Str0ng-Passw0rd!',
    });
    assert.ok(result?.team?.id, 'a team was created');

    const stored = JSON.parse(kv.get(TEAMS_KEY));
    assert.equal(stored.length, 1, `exactly one club persisted, got ${stored.length}`);
    assert.equal(stored.some(t => t.id === DEFAULT_TEAM.id), false,
      'createClub must not persist the hard-coded boitsfort-rfc alongside the real club');
    assert.notEqual(stored[0].id, DEFAULT_TEAM.id, 'the genuine club gets its own id');
    assert.equal(stored[0].name, 'Boitsfort Rugby Club');

    const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
    assert.ok(members.some(m => m.teamId === stored[0].id), 'owner membership attached to the new club');
    assert.equal(members.some(m => m.teamId === DEFAULT_TEAM.id), false, 'no legacy membership');
  });
});

test('a second club can still be created alongside the first', async () => {
  await asProduction(async () => {
    await createClub({
      clubName: 'Second Club', sport: 'Rugby',
      name: 'Other Coach', email: 'second.owner@example.com', password: 'An0ther-Passw0rd!',
    });
    const stored = JSON.parse(kv.get(TEAMS_KEY));
    assert.equal(stored.length, 2, 'both clubs persisted');
    assert.equal(stored.some(t => t.id === DEFAULT_TEAM.id), false, 'still no phantom club');
  });
});

// ── Tenant isolation ────────────────────────────────────────────────────────
test('tenant isolation still holds after the change', async () => {
  reset({
    [TEAMS_KEY]: [{ id: 'club-a', name: 'A' }, { id: 'club-b', name: 'B' }],
    'app:identity:users': [
      { id: 'u-a', email: 'a@a.test', displayName: 'A User' },
      { id: 'u-b', email: 'b@b.test', displayName: 'B User' },
    ],
    'app:identity:team_members': [
      { id: 'tm-a', teamId: 'club-a', userId: 'u-a', role: 'coach', status: 'active' },
      { id: 'tm-b', teamId: 'club-b', userId: 'u-b', role: 'coach', status: 'active' },
    ],
    'app:identity:player_profiles': [
      { id: 'p-a', teamId: 'club-a', userId: 'u-a', displayName: 'A User' },
      { id: 'p-b', teamId: 'club-b', userId: 'u-b', displayName: 'B User' },
    ],
  });
  await asProduction(async () => {
    const a = await listIdentityState('club-a');
    assert.deepEqual(a.teams.map(t => t.id), ['club-a'], 'only its own club');
    assert.deepEqual(a.team_members.map(m => m.id), ['tm-a'], 'only its own members');
    assert.deepEqual(a.player_profiles.map(p => p.id), ['p-a'], 'only its own profiles');
    assert.deepEqual(a.users.map(u => u.id), ['u-a'], 'no cross-tenant user leak');
    assert.equal(writes().length, 0, 'reads stayed read-only');
  });
});

// ── Dev/test fallback still works ───────────────────────────────────────────
test('outside production the fallback still resolves, but is never persisted', async () => {
  reset();
  await asDev(async () => {
    const teams = await loadTeams();
    assert.equal(teams.some(t => t.id === DEFAULT_TEAM.id), true, 'dev/test still sees the default club');
    assert.equal(writes().length, 0, 'even in dev, reading must not write');
    assert.equal(kv.has(TEAMS_KEY), false, 'the fallback is in-memory only');
  });
});
