/**
 * /api/cron single-flight lock.
 *
 * When QStash (primary, every 5 min) and the Vercel hourly cron (fallback) fire within
 * the same execution window, only ONE run may proceed — otherwise both could read the
 * weekly dedup map before either writes it and double-send a reminder. The handler
 * takes a Redis SET-NX-EX lock at entry, no-ops if it's held, releases it in finally,
 * and is FAIL-OPEN (a Redis hiccup must never block the scheduler).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.lock.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.CRON_SECRET              = 'lock-test-secret';

const webpush = (await import('web-push')).default;
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY  = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;

const store = new Map(), lists = new Map();
let setShouldThrowNX = false;
globalThis.fetch = async (_url, opts = {}) => {
  let parsed; try { parsed = JSON.parse(opts.body || '[]'); } catch { parsed = null; }
  if (!Array.isArray(parsed)) return { ok: true, json: async () => ({ result: null }) };
  const [cmd, ...a] = parsed; let result = null;
  if (cmd === 'GET') result = store.has(a[0]) ? store.get(a[0]) : null;
  if (cmd === 'SET') {
    const nx = a.includes('NX');
    if (nx && setShouldThrowNX) throw new Error('redis down');     // simulate a hiccup acquiring the lock
    if (nx && store.has(a[0])) { result = null; }                  // NX: key exists → not set
    else { store.set(a[0], a[1]); result = 'OK'; }
  }
  if (cmd === 'DEL') { store.delete(a[0]); lists.delete(a[0]); result = 1; }
  if (cmd === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); result = l.length; }
  if (cmd === 'LRANGE') result = (lists.get(a[0]) || []).slice();
  if (cmd === 'LTRIM' || cmd === 'EXPIRE') result = 'OK';
  return { ok: true, json: async () => ({ result }) };
};

const { kvSetNX } = await import('../api/_kv.js');
const { default: cronHandler } = await import('../api/cron.js');

const LOCK = 'app:cron_lock';
function apiRes() { return { statusCode: 0, payload: null, headers: {}, setHeader(n, v) { this.headers[n] = v; }, status(c) { this.statusCode = c; return this; }, json(p) { this.payload = p; return this; }, end() { return this; } }; }
async function runCron() {
  const res = apiRes();
  await cronHandler({ method: 'POST', query: {}, body: {}, headers: { authorization: 'Bearer lock-test-secret' } }, res);
  return res;
}

test('kvSetNX: acquires once, blocks while held, re-acquires after release', async () => {
  store.delete(LOCK);
  assert.equal(await kvSetNX(LOCK, 1, 50), true,  'first caller acquires');
  assert.equal(await kvSetNX(LOCK, 1, 50), false, 'second caller blocked while held');
  store.delete(LOCK);
  assert.equal(await kvSetNX(LOCK, 1, 50), true,  're-acquires after release');
  store.delete(LOCK);
});

test('a cron run acquires the lock and releases it on exit', async () => {
  store.clear(); lists.clear(); setShouldThrowNX = false;
  const res = await runCron();
  assert.equal(res.statusCode, 200);
  assert.notEqual(res.payload?.skipped, 'cron run already in progress', 'ran (not skipped)');
  assert.equal(store.has(LOCK), false, 'lock released (DEL) after the run');
});

test('a concurrent run no-ops while the lock is held — no double-send', async () => {
  store.clear(); lists.clear(); setShouldThrowNX = false;
  store.set(LOCK, Date.now());                       // another run is holding the lock
  const res = await runCron();
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload?.skipped, 'cron run already in progress', 'second run skips');
  assert.equal(store.has(LOCK), true, "the holder's lock is NOT released by the skipped run");
});

test('lock acquisition is fail-open: a Redis hiccup still runs the scheduler', async () => {
  store.clear(); lists.clear(); setShouldThrowNX = true;
  try {
    const res = await runCron();
    assert.equal(res.statusCode, 200);
    assert.notEqual(res.payload?.skipped, 'cron run already in progress', 'fail-open: proceeds despite the lock error');
  } finally { setShouldThrowNX = false; }
});
