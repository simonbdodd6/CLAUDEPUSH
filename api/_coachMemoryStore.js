// api/_coachMemoryStore.js — Persisted Coach Memory store (Core Memory M1, DORMANT)
//
// The Redis-backed store for validated coach memory entries — the Core-side foundation that will
// eventually feed the Brain's Coach DNA pipeline (which currently receives a placeholder empty
// list). This module is deliberately DORMANT: no API route imports it yet, nothing reads it at
// runtime, and it is NOT wired into any Brain provider. It only defines how coach memories are
// validated, persisted and read back.
//
// Storage model (follows the existing Core Redis conventions in _keys.js/_kv.js):
//   one key per team+coach —  app:coach_memory:<teamId>:<coachId>  →  { [entryId]: entry }
// Tenant/team isolation is structural: a read can only ever see the single team+coach collection
// named in its key, mirroring how identity/availability scope their records.
//
// The entry schema mirrors the Coach Memory model (M108) on the Brain branch so the two converge
// without translation: the same eight memory types, the same six capture sources, the same
// ontology kinds, unit-interval confidence/weight, evidenceRefs as strings, ontologyLinks as
// { kind, id }. IDs and timestamps are supplied by the caller — this module never invents them
// (no clock, no randomness), which also keeps reads/writes deterministic and testable.
//
// No AI/LLM, no recommendations, no reasoning — storage and retrieval only.

import { kvGet, kvSet } from './_kv.js';
import { key } from './_keys.js';

// ── Schema (mirrors packages/coach-memory/model.js on the Brain branch — keep in sync) ──────────
export const COACH_MEMORY_TYPES = Object.freeze([
  'philosophy',
  'selection-preference',
  'training-preference',
  'tactical-preference',
  'player-management',
  'communication-style',
  'risk-warning',
  'learned-pattern',
]);

export const COACH_MEMORY_SOURCES = Object.freeze([
  'manual',
  'session-note',
  'match-note',
  'selection-decision',
  'player-feedback',
  'assistant-derived',
]);

export const ONTOLOGY_KINDS = Object.freeze([
  'coach', 'player', 'team', 'club', 'season', 'opponent',
  'training', 'match', 'tactic', 'skill', 'value',
]);

const isNonEmptyString = v => typeof v === 'string' && v.trim().length > 0;
const isUnitNumber = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const isIsoDate = v => typeof v === 'string' && !Number.isNaN(Date.parse(v));

export function coachMemoryKey(teamId, coachId) {
  if (!isNonEmptyString(teamId)) throw new TypeError('coach memory store requires a non-empty teamId');
  if (!isNonEmptyString(coachId)) throw new TypeError('coach memory store requires a non-empty coachId');
  return key(`coach_memory:${teamId.trim()}:${coachId.trim()}`);
}

/**
 * Validate a coach memory entry. Returns true; throws a TypeError describing the first problem.
 * Mirrors the M108 contract: caller supplies id + timestamps; nothing is invented here.
 */
export function validateCoachMemoryEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('coach memory entry must be an object');
  if (!isNonEmptyString(entry.id)) throw new TypeError('coach memory entry id must be a non-empty string');
  if (!COACH_MEMORY_TYPES.includes(entry.type)) throw new TypeError(`coach memory entry type must be one of: ${COACH_MEMORY_TYPES.join(', ')}`);
  if (!isNonEmptyString(entry.statement)) throw new TypeError('coach memory entry statement must be a non-empty string');
  if (!isUnitNumber(entry.confidence)) throw new TypeError('coach memory entry confidence must be a number in [0,1]');
  if (!isUnitNumber(entry.weight)) throw new TypeError('coach memory entry weight must be a number in [0,1]');
  if (!Array.isArray(entry.tags) || !entry.tags.every(isNonEmptyString)) throw new TypeError('coach memory entry tags must be an array of non-empty strings');
  if (!Array.isArray(entry.ontologyLinks)) throw new TypeError('coach memory entry ontologyLinks must be an array');
  for (const link of entry.ontologyLinks) {
    if (!link || typeof link !== 'object' || !ONTOLOGY_KINDS.includes(link.kind) || !isNonEmptyString(link.id)) {
      throw new TypeError('coach memory entry ontologyLinks must be { kind, id } with a valid kind and non-empty id');
    }
  }
  if (!Array.isArray(entry.evidenceRefs) || !entry.evidenceRefs.every(r => typeof r === 'string')) {
    throw new TypeError('coach memory entry evidenceRefs must be an array of strings');
  }
  if (!COACH_MEMORY_SOURCES.includes(entry.source)) throw new TypeError(`coach memory entry source must be one of: ${COACH_MEMORY_SOURCES.join(', ')}`);
  if (!isIsoDate(entry.createdAt)) throw new TypeError('coach memory entry createdAt must be an ISO date string');
  if (entry.updatedAt !== undefined && !isIsoDate(entry.updatedAt)) throw new TypeError('coach memory entry updatedAt must be an ISO date string when present');
  return true;
}

