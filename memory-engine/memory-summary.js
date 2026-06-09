/**
 * Memory Summary — auto-summarization of entities to reduce token usage.
 * Each entity gets a compact text summary that can be injected into AI prompts.
 * When history grows large, oldest entries are compressed into the summary.
 *
 * Token budget targets:
 *   Player summary:    ≤ 60 tokens
 *   Programme summary: ≤ 80 tokens
 *   Team summary:      ≤ 70 tokens
 *   Session summary:   ≤ 40 tokens
 *   Context bundle:    ≤ 400 tokens total
 */

// ── Per-type summarizers ──────────────────────────────────────────────────────

export function summarizePlayer(entity) {
  const core    = entity.core ?? {};
  const attend  = entity.attendance ?? {};
  const injuries = (entity.injuries ?? []).filter(i => i.status !== 'historical');
  const goals   = (entity.goals ?? []).filter(g => g.status === 'active');

  const parts = [
    `${core.name ?? 'Player'}, ${core.age ?? '?'}yo ${core.ageGroup ?? ''} ${core.position ?? ''}`.trim(),
    core.club ? `(${core.club})` : null,
    core.experience ? `${core.experience} level` : null,
    goals.length   ? `Goals: ${goals.map(g => g.goal).join(', ')}` : null,
    injuries.length ? `Injuries: ${injuries.map(i => `${i.type}${i.status === 'cleared' ? ' (cleared)' : i.status === 'active' ? ' (active)' : ''}`).join(', ')}` : null,
    entity.programmes?.length ? `${entity.programmes.length} programme${entity.programmes.length > 1 ? 's' : ''} on record` : null,
    attend.rate != null ? `${Math.round(attend.rate * 100)}% attendance` : null,
    entity.aiGenerations ? `${entity.aiGenerations} AI generation${entity.aiGenerations > 1 ? 's' : ''}` : null,
  ].filter(Boolean);

  return parts.join('. ');
}

export function summarizeCoach(entity) {
  const core = entity.core ?? {};

  const parts = [
    `Coach ${core.name ?? 'Unknown'}`,
    core.club ? `at ${core.club}` : null,
    core.ageGroupsFocus?.length ? `Age groups: ${core.ageGroupsFocus.join(', ')}` : null,
    core.philosophy ? `Philosophy: ${core.philosophy}` : null,
    core.qualifications?.length ? `Qualified: ${core.qualifications.join(', ')}` : null,
    entity.teams?.length ? `${entity.teams.length} team${entity.teams.length > 1 ? 's' : ''}` : null,
    entity.aiGenerations ? `${entity.aiGenerations} AI generations` : null,
  ].filter(Boolean);

  return parts.join('. ');
}

export function summarizeTeam(entity) {
  const core    = entity.core ?? {};
  const season  = entity.season ?? {};
  const record  = season.record ?? {};

  const parts = [
    `${core.ageGroup ?? 'Team'} (${core.level ?? 'community'})`,
    core.club ? `at ${core.club}` : null,
    season.phase ? `Phase: ${season.phase}` : null,
    (record.wins != null || record.losses != null)
      ? `Record: ${record.wins ?? 0}W-${record.losses ?? 0}L-${record.draws ?? 0}D`
      : null,
    entity.keyFocusAreas?.length ? `Focus: ${entity.keyFocusAreas.join(', ')}` : null,
    entity.sessionCount ? `${entity.sessionCount} session${entity.sessionCount > 1 ? 's' : ''} recorded` : null,
    entity.systemOfPlay ? `System: ${entity.systemOfPlay}` : null,
  ].filter(Boolean);

  return parts.join('. ');
}

export function summarizeProgramme(entity) {
  const input = entity.input ?? {};

  const parts = [
    entity.requestType === 'rehab' ? 'Rehab plan' : `${input.seasonPhase ?? 'Training'} programme`,
    input.position ? `for ${input.position}` : null,
    input.goals?.length ? `Goals: ${input.goals.join(', ')}` : null,
    entity.outputSummary || null,
    entity.status !== 'draft' ? `Status: ${entity.status}` : null,
    entity.startDate ? `Started: ${entity.startDate}` : null,
    entity.endDate   ? `Ended: ${entity.endDate}` : null,
    entity.coachFeedback ? `Coach feedback: ${String(entity.coachFeedback).slice(0, 60)}` : null,
  ].filter(Boolean);

  return parts.join('. ');
}

