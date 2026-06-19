/**
 * @coach-memory — Coach Memory model (M108, DORMANT, proprietary IP)
 *
 * Defines what one reusable coaching insight ("coach memory entry") is, validates it, and
 * normalises it. Pure and deterministic: no persistence, filesystem, network, engine, LLM,
 * vector store, clock or randomness. IDs and timestamps are supplied by the caller — this
 * module never generates them.
 */

export const COACH_MEMORY_TYPES = Object.freeze([
  'philosophy',
  'selection-preference',
  'training-preference',
  'tactical-preference',
  'player-management',
  'communication-style',
  'risk-warning',
  'learned-pattern',
])

export const COACH_MEMORY_SOURCES = Object.freeze([
  'manual',
  'session-note',
  'match-note',
  'selection-decision',
  'player-feedback',
  'assistant-derived',
])

export const ONTOLOGY_KINDS = Object.freeze([
  'coach', 'player', 'team', 'club', 'season', 'opponent',
  'training', 'match', 'tactic', 'skill', 'value',
])

const isObj = (v) => v !== null && typeof v === 'object'
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const isUnitNumber = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1

/** Deep-freeze a plain JSON value (objects/arrays). */
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/**
 * Validate a coach memory entry. Returns true; throws TypeError describing the first problem.
 * @param {object} entry
 * @returns {true}
 */
export function validateCoachMemoryEntry(entry) {
  if (!isObj(entry) || Array.isArray(entry)) throw new TypeError('coach memory entry must be an object')

  if (!isNonEmptyString(entry.id)) throw new TypeError('coach memory entry requires a non-empty string id')
  if (!isNonEmptyString(entry.coachId)) throw new TypeError('coach memory entry requires a non-empty string coachId')
  if (!isNonEmptyString(entry.clubId)) throw new TypeError('coach memory entry requires a non-empty string clubId')

  if (!COACH_MEMORY_TYPES.includes(entry.type)) {
    throw new TypeError(`coach memory entry has invalid type "${entry.type}"`)
  }
  if (!isNonEmptyString(entry.statement)) throw new TypeError('coach memory entry requires a non-empty statement')
  if (!COACH_MEMORY_SOURCES.includes(entry.source)) {
    throw new TypeError(`coach memory entry has invalid source "${entry.source}"`)
  }

  if (!isUnitNumber(entry.confidence)) throw new TypeError('coach memory entry confidence must be a number in [0,1]')
  if (!isUnitNumber(entry.weight)) throw new TypeError('coach memory entry weight must be a number in [0,1]')

  if (!Array.isArray(entry.tags) || !entry.tags.every((t) => typeof t === 'string')) {
    throw new TypeError('coach memory entry tags must be an array of strings')
  }

  if (!Array.isArray(entry.ontologyLinks)) throw new TypeError('coach memory entry ontologyLinks must be an array')
  for (const link of entry.ontologyLinks) {
    if (!isObj(link) || !ONTOLOGY_KINDS.includes(link.kind) || !isNonEmptyString(link.id)) {
      throw new TypeError('coach memory entry ontologyLinks must be { kind, id } with a valid kind and non-empty id')
    }
  }

  if (!Array.isArray(entry.evidenceRefs) || !entry.evidenceRefs.every((r) => typeof r === 'string')) {
    throw new TypeError('coach memory entry evidenceRefs must be an array of strings')
  }

  if (!isNonEmptyString(entry.createdAt)) throw new TypeError('coach memory entry requires a non-empty createdAt string')

  return true
}

/** Trim + de-duplicate strings, preserving first-seen order. */
function dedupeStrings(arr) {
  const seen = new Set()
  const out = []
  for (const raw of arr) {
    const v = raw.trim()
    if (!seen.has(v)) { seen.add(v); out.push(v) }
  }
  return out
}

/** Trim ontology link ids + de-duplicate by `kind:id`, preserving first-seen order. */
function dedupeOntologyLinks(links) {
  const seen = new Set()
  const out = []
  for (const link of links) {
    const id = link.id.trim()
    const key = `${link.kind}:${id}`
    if (!seen.has(key)) { seen.add(key); out.push({ kind: link.kind, id }) }
  }
  return out
}

/**
 * Return a deeply-frozen normalised copy of a (valid) coach memory entry.
 * Trims statement/tags/evidenceRefs/ontology ids and de-duplicates tags/evidenceRefs/links
 * (first-seen order). The input is never mutated.
 * @param {object} entry
 * @returns {Readonly<object>}
 */
export function normalizeCoachMemoryEntry(entry) {
  validateCoachMemoryEntry(entry)

  return deepFreeze({
    id: entry.id,
    coachId: entry.coachId,
    clubId: entry.clubId,
    type: entry.type,
    statement: entry.statement.trim(),
    source: entry.source,
    confidence: entry.confidence,
    weight: entry.weight,
    tags: dedupeStrings(entry.tags),
    ontologyLinks: dedupeOntologyLinks(entry.ontologyLinks),
    evidenceRefs: dedupeStrings(entry.evidenceRefs),
    createdAt: entry.createdAt,
  })
}
