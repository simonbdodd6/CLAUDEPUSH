/**
 * Club Model
 *
 * The primary aggregation layer for the Club Digital Twin.
 * Reads from every existing engine and produces one canonical Club object.
 * Never stores — always computes on demand.
 *
 * Consumers should call buildClubModel() and cache the result if needed.
 */

// ── Lazy engine imports (graceful — Digital Twin works if individual engines fail) ──

async function _intel()    { try { return await import('../qa/club-intelligence/index.js'); }   catch { return null; } }
async function _knowledge(){ try { return await import('../knowledge-engine/index.js'); }        catch { return null; } }
async function _dashboard(){ try { return await import('../dashboard/index.js'); }               catch { return null; } }
async function _workflow() { try { return await import('../workflow-engine/index.js'); }          catch { return null; } }
async function _memory()   { try { return await import('../memory-engine/index.js'); }            catch { return null; } }
async function _comms()    { try { return await import('../communications-engine/index.js'); }    catch { return null; } }
async function _history()  { try { return await import('../actions/action-history.js'); }         catch { return null; } }

// ── Identity defaults (overridable per club) ──────────────────────────────────

export const CLUB_IDENTITY_DEFAULTS = {
  name:     'My Rugby Club',
  sport:    'Rugby Union',
  country:  'Ireland',
  timezone: 'Europe/Dublin',
  logo:     null,
  colours:  { primary: '#003087', secondary: '#FFFFFF' },
};

// ── Main aggregator ───────────────────────────────────────────────────────────

/**
 * Build the full Club Digital Twin model.
 *
 * @param {object} options
 * @param {object} [options.identity]     — override identity fields
 * @param {boolean} [options.includeRaw]  — include raw engine output in _sources
 * @returns {ClubModel}
 */
export async function buildClubModel(options = {}) {
  const start = Date.now();

  // Run all engine calls in parallel — graceful if any fails
  const [intelMod, dashMod, workflowMod, histMod] = await Promise.all([
    _intel(), _dashboard(), _workflow(), _history(),
  ]);

  const [intelReport, pendingApprovals, workflowHistory, actionStats] = await Promise.all([
    intelMod   ? safeCall(() => intelMod.generateClubReport())       : null,
    dashMod    ? safeCall(() => dashMod.getPending())                 : [],
    workflowMod? safeCall(() => workflowMod.getRecentHistory(20))    : [],
    histMod    ? safeCall(() => histMod.historyStats())              : null,
  ]);

  // Extract sub-objects from the club intelligence report
  const profile         = intelReport?.profile          ?? null;
  const healthData      = intelReport?.health           ?? null;
  const insights        = intelReport?.insights         ?? null;
  const recommendations = intelReport?.recommendations  ?? null;

  const identity = buildIdentity(options.identity, profile);

  const model = {
    identity,
    membership:     buildMembership(profile),
    teams:          buildTeams(profile),
    players:        buildPlayers(profile),
    coaches:        buildCoaches(profile),
    volunteers:     buildVolunteers(profile),
    sponsors:       buildSponsors(profile),
    communications: buildCommunications(profile, pendingApprovals),
    committee:      buildCommittee(pendingApprovals, profile),
    finance:        buildFinance(profile),
    facilities:     buildFacilities(profile),
    health:         healthData ?? { score: null, grade: 'N/A', trend: 'unknown', dimensions: [] },
    insights:       (insights?.insights ?? []).slice(0, 10),
    recommendations:(recommendations?.thisWeekPriorities ?? []).slice(0, 8),
    actionActivity: buildActionActivity(actionStats, workflowHistory),
    lastUpdated:    new Date().toISOString(),
    buildTimeMs:    Date.now() - start,
    dataCompleteness: 0, // filled in below
  };

  model.dataCompleteness = computeDataCompleteness(model);

  if (options.includeRaw) {
    model._sources = { intelReport, pendingApprovals, workflowHistory, actionStats };
  }

  return model;
}

// ── Section builders ──────────────────────────────────────────────────────────

function buildIdentity(override = {}, profile = null) {
  const clubData = profile?.club ?? {};
  return {
    ...CLUB_IDENTITY_DEFAULTS,
    name:     clubData.name     ?? CLUB_IDENTITY_DEFAULTS.name,
    sport:    clubData.sport    ?? CLUB_IDENTITY_DEFAULTS.sport,
    country:  clubData.country  ?? CLUB_IDENTITY_DEFAULTS.country,
    timezone: clubData.timezone ?? CLUB_IDENTITY_DEFAULTS.timezone,
    ...override,
  };
}

