/**
 * Deterministic ID generator for memory entities.
 * Same inputs always produce the same ID — enabling upsert semantics.
 * If the caller provides an explicit ID (e.g., from the app DB), that takes priority.
 */

// djb2 hash — deterministic, no external deps
function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  return Math.abs(hash).toString(36).padStart(7, '0').slice(0, 7);
}

function slugify(str = '') {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 20);
}

// ── Per-type ID generation ────────────────────────────────────────────────────

export function generatePlayerId(data) {
  if (data.id)        return data.id;
  if (data.appUserId) return `player_${slugify(data.appUserId)}`;

  const key = [data.name, data.club, data.ageGroup].filter(Boolean).join('|');
  return `player_${slugify(data.name ?? 'unknown')}_${djb2(key)}`;
}

export function generateCoachId(data) {
  if (data.id)        return data.id;
  if (data.appUserId) return `coach_${slugify(data.appUserId)}`;

  const key = [data.name, data.club].filter(Boolean).join('|');
  return `coach_${slugify(data.name ?? 'unknown')}_${djb2(key)}`;
}

export function generateTeamId(data) {
  if (data.id)       return data.id;
  if (data.appTeamId) return `team_${slugify(data.appTeamId)}`;

  const key = [data.ageGroup, data.club, data.level].filter(Boolean).join('|');
  return `team_${slugify(data.ageGroup ?? 'unknown')}_${djb2(key)}`;
}

export function generateClubId(data) {
  if (data.id)        return data.id;
  if (data.appClubId) return `club_${slugify(data.appClubId)}`;

  const key = [data.name, data.country].filter(Boolean).join('|');
  return `club_${slugify(data.name ?? 'unknown')}_${djb2(key)}`;
}

export function generateProgrammeId(data) {
  if (data.id) return data.id;

  const key = [data.playerId, data.requestType, data.seasonPhase, data.input?.age, Date.now().toString()].filter(Boolean).join('|');
  return `programme_${data.requestType ?? 'prog'}_${djb2(key)}`;
}

export function generateSessionId(data) {
  if (data.id) return data.id;

  const date = (data.sessionDate ?? new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const key  = [data.teamId, date, data.focus].filter(Boolean).join('|');
  return `session_${date}_${djb2(key)}`;
}

export function generateSeasonId(data) {
  if (data.id) return data.id;

  const key = [data.teamId, data.label, data.startDate].filter(Boolean).join('|');
  return `season_${slugify(data.label ?? 'unknown')}_${djb2(key)}`;
}

export function generateConversationId(data) {
  if (data.id)        return data.id;
  if (data.sessionId) return `conv_${slugify(data.sessionId)}`;

  return `conv_${Date.now().toString(36)}`;
}

export function generateAIGenerationId(data) {
  if (data.id) return data.id;

  const key = [data.requestType, data.entityId, Date.now().toString()].filter(Boolean).join('|');
  return `gen_${data.requestType ?? 'gen'}_${djb2(key)}`;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export function generateId(type, data) {
  switch (type) {
    case 'player':        return generatePlayerId(data);
    case 'coach':         return generateCoachId(data);
    case 'team':          return generateTeamId(data);
    case 'club':          return generateClubId(data);
    case 'programme':     return generateProgrammeId(data);
    case 'session':       return generateSessionId(data);
    case 'season':        return generateSeasonId(data);
    case 'conversation':  return generateConversationId(data);
    case 'ai-generation': return generateAIGenerationId(data);
    default:              return `${type}_${Date.now().toString(36)}`;
  }
}