const dedupeStrings = list => [...new Set(list.map(s => s.trim()).filter(Boolean))];

function dedupeOntologyLinks(links) {
  const seen = new Set();
  const out = [];
  for (const link of links) {
    const id = link.id.trim();
    const dedupeId = `${link.kind}:${id}`;
    if (seen.has(dedupeId)) continue;
    seen.add(dedupeId);
    out.push({ kind: link.kind, id });
  }
  return out;
}

/** Normalise a VALID entry: trim statement/tags/refs/link ids, de-duplicate, keep only schema fields. */
export function normaliseCoachMemoryEntry(entry) {
  validateCoachMemoryEntry(entry);
  const normalised = {
    id: entry.id.trim(),
    type: entry.type,
    statement: entry.statement.trim(),
    confidence: entry.confidence,
    weight: entry.weight,
    tags: dedupeStrings(entry.tags),
    ontologyLinks: dedupeOntologyLinks(entry.ontologyLinks),
    evidenceRefs: dedupeStrings(entry.evidenceRefs),
    source: entry.source,
    createdAt: entry.createdAt,
  };
  if (entry.updatedAt !== undefined) normalised.updatedAt = entry.updatedAt;
  return normalised;
}

async function loadCollection(teamId, coachId) {
  const stored = await kvGet(coachMemoryKey(teamId, coachId));
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

// Deterministic ordering: createdAt ascending, then id ascending — same input set → same list.
function sortEntries(entries) {
  return entries.sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Persist one validated coach memory entry for a team+coach. Rejects duplicate ids — memories are
 * immutable records; corrections are new entries. Returns the normalised entry as stored (frozen).
 */
export async function createCoachMemory({ teamId, coachId }, entry) {
  const normalised = normaliseCoachMemoryEntry(entry);
  const collection = await loadCollection(teamId, coachId);
  if (collection[normalised.id]) throw new Error(`coach memory entry '${normalised.id}' already exists`);
  const next = { ...collection, [normalised.id]: normalised };
  await kvSet(coachMemoryKey(teamId, coachId), next);
  return Object.freeze({ ...normalised });
}

/**
 * List all coach memory entries for a team+coach in deterministic order (createdAt, then id).
 * An empty or missing store yields []. Entries are copies — mutating them never touches storage.
 */
export async function listCoachMemories({ teamId, coachId }) {
  const collection = await loadCollection(teamId, coachId);
  return sortEntries(Object.values(collection).map(copyEntry));
}

/** Read one coach memory entry by id, or null when absent. The entry is a copy. */
export async function getCoachMemory({ teamId, coachId }, entryId) {
  if (!isNonEmptyString(entryId)) return null;
  const collection = await loadCollection(teamId, coachId);
  const entry = collection[entryId.trim()];
  return entry ? copyEntry(entry) : null;
}

// Detached copy of one stored record. Shape-tolerant on purpose: a corrupted record (e.g. a bad
// manual write around create's validation) is passed through as-is for the downstream adapter to
// reject with a reason — the read path must never throw and blank a whole collection.
function copyEntry(e) {
  if (!e || typeof e !== 'object') return e;
  return {
    ...e,
    tags: Array.isArray(e.tags) ? [...e.tags] : e.tags,
    ontologyLinks: Array.isArray(e.ontologyLinks) ? e.ontologyLinks.map(l => (l && typeof l === 'object' ? { ...l } : l)) : e.ontologyLinks,
    evidenceRefs: Array.isArray(e.evidenceRefs) ? [...e.evidenceRefs] : e.evidenceRefs,
  };
}
