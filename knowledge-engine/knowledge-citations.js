// Citation model — every Knowledge Engine answer must cite its sources.

let _nextId = 1;

export function cite(engine, fact, entityId = null, field = null) {
  return {
    citationId: `cit-${_nextId++}`,
    engine,
    fact:       String(fact),
    entityId:   entityId ?? null,
    field:      field ?? null,
    retrievedAt: new Date().toISOString(),
  };
}

export function citeMany(engine, facts = [], entityId = null) {
  return facts.map(f => cite(engine, f, entityId));
}

export function mergecitations(...groups) {
  return groups.flat().filter(Boolean);
}

export function dedupeCitations(citations = []) {
  const seen = new Set();
  return citations.filter(c => {
    const key = `${c.engine}:${c.fact}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function formatCitations(citations = [], options = {}) {
  const { inline = false } = options;
  if (!citations.length) return inline ? '' : '_No citations_';

  const deduped = dedupeCitations(citations);

  if (inline) {
    return `[${deduped.map((c, i) => `[${i + 1}] ${c.fact}`).join(' · ')}]`;
  }

  return deduped.map((c, i) =>
    `${i + 1}. **${c.engine}**: ${c.fact}${c.entityId ? ` (${c.entityId})` : ''}`
  ).join('\n');
}

export function citationSummary(citations = []) {
  const byEngine = {};
  citations.forEach(c => { byEngine[c.engine] = (byEngine[c.engine] ?? 0) + 1; });
  const total = citations.length;
  return { total, byEngine };
}
