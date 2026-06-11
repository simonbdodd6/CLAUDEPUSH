/**
 * Knowledge Graph Traversal — graph-backed answers for the Knowledge Engine.
 *
 * Provides coaching-knowledge answers by traversing the knowledge graph
 * instead of searching a flat index. Results are richer than keyword matches
 * because they follow typed relationships:
 *
 *   CoachingPrinciple  ← TEACHES ─  Drill
 *                      ← COVERS  ─  Document
 *                      ← SUPPORTS ─ Recommendation
 *   Drill / Exercise   ← USES    ─  TrainingSession  ← ATTENDED ─  Player
 *
 * All exports are null-safe: if the graph is unavailable or empty, every
 * function returns null so the caller falls back to keyword search.
 *
 * NOTE: search() in graph-query.js returns Node[] directly, not { results }.
 */

import { cite, dedupeCitations } from './knowledge-citations.js';

// Lazy graph import — avoids loading graph modules until first query
let _g = null;
async function graph() {
  if (_g) return _g;
  try {
    const mod = await import('../knowledge-graph/index.js');
    mod.bootGraph();
    if (mod.graphStats().nodeCount === 0) return null;
    _g = mod;
  } catch { _g = null; }
  return _g;
}

// Extract meaningful keywords (stop words removed)
const STOP = new Set([
  'show','find','list','what','which','how','the','for','and','with','about',
  'me','give','all','any','are','is','do','does','to','in','a','an','of','on',
  'at','by','its','it','this','that','these','those','can','our','my','us',
]);
function keywords(text) {
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !STOP.has(w));
}

// Score a node against keywords by matching its label + metadata string
function nodeScore(node, kws) {
  const hay = [
    node.label ?? '',
    ...Object.values(node.metadata ?? {}).filter(v => typeof v === 'string'),
  ].join(' ').toLowerCase();
  return kws.filter(k => hay.includes(k)).length;
}

