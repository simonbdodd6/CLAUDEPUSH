// Social media post drafts — text-only, no actual posting.
// Generates ready-to-copy captions for Facebook, Instagram, and X (Twitter).

import { COMMUNICATION_TYPES } from './content-generator.js';

const CLUB_HASHTAGS = ['#rugby', '#GAA', '#clubrugby', '#irishrugby'];

function slugTag(name) {
  return '#' + name.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
}

export function buildMatchResultPost(fixture, options = {}) {
  const { clubName = 'Our Club', potm = null, scorers = [] } = options;
  const isHome = fixture.homeTeam?.includes(clubName);
  const ourScore   = isHome ? fixture.homeScore : fixture.awayScore;
  const theirScore = isHome ? fixture.awayScore : fixture.homeScore;
  const opp        = isHome ? fixture.awayTeam : fixture.homeTeam;
  const won        = ourScore > theirScore;
  const resultWord = won ? 'WIN' : ourScore === theirScore ? 'DRAW' : 'LOSS';
  const emoji      = won ? '🟢🏆' : ourScore === theirScore ? '🟡' : '🔴';

  const scoreText  = `${ourScore}–${theirScore}`;
  const headline   = `${emoji} ${resultWord}! ${clubName} ${ourScore} – ${theirScore} ${opp}`;
  const scorerLine = scorers.length > 0 ? `\nTry scorers: ${scorers.map(s => s.name).join(', ')}` : '';
  const potmLine   = potm ? `\n⭐ Man of the Match: ${potm}` : '';
  const tags       = [slugTag(clubName), ...CLUB_HASHTAGS, `#${resultWord.toLowerCase()}`];

  return {
    platform:    'all',
    type:        COMMUNICATION_TYPES.MATCH_REPORT,
    status:      'draft',
    requiresHumanApproval: true,
    posts: {
      facebook: {
        caption: `${headline}${scorerLine}${potmLine}\n\nWell done to everyone involved! 🏉\n\n${tags.join(' ')}`,
        suggestedImageNote: 'Post-match team photo or action shot from the game',
      },
      instagram: {
        caption: `${headline}${scorerLine}${potmLine}\n\n${tags.slice(0, 8).join(' ')}`,
        suggestedImageNote: 'Clean action shot or score graphic — square format (1080×1080)',
      },
      twitter: {
        caption: `${resultWord}! ${clubName} ${scoreText} ${opp}${potmLine}\n${tags.slice(0, 5).join(' ')}`,
        note:    'Keep under 280 characters',
        charCount: `${resultWord}! ${clubName} ${scoreText} ${opp}${potmLine}`.length,
      },
    },
    createdAt: new Date().toISOString(),
  };
}

export function buildPlayerOfWeekPost(playerName, achievement, options = {}) {
  const { clubName = 'Our Club', imageSuggestion = null } = options;
  const tags = [slugTag(clubName), '#playeroftheweek', '#rugby', '#irishrugby', '#clubrugby'];

  return {
    platform:    'all',
    type:        COMMUNICATION_TYPES.PLAYER_OF_WEEK,
    status:      'draft',
    requiresHumanApproval: true,
    posts: {
      facebook: {
        caption: `⭐ PLAYER OF THE WEEK ⭐\n\n${playerName}\n\n${achievement}\n\nWell done ${playerName.split(' ')[0]}! 👏\n\n${tags.join(' ')}`,
        suggestedImageNote: imageSuggestion ?? `Action photo of ${playerName}`,
      },
      instagram: {
        caption: `⭐ Player of the Week: ${playerName}\n\n${achievement}\n\nWell done ${playerName.split(' ')[0]}! 👏\n\n${tags.join(' ')}`,
        suggestedImageNote: imageSuggestion ?? `Portrait or action shot of ${playerName} — square format`,
      },
      twitter: {
        caption: `⭐ POTW: ${playerName} — ${achievement.slice(0, 80)} 👏 ${tags.slice(0, 4).join(' ')}`,
        charCount: `⭐ POTW: ${playerName} — ${achievement.slice(0, 80)}`.length,
      },
    },
    createdAt: new Date().toISOString(),
  };
}

