// Executive Cognitive Engine — the Capability Map.
//
// This is the single, data-driven source of truth that makes the engine
// deterministic AND extensible. It is plain configuration: future verticals are
// added by appending entries here — no engine code changes. Nothing here calls a
// model; planning is keyword/pattern matching against this registry.
//
// Two layers:
//   • OBJECTIVE_PATTERNS — high-level intents that pull in a SET of domains at once
//     (e.g. "increase revenue" → sales + marketing + finance, CEO approval, sim).
//   • DOMAIN_PROFILES   — per-domain capabilities, evidence needs, approval owner,
//     simulation default and risk.

import { RISK_LEVEL } from './constants.js';

// ── Domain profiles ────────────────────────────────────────────────────────────
// `featureFlag` references the existing brain/config intelligence.features schema.
export const DOMAIN_PROFILES = {
  sales: {
    domain: 'sales', label: 'Sales',
    signals: ['sales', 'revenue', 'pipeline', 'deal', 'cac', 'mrr', 'arr', 'conversion', 'quota'],
    capabilities: ['crm.read', 'pipeline.analyse'],
    evidence: [
      { need: 'Current CAC', source: 'CRM', impact: 'major' },
      { need: 'Pipeline value', source: 'CRM', impact: 'major' },
    ],
    simulationDefault: true, approvalOwner: 'director', approvalTier: 'HUMAN',
    risk: RISK_LEVEL.HIGH, featureFlag: 'benchmarking',
  },
  marketing: {
    domain: 'marketing', label: 'Marketing',
    signals: ['marketing', 'campaign', 'brand', 'acquisition', 'ads', 'seo', 'traffic', 'awareness'],
    capabilities: ['analytics.read', 'campaign.plan'],
    evidence: [{ need: 'Marketing analytics', source: 'Marketing Analytics', impact: 'major' }],
    simulationDefault: true, approvalOwner: 'manager', approvalTier: 'APPROVE',
    risk: RISK_LEVEL.MEDIUM, featureFlag: 'benchmarking',
  },
  finance: {
    domain: 'finance', label: 'Finance',
    signals: ['finance', 'revenue', 'profit', 'margin', 'cost', 'mrr', 'arr', 'budget', 'cashflow'],
    capabilities: ['accounting.read', 'forecast.run'],
    evidence: [
      { need: 'MRR', source: 'Accounting', impact: 'critical' },
      { need: 'Cost base', source: 'Accounting', impact: 'major' },
    ],
    simulationDefault: true, approvalOwner: 'CEO', approvalTier: 'HUMAN',
    risk: RISK_LEVEL.HIGH, featureFlag: 'benchmarking',
  },
  product: {
    domain: 'product', label: 'Product',
    signals: ['product', 'feature', 'churn', 'retention', 'roadmap', 'usage'],
    capabilities: ['usage.read', 'roadmap.plan'],
    evidence: [{ need: 'Usage metrics', source: 'Product Analytics', impact: 'major' }],
    simulationDefault: false, approvalOwner: 'director', approvalTier: 'APPROVE',
    risk: RISK_LEVEL.MEDIUM, featureFlag: 'benchmarking',
  },
  operations: {
    domain: 'operations', label: 'Operations',
    signals: ['operations', 'process', 'efficiency', 'capacity', 'logistics', 'scheduling'],
    capabilities: ['ops.read'],
    evidence: [{ need: 'Capacity data', source: 'Operations', impact: 'minor' }],
    simulationDefault: false, approvalOwner: 'manager', approvalTier: 'APPROVE',
    risk: RISK_LEVEL.MEDIUM, featureFlag: 'benchmarking',
  },
  // ── Coach's Eye vertical ──
  coaching: {
    domain: 'coaching', label: 'Coaching',
    signals: ['team', 'squad', 'training', 'attendance', 'fitness', 'injury', 'player', 'session', 'match', 'win', 'performance'],
    capabilities: ['memory.read', 'club-intelligence.read', 'coaching-engine.generate'],
    evidence: [
      { need: 'Squad attendance', source: 'memory-engine', impact: 'major' },
      { need: 'Injury status', source: 'memory-engine', impact: 'major' },
    ],
    simulationDefault: false, approvalOwner: 'coach', approvalTier: 'APPROVE',
    risk: RISK_LEVEL.MEDIUM, featureFlag: 'autonomousAssistant',
  },
  // ── Website Lead vertical ──
  recruitment: {
    domain: 'recruitment', label: 'Lead / Growth',
    signals: ['lead', 'outreach', 'prospect', 'club', 'sign up', 'onboarding'],
    capabilities: ['lead-personalisation.read', 'outreach.draft'],
    evidence: [{ need: 'Lead fit score', source: 'lead-personalisation', impact: 'major' }],
    simulationDefault: false, approvalOwner: 'manager', approvalTier: 'APPROVE',
    risk: RISK_LEVEL.MEDIUM, featureFlag: 'benchmarking',
  },
  // ── Wedding / Travel / Hospitality verticals ──
  wedding: {
    domain: 'wedding', label: 'Wedding',
    signals: ['wedding', 'venue', 'guest', 'ceremony', 'reception', 'booking'],
    capabilities: ['venue.read', 'booking.plan'],
    evidence: [{ need: 'Venue availability', source: 'venue-store', impact: 'major' }],
    simulationDefault: false, approvalOwner: 'manager', approvalTier: 'APPROVE',
    risk: RISK_LEVEL.LOW, featureFlag: 'benchmarking',
  },
  travel: {
    domain: 'travel', label: 'Travel',
    signals: ['trip', 'travel', 'itinerary', 'holiday', 'honeymoon', 'destination', 'flight'],
    capabilities: ['trip.read', 'itinerary.plan'],
    evidence: [{ need: 'Traveller preferences', source: 'trip-platform', impact: 'minor' }],
    simulationDefault: false, approvalOwner: 'manager', approvalTier: 'APPROVE',
    risk: RISK_LEVEL.LOW, featureFlag: 'benchmarking',
  },
  hospitality: {
    domain: 'hospitality', label: 'Hospitality',
    signals: ['hotel', 'booking', 'occupancy', 'guest', 'stay', 'reservation'],
    capabilities: ['booking.read', 'occupancy.forecast'],
    evidence: [{ need: 'Occupancy data', source: 'booking-store', impact: 'major' }],
    simulationDefault: true, approvalOwner: 'manager', approvalTier: 'APPROVE',
    risk: RISK_LEVEL.MEDIUM, featureFlag: 'benchmarking',
  },
};

