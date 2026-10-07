/**
 * THE STORAGE GUARD FAILS CLOSED (Build 135)
 *
 * Every Redis command passes through api/_kv.js redis(), which now asks
 * storageTarget() which database — if any — this deployment may touch:
 *   production / development / local → UPSTASH_REDIS_REST_*, keys unchanged
 *   preview → PREVIEW_UPSTASH_REDIS_REST_* only, every key under "preview:"
 * and REFUSES (no request leaves the process) when Preview is unconfigured,
 * when Preview names production's database (same URL, however spelled, or
 * same token), or when the environment is ambiguous (on Vercel, no or an
 * unknown VERCEL_ENV). These tests drive the real module with a recording
 * fetch: "refused" is proven by ZERO requests, not by a return value.
 * All URLs and tokens are synthetic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installKv } from './build135-kv.js';

const PROD_URL = 'https://redis.prod-b135.test';
const PROD_TOKEN = 'prod-token-b135';
const PREV_URL = 'https://redis.preview-b135.test';
const PREV_TOKEN = 'preview-token-b135';
const ENV_KEYS = ['VERCEL', 'VERCEL_ENV', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
  'PREVIEW_UPSTASH_REDIS_REST_URL', 'PREVIEW_UPSTASH_REDIS_REST_TOKEN'];

const kvStub = installKv({ maxDelayMs: 0 });
const kv = await import('../api/_kv.js');

/** Run fn with exactly these storage variables (all others unset). */
async function withEnv(vars, fn) {
  const saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, vars);
  kvStub.calls.length = 0;
  try { return await fn(); } finally {
    for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}
const prodVars = { UPSTASH_REDIS_REST_URL: PROD_URL, UPSTASH_REDIS_REST_TOKEN: PROD_TOKEN };
const prevVars = { PREVIEW_UPSTASH_REDIS_REST_URL: PREV_URL, PREVIEW_UPSTASH_REDIS_REST_TOKEN: PREV_TOKEN };

/** Every public storage operation; each must either reach storage or be refused. */
const OPS = {
  get: () => kv.kvGet('app:x'),
  set: () => kv.kvSet('app:x', { v: 1 }),
  setnx: () => kv.kvSetNX('app:lock:x', 't', 5),
  del: () => kv.kvDel('app:x'),
  lpush: () => kv.kvLpush('app:l', { v: 1 }),
  lrange: () => kv.kvLrange('app:l'),
  ltrim: () => kv.kvLtrim('app:l', 10),
  rename: () => kv.kvRename('app:l', 'app:l2'),
  expire: () => kv.kvExpire('app:x', 5),
  scan: () => kv.kvScanKeys('app:*'),
};

async function assertRefused(label, reason) {
  const target = kv.storageTarget();
  assert.equal(target.ok, false, `${label}: target refused`);
  if (reason) assert.equal(target.reason, reason, `${label}: reason`);
  assert.equal(target.url, undefined, `${label}: a refused target carries no URL`);
  assert.equal(target.token, undefined, `${label}: a refused target carries no token`);
  assert.equal(kv.kvConfigured(), false, `${label}: kvConfigured() is false`);
  for (const [name, op] of Object.entries(OPS)) {
    await assert.rejects(op(), e => {
      assert.equal(e.status, 503, `${label} ${name}: 503`);
      assert.equal(e.message, 'Storage temporarily unavailable', `${label} ${name}: the fixed client message`);
      for (const secret of [PROD_URL, PROD_TOKEN, PREV_URL, PREV_TOKEN]) {
        assert.ok(!String(e.message).includes(secret) && !String(e.stack || '').includes(secret), `${label} ${name}: no configured value in the error`);
      }
      return true;
    }, `${label}: ${name} refused`);
  }
  assert.equal(kvStub.calls.length, 0, `${label}: NOT ONE request left the process`);
}

test('local (not on Vercel): UPSTASH_* is used, keys are unchanged — tests and local dev stay usable', async () => {
  await withEnv(prodVars, async () => {
    assert.equal(kv.storageEnvironment(), 'local');
    const t = kv.storageTarget();
    assert.equal(t.ok, true); assert.equal(t.namespace, ''); assert.equal(t.url, PROD_URL);
    await kv.kvSet('app:x', { v: 1 });
    assert.equal(kvStub.calls[0].url, PROD_URL);
    assert.deepEqual(kvStub.calls[0].cmd.slice(0, 2), ['SET', 'app:x']);
  });
});

