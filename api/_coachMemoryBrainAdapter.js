// api/_coachMemoryBrainAdapter.js — Coach Memory → Brain adapter (M286, DORMANT)
//
// The deterministic adapter between persisted Coach Memory records and the Brain's Coach DNA
// pipeline. It validates and normalises supplied memory records into the exact M108 entry shape
// the Brain consumes (M113 extractCoachDnaSignals → M230 buildCoachDnaCoachView), and reports —
// never repairs — anything that does not conform.
//
// It is an ADAPTER ONLY. It performs no reasoning, no classification, no summarising of content,
// no recommendation and no inference: every accepted entry is the caller's record with ONLY
// whitespace trimmed and duplicate tags/refs/links removed (the M108 normalisation contract).
// Ids, timestamps, confidence, weight, source, ontology links and evidence refs pass through
// verbatim; optional fields absent on input stay absent on output — nothing is ever invented.
// Records that fail validation are rejected with a reason and an index; unknown remains unknown.
//
// Pure and dormant: no route imports it, nothing runs it at runtime, and it touches no network,
// filesystem, database, clock or randomness. Input is never mutated; output is deeply frozen.
// Same input → same output, byte for byte.
//
// Schema (mirrors packages/coach-memory/model.js M108 on the Brain branch — keep in sync).

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNonEmptyString = v => typeof v === 'string' && v.trim().length > 0;
const isUnitNumber = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const isIsoDate = v => typeof v === 'string' && !Number.isNaN(Date.parse(v));

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

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k]);
    Object.freeze(value);
  }
  return value;
}

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`;
}

// FNV-1a 32-bit — the same fingerprint convention used across the Brain pipeline, for consistency.
function fingerprint(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`;
}

