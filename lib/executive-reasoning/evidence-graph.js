// Executive Reasoning — evidence graph + traversal.
//
// Builds a small, JSON-serialisable graph linking the thing being explained to its
// evidence (citations), the entities that evidence is about, and the raw signals it
// was derived from. The nodes/edges are pure data; `traverse()` is a pure BFS over
// them. No store, no engine calls — this composes evidence the caller already has
// (e.g. Knowledge Engine citations + Memory entity links).

import { EVIDENCE_KIND, EDGE_TYPE } from './constants.js';

const SUBJECT_ID = 'subject';

/**
 * Build an evidence graph from a normalized ReasoningInput.
 * @returns {object} { rootId, nodes:[], edges:[], stats, evidenceForSubject:[] }
 */
export function buildEvidenceGraph(input = {}) {
  const nodes = new Map();
  const edges = [];

  // Root node: the subject being explained.
  nodes.set(SUBJECT_ID, {
    id: SUBJECT_ID,
    kind: 'subject',
    label: input.subject?.title ?? input.id ?? 'subject',
    source: input.source ?? null,
  });

  // Citations → evidence nodes, edge subject —cites→ citation.
  (input.evidence ?? []).forEach((e, i) => {
    const id = e.id ?? e.citationId ?? `ev-${i}`;
    nodes.set(id, {
      id,
      kind: e.kind ?? EVIDENCE_KIND.CITATION,
      label: e.fact ?? e.label ?? id,
      source: e.source ?? e.engine ?? null,
      isMock: Boolean(e.isMock),
      retrievedAt: e.retrievedAt ?? null,
    });
    edges.push({ from: SUBJECT_ID, to: id, type: EDGE_TYPE.CITES });

    // If the citation is about an entity, add an entity node + edge.
    const entityId = e.entityId ?? null;
    if (entityId) {
      if (!nodes.has(entityId)) {
        nodes.set(entityId, { id: entityId, kind: EVIDENCE_KIND.ENTITY, label: entityId, source: e.source ?? e.engine ?? null });
      }
      edges.push({ from: id, to: entityId, type: EDGE_TYPE.ABOUT, field: e.field ?? null });
    }
  });

  // Entity links (e.g. Memory entity relationships from the PIF-1 evidence view):
  // subject —about→ entity, and entity —linked_to→ related ref.
  (input.links ?? []).forEach((lnk) => {
    const ref = lnk.ref;
    if (!ref) return;
    if (!nodes.has(ref)) {
      nodes.set(ref, { id: ref, kind: EVIDENCE_KIND.ENTITY, label: lnk.label ?? ref, source: 'memory' });
    }
    edges.push({ from: SUBJECT_ID, to: ref, type: EDGE_TYPE.LINKED_TO, relation: lnk.relation ?? null });
  });

  // Raw signals/conditions the conclusion was derived from.
  (input.conditions ?? []).forEach((cond, i) => {
    const id = `signal-${i}`;
    nodes.set(id, {
      id,
      kind: EVIDENCE_KIND.SIGNAL,
      label: cond.description ?? `condition ${i + 1}`,
      observed: cond.observed ?? null,
      met: cond.met ?? null,
    });
    edges.push({ from: SUBJECT_ID, to: id, type: EDGE_TYPE.DERIVED_FROM });
  });

  const nodeList = [...nodes.values()];
  const reachable = traverse({ nodes: nodeList, edges }, SUBJECT_ID);

  return {
    rootId: SUBJECT_ID,
    nodes: nodeList,
    edges,
    evidenceForSubject: reachable.filter(n => n.id !== SUBJECT_ID),
    stats: {
      nodes: nodeList.length,
      edges: edges.length,
      citations: nodeList.filter(n => n.kind === EVIDENCE_KIND.CITATION).length,
      entities:  nodeList.filter(n => n.kind === EVIDENCE_KIND.ENTITY).length,
      signals:   nodeList.filter(n => n.kind === EVIDENCE_KIND.SIGNAL).length,
      mockEvidence: nodeList.filter(n => n.isMock).length,
    },
  };
}

/**
 * Pure breadth-first traversal. Returns the node objects reachable from `fromId`
 * (inclusive), following edges in the forward direction.
 * @param {{nodes:object[], edges:object[]}} graph
 * @param {string} fromId
 * @returns {object[]}
 */
export function traverse(graph, fromId) {
  const byId = new Map((graph.nodes ?? []).map(n => [n.id, n]));
  const adj = new Map();
  for (const e of graph.edges ?? []) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const seen = new Set();
  const out = [];
  const queue = [fromId];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (node) out.push(node);
    for (const next of adj.get(id) ?? []) if (!seen.has(next)) queue.push(next);
  }
  return out;
}
