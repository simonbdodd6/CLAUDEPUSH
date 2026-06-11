// Knowledge Answer Engine — the main ask() interface.
// Dispatches to intent handlers, produces structured evidence-backed answers.

import { parseQuery, INTENTS } from './knowledge-query.js';
import { search, keywordSearch } from './knowledge-search.js';
import { getIndex, buildIndex, DOMAINS } from './knowledge-index.js';
import { cite, citeMany, dedupeCitations, formatCitations } from './knowledge-citations.js';
import { rankResults } from './knowledge-ranking.js';
import { get as cacheGet, set as cacheSet } from './knowledge-cache.js';
import { logQuery } from './knowledge-history.js';

// Lazy engine imports for direct engine access in some handlers
let _ci = null, _mem = null, _di = null, _gt = null;
async function ci()  { if (!_ci)  { try { _ci  = await import('../qa/club-intelligence/index.js'); } catch { _ci  = null; } } return _ci;  }
async function mem() { if (!_mem) { try { _mem = await import('../memory-engine/index.js');         } catch { _mem = null; } } return _mem; }
async function di()  { if (!_di)  { try { _di  = await import('../qa/data-integration/index.js');  } catch { _di  = null; } } return _di;  }
async function gt()  { if (!_gt)  { try { _gt  = await import('./graph-traversal.js');              } catch { _gt  = null; } } return _gt;  }

// ── Public API ─────────────────────────────────────────────────────────────────

export async function ask(question, options = {}) {
  const { role = 'coach', useCache = true, refreshIndex = false } = options;
  const start = Date.now();

  if (!question?.trim()) return _emptyAnswer('Empty query');

  // Cache check
  const cacheKey = `${question}|${role}`;
  if (useCache) {
    const cached = cacheGet(cacheKey);
    if (cached) {
      logQuery({ query: question, intent: cached.intent, domain: cached.domain, resultCount: cached.count, confidence: cached.confidence, durationMs: 0, cached: true });
      return { ...cached, cached: true };
    }
  }

  // Ensure index is built
  if (refreshIndex) await buildIndex();
  else { const idx = await getIndex(); if (!idx.size) await buildIndex(); }

  // Parse query
  const parsedQuery = parseQuery(question);

  // Dispatch to intent handler
  let result;
  try {
    result = await _dispatch(parsedQuery, role);
  } catch (err) {
    result = { ..._emptyAnswer(`Handler error: ${err.message}`), intent: parsedQuery.intent, domain: parsedQuery.domain };
  }

  const final = {
    ...result,
    question,
    intent:     parsedQuery.intent,
    domain:     parsedQuery.domain,
    parsedQuery,
    timing:     { durationMs: Date.now() - start },
    cached:     false,
  };

  // Cache and log
  if (useCache && (final.count > 0 || final.data?.length > 0)) cacheSet(cacheKey, final);
  logQuery({ query: question, intent: parsedQuery.intent, domain: parsedQuery.domain, resultCount: final.count ?? 0, confidence: final.confidence ?? 0, durationMs: final.timing.durationMs });

  return final;
}

// ── Intent dispatcher ──────────────────────────────────────────────────────────

async function _dispatch(q, role) {
  switch (q.intent) {
    case INTENTS.INJURY_REPORT:      return _handleInjuryReport(q);
    case INTENTS.ATTENDANCE_WORST:   return _handleAttendanceWorst(q);
    case INTENTS.ATTENDANCE_COMPARE: return _handleAttendanceCompare(q);
    case INTENTS.ATTENDANCE_REPORT:  return _handleAttendanceReport(q);
    case INTENTS.SPONSOR_EXPIRY:     return _handleSponsorExpiry(q);
    case INTENTS.SPONSOR_REPORT:     return _handleSponsorReport(q);
    case INTENTS.COACH_SUMMARY:      return _handleCoachSummary(q);
    case INTENTS.HEALTH_SUMMARY:     return _handleHealthSummary(q);
    case INTENTS.VOLUNTEER_INACTIVE: return _handleVolunteerInactive(q);
    case INTENTS.VOLUNTEER_REPORT:   return _handleVolunteerReport(q);
    case INTENTS.PLAYER_FIND:        return _handlePlayerFind(q);
    case INTENTS.TEAM_REPORT:        return _handleTeamReport(q);
    case INTENTS.MEMBERSHIP_REPORT:  return _handleMembershipReport(q);
    case INTENTS.FIXTURE_UPCOMING:   return _handleFixtureUpcoming(q);
    case INTENTS.MATCH_HISTORY:      return _handleMatchHistory(q);
    case INTENTS.TRAINING_REPORT:    return _handleTrainingReport(q);
    case INTENTS.COMMS_PENDING:      return _handleCommsPending(q);
    case INTENTS.GRAPH_COACHING:     return _handleGraphCoaching(q);
    case INTENTS.GRAPH_DOCS:         return _handleGraphDocs(q);
    case INTENTS.GRAPH_PLAYER:       return _handleGraphPlayer(q);
    default:                         return _handleGeneral(q, role);
  }
}

