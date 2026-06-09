/**
 * Entity schemas and validators for all memory types.
 * These are the contracts that every writer must conform to.
 * Future: add JSON Schema validation here.
 */

// ── Entity type registry ──────────────────────────────────────────────────────

export const ENTITY_TYPES = [
  'player', 'coach', 'team', 'club',
  'session', 'season', 'programme',
  'injury', 'goal', 'feedback', 'conversation', 'ai-generation',
];

export const ENTITY_DIRS = {
  player:          'players',
  coach:           'coaches',
  team:            'teams',
  club:            'clubs',
  session:         'sessions',
  season:          'seasons',
  programme:       'programmes',
  injury:          'injuries',
  goal:            'goals',
  feedback:        'feedback',
  conversation:    'conversations',
  'ai-generation': 'ai-generations',
};

// ── Base entity (all entities inherit these fields) ───────────────────────────

export function baseEntity(type, id) {
  return {
    id,
    type,
    version:     1,
    firstSeen:   new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    updateCount: 0,
    summary:     '',
    history:     [],  // snapshots before each update (kept to last 5)
    tags:        [],
    embedding:   null,  // future: vector search embedding
  };
}

// ── Entity factories ──────────────────────────────────────────────────────────

export function createPlayerEntity(id, data) {
  return {
    ...baseEntity('player', id),
    core: {
      name:        data.name        ?? 'Unknown Player',
      age:         data.age         ?? null,
      ageGroup:    data.ageGroup    ?? null,
      position:    data.position    ?? null,
      experience:  data.experience  ?? null,
      club:        data.club        ?? null,
      clubId:      data.clubId      ?? null,
      teamId:      data.teamId      ?? null,
      appUserId:   data.appUserId   ?? null,
    },
    physical: {
      weight:      data.weight      ?? null,
      height:      data.height      ?? null,
      lastMeasured: null,
    },
    goals:         [],
    injuries:      [],
    programmes:    [],   // IDs of programme entities
    sessionCount:  0,
    attendance:    { totalSessions: 0, attended: 0, rate: null },
    aiGenerations: 0,
    notes:         data.notes ?? null,
  };
}

export function createCoachEntity(id, data) {
  return {
    ...baseEntity('coach', id),
    core: {
      name:           data.name        ?? 'Unknown Coach',
      club:           data.club        ?? null,
      clubId:         data.clubId      ?? null,
      qualifications: data.qualifications ?? [],
      ageGroupsFocus: data.ageGroupsFocus ?? [],
      yearsCoaching:  data.yearsCoaching  ?? null,
      philosophy:     data.philosophy  ?? null,
      appUserId:      data.appUserId   ?? null,
    },
    teams:          [],   // team IDs this coach manages
    seasons:        [],   // season IDs
    aiGenerations:  0,
    preferences:    {     // learned preferences from generation history
      preferredDrills:     [],
      preferredCondition:  null,
      philosophyNotes:     [],
    },
    notes: data.notes ?? null,
  };
}

export function createTeamEntity(id, data) {
  return {
    ...baseEntity('team', id),
    core: {
      name:        data.name       ?? null,
      ageGroup:    data.ageGroup   ?? null,
      level:       data.level      ?? 'community',
      club:        data.club       ?? null,
      clubId:      data.clubId     ?? null,
      coachIds:    data.coachIds   ?? [],
      appTeamId:   data.appTeamId  ?? null,
    },
    season: {
      current:      data.currentSeason  ?? null,
      phase:        data.seasonPhase    ?? null,
      record:       { wins: 0, losses: 0, draws: 0 },
    },
    roster:           [],   // player IDs
    sessionCount:     0,
    programmes:       [],
    systemOfPlay:     data.systemOfPlay ?? null,
    keyFocusAreas:    data.keyFocusAreas ?? [],
    notes:            data.notes ?? null,
  };
}

export function createClubEntity(id, data) {
  return {
    ...baseEntity('club', id),
    core: {
      name:     data.name     ?? 'Unknown Club',
      country:  data.country  ?? null,
      union:    data.union    ?? null,
      website:  data.website  ?? null,
      email:    data.email    ?? null,
      appClubId: data.appClubId ?? null,
    },
    teams:    [],   // team IDs
    coaches:  [],   // coach IDs
    stats: {
      totalPlayers:    0,
      totalTeams:      0,
      totalSessions:   0,
    },
    notes: data.notes ?? null,
  };
}