// Why one record does not conform to M108 — the FIRST problem found, or null when valid.
function rejectionReasonOf(entry) {
  if (!isObj(entry)) return 'record must be an object';
  if (!isNonEmptyString(entry.id)) return 'id must be a non-empty string';
  if (!COACH_MEMORY_TYPES.includes(entry.type)) return `type must be one of: ${COACH_MEMORY_TYPES.join(', ')}`;
  if (!isNonEmptyString(entry.statement)) return 'statement must be a non-empty string';
  if (!isUnitNumber(entry.confidence)) return 'confidence must be a number in [0,1]';
  if (!isUnitNumber(entry.weight)) return 'weight must be a number in [0,1]';
  if (!Array.isArray(entry.tags) || !entry.tags.every(isNonEmptyString)) return 'tags must be an array of non-empty strings';
  if (!Array.isArray(entry.ontologyLinks)) return 'ontologyLinks must be an array';
  for (const link of entry.ontologyLinks) {
    if (!isObj(link) || !ONTOLOGY_KINDS.includes(link.kind) || !isNonEmptyString(link.id)) {
      return 'ontologyLinks must be { kind, id } with a valid kind and non-empty id';
    }
  }
  if (!Array.isArray(entry.evidenceRefs) || !entry.evidenceRefs.every(r => typeof r === 'string')) return 'evidenceRefs must be an array of strings';
  if (!COACH_MEMORY_SOURCES.includes(entry.source)) return `source must be one of: ${COACH_MEMORY_SOURCES.join(', ')}`;
  if (!isIsoDate(entry.createdAt)) return 'createdAt must be an ISO date string';
  if (entry.updatedAt !== undefined && !isIsoDate(entry.updatedAt)) return 'updatedAt must be an ISO date string when present';
  return null;
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

// The M108 normalisation contract: trim + de-duplicate ONLY. Every value passes through verbatim;
// optional fields stay absent when absent — the adapter never invents.
function normalise(entry) {
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

/**
 * Adapt supplied coach memory records into the exact M108 entry shape the Brain consumes.
 *
 * Accepted records keep their INPUT ORDER (the adapter imposes no ordering of its own) and pass
 * through with only trim/de-duplicate normalisation. Non-conforming records and duplicate ids
 * (first occurrence wins) are rejected with an index, id where known, and a reason.
 *
 * @param {object[]} memories coach memory records (e.g. from the persisted coach memory store)
 * @returns {object} frozen adapter result — result.memories is the Brain-ready entry array.
 */
export function adaptCoachMemoriesForBrain(memories) {
  const inputRecognized = Array.isArray(memories);
  const records = inputRecognized ? memories : [];

  const adapted = [];
  const rejected = [];
  const seenIds = new Set();
  records.forEach((record, index) => {
    const reason = rejectionReasonOf(record);
    if (reason) {
      rejected.push({ index, id: isObj(record) && isNonEmptyString(record.id) ? record.id.trim() : null, reason });
      return;
    }
    const entry = normalise(record);
    if (seenIds.has(entry.id)) {
      rejected.push({ index, id: entry.id, reason: 'duplicate id (first occurrence kept)' });
      return;
    }
    seenIds.add(entry.id);
    adapted.push(entry);
  });

  const issues = [];
  if (!inputRecognized) issues.push('memories must be an array of coach memory records');

  const draft = {
    type: 'coach-memory-brain-adapter-result',
    schemaVersion: 1,
    adapterVersion: 1,
    milestone: 'M286',
    valid: inputRecognized,
    memories: adapted,
    adaptedCount: adapted.length,
    rejectedCount: rejected.length,
    rejected,
    provenance: {
      source: 'supplied-coach-memory-records',
      targetSchema: 'M108 coach memory entry',
      consumedBy: ['M113 extractCoachDnaSignals', 'M230 buildCoachDnaCoachView'],
      inputOrderPreserved: true,
    },
    validationState: {
      inputRecognized,
      totalRecords: records.length,
      issues,
    },
    derivationMetadata: {
      milestone: 'M286',
      layer: 'memory-adapter',
      deterministic: true,
      pure: true,
      llmGenerated: false,
      readOnly: true,
      dormant: true,
      adapterOnly: true,
      performsReasoning: false,
      classifiesRecords: false,
      summarisesContent: false,
      infersMissingData: false,
      createsRecommendations: false,
      coachAdvice: false,
      containsPlayerData: false,
      playerEvaluation: false,
      trainingRecommendation: false,
      generatesTrainingContent: false,
      analysesSessions: false,
    },
  };

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this result.
  draft.adapterFingerprint = fingerprint(canonicalStringify(draft));
  return deepFreeze(draft);
}

/**
 * Validate supplied records against the M108 contract without adapting — a deterministic report.
 * @param {object[]} memories coach memory records
 * @returns {object} frozen validation report.
 */
export function validateCoachMemoryAdapter(memories) {
  const result = adaptCoachMemoriesForBrain(memories);
  const draft = {
    type: 'coach-memory-brain-adapter-validation',
    schemaVersion: 1,
    milestone: 'M286',
    valid: result.valid && result.rejectedCount === 0,
    inputRecognized: result.validationState.inputRecognized,
    totalRecords: result.validationState.totalRecords,
    validRecords: result.adaptedCount,
    invalidRecords: result.rejectedCount,
    issues: result.rejected.map(r => ({ ...r })),
    duplicateIds: result.rejected.filter(r => r.reason.startsWith('duplicate id')).map(r => r.id),
  };
  draft.validationFingerprint = fingerprint(canonicalStringify(draft));
  return deepFreeze(draft);
}

/**
 * Render a compact, deterministic, timestamp-free summary of an adaptation for logs or PR notes.
 * @param {object[]} memories coach memory records
 * @returns {string}
 */
export function summarizeCoachMemoryAdapter(memories) {
  const result = adaptCoachMemoriesForBrain(memories);
  return [
    `Coach memory brain adapter: ${result.valid ? (result.rejectedCount === 0 ? 'all records adapted' : 'adapted with rejections') : 'unusable input'}`,
    `Adapted: ${result.adaptedCount}/${result.validationState.totalRecords} · Rejected: ${result.rejectedCount}`,
    `Target schema: ${result.provenance.targetSchema}`,
    `Fingerprint: ${result.adapterFingerprint}`,
  ].join('\n');
}
