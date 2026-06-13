// Executive Knowledge Graph — canonical registry.
//
// Holds every entity and relationship EXACTLY ONCE (keyed by deterministic id) and
// keeps the full version history of each. Upsert semantics enforce the platform
// rules: re-adding the same logical entity/relationship updates and versions it
// rather than creating a duplicate.
//
// Persistence is pluggable: in-memory by default, with an optional append-only
// journal sink (the PIF-2 ledger pattern) for durability. The registry never does
// file I/O itself.

import { createEntity, applyEntityUpdate } from './entity.js';
import { createRelationship, applyRelationshipUpdate, isActiveAt } from './relationship.js';
import { EntityNotFoundError } from './errors.js';

export class KnowledgeRegistry {
  constructor(opts = {}) {
    this._entities = new Map();           // id → current entity
    this._relationships = new Map();      // id → current relationship
    this._entityHistory = new Map();      // id → [versions]
    this._relHistory = new Map();         // id → [versions]
    this._incident = new Map();           // entityId → Set(relationshipId)
    this._clock = opts.clock ?? (() => new Date().toISOString());
    this._sink = opts.sink ?? null;       // optional { append(record) }
  }

  // ── Entities ────────────────────────────────────────────────────────────────
  upsertEntity(spec, opts = {}) {
    const now = opts.now ?? this._clock();
    const candidate = createEntity(spec, { now });
    const existing = this._entities.get(candidate.id);

    let entity;
    if (!existing) {
      entity = candidate;
      this._pushHistory(this._entityHistory, entity.id, entity);
      this._journal('entity.created', entity);
    } else {
      // Merge: only update the mutable, caller-supplied fields; bump version.
      const changes = pickChanges(existing, spec);
      if (Object.keys(changes).length === 0) return existing;     // idempotent, no-op
      entity = applyEntityUpdate(existing, changes, { now, event: 'upserted' });
      this._pushHistory(this._entityHistory, entity.id, entity);
      this._journal('entity.updated', entity);
    }
    this._entities.set(entity.id, entity);
    if (!this._incident.has(entity.id)) this._incident.set(entity.id, new Set());
    return entity;
  }

  getEntity(id, { withRelationships = true } = {}) {
    const e = this._entities.get(id);
    if (!e) return null;
    if (!withRelationships) return e;
    return { ...e, relationships: [...(this._incident.get(id) ?? [])] };
  }

  requireEntity(id) {
    const e = this.getEntity(id);
    if (!e) throw new EntityNotFoundError(id);
    return e;
  }

  hasEntity(id) { return this._entities.has(id); }

  entities() { return [...this._entities.values()].map(e => ({ ...e, relationships: [...(this._incident.get(e.id) ?? [])] })); }

  entitiesByType(type)   { return this.entities().filter(e => e.type === type); }
  entitiesByDomain(dom)  { return this.entities().filter(e => e.domain === dom); }
  entityHistory(id)      { return [...(this._entityHistory.get(id) ?? [])]; }

  // Append a lifecycle / approval / citation change as a new version.
  amendEntity(id, changes, opts = {}) {
    const existing = this._entities.get(id);
    if (!existing) throw new EntityNotFoundError(id);
    const now = opts.now ?? this._clock();
    const next = applyEntityUpdate(existing, changes, { now, event: opts.event ?? 'amended', by: opts.by, detail: opts.detail });
    this._entities.set(id, next);
    this._pushHistory(this._entityHistory, id, next);
    this._journal('entity.amended', next);
    return this.getEntity(id);
  }

  linkApproval(id, approval, opts = {}) {
    const e = this._entities.get(id);
    if (!e) throw new EntityNotFoundError(id);
    const history = [...(e.approvalHistory ?? []), {
      approvalId: approval.approvalId ?? null,
      state:      approval.state ?? null,
      reviewer:   approval.reviewer ?? null,
      at:         approval.at ?? approval.reviewedAt ?? (opts.now ?? this._clock()),
    }];
    return this.amendEntity(id, { approvalHistory: history }, { now: opts.now, event: 'approval_linked', detail: approval.state });
  }

