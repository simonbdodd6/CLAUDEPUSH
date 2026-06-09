// Match reports, weekend results, and match preview builder.

import { COMMUNICATION_TYPES } from './content-generator.js';

let _di = null;
async function di() {
  if (!_di) { try { _di = await import('../qa/data-integration/index.js'); } catch { _di = null; } }
  return _di;
}

function formatScore(homeTeam, homeScore, awayTeam, awayScore) {
  return `${homeTeam} ${homeScore} – ${awayScore} ${awayTeam}`;
}

function resultLine(fixture, clubName) {
  const isHome = fixture.homeTeam?.includes(clubName);
  const ourScore   = isHome ? fixture.homeScore : fixture.awayScore;
  const theirScore = isHome ? fixture.awayScore : fixture.homeScore;
  const opposition = isHome ? fixture.awayTeam : fixture.homeTeam;

  if (ourScore == null || theirScore == null) return `vs ${opposition}`;

  if (ourScore > theirScore) return `WIN ${ourScore}–${theirScore} vs ${opposition} 🟢`;
  if (ourScore < theirScore) return `LOSS ${ourScore}–${theirScore} vs ${opposition} 🔴`;
  return `DRAW ${ourScore}–${theirScore} vs ${opposition} 🟡`;
}

export function buildMatchReport(fixture, options = {}) {
  const {
    clubName    = 'Our Club',
    coachName   = 'The Management',
    potm        = 'Outstanding Player',
    scorers     = [],
    summary     = '',
    closingNote = 'A great performance from everyone involved.',
  } = options;

  const result = resultLine(fixture, clubName);
  const score  = formatScore(fixture.homeTeam, fixture.homeScore ?? '?', fixture.awayTeam, fixture.awayScore ?? '?');
  const scorersText = scorers.length > 0
    ? scorers.map(s => `• ${s.name}${s.time ? ` (${s.time}')` : ''}${s.type ? ` — ${s.type}` : ''}`).join('\n')
    : 'No scorers recorded.';

  return {
    type: COMMUNICATION_TYPES.MATCH_REPORT,
    audienceType: 'players',
    template: COMMUNICATION_TYPES.MATCH_REPORT,
    vars: {
      club_name:       clubName,
      coach_name:      coachName,
      team_name:       fixture.homeTeam?.includes(clubName) ? fixture.homeTeam : fixture.awayTeam,
      result_line:     result,
      match_summary:   summary || `${score}\n${fixture.competition ? `Competition: ${fixture.competition}` : ''}`,
      scorers_section: `🎯 Scorers:\n${scorersText}`,
      potm,
      closing_note:    closingNote,
    },
    metadata: { fixtureId: fixture.id, result, competition: fixture.competition },
  };
}

export async function buildWeekendResults(options = {}) {
  const { clubName = 'Our Club', coachName = 'The Management', fixtures = null } = options;

  let allFixtures = fixtures;
  if (!allFixtures) {
    const d = await di();
    if (d) {
      const res = await d.query({ source: 'fixtures', role: 'public' });
      allFixtures = (res.data ?? []).filter(f => f.result || (f.homeScore != null));
    }
  }
  allFixtures = allFixtures ?? [];

  const resultsSection = allFixtures.length > 0
    ? allFixtures.map(f => {
        const line = resultLine(f, clubName);
        return `• ${f.ageGroup ?? f.homeTeam}: ${line}`;
      }).join('\n')
    : 'No results recorded this weekend.';

  const resultsSummary = allFixtures.length > 0
    ? `${allFixtures.length} game(s) played`
    : 'No games this weekend';

  return {
    type: COMMUNICATION_TYPES.WEEKEND_RESULTS,
    audienceType: 'all',
    template: COMMUNICATION_TYPES.WEEKEND_RESULTS,
    vars: {
      club_name:       clubName,
      coach_name:      coachName,
      date:            new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' }),
      results_section: resultsSection,
      results_summary: resultsSummary,
      closing_note:    'Thanks to all players, coaches, parents and supporters!',
    },
    metadata: { fixtureCount: allFixtures.length },
  };
}

export async function buildMatchPreview(fixtureIdOrObj, options = {}) {
  const { clubName = 'Our Club', coachName = 'The Management', previewText = null } = options;

  let fixture = typeof fixtureIdOrObj === 'object' ? fixtureIdOrObj : null;

  if (!fixture) {
    const d = await di();
    if (d) {
      const res = await d.query({ source: 'fixtures', role: 'public' });
      fixture = (res.data ?? []).find(f => f.id === fixtureIdOrObj || f.status === 'upcoming');
    }
  }

  if (!fixture) {
    fixture = { homeTeam: clubName, awayTeam: 'Opposition', date: 'TBC', venue: 'Home Ground', competition: 'League' };
  }

  const isHome  = fixture.homeTeam?.includes(clubName);
  const opp     = isHome ? fixture.awayTeam : fixture.homeTeam;
  const dateStr = fixture.date ? new Date(fixture.date).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' }) : 'TBC';

  return {
    type: COMMUNICATION_TYPES.MATCH_PREVIEW,
    audienceType: 'players',
    template: COMMUNICATION_TYPES.MATCH_PREVIEW,
    vars: {
      club_name:     clubName,
      coach_name:    coachName,
      team_name:     isHome ? fixture.homeTeam : fixture.awayTeam,
      opposition:    opp,
      date:          dateStr,
      day:           dateStr,
      venue:         fixture.venue ?? (isHome ? 'Home Ground' : 'Away'),
      kickoff_time:  fixture.time ?? fixture.kickoffTime ?? '3:00pm',
      competition:   fixture.competition ?? 'League',
      preview_text:  previewText ?? `This is a key match in our ${fixture.competition ?? 'campaign'}. Let\'s give it everything!`,
    },
    metadata: { fixtureId: fixture.id, opposition: opp },
  };
}
