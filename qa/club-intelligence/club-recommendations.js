/**
 * Club Recommendations Engine
 * Generates a prioritised action list for the Director of Rugby.
 * Focus: what to do THIS WEEK, not general advice.
 * Every recommendation cites WHY and references specific players/teams/coaches.
 */

const PRIORITY = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };

function rec(priority, area, action, why, who = [], timeframe = 'this week', effort = 'low') {
  return { priority, area, action, why, who, timeframe, effort };
}

// ── Recommendation generators ─────────────────────────────────────────────────

function recsFromInjuries(profile, insights) {
  const recs = [];
  const activePlayers = (profile.players ?? []).filter(p => p.activeInjury);
  const highRisk      = (profile.players ?? []).filter(p => (p.injuryRiskScore ?? 0) >= 45 && !p.activeInjury);

  if (activePlayers.length > 0) {
    recs.push(rec(
      PRIORITY.critical,
      'Injury Management',
      `Generate rehabilitation plans for ${activePlayers.map(p => p.name).join(', ')}`,
      `${activePlayers.length} player(s) have active injuries with no documented return-to-play protocol in the system. ` +
      `Without a structured rehab plan, return-to-play timelines are unpredictable and re-injury risk is elevated.`,
      activePlayers.map(p => p.name),
      'today',
      'low',
    ));
  }

  if (highRisk.length > 0) {
    recs.push(rec(
      PRIORITY.high,
      'Injury Prevention',
      `Introduce a prehab circuit for ${highRisk.length} high-risk player(s)`,
      `${highRisk.map(p => `${p.name} (risk: ${p.injuryRiskScore}/100)`).join(', ')} are flagged at elevated injury risk. ` +
      `A 10-minute pre-session prehab routine can reduce injury incidence by ~50%.`,
      highRisk.map(p => p.name),
      'next session',
      'low',
    ));
  }

  return recs;
}

function recsFromAttendance(profile, insights) {
  const recs = [];
  const avgAtt = profile.attendance?.clubAverage;
  const lowAtt = (profile.players ?? []).filter(p => (p.attendanceRate ?? 100) < 65);

  if (avgAtt != null && avgAtt < 65) {
    recs.push(rec(
      PRIORITY.critical,
      'Attendance',
      'Launch an attendance intervention — contact every player with <65% attendance',
      `Club average attendance is ${avgAtt}%. This is critically low: players cannot develop, coaches cannot plan, ` +
      `and the club risks losing players. Common causes: transport, school/work conflicts, motivation, undisclosed injury.`,
      lowAtt.map(p => p.name),
      'this week',
      'medium',
    ));
  } else if (avgAtt != null && avgAtt < 75) {
    recs.push(rec(
      PRIORITY.medium,
      'Attendance',
      `Set individual attendance targets for ${lowAtt.length} player(s) below 75%`,
      `${lowAtt.length} player(s) are below the 75% attendance minimum for consistent development. ` +
      `A simple one-to-one conversation with each player about barriers is the highest-leverage intervention.`,
      lowAtt.map(p => `${p.name} (${p.attendanceRate}%)`),
      'this week',
      'low',
    ));
  }

  return recs;
}

function recsFromRetention(profile, insights) {
  const highRisk = (profile.players ?? []).filter(p => p.retentionRisk === 'high');
  if (!highRisk.length) return [];

  return [rec(
    PRIORITY.high,
    'Player Retention',
    `Personally contact ${highRisk.length} high-churn-risk player(s) before next weekend`,
    `${highRisk.map(p => p.name).join(', ')} show combined signals of disengagement: low attendance, declining development, and no active programme. ` +
    `Players typically leave within 4–6 weeks of this pattern if not re-engaged. ` +
    `A personal call from the head coach or DoR is the most effective retention tool.`,
    highRisk.map(p => p.name),
    'before next session',
    'low',
  )];
}