// ── Intent handlers ────────────────────────────────────────────────────────────

async function _handleInjuryReport(q) {
  const medIdx = await getIndex(DOMAINS.MEDICAL);
  let injuries = medIdx?.entries ?? [];

  // Filter: active injuries only
  injuries = injuries.filter(e =>
    e.data?.status === 'active' || e.tags?.includes('injured') || !e.data?.clearedDate
  );

  // Position filter
  if (q.filters.positions?.length) {
    injuries = injuries.filter(e => {
      const pos = (e.data?.position ?? e.data?.core?.position ?? '').toLowerCase();
      return q.filters.positions.some(p => pos.includes(p) || e.tags?.includes(p));
    });
  }

  const citations = citeMany('memory-engine', injuries.map(e => `${e.name}: ${e.data?.type ?? 'injury'}`));

  const posLabel = q.filters.positions?.join('/') ?? null;
  const count    = injuries.length;

  return {
    answer:     count === 0
      ? `No injured players${posLabel ? ` (${posLabel}s)` : ''} found.`
      : `${count} injured player${count === 1 ? '' : 's'}${posLabel ? ` (${posLabel}s)` : ''}: ${injuries.slice(0, 5).map(e => e.name).join(', ')}${count > 5 ? '...' : ''}.`,
    summary:    _injurySummary(injuries),
    data:       injuries.map(e => ({
      name:        e.name,
      playerId:    e.data?.playerId ?? e.id,
      injuryType:  e.data?.type ?? 'unknown',
      status:      e.data?.status ?? 'active',
      bodyPart:    e.data?.bodyPart ?? null,
      position:    e.data?.position ?? null,
      injuryDate:  e.data?.injuryDate ?? null,
    })),
    count,
    confidence:  injuries.length > 0 ? 85 : 70,
    citations:   dedupeCitations(citations),
  };
}

async function _handleAttendanceWorst(q) {
  const plIdx = await getIndex(DOMAINS.PLAYERS);
  let players = (plIdx?.entries ?? [])
    .filter(e => e.data?.attendance || e.data?.core?.attendance);

  // Sort by sessions missed (highest first)
  players = players.slice().sort((a, b) => {
    const attA = a.data?.attendance ?? a.data?.core?.attendance ?? {};
    const attB = b.data?.attendance ?? b.data?.core?.attendance ?? {};
    const missA = (attA.totalSessions ?? 0) - (attA.attended ?? 0);
    const missB = (attB.totalSessions ?? 0) - (attB.attended ?? 0);
    return missB - missA;
  });

  const top = players.slice(0, q.limit ?? 10);
  const citations = citeMany('memory-engine', top.map(e => {
    const att = e.data?.attendance ?? e.data?.core?.attendance ?? {};
    return `${e.name}: ${att.attended ?? 0}/${att.totalSessions ?? 0} sessions (${att.rate ? Math.round(att.rate * 100) : '?'}%)`;
  }));

  return {
    answer:  top.length === 0
      ? 'No attendance data found. Connect the Memory Engine to track training sessions.'
      : `Top ${top.length} players by missed training: ${top.slice(0, 3).map(e => e.name).join(', ')}`,
    summary: _attendanceSummary(top),
    data:    top.map(e => {
      const att = e.data?.attendance ?? e.data?.core?.attendance ?? {};
      return {
        name:          e.name ?? e.id,
        playerId:      e.id,
        sessionsTotal: att.totalSessions ?? 0,
        attended:      att.attended ?? 0,
        missed:        (att.totalSessions ?? 0) - (att.attended ?? 0),
        rate:          att.rate ? `${Math.round(att.rate * 100)}%` : '—',
      };
    }),
    count:      top.length,
    confidence: top.length > 0 ? 90 : 50,
    citations:  dedupeCitations(citations),
  };
}