// ── Objective patterns (multi-domain intents) ──────────────────────────────────
export const OBJECTIVE_PATTERNS = [
  { id: 'grow-revenue',     match: /\b(increase|grow|boost|improve)\b.*\b(revenue|sales|profit|mrr|arr|growth)\b|\brevenue\b/i,
    domains: ['sales', 'marketing', 'finance'], simulation: true, approvalOwner: 'CEO', risk: RISK_LEVEL.HIGH },
  { id: 'reduce-churn',     match: /\b(reduce|cut|lower)\b.*\b(churn|attrition)\b|\bretention\b/i,
    domains: ['product', 'sales', 'finance'], simulation: true, approvalOwner: 'director', risk: RISK_LEVEL.HIGH },
  { id: 'cut-cost',         match: /\b(reduce|cut|lower)\b.*\b(cost|spend|burn)\b/i,
    domains: ['finance', 'operations'], simulation: true, approvalOwner: 'CEO', risk: RISK_LEVEL.HIGH },
  { id: 'acquire-customers',match: /\b(acquire|win|get)\b.*\b(customers|clients|leads)\b|\blead generation\b/i,
    domains: ['marketing', 'sales', 'recruitment'], simulation: false, approvalOwner: 'manager', risk: RISK_LEVEL.MEDIUM },
  { id: 'improve-team',     match: /\b(improve|increase|boost)\b.*\b(team|squad|performance|attendance|fitness|win)\b/i,
    domains: ['coaching'], simulation: false, approvalOwner: 'coach', risk: RISK_LEVEL.MEDIUM },
  { id: 'plan-wedding',     match: /\bwedding\b|\bvenue\b/i,
    domains: ['wedding'], simulation: false, approvalOwner: 'manager', risk: RISK_LEVEL.LOW },
  { id: 'plan-trip',        match: /\b(trip|travel|itinerary|holiday|honeymoon)\b/i,
    domains: ['travel'], simulation: false, approvalOwner: 'manager', risk: RISK_LEVEL.LOW },
];

export function getProfile(domain) { return DOMAIN_PROFILES[domain] ?? null; }
export function allDomains() { return Object.keys(DOMAIN_PROFILES); }

/** Patterns whose regex matches the objective text. Deterministic order. */
export function matchPatterns(text) {
  return OBJECTIVE_PATTERNS.filter(p => p.match.test(text));
}