  // ── Relationships ─────────────────────────────────────────────────────────────
  upsertRelationship(spec, opts = {}) {
    const now = opts.now ?? this._clock();
    const candidate = createRelationship(spec, { now });
    const existing = this._relationships.get(candidate.id);

    let rel;
    if (!existing) {
      rel = candidate;
      this._pushHistory(this._relHistory, rel.id, rel);
      this._journal('relationship.created', rel);
    } else {
      const changes = pickRelChanges(existing, spec);
      if (Object.keys(changes).length === 0) return existing;
      rel = applyRelationshipUpdate(existing, changes, { now });
      this._pushHistory(this._relHistory, rel.id, rel);
      this._journal('relationship.updated', rel);
    }
    this._relationships.set(rel.id, rel);
    this._index(rel);
    return rel;
  }

  getRelationship(id) { return this._relationships.get(id) ?? null; }
  relationships() { return [...this._relationships.values()]; }
  relationshipsByType(type) { return this.relationships().filter(r => r.type === type); }
  relationshipHistory(id) { return [...(this._relHistory.get(id) ?? [])]; }

  // Temporal view: relationships valid at a given instant.
  relationshipsAsOf(isoInstant) { return this.relationships().filter(r => isActiveAt(r, isoInstant)); }

  endRelationship(id, opts = {}) {
    const r = this._relationships.get(id);
    if (!r) return null;
    const now = opts.now ?? this._clock();
    const next = applyRelationshipUpdate(r, { status: 'ended', validUntil: opts.at ?? now }, { now });
    this._relationships.set(id, next);
    this._pushHistory(this._relHistory, id, next);
    this._journal('relationship.ended', next);
    return next;
  }

  // ── Incident index (entity → its edges) ───────────────────────────────────────
  incident(entityId) { return [...(this._incident.get(entityId) ?? [])].map(rid => this._relationships.get(rid)).filter(Boolean); }

  stats() {
    return {
      entities: this._entities.size,
      relationships: this._relationships.size,
      entityVersions: sum([...this._entityHistory.values()].map(v => v.length)),
      relationshipVersions: sum([...this._relHistory.values()].map(v => v.length)),
      byType: countBy([...this._entities.values()], e => e.type),
      byDomain: countBy([...this._entities.values()], e => e.domain),
      byRelationshipType: countBy([...this._relationships.values()], r => r.type),
    };
  }

  // ── internals ─────────────────────────────────────────────────────────────────
  _index(rel) {
    for (const node of [rel.from, rel.to]) {
      if (!this._incident.has(node)) this._incident.set(node, new Set());
      this._incident.get(node).add(rel.id);
    }
  }
  _pushHistory(map, id, version) {
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(deepFreeze({ ...version }));
  }
  _journal(event, payload) {
    if (this._sink && typeof this._sink.append === 'function') {
      try { this._sink.append({ event, id: payload.id, version: payload.version, at: payload.updated ?? payload.created }); }
      catch { /* durability best-effort */ }
    }
  }
}

// Only consider caller-supplied, mutable fields when deciding if an upsert changed.
function pickChanges(existing, spec) {
  const changes = {};
  const fields = ['owner', 'label', 'status', 'confidence', 'attributes', 'ref'];
  for (const f of fields) {
    if (f in spec && JSON.stringify(spec[f]) !== JSON.stringify(existing[f])) changes[f] = spec[f];
  }
  return changes;
}
function pickRelChanges(existing, spec) {
  const changes = {};
  const fields = ['confidence', 'status', 'validFrom', 'validUntil', 'directed', 'attributes'];
  for (const f of fields) {
    if (f in spec && JSON.stringify(spec[f]) !== JSON.stringify(existing[f])) changes[f] = spec[f];
  }
  return changes;
}

function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
function countBy(arr, fn) { const o = {}; for (const x of arr) { const k = fn(x); o[k] = (o[k] ?? 0) + 1; } return o; }
function deepFreeze(o) { return Object.freeze(o); }
