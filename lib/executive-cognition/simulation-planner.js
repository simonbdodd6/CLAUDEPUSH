// Executive Cognitive Engine — Simulation Planner (stage 8).
//
// Determines whether a Digital Twin simulation should run before acting. Required
// when any matched objective pattern or domain calls for it, or when high-stakes
// risk meets meaningful uncertainty. Names the inputs the simulation would consume.

import { matchPatterns, getProfile } from './capability-map.js';
import { RISK_LEVEL, riskRank } from './constants.js';

export function planSimulation(interpreted, discovered, evidence, risk) {
  const reasons = [];

  const patternWants = matchPatterns(interpreted.normalized).some(p => p.simulation);
  if (patternWants) reasons.push('Objective type typically requires modelling before action.');

  const domainWants = discovered.domains.some(d => getProfile(d.domain)?.simulationDefault);
  if (domainWants) reasons.push('A domain in scope defaults to simulation.');

  const riskyAndUncertain = riskRank(risk.level) >= riskRank(RISK_LEVEL.HIGH) && (evidence.coverage ?? 0) < 1;
  if (riskyAndUncertain) reasons.push('High risk with incomplete evidence — simulate to bound outcomes.');

  const required = reasons.length > 0;
  return {
    required,
    reason: required ? reasons.join(' ') : 'No simulation indicated.',
    inputs: required ? (evidence.missing ?? []).map(m => m.need) : [],
    // Note: the platform's runSimulation currently runs on mock observations
    // (see PIF-3); this planner only DECIDES that a simulation is warranted.
    note: 'Decision only — simulation is not executed here.',
  };
}
