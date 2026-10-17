/**
 * @coach-memory — Coach DNA signal extraction (M113, DORMANT)
 *
 * Extracts measurable coaching signals from validated coach memory entries. This is NOT
 * natural-language generation and invents no philosophy — it only MEASURES recurring
 * coaching behaviour from evidence: grouping by memory type, counting occurrences, averaging
 * confidence/weight, and computing a deterministic strength.
 *
 * Pure and side-effect free: no inference, opinions, storage, retrieval, LLM, embeddings,
 * vector search, persistence, filesystem, network, clock or randomness. Input is never
 * mutated; output is deeply frozen.
 */

import { validateCoachMemoryEntry } from './model.js'

const clamp01 = (x) => Math.min(1, Math.max(0, x))

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/**
 * Extract Coach DNA signals from a set of coach memory entries.
 *
 * @param {object[]} memories  valid M108 coach memory entries (unique ids)
 * @returns {Readonly<{
 *   signals: ReadonlyArray<Readonly<{ category:string, occurrences:number, averageConfidence:number,
 *     averageWeight:number, strength:number, supportingMemoryIds:ReadonlyArray<string> }>>,
 *   summary: Readonly<{ strongestCategory:(string|null), totalSignals:number, strongestStrength:number }>
 * }>}
 */
export function extractCoachDnaSignals(memories) {
  if (!Array.isArray(memories)) throw new TypeError('extractCoachDnaSignals requires an array of memories')

  const seenIds = new Set()
  for (const m of memories) {
    validateCoachMemoryEntry(m)                 // throws on invalid (incl. missing createdAt)
    if (seenIds.has(m.id)) throw new TypeError(`extractCoachDnaSignals: duplicate memory id "${m.id}"`)
    seenIds.add(m.id)
  }

  // group by memory.type
  const byType = new Map()
  for (const m of memories) {
    let g = byType.get(m.type)
    if (!g) { g = { category: m.type, occurrences: 0, sumConfidence: 0, sumWeight: 0, members: [] }; byType.set(m.type, g) }
    g.occurrences++
    g.sumConfidence += m.confidence
    g.sumWeight += m.weight
    g.members.push({ id: m.id, createdAt: m.createdAt })
  }

  const signals = [...byType.values()]
    .map((g) => {
      const averageConfidence = g.sumConfidence / g.occurrences
      const averageWeight = g.sumWeight / g.occurrences
      const strength = clamp01(g.occurrences * 0.4 + averageConfidence * 0.35 + averageWeight * 0.25)
      const supportingMemoryIds = g.members
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1
          : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)))   // createdAt ASC, then id ASC
        .map((x) => x.id)
      return { category: g.category, occurrences: g.occurrences, averageConfidence, averageWeight, strength, supportingMemoryIds }
    })
    .sort((a, b) => (b.strength - a.strength) || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0))   // strength DESC, category ASC

  const summary = {
    strongestCategory: signals.length ? signals[0].category : null,
    totalSignals: signals.length,
    strongestStrength: signals.length ? signals[0].strength : 0,
  }

  return deepFreeze({ signals, summary })
}
