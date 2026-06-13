// Executive Reasoning — platform service factory.
//
// The single entry point a consumer wires up. It validates/normalises a
// ReasoningInput, composes the ExecutiveExplanation, optionally records it for
// later inspection, and can mirror it to a durable sink (e.g. the PIF-2 ledger)
// without owning persistence itself.

import { InvalidReasoningInputError } from './errors.js';
import { buildExecutiveExplanation, toExplainabilityPanel } from './explanation.js';
import { InMemoryExplanationRepository } from './repository.js';

/**
 * Normalise a loosely-shaped input into the canonical ReasoningInput. Tolerant by
 * design: any domain can pass its own recommendation object; unknown fields are
 * ignored and absent fields default safely.
 */
export function normalizeReasoningInput(raw = {}) {
  if (raw == null || typeof raw !== 'object') {
    throw new InvalidReasoningInputError('ReasoningInput must be an object.');
  }
  return {
    id:               raw.id ?? null,
    type:             raw.type ?? 'recommendation',
    source:           raw.source ?? raw.generatedBy ?? null,
    subject:          raw.subject ?? { title: raw.title ?? raw.id ?? 'item', summary: raw.summary ?? raw.reason ?? null },
    createdAt:        raw.createdAt ?? null,
    confidence:       normalizeConfidence(raw),
    ranking:          raw.ranking ?? (Number.isFinite(raw.rankScore) ? { score: raw.rankScore } : null),
    evidence:         Array.isArray(raw.evidence) ? raw.evidence.map(normalizeEvidence) : [],
    links:            Array.isArray(raw.links) ? raw.links : [],
    conditions:       Array.isArray(raw.conditions) ? raw.conditions : [],
    assumptions:      Array.isArray(raw.assumptions) ? raw.assumptions.map(normalizeAssumption) : [],
    alternatives:     Array.isArray(raw.alternatives) ? raw.alternatives : [],
    expectedEvidence: Array.isArray(raw.expectedEvidence) ? raw.expectedEvidence : [],
    decision:         raw.decision ?? null,
    approval:         raw.approval ?? null,
    learningOutcome:  raw.learningOutcome ?? null,
    timelineEvents:   Array.isArray(raw.timelineEvents) ? raw.timelineEvents : [],
    featureFlags:     Array.isArray(raw.featureFlags) ? raw.featureFlags : [],
    dataQuality:      raw.dataQuality ?? {},
  };
}

function normalizeConfidence(raw) {
  if (raw.confidence && typeof raw.confidence === 'object') return raw.confidence;
  if (Number.isFinite(raw.confidence)) return { value: raw.confidence };
  return { value: 0 };
}

function normalizeEvidence(e) {
  if (typeof e === 'string') return { fact: e };
  return e ?? {};
}

function normalizeAssumption(a) {
  if (typeof a === 'string') return { statement: a };
  return a ?? {};
}

/**
 * Create the Executive Reasoning platform.
 * @param {object} [opts]
 * @param {object} [opts.repository]  explanation store (defaults to in-memory)
 * @param {object} [opts.sink]        optional durable sink with append(record)
 */
export function createExecutiveReasoningPlatform(opts = {}) {
  const repository = opts.repository ?? new InMemoryExplanationRepository();
  const sink = opts.sink ?? null;

  /** Compose an explanation. Does NOT persist unless `record` is called. */
  function explain(rawInput, context = {}) {
    const input = normalizeReasoningInput(rawInput);
    return buildExecutiveExplanation(input, context);
  }

  /** Compose + store (in-memory) + mirror to durable sink if configured. */
  function record(rawInput, context = {}) {
    const explanation = explain(rawInput, context);
    repository.save(explanation);
    if (sink && typeof sink.append === 'function') {
      try {
        sink.append({
          kind: 'executive-explanation',
          explanationId: explanation.id,
          subjectId: explanation.subjectId,
          type: explanation.type,
          source: explanation.source,
          confidence: explanation.confidence.value,
          generatedAt: explanation.generatedAt,
        });
      } catch { /* durability is best-effort; never break the explain path */ }
    }
    return explanation;
  }

  return {
    explain,
    record,
    panel: (explanation) => toExplainabilityPanel(explanation),
    getById:     (id) => repository.getById(id),
    getBySubject:(id) => repository.getBySubject(id),
    list:        (limit) => repository.list(limit),
    repository,
  };
}
