/**
 * Coach's Eye Intelligence — shared UI utilities
 *
 * Single source of truth for every colour, badge, label, and time helper
 * used across all Intelligence screens. Import from here; never redefine.
 */

// ── Priority ──────────────────────────────────────────────────────────────────

export function priorityBadge(p) {
  if (p === 'HIGH')   return 'bg-red-100   text-red-700   dark:bg-red-900/30   dark:text-red-400'
  if (p === 'MEDIUM') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return                     'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
}

export function priorityColor(p) {
  if (p === 'HIGH')   return 'text-red-600 dark:text-red-400'
  if (p === 'MEDIUM') return 'text-amber-600 dark:text-amber-400'
  return 'text-green-600 dark:text-green-400'
}

export function priorityRing(p) {
  if (p === 'HIGH')   return 'border-red-200   dark:border-red-800/50'
  if (p === 'MEDIUM') return 'border-amber-200 dark:border-amber-800/50'
  return                     'border-green-200 dark:border-green-800/50'
}

export function priorityDot(p) {
  if (p === 'HIGH')   return 'bg-red-500'
  if (p === 'MEDIUM') return 'bg-amber-400'
  return 'bg-green-400'
}

// ── Category ──────────────────────────────────────────────────────────────────

const CAT_DOT = {
  Medical:        'bg-red-400',
  Selection:      'bg-orange-400',
  Training:       'bg-amber-400',
  Logistics:      'bg-blue-400',
  'Player Welfare':'bg-purple-400',
  Club:           'bg-indigo-400',
  Performance:    'bg-green-400',
}

const CAT_COLOR = {
  Medical:        'text-red-500',
  Selection:      'text-orange-500',
  Training:       'text-amber-500',
  Logistics:      'text-blue-500',
  'Player Welfare':'text-purple-500',
  Club:           'text-indigo-500',
  Performance:    'text-green-500',
}

export function categoryDot(c)   { return CAT_DOT[c]   ?? 'bg-surface-3' }
export function categoryColor(c) { return CAT_COLOR[c] ?? 'text-ink-3' }

// ── Status ────────────────────────────────────────────────────────────────────

export function statusBadge(s) {
  if (s === 'new')          return 'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-300'
  if (s === 'acknowledged') return 'bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-300'
  if (s === 'completed')    return 'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400'
  return 'bg-surface-3 text-ink-3'
}

// ── Severity ──────────────────────────────────────────────────────────────────

export function severityDot(s) {
  if (s === 'high')   return 'bg-red-500'
  if (s === 'medium') return 'bg-amber-400'
  return 'bg-blue-400'
}

// ── Trend ─────────────────────────────────────────────────────────────────────

export function trendArrow(t) {
  if (t === 'improving') return { icon: '↑', cls: 'text-green-500' }
  if (t === 'declining') return { icon: '↓', cls: 'text-red-500' }
  return { icon: '→', cls: 'text-amber-400' }
}

// ── Engine / source labels ────────────────────────────────────────────────────

export function engineLabel(e) {
  return e?.replace(/-engine$/, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) ?? ''
}

// ── Time ──────────────────────────────────────────────────────────────────────

export function relTime(ts) {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (diff < 2)   return 'just now'
  if (diff < 60)  return `${diff}m ago`
  const h = Math.floor(diff / 60)
  if (h < 24)     return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Confidence display ────────────────────────────────────────────────────────

export function confidenceLabel(n) {
  if (n == null) return '—'
  if (n >= 85)   return 'High'
  if (n >= 65)   return 'Medium'
  return 'Low'
}

export function confidenceColor(n) {
  if (n == null) return 'text-ink-3'
  if (n >= 85)   return 'text-green-500'
  if (n >= 65)   return 'text-amber-500'
  return 'text-red-500'
}
