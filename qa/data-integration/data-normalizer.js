/**
 * Data Normalizer
 *
 * Converts raw records from any adapter (CSV, JSON, API, Memory Engine)
 * into a canonical shape that every AI engine understands.
 *
 * Each normalizer returns the same structure regardless of source format.
 * New sources just need a new normalizer mapping — no engine changes needed.
 */

// ── Canonical shapes ──────────────────────────────────────────────────────────

export const CANONICAL_SHAPES = {
  player: {
    id: null, name: null, position: null, ageGroup: null, age: null,
    active: true, jerseyNumber: null, experience: null,
    phone: null, email: null,
    attendanceRate: null, developmentScore: null,
    activeInjuries: [], activeProgramme: null,
    _source: null, _isMock: false,
  },
  team: {
    id: null, name: null, ageGroup: null, season: null,
    headCoachId: null, playerCount: 0,
    winRate: null, avgAttendance: null,
    _source: null, _isMock: false,
  },
  coach: {
    id: null, name: null, role: null, ageGroups: [],
    qualifications: [], yearsExperience: null,
    email: null, phone: null,
    _source: null, _isMock: false,
  },
  session: {
    id: null, date: null, ageGroup: null, focus: null,
    durationMinutes: null, attendanceCount: null, attendanceRate: null,
    coachId: null, notes: null,
    _source: null, _isMock: false,
  },
  attendance: {
    id: null, sessionId: null, playerId: null, playerName: null,
    date: null, attended: null, reason: null,
    _source: null, _isMock: false,
  },
  injury: {
    id: null, playerId: null, playerName: null,
    type: null, severity: null, status: null,
    dateReported: null, expectedReturn: null, clearedDate: null,
    notes: null,
    _source: null, _isMock: false,
  },
  fixture: {
    id: null, date: null, homeTeam: null, awayTeam: null,
    venue: null, competition: null, ageGroup: null,
    result: null, homeScore: null, awayScore: null,
    _source: null, _isMock: false,
  },
  membership: {
    id: null, playerId: null, playerName: null,
    membershipType: null, status: null,
    validFrom: null, validUntil: null, paidAmount: null,
    _source: null, _isMock: false,
  },
  financial: {
    id: null, date: null, category: null,
    description: null, amount: null, currency: 'EUR',
    transactionType: null, source: null,
    _source: null, _isMock: false,
  },
};

// ── Normalizers ───────────────────────────────────────────────────────────────

export function normalizePlayer(raw, sourceName = 'unknown') {
  if (!raw) return null;
  const base = { ...CANONICAL_SHAPES.player };
  return {
    ...base,
    id:               raw.id ?? raw.playerId ?? null,
    name:             raw.name ?? raw.core?.name ?? [raw.firstName, raw.lastName].filter(Boolean).join(' ') || null,
    position:         raw.position ?? raw.core?.position ?? null,
    ageGroup:         raw.ageGroup ?? raw.core?.ageGroup ?? raw.age_group ?? null,
    age:              raw.age ?? raw.core?.age ?? null,
    active:           raw.active ?? raw.core?.active ?? true,
    jerseyNumber:     raw.jerseyNumber ?? raw.core?.jerseyNumber ?? null,
    experience:       raw.experience ?? raw.core?.experience ?? null,
    phone:            raw.phone ?? raw.core?.phone ?? null,
    email:            raw.email ?? raw.core?.email ?? null,
    attendanceRate:   raw.attendanceRate ?? extractAttendance(raw) ?? null,
    developmentScore: raw.developmentScore ?? null,
    activeInjuries:   raw.injuries?.filter(i => i.status === 'active') ?? [],
    activeProgramme:  raw.activeProgramme ?? extractActiveProgramme(raw) ?? null,
    _source:          sourceName,
    _isMock:          raw._isMock ?? true,
  };
}

export function normalizeTeam(raw, sourceName = 'unknown') {
  if (!raw) return null;
  return {
    ...CANONICAL_SHAPES.team,
    id:           raw.id ?? raw.teamId ?? null,
    name:         raw.name ?? raw.teamName ?? null,
    ageGroup:     raw.ageGroup ?? raw.age_group ?? null,
    season:       raw.season ?? null,
    headCoachId:  raw.headCoachId ?? raw.coachId ?? null,
    playerCount:  raw.playerCount ?? raw.players?.length ?? 0,
    winRate:      raw.winRate ?? null,
    avgAttendance: raw.avgAttendance ?? null,
    _source:      sourceName,
    _isMock:      raw._isMock ?? true,
  };
}

