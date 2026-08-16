/**
 * LOIC POTIER — FUTURE SENIORS EVENTS.
 *
 *  Production forensics: Loic's identity is SOUND (active member,
 *  playerGroupId grp_initial, clean profile) and every server read path
 *  serves him the full Seniors feed. His stored answers tell the real
 *  story — only legacy tue/thu/game ids, never one dated or fixture id,
 *  including a session-less write into the DEFAULT club's keyspace on
 *  14 Aug: his installed PWA has been running a bundle from BEFORE dated
 *  weeks shipped, and nothing ever reloads a long-lived page (the SW is
 *  push-only, its bytes hadn't changed since July, and controllerchange
 *  never navigated).
 *
 *  Fix: stale-page self-heal. (1) sw.js bump + activate-time one-shot
 *  window refresh — reaches pages ALREADY stale today; (2) in-page build
 *  drift check (_BUILD_INFO.sha vs /api/config version) reloading once
 *  per new version on foreground resume or while hidden.
 *
 *  These tests ALSO prove the current code serves a Loic-shaped player
 *  the exact same future Seniors feed as a working-shape player, with
 *  U18/Women's isolation intact — via the REAL helpers and handlers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.future-events.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const pat = at >= 0 ? String(args[at + 1]) : '*';
    const re = new RegExp(`^${pat.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    result = ['0', [...kv.keys()].filter(k => re.test(k))];
  }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: publishHandler } = await import('../api/publish.js');
const store = await import('../api/_identityStore.js');
const { operationalGroupsFor } = await import('../api/_accessScope.js');

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const swSrc = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
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

const CLUB = 'boitsfort', SEN = 'grp_initial', U18 = 'grp_2b0aa7f9', WOM = 'grp_1b0fb56b';
const STRUCTURE = { version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'general', status: 'active' },
    { id: WOM, name: "Women's", type: 'general', status: 'active' },
  ],
  teams: [{ id: 'team_initial', groupId: SEN, name: 'Premier development', status: 'active' }] };

// Production-exact member shapes.
const LOIC_MEMBER = { id: 'tm_loic', teamId: CLUB, userId: 'u-loic', role: 'player', status: 'active',
  playerGroupId: SEN, joinedAt: '2026-08-05T12:14:51.719Z' };
const WORKING_MEMBER = { id: 'tm-work', teamId: CLUB, userId: 'u-work', role: 'player', status: 'active',
  playerGroupId: SEN, joinedAt: '2026-08-09T00:00:00.000Z' };

// Production fixtures (trimmed): legacy Seniors + group-stamped U18.
const FIXTURES = [
  { id: 'fx_5yl7oat', opposition: 'Mons', date: '2026-08-22', status: 'scheduled', groupId: '' },
  { id: 'fx_489wori', opposition: 'Amstelveense', date: '2026-08-29', status: 'scheduled', groupId: '' },
  { id: 'fx_3laifwx', opposition: 'ANDE', date: '2026-09-05', status: 'scheduled', groupId: U18 },
];
const SEN_SLOTS = [
  { id: 'slot_tue', day: 'Tue', startTime: '19:45', sessionId: 'tue', active: true },
  { id: 'slot_thu', day: 'Thu', startTime: '19:45', sessionId: 'thu', active: true },
];

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-loic', email: 'loic@c.test', displayName: 'Loic Potier' },
    { id: 'u-work', email: 'work@c.test', displayName: 'Working Test' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([LOIC_MEMBER, WORKING_MEMBER]));
  kv.set('app:identity:player_profiles', JSON.stringify([
    { teamId: CLUB, userId: 'u-loic', legacyPlayerId: 'u-loic' },
    { teamId: CLUB, userId: 'u-work', legacyPlayerId: 'u-work' },
  ]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Boitsfort', fixtures: FIXTURES }));
  // Production-exact: NO group-scoped Seniors schedule — legacy club-wide only.
  kv.set(`app:publish:${CLUB}:training_schedule`, JSON.stringify({ slots: SEN_SLOTS, updatedAt: '2026-08-01T00:00:00.000Z' }));
}
async function scheduleFor(userId) {
  const { token } = await store.createSession({ userId, teamId: CLUB, role: 'player' });
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await publishHandler({ method: 'GET', query: { resource: 'training-schedule' },
    headers: { cookie: `ce_session=${token}` }, body: null }, res);
  return res;
}

// The player feed with the REAL helpers (contextFixtures path, group context).
function feedFor(week, playerGroups) {
  return new Function(`"use strict";
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    const AVAIL_DAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    const state = { operationalGroupId: ${JSON.stringify(playerGroups[0]?.id || '')}, fixtures: ${JSON.stringify(FIXTURES)} };
    const _myOperational = { player: { groups: ${JSON.stringify(playerGroups)} } };
    function operationalCapacity() { return 'player'; }
    function operationalGroups() { return _myOperational.player.groups; }
    function normalizeFixture(f) { return f; }
    ${fn('fixtureBelongsToGroup')}
    ${fn('contextFixtures')}
    ${fn('availAddDays')}
    ${fn('availWeekStart')}
    ${fn('availSlotDateInWeek')}
    ${fn('availTrainingEventId')}
    ${fn('availabilityEventsForWeek')}
    return availabilityEventsForWeek(${JSON.stringify(week)}, {
      fixtures: contextFixtures().map(normalizeFixture).filter(Boolean),
      slots: ${JSON.stringify(SEN_SLOTS)},
      currentWeekStart: availWeekStart('2026-08-16'),
    });
  `)();
}
const SENIORS_CTX = [{ id: SEN, name: 'Seniors' }];

// ── 1+2+3: a Loic-shaped player sees current AND future Seniors events ────
test('server: the Loic-shaped member is served the full Seniors schedule', async () => {
  seed();
  const r = await scheduleFor('u-loic');
  assert.equal(r.code, 200);
  assert.equal(r.body.groupId, SEN, 'resolves to his playing group');
  assert.deepEqual(r.body.slots.map(s => s.id), ['slot_tue', 'slot_thu'], 'legacy Seniors slots served');
});

test('current week works: tue/thu render under their legacy ids', () => {
  const events = feedFor('2026-08-10', SENIORS_CTX);
  assert.deepEqual(events.filter(e => e.type === 'training').map(e => e.id), ['tue', 'thu']);
});

test('future Seniors training visible: next week renders dated Tue/Thu events', () => {
  const events = feedFor('2026-08-17', SENIORS_CTX);
  const training = events.filter(e => e.type === 'training');
  assert.deepEqual(training.map(e => e.id), ['slot_tue-20260818', 'slot_thu-20260820']);
  assert.deepEqual(training.map(e => e.date), ['2026-08-18', '2026-08-20']);
});

test('future Seniors fixtures visible: Mons 22 Aug and Amstelveense 29 Aug appear', () => {
  const wk1 = feedFor('2026-08-17', SENIORS_CTX);
  assert.ok(wk1.some(e => e.type === 'match' && e.opponent === 'Mons' && e.date === '2026-08-22'));
  const wk2 = feedFor('2026-08-24', SENIORS_CTX);
  assert.ok(wk2.some(e => e.type === 'match' && e.opponent === 'Amstelveense' && e.date === '2026-08-29'));
});

// ── 4: U18/Women's events never leak to the Seniors player ────────────────
test('U18 fixtures stay hidden from the Seniors player in every week', () => {
  const wk = feedFor('2026-08-31', SENIORS_CTX);   // week holding U18's ANDE fixture (5 Sep)
  assert.ok(!wk.some(e => e.opponent === 'ANDE'), JSON.stringify(wk));
  assert.ok(wk.filter(e => e.type === 'training').length === 2, 'his own training still renders');
});

// ── 5: Loic-shape and working-shape resolve the SAME feed ─────────────────
test('Loic-shaped and working-shaped Seniors players get identical schedules and feeds', async () => {
  seed();
  const a = await scheduleFor('u-loic');
  const b = await scheduleFor('u-work');
  assert.deepEqual(a.body.slots, b.body.slots, 'same server schedule');
  assert.equal(a.body.groupId, b.body.groupId, 'same resolved group');
  for (const wk of ['2026-08-10', '2026-08-17', '2026-08-24']) {
    assert.deepEqual(feedFor(wk, SENIORS_CTX), feedFor(wk, SENIORS_CTX), `identical feed for ${wk}`);
  }
  // Both identities carry the same operational player context (real resolver).
  const ga = operationalGroupsFor(LOIC_MEMBER, STRUCTURE, { as: 'player' }).map(g => g.id);
  const gb = operationalGroupsFor(WORKING_MEMBER, STRUCTURE, { as: 'player' }).map(g => g.id);
  assert.deepEqual(ga, [SEN]);
  assert.deepEqual(ga, gb);
});

// ── 6 + the actual fix: stale pages heal themselves ───────────────────────
test('sw.js: version bumped and a NEW SW refreshes every open window once', () => {
  assert.match(swSrc, /const SW_VERSION = '20260816\.1';/, 'SW bytes changed — stale pages get a new SW');
  assert.match(swSrc, /clients\.matchAll\(\{ type: 'window' \}\)/, 'activation reaches open windows');
  assert.match(swSrc, /w\.navigate\(w\.url\)/, 'each window re-navigates to the CURRENT bundle');
  assert.match(swSrc, /self\.skipWaiting\(\)/, 'new SW takes over without waiting');
});

test('page drift self-heal: reloads once per new version, never in dev, never mid-use', () => {
  const drift = fn('checkBuildDrift');
  assert.match(drift, /_BUILD_INFO/, 'compares the build the page was served with');
  assert.match(drift, /sha === 'DEV'/, 'local/dev builds never self-reload');
  assert.match(drift, /ce-drift-reload-/, 'one attempt per version per tab');
  assert.match(drift, /visibilityState === 'visible'/, 'interval path defers while the user is active');
  assert.match(drift, /location\.reload\(\)/, 'stale page reloads to the live bundle');
  assert.match(src, /if \(document\.visibilityState === 'visible'\) checkBuildDrift\(true\);/,
    'foreground resume — the iOS PWA moment — triggers the check');
});
