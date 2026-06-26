// api/_lib.js — Subscription store backed by Upstash Redis
// Subscriptions now survive serverless cold-starts and multiple instances.
// Falls back to empty array if Redis is unavailable (graceful degradation).

import { kvGet, kvSet } from './_kv.js';
import { key, legacyKey } from './_keys.js';

export const SUBS_KEY = key('subscriptions');
const LEGACY_SUBS_KEY = legacyKey('subscriptions');

/**
 * Load all stored push subscriptions from Redis.
 * Returns [] if Redis is down or no subscriptions stored yet.
 */
export async function load() {
  try {
    // Legacy fallback is intentional: deployed pilot devices subscribed before
    // the new app: namespace must remain reachable during this migration.
    const primary = await kvGet(SUBS_KEY);
    const subs = Array.isArray(primary) ? primary : await kvGet(LEGACY_SUBS_KEY);
    return Array.isArray(subs) ? subs : [];
  } catch (err) {
    console.error('[_lib] load() failed:', err.message);
    return [];
  }
}

/**
 * Persist the subscription list to Redis.
 */
export async function save(subs) {
  await kvSet(SUBS_KEY, subs);
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
