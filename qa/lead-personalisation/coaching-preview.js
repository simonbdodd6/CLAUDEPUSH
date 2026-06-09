/**
 * Coaching Preview Generator
 *
 * Uses the Rugby Intelligence knowledge base and Coaching Assistant query engine
 * to generate a personalised coaching content preview for each club.
 *
 * Generates:
 *   sessionIdea     — a 60-minute session idea relevant to this club's age groups
 *   coachingInsight — one insight from the knowledge base
 *   messagingPain   — the specific messaging/admin pain for this club type
 *   coachesEyeValue — one specific way Coach's Eye solves their main problem
 *
 * Uses Claude Haiku when ANTHROPIC_API_KEY is set; template fallback otherwise.
 */

import { retrieveRelevant } from '../rugby-assistant/query.js';
import { buildSession, VALID_AGE_GROUPS } from '../rugby-assistant/session-builder.js';
import { loadAll } from '../rugby-intel/knowledge-db.js';

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL   = process.env.RUGBY_ASSISTANT_MODEL || 'claude-haiku-4-5-20251001';

// ── Session theme selection ────────────────────────────────────────────────────

const SESSION_THEMES = {
  'U8':    ['passing and handling', 'tag game skills', 'running with the ball'],
  'U10':   ['passing and support play', 'tag and touch skills', 'evasion and footwork'],
  'U12':   ['tackle introduction', 'ruck basics', 'attack and defence shape'],
  'U14':   ['breakdown technique', 'lineout basics', 'defensive system'],
  'U16':   ['set-piece', 'breakdown and ruck speed', 'attacking structure'],
  'Senior':['lineout', 'defensive line speed', 'breakdown and jackalling'],
};

function pickSessionTheme(ageGroups) {
  // Pick the most "coaching-intensive" age group to show off depth
  const priority = ['U16', 'U14', 'Senior', 'U12', 'U10', 'U8'];
  const target   = priority.find(ag => ageGroups.includes(ag)) || 'Senior';
  const themes   = SESSION_THEMES[target] || SESSION_THEMES['Senior'];
  return { ageGroup: target, theme: themes[0] };
}

// ── Static coaching insights (used when KB is empty or as fallback) ────────────

const STATIC_INSIGHTS = [
  {
    insight: 'Defensive line speed is the single biggest predictor of turnover rate at amateur level. Teams that arrive at the tackle from an organised line create far more pressure than faster-rushing individuals.',
    category: 'defence',
    takeaway: 'Train line speed as a team habit, not an individual trait — count the seconds from set piece to defensive organisation.',
  },
  {
    insight: 'At the breakdown, the first cleaner arriving with correct body position (hips low, bound through) is worth more than three late arrivals. Speed without technique creates penalties, not turnovers.',
    category: 'breakdown',
    takeaway: 'Run walking-pace breakdown entries before adding competition — technique must be automatic before pressure is applied.',
  },
  {
    insight: 'Lineout success at club level is primarily a communication problem. The hooker must wait for the jumper\'s cue — not the call from the touchline. Walk-through drills at half speed fix 80% of lineout errors.',
    category: 'set-piece',
    takeaway: 'Start every lineout session with 10 static walk-throughs before adding a ball.',
  },
  {
    insight: 'Youth players (U10–U14) develop passing technique fastest through touch and tag formats, where they get 5× more ball touches per session than in full contact training.',
    category: 'youth',
    takeaway: 'Structure training to maximise touches per player — small-sided games beat large group drills every time.',
  },
];

function pickStaticInsight(ageGroups, profile) {
  // Match insight to the club's most relevant coaching area
  if (ageGroups.some(a => ['U8', 'U10'].includes(a)) && ageGroups.length <= 2) {
    return STATIC_INSIGHTS[3]; // youth
  }
  if (profile.painPoints.some(p => p.toLowerCase().includes('lineout') || p.toLowerCase().includes('set piece'))) {
    return STATIC_INSIGHTS[2]; // set-piece
  }
  return STATIC_INSIGHTS[0]; // defence (most broadly applicable)
}

// ── Messaging pain points ──────────────────────────────────────────────────────

