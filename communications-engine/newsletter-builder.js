// Weekly newsletter, coach messages, and player spotlight builder.

import { generateContent, COMMUNICATION_TYPES } from './content-generator.js';

let _mem = null;
async function mem() {
  if (!_mem) { try { _mem = await import('../memory-engine/index.js'); } catch { _mem = null; } }
  return _mem;
}

let _di = null;
async function di() {
  if (!_di) { try { _di = await import('../qa/data-integration/index.js'); } catch { _di = null; } }
  return _di;
}

// Build weekly newsletter vars from available club data.
async function buildNewsletterVars(options = {}) {
  const {
    headline      = 'Great week at the club!',
    clubName      = 'Your Club',
    coachName     = 'The Management',
    resultsText   = null,
    upcomingText  = null,
    spotlightText = null,
    newsText      = null,
  } = options;

  let resultsSection   = resultsText   ?? 'No results this week.';
  let upcomingSection  = upcomingText  ?? 'Check the app for upcoming fixtures.';
  let spotlightSection = spotlightText ?? 'Watch out for this week\'s player spotlight!';
  let newsSection      = newsText      ?? 'Stay tuned for club updates.';

  // Enrich from data integration if available
  const d = await di();
  if (d) {
    try {
      const fixtures = await d.query({ source: 'fixtures', role: 'public' });
      const upcoming = (fixtures.data ?? []).filter(f => f.status === 'upcoming').slice(0, 3);
      if (upcoming.length > 0) {
        upcomingSection = upcoming.map(f =>
          `• ${f.date}: ${f.homeTeam} vs ${f.awayTeam} at ${f.venue ?? 'TBC'}`
        ).join('\n');
      }

      const past = (fixtures.data ?? []).filter(f => f.result).slice(0, 3);
      if (past.length > 0 && !resultsText) {
        resultsSection = past.map(f => {
          const won = f.homeTeam?.includes(clubName) ? f.homeScore > f.awayScore : f.awayScore > f.homeScore;
          return `• ${f.homeTeam} ${f.homeScore ?? '—'} – ${f.awayScore ?? '—'} ${f.awayTeam} ${f.result ? (won ? '✓ Win' : '✗ Loss') : ''}`;
        }).join('\n');
      }
    } catch { /* use defaults */ }
  }

  return {
    club_name:        clubName,
    coach_name:       coachName,
    date:             new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    headline,
    results_section:  resultsSection,
    upcoming_section: upcomingSection,
    spotlight_section: spotlightSection,
    news_section:     newsSection,
  };
}

export async function buildWeeklyNewsletter(options = {}) {
  const vars = await buildNewsletterVars(options);
  return {
    type: COMMUNICATION_TYPES.WEEKLY_NEWSLETTER,
    audienceType: 'newsletter_subscribers',
    template: COMMUNICATION_TYPES.WEEKLY_NEWSLETTER,
    vars,
    metadata: { period: vars.date, clubName: vars.club_name },
  };
}

export function buildCoachMessage(message, options = {}) {
  const {
    coachName = 'The Coach',
    teamName  = 'The Squad',
    clubName  = 'Your Club',
  } = options;

  return {
    type: COMMUNICATION_TYPES.COACH_MESSAGE,
    audienceType: 'players',
    template: COMMUNICATION_TYPES.COACH_MESSAGE,
    vars: {
      coach_name:    coachName,
      team_name:     teamName,
      club_name:     clubName,
      message_body:  message,
      message_short: message.slice(0, 100) + (message.length > 100 ? '…' : ''),
    },
    metadata: { coach: coachName, team: teamName },
  };
}

export async function buildPlayerOfWeek(playerIdOrName, achievement, options = {}) {
  const {
    coachName = 'The Management',
    clubName  = 'Your Club',
  } = options;

  let playerName  = playerIdOrName;
  let playerFirst = playerIdOrName.split(' ')[0];

  // Try to resolve from Memory Engine
  const m = await mem();
  if (m && typeof playerIdOrName === 'string' && playerIdOrName.startsWith('p')) {
    const p = m.getPlayerById?.(playerIdOrName);
    if (p) {
      playerName  = p.core?.name ?? p.name ?? playerIdOrName;
      playerFirst = playerName.split(' ')[0];
    }
  }

  return {
    type: COMMUNICATION_TYPES.PLAYER_OF_WEEK,
    audienceType: 'all',
    template: COMMUNICATION_TYPES.PLAYER_OF_WEEK,
    vars: {
      club_name:          clubName,
      coach_name:         coachName,
      player_name:        playerName,
      player_first_name:  playerFirst,
      achievement_text:   achievement,
      achievement_short:  achievement.slice(0, 80),
    },
    metadata: { player: playerName },
  };
}

// Build a section-by-section newsletter as a plain Markdown string (for email HTML bodies).
export function formatNewsletterMarkdown(vars) {
  return `# ${vars.club_name} — Weekly Update
*${vars.date}*

## ${vars.headline}

---

### 📋 Results
${vars.results_section}

---

### 📅 Upcoming
${vars.upcoming_section}

---

### ⭐ Player Spotlight
${vars.spotlight_section}

---

### 📢 Club News
${vars.news_section}

---

*${vars.club_name} — Connecting our club*`;
}
