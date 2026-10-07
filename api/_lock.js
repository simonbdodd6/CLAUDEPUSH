/**
 * ONE WRITE LOCK FOR EVERY SHARED READ-MODIFY-WRITE (Build 135).
 *
 * The stores that matter most are single JSON values rewritten whole: the
 * identity arrays (users, teams, members, profiles, sessions, reset and
 * verification tokens), the club's invitation list, the chat conversation
 * index and each conversation's message list, each club's medical record.
 * Every writer reads the value, changes it in memory and saves it back, so two
 * writers inside the same window each read the same version and the second
 * save silently erased the first — a member lost, a removed member revived, a
 * session dropped, a message gone, a medical update undone. Only availability
 * was protected (Build 101's per-session lock).
 *
 * This is that lock, generalised — the same primitive, not a second system:
 *
 *   ACQUIRE  SET <lockKey> <token> NX EX <ttl>  — atomic in Redis, so it holds
 *            across separate server executions and instances, not just one
 *            process. Bounded wait with jitter; then FAIL CLOSED (503, busy):
 *            nothing is written unserialised.
 *   HOLD     re-entrant within ONE call chain (AsyncLocalStorage), so a locked
 *            writer may call another locked writer of the same store.
 *   FENCE    assertStoreLockHeld() before every save: the token must still be
 *            ours. A holder that outlived its TTL (another writer may now hold
 *            the lock) is refused with 409 rather than writing over them.
 *   RELEASE  only our own token; an expired lock taken by another writer is
 *            theirs. The TTL frees a lock whose holder died mid-write.
 *
 * A save attempted OUTSIDE its lock is refused (500, write_outside_lock): an
 * unlocked writer is exactly the bug this exists to prevent, so it fails loud
 * in tests rather than racing quietly in production.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { kvSetNX, kvGet, kvDel } from './_kv.js';
import { key } from './_keys.js';

const held = new AsyncLocalStorage();   // Map<lockName, { token, lockKey }>

const DEFAULT_TTL_SECONDS = 10;
const DEFAULT_WAIT_MS = 4000;

export function storeLockKey(name) {
  return key(`lock:${name}`);
}

function lockError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/** True when THIS call chain holds the named lock (no storage round trip). */
export function storeLockHeld(name) {
  return Boolean(held.getStore()?.has(name));
}

/**
 * Run fn holding the named lock. Options:
 *   lockKey      — an existing key to use (availability keeps its own name)
 *   ttlSeconds   — lock lifetime (a dead holder frees it after this)
 *   waitMs       — how long to wait for a busy lock before failing closed
 *   busyMessage  — the 503 text a client sees when the lock stays busy
 */
export async function withStoreLock(name, fn, opts = {}) {
  const current = held.getStore();
  if (current?.has(name)) return fn();                       // re-entrant
  const lockKey = opts.lockKey || storeLockKey(name);
  const ttlSeconds = opts.ttlSeconds || DEFAULT_TTL_SECONDS;
  const waitMs = opts.waitMs ?? DEFAULT_WAIT_MS;
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const deadline = Date.now() + waitMs;
  let acquired = false;
  for (;;) {
    if (await kvSetNX(lockKey, token, ttlSeconds)) { acquired = true; break; }
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, 15 + Math.floor(Math.random() * 35)));
  }
  if (!acquired) {
    throw lockError(opts.busyMessage || 'Another change is being saved — please try again in a moment', 503, 'busy');
  }
  const next = new Map(current || []);
  next.set(name, { token, lockKey });
  try {
    return await held.run(next, fn);
  } finally {
    try { if ((await kvGet(lockKey)) === token) await kvDel(lockKey); } catch { /* the TTL will free it */ }
  }
}

/**
 * The fence every guarded save calls first. Outside the lock → refused (the
 * read it is based on was not serialised). Lock no longer ours → refused (a
 * newer writer may already have saved; ours is stale).
 */
export async function assertStoreLockHeld(name) {
  const entry = held.getStore()?.get(name);
  if (!entry) {
    throw lockError(`Internal error: a ${name} write was attempted outside its lock`, 500, 'write_outside_lock');
  }
  let current;
  try { current = await kvGet(entry.lockKey); } catch (error) { throw error; }
  if (current !== entry.token) {
    throw lockError('This change conflicted with another one saved at the same time — please try again', 409, 'conflict');
  }
}

// ─── The identity lock ─────────────────────────────────────────────────────
// ONE lock for the identity arrays and the invitation lists: they are global
// values written together (a claim writes users, members, profiles, sessions
// and the invite in one flow), so a single serialising lock is both correct
// and simple. Request READ paths never take it — only writers do.
export const IDENTITY_LOCK = 'identity';

export function withIdentityLock(fn) {
  return withStoreLock(IDENTITY_LOCK, fn, {
    ttlSeconds: 15, waitMs: 6000,
    busyMessage: 'Account data is busy — please try again in a moment',
  });
}