export function createProgrammeEntity(id, data) {
  return {
    ...baseEntity('programme', id),
    player:       data.playerId    ?? null,
    coach:        data.coachId     ?? null,
    team:         data.teamId      ?? null,
    requestType:  data.requestType ?? 'programme',
    input:        data.input       ?? {},
    outputSummary: '',              // filled by memory-summary
    status:       'draft',          // draft | active | completed | archived
    startDate:    data.startDate   ?? null,
    endDate:      data.endDate     ?? null,
    provider:     data.provider    ?? null,
    coachFeedback: null,
    playerFeedback: null,
    completionRate: null,
    adherenceNotes: null,
    tags:         data.tags ?? [],
  };
}

export function createSessionEntity(id, data) {
  return {
    ...baseEntity('session', id),
    team:       data.teamId    ?? null,
    coach:      data.coachId   ?? null,
    ageGroup:   data.ageGroup  ?? null,
    sessionDate: data.sessionDate ?? new Date().toISOString().slice(0, 10),
    theme:      data.theme     ?? null,
    duration:   data.duration  ?? null,
    focus:      data.focus     ?? null,
    attendance: {
      expected: data.expectedAttendance ?? 0,
      actual:   data.actualAttendance   ?? 0,
    },
    outputSummary: '',
    coachNotes:    data.coachNotes    ?? null,
    playerFeedback: [],
    provider:      data.provider     ?? null,
    input:         data.input        ?? {},
  };
}

export function createSeasonEntity(id, data) {
  return {
    ...baseEntity('season', id),
    team:       data.teamId    ?? null,
    coach:      data.coachId   ?? null,
    label:      data.label     ?? null,   // e.g. "2025/26 Season"
    startDate:  data.startDate ?? null,
    endDate:    data.endDate   ?? null,
    totalWeeks: data.totalWeeks ?? null,
    phase:      data.phase     ?? 'preseason',
    record:     { wins: 0, losses: 0, draws: 0 },
    sessions:   [],
    programmes: [],
    keyObjectives: data.keyObjectives ?? [],
    outputSummary: '',
    status:     'active',  // active | completed | archived
  };
}

export function createConversationEntity(id, data) {
  return {
    ...baseEntity('conversation', id),
    agentType:  data.agentType  ?? 'unknown',
    sessionId:  data.sessionId  ?? null,
    startedAt:  data.startedAt  ?? new Date().toISOString(),
    endedAt:    null,
    messages:   [],
    entities:   { players: [], teams: [], coaches: [], programmes: [] },
    requestType: data.requestType ?? null,
    provider:   data.provider   ?? null,
  };
}

export function createAIGenerationEntity(id, data) {
  return {
    ...baseEntity('ai-generation', id),
    requestType: data.requestType ?? null,
    entityType:  data.entityType  ?? null,   // which entity was generated for
    entityId:    data.entityId    ?? null,
    provider:    data.provider    ?? 'template',
    model:       data.model       ?? null,
    inputHash:   data.inputHash   ?? null,   // hash of input for deduplication
    elapsed:     data.elapsed     ?? null,
    kbItemsUsed: data.kbItemsUsed ?? 0,
    outputPreview: data.outputPreview ?? '',  // first 200 chars
    coachReviewed: false,
  };
}

// ── Factory dispatcher ────────────────────────────────────────────────────────

export function createEntity(type, id, data) {
  switch (type) {
    case 'player':        return createPlayerEntity(id, data);
    case 'coach':         return createCoachEntity(id, data);
    case 'team':          return createTeamEntity(id, data);
    case 'club':          return createClubEntity(id, data);
    case 'programme':     return createProgrammeEntity(id, data);
    case 'session':       return createSessionEntity(id, data);
    case 'season':        return createSeasonEntity(id, data);
    case 'conversation':  return createConversationEntity(id, data);
    case 'ai-generation': return createAIGenerationEntity(id, data);
    default:              return { ...baseEntity(type, id), data };
  }
}