function messagingPainPoint(lead, profile) {
  const players = lead.estimatedPlayers || 80;
  const country = lead.country;
  const hasYouth = profile.hasYouth;

  if (hasYouth && players >= 200) {
    return `With ${players} players across ${profile.ageGroups.length} age groups, ${lead.clubName} is running at least ${Math.round(profile.ageGroups.length * 1.5)} separate WhatsApp or message threads. Parents, players, and coaches all receive different messages, and availability confirmations get buried in chat history.`;
  }
  if (hasYouth) {
    return `Youth coaches at clubs like ${lead.clubName} typically manage parent contact through personal phone numbers. When a coach leaves, the communication network disappears with them. Player welfare records — attendance, incident reports — often live in individual coaches' phones.`;
  }
  if (players >= 200) {
    return `${lead.clubName} runs a senior programme across multiple squads. Match day availability for ${players} registered players is likely confirmed via group chats the night before, meaning coaches make lineout decisions without a reliable squad picture.`;
  }
  return `Community clubs like ${lead.clubName} run on volunteer effort. Every hour a coach spends on WhatsApp, spreadsheets, and email coordination is an hour not spent on player development.`;
}

// ── Claude-powered personalised preview ──────────────────────────────────────

async function callClaude(lead, profile, kbItems) {
  const kbContext = kbItems.length
    ? kbItems.map((i, n) => `[KB${n + 1}] ${i.title}: ${i.takeaway || i.summary}`).join('\n')
    : 'No specific knowledge base items available.';

  const { ageGroup, theme } = pickSessionTheme(profile.ageGroups);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      system: `You are a rugby coaching expert writing personalised content previews for rugby club outreach.
Write concise, specific, coaching-focused content. No generic sales language.

Reply ONLY with valid JSON:
{
  "sessionIdea": {
    "ageGroup": "...",
    "theme": "...",
    "duration": 60,
    "warmUp": "brief description",
    "mainActivity": "brief description",
    "game": "brief description",
    "keyCoachingPoint": "one specific point"
  },
  "coachingInsight": "2 sentences specific to this club's context and age groups",
  "coachesEyeValue": "1 specific sentence on how Coach's Eye solves their biggest pain"
}`,
      messages: [{
        role: 'user',
        content: `Club: ${lead.clubName} (${lead.country})
Age groups: ${profile.ageGroups.join(', ')}
Players: ${lead.estimatedPlayers || 'unknown'}
Main pain point: ${profile.painPoints[0]}
Session target: ${ageGroup} — ${theme}

Knowledge base context:
${kbContext}`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  const raw  = (data.content?.[0]?.text ?? '').replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(raw);
}

/**
 * Generate a coaching content preview for a club.
 *
 * @param {object} lead
 * @param {object} profile — from buildClubProfile()
 * @returns {Promise<object>} preview
 */
export async function generateCoachingPreview(lead, profile) {
  const { ageGroup, theme } = pickSessionTheme(profile.ageGroups);

  // Fetch relevant knowledge base items
  const searchQ = `${ageGroup} ${theme} ${profile.ageGroups.includes('U8') || profile.ageGroups.includes('U10') ? 'youth' : ''}`.trim();
  const { items } = retrieveRelevant(searchQ, { limit: 4 });

  let preview;
  let mode = 'template';

  if (API_KEY) {
    try {
      const claude = await callClaude(lead, profile, items);
      const insight = pickStaticInsight(profile.ageGroups, profile);

      preview = {
        sessionIdea: {
          ageGroup:         claude.sessionIdea?.ageGroup || ageGroup,
          theme:            claude.sessionIdea?.theme || theme,
          duration:         60,
          warmUp:           claude.sessionIdea?.warmUp || 'Dynamic warm-up with ball work (10 min)',
          mainActivity:     claude.sessionIdea?.mainActivity || `${theme} technique drill (25 min)`,
          game:             claude.sessionIdea?.game || 'Conditioned game applying session skill (20 min)',
          keyCoachingPoint: claude.sessionIdea?.keyCoachingPoint || insight.takeaway,
        },
        coachingInsight: claude.coachingInsight || insight.insight,
        coachesEyeValue: claude.coachesEyeValue || profile.valueProp1,
        messagingPain:   messagingPainPoint(lead, profile),
        kbSources:       items.map(i => i.title),
        mode:            'claude',
      };
      mode = 'claude';
      return preview;
    } catch (err) {
      // fall through to template
    }
  }

  // Template fallback
  const insight = pickStaticInsight(profile.ageGroups, profile);

  return {
    sessionIdea: {
      ageGroup,
      theme,
      duration: 60,
      warmUp:           `Tag game with ball (10 min) — maximise touches per player`,
      mainActivity:     `${theme} — technique at half speed, then add opposition (25 min)`,
      game:             `Conditioned match applying session skill. Bonus point for correct execution (20 min)`,
      keyCoachingPoint: insight.takeaway,
    },
    coachingInsight: insight.insight,
    coachesEyeValue: profile.valueProp1,
    messagingPain:   messagingPainPoint(lead, profile),
    kbSources:       items.map(i => i.title),
    mode:            'template',
  };
}