async function _handleAttendanceCompare(q) {
  const attIdx = await getIndex(DOMAINS.ATTENDANCE);
  const sessions = attIdx?.entries ?? [];
  const now = Date.now();
  const seasonStart = now - 300 * 86400000;
  const prevSeasonStart = seasonStart - 365 * 86400000;

  const thisSeason = sessions.filter(e => {
    const d = new Date(e.data?.date ?? '').getTime();
    return d >= seasonStart && d <= now;
  });
  const prevSeason = sessions.filter(e => {
    const d = new Date(e.data?.date ?? '').getTime();
    return d >= prevSeasonStart && d < seasonStart;
  });

  const avgThis = _avgRate(thisSeason);
  const avgPrev = _avgRate(prevSeason);
  const change  = avgThis !== null && avgPrev !== null ? avgThis - avgPrev : null;

  const citations = [
    cite('data-integration', `This season: ${thisSeason.length} sessions`),
    cite('data-integration', `Previous season: ${prevSeason.length} sessions`),
  ];

  return {
    answer:  avgThis === null
      ? 'Insufficient attendance data for comparison. Log more sessions to enable this analysis.'
      : `This season: ${avgThis}% avg attendance (${thisSeason.length} sessions). Previous: ${avgPrev ?? 'N/A'}%${change !== null ? `. Change: ${change >= 0 ? '+' : ''}${change}%` : ''}.`,
    summary: `Attendance comparison across ${thisSeason.length + prevSeason.length} sessions.`,
    data: {
      thisSeason:  { sessions: thisSeason.length, avgRate: avgThis },
      prevSeason:  { sessions: prevSeason.length, avgRate: avgPrev },
      change,
    },
    count:      2,
    confidence: thisSeason.length > 5 ? 80 : 40,
    citations:  dedupeCitations(citations),
  };
}

async function _handleAttendanceReport(q) {
  const attIdx = await getIndex(DOMAINS.ATTENDANCE);
  const sessions = attIdx?.entries ?? [];

  const total = sessions.length;
  const avg   = _avgRate(sessions);
  const recent = sessions.slice(-5);

  const citations = citeMany('data-integration', recent.map(e => {
    const r = e.data?.attendanceRate ?? e.data?.rate;
    return `${e.name}: ${r ? `${Math.round(r * 100)}%` : '?'}`;
  }));

  return {
    answer:  total === 0 ? 'No attendance records found.' : `${total} sessions recorded. Average attendance: ${avg ?? '?'}%.`,
    summary: `${total} sessions · Avg attendance: ${avg ?? '?'}% · Recent: ${recent.length} sessions`,
    data:    sessions.slice(-20).map(e => ({
      session: e.name, date: e.data?.date ?? null, attendanceRate: e.data?.attendanceRate ?? e.data?.rate ?? null,
    })),
    count:      total,
    confidence: total > 0 ? 85 : 50,
    citations:  dedupeCitations(citations),
  };
}

async function _handleSponsorExpiry(q) {
  const spIdx  = await getIndex(DOMAINS.SPONSORS);
  const now    = Date.now();
  const period = q.timeRange?.days ?? 30;
  const cutoff = now + period * 86400000;

  let sponsors = (spIdx?.entries ?? []).filter(e => e.type === 'sponsor');

  // Filter by expiry
  const expiring = sponsors.filter(e => {
    const d = new Date(e.data?.validUntil ?? e.data?.expiresAt ?? e.data?.renewalDue ?? '').getTime();
    return !isNaN(d) && d >= now && d <= cutoff;
  });

  const citations = citeMany('communications-engine',
    expiring.map(e => `${e.name}: expires ${e.data?.validUntil ?? e.data?.expiresAt ?? '?'}`)
  );

  return {
    answer:  expiring.length === 0
      ? `No sponsors expiring in the next ${period} days. Check if sponsor data is connected.`
      : `${expiring.length} sponsor${expiring.length === 1 ? '' : 's'} expire${expiring.length === 1 ? 's' : ''} in the next ${period} days: ${expiring.map(e => e.name).join(', ')}.`,
    summary: `${sponsors.length} total sponsors · ${expiring.length} expiring in ${period} days`,
    data:    expiring.map(e => ({
      name:       e.name,
      tier:       e.data?.tier ?? '—',
      value:      e.data?.annualValue ?? e.data?.value ?? '—',
      expiresAt:  e.data?.validUntil ?? e.data?.expiresAt ?? '—',
      contact:    e.data?.contactName ?? e.data?.contact ?? '—',
    })),
    count:      expiring.length,
    confidence: expiring.length > 0 ? 90 : (sponsors.length > 0 ? 80 : 40),
    citations:  dedupeCitations(citations),
  };
}

