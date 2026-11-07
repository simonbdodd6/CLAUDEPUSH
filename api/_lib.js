// api/_lib.js — Subscription store backed by Upstash Redis
// Subscriptions survive serverless cold-starts and multiple instances.
//
// INTEGRITY (2026-11-06). Every push subscription of every club lives in ONE
// list that writers read, filter and write back whole. Two things used to make
// that list fragile:
//   - load() answered [] when storage FAILED, exactly as it does when the list
//     is genuinely empty. A writer that read during a partial outage (the GET
//     refused, the SET accepted) then saved its filtered "[]" over every
//     club's devices. Same class as the availability wipe of 2026-10-14.
//   - every writer was an unserialised read-modify-write, so two writers in
//     the same window (a device subscribing while a send pruned a dead
//     endpoint) each read the same version and the second save erased the
//     first.
// Now: load() throws the storage error (never [] on failure), save() is fenced
// behind ONE lock (Build 135's withStoreLock), and pruning re-reads under that
// lock so a device registered since the send is kept.

import { kvGet, kvSet } from './_kv.js';
import { key, legacyKey } from './_keys.js';
import { withStoreLock, assertStoreLockHeld } from './_lock.js';

export const SUBS_KEY = key('subscriptions');
const LEGACY_SUBS_KEY = legacyKey('subscriptions');

/** The one lock every subscription-list write holds. */
export const SUBSCRIPTIONS_LOCK = 'push:subscriptions';

export function withSubscriptionsLock(fn) {
  return withStoreLock(SUBSCRIPTIONS_LOCK, fn, {
    busyMessage: 'Notification devices are busy — please try again in a moment',
  });
}

/** The storage error _kv.js throws (status 503, a fixed client-safe message). */
export function isStorageUnavailable(error) {
  return error?.code === 'STORAGE_UNAVAILABLE';
}

/** A lock that stayed busy for the whole bounded wait (status 503, code busy). */
export function isSubscriptionsBusy(error) {
  return error?.code === 'busy';
}

/**
 * Load all stored push subscriptions from Redis.
 *
 * Returns [] ONLY for a list that is genuinely empty. A storage failure is
 * thrown (the STORAGE_UNAVAILABLE error from _kv.js) so no caller can mistake
 * an unreadable list for an empty one and write that reading back.
 *
 * Legacy fallback is intentional: deployed pilot devices subscribed before the
 * new app: namespace must remain reachable during this migration. It is
 * consulted only when the primary key is ABSENT. A primary read that FAILS
 * throws at once — falling through to the legacy list would hand a writer a
 * stale base to save over the real one, which is the overwrite this prevents.
 */
export async function load() {
  const primary = await kvGet(SUBS_KEY);
  if (Array.isArray(primary)) return primary;
  const legacy = await kvGet(LEGACY_SUBS_KEY);
  return Array.isArray(legacy) ? legacy : [];
}

/**
 * Persist the subscription list to Redis. Fenced: refused outside the
 * subscriptions lock (500, write_outside_lock) and refused when the lock is no
 * longer ours (409) — an unlocked writer is exactly the bug this exists to stop.
 */
export async function save(subs) {
  await assertStoreLockHeld(SUBSCRIPTIONS_LOCK);
  await kvSet(SUBS_KEY, subs);
}

/**
 * Remove endpoints a push service has rejected for good (404 / 410). The list
 * is RE-READ under the lock, so a device registered since the send that found
 * them is kept, and the filtered list is saved only when something was
 * removed. Throws on a failed read or a busy lock: nothing is written then.
 */
export async function pruneSubscriptions(endpoints) {
  const gone = endpoints instanceof Set ? endpoints : new Set(endpoints || []);
  if (!gone.size) return { removed: 0 };
  return withSubscriptionsLock(async () => {
    const fresh = await load();
    const kept = fresh.filter(item => !gone.has(item?.subscription?.endpoint));
    const removed = fresh.length - kept.length;
    if (removed > 0) await save(kept);
    return { removed };
  });
}

/**
 * The pruning policy every SEND path shares: the notifications have already
 * gone out, so a failed read or a busy lock skips the prune, is logged, and
 * never fails the send that already happened. Any other error still throws.
 */
export async function pruneSubscriptionsBestEffort(endpoints, where = 'push') {
  try {
    return await pruneSubscriptions(endpoints);
  } catch (error) {
    if (isStorageUnavailable(error) || isSubscriptionsBusy(error)) {
      console.warn(`[${where}] subscription pruning skipped — ${error.message}`);
      return { removed: 0, skipped: error.code };
    }
    throw error;
  }
}

// ── Club isolation for push delivery ────────────────────────────────────────
// Subscriptions live in this ONE global list with no teamId, while the roster /
// sessions / squad / club are namespaced per team. Every push send must be
// intersected with identity:team_members so it can only reach ACTIVE members of
// the sending club. These pure helpers are shared by api/push.js (manual send)
// and api/cron.js (weekly reminder + scheduled automations).

/**
 * Build the set of identity ids belonging to ACTIVE team members. Pass a teamId
 * to restrict to one club; omit it (null) to get the union of active members of
 * every club — used only by generic global sends that carry no club-specific
 * content, and which must still exclude non-members, removed members and
 * legacy / test / demo accounts.
 */
export function activeMemberIdSet(teamMembers = [], teamId = null) {
  return new Set(
    (Array.isArray(teamMembers) ? teamMembers : [])
      .filter(member => member.status === 'active' && (teamId == null || String(member.teamId) === String(teamId)))
      .map(member => String(member.userId))
  );
}

/**
 * Keep only the subscriptions whose user is in `memberIds`. A joined player's
 * subscription.userId equals their team_member.userId; playerId / legacyPlayerId
 * are also checked so legacy-id subscriptions still resolve to their member.
 */
export function subscriptionsForMembers(subscriptions = [], memberIds) {
  const ids = memberIds instanceof Set ? memberIds : new Set(memberIds || []);
  return (Array.isArray(subscriptions) ? subscriptions : []).filter(item =>
    [item.userId, item.playerId, item.legacyPlayerId].some(value => value && ids.has(String(value)))
  );
}

/**
 * Return only the subscriptions whose user is an ACTIVE member of `teamId`.
 * The single chokepoint every club-scoped push send goes through.
 */
export function clubMemberSubscriptions(subscriptions, teamMembers, teamId) {
  return subscriptionsForMembers(subscriptions, activeMemberIdSet(teamMembers, teamId));
}
