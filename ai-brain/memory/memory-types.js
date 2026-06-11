/**
 * AI Brain — Memory Types (M7)
 *
 * Type constants and pure utility functions for the Memory Engine.
 * No state, no I/O, no reasoning. Safe to import anywhere.
 */

// ── Schema ────────────────────────────────────────────────────────────────────

export const MEMORY_SCHEMA_VERSION = '1.0'

// ── Memory type constants ─────────────────────────────────────────────────────

export const MEMORY_TYPE = Object.freeze({
  COACH:   'COACH',
  PLAYER:  'PLAYER',
  TEAM:    'TEAM',
  CLUB:    'CLUB',
  SESSION: 'SESSION',
})

// ── Decay constants ───────────────────────────────────────────────────────────

export const DECAY_RATE_PER_DAY = 0.99  // 1 % strength loss per elapsed day
export const MIN_STRENGTH       = 1     // floor: memories are never auto-deleted

// ── Decay ─────────────────────────────────────────────────────────────────────

/**
 * Apply time-based strength decay to a memory object.
 * Pure: never mutates. Returns the same reference when no decay is needed.
 *
 * Formula: decayed = strength × DECAY_RATE_PER_DAY ^ daysSinceLastUpdated
 * Sub-day granularity is ignored to keep results stable within a session.
 *
 * @param {Memory} memory
 * @returns {Memory}
 */
export function applyDecay(memory) {
  const msPerDay  = 86_400_000
  const daysSince = (Date.now() - new Date(memory.lastUpdated).getTime()) / msPerDay

  if (daysSince < 1) return memory  // no observable decay within the first day

  const decayed = Math.max(
    MIN_STRENGTH,
    Math.round(memory.strength * Math.pow(DECAY_RATE_PER_DAY, daysSince))
  )

  if (decayed === memory.strength) return memory  // nothing changed

  return { ...memory, strength: decayed }
}
