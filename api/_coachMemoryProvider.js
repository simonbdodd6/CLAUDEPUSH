// api/_coachMemoryProvider.js — Coach Memory provider for the Brain (Core Memory M3, DORMANT)
//
// The wiring layer that completes the Core→Brain memory path:
//
//     listCoachMemories(scope)  →  adaptCoachMemoriesForBrain(records)  →  getCoachMemories()
//
// The Brain provider contract is SYNCHRONOUS (`getCoachMemories: () => entries`) while the store
// read is async, so this module follows the existing buildBrainProviders() pattern: pre-load once,
// then hand the Brain a closure over the already-adapted, frozen result. On the Brain branch the
// swap is one line inside buildBrainProviders():
//
//     const coachMemories = await loadCoachMemoriesForBrain({ teamId, coachId });
//     ...
//     getCoachMemories: () => coachMemories,     // was: () => []  (Phase 0 placeholder)
//
// Fail-safe by construction — the neutral-DNA path is preserved in every degraded case:
//   • empty store            → []   (identical to today's placeholder behaviour)
//   • store unavailable      → []   (Redis down / not configured — recorded in the report)
//   • invalid scope          → []   (missing teamId/coachId can never fall through to another tenant)
//   • malformed stored data  → the M286 adapter excludes it, valid records still flow
//
// Tenant isolation and deterministic ordering come from the layers below: the store reads exactly
// one team+coach key and sorts by (createdAt, id); the adapter preserves that order and validates
// every record against the M108 contract before the Brain ever sees it.
//
// OWNER FIELDS (Build 115). The Brain's M108 entry is self-describing: validateCoachMemoryEntry —
// run by M113 extractCoachDnaSignals on every entry — REQUIRES a non-empty `coachId` and `clubId`,
// and throws without them. Stored records carry neither (the tenant is the storage KEY, not a field),
// so the provider attaches them from the SAME scope the read was keyed on: `coachId` = scope.coachId,
// `clubId` = scope.teamId (Core's tenant is the Brain's club — the mapping the Brain branch's own
// getCoachIdentity() uses). They can never disagree with the data: the store only returns that one
// team+coach collection. Nothing is read from the record or the caller beyond that scope.
//
// No AI/LLM, no recommendations, no reasoning, no UI. Nothing imports this module yet — wiring it
// into a live endpoint is a later, deliberate activation step.

import { listCoachMemories } from './_coachMemoryStore.js';
import { adaptCoachMemoriesForBrain } from './_coachMemoryBrainAdapter.js';

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k]);
    Object.freeze(value);
  }
  return value;
}

const EMPTY_MEMORIES = deepFreeze([]);

const isNonEmptyString = v => typeof v === 'string' && v.trim().length > 0;

// The Brain-side owner of every entry in this load: exactly the scope the store read was keyed on
// (trimmed, as the store trims it for the key). null when the scope cannot name a single owner.
function ownerOf(scope) {
  if (!scope || !isNonEmptyString(scope.teamId) || !isNonEmptyString(scope.coachId)) return null;
  return { coachId: scope.coachId.trim(), clubId: scope.teamId.trim() };
}

// Attach the owner fields the Brain's M108 contract requires. Field order mirrors the Brain's
// normalizeCoachMemoryEntry (id, coachId, clubId, …); every adapted value passes through unchanged.
function withOwner(entry, owner) {
  const { id, ...rest } = entry;
  return { id, coachId: owner.coachId, clubId: owner.clubId, ...rest };
}

/**
 * Load and adapt one coach's persisted memories into the Brain-ready M108 entry array.
 * Never throws: every failure degrades to the neutral-DNA empty array.
 *
 * @param {{ teamId: string, coachId: string }} scope
 * @returns {Promise<ReadonlyArray<object>>} frozen, deterministically ordered M108 entries.
 */
export async function loadCoachMemoriesForBrain(scope) {
  return (await createCoachMemoryProvider(scope)).getCoachMemories();
}

/**
 * Build the Brain-facing coach memory provider for one team+coach: an async pre-load returning a
 * frozen object whose `getCoachMemories()` is synchronous, matching the Brain provider contract.
 * `getCoachMemoryAdapterReport()` exposes what happened during the load (for diagnostics/tests) —
 * the Brain itself only ever consumes `getCoachMemories()`.
 *
 * @param {{ teamId: string, coachId: string }} scope
 * @returns {Promise<Readonly<{ getCoachMemories: () => ReadonlyArray<object>, getCoachMemoryAdapterReport: () => object }>>}
 */
export async function createCoachMemoryProvider(scope) {
  let records = null;
  let storeAvailable = true;
  let loadIssue = null;

  try {
    records = await listCoachMemories(scope && typeof scope === 'object' ? scope : {});
  } catch (error) {
    // Invalid scope (tenant ids missing) or store unreachable — neutral DNA, reason recorded.
    storeAvailable = false;
    loadIssue = String(error && error.message ? error.message : error);
  }

  const adapted = storeAvailable ? adaptCoachMemoriesForBrain(records) : null;
  // A successful store read implies a valid scope (the store throws otherwise), so `owner` is set
  // whenever there are adapted memories; the guard keeps the neutral path if that ever changes.
  const owner = ownerOf(scope);
  const memories = adapted && adapted.valid && owner && adapted.memories.length
    ? deepFreeze(adapted.memories.map(entry => withOwner(entry, owner)))
    : EMPTY_MEMORIES;

  const report = deepFreeze({
    type: 'coach-memory-provider-report',
    schemaVersion: 1,
    milestone: 'Core Memory M3',
    storeAvailable,
    adapterUsed: adapted !== null,
    adaptedCount: adapted ? adapted.adaptedCount : 0,
    rejectedCount: adapted ? adapted.rejectedCount : 0,
    rejected: adapted ? adapted.rejected.map(r => ({ ...r })) : [],
    adapterFingerprint: adapted ? adapted.adapterFingerprint : null,
    ownerAttached: memories.length > 0,
    neutralDna: memories.length === 0,
    issues: loadIssue ? [loadIssue] : [],
  });

  return Object.freeze({
    /** Synchronous Brain provider contract — the already-adapted, frozen M108 entry array. */
    getCoachMemories: () => memories,
    /** What the load did: availability, adapter counts, rejections. Diagnostics only. */
    getCoachMemoryAdapterReport: () => report,
  });
}
