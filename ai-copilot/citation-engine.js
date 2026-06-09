/**
 * Citation Engine
 * Tracks which engines contributed to each response and builds a source list.
 * Ensures transparency: every fact in a response is traceable to its engine.
 */

export function createCitationContext() {
  const _citations = [];

  return {
    cite(engineName, fact, metadata = {}) {
      _citations.push({
        engine:    engineName,
        fact:      fact.slice(0, 200),
        metadata,
        timestamp: Date.now(),
      });
    },

    getCitations() {
      return [..._citations];
    },

    getSummary() {
      const engineNames = [...new Set(_citations.map(c => c.engine))];
      return {
        engineCount: engineNames.length,
        engines:     engineNames,
        factCount:   _citations.length,
        citations:   _citations,
      };
    },

    hasEngine(name) {
      return _citations.some(c => c.engine === name);
    },
  };
}

// ── Standard engine labels ────────────────────────────────────────────────────

export const ENGINE_LABELS = {
  'coaching-engine':          'Coaching Engine',
  'memory-engine':            'Coach Memory',
  'player-development':       'Player Development Intelligence',
  'rugby-knowledge':          'Rugby Knowledge Base',
  'discovery-agent':          'Discovery Agent',
  'market-intel':             'Market Intelligence',
  'lead-personalisation':     'Lead Personalisation',
};

export function labelForEngine(name) {
  return ENGINE_LABELS[name] ?? name;
}

// ── Citation formatter ────────────────────────────────────────────────────────

export function formatCitations(citations) {
  if (!citations?.length) return '';

  const grouped = {};
  for (const c of citations) {
    if (!grouped[c.engine]) grouped[c.engine] = [];
    grouped[c.engine].push(c.fact);
  }

  return Object.entries(grouped).map(([engine, facts]) => {
    return `**${labelForEngine(engine)}**: ${facts.slice(0, 2).join(' · ')}`;
  }).join('\n');
}
