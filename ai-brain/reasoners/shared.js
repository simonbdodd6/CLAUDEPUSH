/**
 * AI Brain — Reasoner shared utilities
 *
 * Pure helpers used by all three reasoners.
 * No imports from external modules — only node:crypto.
 */

import { randomUUID } from 'crypto'

export const CATEGORY = {
  SELECTION:      'Selection',
  TRAINING:       'Training',
  MEDICAL:        'Medical',
  LOGISTICS:      'Logistics',
  PLAYER_WELFARE: 'Player Welfare',
  CLUB:           'Club',
  PERFORMANCE:    'Performance',
}

export const PRIORITY = { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' }

/**
 * Build a typed Recommendation from raw fields.
 * Clamps confidence to [0, 100]. Assigns _score for internal ranking.
 */
export function makeRec({ category, priority, confidence, title, description, action, source, explainability, evidence = [] }) {
  const c = typeof confidence === 'number' ? Math.min(100, Math.max(0, confidence)) : 50
  return {
    id:             randomUUID(),
    category:       category       ?? CATEGORY.PERFORMANCE,
    priority:       priority       ?? PRIORITY.MEDIUM,
    confidence:     c,
    title:          title          ?? '',
    description:    description    ?? '',
    action:         action         ?? '',
    source:         source         ?? 'brain',
    explainability: explainability ?? '',
    evidence:       Array.isArray(evidence) ? evidence : [],
    _score:         priorityScore(priority) + c * 0.3,
  }
}

export function priorityScore(p) {
  return p === 'HIGH' ? 100 : p === 'MEDIUM' ? 60 : 25
}
