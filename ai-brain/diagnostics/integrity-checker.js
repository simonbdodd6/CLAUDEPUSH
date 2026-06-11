/**
 * AI Brain — Integrity Checker (M11)
 *
 * Cross-subsystem consistency validation.
 * Detects inconsistencies that can only be found by comparing two or more stores.
 *
 * Checks performed:
 *  - orphanObservations:   observations derived from entities not in the timeline
 *  - orphanMemories:       memories for entities with no timeline events
 *  - brokenTraces:         explanations citing observation IDs no longer derivable
 *  - missingExplanations:  RECOMMENDATION_SHOWN events with no explanation snapshot
 *  - duplicateIds:         duplicate IDs within each store
 *  - schemaMismatches:     records with unexpected schema versions
 *
 * All functions are pure readers — they never modify any store.
 * All functions are safe to call on empty stores.
 */

import { query as timelineQuery, EVENT_TYPE } from '../timeline.js'
import { getAll as memGetAll }                 from '../memory/memory-store.js'
import { observeAll }                          from '../observation/observation-engine.js'
import { listAll as expListAll }               from '../explain/explanation-engine.js'
import { MEMORY_SCHEMA_VERSION }               from '../memory/memory-types.js'
import { OBSERVATION_SCHEMA_VERSION }          from '../observation/observation-types.js'
import { EXPLANATION_SCHEMA_VERSION }          from '../explain/explanation-types.js'

const TIMELINE_SCAN_LIMIT = 5000

// ── Shared helper ─────────────────────────────────────────────────────────────

function buildTimelineEntitySet() {
  const { events } = timelineQuery({ limit: TIMELINE_SCAN_LIMIT })
  const ids = new Set()
  for (const ev of events) {
    if (ev.coachId)   ids.add(ev.coachId)
    if (ev.clubId)    ids.add(ev.clubId)
    if (ev.sessionId) ids.add(ev.sessionId)
    for (const eid of (ev.entities ?? [])) ids.add(eid)
  }
  return { ids, events }
}

// ── Orphan observations ───────────────────────────────────────────────────────

/**
 * Find observations derived from entities that have no timeline events.
 * Indicates memory was manually injected (e.g. via _forceUpsert) without
 * a corresponding timeline history.
 *
 * @returns {object[]}
 */
export function findOrphanObservations() {
  const obs = observeAll()
  if (obs.length === 0) return []

  const { ids: timelineEntityIds } = buildTimelineEntitySet()

  return obs
    .filter(o => o.entity?.id != null && !timelineEntityIds.has(o.entity.id))
    .map(o => ({
      observationId:   o.id,
      observationType: o.observationType,
      entityId:        o.entity.id,
      reason:          'Observation entity has no corresponding timeline events',
    }))
}

// ── Orphan memories ───────────────────────────────────────────────────────────

/**
 * Find memories for entities that have no timeline events.
 * Indicates the timeline was cleared after memory was populated, or memory
 * was manually injected without timeline backing.
 *
 * @returns {object[]}
 */
export function findOrphanMemories() {
  const memories = memGetAll()
  if (memories.length === 0) return []

  const { ids: timelineEntityIds } = buildTimelineEntitySet()

  return memories
    .filter(m => !timelineEntityIds.has(m.entityId))
    .map(m => ({
      memoryId: m.id,
      entityId: m.entityId,
      type:     m.type,
      reason:   'Memory entity ID not found in any timeline event',
    }))
}

// ── Broken traces ─────────────────────────────────────────────────────────────

/**
 * Find explanation records that cite observation IDs which are no longer
 * present in the set of currently derivable observations.
 *
 * Note: this is expected when memory is cleared after explanations are stored.
 * It is informational rather than a hard error.
 *
 * @returns {object[]}
 */
export function findBrokenTraces() {
  const explanations = expListAll()
  if (explanations.length === 0) return []

  const currentObsIds = new Set(observeAll().map(o => o.id))
  const broken = []

  for (const exp of explanations) {
    for (const obs of (exp.observationsUsed ?? [])) {
      if (obs.id && !currentObsIds.has(obs.id)) {
        broken.push({
          recommendationId: exp.recommendationId,
          observationId:    obs.id,
          observationType:  obs.observationType ?? 'UNKNOWN',
          reason:           'Cited observation ID no longer in derived observations (memory may have changed since generation)',
        })
      }
    }
  }

  return broken
}

// ── Missing explanation snapshots ─────────────────────────────────────────────

