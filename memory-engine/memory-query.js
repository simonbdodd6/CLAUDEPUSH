/**
 * Memory Query — retrieves relevant memories and assembles context bundles.
 * This is the primary interface between the memory engine and AI generators.
 *
 * getRelevantContext(request) is the main entry point.
 * It returns a ContextBundle with a contextSummary string ready for prompt injection.
 *
 * Future: replace searchIndex() with vector similarity search when embeddings exist.
 */

import { readEntity, listEntities } from './memory-store.js';
import { searchIndex, findByFields, getIndexEntriesOfType } from './memory-index.js';
import { generatePlayerId, generateTeamId, generateCoachId } from './id-generator.js';

// ── Direct lookups ────────────────────────────────────────────────────────────

export function findPlayer(playerData) {
  if (!playerData) return null;

  // Try by explicit ID first
  if (playerData.id) {
    const entity = readEntity('player', playerData.id);
    if (entity) return entity;
  }

  // Try by generated deterministic ID
  const id = generatePlayerId(playerData);
  const entity = readEntity('player', id);
  if (entity) return entity;

  // Fall back to index search by name + club
  const matches = findByFields('player', {
    name: playerData.name,
    club: playerData.club,
  });

  if (matches.length) {
    return readEntity('player', matches[0].id);
  }

  return null;
}

export function findTeam(teamData) {
  if (!teamData) return null;

  if (teamData.id) {
    const entity = readEntity('team', teamData.id);
    if (entity) return entity;
  }

  const id = generateTeamId(teamData);
  const entity = readEntity('team', id);
  if (entity) return entity;

  const matches = findByFields('team', {
    ageGroup: teamData.ageGroup,
    club:     teamData.club,
  });

  return matches.length ? readEntity('team', matches[0].id) : null;
}

export function findCoach(coachData) {
  if (!coachData) return null;

  if (coachData.id) {
    const entity = readEntity('coach', coachData.id);
    if (entity) return entity;
  }

  const id = generateCoachId(coachData);
  const entity = readEntity('coach', id);
  if (entity) return entity;

  return null;
}

/**
 * Get all programmes associated with a player ID (most recent first).
 */
export function getPlayerProgrammes(playerId, { limit = 5, status = null } = {}) {
  if (!playerId) return [];

  const allProgrammes = getIndexEntriesOfType('programme')
    .filter(e => e.player === playerId)
    .filter(e => status == null || e.status === status)
    .sort((a, b) => (b.lastUpdated ?? '').localeCompare(a.lastUpdated ?? ''));

  return allProgrammes.slice(0, limit).map(e => readEntity('programme', e.id)).filter(Boolean);
}

/**
 * Get recent sessions for a team (most recent first).
 */
export function getTeamSessions(teamId, { limit = 5 } = {}) {
  if (!teamId) return [];

  return getIndexEntriesOfType('session')
    .filter(e => e.team === teamId)
    .sort((a, b) => (b.sessionDate ?? '').localeCompare(a.sessionDate ?? ''))
    .slice(0, limit)
    .map(e => readEntity('session', e.id))
    .filter(Boolean);
}

// ── Context bundle assembly ───────────────────────────────────────────────────

/**
 * Build a context bundle from found entities.
 * Returns a ready-to-inject contextSummary string and structured entity data.
 */
