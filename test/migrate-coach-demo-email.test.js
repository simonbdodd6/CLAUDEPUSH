/**
 * Tests for the Phase 3 one-time migration script (scripts/migrate-coach-demo-email.mjs).
 * Pure unit tests: env + Redis (Upstash REST) are mocked; no network, no real files,
 * no production access. Covers dry-run safety, write+verify, backup, all abort guards,
 * and rollback.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runMigration, runRollback, diffUsers, usersKey,
  OLD_EMAIL, NEW_EMAIL, TARGET_ID,
} from '../scripts/migrate-coach-demo-email.mjs';

const ENV = { UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 'tok', APP_KEY_PREFIX: 'app' };
const KEY = 'app:identity:users';
const FIXED_NOW = () => new Date('2026-06-19T18:30:00.000Z');

// Mocked Upstash REST endpoint over an in-memory store (Map of key -> raw string).
function makeFetch(store, { tamperOnRead = null } = {}) {
  let reads = 0;
  return async (_url, opts) => {
    const [cmd, key, val] = JSON.parse(opts.body);
    if (cmd === 'GET') {
      reads++;
      let result = store.has(key) ? store.get(key) : null;
      if (tamperOnRead) result = tamperOnRead(result, reads); // simulate drift on a given read
      return { ok: true, json: async () => ({ result }) };
    }
    if (cmd === 'SET') { store.set(key, val); return { ok: true, json: async () => ({ result: 'OK' }) }; }
    return { ok: true, json: async () => ({ result: null }) };
  };
}

function seed(extraUsers = []) {
  const users = [
    { id: TARGET_ID, email: OLD_EMAIL, firstName: 'Simon', lastName: 'Coach', role: 'coach' },
    { id: 'user_aaa', email: 'real.coach@club.test', firstName: 'Real', lastName: 'Coach' },
    { id: 'player-simon-test', email: 'simon.test.player@player.test', firstName: 'Simon' },
    ...extraUsers,
  ];
  const store = new Map([[KEY, JSON.stringify(users)]]);
  return { store, users };
}

function captureBackup() {
  const calls = [];
  return { writeFile: (path, content) => calls.push({ path, content }), calls };
}

// ── usersKey / diffUsers ────────────────────────────────────────────────────
test('usersKey requires APP_KEY_PREFIX and builds the identity:users key', () => {
  assert.equal(usersKey('app'), 'app:identity:users');
  assert.equal(usersKey('app:'), 'app:identity:users'); // trailing colon trimmed
  assert.throws(() => usersKey(''), /APP_KEY_PREFIX is required/);
});

test('diffUsers detects a single field change and nothing else', () => {
  const a = [{ id: 'x', email: 'a@b' }, { id: 'y', email: 'c@d' }];
  const b = [{ id: 'x', email: 'NEW@b' }, { id: 'y', email: 'c@d' }];
  assert.deepEqual(diffUsers(a, b), [{ id: 'x', field: 'email', from: 'a@b', to: 'NEW@b' }]);
});

// ── Dry-run ─────────────────────────────────────────────────────────────────
test('dry-run reports the change, writes a backup, and does NOT modify Redis', async () => {
  const { store } = seed();
  const before = store.get(KEY);
  const bk = captureBackup();
  const r = await runMigration({ env: ENV, write: false, fetchImpl: makeFetch(store), writeFile: bk.writeFile, now: FIXED_NOW, log: () => {} });

  assert.equal(r.mode, 'dry-run');
  assert.equal(r.wrote, false);
  assert.equal(r.key, KEY);
  assert.deepEqual(r.diff, [{ id: TARGET_ID, field: 'email', from: OLD_EMAIL, to: NEW_EMAIL }]);
  assert.equal(store.get(KEY), before, 'Redis store is unchanged in dry-run');
  assert.equal(bk.calls.length, 1, 'backup written');
  assert.equal(bk.calls[0].content, before, 'backup is the exact pre-state blob');
  assert.match(bk.calls[0].path, /^users-backup-2026-06-19T18-30-00-000Z\.json$/);
});

// ── Write + verify ──────────────────────────────────────────────────────────
test('write mode changes ONLY coach-demo.email and verifies by re-read', async () => {
  const { store } = seed();
  const bk = captureBackup();
  const r = await runMigration({ env: ENV, write: true, fetchImpl: makeFetch(store), writeFile: bk.writeFile, now: FIXED_NOW, log: () => {} });

  assert.equal(r.mode, 'write');
  assert.equal(r.verified, true);
  const after = JSON.parse(store.get(KEY));
  assert.equal(after.find(u => u.id === TARGET_ID).email, NEW_EMAIL, 'coach-demo email updated');
  // every other user object is byte-identical to the seed
  const seedUsers = JSON.parse(bk.calls[0].content);
  for (const u of after) {
    if (u.id === TARGET_ID) continue;
    assert.deepEqual(u, seedUsers.find(s => s.id === u.id), `user ${u.id} untouched`);
  }
  // coach-demo: only email changed
  const demoBefore = seedUsers.find(s => s.id === TARGET_ID);
  const demoAfter = after.find(s => s.id === TARGET_ID);
  assert.deepEqual({ ...demoAfter, email: OLD_EMAIL }, demoBefore, 'only email field differs on coach-demo');
});

// ── Abort guards ────────────────────────────────────────────────────────────
test('aborts when no coach-demo exists', async () => {
  const store = new Map([[KEY, JSON.stringify([{ id: 'user_x', email: 'x@y.test' }])]]);
  await assert.rejects(() => runMigration({ env: ENV, write: true, fetchImpl: makeFetch(store), writeFile: () => {}, now: FIXED_NOW, log: () => {} }), /Expected exactly 1 user id="coach-demo", found 0/);
});

test('aborts when two coach-demo records exist', async () => {
  const store = new Map([[KEY, JSON.stringify([{ id: TARGET_ID, email: OLD_EMAIL }, { id: TARGET_ID, email: 'dupe@x.test' }])]]);
  await assert.rejects(() => runMigration({ env: ENV, write: true, fetchImpl: makeFetch(store), writeFile: () => {}, now: FIXED_NOW, log: () => {} }), /found 2/);
});

test('aborts (idempotent) when coach-demo.email is already the new value', async () => {
  const store = new Map([[KEY, JSON.stringify([{ id: TARGET_ID, email: NEW_EMAIL }])]]);
  await assert.rejects(() => runMigration({ env: ENV, write: true, fetchImpl: makeFetch(store), writeFile: () => {}, now: FIXED_NOW, log: () => {} }), /expected "simonbdodd@gmail.com"/);
});

test('aborts when another user also holds the old email', async () => {
  const { store } = seed([{ id: 'user_dupe', email: OLD_EMAIL }]);
  await assert.rejects(() => runMigration({ env: ENV, write: true, fetchImpl: makeFetch(store), writeFile: () => {}, now: FIXED_NOW, log: () => {} }), /other user\(s\) also hold/);
});

test('aborts when the users key is missing', async () => {
  const store = new Map();
  await assert.rejects(() => runMigration({ env: ENV, write: false, fetchImpl: makeFetch(store), writeFile: () => {}, now: FIXED_NOW, log: () => {} }), /Key not found/);
});

test('aborts when required env vars are missing', async () => {
  const { store } = seed();
  await assert.rejects(() => runMigration({ env: { APP_KEY_PREFIX: 'app' }, write: false, fetchImpl: makeFetch(store), writeFile: () => {}, now: FIXED_NOW, log: () => {} }), /Missing UPSTASH/);
  await assert.rejects(() => runMigration({ env: { UPSTASH_REDIS_REST_URL: 'u', UPSTASH_REDIS_REST_TOKEN: 't' }, write: false, fetchImpl: makeFetch(store), writeFile: () => {}, now: FIXED_NOW, log: () => {} }), /APP_KEY_PREFIX is required/);
});

test('post-write verify FAILS loudly if the re-read shows unexpected drift', async () => {
  const { store } = seed();
  // Tamper the SECOND GET (post-write re-read) to inject an extra change on another user.
  const fetchImpl = makeFetch(store, {
    tamperOnRead: (raw, reads) => {
      if (reads === 2 && raw) { const arr = JSON.parse(raw); arr[1].email = 'HACKED@x.test'; return JSON.stringify(arr); }
      return raw;
    },
  });
  await assert.rejects(
    () => runMigration({ env: ENV, write: true, fetchImpl, writeFile: () => {}, now: FIXED_NOW, log: () => {} }),
    /POST-WRITE VERIFY FAILED/,
  );
});

// ── Rollback ────────────────────────────────────────────────────────────────
test('rollback restores the users key byte-for-byte from a backup blob', async () => {
  const { store } = seed();
  const backup = store.get(KEY);            // pristine pre-state
  // simulate a (bad) mutation
  store.set(KEY, JSON.stringify([{ id: TARGET_ID, email: 'oops@x.test' }]));
  const r = await runRollback({ env: ENV, backupContent: backup, fetchImpl: makeFetch(store), log: () => {} });
  assert.equal(r.restored, true);
  assert.equal(store.get(KEY), backup, 'key restored to the exact backup blob');
});

test('rollback refuses a non-array backup', async () => {
  const { store } = seed();
  await assert.rejects(() => runRollback({ env: ENV, backupContent: '{"not":"array"}', fetchImpl: makeFetch(store), log: () => {} }), /not a JSON array/);
});
