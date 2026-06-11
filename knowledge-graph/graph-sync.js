/**
 * Knowledge Graph — Sync
 *
 * Non-breaking integration bridges. Each engine calls the appropriate
 * sync function after its own logic completes. The graph enriches without
 * changing any existing behaviour.
 *
 * All functions are idempotent — safe to call on duplicate data.
 */

import { upsertNode, upsertEdge, buildRecommendation, buildDecision, buildDocument, buildObservation, link } from './graph-builder.js'
import { getAllNodes } from './graph-store.js'
import { NODE } from './graph-model.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function nodeExists(id) {
  return getAllNodes().some(n => n.id === id)
}

function findEngine(name) {
  return getAllNodes().find(n => n.type === NODE.INTELLIGENCE_ENGINE && n.label === name)
}

function findKnowledgeBase(name) {
  return getAllNodes().find(n => n.type === NODE.KNOWLEDGE_BASE && n.label === name)
}

// ── Recommendation Engine sync ────────────────────────────────────────────────

/**
 * Sync a batch of recommendations from the recommendation engine.
 * Creates Recommendation nodes and wires them to engines, players, and principles.
 */
export function syncRecommendations(recommendations, opts = {}) {
  const { clubId = 'club-001', coachId } = opts
  const engine = findEngine('recommendation-engine')
  const created = []

  for (const r of recommendations) {
    if (nodeExists(r.id)) continue

    const recNode = buildRecommendation({
      id:            r.id,
      title:         r.title,
      category:      r.category,
      priority:      r.priority,
      confidence:    r.confidence,
      description:   r.description,
      action:        r.action,
      explainability:r.explainability,
      source:        r.source ?? 'recommendation-engine',
    })

    // Wire to engine
    if (engine) {
      upsertEdge('GENERATED_BY', recNode.id, engine.id, { timestamp: new Date().toISOString() })
    }

    // Wire to any known players that match
    const players = getAllNodes().filter(n => n.type === NODE.PLAYER)
    for (const p of players) {
      if (r.title?.toLowerCase().includes(p.label.toLowerCase()) ||
          r.description?.toLowerCase().includes(p.label.toLowerCase())) {
        upsertEdge('CONCERNS', recNode.id, p.id, { matchSource: 'label-text' })
      }
    }

    created.push(recNode)
  }
  return created
}

// ── Knowledge Upload sync ─────────────────────────────────────────────────────

/**
 * Sync an uploaded document into the graph.
 * Creates a Document node and wires to coach, themes, players, knowledge base.
 */
export function syncDocument(doc, opts = {}) {
  const { clubId = 'club-001', coachId = 'coach-simon' } = opts

  if (nodeExists(doc.id)) return getAllNodes().find(n => n.id === doc.id)

  const docNode = buildDocument({
    id:               doc.id,
    title:            doc.title,
    fileType:         doc.fileType,
    category:         doc.category,
    coach:            doc.coach,
    confidence:       doc.confidence,
    extractedSummary: doc.extractedSummary,
    processingStatus: doc.processingStatus,
  })

  // Wire to uploader (coach)
  const coachNode = getAllNodes().find(n => n.type === NODE.COACH && n.id === coachId)
  if (coachNode) upsertEdge('UPLOADED', coachNode.id, docNode.id)

  // Wire to knowledge bases
  if (doc.processingStatus === 'added_to_knowledge_base') {
    const coachDNA  = findKnowledgeBase('Coach DNA')
    const clubKB    = findKnowledgeBase('Club Knowledge')
    if (coachDNA) upsertEdge('CONTRIBUTES_TO', docNode.id, coachDNA.id, { addedAt: new Date().toISOString() })
    if (clubKB)   upsertEdge('CONTRIBUTES_TO', docNode.id, clubKB.id,   { addedAt: new Date().toISOString() })
  }

  // Wire to detected themes (find matching Theme nodes by label)
  if (doc.detectedThemes?.length > 0) {
    const themeNodes = getAllNodes().filter(n => n.type === NODE.THEME)
    for (const themeName of doc.detectedThemes) {
      const themeNode = themeNodes.find(t => t.label === themeName)
      if (themeNode) upsertEdge('COVERS', docNode.id, themeNode.id)
    }
  }

  // Wire to mentioned players
  if (doc.linkedPlayers?.length > 0) {
    for (const lp of doc.linkedPlayers) {
      if (lp.id && nodeExists(lp.id)) {
        upsertEdge('MENTIONS', docNode.id, lp.id)
      }
    }
  }

  return docNode
}

// ── Decision sync ─────────────────────────────────────────────────────────────

/**
 * Sync a coach decision (approve/dismiss/snooze) into the graph.
 */
export function syncDecision(action, recId, outcome, coachId = 'coach-simon') {
  const decNode = buildDecision({
    action:    `${action}: ${getAllNodes().find(n => n.id === recId)?.label ?? recId}`,
    outcome:   outcome ?? 'Awaiting outcome tracking',
    coach:     getAllNodes().find(n => n.id === coachId)?.label ?? 'Head Coach',
    timestamp: new Date().toISOString(),
  })

  // Wire rec → decision
  if (nodeExists(recId)) {
    upsertEdge('RESULTED_IN', recId, decNode.id, { action, timestamp: new Date().toISOString() })
  }

  // Wire coach → decision
  const coachNode = getAllNodes().find(n => n.id === coachId)
  if (coachNode) {
    const edgeType = action === 'accepted' ? 'ACCEPTED' : action === 'dismissed' ? 'DISMISSED' : 'REVIEWED'
    upsertEdge(edgeType, coachNode.id, decNode.id)
  }

  return decNode
}

// ── Observation sync ──────────────────────────────────────────────────────────

/**
 * Sync an observation from the dashboard/availability/match engine into the graph.
 */
export function syncObservation(obs, fixtureId) {
  if (nodeExists(obs.id)) return getAllNodes().find(n => n.id === obs.id)

  const obsNode = buildObservation({
    id:          obs.id,
    title:       obs.title,
    severity:    obs.severity,
    description: obs.description,
    engine:      obs.engine,
  })

  if (fixtureId && nodeExists(fixtureId)) {
    upsertEdge('OBSERVED_IN', obsNode.id, fixtureId)
  }

  return obsNode
}

// ── Availability sync ─────────────────────────────────────────────────────────

/**
 * Sync attendance/availability data for a player.
 */
export function syncAttendance(playerId, sessionId, attended, date) {
  const players = getAllNodes()
  const player  = players.find(n => n.id === playerId)
  if (!player) return null

  if (attended && sessionId) {
    upsertEdge('ATTENDED', playerId, sessionId, { date, attended })
  }
  return player
}
