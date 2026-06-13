// Executive Cognitive Engine — Evidence Requirements Engine (stage 4).
//
// Determines what evidence the objective needs (from the domain profiles) and, when
// a Knowledge Graph (PIF-4) is supplied, checks whether that evidence is ALREADY
// known to the platform. This is where "missing information" comes from — grounded
// in the graph when available, declared as required-but-unverified otherwise.

import { getProfile } from './capability-map.js';

export function determineEvidenceRequirements(discovered, context = {}) {
  const kg = context.knowledgeGraph ?? null;
  const requirements = [];

  for (const d of discovered.domains) {
    const profile = getProfile(d.domain);
    if (!profile) continue;
    for (const ev of profile.evidence) {
      requirements.push({
        need: ev.need,
        source: ev.source,
        domain: d.domain,
        impact: ev.impact ?? 'major',
        status: evidenceStatus(kg, ev, d.domain),
      });
    }
  }

  const missing = requirements.filter(r => r.status !== 'present');
  const present = requirements.filter(r => r.status === 'present');
  const coverage = requirements.length ? present.length / requirements.length : 0;

  return {
    requirements,
    missing: missing.map(r => ({ need: r.need, source: r.source, impact: r.impact })),
    present: present.map(r => r.need),
    coverage,                       // 0..1
    grounded: Boolean(kg),          // was presence checked against a real graph?
  };
}

// Presence check: does the graph already hold an evidence/source entity for this need?
function evidenceStatus(kg, ev, domain) {
  if (!kg) return 'unverified';     // no graph → we know it's required, not whether we have it
  try {
    const evidenceEntities = (kg.entitiesByType?.('evidence') ?? []);
    const match = evidenceEntities.some(e =>
      (e.label && ev.need && e.label.toLowerCase().includes(ev.need.toLowerCase().split(' ')[0])) ||
      (e.ref?.engine && ev.source && String(e.ref.engine).toLowerCase().includes(String(ev.source).toLowerCase())));
    return match ? 'present' : 'missing';
  } catch {
    return 'unverified';
  }
}
