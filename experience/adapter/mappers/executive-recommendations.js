// ─────────────────────────────────────────────────────────────────────────────
// Executive Recommendations mapper (Experience Adapter, M38)
//
// Maps the façade envelope's `data` (the Brain's already-produced active
// recommendations — a plain array) into the presentation-only
// `executiveRecommendations` slice of a VisualModel. PURE field selection
// guarded against malformed input — it presents recommendations the AI Brain
// produced; it NEVER generates, ranks, scores or reasons about them here.
//
// Recommendation items vary by source; this picks common presentation fields
// defensively: { id, title, detail, category, priority, confidence }.
// ─────────────────────────────────────────────────────────────────────────────

import { isObj, num, str, arr, oneOf } from '../shape-guards.js'

const PRIORITIES = ['high', 'medium', 'low']

function mapItem(r, i) {
  const o = isObj(r) ? r : {}
  const priorityRaw = String(o.priority ?? o.severity ?? '').toLowerCase()
  return {
    id: str(o.id, `rec-${i}`),
    title: str(o.title ?? o.action ?? o.name ?? o.type, 'Recommendation'),
    detail: str(o.detail ?? o.message ?? o.description ?? o.why ?? o.reason ?? o.summary, ''),
    category: str(o.category ?? o.type, ''),
    priority: oneOf(priorityRaw, PRIORITIES, undefined),
    confidence: num(o.confidence, 0, 0, 100),
  }
}

/**
 * @param {any} data       façade envelope.data (array of recommendations)
 * @param {object} fallback the placeholder executiveRecommendations slice
 * @returns {object}        a 'live' executiveRecommendations slice, view-safe
 */
export function mapExecutiveRecommendations(data, fallback) {
  const fb = isObj(fallback) ? fallback : {}
  // data is the recommendations array (or, defensively, an object wrapping one).
  const list = Array.isArray(data) ? data : isObj(data) ? arr(data.recommendations ?? data.items) : null
  if (list == null) return { ...fb }

  const items = list.map(mapItem).filter(x => x.title)
  return {
    state: 'live',
    items: items.length ? items : arr(fb.items),
  }
}