export function buildContextBundle(entities = {}) {
  const { player, team, coach, priorProgrammes = [], recentSessions = [] } = entities;

  const sections = [];

  if (player) {
    const core     = player.core ?? {};
    const goals    = (player.goals ?? []).filter(g => g.status === 'active');
    const injuries = (player.injuries ?? []).filter(i => i.status !== 'historical');
    const attend   = player.attendance ?? {};

    sections.push(`Player: ${player.summary || `${core.name ?? 'Unknown'}, ${core.age ?? '?'}yo ${core.ageGroup ?? ''} ${core.position ?? ''}`.trim()}`);

    if (goals.length) {
      sections.push(`Active goals: ${goals.map(g => g.goal).join(', ')}`);
    }
    if (injuries.length) {
      const injStr = injuries.map(i => {
        const status = i.status === 'cleared' ? ` (cleared ${i.clearanceDate ?? 'recently'})` : ' (active — not cleared)';
        return `${i.type}${status}`;
      });
      sections.push(`Injury history: ${injStr.join('; ')}`);
    }
    if (attend.rate != null) {
      sections.push(`Attendance: ${Math.round(attend.rate * 100)}% (${attend.attended}/${attend.totalSessions} sessions)`);
    }
    if (player.aiGenerations) {
      sections.push(`Prior AI generations: ${player.aiGenerations}`);
    }
  }

  if (team) {
    sections.push(`Team: ${team.summary || `${team.core?.ageGroup ?? 'Team'}`}`);
  }

  if (coach) {
    sections.push(`Coach: ${coach.summary || `${coach.core?.name ?? 'Coach'}`}`);
  }

  if (priorProgrammes.length) {
    sections.push(`Prior programmes (${priorProgrammes.length}):`);
    for (const p of priorProgrammes.slice(0, 3)) {
      const label = p.outputSummary || summariseProgrammeShort(p);
      sections.push(`  - ${label} [${p.status}]`);
    }
  }

  if (recentSessions.length) {
    sections.push(`Recent sessions (${recentSessions.length}):`);
    for (const s of recentSessions.slice(0, 2)) {
      sections.push(`  - ${s.sessionDate}: ${s.theme ?? s.focus ?? 'session'}`);
    }
  }

  // Coaching recommendation based on history
  const recommendation = buildRecommendation(entities);
  if (recommendation) sections.push(`Recommendation: ${recommendation}`);

  const contextSummary = sections.join('\n');
  const tokenEstimate  = Math.ceil(contextSummary.length / 4);  // rough: 4 chars ≈ 1 token

  return {
    hasHistory:      sections.length > 0,
    player:          player    ?? null,
    team:            team      ?? null,
    coach:           coach     ?? null,
    priorProgrammes: priorProgrammes,
    recentSessions:  recentSessions,
    contextSummary,
    tokenEstimate,
  };
}

function summariseProgrammeShort(p) {
  const input = p.input ?? {};
  const parts = [
    input.seasonPhase ?? p.requestType ?? 'programme',
    input.goals?.length ? `(${input.goals.join('/')})` : null,
    input.age ? `${input.age}yo` : null,
  ].filter(Boolean);
  return parts.join(' ');
}

function buildRecommendation(entities) {
  const { player, priorProgrammes = [] } = entities;
  if (!player) return null;

  const injuries    = (player.injuries ?? []).filter(i => i.status === 'active');
  const lastProg    = priorProgrammes[0];
  const seasonPhase = player.core?.currentSeasonPhase;

  if (injuries.length) {
    return `Player has active injury (${injuries[0].type}) — consider rehab plan or injury modifications.`;
  }

  if (lastProg?.status === 'completed') {
    const lastPhase = lastProg.input?.seasonPhase;
    if (lastPhase === 'preseason') {
      return `Last programme (preseason) was completed — progress to early-season phase with power conversion focus.`;
    }
    if (lastPhase === 'early-season') {
      return `Last early-season programme completed — progress to competition-phase maintenance.`;
    }
  }

  if (lastProg?.status === 'active') {
    return `Player has an active programme — consider continuing or updating rather than generating a new one.`;
  }

  return null;
}

// ── Main query function ───────────────────────────────────────────────────────

/**
 * Primary entry point for AI generators.
 * Given a request (player profile, team profile, requestType), finds all relevant
 * memories and returns a ContextBundle ready for prompt injection.
 *
 * @param {object} request
 * @param {object} [request.player]      — player profile (from buildPlayerProfile)
 * @param {object} [request.team]        — team profile (from buildTeamProfile)
 * @param {object} [request.coach]       — coach profile
 * @param {string} [request.requestType] — 'programme' | 'session' | 'rehab' | etc.
 * @returns {ContextBundle}
 */
export function getRelevantContext(request = {}) {
  const { player, team, coach, requestType } = request;
  const start = Date.now();

  const playerMemory  = findPlayer(player)  ?? null;
  const teamMemory    = findTeam(team)      ?? null;
  const coachMemory   = findCoach(coach)    ?? null;

  const priorProgrammes = playerMemory?.id
    ? getPlayerProgrammes(playerMemory.id, { limit: 3 })
    : [];

  const recentSessions = teamMemory?.id
    ? getTeamSessions(teamMemory.id, { limit: 3 })
    : [];

  const bundle = buildContextBundle({
    player:          playerMemory,
    team:            teamMemory,
    coach:           coachMemory,
    priorProgrammes,
    recentSessions,
  });

  return {
    ...bundle,
    requestType,
    queryTime: Date.now() - start,
  };
}

// ── General search ────────────────────────────────────────────────────────────

/**
 * Free-text search across all indexed memories.
 * Returns matching index entries (not full entities).
 */
export function searchMemory(query, opts = {}) {
  return searchIndex(query, opts);
}