async function _handleSponsorReport(q) {
  const spIdx = await getIndex(DOMAINS.SPONSORS);
  const all   = spIdx?.entries ?? [];
  const sponsors = all.filter(e => e.type === 'sponsor');
  const summary  = all.find(e => e.type === 'summary')?.data ?? null;

  const citations = citeMany('communications-engine', sponsors.map(e => `${e.name} (${e.data?.tier ?? 'sponsor'})`));

  return {
    answer:  sponsors.length === 0
      ? (summary ? `${summary.total ?? 0} sponsors on record. No individual sponsor data available.` : 'No sponsor data found.')
      : `${sponsors.length} active sponsor${sponsors.length === 1 ? '' : 's'}`,
    summary: summary ? `Total sponsors: ${summary.total ?? '?'} · Total value: €${summary.totalValue ?? '?'}` : `${sponsors.length} sponsors`,
    data:    sponsors.map(e => ({ name: e.name, tier: e.data?.tier, status: e.data?.status, value: e.data?.annualValue ?? e.data?.value })),
    count:   sponsors.length,
    confidence: sponsors.length > 0 ? 85 : 50,
    citations: dedupeCitations(citations),
  };
}

async function _handleCoachSummary(q) {
  const teamIdx = await getIndex(DOMAINS.TEAMS);
  let teams = teamIdx?.entries ?? [];

  // Filter by age group if mentioned
  if (q.filters.ageGroups?.length) {
    teams = teams.filter(t => {
      const ag = t.data?.ageGroup ?? t.name ?? '';
      return q.filters.ageGroups.some(a => ag.toLowerCase().includes(a.toLowerCase()));
    });
  }

  const m = await mem();
  const data = teams.map(t => {
    const td = t.data ?? {};
    const coachName  = td.headCoach ?? td.coach ?? 'Unknown';
    const players    = td.players ?? [];
    const avgDev     = td.avgDevelopmentScore ?? null;
    const trend      = td.trend ?? 'stable';
    const citations  = [cite('memory-engine', `Team ${t.name}: coach ${coachName}, ${players.length} players, dev ${avgDev ?? '?'}/100`)];

    return {
      team:            t.name,
      ageGroup:        td.ageGroup,
      coach:           coachName,
      playerCount:     players.length,
      avgDevelopment:  avgDev,
      trend,
      citations,
    };
  });

  const allCitations = data.flatMap(d => d.citations);

  return {
    answer:  data.length === 0
      ? 'No team/coach data found. Connect the Memory Engine to track coaching history.'
      : data.map(d => `${d.coach} (${d.team}): ${d.playerCount} players · dev ${d.avgDevelopment ?? '?'}/100 · trend ${d.trend}`).join('; '),
    summary: `${teams.length} team${teams.length === 1 ? '' : 's'} found · ${data.map(d => d.coach).filter(Boolean).join(', ')}`,
    data,
    count:      data.length,
    confidence: data.length > 0 ? 80 : 50,
    citations:  dedupeCitations(allCitations),
  };
}

async function _handleHealthSummary(q) {
  const c = await ci();
  if (!c) {
    return {
      answer:  'Club Intelligence Engine not available.',
      summary: 'Connect the Club Intelligence Engine to enable health summaries.',
      data:    null, count: 0, confidence: 0,
      citations: [],
    };
  }

  const health  = await c.getClubHealth().catch(() => null);
  const insights = await c.getInsights().catch(() => ({ insights: [] }));
  const recs     = await c.getRecommendations().catch(() => ({ recommendations: [] }));

  const score = health?.overallScore ?? health?.score;
  const grade = health?.overallGrade ?? health?.grade;

  const topInsights = (insights.insights ?? []).slice(0, 3).map(i => i.title ?? i.description ?? '—');
  const topRecs     = (recs.recommendations ?? []).slice(0, 3).map(r => r.action ?? r.title ?? r.text ?? '—');

  const citations = [
    cite('club-intelligence', `Health score: ${score ?? '?'}/100 (${grade ?? '?'})`),
    cite('club-intelligence', `Trend: ${health?.trend ?? 'unknown'}`),
    ...citeMany('club-intelligence', topInsights),
  ];

  return {
    answer:  score ? `Club health: ${score}/100 (Grade ${grade}). Trend: ${health.trend}. ${insights.insights?.length ?? 0} insights, ${recs.recommendations?.length ?? 0} recommendations.` : 'Club health data unavailable.',
    summary: [
      score ? `Score: ${score}/100 (${grade}) · Trend: ${health.trend}` : 'Score: unavailable',
      topInsights.length ? `Top insights: ${topInsights.join('; ')}` : '',
      topRecs.length ? `Top actions: ${topRecs.join('; ')}` : '',
    ].filter(Boolean).join('\n'),
    data: {
      score, grade,
      trend:       health?.trend,
      breakdown:   health?.categories ?? {},
      topInsights,
      topRecommendations: topRecs,
      totalInsights: insights.insights?.length ?? 0,
      totalRecs:     recs.recommendations?.length ?? 0,
    },
    count:      1,
    confidence: score ? 85 : 30,
    citations:  dedupeCitations(citations),
  };
}

