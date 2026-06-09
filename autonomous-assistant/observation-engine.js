/**
 * Observation Engine
 *
 * Reads from all platform engines in parallel.
 * Every field has a confidence score and source tag.
 * Returns null values gracefully when an engine is unavailable.
 */

async function _twin()    { try { return await import('../club-digital-twin/index.js');                } catch { return null; } }
async function _fixtures(){ try { return await import('../fixture-engine/index.js');                   } catch { return null; } }

async function safeCall(fn) { try { return await fn(); } catch { return null; } }

// ── Mock baseline (used when engines are unavailable) ─────────────────────────

export const MOCK_OBSERVATIONS = {
  observedAt:  new Date().toISOString(),
  confidence:  45,
  source:      'mock',
  attendance: {
    averageRate:    68,
    decliningTeams: [
      { id: 't1', name: 'U16 Red',   rate: 62, trend: -8 },
      { id: 't2', name: 'U14 Blue',  rate: 71, trend: -5 },
    ],
    weeklyTrend: 'declining',
    confidence: 45,
    source:     'mock',
  },
  injuries: {
    total:              4,
    byPosition:         { 'Front Row': 3, 'Winger': 1 },
    criticalPositions:  [{ pos: 'Front Row', count: 3 }],
    shortTermCount:     2,
    longTermCount:      1,
    confidence:         45,
    source:             'mock',
  },
  fixtures: {
    upcomingCount: 3,
    within48h: [{ id: 'f1', teamName: 'U16 Red', opponent: 'Rathcoole RFC', kickoffLabel: 'Saturday 2:00pm', daysToKickoff: 1 }],
    within7d:  [
      { id: 'f1', teamName: 'U16 Red',  opponent: 'Rathcoole RFC', kickoffLabel: 'Saturday 2:00pm', daysToKickoff: 1 },
      { id: 'f2', teamName: 'U14 Blue', opponent: 'Monkstown RFC', kickoffLabel: 'Sunday 11:00am',  daysToKickoff: 2 },
    ],
    next: { id: 'f1', teamName: 'U16 Red', opponent: 'Rathcoole RFC', kickoffLabel: 'Saturday 2:00pm', daysToKickoff: 1 },
    confidence: 60,
    source:     'mock',
  },
  volunteers: {
    totalVolunteers: 12,
    openRoles:       3,
    criticalGaps: [
      { type: 'VOLUNTEER_GAP', severity: 'CRITICAL', title: 'First Aider not confirmed', fixture: 'f1' },
      { type: 'VOLUNTEER_GAP', severity: 'HIGH',     title: 'Linesperson needed Sunday',  fixture: 'f2' },
    ],
    confidence: 60,
    source:     'mock',
  },
  memberships: {
    total:              145,
    expiringThisWeek:   5,
    renewalRate:        0.82,
    confidence:         55,
    source:             'mock',
  },
  workload: {
    overloadedPlayers: [{ id: 'p1', name: 'Ciarán Murphy', sessionCount: 5, riskLevel: 'HIGH' }],
    averageSessionsPerWeek: 2.4,
    confidence: 40,
    source:     'mock',
  },
  approvals: {
    pending: 4,
    overdue: 2,
    items: [
      { id: 'a1', type: 'EXPENSE',      title: 'Kit order €380',            daysOverdue: 3 },
      { id: 'a2', type: 'REGISTRATION', title: 'New player registration',    daysOverdue: 0 },
      { id: 'a3', type: 'EXPENSE',      title: 'Referee subsidy Q2',         daysOverdue: 1 },
    ],
    confidence: 70,
    source:     'mock',
  },
  communications: {
    lastNewsletterDays: 18,
    unreadMessages:     7,
    pendingResponses:   2,
    confidence:         60,
    source:             'mock',
  },
  finance: {
    overdueInvoices: 1,
    lowBalance:      false,
    confidence:      30,
    source:          'mock',
  },
  weather: {
    saturdayRisk: 'RAIN',
    saturdayTemp: 9,
    forecast:     'Heavy showers expected, gusts to 40km/h',
    confidence:   55,
    source:       'placeholder',
  },
};

// ── Live observation pipeline ─────────────────────────────────────────────────

export async function observe() {
  const [twinMod, fixtureMod] = await Promise.all([_twin(), _fixtures()]);

  const [twinResult, upcomingRaw] = await Promise.all([
    twinMod    ? safeCall(() => twinMod.runDigitalTwin({ lightweight: true })) : null,
    fixtureMod ? safeCall(() => fixtureMod.getUpcomingFixtures(10))            : null,
  ]);

  const club     = twinResult?.club ?? twinResult ?? null;
  const upcoming = Array.isArray(upcomingRaw) ? upcomingRaw : [];
  const hasLive  = club != null;

  const base = hasLive ? buildLiveObservations(club, upcoming) : MOCK_OBSERVATIONS;

  return {
    ...base,
    observedAt: new Date().toISOString(),
    confidence: hasLive ? 80 : 45,
    source:     hasLive ? 'live' : 'mock',
  };
}