// Find nodes of given type(s) matching keywords, return top `limit`
function matchNodes(g, types, kws, limit = 5) {
  const typeArr = Array.isArray(types) ? types : [types];
  return g.getAllNodes()
    .filter(n => typeArr.includes(n.type))
    .map(n => ({ node: n, score: nodeScore(n, kws) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.node);
}

// ── Traversal: drills connected to a coaching principle ───────────────────────

export async function drillsForQuery(raw) {
  const g = await graph();
  if (!g) return null;

  const kws = keywords(raw);
  if (!kws.length) return null;

  // 1. Find matching CoachingPrinciple or Theme nodes via keyword match
  const principles = matchNodes(g, ['CoachingPrinciple', 'Theme'], kws, 4);

  // 2. Top-up via full-text search (search() returns Node[] directly)
  const searchHits = g.search(raw, { limit: 8 })
    .filter(n => ['CoachingPrinciple', 'Theme', 'Drill', 'Exercise'].includes(n.type));
  for (const hit of searchHits) {
    if (!principles.some(p => p.id === hit.id) && ['CoachingPrinciple', 'Theme'].includes(hit.type)) {
      principles.push(hit);
      if (principles.length >= 5) break;
    }
  }

  if (!principles.length) {
    // No principles found — try direct drill keyword match
    const drills = matchNodes(g, ['Drill', 'Exercise'], kws, 5);
    if (!drills.length) return null;
    return _buildDrillResult(g, [], drills, null);
  }

  // 3. For each principle, find drills via TEACHES edges
  const pairings = [];
  for (const prin of principles) {
    const drillNodes = g.drillsForPrinciple(prin.id);
    for (const d of drillNodes) {
      if (!pairings.some(x => x.drill.id === d.id)) {
        pairings.push({ principle: prin, drill: d });
      }
    }
  }

  if (!pairings.length) {
    // TEACHES edges don't exist yet — keyword-match drills + attach principles
    const drills = matchNodes(g, ['Drill', 'Exercise'], kws, 5);
    if (!drills.length) return null;
    return _buildDrillResult(g, principles, drills, null);
  }

  return _buildDrillResult(g, principles, pairings.map(x => x.drill), pairings);
}

function _buildDrillResult(g, principles, drills, pairings) {
  const rows      = [];
  const citations = [];

  for (const drill of drills) {
    const pairing  = pairings?.find(p => p.drill.id === drill.id) ?? null;
    const prin     = pairing?.principle ?? null;

    // Sessions that USES this drill
    const sessEdges  = g.inEdges(drill.id, 'USES');
    const sessions   = sessEdges.map(e => g.getNode(e.from)).filter(Boolean);

    // Documents covering the principle (or the drill directly)
    const coverTarget = prin ?? drill;
    const docEdges    = g.inEdges(coverTarget.id, 'COVERS');
    const docs        = docEdges.map(e => g.getNode(e.from)).filter(n => n?.type === 'Document');

    rows.push({
      drill:         drill.label ?? drill.metadata?.name ?? drill.id,
      drillId:       drill.id,
      type:          drill.type,
      principle:     prin ? (prin.label ?? prin.metadata?.name) : null,
      principleId:   prin?.id ?? null,
      description:   drill.metadata?.description ?? null,
      skillLevel:    drill.metadata?.skillLevel ?? null,
      durationMins:  drill.metadata?.duration ?? null,
      sessionsUsedIn: sessions.slice(0, 3).map(s => ({
        id:        s.id,
        label:     s.label ?? s.metadata?.type ?? s.id,
        date:      s.metadata?.date ?? null,
        intensity: s.metadata?.intensity ?? null,
      })),
      supportingDocs: docs.slice(0, 3).map(d => ({
        id:       d.id,
        title:    d.label ?? d.metadata?.title ?? d.id,
        fileType: d.metadata?.fileType ?? null,
        confidence: d.confidence ?? null,
      })),
    });

    if (prin) {
      citations.push(cite('knowledge-graph', `${drill.label} TEACHES ${prin.label}`, drill.id, 'TEACHES'));
    }
    if (sessions.length) {
      citations.push(cite('knowledge-graph', `Used in ${sessions.length} session(s) incl. "${sessions[0].label ?? sessions[0].id}"`, drill.id, 'USES'));
    }
    if (docs.length) {
      citations.push(cite('knowledge-upload', `${docs.length} document(s) cover "${coverTarget.label}"`, coverTarget.id, 'COVERS'));
    }
  }

  if (!rows.length) return null;

  const principleNames = [...new Set(rows.filter(r => r.principle).map(r => r.principle))];
  const drillNames     = rows.map(r => r.drill);
  const pathSteps      = ['CoachingPrinciple', '←TEACHES→', 'Drill'];
  if (rows.some(r => r.sessionsUsedIn.length > 0)) pathSteps.push('←USES→', 'TrainingSession');
  if (rows.some(r => r.supportingDocs.length > 0)) pathSteps.push('←COVERS→', 'Document');

  return {
    answer: principleNames.length
      ? `Found ${rows.length} drill${rows.length === 1 ? '' : 's'} connected to "${principleNames.join(', ')}": ${drillNames.join(', ')}.`
      : `Found ${rows.length} drill${rows.length === 1 ? '' : 's'}: ${drillNames.join(', ')}.`,
    summary: `Graph traversal: ${pathSteps.join(' ')}`,
    data:    rows,
    count:   rows.length,
    confidence: pairings?.length ? 92 : 74,
    citations: dedupeCitations(citations),
    graphTraversal: {
      path:      pathSteps,
      rootNodes: principles.map(p => ({ id: p.id, label: p.label, type: p.type })),
      nodeCount: rows.length + principles.length,
      edgeTypes: [...new Set(citations.map(c => c.field).filter(Boolean))],
    },
  };
}

// ── Traversal: documents covering a topic ────────────────────────────────────

export async function docsForQuery(raw) {
  const g = await graph();
  if (!g) return null;

  const kws = keywords(raw);
  if (!kws.length) return null;

  const rootNodes  = matchNodes(g, ['CoachingPrinciple', 'Theme', 'Player'], kws, 4);
  const directDocs = matchNodes(g, ['Document'], kws, 6);

  if (!rootNodes.length && !directDocs.length) return null;

  const rows      = [];
  const seen      = new Set();
  const citations = [];

  for (const root of rootNodes) {
    const edges = [
      ...g.inEdges(root.id, 'COVERS'),
      ...g.inEdges(root.id, 'MENTIONS'),
    ];
    const docs = edges.map(e => g.getNode(e.from)).filter(n => n?.type === 'Document');
    for (const d of docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      rows.push(_docRow(d, root));
      citations.push(cite('knowledge-graph', `"${d.label ?? d.id}" COVERS ${root.label}`, d.id, 'COVERS'));
    }
  }

  for (const d of directDocs) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    rows.push(_docRow(d, null));
    citations.push(cite('knowledge-upload', `Direct match: ${d.label ?? d.id}`, d.id));
  }

  if (!rows.length) return null;

  const topicNames = [...new Set(rootNodes.map(n => n.label ?? n.id))];

  return {
    answer: topicNames.length
      ? `Found ${rows.length} document${rows.length === 1 ? '' : 's'} covering "${topicNames.join(', ')}".`
      : `Found ${rows.length} document${rows.length === 1 ? '' : 's'} matching your query.`,
    summary: `Graph traversal: Document ←COVERS→ CoachingPrinciple / Theme`,
    data:    rows,
    count:   rows.length,
    confidence: 88,
    citations: dedupeCitations(citations),
    graphTraversal: {
      path:      ['Document', '←COVERS→', 'CoachingPrinciple / Theme'],
      rootNodes: rootNodes.map(n => ({ id: n.id, label: n.label, type: n.type })),
      nodeCount: rows.length + rootNodes.length,
      edgeTypes: ['COVERS', 'MENTIONS'],
    },
  };
}

function _docRow(doc, linkedNode) {
  return {
    title:            doc.label ?? doc.metadata?.title ?? doc.id,
    docId:            doc.id,
    fileType:         doc.metadata?.fileType ?? null,
    category:         doc.metadata?.category ?? null,
    processingStatus: doc.metadata?.processingStatus ?? null,
    confidence:       doc.confidence ?? null,
    linkedTo:         linkedNode
      ? { id: linkedNode.id, label: linkedNode.label, type: linkedNode.type }
      : null,
  };
}

// ── Traversal: player graph profile ──────────────────────────────────────────

export async function playerGraphQuery(raw, nameMention) {
  const g = await graph();
  if (!g) return null;

  const searchText = nameMention ?? raw;
  const kws        = keywords(searchText);
  const players    = matchNodes(g, 'Player', kws, 3);
  if (!players.length) return null;

  const rows      = [];
  const citations = [];

  for (const player of players) {
    const recs  = g.recsForPlayer(player.id);
    const teams = g.outEdges(player.id, 'MEMBER_OF').map(e => g.getNode(e.to)).filter(Boolean);
    const medEvt= g.outEdges(player.id, 'HAS_MEDICAL_EVENT').map(e => g.getNode(e.to)).filter(Boolean);

    rows.push({
      player:          player.label ?? player.metadata?.name ?? player.id,
      playerId:        player.id,
      position:        player.metadata?.position ?? null,
      teams:           teams.map(t => t.label ?? t.id),
      recommendations: recs.map(r => ({
        id:       r.id,
        title:    r.label ?? r.metadata?.title ?? r.id,
        priority: r.metadata?.priority ?? null,
        category: r.metadata?.category ?? null,
      })),
      medicalEvents: medEvt.map(e => ({
        id:          e.id,
        title:       e.label ?? e.id,
        severity:    e.metadata?.severity ?? null,
        description: e.metadata?.description ?? null,
      })),
    });

    if (recs.length)  citations.push(cite('knowledge-graph', `${recs.length} rec(s) concerning ${player.label}`, player.id, 'CONCERNS'));
    if (teams.length) citations.push(cite('knowledge-graph', `Member of: ${teams.map(t => t.label).join(', ')}`, player.id, 'MEMBER_OF'));
  }

  if (!rows.length) return null;

  const playerNames = rows.map(r => r.player).join(', ');
  const totalRecs   = rows.reduce((s, r) => s + r.recommendations.length, 0);

  return {
    answer:  `Graph profile for ${playerNames}: ${totalRecs} recommendation(s), ${rows[0]?.medicalEvents?.length ?? 0} medical event(s).`,
    summary: `Graph traversal: Player ←CONCERNS← Recommendation, Player →MEMBER_OF→ Team`,
    data:    rows,
    count:   rows.length,
    confidence: 85,
    citations: dedupeCitations(citations),
    graphTraversal: {
      path:      ['Recommendation', '→CONCERNS→', 'Player', '→MEMBER_OF→', 'Team'],
      rootNodes: players.map(p => ({ id: p.id, label: p.label, type: p.type })),
      nodeCount: rows.length,
      edgeTypes: ['CONCERNS', 'HAS_MEDICAL_EVENT', 'MEMBER_OF'],
    },
  };
}

// ── Traversal: general graph exploration (enhancement fallback) ───────────────
// Called for any GENERAL query before falling back to keyword search.
// Returns null if graph finds nothing relevant.

export async function exploreGraph(raw) {
  const g = await graph();
  if (!g) return null;

  // Strip stop words before searching — "What do we know about lineout?" → "lineout"
  // The graph's search() does substring scoring; noise terms corrupt ranking.
  const kws = keywords(raw);
  if (!kws.length) return null;
  const cleanQuery = kws.join(' ');

  // search() returns Node[] directly
  const topNodes = g.search(cleanQuery, { limit: 6 });
  if (!topNodes.length) return null;

  const rows      = [];
  const citations = [];

  for (const node of topNodes.slice(0, 3)) {
    const subgraph  = g.expand(node.id, 1);
    const edges     = subgraph.edges ?? [];
    const related   = (subgraph.nodes ?? []).filter(n => n.id !== node.id);

    rows.push({
      node:      { id: node.id, type: node.type, label: node.label },
      related:   related.slice(0, 6).map(n => ({ id: n.id, type: n.type, label: n.label })),
      edgeCount: edges.length,
      edgeTypes: [...new Set(edges.map(e => e.type))],
    });

    citations.push(
      cite('knowledge-graph', `${node.type}: ${node.label ?? node.id} (${edges.length} relationships)`, node.id)
    );
  }

  if (!rows.length) return null;

  const topLabel = rows[0].node.label ?? rows[0].node.id;
  const others   = rows.slice(1).map(r => r.node.label ?? r.node.id).join(', ');

  return {
    answer:  `Found "${topLabel}" in the knowledge graph with ${rows[0].edgeCount} relationship(s).`
      + (others ? ` Also matched: ${others}.` : ''),
    summary: `Graph search → 1-hop neighbourhood expansion`,
    data:    rows,
    count:   rows.length,
    confidence: Math.min(85, 55 + rows[0].edgeCount * 3),
    citations: dedupeCitations(citations),
    graphTraversal: {
      path:      [rows[0].node.type, '→', 'Neighbours (depth 1)'],
      rootNodes: rows.map(r => r.node),
      nodeCount: rows.reduce((s, r) => s + r.related.length + 1, 0),
      edgeTypes: [...new Set(rows.flatMap(r => r.edgeTypes))],
    },
  };
}