async function _handleVolunteerInactive(q) {
  const volIdx = await getIndex(DOMAINS.VOLUNTEERS);
  let volunteers = (volIdx?.entries ?? []).filter(e => e.type === 'volunteer');

  // Sort by lastActive asc (longest inactive first)
  volunteers = volunteers.slice().sort((a, b) => {
    const ta = new Date(a.data?.lastActive ?? a.data?.lastHelped ?? '1970-01-01').getTime();
    const tb = new Date(b.data?.lastActive ?? b.data?.lastHelped ?? '1970-01-01').getTime();
    return ta - tb;
  });

  const threshold = 90 * 86400000; // 90 days
  const inactive  = volunteers.filter(v => {
    const lastMs = new Date(v.data?.lastActive ?? v.data?.lastHelped ?? '1970-01-01').getTime();
    return Date.now() - lastMs > threshold;
  });

  const citations = citeMany('communications-engine', inactive.map(v => `${v.name}: last active ${v.data?.lastActive ?? 'never'}`));

  return {
    answer:  inactive.length === 0
      ? volunteers.length === 0
        ? 'No volunteer data found. Connect volunteer tracking to enable this query.'
        : 'All volunteers have been active recently.'
      : `${inactive.length} volunteer${inactive.length === 1 ? '' : 's'} haven't helped in 90+ days: ${inactive.slice(0, 3).map(v => v.name).join(', ')}${inactive.length > 3 ? '...' : ''}.`,
    summary: `${volunteers.length} total · ${inactive.length} inactive 90+ days`,
    data:    inactive.map(v => ({
      name:      v.name,
      role:      v.data?.role ?? '—',
      lastActive: v.data?.lastActive ?? v.data?.lastHelped ?? 'never',
      totalEvents: v.data?.totalEvents ?? v.data?.eventsHelped ?? 0,
    })),
    count:      inactive.length,
    confidence: volunteers.length > 0 ? 85 : 40,
    citations:  dedupeCitations(citations),
  };
}

async function _handleVolunteerReport(q) {
  const volIdx = await getIndex(DOMAINS.VOLUNTEERS);
  const all    = volIdx?.entries ?? [];
  const volunteers = all.filter(e => e.type === 'volunteer');
  const summary    = all.find(e => e.type === 'summary')?.data ?? null;

  return {
    answer:  volunteers.length === 0
      ? summary ? `${summary.total ?? 0} volunteers on record.` : 'No volunteer data found.'
      : `${volunteers.length} volunteer${volunteers.length === 1 ? '' : 's'} on record.`,
    summary: summary ? `Total: ${summary.total} · By role: ${JSON.stringify(summary.byRole ?? {})}` : `${volunteers.length} volunteers`,
    data:    volunteers.map(v => ({ name: v.name, role: v.data?.role, lastActive: v.data?.lastActive, eventsHelped: v.data?.eventsHelped })),
    count:   volunteers.length,
    confidence: volunteers.length > 0 ? 80 : 40,
    citations: citeMany('communications-engine', volunteers.map(v => v.name)),
  };
}

async function _handlePlayerFind(q) {
  const searchResult = await search(q);
  const players = searchResult.results;

  const citations = citeMany('memory-engine', players.map(p => {
    const c = p.data?.core ?? p.data ?? {};
    return `${p.name}: ${c.position ?? '—'}, ${c.status ?? 'active'}`;
  }));

  return {
    answer:  players.length === 0 ? 'No players found matching your criteria.' : `Found ${players.length} player${players.length === 1 ? '' : 's'}.`,
    summary: `${players.length} players · ${q.filters.positions?.join('/') ?? 'all positions'} · ${q.filters.ageGroups?.join('/') ?? 'all ages'}`,
    data:    players.map(p => {
      const c = p.data?.core ?? p.data ?? {};
      return { name: p.name, playerId: p.id, position: c.position, ageGroup: c.ageGroup, status: c.status };
    }),
    count:      players.length,
    confidence: players.length > 0 ? 85 : 60,
    citations:  dedupeCitations(citations),
  };
}