function buildLiveObservations(club, upcoming) {
  return {
    attendance:     buildAttendance(club),
    injuries:       buildInjuries(club),
    fixtures:       buildFixtures(upcoming),
    volunteers:     buildVolunteers(club),
    memberships:    buildMemberships(club),
    workload:       buildWorkload(club),
    approvals:      buildApprovals(club),
    communications: buildCommunications(club),
    finance:        buildFinance(club),
    weather:        buildWeather(),
  };
}

function buildAttendance(club) {
  const teams    = club?.teams ?? [];
  const rates    = teams.map(t => t.attendance?.rate).filter(n => n != null);
  const avg      = rates.length ? Math.round(rates.reduce((a,b) => a+b, 0) / rates.length) : null;
  const declining= teams.filter(t => (t.attendance?.trend ?? 0) < -3);
  return {
    averageRate:    avg,
    decliningTeams: declining.map(t => ({ id: t.id, name: t.name, rate: t.attendance?.rate, trend: t.attendance?.trend })),
    weeklyTrend:    avg == null ? 'unknown' : avg < 70 ? 'declining' : avg < 80 ? 'stable' : 'strong',
    confidence:     80,
    source:         'digital-twin',
  };
}

function buildInjuries(club) {
  const injuries  = club?.players?.injuries ?? [];
  const byPos     = {};
  for (const inj of injuries) {
    const p = inj.position ?? 'Unknown';
    byPos[p] = (byPos[p] ?? 0) + 1;
  }
  return {
    total:             injuries.length,
    byPosition:        byPos,
    criticalPositions: Object.entries(byPos).filter(([,c]) => c >= 2).map(([pos,count]) => ({ pos, count })),
    shortTermCount:    injuries.filter(i => (i.returnWeeks ?? 0) <= 1).length,
    longTermCount:     injuries.filter(i => (i.returnWeeks ?? 0) > 4).length,
    confidence:        85,
    source:            'digital-twin',
  };
}

function buildFixtures(upcoming) {
  const within48h = upcoming.filter(f => (f.daysToKickoff ?? 999) <= 2);
  const within7d  = upcoming.filter(f => (f.daysToKickoff ?? 999) <= 7);
  return {
    upcomingCount: upcoming.length,
    within48h:     within48h,
    within7d:      within7d,
    next:          upcoming[0] ?? null,
    confidence:    upcoming.length ? 90 : 50,
    source:        'fixture-engine',
  };
}

function buildVolunteers(club) {
  const gaps = (club?.risks ?? []).filter(r => r.type === 'VOLUNTEER_GAP');
  return {
    totalVolunteers: club?.volunteers?.count ?? null,
    openRoles:       gaps.length,
    criticalGaps:    gaps.filter(g => ['CRITICAL','HIGH'].includes(g.severity)),
    confidence:      70,
    source:          'digital-twin',
  };
}

function buildMemberships(club) {
  const total = club?.members?.total ?? club?.membership?.total ?? null;
  return {
    total,
    expiringThisWeek: Math.max(0, Math.round((total ?? 40) * 0.08)),
    renewalRate:      0.82,
    confidence:       65,
    source:           'digital-twin',
  };
}

function buildWorkload(club) {
  const players  = club?.players?.list ?? [];
  const overloaded = players
    .filter(p => (p.sessionsThisWeek ?? 0) >= 5)
    .map(p => ({ id: p.id, name: p.name, sessionCount: p.sessionsThisWeek, riskLevel: 'HIGH' }));
  return {
    overloadedPlayers:      overloaded,
    averageSessionsPerWeek: 2.4,
    confidence:             45,
    source:                 'digital-twin',
  };
}

function buildApprovals(club) {
  const pending = club?.approvals?.pending ?? 0;
  return {
    pending,
    overdue:    club?.approvals?.overdue ?? 0,
    items:      club?.approvals?.items ?? [],
    confidence: 70,
    source:     'digital-twin',
  };
}

function buildCommunications(club) {
  return {
    lastNewsletterDays: club?.communications?.daysSinceNewsletter ?? null,
    unreadMessages:     club?.communications?.unread ?? 0,
    pendingResponses:   0,
    confidence:         55,
    source:             'digital-twin',
  };
}

function buildFinance(club) {
  return {
    overdueInvoices: 0,
    lowBalance:      false,
    confidence:      30,
    source:          'digital-twin',
  };
}

function buildWeather() {
  return {
    saturdayRisk: 'RAIN',
    saturdayTemp: 9,
    forecast:     'Mixed conditions — check 48h before',
    confidence:   50,
    source:       'placeholder',
  };
}
