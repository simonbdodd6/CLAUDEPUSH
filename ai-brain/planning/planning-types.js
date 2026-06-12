/**
 * AI Brain — Planning Types (M14)
 *
 * Shared constants for the Planning Engine.
 */

export const PLAN_SCHEMA_VERSION = '1.0'

export const PLAN_STATUS = Object.freeze({
  ACTIVE: 'active',
  DRAFT:  'draft',
})

export const ACTION_STATUS = Object.freeze({
  PENDING:     'pending',
  IN_PROGRESS: 'in_progress',
  DONE:        'done',
  CANCELLED:   'cancelled',
})

/**
 * Plan scope — determines which template is used.
 * Resolved from recommendation keywords first, category second.
 */
export const PLAN_SCOPE = Object.freeze({
  ATTENDANCE:   'attendance',
  LOAD:         'load',
  WELFARE:      'welfare',
  SELECTION:    'selection',
  PREPARATION:  'preparation',
  AVAILABILITY: 'availability',
  LOGISTICS:    'logistics',
  CLUB:         'club',
  PERFORMANCE:  'performance',
})