async function _handleTeamReport(q) {
  const teamIdx = await getIndex(DOMAINS.TEAMS);
  let teams = teamIdx?.entries ?? [];

  if (q.filters.ageGroups?.length) {
    teams = teams.filter(t => {
      const ag = t.data?.ageGroup ?? t.name ?? '';
      return q.filters.ageGroups.some(a => ag.toLowerCase().includes(a.toLowerCase()));
    });
  }

  const citations = citeMany('memory-engine', teams.map(t => `${t.name}: ${t.data?.players?.length ?? 0} players`));

  return {
    answer:  teams.length === 0 ? 'No team data found.' : `${teams.length} team${teams.length === 1 ? '' : 's'} found.`,
    summary: teams.map(t => `${t.name}: ${t.data?.players?.length ?? 0} players, coach: ${t.data?.headCoach ?? 'TBC'}`).join(' · '),
    data:    teams.map(t => ({
      name:        t.name,
      ageGroup:    t.data?.ageGroup,
      playerCount: t.data?.players?.length ?? 0,
      coach:       t.data?.headCoach ?? t.data?.coach ?? '—',
      division:    t.data?.division ?? '—',
      trend:       t.data?.trend ?? 'stable',
    })),
    count:   teams.length,
    confidence: teams.length > 0 ? 85 : 40,
    citations: dedupeCitations(citations),
  };
}

async function _handleMembershipReport(q) {
  const memIdx = await getIndex(DOMAINS.MEMBERSHIP);
  const all    = memIdx?.entries ?? [];
  const members = all.filter(e => e.type === 'membership');
  const summary = all.find(e => e.type === 'summary')?.data;

  const byStatus = {};
  members.forEach(m => { byStatus[m.data?.status ?? 'unknown'] = (byStatus[m.data?.status ?? 'unknown'] ?? 0) + 1; });

  const citations = [
    cite('communications-engine', `Total members: ${summary?.total ?? members.length}`),
    cite('communications-engine', `Active: ${summary?.active ?? byStatus.active ?? 0}`),
    cite('communications-engine', `Pending: ${summary?.pending ?? byStatus.pending ?? 0}`),
    cite('communications-engine', `Lapsed: ${summary?.lapsed ?? byStatus.lapsed ?? 0}`),
  ];

  return {
    answer:  `Membership status: ${(summary?.active ?? byStatus.active ?? 0)} active, ${(summary?.pending ?? byStatus.pending ?? 0)} pending, ${(summary?.lapsed ?? byStatus.lapsed ?? 0)} lapsed.`,
    summary: `Total: ${summary?.total ?? members.length} members`,
    data:    { byStatus, summary: summary ?? null, members: members.slice(0, 20).map(m => ({ name: m.name, status: m.data?.status, type: m.data?.membershipType })) },
    count:   members.length || 1,
    confidence: (summary || members.length > 0) ? 85 : 40,
    citations: dedupeCitations(citations),
  };
}

async function _handleFixtureUpcoming(q) {
  const fixIdx = await getIndex(DOMAINS.FIXTURES);
  const now    = Date.now();

  let upcoming = (fixIdx?.entries ?? []).filter(e => {
    const d = new Date(e.data?.date ?? '').getTime();
    return !isNaN(d) && d >= now;
  });

  if (q.filters.ageGroups?.length) {
    upcoming = upcoming.filter(e => {
      const ag = e.data?.ageGroup ?? '';
      return q.filters.ageGroups.some(a => ag.toLowerCase().includes(a.toLowerCase()));
    });
  }

  upcoming.sort((a, b) => new Date(a.data?.date ?? '').getTime() - new Date(b.data?.date ?? '').getTime());
  upcoming = upcoming.slice(0, q.limit ?? 10);

  const citations = citeMany('data-integration', upcoming.map(e => `${e.name} on ${e.data?.date ?? '?'}`));

  return {
    answer:  upcoming.length === 0 ? 'No upcoming fixtures found.' : `${upcoming.length} upcoming fixture${upcoming.length === 1 ? '' : 's'}: next is ${upcoming[0]?.name} on ${upcoming[0]?.data?.date ? new Date(upcoming[0].data.date).toLocaleDateString('en-IE') : '?'}.`,
    summary: upcoming.map(e => `${e.name} (${e.data?.date ? new Date(e.data.date).toLocaleDateString('en-IE') : '?'})`).join(' · '),
    data:    upcoming.map(e => ({
      teams:       e.name,
      date:        e.data?.date,
      venue:       e.data?.venue ?? '—',
      competition: e.data?.competition ?? '—',
      ageGroup:    e.data?.ageGroup ?? '—',
    })),
    count:   upcoming.length,
    confidence: upcoming.length > 0 ? 90 : 50,
    citations: dedupeCitations(citations),
  };
}

