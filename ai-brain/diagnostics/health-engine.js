/**
 * AI Brain — Health Engine (M11)
 *
 * Deterministic health checks for each AI subsystem.
 * No reasoning, no recommendations, no LLM calls.
 *
 * Each check:
 *  - reads directly from its subsystem's in-memory store
 *  - returns a normalised HealthReport object
 *  - is safe to call with an empty store
 *  - never throws (wraps in try/catch and returns 'error' status)
 *
 * HealthReport shape:
 *   { status, version, healthy, warnings, errors, totalObjects, lastUpdated }
 */

import { query as timelineQuery }         from '../timeline.js'
import { getAll as memGetAll }             from '../memory/memory-store.js'
import { MEMORY_SCHEMA_VERSION }           from '../memory/memory-types.js'
import { observeAll }                      from '../observation/observation-engine.js'
import { OBSERVATION_SCHEMA_VERSION }      from '../observation/observation-types.js'
import { getAll as calGetAll }             from '../learning-store.js'
import { listAll as expListAll }           from '../explain/explanation-engine.js'
import { EXPLANATION_SCHEMA_VERSION }      from '../explain/explanation-types.js'
import { BRAIN_SCHEMA_VERSION }            from '../schema.js'

const TIMELINE_SCAN_LIMIT = 5000  // max events scanned per health check

function errorReport(version, message) {
  return {
    status:       'error',
    version,
    healthy:      false,
    warnings:     [],
    errors:       [message],
    totalObjects: 0,
    lastUpdated:  null,
  }
}

