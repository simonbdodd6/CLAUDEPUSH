/**
 * Memory Update — handles post-generation updates to memory.
 * Called automatically after every AI generation to keep memory fresh.
 *
 * Key behaviours:
 * - Updates the player's programme list after generateProgramme()
 * - Updates the team's session list after generateSession()
 * - Logs every AI generation to the generations JSONL log
 * - Marks injuries as cleared if a rehab plan is generated
 */

import { readEntity, writeEntity, appendLog } from './memory-store.js';
import { indexEntity } from './memory-index.js';
import { autoSummarize, compressHistory, extractProgrammeOutputSummary, extractSessionOutputSummary } from './memory-summary.js';
import { createAIGenerationEntity, createProgrammeEntity, createSessionEntity, createPlayerEntity, createTeamEntity } from './entity-schemas.js';
import { generateAIGenerationId, generateProgrammeId, generateSessionId, generatePlayerId, generateTeamId } from './id-generator.js';
import { findPlayer, findTeam } from './memory-query.js';

// Inline upsert helpers to avoid circular import with index.js
function upsertPlayer(data) {
  const id       = generatePlayerId(data);
  const existing = readEntity('player', id);
  if (existing) return existing;
  const entity  = createPlayerEntity(id, data);
  entity.summary = autoSummarize(entity);
  const saved   = writeEntity(entity);
  indexEntity(saved);
  return saved;
}

function upsertTeam(data) {
  const id       = generateTeamId(data);
  const existing = readEntity('team', id);
  if (existing) return existing;
  const entity  = createTeamEntity(id, data);
  entity.summary = autoSummarize(entity);
  const saved   = writeEntity(entity);
  indexEntity(saved);
  return saved;
}

// ── Post-generation update dispatcher ────────────────────────────────────────

/**
 * Called after any AI generation. Updates all relevant memory entities.
 * @param {string} requestType — 'programme' | 'session' | 'season-plan' | 'rehab'
 * @param {object} inputData   — the input that was passed to the generator
 * @param {object} output      — the structured JSON output from the generator
 */
export async function updateAfterGeneration(requestType, inputData, output) {
  const meta = output._meta ?? {};

  // Log the generation event
  const genId = recordGenerationEvent(requestType, inputData, output);

  switch (requestType) {
    case 'programme':
      await updateAfterProgramme(inputData, output, genId);
      break;
    case 'rehab':
      await updateAfterRehab(inputData, output, genId);
      break;
    case 'session':
      await updateAfterSession(inputData, output, genId);
      break;
    case 'season-plan':
      await updateAfterSeasonPlan(inputData, output, genId);
      break;
  }

  return genId;
}

// ── Per-type update handlers ──────────────────────────────────────────────────

async function updateAfterProgramme(inputData, output, genId) {
  const player = inputData.player ?? inputData;
  const meta   = output._meta ?? {};

  // 1. Remember/update the player
  const playerMemory = upsertPlayer(player);

  // 2. Create the programme entity
  const programmeId = generateProgrammeId({
    playerId:    playerMemory?.id,
    requestType: 'programme',
    seasonPhase: player.seasonPhase,
    input:       player,
  });

  const programmeEntity = createProgrammeEntity(programmeId, {
    playerId:    playerMemory?.id,
    requestType: 'programme',
    input:       player,
    provider:    meta.provider,
    tags:        [player.seasonPhase, player.position, player.ageGroup].filter(Boolean),
  });

  programmeEntity.outputSummary = extractProgrammeOutputSummary(output);
  programmeEntity.status        = 'active';
  programmeEntity.startDate     = new Date().toISOString().slice(0, 10);

  // Update summary
  programmeEntity.summary = `${player.seasonPhase ?? 'Training'} programme for ${player.position ?? '?'} — ${programmeEntity.outputSummary}`;

  const saved = writeEntity(programmeEntity);
  indexEntity(saved);

  // 3. Add programme reference to player memory
  if (playerMemory) {
    if (!playerMemory.programmes.includes(programmeId)) {
      playerMemory.programmes.push(programmeId);
    }
    playerMemory.aiGenerations = (playerMemory.aiGenerations ?? 0) + 1;
    playerMemory.summary = autoSummarize(playerMemory);
    const compressed = compressHistory(playerMemory);
    const updated = writeEntity(compressed);
    indexEntity(updated);
  }

  return saved;
}