async function _handleMatchHistory(q) {
  const histIdx = await getIndex(DOMAINS.MATCH_HISTORY);
  let matches   = histIdx?.entries ?? [];

  if (q.filters.ageGroups?.length) {
    matches = matches.filter(e => {
      const ag = e.data?.ageGroup ?? '';
      return q.filters.ageGroups.some(a => ag.toLowerCase().includes(a.toLowerCase()));
    });
  }

  matches.sort((a, b) => new Date(b.data?.date ?? '').getTime() - new Date(a.data?.date ?? '').getTime());
  matches = matches.slice(0, q.limit ?? 10);

  const wins   = matches.filter(e => e.tags?.includes('win')).length;
  const losses = matches.filter(e => e.tags?.includes('loss')).length;

  const citations = citeMany('data-integration', matches.map(e => e.name));

  return {
    answer:  matches.length === 0 ? 'No match history found.' : `${matches.length} results: ${wins}W / ${losses}L.`,
    summary: `${wins} wins · ${losses} losses · ${matches.length - wins - losses} draws`,
    data:    matches.map(e => ({
      match:    e.name,
      date:     e.data?.date,
      result:   e.data?.result ?? `${e.data?.homeScore}-${e.data?.awayScore}` ?? '—',
      venue:    e.data?.venue ?? '—',
      ageGroup: e.data?.ageGroup ?? '—',
    })),
    count:   matches.length,
    confidence: matches.length > 0 ? 90 : 40,
    citations: dedupeCitations(citations),
  };
}

async function _handleTrainingReport(q) {
  const trainIdx = await getIndex(DOMAINS.TRAINING);
  let sessions   = trainIdx?.entries ?? [];

  sessions.sort((a, b) => new Date(b.data?.date ?? '').getTime() - new Date(a.data?.date ?? '').getTime());
  sessions = sessions.slice(0, q.limit ?? 10);

  const citations = citeMany('data-integration', sessions.map(e => e.name));

  return {
    answer:  sessions.length === 0 ? 'No training sessions found.' : `${sessions.length} training sessions. Most recent: ${sessions[0]?.name ?? '—'}.`,
    summary: `${sessions.length} sessions`,
    data:    sessions.map(e => ({
      session:  e.name,
      date:     e.data?.date,
      ageGroup: e.data?.ageGroup ?? '—',
      focus:    e.data?.focus ?? '—',
      venue:    e.data?.venue ?? '—',
    })),
    count:   sessions.length,
    confidence: sessions.length > 0 ? 85 : 40,
    citations: dedupeCitations(citations),
  };
}

async function _handleCommsPending(q) {
  let _comms = null;
  try { _comms = await import('../communications-engine/index.js'); } catch { /* non-fatal */ }
  let _aq = null;
  try { _aq = await import('../dashboard/approval-centre/approval-queue.js'); } catch { /* non-fatal */ }

  const scheduled = _comms?.getScheduled?.() ?? [];
  const pending   = _aq?.getPending?.() ?? [];

  const all = [
    ...scheduled.map(s => ({ type: 'scheduled', name: s.type ?? 'communication', detail: `Send at ${s.sendAt ?? '?'}` })),
    ...pending.map(p => ({ type: 'approval', name: p.title ?? p.type ?? 'draft', detail: `${p.riskLevel ?? 'low'} risk` })),
  ];

  const citations = citeMany('communications-engine', all.map(a => `${a.type}: ${a.name}`));

  return {
    answer:  all.length === 0 ? 'No pending communications found.' : `${all.length} pending: ${scheduled.length} scheduled, ${pending.length} awaiting approval.`,
    summary: `Scheduled: ${scheduled.length} · Pending approval: ${pending.length}`,
    data:    all,
    count:   all.length,
    confidence: 90,
    citations: dedupeCitations(citations),
  };
}

// ── Graph-traversal handlers ───────────────────────────────────────────────────
// Each handler falls back to _handleGeneral if the graph returns nothing.

async function _handleGraphCoaching(q) {
  const g = await gt();
  if (g) {
    try {
      const result = await g.drillsForQuery(q.raw);
      if (result) return result;
    } catch { /* fall through */ }
  }
  return _handleGeneral(q, 'coach');
}

async function _handleGraphDocs(q) {
  const g = await gt();
  if (g) {
    try {
      const result = await g.docsForQuery(q.raw);
      if (result) return result;
    } catch { /* fall through */ }
  }
  return _handleGeneral(q, 'coach');
}

async function _handleGraphPlayer(q) {
  const g = await gt();
  if (g) {
    try {
      const result = await g.playerGraphQuery(q.raw, q.filters?.name);
      if (result) return result;
    } catch { /* fall through */ }
  }
  return _handleGeneral(q, 'coach');
}

// Node types considered coaching knowledge — graph takes priority for these
// Only pre-empt Club Intelligence when graph finds an actual coaching-knowledge node.
// KnowledgeBase is structural (an indexing bucket), not content — excluded.
const COACHING_KNOWLEDGE_TYPES = new Set([
  'CoachingPrinciple', 'Theme', 'Drill', 'Exercise', 'Document', 'TrainingSession',
]);

