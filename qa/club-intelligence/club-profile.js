/**
 * Club Profile
 * Aggregates data from every engine into a single living club snapshot.
 * Never stores — always reads from source engines on demand.
 *
 * Sources:
 *   Memory Engine     — players, teams, coaches, programmes, sessions, attendance
 *   Player Dev Engine — development scores, injury risk, promotion readiness
 *   Discovery Engine  — recruitment leads (when available)
 *   Market Intel      — club sector context (when available)
 *
 * Future hooks (stubs included):
 *   Fixture Engine    — match schedule + results
 *   Finance Engine    — sponsorship, membership fees
 *   Volunteer Engine  — volunteer activity
 *   Communication     — email/push open rates
 */

// ── Engine imports (lazy, graceful) ──────────────────────────────────────────

let _mem = null, _dev = null;

async function mem() {
  if (!_mem) { try { _mem = await import('../../memory-engine/index.js'); } catch { _mem = null; } }
  return _mem;
}
async function dev() {
  if (!_dev) { try { _dev = await import('../player-development/index.js'); } catch { _dev = null; } }
  return _dev;
}

// ── Player enrichment ─────────────────────────────────────────────────────────

async function enrichPlayer(player) {
  const d = await dev();
  let devAnalysis = null;

  if (d) {
    try {
      devAnalysis = await d.analysePlayer(player, { memoryOff: true });
    } catch { /* skip */ }
  }

  const core       = player.core ?? {};
  const attRate    = player.attendance?.rate ?? null;
  const injuries   = player.injuries ?? [];
  const activeInj  = injuries.filter(i => i.status === 'active');
  const devScore   = devAnalysis?.developmentSummary?.score ?? null;
  const devTrend   = devAnalysis?.developmentSummary?.trend ?? 'insufficient-data';
  const injRisk    = devAnalysis?.analyses?.injuryRisk?.score ?? null;
  const programmes = player.programmes ?? [];
  const hasActive  = programmes.some(p => typeof p === 'object' ? p.status === 'active' : false);

  // Retention risk — scored 0 (low) to 6 (high)
  let retentionPoints = 0;
  if (attRate != null && attRate < 0.60) retentionPoints += 3;
  else if (attRate != null && attRate < 0.75) retentionPoints += 1;
  if (devTrend === 'declining')       retentionPoints += 2;
  if (!hasActive && programmes.length === 0) retentionPoints += 2;
  if ((player.aiGenerations ?? 0) === 0) retentionPoints += 1;

  const retentionRisk = retentionPoints >= 4 ? 'high' : retentionPoints >= 2 ? 'medium' : 'low';

  return {
    id:              player.id,
    name:            core.name,
    ageGroup:        core.ageGroup,
    position:        core.position,
    experience:      core.experience,
    age:             core.age,
    teamId:          core.teamId ?? null,
    clubName:        core.club,
    attendanceRate:  attRate != null ? Math.round(attRate * 100) : null,
    activeInjury:    activeInj.length > 0,
    injuryTypes:     activeInj.map(i => i.type),
    injuryRiskScore: injRisk,
    developmentScore: devScore,
    developmentGrade: devAnalysis?.developmentSummary?.grade ?? null,
    developmentTrend: devTrend,
    retentionRisk,
    programmeCount:  programmes.length,
    hasActiveProgramme: hasActive,
    topRecommendation: devAnalysis?.recommendations?.[0]?.action ?? null,
    aiGenerations:   player.aiGenerations ?? 0,
    lastUpdated:     player.lastUpdated,
    _raw:            player,
    _devAnalysis:    devAnalysis,
  };
}

// ── Team profile ──────────────────────────────────────────────────────────────

function buildTeamProfile(team, enrichedPlayers) {
  const core      = team.core ?? {};
  const teamPlayers = enrichedPlayers.filter(p => p.ageGroup === core.ageGroup);
  const devScores   = teamPlayers.map(p => p.developmentScore).filter(s => s != null);
  const attRates    = teamPlayers.map(p => p.attendanceRate).filter(r => r != null);
  const activeInj   = teamPlayers.filter(p => p.activeInjury).length;
  const highRisk    = teamPlayers.filter(p => (p.injuryRiskScore ?? 0) >= 45).length;

  const avgDev = devScores.length
    ? Math.round(devScores.reduce((a, b) => a + b, 0) / devScores.length)
    : null;
  const avgAtt = attRates.length
    ? Math.round(attRates.reduce((a, b) => a + b, 0) / attRates.length)
    : null;

  const improvingCount  = teamPlayers.filter(p => p.developmentTrend === 'improving').length;
  const decliningCount  = teamPlayers.filter(p => p.developmentTrend === 'declining').length;
  const trend =
    improvingCount > decliningCount ? 'improving' :
    decliningCount > improvingCount ? 'declining' : 'stable';

  return {
    id:                team.id,
    name:              core.name ?? `${core.ageGroup} Team`,
    ageGroup:          core.ageGroup,
    level:             core.level,
    playerCount:       teamPlayers.length,
    coachIds:          core.coachIds ?? [],
    avgDevelopmentScore: avgDev,
    avgAttendance:     avgAtt,
    activeInjuries:    activeInj,
    highInjuryRisk:    highRisk,
    programmingActive: teamPlayers.filter(p => p.hasActiveProgramme).length,
    trend,
    improvingCount,
    decliningCount,
    retentionRisk:     teamPlayers.filter(p => p.retentionRisk === 'high').length,
    sessions:          team.sessions ?? [],
    sessionCount:      (team.sessions ?? []).length,
    _players:          teamPlayers,
  };
}