test('production: UPSTASH_* with the exact production keys — behaviour unchanged, PREVIEW_* ignored', async () => {
  await withEnv({ VERCEL: '1', VERCEL_ENV: 'production', ...prodVars, ...prevVars }, async () => {
    assert.equal(kv.storageEnvironment(), 'production');
    for (const op of Object.values(OPS)) await op();
    assert.ok(kvStub.calls.length >= Object.keys(OPS).length);
    for (const c of kvStub.calls) {
      assert.equal(c.url, PROD_URL, 'production never talks to the Preview database');
      assert.equal(c.auth, `Bearer ${PROD_TOKEN}`);
      assert.ok(!JSON.stringify(c.cmd).includes('preview:'), `production keys are unprefixed: ${c.cmd[0]}`);
    }
    const scan = kvStub.calls.find(c => c.cmd[0] === 'SCAN');
    assert.equal(scan.cmd[3], 'app:*', 'SCAN pattern unchanged');
  });
});

test('development (vercel dev) behaves like local', async () => {
  await withEnv({ VERCEL: '1', VERCEL_ENV: 'development', ...prodVars }, async () => {
    assert.equal(kv.storageTarget().ok, true);
    assert.equal(kv.storageTarget().namespace, '');
  });
});

test('preview with its own database: PREVIEW_* only, every key under "preview:"', async () => {
  await withEnv({ VERCEL: '1', VERCEL_ENV: 'preview', ...prodVars, ...prevVars }, async () => {
    const t = kv.storageTarget();
    assert.equal(t.ok, true); assert.equal(t.namespace, 'preview:'); assert.equal(t.url, PREV_URL);
    for (const op of Object.values(OPS)) await op();
    for (const c of kvStub.calls) {
      assert.equal(c.url, PREV_URL, `preview ${c.cmd[0]} went to the Preview database`);
      assert.equal(c.auth, `Bearer ${PREV_TOKEN}`, 'with the Preview token');
    }
    const keyOf = { GET: [1], SET: [1], DEL: [1], LPUSH: [1], LRANGE: [1], LTRIM: [1], EXPIRE: [1], RENAME: [1, 2], SCAN: [3] };
    for (const c of kvStub.calls) {
      for (const i of keyOf[c.cmd[0]]) assert.ok(String(c.cmd[i]).startsWith('preview:app:'), `${c.cmd[0]} key ${c.cmd[i]}`);
    }
  });
});

test('preview with NO Preview storage configured is refused — it never falls back to UPSTASH_* (production)', async () => {
  await withEnv({ VERCEL: '1', VERCEL_ENV: 'preview', ...prodVars }, () => assertRefused('preview unconfigured', 'preview_storage_unconfigured'));
  await withEnv({ VERCEL: '1', VERCEL_ENV: 'preview', ...prodVars, PREVIEW_UPSTASH_REDIS_REST_URL: PREV_URL }, () => assertRefused('preview token missing', 'preview_storage_unconfigured'));
  await withEnv({ VERCEL: '1', VERCEL_ENV: 'preview', ...prodVars, PREVIEW_UPSTASH_REDIS_REST_TOKEN: PREV_TOKEN }, () => assertRefused('preview url missing', 'preview_storage_unconfigured'));
  await withEnv({ VERCEL: '1', VERCEL_ENV: 'preview', ...prodVars, PREVIEW_UPSTASH_REDIS_REST_URL: '   ', PREVIEW_UPSTASH_REDIS_REST_TOKEN: '  ' }, () => assertRefused('preview blank', 'preview_storage_unconfigured'));
});

test('preview configured with PRODUCTION storage fails closed — however the URL is disguised, or via the token', async () => {
  const disguises = [
    PROD_URL, `${PROD_URL}/`, `${PROD_URL}//`, PROD_URL.toUpperCase(), `  ${PROD_URL}  `,
    'HTTPS://Redis.Prod-B135.Test/', `${PROD_URL}:443`.replace('.test:443', '.test'),
  ];
  for (const url of disguises) {
    await withEnv({ VERCEL: '1', VERCEL_ENV: 'preview', ...prodVars, PREVIEW_UPSTASH_REDIS_REST_URL: url, PREVIEW_UPSTASH_REDIS_REST_TOKEN: PREV_TOKEN },
      () => assertRefused(`preview url ${JSON.stringify(url)}`, 'preview_targets_production'));
  }
  // a different-looking URL but production's token is production's database
  await withEnv({ VERCEL: '1', VERCEL_ENV: 'preview', ...prodVars, PREVIEW_UPSTASH_REDIS_REST_URL: PREV_URL, PREVIEW_UPSTASH_REDIS_REST_TOKEN: PROD_TOKEN },
    () => assertRefused('preview with the production token', 'preview_targets_production'));
  // and both copied across (the exact misconfiguration the project had)
  await withEnv({ VERCEL: '1', VERCEL_ENV: 'preview', ...prodVars, PREVIEW_UPSTASH_REDIS_REST_URL: PROD_URL, PREVIEW_UPSTASH_REDIS_REST_TOKEN: PROD_TOKEN },
    () => assertRefused('preview = production copy', 'preview_targets_production'));
});

