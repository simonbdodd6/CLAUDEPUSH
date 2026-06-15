// ─────────────────────────────────────────────────────────────────────────────
// Coach DNA mapper (Experience Adapter, M35)
//
// Maps the façade envelope's `data` (the coach-DNA product from AI.getCoachDNA)
// into the presentation-only `coachDna` slice of a VisualModel. PURE field
// reshape guarded against malformed input — it selects/renames fields, it does
// NOT compute scores, derive characteristics, rank, reason or recommend (the
// engine produced all of that; here we only present it).
//
// The product shape (read-only reference, ai-brain/coach-dna):
//   { maturity (0..1), style: { summary, traits:[...] },
//     characteristics: { [key]: { key, label, score (0..100),
//       confidence (0..1), descriptor } }, ... }
// ─────────────────────────────────────────────────────────────────────────────

import { isObj, num, str, arr } from '../shape-guards.js'

function mapTrait(t, fallbackKey) {
  const o = isObj(t) ? t : {}
  return {
    key: str(o.key, fallbackKey),
    label: str(o.label, str(o.key, fallbackKey)),
    score: num(o.score, 50, 0, 100),
    confidence: num(o.confidence, 0, 0, 1),
    descriptor: str(o.descriptor, ''),
  }
}

/**
 * @param {any} data       façade envelope.data (coach-DNA product)
 * @param {object} fallback the placeholder coachDna slice (defaults)
 * @returns {object}        a 'live' coachDna slice, view-safe
 */
export function mapCoachDna(data, fallback) {
  const fb = isObj(fallback) ? fallback : {}
  if (!isObj(data)) return { ...fb }

  // Prefer the full characteristic set; fall back to the headline style traits.
  let traits = []
  if (isObj(data.characteristics)) {
    traits = Object.entries(data.characteristics).map(([k, v]) => mapTrait(v, k))
  } else if (isObj(data.style) && Array.isArray(data.style.traits)) {
    traits = data.style.traits.map((t, i) => mapTrait(t, `trait-${i}`))
  }

  return {
    state: 'live',
    maturity: num(data.maturity, num(fb.maturity, 0, 0, 1), 0, 1),
    summary: str(isObj(data.style) ? data.style.summary : '', str(fb.summary, '')),
    traits: traits.length ? traits : arr(fb.traits),
  }
}