// ── Coach profile ─────────────────────────────────────────────────────────────

function buildCoachProfile(coach, enrichedPlayers, teams) {
  const core      = coach.core ?? {};
  const ageGroups = core.ageGroupsFocus ?? [];
  const coachTeams = teams.filter(t => ageGroups.includes(t.ageGroup));
  const coachPlayers = enrichedPlayers.filter(p => ageGroups.includes(p.ageGroup));

  const decliningPlayers = coachPlayers.filter(p => p.developmentTrend === 'declining').length;
  const injuredPlayers   = coachPlayers.filter(p => p.activeInjury).length;
  const lowAttendance    = coachPlayers.filter(p => (p.attendanceRate ?? 100) < 70).length;
  const noActiveProg     = coachPlayers.filter(p => !p.hasActiveProgramme).length;

  let supportScore = 0;
  if (decliningPlayers > 0)              supportScore += decliningPlayers * 2;
  if (injuredPlayers > 1)                supportScore += injuredPlayers;
  if (lowAttendance > coachPlayers.length * 0.3) supportScore += 3;
  if (noActiveProg > coachPlayers.length * 0.5)  supportScore += 2;
  if ((coach.aiGenerations ?? 0) === 0)  supportScore += 2;

  return {
    id:               coach.id,
    name:             core.name,
    club:             core.club,
    qualifications:   core.qualifications ?? [],
    ageGroupsFocus:   ageGroups,
    philosophy:       core.philosophy,
    teamCount:        coachTeams.length,
    playerCount:      coachPlayers.length,
    aiGenerations:    coach.aiGenerations ?? 0,
    decliningPlayers,
    injuredPlayers,
    lowAttendancePlayers: lowAttendance,
    noActiveProgrammePlayers: noActiveProg,
    supportNeeded:    supportScore >= 4,
    supportScore,
    supportReasons:   [
      decliningPlayers > 0 ? `${decliningPlayers} player(s) with declining development` : null,
      injuredPlayers > 1   ? `${injuredPlayers} injured players in squad` : null,
      lowAttendance > 0    ? `${lowAttendance} player(s) with low attendance (<70%)` : null,
      noActiveProg > coachPlayers.length * 0.5 ? `${noActiveProg} player(s) without active programme` : null,
      (coach.aiGenerations ?? 0) === 0 ? 'No AI tools used yet — onboarding recommended' : null,
    ].filter(Boolean),
    lastUpdated:      coach.lastUpdated,
  };
}

// ── Stub loaders (future engine hooks) ───────────────────────────────────────

function loadStubFixtures() {
  // Future: connect to Fixture Engine
  return { upcoming: [], recent: [], wins: 0, losses: 0, draws: 0, _stub: true };
}

function loadStubFinance() {
  // Future: connect to Finance/Membership Engine
  return {
    membershipCount:  null,
    membershipTarget: null,
    sponsorCount:     null,
    sponsorValue:     null,
    merchandiseSales: null,
    _stub: true,
  };
}

function loadStubVolunteers() {
  // Future: connect to Volunteer Engine
  return { totalVolunteers: null, activeThisMonth: null, topVolunteers: [], _stub: true };
}

function loadStubCommunication() {
  // Future: connect to Communication Engine (email/push metrics)
  return { pushNotificationsSent: null, openRate: null, lastBroadcast: null, _stub: true };
}

// ── Main builder ──────────────────────────────────────────────────────────────