export function summarizeSession(entity) {
  const attend = entity.attendance ?? {};

  const parts = [
    entity.sessionDate ? `Session ${entity.sessionDate}` : 'Session',
    entity.ageGroup ? `(${entity.ageGroup})` : null,
    entity.theme ? `Theme: ${entity.theme}` : null,
    entity.focus ? `Focus: ${entity.focus}` : null,
    entity.duration ? `${entity.duration}min` : null,
    attend.actual ? `${attend.actual}/${attend.expected} players attended` : null,
    entity.coachNotes ? `Coach notes: ${String(entity.coachNotes).slice(0, 80)}` : null,
  ].filter(Boolean);

  return parts.join('. ');
}

export function summarizeSeason(entity) {
  const record = entity.record ?? {};

  const parts = [
    entity.label ?? 'Season',
    entity.team ? `(team: ${entity.team})` : null,
    `${entity.totalWeeks ?? '?'} weeks`,
    entity.phase ? `Phase: ${entity.phase}` : null,
    (record.wins != null || record.losses != null)
      ? `Record: ${record.wins ?? 0}W-${record.losses ?? 0}L-${record.draws ?? 0}D`
      : null,
    entity.keyObjectives?.length ? `Objectives: ${entity.keyObjectives.slice(0, 2).join(', ')}` : null,
    entity.sessions?.length ? `${entity.sessions.length} sessions recorded` : null,
    entity.status ? `Status: ${entity.status}` : null,
  ].filter(Boolean);

  return parts.join('. ');
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export function autoSummarize(entity) {
  switch (entity.type) {
    case 'player':    return summarizePlayer(entity);
    case 'coach':     return summarizeCoach(entity);
    case 'team':      return summarizeTeam(entity);
    case 'programme': return summarizeProgramme(entity);
    case 'session':   return summarizeSession(entity);
    case 'season':    return summarizeSeason(entity);
    default:          return entity.summary ?? `${entity.type} ${entity.id}`;
  }
}

// ── History compression ───────────────────────────────────────────────────────

/**
 * Compress history entries older than cutoffDate into a single archived summary.
 * Keeps the last `keepLast` snapshots as individual entries.
 *
 * Run when: updateCount > 10, or called from memory-health.js cleanup.
 */
export function compressHistory(entity, keepLast = 5) {
  const history = entity.history ?? [];
  if (history.length <= keepLast) return entity;

  const toArchive = history.slice(0, history.length - keepLast);
  const toKeep    = history.slice(history.length - keepLast);

  const archiveSummary = {
    _type:       'compressed-archive',
    _compressedAt: new Date().toISOString(),
    _entryCount: toArchive.length,
    _dateRange:  `${toArchive[0]?._snapshotAt?.slice(0, 10)} – ${toArchive[toArchive.length - 1]?._snapshotAt?.slice(0, 10)}`,
    _summary:    `${toArchive.length} historical snapshots compressed`,
  };

  return {
    ...entity,
    history: [archiveSummary, ...toKeep],
  };
}

// ── Programme output summary extraction ──────────────────────────────────────

/**
 * Extract a compact summary from a full programme output object.
 * Used when storing a programme in memory — avoids storing the full output.
 */
export function extractProgrammeOutputSummary(programmeOutput) {
  if (!programmeOutput) return '';

  const ov     = programmeOutput.overview    ?? {};
  const blocks = programmeOutput.exerciseBlocks ?? [];
  const meta   = programmeOutput._meta ?? {};

  const firstBlock = blocks[0];
  const firstExercises = (firstBlock?.sessions?.[0]?.exercises ?? []).slice(0, 3).map(e => e.name);

  const parts = [
    ov.duration ? `${ov.duration}` : null,
    ov.primaryGoals?.length ? `Goals: ${ov.primaryGoals.join('/')}` : null,
    firstBlock?.blockName ? `Phase 1: ${firstBlock.blockName}` : null,
    firstExercises.length  ? `Exercises: ${firstExercises.join(', ')}` : null,
    blocks.length > 1 ? `${blocks.length} training blocks` : null,
    meta.mode ? `via ${meta.mode}` : null,
  ].filter(Boolean);

  return parts.join('. ');
}

/**
 * Extract a compact summary from a session output.
 */
export function extractSessionOutputSummary(sessionOutput) {
  if (!sessionOutput) return '';

  const parts = [
    sessionOutput.theme ? sessionOutput.theme : null,
    sessionOutput.duration ? `${sessionOutput.duration}min` : null,
    sessionOutput.skillBlocks?.length
      ? `Blocks: ${sessionOutput.skillBlocks.map(b => b.title?.split(' — ')[0]).join(', ')}`
      : null,
  ].filter(Boolean);

  return parts.join('. ');
}