test('ambiguous or misleading environments are refused, never treated as production', async () => {
  const cases = [
    { VERCEL: '1' },                                   // on Vercel with no VERCEL_ENV
    { VERCEL: '1', VERCEL_ENV: '' },
    { VERCEL: '1', VERCEL_ENV: 'staging' },
    { VERCEL: '1', VERCEL_ENV: 'prod' },
    { VERCEL: '1', VERCEL_ENV: 'production-preview' },
    { VERCEL: '1', VERCEL_ENV: 'preview,production' },
    { VERCEL_ENV: 'qa' },                              // an unknown value off Vercel too
    { VERCEL_ENV: 'undefined' },
  ];
  for (const c of cases) {
    await withEnv({ ...c, ...prodVars, ...prevVars }, async () => {
      assert.equal(kv.storageEnvironment(), 'ambiguous', JSON.stringify(c));
      await assertRefused(`env ${JSON.stringify(c)}`, 'environment_ambiguous');
    });
  }
});

test('a pasted token or junk in the Preview URL field is refused', async () => {
  for (const url of ['preview-token-b135', 'redis.preview-b135.test', 'ftp://redis.preview-b135.test', 'javascript:alert(1)']) {
    await withEnv({ VERCEL: '1', VERCEL_ENV: 'preview', ...prodVars, PREVIEW_UPSTASH_REDIS_REST_URL: url, PREVIEW_UPSTASH_REDIS_REST_TOKEN: PREV_TOKEN },
      () => assertRefused(`preview url ${url}`, 'url_invalid'));
  }
});

test('production with storage missing stays unconfigured (unchanged behaviour) and sends nothing', async () => {
  await withEnv({ VERCEL: '1', VERCEL_ENV: 'production' }, () => assertRefused('production unconfigured', 'token_missing'));
});

test('kvHealthCheck reports a refused Preview as "refused" and sends nothing', async () => {
  await withEnv({ VERCEL: '1', VERCEL_ENV: 'preview', ...prodVars, PREVIEW_UPSTASH_REDIS_REST_URL: PROD_URL, PREVIEW_UPSTASH_REDIS_REST_TOKEN: PROD_TOKEN }, async () => {
    assert.deepEqual(await kv.kvHealthCheck(), { ok: false, code: 'refused' });
    assert.equal(kvStub.calls.length, 0);
  });
  await withEnv({ VERCEL: '1', ...prodVars }, async () => {
    assert.deepEqual(await kv.kvHealthCheck(), { ok: false, code: 'refused' });
    assert.equal(kvStub.calls.length, 0);
  });
  await withEnv({ VERCEL: '1', VERCEL_ENV: 'preview', ...prodVars }, async () => {
    assert.deepEqual(await kv.kvHealthCheck(), { ok: false, code: 'unconfigured' });
    assert.equal(kvStub.calls.length, 0);
  });
});

test('kvHealthCheck in a working Preview probes the namespaced key on the Preview database', async () => {
  await withEnv({ VERCEL: '1', VERCEL_ENV: 'preview', ...prodVars, ...prevVars }, async () => {
    assert.equal((await kv.kvHealthCheck()).ok, true);
    assert.equal(kvStub.calls.length, 1);
    assert.equal(kvStub.calls[0].url, PREV_URL);
    assert.deepEqual(kvStub.calls[0].cmd, ['GET', 'preview:__healthcheck__']);
  });
});

test('in a namespaced environment a command whose keys are not known is refused, not sent un-namespaced', async () => {
  await withEnv({ VERCEL: '1', VERCEL_ENV: 'preview', ...prodVars, ...prevVars }, async () => {
    for (const cmd of [['HGET', 'app:h', 'f'], ['MGET', 'app:a', 'app:b'], ['KEYS', '*'], ['FLUSHALL'], ['EVAL', 'return 1', '0']]) {
      await assert.rejects(kv.default(...cmd), e => e.status === 503, cmd[0]);
    }
    await assert.rejects(kv.default('SCAN', '0'), e => e.status === 503, 'SCAN without MATCH would list every namespace');
    assert.equal(kvStub.calls.length, 0);
  });
});
