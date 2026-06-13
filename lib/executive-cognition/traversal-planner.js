// Executive Cognitive Engine — Knowledge Graph Traversal Planner (stage 5).
//
// Plans WHICH Knowledge Graph (PIF-4) traversals the execution would run to gather
// context for each domain — it does not execute them here. When a graph is supplied
// the plan is "grounded" (it names real candidate root entities); otherwise it
// describes the traversals abstractly.

export function planTraversals(discovered, evidence, context = {}) {
  const kg = context.knowledgeGraph ?? null;
  const traversals = [];

  for (const d of discovered.domains) {
    // Candidate roots: entities already in the graph for this domain.
    let roots = [];
    if (kg && typeof kg.entitiesByDomain === 'function') {
      try { roots = kg.entitiesByDomain(d.domain).slice(0, 5).map(e => ({ id: e.id, label: e.label, type: e.type })); }
      catch { roots = []; }
    }
    traversals.push({
      domain: d.domain,
      purpose: `Gather connected context for "${d.label}".`,
      startEntityType: defaultRootType(d.domain),
      relationshipTypes: ['about', 'cites', 'depends_on', 'member_of', 'owns'],
      maxDepth: 2,
      candidateRoots: roots,
      grounded: roots.length > 0,
    });
  }

  return {
    traversals,
    grounded: traversals.some(t => t.grounded),
    note: kg ? 'Roots resolved against the live Knowledge Graph.' : 'No graph supplied — traversals described abstractly.',
  };
}

function defaultRootType(domain) {
  const map = { coaching: 'team', sales: 'company', recruitment: 'lead', wedding: 'venue', travel: 'trip', hospitality: 'booking' };
  return map[domain] ?? 'project';
}
