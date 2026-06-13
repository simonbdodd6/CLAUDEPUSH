// Executive Knowledge Graph — the Relationship (edge) model.
//
// A relationship connects two entities by id. It is temporal (validFrom / validUntil)
// and versioned, so the graph can answer "how were these connected as of date X" and
// keep a full history of how connections change over time.

import { relationshipId } from './id.js';
import { RELATIONSHIP_STATUS } from './constants.js';
import { InvalidRelationshipError } from './errors.js';

/**
 * @typedef {object} RelationshipSpec
 * @property {string} type    required, any non-empty string
 * @property {string} from    entity id
 * @property {string} to      entity id
 * @property {boolean} [directed=true]
 * @property {number}  [confidence]
 * @property {string}  [validFrom]  ISO; defaults to `now`
 * @property {string}  [validUntil] ISO or null (open-ended)
 * @property {Array}   [citations]
 * @property {object}  [attributes]
 */

export function validateRelationshipSpec(spec) {
  if (!spec || typeof spec !== 'object') throw new InvalidRelationshipError('Relationship spec must be an object.');
  if (!nonEmpty(spec.type)) throw new InvalidRelationshipError('Relationship requires a non-empty `type`.');
  if (!nonEmpty(spec.from)) throw new InvalidRelationshipError('Relationship requires `from`.');
  if (!nonEmpty(spec.to))   throw new InvalidRelationshipError('Relationship requires `to`.');
  if (spec.from === spec.to) throw new InvalidRelationshipError('Relationship cannot connect an entity to itself.');
}

export function createRelationship(spec, opts = {}) {
  validateRelationshipSpec(spec);
  const now = opts.now ?? new Date().toISOString();
  const id = relationshipId(spec.from, spec.type, spec.to);
  return {
    id,
    type:       spec.type,
    from:       spec.from,
    to:         spec.to,
    directed:   spec.directed !== false,
    confidence: numOrNull(spec.confidence),
    status:     spec.status ?? RELATIONSHIP_STATUS.ACTIVE,
    validFrom:  spec.validFrom ?? now,
    validUntil: spec.validUntil ?? null,
    created:    now,
    updated:    now,
    version:    1,
    citations:  Array.isArray(spec.citations) ? [...spec.citations] : [],
    attributes: spec.attributes ?? {},
  };
}

/**
 * Next version of a relationship (e.g. ending it, re-confirming it, adding citations).
 * Pure. Identity (id/from/type/to/created) is immutable.
 */
export function applyRelationshipUpdate(rel, changes = {}, opts = {}) {
  const now = opts.now ?? new Date().toISOString();
  const immutable = new Set(['id', 'from', 'to', 'type', 'created', 'version']);
  const next = { ...rel };
  for (const [k, v] of Object.entries(changes)) {
    if (immutable.has(k)) continue;
    next[k] = v;
  }
  next.updated = now;
  next.version = (rel.version ?? 1) + 1;
  return next;
}

/** Is the relationship valid at the given ISO instant? */
export function isActiveAt(rel, isoInstant) {
  const t = Date.parse(isoInstant);
  if (!Number.isFinite(t)) return rel.status === RELATIONSHIP_STATUS.ACTIVE;
  const from = rel.validFrom ? Date.parse(rel.validFrom) : -Infinity;
  const until = rel.validUntil ? Date.parse(rel.validUntil) : Infinity;
  return t >= from && t < until;
}

function nonEmpty(v) { return typeof v === 'string' ? v.trim().length > 0 : v != null; }
function numOrNull(v) { return Number.isFinite(v) ? v : null; }
