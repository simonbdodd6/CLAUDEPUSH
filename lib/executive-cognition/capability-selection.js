// Executive Cognitive Engine — Capability Selection (stage 3).
//
// Maps the discovered domains to the platform capabilities the plan will need. If a
// platform registry is supplied (platform/platform-registry.js shape), each
// capability is cross-checked against actually-registered engines so the plan knows
// what is available vs. merely required. No engine is invoked.

import { getProfile } from './capability-map.js';

export function selectCapabilities(discovered, context = {}) {
  const registry = context.registry ?? null;     // optional { getCapable(cap)/hasEngine() }
  const out = [];
  const seen = new Set();

  for (const d of discovered.domains) {
    const profile = getProfile(d.domain);
    if (!profile) continue;
    for (const cap of profile.capabilities) {
      if (seen.has(cap)) continue;
      seen.add(cap);
      out.push({
        capability: cap,
        domain: d.domain,
        available: registry ? capabilityAvailable(registry, cap) : null,   // null = unknown (no registry supplied)
        reason: `Required by domain "${d.label}".`,
      });
    }
  }
  return {
    capabilities: out,
    available: out.filter(c => c.available === true).length,
    unknown: out.filter(c => c.available === null).length,
    missing: out.filter(c => c.available === false).map(c => c.capability),
  };
}

function capabilityAvailable(registry, cap) {
  try {
    if (typeof registry.getCapable === 'function') return registry.getCapable(cap).length > 0;
    if (typeof registry.hasEngine === 'function') return registry.hasEngine(cap);
  } catch { /* registry shape unknown */ }
  return null;
}