export function buildEventPost(event, options = {}) {
  const { clubName = 'Our Club', callToAction = 'Book your place now!' } = options;
  const dateStr = event.date ? new Date(event.date).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Coming soon';
  const tags = [slugTag(clubName), slugTag(event.name.replace(/\s+/g, '')), '#rugby', '#clubevents'];

  return {
    platform:    'all',
    type:        'event',
    status:      'draft',
    requiresHumanApproval: true,
    posts: {
      facebook: {
        caption: `📅 ${event.name.toUpperCase()}\n\n📍 ${event.venue ?? 'Clubhouse'}\n🗓️ ${dateStr}\n🕐 ${event.time ?? 'TBC'}\n\n${event.description ?? ''}\n\n${callToAction}\n\n${tags.join(' ')}`,
        suggestedImageNote: 'Event promo graphic or clubhouse photo',
      },
      instagram: {
        caption: `📅 ${event.name}\n📍 ${event.venue ?? 'Clubhouse'} | ${dateStr}\n\n${callToAction}\n\n${tags.join(' ')}`,
        suggestedImageNote: 'Event graphic — square or portrait format',
      },
      twitter: {
        caption: `📅 ${event.name} — ${dateStr} at ${event.venue ?? 'Clubhouse'}. ${callToAction} ${tags.slice(0, 3).join(' ')}`,
        charCount: `📅 ${event.name} — ${dateStr} at ${event.venue ?? 'Clubhouse'}`.length,
      },
    },
    createdAt: new Date().toISOString(),
  };
}

export function buildWeeklyRoundup(results, options = {}) {
  const { clubName = 'Our Club', upcomingText = '' } = options;
  const tags = [slugTag(clubName), '#weekendrugby', '#rugby', '#irishrugby'];

  const resultLines = results.map(r => {
    const won = r.won ?? (r.homeTeam?.includes(clubName) ? r.homeScore > r.awayScore : r.awayScore > r.homeScore);
    return `${won ? '✅' : '❌'} ${r.ageGroup ?? r.homeTeam}: ${r.homeScore ?? '?'} – ${r.awayScore ?? '?'}`;
  });

  return {
    platform:    'all',
    type:        'weekend_roundup',
    status:      'draft',
    requiresHumanApproval: true,
    posts: {
      facebook: {
        caption: `🏉 WEEKEND ROUND-UP\n\n${resultLines.join('\n')}\n\n${upcomingText ? `\n📅 Coming up: ${upcomingText}` : ''}\n\n${tags.join(' ')}`,
        suggestedImageNote: 'Team action photo from the weekend',
      },
      instagram: {
        caption: `🏉 Weekend Results\n\n${resultLines.join('\n')}\n\n${tags.join(' ')}`,
        suggestedImageNote: 'Score graphic or squad photo — square format',
      },
      twitter: {
        caption: `🏉 Weekend results: ${resultLines.join(' | ')} ${tags.slice(0, 3).join(' ')}`,
        charCount: resultLines.join(' | ').length + 30,
      },
    },
    createdAt: new Date().toISOString(),
  };
}

export function formatSocialPost(post) {
  const platforms = post.posts ?? {};
  let out = `#### Social Media Drafts — ${(post.type ?? 'post').replace(/_/g, ' ').toUpperCase()}\n\n`;
  out += `> ⚠️ Status: DRAFT — requires human approval before posting\n\n`;

  if (platforms.facebook) {
    out += `**Facebook:**\n\`\`\`\n${platforms.facebook.caption}\n\`\`\`\n`;
    if (platforms.facebook.suggestedImageNote) out += `*Image suggestion: ${platforms.facebook.suggestedImageNote}*\n\n`;
  }
  if (platforms.instagram) {
    out += `**Instagram:**\n\`\`\`\n${platforms.instagram.caption}\n\`\`\`\n`;
    if (platforms.instagram.suggestedImageNote) out += `*Image suggestion: ${platforms.instagram.suggestedImageNote}*\n\n`;
  }
  if (platforms.twitter) {
    out += `**X (Twitter):**\n\`\`\`\n${platforms.twitter.caption}\n\`\`\`\n`;
    if (platforms.twitter.charCount) out += `*~${platforms.twitter.charCount} chars*\n\n`;
  }
  return out;
}
