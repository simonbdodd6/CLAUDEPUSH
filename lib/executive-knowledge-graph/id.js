// Executive Knowledge Graph — deterministic identity.
//
// Identity is CONTENT-DERIVED, never random. The same logical entity always hashes
// to the same id, and the same (from, type, to) triple always hashes to the same
// relationship id. This is what structurally guarantees the platform rules:
//   • no duplicate entities   (same natural key → same id → upsert, not insert)
//   • no duplicate ids        (deterministic hash)
//   • no duplicate relationships (same triple → same id)
//
// No Math.random(), no Date.now() — identity must be reproducible across processes.

import { createHash } from 'crypto';

function hash(str) {
  return createHash('sha1').update(String(str)).digest('hex').slice(0, 16);
}

// Canonicalise a natural key so trivial differences don't create distinct ids.
function canon(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Deterministic entity id from its natural key.
 * @param {string} domain
 * @param {string} type
 * @param {string} naturalKey  a stable external identifier (externalId, slug, email…)
 */
export function entityId(domain, type, naturalKey) {
  return `ent_${hash(`${canon(domain)}|${canon(type)}|${canon(naturalKey)}`)}`;
}

/**
 * Deterministic relationship id from its triple. Direction-aware: from|type|to.
 */
export function relationshipId(fromId, type, toId) {
  return `rel_${hash(`${fromId}|${canon(type)}|${toId}`)}`;
}

export { hash as _hash };
