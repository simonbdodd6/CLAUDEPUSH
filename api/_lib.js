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