/**
 * Find RECOMMENDATION_SHOWN timeline events whose recommendationId has no
 * corresponding explanation snapshot.
 *
 * Missing snapshots occur when:
 *  - AI.request() was called before M10 was integrated
 *  - The explanation store was cleared after recommendations were shown
 *
 * @returns {object[]}
 */
export function findMissingExplanations() {
  const { events } = timelineQuery({ eventType: EVENT_TYPE.RECOMMENDATION_SHOWN, limit: TIMELINE_SCAN_LIMIT })
  if (events.length === 0) return []

  const expIds = new Set(expListAll().map(e => e.recommendationId))

  return events
    .filter(ev => ev.recommendationId != null && !expIds.has(ev.recommendationId))
    .map(ev => ({
      recommendationId: ev.recommendationId,
      shownAt:          ev.timestamp,
      reason:           'RECOMMENDATION_SHOWN event has no corresponding explanation snapshot',
    }))
}

// ── Duplicate IDs ─────────────────────────────────────────────────────────────

/**
 * Find duplicate IDs within each store.
 * Timeline event IDs and memory IDs should always be unique UUIDs.
 * Duplicates indicate a bug in the generation logic.
 *
 * @returns {{ timeline: object[], memory: object[] }}
 */
export function findDuplicateIds() {
  const result = { timeline: [], memory: [] }

  // Timeline
  const { events } = timelineQuery({ limit: TIMELINE_SCAN_LIMIT })
  const tlIdCounts = new Map()
  for (const ev of events) {
    if (ev.id) tlIdCounts.set(ev.id, (tlIdCounts.get(ev.id) ?? 0) + 1)
  }
  for (const [id, count] of tlIdCounts) {
    if (count > 1) result.timeline.push({ id, count })
  }

  // Memory
  const memIdCounts = new Map()
  for (const m of memGetAll()) {
    if (m.id) memIdCounts.set(m.id, (memIdCounts.get(m.id) ?? 0) + 1)
  }
  for (const [id, count] of memIdCounts) {
    if (count > 1) result.memory.push({ id, count })
  }

  return result
}

// ── Schema mismatches ─────────────────────────────────────────────────────────

/**
 * Find records in any store whose schemaVersion does not match the expected value.
 * Schema mismatches indicate records written by an older or future version of the Brain.
 *
 * @returns {object[]}
 */
export function findSchemaMismatches() {
  const mismatches = []

  // Memory
  for (const m of memGetAll()) {
    if (m.schemaVersion && m.schemaVersion !== MEMORY_SCHEMA_VERSION) {
      mismatches.push({
        store:           'memory',
        id:              m.id,
        entityId:        m.entityId,
        foundVersion:    m.schemaVersion,
        expectedVersion: MEMORY_SCHEMA_VERSION,
      })
    }
  }

  // Observations (derived fresh — schema is set by makeObservation)
  for (const o of observeAll()) {
    if (o.schemaVersion && o.schemaVersion !== OBSERVATION_SCHEMA_VERSION) {
      mismatches.push({
        store:           'observation',
        id:              o.id,
        entityId:        o.entity?.id ?? null,
        foundVersion:    o.schemaVersion,
        expectedVersion: OBSERVATION_SCHEMA_VERSION,
      })
    }
  }

  // Explanations
  for (const e of expListAll()) {
    if (e.schemaVersion && e.schemaVersion !== EXPLANATION_SCHEMA_VERSION) {
      mismatches.push({
        store:           'explanation',
        id:              e.recommendationId,
        foundVersion:    e.schemaVersion,
        expectedVersion: EXPLANATION_SCHEMA_VERSION,
      })
    }
  }

  return mismatches
}

// ── Aggregate ─────────────────────────────────────────────────────────────────

/**
 * Run all integrity checks and return a consolidated report.
 * consistent = true only when no issues are found across all checks.
 *
 * @returns {IntegrityReport}
 */
export function runIntegrityChecks() {
  const orphanObservations  = findOrphanObservations()
  const orphanMemories      = findOrphanMemories()
  const brokenTraces        = findBrokenTraces()
  const missingExplanations = findMissingExplanations()
  const duplicateIds        = findDuplicateIds()
  const schemaMismatches    = findSchemaMismatches()

  const totalIssues =
    orphanObservations.length +
    orphanMemories.length +
    brokenTraces.length +
    missingExplanations.length +
    duplicateIds.timeline.length +
    duplicateIds.memory.length +
    schemaMismatches.length

  return {
    consistent:          totalIssues === 0,
    totalIssues,
    orphanObservations,
    orphanMemories,
    brokenTraces,
    missingExplanations,
    duplicateIds,
    schemaMismatches,
  }
}
