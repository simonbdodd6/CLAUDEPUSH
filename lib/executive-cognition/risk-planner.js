// Executive Cognitive Engine — Risk Planner (stage 7).
//
// Composes a risk assessment for the plan from the domains involved, the evidence
// gaps, and the plan confidence. Deterministic: the risk level is the max of the
// domain risks, escalated by missing critical evidence or low confidence.

import { RISK_LEVEL, maxRisk, riskRank } from './constants.js';
import { getProfile } from './capability-map.js';

export function assessRisk(discovered, evidence, confidence) {
  const factors = [];
  let level = RISK_LEVEL.LOW;

  for (const d of discovered.domains) {
    const p = getProfile(d.domain);
    if (p?.risk) {
      level = maxRisk(level, p.risk);
      if (riskRank(p.risk) >= riskRank(RISK_LEVEL.HIGH)) factors.push(`High-stakes domain: ${p.label}.`);
    }
  }

  const criticalMissing = (evidence.missing ?? []).filter(m => m.impact === 'critical');
  if (criticalMissing.length) {
    level = maxRisk(level, RISK_LEVEL.HIGH);
    factors.push(`Missing critical evidence: ${criticalMissing.map(m => m.need).join(', ')}.`);
  }

  if (confidence.band === 'low' || confidence.band === 'very_low') {
    level = maxRisk(level, RISK_LEVEL.HIGH);
    factors.push('Low plan confidence increases execution risk.');
  }

  if (factors.length === 0) factors.push('No elevated risk factors detected.');

  return { level, score: riskRank(level) * 25, factors };
}