function latestOf(timestamps) {
  return timestamps.filter(Boolean).sort().at(-1) ?? null
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export function checkTimeline() {
  const VERSION = '1.0'
  try {
    const { events, total } = timelineQuery({ limit: TIMELINE_SCAN_LIMIT })
    const warnings = []
    const errors   = []

    let missingFields = 0
    for (const ev of events) {
      if (!ev.id || !ev.eventType || !ev.timestamp) missingFields++
    }
    if (missingFields > 0) errors.push(`${missingFields} event(s) missing required fields (id, eventType, timestamp)`)

    const lastUpdated = events[0]?.timestamp ?? null   // reverse-chrono → first = latest

    return {
      status:       errors.length ? 'error' : warnings.length ? 'degraded' : 'healthy',
      version:      VERSION,
      healthy:      errors.length === 0,
      warnings,
      errors,
      totalObjects: total,
      lastUpdated,
    }
  } catch (err) {
    return errorReport(VERSION, `Timeline check failed: ${err.message}`)
  }
}

// ── Memory ────────────────────────────────────────────────────────────────────

export function checkMemory() {
  try {
    const memories = memGetAll()
    const warnings = []
    const errors   = []

    let missingFields   = 0
    let schemaMismatch  = 0
    let confidenceOob   = 0
    let strengthOob     = 0

    for (const m of memories) {
      if (!m.id || !m.entityId || !m.type) missingFields++
      if (m.schemaVersion && m.schemaVersion !== MEMORY_SCHEMA_VERSION) schemaMismatch++
      if (typeof m.confidence === 'number' && (m.confidence < 0 || m.confidence > 100)) confidenceOob++
      if (typeof m.strength   === 'number' && (m.strength   < 1 || m.strength   > 100)) strengthOob++
    }

    if (missingFields  > 0) errors.push(`${missingFields} memories missing required fields`)
    if (schemaMismatch > 0) warnings.push(`${schemaMismatch} memories have unexpected schemaVersion (expected ${MEMORY_SCHEMA_VERSION})`)
    if (confidenceOob  > 0) warnings.push(`${confidenceOob} memories have confidence outside [0,100]`)
    if (strengthOob    > 0) warnings.push(`${strengthOob} memories have strength outside [1,100]`)

    const lastUpdated = latestOf(memories.map(m => m.lastUpdated))

    return {
      status:       errors.length ? 'error' : warnings.length ? 'degraded' : 'healthy',
      version:      MEMORY_SCHEMA_VERSION,
      healthy:      errors.length === 0,
      warnings,
      errors,
      totalObjects: memories.length,
      lastUpdated,
    }
  } catch (err) {
    return errorReport(MEMORY_SCHEMA_VERSION, `Memory check failed: ${err.message}`)
  }
}

// ── Observations ──────────────────────────────────────────────────────────────

export function checkObservations() {
  try {
    const obs      = observeAll()
    const warnings = []
    const errors   = []

    let missingFields  = 0
    let schemaMismatch = 0
    let confidenceOob  = 0

    for (const o of obs) {
      if (!o.id || !o.observationType || !o.entity?.id) missingFields++
      if (o.schemaVersion && o.schemaVersion !== OBSERVATION_SCHEMA_VERSION) schemaMismatch++
      if (typeof o.confidence === 'number' && (o.confidence < 0 || o.confidence > 100)) confidenceOob++
    }

    if (missingFields  > 0) errors.push(`${missingFields} observations missing required fields`)
    if (schemaMismatch > 0) warnings.push(`${schemaMismatch} observations have unexpected schemaVersion (expected ${OBSERVATION_SCHEMA_VERSION})`)
    if (confidenceOob  > 0) warnings.push(`${confidenceOob} observations have confidence outside [0,100]`)

    const lastUpdated = latestOf(obs.map(o => o.timestamp))

    return {
      status:       errors.length ? 'error' : warnings.length ? 'degraded' : 'healthy',
      version:      OBSERVATION_SCHEMA_VERSION,
      healthy:      errors.length === 0,
      warnings,
      errors,
      totalObjects: obs.length,
      lastUpdated,
    }
  } catch (err) {
    return errorReport(OBSERVATION_SCHEMA_VERSION, `Observation check failed: ${err.message}`)
  }
}

// ── Reasoning ─────────────────────────────────────────────────────────────────
// Reasoning is a pure stateless layer — there is no store to scan.
// The check verifies that the reasoners are reachable via the explanation engine
// (as a proxy for "reasoning has run and produced verifiable output").

export function checkReasoning() {
  try {
    const explanations = expListAll()
    const warnings     = []
    const errors       = []

    const byReasoner = { coach: 0, squad: 0, club: 0, brain: 0, other: 0 }
    for (const e of explanations) {
      const r = e.generatedByReasoner ?? 'other'
      byReasoner[r] = (byReasoner[r] ?? 0) + 1
    }

    const lastUpdated = latestOf(explanations.map(e => e.storedAt))

    return {
      status:       'healthy',
      version:      BRAIN_SCHEMA_VERSION,
      healthy:      true,
      warnings,
      errors,
      totalObjects: explanations.length,
      lastUpdated,
      metadata:     byReasoner,
    }
  } catch (err) {
    return errorReport(BRAIN_SCHEMA_VERSION, `Reasoning check failed: ${err.message}`)
  }
}

// ── Calibration ───────────────────────────────────────────────────────────────

export function checkCalibration() {
  try {
    const all      = calGetAll()    // { 'coachId:clubId:category': { acceptWeight, totalSeen }, ... }
    const entries  = Object.entries(all)
    const warnings = []
    const errors   = []

    let invalidCount   = 0
    let coldStartCount = 0
    let activeCount    = 0

    for (const [key, val] of entries) {
      if (typeof val.acceptWeight !== 'number' || typeof val.totalSeen !== 'number') {
        invalidCount++
        continue
      }
      if (val.acceptWeight < 0) {
        errors.push(`Key "${key}" has negative acceptWeight (${val.acceptWeight})`)
      }
      if (val.acceptWeight > val.totalSeen + 0.01) {   // small epsilon for floating-point
        errors.push(`Key "${key}" has acceptWeight (${val.acceptWeight}) > totalSeen (${val.totalSeen})`)
      }
      if (val.totalSeen < 3) coldStartCount++
      else                   activeCount++
    }

    if (invalidCount > 0) errors.push(`${invalidCount} calibration entries have invalid structure`)

    const maturity = activeCount > 0
      ? 'CALIBRATED'
      : entries.length > 0 ? 'LEARNING' : 'COLD_START'

    if (maturity === 'COLD_START' && entries.length === 0) {
      // expected when system is freshly started
    } else if (maturity === 'LEARNING') {
      warnings.push(`${coldStartCount} calibration key(s) below the 3-sample threshold (COLD_START)`)
    }

    return {
      status:       errors.length ? 'error' : warnings.length ? 'degraded' : 'healthy',
      version:      BRAIN_SCHEMA_VERSION,
      healthy:      errors.length === 0,
      warnings,
      errors,
      totalObjects: entries.length,
      lastUpdated:  null,    // learning-store does not track timestamps
      metadata:     { maturity, activeCount, coldStartCount },
    }
  } catch (err) {
    return errorReport(BRAIN_SCHEMA_VERSION, `Calibration check failed: ${err.message}`)
  }
}

// ── Explainability ────────────────────────────────────────────────────────────

export function checkExplainability() {
  try {
    const explanations = expListAll()
    const warnings     = []
    const errors       = []

    let missingFields  = 0
    let schemaMismatch = 0
    let noPlainText    = 0

    for (const e of explanations) {
      if (!e.recommendationId || !e.generatedByReasoner) missingFields++
      if (e.schemaVersion && e.schemaVersion !== EXPLANATION_SCHEMA_VERSION) schemaMismatch++
      if (!e.plainLanguageExplanation || typeof e.plainLanguageExplanation !== 'string') noPlainText++
    }

    if (missingFields  > 0) errors.push(`${missingFields} explanation(s) missing required fields`)
    if (noPlainText    > 0) errors.push(`${noPlainText} explanation(s) missing plainLanguageExplanation`)
    if (schemaMismatch > 0) warnings.push(`${schemaMismatch} explanation(s) have unexpected schemaVersion (expected ${EXPLANATION_SCHEMA_VERSION})`)

    const lastUpdated = latestOf(explanations.map(e => e.storedAt))

    return {
      status:       errors.length ? 'error' : warnings.length ? 'degraded' : 'healthy',
      version:      EXPLANATION_SCHEMA_VERSION,
      healthy:      errors.length === 0,
      warnings,
      errors,
      totalObjects: explanations.length,
      lastUpdated,
    }
  } catch (err) {
    return errorReport(EXPLANATION_SCHEMA_VERSION, `Explainability check failed: ${err.message}`)
  }
}
