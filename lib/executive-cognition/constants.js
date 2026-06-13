// Executive Cognitive Engine — shared constants.
//
// The cognitive engine is a deterministic PLANNER. It coordinates existing platform
// capabilities and returns a plan. It never calls an LLM and never executes.

export const PLAN_SCHEMA_VERSION = '1.0.0';

// The fixed reasoning pipeline. Stages run in this order; each consumes the prior.
export const STAGE = {
  INTERPRET:    'interpret-objective',
  DOMAINS:      'discover-domains',
  CAPABILITIES: 'select-capabilities',
  EVIDENCE:     'determine-evidence-requirements',
  TRAVERSAL:    'plan-knowledge-graph-traversal',
  CONFIDENCE:   'evaluate-confidence',
  RISK:         'assess-risk',
  SIMULATION:   'plan-simulation',
  APPROVAL:     'plan-approval',
  EXECUTION:    'generate-execution-plan',
};

export const STAGE_ORDER = [
  STAGE.INTERPRET, STAGE.DOMAINS, STAGE.CAPABILITIES, STAGE.EVIDENCE, STAGE.TRAVERSAL,
  STAGE.CONFIDENCE, STAGE.RISK, STAGE.SIMULATION, STAGE.APPROVAL, STAGE.EXECUTION,
];

export const RISK_LEVEL = {
  LOW:      'low',
  MEDIUM:   'medium',
  HIGH:     'high',
  CRITICAL: 'critical',
};

const RISK_RANK = { low: 1, medium: 2, high: 3, critical: 4 };
export function maxRisk(a, b) {
  return (RISK_RANK[a] ?? 0) >= (RISK_RANK[b] ?? 0) ? (a ?? b) : (b ?? a);
}
export function riskRank(level) { return RISK_RANK[level] ?? 0; }

// Recommended next action — the cognitive plan's terminal state.
export const NEXT_ACTION = {
  GATHER_EVIDENCE:  'gather-evidence',
  RUN_SIMULATION:   'run-simulation',
  REQUEST_APPROVAL: 'request-approval',
  PROCEED:          'proceed',
  CLARIFY:          'clarify-objective',
};

// Approval authority ranking (who must sign off). Higher wins when several apply.
export const APPROVAL_AUTHORITY = {
  none:     0,
  coach:    1,
  manager:  2,
  director: 3,
  CEO:      4,
};
export function higherAuthority(a, b) {
  return (APPROVAL_AUTHORITY[a] ?? 0) >= (APPROVAL_AUTHORITY[b] ?? 0) ? (a ?? b) : (b ?? a);
}
