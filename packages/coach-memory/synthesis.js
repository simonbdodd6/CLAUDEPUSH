/**
 * @coach-memory — Coach Memory synthesis (M112, DORMANT)
 *
 * Aggregates multiple existing coach memory entries into structured coaching insights. This
 * is NOT generative AI: it invents nothing, infers nothing, and writes no free text — it only
 * counts, groups, averages, and orders existing evidence deterministically.
 *
 * Pure and side-effect free: no storage, retrieval, LLM, embeddings, vector search,
 * persistence, filesystem, network, clock or randomness. No ids or timestamps are generated.
 * Input is never mutated; output is deeply frozen.
 */

import { validateCoachMemoryEntry } from './model.js'

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/**
 * Synthesize a set of coach memory entries into a deterministic, structured insight.
 *
 * @param {object[]} memories  valid M108 coach memory entries (unique ids)
 * @returns {Readonly<{
 *   summary:string,
 *   themes: ReadonlyArray<Readonly<{ type:string, count:number, averageConfidence:number, averageWeight:number }>>,
 *   statistics: Readonly<{ totalMemories:number, uniqueTypes:number, averageConfidence:number,
 *     averageWeight:number, totalEvidence:number, totalOntologyLinks:number }>,
 *   supportingEvidence: ReadonlyArray<Readonly<{ memoryId:string, type:string }>>
 * }>}
 */
export function synthesizeCoachMemories(memories) {
  if (!Array.isArray(memories)) throw new TypeError('synthesizeCoachMemories requires an array of memories')

  const seenIds = new Set()
  for (const m of memories) {
    validateCoachMemoryEntry(m)                 // throws on invalid (incl. missing createdAt)
    if (seenIds.has(m.id)) throw new TypeError(`synthesizeCoachMemories: duplicate memory id "${m.id}"`)
    seenIds.add(m.id)
  }

  const total = memories.length

  // group by type
  const byType = new Map()
  let sumConfidence = 0
  let sumWeight = 0
  let totalEvidence = 0
  let totalOntologyLinks = 0
  for (const m of memories) {
    sumConfidence += m.confidence
    sumWeight += m.weight
    totalEvidence += m.evidenceRefs.length
    totalOntologyLinks += m.ontologyLinks.length

    let g = byType.get(m.type)
    if (!g) { g = { type: m.type, count: 0, sumConfidence: 0, sumWeight: 0 }; byType.set(m.type, g) }
    g.count++
    g.sumConfidence += m.confidence
    g.sumWeight += m.weight
  }

  const themes = [...byType.values()]
    .map((g) => ({
      type: g.type,
      count: g.count,
      averageConfidence: g.sumConfidence / g.count,
      averageWeight: g.sumWeight / g.count,
    }))
    .sort((a, b) => (b.count - a.count) || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0))   // count DESC, type ASC

  const uniqueTypes = byType.size

  const statistics = {
    totalMemories: total,
    uniqueTypes,
    averageConfidence: total ? sumConfidence / total : 0,
    averageWeight: total ? sumWeight / total : 0,
    totalEvidence,
    totalOntologyLinks,
  }

  const supportingEvidence = memories
    .map((m) => ({ memoryId: m.id, type: m.type, createdAt: m.createdAt }))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1
      : (a.memoryId < b.memoryId ? -1 : a.memoryId > b.memoryId ? 1 : 0)))   // createdAt ASC, then memoryId ASC
    .map(({ memoryId, type }) => ({ memoryId, type }))

  const summary = `Coach has ${total} recorded coaching memories across ${uniqueTypes} coaching themes.`

  return deepFreeze({ summary, themes, statistics, supportingEvidence })
}