async function updateAfterRehab(inputData, output, genId) {
  const player = inputData.player ?? inputData;

  const playerMemory = upsertPlayer(player);

  if (playerMemory && inputData.injuryDetail) {
    // Find and update the matching injury record
    const injuries = playerMemory.injuries ?? [];
    let matched = false;
    for (const inj of injuries) {
      const desc = inputData.injuryDetail.toLowerCase();
      if (desc.includes(inj.type.toLowerCase())) {
        inj.rehabPlanGenerated = true;
        inj.rehabGenId = genId;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Add a new injury record from the rehab request
      injuries.push({
        type:        inputData.injuryDetail,
        description: inputData.injuryDetail,
        onsetDate:   null,
        status:      'active',
        rehabPlanGenerated: true,
        rehabGenId:  genId,
      });
      playerMemory.injuries = injuries;
    }

    playerMemory.aiGenerations = (playerMemory.aiGenerations ?? 0) + 1;
    playerMemory.summary = autoSummarize(playerMemory);
    const updated = writeEntity(playerMemory);
    indexEntity(updated);
  }
}

async function updateAfterSession(inputData, output, genId) {
  const team    = inputData.team ?? inputData;
  const meta    = output._meta ?? {};

  // 1. Upsert the team
  const teamMemory = upsertTeam(team);

  // 2. Create session entity
  const sessionId = generateSessionId({
    teamId:    teamMemory?.id,
    focus:     inputData.focus ?? output.theme,
    sessionDate: new Date().toISOString().slice(0, 10),
  });

  const sessionEntity = createSessionEntity(sessionId, {
    teamId:    teamMemory?.id,
    ageGroup:  team.ageGroup,
    theme:     output.theme,
    duration:  output.duration,
    focus:     meta.focus ?? inputData.focus ?? output.theme,
    input:     inputData,
    provider:  meta.provider,
  });

  sessionEntity.outputSummary = extractSessionOutputSummary(output);
  sessionEntity.summary       = summarizeSession(sessionEntity);

  const savedSession = writeEntity(sessionEntity);
  indexEntity(savedSession);

  // 3. Update team session count
  if (teamMemory) {
    if (!teamMemory.sessions) teamMemory.sessions = [];
    teamMemory.sessions = [sessionId, ...teamMemory.sessions.slice(0, 9)]; // keep last 10
    teamMemory.sessionCount = (teamMemory.sessionCount ?? 0) + 1;
    teamMemory.summary = autoSummarize(teamMemory);
    const updated = writeEntity(teamMemory);
    indexEntity(updated);
  }

  return savedSession;
}

async function updateAfterSeasonPlan(inputData, output, genId) {
  const team = inputData.team ?? inputData;
  const teamMemory = upsertTeam(team);
  if (teamMemory) {
    teamMemory.aiGenerations = (teamMemory.aiGenerations ?? 0) + 1;
    teamMemory.summary = autoSummarize(teamMemory);
    const updated = writeEntity(teamMemory);
    indexEntity(updated);
  }
}

// ── Generation event logging ──────────────────────────────────────────────────

function recordGenerationEvent(requestType, inputData, output) {
  const meta   = output._meta ?? {};
  const player = inputData.player ?? inputData;

  const genId = generateAIGenerationId({ requestType, entityId: player?.id });

  const genEntity = createAIGenerationEntity(genId, {
    requestType,
    entityType:    'player',
    entityId:      player?.id,
    provider:      meta.provider ?? meta.mode ?? 'template',
    elapsed:       meta.elapsed,
    kbItemsUsed:   meta.kbItemsUsed,
    outputPreview: output.overview?.summary?.slice(0, 200) ?? output.theme?.slice(0, 200) ?? '',
  });

  genEntity.summary = `${requestType} generation via ${genEntity.provider} (${meta.elapsed ?? '?'}ms)`;
  writeEntity(genEntity);
  indexEntity(genEntity);

  // Also append to the JSONL log
  appendLog('generations', {
    genId,
    requestType,
    provider:  meta.provider ?? meta.mode,
    elapsed:   meta.elapsed,
    kbItems:   meta.kbItemsUsed,
    playerAge: player?.age,
    position:  player?.position,
    ageGroup:  player?.ageGroup ?? inputData?.team?.ageGroup,
  });

  return genId;
}

// Local summarizer (avoids circular import)
function summarizeSession(entity) {
  const parts = [
    entity.sessionDate ? `Session ${entity.sessionDate}` : 'Session',
    entity.theme ? `Theme: ${entity.theme}` : null,
    entity.duration ? `${entity.duration}min` : null,
  ].filter(Boolean);
  return parts.join('. ');
}