export function normalizeSession(raw, sourceName = 'unknown') {
  if (!raw) return null;
  return {
    ...CANONICAL_SHAPES.session,
    id:              raw.id ?? raw.sessionId ?? null,
    date:            raw.date ?? null,
    ageGroup:        raw.ageGroup ?? null,
    focus:           raw.focus ?? null,
    durationMinutes: raw.durationMinutes ?? raw.duration ?? null,
    attendanceCount: raw.attendanceCount ?? null,
    attendanceRate:  raw.attendanceRate ?? null,
    coachId:         raw.coachId ?? null,
    notes:           raw.notes ?? null,
    _source:         sourceName,
    _isMock:         raw._isMock ?? true,
  };
}

export function normalizeInjury(raw, sourceName = 'unknown') {
  if (!raw) return null;
  return {
    ...CANONICAL_SHAPES.injury,
    id:             raw.id ?? null,
    playerId:       raw.playerId ?? null,
    playerName:     raw.playerName ?? null,
    type:           raw.type ?? raw.injuryType ?? null,
    severity:       raw.severity ?? null,
    status:         raw.status ?? 'unknown',
    dateReported:   raw.dateReported ?? raw.date ?? null,
    expectedReturn: raw.expectedReturn ?? null,
    clearedDate:    raw.clearedDate ?? null,
    notes:          raw.notes ?? null,
    _source:        sourceName,
    _isMock:        raw._isMock ?? true,
  };
}

export function normalizeFixture(raw, sourceName = 'unknown') {
  if (!raw) return null;
  return {
    ...CANONICAL_SHAPES.fixture,
    id:          raw.id ?? null,
    date:        raw.date ?? null,
    homeTeam:    raw.homeTeam ?? raw.home ?? null,
    awayTeam:    raw.awayTeam ?? raw.away ?? null,
    venue:       raw.venue ?? null,
    competition: raw.competition ?? null,
    ageGroup:    raw.ageGroup ?? null,
    result:      raw.result ?? null,
    homeScore:   raw.homeScore ?? null,
    awayScore:   raw.awayScore ?? null,
    _source:     sourceName,
    _isMock:     raw._isMock ?? true,
  };
}

export function normalizeAttendance(raw, sourceName = 'unknown') {
  if (!raw) return null;
  return {
    ...CANONICAL_SHAPES.attendance,
    id:          raw.id ?? null,
    sessionId:   raw.sessionId ?? null,
    playerId:    raw.playerId ?? null,
    playerName:  raw.playerName ?? null,
    date:        raw.date ?? null,
    attended:    raw.attended ?? null,
    reason:      raw.reason ?? null,
    _source:     sourceName,
    _isMock:     raw._isMock ?? true,
  };
}

export function normalizeMembership(raw, sourceName = 'unknown') {
  if (!raw) return null;
  return {
    ...CANONICAL_SHAPES.membership,
    id:             raw.id ?? null,
    playerId:       raw.playerId ?? null,
    playerName:     raw.playerName ?? null,
    membershipType: raw.membershipType ?? raw.type ?? null,
    status:         raw.status ?? null,
    validFrom:      raw.validFrom ?? null,
    validUntil:     raw.validUntil ?? null,
    paidAmount:     raw.paidAmount ?? raw.amount ?? null,
    _source:        sourceName,
    _isMock:        raw._isMock ?? true,
  };
}

export function normalizeFinancial(raw, sourceName = 'unknown') {
  if (!raw) return null;
  return {
    ...CANONICAL_SHAPES.financial,
    id:              raw.id ?? null,
    date:            raw.date ?? null,
    category:        raw.category ?? null,
    description:     raw.description ?? null,
    amount:          raw.amount ?? null,
    currency:        raw.currency ?? 'EUR',
    transactionType: raw.transactionType ?? raw.type ?? null,
    source:          raw.source ?? null,
    _source:         sourceName,
    _isMock:         raw._isMock ?? true,
  };
}

/**
 * Generic passthrough normalizer for types without a specific normalizer.
 */
export function normalizeGeneric(raw, sourceName = 'unknown') {
  if (!raw) return null;
  return { ...raw, _source: sourceName, _isMock: raw._isMock ?? true };
}

/**
 * Normalize an array of records using the appropriate normalizer.
 */
export function normalizeRecords(records, sourceType, sourceName) {
  const normalizers = {
    player:     normalizePlayer,
    team:       normalizeTeam,
    coaching:   normalizeGeneric,
    attendance: normalizeAttendance,
    injury:     normalizeInjury,
    session:    normalizeSession,
    fixture:    normalizeFixture,
    membership: normalizeMembership,
    financial:  normalizeFinancial,
  };
  const fn = normalizers[sourceType] ?? normalizeGeneric;
  return records.map(r => fn(r, sourceName)).filter(Boolean);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractAttendance(raw) {
  if (raw.attendance?.rate != null)   return raw.attendance.rate;
  if (raw.attendancePercent != null)  return raw.attendancePercent;
  if (raw.stats?.attendanceRate != null) return raw.stats.attendanceRate;
  return null;
}

function extractActiveProgramme(raw) {
  const progs = raw.programmes ?? [];
  return progs.find(p => p.status === 'active') ?? null;
}
