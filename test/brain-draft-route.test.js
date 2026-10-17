/**
 * Build 118 — the Brain draft endpoint and the Core-owned Brain provider.
 *
 * GET /api/brain-draft is served by the publish function (resource=brain-draft; 12-function ceiling)
 * and reads Core through api/_brainProviders.js — a Core rewrite of the Brain branch's provider that
 * scopes every read to ONE club and ONE authorised playing group. Real sessions, the real publish
 * handler, a mocked Upstash; a two-group club (Seniors = INITIAL, U18) plus a second club.
 *
 * Proves: OFF by default (and the Brain code is not even loaded), every gate in the original order,
 * PERM.AI_INTELLIGENCE, group authorisation (forged/foreign/other-group refused), U18 data only for
 * the U18 coach and Seniors only for the Seniors coach, no cross-club leak (incl. a reused coach id),
 * the group-scoped dated availability read, real coach memories reaching the Brain, no roster PII in
 * the response, the original response contract, and a 500 that leaks nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.brain-draft-route.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.COACH_MEMORY_PRODUCERS_ENABLED = 'true';   // this process only — production stays unset
delete process.env.BRAIN_ENABLED;

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

const identity = await import('../api/_identityStore.js');
const { INITIAL_GROUP_ID } = await import('../api/_structureStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const { brainDraftHandler } = await import('../api/_brainDraftRoute.js');
const { buildBrainProviders } = await import('../api/_brainProviders.js');
const { SESSION_COOKIE, createSession } = identity;

const CLUB = 'club-stg', OTHER = 'club-other';
const SEN = INITIAL_GROUP_ID, U18 = 'grp-u18';
const scope = groupId => ({ clubWide: false, groups: [{ groupId, status: 'active' }], teams: [] });
const STRUCTURE = { version: 1,
  groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' }, { id: U18, name: 'U18', type: 'age-grade', status: 'active' }],
  teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' }, { id: 't-u18a', groupId: U18, name: 'U18 Premier', status: 'active' }] };
const OTHER_STRUCTURE = { version: 1, groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' }], teams: [{ id: 't-o1', groupId: SEN, name: 'Firsts', status: 'active' }] };

const staff = (id, teamId, userId, extra) => ({ id, teamId, userId, role: 'coach', status: 'active', ...extra });
const player = (n, teamId, groupId) => ({ id: `m-${teamId}-${n}`, teamId, userId: `u-${teamId}-${n}`, role: 'player', status: 'active', playerGroupId: groupId });
const MEMBERS = [
  staff('m-sen-coach', CLUB, 'u-sen-coach', { accessProfile: 'coach', accessScope: scope(SEN) }),
  staff('m-u18-coach', CLUB, 'u-u18-coach', { accessProfile: 'coach', accessScope: scope(U18) }),
  staff('m-manager', CLUB, 'u-manager', { accessProfile: 'manager', accessScope: scope(U18) }),
  { id: 'm-owner', teamId: CLUB, userId: 'u-owner', role: 'admin', status: 'active', isOwner: true },
  // the SAME user id is a coach in the other club too (cross-club reuse)
  staff('m-other-u18', OTHER, 'u-u18-coach', { accessProfile: 'full' }),
  ...[1, 2, 3].map(n => player(`sen${n}`, CLUB, SEN)),
  ...[1, 2, 3, 4, 5, 6, 7].map(n => player(`u18-${n}`, CLUB, U18)),
  { ...player('u18-x', CLUB, U18), status: 'archived' },     // archived: never in a draft
  ...[1, 2].map(n => player(`o${n}`, OTHER, SEN)),
];
// REAL Core position data: canonical "N — Label" (what claimInvite asks for), a bare jersey number,
// a named position the Brain recognises, and positions the Brain cannot place (incl. Core's 'TBC').
const REAL_POSITIONS = {
  [`u-${CLUB}-u18-1`]: '9 — Scrum-half',   // canonical → '9'
  [`u-${CLUB}-u18-2`]: '10',               // jersey number → as is
  [`u-${CLUB}-u18-3`]: 'Lock',             // named, Brain-recognised → as is
  [`u-${CLUB}-u18-4`]: 'TBC',              // unsupported → excluded
  [`u-${CLUB}-u18-5`]: 'Prop',             // unsupported → excluded (never guessed as LH/TH)
  [`u-${CLUB}-u18-6`]: 'Back row',         // unsupported → excluded
  [`u-${CLUB}-u18-7`]: '4 — Lock',         // canonical → '4'
  [`u-${CLUB}-u18-x`]: '7 — Openside Flanker',
  [`u-${CLUB}-sen1`]: '1 — Loosehead Prop', // canonical → '1'
  [`u-${CLUB}-sen2`]: 'Front row',         // unsupported → excluded
  [`u-${CLUB}-sen3`]: 'Back three',        // unsupported → excluded
  [`u-${OTHER}-o1`]: '15 — Fullback',      // canonical → '15'
  [`u-${OTHER}-o2`]: 'Outside back',       // unsupported → excluded
};
// The pre-existing all-jersey-number dataset (every position Brain-placeable).
const JERSEY_POSITIONS = Object.fromEntries(Object.keys(REAL_POSITIONS).map((k, i) => [k, String((i % 15) + 1)]));
let POSITIONS = REAL_POSITIONS;
const profiles = () => MEMBERS.filter(m => m.role === 'player').map(m => ({
  id: `p-${m.userId}`, teamId: m.teamId, userId: m.userId, displayName: `Player ${m.userId}`, position: POSITIONS[m.userId],
}));
const FIXTURES = [
  { id: 'fx-sen',      groupId: SEN, sideId: 't-prem', team: 'Premier',     opposition: 'Mons',  date: '2099-08-20', status: 'scheduled' },
  { id: 'fx-u18',      groupId: U18, sideId: 't-u18a', team: 'U18 Premier', opposition: 'Liège', date: '2099-08-22', status: 'scheduled' },
  { id: 'fx-u18-late', groupId: U18, sideId: 't-u18a', team: 'U18 Premier', opposition: 'Namur', date: '2099-09-05', status: 'scheduled' },
  { id: 'fx-u18-past', groupId: U18, sideId: 't-u18a', team: 'U18 Premier', opposition: 'Old',   date: '2000-01-01', status: 'played' },
];

const cookies = new Map();
async function seed({ brainFlagFor = [CLUB], positions = REAL_POSITIONS } = {}) {
  POSITIONS = positions;
  const PROFILES = profiles();
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Staging Club' }, { id: OTHER, name: 'Other Club' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify([...new Set(MEMBERS.map(m => m.userId))].map(id => ({ id, email: `${id}@sentinel.test`, displayName: id }))));
  kv.set('app:identity:player_profiles', JSON.stringify(PROFILES));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:structure:${OTHER}`, JSON.stringify(OTHER_STRUCTURE));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ fixtures: FIXTURES }));
  kv.set(`app:club:${OTHER}`, JSON.stringify({ fixtures: [{ id: 'fx-o', groupId: SEN, sideId: 't-o1', team: 'Firsts', opposition: 'Away', date: '2099-08-23', status: 'scheduled' }] }));
  // the roster record carries contact PII — the Brain must never see it
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: PROFILES.filter(p => p.teamId === CLUB).map(p => ({ id: p.id, name: p.displayName, userId: p.userId, email: 'roster-email@sentinel.test', phone: '+32-SENTINEL-PHONE', dob: '2008-01-01' })) }));
  // dated, group-scoped availability: the U18 fixture's event id IS the fixture id
  kv.set(`app:availability:${CLUB}:group:${U18}:fx-u18`, JSON.stringify({
    a: { userId: `u-${CLUB}-u18-1`, playerId: `u-${CLUB}-u18-1`, response: 'available', respondedAt: '2099-08-01T10:00:00Z' },
    b: { userId: `u-${CLUB}-u18-2`, playerId: `u-${CLUB}-u18-2`, response: 'unavailable', respondedAt: '2099-08-01T10:00:00Z' },
    // a stale duplicate for u18-1 must lose to the newer answer (Core's recency rule)
    c: { userId: `u-${CLUB}-u18-1`, playerId: `u-${CLUB}-u18-1`, response: 'unavailable', respondedAt: '2099-07-01T10:00:00Z' },
  }));
  // the SAME session id in the Seniors group — must never reach a U18 draft
  kv.set(`app:availability:${CLUB}:group:${SEN}:fx-u18`, JSON.stringify({ z: { userId: `u-${CLUB}-sen1`, response: 'available' } }));
  for (const t of brainFlagFor) kv.set(`app:brain:flags:${t}`, JSON.stringify({ enabled: true }));
  for (const m of MEMBERS) {
    const s = await createSession({ userId: m.userId, teamId: m.teamId, role: m.role });
    cookies.set(`${m.teamId}/${m.userId}`, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
  }
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; }, end() { return this; }, setHeader() {}, get result() { return out; } };
}
async function draft(who, query = {}, method = 'GET') {
  const r = res();
  await publishHandler({ method, query: { resource: 'brain-draft', ...query }, headers: { cookie: cookies.get(who) || '' } }, r);
  return r.result;
}
async function post(who, body) {
  const r = res();
  await publishHandler({ method: 'POST', query: {}, headers: { cookie: cookies.get(who) || '' }, body }, r);
  return r.result;
}
const U18C = `${CLUB}/u-u18-coach`, SENC = `${CLUB}/u-sen-coach`;
const ORIGINAL_KEYS = ['coachView', 'draft', 'explanation', 'meta', 'readiness', 'readinessBundle', 'squad', 'verification'];
const squadUserIds = body => {
  const s = JSON.stringify(body.squad || {});
  return [...new Set((s.match(/u-club-[a-z]+-[a-z0-9-]+/g) || []))].sort();
};
const withBrain = async fn => { process.env.BRAIN_ENABLED = 'true'; try { return await fn(); } finally { delete process.env.BRAIN_ENABLED; } };

test.after(() => { delete process.env.BRAIN_ENABLED; });

// ── Off by default ───────────────────────────────────────────────────────────

test('OFF by default: BRAIN_ENABLED unset → 404 for everyone, and the Brain code is never loaded', async () => {
  await seed();
  assert.equal(process.env.BRAIN_ENABLED, undefined);
  for (const who of [U18C, SENC, `${CLUB}/u-owner`, '']) assert.equal((await draft(who)).code, 404, who || 'anonymous');
  // the gate sits BEFORE the dynamic import of the Brain provider
  let loaded = 0;
  const r = res();
  await brainDraftHandler({ method: 'GET', query: {}, headers: { cookie: cookies.get(U18C) } }, r, { loadBrain: async () => { loaded++; return {}; } });
  assert.equal(r.result.code, 404);
  assert.equal(loaded, 0, 'a disabled Brain must not load packages/');
  for (const v of ['false', '', '0', 'yes']) {
    process.env.BRAIN_ENABLED = v;
    assert.equal((await draft(U18C)).code, 404, `BRAIN_ENABLED=${JSON.stringify(v)}`);
  }
  delete process.env.BRAIN_ENABLED;
});

test('the club flag is the second gate: Brain on globally but off for this club → 404 (after auth)', async () => {
  await seed({ brainFlagFor: [] });
  await withBrain(async () => {
    assert.equal((await draft(U18C)).code, 404);
    assert.equal((await draft('')).code, 401, 'auth is still checked first');
  });
});

test('method and preflight: OPTIONS 200, POST/PUT/DELETE 405 — GET only', async () => {
  await seed();
  await withBrain(async () => {
    assert.equal((await draft(U18C, {}, 'OPTIONS')).code, 200);
    for (const m of ['POST', 'PUT', 'DELETE']) assert.equal((await draft(U18C, {}, m)).code, 405, m);
  });
});

test('permission is PERM.AI_INTELLIGENCE: players and managers are refused, coaches are allowed', async () => {
  await seed();
  await withBrain(async () => {
    assert.equal((await draft(`${CLUB}/u-${CLUB}-u18-1`)).code, 403, 'player');
    assert.equal((await draft(`${CLUB}/u-manager`)).code, 403, 'manager profile has no AI_INTELLIGENCE');
    assert.equal((await draft(U18C)).code, 200, 'coach profile has AI_INTELLIGENCE');
  });
});

test('sessionId is validated exactly as before', async () => {
  await seed();
  await withBrain(async () => {
    for (const bad of ['', 'x'.repeat(81), 'has space', 'a/b', '../etc']) assert.equal((await draft(U18C, { sessionId: bad })).code, 400, JSON.stringify(bad));
    assert.equal((await draft(U18C, { sessionId: 'fx-u18' })).code, 200);
  });
});

// ── Group and tenant scoping ─────────────────────────────────────────────────

test('U18 coach: the draft uses U18 players, the U18 fixture and U18 availability only', async () => {
  await seed();
  const r = await withBrain(() => draft(U18C));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.deepEqual(Object.keys(r.body).sort(), ORIGINAL_KEYS, 'the original response contract');
  assert.equal(r.body.meta.fixtureId, 'fx-u18', 'next upcoming U18 fixture — not the past one, not a Seniors one');
  // 7 ACTIVE U18 players (the archived one is not a player at all): 4 placeable, 3 excluded
  assert.equal(r.body.meta.playerCount, 4, 'canonical 9 + jersey 10 + Lock + canonical 4 reach the Brain');
  assert.equal(r.body.meta.excludedPlayers, 3, 'TBC, Prop and Back row are excluded — a count, not a failure');
  assert.equal(r.body.meta.readOnly, true);
  for (const id of squadUserIds(r.body)) assert.match(id, /^u-club-stg-u18-[1237]$/, `non-candidate in the U18 draft: ${id}`);
  // availability: the group-scoped dated record, one answer per player by recency
  const { squadLoader } = await buildBrainProviders({ coachId: 'u-u18-coach', teamId: CLUB, groupId: U18 });
  assert.deepEqual(squadLoader.getAvailabilityResponses(), {
    [`u-${CLUB}-u18-1`]: { response: 'available' },      // the newer answer beat the stale duplicate
    [`u-${CLUB}-u18-2`]: { response: 'unavailable' },
  });
  assert.deepEqual(squadLoader.getActivePlayers().map(p => p.userId).sort(), [1, 2, 3, 7].map(n => `u-${CLUB}-u18-${n}`));
  assert.deepEqual(Object.keys(squadLoader.getActivePlayers()[0]).sort(), ['displayName', 'id', 'position', 'userId'], 'only the four Brain fields leave Core');
});

test('Seniors coach: the draft uses Seniors players and the Seniors fixture only', async () => {
  await seed();
  const r = await withBrain(() => draft(SENC));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.meta.fixtureId, 'fx-sen');
  assert.equal(r.body.meta.playerCount, 1, 'only the canonical "1 — Loosehead Prop" is placeable');
  assert.equal(r.body.meta.excludedPlayers, 2, 'Front row and Back three are excluded');
  for (const id of squadUserIds(r.body)) assert.match(id, /^u-club-stg-sen1$/, `non-candidate in the Seniors draft: ${id}`);
  const { squadLoader } = await buildBrainProviders({ coachId: 'u-sen-coach', teamId: CLUB, groupId: SEN, sessionId: 'fx-u18' });
  assert.deepEqual(Object.keys(squadLoader.getAvailabilityResponses()), [`u-${CLUB}-sen1`], 'the Seniors record for that id — never the U18 one');
});

test('group authorisation: another group, a forged group and an unscoped multi-group caller are refused', async () => {
  await seed();
  await withBrain(async () => {
    assert.equal((await draft(U18C, { group: SEN })).code, 403, 'U18 coach asking for Seniors');
    assert.equal((await draft(U18C, { group: 'grp-forged' })).code, 404, 'unknown/foreign group');
    assert.equal((await draft(U18C, { group: U18 })).code, 200, 'own group by name');
    const owner = await draft(`${CLUB}/u-owner`);
    assert.equal(owner.code, 400, 'a caller operating several groups must choose one');
    assert.equal((await draft(`${CLUB}/u-owner`, { group: U18 })).code, 200);
  });
});

test('no cross-club leak: another club is gated by its own flag and sees only its own players', async () => {
  await seed({ brainFlagFor: [CLUB] });
  const other = `${OTHER}/u-u18-coach`;   // same user id, other club
  await withBrain(async () => {
    assert.equal((await draft(other)).code, 404, 'the other club has no Brain flag');
  });
  await seed({ brainFlagFor: [CLUB, OTHER] });
  const r = await withBrain(() => draft(other));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.meta.fixtureId, 'fx-o');
  assert.equal(r.body.meta.playerCount, 1);
  assert.equal(r.body.meta.excludedPlayers, 1, 'Outside back is excluded');
  assert.ok(!JSON.stringify(r.body).includes(CLUB), 'nothing of the staging club in the other club\'s draft');
});

test('coach memories: the U18 coach\'s real memories reach the Brain; a reused coach id in another club gets none', async () => {
  await seed({ brainFlagFor: [CLUB, OTHER] });
  // M6 + M7 through the real publish path, as the U18 coach of the staging club
  assert.equal((await post(U18C, { type: 'sessions', data: [{ id: 's1', title: 'S1', type: 'Training' }] })).code, 200);
  assert.equal((await post(U18C, { type: 'squad', data: { published: true, fixtureId: 'fx-u18', sideId: 't-u18a', formationNames: { 1: 'A Sentinel' }, benchPlayers: ['B Sentinel'] } })).code, 200);
  // refused cross-group publish leaves no trace
  assert.notEqual((await post(U18C, { type: 'squad', data: { published: true, fixtureId: 'fx-sen', sideId: 't-prem', formationNames: { 1: 'X' }, benchPlayers: [] } })).code, 200);

  const mine = await buildBrainProviders({ coachId: 'u-u18-coach', teamId: CLUB, groupId: U18 });
  const memories = mine.squadLoader.getCoachMemories();
  assert.deepEqual(memories.map(m => m.type).sort(), ['selection-preference', 'training-preference']);
  for (const m of memories) {
    assert.equal(m.coachId, 'u-u18-coach'); assert.equal(m.clubId, CLUB);
    assert.deepEqual(m.ontologyLinks, [{ kind: 'club', id: CLUB }, { kind: 'team', id: U18 }]);
    assert.ok(!JSON.stringify(m).includes('Sentinel'), 'no player names in a memory');
  }
  const r = await withBrain(() => draft(U18C));
  assert.equal(r.code, 200);
  assert.equal(r.body.meta.dnaApplied, true, 'memories reached the Brain inputs');

  const reused = await buildBrainProviders({ coachId: 'u-u18-coach', teamId: OTHER, groupId: SEN });
  assert.deepEqual([...reused.squadLoader.getCoachMemories()], [], 'same coach id, other club → no memories');
  const o = await withBrain(() => draft(`${OTHER}/u-u18-coach`));
  assert.equal(o.body.meta.dnaApplied, false);
});

test('privacy: no roster PII and no account emails in the draft response', async () => {
  await seed();
  const r = await withBrain(() => draft(U18C));
  const s = JSON.stringify(r.body);
  for (const needle of ['roster-email', '@sentinel.test', 'SENTINEL-PHONE', '2008-01-01']) assert.ok(!s.includes(needle), `"${needle}" leaked into the draft`);
});

test('no fixture for the group → 200 with reason "no-fixture" (contract preserved)', async () => {
  await seed();
  kv.set(`app:club:${CLUB}`, JSON.stringify({ fixtures: FIXTURES.filter(f => f.groupId !== U18 || f.id === 'fx-u18-past') }));
  const r = await withBrain(() => draft(U18C));
  assert.equal(r.code, 200);
  assert.equal(r.body.reason, 'no-fixture');
  assert.equal(r.body.squad, null);
  assert.equal(r.body.meta.fixtureId, null);
  assert.deepEqual(Object.keys(r.body).sort(), [...ORIGINAL_KEYS, 'reason'].sort());
});

test('a provider failure is a 500 that leaks no internals', async () => {
  await seed();
  await withBrain(async () => {
    const r = res();
    const errors = []; const orig = console.error; console.error = (...a) => errors.push(a.join(' '));
    try {
      await brainDraftHandler({ method: 'GET', query: {}, headers: { cookie: cookies.get(U18C) } }, r,
        { loadBrain: async () => ({ buildBrainDraft: async () => { throw new Error('secret internal detail'); } }) });
    } finally { console.error = orig; }
    assert.equal(r.result.code, 500);
    assert.deepEqual(r.result.body, { error: 'Brain draft failed' });
    assert.ok(errors.some(e => e.includes('secret internal detail')), 'logged server-side instead');
  });
});

test('the provider refuses to run without an authorised club, coach and group', async () => {
  for (const bad of [{}, { teamId: CLUB, coachId: 'x' }, { teamId: CLUB, groupId: U18 }, { coachId: 'x', groupId: U18 }]) {
    await assert.rejects(() => buildBrainProviders(bad), /authorised club, coach and playing group/);
  }
});

// ── Positions: lossless handling, exclusion, never a whole-draft failure ─────

test('brainPositionFor: canonical labels become their own jersey number; nothing else is ever re-mapped', async () => {
  const { brainPositionFor } = await import('../api/_brainProviders.js');
  const table = {
    // canonical "N — Label" → N, for every jersey
    '1 — Loosehead Prop': '1', '4 — Lock': '4', '9 — Scrum-half': '9', '10 — Fly-half': '10', '15 — Fullback': '15',
    // already Brain-recognised → passed through unchanged
    '9': '9', '12': '12', 'Lock': 'Lock', 'Scrum-half': 'Scrum-half', 'Flanker': 'Flanker', 'Second row': 'Second row',
    // the Brain cannot place these → null (excluded), never guessed
    'TBC': null, 'Prop': null, 'Front row': null, 'Back row': null, 'Back three': null, 'Outside back': null,
    'SUB — Squad player': null, '': null, '16 — Replacement': null, '0 — Nothing': null,
  };
  for (const [core, expected] of Object.entries(table)) assert.equal(brainPositionFor(core), expected, JSON.stringify(core));
  // the label is never read: a canonical number with a contradicting label still yields its number
  assert.equal(brainPositionFor('9 — Prop'), '9');
  for (const bad of [undefined, null, 9, {}, ['9']]) assert.equal(brainPositionFor(bad), null);
});

test('one unsupported player never fails the draft: supported players reach the Brain, the rest are only counted', async () => {
  // every U18 player TBC except one canonical — still a 200 draft, never a 500
  const onlyOne = { ...REAL_POSITIONS };
  for (const n of [2, 3, 4, 5, 6, 7]) onlyOne[`u-${CLUB}-u18-${n}`] = 'TBC';
  await seed({ positions: onlyOne });
  const r = await withBrain(() => draft(U18C));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.meta.playerCount, 1);
  assert.equal(r.body.meta.excludedPlayers, 6);
  assert.deepEqual(squadUserIds(r.body), [`u-${CLUB}-u18-1`]);
  // and a group in which NO player can be placed is still a valid 200 draft
  const none = { ...REAL_POSITIONS };
  for (const n of [1, 2, 3, 4, 5, 6, 7]) none[`u-${CLUB}-u18-${n}`] = 'TBC';
  await seed({ positions: none });
  const empty = await withBrain(() => draft(U18C));
  assert.equal(empty.code, 200, JSON.stringify(empty.body));
  assert.equal(empty.body.meta.playerCount, 0);
  assert.equal(empty.body.meta.excludedPlayers, 7);
  assert.deepEqual(squadUserIds(empty.body), []);
});

test('excluded players are not silently re-mapped and the exclusion metadata carries no PII', async () => {
  await seed();
  const { squadLoader } = await buildBrainProviders({ coachId: 'u-u18-coach', teamId: CLUB, groupId: U18 });
  assert.deepEqual(Object.fromEntries(squadLoader.getActivePlayers().map(p => [p.userId, p.position])), {
    [`u-${CLUB}-u18-1`]: '9', [`u-${CLUB}-u18-2`]: '10', [`u-${CLUB}-u18-3`]: 'Lock', [`u-${CLUB}-u18-7`]: '4',
  });
  const r = await withBrain(() => draft(U18C));
  assert.equal(typeof r.body.meta.excludedPlayers, 'number');
  const meta = JSON.stringify(r.body.meta);
  for (const n of [4, 5, 6]) assert.ok(!meta.includes(`u18-${n}`), 'no excluded player id in meta');
  assert.ok(!/Player u-|TBC|Prop|Back row|@/.test(meta), `meta must carry a count only: ${meta}`);
  // readiness still covers the WHOLE active group (exclusion applies to candidates only)
  for (const n of [4, 5, 6]) assert.ok(JSON.stringify(r.body.readinessBundle).includes(`u-${CLUB}-u18-${n}`), `readiness keeps u18-${n}`);
});

test('the all-jersey-number dataset still drafts every player with nothing excluded', async () => {
  await seed({ positions: JERSEY_POSITIONS });
  const r = await withBrain(() => draft(U18C));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.meta.playerCount, 7);
  assert.equal(r.body.meta.excludedPlayers, 0);
  const s = await withBrain(() => draft(SENC));
  assert.equal(s.body.meta.playerCount, 3);
  assert.equal(s.body.meta.excludedPlayers, 0);
});

// ── Ordinary publish untouched; wiring shape ─────────────────────────────────

test('ordinary publish is unchanged, and the Brain route is only ever loaded dynamically', async () => {
  await seed();
  const r = res();
  await publishHandler({ method: 'GET', query: { type: 'sessions' }, headers: { cookie: cookies.get(U18C) } }, r);
  assert.equal(r.result.code, 200);
  const src = fs.readFileSync(new URL('../api/publish.js', import.meta.url), 'utf8');
  assert.match(src, /=== 'brain-draft'\) return \(await import\('\.\/_brainDraftRoute\.js'\)\)\.brainDraftHandler\(req, res\)/);
  assert.ok(!/^import .*_brainDraftRoute|^import .*_brainProviders|^import .*packages\//m.test(src), 'publish.js never imports the Brain statically');
  const route = fs.readFileSync(new URL('../api/_brainDraftRoute.js', import.meta.url), 'utf8');
  assert.ok(!/^import .*(_brainProviders|packages\/)/m.test(route), 'the route imports the Brain only after its gates');
});
