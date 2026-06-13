// Executive Reasoning — missing-evidence detector.
//
// Surfaces what the conclusion is MISSING, composed entirely from signals the
// platform already produces: mock-data flags, stale-data flags, absent evidence,
// small calibration samples, and any explicitly-declared expected evidence that is
// not present. It invents nothing — it only reports gaps it can observe.

import { MISSING_IMPACT, UNCERTAINTY_REASON } from './constants.js';

/**
 * @param {object} input  normalized ReasoningInput
 * @returns {object} { gaps:[], impact, summary, uncertaintyReasons:[] }
 */
export function detectMissingEvidence(input = {}) {
  const gaps = [];
  const reasons = new Set();

  const evidence = input.evidence ?? [];
  const dq = input.dataQuality ?? {};

  // 1. No evidence at all backing the conclusion.
  if (evidence.length === 0) {
    gaps.push({
      field: 'evidence',
      reason: 'No supporting evidence was attached to this conclusion.',
      impact: MISSING_IMPACT.MAJOR,
    });
    reasons.add(UNCERTAINTY_REASON.MISSING_EVIDENCE);
  }

  // 2. Mock / synthetic inputs.
  const mockEvidence = evidence.filter(e => e.isMock);
  if (dq.mock || mockEvidence.length > 0 || (Array.isArray(dq.mockFields) && dq.mockFields.length)) {
    gaps.push({
      field: 'real_data',
      reason: mockEvidence.length
        ? `${mockEvidence.length} evidence item(s) are placeholder/mock, not live data.`
        : 'Some inputs are placeholder/mock, not live data.',
      impact: MISSING_IMPACT.MAJOR,
      details: Array.isArray(dq.mockFields) ? dq.mockFields : undefined,
    });
    reasons.add(UNCERTAINTY_REASON.MOCK_DATA);
  }

  // 3. Stale inputs.
  if (Array.isArray(dq.staleFields) && dq.staleFields.length) {
    gaps.push({
      field: 'fresh_data',
      reason: `Inputs are older than expected: ${dq.staleFields.join(', ')}.`,
      impact: MISSING_IMPACT.MINOR,
      ageDays: Number.isFinite(dq.ageDays) ? dq.ageDays : undefined,
    });
    reasons.add(UNCERTAINTY_REASON.STALE_DATA);
  }

  // 4. Explicitly declared expected evidence that is absent.
  const present = new Set(evidence.map(e => e.field ?? e.id ?? e.fact).filter(Boolean));
  for (const expected of input.expectedEvidence ?? []) {
    const key = typeof expected === 'string' ? expected : expected.field;
    if (key && !present.has(key)) {
      gaps.push({
        field: key,
        reason: `Expected evidence "${key}" was not available.`,
        impact: (typeof expected === 'object' && expected.impact) || MISSING_IMPACT.MAJOR,
      });
      reasons.add(UNCERTAINTY_REASON.MISSING_EVIDENCE);
    }
  }

  // 5. Thin calibration sample.
  const sampleSize = input.confidence?.sampleSize;
  if (Number.isFinite(sampleSize) && sampleSize < 3) {
    gaps.push({
      field: 'outcome_history',
      reason: `Confidence is calibrated on only ${sampleSize} prior outcome(s); more history is needed.`,
      impact: MISSING_IMPACT.MINOR,
    });
    reasons.add(UNCERTAINTY_REASON.SMALL_SAMPLE);
  }

  const impact = gaps.some(g => g.impact === MISSING_IMPACT.CRITICAL) ? MISSING_IMPACT.CRITICAL
    : gaps.some(g => g.impact === MISSING_IMPACT.MAJOR) ? MISSING_IMPACT.MAJOR
    : gaps.length ? MISSING_IMPACT.MINOR
    : null;

  return {
    gaps,
    impact,
    summary: gaps.length
      ? `${gaps.length} information gap(s) detected; strongest impact: ${impact}.`
      : 'No information gaps detected from available signals.',
    uncertaintyReasons: [...reasons],
  };
}
