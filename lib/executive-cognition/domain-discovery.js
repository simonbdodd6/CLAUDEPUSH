// Executive Cognitive Engine — Domain Discovery (stage 2).
//
// Determines which domains an objective touches, deterministically, by matching the
// capability map's objective patterns AND per-domain signal keywords. Domains can be
// discovered two ways and the evidence for each is recorded for explainability.

import { matchPatterns, getProfile, DOMAIN_PROFILES } from './capability-map.js';

export function discoverDomains(interpreted) {
  const text = interpreted.normalized;
  const tokenSet = new Set(interpreted.tokens);

  const found = new Map();   // domain → { domain, label, signals:Set, via:Set, patternIds:Set }
  const ensure = (domain) => {
    if (!found.has(domain)) {
      const p = getProfile(domain);
      found.set(domain, { domain, label: p?.label ?? domain, signals: new Set(), via: new Set(), patternIds: new Set() });
    }
    return found.get(domain);
  };

  // (a) Objective patterns → pull in their domain sets.
  const patterns = matchPatterns(text);
  for (const pat of patterns) {
    for (const d of pat.domains) { const e = ensure(d); e.via.add('pattern'); e.patternIds.add(pat.id); }
  }

  // (b) Per-domain signal keywords present in the objective.
  for (const [domain, profile] of Object.entries(DOMAIN_PROFILES)) {
    for (const sig of profile.signals) {
      if (tokenSet.has(sig) || text.toLowerCase().includes(sig)) { const e = ensure(domain); e.signals.add(sig); e.via.add('signal'); }
    }
  }

  // Score: weight pattern matches higher than incidental signal hits.
  const domains = [...found.values()].map(e => ({
    domain: e.domain,
    label: e.label,
    matchedSignals: [...e.signals],
    via: [...e.via],
    patterns: [...e.patternIds],
    score: (e.patternIds.size * 3) + e.signals.size,
  })).sort((a, b) => (b.score - a.score) || a.domain.localeCompare(b.domain));

  return {
    domains,
    patternIds: patterns.map(p => p.id),
    matched: domains.length > 0,
  };
}
