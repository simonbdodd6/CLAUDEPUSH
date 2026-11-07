/**
 * PUSH SUBSCRIPTION INTEGRITY — api/_lib.js and every writer of the list.
 *
 * Every club's push subscriptions live in ONE list that writers read, filter
 * and write back whole. Two defects made it fragile (verified open on
 * production core-deploy-111 and on the feature branch before this change):
 *
 *   1. load() answered [] when storage FAILED, exactly as for an empty list,
 *      so a writer that read during a partial outage (the GET refused, the
 *      SET accepted) saved its filtered "[]" over every club's devices — the
 *      same class as the availability wipe of 2026-10-14.
 *   2. Every writer was an unserialised read-modify-write, so a device
 *      registering while a send pruned a dead endpoint lost its row.
 *
 * Nine writers were found (the brief listed seven): subscribe POST, DELETE and
 * purge; the prunes in cron (reminder + schedules), push, publish and chat;
 * and the identity store's account-deletion cleanup.
 *
 * The contract pinned here:
 *   load()  [] ONLY for a genuinely empty list; a failed read THROWS the fixed
 *           STORAGE_UNAVAILABLE error; the legacy key is consulted only when
 *           the primary is ABSENT — never after a primary FAILURE.
 *   save()  fenced behind the subscriptions lock: refused outside it.
 *   subscribe POST / DELETE / purge: read → decide → write under the lock; a
 *           failed read, a busy lock, or a session that cannot be resolved
 *           because storage is down → 503, and NOTHING is written.
 *   send paths: the list is read once for the send; if that read fails → 503,
 *           nothing sent, nothing logged as sent. Dead endpoints are pruned
 *           from a FRESH read under the lock (a device registered since the
 *           send is kept); a failed prune read or a busy lock skips the
 *           prune, logs, and never fails the send that already happened.
 *   deletion cleanup: serialised with the other writers; still best-effort.
 *
 * Every proof drives the REAL handlers and the REAL identity store against an
 * in-memory Upstash stand-in whose failures are injected per key and per
 * call. web-push delivery is replaced by a recorder. Nothing touches a real
 * service.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import webpush from 'web-push';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.subs-integrity.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.CRON_SECRET              = 'cron-secret';
delete process.env.VERCEL; delete process.env.VERCEL_ENV; delete process.env.DEV_LOGIN;
const VAPID = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY  = VAPID.publicKey;
process.env.VAPID_PRIVATE_KEY = VAPID.privateKey;

const SUBS_KEY = 'app:subscriptions';
const LOCK_KEY = 'app:lock:push:subscriptions';

// ── Upstash stand-in ────────────────────────────────────────────────────────
// Every command computes its answer at CALL time and may answer after a delay,
// so concurrent writers genuinely interleave between their read and their
// write (the window a lost update needs). SET honours NX. `plan.getPlan` holds,
// per key, a queue of 'ok' | 'fail' consumed one per GET: a 'fail' answers as
// Upstash did in the 2026-10-12 outage (HTTP 401, no result). `plan.down`
// fails every command.
const kv = new Map(), lists = new Map();
const plan = { down: false, getPlan: new Map(), delayMs: 0 };
let subsSets = 0;
const commands = [];
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const outage = () => ({ ok: false, status: 401, json: async () => ({ error: 'WRONGPASS invalid or missing auth token' }) });
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  commands.push([c, a[0]]);
  let reply;
  if (plan.down) reply = outage();
  else {
    let r = null;
    if (c === 'GET') {
      const q = plan.getPlan.get(a[0]);
      if (q?.length && q.shift() === 'fail') reply = outage();
      else r = kv.has(a[0]) ? kv.get(a[0]) : null;
    }
    if (c === 'SET') {
      const nx = a.slice(2).map(x => String(x).toUpperCase()).includes('NX');
      if (nx && kv.has(a[0])) r = null; else { if (a[0] === SUBS_KEY) subsSets += 1; kv.set(a[0], a[1]); r = 'OK'; }
    }
    if (c === 'DEL') { kv.delete(a[0]); lists.delete(a[0]); r = 1; }
    if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
    if (c === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); r = l.length; }
    if (c === 'LRANGE') { const l = lists.get(a[0]) || []; const e = Number(a[2]) < 0 ? l.length + Number(a[2]) : Number(a[2]); r = l.slice(Number(a[1]), e + 1); }
    if (c === 'LTRIM' || c === 'EXPIRE') r = 1;
    if (!reply) reply = { ok: true, json: async () => ({ result: r }) };
  }
  if (plan.delayMs) await sleep(Math.random() * plan.delayMs);
  return reply;
};
const failNextSubsGets = (...steps) => plan.getPlan.set(SUBS_KEY, [...steps]);
const subsStored = () => JSON.parse(kv.get(SUBS_KEY) || 'null');
const endpointsStored = () => (subsStored() || []).map(s => s.subscription.endpoint).sort();
const commandsSince = mark => commands.slice(mark);

// web-push recorder: every send is recorded; endpoints in `reject410` are
// answered as a push service does for a device that no longer exists.
const sent = [];
const reject410 = new Set();
webpush.sendNotification = async subscription => {
  sent.push(subscription.endpoint);
  if (reject410.has(subscription.endpoint)) { const e = new Error('Gone'); e.statusCode = 410; throw e; }
  return { statusCode: 201 };
};
const warns = [];
console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
console.error = () => {};

const store = await import('../api/_identityStore.js');
const lib   = await import('../api/_lib.js');
const { kvGet, kvSet } = await import('../api/_kv.js');
const { legacyKey } = await import('../api/_keys.js');
const { default: subscribeHandler } = await import('../api/subscribe.js');
const { default: cronHandler }      = await import('../api/cron.js');
const { default: pushHandler }      = await import('../api/push.js');
const { default: publishHandler }   = await import('../api/publish.js');
const { default: chatHandler }      = await import('../api/chat.js');
const { default: identityHandler }  = await import('../api/identity.js');
const { SESSION_COOKIE, createSession } = store;
const LEGACY_KEY = legacyKey('subscriptions');

// ── Fixtures ────────────────────────────────────────────────────────────────
const CLUB = 'boitsfort', SEN = 'grp_initial';
const MEMBERS = [
  { id: 'm-simon', teamId: CLUB, userId: 'u-simon', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
  { id: 'm-sen1',  teamId: CLUB, userId: 'u-sen1',  role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-sen2',  teamId: CLUB, userId: 'u-sen2',  role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-sen3',  teamId: CLUB, userId: 'u-sen3',  role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-sen4',  teamId: CLUB, userId: 'u-sen4',  role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-sen5',  teamId: CLUB, userId: 'u-sen5',  role: 'player', status: 'active', playerGroupId: SEN },
];
const cookies = new Map();
function resetWorld() {
  kv.clear(); lists.clear(); cookies.clear(); plan.getPlan.clear(); plan.down = false; plan.delayMs = 0;
  subsSets = 0; sent.length = 0; reject410.clear(); warns.length = 0; delete process.env.DEV_LOGIN;
}
async function seedClub() {
  resetWorld();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:player_profiles', JSON.stringify(MEMBERS.filter(m => m.role === 'player')
    .map(m => ({ teamId: CLUB, userId: m.userId, legacyPlayerId: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1,
    groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' }],
    teams: [{ id: 'team_initial', groupId: SEN, name: 'Seniors', status: 'active' }] }));
  kv.set('app:chat:convs', JSON.stringify([
    { id: 'squad', name: 'Squad', type: 'GROUP', pinned: true, createdAt: 1 },
    { id: 'coaching', name: 'Coaching Team', type: 'GROUP', pinned: true, createdAt: 1 },
    { id: 'announce', name: 'Announcements', type: 'ANNOUNCEMENT', pinned: true, createdAt: 1 },
  ]));
  for (const m of MEMBERS) {
    const s = await createSession({ userId: m.userId, teamId: CLUB, role: m.role });
    cookies.set(m.userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
  }
  subsSets = 0; commands.length = 0;
}
const device = (userId, endpoint) => ({ userId, playerId: userId, legacyPlayerId: '', label: userId, role: 'player',
  subscription: { endpoint, keys: { p256dh: VAPID.publicKey, auth: 'AAAAAAAAAAAAAAAAAAAAAA' } } });
const seedSubs = rows => { kv.set(SUBS_KEY, JSON.stringify(rows)); subsSets = 0; };

function response() {
  const r = { statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    writeHead(c) { this.statusCode = c; return this; },
    end(b) { if (b !== undefined) { try { this.body = JSON.parse(b); } catch { this.body = b; } } return this; } };
  return r;
}
async function subscribe(method, { as = null, body, query = {} } = {}) {
  const r = response();
  await subscribeHandler({ method, query, headers: as ? { cookie: cookies.get(as) } : {}, body }, r);
  return r;
}
const sub = endpoint => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } });
async function cron(query) {
  const r = response();
  await cronHandler({ method: 'POST', query, headers: { authorization: 'Bearer cron-secret' }, body: {} }, r);
  return r;
}
async function push(as, body) {
  const r = response();
  await pushHandler({ method: 'POST', query: {}, headers: { cookie: cookies.get(as) }, body }, r);
  return r;
}
async function publish(as, query, body = {}) {
  const r = response();
  await publishHandler({ method: 'POST', query, headers: { cookie: cookies.get(as) }, body }, r);
  return r;
}
async function chat(as, body) {
  const r = response();
  await chatHandler({ method: 'POST', url: '/api/chat', headers: { cookie: cookies.get(as) }, body, on() {} }, r);
  return r;
}

// ═══ 1. load(): empty vs unavailable vs legacy ══════════════════════════════

test('load(): a genuinely empty store answers []', async () => {
  resetWorld();
  assert.deepEqual(await lib.load(), []);
});

test('load(): the legacy key is the fallback when the primary key is ABSENT', async () => {
  resetWorld();
  kv.set(LEGACY_KEY, JSON.stringify([device('u-old', 'ep-legacy')]));
  const rows = await lib.load();
  assert.equal(rows.length, 1); assert.equal(rows[0].subscription.endpoint, 'ep-legacy');
  kv.set(SUBS_KEY, JSON.stringify([device('u-new', 'ep-new')]));
  assert.equal((await lib.load())[0].subscription.endpoint, 'ep-new', 'a present primary list wins over the legacy one');
});

test('load(): a FAILED primary read throws STORAGE_UNAVAILABLE at once — the legacy list is never consulted', async () => {
  resetWorld();
  kv.set(LEGACY_KEY, JSON.stringify([device('u-old', 'ep-legacy')]));
  failNextSubsGets('fail');
  const mark = commands.length;
  await assert.rejects(lib.load(), e => e.code === 'STORAGE_UNAVAILABLE' && e.status === 503);
  assert.ok(!commandsSince(mark).some(([c, k]) => c === 'GET' && k === LEGACY_KEY), 'no fallback to the legacy key after a primary failure');
});

test('load(): primary absent and the legacy read fails → throws, not []', async () => {
  resetWorld();
  plan.getPlan.set(LEGACY_KEY, ['fail']);
  await assert.rejects(lib.load(), e => e.code === 'STORAGE_UNAVAILABLE');
});

test('load(): a full outage throws; nothing distinguishes it from empty by accident', async () => {
  resetWorld(); plan.down = true;
  await assert.rejects(lib.load(), e => e.code === 'STORAGE_UNAVAILABLE');
});

// ═══ 2. save() is fenced ════════════════════════════════════════════════════

test('save() outside the subscriptions lock is refused and writes nothing; under it, it writes', async () => {
  resetWorld();
  await assert.rejects(lib.save([]), e => e.code === 'write_outside_lock' && e.status === 500);
  assert.equal(subsSets, 0);
  await lib.withSubscriptionsLock(() => lib.save([device('u-a', 'ep-a')]));
  assert.deepEqual(endpointsStored(), ['ep-a']);
  assert.ok(!kv.has(LOCK_KEY), 'the lock is released afterwards');
});

// ═══ 3. subscribe POST / DELETE / GET during failures ═══════════════════════

test('POST: the GET fails while SET works → 503 STORAGE_UNAVAILABLE, no SET, stored list unchanged (the wipe)', async () => {
  await seedClub();
  seedSubs([device('u-sen1', 'ep-1'), device('u-sen2', 'ep-2')]);
  const before = kv.get(SUBS_KEY);
  const sessionsBefore = kv.get('app:identity:sessions');
  failNextSubsGets('fail');
  const r = await subscribe('POST', { as: 'u-sen3', body: { subscription: sub('ep-3') } });
  assert.equal(r.statusCode, 503, JSON.stringify(r.body));
  assert.equal(r.body.code, 'STORAGE_UNAVAILABLE');
  assert.equal(subsSets, 0, 'no SET of the subscription list');
  assert.equal(kv.get(SUBS_KEY), before, 'the two devices are still there');
  assert.equal(kv.get('app:identity:sessions'), sessionsBefore, 'no session side effect');
  assert.ok(!Object.keys(r.headers).some(h => /set-cookie/i.test(h)), 'no cookie is set or cleared');
  assert.ok(!kv.has(LOCK_KEY), 'the lock is released');
});

test('POST during a FULL outage → 503, not a false 401, and nothing written', async () => {
  await seedClub();
  seedSubs([device('u-sen1', 'ep-1')]);
  plan.down = true;
  const r = await subscribe('POST', { as: 'u-sen2', body: { subscription: sub('ep-2') } });
  assert.equal(r.statusCode, 503, JSON.stringify(r.body));
  assert.equal(r.body.code, 'STORAGE_UNAVAILABLE');
  plan.down = false;
  assert.deepEqual(endpointsStored(), ['ep-1']);
  assert.equal(subsSets, 0);
});

test('DELETE: the GET fails → 503, no SET, no empty-list write; and during a full outage → 503, not 401', async () => {
  await seedClub();
  seedSubs([device('u-sen1', 'ep-1'), device('u-sen2', 'ep-2')]);
  failNextSubsGets('fail');
  const r = await subscribe('DELETE', { as: 'u-sen1', body: { endpoint: 'ep-1' } });
  assert.equal(r.statusCode, 503, JSON.stringify(r.body)); assert.equal(r.body.code, 'STORAGE_UNAVAILABLE');
  assert.equal(subsSets, 0); assert.deepEqual(endpointsStored(), ['ep-1', 'ep-2']);
  plan.down = true;
  const r2 = await subscribe('DELETE', { as: 'u-sen1', body: { endpoint: 'ep-1' } });
  plan.down = false;
  assert.equal(r2.statusCode, 503); assert.equal(subsSets, 0); assert.deepEqual(endpointsStored(), ['ep-1', 'ep-2']);
  // Storage back: the same delete now works, and removes only the caller's own row.
  const r3 = await subscribe('DELETE', { as: 'u-sen1', body: { endpoint: 'ep-1' } });
  assert.equal(r3.statusCode, 200); assert.deepEqual(endpointsStored(), ['ep-2']);
});

test('DELETE purge_empty (dev): the GET fails → 503 and nothing written', async () => {
  await seedClub();
  process.env.DEV_LOGIN = 'true';
  seedSubs([{ subscription: { endpoint: 'ep-ownerless' } }, device('u-sen1', 'ep-1')]);
  failNextSubsGets('fail');
  const r = await subscribe('DELETE', { as: 'u-sen1', body: { action: 'purge_empty' } });
  assert.equal(r.statusCode, 503); assert.equal(subsSets, 0); assert.equal(subsStored().length, 2);
  const ok = await subscribe('DELETE', { as: 'u-sen1', body: { action: 'purge_empty' } });
  assert.equal(ok.statusCode, 200); assert.equal(ok.body.purged, 1); assert.deepEqual(endpointsStored(), ['ep-1']);
});

test('GET count: an unreadable list is 503, never "0 devices"', async () => {
  await seedClub();
  seedSubs([device('u-sen1', 'ep-1')]);
  failNextSubsGets('fail');
  const r = await subscribe('GET');
  assert.equal(r.statusCode, 503); assert.equal(r.body.code, 'STORAGE_UNAVAILABLE');
  const ok = await subscribe('GET');
  assert.equal(ok.statusCode, 200); assert.equal(ok.body.count, 1);
});

test('POST while another writer holds the lock for the whole wait → 503 busy, nothing written', async () => {
  await seedClub();
  seedSubs([device('u-sen1', 'ep-1')]);
  kv.set(LOCK_KEY, JSON.stringify('someone-else'));           // a foreign holder that never releases
  const r = await subscribe('POST', { as: 'u-sen2', body: { subscription: sub('ep-2') } });
  assert.equal(r.statusCode, 503, JSON.stringify(r.body)); assert.equal(r.body.code, 'busy');
  assert.equal(subsSets, 0); assert.deepEqual(endpointsStored(), ['ep-1']);
  assert.equal(kv.get(LOCK_KEY), JSON.stringify('someone-else'), 'the foreign lock is not touched');
  kv.delete(LOCK_KEY);
});

// ═══ 4. Concurrency: lost updates ═══════════════════════════════════════════

test('CONTROL: this harness DOES lose updates for unserialised read-modify-write (so a pass below is the lock, not luck)', async () => {
  resetWorld(); plan.delayMs = 4;
  await Promise.all([1, 2, 3, 4, 5, 6].map(async i => {
    const list = (await kvGet(SUBS_KEY)) || [];
    await kvSet(SUBS_KEY, [...list, device(`u-${i}`, `ep-${i}`)]);
  }));
  assert.ok(subsStored().length < 6, `unlocked writers lost rows (kept ${subsStored().length} of 6)`);
});

test('six devices subscribe at once: every accepted subscription is present afterwards', async () => {
  await seedClub(); plan.delayMs = 4;
  const users = ['u-simon', 'u-sen1', 'u-sen2', 'u-sen3', 'u-sen4', 'u-sen5'];
  const results = await Promise.all(users.map(u => subscribe('POST', { as: u, body: { subscription: sub(`ep-${u}`) } })));
  assert.deepEqual(results.map(r => r.statusCode), users.map(() => 201), JSON.stringify(results.map(r => r.body)));
  assert.deepEqual(endpointsStored(), users.map(u => `ep-${u}`).sort());
  assert.ok(!kv.has(LOCK_KEY), 'the lock is free afterwards');
});

test('concurrent POSTs and DELETEs interleaved: the final list is exactly what every accepted request implies', async () => {
  await seedClub(); plan.delayMs = 4;
  seedSubs([device('u-sen1', 'ep-u-sen1'), device('u-sen2', 'ep-u-sen2'), device('u-sen3', 'ep-u-sen3')]);
  const ops = await Promise.all([
    subscribe('DELETE', { as: 'u-sen1', body: { endpoint: 'ep-u-sen1' } }),
    subscribe('POST',   { as: 'u-sen4', body: { subscription: sub('ep-u-sen4') } }),
    subscribe('DELETE', { as: 'u-sen2', body: { endpoint: 'ep-u-sen2' } }),
    subscribe('POST',   { as: 'u-sen5', body: { subscription: sub('ep-u-sen5') } }),
    subscribe('POST',   { as: 'u-sen3', body: { subscription: sub('ep-u-sen3-second') } }),
  ]);
  assert.deepEqual(ops.map(r => r.statusCode), [200, 201, 200, 201, 201], JSON.stringify(ops.map(r => r.body)));
  assert.deepEqual(endpointsStored(), ['ep-u-sen3', 'ep-u-sen3-second', 'ep-u-sen4', 'ep-u-sen5']);
});

// ═══ 5. Pruning helper ══════════════════════════════════════════════════════

test('pruneSubscriptions re-reads under the lock: a device registered since the send is KEPT; nothing saved when nothing is removed', async () => {
  resetWorld();
  seedSubs([device('u-a', 'ep-dead'), device('u-b', 'ep-b')]);
  // The send started from [dead, b]; meanwhile a device registered.
  await lib.withSubscriptionsLock(() => lib.save([device('u-a', 'ep-dead'), device('u-b', 'ep-b'), device('u-c', 'ep-c')]));
  subsSets = 0;
  const r = await lib.pruneSubscriptions(new Set(['ep-dead']));
  assert.equal(r.removed, 1);
  assert.deepEqual(endpointsStored(), ['ep-b', 'ep-c'], 'the later registration survives the prune');
  assert.equal(subsSets, 1);
  const none = await lib.pruneSubscriptions(['ep-not-there']);
  assert.equal(none.removed, 0); assert.equal(subsSets, 1, 'no save when nothing was removed');
  assert.deepEqual(await lib.pruneSubscriptions([]), { removed: 0 });
});

test('pruneSubscriptionsBestEffort: a failed read or a busy lock skips the prune, logs, writes nothing; other errors still throw', async () => {
  resetWorld();
  seedSubs([device('u-a', 'ep-dead')]);
  failNextSubsGets('fail');
  const skipped = await lib.pruneSubscriptionsBestEffort(['ep-dead'], 'unit');
  assert.deepEqual(skipped, { removed: 0, skipped: 'STORAGE_UNAVAILABLE' });
  assert.equal(subsSets, 0); assert.deepEqual(endpointsStored(), ['ep-dead']);
  assert.ok(warns.some(w => w.includes('[unit] subscription pruning skipped')), warns.join('|'));
  kv.set(LOCK_KEY, JSON.stringify('someone-else'));
  const busy = await lib.pruneSubscriptionsBestEffort(['ep-dead'], 'unit');
  kv.delete(LOCK_KEY);
  assert.deepEqual(busy, { removed: 0, skipped: 'busy' }); assert.deepEqual(endpointsStored(), ['ep-dead']);
  await assert.rejects(lib.pruneSubscriptionsBestEffort({ [Symbol.iterator]() { throw new Error('boom'); } }), /boom/);
});

// ═══ 6. cron: reminder and schedules ════════════════════════════════════════

async function seedReminderWorld() {
  await seedClub();
  seedSubs([device('u-sen1', 'https://push.test/sen1')]);
}

test('cron reminder: the subscription read fails → 503, nothing sent, nothing logged as sent, the single-flight lock released', async () => {
  await seedReminderWorld();
  failNextSubsGets('fail');
  const mark = commands.length;
  const r = await cron({ job: 'reminder' });
  assert.equal(r.statusCode, 503, JSON.stringify(r.body)); assert.equal(r.body.code, 'STORAGE_UNAVAILABLE');
  assert.deepEqual(sent, [], 'no push left');
  assert.ok(!commandsSince(mark).some(([c, k]) => c === 'LPUSH' && k === 'app:message_log'), 'no message_log entry');
  assert.equal(subsSets, 0); assert.ok(!kv.has('app:cron_lock'), 'cron single-flight lock released');
});

test('cron reminder: the send goes out; the prune read fails → prune skipped, no save, run still 200; next run prunes', async () => {
  await seedReminderWorld();
  reject410.add('https://push.test/sen1');
  failNextSubsGets('ok', 'fail');                              // read for the send ok; the prune's fresh read fails
  const r = await cron({ job: 'reminder' });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual(sent, ['https://push.test/sen1'], 'the reminder was attempted');
  assert.equal(subsSets, 0, 'no save'); assert.deepEqual(endpointsStored(), ['https://push.test/sen1'], 'the dead device is still listed — nothing was guessed');
  assert.ok(warns.some(w => w.includes('[cron reminder] subscription pruning skipped')), warns.join('|'));
  // Storage back: the same run prunes it from a fresh read.
  sent.length = 0;
  const r2 = await cron({ job: 'reminder' });
  assert.equal(r2.statusCode, 200);
  assert.deepEqual(endpointsStored(), [], 'the 410 device is removed once the list can be read');
  assert.equal(subsSets, 1);
});

test('cron schedules: the subscription read fails → 503 and no schedule is stamped as sent', async () => {
  await seedClub();
  kv.set('app:schedules', JSON.stringify([{ id: 'sch-1', teamId: CLUB, active: true, time: '00:00', days: [0, 1, 2, 3, 4, 5, 6] }]));
  const schedulesBefore = kv.get('app:schedules');
  failNextSubsGets('fail');
  const r = await cron({});
  assert.equal(r.statusCode, 503, JSON.stringify(r.body)); assert.equal(r.body.code, 'STORAGE_UNAVAILABLE');
  assert.equal(kv.get('app:schedules'), schedulesBefore, 'no lastSentAt stamped on a run that reached nobody');
  assert.deepEqual(sent, []); assert.ok(!kv.has('app:cron_lock'));
});

// ═══ 7. push (manual send + test_device) ════════════════════════════════════

test('push send: the subscription read fails → 503, nothing sent, nothing logged', async () => {
  await seedClub();
  seedSubs([device('u-sen1', 'https://push.test/sen1')]);
  failNextSubsGets('fail');
  const mark = commands.length;
  const r = await push('u-simon', { title: 'Hi', body: 'Training moved', audience: 'all' });
  assert.equal(r.statusCode, 503, JSON.stringify(r.body)); assert.equal(r.body.code, 'STORAGE_UNAVAILABLE');
  assert.deepEqual(sent, []);
  assert.ok(!commandsSince(mark).some(([c, k]) => c === 'LPUSH' && k === 'app:message_log'), 'no message_log entry');
});

test('push send: delivered; a 410 device is pruned from a fresh read; a failed prune read skips the prune and the send still reports', async () => {
  await seedClub();
  seedSubs([device('u-sen1', 'https://push.test/sen1'), device('u-sen2', 'https://push.test/sen2')]);
  reject410.add('https://push.test/sen1');
  failNextSubsGets('ok', 'fail');
  const r = await push('u-simon', { title: 'Hi', body: 'Training moved', audience: 'all' });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual([...sent].sort(), ['https://push.test/sen1', 'https://push.test/sen2']);
  assert.equal(subsSets, 0); assert.equal(subsStored().length, 2, 'prune skipped: nothing written');
  assert.ok(warns.some(w => w.includes('[push] subscription pruning skipped')));
  sent.length = 0;
  const r2 = await push('u-simon', { title: 'Hi', body: 'Again', audience: 'all' });
  assert.equal(r2.statusCode, 200);
  assert.deepEqual(endpointsStored(), ['https://push.test/sen2'], 'pruned once readable');
});

test('push test_device: an unreadable list is 503, not "Not your device"', async () => {
  await seedClub();
  process.env.DEV_LOGIN = 'true';
  seedSubs([device('u-sen1', 'https://push.test/sen1')]);
  failNextSubsGets('fail');
  const r = await push('u-sen1', { action: 'test_device', endpoint: 'https://push.test/sen1' });
  assert.equal(r.statusCode, 503, JSON.stringify(r.body)); assert.equal(r.body.code, 'STORAGE_UNAVAILABLE');
  const ok = await push('u-sen1', { action: 'test_device', endpoint: 'https://push.test/sen1' });
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
});

// ═══ 8. publish availability-check ══════════════════════════════════════════

test('publish availability-check: the subscription read fails → 503 and no weekly-availability marker is written', async () => {
  await seedClub();
  seedSubs([device('u-sen1', 'https://push.test/sen1')]);
  failNextSubsGets('fail');
  const mark = commands.length;
  const r = await publish('u-simon', { resource: 'availability-check' });
  assert.equal(r.statusCode, 503, JSON.stringify(r.body)); assert.equal(r.body.code, 'STORAGE_UNAVAILABLE');
  assert.ok(!commandsSince(mark).some(([c, k]) => c === 'SET' && /weekly_avail/.test(String(k))), 'no dedup marker stamped');
  assert.deepEqual(sent, []);
  const ok = await publish('u-simon', { resource: 'availability-check' });
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
});

test('publish availability-check prunes through the shared best-effort helper (its due-time path cannot be driven without faking the clock)', () => {
  const src = readFileSync(new URL('../api/publish.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('async function availabilityCheckHandler'), src.indexOf('// ── Club data export'));
  assert.ok(/pruneSubscriptionsBestEffort\(report\.expired, 'availability-check'\)/.test(fn), 'prune goes through the helper');
  assert.ok(!/\bsave\(/.test(fn), 'no direct save of a stale list');
});

// ═══ 9. chat DM push ════════════════════════════════════════════════════════

test('chat DM: the message is stored; a 410 device is pruned from a fresh read; a failed prune read skips it and the send still succeeds', async () => {
  await seedClub();
  seedSubs([device('u-simon', 'https://push.test/simon')]);
  const made = await chat('u-sen1', { action: 'create_conv', id: 'dm:u-sen1:u-simon', type: 'DIRECT', participants: ['u-sen1', 'u-simon'], name: 'Simon' });
  assert.equal(made.statusCode, 200, JSON.stringify(made.body));
  reject410.add('https://push.test/simon');
  failNextSubsGets('ok', 'fail');
  const r = await chat('u-sen1', { action: 'send', convId: 'dm:u-sen1:u-simon', text: 'Hello coach' });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const stored = [...lists.entries()].filter(([k]) => k.includes('dm:u-sen1:u-simon')).flatMap(([, l]) => l.map(x => JSON.parse(x)));
  assert.equal(stored.length, 1, 'the message was persisted');
  assert.deepEqual(sent, ['https://push.test/simon'], 'the push was attempted');
  assert.equal(subsSets, 0); assert.deepEqual(endpointsStored(), ['https://push.test/simon'], 'prune skipped: nothing written');
  assert.ok(warns.some(w => w.includes('subscription pruning skipped')), warns.join('|'));
  sent.length = 0;
  const r2 = await chat('u-sen1', { action: 'send', convId: 'dm:u-sen1:u-simon', text: 'Again' });
  assert.equal(r2.statusCode, 200);
  assert.deepEqual(endpointsStored(), [], 'pruned once readable');
});

test('chat DM: an unreadable list skips the push, logs, and the message is still stored', async () => {
  await seedClub();
  seedSubs([device('u-simon', 'https://push.test/simon')]);
  await chat('u-sen1', { action: 'create_conv', id: 'dm:u-sen1:u-simon', type: 'DIRECT', participants: ['u-sen1', 'u-simon'], name: 'Simon' });
  failNextSubsGets('fail');
  const r = await chat('u-sen1', { action: 'send', convId: 'dm:u-sen1:u-simon', text: 'Hello' });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual(sent, []); assert.equal(subsSets, 0);
  assert.equal([...lists.keys()].filter(k => k.includes('dm:u-sen1:u-simon')).length, 1, 'message stored');
});

// ═══ 10. identity: account deletion cleanup ═════════════════════════════════

let _t = 0;
async function deletionWorld() {
  resetWorld();
  const A = await store.createClub({ clubName: `Alpha RFC ${++_t}`, teamName: 'Seniors', sport: 'rugby',
    name: 'Alpha Owner', email: `o${_t}@del.test`, password: 'password123' });
  const token = 'TK' + String(++_t).padStart(8, '0');
  const invites = JSON.parse(kv.get('ce:invites') || '[]');
  invites.push({ token, email: `p${_t}@del.test`, name: 'Jamie Dodd', role: 'player', teamId: A.team.id, status: 'pending',
    expiresAt: new Date(Date.now() + 9e7).toISOString() });
  kv.set('ce:invites', JSON.stringify(invites));
  const player = await store.claimInvite({ position: '2 — Hooker', token, email: `p${_t}@del.test`, name: 'Jamie Dodd', password: 'password123' });
  seedSubs([device(player.user.id, 'https://push/jamie'), device(A.user.id, 'https://push/owner')]);
  commands.length = 0;
  return { A, player };
}
async function deleteAccount(session) {
  const r = response();
  await identityHandler({ method: 'POST', query: {}, headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` },
    body: { action: 'delete_account', confirm: 'DELETE', currentPassword: 'password123' } }, r);
  return r;
}
const sessionsAll = () => JSON.parse(kv.get('app:identity:sessions') || '[]');

test('account deletion: the device cleanup runs under the subscriptions lock, removes only the deleted user\'s devices, and session behaviour is unchanged', async () => {
  const { A, player } = await deletionWorld();
  const r = await deleteAccount(player.session);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body)); assert.equal(r.body.deleted, true);
  assert.deepEqual(subsStored().map(s => s.userId), [A.user.id], 'only the deleted user\'s push devices removed');
  assert.ok(commands.some(([c, k]) => c === 'SET' && k === LOCK_KEY), 'the subscriptions lock was taken for the rewrite');
  assert.ok(!kv.has(LOCK_KEY), 'and released');
  assert.ok(!sessionsAll().some(s => s.userId === player.user.id), 'every session of the deleted account revoked');
  assert.match(String(r.headers['Set-Cookie'] || ''), /=;|Max-Age=0|Expires=/, 'cookie cleared');
});

test('account deletion: an unreadable subscription list skips the device cleanup WITHOUT writing, and the deletion still completes', async () => {
  const { A, player } = await deletionWorld();
  failNextSubsGets('fail');
  const r = await deleteAccount(player.session);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(subsSets, 0, 'nothing written to the subscription list');
  assert.deepEqual(subsStored().map(s => s.userId).sort(), [A.user.id, player.user.id].sort(), 'both devices still listed — nothing was guessed');
  assert.ok(!sessionsAll().some(s => s.userId === player.user.id), 'sessions still revoked');
  assert.ok(!kv.has(LOCK_KEY));
});

// ═══ 11. Every writer is accounted for ══════════════════════════════════════

test('no api/ file writes the subscription list outside the lock: every save() is inside a subscriptions-lock scope or the shared prune helper', () => {
  const api = f => readFileSync(new URL(`../api/${f}`, import.meta.url), 'utf8');
  for (const f of ['cron.js', 'publish.js', 'push.js', 'chat.js']) {
    const src = api(f);
    assert.ok(!/\b(save|saveSubs)\(/.test(src), `${f} has no direct save of the list`);
    assert.ok(/pruneSubscriptionsBestEffort\(/.test(src), `${f} prunes through the best-effort helper`);
  }
  const subscribe = api('subscribe.js');
  assert.equal((subscribe.match(/withSubscriptionsLock\(/g) || []).length, 3, 'POST, purge and DELETE each hold the lock');
  assert.equal((subscribe.match(/\bsave\(/g) || []).length, 3);
  const identity = api('_identityStore.js');
  const cleanup = identity.slice(identity.indexOf('// 5. Push subscriptions'), identity.indexOf('// 6. Chat read-cursors'));
  assert.ok(/withSubscriptionsLock\(/.test(cleanup), 'the deletion cleanup holds the lock');
  const lib = api('_lib.js');
  assert.ok(!/catch[^}]*return \[\]/s.test(lib), 'load() no longer answers [] from a catch');
});