async function _handleGeneral(q, role) {
  // Try graph traversal first for coaching-knowledge nodes (drills, principles, documents).
  // Graph takes priority when it finds a relevant coaching node; otherwise falls through to CI.
  const g = await gt();
  if (g) {
    try {
      const graphResult = await g.exploreGraph(q.raw);
      const topType = graphResult?.data?.[0]?.node?.type;
      if (graphResult?.count > 0 && topType && COACHING_KNOWLEDGE_TYPES.has(topType)) {
        return graphResult;
      }
    } catch { /* fall through */ }
  }

  // Try Club Intelligence answerQuestion for club-operations queries
  const c = await ci();
  if (c) {
    try {
      const ciAnswer = await c.answerQuestion(q.raw);
      if (ciAnswer?.answer && ciAnswer.answer !== 'Insufficient team data') {
        return {
          answer:  ciAnswer.answer,
          summary: ciAnswer.answer,
          data:    { evidence: ciAnswer.evidence, relatedInsights: ciAnswer.relatedInsights },
          count:   (ciAnswer.evidence ?? []).length,
          confidence: 75,
          citations: citeMany('club-intelligence', ciAnswer.evidence ?? []),
        };
      }
    } catch { /* fall through */ }
  }

  // Fall back to cross-domain keyword search
  const found = await keywordSearch(q.raw, { limit: 10 });
  if (found.length > 0) {
    return {
      answer:  `Found ${found.length} result${found.length === 1 ? '' : 's'} across knowledge base.`,
      summary: found.map(r => `${r.domain}: ${r.name}`).join(' · '),
      data:    found.map(r => ({ domain: r.domain, type: r.type, name: r.name, tags: r.tags })),
      count:   found.length,
      confidence: 60,
      citations: [],
    };
  }

  return _emptyAnswer(`No knowledge found for: "${q.raw}"`);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _emptyAnswer(message = 'No results') {
  return { answer: message, summary: message, data: [], count: 0, confidence: 0, citations: [] };
}

function _injurySummary(injuries) {
  if (!injuries.length) return 'No active injuries on record.';
  const byPos = {};
  injuries.forEach(e => {
    const pos = e.data?.position ?? 'unknown';
    byPos[pos] = (byPos[pos] ?? 0) + 1;
  });
  const posLine = Object.entries(byPos).map(([p, n]) => `${n} ${p}`).join(', ');
  return `${injuries.length} active injur${injuries.length === 1 ? 'y' : 'ies'} (${posLine})`;
}

function _attendanceSummary(players) {
  if (!players.length) return 'No attendance data.';
  const topMissed = players[0];
  if (!topMissed) return '';
  const att = topMissed.data?.attendance ?? topMissed.data?.core?.attendance ?? {};
  const missed = (att.totalSessions ?? 0) - (att.attended ?? 0);
  return `Most absent: ${topMissed.name} (${missed} sessions missed)`;
}

function _avgRate(sessions = []) {
  const withRate = sessions.filter(s => s.data?.attendanceRate != null || s.data?.rate != null);
  if (!withRate.length) return null;
  const sum = withRate.reduce((acc, s) => acc + (s.data?.attendanceRate ?? s.data?.rate ?? 0), 0);
  return Math.round((sum / withRate.length) * 100);
}

// Formatted output helper
export function formatAnswer(result) {
  const lines = [
    `**Q:** ${result.question}`,
    `**A:** ${result.answer}`,
  ];

  if (result.summary && result.summary !== result.answer) {
    lines.push(`\n${result.summary}`);
  }

  if (result.data && Array.isArray(result.data) && result.data.length > 0) {
    lines.push('\n**Results:**');
    result.data.slice(0, 10).forEach((item, i) => {
      const label = item.name ?? item.match ?? item.session ?? item.teams ?? Object.values(item)[0];
      const detail = Object.entries(item).filter(([k]) => k !== 'name' && k !== 'playerId').slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ');
      lines.push(`${i + 1}. ${label}${detail ? ` — ${detail}` : ''}`);
    });
    if (result.data.length > 10) lines.push(`...and ${result.data.length - 10} more`);
  }

  if (result.citations?.length > 0) {
    lines.push(`\n**Sources:** ${result.citations.slice(0, 3).map(c => c.engine).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`);
  }

  lines.push(`\n_Confidence: ${result.confidence ?? 0}% · Intent: ${result.intent} · ${result.timing?.durationMs ?? 0}ms${result.cached ? ' (cached)' : ''}_`);
  return lines.join('\n');
}
