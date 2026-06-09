/**
 * Coach Memory Engine — Public API
 *
 * Long-term memory for every AI feature inside Coach's Eye.
 * Every AI agent should query memory before generating, and update memory after.
 *
 * Usage:
 *   import { rememberPlayer, getRelevantContext, updateAfterGeneration } from './memory-engine/index.js';
 *
 *   // Before generation:
 *   const memCtx = getRelevantContext({ player, requestType: 'programme' });
 *
 *   // After generation:
 *   await updateAfterGeneration('programme', { player }, output);
 */

import { readEntity, writeEntity, listEntities } from './memory-store.js';
import { indexEntity, getIndexEntriesOfType } from './memory-index.js';
import { autoSummarize, compressHistory } from './memory-summary.js';
import {
  createPlayerEntity, createCoachEntity, createTeamEntity, createClubEntity,
  createProgrammeEntity, createSessionEntity, createSeasonEntity, createConversationEntity,
} from './entity-schemas.js';
import {
  generatePlayerId, generateCoachId, generateTeamId, generateClubId,
  generateProgrammeId, generateSessionId, generateSeasonId, generateConversationId,
} from './id-generator.js';
import { getRelevantContext, findPlayer, findTeam, findCoach, searchMemory } from './memory-query.js';
import { updateAfterGeneration } from './memory-update.js';
import { checkHealth, repairIndex, getStats } from './memory-health.js';

export { getRelevantContext, searchMemory, updateAfterGeneration, checkHealth, repairIndex, getStats };

// ── Generic upsert helper ─────────────────────────────────────────────────────

function upsertEntity(type, idFn, factoryFn, data, enrichFn = null) {
  const id       = idFn(data);
  const existing = readEntity(type, id);

  let entity;
  if (existing) {
    // Merge relevant fields from incoming data into existing entity
    entity = existing;
    if (enrichFn) entity = enrichFn(entity, data);
  } else {
    entity = factoryFn(id, data);
  }

  entity.summary = autoSummarize(entity);
  if ((entity.updateCount ?? 0) > 10) {
    entity = compressHistory(entity);
  }

  const saved = writeEntity(entity);
  indexEntity(saved);
  return saved;
}

// ── remember* functions ───────────────────────────────────────────────────────

/**
 * Remember a player. Creates or updates the player's memory record.
 * All fields are optional — partial updates are supported.
 *
 * @param {object} data — player data (name, age, position, club, goals, injuries, etc.)
 * @returns {PlayerEntity}
 */
export function rememberPlayer(data = {}) {
  return upsertEntity('player', generatePlayerId, createPlayerEntity, data, (entity, newData) => {
    // Merge core fields (non-null values win)
    for (const [k, v] of Object.entries(newData)) {
      if (v != null && entity.core?.[k] !== undefined) {
        entity.core[k] = v;
      }
    }

    // Merge goals (upsert by goal name)
    if (newData.goals?.length) {
      const existingGoalNames = new Set((entity.goals ?? []).map(g => g.goal));
      for (const goal of newData.goals) {
        const name = typeof goal === 'string' ? goal : goal.goal;
        if (!existingGoalNames.has(name)) {
          entity.goals = entity.goals ?? [];
          entity.goals.push({
            goal:   name,
            setAt:  new Date().toISOString().slice(0, 10),
            status: 'active',
          });
        }
      }
    }

    // Merge injuries (upsert by type)
    if (newData.injuries?.length) {
      const existingTypes = new Set((entity.injuries ?? []).map(i => i.type));
      for (const inj of newData.injuries) {
        const type = typeof inj === 'string' ? inj : inj.type;
        if (!existingTypes.has(type)) {
          entity.injuries = entity.injuries ?? [];
          entity.injuries.push({
            type,
            description: typeof inj === 'string' ? inj : inj.description ?? inj.type,
            onsetDate:   typeof inj === 'object' ? inj.onsetDate ?? null : null,
            clearanceDate: typeof inj === 'object' ? inj.clearanceDate ?? null : null,
            status:      typeof inj === 'object' ? inj.status ?? 'active' : 'active',
          });
        }
      }
    }

    return entity;
  });
}

/**
 * Remember a coach. Creates or updates the coach's memory record.
 */
export function rememberCoach(data = {}) {
  return upsertEntity('coach', generateCoachId, createCoachEntity, data, (entity, newData) => {
    for (const [k, v] of Object.entries(newData)) {
      if (v != null && entity.core?.[k] !== undefined) entity.core[k] = v;
    }
    if (newData.qualifications?.length) {
      const existing = new Set(entity.core.qualifications ?? []);
      entity.core.qualifications = [...existing, ...newData.qualifications.filter(q => !existing.has(q))];
    }
    return entity;
  });
}

/**
 * Remember a team. Creates or updates the team's memory record.
 */