function buildMembership(profile) {
  if (!profile) return { active: 0, new: 0, former: 0, trend: 'unknown', retentionRate: null };
  const summary = profile.summary ?? {};
  const players = profile.players ?? [];
  const active  = summary.totalPlayers ?? players.length ?? 0;

  // Derive retention proxy from low-attendance players
  const atRisk  = players.filter(p => (p.attendanceRate ?? 100) < 60).length;
  const retention = active > 0 ? Math.round(((active - atRisk) / active) * 100) : null;

  // Trend from CI health
  const trend = profile.health?.trend ?? 'stable';

  return {
    active,
    new:          null, // requires external membership system
    former:       null, // requires external membership system
    trend:        trend === 'improving' ? 'growing' : trend === 'declining' ? 'shrinking' : 'stable',
    retentionRate: retention,
    atRiskCount:  atRisk,
    source:       'memory-engine',
  };
}

function buildTeams(profile) {
  if (!profile) return [];
  return (profile.teams ?? []).map(t => ({
    id:             t.id,
    name:           t.name,
    ageGroup:       t.ageGroup,
    playerCount:    t.playerCount ?? 0,
    healthScore:    t.healthScore ?? null,
    healthGrade:    t.healthGrade ?? null,
    avgAttendance:  t.avgAttendanceRate != null ? `${t.avgAttendanceRate}%` : null,
    activeInjuries: t.activeInjuryCount ?? 0,
    highRiskCount:  t.highRiskPlayerCount ?? 0,
    avgDevelopment: t.avgDevelopmentScore ?? null,
    fixtures:       [],    // placeholder — Fixture Engine (future)
    results:        [],    // placeholder — Fixture Engine (future)
    leaguePosition: null,  // placeholder — Fixture Engine (future)
  }));
}

function buildPlayers(profile) {
  if (!profile) return { active: [], injured: [], atRisk: [], available: [], development: {} };
  const all     = profile.players ?? [];
  const injured = all.filter(p => p.activeInjury);
  const atRisk  = all.filter(p => p.retentionRisk === 'high' || (p.injuryRiskScore ?? 0) >= 60);
  const available = all.filter(p => !p.activeInjury);

  const devGroups = { improving: 0, stable: 0, declining: 0, noData: 0 };
  for (const p of all) {
    const t = p.developmentTrend ?? 'noData';
    if (t === 'improving')  devGroups.improving++;
    else if (t === 'stable')   devGroups.stable++;
    else if (t === 'declining')devGroups.declining++;
    else                       devGroups.noData++;
  }

  return {
    activeCount:    all.length,
    injuredCount:   injured.length,
    availableCount: available.length,
    atRiskCount:    atRisk.length,
    injured:        injured.map(p => ({ id: p.id, name: p.name, ageGroup: p.ageGroup, injuries: p.injuryTypes })),
    atRisk:         atRisk.map(p => ({ id: p.id, name: p.name, retentionRisk: p.retentionRisk, injuryRisk: p.injuryRiskScore })),
    development:    devGroups,
    availabilityRate: all.length > 0 ? Math.round((available.length / all.length) * 100) : null,
    source:         'memory-engine + player-development-engine',
  };
}

function buildCoaches(profile) {
  if (!profile) return { activeCount: 0, coaches: [], workload: null };
  const coaches = profile.coaches ?? [];
  const summary = profile.summary ?? {};

  return {
    activeCount:      summary.totalCoaches ?? coaches.length,
    coaches:          coaches.map(c => ({
      id:            c.id,
      name:          c.name,
      qualifications: c.qualifications ?? [],
      sessionsDelivered: c.sessionCount ?? 0,
      ageGroups:     c.ageGroups ?? [],
    })),
    playerRatio:      summary.coachPlayerRatio ?? null,
    sessionsDelivered: coaches.reduce((sum, c) => sum + (c.sessionCount ?? 0), 0),
    source:           'memory-engine',
  };
}

function buildVolunteers(profile) {
  if (!profile) return { active: 0, missingRoles: [], recruitmentNeeds: 'unknown' };
  const volunteers = profile.volunteers ?? {};
  return {
    active:           volunteers.activeCount ?? 0,
    coveragePercent:  volunteers.coveragePercent ?? null,
    missingRoles:     volunteers.missingRoles   ?? [],
    recruitmentNeeds: (volunteers.missingRoles ?? []).length > 0 ? 'critical' : 'none',
    source:           'data-integration',
  };
}

