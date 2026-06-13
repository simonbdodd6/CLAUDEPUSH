// Executive Cognitive Engine — confidence evaluation (stage 6).
//
// Confidence here is the planner's confidence in the PLAN itself (is it well-formed,
// did we recognise the objective, do we know what evidence/domains are involved) —
// NOT confidence in achieving the objective. It is a transparent additive model so
// every point is explainable. Reuses PIF-3's band classifier (no duplication).

import { bandFor } from '../executive-reasoning/index.js';

const BASE = 40;

export function evaluatePlanConfidence({ discovered, evidence }) {
  const contributions = [];
  let value = BASE;
  contributions.push({ factor: 'base', points: BASE });

  if (discovered.patternIds.length > 0) { value += 20; contributions.push({ factor: 'recognised objective pattern', points: 20 }); }
  if (discovered.domains.length > 0)     { value += 12; contributions.push({ factor: 'domains discovered', points: 12 }); }
  if (evidence.requirements.length > 0)  { value += 10; contributions.push({ factor: 'evidence requirements identified', points: 10 }); }

  // Penalise ambiguity: an objective that matched nothing is barely a plan.
  if (discovered.domains.length === 0) { value -= 25; contributions.push({ factor: 'no domain matched (ambiguous)', points: -25 }); }

  // Small bonus when evidence is actually present in the graph (grounded coverage).
  if (evidence.grounded && evidence.coverage > 0) {
    const bonus = Math.round(8 * evidence.coverage);
    value += bonus; contributions.push({ factor: 'evidence already present', points: bonus });
  }

  value = Math.max(0, Math.min(95, value));
  return {
    value,
    band: bandFor(value),
    contributions,
    basis: 'Deterministic additive model over plan completeness — not a probability of success.',
  };
}
