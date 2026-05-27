// api/_lib.js — Subscription store backed by Upstash Redis
// Subscriptions now survive serverless cold-starts and multiple instances.
// Falls back to empty array if Redis is unavailable (graceful degradation).

import { kvGet, kvSet } from './_kv.js';

export const SUBS_KEY = 'ce:subscriptions';

/**
 * Load all stored push subscriptions from Redis.
 * Returns [] if Redis is down or no subscriptions stored yet.
 */
export async function load() {
  try {
    const subs = await kvGet(SUBS_KEY);
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
