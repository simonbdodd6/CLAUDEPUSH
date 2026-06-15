// Platform Kernel — deterministic identity & idempotency helpers.
//
// Stable, content-derived ids used for deterministic event/insight/candidate
// ids and idempotency keys. No wall-clock, no randomness — identical input
// always yields identical output.

import { createHash } from 'crypto';

// Deterministic short hash of a string seed (sha256 hex, truncated).
export function stableHash(seed, length = 16) {
  return createHash('sha256').update(String(seed)).digest('hex').slice(0, length);
}

// Join key parts into a stable idempotency key (skips null/undefined parts).
export function buildIdempotencyKey(...parts) {
  return parts.filter(part => part != null).map(String).join(':');
}

// Lowercase, trimmed, space-collapsed slug — the convention used for name-derived
// reference ids.
export function slug(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '-');
}
