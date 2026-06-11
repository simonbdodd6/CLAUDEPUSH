/**
 * AI Brain — Observation Types (M8)
 *
 * Type constants and the pure makeObservation() factory.
 * No state, no I/O. Safe to import anywhere.
 *
 * Observations sit between Memory and Reasoning in the intelligence stack:
 *   Memory → Observation → Reasoning → Recommendation
 *
 * Observations are facts derived deterministically from Memory.
 * They carry no predictions and make no recommendations.
 */

import { randomUUID } from 'crypto'

// ── Schema ────────────────────────────────────────────────────────────────────

export const OBSERVATION_SCHEMA_VERSION = '1.0'

// ── Observation type constants ────────────────────────────────────────────────

export const OBSERVATION_TYPE = Object.freeze({
  ATTENDANCE_TREND:          'ATTENDANCE_TREND',
  PLAYER_AVAILABILITY_TREND: 'PLAYER_AVAILABILITY_TREND',
  SESSION_FREQUENCY:         'SESSION_FREQUENCY',
  COACH_BEHAVIOUR:           'COACH_BEHAVIOUR',
  CLUB_ACTIVITY:             'CLUB_ACTIVITY',
  PLAYER_IMPROVEMENT:        'PLAYER_IMPROVEMENT',
  REPEATED_INJURY:           'REPEATED_INJURY',
  REPEATED_ABSENCE:          'REPEATED_ABSENCE',
  SESSION_LOAD:              'SESSION_LOAD',
  MATCH_PREPARATION:         'MATCH_PREPARATION',
})

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a typed Observation object.
 *
 * @param {object} opts
 * @param {string}   opts.observationType        - one of OBSERVATION_TYPE.*
 * @param {object}   opts.entity                 - { id: string, type: MEMORY_TYPE.* }
 * @param {number}   opts.confidence             - 0–100
 * @param {string}   opts.explanation            - human-readable fact description
 * @param {string[]} opts.supportingMemories     - memory IDs this observation was derived from
 * @param {object}   opts.metadata               - observation-specific payload
 * @returns {Observation}
 */
export function makeObservation({
  observationType,
  entity,
  confidence = 50,
  explanation = '',
  supportingMemories = [],
  metadata = {},
}) {
  return {
    id:                randomUUID(),
    schemaVersion:     OBSERVATION_SCHEMA_VERSION,
    timestamp:         new Date().toISOString(),
    observationType:   observationType ?? OBSERVATION_TYPE.CLUB_ACTIVITY,
    entity: {
      id:   entity?.id   ?? null,
      type: entity?.type ?? null,
    },
    confidence:        Math.round(Math.min(100, Math.max(0, confidence))),
    explanation:       String(explanation),
    supportingMemories: Array.isArray(supportingMemories) ? [...supportingMemories] : [],
    metadata:          typeof metadata === 'object' && metadata !== null ? { ...metadata } : {},
  }
}
