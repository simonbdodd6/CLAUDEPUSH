/**
 * Fixture Schema
 *
 * Defines the canonical Fixture object — the intelligent fixture entity
 * that the entire Fixture Engine operates on.
 *
 * Every fixture is a rich, time-aware object that aggregates club state
 * from the Digital Twin at the point of each update.
 */

export const FIXTURE_STATUS = {
  SCHEDULED:  'scheduled',
  PREPARING:  'preparing',
  READY:      'ready',
  IN_PROGRESS:'in_progress',
  COMPLETED:  'completed',
  CANCELLED:  'cancelled',
  POSTPONED:  'postponed',
};

export const RESULT_STATUS = {
  WIN:    'win',
  LOSS:   'loss',
  DRAW:   'draw',
  VOID:   'void',
};

export const COMPETITION_TYPES = {
  LEAGUE:         'league',
  CUP:            'cup',
  FRIENDLY:       'friendly',
  TOURNAMENT:     'tournament',
  PLAYOFFS:       'playoffs',
  TRAINING:       'training',
};

export const PREP_STAGE = {
  EARLY:       'early',     // 7+ days out
  MID:         'mid',       // 3–6 days out
  FINAL:       'final',     // 1–2 days out
  MATCHDAY:    'matchday',  // 0 days
  POST:        'post',      // after kickoff
};

// ── Fixture factory ───────────────────────────────────────────────────────────

let _seq = Date.now();
export function generateFixtureId(teamId, kickoff) {
  const d = kickoff ? new Date(kickoff).toISOString().slice(0, 10).replace(/-/g, '') : Date.now();
  const slug = (teamId ?? 'team').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  return `fixture_${d}_${slug}`;
}

/**
 * Create a new Fixture entity.
 *
 * @param {object} data — fixture input data
 * @returns {Fixture}
 */
export function createFixture(data) {
  const id = data.id ?? generateFixtureId(data.teamId, data.kickoff);
  const now = new Date().toISOString();

  return {
    id,
    version:    1,

    // ── Core identity ──────────────────────────────────────────────────────
    teamId:     data.teamId      ?? null,
    teamName:   data.teamName    ?? 'Unknown Team',
    ageGroup:   data.ageGroup    ?? null,
    opponent:   data.opponent    ?? 'TBC',
    venue:      data.venue       ?? 'TBC',
    isHome:     data.isHome      ?? true,
    competition: data.competition ?? COMPETITION_TYPES.LEAGUE,
    kickoff:    data.kickoff     ?? null,   // ISO timestamp
    referee:    data.referee     ?? null,

    // ── Status ─────────────────────────────────────────────────────────────
    status:     FIXTURE_STATUS.SCHEDULED,
    prepStage:  PREP_STAGE.EARLY,

    // ── Squad ──────────────────────────────────────────────────────────────
    squadStatus: {
      selected:    [],     // { id, name, position, confirmed }
      unavailable: [],     // { id, name, reason }
      injured:     [],     // { id, name, injury, expectedReturn }
      uncertain:   [],     // { id, name, reason }
      available:   [],     // { id, name, position }
    },
    squadLockedAt: null,

    // ── Medical ────────────────────────────────────────────────────────────
    medicalAlerts: [],     // { playerId, name, alert, severity }

    // ── Player milestones ──────────────────────────────────────────────────
    playerMilestones: [],  // { playerId, name, milestone, current, target }

    // ── Previous meetings ──────────────────────────────────────────────────
    previousMeetings: data.previousMeetings ?? [],  // { date, result, score, competition }

    // ── Volunteers ─────────────────────────────────────────────────────────
    volunteers: {
      required:  data.volunteers?.required  ?? defaultVolunteerRoles(),
      confirmed: [],
      missing:   [],
    },

    // ── Transport ─────────────────────────────────────────────────────────
    transport: {
      required:  data.isHome === false,
      arranged:  false,
      details:   null,
      departureTime: null,
    },

    // ── Weather (placeholder — future Weather API) ─────────────────────────
    weather: {
      _placeholder: true,
      forecast:  null,
      conditions: null,
      temperature: null,
      windSpeed:  null,
    },

    // ── Preparation ────────────────────────────────────────────────────────
    preparationChecklist: [],  // { id, dueAt, stage, task, status, assignee }
    matchPack:            null,

    // ── Result ─────────────────────────────────────────────────────────────
    result: {
      status:      null,        // RESULT_STATUS
      homeScore:   null,
      awayScore:   null,
      teamScore:   null,
      opponentScore: null,
      scorers:     [],
      yellowCards: [],
      redCards:    [],
      manOfMatch:  null,
      coachNotes:  null,
      attendance:  null,
    },

    // ── Post-match ─────────────────────────────────────────────────────────
    postMatchReview:      null,
    playerReports:        [],   // { playerId, name, rating, notes }
    twinUpdateApplied:    false,

    // ── Meta ───────────────────────────────────────────────────────────────
    notes:        data.notes    ?? null,
    tags:         data.tags     ?? [],
    createdAt:    now,
    updatedAt:    now,
  };
}

// ── Volunteer role defaults ───────────────────────────────────────────────────

function defaultVolunteerRoles() {
  return [
    { role: 'First Aider',       filled: false, assignee: null },
    { role: 'Team Manager',      filled: false, assignee: null },
    { role: 'Photographer',      filled: false, assignee: null },
    { role: 'Linesman',          filled: false, assignee: null },
    { role: 'Timekeeper',        filled: false, assignee: null },
  ];
}

// ── Days to kickoff ───────────────────────────────────────────────────────────

export function daysToKickoff(fixture) {
  if (!fixture.kickoff) return null;
  const now    = Date.now();
  const ko     = new Date(fixture.kickoff).getTime();
  return Math.round((ko - now) / 86400_000);
}

export function derivePrepStage(fixture) {
  const days = daysToKickoff(fixture);
  if (days === null) return PREP_STAGE.EARLY;
  if (days < 0)   return PREP_STAGE.POST;
  if (days === 0) return PREP_STAGE.MATCHDAY;
  if (days <= 2)  return PREP_STAGE.FINAL;
  if (days <= 6)  return PREP_STAGE.MID;
  return PREP_STAGE.EARLY;
}

// ── Result helpers ────────────────────────────────────────────────────────────

export function computeResultStatus(fixture) {
  const { teamScore, opponentScore } = fixture.result ?? {};
  if (teamScore === null || opponentScore === null) return null;
  if (teamScore > opponentScore) return RESULT_STATUS.WIN;
  if (teamScore < opponentScore) return RESULT_STATUS.LOSS;
  return RESULT_STATUS.DRAW;
}

export function formatScore(fixture) {
  const r = fixture.result;
  if (r?.teamScore === null || r?.opponentScore === null) return 'TBC';
  const home = fixture.isHome;
  return home
    ? `${r.teamScore} – ${r.opponentScore}`
    : `${r.opponentScore} – ${r.teamScore}`;
}

// ── Fixture serialiser (safe for API responses) ───────────────────────────────

export function serializeFixture(fixture) {
  return {
    ...fixture,
    daysToKickoff: daysToKickoff(fixture),
    prepStage:     derivePrepStage(fixture),
    scoreDisplay:  fixture.status === FIXTURE_STATUS.COMPLETED ? formatScore(fixture) : null,
  };
}
