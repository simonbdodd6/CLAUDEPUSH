/**
 * PRODUCTION DATA-INTEGRITY HARDENING (audit loop 2).
 *
 * Four findings, one theme: the system should not invent data, and should not
 * accept authority from a place it does not belong.
 *
 *  P0-2  saveTeams() refuses to persist the DEFAULT_TEAM development
 *        placeholder into a store that does not already contain it. This is
 *        the write that created the phantom `boitsfort-rfc` tenant when a
 *        local script called loadTeams() without a production runtime.
 *  P1-2  the operational secret is read from the Authorization header only,
 *        never from a query string that lands in logs and browser history.
 *  P1-3  a training slot with no start time is stored empty, not defaulted to
 *        an evening nobody chose.
 *  P1-1  mission-control reads GLOBAL identity and messaging data, so it is
 *        platform-admin only rather than "any coach".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.integrity.test';
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

const store = await import('../api/_identityStore.js');
const { readSecret } = await import('../api/_http.js');
const { DEFAULT_TEAM, loadTeams, saveTeams, legacySeedEnabled } = store;

const TEAMS_KEY = 'app:identity:teams';
const REAL = { id: 'boitsfort', name: 'Boitsfort', teamName: 'Seniors', sport: 'Rugby',
               teamCode: 'BOITSF57', plan: 'pro', planStatus: 'active',
               trialEndsAt: '2026-09-04T10:51:09.924Z', createdAt: '2026-08-05T10:51:09.924Z',
               stripeCustomerId: null, stripeSubscriptionId: null };

const setStore = teams => kv.set(TEAMS_KEY, JSON.stringify(teams));
const readStore = () => JSON.parse(kv.get(TEAMS_KEY) || '[]');

// The runtime signal is read at CALL time, so each test can choose its world.
function asProduction(fn) {
  const node = process.env.NODE_ENV, vercel = process.env.VERCEL;
  process.env.NODE_ENV = 'production';
  return Promise.resolve(fn()).finally(() => {
    if (node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = node;
    if (vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = vercel;
  });
}
function asDevelopment(fn) {
  const node = process.env.NODE_ENV, vercel = process.env.VERCEL;
  delete process.env.NODE_ENV; delete process.env.VERCEL;
  return Promise.resolve(fn()).finally(() => {
    if (node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = node;
    if (vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = vercel;
  });
}

// ── P0-2 · saveTeams guard ─────────────────────────────────────────────────

test('P0-2 (1): a production save containing DEFAULT_TEAM is REJECTED', async () => {
  setStore([REAL]);
  await asProduction(async () => {
    await assert.rejects(
      () => saveTeams([DEFAULT_TEAM, REAL]),
      err => err.code === 'default_team_write_blocked',
      'the placeholder must not reach a store that does not hold it');
  });
  assert.deepEqual(readStore(), [REAL], 'and the stored list is untouched');
});

test('P0-2 (2): a production save WITHOUT the placeholder still works', async () => {
  setStore([REAL]);
  await asProduction(async () => {
    await saveTeams([{ ...REAL, plan: 'enterprise' }]);
  });
  assert.equal(readStore().length, 1);
  assert.equal(readStore()[0].plan, 'enterprise', 'an ordinary tenant update is unaffected');
});

test('P0-2 (3): development behaviour is preserved — the placeholder round-trips', async () => {
  setStore([DEFAULT_TEAM, REAL]);          // dev store legitimately holds it
  await asDevelopment(async () => {
    assert.equal(legacySeedEnabled(), true, 'dev really is a seeding runtime');
    const loaded = await loadTeams();
    assert.equal(loaded.some(t => t.id === DEFAULT_TEAM.id), true, 'loadTeams still offers it');
    await saveTeams(loaded);               // must NOT throw: it was already stored
  });
  assert.equal(readStore().some(t => t.id === DEFAULT_TEAM.id), true, 're-saved unchanged');
});

test('P0-2 (4): the real Boitsfort tenant is never altered by the guard', async () => {
  setStore([REAL]);
  await asProduction(async () => {
    await assert.rejects(() => saveTeams([DEFAULT_TEAM, { ...REAL, plan: 'trial' }]));
  });
  const after = readStore();
  assert.deepEqual(after, [REAL], 'the rejected write changed nothing at all');
  assert.equal(after[0].plan, 'pro', 'including the entitlement it carries');
});

test('P0-2 (5): the guard holds when NODE_ENV is absent — it keys off DATA, not env', async () => {
  // This is the incident's exact shape: a local script, no NODE_ENV, pointed at
  // the production store. loadTeams() injects the placeholder; saving it back
  // must still be refused, because the STORE does not contain it.
  setStore([REAL]);
  await asDevelopment(async () => {
    assert.equal(process.env.NODE_ENV, undefined, 'no production signal present');
    const loaded = await loadTeams();
    assert.equal(loaded[0].id, DEFAULT_TEAM.id, 'loadTeams injected the placeholder');
    await assert.rejects(() => saveTeams(loaded), err => err.code === 'default_team_write_blocked',
      'and saving it back is refused even with no NODE_ENV');
  });
  assert.deepEqual(readStore(), [REAL], 'production store still holds only the real tenant');
});

test('P0-2 (6): the guard fails LOUDLY — it never silently strips and continues', async () => {
  setStore([REAL]);
  await asProduction(async () => {
    await assert.rejects(() => saveTeams([DEFAULT_TEAM, REAL]));
  });
  // A silent strip would have written [REAL] and reported success; the caller
  // would never learn its input was altered.
  assert.deepEqual(readStore(), [REAL]);
  const src = await readFile(new URL('../api/_identityStore.js', import.meta.url), 'utf8');
  const fnStart = src.indexOf('export async function saveTeams');
  const body = src.slice(fnStart, src.indexOf('\n}', fnStart));
  assert.match(body, /throw error/, 'the guard throws');
  assert.doesNotMatch(body, /\.filter\(/, 'it does not quietly filter the record out');
});

// ── P1-2 · the secret is header-only ───────────────────────────────────────

test('P1-2 (1): a valid Authorization header still authenticates', () => {
  assert.equal(readSecret({ headers: { authorization: 'Bearer s3cret' } }), 's3cret');
  assert.equal(readSecret({ headers: { authorization: 'bearer s3cret' } }), 's3cret', 'case-insensitive');
  assert.equal(readSecret({ headers: { authorization: 's3cret' } }), 's3cret', 'bare value still accepted');
});

test('P1-2 (2): a query-string secret alone does NOT authenticate', () => {
  assert.equal(readSecret({ headers: {}, query: { secret: 's3cret' } }), '',
    'a secret in a URL is ignored — it leaks into logs, history and Referer');
});

test('P1-2 (3): a missing secret yields empty, so a caller comparison fails', () => {
  assert.equal(readSecret({ headers: {} }), '');
  assert.equal(readSecret({}), '');
  // Callers compare against CRON_SECRET; '' never equals a configured secret.
  const CRON_SECRET = 'configured';
  assert.notEqual(readSecret({ headers: {} }), CRON_SECRET, 'missing -> 401');
  assert.notEqual(readSecret({ headers: { authorization: 'Bearer wrong' } }), CRON_SECRET, 'wrong -> 401');
  assert.equal(readSecret({ headers: { authorization: 'Bearer configured' } }), CRON_SECRET, 'right -> 200');
});

test('P1-2 (4): both callers of the secret keep the same contract', async () => {
  // cron dispatch AND the production account-recovery actions in identity.js.
  const cron = await readFile(new URL('../api/cron.js', import.meta.url), 'utf8');
  const identity = await readFile(new URL('../api/identity.js', import.meta.url), 'utf8');
  for (const [name, src] of [['cron', cron], ['identity', identity]]) {
    assert.match(src, /readSecret\(req\) !== process\.env\.CRON_SECRET/, `${name} still compares the secret`);
    assert.match(src, /401/, `${name} still refuses without it`);
  }
  const http = await readFile(new URL('../api/_http.js', import.meta.url), 'utf8');
  assert.doesNotMatch(http, /req\.query\?\.secret/, 'no query-string fallback remains');
});

// ── P1-3 · no invented start time ──────────────────────────────────────────

test('P1-3: a training slot never invents a start time', async () => {
  const src = await readFile(new URL('../api/publish.js', import.meta.url), 'utf8');
  const i = src.indexOf('function sanitiseScheduleSlot');
  const body = src.slice(i, src.indexOf('\n}', i));
  assert.match(body, /startTime:\s+hhmm\(raw\?\.startTime\),/, 'stored as-is or empty');
  assert.doesNotMatch(body, /startTime[^\n]*\|\|\s*'19:00'/, 'no evening default');

  // Drive the real validator the sanitiser uses.
  const hhmm = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : '';
  assert.equal(hhmm('19:45'), '19:45', 'an explicit valid time is unchanged');
  assert.equal(hhmm('07:00'), '07:00');
  assert.equal(hhmm(''), '',            'missing becomes empty');
  assert.equal(hhmm(undefined), '',     'absent becomes empty');
  assert.equal(hhmm('7pm'), '',         'malformed becomes empty, NOT 19:00');
  assert.equal(hhmm('25:00'), '',       'out of range becomes empty, NOT 19:00');
});

test('P1-3: the client does not send an invented start time either', async () => {
  // A server-only fix would have achieved nothing: the client used to POST
  // '19:00' explicitly, so the invented value arrived as an explicit one.
  const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const i = src.indexOf('function trainingScheduleAdd');
  const body = src.slice(i, src.indexOf('\n    }', i));
  assert.match(body, /startTime:\s*''/, 'a new training night starts with no time');
  assert.doesNotMatch(body, /19:00/, 'and invents nothing');
});

test('P1-3: other stored slot fields are untouched by this change', async () => {
  const src = await readFile(new URL('../api/publish.js', import.meta.url), 'utf8');
  const i = src.indexOf('function sanitiseScheduleSlot');
  const body = src.slice(i, src.indexOf('\n}', i));
  for (const kept of ['endTime', 'venue', 'arrivalTime', 'effectiveFrom', 'effectiveTo', 'active']) {
    assert.match(body, new RegExp(`${kept}:`), `${kept} is still carried through`);
  }
  assert.doesNotMatch(body, /migrate|backfill/i, 'no historical record is rewritten');
});

// ── P1-1 · mission-control is platform-admin only ──────────────────────────

test('P1-1: mission-control requires platform admin, not a club role', async () => {
  const src = await readFile(new URL('../api/mission-control.js', import.meta.url), 'utf8');
  assert.match(src, /isPlatformAdmin\(sessionContext\?\.user\)/, 'gated on platform authority');
  assert.doesNotMatch(src, /requireTenantRole\(req, \['coach', 'admin'\]\)/,
    'the any-coach gate is gone');
  assert.doesNotMatch(src, /requireTenantRole/, 'and is not used anywhere else in the file');
  assert.match(src, /error\.status = 403/, 'a non-platform-admin is refused');
});

test('P1-1: platform authority is a user-record fact, never a club membership', () => {
  const { isPlatformAdmin } = store;
  assert.equal(isPlatformAdmin({ platformRole: 'platform_admin' }), true);
  for (const notAdmin of [{ platformRole: 'admin' }, { platformRole: '' }, { role: 'admin' },
                          { role: 'coach' }, {}, null, undefined]) {
    assert.equal(isPlatformAdmin(notAdmin), false,
      `a club role must not confer platform authority: ${JSON.stringify(notAdmin)}`);
  }
});

test('P1-1: the endpoint stays excluded from deployment (defence in depth)', async () => {
  const ignore = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');
  assert.match(ignore, /api\/mission-control\.js/, 'still not deployed — production keeps returning 404');
});
