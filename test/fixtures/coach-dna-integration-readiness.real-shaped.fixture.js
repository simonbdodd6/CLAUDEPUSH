/**
 * test/fixtures/coach-dna-integration-readiness.real-shaped.fixture.js - Real-shaped Core availability declaration (M285)
 *
 * The first Core-to-Brain data availability declaration written against the ACTUAL Coach's Eye Core codebase
 * (as of Brain Phase 0), for the M284 integration-readiness report. It records, per M284 required input,
 * whether current Core data can satisfy it and whether a mapping to the M230 coachView already exists.
 *
 * This fixture is a DECLARATION about code and schemas — it contains NO live data, NO personal data, NO real
 * user/club identifiers, NO credentials and NO production record contents. Every `path`/`sourceHint` is a
 * repository code path or a generic key-namespace name, and the facts were read from the code itself:
 *
 *  - Core identity IS persisted (Redis-backed `api/_identityStore.js`; `getCoachIdentity()` already exposed to
 *    the Brain in `api/_brainProviders.js`).
 *  - The coach memory SCHEMA and full mapping chain exist and are dormant-complete: M108 model
 *    (`packages/coach-memory/model.js`, whose eight COACH_MEMORY_TYPES exactly match the Brain's signal
 *    categories) → M113 `extractCoachDnaSignals` → M230 `buildCoachDnaCoachView`
 *    (`packages/coach-intelligence/coach-dna-coach-view.js`).
 *  - But Core Phase 0 persists NO coach memories: `api/_brainProviders.js` returns
 *    `getCoachMemories: () => []` ("Phase 0: no Core memory store ⇒ neutral DNA"). Every input derived from
 *    memory records is therefore declared missing — mapped, but with no data behind it.
 *
 * Deterministic constant. No clock, no randomness, no I/O — safe to commit and byte-stable across runs.
 */

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

export const REAL_SHAPED_CORE_DECLARATION = deepFreeze({
  source: 'coach-eye-core-phase0',
  fields: {
    // ---- coach-identity ----
    coachIdentity: {
      available: true,
      mapped: true,
      path: 'api/_brainProviders.js getCoachIdentity() → { coachId, clubId, tags } (Redis identity:users via api/_identityStore.js)',
    },
    coachProfileVersion: {
      available: true,
      mapped: true,
      path: 'packages/coach-memory/dna-profile.js (profile version emitted by the Brain-side builder, not stored in Core)',
    },

    // ---- coach-memory ----
    coachMemoryRecords: {
      available: false,
      mapped: true,
      path: 'schema: packages/coach-memory/model.js (M108 entry); mapping: M113 extractCoachDnaSignals → M230 buildCoachDnaCoachView',
      notes: 'Core Phase 0 persists no coach memories — api/_brainProviders.js getCoachMemories() returns [] (neutral DNA). Schema and mapping chain are complete; the store is not built.',
    },
    memoryTypeTaxonomy: {
      available: true,
      mapped: true,
      path: 'packages/coach-memory/model.js COACH_MEMORY_TYPES (eight types, identical to the Brain signal categories)',
    },

    // ---- selection-evidence (derived from memory records by type — blocked on the missing store) ----
    selectionPreferenceSignals: {
      available: false,
      mapped: true,
      path: "M113 groups entries of type 'selection-preference'; consumed by the M261-M268 selection chain",
      notes: 'Mapping implemented and tested; no persisted records to derive from.',
    },
    playerManagementSignals: {
      available: false,
      mapped: true,
      path: "M113 groups entries of type 'player-management'",
      notes: 'Mapping implemented; no persisted records.',
    },

    // ---- training-evidence (same derivation, same gap) ----
    trainingPreferenceSignals: {
      available: false,
      mapped: true,
      path: "M113 groups entries of type 'training-preference'; consumed by the M269-M276 training chain",
      notes: 'Mapping implemented and tested; no persisted records to derive from.',
    },
    tacticalPreferenceSignals: {
      available: false,
      mapped: true,
      path: "M113 groups entries of type 'tactical-preference'",
      notes: 'Mapping implemented; no persisted records.',
    },
    communicationStyleSignals: {
      available: false,
      mapped: true,
      path: "M113 groups entries of type 'communication-style'",
      notes: 'Mapping implemented; no persisted records.',
    },
    learnedPatternSignals: {
      available: false,
      mapped: true,
      path: "M113 groups entries of type 'learned-pattern'",
      notes: 'Mapping implemented; no persisted records.',
    },

    // ---- confidence-evidence (fields of the M108 entry schema — schema ready, data absent) ----
    memoryConfidenceScores: {
      available: false,
      mapped: true,
      path: 'M108 entry.confidence (validated unit interval), averaged by M113',
      notes: 'Schema-complete; no persisted entries carrying values.',
    },
    evidenceCounts: {
      available: false,
      mapped: true,
      path: 'M108 entry.evidenceRefs (string array) → supporting counts in M113/M230',
      notes: 'Schema-complete; no persisted entries.',
    },
    ontologyLinks: {
      available: false,
      mapped: true,
      path: 'M108 entry.ontologyLinks ({ kind, id }, deduplicated) → knowledge.totalOntologyLinks',
      notes: 'Schema-complete; no persisted entries.',
    },

    // ---- provenance ----
    memorySourceIdentifiers: {
      available: false,
      mapped: true,
      path: 'M108 entry.id + entry.source (COACH_MEMORY_SOURCES enum)',
      notes: 'Schema defines stable ids and source enum; no persisted entries to identify.',
    },
    memoryTimestamps: {
      available: false,
      mapped: true,
      path: 'M108 createdAt/updatedAt (caller-supplied per the model contract)',
      notes: 'Schema supports timestamps; no persisted entries.',
    },
  },
})
