#!/usr/bin/env node
/**
 * ONE-TIME production migration — Identity Phase 3.
 *
 * Frees the human email `simonbdodd@gmail.com` from the legacy `coach-demo`
 * account by rewriting ONLY `coach-demo.email`. Pair with the Phase 2 Vercel env
 * change (COACH_DEMO_EMAIL -> demo.coach@coachseye.test + redeploy).
 *
 * SAFE BY DEFAULT:
 *   - Dry-run unless `--write` is passed.
 *   - Reads ONLY `<APP_KEY_PREFIX>:identity:users`. No other key is read/written.
 *   - Requires APP_KEY_PREFIX explicitly (refuses to guess the namespace).
 *   - Backs up the full users blob to a timestamped local file before anything.
 *   - Refuses to proceed unless: exactly one id="coach-demo", its email is the
 *     expected OLD email, and no other user holds the OLD email.
 *   - After write, re-reads and asserts EXACTLY one field changed.
 *
 * Usage:
 *   node scripts/migrate-coach-demo-email.mjs                     # dry-run
 *   node scripts/migrate-coach-demo-email.mjs --write            # apply
 *   node scripts/migrate-coach-demo-email.mjs --rollback <file>  # restore backup
 *
 * Required env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, APP_KEY_PREFIX
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const OLD_EMAIL = 'simonbdodd@gmail.com';
export const NEW_EMAIL = 'demo.coach@coachseye.test';
export const TARGET_ID = 'coach-demo';

const norm = e => String(e || '').trim().toLowerCase();

export function usersKey(prefix) {
  const p = String(prefix || '').replace(/:+$/, '');
  if (!p) throw new Error('APP_KEY_PREFIX is required (refusing to guess the key namespace)');
  return `${p}:identity:users`;
}

/** Single-command Upstash REST caller, mirroring api/_kv.js. */
export function makeRedis({ url, token, fetchImpl }) {
  if (!url || !token) throw new Error('Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN');
  return async function redis(...cmd) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
    const { result, error } = await res.json();
    if (error) throw new Error(`Redis error: ${error}`);
    return result;
  };
}

/** Index-wise structural diff of two user arrays. Catches field/length/order changes. */
export function diffUsers(before = [], after = []) {
  const out = [];
  if (before.length !== after.length) {
    out.push({ id: '<array>', field: 'length', from: before.length, to: after.length });
    return out;
  }
  for (let i = 0; i < before.length; i++) {
    const a = before[i] || {};
    const b = after[i] || {};
    if (String(a.id || '') !== String(b.id || '')) {
      out.push({ id: a.id || b.id || `#${i}`, field: 'id/order', from: a.id, to: b.id });
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
        out.push({ id: a.id || `#${i}`, field: k, from: a[k], to: b[k] });
      }
    }
  }
  return out;
}

function isExpectedDiff(diff) {
  return diff.length === 1
    && diff[0].id === TARGET_ID
    && diff[0].field === 'email'
    && norm(diff[0].from) === norm(OLD_EMAIL)
    && diff[0].to === NEW_EMAIL;
}