export async function buildClubProfile(options = {}) {
  const startTime = Date.now();
  const m = await mem();

  // Load raw entities
  const rawPlayers = m ? (m.getAllPlayers() ?? []) : [];
  const rawTeams   = m ? (m.getAllTeams()   ?? []) : [];
  const rawCoaches = m ? (await loadCoaches(m)) : [];

  // Enrich players (runs development analysis for each)
  const enrichedPlayers = await Promise.all(rawPlayers.map(enrichPlayer));

  // Build team profiles
  const teams   = rawTeams.map(t => buildTeamProfile(t, enrichedPlayers));
  const coaches = rawCoaches.map(c => buildCoachProfile(c, enrichedPlayers, teams));

  // Attendance aggregates
  const attRates = enrichedPlayers.map(p => p.attendanceRate).filter(r => r != null);
  const clubAvgAtt = attRates.length
    ? Math.round(attRates.reduce((a, b) => a + b, 0) / attRates.length)
    : null;

  // Development aggregates
  const devScores = enrichedPlayers.map(p => p.developmentScore).filter(s => s != null);
  const avgDevScore = devScores.length
    ? Math.round(devScores.reduce((a, b) => a + b, 0) / devScores.length)
    : null;

  // Injury aggregates
  const activeInjuries   = enrichedPlayers.filter(p => p.activeInjury).length;
  const highRiskPlayers  = enrichedPlayers.filter(p => (p.injuryRiskScore ?? 0) >= 45).length;

  // Training aggregates
  const activeProgrammes = enrichedPlayers.filter(p => p.hasActiveProgramme).length;

  // Player retention
  const retentionHigh   = enrichedPlayers.filter(p => p.retentionRisk === 'high').length;
  const retentionMedium = enrichedPlayers.filter(p => p.retentionRisk === 'medium').length;

  // Age group breakdown
  const ageGroupMap = {};
  for (const p of enrichedPlayers) {
    const ag = p.ageGroup ?? 'Unknown';
    if (!ageGroupMap[ag]) ageGroupMap[ag] = { count: 0, avgDev: null, avgAtt: null, players: [] };
    ageGroupMap[ag].players.push(p);
    ageGroupMap[ag].count++;
  }
  for (const ag of Object.keys(ageGroupMap)) {
    const group = ageGroupMap[ag];
    const devs  = group.players.map(p => p.developmentScore).filter(s => s != null);
    const atts  = group.players.map(p => p.attendanceRate).filter(r => r != null);
    group.avgDev = devs.length ? Math.round(devs.reduce((a,b)=>a+b,0)/devs.length) : null;
    group.avgAtt = atts.length ? Math.round(atts.reduce((a,b)=>a+b,0)/atts.length) : null;
    delete group.players;  // don't duplicate
  }

  // Detect club name
  const clubName = enrichedPlayers[0]?.clubName
    ?? rawCoaches[0]?.core?.club
    ?? 'Club';

  return {
    generatedAt:  new Date().toISOString(),
    buildTimeMs:  Date.now() - startTime,
    club: {
      name:     clubName,
      ground:   null,
      founded:  null,
    },
    summary: {
      totalPlayers:     enrichedPlayers.length,
      totalTeams:       teams.length,
      totalCoaches:     coaches.length,
      avgDevelopmentScore: avgDevScore,
      avgAttendance:    clubAvgAtt,
      activeInjuries,
      highInjuryRiskPlayers: highRiskPlayers,
      activeProgrammes,
      retentionHighRisk: retentionHigh,
      retentionMediumRisk: retentionMedium,
    },
    players:   enrichedPlayers,
    teams,
    coaches,
    ageGroups: ageGroupMap,
    attendance: {
      clubAverage: clubAvgAtt,
      byAgeGroup:  Object.fromEntries(
        Object.entries(ageGroupMap).map(([ag, data]) => [ag, data.avgAtt])
      ),
      trend:       clubAvgAtt != null && clubAvgAtt >= 75 ? 'healthy' : clubAvgAtt != null ? 'needs-attention' : 'unknown',
    },
    injuries: {
      active:             activeInjuries,
      highRiskCount:      highRiskPlayers,
      byPosition:         countByPosition(enrichedPlayers.filter(p => p.activeInjury)),
    },
    training: {
      activeProgrammes,
      avgCompliance:      null,  // future: from programme completion tracking
    },
    development: {
      avgScore:   avgDevScore,
      improving:  enrichedPlayers.filter(p => p.developmentTrend === 'improving').length,
      declining:  enrichedPlayers.filter(p => p.developmentTrend === 'declining').length,
      stable:     enrichedPlayers.filter(p => p.developmentTrend === 'stable').length,
    },
    retention: {
      highRisk:   retentionHigh,
      mediumRisk: retentionMedium,
      lowRisk:    enrichedPlayers.filter(p => p.retentionRisk === 'low').length,
    },
    fixtures:       loadStubFixtures(),
    finance:        loadStubFinance(),
    volunteers:     loadStubVolunteers(),
    communication:  loadStubCommunication(),
    dataCompleteness: {
      players:   enrichedPlayers.length > 0,
      teams:     teams.length > 0,
      coaches:   coaches.length > 0,
      fixtures:  false,
      finance:   false,
      volunteers: false,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadCoaches(m) {
  try {
    const { listEntities } = await import('../../memory-engine/memory-store.js');
    return listEntities('coach') ?? [];
  } catch {
    return [];
  }
}

function countByPosition(players) {
  const counts = {};
  for (const p of players) {
    const pos = p.position ?? 'Unknown';
    counts[pos] = (counts[pos] ?? 0) + 1;
  }
  return counts;
}
