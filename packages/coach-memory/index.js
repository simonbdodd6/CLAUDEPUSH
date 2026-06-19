/**
 * @coach-memory (M108) — proprietary Coach Memory IP layer, DORMANT.
 *
 * The pure model for a reusable coaching insight: define, validate, normalise, and score a
 * coach memory entry, plus a documentation-as-code adapter contract for a future store.
 * No persistence, filesystem, network, engine, LLM, vector store, clock or randomness.
 * Imported by nobody yet except its tests.
 */

export {
  validateCoachMemoryEntry,
  normalizeCoachMemoryEntry,
  COACH_MEMORY_TYPES,
  COACH_MEMORY_SOURCES,
  ONTOLOGY_KINDS,
} from './model.js'

export { scoreCoachMemoryEntry } from './scoring.js'

export { createCoachMemoryStoreContract } from './adapter-contract.js'

export { createCoachMemoryQueryPlan, COACH_MEMORY_SORTS } from './query-plan.js'

export { retrieveCoachMemories } from './retrieval.js'

export { assessCoachMemoryCandidate } from './learning.js'

export { synthesizeCoachMemories } from './synthesis.js'