export async function runMigration({
  env = process.env,
  write = false,
  fetchImpl = globalThis.fetch,
  writeFile = (path, content) => writeFileSync(path, content),
  now = () => new Date(),
  log = console.log,
} = {}) {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN');
  const key = usersKey(env.APP_KEY_PREFIX);
  const redis = makeRedis({ url, token, fetchImpl });

  log(`[migrate] key  = ${key}`);
  log(`[migrate] mode = ${write ? 'WRITE' : 'DRY-RUN'}`);

  // ── Read (only the users key) ──
  const rawBefore = await redis('GET', key);
  if (rawBefore == null) throw new Error(`Key not found: ${key} (wrong APP_KEY_PREFIX or URL?)`);
  let users;
  try { users = JSON.parse(rawBefore); } catch { throw new Error('users key is not valid JSON'); }
  if (!Array.isArray(users)) throw new Error('users key is not a JSON array');

  // ── Pre-flight invariants (refuse on any surprise) ──
  const demos = users.filter(u => u && u.id === TARGET_ID);
  if (demos.length !== 1) throw new Error(`Expected exactly 1 user id="${TARGET_ID}", found ${demos.length} — aborting`);
  if (norm(demos[0].email) !== norm(OLD_EMAIL)) {
    throw new Error(`coach-demo.email is "${demos[0].email}", expected "${OLD_EMAIL}" — aborting (already migrated or unexpected)`);
  }
  const others = users.filter(u => u && u.id !== TARGET_ID && norm(u.email) === norm(OLD_EMAIL));
  if (others.length > 0) throw new Error(`${others.length} other user(s) also hold ${OLD_EMAIL} — aborting (manual review needed)`);

  // ── Backup (always; the rollback artifact) ──
  const stamp = now().toISOString().replace(/[:.]/g, '-');
  const backupPath = `users-backup-${stamp}.json`;
  writeFile(backupPath, rawBefore);
  log(`[migrate] backup written: ${backupPath} (${rawBefore.length} bytes)`);

  // ── Compute change: ONLY coach-demo.email ──
  const after = users.map(u => (u && u.id === TARGET_ID ? { ...u, email: NEW_EMAIL } : u));
  const diff = diffUsers(users, after);
  if (!isExpectedDiff(diff)) throw new Error(`Refusing: computed diff is not exactly coach-demo.email: ${JSON.stringify(diff)}`);
  log(`[migrate] change: coach-demo.email "${OLD_EMAIL}" -> "${NEW_EMAIL}"  (1 field, 0 other changes)`);

  if (!write) {
    log('[migrate] DRY-RUN complete — NO write performed. Re-run with --write to apply.');
    return { mode: 'dry-run', key, backupPath, diff, wrote: false };
  }

  // ── Write, then re-read and verify ──
  await redis('SET', key, JSON.stringify(after));
  log('[migrate] write performed; re-reading to verify…');
  const rawAfter = await redis('GET', key);
  const usersAfter = JSON.parse(rawAfter);
  const verifyDiff = diffUsers(users, usersAfter);
  if (!isExpectedDiff(verifyDiff)) {
    throw new Error(`POST-WRITE VERIFY FAILED (diff=${JSON.stringify(verifyDiff)}). ROLL BACK: node scripts/migrate-coach-demo-email.mjs --rollback ${backupPath}`);
  }
  log(`[migrate] VERIFIED: only coach-demo.email changed. Rollback file: ${backupPath}`);
  return { mode: 'write', key, backupPath, diff: verifyDiff, wrote: true, verified: true };
}

export async function runRollback({
  env = process.env,
  backupContent,
  fetchImpl = globalThis.fetch,
  log = console.log,
} = {}) {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN');
  const key = usersKey(env.APP_KEY_PREFIX);
  const parsed = JSON.parse(backupContent);            // sanity: must be a JSON array
  if (!Array.isArray(parsed)) throw new Error('Backup is not a JSON array — refusing to restore');
  const redis = makeRedis({ url, token, fetchImpl });
  await redis('SET', key, backupContent);              // byte-faithful restore of the original blob
  log(`[rollback] restored ${key} from backup (${parsed.length} users)`);
  return { restored: true, key, count: parsed.length };
}

// ── CLI entry (never runs on import; guarded so tests can import safely) ──
const isCli = (() => { try { return import.meta.url === pathToFileURL(process.argv[1] || '').href; } catch { return false; } })();
if (isCli) {
  const args = process.argv.slice(2);
  (async () => {
    try {
      if (args[0] === '--rollback') {
        const file = args[1];
        if (!file) throw new Error('Usage: --rollback <backup-file>');
        await runRollback({ backupContent: readFileSync(file, 'utf8') });
      } else {
        await runMigration({ write: args.includes('--write') });
      }
    } catch (e) {
      console.error(`[migrate] ERROR: ${e.message}`);
      process.exitCode = 1;
    }
  })();
}
