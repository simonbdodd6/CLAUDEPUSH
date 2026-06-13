// Executive Knowledge Graph — the Universal Entity model.
//
// An entity is a thin CANONICAL NODE. It does NOT hold the domain record — that
// stays in its owning engine (memory-engine player, lead store, venue store…). The
// entity references the source of truth via `ref:{engine, externalId}` and carries
// only the cross-cutting fields every product needs to connect and reason about it.
//
// This is why the graph is not "another memory engine": it references, never copies.

import { entityId } from './id.js';
import { ENTITY_STATUS } from './constants.js';
import { InvalidEntityError } from './errors.js';

/**
 * @typedef {object} EntitySpec
 * @property {string} type        required, any non-empty string
 * @property {string} domain      required, any non-empty string
 * @property {string} [externalId] natural key in the owning engine (used for identity)
 * @property {object} [ref]        { engine, externalId } pointer to the source of truth
 * @property {string} [owner]
 * @property {string} [label]
 * @property {string} [status]
 * @property {number} [confidence] 0–100
 * @property {object} [attributes] opaque domain-specific extras
 * @property {Array}  [citations]
 * @property {Array}  [featureFlags] [{ key, enabled }]
 */

export function validateEntitySpec(spec) {
  if (!spec || typeof spec !== 'object') throw new InvalidEntityError('Entity spec must be an object.');
  if (!nonEmpty(spec.type))   throw new InvalidEntityError('Entity requires a non-empty `type`.');
  if (!nonEmpty(spec.domain)) throw new InvalidEntityError('Entity requires a non-empty `domain`.');
  const key = spec.externalId ?? spec.ref?.externalId ?? spec.label;
  if (!nonEmpty(key)) throw new InvalidEntityError('Entity requires an externalId, ref.externalId, or label as its natural key.');
}

/**
 * Build a canonical entity. Deterministic: id depends only on (domain, type, key).
 * @param {EntitySpec} spec
 * @param {object} [opts] { now }  now: ISO string (injected clock for determinism)
 */
export function createEntity(spec, opts = {}) {
  validateEntitySpec(spec);
  const now = opts.now ?? new Date().toISOString();
  const externalId = spec.externalId ?? spec.ref?.externalId ?? spec.label;
  const id = entityId(spec.domain, spec.type, externalId);

  return {
    id,
    type:   spec.type,
    domain: spec.domain,
    ref:    spec.ref ?? (spec.engine ? { engine: spec.engine, externalId } : { engine: null, externalId }),
    owner:  spec.owner ?? null,
    label:  spec.label ?? externalId,
    status: spec.status ?? ENTITY_STATUS.ACTIVE,
    confidence: numOrNull(spec.confidence),
    created: now,
    updated: now,
    version: 1,
    // Cross-cutting connective fields every product needs:
    timeline:        [{ at: now, event: 'created', by: spec.owner ?? null, detail: spec.label ?? null }],
    citations:       Array.isArray(spec.citations) ? [...spec.citations] : [],
    approvalHistory: [],
    featureFlags:    Array.isArray(spec.featureFlags) ? [...spec.featureFlags] : [],
    attributes:      spec.attributes ?? {},
  };
}

/**
 * Produce the NEXT version of an entity with a set of changes applied. Pure: returns
 * a new object; never mutates the input. Bumps version + updated + records a timeline
 * event. Identity (id/type/domain/created) is immutable.
 */
export function applyEntityUpdate(entity, changes = {}, opts = {}) {
  const now = opts.now ?? new Date().toISOString();
  const immutable = new Set(['id', 'type', 'domain', 'created', 'version', 'ref']);
  const next = { ...entity };
  for (const [k, v] of Object.entries(changes)) {
    if (immutable.has(k)) continue;
    next[k] = v;
  }
  next.updated = now;
  next.version = (entity.version ?? 1) + 1;
  next.timeline = [
    ...(entity.timeline ?? []),
    { at: now, event: opts.event ?? 'updated', by: opts.by ?? null, detail: opts.detail ?? Object.keys(changes).join(', ') },
  ];
  return next;
}

function nonEmpty(v) { return typeof v === 'string' ? v.trim().length > 0 : v != null; }
function numOrNull(v) { return Number.isFinite(v) ? v : null; }
