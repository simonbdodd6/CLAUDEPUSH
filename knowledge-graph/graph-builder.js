/**
 * Knowledge Graph — Builder
 *
 * Factory functions for creating well-formed nodes and edges.
 * Every engine and sync adapter should use these rather than calling
 * addNode/addEdge directly, so type constraints are enforced in one place.
 */

import { randomUUID } from 'crypto'
import { NODE, EDGE } from './graph-model.js'
import { addNode, addEdge, getAllNodes, getAllEdges } from './graph-store.js'

// ── Node factories ────────────────────────────────────────────────────────────

export function buildCoach({ id, name, role, clubId = 'club-001' } = {}) {
  return addNode({ id: id ?? `coach-${randomUUID().slice(0,8)}`, type: NODE.COACH, label: name, metadata: { role }, clubId })
}
export function buildClub({ id, name, location, founded } = {}) {
  return addNode({ id: id ?? `club-${randomUUID().slice(0,8)}`, type: NODE.CLUB, label: name, metadata: { location, founded } })
}
export function buildTeam({ id, name, ageGroup, division } = {}) {
  return addNode({ id: id ?? `team-${randomUUID().slice(0,8)}`, type: NODE.TEAM, label: name, metadata: { ageGroup, division } })
}
export function buildPlayer({ id, name, position, dateOfBirth, jerseyNumber, clubId = 'club-001' } = {}) {
  return addNode({ id: id ?? `player-${randomUUID().slice(0,8)}`, type: NODE.PLAYER, label: name, metadata: { position, dateOfBirth, jerseyNumber }, clubId })
}
export function buildFixture({ id, homeTeam, awayTeam, date, competition, venue, result } = {}) {
  const label = `vs ${awayTeam ?? homeTeam}`
  return addNode({ id: id ?? `fix-${randomUUID().slice(0,8)}`, type: NODE.FIXTURE, label, metadata: { homeTeam, awayTeam, date, competition, venue, result } })
}
export function buildTrainingSession({ id, date, type, duration, intensity, teamId } = {}) {
  const label = `${type ?? 'Session'} — ${date ? new Date(date).toLocaleDateString('en-IE',{day:'numeric',month:'short'}) : ''}`
  return addNode({ id: id ?? `sess-${randomUUID().slice(0,8)}`, type: NODE.TRAINING_SESSION, label, metadata: { date, type, duration, intensity, teamId } })
}
export function buildDrill({ id, name, description, skillLevel, duration } = {}) {
  return addNode({ id: id ?? `drill-${randomUUID().slice(0,8)}`, type: NODE.DRILL, label: name, metadata: { description, skillLevel, duration } })
}
export function buildExercise({ id, name, category, description } = {}) {
  return addNode({ id: id ?? `ex-${randomUUID().slice(0,8)}`, type: NODE.EXERCISE, label: name, metadata: { category, description } })
}
export function buildCoachingPrinciple({ id, name, description, category } = {}) {
  return addNode({ id: id ?? `prin-${randomUUID().slice(0,8)}`, type: NODE.COACHING_PRINCIPLE, label: name, metadata: { description, category }, confidence: 95 })
}
export function buildTheme({ id, name, category } = {}) {
  return addNode({ id: id ?? `theme-${randomUUID().slice(0,8)}`, type: NODE.THEME, label: name, metadata: { category } })
}
export function buildRecommendation({ id, title, category, priority, confidence, description, action, source, explainability, engineId } = {}) {
  return addNode({ id: id ?? `rec-${randomUUID().slice(0,8)}`, type: NODE.RECOMMENDATION, label: title, metadata: { category, priority, description, action, explainability, engineId }, confidence: confidence ?? 80, source: source ?? 'recommendation-engine' })
}
export function buildDecision({ id, action, outcome, coach, timestamp } = {}) {
  return addNode({ id: id ?? `dec-${randomUUID().slice(0,8)}`, type: NODE.DECISION, label: action, metadata: { outcome, coach, timestamp: timestamp ?? new Date().toISOString() }, source: 'coach' })
}
export function buildObservation({ id, title, severity, description, engine } = {}) {
  return addNode({ id: id ?? `obs-${randomUUID().slice(0,8)}`, type: NODE.OBSERVATION, label: title, metadata: { severity, description, engine }, source: engine ?? 'manual' })
}
export function buildDocument({ id, title, fileType, category, coach, confidence, extractedSummary, processingStatus } = {}) {
  return addNode({ id: id ?? `doc-${randomUUID().slice(0,8)}`, type: NODE.DOCUMENT, label: title, metadata: { fileType, category, coach, extractedSummary, processingStatus }, confidence: confidence ?? 80, source: 'knowledge-upload' })
}
export function buildSeason({ id, name, startDate, endDate } = {}) {
  return addNode({ id: id ?? `season-${randomUUID().slice(0,8)}`, type: NODE.SEASON, label: name, metadata: { startDate, endDate } })
}
export function buildCompetition({ id, name, level, region } = {}) {
  return addNode({ id: id ?? `comp-${randomUUID().slice(0,8)}`, type: NODE.COMPETITION, label: name, metadata: { level, region } })
}
export function buildPosition({ id, name, abbreviation } = {}) {
  return addNode({ id: id ?? `pos-${randomUUID().slice(0,8)}`, type: NODE.POSITION, label: name, metadata: { abbreviation } })
}
export function buildMedicalEvent({ id, type, description, severity, date, playerId, status } = {}) {
  return addNode({ id: id ?? `med-${randomUUID().slice(0,8)}`, type: NODE.MEDICAL_EVENT, label: `${type}: ${description}`, metadata: { type, description, severity, date, playerId, status }, source: 'medical' })
}
export function buildAttendanceEvent({ id, playerId, sessionId, date, attended, reason } = {}) {
  return addNode({ id: id ?? `att-${randomUUID().slice(0,8)}`, type: NODE.ATTENDANCE_EVENT, label: attended ? 'Attended' : 'Absent', metadata: { playerId, sessionId, date, attended, reason }, source: 'core' })
}
export function buildIntelligenceEngine({ id, name, version, capabilities } = {}) {
  return addNode({ id: id ?? `eng-${randomUUID().slice(0,8)}`, type: NODE.INTELLIGENCE_ENGINE, label: name, metadata: { version, capabilities }, source: 'system' })
}
export function buildKnowledgeBase({ id, name, scope } = {}) {
  return addNode({ id: id ?? `kb-${randomUUID().slice(0,8)}`, type: NODE.KNOWLEDGE_BASE, label: name, metadata: { scope } })
}

