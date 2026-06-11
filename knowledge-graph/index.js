/**
 * Knowledge Graph — Public API
 *
 * Single entry-point for all graph operations. Import this module
 * (not the internal modules) in API routes, intelligence engines, and React hooks.
 */

export { NODE, EDGE, NODE_META, EDGE_META, SYSTEM_METADATA } from './graph-model.js'

export {
  addNode, updateNode, removeNode,
  getNode, getAllNodes,
  addEdge, removeEdge, getEdge, getAllEdges,
  edgesOf, outEdges, inEdges, neighbourIds,
  flush, isSeeded, markSeeded, resetStore,
} from './graph-store.js'

export {
  buildCoach, buildClub, buildTeam, buildPlayer,
  buildFixture, buildTrainingSession, buildDrill, buildExercise,
  buildCoachingPrinciple, buildTheme, buildRecommendation, buildDecision,
  buildObservation, buildDocument, buildSeason, buildCompetition,
  buildPosition, buildMedicalEvent, buildAttendanceEvent,
  buildIntelligenceEngine, buildKnowledgeBase,
  link, upsertNode, upsertEdge,
} from './graph-builder.js'

export {
  findNodes, findEdges,
  expand, shortestPath, search,
  drillsForPrinciple, docsForPrinciple, recsForPlayer, docsForRecommendation,
  sessionsForExercise, decisionsForFixture, principlesThisSeason,
  playersInTeam, recsFromEngine, docsInKnowledgeBase,
  graphStats,
} from './graph-query.js'

export {
  syncRecommendations, syncDocument, syncDecision, syncObservation,
} from './graph-sync.js'

export { seedGraph } from './graph-seed.js'

// ── Boot helper ──────────────────────────────────────────────────────────────
// Call once during app startup. Seeds graph if first use.

import { isSeeded } from './graph-store.js'
import { seedGraph } from './graph-seed.js'

export function bootGraph() {
  if (!isSeeded()) seedGraph()
}
