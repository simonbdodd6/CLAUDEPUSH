import { loadLeads, saveLeads } from './lead-db.js';

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-haiku-4-5-20251001';

const HIGH_VALUE = new Set([
  'Ireland', 'France', 'England', 'South Africa', 'New Zealand',
  'Australia', 'Wales', 'Scotland', 'Argentina', 'Italy', 'Japan',
]);

function deterministic(lead) {
  let s = 5.0;
  if (lead.level === 'adult_amateur') s += 2.0;
  else if (lead.level === 'youth') s += 1.2;
  else if (lead.level === 'semi_pro') s -= 0.5;
  else if (lead.level === 'professional') s -= 2.5;
  if (HIGH_VALUE.has(lead.country)) s += 0.5;
  if (lead.socialFacebook || lead.socialInstagram) s += 0.5;
  if (lead.email) s += 0.4;
  if (!lead.website) s += 0.3;
  if (lead.notes && lead.notes.length > 20) s += 0.3;
  return Math.round(Math.min(10, Math.max(1, s)) * 10) / 10;
}

async function claudeScore(lead) {
  if (!API_KEY) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system: 'Score rugby clubs as sales leads for a coaching app (€70/mo). Reply ONLY with JSON: {"score":1-10,"reason":"one sentence"}. Adult amateur clubs with Facebook-only presence = 8-10. Professional clubs = 2-3.',
        messages: [{
          role: 'user',
          content: `Club: ${lead.clubName}, Country: ${lead.country}, Level: ${lead.level}, Email: ${lead.email ? 'yes' : 'no'}, Social: ${(lead.socialFacebook || lead.socialInstagram) ? 'yes' : 'no'}, Notes: ${lead.notes || 'none'}`,
        }],
      }),
    });
    const data = await res.json();
    const text = (data.content?.[0]?.text ?? '').replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(text);
    return typeof parsed.score === 'number' ? parsed.score : null;
  } catch {
    return null;
  }
}

export async function scoreAllLeads({ useAI = !!API_KEY, rescoreAll = false } = {}) {
  const leads = loadLeads();
  const targets = rescoreAll ? leads : leads.filter(l => l.fitScore === null);

  if (!targets.length) {
    console.log('  All leads already scored');
    return { scored: 0, mode: 'skip' };
  }

  console.log(`  Scoring ${targets.length} leads (${useAI ? `Claude ${MODEL}` : 'heuristic'} mode)…`);
  const now = new Date().toISOString();

  for (const lead of targets) {
    const base = deterministic(lead);
    let score = base;
    if (useAI) {
      const ai = await claudeScore(lead);
      if (ai !== null) score = Math.round((ai * 0.6 + base * 0.4) * 10) / 10;
    }
    lead.fitScore = score;
    lead.lastReviewed = now;
    lead.updatedAt = now;
  }

  saveLeads(leads);
  return { scored: targets.length, mode: useAI ? `Claude (${MODEL})` : 'heuristic' };
}