// ── Edge factories ────────────────────────────────────────────────────────────

function edge(type, from, to, meta = {}, opts = {}) {
  return addEdge({ type, from, to, metadata: meta, confidence: opts.confidence ?? 100, source: opts.source ?? 'system', weight: opts.weight ?? 1 })
}

export const link = {
  coaches:          (coachId, teamId, meta)    => edge(EDGE.COACHES,          coachId, teamId, meta),
  created:          (coachId, nodeId, meta)    => edge(EDGE.CREATED,          coachId, nodeId, meta),
  uploaded:         (coachId, docId, meta)     => edge(EDGE.UPLOADED,         coachId, docId, meta),
  accepted:         (coachId, recId, meta)     => edge(EDGE.ACCEPTED,         coachId, recId, meta),
  dismissed:        (coachId, recId, meta)     => edge(EDGE.DISMISSED,        coachId, recId, meta),
  reviewed:         (coachId, nodeId, meta)    => edge(EDGE.REVIEWED,         coachId, nodeId, meta),
  memberOf:         (playerId, teamId, meta)   => edge(EDGE.MEMBER_OF,        playerId, teamId, meta),
  partOf:           (childId, parentId, meta)  => edge(EDGE.PART_OF,          childId, parentId, meta),
  contains:         (parentId, childId, meta)  => edge(EDGE.CONTAINS,         parentId, childId, meta),
  hasPosition:      (playerId, posId, meta)    => edge(EDGE.HAS_POSITION,     playerId, posId, meta),
  attended:         (playerId, sessId, meta)   => edge(EDGE.ATTENDED,         playerId, sessId, meta),
  participatedIn:   (playerId, fixId, meta)    => edge(EDGE.PARTICIPATED_IN,  playerId, fixId, meta),
  played:           (teamId, fixId, meta)      => edge(EDGE.PLAYED,           teamId, fixId, meta),
  uses:             (sessId, nodeId, meta)     => edge(EDGE.USES,             sessId, nodeId, meta),
  teaches:          (drillId, principleId, meta) => edge(EDGE.TEACHES,        drillId, principleId, meta),
  supports:         (principleId, recId, meta) => edge(EDGE.SUPPORTS,         principleId, recId, meta),
  references:       (recId, docId, meta)       => edge(EDGE.REFERENCES,       recId, docId, meta),
  contributesTo:    (docId, kbId, meta)        => edge(EDGE.CONTRIBUTES_TO,   docId, kbId, meta),
  covers:           (docId, principleId, meta) => edge(EDGE.COVERS,           docId, principleId, meta),
  mentions:         (docId, playerId, meta)    => edge(EDGE.MENTIONS,         docId, playerId, meta),
  generated:        (obsId, recId, meta)       => edge(EDGE.GENERATED,        obsId, recId, meta),
  generatedBy:      (recId, engineId, meta)    => edge(EDGE.GENERATED_BY,     recId, engineId, meta),
  createdFrom:      (recId, obsId, meta)       => edge(EDGE.CREATED_FROM,     recId, obsId, meta),
  resultedIn:       (recId, decId, meta)       => edge(EDGE.RESULTED_IN,      recId, decId, meta),
  concerns:         (recId, playerId, meta)    => edge(EDGE.CONCERNS,         recId, playerId, meta),
  improved:         (decId, outcomeId, meta)   => edge(EDGE.IMPROVED,         decId, outcomeId, meta),
  observedIn:       (obsId, fixId, meta)       => edge(EDGE.OBSERVED_IN,      obsId, fixId, meta),
  hasMedicalEvent:  (playerId, medId, meta)    => edge(EDGE.HAS_MEDICAL_EVENT,    playerId, medId, meta),
  hasAttendanceEvent:(playerId, attId, meta)   => edge(EDGE.HAS_ATTENDANCE_EVENT, playerId, attId, meta),
  precedes:         (aId, bId, meta)           => edge(EDGE.PRECEDES,         aId, bId, meta),
  follows:          (aId, bId, meta)           => edge(EDGE.FOLLOWS,          aId, bId, meta),
  similarTo:        (aId, bId, meta)           => edge(EDGE.SIMILAR_TO,       aId, bId, meta),
  relatedTo:        (aId, bId, meta)           => edge(EDGE.RELATED_TO,       aId, bId, meta),
}

// ── Upsert helpers ────────────────────────────────────────────────────────────
// Prevents duplicate nodes when syncing from multiple sources

export function upsertNode(id, builder, fields) {
  const nodes = getAllNodes()
  const existing = nodes.find(n => n.id === id)
  if (existing) return existing
  return builder(fields)
}

export function upsertEdge(type, from, to, meta = {}) {
  const edges = getAllEdges()
  const existing = edges.find(e => e.type === type && e.from === from && e.to === to)
  if (existing) return existing
  return addEdge({ type, from, to, metadata: meta })
}
