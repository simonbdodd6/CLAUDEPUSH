/**
 * Fixture Standings & Season Timeline
 *
 * Computes league standings, season summary, and the full season calendar
 * from the fixture store.
 *
 * Standings are derived entirely from completed fixtures — no external
 * data source required. Import from an official provider in production.
 */

import { listAllFixtures, listUpcomingFixtures, listRecentFixtures } from './fixture-store.js';
import { FIXTURE_STATUS, RESULT_STATUS } from './fixture-schema.js';

// ── Season Timeline ───────────────────────────────────────────────────────────

/**
 * Build the full season timeline — all fixtures grouped by month.
 */
export function updateSeasonTimeline(seasonLabel = null) {
  const all = listAllFixtures().sort((a, b) => new Date(a.kickoff ?? 0) - new Date(b.kickoff ?? 0));

  if (all.length === 0) {
    return { season: seasonLabel ?? deriveSeason(), fixtures: 0, months: {}, teams: [], summary: 'No fixtures scheduled.' };
  }

  const months = {};
  const teams  = new Set();

  for (const f of all) {
    if (!f.kickoff) continue;
    const month = new Date(f.kickoff).toLocaleDateString('en-IE', { month: 'long', year: 'numeric' });
    if (!months[month]) months[month] = [];
    months[month].push(timelineEntry(f));
    teams.add(f.teamName);
  }

  const completed = all.filter(f => f.status === FIXTURE_STATUS.COMPLETED);
  const upcoming  = all.filter(f => f.kickoff && new Date(f.kickoff) > new Date() && f.status !== 'cancelled');

  return {
    season:        seasonLabel ?? deriveSeason(),
    fixtures:      all.length,
    completed:     completed.length,
    upcoming:      upcoming.length,
    months,
    teams:         [...teams],
    nextFixture:   upcoming[0] ? timelineEntry(upcoming[0]) : null,
    lastResult:    completed.at(-1) ? timelineEntry(completed.at(-1)) : null,
    generatedAt:   new Date().toISOString(),
    summary:       buildTimelineSummary(all, completed, upcoming),
  };
}

function timelineEntry(f) {
  const r = f.result ?? {};
  return {
    id:         f.id,
    teamName:   f.teamName,
    ageGroup:   f.ageGroup,
    opponent:   f.opponent,
    competition: f.competition,
    kickoff:    f.kickoff,
    kickoffLabel: f.kickoff ? new Date(f.kickoff).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'TBC',
    isHome:     f.isHome,
    status:     f.status,
    result:     f.status === FIXTURE_STATUS.COMPLETED
      ? `${r.teamScore ?? '?'}–${r.opponentScore ?? '?'} (${r.status ?? 'TBC'})`
      : f.status,
  };
}

function buildTimelineSummary(all, completed, upcoming) {
  const wins   = completed.filter(f => f.result?.status === RESULT_STATUS.WIN).length;
  const losses = completed.filter(f => f.result?.status === RESULT_STATUS.LOSS).length;
  const draws  = completed.filter(f => f.result?.status === RESULT_STATUS.DRAW).length;

  return `Season: ${completed.length} played — W${wins} D${draws} L${losses}. ` +
         `${upcoming.length} fixture${upcoming.length !== 1 ? 's' : ''} remaining.`;
}

// ── League Standings ──────────────────────────────────────────────────────────

/**
 * Build a league table for a given competition.
 * Points: Win = 4, Draw = 2, Loss = 0, Bonus point (4+ tries) = 1.
 */
export function getSeasonStandings(competition = null) {
  const all = listAllFixtures()
    .filter(f => f.status === FIXTURE_STATUS.COMPLETED)
    .filter(f => !competition || f.competition === competition);

  if (all.length === 0) {
    return { competition: competition ?? 'All', teams: [], note: 'No completed fixtures.' };
  }

  // Group by teamId
  const table = {};

  for (const f of all) {
    const key = f.teamName;
    if (!table[key]) {
      table[key] = { team: key, ageGroup: f.ageGroup, P: 0, W: 0, D: 0, L: 0, PF: 0, PA: 0, Pts: 0, form: [] };
    }
    const row = table[key];
    const r   = f.result;
    row.P++;
    row.PF += r.teamScore     ?? 0;
    row.PA += r.opponentScore ?? 0;

    if (r.status === RESULT_STATUS.WIN)       { row.W++; row.Pts += 4; row.form.push('W'); }
    else if (r.status === RESULT_STATUS.DRAW) { row.D++; row.Pts += 2; row.form.push('D'); }
    else if (r.status === RESULT_STATUS.LOSS) { row.L++;               row.form.push('L'); }
  }

  const sorted = Object.values(table).sort((a, b) => b.Pts - a.Pts || (b.PF - b.PA) - (a.PF - a.PA));

  return {
    competition: competition ?? 'All competitions',
    teams:       sorted.map((row, i) => ({ position: i + 1, ...row, PD: row.PF - row.PA, form: row.form.slice(-5).join('') })),
    generatedAt: new Date().toISOString(),
  };
}

// ── Team season summary ───────────────────────────────────────────────────────

export function getTeamSeasonSummary(teamId) {
  const fixtures = listAllFixtures().filter(f => f.teamId === teamId || f.teamName === teamId);
  const completed = fixtures.filter(f => f.status === FIXTURE_STATUS.COMPLETED);
  const upcoming  = fixtures.filter(f => f.kickoff && new Date(f.kickoff) > new Date() && f.status !== 'cancelled');

  const wins   = completed.filter(f => f.result?.status === RESULT_STATUS.WIN).length;
  const losses = completed.filter(f => f.result?.status === RESULT_STATUS.LOSS).length;
  const draws  = completed.filter(f => f.result?.status === RESULT_STATUS.DRAW).length;

  const pf = completed.reduce((s, f) => s + (f.result?.teamScore ?? 0), 0);
  const pa = completed.reduce((s, f) => s + (f.result?.opponentScore ?? 0), 0);

  const form = completed.slice(-5).map(f => {
    if (f.result?.status === RESULT_STATUS.WIN)  return 'W';
    if (f.result?.status === RESULT_STATUS.DRAW) return 'D';
    return 'L';
  }).join('');

  return {
    teamId,
    teamName:     fixtures[0]?.teamName ?? teamId,
    played:       completed.length,
    wins, draws, losses,
    points:       wins * 4 + draws * 2,
    pointsFor:    pf,
    pointsAgainst:pa,
    pointsDiff:   pf - pa,
    form,
    winRate:      completed.length > 0 ? Math.round((wins / completed.length) * 100) : null,
    upcoming:     upcoming.length,
    nextFixture:  upcoming.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0]
      ? timelineEntry(upcoming.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0])
      : null,
  };
}

// ── Upcoming fixtures summary ─────────────────────────────────────────────────

export function getUpcomingFixturesSummary(limit = 5) {
  return listUpcomingFixtures(limit).map(f => ({
    ...timelineEntry(f),
    daysAway:    Math.round((new Date(f.kickoff) - new Date()) / 86400_000),
    readiness:   f.preparationChecklist?.length > 0
      ? `${f.preparationChecklist.filter(t => t.status === 'done').length}/${f.preparationChecklist.length} tasks done`
      : 'Not yet prepared',
  }));
}

// ── Season label ──────────────────────────────────────────────────────────────

function deriveSeason() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  // Rugby season typically Sep–May
  return month >= 8 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
}