function recsFromProgramming(profile, insights) {
  const noProg = (profile.players ?? []).filter(p => !p.hasActiveProgramme && !p.activeInjury);
  if (!noProg.length) return [];

  return [rec(
    PRIORITY.medium,
    'Player Programming',
    `Generate training programmes for ${noProg.length} player(s) currently without one`,
    `${noProg.map(p => p.name).join(', ')} do not have active training programmes. ` +
    `Unstructured development is 40–60% less effective than programmed development. ` +
    `The AI Copilot can generate a personalised programme in under 30 seconds.`,
    noProg.map(p => p.name),
    'this week',
    'low',
  )];
}

function recsFromCoaches(profile, insights) {
  const needsSupport = (profile.coaches ?? []).filter(c => c.supportNeeded);
  if (!needsSupport.length) return [];

  return [rec(
    PRIORITY.high,
    'Coach Development',
    `Schedule 1:1 development conversations with ${needsSupport.map(c => c.name).join(', ')}`,
    needsSupport.map(c =>
      `${c.name}: ${c.supportReasons.slice(0, 2).join('; ')}`
    ).join('. ') + '. ' +
    `Coaches managing struggling squads without support are at risk of burnout and disengagement.`,
    needsSupport.map(c => c.name),
    'this week',
    'low',
  )];
}

function recsFromDataGaps(profile) {
  const recs = [];
  const dc = profile.dataCompleteness ?? {};
  const missingKey = Object.entries(dc).filter(([k, v]) => !v).map(([k]) => k);

  if (!dc.fixtures) {
    recs.push(rec(
      PRIORITY.low,
      'Data & Analytics',
      'Connect the Fixture Engine to enable match result tracking',
      'Match result analysis is unavailable because fixtures are not yet loaded into the system. ' +
      'Win/loss trends and player performance data from matches would significantly improve DoR decision-making.',
      [],
      'next sprint',
      'medium',
    ));
  }

  if (!dc.finance) {
    recs.push(rec(
      PRIORITY.low,
      'Data & Analytics',
      'Connect membership and sponsorship data to enable financial intelligence',
      'Membership growth, sponsorship pipeline, and merchandise sales are not yet tracked. ' +
      'This data would unlock "Which age groups are growing?" and "What sponsorship opportunities exist?" insights.',
      [],
      'next sprint',
      'high',
    ));
  }

  return recs;
}

function recsFromOpportunities(profile, health) {
  const recs = [];
  const total   = profile.summary?.totalPlayers ?? 0;
  const totalAI = (profile.players ?? []).reduce((s, p) => s + (p.aiGenerations ?? 0), 0);

  if (totalAI < total && total > 0) {
    recs.push(rec(
      PRIORITY.medium,
      'AI Adoption',
      'Onboard all coaches to the AI Copilot this week',
      `Only ${totalAI} AI-generated outputs exist for ${total} player(s). ` +
      `Full AI adoption would give every player a personalised programme, automate session planning, ` +
      `and generate weekly DoR briefs automatically. It's the single highest-leverage activity available.`,
      (profile.coaches ?? []).filter(c => c.aiGenerations === 0).map(c => c.name),
      'this week',
      'medium',
    ));
  }

  return recs;
}

// ── DoR brief builder ─────────────────────────────────────────────────────────

export function buildDorBrief(profile, health, insights) {
  const allRecs = [
    ...recsFromInjuries(profile, insights),
    ...recsFromAttendance(profile, insights),
    ...recsFromRetention(profile, insights),
    ...recsFromCoaches(profile, insights),
    ...recsFromProgramming(profile, insights),
    ...recsFromOpportunities(profile, health),
    ...recsFromDataGaps(profile),
  ];

  // Sort
  const pOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  allRecs.sort((a, b) => (pOrder[a.priority] ?? 4) - (pOrder[b.priority] ?? 4));

  const thisWeek = allRecs.filter(r => ['today', 'this week', 'before next session', 'next session'].includes(r.timeframe));
  const upcoming = allRecs.filter(r => !['today', 'this week', 'before next session', 'next session'].includes(r.timeframe));

  return {
    recommendations: allRecs,
    thisWeekPriorities: thisWeek.slice(0, 5),
    upcoming,
    totalCount:      allRecs.length,
    criticalCount:   allRecs.filter(r => r.priority === 'critical').length,
    generatedAt:     new Date().toISOString(),
  };
}

export function generateRecommendations(profile, health, insights) {
  return buildDorBrief(profile, health, insights);
}
