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
  const memories = adapted && adapted.valid ? adapted.memories : EMPTY_MEMORIES;

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
