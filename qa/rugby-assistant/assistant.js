/**
 * Rugby Coaching Assistant — AI Q&A layer on top of the knowledge base.
 *
 * Flow:
 *   1. retrieveRelevant() fetches top-N knowledge base items matching the query
 *   2. Those items become context for a Claude Haiku call
 *   3. Claude returns structured JSON coaching advice
 *   4. Heuristic fallback if Claude is unavailable or API key not set
 */

import { retrieveRelevant } from './query.js';
import { logActivity } from './activity-log.js';

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL   = process.env.RUGBY_ASSISTANT_MODEL || 'claude-haiku-4-5-20251001';

const SYSTEM = `You are an expert rugby coach and coaching educator with 20+ years experience across all age grades.
Answer coaching questions clearly, practically, and safely.

Reply ONLY with valid JSON (no markdown fences):
{
  "summary": "2-3 sentence overview of the topic",
  "keyCoachingPoints": ["point 1", "point 2", "point 3"],
  "recommendedDrills": [{"name": "drill name", "duration": "optional", "description": "brief description"}],
  "commonMistakes": ["mistake 1", "mistake 2"],
  "ageGradeAdaptations": {
    "U8-U10": "focus and approach",
    "U12-U14": "focus and approach",
    "U16-Senior": "focus and approach"
  },
  "lawConsiderations": "relevant law points, or null if none",
  "safetyNotes": "safety considerations, or null if none"
}

Use provided knowledge base context when relevant. If context is sparse, draw on best-practice coaching principles.`;

function buildContext(items) {
  if (!items.length) return 'No specific knowledge base items matched this query.';
  return items.map((item, i) =>
    `[KB${i + 1}] "${item.title}"
Summary: ${item.summary || 'N/A'}
Takeaway: ${item.takeaway || 'N/A'}
Categories: ${(item.categories || []).join(', ')}
Age groups: ${(item.ageGroup || []).join(', ')}`
  ).join('\n\n');
}

async function callClaude(query, items) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1400,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Knowledge base context:\n${buildContext(items)}\n\nCoaching question: ${query}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = (data.content?.[0]?.text ?? '').replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(raw);
}

function heuristicAnswer(query, items) {
  const summaries   = items.map(i => i.summary).filter(Boolean);
  const takeaways   = items.map(i => i.takeaway).filter(Boolean);
  const practicals  = items.filter(i => i.isPractical);

  return {
    summary: summaries.length
      ? summaries.slice(0, 2).join(' ')
      : `${query} is a fundamental rugby coaching area. Build technique progressively, always prioritising safety and correct body position before adding pace or complexity.`,
    keyCoachingPoints: takeaways.length
      ? takeaways.slice(0, 5)
      : [
          'Demonstrate correct technique before players attempt it',
          'Progress from static to dynamic to game-realistic pressure',
          'Correct errors early — bad habits are harder to unlearn',
          'Ensure all contact work starts from a safe body position',
        ],
    recommendedDrills: practicals.slice(0, 3).map(i => ({
      name: i.title, description: i.summary,
    })),
    commonMistakes: [
      'Progressing to full speed before technique is established',
      'Ignoring body position fundamentals under fatigue',
      'Forgetting the defensive implications of attacking decisions',
    ],
    ageGradeAdaptations: {
      'U8-U10':    'Prioritise fun and basic movement — no contact complexity',
      'U12-U14':   'Introduce technique with passive then active opposition',
      'U16-Senior':'Full game-realistic scenarios with appropriate intensity',
    },
    lawConsiderations: null,
    safetyNotes: items.some(i => i.isSafetyAlert)
      ? items.find(i => i.isSafetyAlert)?.takeaway || null
      : null,
  };
}

/**
 * Ask the coaching assistant a question.
 * @param {string} query — coaching question or topic
 * @returns {Promise<object>} structured coaching advice + metadata
 */
export async function askAssistant(query) {
  const t0 = Date.now();
  const { items, detectedCategories, detectedAgeGroup, totalMatches, knowledgeBaseSize } = retrieveRelevant(query, { limit: 5 });

  let answer;
  let mode = 'heuristic';

  if (API_KEY) {
    try {
      answer = await callClaude(query, items);
      mode = 'claude';
    } catch (err) {
      process.stderr.write(`  ⚠  Claude failed (${err.message}) — falling back to heuristics\n`);
      answer = heuristicAnswer(query, items);
    }
  } else {
    answer = heuristicAnswer(query, items);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  logActivity({ type: 'query', query, resultCount: items.length, ageGroup: detectedAgeGroup, mode });

  return {
    ...answer,
    sources: items,
    detectedCategories,
    detectedAgeGroup,
    totalMatches,
    knowledgeBaseSize,
    elapsed,
    mode,
  };
}
