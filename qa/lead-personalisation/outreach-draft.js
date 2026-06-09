/**
 * Outreach Draft Generator
 *
 * Generates personalised outreach DRAFTS only. Nothing is sent.
 * Every output requires human review before use.
 *
 * Produces:
 *   subjectLines    — 3 options
 *   shortEmail      — under 100 words
 *   longEmail       — 150–200 words
 *   linkedInMessage — under 300 characters
 *
 * Uses Claude Haiku when ANTHROPIC_API_KEY is set; template fallback otherwise.
 * Both modes produce genuine, non-generic copy.
 */

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL   = process.env.RUGBY_ASSISTANT_MODEL || 'claude-haiku-4-5-20251001';

const DRAFT_DISCLAIMER = '⚠️  DRAFT ONLY — requires human review before sending. Do not copy-paste directly.';

// ── Claude-powered drafts ──────────────────────────────────────────────────────

const SYSTEM = `You are a B2B SaaS sales expert specialising in sports technology for amateur clubs.
Write personalised, authentic outreach. Never use corporate jargon or generic sports clichés.
Focus on ONE specific problem the club has and ONE specific way the product solves it.
Tone: conversational, coach-to-coach, never pushy.

Reply ONLY with valid JSON:
{
  "subjectLines": ["option 1", "option 2", "option 3"],
  "shortEmail": "under 100 words — brief, specific, one CTA",
  "longEmail": "150-200 words — specific pain, specific coaching hook, soft CTA",
  "linkedInMessage": "under 280 chars — personal, not salesy"
}`;

async function callClaude(lead, profile, preview) {
  const sessionLine = `${preview.sessionIdea.ageGroup} ${preview.sessionIdea.theme} session (60 min)`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1200,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Club: ${lead.clubName}
Country: ${lead.country}
Size: ${lead.estimatedPlayers || 'unknown'} players
Age groups: ${profile.ageGroups.join(', ')}
Union: ${profile.unionName}

Main pain point: ${profile.painPoints[0]}
Messaging problem: ${preview.messagingPain}

Coaching hook to use: "${preview.coachingInsight}"
Session idea to reference: ${sessionLine}
Core value: "${preview.coachesEyeValue}"
Recommended outreach tone: ${profile.outreachTone}

Write outreach for ${profile.contactRole} at this club.`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  const raw  = (data.content?.[0]?.text ?? '').replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(raw);
}

// ── Template fallback ──────────────────────────────────────────────────────────

function templateDrafts(lead, profile, preview) {
  const { clubName, country, estimatedPlayers } = lead;
  const { unionName, ageGroups, contactRole, painPoints } = profile;
  const players  = estimatedPlayers || 'your';
  const topPain  = painPoints[0];
  const ageStr   = ageGroups.length > 1
    ? `${ageGroups[0]}–${ageGroups[ageGroups.length - 1]}`
    : ageGroups[0];
  const sessionAge   = preview.sessionIdea.ageGroup;
  const sessionTheme = preview.sessionIdea.theme;
  const kp           = preview.sessionIdea.keyCoachingPoint;

  const subjectLines = [
    `A coaching idea for ${clubName}'s ${sessionAge}s`,
    `${clubName} — one thing worth trying this season`,
    `Quick thought on ${sessionTheme} for ${clubName}`,
  ];

  const shortEmail = `Hi [Name],

I came across ${clubName} — impressive setup running ${ageStr} across the season.

Quick question: are your coaches still coordinating ${players} players through group chats? Most clubs in ${country} are.

Coach's Eye gives ${clubName}'s coaches one app for squad management and player communication — without the WhatsApp admin overhead.

Worth a 15-minute call? Happy to share a ${sessionAge} ${sessionTheme} session plan as a starting point.

[Your name]`;

  const longEmail = `Hi [Name],

I was looking at what ${clubName} is doing with your ${ageStr} programme — genuinely impressive for a community club.

One thing I've noticed coaching clubs like yours in ${country}: the biggest time drain isn't the training itself, it's the admin around it. ${topPain}

I built Coach's Eye to solve exactly that. It gives coaches a single app for player availability, squad communication, and session planning — without the WhatsApp chaos.

I've put together a ${sessionAge} ${sessionTheme} session plan I'd love to share with you. Key coaching point: ${kp}

The session took about 3 minutes to generate. The kind of thing your coaches could use tomorrow.

If you're open to it, I'd love to show ${clubName}'s ${contactRole} how it works — 15 minutes, no pressure. I think it'd be genuinely useful.

Best,
[Your name]
Coach's Eye`;

  const linkedInMessage = `Hi [Name] — noticed ${clubName} runs ${ageStr} groups, impressive for a community club. I work with rugby clubs in ${country} to cut squad admin time. Happy to share a quick ${sessionAge} session idea if useful?`;

  return { subjectLines, shortEmail, longEmail, linkedInMessage };
}

/**
 * Generate outreach drafts for a lead.
 * IMPORTANT: Output is draft only. Requires human review before sending.
 *
 * @param {object} lead
 * @param {object} profile — from buildClubProfile()
 * @param {object} preview — from generateCoachingPreview()
 * @returns {Promise<object>} drafts
 */
export async function generateOutreachDrafts(lead, profile, preview) {
  let drafts;
  let mode = 'template';

  if (API_KEY) {
    try {
      drafts = await callClaude(lead, profile, preview);
      mode = 'claude';
    } catch (err) {
      drafts = templateDrafts(lead, profile, preview);
    }
  } else {
    drafts = templateDrafts(lead, profile, preview);
  }

  return {
    ...drafts,
    disclaimer: DRAFT_DISCLAIMER,
    mode,
    status: 'draft',
    reviewedBy: null,
    approvedToSend: false,
  };
}