function buildSponsors(profile) {
  if (!profile) return { active: 0, renewalDates: [], health: 'unknown' };
  const sponsors = profile.sponsors ?? {};
  const upcoming = (sponsors.upcoming ?? []).filter(s => {
    const days = s.daysUntilRenewal ?? 999;
    return days <= 90;
  });
  return {
    active:          sponsors.activeCount ?? 0,
    totalValue:      sponsors.totalValue  ?? null,
    upcomingRenewals: upcoming.map(s => ({ name: s.name, daysUntilRenewal: s.daysUntilRenewal, value: s.value })),
    health:          upcoming.length > 0 ? (upcoming.some(s => (s.daysUntilRenewal ?? 999) <= 30) ? 'at-risk' : 'review-needed') : 'healthy',
    source:          'data-integration',
  };
}

function buildCommunications(profile, pending = []) {
  const comms   = profile?.communications ?? {};
  const drafted = pending.filter(a => a.type === 'comms_draft' || a.type === 'newsletter');
  const approvals = pending.filter(a => a.type?.startsWith('comms'));
  return {
    pendingDrafts:    drafted.length,
    pendingApprovals: approvals.length,
    engagementScore:  comms.engagementScore   ?? null,
    openRate:         comms.emailOpenRate      ?? null,
    sentThisMonth:    comms.sentThisMonth      ?? 0,
    scheduledCount:   comms.scheduledCount     ?? 0,
    source:           'communications-engine + approval-centre',
  };
}

function buildCommittee(pending = [], profile) {
  const risks = profile?.committee?.risks ?? profile?.risks ?? [];
  return {
    pendingApprovals:  pending.length,
    criticalDecisions: pending.filter(a => a.priority === 'high' || a.priority === 'critical').length,
    riskItems:         risks.slice(0, 10).map(r => ({ title: r.title ?? r.type, severity: r.severity ?? 'medium' })),
    source:            'approval-centre + workflow-engine',
  };
}

function buildFinance(_profile) {
  // Placeholder — Finance Engine is a future module
  return {
    _placeholder: true,
    revenue:          null,
    membershipIncome: null,
    sponsorshipIncome: null,
    expenses:         null,
    cashPosition:     null,
    note:             'Finance Engine: planned for next development phase',
  };
}

function buildFacilities(_profile) {
  // Placeholder — Facilities Engine is a future module
  return {
    _placeholder: true,
    trainingVenues: [],
    matchVenues:    [],
    equipmentStatus: 'unknown',
    note:            'Facilities Engine: planned for next development phase',
  };
}

function buildActionActivity(stats, workflowHistory) {
  return {
    totalActionsRun:    stats?.total          ?? 0,
    successRate:        stats?.total > 0 ? Math.round(((stats?.successes ?? 0) / stats.total) * 100) : null,
    avgDurationMs:      stats?.avgDurationMs  ?? null,
    mostUsedAction:     stats?.byAction ? Object.entries(stats.byAction).sort((a,b)=>b[1]-a[1])[0]?.[0] : null,
    recentWorkflows:    (workflowHistory ?? []).slice(0, 5),
    source:             'action-library + workflow-engine',
  };
}

// ── Data completeness ─────────────────────────────────────────────────────────

function computeDataCompleteness(model) {
  const checks = [
    model.identity.name   !== CLUB_IDENTITY_DEFAULTS.name,
    model.membership.active > 0,
    model.teams.length    > 0,
    model.players.activeCount > 0,
    model.coaches.activeCount > 0,
    model.health.score    !== null,
    model.insights.length > 0,
    model.recommendations.length > 0,
    model.committee.pendingApprovals !== undefined,
    model.actionActivity.totalActionsRun > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

// ── Utility ───────────────────────────────────────────────────────────────────

async function safeCall(fn) {
  try { return await fn(); } catch { return null; }
}

// ── Quick accessors ───────────────────────────────────────────────────────────

export async function getClub(options = {}) {
  return buildClubModel(options);
}

export async function getClubIdentity() {
  const intel = await _intel();
  if (!intel) return CLUB_IDENTITY_DEFAULTS;
  const profile = await safeCall(() => intel.getClubProfile());
  return buildIdentity({}, profile);
}

export async function getClubSummary() {
  const model = await buildClubModel();
  return {
    name:            model.identity.name,
    healthScore:     model.health.score,
    healthGrade:     model.health.grade,
    trend:           model.health.trend,
    players:         model.players.activeCount,
    injured:         model.players.injuredCount,
    teams:           model.teams.length,
    coaches:         model.coaches.activeCount,
    pendingApprovals: model.committee.pendingApprovals,
    dataCompleteness: model.dataCompleteness,
    lastUpdated:     model.lastUpdated,
  };
}
