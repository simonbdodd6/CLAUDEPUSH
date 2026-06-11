/**
 * AI Brain — Memory Store (M7)
 *
 * In-memory persistence layer for Memory objects.
 * Keyed by `${entityId}:${type}` — one memory per entity+type pair.
 *
 * Rules:
 *  - upsert() creates a new record on first write; updates in place on subsequent writes.
 *  - id and firstSeen are preserved across updates.
 *  - _version increments on every update.
 *  - Memories are never automatically deleted.
 */

import { randomUUID } from 'crypto'
import { MEMORY_SCHEMA_VERSION } from './memory-types.js'

// ── Store ─────────────────────────────────────────────────────────────────────

/** @type {Map<string, Memory>}  key = `${entityId}:${type}` */
const _byKey = new Map()

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Insert or update a memory.
 * On first write for a given entityId+type: assigns id, firstSeen, lastUpdated.
 * On subsequent writes: preserves id and firstSeen; increments _version.
 *
 * @param {object} spec
 * @param {string}   spec.type
 * @param {string}   spec.entityId
 * @param {string}   spec.title
 * @param {string}   spec.summary
 * @param {number}   spec.confidence
 * @param {number}   spec.strength
 * @param {string[]} spec.supportingTimelineEvents
 * @param {object}   spec.metadata
 * @returns {Memory}
 */
export function upsert({ type, entityId, title, summary, confidence, strength, supportingTimelineEvents = [], metadata = {} }) {
  const key      = `${entityId}:${type}`
  const existing = _byKey.get(key)
  const now      = new Date().toISOString()

  const clampedConfidence = Math.round(Math.min(100, Math.max(0,  confidence ?? 50)))
  const clampedStrength   = Math.round(Math.min(100, Math.max(1,  strength   ?? 10)))

  if (existing) {
    const updated = {
      ...existing,
      title,
      summary,
      confidence:               clampedConfidence,
      strength:                 clampedStrength,
      supportingTimelineEvents: [...supportingTimelineEvents],
      metadata:                 { ...metadata },
      lastUpdated:              now,
      _version:                 existing._version + 1,
    }
    _byKey.set(key, updated)
    return updated
  }

  const memory = {
    id:                       randomUUID(),
    schemaVersion:            MEMORY_SCHEMA_VERSION,
    _version:                 1,
    type,
    entityId,
    title,
    summary,
    confidence:               clampedConfidence,
    strength:                 clampedStrength,
    firstSeen:                now,
    lastUpdated:              now,
    supportingTimelineEvents: [...supportingTimelineEvents],
    metadata:                 { ...metadata },
  }
  _byKey.set(key, memory)
  return memory
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Return all memories for a given entityId.
 *
 * @param {string|null} entityId
 * @returns {Memory[]}
 */
export function getByEntity(entityId) {
  if (!entityId) return []
  const prefix = `${entityId}:`
  const result = []
  for (const [key, mem] of _byKey) {
    if (key.startsWith(prefix)) result.push(mem)
  }
  return result
}

/**
 * Return every memory in the store.
 *
 * @returns {Memory[]}
 */
export function getAll() {
  return Array.from(_byKey.values())
}

/**
 * Find a single memory by its UUID.
 *
 * @param {string} id
 * @returns {Memory|null}
 */
export function getById(id) {
  for (const mem of _byKey.values()) {
    if (mem.id === id) return mem
  }
  return null
}

/**
 * Total number of distinct memories in the store.
 *
 * @returns {number}
 */
export function count() {
  return _byKey.size
}

// ── Test helpers ──────────────────────────────────────────────────────────────

/** Remove all memories. For test use only — never called in production. */
export function _clear() {
  _byKey.clear()
}

/**
 * Store a complete pre-built memory object as-is (bypasses create/update logic).
 * For test use only — allows injecting memories with specific id, firstSeen, etc.
 *
 * @param {Memory} memory
 * @returns {Memory}
 */
export function _forceUpsert(memory) {
  const key = `${memory.entityId}:${memory.type}`
  const stored = { ...memory }
  _byKey.set(key, stored)
  return stored
}
