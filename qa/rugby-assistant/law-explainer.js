/**
 * Law Explainer — converts rugby law knowledge into plain coaching language.
 *
 * Searches the knowledge base for law-update items matching the topic,
 * then asks Claude to explain them in plain English with practical coaching impact.
 * Falls back to structured display of raw knowledge base content.
 */

import { retrieveRelevant } from './query.js';
import { logActivity } from './activity-log.js';

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL   = process.env.RUGBY_ASSISTANT_MODEL || 'claude-haiku-4-5-20251001';

const SYSTEM = `You are a rugby law expert and coach educator. Explain rugby laws clearly for coaches.

Reply ONLY with valid JSON (no markdown fences):
{
  "lawTitle": "concise law/topic title",
  "simpleExplanation": "2-3 sentences in plain English — what the law says",
  "practicalImpact": "how this affects coaching and training decisions",
  "ageGradeConsiderations": {
    "U8-U10": "how law applies or is modified for this age group",
    "U12-U14": "...",
    "U16-Senior": "..."
  },
  "examples": ["concrete example 1", "concrete example 2"],
  "commonMisunderstandings": ["misconception 1"],
  "refereeCues": ["what referees look for"],
  "coachAction": "one thing the coach should do differently or reinforce in training"
}`;

async function callClaude(query, items) {
  const context = items.length
    ? items.map((i, n) => `[${n + 1}] "${i.title}"\n${i.summary}\nTakeaway: ${i.takeaway}`).join('\n\n')
    : 'No specific knowledge base law items found — use general World Rugby law knowledge.';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1000,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Law question: ${query}\n\nKnowledge base context:\n${context}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = (data.content?.[0]?.text ?? '').replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(raw);
}

function heuristicExplanation(query, items) {
  const first = items[0];
  return {
    lawTitle: first?.title || query,
    simpleExplanation: first?.summary || `${query} is covered under World Rugby Laws. Consult the full Laws of the Game for complete details.`,
    practicalImpact: first?.takeaway || 'Review the relevant law with your players and practise scenarios in training.',
    ageGradeConsiderations: {
      'U8-U10':    'Refer to your union\'s age-grade modifications — many senior laws do not apply to minis.',
      'U12-U14':   'Graduated contact laws apply. Check your union\'s current age-grade bylaws.',
      'U16-Senior':'Full law application as per World Rugby Laws of the Game.',
    },
    examples: [],
    commonMisunderstandings: [],
    refereeCues: [],
    coachAction: first?.takeaway || 'Educate your players on this law and practise relevant scenarios.',
  };
}

/**
 * Explain a law or regulation in plain coaching language.
 * @param {string} query — law topic e.g. 'tackle height', 'offside at ruck'
 * @returns {Promise<object>}
 */
export async function explainLaw(query) {
  const t0 = Date.now();
  // Search law items first, then widen if needed
  let { items, detectedAgeGroup, knowledgeBaseSize } =
    retrieveRelevant(query, { limit: 4, filterLaw: true });

  if (items.length === 0) {
    // Widen — not filtering for laws only
    ({ items, detectedAgeGroup, knowledgeBaseSize } = retrieveRelevant(query, { limit: 4 }));
  }

  let result;
  let mode = 'heuristic';

  if (API_KEY) {
    try {
      result = await callClaude(query, items);
      mode = 'claude';
    } catch (err) {
      process.stderr.write(`  ⚠  Claude failed (${err.message}) — showing knowledge base content\n`);
      result = heuristicExplanation(query, items);
    }
  } else {
    result = heuristicExplanation(query, items);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  logActivity({ type: 'law-query', query, resultCount: items.length, ageGroup: detectedAgeGroup, mode });

  return { ...result, sources: items, elapsed, mode, knowledgeBaseSize };
}