export function rememberTeam(data = {}) {
  return upsertEntity('team', generateTeamId, createTeamEntity, data, (entity, newData) => {
    for (const [k, v] of Object.entries(newData)) {
      if (v != null && entity.core?.[k] !== undefined) entity.core[k] = v;
    }
    if (newData.seasonPhase) entity.season.phase = newData.seasonPhase;
    if (newData.keyFocusAreas?.length) entity.keyFocusAreas = newData.keyFocusAreas;
    if (newData.systemOfPlay)          entity.systemOfPlay  = newData.systemOfPlay;
    return entity;
  });
}

/**
 * Remember a club. Creates or updates the club's memory record.
 */
export function rememberClub(data = {}) {
  return upsertEntity('club', generateClubId, createClubEntity, data, (entity, newData) => {
    for (const [k, v] of Object.entries(newData)) {
      if (v != null && entity.core?.[k] !== undefined) entity.core[k] = v;
    }
    return entity;
  });
}

/**
 * Remember a generated programme. Stores the programme and links it to the player.
 * Usually called via updateAfterGeneration() — but can be called directly.
 */
export function rememberProgramme(data = {}) {
  return upsertEntity('programme', generateProgrammeId, createProgrammeEntity, data, (entity, newData) => {
    if (newData.status)       entity.status       = newData.status;
    if (newData.endDate)      entity.endDate       = newData.endDate;
    if (newData.coachFeedback) entity.coachFeedback = newData.coachFeedback;
    if (newData.playerFeedback) entity.playerFeedback = newData.playerFeedback;
    return entity;
  });
}

/**
 * Remember a training session. Links to the team.
 */
export function rememberSession(data = {}) {
  return upsertEntity('session', generateSessionId, createSessionEntity, data, (entity, newData) => {
    if (newData.coachNotes)    entity.coachNotes    = newData.coachNotes;
    if (newData.attendance)    entity.attendance    = { ...entity.attendance, ...newData.attendance };
    if (newData.playerFeedback) entity.playerFeedback.push(...(newData.playerFeedback ?? []));
    return entity;
  });
}

/**
 * Remember a season. Links to the team.
 */
export function rememberSeason(data = {}) {
  return upsertEntity('season', generateSeasonId, createSeasonEntity, data, (entity, newData) => {
    if (newData.phase)  entity.phase  = newData.phase;
    if (newData.status) entity.status = newData.status;
    if (newData.record) entity.record = { ...entity.record, ...newData.record };
    return entity;
  });
}

/**
 * Remember a conversation (or update an existing one with new messages).
 */
export function rememberConversation(data = {}) {
  return upsertEntity('conversation', generateConversationId, createConversationEntity, data, (entity, newData) => {
    if (newData.messages?.length) entity.messages.push(...newData.messages);
    if (newData.endedAt)          entity.endedAt = newData.endedAt;
    if (newData.summary)          entity.summary = newData.summary;
    return entity;
  });
}

// ── get* functions ────────────────────────────────────────────────────────────

export function getPlayer(playerData) {
  return findPlayer(playerData);
}

export function getTeam(teamData) {
  return findTeam(teamData);
}

export function getCoach(coachData) {
  return findCoach(coachData);
}

export function getPlayerById(id) {
  return readEntity('player', id);
}

export function getTeamById(id) {
  return readEntity('team', id);
}

export function getAllPlayers() {
  return listEntities('player');
}

export function getAllTeams() {
  return listEntities('team');
}

// ── Update player attendance ──────────────────────────────────────────────────

export function recordAttendance(playerData, { attended = true } = {}) {
  const player = findPlayer(playerData);
  if (!player) return null;

  player.attendance = player.attendance ?? { totalSessions: 0, attended: 0, rate: null };
  player.attendance.totalSessions += 1;
  if (attended) player.attendance.attended += 1;
  player.attendance.rate = player.attendance.attended / player.attendance.totalSessions;

  player.summary = autoSummarize(player);
  const saved = writeEntity(player);
  indexEntity(saved);
  return saved;
}

// ── Mark injury as cleared ────────────────────────────────────────────────────

export function clearInjury(playerData, injuryType, clearanceDate = null) {
  const player = findPlayer(playerData);
  if (!player) return null;

  let cleared = false;
  for (const inj of (player.injuries ?? [])) {
    if (inj.type.toLowerCase().includes(injuryType.toLowerCase())) {
      inj.status = 'cleared';
      inj.clearanceDate = clearanceDate ?? new Date().toISOString().slice(0, 10);
      cleared = true;
    }
  }

  if (!cleared) return null;

  player.summary = autoSummarize(player);
  const saved = writeEntity(player);
  indexEntity(saved);
  return saved;
}

// ── Update programme status ───────────────────────────────────────────────────

export function updateProgrammeStatus(programmeId, status, notes = null) {
  const programme = readEntity('programme', programmeId);
  if (!programme) return null;

  programme.status = status;
  if (notes)         programme.coachFeedback = notes;
  if (status === 'completed') programme.endDate = new Date().toISOString().slice(0, 10);

  programme.summary = autoSummarize(programme);
  const saved = writeEntity(programme);
  indexEntity(saved);
  return saved;
}
